# 技术架构评估与 UI 落地建议

评估日期：2026-10-28。本文针对本地工作区当前状态；没有执行线上发布，也没有修改业务源码。

## 品牌更正

用户已明确本次新设计面向 **上海罗加国际货物运输代理有限公司 / logisticspluscn**。审计时本地代码和用户最初提供的现有网址仍使用 Drewes 标识，这是审计记录中的原状，不是新设计的品牌归属。

新原型的公司名称和品牌标识以用户这次更正为准。本文未验证该公司的成立时间、资质、网点、业务规模、客户或合作关系，不对这些信息作任何断言；正式页面中的相关内容需要另行核实。

## 结论

**项目已经有较规范、可扩展的工程骨架，适合继续在当前技术栈上优化 UI；但仍属于渐进重构，不能说全项目已经彻底规范化。**

Vue、Spring Boot 和独立 Node 追踪服务的组合符合现有业务，不需要为了视觉升级再换框架。当前最值得投入的是统一界面规范、拆分巨型页面、扩大类型覆盖，以及修复已经被检查发现的接口接线问题。

## 评估范围

- 实际根目录：`C:\Users\ASUS\Documents\ChatGPT\daily\projects\thirty-party-shippment-tracking`。用户描述中带“（重构版本）”后缀的目录不存在；本目录的 README、模块注册与重构文档均对应所述统一业务平台。
- 当前分支：`codex/staging-ci-20261026`。
- 工作区存在未提交的多船司改动。本评估保留这些改动，仅检查代码与执行有限验证。
- `D:\AI\harborline-console` 是另一份 Vue 3 + Mock 领域服务项目，未将它的能力计入本项目。
- 下文证据路径均相对本项目根目录。行号是评估当时的位置，后续编辑可能变化。
- 本文是架构与 UI 改造准备评估，不等同于完整安全审计、性能压测或生产验收。

## 技术栈

版本来自当前清单中的声明，不代表全部锁定依赖的精确安装版本，也不构成对最新版本或生命周期的判断。

| 层次 | 当前技术 | 判断及证据 |
| --- | --- | --- |
| 主前端 | Vue 3.5、Vite 5.4、Vue Router、Element Plus、vue-i18n | 具备成熟的组件化和路由能力；`frontend/package.json:35` |
| 可视化与计算 | Three.js、ECharts、WebWorker | 适合现有装箱和数据展示；`frontend/package.json:38`、`frontend/src/workers/packingWorker.js:1` |
| 类型 | TypeScript、vue-tsc、OpenAPI 类型生成 | 已进入实际组件和 API 接线，但不是全量覆盖；`frontend/tsconfig.json:11`、`frontend/tsconfig.vue.json:3` |
| 主后端 | Java 17、Spring Boot 3.5.0 | 适合账号、权限、客户与票单业务；`backend/pom.xml:9`、`backend/pom.xml:20` |
| 数据访问 | MyBatis Plus 3.5.12 与 JdbcTemplate 并存 | 新模块逐步分层，遗留 SQL 仍待迁移；`backend/pom.xml:21`、`backend/src/main/java/com/cargoplanner/backend/shipment/ShipmentTrackingService.java:39` |
| 数据库版本 | MySQL、Flyway | 当前配置以 Flyway 为 DDL 所有者，关闭自动 baseline；`backend/src/main/resources/application.yml:26` |
| 船司追踪 | Node.js 20+、Playwright、HTTP 客户端及适配器 | 与账号业务分服务，已形成扩展协议；`tracking-service/package.json:13`、`tracking-service/lib/carrier-adapter-registry.mjs:3` |
| 公开追踪界面 | 独立 HTML/CSS/JavaScript | 与 Vue 前端并存，是统一视觉时必须纳入的另一套入口；`tracking-service/public/index.html:1`、`tracking-service/public/app.js:1` |
| 部署及质量 | Docker Compose、Nginx、Gitee CI、ESLint、Prettier、JUnit、Node 测试 | 工程入口已具备；配置存在不等于远端已通过；`scripts/verify.mjs:7`、`.workflow/ci.yml:35` |
| 可选桌面端 | Electron | 存在 Windows 打包配置；本轮没有验证桌面包；`frontend/package.json:48` |

## 已形成的扩展基础

### 1. 模块和路由有统一入口

`frontend/src/modules/registry.js:14` 将业务、管理员、客户及生成模块汇总到同一注册协议。`frontend/src/modules/routes.js:4` 根据模块描述创建路由，并检查重复路由名。`registry.js:58` 起集中处理角色访问与登录后的授权深链。

这意味着新增业务模块可以沿现有注册协议扩展，不需要把所有菜单和跳转继续堆进页面组件。前端路由权限仍应与后端权限校验共同维护。

