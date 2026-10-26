# 新增模块指南

> 目标：新增一个业务模块时，按固定分层与清单落地，避免再出现巨型 Service、巨型页面、
> 巨型入口文件。现有客户模块已按此结构拆分，可作为模板。

> **2026-10-14 模块平台更新：** 新增模块优先按 [MODULE_PLATFORM.md](MODULE_PLATFORM.md) 的规格生成、角色宿主和接口契约开发。本文保留已有业务工作流和兼容路由的接入细节。

## 1. 后端（Spring Boot）

普通读写通过 MyBatis-Plus 受控 Repository；应用服务负责事务、业务规则与审计，Controller 只处理 HTTP；Entity 与公开 DTO 分开。复杂查询、复合键和明确原子操作可使用参数绑定 Mapper SQL，不再要求每个模块手写 XML CRUD。

从 `module-specs/service-catalog.json` 和 `servicecatalog` 样板开始；生成命令、字段演进、权限范围与校验入口见 [模块平台](MODULE_PLATFORM.md)。客户范围查询须复用领域守卫，不能使用生成器的内部参考数据策略。

## 2. 前端模块接入与移动

### 当前结构

保留 Vue 3、Vite、Vue Router 和 Element Plus，按功能逐批迁移。入口已通过真实 RouterView 渲染页面，不再由 ApplicationEntry 的路径判断来选择工作台。

```text
ApplicationEntry / RouterView
  ├─ App：现有装箱页面，内部模板继续渐进迁移
  └─ OperationsEntry：登录校验、角色边界、公告、共享会话
       ├─ WorkbenchPortal
       ├─ AdminDashboard
       └─ BusinessCustomerPage：业务布局、作用域组装与模块合同
            ├─ useCustomerOperations：目录、表单、代理、导入、交接、凭据
            ├─ useShipmentOperations：列表、详情、建单/导入、批量任务、列表写入
            └─ RouterView：注册的业务模块页面
                 ├─ BusinessOverviewPage → 统计读取、图表生命周期
                 ├─ CustomerWorkspacePage → 目录 / 客户详情
                 ├─ ShipmentWorkspacePage → 列表与批量弹窗 / 票单详情
                 ├─ AgentDirectoryPage → 海外代理目录
                 ├─ CustomerHandoverPage → 业务交接 / 海外代理分配
                 ├─ CustomerSummaryExamplePage（开发样板，默认关闭）
                 └─ LegacyBusinessPage：仅保留旧扩展接入的兼容加载器
```

每个模块的 `module.js` 自行声明元数据和懒加载页面；`frontend/src/modules/registry.js` 只维护模块顺序清单，通过 `moduleCatalog.js` 一次组装元数据和加载器。路由生成在 `routes.js`；`views.js` 只声明宿主页面并合并模块加载器，不再重复登记业务模块。注册表同时生成业务菜单、允许角色、稳定路由名及页面入口。权限同时检查所有父路由，子模块不能扩大父工作区权限。前端检查不能代替后端的数据范围与写入授权。

新模块直接提供自己的页面，不要再向 BusinessCustomerPage 添加条件分支。总览、客户目录、客户详情、票单详情、代理目录与交接已由模块页面渲染，父容器现在使用普通 RouterView，不再提供旧条件模板。客户、代理与交接弹窗模板位于各模块的 components 目录，由父容器挂载模块弹窗宿主，保持切换路由时的任务生命周期。LegacyBusinessPage 仅保留旧扩展的兼容入口，不用于当前内置页面。

### 新增一个模块

例如增加业务单证模块：

1. 创建 `frontend/src/modules/documents/pages/DocumentsPage.vue`，把自身组件、业务 composable 和服务适配器放在模块目录；提供 `index.js` 公共入口。
2. 在模块自身的 `module.js` 定义下面的注册合同；`index.js` 可重导出加载器与注册合同。其他模块不要直接导入 `documents/pages` 的私有组件。`labelKey` 需在现有语言包中定义；目前业务菜单支持 DataBoard、User、Operation、Document、UserFilled 图标。

```js
// @ts-check
export const loadDocumentsPage = () => import("./pages/DocumentsPage.vue");

/** @type {import("../../types/moduleRegistry").BusinessModuleRegistration} */
export const documentsRegistration = {
  module: {
    id: "documents",
    mount: "documents",
    icon: "Document",
    labelKey: "documents.title",
    roles: ["BUSINESS", "ADMIN"],
    pages: [{ name: "business-documents", path: "", view: "documents" }]
  },
  views: { documents: loadDocumentsPage }
};
```

