const { DayStore } = require("./store.cjs");
const { TFile } = require("./obsidian-stub.cjs");

function makeStore(initial) {
  const file = new TFile();
  file.path = "日记/2026-10-20.md";
  file.content = initial;
  const app = {
    vault: {
      getAbstractFileByPath: () => file,
      process: async (_f, fn) => {
        file.content = fn(file.content);
      },
    },
  };
  return { store: new DayStore(app, () => "日记"), file };
}

(async () => {
  // 1) 已有宽度 → 覆盖
  let { store, file } = makeStore("正文\n\n![[a.png|400]]\n");
  let ok = await store.setImageWidth("2026-10-20", "a.png", 420);
  console.log("resize existing:", ok, JSON.stringify(file.content));

  // 2) 无宽度 → 补上
  ({ store, file } = makeStore("![[b.jpg]]"));
  ok = await store.setImageWidth("2026-10-20", "b.jpg", 260);
  console.log("add width:", ok, JSON.stringify(file.content));

  // 3) 带子目录
  ({ store, file } = makeStore("![[attachments/c.png|300]]"));
  ok = await store.setImageWidth("2026-10-20", "c.png", 180);
  console.log("subdir:", ok, JSON.stringify(file.content));

  // 4) 不存在 → false，不改
  ({ store, file } = makeStore("没有图片"));
  ok = await store.setImageWidth("2026-10-20", "z.png", 100);
  console.log("missing:", ok, JSON.stringify(file.content));
})();
