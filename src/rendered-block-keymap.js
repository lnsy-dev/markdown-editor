/**
 * rendered-block-keymap.js
 *
 * Allows arrow-key navigation into fenced code blocks that are currently
 * rendered as widgets (chart/network). CodeMirror treats replace decorations
 * as atomic, so the default arrow behaviour skips over them. This keymap
 * detects when the cursor is immediately above or below a rendered block and
 * jumps the selection inside the block, which triggers the editing view.
 */

import { EditorSelection, Prec } from "@codemirror/state";
import { keymap } from "@codemirror/view";

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

function moveIntoBlock(view, direction) {
  const state = view.state;
  const doc = state.doc;
  const cursorPos = state.selection.main.head;
  const cursorLine = doc.lineAt(cursorPos).number;
  const blocks = findRenderedBlocks(doc);

  if (blocks.length === 0) return false;

  // If the cursor is already inside a chart/network block, let the default
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

  view.dispatch({
    selection: EditorSelection.cursor(destinationLine.from),
    scrollIntoView: true,
  });
  return true;
}

export const renderedBlockKeymap = Prec.highest(
  keymap.of([
    {
      key: "ArrowDown",
      run: (view) => moveIntoBlock(view, 1),
    },
    {
      key: "ArrowUp",
      run: (view) => moveIntoBlock(view, -1),
    },
  ]),
);

export default renderedBlockKeymap;
