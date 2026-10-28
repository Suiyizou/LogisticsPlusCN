# logisticspluscn 方案 A 前端重构

本轮实施以 `design-concepts/2026-10-28-maritime/a.html`、`a.css`、`a.js` 和对应截图为视觉依据。公司品牌为上海罗加国际货物运输代理有限公司，产品标识为 logisticspluscn。

## 设计方向

深海蓝 `#15384a` 用于品牌及业务操作，陶土橙 `#ba4b25` 用于主要行动，页面背景为 `#f2f5f6`。采用 2–4 px 方正圆角、细线分隔和实景港口构图；取消发光、玻璃面板、装饰网格和首次访问强制片头。等待状态对应真实异步操作，不用计时器模拟认证或业务进度。

公开首页的港口影像是生成的氛围示意图，不代表公司的设施、团队或实拍资产；页面标注其用途。官网只呈现现有货物追踪、装箱规划和业务协作能力，不宣称尚未实现的海空业务功能或虚构公司统计。

## 唯一设计 tokens

唯一源文件为 `design-system/logisticspluscn-maritime/tokens.css`。它同时定义 `--color-*`、`--app-*`、`--el-*` 以及追踪工作台的旧语义别名。修改源文件后，在仓库根目录运行：

```sh
node frontend/scripts/sync-brand-tokens.mjs
node frontend/scripts/sync-brand-tokens.mjs --check
npm --prefix frontend run test:design-system
```

同步脚本生成 `frontend/src/brand-tokens.css` 和 `tracking-service/public/brand-tokens.css`。不要手动修改产物。双端 `design-system.css` 首行导入各自的生成文件；设计检查同时验证源与产物一致性、键盘焦点及减少动态效果支持。tokens 使用 `html:root`，避免延迟加载的组件库 `:root` 默认色覆盖品牌。实底主按钮的正常与悬停状态统一由 `design-system.css` 定义。图表通过 CSS 变量消费主题，避免另建品牌颜色常量。

## 页面与模块

- `PublicLandingPage.vue` 负责公开首页组合，并直接依赖 `maritime-public.css`，使轻量入口和旧 `/#/` 兼容入口获得一致官网样式。其展示部分拆为 `PublicSiteHeader`、`PublicTrackingDock`、`PublicToolsSection`。
- `BrandLockup.vue` 是公共、工作台和管理界面的共享品牌组件，支持 compact、inverse、company 与 href。
- `LoginPage.vue` 保留真实员工/客户登录、会话和错误处理，采用港口影像与表单双栏。认证样式集中于 `login.css`，旧公共样式文件中的登录样式已移除。
- `SystemWaitOverlay`、`AsyncPageError` 和 `GlobalApiErrorNotice` 使用统一状态语言，保留实际错误和重试能力。
- 规划、业务、客户和管理页面保留原有模块边界及实际服务调用；拆分的导航和展示组件消费原状态与操作。
- 公开追踪工作台继续使用现有 DOM 前端，保持查询、历史、附件、批量处理及权限边界；不改后端协议。

首页查询显式选择船司和单号类型，传递既有 `carrier`、`type`、`channel=AUTO`、`number` 及 `#tracking` 深链。COSCO/CMA 仅提供订舱号和箱号，其他现有船司按其既有支持提供提单号；不宣称自动识别船司。原有 URL、内部 storage key 与会话协议保持兼容。

新文案使用中英双语 `maritime.*` 命名空间，品牌统一替换不涉及内部存储键。旧公司未使用的登记及服务介绍已从官网文案中清理。

## 备份与代码分支

实施前已完整备份，并推送 Gitee 分支 `备份`，对应提交：

```text
0f7496c736e6a9d6aaf3c9aca5130340277ae73e
```

本轮代码工作分支为 `codex/logisticspluscn-ui-a`。备份分支用于回溯原工作区，不以本轮界面改造覆盖备份。

## 验证范围与边界

截至本记录，主代理确认：原 635 项前端测试、242 项追踪测试、337 项后端测试、24 项模块检查、13 项发布检查和全部 packing 检查通过；真实 Java/MySQL 隔离环境的 8 项 API E2E 通过。补入下述 3 项官网样式回归测试后，前端 638/638 通过。前端 typecheck、生产构建、i18n 扫描、设计 tokens 检查及相关格式检查已执行；最终整合结果以主代理验收记录为准。

本轮另补公开首页样式依赖回归测试，覆盖独立入口、App 动态兼容入口及移除样式依赖的失败检测。这些检查验证组件依赖能够到达官网布局样式。浏览器初始化及切换语言时使用 logisticspluscn 作为基础页面标题，各工作区仍可设置具体业务标题；装箱业务名称及 Electron 包名称保持原值。

主代理已完成 1440 px 桌面及 375 px 手机尺寸的官网、登录、业务和追踪页面验收，未见横向溢出；员工与客户使用真实测试账号登录、退出通过。客户账号仅显示其绑定的 1 条票单，且没有管理后台导航。官网、登录及主按钮修复已通过浏览器复验。装箱规划页已使用 50 件货物、5 类箱型完成真实计算，进度到达 100%；三维画布正常，导出操作已启用。

API E2E 不代表真实船司在线通道或生产部署验收。构建中的既有第三方 PURE 注释提示不影响构建通过。既有 `docs/MULTI_CARRIER_TRACKING.md` 及 `output/carrier-tracking*` 属于此前多船司工作，不计入本轮界面改造产物。

`design-concepts/2026-10-28-maritime/README.md` 中的类型错误及未执行测试记录属于设计提案阶段的历史快照，不应作为当前分支状态；本轮保留原设计历史，并通过本记录说明后续实施及验证。