3. 在 `registry.js` 从该模块的 `module.js` 导入 `documentsRegistration`，加入 `createBusinessModuleCatalog([...])` 的清单；无需修改 `views.js`。注册文件只放元数据与动态 import，不导入工作流、API、页面组件或模块内部状态，避免清单初始化时提前加载业务依赖。
4. 模块页面使用 `useWorkspaceContext()` 获取只读 `user` 和 `announcementCount` ref，以及 `logout`、`updateUser`、`openAnnouncements` 操作。这些来自 OperationsEntry 的现有会话，不要再读本地缓存创建第二份登录状态。上下文在工作区外会报错，避免静默失去授权边界。
5. 模块自己创建 workflow、请求与表单状态；公共服务只经约定接口调用。临时表单、文件、密码不要放进全局持久状态。跨模块只传 ID 或明确命令，不导入其他模块内部 ref。
6. 为读取范围、空数据、失败、权限变化、过期异步响应及离开页面补充行为测试；用实际页面验证筛选、详情返回、弹窗和窄屏。

这个页面由业务 RouterView 直接渲染，可以不使用过渡层提供的默认 slot；不需要修改 ApplicationEntry、OperationsEntry 或旧模板的分支。

### 调整位置和入口

`id` 和 `pages[].name` 是稳定标识。菜单排序优先通过 navigation.order 调整；更换 `mount` 会改变 URL，例如将 shipments 改为 cargo-center，现有基于 `business-shipments` 路由名的链接自动跟随。不要通过更改 ID 来改菜单标题，标题由 labelKey 控制。

整个业务工作区需要移动时，组合入口支持：

```js
createApplicationRoutes(applicationViews, businessModules, { businessPath: "/business" });
```

命名链接转向新根路径，原 `/customers` 及其子路径仍作为别名保留。新增模块自身的 `mount` 迁移如果已对外发布过 URL，应在路由层另外保留旧路径的 redirect/alias；不能声称只改 mount 就兼容所有外部书签。

`enabled: false` 同时移除菜单和路由。新注册合同即使关闭，也检查并预留 ID、路径、路由名及加载器键，避免启用后出现冲突。每个页面必须声明本模块拥有的加载器；缺失、非函数、跨模块重名、与宿主加载器重名均在组装时拒绝。实际路由树另外检查模块路由名与宿主页面/布局重名。元数据与函数分别存放，元数据可独立复制，组装不执行加载器。旧扩展直接调用路由生成器时仍支持未指定 view 的兼容页面，不用于新注册合同。

每个模块的空相对路径是入口；详情可配置命名参数。现有客户/票单导航适配器只处理它们各自的 ID，新模块的详情通过自己的稳定路由名跳转。模块类型合同位于 `types/moduleRegistry.ts`，默认端口类型检查同时验证注册输入和加载器输出误用。

旧链接 `?section=...&shipment=...`、客户 `?customer=...&view=detail` 仍接受，在业务工作区内用 replace 转换成命名路由，保留无关 query 和 hash。新路径的参数优先于冲突的旧 query。根入口的 `#/...` 和 `#admin` 兼容继续保留。

### 现有模块的过渡合同

`moduleContext.js` 为客户、票单、代理与交接页面及弹窗提供各自的明确合同，`ShipmentListPage` 接收同一 `workspace`：

| 分组        | 用途                                                              |
| ----------- | ----------------------------------------------------------------- |
| permissions | isManager、isOverseaAgent，只读 computed                          |
| state       | 同一 workflow 的 ref 投影，包含筛选、行数据、分页、选择和忙碌状态 |
| actions     | 建单、导入、批量追踪、详情跳转、刷新、删除、分页及表格 ref 接线   |
| formatters  | 客户、状态、时间和绑定用户的格式化函数                            |

这些过渡页面拥有自己的模板与 scoped 样式，不直接调用服务，也不复制工作流状态。客户目录和资料写入由 `customers/useCustomerWorkspace.js` 组装；客户侧票单授权/发布与票单侧客户绑定分别由 `useCustomerShipmentAccess` 和 `useShipmentCustomerBindings` 管理。

