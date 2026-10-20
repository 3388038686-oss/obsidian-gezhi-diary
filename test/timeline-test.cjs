const { DayStore } = require("./store.cjs");

const text = `---
date: 2026-10-20
---
# 2026-10-20

## 今日事件
正常一格，含图片：![[a.png]]

## 14:30 分笔记
随手记一条。

## 今日书账
书账内容

## 9:05 图片
![[b.jpg]]
`;

const store = new DayStore({}, () => "日记");
const snap = store.buildSnapshot("2026-10-20", null, text);
console.log("cells:", snap.cells.map((c) => c.title));
console.log("timeline:", snap.timeline.map((c) => `${c.time} | ${c.title}`));
console.log("checks:", {
  cellsExcludeTimeline: !snap.cells.some((c) => /^\d{1,2}[:：]\d{2}/.test(c.title)),
  timelineCount: snap.timeline.length === 2,
  timesParsed: snap.timeline[0].time === "14:30" && snap.timeline[1].time === "9:05",
  bodyKept: snap.timeline[1].body.includes("![[b.jpg]]"),
  imageMakesContent: snap.cells.find((c) => c.title === "今日事件").hasContent,
});
