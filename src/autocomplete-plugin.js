/**
 * autocomplete-plugin.js
 *
 * Provides symbol-triggered autocomplete completions for a CodeMirror editor.
 * Configuration is supplied as element attributes in the form:
 *
 *   autocomplete--atsymbol="@;https://path-to-endpoint"
 *   autocomplete-poundsign="#;https://path-to-endpoint"
 *
 * The endpoint should return JSON. Supported shapes:
 *   - ["alice", "bob", "charlie"]
 *   - [{ "label": "Alice", "value": "alice" }, ...]
 *
 * The symbol (everything before the first semicolon) is the trigger; the URL
 * (everything after the first semicolon) is fetched once and cached per editor.
 */

import { autocompletion, completeFromList } from "@codemirror/autocomplete";

/**
 * Escapes a string for safe use inside a RegExp.
 * @param {string} string
 * @returns {string}
 */
function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Parses an attribute value into { symbol, url }.
 * Format: "symbol;url" (the URL may contain additional semicolons).
 * @param {string|null} value
 * @returns {{symbol: string, url: string}|null}
 */
function parseConfig(value) {
  if (!value) return null;
  const separatorIndex = value.indexOf(";");
  if (separatorIndex === -1) return null;
  const symbol = value.slice(0, separatorIndex).trim();
  const url = value.slice(separatorIndex + 1).trim();
  if (!symbol || !url) return null;
  return { symbol, url };
}

/**
 * Normalizes endpoint data into a consistent array of completion options.
 * @param {unknown} data
 * @returns {Array<{label: string, apply: string}>}
 */
function normalizeOptions(data) {
  if (!Array.isArray(data)) return [];
  return data.map((item) => {
    if (typeof item === "string") {
      return { label: item, apply: item };
    }
    if (item && typeof item === "object") {
      const label = item.label || item.name || item.value || String(item);
      const apply = item.value || item.label || item.name || String(item);
      return { ...item, label, apply };
    }
    return { label: String(item), apply: String(item) };
  });
}

/**
 * Fetches and normalizes completion options from a URL.
 * @param {string} url
 * @returns {Promise<Array<{label: string, apply: string}>>}
 */
async function fetchOptions(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Autocomplete fetch failed: HTTP ${response.status} for ${url}`);
  }
  return normalizeOptions(await response.json());
}

/**
 * Creates a completion source for a single symbol/endpoint configuration.
 * The endpoint is fetched lazily and cached.
 * @param {{symbol: string, url: string}} config
 * @returns {(context: import("@codemirror/autocomplete").CompletionContext) => Promise<import("@codemirror/autocomplete").CompletionResult|null>}
 */
function createSymbolSource(config) {
  let cache = null;
  let pending = null;

  return async (context) => {
    // Match the trigger symbol followed by any non-whitespace text.
    const triggerRe = new RegExp(escapeRegExp(config.symbol) + "(\\S*)");
    const match = context.matchBefore(triggerRe);
    if (!match) return null;

    if (!cache) {
      if (!pending) {
        pending = fetchOptions(config.url)
          .then((options) => {
            cache = options;
            return options;
          })
          .catch((error) => {
            console.error(error);
            cache = [];
            return [];
          });
      }
      await pending;
    }

    const query = (match[1] || "").toLowerCase();
    const options = cache.filter((opt) =>
      opt.label.toLowerCase().includes(query)
    );

    return {
      from: match.from + config.symbol.length,
      options,
      validFor: new RegExp("^" + escapeRegExp(config.symbol) + "\\S*$"),
    };
  };
}

/**
 * Completion source that preserves the editor's default language completions
 * (e.g. HTML tag/attribute completions from @codemirror/lang-html).
 *
 * CodeMirror's autocompletion() extension only uses `override` sources when they
 * are provided, so this wrapper re-implements the default lookup behavior and
 * merges the results into a single completion result.
 *
 * @param {import("@codemirror/autocomplete").CompletionContext} context
 * @returns {Promise<import("@codemirror/autocomplete").CompletionResult|null>}
 */
function defaultCompletionSource(context) {
  const sources = context.state
    .languageDataAt("autocomplete", context.pos)
    .map((source) => (Array.isArray(source) ? completeFromList(source) : source));

  if (!sources.length) return null;

  return Promise.all(sources.map((source) => Promise.resolve(source(context))))
    .then((results) => {
      const options = results.flatMap((result) => result?.options || []);
      if (!options.length) return null;
      const fromValues = results
        .filter((result) => result)
        .map((result) => result.from);
      return { from: Math.min(...fromValues), options };
    });
}

/**
 * Builds an autocompletion extension from a list of raw attribute values.
 * Returns null when no valid configurations are found, allowing the caller to
 * fall back to the default autocompletion() extension.
 *
 * @param {Array<string|null|undefined>} configValues
 * @returns {import("@codemirror/state").Extension|null}
 */
export function buildAutocompleteExtension(configValues) {
  const configs = configValues
    .map(parseConfig)
    .filter(Boolean);

  if (!configs.length) return null;

  return autocompletion({
    override: [...configs.map(createSymbolSource), defaultCompletionSource],
  });
}
