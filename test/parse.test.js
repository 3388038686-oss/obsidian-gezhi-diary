"use strict";

// test/parse.test.ts
var import_fs = require("fs");

// src/sections.ts
function splitLines(text2) {
  return text2.replace(/\r\n/g, "\n").split("\n");
}
function headingOf(line) {
  const m = /^(#{1,6})\s+(.*?)\s*$/.exec(line);
  if (!m) return null;
  return { level: m[1].length, text: m[2] };
}
function trimBlank(lines, from, to) {
  let a = from;
  let b = to;
  while (a < b && lines[a].trim() === "") a++;
  while (b > a && lines[b - 1].trim() === "") b--;
  return lines.slice(a, b).join("\n");
}
function parseDay(text2, level = 2) {
  const lines = splitLines(text2);
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
function replaceSectionBody(text2, title, newBody, level = 2) {
  const lines = splitLines(text2);
  const parsed2 = parseDay(text2, level);
  const target2 = parsed2.sections.find((s) => s.title === title);
  const clean = newBody.replace(/\r\n/g, "\n").replace(/^\n+|\n+$/g, "");
  if (!target2) {
    const hashes = "#".repeat(level);
    let out = text2.replace(/\s+$/, "");
    out += `

${hashes} ${title}

${clean}
`;
    return out;
  }
  const before = lines.slice(0, target2.contentStart);
  const after = lines.slice(target2.contentEndExclusive);
  const middle = clean ? ["", ...clean.split("\n"), ""] : [""];
  return [...before, ...middle, ...after].join("\n");
}
function plainText(s) {
  return s.replace(/!\[[^\]]*\]\([^)]*\)/g, "").replace(/\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/^#{1,6}\s+/gm, "").replace(/^>\s?/gm, "").replace(/[*_`~]/g, "").replace(/\n{3,}/g, "\n\n").trim();
}

// test/parse.test.ts
var path = process.argv[2];
var text = (0, import_fs.readFileSync)(path, "utf8");
var parsed = parseDay(text, 2);
console.log("H1:", parsed.h1);
console.log("QUOTE:", parsed.quote);
console.log("FRONTMATTER_LINES:", parsed.frontmatter.split("\n").length);
console.log("SECTIONS:", parsed.sections.length);
for (const s of parsed.sections) {
  const plain = plainText(s.body);
  console.log(
    `  [${s.title}] line=${s.startLine} bodyChars=${plain.length} head=${JSON.stringify(
      plain.slice(0, 30)
    )}`
  );
}
var target = parsed.sections[1];
if (target) {
  const next = replaceSectionBody(text, target.title, "\u6D4B\u8BD5\u5199\u5165\u5185\u5BB9\n\u7B2C\u4E8C\u884C");
  const reparsed = parseDay(next, 2);
  console.log("ROUNDTRIP_SECTIONS:", reparsed.sections.length);
  console.log(
    "ROUNDTRIP_TARGET:",
    JSON.stringify(plainText(reparsed.sections[1].body))
  );
  console.log(
    "OTHERS_UNCHANGED:",
    parsed.sections.filter((_, i) => i !== 1).every((s, i) => {
      const j = i < 1 ? i : i + 1;
      return reparsed.sections[j] && reparsed.sections[j].title === s.title;
    }) && reparsed.sections.filter((_, i) => i !== 1).every((s, i) => {
      const j = i < 1 ? i : i + 1;
      return s.body === parsed.sections[j].body;
    })
  );
  const restored = replaceSectionBody(next, target.title, target.body);
  console.log("RESTORE_IDENTICAL:", restored.replace(/\s+$/, "") === text.replace(/\s+$/, ""));
}
