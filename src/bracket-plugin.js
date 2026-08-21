/**
 * bracket-plugin.js
 *
 * Handles two square-bracket syntaxes:
 *
 *   [key:: value]   — metadata fields
 *     • Inactive line: entire bracket expression is hidden via Decoration.replace,
 *       replaced by an invisible zero-width widget (completely out of sight).
 *     • Active line: raw text shown with a .cm-field-editing mark so it can be
 *       styled distinctly.
 *
 *   [^id]            — citations / footnote references (id = digits or word chars)
 *     • Always rendered as a superscript <sup> link widget.
 *     • Active line: the widget is still shown but a .cm-citation-editing mark is
 *       applied to the raw text instead (so you can see + edit the id).
 *
 * Both decorators skip lines that are inside fenced code blocks.
 */

import { StateField, RangeSetBuilder } from "@codemirror/state";
import { EditorView, Decoration, WidgetType } from "@codemirror/view";
import { readOnlyState, readOnlyChanged } from "./read-only-state.js";

// ---------------------------------------------------------------------------
// Regex patterns
// ---------------------------------------------------------------------------

/**
 * Matches [key:: value] where:
 *   - key  = any non-]: chars before `::`
 *   - value = anything between `:: ` and the closing `]`
 * Non-greedy so multiple fields on one line each get their own match.
 */
const FIELD_RE = /\[([^\]]+?)::\s*([^\]]*?)\]/g;

/**
 * Matches [^id] where id is one or more word characters or hyphens.
 * Avoids matching inside code spans (best-effort; we skip code-fence lines).
 */
const CITATION_RE = /\[\^([\w-]+)\]/g;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** True when the cursor or selection touches a given 1-indexed line number. */
function isLineActive(state, lineNum) {
  const sel = state.selection.main;
  const cursorLine = state.doc.lineAt(sel.head).number;
  if (lineNum === cursorLine) return true;
  if (!sel.empty) {
    const fromLine = state.doc.lineAt(sel.from).number;
    const toLine = state.doc.lineAt(sel.to).number;
    return lineNum >= fromLine && lineNum <= toLine;
  }
  return false;
}

/**
 * Returns a Set of line numbers that are *inside* a fenced code block
 * (the fence lines themselves are NOT included so they stay decorated).
 */
function codeBlockLines(doc) {
  const lines = new Set();
  let inCode = false;
  for (let n = 1; n <= doc.lines; n++) {
    const text = doc.line(n).text;
    if (/^\s*```+.*$/.test(text)) {
      if (!inCode) {
        inCode = true;
      } else if (/^\s*```+\s*$/.test(text)) {
        inCode = false;
      }
      continue;
    }
    if (inCode) lines.add(n);
  }
  return lines;
}

// ---------------------------------------------------------------------------
// Widgets
// ---------------------------------------------------------------------------

/**
 * A zero-width invisible widget used to *hide* field expressions on inactive
 * lines.  Because it has no visual size the surrounding text reflows naturally.
 */
class FieldHiddenWidget extends WidgetType {
  toDOM() {
    const span = document.createElement("span");
    span.className = "cm-field-hidden";
    span.setAttribute("aria-hidden", "true");
    return span;
  }

  eq() {
    return true; // All hidden widgets are equivalent — no need to diff.
  }

  ignoreEvent() {
    return false;
  }
}

// Singleton — reused for every hidden field replacement.
const HIDDEN_WIDGET = new FieldHiddenWidget();

/**
 * Renders a citation [^id] as a superscript link: <sup class="cm-citation">id</sup>
 *
 * Clicking scrolls to the matching footnote definition ([^id]: …) in the
 * document without activating (moving the cursor to) the citation line —
 * mirroring the todo-marker and wikilink behaviour.
 */
class CitationWidget extends WidgetType {
  constructor(id) {
    super();
    this.id = id;
  }

  eq(other) {
    return other.id === this.id;
  }

