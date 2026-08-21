/**
 * blockquote-plugin.js
 *
 * Renders Markdown blockquote blocks (lines starting with `>`) as a styled
 * blockquote while keeping the underlying text fully navigable and editable.
 *
 * Approach — all decorations are inline or line-level, never block-replacing,
 * so the cursor can always arrow into the block naturally:
 *
 *  Inactive block (cursor is NOT on any line in the block):
 *   • The `> ` prefix characters on every line are hidden via inline
 *     Decoration.replace (zero-width replacement).
 *   • Every line receives a Decoration.line class:
 *       - `cm-blockquote-line`          — all lines in the block
 *       - `cm-blockquote-first`         — first line only (top border-radius etc.)
 *       - `cm-blockquote-last`          — last line only
 *       - `cm-blockquote-cite-line`     — last line when it contains `-- citation`
 *   • On a citation line the `-- ` prefix is hidden and the text is wrapped in
 *     a <cite> inline widget so it renders styled without breaking editability.
 *
 *  Active block (cursor or selection touches ANY line in the block):
 *   • No prefix-hiding replacements are applied.
 *   • Every line gets `cm-blockquote-editing` so CSS can show the faint
 *     left-border accent while the raw `> …` syntax is visible.
 *
 * Lines inside fenced code blocks are skipped entirely.
 */

import { StateField, RangeSetBuilder } from "@codemirror/state";
import { EditorView, Decoration, WidgetType } from "@codemirror/view";
import { readOnlyState, readOnlyChanged } from "./read-only-state.js";

// ---------------------------------------------------------------------------
// Regex
// ---------------------------------------------------------------------------

/** Matches a blockquote line; group 1 = the `> ` prefix(es), group 2 = body. */
const BLOCKQUOTE_LINE_RE = /^((?:>\s?)+)(.*)/;

/** Matches a citation body: `-- Author text` or `— Author text` (em-dash) */
const CITATION_BODY_RE = /^(--\s*|—\s*)(.*)/;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

/** Collect contiguous blockquote lines into blocks. */
function collectBlocks(doc, skipLines) {
  const blocks = [];
  let current = null;

  for (let n = 1; n <= doc.lines; n++) {
    if (skipLines.has(n)) {
      if (current) { blocks.push(current); current = null; }
      continue;
    }
    const lineObj = doc.line(n);
    const match = BLOCKQUOTE_LINE_RE.exec(lineObj.text);
    if (match) {
      if (!current) current = { startLine: n, endLine: n, lines: [] };
      current.endLine = n;
      current.lines.push({
        lineNum: n,
        prefixLen: match[1].length,
        body: match[2],
      });
    } else {
      if (current) { blocks.push(current); current = null; }
    }
  }
  if (current) blocks.push(current);
  return blocks;
}

// ---------------------------------------------------------------------------
// Widgets
// ---------------------------------------------------------------------------

/** Zero-width span used to hide the `> ` prefix characters. */
class HiddenWidget extends WidgetType {
  toDOM() {
    const s = document.createElement("span");
    s.className = "cm-bq-hidden";
    s.setAttribute("aria-hidden", "true");
    return s;
  }
  eq() { return true; }
  ignoreEvent() { return false; }
}
const HIDDEN = new HiddenWidget();

/** Inline widget that renders `-- Author` as a styled <cite>. */
class CiteWidget extends WidgetType {
  constructor(text) { super(); this.text = text; }
  eq(other) { return other.text === this.text; }
  toDOM() {
    const cite = document.createElement("cite");
    cite.className = "cm-blockquote-cite";
    cite.textContent = this.text;
    return cite;
  }
  ignoreEvent() { return false; }
}

// ---------------------------------------------------------------------------
// Decoration builder
// ---------------------------------------------------------------------------

function buildDecorations(state) {
  const builder = new RangeSetBuilder();
  const doc = state.doc;
  const skipLines = codeBlockLines(doc);
  const blocks = collectBlocks(doc, skipLines);
  const readOnly = state.field(readOnlyState);

  // Collect all entries so we can sort before adding (RangeSetBuilder requires
  // strictly ascending order).
  const entries = [];

  for (const block of blocks) {
    // Determine if any line in this block is active.
    let active = false;
    for (let n = block.startLine; n <= block.endLine; n++) {
      if (isLineActive(state, n)) { active = true; break; }
    }

    const isFirst = (n) => n === block.startLine;
    const isLast  = (n) => n === block.endLine;

    for (const { lineNum, prefixLen, body } of block.lines) {
      const line = doc.line(lineNum);

      if (active && !readOnly) {
        // ── Active: show raw text, add editing class ─────────────────────
        entries.push({
          from: line.from,
          to: line.from,
          deco: Decoration.line({ class: "cm-blockquote-editing" }),
          order: 0,
        });
        continue;
      }

      // ── Inactive: build rendered view ───────────────────────────────────

      // Line-level classes
      let lineCls = "cm-blockquote-line";
      if (isFirst(lineNum)) lineCls += " cm-blockquote-first";
      if (isLast(lineNum))  lineCls += " cm-blockquote-last";

      // Check if this is a citation line
      const citeMatch = CITATION_BODY_RE.exec(body.trim());
      const isCite = isLast(lineNum) && !!citeMatch;

      if (isCite) lineCls += " cm-blockquote-cite-line";

      entries.push({
        from: line.from,
        to: line.from,
        deco: Decoration.line({ class: lineCls }),
        order: 0,
      });

      // Hide the `> ` prefix (inline replace, zero-width widget)
      entries.push({
        from: line.from,
        to: line.from + prefixLen,
        deco: Decoration.replace({ widget: HIDDEN }),
        order: 1,
      });

      // Citation line: also hide the `-- ` / `— ` and replace with <cite> widget
      if (isCite) {
        // Find the `--` or `—` within the raw line text after the `> ` prefix
        const rawBody = line.text.slice(prefixLen);
        const dashIdx = rawBody.search(/--|—/);
        if (dashIdx !== -1) {
          const citeFrom = line.from + prefixLen + dashIdx;
          const citeTo   = line.to;
          entries.push({
            from: citeFrom,
            to: citeTo,
            deco: Decoration.replace({ widget: new CiteWidget(citeMatch[2]) }),
            order: 1,
          });
        }
      }
    }
  }

  // Sort: ascending `from`; for equal `from`, line decos (order 0) before
  // replace decos (order 1) so CodeMirror sees them in the right sequence.
  entries.sort((a, b) => a.from - b.from || a.order - b.order);

  for (const { from, to, deco } of entries) {
    builder.add(from, to, deco);
  }

  return builder.finish();
}

// ---------------------------------------------------------------------------
// StateField
// ---------------------------------------------------------------------------

const blockquoteField = StateField.define({
  create(state) { return buildDecorations(state); },
  update(deco, tr) {
    if (tr.docChanged || tr.selection || readOnlyChanged(tr)) return buildDecorations(tr.state);
    return deco.map(tr.changes);
  },
  provide: (f) => EditorView.decorations.from(f),
});

export default blockquoteField;
