const fs = require("fs"), path = require("path");
const dir = path.join(__dirname, "src");
for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".ts"))) {
  const c = fs.readFileSync(path.join(dir, f), "utf8");
  const lines = c.split("\n");
  const hits = [];
  lines.forEach((l, i) => {
    const t = l.trim();
    if (t.startsWith("//") || t.startsWith("*")) return;
    if (/[\u4e00-\u9fff]/.test(l)) hits.push(i + 1);
  });
  console.log(f, "cn-lines:", hits.length, hits.length ? "-> " + hits.join(",") : "");
}