### 2. API 类型和身份处理已经落地

`frontend/src/services/contractClient.ts:26` 使用 OpenAPI 生成类型创建客户端，并区分员工和客户身份；`contractClient.ts:43` 统一处理响应与错误。根目录 `package.json:21` 提供模块生成、API 生成和一致性检查命令。

这不是单纯目录调整：已有机制约束新增模块的契约、持久化边界和生成文件所有权。

### 3. 船司适配器存在稳定协议

`tracking-service/lib/carrier-adapter-registry.mjs:3` 校验适配器编号、能力和 `prepare/track` 方法，并管理 `health/dispose`。`tracking-service/server.mjs:46` 起承担服务组装，静态资源、控制器和运行时职责已拆开。

新增船司具备明确接入点；但真实船司会话、限流、响应变化和失败恢复仍需独立测试，不能用协议存在推断全部船司已稳定可用。

### 4. 数据库和工程流程比原始原型更完整

`backend/src/main/resources/application.yml:26` 明确 Flyway 管理迁移，`baseline-on-migrate: false`，`validate-on-migrate: true`。`.workflow/ci.yml:35` 起配置了类型检查、测试、构建、MySQL 迁移和镜像任务。

历史 `docs/ACCEPTANCE.md` 和早期重构记录仍描述旧版自动 baseline、SchemaInitializer 等状态。判断当前实现时应以当前代码和最新验证为准，后续宜统一更新文档。

## 尚未完成的部分

| 优先级 | 问题 | 影响与建议 |
| --- | --- | --- |
| 立即处理 | 当前前端类型检查失败 | `frontend/src/modules/shipments/pages/ShipmentListWorkspacePage.vue:492` 解构 `batchTrackReferenceType`，但对应 workflow 返回类型未包含该字段。核对真实状态、端口类型和页面接线后修复，再开始大批 UI 修改。 |
| 本轮 UI 同步处理 | 巨型页面与两套前端 | 本次计数：`App.vue` 4,100 行、`PublicLandingPage.vue` 2,736 行、`tracking-service/public/app.js` 9,491 行。应先拆页面外壳和视觉组件，避免用新的全局覆盖继续叠加旧样式。 |
| 持续处理 | 类型与规范是渐进覆盖 | `frontend/tsconfig.json:11` 为 `checkJs: false`；严格 Vue 检查仅包括列出的组件；Java Checkstyle 只覆盖指定包。新增和改造模块应纳入严格检查。 |
| 后续架构迭代 | 后端仍有大 Service | `ShipmentTrackingService.java` 3,594 行、`TextRecognitionService.java` 3,765 行。继续按查询、写入、权限、外部调用和转换职责拆分，不必阻塞视觉设计。 |
| 上线前确认 | 远端、性能及真实链路 | 本次没有验证远端 CI、Docker 全栈、生产数据库、真实船司或线上账号流程。上线前需要在隔离测试环境按关键流程验收。 |

文件行数只是识别维护热点的信号，不是单独判定代码质量的依据。这里的问题在于单文件同时承担多个职责，UI 修改容易波及状态、权限或业务操作。

## 本次验证结果

| 检查 | 结果 | 边界 |
| --- | --- | --- |
| `node scripts/verify-module-platform.mjs` | **24/24 通过** | 包括生成一致性、模块注册、契约、迁移保护与边界相关测试。 |
| `node scripts/generate-api-contracts.mjs --check` | **通过**，`changes: []` | 当前生成文件与契约一致，不代表所有历史 API 已全面类型化。 |
| `npm run typecheck`，在 `frontend` 运行 | **失败** | TS2339，`ShipmentListWorkspacePage.vue:492`，缺少 `batchTrackReferenceType` 类型成员。后续类型检查步骤未全部执行。 |
| 后端全量测试、全部追踪测试、装箱回归、生产构建 | **本次未执行** | 历史文档中的通过记录不作为本次通过结果。 |
| Docker、真实 MySQL 迁移、远端 CI、线上/真实船司 | **本次未执行** | 不据此宣称部署或实际追踪链路已验收。 |

## 当前页面与路由

依据 `README.md:34`、`frontend/src/modules/routes.js:88` 起的路由组装及模块定义整理。下表是设计覆盖范围，不要求本次重新设计全部页面。

