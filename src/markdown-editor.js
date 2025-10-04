import { EditorView, basicSetup, minimalSetup } from "codemirror";
import { lineNumbers, highlightActiveLine, EditorView as EV, keymap, Decoration, ViewPlugin, ViewUpdate } from "@codemirror/view";
import { markdown } from "@codemirror/lang-markdown";
import { languages as cmLanguages } from "@codemirror/language-data";
import { html } from "@codemirror/lang-html";
import { syntaxHighlighting } from "@codemirror/language";
import { classHighlighter } from "@lezer/highlight";
import { autocompletion, completionKeymap } from "@codemirror/autocomplete";
import { RangeSetBuilder } from "@codemirror/state";

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

class MarkdownEditor extends DataroomElement {
  async initialize(){
    const initialDoc = "";
    // Create a container inside the element to host the editor view

    this.view = new EditorView({
      parent: this,
      doc: initialDoc,
      extensions: [
        minimalSetup,
        // Initialize the Markdown language support with fenced code language highlighting
        markdown({ codeLanguages: cmLanguages }),
        // Enable HTML language support for embedded HTML
        html(),
        // Enable autocompletion with HTML completions
        autocompletion(),
        // Add completion keybindings (Ctrl-Space to trigger)
        keymap.of(completionKeymap),
        // Highlight the currently active line
        highlightActiveLine(),
        // Custom: highlight lines that are only '---'
        hrLineHighlighter,
        
        // Use CSS classes for token highlighting
        syntaxHighlighting(classHighlighter),
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
