import { StateField, RangeSetBuilder } from "@codemirror/state";
import { EditorView, Decoration, WidgetType } from "@codemirror/view";
import { findWikilinks } from "./wiki-syntax-extension.js";
import { readOnlyState, readOnlyChanged } from "./read-only-state.js";

class WikilinkPreviewWidget extends WidgetType {
  constructor(label, target) {
    super();
    this.label = label;
    this.target = target;
  }

  eq(other) {
    return other.label === this.label && other.target === this.target;
  }

  toDOM(view) {
    const el = document.createElement("span");
    el.className = "cm-wikilink-preview";
    el.textContent = this.label;
    if (this.label !== this.target) {
      el.title = this.target;
    }

    // Prevent the editor from processing the mousedown so the line stays
    // inactive (no cursor placement) — mirrors the todo-checkbox pattern.
    el.addEventListener("mousedown", (e) => {
      e.preventDefault();
      e.stopPropagation();
    });

    el.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();

      // Emit WIKILINK-CLICKED on the host <markdown-editor> element so
      // consumers can navigate without activating the editor line.
      const host = view.dom.closest("markdown-editor");
      const target = host ?? view.dom;
      target.dispatchEvent(
        new CustomEvent("WIKILINK-CLICKED", {
          bubbles: true,
          composed: true,
          detail: {
            target: this.target,
            label: this.label,
          },
        }),
      );
    });

    return el;
  }

  // Return true so CodeMirror ignores all events on the widget; we handle
  // them ourselves in toDOM().  This prevents the line from becoming
  // "active" when the widget is clicked.
  ignoreEvent() {
    return true;
  }
}

function isLineActive(state, lineNum) {
  const sel = state.selection.main;
  const cursorLine = state.doc.lineAt(sel.head).number;
  if (lineNum === cursorLine) return true;
  const fromLine = state.doc.lineAt(sel.from).number;
  const toLine = state.doc.lineAt(sel.to).number;
  return lineNum >= fromLine && lineNum <= toLine;
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

function buildWikilinkDecorations(state) {
  const builder = new RangeSetBuilder();
  const doc = state.doc;
  const skipLines = codeBlockLines(doc);
  const readOnly = state.field(readOnlyState);

  for (let n = 1; n <= doc.lines; n++) {
    if (skipLines.has(n)) continue;

    const line = doc.line(n);
    const wikilinks = findWikilinks(line.text);
    if (!wikilinks.length) continue;

    if (!readOnly && isLineActive(state, n)) {
      for (const link of wikilinks) {
        builder.add(
          line.from + link.from,
          line.from + link.to,
          Decoration.mark({ class: "cm-wikilink-editing" }),
        );
      }
      continue;
    }

    for (const link of wikilinks) {
      builder.add(
        line.from + link.from,
        line.from + link.to,
        Decoration.replace({
          widget: new WikilinkPreviewWidget(link.label, link.target),
        }),
      );
    }
  }

  return builder.finish();
}

const wikilinkPreviewField = StateField.define({
  create(state) {
    return buildWikilinkDecorations(state);
  },
  update(deco, tr) {
    if (tr.docChanged || tr.selection || readOnlyChanged(tr)) {
      return buildWikilinkDecorations(tr.state);
    }
    return deco.map(tr.changes);
  },
  provide: (f) => EditorView.decorations.from(f),
});

export default wikilinkPreviewField;
