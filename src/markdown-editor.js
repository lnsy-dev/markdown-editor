import { EditorView, basicSetup, minimalSetup } from "codemirror";
import { lineNumbers, highlightActiveLine, drawSelection, EditorView as EV, keymap, Decoration, ViewPlugin, ViewUpdate } from "@codemirror/view";
import { markdown } from "@codemirror/lang-markdown";
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
import imageEmbedHighlighter, { formatWikiImage } from "./image-embed-plugin.js";
import { wikiSyntaxExtensions } from "./wiki-syntax-extension.js";
import wikilinkPreview from "./wikilink-preview-plugin.js";
import todoDecorationField from "./todo-checkbox-plugin.js";
import bracketField from "./bracket-plugin.js";
import blockquoteField from "./blockquote-plugin.js";
import headingField from "./heading-plugin.js";

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
          extensions: wikiSyntaxExtensions,
          codeLanguages: [
            LanguageDescription.of({
              name: "javascript",
              alias: ["js", "node"],
              load: () => Promise.resolve(javascript()),
            }),
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
        // Embedded wiki images with inline preview
        imageEmbedHighlighter,
        // Wikilinks show label only until their line is active
        wikilinkPreview,
        // Todo markers: - [ ] / [x] / [/] etc. → unicode symbols
        todoDecorationField,
        // Bracket fields [key:: value] and citations [^id]
        bracketField,
        // Blockquotes: > text rendered as styled HTML when inactive
        blockquoteField,
        // Headings: # prefix hidden when inactive, revealed on active line
        headingField,
        
        // Use CSS classes for token highlighting
        syntaxHighlighting(classHighlighter),
        // Enable line wrapping
        EditorView.lineWrapping,
        // Constrain content width to ~80 characters (80ch at 1.25rem/20px ≈ 720px)
        EditorView.theme({
          "&": { maxWidth: "720px" },
        }),
       
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
        // Handle triple-click: select the entire line (without trailing newline)
        EditorView.mouseSelectionStyle.of((view, event) => {
          if (event.detail !== 3) return null;
          const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
          if (pos == null) return null;
          const line = view.state.doc.lineAt(pos);
          const selection = EditorSelection.range(line.from, line.to);
          return {
            get(curEvent, extend, multiple) {
              return multiple
                ? view.state.selection.addRange(selection)
                : EditorSelection.create([selection]);
            },
            update() { return false; },
          };
        }),
        // Handle image drag-and-drop
        EditorView.domEventHandlers({
          drop: (event, view) => {
            const files = Array.from(event.dataTransfer.files);
            const imageFiles = files.filter(file => file.type.startsWith('image/'));
            
            if (imageFiles.length > 0) {
              event.preventDefault();
              const dropPos = view.posAtCoords({ x: event.clientX, y: event.clientY });
              (async () => {
                let pos = dropPos ?? view.state.selection.main.head;
                for (const file of imageFiles) {
                  pos += await this.handleImageDrop(file, view, pos);
                }
              })();
              return true;
            }
            return false;
          },
          dragover: (event) => {
            // Check if dragged items include files
            if (event.dataTransfer.types.includes('Files')) {
              event.preventDefault();
              return true;
            }
            return false;
          }
        }),
      ],
    });
  }

  /**
   * Handles a dropped image file: converts to data URL, emits event, and inserts syntax
   * @param {File} file - The dropped image file
   * @param {EditorView} view - The CodeMirror editor view
   * @param {number|null} dropPos - Document position at drop point
   * @returns {Promise<number>} Number of characters inserted
   */
  async handleImageDrop(file, view, dropPos = null) {
    try {
      const dataURL = await this.readFileAsDataURL(file);

      const metadata = {
        fileName: file.name,
        fileSize: file.size,
        fileType: file.type,
        lastModified: file.lastModified,
        lastModifiedDate: new Date(file.lastModified).toISOString(),
        dataURL: dataURL
      };

      this.event('IMAGE-DROPPED', metadata);

      const insertPos = dropPos ?? view.state.selection.main.head;
      const wikiImage = formatWikiImage(file.name, dataURL);
      const prefix = insertPos > 0 && view.state.doc.sliceString(insertPos - 1, insertPos) !== "\n" ? "\n" : "";
      const insertText = `${prefix}${wikiImage}\n`;
      
      view.dispatch({
        changes: { from: insertPos, insert: insertText },
        selection: EditorSelection.cursor(insertPos + insertText.length)
      });

      return insertText.length;
    } catch (error) {
      console.error('Error handling image drop:', error);
      this.event('IMAGE-DROP-ERROR', { error: error.message, fileName: file.name });
      return 0;
    }
  }

  /**
   * Reads a file and returns its data URL representation
   * @param {File} file - The file to read
   * @returns {Promise<string>} The file as a data URL
   */
  readFileAsDataURL(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result);
      reader.onerror = (e) => reject(new Error('Failed to read file'));
      reader.readAsDataURL(file);
    });
  }

  /**
   * Inserts a string at a specific line and character position
   * @param {string} str - The string to insert
   * @param {number} line_number - The 1-indexed line number
   * @param {number} char_number - The 0-indexed character position within the line
   * @returns {boolean} True if successful, false otherwise
   */
  insertString(str, line_number, char_number) {
    if (!this.view) {
      console.error('Editor view not initialized');
      return false;
    }

    try {
      const doc = this.view.state.doc;
      
      // Validate line number (1-indexed)
      if (line_number < 1 || line_number > doc.lines) {
        console.error(`Invalid line number: ${line_number}. Document has ${doc.lines} lines.`);
        return false;
      }

      const line = doc.line(line_number);
      
      // Validate character position (0-indexed within the line)
      if (char_number < 0 || char_number > line.length) {
        console.error(`Invalid character position: ${char_number}. Line ${line_number} has ${line.length} characters.`);
        return false;
      }

      // Calculate absolute position in the document
      const pos = line.from + char_number;

      // Insert the string
      this.view.dispatch({
        changes: { from: pos, insert: str },
        selection: EditorSelection.cursor(pos + str.length)
      });

      return true;
    } catch (error) {
      console.error('Error inserting string:', error);
      return false;
    }
  }

  /**
   * Gets the current cursor position and context information
   * @returns {Object} Cursor info object with line, character, context array, and optionally selected text
   * @returns {number} return.line - The 1-indexed line number where cursor is located
   * @returns {number} return.character - The 0-indexed character position within the line
   * @returns {string[]} return.context - Array of context strings (e.g., ["js", "codeblock"], ["note", "aside"], ["heading", "h2"])
   * @returns {string} [return.selected] - The selected text content, if any selection exists
   */
  getCursor() {
    if (!this.view) {
      console.error('Editor view not initialized');
      return null;
    }

    try {
      const state = this.view.state;
      const doc = state.doc;
      const selection = state.selection.main;
      const cursorPos = selection.head;
      
      // Get line and character position
      const line = doc.lineAt(cursorPos);
      const lineNumber = line.number; // 1-indexed
      const charPosition = cursorPos - line.from; // 0-indexed within line
      
      // Detect context by scanning document up to cursor position
      const context = [];
      let inCode = false;
      let inAside = false;
      let codeLang = null;
      let asideType = null;
      
      // Helper functions (same as in the highlighter)
      const isCodeFenceLine = (t) => /^\s*```+.*$/.test(t);
      const isCodeFenceClose = (t) => /^\s*```+\s*$/.test(t);
      const extractCodeLang = (t) => {
        const m = t.match(/^\s*```+\s*([\w-]+)?/);
        return m && m[1] ? m[1].toLowerCase() : null;
      };
      const isAsideFenceLine = (t) => /^\s*:::+.*$/.test(t);
      const isAsideFenceClose = (t) => /^\s*:::+\s*$/.test(t);
      const extractAsideType = (t) => {
        const m = t.match(/^\s*:::+\s*([\w-]+)?/);
        return m && m[1] ? m[1].toLowerCase() : null;
      };
      const isAtxHeading = (t) => /^\s{0,3}#{1,6}\s+.+$/.test(t);
      const getAtxLevel = (t) => {
        const m = t.match(/^\s{0,3}(#{1,6})\s+/);
        return m ? m[1].length : null;
      };
      
      // Scan from line 1 up to current line to determine state
      for (let n = 1; n <= lineNumber; n++) {
        const lineText = doc.line(n).text;
        
        // Check for code fence toggles
        if (!inAside && isCodeFenceLine(lineText)) {
          if (!inCode) {
            inCode = true;
            codeLang = extractCodeLang(lineText);
          } else if (isCodeFenceClose(lineText)) {
            // If on the closing fence line itself, still consider inside code block
            if (n < lineNumber) {
              inCode = false;
              codeLang = null;
            }
          }
        }
        
        // Check for aside fence toggles
        if (!inCode && isAsideFenceLine(lineText)) {
          if (!inAside) {
            inAside = true;
            asideType = extractAsideType(lineText);
          } else if (isAsideFenceClose(lineText)) {
            // If on the closing fence line itself, still consider inside aside block
            if (n < lineNumber) {
              inAside = false;
              asideType = null;
            }
          }
        }
      }
      
      // Build context array
      if (inCode) {
        if (codeLang) {
          context.push(codeLang);
        }
        context.push('codeblock');
      }
      
      if (inAside) {
        if (asideType) {
          context.push(asideType);
        }
        context.push('aside');
      }
      
      // Check if current line is a heading
      const currentLineText = line.text;
      if (!inCode && isAtxHeading(currentLineText)) {
        const level = getAtxLevel(currentLineText);
        if (level) {
          context.push('heading');
          context.push(`h${level}`);
        }
      }
      
      // Build result object
      const result = {
        line: lineNumber,
        character: charPosition,
        context: context
      };
      
      // Add selected text if there's a selection
      if (!selection.empty) {
        const selectedText = doc.sliceString(selection.from, selection.to);
        result.selected = selectedText;
      }
      
      return result;
    } catch (error) {
      console.error('Error getting cursor info:', error);
      return null;
    }
  }

  /**
   * Replaces text within a specified range
   * @param {string} str - The replacement string
   * @param {number} start_line - The 1-indexed starting line number
   * @param {number} start_char - The 0-indexed starting character position
   * @param {number} end_line - The 1-indexed ending line number
   * @param {number} end_char - The 0-indexed ending character position
   * @returns {boolean} True if successful, false otherwise
   */
  replaceString(str, start_line, start_char, end_line, end_char) {
    if (!this.view) {
      console.error('Editor view not initialized');
      return false;
    }

    try {
      const doc = this.view.state.doc;
      
      // Validate start line
      if (start_line < 1 || start_line > doc.lines) {
        console.error(`Invalid start line: ${start_line}. Document has ${doc.lines} lines.`);
        return false;
      }
      
      // Validate end line
      if (end_line < 1 || end_line > doc.lines) {
        console.error(`Invalid end line: ${end_line}. Document has ${doc.lines} lines.`);
        return false;
      }
      
      // Validate line order
      if (end_line < start_line) {
        console.error(`End line (${end_line}) cannot be before start line (${start_line})`);
        return false;
      }

      const startLine = doc.line(start_line);
      const endLine = doc.line(end_line);
      
      // Validate start character position
      if (start_char < 0 || start_char > startLine.length) {
        console.error(`Invalid start character: ${start_char}. Line ${start_line} has ${startLine.length} characters.`);
        return false;
      }
      
      // Validate end character position
      if (end_char < 0 || end_char > endLine.length) {
        console.error(`Invalid end character: ${end_char}. Line ${end_line} has ${endLine.length} characters.`);
        return false;
      }

      // Calculate absolute positions in the document
      const fromPos = startLine.from + start_char;
      const toPos = endLine.from + end_char;
      
      
      // Validate position order
      if (toPos < fromPos) {
        console.error(`End position (line ${end_line}, char ${end_char}) cannot be before start position (line ${start_line}, char ${start_char})`);
        return false;
      }

      // Replace the text in the range
      this.view.dispatch({
        changes: { from: fromPos, to: toPos, insert: str },
        selection: EditorSelection.cursor(fromPos + str.length)
      });

      return true;
    } catch (error) {
      console.error('Error replacing string:', error);
      return false;
    }
  }
}

customElements.define('markdown-editor', MarkdownEditor)
