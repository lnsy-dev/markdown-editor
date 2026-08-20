import { StateField, RangeSetBuilder } from "@codemirror/state";
import { EditorView, Decoration, WidgetType } from "@codemirror/view";

/**
 * Maps each todo marker character to a unicode symbol and a CSS class.
 * All characters are in the BMP (Basic Multilingual Plane) so there is no
 * risk of emoji substitution on any platform.
 *
 *  [ ] ○  U+25CB WHITE CIRCLE               — not started
 *  [/] ◑  U+25D1 CIRCLE WITH RIGHT HALF BLACK — in progress
 *  [!] ◆  U+25C6 BLACK DIAMOND              — important / urgent
 *  [x] ●  U+25CF BLACK CIRCLE               — done
 *  [-] ◌  U+25CC DOTTED CIRCLE              — cancelled
 *  [?] ◇  U+25C7 WHITE DIAMOND              — needs clarification
 *  [>] ▶  U+25B6 BLACK RIGHT-POINTING TRIANGLE — deferred
 *  [*] ★  U+2605 BLACK STAR                 — starred / pinned
 */
const TODO_MARKERS = {
  " ": { char: "○", cls: "cm-todo-open" },
  "/": { char: "◑", cls: "cm-todo-in-progress" },
  "!": { char: "◆", cls: "cm-todo-important" },
  "x": { char: "●", cls: "cm-todo-done" },
  "-": { char: "◌", cls: "cm-todo-cancelled" },
  "?": { char: "◇", cls: "cm-todo-question" },
  ">": { char: "▶", cls: "cm-todo-deferred" },
  "*": { char: "★", cls: "cm-todo-starred" },
};

// Matches a list-item todo marker: optional leading spaces, then `- [X]`
// where X is one of the known marker characters.
// Capture group 1: the leading `- [` (positions 0..2 relative to line start)
// Capture group 2: the marker character
// Capture group 3: the closing `]`
const TODO_RE = /^(\s*- \[)([/ !x\-?>\*])(\])/;

class TodoWidget extends WidgetType {
  constructor(char, cls) {
    super();
    this.char = char;
    this.cls = cls;
  }

  eq(other) {
    return other.char === this.char && other.cls === this.cls;
  }

  toDOM() {
    const span = document.createElement("span");
    span.className = `cm-todo-marker ${this.cls}`;
    span.textContent = this.char;
    span.setAttribute("aria-hidden", "true");
    return span;
  }

  // Let mouse events fall through so clicks position the cursor normally.
  ignoreEvent() {
    return false;
  }
}

/**
 * Returns true if the cursor (or selection) touches the given line number,
 * so that we can reveal the raw `- [x]` syntax for editing.
 */
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

function buildDecorations(state) {
  const builder = new RangeSetBuilder();
  const doc = state.doc;

  for (let n = 1; n <= doc.lines; n++) {
    const line = doc.line(n);
    const match = TODO_RE.exec(line.text);
    if (!match) continue;

    const markerChar = match[2];
    const info = TODO_MARKERS[markerChar];
    if (!info) continue;

    // Start of `- [` prefix (after leading whitespace) and end of `]`
    const leadLen   = match[1].length; // e.g. "- [" = 3 chars
    const fromPos   = line.from + leadLen;  // position of the marker char `x`
    const toPos     = line.from + leadLen + 1 + match[3].length; // through `]`

    // Full replacement range: the whole `- [x]` → widget + trailing ` `
    // We keep the leading whitespace (indentation) untouched.
    const replaceFrom = line.from + match[1].length - 3; // start of `- [`... actually start of `- ` after indent
    // Let's be precise: replace from the start of `- [` to the end of `]`
    const indentLen   = line.text.search(/\S/); // leading spaces
    const dashFrom    = line.from + (indentLen === -1 ? 0 : indentLen); // position of `-`
    const closeBracketTo = line.from + match[0].length; // position after `]`

    if (isLineActive(state, n)) {
      // Line is being edited — just add a styling mark so we can style the raw text
      builder.add(
        dashFrom,
        closeBracketTo,
        Decoration.mark({ class: `cm-todo-editing ${info.cls}` }),
      );
      continue;
    }

    // Replace `- [x]` with the unicode widget, preserving indentation
    builder.add(
      dashFrom,
      closeBracketTo,
      Decoration.replace({
        widget: new TodoWidget(info.char, info.cls),
      }),
    );
  }

  return builder.finish();
}

const todoDecorationField = StateField.define({
  create(state) {
    return buildDecorations(state);
  },
  update(deco, tr) {
    if (tr.docChanged || tr.selection) {
      return buildDecorations(tr.state);
    }
    return deco.map(tr.changes);
  },
  provide: (f) => EditorView.decorations.from(f),
});

export default todoDecorationField;
