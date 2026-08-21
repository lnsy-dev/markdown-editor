/**
 * network-block-plugin.js
 *
 * Renders ```network fenced code blocks as interactive <network-visualization>
 * widgets when the cursor is outside the block. When the cursor enters the
 * block, the raw source is shown for editing.
 */

import { StateField, RangeSetBuilder } from "@codemirror/state";
import { EditorView, Decoration, WidgetType } from "@codemirror/view";
import { readOnlyState, readOnlyChanged } from "./read-only-state.js";

// Ensure the custom element is registered for rendered widgets.
import "@lnsy/network-visualization";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isSelectionInBlock(state, block) {
  const sel = state.selection.main;
  return sel.from <= block.to && sel.to >= block.from;
}

/**
 * Find all ```network fenced blocks in the document.
 * Returns an array of { from, to, content } objects.
 */
function findNetworkBlocks(doc) {
  const blocks = [];
  let inNetwork = false;
  let startPos = null;
  let contentLines = [];

  for (let n = 1; n <= doc.lines; n++) {
    const line = doc.line(n);
    const text = line.text;
    const match = text.match(/^\s*```+\s*(\S*)\s*$/);

    if (match) {
      if (!inNetwork && match[1] === "network") {
        inNetwork = true;
        startPos = line.from;
        contentLines = [];
      } else if (inNetwork) {
        blocks.push({
          from: startPos,
          to: line.to,
          content: contentLines.join("\n"),
        });
        inNetwork = false;
        startPos = null;
        contentLines = [];
      }
      continue;
    }

    if (inNetwork) {
      contentLines.push(text);
    }
  }

  // Handle unclosed block at end of document.
  if (inNetwork && startPos !== null) {
    blocks.push({
      from: startPos,
      to: doc.length,
      content: contentLines.join("\n"),
    });
  }

  return blocks;
}

// ---------------------------------------------------------------------------
// Network syntax parser (adapted from @lnsy/mark-down)
// ---------------------------------------------------------------------------

function parseNetworkBlock(content) {
  const lines = content.split("\n");
  let frontMatter = {};
  let nodes = [];
  let edges = [];
  let connections = [];

  let currentSection = null; // 'frontmatter', 'definitions', 'connections'
  let currentItem = null;
  let currentItemContent = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Detect front matter boundaries and section separators.
    if (line.trim() === "---") {
      if (currentSection === null) {
        currentSection = "frontmatter";
        continue;
      } else if (currentSection === "frontmatter") {
        currentSection = "definitions";
        continue;
      } else if (currentSection === "definitions") {
        currentSection = "connections";
        continue;
      }
    }

    // Parse front matter.
    if (currentSection === "frontmatter") {
      const match = line.match(/^(\w+):\s*(.+)$/);
      if (match) {
        frontMatter[match[1]] = match[2];
      }
      continue;
    }

    // Parse definitions (nodes and edges).
    if (currentSection === "definitions") {
      if (line.length > 0 && !line.match(/^\s/)) {
        if (currentItem) {
          saveItem(currentItem, currentItemContent, nodes, edges);
        }
        currentItem = line.replace(":", "").trim();
        currentItemContent = [];
      } else if (line.trim().length > 0) {
        currentItemContent.push(line.replace(/^\t/, ""));
      }
      continue;
    }

    // Parse connections.
    if (currentSection === "connections") {
      if (line.trim().length > 0) {
        connections.push(line.trim());
      }
    }
  }

  if (currentItem) {
    saveItem(currentItem, currentItemContent, nodes, edges);
  }

  const nodeAttributes = parseConnectionAttributes(connections);
  const diagramEdges = parseConnectionEdges(connections);
  const allNodes = ensureAllNodesExist(nodes, connections, nodeAttributes);

  return generateHTML(frontMatter, allNodes, edges, connections, nodeAttributes, diagramEdges);
}

function saveItem(name, contentLines, nodes, edges) {
  const content = contentLines.join("\n");
  const html = parseMarkdownContent(content);

  if (name.toLowerCase().includes("edge")) {
    edges.push({ name, html });
  } else {
    nodes.push({ name, html });
  }
}

function parseMarkdownContent(content) {
  const lines = content.split("\n");
  let html = "";
  let currentParagraph = [];

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed.startsWith("#")) {
      if (currentParagraph.length > 0) {
        html += `\t\t<p>${currentParagraph.join(" ")}</p>\n`;
        currentParagraph = [];
      }
      const match = trimmed.match(/^(#+)\s*(.+)$/);
      if (match) {
        const level = match[1].length;
        const text = match[2];
        html += `\t\t<h${level}>${text}</h${level}>\n`;
      }
    } else if (trimmed.length > 0) {
      currentParagraph.push(trimmed);
    } else if (currentParagraph.length > 0) {
      html += `\t\t<p>${currentParagraph.join(" ")}</p>\n`;
      currentParagraph = [];
    }
  }

  if (currentParagraph.length > 0) {
    html += `\t\t<p>${currentParagraph.join(" ")}</p>\n`;
  }

  return html;
}

function parseConnectionAttributes(connections) {
  const nodeAttributes = {};

  for (const connection of connections) {
    const nodePattern = /\(([^|)]+)(?:\|([^)]+))?\)/g;
    let match;

    while ((match = nodePattern.exec(connection)) !== null) {
      const nodeName = match[1].trim();
      const attributesStr = match[2];

      if (attributesStr) {
        const attrs = {};
        const attrPairs = attributesStr.split(";");
        for (const pair of attrPairs) {
          const [key, value] = pair.split(":").map((s) => s.trim());
          if (key && value) {
            attrs[key] = value;
          }
        }
        if (nodeAttributes[nodeName]) {
          Object.assign(nodeAttributes[nodeName], attrs);
        } else {
          nodeAttributes[nodeName] = attrs;
        }
      }
    }
  }

  return nodeAttributes;
}

function parseConnectionEdges(connections) {
  const edges = [];

  for (const connection of connections) {
    const edgePattern = /\(([^|)]+)(?:\|[^)]+)?\)\s*(<?-(?:\[([^\]]+)\])?-?>)\s*\(([^|)]+)(?:\|[^)]+)?\)/g;
    let match;

    while ((match = edgePattern.exec(connection)) !== null) {
      const source = match[1].trim();
      const edgeSymbol = match[2].trim();
      const label = match[3] ? match[3].trim() : null;
      const target = match[4].trim();

      let direction = "forward";
      if (edgeSymbol.startsWith("<")) {
        direction = "backward";
      }

      edges.push({
        sourceName: direction === "forward" ? source : target,
        targetName: direction === "forward" ? target : source,
        label,
        direction,
      });
    }
  }

  return edges;
}

function ensureAllNodesExist(nodes, connections, nodeAttributes) {
  const existingNodeNames = new Set(nodes.map((n) => n.name));
  const referencedNodes = new Set();

  for (const connection of connections) {
    const nodePattern = /\(([^|)]+)(?:\|[^)]+)?\)/g;
    let match;
    while ((match = nodePattern.exec(connection)) !== null) {
      referencedNodes.add(match[1].trim());
    }
  }

  const allNodes = [...nodes];
  for (const nodeName of referencedNodes) {
    if (!existingNodeNames.has(nodeName)) {
      allNodes.push({ name: nodeName, html: "" });
    }
  }

  return allNodes;
}

function generateHTML(frontMatter, nodes, edges, connections, nodeAttributes, diagramEdges) {
  let html = "<network-visualization";
  for (const [key, value] of Object.entries(frontMatter)) {
    html += ` ${key}="${value}"`;
  }
  html += ">\n";

  const nodeNameToId = {};
  for (let i = 0; i < nodes.length; i++) {
    nodeNameToId[nodes[i].name] = i;
  }

  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    html += `\t<network-node id="${i}"`;
    if (node.html) {
      html += ` name="${node.name}"`;
    }
    if (nodeAttributes[node.name]) {
      for (const [key, value] of Object.entries(nodeAttributes[node.name])) {
        html += ` ${key}="${value}"`;
      }
    }
    html += ">\n";
    html += node.html;
    html += `\t</network-node>\n`;
    if (i < nodes.length - 1 || edges.length > 0 || diagramEdges.length > 0) {
      html += "\t\n";
    }
  }

  const namedEdges = [];
  const unnamedEdges = [];

  for (const edge of diagramEdges) {
    const sourceId = nodeNameToId[edge.sourceName];
    const targetId = nodeNameToId[edge.targetName];
    if (edge.label) {
      namedEdges.push({ ...edge, sourceId, targetId });
    } else {
      unnamedEdges.push({ ...edge, sourceId, targetId });
    }
  }

  for (const edge of unnamedEdges) {
    html += `\t<network-edge source="${edge.sourceId}" target="${edge.targetId}"></network-edge>\n`;
  }

  for (const edge of namedEdges) {
    const edgeDef = edges.find((e) => e.name === edge.label);
    html += `\t<network-edge name="${edge.label}" source="${edge.sourceId}" target="${edge.targetId}">\n`;
    if (edgeDef) {
      html += edgeDef.html;
    }
    html += `\t</network-edge>\n`;
  }

  html += "</network-visualization>";
  return html;
}

// ---------------------------------------------------------------------------
// Widget
// ---------------------------------------------------------------------------

class NetworkWidget extends WidgetType {
  constructor(content) {
    super();
    this.content = content;
  }

  eq(other) {
    return other.content === this.content;
  }

  toDOM() {
    const wrap = document.createElement("div");
    wrap.className = "cm-network-widget";
    try {
      wrap.innerHTML = parseNetworkBlock(this.content);
    } catch (error) {
      wrap.className += " cm-network-widget-error";
      wrap.textContent = `Network error: ${error.message}`;
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
  const blocks = findNetworkBlocks(doc);
  const readOnly = state.field(readOnlyState);

  for (const block of blocks) {
    if (!readOnly && isSelectionInBlock(state, block)) {
      const firstLine = doc.lineAt(block.from);
      builder.add(
        firstLine.from,
        firstLine.from,
        Decoration.line({ class: "cm-network-block-editing" }),
      );
      continue;
    }

    // In read-only mode the interactive widget stays rendered.
    builder.add(
      block.from,
      block.to,
      Decoration.replace({
        widget: new NetworkWidget(block.content),
        block: true,
      }),
    );
  }

  return builder.finish();
}

// ---------------------------------------------------------------------------
// StateField
// ---------------------------------------------------------------------------

const networkBlockField = StateField.define({
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

export default networkBlockField;