`workspace/useCustomerOperations.js` 在容器作用域中创建唯一的客户目录、表单、代理、导入、交接和凭据流程。输入明确分为 services、permissions、feedback、刷新票单命令与文件/页面适配器，各流程共用同一目录和写锁。不要让路由页面重新创建这些流程，否则切换页面会丢失任务或产生两份状态。票单由 `workspace/useShipmentOperations.js` 组装唯一列表、详情、手工建单/导入、批量任务与列表写入流程，共用客户目录、选中票单和追踪通道。客户、代理、交接和票单分别使用 `createCustomerModulePages`、`createAgentModulePages`、`createHandoverModulePages`、`createShipmentModulePages`，统一从对应模块的 `index.js` 导入。工厂只投影原 ref、动作与格式化端口，不创建 workflow 或调用 API；重新组装合同也不重置原表单、分页或凭据。父容器保留服务注入、生命周期、导航和翻译适配，部分历史样式继续按实际使用位置收敛。

票单纯展示规则放 `features/shipments/shipmentPresentation.js`：状态优先级、订舱查询编号、补录判断、客户名称和绑定身份。`shipmentBoundUsers`/`primaryBoundCustomerName` 显式接收当前 `customers` 与 `shipmentCustomerMap`；调用方在每次计算时提供最新目录，不在工厂创建时快照复制。这些函数不访问浏览器或服务，迁移页面时可直接复用。

OperationsEntry 使用账号 ID、用户名和角色生成工作区 key。身份或角色变化重新创建容器作用域，销毁旧请求观察、表单与计时器；仅显示名称变化不重建。已提交的服务端任务仍由服务端执行，不能把离开或卸载说成任务取消。列表批量字段编辑使用受控关闭，提交和关联刷新期间不能关闭；失败保留草稿供核对重试。删除与刷新固定提交目标，旧响应不清除用户后来的选择，授权变化和卸载阻止旧回填。

总览采用页面自身持有读取状态的方式：`overview/useOverviewMetrics.js` 管理请求版本、账号与角色变化及销毁，`overviewModel.js` 只负责校验和统计呈现。容器只提供 `readFallback()`，返回当前已加载工作区记录；普通读取失败明确标记缓存统计，401/403 不展示缓存。图表随页面创建与释放，离开后的旧响应不回填。新模块按任务生命周期选择页面作用域或容器作用域，不把所有读取都迁到共享状态。

原生弹窗使用 `composables/useDialogFocus.js` 管理焦点循环、恢复入口焦点及可重叠的背景滚动锁。关闭调用 workflow 的受控操作，提交中不绕过写锁；Element Plus 弹窗使用受控 model-value 与 before-close。文件 input 通过明确的 setFileInput 操作接回原 workflow，不能另建文件 ref。共同样式由 `modules/shared/styles/businessDialogs.css` 以 scoped 外部样式引用，专属样式留在各组件。密码结果由 `features/account/usePasswordResetResult.js` 管理会话：关闭、权限变化与销毁清空密码，晚到复制结果不能回写新弹窗。

### 跨模块命令

页面通过 `useBusinessCommandContext()` 使用公共操作，而不是访问其他模块的可写 ref：

```js
const commands = useBusinessCommandContext();
commands.openCustomer(customerId);
commands.openShipment(shipmentId);
await commands.refreshShipmentRelations();
```

导航只接受字符串 ID，由现有命名路由和权限规则处理。关联刷新尝试客户与票单两个读取端口；任一失败或返回 `false` 都不视为完整成功。绑定、解绑和发布提交时固定对象 ID、字段或批量 ID，切换对象、丢失权限或卸载使旧响应失效。已发出的服务端写入不会被宣称取消；批量流程只停止尚未发出的请求。

### 可运行的新增模块样板

`modules/examples/customer-summary/` 包含 `module.js`、公共入口、页面、workflow 与服务适配器：读取现有有权限的客户接口，展示筛选、加载、失败重试及客户详情跳转，不增加写接口或虚构业务数据。

仅开发环境可显式开启：

```powershell
$env:VITE_ENABLE_MODULE_EXAMPLE = 'true'
npm --prefix frontend run dev
```

访问 `/customers/module-example`。`configuredRegistry.js` 同时提供路由和导航配置；默认关闭，生产构建中即使设置上述变量也关闭。样板只允许 ADMIN/BUSINESS。复制样板新增正式模块时，应移除开发开关、定义正式稳定 ID/路由名和本模块服务，不复制其他模块的内部状态。

