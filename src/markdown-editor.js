import { EditorView, basicSetup, minimalSetup } from "codemirror";
import { lineNumbers, highlightActiveLine, drawSelection, EditorView as EV, keymap, Decoration, ViewPlugin, ViewUpdate } from "@codemirror/view";
import { markdown } from "@codemirror/lang-markdown";
import { languages as cmLanguages } from "@codemirror/language-data";
import { html } from "@codemirror/lang-html";
import { syntaxHighlighting, LanguageDescription } from "@codemirror/language";
import { classHighlighter } from "@lezer/highlight";
import { autocompletion, completionKeymap } from "@codemirror/autocomplete";
import { RangeSetBuilder, EditorSelection } from "@codemirror/state";
import { javascript } from "@codemirror/lang-javascript";

// Load CSS variables and theme styles
import "../styles/variables.css";
import "../styles/theme.css";

import DataroomElement from 'dataroom-js'

// Highlight entire lines that contain only '---', fenced code blocks (```), and asides (:::) across full lines
const lineDeco = (cls) => Decoration.line({ class: cls });

const hrLineHighlighter = ViewPlugin.fromClass(class {
  constructor(view){
    this.decorations = this.buildDecos(view);
  }
  update(update){
    if (update.docChanged || update.viewportChanged) {
      this.decorations = this.buildDecos(update.view);
    }
  }
  buildDecos(view){
    const builder = new RangeSetBuilder();
    const doc = view.state.doc;

    // Helpers
    const isHr = (t) => /^\s*---\s*$/.test(t);
    const isCodeFenceLine = (t) => /^\s*```+.*$/.test(t);
    const isCodeFenceClose = (t) => /^\s*```+\s*$/.test(t);
    const codeLang = (t) => {
      const m = t.match(/^\s*```+\s*([\w-]+)?/);
      return m && m[1] ? m[1].toLowerCase() : null;
    };
    const isAsideFenceLine = (t) => /^\s*:::+.*$/.test(t);
    const isAsideFenceClose = (t) => /^\s*:::+\s*$/.test(t);
    const asideType = (t) => {
      const m = t.match(/^\s*:::+\s*([\w-]+)?/);
      return m && m[1] ? m[1].toLowerCase() : null;
    };

    // ATX heading detection (#, ##, ... ######)
    const isAtxHeading = (t) => /^\s{0,3}#{1,6}\s+.+$/.test(t);
    const atxLevel = (t) => {
      const m = t.match(/^\s{0,3}(#{1,6})\s+/);
      return m ? m[1].length : null;
    };

    // Compute state up to the start of each visible range so we know if we're inside a block
    const computeStateUpTo = (pos) => {
      let inCode = false;
      let inAside = false;
      let curAsideType = null;
      const endLine = Math.max(1, doc.lineAt(Math.max(1, pos)).number - 1);
      for (let n = 1; n <= endLine; n++) {
        const t = doc.line(n).text;
        if (!inAside && isCodeFenceLine(t)) {
          if (!inCode) {
            inCode = true;
          } else if (isCodeFenceClose(t)) {
            inCode = false;
          }
          continue;
        }
        if (!inCode && isAsideFenceLine(t)) {
          if (!inAside) {
            inAside = true;
            curAsideType = asideType(t);
          } else if (isAsideFenceClose(t)) {
            inAside = false;
            curAsideType = null;
          }
        }
      }
      return { inCode, inAside, curAsideType };
    };

    for (const { from, to } of view.visibleRanges) {
      let line = doc.lineAt(from);
      let { inCode, inAside, curAsideType } = computeStateUpTo(from);

      while (true) {
        const text = line.text;

        // Horizontal rule line '---'
        if (isHr(text)) {
          builder.add(line.from, line.from, lineDeco("cm-hr-line"));
        }

        // If currently in code block, highlight interior lines first
        if (inCode && !isCodeFenceLine(text)) {
          builder.add(line.from, line.from, lineDeco("cm-code-block-line"));
        }
        // If currently in aside, highlight interior lines
        if (inAside && !isAsideFenceLine(text)) {
          const asideCls = curAsideType ? ` cm-aside-type-${curAsideType}` : "";
          builder.add(line.from, line.from, lineDeco(`cm-aside-block-line${asideCls}`));
        }

        // Fences toggle state and get their own decoration
        if (!inAside && isCodeFenceLine(text)) {
          const lang = codeLang(text);
          const langCls = lang ? ` cm-code-lang-${lang}` : "";
          builder.add(line.from, line.from, lineDeco(`cm-code-fence-line${langCls}`));
          if (!inCode) {
            inCode = true;
          } else if (isCodeFenceClose(text)) {
            inCode = false;
          }
        } else if (!inCode && isAsideFenceLine(text)) {
          const aType = asideType(text);
          const typeCls = aType ? ` cm-aside-type-${aType}` : "";
          builder.add(line.from, line.from, lineDeco(`cm-aside-fence-line${typeCls}`));
          if (!inAside) {
            inAside = true;
            curAsideType = aType || null;
          } else if (isAsideFenceClose(text)) {
            inAside = false;
            curAsideType = null;
          }
        }

        // Headings (# .. ######) — decorate whole line per level
        if (!inCode && isAtxHeading(text)) {
          const lvl = atxLevel(text);
          if (lvl) {
            builder.add(line.from, line.from, lineDeco(`cm-md-heading cm-md-h${lvl}`));
          }
        }

        if (line.to >= to) break;
        line = doc.line(line.number + 1);
      }
    }
    return builder.finish();
  }
}, {
  decorations: v => v.decorations
});

// Insert two spaces when Tab is pressed
const insertTwoSpaces = (view) => {
  const tr = view.state.changeByRange(range => {
    return {
      changes: { from: range.from, to: range.to, insert: "  " },
      range: EditorSelection.cursor(range.from + 2)
    };
  });
  view.dispatch(tr, { scrollIntoView: true });
  return true;
};

class MarkdownEditor extends DataroomElement {
  async initialize(){
    // Determine initial document from any light DOM content provided to the element
    let initialDoc = "";
    try {
      // Pull text content (not HTML) so users can place raw Markdown between tags
      const raw = this.textContent ?? "";
      // Normalize line endings
      const normalized = raw.replace(/\r\n?/g, "\n");
      // Remove a single leading newline commonly introduced by HTML formatting
      const withoutLeading = normalized.startsWith("\n") ? normalized.slice(1) : normalized;
      // Dedent common indentation across non-empty lines (so pretty-printed HTML doesn't affect content)
      const lines = withoutLeading.split("\n");
      const nonEmpty = lines.filter(l => l.trim().length > 0);
      const indent = nonEmpty.length ? Math.min(...nonEmpty.map(l => (l.match(/^\s*/)?.[0].length ?? 0))) : 0;
      const dedented = indent > 0 ? lines.map(l => l.slice(Math.min(indent, l.length))).join("\n") : withoutLeading;
      const cleaned = dedented.replace(/\s+$/, ""); // Trim only trailing whitespace at end of content block
      if (cleaned.trim().length > 0) {
        initialDoc = cleaned;
      }
    } catch (_) {
      // Swallow and fall back to empty document
      initialDoc = "";
    }

    // Clear any existing child nodes (light DOM content) before mounting the editor view
    // so that the initial text doesn't render alongside the editor widget.
    this.innerHTML = "";

    // Create the editor view
    this.view = new EditorView({
      parent: this,
      doc: initialDoc,
      extensions: [
        minimalSetup,
        // Initialize the Markdown language support with fenced code language highlighting
        // Include explicit JavaScript support so fenced ```js/```javascript blocks get completions
        markdown({
          codeLanguages: [
            LanguageDescription.of({
              name: "javascript",
              alias: ["js", "node"],
              load: () => Promise.resolve(javascript()),
            }),
            ...cmLanguages,
          ],
        }),
        // Enable HTML language support for embedded HTML
        html(),
        // Enable autocompletion with HTML completions
        autocompletion(),
        // Add completion keybindings (Ctrl-Space to trigger)
        keymap.of(completionKeymap),
        // Bind Tab to insert two spaces instead of a tab character
        keymap.of([{ key: "Tab", run: insertTwoSpaces }]),
        // Highlight the currently active line
        highlightActiveLine(),
        // Style active line and selection using CSS variables from styles/variables.css
        // Draw the selection layer so our theme colors apply consistently
        drawSelection(),
        // Custom: highlight lines that are only '---'
        hrLineHighlighter,
        
        // Use CSS classes for token highlighting
        syntaxHighlighting(classHighlighter),
        // Enable line wrapping at 80 characters
        EditorView.lineWrapping,
       
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            this.dirty = true;
            this.dispatchEvent(
              new CustomEvent("EDITOR-UPDATED", {
                bubbles: true,
                composed: true,
              }),
            );
          }
        }),
      ],
    });
  }
}

customElements.define('markdown-editor', MarkdownEditor)
