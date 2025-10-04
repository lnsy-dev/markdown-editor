import { EditorView, basicSetup, minimalSetup } from "codemirror";
import { lineNumbers, highlightActiveLine, EditorView as EV, keymap } from "@codemirror/view";
import { markdown } from "@codemirror/lang-markdown";
import { html } from "@codemirror/lang-html";
import { syntaxHighlighting } from "@codemirror/language";
import { classHighlighter } from "@lezer/highlight";
import { autocompletion, completionKeymap } from "@codemirror/autocomplete";

// Load CSS variables and theme styles
import "../styles/variables.css";
import "../styles/theme.css";

import DataroomElement from 'dataroom-js'

class MarkdownEditor extends DataroomElement {
  async initialize(){
    const initialDoc = "";
    // Create a container inside the element to host the editor view

    this.view = new EditorView({
      parent: this,
      doc: initialDoc,
      extensions: [
        minimalSetup,
        // Initialize the Markdown language support
        markdown(),
        // Enable HTML language support for embedded HTML
        html(),
        // Enable autocompletion with HTML completions
        autocompletion(),
        // Add completion keybindings (Ctrl-Space to trigger)
        keymap.of(completionKeymap),
        // Highlight the currently active line
        highlightActiveLine(),
        
        // Use CSS classes for token highlighting instead of JS HighlightStyle
        // syntaxHighlighting(classHighlighter), // Temporarily disabled to test ligatures
        // Theme extension to support ligatures
        EditorView.theme({
          '&': {
            fontVariantLigatures: 'common-ligatures',
            fontFeatureSettings: '"liga" 1, "calt" 1',
            textRendering: 'optimizeLegibility'
          },
          '.cm-content': {
            fontVariantLigatures: 'common-ligatures',
            fontFeatureSettings: '"liga" 1, "calt" 1',
            textRendering: 'optimizeLegibility'
          },
          '.cm-line': {
            fontVariantLigatures: 'common-ligatures',
            fontFeatureSettings: '"liga" 1, "calt" 1',
            textRendering: 'optimizeLegibility'
          }
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
      ],
    });
  }
}

customElements.define('markdown-editor', MarkdownEditor)