样板测试见 `frontend/test/module-collaboration.test.mjs`：执行真实路由生成器验证增加/移动入口，以及乱序响应、错误重试、账号变化、禁止角色和作用域销毁。

### 验证和后续边界

```powershell
npm --prefix frontend run test:features
npm --prefix frontend run typecheck
npm run verify:quality
npm --prefix frontend run build
```

新增模块的路由测试可参考 `frontend/test/module-routing.test.mjs`：使用真实路由生成器和 memory history，验证组件匹配、模块移动、旧链接、浏览器历史和权限；不用外部服务器。

质量门检查 JS script setup 的脚本引用及模板未声明绑定，slot/循环变量、props、导入和 Vue 公共 API 不误报。默认 `typecheck` 另外执行 `vue-tsc -p tsconfig.vue.json --noEmit`：当前 `src/modules` 的 25 个 SFC，以及手工建单、票单导入、个人资料和总览图表 4 个 feature SFC 使用 TS setup，开启严格模板检查。新模块组件自动纳入该目录覆盖；不允许退回 JS 或用 `@ts-nocheck`、`@vue-ignore`、`@vue-skip` 绕过。`check-sfc-typecheck.mjs` 复制真实客户/票单页面和上述 feature 到隔离临时目录，验证状态、动作参数、表单字段、DOM 事件、图表数据和每个组件 props 的故意错误必须失败。

模块合同类型来自公共页面工厂的 `ReturnType`，核心状态来自实际 composer 返回类型及具体记录模型，不能再声明一份与生产工厂脱节的页面接口。四个页面工厂开启 `@ts-check` 并声明输入端口；格式化接口复用真实展示合同，动作区分记录、ID、布尔参数。默认 `typecheck:ports` 编译真实 workflow 与展示工厂的接线，并逐项确认 22 种错误输入、消费者调用和注入 provider 合同必然失败。分页使用泛型保留记录类型；表格和文件 ref 通过公共边界守卫保留原实例。当前 51 个 SFC 中还有 22 个历史组件未纳入严格模板范围，部分历史 workflow 内部动作及服务响应仍依赖 JS 推断，不能称全项目完全类型安全。Pinia 尚未引入；如后续迁移，只把确需跨工作区共享的状态迁入 store，并验证登录、退出和权限变化，避免 composable 与 store 同时拥有一份状态。

### 展示、提示与布局端口

`features/presentation/createWorkspacePresentation.js` 集中 18 项翻译/格式化接口，构造时不读取工作流；通过 `getLocale`、`readDirectory`、`getBoundCustomerIds` 每次读取最新数据，保留原 ref 的响应性和语言切换。客户、状态和身份的纯规则仍在各领域模块；缺失/未知角色不能被猜成发货人。相关回归见 `workspace-presentation.test.mjs`。

`features/shared/useWorkspaceFeedback.js` 持有当前工作区的错误、信息及成功提示。替换成功提示使旧定时回调失效，销毁后清理提示及计时器，晚到工作流回调不再显示提示；不要另建全局 toast 状态来复制它。相关回归见 `workspace-feedback.test.mjs`。

父容器 scoped 样式只负责顶栏、侧栏、路由根间距与反馈层。经真实页面对照仍生效的 6 条 Element Plus 控件规则放 `modules/shared/styles/workspaceControls.css`，通过 scoped src 引用；模块和弹窗保留自己的样式。不能仅按文件位置删除 Vue 传给路由根的 scope 规则。模块内部重复卡片/分页规则可继续按明确公共组件收敛，不将历史类名变成全局设计系统。

独立追踪入口通过 `trackingReturnTo()` 解析当前命名路由，`trackingWorkspaceLink()` 生成查询链接；业务根或模块 mount 移动后保留当前详情、query 和 hash，权限消失、离开或销毁后不生成返回地址。不得在模块重新硬编码 `/customers`。返回地址只接受本地解析路径，拒绝反斜杠和控制字符；已编码的参数内容继续保留。回归见 `tracking-workspace-link.test.mjs`。

后台服务、调度刷新、装箱算法、SQL 和部署协议不由前端注册表替代。

## 3. 追踪服务（Node，tracking-service）

