const { renderTemplate, hasSections } = require("./tpl.cjs");

const tpl = `---
date: <% tp.date.now("YYYY-MM-DD") %>
tags: [日记]
---
# <% tp.date.now("YYYY-MM-DD") %>

## 今日事件
<% tp.date.now("YYYY-MM-DD") %> 的日记。

## 今日书账
{{date}} / {{date:YYYY年MM月DD日}} / {{title}}
昨天：<% tp.date.yesterday("YYYY-MM-DD") %>
明天：<% tp.date.tomorrow("YYYY-MM-DD") %>
标题：<% tp.file.title %>
`;

const out = renderTemplate(tpl, "2026-10-20");
console.log(out);
console.log("--- checks ---");
console.log("no leftover tp:", !/<%/.test(out));
console.log("no leftover braces:", !/\{\{/.test(out));
console.log("has sections:", hasSections(out));
console.log("yesterday ok:", out.includes("2026-10-19"));
console.log("tomorrow ok:", out.includes("2026-10-21"));
console.log("cn date ok:", out.includes("2026年10月20日"));
console.log("title ok:", out.split("\n").filter((l) => l.startsWith("标题："))[0]);