  toDOM(view) {
    const sup = document.createElement("sup");
    sup.className = "cm-citation";

    const a = document.createElement("a");
    a.className = "cm-citation-link";
    // Keep href as a fallback for non-JS environments / right-click copy.
    a.href = `#fn-${this.id}`;
    a.textContent = this.id;
    a.setAttribute("aria-label", `footnote ${this.id}`);

    // Prevent cursor placement on mousedown (keeps the line inactive).
    a.addEventListener("mousedown", (e) => {
      e.preventDefault();
      e.stopPropagation();
    });

    a.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();

      // Find the footnote definition line: [^id]: …
      const doc = view.state.doc;
      const defRe = new RegExp(`^\\[\\^${this.id}\\]:`);
      for (let n = 1; n <= doc.lines; n++) {
        const line = doc.line(n);
        if (defRe.test(line.text)) {
          // Scroll to the definition without moving the cursor.
          view.dispatch({
            effects: EditorView.scrollIntoView(line.from, { y: "start", yMargin: 40 }),
          });
          return;
        }
      }
      // Definition not found — do nothing (href fallback already prevented).
    });

    sup.appendChild(a);
    return sup;
  }

  // Return true so CodeMirror ignores all events on the widget; we handle
  // them ourselves in toDOM().  This prevents the line from becoming
  // "active" when the citation is clicked.
  ignoreEvent() {
    return true;
  }
}

// ---------------------------------------------------------------------------
// Decoration builder
// ---------------------------------------------------------------------------

function buildDecorations(state) {
  const builder = new RangeSetBuilder();
  const doc = state.doc;
  const skipLines = codeBlockLines(doc);
  const readOnly = state.field(readOnlyState);

  // We need to add decorations in document order (ascending from position).
  // Collect all entries first, then sort, then add.
  const entries = [];

  for (let n = 1; n <= doc.lines; n++) {
    if (skipLines.has(n)) continue;

    const line = doc.line(n);
    const text = line.text;
    const active = isLineActive(state, n);

    // ── Fields [key:: value] ────────────────────────────────────────────────
    FIELD_RE.lastIndex = 0;
    let match;
    while ((match = FIELD_RE.exec(text)) !== null) {
      const from = line.from + match.index;
      const to = line.from + match.index + match[0].length;

      if (active && !readOnly) {
        // Show raw text with an editing style mark.
        entries.push({
          from,
          to,
          deco: Decoration.mark({ class: "cm-field-editing" }),
          isReplace: false,
        });
      } else {
        // Hide the entire bracket expression (read-only keeps it hidden).
        entries.push({
          from,
          to,
          deco: Decoration.replace({ widget: HIDDEN_WIDGET }),
          isReplace: true,
        });
      }
    }

    // ── Citations [^id] ─────────────────────────────────────────────────────
    CITATION_RE.lastIndex = 0;
    while ((match = CITATION_RE.exec(text)) !== null) {
      const from = line.from + match.index;
      const to = line.from + match.index + match[0].length;
      const id = match[1];

      if (active && !readOnly) {
        // Show raw [^id] text with an editing style mark.
        entries.push({
          from,
          to,
          deco: Decoration.mark({ class: "cm-citation-editing" }),
          isReplace: false,
        });
      } else {
        // Replace with the superscript widget (read-only keeps it interactive).
        entries.push({
          from,
          to,
          deco: Decoration.replace({ widget: new CitationWidget(id) }),
          isReplace: true,
        });
      }
    }
  }

  // Sort by `from` ascending; for same `from`, replace decorations go before marks
  // (CodeMirror requires sorted order).
  entries.sort((a, b) => a.from - b.from || (b.isReplace ? 1 : 0) - (a.isReplace ? 1 : 0));

  for (const { from, to, deco } of entries) {
    builder.add(from, to, deco);
  }

  return builder.finish();
}

// ---------------------------------------------------------------------------
// StateField
// ---------------------------------------------------------------------------

const bracketField = StateField.define({
  create(state) {
    return buildDecorations(state);
  },
  update(deco, tr) {
    if (tr.docChanged || tr.selection || readOnlyChanged(tr)) {
      return buildDecorations(tr.state);
    }
    return deco.map(tr.changes);
  },
  provide: (f) => EditorView.decorations.from(f),
});

export default bracketField;
