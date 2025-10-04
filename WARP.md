# WARP.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

Project overview
- Vanilla JS/CSS/HTML project bundled with Rspack. Entry is index.js, served/referenced from index.html.
- Primary example feature is a Custom Element (<example-component>) implemented with the dataroom-js library that demonstrates:
  - DOM creation via DataroomElement.create
  - A Web Worker (src/example-webworker.js) instantiated using new Worker(new URL(..., import.meta.url)), posting a message back to the component.
- Rspack configuration (rspack.config.js):
  - entry: ./index.js
  - output: dist/<OUTPUT_FILE_NAME or main.min.js>
  - devServer: serves the repo root; PORT is configurable via env (defaults to 3000)
  - JS transformed by builtin:swc-loader (no TypeScript).

Commands
- Install dependencies: npm install
- Start dev server: npm run start
  - Defaults to http://localhost:3000; override with PORT in .env.
  - Important: Per GEMINI.md, do not start the dev server unless explicitly requested.
- Build for production: npm run build
  - Outputs to dist/. Filename defaults to main.min.js. Override with OUTPUT_FILE_NAME in .env.
- Tests: No test framework is configured. npm test intentionally exits with an error; do not rely on it.
- Lint/Format: No linters or formatters are configured in this repo.

Environment
- Copy .env.example to .env as needed.
- Supported variables (see README.md and rspack.config.js):
  - PORT: Dev server port (default 3000)
  - OUTPUT_FILE_NAME: Bundle filename (default main.min.js)

High-level architecture and flow
- index.html loads index.js as a module and links index.css. The document includes <example-component>, which is defined in src/example-component.js.
- src/example-component.js extends DataroomElement from dataroom-js and implements initialize to build UI and spawn a Web Worker:
  - Creates an h1 and p via DataroomElement.create.
  - Starts src/example-webworker.js via new Worker(new URL('./example-webworker.js', import.meta.url)).
  - Receives worker messages and appends them to the DOM.
- src/example-webworker.js echoes a greeting back to the main thread.
- Bundling/dev:
  - Rspack consumes index.js, bundles to dist/, and serves static files from the repo root during development.

Important repository notes (from README.md and GEMINI.md)
- Do not run the dev server automatically. Only run npm run start if explicitly asked.
- To change the build filename or dev port, use OUTPUT_FILE_NAME and PORT in .env.
- The project is a boilerplate intended to be extended; no tests, linting, or framework abstractions are present by default.
