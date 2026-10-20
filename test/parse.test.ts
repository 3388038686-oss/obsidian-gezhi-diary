/* 临时验证脚本：用真实日记文件跑解析与写回 */
import { readFileSync } from "fs";
import { parseDay, plainText, replaceSectionBody } from "../src/sections";

const path = process.argv[2];
const text = readFileSync(path, "utf8");

const parsed = parseDay(text, 2);
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
// 写回测试：改第二节内容，再解析确认其他节未受影响
const target = parsed.sections[1];
if (target) {
  const next = replaceSectionBody(text, target.title, "测试写入内容\n第二行");
  const reparsed = parseDay(next, 2);
  console.log("ROUNDTRIP_SECTIONS:", reparsed.sections.length);
  console.log(
    "ROUNDTRIP_TARGET:",
    JSON.stringify(plainText(reparsed.sections[1].body))
  );
  console.log(
    "OTHERS_UNCHANGED:",
    parsed.sections
      .filter((_, i) => i !== 1)
      .every((s, i) => {
        const j = i < 1 ? i : i + 1;
        return reparsed.sections[j] && reparsed.sections[j].title === s.title;
      }) &&
      reparsed.sections.filter((_, i) => i !== 1).every((s, i) => {
        const j = i < 1 ? i : i + 1;
        return s.body === parsed.sections[j].body;
      })
  );
  // 还原测试
  const restored = replaceSectionBody(next, target.title, target.body);
  console.log("RESTORE_IDENTICAL:", restored.replace(/\s+$/,"") === text.replace(/\s+$/,""));
}