- `server.mjs` 是启动与组装入口；HTTP 分发放 `http/create-tracking-server.mjs`，请求处理放 `http/tracking-controller.mjs`，运行时与业务服务放 `services/`，船司适配和纯函数工具放 `lib/`。
- COSCO 协议查询由 `services/cosco-endpoint-client.mjs` 的 `createCoscoEndpointClient({ upstream, gate })` 组装：返回 endpoint、箱号、可选接口及箱详情查询。使用 runtime 提供的传输/熔断/按出口会话和同一请求 gate，不创建第二套队列或 Cookie 状态。runtime 组装通道执行/回退、健康监控及关闭；替换协议客户端时必须验证取消、超时、缓存隔离和过期重试，并继续给健康探测注入相同实例的方法。
- 单通道执行由 `createCoscoChannelExecutor({ endpoints, upstream, fetchBrowser, playwright })` 组装，返回 `fetchCoscoTracking`。负责网络/代理/浏览器结果归一化和保护错误转换；不自行尝试下一通道、不创建 pool/gate/monitor。playwright 注入 proxy、proxyAlias、timeoutMs，来自 runtime 同一配置。
- 授权回退由 `createCoscoFallbackRunner({ upstream, proxyPool, proxyConfigured, cookieStates, playwright })` 组装，返回 `runCoscoWithAutomaticProxyFallback(channel, options, operation)`。operation 接收实际通道和路由 options，既用于主查询，也用于选定来源的补充查询；私有 AUTO 回退前调用原 authorizeProxyFallback。playwright 的 autoFallbackEnabled 由 runtime 验证独立出口，不能由 HTTP 输入开启。代理轮换重置原 PROXY breaker 并清除原 cookieStates 的 PROXY 项；不能复制状态表、重建 gate 或在此关闭资源。
- 补充查询由 `createCoscoSupplementalWorkflow({ endpoints, upstream, gate, runWithFallback, fetchTracking })` 组装，返回 `fetchSupplementalDetails(request, channel, options)`。options 保留 sources、allowPlaywrightFallback、authorizeProxyFallback；空或全部不支持的 sources 按原协议读取两个来源，有效来源清理并去重。原 endpoint 提供查询，upstream 提供路由时间预算，gate 必须是 runtime 的主查询 gate，回退与通道执行函数取同一实例。
- 普通失败可保留另一来源结果；保护类错误必须离开 warning 分支进入回退，所有选定来源失败必须报错。浏览器仅投影选定字段，不能把未请求来源的数据当作该来源成功。主查询 signal 与 batch/回退选项沿调用链传递；补充查询仍沿用原有不带 signal 的公开接口，本批不新增取消协议。
- 新增行为需同时验证单通道、回退、补充工作流与生产 runtime 接线（cosco-channel-executor、cosco-fallback-runner、cosco-supplemental-workflow、cosco-runtime 测试）；不能只依赖源码正则。环境配置、调度和资源关闭仍归 runtime，公开接口由 HTTP 层维护。
- 新增船司适配器：在 adapter registry 注册执行适配器，协议逻辑放自身模块；保留限流/冷却/取消/重试行为，不往 HTTP 层追加船司分支。
- 新增路由：在 HTTP 层注册，调用注入的 controller/service；不要重新把业务逻辑堆进入口。构造服务器时不得自动启动监控，测试注入假适配器，不访问真实上游。
- 独立追踪工作台的响应文案、诊断分类和旧端点回退判断放 `public/tracking-response.mjs`；调用方显式传当前翻译和诊断权限，模块不读取 DOM 或会话。客户在读取技术字段之前返回友好提示，员工诊断展示过滤常见凭据；协议回退继续使用原始消息判断，只对明确缺失的端点降级，不把业务 404 当作缺路由。新增公开 ES module 必须验证实际静态 HTTP 加载、MIME 与入口导入。
- 加测试到 `test/*.test.mjs`（`node --test`），保持 `npm test` 全绿。

## 4. 数据库迁移（Flyway）

Flyway 已收敛为唯一结构演进入口；运行时 SchemaInitializer 已移除。V1/V2 保持原样，V3 冻结旧库结构和历史数据升级，V4 增加服务目录。旧库必须通过显式、带备份验证的接管流程，禁止正常启动自动 baseline。

详见 [数据库迁移与真实 MySQL 验收](DATABASE_MIGRATIONS.md) 与 [字段生成和演进](MODULE_PLATFORM.md)。

## 5. 部署与环境变量

