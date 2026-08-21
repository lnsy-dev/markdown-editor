/**
 * heading-plugin.js
 *
 * Renders ATX Markdown headings (# through ######) with a "focus-reveal"
 * treatment: the `#` prefix characters are hidden on inactive lines so the
 * heading text sits flush left, matching the body text column. When the
 * cursor moves onto a heading line the prefix is revealed so the user can
 * edit it normally.
 *
 * Approach:
 *  Inactive line (cursor NOT on that line):
 *   • A Decoration.replace spanning the `# ` prefix (including the trailing
 *     space) replaces those characters with a zero-width hidden span, so the
 *     heading text starts at column 0.
 *   • A Decoration.line class (`cm-md-heading cm-md-h{1-6}`) is added for
 *     typographic sizing via CSS.
 *
 *  Active line (cursor IS on that line):
 *   • No replace decoration — the raw `# ` prefix is visible and editable.
 *   • The line class is still added so the heading font/size CSS applies.
 *
 * Lines inside fenced code blocks or aside blocks are skipped.
 */

import { StateField, RangeSetBuilder } from "@codemirror/state";
import { EditorView, Decoration, WidgetType } from "@codemirror/view";
import { readOnlyState, readOnlyChanged } from "./read-only-state.js";

// ---------------------------------------------------------------------------
// Regex helpers
// ---------------------------------------------------------------------------

/** Matches `# ` … `###### ` at the start of a heading line.
 *  Group 1 = the hashes + trailing space(s)
 *  Group 2 = the heading text
 */
const ATX_HEADING_RE = /^(\s{0,3}#{1,6}\s+)(.*)/;

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

/** Returns true if `lineNum` (1-indexed) intersects the current selection. */
function isLineActive(state, lineNum) {
  const sel = state.selection.main;
  const cursorLine = state.doc.lineAt(sel.head).number;
  if (lineNum === cursorLine) return true;
  if (!sel.empty) {
    const fromLine = state.doc.lineAt(sel.from).number;
    const toLine   = state.doc.lineAt(sel.to).number;
    return lineNum >= fromLine && lineNum <= toLine;
  }
  return false;
}

/** Returns a Set of line numbers that are inside fenced code blocks. */
function codeBlockLineNumbers(doc) {
  const lines = new Set();
  let inCode = false;
  for (let n = 1; n <= doc.lines; n++) {
    const text = doc.line(n).text;
    if (/^\s*```+/.test(text)) {
      if (!inCode) {
        inCode = true;
      } else if (/^\s*```+\s*$/.test(text)) {
        inCode = false;
      }
      // fence delimiter lines themselves are not "inside" a code block
      continue;
    }
    if (inCode) lines.add(n);
  }
  return lines;
}

// ---------------------------------------------------------------------------
// Widget — zero-width placeholder used when hiding the `# ` prefix
// ---------------------------------------------------------------------------

class HiddenPrefixWidget extends WidgetType {
  toDOM() {
    const span = document.createElement("span");
    span.className = "cm-heading-prefix-hidden";
    span.setAttribute("aria-hidden", "true");
    return span;
  }
  eq() { return true; }
  ignoreEvent() { return false; }
}

const HIDDEN_PREFIX = new HiddenPrefixWidget();

// ---------------------------------------------------------------------------
// Decoration builder
// ---------------------------------------------------------------------------

function buildDecorations(state) {
  const builder = new RangeSetBuilder();
  const doc     = state.doc;
  const skipLines = codeBlockLineNumbers(doc);
  const readOnly = state.field(readOnlyState);

  // Collect all entries and sort before feeding to RangeSetBuilder, which
  // requires strictly non-decreasing `from` order.
  const entries = [];

  for (let n = 1; n <= doc.lines; n++) {
    if (skipLines.has(n)) continue;

    const line  = doc.line(n);
    const match = ATX_HEADING_RE.exec(line.text);
    if (!match) continue;

    const prefixStr = match[1]; // e.g. "## "
    const level     = (prefixStr.match(/#/g) || []).length; // 1–6
    const active    = isLineActive(state, n);

    // Line-level decoration for font sizing (always applied)
    entries.push({
      from:  line.from,
      to:    line.from,
      deco:  Decoration.line({ class: `cm-md-heading cm-md-h${level}` }),
      order: 0,
    });

    if (!active || readOnly) {
      // Hide the `# ` prefix with a zero-width widget replacement
      const prefixFrom = line.from;
      const prefixTo   = line.from + prefixStr.length;

      entries.push({
        from:  prefixFrom,
        to:    prefixTo,
        deco:  Decoration.replace({ widget: HIDDEN_PREFIX }),
        order: 1,
      });
    }
  }

  // Sort ascending by `from`; for ties, line decos (order 0) before inline
  entries.sort((a, b) => a.from - b.from || a.order - b.order);

  for (const { from, to, deco } of entries) {
    builder.add(from, to, deco);
  }

  return builder.finish();
}

// ---------------------------------------------------------------------------
// StateField
// ---------------------------------------------------------------------------

const headingField = StateField.define({
  create(state)    { return buildDecorations(state); },
  update(deco, tr) {
    if (tr.docChanged || tr.selection || readOnlyChanged(tr)) return buildDecorations(tr.state);
    return deco.map(tr.changes);
  },
  provide: (f) => EditorView.decorations.from(f),
});

export default headingField;
