# Markdown Editor Web Component (@lnsy/markdown-editor)

A lightweight Markdown editor custom element built on CodeMirror 6. It registers the <markdown-editor> tag when imported and is themeable via CSS variables.

Highlights:
- Web Component: <markdown-editor> with zero framework dependencies
- CodeMirror 6 under the hood (minimalSetup, Markdown, HTML, autocompletion)
- Smart light-DOM bootstrapping: initial content can be authored between the tags and is normalized/dedented
- Convenience keybinding: Tab inserts two spaces
- Extra line decorations: horizontal rules (---), fenced code blocks (```), and asides (:::) with full-line styling
- Emits EDITOR-UPDATED when content changes
- Fully themeable using CSS custom properties (variables)


## Quick start (rspack)

Install the package:

```bash
npm install @lnsy/markdown-editor
```

For local development in this repo, install dependencies and run the dev server:

```bash
npm install
npm run start
```

By default this serves index.html and emits dist/markdown-editor.min.js. Open http://localhost:3000.

Build for production:

```bash
npm run build
```

This writes optimized assets to dist/ (e.g., dist/markdown-editor.min.js).

Optional .env customization:

```ini
# Output file name (defaults to markdown-editor.min.js)
OUTPUT_FILE_NAME=my-app.js
# Dev server port (defaults to 3000)
PORT=5173
```


## Using the <markdown-editor> element

The component is automatically registered when you import the bundle. You can either use the built bundle (no-bundler) or import the source into your own bundler (rspack, webpack, Vite, etc.).

- Using the built bundle (no bundler):

```html
<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Markdown Editor</title>
    <script type="module" src="./dist/markdown-editor.min.js"></script>
  </head>
  <body>
    <markdown-editor>
# Hello Markdown

Type here. Use --- for an HR line, ::: for asides, and fenced ```js blocks.
    </markdown-editor>
  </body>
</html>
```

- Importing in your bundler entry (rspack example):

```js
// index.js
import "./index.css";            // your global styles (optional)
import "./src/markdown-editor.js"; // registers <markdown-editor>
```

```js
// rspack.config.js (already provided in this repo)
module.exports = {
  entry: "./index.js",
  // ...
};
```

- Adding an instance in your app markup:

```html
<markdown-editor>
# Title

Some initial content here. It will be normalized (dedented and without leading/trailing blank noise).
</markdown-editor>
```


## Programmatic API

The element provides convenience methods for common operations, as well as direct access to the CodeMirror EditorView instance (el.view) for advanced use.

### Convenience methods

- **insertString(str, line_number, char_number)**: Insert text at a specific position
  - `str` (string): The text to insert
  - `line_number` (number): 1-indexed line number
  - `char_number` (number): 0-indexed character position within the line
  - Returns: `true` on success, `false` on failure

```js
const el = document.querySelector("markdown-editor");
el.insertString("Hello world", 1, 0); // Insert at beginning of line 1
```

- **replaceString(str, start_line, start_char, end_line, end_char)**: Replace text in a range
  - `str` (string): The replacement text
  - `start_line` (number): 1-indexed starting line number
  - `start_char` (number): 0-indexed starting character position
  - `end_line` (number): 1-indexed ending line number
  - `end_char` (number): 0-indexed ending character position
  - Returns: `true` on success, `false` on failure

```js
const el = document.querySelector("markdown-editor");
// Replace first 5 characters of line 1 with "# Title"
el.replaceString("# Title", 1, 0, 1, 5);
```

- **getCursor()**: Get current cursor position and context information
  - Returns: Object with cursor details, or `null` on error
    - `line` (number): 1-indexed line number
    - `character` (number): 0-indexed character position within line
    - `context` (string[]): Array of context tags describing cursor location
    - `selected` (string, optional): Selected text if a selection exists

```js
const el = document.querySelector("markdown-editor");
const cursor = el.getCursor();
console.log(cursor);
// Example outputs:
// { line: 5, character: 12, context: ["js", "codeblock"] }
// { line: 2, character: 0, context: ["heading", "h1"] }
// { line: 10, character: 5, context: ["note", "aside"] }
// { line: 3, character: 2, context: [], selected: "some text" }
```

Context tags:
- `"codeblock"`: Cursor is inside a fenced code block (```)
- Language name (e.g., `"js"`, `"python"`): Specific code block language
- `"aside"`: Cursor is inside an aside block (:::)
- Aside type (e.g., `"note"`, `"warning"`): Specific aside type
- `"heading"`: Current line is a heading
- Heading level (e.g., `"h1"`, `"h2"`): Specific heading level

### Direct CodeMirror access

The element exposes its CodeMirror EditorView instance as el.view. You can read and write the document programmatically.

- Get current text:

```js
const el = document.querySelector("markdown-editor");
const text = el.view.state.doc.toString();
console.log(text);
```

- Replace entire document:

```js
const el = document.querySelector("markdown-editor");
const { state } = el.view;
el.view.dispatch({
  changes: { from: 0, to: state.doc.length, insert: "# Replaced\n\nNew content." }
});
```

- Append text at the end:

```js
const el = document.querySelector("markdown-editor");
const end = el.view.state.doc.length;
el.view.dispatch({ changes: { from: end, insert: "\n\nAppended line." } });
```

- Focus the editor:

```js
const el = document.querySelector("markdown-editor");
el.view.focus();
```

Notes:
- Tab inserts two spaces by default.
- Markdown language support includes fenced code languages. JavaScript (js/javascript/node) is loaded eagerly; other languages are provided via @codemirror/language-data.


## Events

The editor dispatches bubbling, composed CustomEvents for various interactions:

### EDITOR-UPDATED

Fires whenever the document content changes.

```js
const el = document.querySelector("markdown-editor");
el.addEventListener("EDITOR-UPDATED", (evt) => {
  // Respond to content changes
  console.log("markdown changed", el.view.state.doc.toString());
});
```

### IMAGE-DROPPED

Fires when an image file is dropped onto the editor. The event detail contains image metadata and a data URL.

Event detail properties:
- `fileName` (string): Original filename
- `fileSize` (number): File size in bytes
- `fileType` (string): MIME type (e.g., "image/png")
- `lastModified` (number): Unix timestamp
- `lastModifiedDate` (string): ISO 8601 date string
- `dataURL` (string): Base64-encoded data URL of the image

```js
const el = document.querySelector("markdown-editor");
el.addEventListener("IMAGE-DROPPED", (evt) => {
  const { fileName, fileSize, fileType, dataURL } = evt.detail;
  console.log(`Image dropped: ${fileName} (${fileSize} bytes)`);
  // Use dataURL to display or upload the image
  // The editor automatically inserts ![[filename|data:image/...;base64,...]] at the drop point
});
```

### IMAGE-DROP-ERROR

Fires if an error occurs while processing a dropped image.

Event detail properties:
- `error` (string): Error message
- `fileName` (string): Name of the file that caused the error

```js
const el = document.querySelector("markdown-editor");
el.addEventListener("IMAGE-DROP-ERROR", (evt) => {
  const { error, fileName } = evt.detail;
  console.error(`Failed to process ${fileName}: ${error}`);
});
```


## Styling and CSS variables

All base theming is driven by CSS custom properties. The component imports styles/variables.css (defaults) and styles/theme.css (rules that consume the variables). You can override any variable globally (via :root) or locally (scoped to a container).

Common variables (from styles/variables.css):
- --bg-color, --fg-color
- --darker-neutral-color, --neutral-bg-color, --lighter-neutral-bg-color, --neutral-fg-color
- --highlight-color
- --secondary-color, --trinary-color, --quaternary-color
- --link-color
- --code-secondary-highlight-color, --code-foreground-color
- --code-background-color, --code-background-color-darker
- --code-highlight-color, --code-neutral-color
- --font-size, --line-height
- --md-heading-weight, --md-h1-size, --md-h2-size, --md-h3-size, --md-h4-size, --md-h5-size, --md-h6-size

Additional variables used by theme.css line decorations:
- --md-hr-line-bg
- --md-aside-fence-bg
- --md-aside-bg

The theme also respects a body font variable if you provide it:
- --body-font-family

- Global, site-wide overrides:

```css
:root {
  --body-font-family: "Fira Code", monospace;
  --bg-color: #0d1117;
  --fg-color: #e6edf3;
  --neutral-bg-color: #30363d;
  --lighter-neutral-bg-color: #21262d;
  --highlight-color: rgba(56, 139, 253, 0.35);
  --secondary-color: #58a6ff;
  --trinary-color: #7ee787;
  --quaternary-color: #d2a8ff;
  --font-size: 15px;
  --line-height: 1.6;
  /* line decoration specifics */
  --md-hr-line-bg: rgba(125,125,125,0.12);
  --md-aside-fence-bg: rgba(253,186,116,0.18);
  --md-aside-bg: rgba(253,186,116,0.12);
}
```

- Scoped overrides (only affect editors inside .note):

```css
.note {
  --bg-color: #fff8e7;
  --fg-color: #5b4931;
  --highlight-color: #fff176; /* selection color */
  --code-background-color: #e8e1d6;
}
```

- Override only selection/active-line accents:

```css
:root {
  --highlight-color: rgba(255, 199, 0, 0.35); /* selection */
  --neutral-bg-color: #b0bec5;                 /* active line left bar */
}
```

- Heading line accents (applied by decoration classes):

```css
:root {
  /* The theme maps heading decoration backgrounds to these */
  --darker-neutral-color: #cfd8dc; /* h1 */
  --secondary-color: #a5d6a7;      /* h2 */
  --trinary-color: #90caf9;        /* h3 */
  --quaternary-color: #b39ddb;     /* h4–h6 */
}
```

- Example: index.html with inline overrides

```html
<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Demo</title>
    <script type="module" src="/markdown-editor.min.js"></script>
    <style>
      :root {
        --body-font-family: "Fira Code", monospace;
        --bg-color: pink;
        --fg-color: blue;
        --darker-neutral-color: green;
        --neutral-bg-color: yellow;
        --lighter-neutral-bg-color: purple;
      }
    </style>
  </head>
  <body>
    <markdown-editor>
# Markdown Editor

Try typing, or paste code fences and asides.
    </markdown-editor>
  </body>
</html>
```

Advanced styling
- Token colors come from classHighlighter and theme.css selectors like .tok-keyword, .tok-string, .tok-comment, etc. You can further refine these with custom CSS if needed.
- Line decoration classes you can target: .cm-hr-line, .cm-code-fence-line, .cm-code-block-line, .cm-aside-fence-line, .cm-aside-block-line, .cm-md-heading with variants .cm-md-h1..h6.


## Behavior details

- Initial content: The editor reads the element’s textContent on first mount, normalizes CRLF to LF, removes an initial stray newline, dedents common indentation, and trims trailing whitespace at the end of the block. The light-DOM content is then cleared and the editor is mounted.
- Keybindings: Tab inserts two spaces. Ctrl-Space triggers completion (via CodeMirror completionKeymap).


## Project scripts (rspack)

- Start dev server:

```bash
npm run start
```

- Build production bundle:

```bash
npm run build
```

- Optional .env settings:

```ini
OUTPUT_FILE_NAME=my-custom-filename.js
PORT=8080
```


## License

See LICENSE.