- 新增配置：加到 `.env.example`，并在 `docker-compose.yml` 显式透传到容器（不要只写 .env）。
- 新增服务：在 compose 定义 healthcheck、`depends_on: condition: service_healthy`、持久化卷。
- 镜像标签用 `IMAGE_TAG`（不可变版本），发布/回滚见 `RELEASE.md`。
- 不使用固定 `container_name` 与新项目冲突时，用 compose project 隔离。

## 6. 质量门与 CI

- 提交前：`node scripts/verify.mjs`（quality/typecheck/backend/tracking/packing/frontend）。
- 新文件会自动进入质量棘轮（`scripts/quality.mjs`）与 Checkstyle（加入 includes）。
- CI（`.workflow/ci.yml`）与本地同源命令；新模块无需改 CI，除非新增服务/镜像。

## 7. 管理员历史页面迁移

- 新的管理员账号/模型设置能力接到 features/admin/useAdminAccounts 或 useAdminLlmSettings；通过 types/adminWorkflows.ts 声明的端口传入原服务、当前用户、翻译/反馈。工作流不导入组件、浏览器 API、adminApi 或读取本地令牌；确认框、剪贴板与用户更新由宿主注入。
- 同一管理界面的写工作流通过 isHostBusy 互斥，列表加载与保存分别管理读取/写入状态。提交前快照目标和参数；不能在 await 后重新读取正在编辑的表单或行对象。成功后的列表刷新失败不能报告为写入失败或重新提交。
- 管理员工作流必须在组件 effect scope 内创建；账号/角色变化与销毁清空凭据并使旧请求失效。UI 拆分后继续复用同一实例，不复制临时密码、草稿或服务状态。新增或迁移模板须加入严格 Vue 检查；目前历史 AdminDashboard 仅有编译绑定保护。
- API/确认/剪贴板的测试替身注入端口，执行生产工作流，不依赖旧父页面函数名。现有 25 项管理员行为回归及 8 项误用类型探针保留在默认验证命令中。

### 管理员设备页接入（第十九批）

useAdminDevices 在宿主 effect scope 创建一次，注入原 fetchDevices/kickDevice/deleteDevice、当前管理员、反馈及删除确认端口。AdminDevicesPage 是受控展示组件，只接收行、total、分页、busy、设备上限及格式化/翻译函数，发出 kick/delete/page 事件；不创建第二个列表或自己读 API。迁移该页时同时接入 adminTableStyles.css 和应用基础样式，保留表格行的 AdminDevice 类型标注。

列表读取可供宿主初始化组合，用户操作通过 busy 和 isHostBusy 排斥其他工作流。设备写入只刷新设备列表，概览/审计由宿主显式刷新；操作已成功但后续刷新失败必须保留已提交结果，不把它当成写入失败。设备新增 23 项行为回归及 5 项类型误用探针已进入默认检查，实际页面与服务端协议使用本地替身验收，不代表线上会话已撤销。

### 管理员公告工作流接入（第二十批）

在管理员宿主 effect scope 中创建 useAdminAnnouncements，按 AdminAnnouncementPorts 注入服务、会话、提示、删除确认、日期和 URL 校验；编辑器仅提供 opened/cleared/insertImage 回调。loadAnnouncementPageWithoutLoading 供宿主初始化，用户刷新/分页与写入走受控入口，禁止把 click 事件当分页参数传入。公告文案与字符面板通过 announcementCopy.js 读取，避免宿主维护重复文案。

草稿、图片上传和会话都有独立版本；关闭上传中的草稿会释放当前 UI 归属，但不伪称底层上传已取消。以后拆富文本组件时必须保留旧上传结果隔离、保存期间禁止修改/关闭及原 DOM 格式/序列化语义，不可让组件复制一份草稿或自行调用 API。更新内容不传 status，发布/停用使用专用接口；确认目标不可变。服务端成功后仅刷新公告列表，刷新故障与写失败分开反馈。36 项行为测试和 7 项真实类型误用探针进入默认检查；公告模板/Markdown/DOM 迁移属于后续。

### 公告编辑器与展示规则接入（第二十一批）

AdminAnnouncementDialogs 必须复用宿主的 AdminAnnouncementWorkflow；presentation/copy/busy/today 通过 props 注入。宿主用组件 ref 的 opened/cleared/insertImage 接回原工作流 editor 端口，组件保持挂载以接收新草稿 nextTick 回调。禁止在弹窗内重复创建工作流、复制表单或直接调用公告服务。

