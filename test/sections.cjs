"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/sections.ts
var sections_exports = {};
__export(sections_exports, {
  appendSection: () => appendSection,
  isTimelineTitle: () => isTimelineTitle,
  mirrorSections: () => mirrorSections,
  paragraphsFromSoftBreaks: () => paragraphsFromSoftBreaks,
  parseDay: () => parseDay,
  plainText: () => plainText,
  reorderSection: () => reorderSection,
  replaceSectionBody: () => replaceSectionBody,
  stripEmptyHeadings: () => stripEmptyHeadings
});
module.exports = __toCommonJS(sections_exports);
function splitLines(text) {
  return text.replace(/\r\n/g, "\n").split("\n");
}
function headingOf(line) {
  const m = /^(#{1,6})\s+(.*?)\s*$/.exec(line);
  if (!m) return null;
  return { level: m[1].length, text: m[2] };
}
function isTimelineTitle(title) {
  return /^\s*\d{1,2}\s*[:：]\s*\d{2}/.test(title);
}
function stripEmptyHeadings(md) {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const keep = new Array(lines.length).fill(true);
  let i = 0;
  while (i < lines.length) {
    const m = /^(#{1,6})\s+(.*)$/.exec(lines[i]);
    if (!m) {
      i++;
      continue;
    }
    const level = m[1].length;
    let j = i + 1;
    let hasContent = false;
    for (; j < lines.length; j++) {
      const h = /^(#{1,6})\s+/.exec(lines[j]);
      if (h && h[1].length <= level) break;
      if (lines[j].trim() && !/^#{1,6}\s+/.test(lines[j])) {
        hasContent = true;
        break;
      }
    }
    if (!hasContent) keep[i] = false;
    i++;
  }
  return lines.filter((_l, idx) => keep[idx]).join("\n").replace(/\n{3,}/g, "\n\n").trim();
}
function mirrorSections(md, map) {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const m = /^(#{1,6})\s+(.*?)\s*$/.exec(lines[i]);
    if (!m) {
      out.push(lines[i++]);
      continue;
    }
    const level = m[1].length;
    const title = m[2];
    let j = i + 1;
    while (j < lines.length) {
      const h = /^(#{1,6})\s+/.exec(lines[j]);
      if (h && h[1].length <= level) break;
      j++;
    }
    out.push(lines[i]);
    const live = map[title];
    if (live !== void 0) {
      const body = live.trim();
      if (body) out.push("", ...body.split("\n"), "");
    } else {
      out.push(...lines.slice(i + 1, j));
    }
    i = j;
  }
  return out.join("\n");
}
function trimBlank(lines, from, to) {
  let a = from;
  let b = to;
  while (a < b && lines[a].trim() === "") a++;
  while (b > a && lines[b - 1].trim() === "") b--;
  return lines.slice(a, b).join("\n");
}
function parseDay(text, level = 2) {
  const lines = splitLines(text);
  const result = { h1: "", quote: "", frontmatter: "", sections: [] };
  let bodyStart = 0;
  if (lines[0]?.trim() === "---") {
    for (let i = 1; i < lines.length; i++) {
      if (lines[i].trim() === "---") {
        result.frontmatter = lines.slice(1, i).join("\n");
        bodyStart = i + 1;
        break;
      }
    }
  }
  const headings = [];
  for (let i = bodyStart; i < lines.length; i++) {
    const h = headingOf(lines[i]);
    if (h) headings.push({ line: i, level: h.level, text: h.text });
  }
  for (let i = bodyStart; i < lines.length; i++) {
    const t = lines[i].trim();
    if (!result.h1 && t.startsWith("# ") && !t.startsWith("## ")) {
      result.h1 = t.slice(2).trim();
    }
    if (!result.quote && t.startsWith(">")) {
      result.quote = t.replace(/^>\s*/, "").trim();
    }
    if (result.h1 && result.quote) break;
  }
  const marks = headings.filter((h) => h.level === level);
  for (let k = 0; k < marks.length; k++) {
    const cur = marks[k];
    let end = lines.length;
    for (let j = cur.line + 1; j < lines.length; j++) {
      const h = headingOf(lines[j]);
      if (h && h.level <= level) {
        end = j;
        break;
      }
    }
    result.sections.push({
      title: cur.text,
      startLine: cur.line,
      contentStart: cur.line + 1,
      contentEndExclusive: end,
      body: trimBlank(lines, cur.line + 1, end)
    });
  }
  return result;
}
function replaceSectionBody(text, title, newBody, level = 2) {
  const lines = splitLines(text);
  const parsed = parseDay(text, level);
  const target = parsed.sections.find((s) => s.title === title);
  const clean = newBody.replace(/\r\n/g, "\n").replace(/^\n+|\n+$/g, "");
  if (!target) {
    const hashes = "#".repeat(level);
    let out = text.replace(/\s+$/, "");
    out += `

${hashes} ${title}

${clean}
`;
    return out;
  }
  const before = lines.slice(0, target.contentStart);
  const after = lines.slice(target.contentEndExclusive);
  const middle = clean ? ["", ...clean.split("\n"), ""] : [""];
  return [...before, ...middle, ...after].join("\n");
}
function appendSection(text, title, body = "", level = 2) {
  const hashes = "#".repeat(level);
  let out = text.replace(/\s+$/, "");
  out += `

${hashes} ${title}
`;
  if (body.trim()) out += `
${body.trim()}
`;
  return out + "\n";
}
function reorderSection(text, fromTitle, toTitle, placeBefore, level = 2) {
  if (fromTitle === toTitle) return text;
  const parsed = parseDay(text, level);
  const n = parsed.sections.length;
  if (n < 2) return text;
  const from = parsed.sections.findIndex((s) => s.title === fromTitle);
  const to = parsed.sections.findIndex((s) => s.title === toTitle);
  if (from < 0 || to < 0) return text;
  const lines = splitLines(text);
  const items = parsed.sections.map((s, i) => ({
    title: s.title,
    lines: lines.slice(s.startLine, i + 1 < n ? parsed.sections[i + 1].startLine : lines.length)
  }));
  const head = lines.slice(0, parsed.sections[0].startLine);
  const [moved] = items.splice(from, 1);
  let idx = items.findIndex((it) => it.title === toTitle);
  if (idx < 0) return text;
  if (!placeBefore) idx += 1;
  items.splice(idx, 0, moved);
  const out = [...head, ...items.flatMap((it) => it.lines)].join("\n");
  return out === text ? text : out;
}
function paragraphsFromSoftBreaks(text) {
  const normalized = text.replace(/\r\n/g, "\n");
  const lines = normalized.split("\n");
  const out = [];
  let inFence = false;
  const isListItem = (s) => /^\s*([-*+]|\d+[.)])\s+\S/.test(s);
  const isStructural = (s) => /^\s*(#{1,6}\s|>|---\s*$|\|)/.test(s);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
      out.push(line);
      continue;
    }
    out.push(line);
    const next = i + 1 < lines.length ? lines[i + 1] : void 0;
    if (inFence || next === void 0) continue;
    if (line.trim() === "" || next.trim() === "") continue;
    if (/ {2}$/.test(line) || /\\$/.test(line)) continue;
    if (isListItem(line) || isListItem(next)) continue;
    if (isStructural(line) || isStructural(next)) continue;
    out.push("");
  }
  return out.join("\n");
}
function plainText(s) {
  return s.replace(/!\[[^\]]*\]\([^)]*\)/g, "").replace(/\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/^#{1,6}\s+/gm, "").replace(/^>\s?/gm, "").replace(/[*_`~]/g, "").replace(/\n{3,}/g, "\n\n").trim();
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  appendSection,
  isTimelineTitle,
  mirrorSections,
  paragraphsFromSoftBreaks,
  parseDay,
  plainText,
  reorderSection,
  replaceSectionBody,
  stripEmptyHeadings
});
