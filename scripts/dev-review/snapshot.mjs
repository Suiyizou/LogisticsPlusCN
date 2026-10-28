import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createCatalog, root } from "./catalog.mjs";
const catalog = await createCatalog();
const lines = [
  "# 本地逐页检查清单",
  "",
  "本清单来自真实模块注册和源码盘点。检查入口：http://127.0.0.1:51224。默认业务环境18088，可切换51221对照。",
  "",
  "这是待验收清单，不表示所有界面已验收。打开页面不改变认证、角色或业务状态；需要记录的详情通过本地真实ID或列表进入。",
  "",
  "生成命令：`node scripts/dev-review/snapshot.mjs`。使用方式见 [review hub](../scripts/dev-review/README.md)。",
  "",
  `共${catalog.items.length}个检查记录，包含现行入口、兼容链接、状态与休眠说明。Astra矩阵的45主视图、D01–D35条件组和本清单卡片不是同一计数，不能按数量宣称已验收。每项人工分别记录可达、非空正常态、子视图、详情/弹窗、角色、桌面、窄屏及证据。`,
  "",
  "最终追踪入口修准：旧批量dialog、旧document drawer/editor休眠；真正批量追踪在Vue `/customers/shipments`。tracking的`#shipments`及批量更新仅适用于CUSTOMER会话且partyRole=OVERSEA_AGENT，不等于内部OVERSEA_AGENT员工。RelatedFilesDrawer从真实结果“票单文件”打开。附件只有历史元数据、原文件缺失时标缺文件。",
  ""
];
for (const [key, name] of Object.entries(catalog.groups)) {
  const items = catalog.items.filter((item) => item.group === key);
  lines.push(
    "## " + name + "（" + items.length + "项）",
    "",
    "| ID / 页面 | 矩阵 / 入口状态 / 角色 | 入口 | 操作位置与条件 |",
    "| --- | --- | --- | --- |"
  );
  for (const item of items)
    lines.push(
      `| ${item.id} · ${item.name} | ${item.matrix.map((row) => row.id).join(", ")} / ${item.availability} / ${item.roles.join(", ")} | ${item.availability === "dormant" ? "休眠，无可达链接" : "`" + item.path + "`"} | ${item.steps.replaceAll("|", " / ")} ${item.prerequisite ? "条件：" + item.prerequisite : ""} |`
    );
  lines.push("");
}
lines.push(
  "## Astra矩阵映射与条件",
  "",
  "来自 [整页检查计划](UI_FULL_PAGE_REVIEW_PLAN.md)。D28按最终根任务决策修准，不将休眠弹窗当可达入口。",
  "",
  "| 矩阵ID | 对应检查记录 | 验收条件 |",
  "| --- | --- | --- |"
);
for (const row of catalog.matrix.rows)
  lines.push(
    `| ${row.id} | ${row.itemIds.join(", ")} | ${row.requirement.replaceAll("|", " / ")} |`
  );
lines.push("");
lines.push(
  "当前禁用模块：" +
    catalog.disabledModules.map((module) => "`" + module.id + "`").join("、") +
    "。",
  "",
  "整页UI设计参照独立读取 output/ui-full-design-20261028；不会将设计图片作为业务页面。",
  ""
);
await writeFile(resolve(root, "docs/UI_PAGE_REVIEW_INVENTORY.md"), lines.join("\n"), "utf8");
process.stdout.write(`Review snapshot written: ${catalog.items.length} entries.\n`);