| 用户表面 | 入口 | 主要内容 |
| --- | --- | --- |
| 企业官网 | `/` | 品牌、服务、数字工具入口、联系与信任信息 |
| 公开货物追踪 | `/tracking/` | 按船司和参考号查询、追踪结果；独立 Node 静态界面 |
| 员工工作台入口 | `/workbenches` | 按角色进入业务与装箱工作台 |
| 装箱配置 | `/planner/config` | 箱型和计算参数 |
| 货物录入 | `/planner/cargos` | 货物表格、Excel 导入与校验 |
| 装箱结果 | `/planner/results` | 3D 结果、利用率、剩余空间、导出 |
| 工具说明 | `/containers`、`/algorithm` | 箱型信息、算法说明 |
| 业务工作台 | `/customers` 及注册的子页面 | 总览、客户、票单、代理、客户交接；管理员/业务员/海外代理按权限访问 |
| 客户空间 | `/customer-workspace` | 客户授权范围内的票单与资料 |
| 管理员后台 | `/admin` 及注册子页面 | 总览、审计、员工、客户、交接、票单、设备、文件、公告、系统设置 |
| 登录与转场 | 登录组件及路由门禁 | 登录、错误、身份跳转、会话失效和等待状态；不是所有状态都有独立 URL |

现有相关组件：

- `frontend/src/components/PublicLandingPage.vue`
- `frontend/src/components/WorkbenchPortal.vue`
- `frontend/src/components/LoginPage.vue`
- `frontend/src/features/admin/AdminLoginPage.vue`
- `frontend/src/components/SystemWaitOverlay.vue`
- `frontend/src/modules/admin/definitions.js`

## 为什么当前界面容易显得模板化

这是设计判断，代码证据可以解释其来源：`PublicLandingPage.vue:861` 起叠加深蓝渐变、技术网格、玻璃模糊、光晕和多种圆角；`SystemWaitOverlay.vue:43` 起再次使用蓝色径向光和模糊。首页另有首次进入的 intro 状态及翻页效果，见 `PublicLandingPage.vue:521` 起。

这些元素单独使用未必有问题，但集中出现会抢走企业服务和业务信息的注意力。建议用实景摄影、稳定栅格、清晰字号、少量企业色、直接查询入口和密度合理的数据表建立识别度。页面不应通过虚构客户规模、网点数量、准点率或实时状态制造可信感。

## 渐进 UI 落地顺序

### 第 0 步：恢复检查基线

先修复 `batchTrackReferenceType` 的状态/端口/页面接线，并重新运行类型检查。记录用户现有未提交业务修改，避免把多船司功能与视觉改版混成无法审查的一次变更。

### 第 1 步：公共 tokens 与页面 shell

- 建立统一 CSS 变量：品牌色、文本色、背景、边框、状态色、字号、间距、圆角、阴影和动效时间。
- 将 tokens 同步用于 Vue 主前端与 `/tracking/` 静态前端，避免出现两个品牌版本。
- 分离官网外壳与工作台外壳；共享标识、字体系和表单语言，分别满足品牌展示与高频操作。
- 规范按钮、输入框、表格、Tabs、状态标签、空态、错误、抽屉和对话框。
- 保留已有 API、角色权限、装箱算法与业务状态，视觉改造尽量停留在组件展示层。

### 第 2 步：官网和模块介绍页

先完成首页、货物追踪入口、装箱规划介绍等访客页面。首屏突出服务与主要操作，减少技术口号、装饰统计、技术网格和重型入场动画。正式上线图片应具备授权或由企业提供，文案和能力声明应经过业务核实。

### 第 3 步：追踪查询与结果

统一查询表单、运输阶段、事件时间线、ETA/实际到达、箱号列表、空结果和失败反馈。展示更新时间及数据来源，区分“查询中”“暂无数据”“船司暂不可用”，避免以假进度或装饰地图暗示实时性。

### 第 4 步：工作台与后台

按“总览 → 列表 → 详情 → 批量操作”推进。优先稳定导航、筛选、列宽、行密度、状态语义与常用操作。工作台保留任务导向，管理员后台突出审计和系统管理；不把所有功能都转换成大卡片。

### 第 5 步：登录、跳转与等待状态

保持登录标识、可见标签、错误说明、键盘焦点和深链返回。等待反馈应表达实际任务；短等待用按钮状态或骨架，长任务展示真实步骤与取消/重试能力。尊重系统减少动态效果设置，避免人为延长品牌动画。

### 第 6 步：按实际改动验证

每批检查相关类型、功能和构建；对登录深链、不同角色导航、查询、筛选、详情、批量操作及窄屏布局做浏览器验收。没有新的修改或疑点时，不反复扩大测试范围。上线前再验证真实环境的完整链路。

## 追踪入口设计参考

以下仅用于研究公开追踪入口的信息组织：运单/订舱号/集装箱号输入、查询类型及结果入口，不代表复制其视觉、使用其品牌资产或获得其认可。

- [Maersk Tracking](https://www.maersk.com/tracking/)
- [Hapag-Lloyd Tracking](https://www.hapag-lloyd.com/solutions/tracking/)

本目录中的设计原型是独立提案，示例票单、日期和指标均应视为演示内容；不表示已经与生产数据连接。
