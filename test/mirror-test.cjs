const { mirrorSections, stripEmptyHeadings } = require("./sections.cjs");

const tplNote = `### 今日事件

### 今日书账

### 今日反思
`;
const cells = {
  今日事件: "今天开了会。",
  今日书账: "",
  今日反思: "想通了。",
};

const mirrored = mirrorSections(tplNote, cells);
console.log(JSON.stringify(mirrored));
const final = stripEmptyHeadings(mirrored);
console.log("final:", JSON.stringify(final));
console.log("checks:", {
  eventLive: final.includes("今天开了会。"),
  emptyBookDropped: !final.includes("今日书账"),
  reflectKept: final.includes("想通了。"),
});
