# 工程规范与统一命令（T02）

## 1. 一键命令

所有命令在仓库根目录执行，Windows / Linux / macOS 行为一致，任一检查失败立即返回
非零退出码（可用于 CI 任务入口）。

| 命令                       | 作用                                                             |
| -------------------------- | ---------------------------------------------------------------- |
| `npm run verify`           | 依次执行全部检查                                                 |
| `npm run verify:quality`   | 变更文件的格式（Prettier）与 Lint（ESLint）棘轮                  |
| `npm run verify:typecheck` | 前端 TypeScript 类型检查（`tsc --noEmit`）                       |
| `npm run verify:backend`   | 后端 JUnit + Checkstyle                                          |
| `npm run verify:tracking`  | Node 追踪服务全部测试                                            |
| `npm run verify:packing`   | 装箱算法回归脚本                                                 |
| `npm run verify:frontend`  | i18n 扫描 + Vite 生产构建                                        |
| `npm run format`           | 用 Prettier 格式化（仅建议对本次改动文件执行）                   |
| `npm run lint`             | 对整仓库运行 ESLint（历史文件会有噪声，日常用 `verify:quality`） |

也可以按名称选择性执行：`node scripts/verify.mjs quality typecheck backend`。

## 2. 依赖准备

```sh
npm install --include=dev                 # 根目录：prettier / eslint（CI 用 npm ci --include=dev）
npm --prefix frontend install --include=dev --ignore-scripts   # 前端构建 + 类型检查
npm --prefix tracking-service install
```

> 说明：本机 npm 配置了 `omit=dev`。因此需要在命令里显式加 `--include=dev` 才会
> 安装 `typescript`、`@types/three` 等开发依赖（类型检查必需）。
> `frontend` 的构建工具（vite、@vitejs/plugin-vue）位于 dependencies，生产安装即可构建。

## 3. 质量门策略：棘轮而不是一次性重排

历史仓库存在 5000～11000 行的巨型 Service / 页面文件，直接对全仓库启用格式化与
Lint 会产生数万条无关报错，也会把重构差异淹没。因此采用**棘轮**：

- `scripts/quality.mjs` 只检查**相对基线发生变更的源码文件**。
  - 基线优先取 `QUALITY_BASE_REF` 环境变量，其次 `origin/main`；
  - 同时包含工作区未提交与未跟踪文件。
  - 若取不到基线（例如没有 `.git`），退回 `FALLBACK_TARGETS` 目录清单
    （`scripts/`、`frontend/src/visualization`）。
- 新拆分出来的模块一旦提交，就会自动进入质量门；历史文件只有在被本次改动触及
  时才需要满足规范。
- 同一策略用于 Java：`backend/config/checkstyle/checkstyle.xml` +
  `backend/pom.xml` 的 `<includes>` 只覆盖新包（当前为 `customer/dto`、
  `customer/persistence`、`CustomerDirectoryService`、`CustomerDirectoryScope`）。
  每完成一批拆分，就把新类加入 `<includes>`。Checkstyle 绑定在 `validate` 阶段，
  所以 `mvn test` 和 CI 都会执行。

### 规则范围

| 工具                  | 覆盖                                                     | 关键规则                                                                                       |
| --------------------- | -------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Prettier              | `.js .mjs .cjs .ts .vue .json .yml .yaml .css .scss .md` | 统一缩进 2 空格、双引号、分号、LF、行宽 100                                                    |
| ESLint（flat config） | `.js .mjs .cjs`                                          | `@eslint/js` recommended；`no-unused-vars` 允许 `_` 前缀；`no-empty` 允许空 catch              |
| `tsc --noEmit`        | `frontend/src/**/*.ts`                                   | `strict: true`；JS 文件 `allowJs` 但不做 `checkJs`（逐步收紧）                                 |
| Checkstyle            | 新 Java 包                                               | 无 Tab、无行尾空白、文件以 LF 结尾、禁止星号导入、无未使用/冗余 import、`equals/hashCode` 成对 |

前后端编辑约定见根目录 `.editorconfig` 与 `.gitattributes`：源码 UTF-8 / LF，
Windows 脚本（`*.ps1 *.cmd *.bat`）CRLF。本次**未**对历史源码做整仓库换行归一化。

少数已经很大、且计划在后续批次重写的遗留文件（追踪回归测试、装箱可视化 TS）
暂列在 `.prettierignore`，避免本批混入大面积格式差异；它们在对应重构批次会随
拆分一并格式化，期间仍受 ESLint / `tsc` 约束。

## 4. 本批附带修复

- `frontend/src/visualization/packingSceneBalance.ts`：`hot` 数组推断为四个角标
  联合类型，却会 push `front/rear/left/right`，类型检查暴露该问题；改为
  `string[]`。属于真实类型缺陷修复，不改变运行结果。
- 新增 `frontend/tsconfig.json` 与 `frontend` 的 `typecheck` 脚本。
- `tracking-service/test/cosco-resilience-regression.test.mjs`：正则中的连续空格
  改为 `{2}`，语义等价。

## 5. 批次验证记录（2026-10-06）

| 检查                                  | 结果                                                            |
| ------------------------------------- | --------------------------------------------------------------- |
| `node scripts/quality.mjs`            | `changed-vs-base` 模式，16 个格式化文件、4 个 Lint 文件全部通过 |
| `npm --prefix frontend run typecheck` | 通过（含上述类型缺陷修复）                                      |
| `mvn -q checkstyle:check`（backend）  | 通过，覆盖新包                                                  |
| `mvn -q validate`                     | 通过（Checkstyle 绑定生效）                                     |
