# Project Structure

This is a vanilla JavaScript, CSS, and HTML project that uses `rspack` as a builder.

Do not run a dev server. Do not run `npm start` unless specifically asked to.

## Root Directory

*   `.gitignore`: Specifies intentionally untracked files to ignore.
*   `GEMINI.md`: This file, providing an overview of the project structure.
*   `index.css`: Main stylesheet for the application.
*   `index.html`: Main HTML file for the application.
*   `index.js`: Main JavaScript entry point for the application.
*   `LICENSE`: License file for the project.
*   `package-lock.json`: Records the exact version of each installed package.
*   `package.json`: Contains metadata about the project and its dependencies.
*   `README.md`: General information about the project.
*   `rspack.config.js`: Configuration file for the `rspack` builder.

## Directories

*   `dist/`: Contains the built and bundled application code.
*   `node_modules/`: Contains all the project's dependencies.
*   `prompts/`: Contains prompts for the Gemini model.
*   `src/`: Contains the source code for the application.
    *   `example-component.js`: An example of a JavaScript component.
    *   `example-webworker.js`: An example of a web worker.
*   `styles/`: Contains CSS files for the application.
    *   `variables.css`: Contains CSS variables.