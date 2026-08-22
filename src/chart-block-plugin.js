/**
 * chart-block-plugin.js
 *
 * Renders ```chart fenced code blocks as interactive <dataroom-chart> widgets
 * when the cursor is outside the block. When the cursor enters the block
 * (via arrow keys or click), the raw YAML/JSON source is shown for editing.
 */

import { StateField, RangeSetBuilder } from "@codemirror/state";
import { EditorView, Decoration, WidgetType } from "@codemirror/view";
import { load as yamlLoad } from "js-yaml";
import { readOnlyState, readOnlyChanged } from "./read-only-state.js";

// Ensure the custom element is registered for rendered widgets.
import "@lnsy/charts/src/dataroom-chart.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isSelectionInBlock(state, block) {
  const sel = state.selection.main;
  return sel.from <= block.to && sel.to >= block.from;
}

/**
 * Find all ```chart fenced blocks in the document.
 * Returns an array of { from, to, content } objects.
 */
function findChartBlocks(doc) {
  const blocks = [];
  let inChart = false;
  let startPos = null;
  let contentLines = [];

  for (let n = 1; n <= doc.lines; n++) {
    const line = doc.line(n);
    const text = line.text;
    const match = text.match(/^\s*```+\s*(\S*)\s*$/);

    if (match) {
      if (!inChart && match[1] === "chart") {
        inChart = true;
        startPos = line.from;
        contentLines = [];
      } else if (inChart) {
        blocks.push({
          from: startPos,
          to: line.to,
          content: contentLines.join("\n"),
        });
        inChart = false;
        startPos = null;
        contentLines = [];
      }
      continue;
    }

    if (inChart) {
      contentLines.push(text);
    }
  }

  // Handle unclosed block at end of document.
  if (inChart && startPos !== null) {
    blocks.push({
      from: startPos,
      to: doc.length,
      content: contentLines.join("\n"),
    });
  }

  return blocks;
}

/**
 * Convert the YAML chart config (as used inside ```chart blocks) into a
 * <dataroom-chart> element string.
 */
function chartContentToHtml(content) {
  const config = yamlLoad(content || "");
  if (!config || typeof config !== "object") {
    throw new Error("Invalid chart configuration");
  }

  const attrs = [];
  if (config.type) attrs.push(`type="${config.type}"`);
  if (config.width) attrs.push(`width="${config.width}"`);
  if (config.height) attrs.push(`height="${config.height}"`);
  if (config.orientation) attrs.push(`orientation="${config.orientation}"`);
  if (config.monochrome !== undefined) attrs.push(`monochrome="${config.monochrome}"`);
  if (config.color) attrs.push(`color="${config.color}"`);
  if (config.lineWidth) attrs.push(`line-width="${config.lineWidth}"`);
  if (config.radius) attrs.push(`radius="${config.radius}"`);
  if (config.minRadius) attrs.push(`min-radius="${config.minRadius}"`);
  if (config.maxRadius) attrs.push(`max-radius="${config.maxRadius}"`);
  if (config.labels !== undefined) attrs.push(`labels="${config.labels}"`);

  const data = config.data || [];
  return `<dataroom-chart ${attrs.join(" ")}>${JSON.stringify(data)}</dataroom-chart>`;
}

// ---------------------------------------------------------------------------
// Widget
// ---------------------------------------------------------------------------

class ChartWidget extends WidgetType {
  constructor(content) {
    super();
    this.content = content;
  }

  eq(other) {
    return other.content === this.content;
  }

  toDOM() {
    const wrap = document.createElement("div");
    wrap.className = "cm-chart-widget";
    try {
      wrap.innerHTML = chartContentToHtml(this.content);
    } catch (error) {
      wrap.className += " cm-chart-widget-error";
      wrap.textContent = `Chart error: ${error.message}`;
    }
    return wrap;
  }

  ignoreEvent() {
    return true;
  }
}

// ---------------------------------------------------------------------------
// Decoration builder
// ---------------------------------------------------------------------------

function buildDecorations(state) {
  const builder = new RangeSetBuilder();
  const doc = state.doc;
  const blocks = findChartBlocks(doc);
  const readOnly = state.field(readOnlyState);

  for (const block of blocks) {
    if (!readOnly && isSelectionInBlock(state, block)) {
      // Active block: show raw source and add an editing class to the
      // opening fence so the user can see it is editable.
      const firstLine = doc.lineAt(block.from);
      builder.add(
        firstLine.from,
        firstLine.from,
        Decoration.line({ class: "cm-chart-block-editing" }),
      );
      continue;
    }

    // Inactive block (or read-only mode): replace the entire fence with a
    // rendered widget that stays interactive.
    builder.add(
      block.from,
      block.to,
      Decoration.replace({
        widget: new ChartWidget(block.content),
        block: true,
      }),
    );
  }

  return builder.finish();
}

// ---------------------------------------------------------------------------
// StateField
// ---------------------------------------------------------------------------

const chartBlockField = StateField.define({
  create(state) {
    return buildDecorations(state);
  },
  update(deco, tr) {
    if (tr.docChanged || tr.selection || readOnlyChanged(tr)) {
      return buildDecorations(tr.state);
    }
    return deco.map(tr.changes);
  },
  provide: (f) => EditorView.decorations.from(f),
});

export default chartBlockField;
