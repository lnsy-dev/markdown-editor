/**
 * rendered-block-keymap.js
 *
 * Allows arrow-key navigation into and out of fenced code blocks that are
 * currently rendered as widgets (chart/network). CodeMirror treats replace
 * decorations as atomic, so the default arrow behaviour skips over them. This
 * keymap detects block boundaries and moves the cursor across them.
 *
 * When a boundary is crossed the block's visual height changes (widget <-> raw
 * source), which normally makes the viewport jump. We keep the cursor at the
 * same screen position by compensating the scroll position for the layout
 * change, so the active line stays visually anchored.
 */

import { EditorSelection, Prec } from "@codemirror/state";
import { keymap } from "@codemirror/view";
import { readOnlyState } from "./read-only-state.js";

const FENCE_RE = /^\s*```+\s*(\S*)\s*$/;

function findRenderedBlocks(doc) {
  const blocks = [];
  let inBlock = false;
  let startPos = null;
  let lang = null;

  for (let n = 1; n <= doc.lines; n++) {
    const line = doc.line(n);
    const match = line.text.match(FENCE_RE);

    if (match) {
      if (!inBlock && (match[1] === "chart" || match[1] === "network")) {
        inBlock = true;
        startPos = line.from;
        lang = match[1];
      } else if (inBlock) {
        blocks.push({ from: startPos, to: line.to, lang });
        inBlock = false;
        startPos = null;
        lang = null;
      }
      continue;
    }
  }

  if (inBlock && startPos !== null) {
    blocks.push({ from: startPos, to: doc.length, lang });
  }

  return blocks;
}

/**
 * Dispatch a cursor move and then adjust the scroll position so that the
 * cursor stays at the same vertical screen coordinate. This prevents the
 * viewport from jumping when the widget/source swap changes the document
 * layout around the active line.
 */
function dispatchPreservingCursor(view, newPos) {
  const oldPos = view.state.selection.main.head;
  const oldLine = view.lineBlockAt(oldPos);

  view.dispatch({
    selection: EditorSelection.cursor(newPos),
  });

  const newLine = view.lineBlockAt(newPos);
  const delta = newLine.top - oldLine.top;

  if (Math.abs(delta) > 1) {
    view.scrollDOM.scrollTop += delta;
  }
}

function moveIntoBlock(view, direction) {
  const state = view.state;
  const doc = state.doc;
  const cursorPos = state.selection.main.head;
  const cursorLine = doc.lineAt(cursorPos).number;
  const blocks = findRenderedBlocks(doc);

  if (blocks.length === 0) return false;

  // If the cursor is already inside a rendered block, let the default
  // arrow behaviour handle movement within the raw source.
  const containingBlock = blocks.find((b) => b.from <= cursorPos && cursorPos <= b.to);
  if (containingBlock) return false;

  const targetLineNum = cursorLine + direction;
  if (targetLineNum < 1 || targetLineNum > doc.lines) return false;

  const targetLine = doc.line(targetLineNum);

  // ArrowDown: the line below the cursor is the opening fence of a block.
  // ArrowUp: the line above the cursor is the closing fence of a block.
  const block =
    direction === 1
      ? blocks.find((b) => b.from === targetLine.from)
      : blocks.find((b) => b.to === targetLine.to);

  if (!block) return false;

  // Jump to the first content line when entering from above, or the last
  // content line when entering from below.
  const destinationLineNum =
    direction === 1
      ? Math.min(doc.lineAt(block.from).number + 1, doc.lines)
      : Math.max(doc.lineAt(block.to).number - 1, 1);
  const destinationLine = doc.line(destinationLineNum);

  // Make sure the destination is actually inside the block.
  if (destinationLine.from < block.from || destinationLine.to > block.to) {
    return false;
  }

  dispatchPreservingCursor(view, destinationLine.from);
  return true;
}

function moveOutOfBlock(view, direction, block) {
  const doc = view.state.doc;
  const blockFirstLine = doc.lineAt(block.from).number;
  const blockLastLine = doc.lineAt(block.to).number;

  const targetLineNum =
    direction === -1
      ? Math.max(blockFirstLine - 1, 1)
      : Math.min(blockLastLine + 1, doc.lines);

  dispatchPreservingCursor(view, doc.line(targetLineNum).from);
  return true;
}

function moveVertical(view, direction) {
  if (view.state.field(readOnlyState)) return false;

  const state = view.state;
  const doc = state.doc;
  const cursorPos = state.selection.main.head;
  const cursorLine = doc.lineAt(cursorPos).number;
  const blocks = findRenderedBlocks(doc);

  if (blocks.length === 0) return false;

  const containingBlock = blocks.find((b) => b.from <= cursorPos && cursorPos <= b.to);

  if (containingBlock) {
    const blockFirstLine = doc.lineAt(containingBlock.from).number;
    const blockLastLine = doc.lineAt(containingBlock.to).number;

    const atTopBoundary = direction === -1 && cursorLine <= blockFirstLine + 1;
    const atBottomBoundary = direction === 1 && cursorLine >= blockLastLine - 1;

    if (atTopBoundary || atBottomBoundary) {
      return moveOutOfBlock(view, direction, containingBlock);
    }

    // Not at a boundary: use CodeMirror's default movement within the block.
    return false;
  }

  return moveIntoBlock(view, direction);
}

export const renderedBlockKeymap = Prec.highest(
  keymap.of([
    {
      key: "ArrowDown",
      run: (view) => moveVertical(view, 1),
    },
    {
      key: "ArrowUp",
      run: (view) => moveVertical(view, -1),
    },
  ]),
);

export default renderedBlockKeymap;
