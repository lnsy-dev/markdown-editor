import { StateField, RangeSetBuilder } from "@codemirror/state";
import { EditorView, Decoration, WidgetType } from "@codemirror/view";
import { readOnlyState, readOnlyChanged } from "./read-only-state.js";

/** Matches ![[name|data:image/...;base64,...]] or ![[data:image/...;base64,...]] */
export const WIKI_IMAGE_RE =
  /!\[\[(?:([^|\]]+)\|)?(data:image\/[\w+.-]+;base64,[A-Za-z0-9+/=]+)\]\]/;

export function parseWikiImage(text) {
  const match = text.match(WIKI_IMAGE_RE);
  if (!match) return null;
  return {
    alt: match[1]?.trim() || "image",
    src: match[2],
  };
}

export function formatWikiImage(alt, dataUrl) {
  const safeAlt = alt.replace(/\|/g, "-").replace(/\]\]/g, "");
  return `![[${safeAlt}|${dataUrl}]]`;
}

class ImageEmbedWidget extends WidgetType {
  constructor(src, alt) {
    super();
    this.src = src;
    this.alt = alt;
  }

  eq(other) {
    return other.src === this.src && other.alt === this.alt;
  }

  toDOM() {
    const wrap = document.createElement("figure");
    wrap.className = "cm-embedded-image";
    const img = document.createElement("img");
    img.src = this.src;
    img.alt = this.alt;
    img.draggable = false;
    img.loading = "lazy";
    wrap.appendChild(img);
    if (this.alt && this.alt !== "image") {
      const cap = document.createElement("figcaption");
      cap.textContent = this.alt;
      wrap.appendChild(cap);
    }
    return wrap;
  }

  ignoreEvent() {
    return false;
  }
}

function buildImageDecorations(state) {
  const builder = new RangeSetBuilder();
  const doc = state.doc;
  const activeLineNum = doc.lineAt(state.selection.main.head).number;
  const readOnly = state.field(readOnlyState);

  for (let n = 1; n <= doc.lines; n++) {
    const line = doc.line(n);
    const parsed = parseWikiImage(line.text);
    if (!parsed) continue;

    if (!readOnly && line.number === activeLineNum) {
      // Show raw syntax only while the line is being edited
      builder.add(
        line.from,
        line.from,
        Decoration.line({ class: "cm-wiki-image-line cm-wiki-image-editing" }),
      );
    } else {
      // Replace the wikilink line entirely with the image preview.
      // In read-only mode the image stays rendered.
      builder.add(
        line.from,
        line.to,
        Decoration.replace({
          widget: new ImageEmbedWidget(parsed.src, parsed.alt),
          block: true,
        }),
      );
    }
  }

  return builder.finish();
}

const imageEmbedField = StateField.define({
  create(state) {
    return buildImageDecorations(state);
  },
  update(deco, tr) {
    if (tr.docChanged || tr.selection || readOnlyChanged(tr)) {
      return buildImageDecorations(tr.state);
    }
    return deco.map(tr.changes);
  },
  provide: (f) => EditorView.decorations.from(f),
});

export default imageEmbedField;
