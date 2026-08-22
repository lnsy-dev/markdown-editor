import { StateField, RangeSetBuilder } from "@codemirror/state";
import { EditorView, Decoration, WidgetType } from "@codemirror/view";
import {
  findWikilinks,
  findHashtags,
  findReferences,
} from "./wiki-syntax-extension.js";
import { readOnlyState, readOnlyChanged } from "./read-only-state.js";

/**
 * clickable-preview-plugin.js
 *
 * Renders inactive inline references as clickable widgets and emits custom
 * events when they are clicked. Currently handles:
 *
 *   - Wikilinks      [[target]] / [[target|label]]  → WIKILINK-CLICKED
 *   - Hashtags       #tag                          → HASHTAG-CLICKED
 *   - @-mentions     @reference                    → REFERENCE-CLICKED
 *
 * When the cursor is on the reference's line, the widget is replaced by raw
 * text so the user can edit it.
 */

// ---------------------------------------------------------------------------
// Widgets
// ---------------------------------------------------------------------------

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

    el.addEventListener("mousedown", (e) => {
      e.preventDefault();
      e.stopPropagation();
    });

    el.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();

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

  ignoreEvent() {
    return true;
  }
}

class HashtagPreviewWidget extends WidgetType {
  constructor(tag) {
    super();
    this.tag = tag;
  }

  eq(other) {
    return other.tag === this.tag;
  }

  toDOM(view) {
    const el = document.createElement("span");
    el.className = "cm-hashtag-preview";
    el.textContent = `#${this.tag}`;
    el.title = `#${this.tag}`;

    el.addEventListener("mousedown", (e) => {
      e.preventDefault();
      e.stopPropagation();
    });

    el.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();

      const host = view.dom.closest("markdown-editor");
      const target = host ?? view.dom;
      target.dispatchEvent(
        new CustomEvent("HASHTAG-CLICKED", {
          bubbles: true,
          composed: true,
          detail: {
            tag: this.tag,
          },
        }),
      );
    });

    return el;
  }

  ignoreEvent() {
    return true;
  }
}

class ReferencePreviewWidget extends WidgetType {
  constructor(reference) {
    super();
    this.reference = reference;
  }

  eq(other) {
    return other.reference === this.reference;
  }

  toDOM(view) {
    const el = document.createElement("span");
    el.className = "cm-reference-preview";
    el.textContent = `@${this.reference}`;
    el.title = `@${this.reference}`;

    el.addEventListener("mousedown", (e) => {
      e.preventDefault();
      e.stopPropagation();
    });

    el.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();

      const host = view.dom.closest("markdown-editor");
      const target = host ?? view.dom;
      target.dispatchEvent(
        new CustomEvent("REFERENCE-CLICKED", {
          bubbles: true,
          composed: true,
          detail: {
            reference: this.reference,
          },
        }),
      );
    });

    return el;
  }

  ignoreEvent() {
    return true;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

function overlaps(range, ranges) {
  return ranges.some(
    (r) => range.from < r.to && range.to > r.from,
  );
}

// ---------------------------------------------------------------------------
// Decoration builder
// ---------------------------------------------------------------------------

function buildClickableDecorations(state) {
  const builder = new RangeSetBuilder();
  const doc = state.doc;
  const skipLines = codeBlockLines(doc);
  const readOnly = state.field(readOnlyState);

  for (let n = 1; n <= doc.lines; n++) {
    if (skipLines.has(n)) continue;

    const line = doc.line(n);
    const active = !readOnly && isLineActive(state, n);
    const base = line.from;

    // Collect wikilink ranges first so hashtags/@-mentions inside them are skipped.
    const wikilinks = findWikilinks(line.text);
    const claimedRanges = wikilinks.map((l) => ({
      from: base + l.from,
      to: base + l.to,
    }));

    // ── Wikilinks ───────────────────────────────────────────────────────────
    for (const link of wikilinks) {
      const from = base + link.from;
      const to = base + link.to;
      if (active) {
        builder.add(from, to, Decoration.mark({ class: "cm-wikilink-editing" }));
      } else {
        builder.add(
          from,
          to,
          Decoration.replace({
            widget: new WikilinkPreviewWidget(link.label, link.target),
          }),
        );
      }
    }

    // ── Hashtags ────────────────────────────────────────────────────────────
    for (const tag of findHashtags(line.text)) {
      const from = base + tag.from;
      const to = base + tag.to;
      if (overlaps({ from, to }, claimedRanges)) continue;

      if (active) {
        builder.add(from, to, Decoration.mark({ class: "cm-hashtag-editing" }));
      } else {
        builder.add(
          from,
          to,
          Decoration.replace({
            widget: new HashtagPreviewWidget(tag.tag),
          }),
        );
      }
    }

    // ── @-mentions ──────────────────────────────────────────────────────────
    for (const ref of findReferences(line.text)) {
      const from = base + ref.from;
      const to = base + ref.to;
      if (overlaps({ from, to }, claimedRanges)) continue;

      if (active) {
        builder.add(from, to, Decoration.mark({ class: "cm-reference-editing" }));
      } else {
        builder.add(
          from,
          to,
          Decoration.replace({
            widget: new ReferencePreviewWidget(ref.reference),
          }),
        );
      }
    }
  }

  return builder.finish();
}

// ---------------------------------------------------------------------------
// StateField
// ---------------------------------------------------------------------------

const clickablePreviewField = StateField.define({
  create(state) {
    return buildClickableDecorations(state);
  },
  update(deco, tr) {
    if (tr.docChanged || tr.selection || readOnlyChanged(tr)) {
      return buildClickableDecorations(tr.state);
    }
    return deco.map(tr.changes);
  },
  provide: (f) => EditorView.decorations.from(f),
});

export default clickablePreviewField;
