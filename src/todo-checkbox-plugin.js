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
  " ": { char: "○", cls: "cm-todo-open",        label: "Open" },
  "/": { char: "◑", cls: "cm-todo-in-progress", label: "In Progress" },
  "!": { char: "◆", cls: "cm-todo-important",   label: "Important" },
  "x": { char: "●", cls: "cm-todo-done",        label: "Done" },
  "-": { char: "◌", cls: "cm-todo-cancelled",   label: "Cancelled" },
  "?": { char: "◇", cls: "cm-todo-question",    label: "Question" },
  ">": { char: "▶", cls: "cm-todo-deferred",    label: "Deferred" },
  "*": { char: "★", cls: "cm-todo-starred",     label: "Starred" },
};

// Ordered list of marker keys for display in the dropdown.
const MARKER_ORDER = [" ", "/", "!", "x", "-", "?", ">", "*"];

// Matches a list-item todo marker: optional leading spaces, then `- [X]`
// where X is one of the known marker characters.
// Capture group 1: the leading `- [` (positions 0..2 relative to line start)
// Capture group 2: the marker character
// Capture group 3: the closing `]`
const TODO_RE = /^(\s*- \[)([/ !x\-?>\*])(\])/;

// ── Dropdown ─────────────────────────────────────────────────────────────────

let activeDropdown = null;

function removeActiveDropdown() {
  if (activeDropdown) {
    activeDropdown.remove();
    activeDropdown = null;
  }
}

/**
 * Show a dropdown menu anchored below `anchorEl` that lets the user pick a
 * new todo state.  When an item is chosen the document is patched via `view`.
 *
 * @param {HTMLElement} anchorEl  - the .cm-todo-marker span that was clicked
 * @param {string}      currentKey - the current marker key (e.g. "x")
 * @param {EditorView}  view
 * @param {number}      markerFrom - document position of the marker char
 * @param {number}      markerTo   - document position after the marker char
 */
function showTodoDropdown(anchorEl, currentKey, view, markerFrom, markerTo) {
  removeActiveDropdown();

  const menu = document.createElement("div");
  menu.className = "cm-todo-dropdown";
  menu.setAttribute("role", "listbox");
  menu.setAttribute("aria-label", "Change todo state");

  for (const key of MARKER_ORDER) {
    const info = TODO_MARKERS[key];
    const item = document.createElement("div");
    item.className = `cm-todo-dropdown-item ${info.cls}`;
    if (key === currentKey) item.classList.add("cm-todo-dropdown-item--active");
    item.setAttribute("role", "option");
    item.setAttribute("aria-selected", key === currentKey ? "true" : "false");
    item.dataset.key = key;

    const symbol = document.createElement("span");
    symbol.className = "cm-todo-dropdown-symbol";
    symbol.textContent = info.char;

    const labelEl = document.createElement("span");
    labelEl.className = "cm-todo-dropdown-label";
    labelEl.textContent = info.label;

    item.appendChild(symbol);
    item.appendChild(labelEl);

    item.addEventListener("mousedown", (e) => {
      // Prevent the editor from receiving focus / cursor placement.
      e.preventDefault();
      e.stopPropagation();

      if (key !== currentKey) {
        view.dispatch({
          changes: { from: markerFrom, to: markerTo, insert: key },
        });
      }
      removeActiveDropdown();
    });

    menu.appendChild(item);
  }

  // Position below the anchor element.
  document.body.appendChild(menu);
  activeDropdown = menu;

  const rect = anchorEl.getBoundingClientRect();
  const menuRect = menu.getBoundingClientRect();

  let top  = rect.bottom + window.scrollY + 4;
  let left = rect.left   + window.scrollX;

  // Keep within viewport horizontally.
  const rightEdge = left + menuRect.width;
  if (rightEdge > window.innerWidth - 8) {
    left = window.innerWidth - menuRect.width - 8;
  }

  menu.style.top  = `${top}px`;
  menu.style.left = `${left}px`;

  // Close on any outside click or Escape.
  const onOutside = (e) => {
    if (!menu.contains(e.target) && e.target !== anchorEl) {
      removeActiveDropdown();
      document.removeEventListener("mousedown", onOutside, true);
      document.removeEventListener("keydown", onKey, true);
    }
  };
  const onKey = (e) => {
    if (e.key === "Escape") {
      removeActiveDropdown();
      document.removeEventListener("mousedown", onOutside, true);
      document.removeEventListener("keydown", onKey, true);
    }
  };

  // Use capture so we see the event before CodeMirror does.
  document.addEventListener("mousedown", onOutside, true);
  document.addEventListener("keydown", onKey, true);
}

// ── Widget ────────────────────────────────────────────────────────────────────

class TodoWidget extends WidgetType {
  constructor(char, cls, markerKey, markerFrom, markerTo) {
    super();
    this.char      = char;
    this.cls       = cls;
    this.markerKey = markerKey;
    this.markerFrom = markerFrom;
    this.markerTo   = markerTo;
  }

  eq(other) {
    return (
      other.char       === this.char &&
      other.cls        === this.cls &&
      other.markerKey  === this.markerKey &&
      other.markerFrom === this.markerFrom &&
      other.markerTo   === this.markerTo
    );
  }

  toDOM(view) {
    const span = document.createElement("span");
    span.className = `cm-todo-marker ${this.cls}`;
    span.textContent = this.char;
    span.setAttribute("aria-hidden", "true");
    span.setAttribute("title", `${TODO_MARKERS[this.markerKey].label} — click to change`);

    span.addEventListener("mousedown", (e) => {
      // Prevent the editor from processing the click so the line stays
      // inactive (no cursor placement).
      e.preventDefault();
      e.stopPropagation();
    });

    span.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      showTodoDropdown(span, this.markerKey, view, this.markerFrom, this.markerTo);
    });

    return span;
  }

  // Return true so CodeMirror ignores all events on the widget; we handle
  // them ourselves in toDOM().  This also prevents the line from becoming
  // "active" when the widget is clicked.
  ignoreEvent() {
    return true;
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

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

    // Leading whitespace before the `- [` token.
    const indentLen  = line.text.search(/\S/);
    const dashFrom   = line.from + (indentLen === -1 ? 0 : indentLen);

    // Full `- [x]` replacement range.
    const closeBracketTo = line.from + match[0].length;

    // Position of just the marker character inside `[x]`.
    const leadLen   = match[1].length;          // e.g. "- [" = 3
    const markerFrom = line.from + leadLen;      // position of "x"
    const markerTo   = markerFrom + 1;           // position after "x"

    if (isLineActive(state, n)) {
      // Line is being edited — show a mark over the raw `- [x]` text.
      builder.add(
        dashFrom,
        closeBracketTo,
        Decoration.mark({ class: `cm-todo-editing ${info.cls}` }),
      );
      continue;
    }

    // Replace `- [x]` with the unicode widget, preserving indentation.
    builder.add(
      dashFrom,
      closeBracketTo,
      Decoration.replace({
        widget: new TodoWidget(info.char, info.cls, markerChar, markerFrom, markerTo),
      }),
    );
  }

  return builder.finish();
}

// ── State field ───────────────────────────────────────────────────────────────

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