useAnnouncementEditor 接收同一工作流、实际 presentation、文案 getter、getDocument 与 prompt；仅该适配层使用浏览器选区与 execCommand。清空或新开草稿时重置 Range，销毁释放旧选区；图片上传仍由工作流管理版本/会话归属。原生粘贴只读 text/plain，上传/正文插入调用同一服务流程。announcementPresentation 通过 getOrigin 校验 HTTP(S) URL、规范存储图片并完成 Markdown/DOM 转换，不在模块顶层读取 window。替换编辑器实现时需要保持已保存内容和图片路径可迁移，不能直接更改旧渲染语义。

公告列表用 announcementListStyles.css，弹窗用 announcementStyles.css；动态插入正文需要 :deep，不能依赖只有模板元素才拥有的 scope 属性。新 TS 弹窗保留默认 SFC 和端口负向检查。当前累计 447 项前端行为回归、57 项端口探针，严格 SFC 31/53；其他历史模板与文件模块仍待拆分。

### 公告列表接入（第二十二批）

AdminAnnouncementsPage 是受控组件：传入宿主工作流的行、总数、分页与 busy，注入同一 copy/presentation 以及日期格式化函数；create/refresh 不带参数，preview/edit/publish/disable/delete 带 AdminAnnouncement 行，page 带数字。保持宿主原分页过渡与服务组装，不在列表内复制状态或直接请求服务。表格插槽保留 ElTableColumn 的行类型参数，迁移时同时携带 adminTableStyles.css 和 announcementListStyles.css。

列表和预览使用 createAnnouncementLabels(() => copy) 读取当前语言，兼容旧 visibility 字段；状态按钮与徽章都使用 announcementStatus 规范化，避免显示已发布却仍提供发布按钮。时间字段使用原 updatedAt → publishedAt → createdAt 回退。实际组件 props/插槽/事件负向编译进入默认检查；当前前端 452 项、端口探针 59 项、严格 SFC 32/54，文件工作流与历史模板仍待迁移。

### 管理员文件与预览接入（第二十三批）

useAdminFiles 在宿主 effect scope 创建一次，以 types/adminFiles.ts 约束原列表/下载/删除服务、会话、反馈、确认和 onDeleted。初始化可并行读取两类文件，用户入口通过写锁与 isHostBusy；分页保持服务端 0-based，保留 includeDeleted=true 的软删除审计语义。确认必须使用固定目标，0 id 不可被 truthy 判断丢弃；写成功后的刷新故障不能重报为提交失败。

useAdminFilePreview 注入 Blob 和 URL 创建/释放端口，弹窗复用同一实例，关闭/替换/失去作用域清除旧内容；删除仅关闭匹配的预览。AdminFilePreviewDialog 使用公共 useDialogFocus，真实状态/props/方法合同纳入 strictTemplates。文本只解码前 1 MiB，超限提示下载；不代表 HTTP 传输限额或 AbortSignal。Office 二进制不得假称 OCR/提取文字，已开始的下载由原服务适配器执行。列表及 display helpers 暂留历史宿主，下一批迁移时必须保留两个独立分页、筛选和软删除状态，不可在组件另建 store。

本批前端 484 项行为回归、68 项端口负向探针、严格 SFC 33/55；本地页面替身验证不等同真实后台、PDF 内容或线上验收。

### 管理员文件列表接入（第二十四批）

AdminFilesPage 只接受宿主的 workspaceRows/shipmentRows、各自总数/页码/页尺寸、section/includeExpired/busy 与 t/presentation。section、expired 和分页事件携带明确联合值/布尔/数字；refreshWorkspace/refreshShipment 无参数；downloadWorkspace 带 AdminWorkspaceFile，其余文件操作带 AdminShipmentFile。过期筛选在宿主更新值再调用原工作流重置第一页，不在列表内改写 props、另建 store 或请求 API。

createAdminFilePresentation 注入同一翻译、角色和日期格式化端口，实际返回合同用于组件。添加新的列表字段先补 types/adminFiles.ts 及真实表格插槽约束；0 id 使用空值判断，deletedAt 与状态共用删除规则，日期格式化前验证。文件专属样式 scoped 引入 adminFileListStyles.css 和 adminTableStyles.css；不要把整个宿主 CSS 搬进新组件，保持表格内部滚动和固定操作列。默认检查含实际组件错误 props/插槽/事件与工厂参数回归。当前前端 494 项、端口探针 72 项、严格 SFC 34/56；其余历史模板和整体缓存仍待迁移。

