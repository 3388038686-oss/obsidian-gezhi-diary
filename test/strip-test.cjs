const { stripEmptyHeadings } = require("./sections.cjs");

const md = `### 今日事件

### 今日书账
买了一本书。

### 今日新知

#### 子标题也没内容

### 今日反思
想清楚了一件事。
`;

const out = stripEmptyHeadings(md);
console.log(JSON.stringify(out, null, 0));
console.log("checks:", {
  keepBook: out.includes("今日书账"),
  keepBookBody: out.includes("买了一本书"),
  keepReflect: out.includes("今日反思"),
  dropEvent: !out.includes("今日事件"),
  dropNew: !out.includes("今日新知"),
  dropSub: !out.includes("子标题也没内容"),
});

const plain = "就是一段普通文字\n第二行";
console.log("plain untouched:", stripEmptyHeadings(plain) === plain);

const mixed = "段首文字\n\n### 空的\n\n### 有内容\n正文";
console.log("mixed:", JSON.stringify(stripEmptyHeadings(mixed)));
