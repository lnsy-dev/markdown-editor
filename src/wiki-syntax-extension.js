import { tags as t } from "@lezer/highlight";

/** Matches [[target]] or [[target|label]], but not ![[image]] */
export const WIKILINK_INLINE_RE = /(?<!!)\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;
const WIKILINK_RE = /^\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/;

/** Inline #tag (not ATX headings — those are parsed at block level) */
export const HASHTAG_INLINE_RE = /(?<!\w)#([\w][\w-]*)/g;
const HASHTAG_RE = /^#([\w][\w-]*)/;

/** @mention-style references */
export const REFERENCE_INLINE_RE = /(?<!\w)@([\w][\w/-]*(?:\.[\w/-]+)*)/g;
const REFERENCE_RE = /^@([\w][\w/-]*(?:\.[\w/-]+)*)/;

export const Wikilink = {
  defineNodes: [
    { name: "Wikilink", style: t.link },
    { name: "WikilinkMark", style: t.processingInstruction },
    { name: "WikilinkTarget", style: t.link },
    { name: "WikilinkLabel", style: t.emphasis },
  ],
  parseInline: [{
    name: "Wikilink",
    before: "Link",
    parse(cx, next, pos) {
      if (next !== 91 /* [ */ || cx.char(pos + 1) !== 91) return -1;
      const rel = pos - cx.offset;
      if (rel > 0 && cx.text[rel - 1] === "!") return -1;

      const match = WIKILINK_RE.exec(cx.text.slice(rel));
      if (!match) return -1;

      const end = pos + match[0].length;
      const targetStart = pos + 2;
      const targetEnd = targetStart + match[1].length;
      const children = [
        cx.elt("WikilinkMark", pos, pos + 2),
        cx.elt("WikilinkTarget", targetStart, targetEnd),
      ];

      if (match[2]) {
        const pipePos = targetEnd;
        children.push(cx.elt("WikilinkMark", pipePos, pipePos + 1));
        children.push(cx.elt("WikilinkLabel", pipePos + 1, end - 2));
      }

      children.push(cx.elt("WikilinkMark", end - 2, end));
      return cx.addElement(cx.elt("Wikilink", pos, end, children));
    },
  }],
};

export const Hashtag = {
  defineNodes: [{ name: "Hashtag", style: t.labelName }],
  parseInline: [{
    name: "Hashtag",
    parse(cx, next, pos) {
      if (next !== 35 /* # */) return -1;
      const rel = pos - cx.offset;
      if (rel > 0 && /\w/.test(cx.text[rel - 1])) return -1;

      const match = HASHTAG_RE.exec(cx.text.slice(rel));
      if (!match) return -1;

      return cx.addElement(cx.elt("Hashtag", pos, pos + match[0].length));
    },
  }],
};

export const Reference = {
  defineNodes: [{ name: "Reference", style: t.labelName }],
  parseInline: [{
    name: "Reference",
    parse(cx, next, pos) {
      if (next !== 64 /* @ */) return -1;
      const rel = pos - cx.offset;
      if (rel > 0 && /\w/.test(cx.text[rel - 1])) return -1;

      const match = REFERENCE_RE.exec(cx.text.slice(rel));
      if (!match) return -1;

      return cx.addElement(cx.elt("Reference", pos, pos + match[0].length));
    },
  }],
};

export const wikiSyntaxExtensions = [Wikilink, Hashtag, Reference];

/** Parse [[target]] or [[target|label]] from text; returns null if not a wikilink. */
export function parseWikilink(text) {
  const match = text.match(WIKILINK_RE);
  if (!match) return null;
  return {
    target: match[1].trim(),
    label: match[2]?.trim() || match[1].trim(),
  };
}

/** Find all wikilinks in a string; returns array of { from, to, target, label } with local offsets. */
export function findWikilinks(text) {
  const results = [];
  WIKILINK_INLINE_RE.lastIndex = 0;
  let match;
  while ((match = WIKILINK_INLINE_RE.exec(text)) !== null) {
    const target = match[1].trim();
    results.push({
      from: match.index,
      to: match.index + match[0].length,
      target,
      label: match[2]?.trim() || target,
    });
  }
  return results;
}

/** Find all inline hashtags in a string; returns array of { from, to, tag } with local offsets. */
export function findHashtags(text) {
  const results = [];
  HASHTAG_INLINE_RE.lastIndex = 0;
  let match;
  while ((match = HASHTAG_INLINE_RE.exec(text)) !== null) {
    const tag = match[1];
    results.push({
      from: match.index,
      to: match.index + match[0].length,
      tag,
    });
  }
  return results;
}

/** Find all @-mentions in a string; returns array of { from, to, reference } with local offsets. */
export function findReferences(text) {
  const results = [];
  REFERENCE_INLINE_RE.lastIndex = 0;
  let match;
  while ((match = REFERENCE_INLINE_RE.exec(text)) !== null) {
    const reference = match[1];
    results.push({
      from: match.index,
      to: match.index + match[0].length,
      reference,
    });
  }
  return results;
}