### 管理员账号页与弹窗接入（第二十五批）

AdminEmployeesPage 接收同一 useAdminAccounts 的标准化 rows、total/page/pageSize、busy、currentUserId，以及当前语言的 t/角色/货运身份/状态/日期格式化函数；create/refresh 不带参数，行操作带 AdminEmployee，reset 额外传原 MouseEvent，page 带数字。组件只发事件，不复制服务、分页状态或授权工作流。ElTableColumn 行插槽必须保留泛型，日期先验证再传给宿主格式化函数。

AdminEmployeeDialogs 接收该工作流的 ReturnType（AdminAccountWorkflow）、busy、t 和状态格式化，不在内部重新实例化工作流。editingEmployeeId 的未编辑值是空字符串，不使用 truthy 判断；密码确认/结果保留工作流 DOM 按钮 refs。useDialogFocus 负责滚动、Tab、Escape 和恢复触发点，同时尊重工作流已安排的初始按钮焦点。复制等待时允许用户关闭结果，晚到复制由原 credentialVersion 隔离。迁移账号组件时同时携带 scoped adminTableStyles.css 和 adminEmployeeDialogStyles.css；不要重建旧密码结果 store。

严格 SFC 36/58、前端 496 项、端口探针 72 项；历史宿主自身仍未整体严格类型化，本地 API/剪贴板验收不代表真实服务器或系统剪贴板。

### 管理员系统配置接入（第二十六批）

AdminSystemSettingsPage 接收宿主唯一 AdminLlmWorkflow、AdminSystemMonitoring|null、busy、t 和日期格式化函数，将同一工作流传递给 AdminLlmSettingsPanel。模型组件只编辑工作流草稿并调用原保存动作，不能在页面重新创建 useAdminLlmSettings；面板离开/重入沿用宿主草稿，会话变更由原 guard 清理。工作流合同从真实工厂 ReturnType 导出，不另写重复接口。

adminLlmPresentation 的 t 端口保持动态；API Key 留空不进入保存 payload，输入与清除不能同时提交，服务端只保留 masked 元数据。已保存配置、草稿和 pending 不混合，baseline 必须是响应式 ref，避免保存未改变表单字段时 dirty 缓存残留。日期先验证，未加载计数不能用 0 伪装。专属样式 scoped 引入 adminSettingsStyles.css，共享 runtime/form/grid 不一并删除。

新增页面纳入默认 strictTemplates 与实际 props/字段/动作负向检查；展示工厂也接受生产端口误用检查。当前前端 502 项、严格 SFC 38/60、端口探针 76 项；AdminDashboard 等 22 个历史 SFC 仍待整体迁移。

### 管理员页面与工作流接入（第二十七批）

AdminDashboard 仅组装页面、唯一 workflow 和服务。新增管理员功能先定义 types 中的行/props/events 与注入端口，再实现 features/admin 下的 workflow 和严格 TS 页面；页面发出操作事件，由 workflow 控制授权、busy、确认快照、查询版本及写入后刷新，不在叶子组件请求 API。

- useAdminConsole 管理认证、全局读刷新和审计分页；原始 load* 允许并行初始化，UI refresh*/change* 遵循宿主忙碌锁。refreshOther 及删除后刷新回调由宿主组合，部分失败保留成功结果。
- useAdminBusinessLists 管理 platform/handovers/tickets 三份独立分页。平台/审计/交接适配0基API，票单适配1基API并提交服务端有效分页；UI保持1基页码。确认后写入只发送一次，成功与刷新故障分开报告。
- AdminConsoleShell/AdminLoginPage 受控展示，密码不trim、不留存到退出后的表单；用户名trim。总览组件拥有图表实例和监听；其他页面只接收数据及展示工厂。翻译资源位于 i18n/adminConsoleMessages、adminOverviewMessages、adminBusinessMessages。

默认严格检查覆盖45个SFC、94项端口负向探针。宿主仍为JS组装文件，全仓22个历史SFC未整体迁移。增加功能时沿用生产工厂ReturnType及真实组件负向检查，避免建立与实际消费者脱离的测试合同。
