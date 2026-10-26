# 工程规范与统一命令（T02）

## 1. 一键命令

所有命令在仓库根目录执行，Windows / Linux / macOS 行为一致，任一检查失败立即返回
非零退出码（可用于 CI 任务入口）。

| 命令                       | 作用                                                               |
| -------------------------- | ------------------------------------------------------------------ |
| `npm run verify`           | 依次执行全部检查                                                   |
| `npm run verify:quality`   | 变更文件的格式（Prettier）与 Lint（ESLint）棘轮                    |
| `npm run verify:typecheck` | 前端 TypeScript 与 modules 严格 Vue 模板检查，以及真实页面负向回归 |
| `npm run verify:backend`   | 后端 JUnit + Checkstyle                                            |
| `npm run verify:customers` | 前端功能模块（详情、图表、批量任务、导航、Vue 脚本绑定）回归测试   |
| `npm run verify:release`   | 实际 Bash 发布脚本、校验和与归档恢复流程测试                       |
| `npm run verify:tracking`  | Node 追踪服务全部测试                                              |
| `npm run verify:packing`   | 装箱算法回归脚本                                                   |
| `npm run verify:frontend`  | i18n 扫描 + Vite 生产构建                                          |
| `npm run format`           | 用 Prettier 格式化（仅建议对本次改动文件执行）                     |
| `npm run lint`             | 对整仓库运行 ESLint（历史文件会有噪声，日常用 `verify:quality`）   |

也可以按名称选择性执行：`node scripts/verify.mjs quality typecheck backend`。

## 2. 依赖准备

```sh
npm install --include=dev                 # 根目录：prettier / eslint（CI 用 npm ci --include=dev）
npm --prefix frontend install --include=dev --ignore-scripts   # 前端构建 + 类型检查
npm --prefix tracking-service install
```

发布脚本测试需要 Bash 和 tar：Linux/macOS 使用系统 Bash；Windows 使用 Git Bash，
自定义安装路径可通过 `BASH_PATH` 指定。这组测试在独立临时目录中运行，替换 Docker、
Git 和 HTTP 命令，不连接真实容器或服务器；校验和与文件归档恢复使用实际命令。

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
| `vue-tsc --noEmit`    | `frontend/src/modules/**/*.vue`                          | `strictTemplates: true`；25 个模块组件采用 TS setup，检查具体状态类型、动作与组件 props        |
| Checkstyle            | 新 Java 包                                               | 无 Tab、无行尾空白、文件以 LF 结尾、禁止星号导入、无未使用/冗余 import、`equals/hashCode` 成对 |

前后端编辑约定见根目录 `.editorconfig` 与 `.gitattributes`：源码 UTF-8 / LF，
Windows 脚本（`*.ps1 *.cmd *.bat`）CRLF。本次**未**对历史源码做整仓库换行归一化。

少数已经很大、且计划在后续批次重写的遗留文件（装箱可视化 TS）
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

## 6. 当前检查的边界（避免误解）

- 默认 `typecheck` 运行现有 TS 范围、`typecheck:sfc` 和 `typecheck:ports`。锁定的 vue-tsc 3.3.13 检查 `src/modules` 全部 25 个 SFC，以及建单/导入/个人资料/图表和管理员的 20 个 feature SFC；复制真实组件验证状态、动作、表格插槽字段、事件及 props 的错误必须失败。页面工厂及管理员 Console/BusinessLists 本体用 `@ts-check` 检查显式端口，真实生产 workflow/展示接口接线可编译，94 项端口/注册误用负向探针分别报错，不以另写测试接口代替生产工厂。
- 现有 67 个 SFC 中另 22 个历史组件尚未纳入严格模板范围，其中 17 个使用 JS、5 个已使用 TS，尚未完成严格模板迁移；部分历史 workflow 内部动作和服务响应尚未全面类型化。AdminDashboard 保留服务注入与组件组装职责，其叶子页面独立严格检查。JS/MJS/CJS 沿用 ESLint，变更 Vue JS SFC 仍经 `vue-script-lint.mjs` 编译检查 `no-undef` 和 setup 模板未声明绑定。不能把一次 typecheck 通过等同于全项目完全类型安全。
- 质量门是变更棘轮，历史大文件只有在被本次改动触及时才需要满足规范。
- Java Checkstyle 只覆盖 `backend/pom.xml` 中 `<includes>` 列出的新包，历史包逐步纳入。

Vue 脚本检查使用前端已安装的 `vue/compiler-sfc`，运行质量门前需要安装根目录和前端
依赖（CI 已按此顺序执行）。编译诊断的行号属于生成脚本或模板；TS/外部脚本会明确报告
跳过；modules 的 TS SFC 由独立 vue-tsc 覆盖，其他跳过项仍需另行迁移。7 项质量门回归随 `verify:customers` 执行，真实模板类型负向回归随 `verify:typecheck` 执行。本地与 CI 共用默认命令，不需要另写一套流水线脚本。

追踪服务已拆分 HTTP、runtime、COSCO endpoint/session、单通道执行、授权回退与补充详情工作流；共用原 upstream、gate、代理池和出口 Cookie 状态，runtime 保留配置、监控和关闭。前端新增 features 模块；入口与验证说明见 [FRAMEWORK_REFACTOR.md](FRAMEWORK_REFACTOR.md)。

模块注册、入口位置调整及新页面接入见 [MODULE_GUIDE.md](MODULE_GUIDE.md)。业务容器提供只读会话上下文，新增页面不再扩展旧模板的条件分支。
