# 回归测试覆盖矩阵（T03）

目标：保证重构前后可对比，覆盖成功、失败、越权和事务回滚；不把测试退化为实现细节。
本表记录“关键场景 → 现有测试”的对应关系，重构时按此表回归。

## 1. 基线

| 套件         | 命令                       | 基线数量                                               |
| ------------ | -------------------------- | ------------------------------------------------------ |
| 后端 JUnit   | `npm run verify:backend`   | 初始 25 类 / 200 项；当前 27 类 / 215 项               |
| 前端功能模块 | `npm run verify:customers` | 301 项（第十一批新增客户/代理/交接合同 8、票单展示 8） |
| 发布脚本     | `npm run verify:release`   | 10 项（外部命令替身）                                  |
| Node 追踪    | `npm run verify:tracking`  | 119 项（含 HTTP 工厂和 runtime 行为测试）              |
| 装箱         | `npm run verify:packing`   | 4 组回归脚本                                           |
| 前端         | `npm run verify:frontend`  | i18n 扫描 + Vite 生产构建                              |

任何一批重构都必须保持以上数量不回退，并让新增/变更模块的用例继续通过。

## 2. 场景覆盖

### 2.1 登录与会话

| 场景                                     | 用例                                                                                          |
| ---------------------------------------- | --------------------------------------------------------------------------------------------- |
| 改密后保留当前设备、吊销其他设备         | `auth/AuthServicePasswordChangeTest`                                                          |
| 客户登录、客户码校验、登录失败           | `customer/CustomerAccessFlowTest#customerCodeLoginAndExplicitShipmentBindingEnforceOwnership` |
| 内部 token 鉴权、公开路径豁免、CORS 预检 | `auth/HttpAuthorizationRegressionTest`（本批新增）                                            |

### 2.2 角色与权限

| 场景                                              | 用例                                                                                                                                   |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| ADMIN 可进后台、BUSINESS 被拒、OVERSEA_AGENT 被拒 | `auth/HttpAuthorizationRegressionTest`                                                                                                 |
| 内部/客户通道 token 不可混用                      | `auth/HttpAuthorizationRegressionTest`                                                                                                 |
| 客户目录三种角色的数据范围                        | `customer/CustomerDirectoryServiceTest`、`customer/CustomerAccessFlowTest`                                                             |
| 文件多角色可见性与越权下载                        | `shipment/ShipmentFileServiceTest#enforcesMultiRoleVisibilityFromShipmentBindings`、`#enforcesParticipantVisibilityAndSoftDeleteRules` |
| 留言必须拥有票单权限                              | `shipment/ShipmentFileCommentServiceTest#rejectsBlankMessagesAndUsersWithoutShipmentAccess`                                            |

### 2.3 客户操作与交接

| 场景                               | 用例                                                                                                 |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------- |
| 客户创建、批量导入、字段与密码规则 | `customer/CustomerAccessFlowTest#batchCustomerImportPreservesCompleteFieldsAndEnforcesPasswordRules` |
| 归档/删除与身份复用                | `CustomerAccessFlowTest#deletingCustomerIsDistinctFromDisablingAndReleasesIdentityForReuse`          |
| 直接交接完成并保留票单历史         | `CustomerAccessFlowTest#customerHandoverCompletesDirectlyAndRetainsShipmentHistory`                  |
| 交接不可重复审核（失败路径）       | `CustomerAccessFlowTest#completedDirectHandoverCannotBeReviewedAgain`                                |
| 交接校验失败时整体回滚（事务）     | `CustomerAccessFlowTest#directCustomerHandoverValidationIsAtomic`                                    |
| 批量创建海外代理原子性（回滚）     | `CustomerAccessFlowTest#batchCreatesOverseaAgentEmployeesAtomically`                                 |
| 代理分配与单向关联                 | `CustomerAccessFlowTest#overseasAgentUsesCustomerLoginAndCanonicalFileVisibilityRole`                |

### 2.4 票单绑定与发布

| 场景                             | 用例                                                                                        |
| -------------------------------- | ------------------------------------------------------------------------------------------- |
| 绑定、发布状态、越权修改返回 404 | `CustomerAccessFlowTest#customerCodeLoginAndExplicitShipmentBindingEnforceOwnership`        |
| 批量票单字段更新                 | `customer/CustomerDirectoryServiceTest`、后端集成用例                                       |
| 批量追踪任务进度 / 取消 / 失败项 | `shipment/ShipmentBatchTrackingServiceTest`、`shipment/ShipmentBatchTrackingResilienceTest` |

### 2.5 快照

| 场景                         | 用例                                      |
| ---------------------------- | ----------------------------------------- |
| 快照持久化与刷新事件         | `shipment/ShipmentTrackingServiceTest`    |
| 自动刷新与补充重试、失败让位 | `shipment/ShipmentAutoRefreshServiceTest` |
| 快照参与客户可见性           | `CustomerAccessFlowTest`                  |
| 快照表结构契约               | `DatabaseSchemaBaselineContractTest`      |

### 2.6 附件 / 文件

| 场景                               | 用例                                                                                                           |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| 配额、扩展名、磁盘余量（失败路径） | `shipment/ShipmentFileServiceTest#enforcesShipmentCountAndByteQuotas`、`#protectsConfiguredDiskFreeSpaceFloor` |
| 软删除与可见性角色                 | `ShipmentFileServiceTest#enforcesParticipantVisibilityAndSoftDeleteRules`                                      |
| 同一票单下不同客户文件隔离         | `ShipmentFileServiceTest#isolatesFilesBetweenCustomersAssignedToTheSameShipment`                               |
| 内联/文本预览兜底                  | `ShipmentFileServiceTest#providesSafeInlineAndTextFallbackPreviews`                                            |
| 工作区文件保留与清理               | `workspacefile/WorkspaceFileServiceTest`                                                                       |

### 2.7 追踪服务（Node）

| 场景                            | 用例                                                                |
| ------------------------------- | ------------------------------------------------------------------- |
| HTTP 路由与适配器契约           | `tracking-service/test/server.test.mjs`、`http-app.test.mjs`        |
| COSCO 限流 / 冷却 / 队列 / 取消 | `cosco-protection.test.mjs`、`cosco-resilience-regression.test.mjs` |
| 代理池与代理切换                | `cosco-proxy-pool.test.mjs`                                         |
| CMA / Playwright 并发           | `playwright-concurrency.test.mjs`、`batch-import-rules.test.mjs`    |
| 通道执行与授权回退              | cosco-channel-executor.test.mjs、cosco-fallback-runner.test.mjs     |
| 补充详情选定来源与部分失败      | cosco-supplemental-workflow.test.mjs                                |
| runtime 查询与实例隔离          | `cosco-runtime.test.mjs`                                            |
| 前端静态契约                    | `public-app-contract.test.mjs`                                      |

### 2.8 装箱

| 场景                | 用例                                                       |
| ------------------- | ---------------------------------------------------------- |
| 层优先策略          | `frontend/scripts/check-packing-level-first.js`            |
| 单层行填充          | `check-packing-single-layer-row-fill.js`                   |
| 托盘间隙            | `check-packing-pallet-gap.js`                              |
| 大批量家具与恢复    | `check-packing-large-workload.js`                          |
| 报告标签 / 剩余空间 | `check-report-label-layout.js`、`check-remaining-space.js` |

### 2.9 结构与依赖契约

| 场景                       | 用例                                     |
| -------------------------- | ---------------------------------------- |
| schema.sql 关键表/列不丢失 | `DatabaseSchemaBaselineContractTest`     |
| 构造器注入（无字段注入）   | `SpringConstructorInjectionContractTest` |

## 3. 本批新增

- `customer/SnapshotInvalidationTransactionTest`：通过 Spring 容器实际事务代理调用领域服务，
  测试本身不包裹事务；覆盖快照、票单、发布状态、审计四个写入阶段的故障回滚、成功提交与
  并发刷新等待票单锁。数据库为 H2，尚不替代 MySQL 8.4 集成验收。
- `frontend/test/shipment-detail.test.mjs`：执行生产 composable 及 Vue watch，控制 API
  延迟、失败与响应顺序，覆盖票单切换、同票单请求乱序、保存回填、失效通知及刷新结果隔离，
  并验证保存、作废、刷新和删除互斥，初始详情未加载时不能提交修改。
  未使用浏览器 DOM，因此不替代浏览器端到端测试。
- `scripts/test/release.test.mjs`：实际执行发布脚本、校验和与 tar 归档恢复；验证备份不可变、
  完整恢复文件、数据库单独恢复保留公开服务、损坏备份/缺少归档提前拒绝、停写或恢复失败
  返回错误。Docker/Git/HTTP 使用测试替身，真实容器恢复仍需单独演练。

- `frontend/test/batch-tracking.test.mjs`：真实 Vue effectScope 配合可控 API 与计时器，
  验证创建/检查互斥、创建中停止、晚到响应隔离、刷新后按账号恢复、关闭弹窗继续运行、
  网络失败重试和 403/404 清理、存储失败、Excel 换文件/清空/卸载竞态及诊断展示。
- `frontend/test/business-navigation.test.mjs`：真实 Vue Router 内存历史，覆盖角色菜单规则、
  旧链接、详情刷新、前进/后退、列表返回、无效对象清理、导航加载上下文和作用域关闭。
- `frontend/test/vue-script-lint.test.mjs`：验证 SFC 编译后绑定检查能够识别宏、共享脚本变量、
  未定义函数、setup 模板缺失引用及语法错误；不支持的 TS 脚本明确列入跳过清单。
- `frontend/test/customer-workspace.test.mjs`：客户目录与表单 23 项，覆盖检索/分页、
  客户切换后清空旧资源、目录与关联请求乱序、卸载、关联客户/档案保存互斥、旧读取不覆盖新写入、
  保留未保存编辑、固定提交目标、部分删除成功后保留失败勾选、改密与客户码上下文、前端角色动作限制。
- `frontend/test/shipment-list.test.mjs`：13 项，覆盖查询参数兼容、筛选与分页响应乱序、
  当前错误重试、服务端页码回退、勾选行刷新、客户选项、绑定索引、快照标准化、去重和分页计时器清理。
- `frontend/test/customer-operations.test.mjs`：42 项，执行生产导入/代理/交接 composable，
  使用真实 XLSX 验证解析、双语模板往返和账号导出；覆盖角色限制、固定提交目标、共享写锁、
  旧响应隔离、交接后的所有权移除、分页修正、逐条创建部分失败、卸载停止排队任务及密码清理。
  不把停止前端派发当成服务端请求取消，也不替代真实登录/交接/浏览器 DOM 验收。

- `auth/HttpAuthorizationRegressionTest`：用真实 `WebConfig` 路径规则与真实拦截器，
  只把认证服务替换为桩，验证：
  - 公开路径（`/api/auth/login`、`/api/public/**`）不需要 token；
  - 内部接口无 token → 401；
  - BUSINESS 能读业务接口但不能进后台（403）；ADMIN 可进后台；
  - OVERSEA_AGENT 被后台拒绝、可读内部接口；
  - 客户通道使用独立 token，两个通道 token 不可互换；
  - OPTIONS 预检绕过鉴权。
    用 `doReturn/doThrow` 而非 `when(...).thenThrow(...)` 设置桩，避免桩串扰。

- frontend/test/manual-shipment-entry.test.mjs：30 项，生产模型/composable 与真实 XLSX，覆盖固定参数、覆盖确认、互斥、解析会话、结果导出、部分成功、客户授权变化和卸载停止派发。
- frontend/test/personal-profile.test.mjs：14 项，覆盖资料与改密验证、互斥、重复打开、账号切换、晚到响应及密码清理。
- Playwright CLI 本地浏览器验收：本轮抽出的建单/Excel 导入/个人资料弹窗在真实 Vue DOM 中操作，API 全部使用拦截替身；验证真实文件上传、结果下载、桌面与 390px 布局和焦点。结果不代替真实认证、数据库写入或船司验收。

- frontend/test/module-routing.test.mjs：16 项，执行生产注册/路由生成器、会话上下文和导航适配器，验证模块增加/移动/禁用、根路径别名、父子权限、旧链接与浏览器历史，代理/交接/总览匹配独立页面且移动后保持权限。
- 第六批 Playwright CLI：真实 Vue DOM 和 API 替身，验证票单/客户详情刷新、返回、前进/后退、建单弹窗、移动端无全页横向溢出、业务员越权入口不挂载管理员页面及海外代理写入口隐藏；不是线上认证或真实船司验证。

第七批新增 `frontend/test/module-collaboration.test.mjs` 23 项：作用域合同、ID 命令、双端刷新失败、固定绑定/发布目标、重复提交、切换与权限变化、批量部分成功及失败重试、模块样板搬迁/角色/读取乱序、媒体监听销毁。`customer-workspace.test.mjs` 增加关联读取失败不视为完整刷新，`shipment-detail.test.mjs` 增加只读角色拒绝写操作。

第七批浏览器验收使用本地 Vue DOM 与拦截 API：目录/详情、批量弹窗、样板筛选与错误重试、跨模块跳转及历史、管理入口权限、海外代理只读和窄屏可见性。没有向真实服务器写入数据；不代替后端与数据库授权验收。

第八批新增 `frontend/test/dialog-lifecycle.test.mjs` 8 项：关闭/权限变化/销毁清空改密结果，晚到复制回调失效与复制互斥、焦点循环和恢复、忙碌 Esc 保护、重叠弹窗滚动锁及快速关闭/销毁。客户工作区新增补录处理中不可关闭、失败保留草稿和空闲关闭清空的回归。

第八批 Playwright CLI：客户编辑/导入/改密/补录/代理分配，代理创建/同文件再选/导入与业务交接、提交固定参数、忙碌关闭保护、海外代理角色入口拒绝、桌面与 390px 页面及弹窗。客户码 pattern 在浏览器验证合法/非法输入；接口全量拦截，不进行真实账号或交接写入。

第九批新增 `frontend/test/overview-workspace.test.mjs` 13 项，执行生产纯模型与 Vue composable，验证日期/数字校验、权威零值/空数组、乱序响应、失败重试、拒绝授权不读缓存、账号/角色变化、销毁与语言切换。`customer-composition.test.mjs` 5 项验证真实组装后的目录写锁、代理/导入/交接互斥、共享凭据会话及销毁；路由增加总览独立页面测试。前端总计 262 项。

第九批 Playwright CLI：真实 Vue 页面配合全量拦截 API 验证总览四图、刷新/失败重试/403 清除/旧响应隔离、目录状态保留、双语，复验客户/代理/交接弹窗、提交锁、角色边界和桌面/390px 布局。浏览器用例等待路由页面过渡完成再操作详情，不将 URL 更新视为 DOM 已切换完成。不代表生产认证或真实数据库写入。

## 4. 已知未覆盖 / 后续补强

- 真实 MySQL 行为（外键、字符集、锁）不在 JUnit 覆盖，属于 T12 的验收范围。
- 业务路由和角色入口已有 Vue Router 行为测试及本地拦截 API 的浏览器检查；真实认证、部署分包错误和完整页面错误/空状态矩阵仍需集成验收。
- 追踪服务未做真实船司抓取（避免依赖外部网络与账号），沿用模拟通道。
- 登录专用失败矩阵（设备上限、锁定）可再补 `AuthServiceLoginRegressionTest`。

框架模块、依赖方向和下一批任务见 [FRAMEWORK_REFACTOR.md](FRAMEWORK_REFACTOR.md)。

### 第十批票单框架回归

`shipment-list-mutations.test.mjs` 16 项覆盖字段提交、失败保留、选择 ABA、删除目标、权限/身份变化、读取失败与取消/卸载。`shipment-composition.test.mjs` 7 项执行生产组装与 Vue，覆盖共享目录、详情写入、建单客户、批量参数、只读守卫、合同 ref 接线及工作区实例释放。浏览器验收与接口替身边界见 FRAMEWORK_REFACTOR.md 第十批。

### 第十一批：模块合同接线与纯展示规则

`customer-module-pages.test.mjs` 8 项执行公共工厂及真实 Vue/workflow，覆盖目录筛选/选择、表格及文件接线、跨模块写锁、代理目录同步、客户绑定、交接刷新、重建投影保留草稿、凭据清理和卸载后的晚到结果。`shipment-presentation.test.mjs` 8 项覆盖状态优先级、日期边界、COSCO 查询编号兼容、绑定身份去重及数据源优先级、显式目录更新、发货人/收货人选择、客户标签和补录判断。

两类批量导入脚本检查继续通过；客户模板增加 XLSX 二进制往返。浏览器验证详情/弹窗接线、忙碌关闭、同文件再次上传、角色守卫与桌面/390px 布局；API 替身与未验收边界见 FRAMEWORK_REFACTOR.md 第十一批。前端行为总计 301 项。

### 第十二批：展示端口、提示生命周期与模板类型

- workspace-presentation.test.mjs：7 项，真实 ref/computed 验证惰性构造、目录替换、绑定及当前选择、语言切换、未知角色、状态优先级和无效日期。
- workspace-feedback.test.mjs：4 项，真实 effectScope + 可控计时器验证错误分类、成功替换、信息/清理及销毁后的晚到动作。
- tracking-workspace-link.test.mjs：6 项，真实路由生成器和 Vue Router 验证 root/mount 搬迁、详情/query/hash、角色消失、卸载、无查询编号回退及浏览器归一危险路径拒绝。
- tracking-service/test/local-return-path.test.mjs：4 项，验证追踪接收端的合法编码参数、危险路径拒绝、生产点击监听器的历史/默认回退和真实 HTTP 静态模块 MIME/加载。public-app-contract.test.mjs 增加生产列表加载行为测试，确认 etaSort 与分页参数传入服务端，前端保留服务端顺序。追踪服务总计 124 项。
- npm run verify:typecheck：25 个 modules SFC strictTemplates；check-sfc-typecheck.mjs 复制真实生产页面，干净版本可编译，未知 state/action、number/boolean 错误方法及 Element Plus loading prop 类型误用必须失败。此脚本属于类型检查，不计入 318 项 Node 前端行为用例。
- 浏览器对照 18 组桌面/390px 页面和弹窗、3,191 个可见元素，样式几何/字体/颜色/间距/overflow/transition 前后零差异；真实 Vue DOM 复验客户弹窗、忙碌关闭、焦点恢复、双语和追踪返回上下文。API 使用全量拦截替身，不代表真实服务器与数据库集成。

仍有 26 个历史/feature SFC 和宿主部分 JS 输入未完成严格类型迁移，不使用 any/nocheck 广泛压制以宣称全覆盖。

### 第十三批：工厂端口、feature SFC 与追踪响应

- workspace-presentation.test.mjs 新增 1 项显示字符串合同回归，覆盖数字客户身份与异常日期；模块工厂测试增加非 input 目标拒绝及原 DOM/ref 实例保留断言。前端行为测试共 319 项。
- check-module-port-types.mjs 编译实际 workflow、bindings、展示工厂及模块页面接线；22 项错误参数、输出、缺失依赖、权限/UI/ref 及消费方误用逐项必须报错。
- check-sfc-typecheck.mjs 覆盖 25 个模块 + 手工建单、Excel 导入、个人资料、总览图表 4 个 feature SFC。复制真实组件验证 state/actions、表单、KeyboardEvent/DragEvent、图表数据及 props 的故意错误必须失败。类型探针不计入 Node 行为测试数量。
- tracking-response.test.mjs 新增 8 项：Spring/旧协议文案、错误码、404/405 回退判定、当前角色权限、敏感 payload 不读取、常见凭据显示遮盖、生产请求消费者及真实 HTTP 静态模块加载。追踪服务共 132 项。

剩余 22 个历史 SFC 与 workflow 内部 JS 服务尚未完成严格类型迁移。本批不修改后端、数据库或定时刷新策略，接口替身与本地 HTTP 测试不替代线上集成。

最终 verify:customers、verify:tracking、verify:typecheck、verify:quality、两类 XLSX、i18n 与生产构建通过。真实 Vue DOM 配合全量 API 替身验证手工建单新增中转/分段/箱详情及发布 false 参数、忙碌 Esc 防护；Excel bad.txt 校验、五表模板一票预览、提交与成功结果；个人资料 displayName PATCH/忙碌关闭/重新打开；四图表刷新和双语；客户详情与两种绑定模式、票单客户 B 勾选/取消。1440/390 截图在 output/playwright/framework-batch-thirteen/，无 pageerror。追踪服务本地 3000 未启动造成追踪根页跳转 HTTP 500，该入口未计为已验收；真实船司与线上账号不在本批验证范围内。

### 第十四批：COSCO 接口/会话职责拆分

- cosco-endpoint-client.test.mjs 新增 21 项真实客户端行为回归，生产 upstream、gate 和 breaker 配合传输替身：POST 参数/Referer/Cookie、XOR 解码、HTTP 与业务码保护、异常响应、超时和取消、排队中取消、五分钟缓存/并发会话初始化、直连代理会话隔离、代理轮换失效、401 至多两次重试、公共页保护与可选接口回退。
- cosco-runtime.test.mjs 增加 1 项健康探测接线，执行生产 runtime 的并发监控检查和箱号双通道探测；不启动后台定时器、不连真实船司。
- 原 business-code 403 的源码正则回归改为执行生产 runtime，验证适配错误与直连/代理 breaker 状态。全套 Node 154/154 通过；质量门及 git diff --check 通过。

本批仅修改 Node runtime 的职责组织与测试，未修改 UI、Java、数据库、调度或部署。真实 COSCO 上游、浏览器网络通道不在此批验收范围。

### 第十五批：COSCO 通道执行与回退职责拆分

- cosco-channel-executor.test.mjs 新增 12 项行为回归：真实归一化与 upstream/breaker，配合 endpoint/浏览器替身，覆盖路由参数/时间预算、批量跳过补充查询、箱号查询、部分详情、安全警告、浏览器 403/429 对 API 熔断的隔离、原 signal/代理参数、取消优先级与结构化错误。
- cosco-fallback-runner.test.mjs 新增 16 项：真实回退/重试策略、原 breaker 与 Cookie 状态，配合代理池/operation 替身，覆盖 AUTO 顺序、授权拒绝、非回退错误、缺失代理、独立浏览器条件、失败/预算轮换、上限、轮换失败、取消及诊断聚合。
- cosco-runtime.test.mjs 新增 2 项实际组装调用链：HTTP Response 503 → 授权 → 独立浏览器替身成功；拒绝授权保持原错误且不调用浏览器。全套追踪 184/184 通过。不访问真实代理或船司，未改前端、Java、数据库和定时刷新策略。

### 第十六批：COSCO 补充详情工作流

- cosco-supplemental-workflow.test.mjs 新增 26 项，生产工作流配合真实 fallback、upstream、gate 和 breaker，endpoint/浏览器/代理池控制使用替身。覆盖默认/选定/重复来源、业务参考归一化、两种部分失败、全失败、保护/网关错误、代理轮换、授权拒绝与 opt-in 浏览器回退、仅投影选定字段、空/异常结果及请求作用域。
- cosco-runtime.test.mjs 新增 1 项：实际主查询在原 gate 阻塞时补充查询保持排队，释放后只发选定 bookingInfo 请求。原 supplemental 的两项正则测试改为实际 runtime 403/429 保护与 404 → 授权 → 单次独立浏览器调用链。
- 全套追踪 211/211 通过；未连接真实船司、代理或浏览器，补充接口及调度策略不变。

### 第十七批：模块自注册与宿主边界

- module-catalog.test.mjs 新增 16 项：执行生产清单工厂和实际 Vue Router，验证单份注册生成菜单/路由、导航时才加载页面、角色权限、模块/根路径迁移与别名、关闭与快照隔离、生产加载器接线及各种缺失/重复/宿主冲突；模块名称不能覆盖宿主路由，选择参数须完整匹配。
- check-module-port-types.mjs 增加 9 项注册缺失字段、错误角色/路径、缺少页面 view、错误组件返回/异步签名、宿主加载器和输出消费负向检查。默认类型检查总计 31 项探针，另保留真实 SFC 故意错误回归。
- 前端行为 335/335、默认类型、i18n 与生产构建、质量门和 diff 检查通过。此批没有 UI 模板/样式、后端或外部请求变更；未重复运行浏览器视觉或真实服务器验收。

### 第十八批：管理员账号与模型配置

- admin-workflows.test.mjs 新增 25 项：真实 Vue effect scope 与两个生产工作流，替身只放在 API、确认和剪贴板端口。验证列表乱序/分页变更、账号切换往返、权限/销毁、表单与目标快照、密码规则、自身账号保护、失败重试、成功后的刷新故障、确认取消/去重、临时凭据清理、剪贴板乱序、模型草稿/密钥保留和清理、工作流互斥及写入时的刷新保护。前端全套 360/360。
- 默认 typecheck 包含管理员实际实现，新增 8 项服务输入/返回、身份、确认、记录及表单错误探针，总计 39 项。JS 源码禁止移除 @ts-check 或增加跳过指令；SFC 严格范围仍为 29/51，不把历史 AdminDashboard 的构建和 binding 检查算作完整模板类型覆盖。
- Playwright CLI 在真实管理员页面搭配隔离本地 API 验证创建、列表、重置密码与焦点恢复、模型刷新/保存及凭据清理。无页面运行错误，截图位于 output/playwright/framework-batch-eighteen/。没有访问真实后台或模型服务；追踪测试仍沿用上一批 211 项结果，本批未改追踪代码。

### 第十九批：管理员设备页

- admin-devices.test.mjs 新增 23 项：最新响应/分页快照、账号切换后返回、权限撤销/销毁、显示名更新、忙碌/离线拒绝、不可变确认目标、取消/确认异常、单次提交、已成功后的读取失败、写失败重试、末页纠正和晚到写入抑制。前端全套 383/383。
- 默认 typecheck 覆盖真实 useAdminDevices 服务合同，新增 5 项误用探针共 44 项；AdminDevicesPage 加入 strictTemplates，负向编译验证 props、字段、类型化表格插槽及事件参数；严格范围 30/52，宿主仍为历史 JS 模板绑定保护。
- Playwright CLI 本地 API 替身执行真实管理员页面：踢下线、取消/确认删除、21 条记录的第二页及删除后回第一页；实际请求各 1 次，桌面 1440px/移动 390px 截图在 output/playwright/framework-batch-nineteen/，无 pageerror。不是线上账号或数据库验收。
- i18n、生产构建、质量门和 diff 检查为本批结束验证；追踪/Java 未修改，沿用上一批的验收范围，不据此宣称新增真实网络覆盖。

### 第二十批：管理员公告与草稿归属

- admin-announcements.test.mjs 新增 36 项：最新读取/分页快照、初始化与用户入口区别、分页尺寸/末页纠正/旧纠正响应、读取失败、旧响应隔离、0 id 编辑、兼容可见范围、本地展示日期、DOM callback 归属、字段/URL 校验、固定写入参数、重复保存/关闭锁定、已发布编辑不改状态、写失败保留草稿、四类写成功但刷新失败、固定删除目标/取消、草稿阻断列表写入、封面/正文上传、上传期间重复动作、手动 URL 保留、关闭后新上传状态、无效上传结果、会话切换/撤权/销毁、确认期间切换和显示名修改。前端全套 419/419。
- 默认 typecheck 对真实公告实现新增 7 项误用探针，合计 51 项；错误服务参数/结果、确认返回值、上传文件/结果、编辑器回调参数、表单字段必须失败。未增加严格 SFC，仍为 30/52，历史宿主仅有 JS 模板编译绑定保护。
- Playwright CLI 本地 API/图片替身执行实际管理员组件：已发布内容 PATCH 不带 status；保存中关闭按钮锁定；创建/封面上传/正文插图；发布、停用、取消删除和确认删除。最终请求 PATCH/upload/create/delete 各 1 次，剩余 1 条，无 pageerror；桌面 1440px、窄屏 390px 及弹窗底部操作截图在 output/playwright/framework-batch-twenty/。仅界面和接线验收，不代表真实存储或生产部署。
- 类型、i18n、生产构建和质量门通过；后端与追踪未修改，不重跑或扩大上一批 Java/网络验收声明。

### 管理员公告编辑器与展示规则（第二十一批）

- announcement-presentation.test.mjs 新增 20 项：URL 协议/相对路径、跨部署存储图片、可移植路径、HTML 转义、inline code、链接/图片、安全 URL、标题/列表/引用/代码围栏、换行、内部 token 还原、摘要和动态 origin。announcement-editor.test.mjs 新增 8 项，执行真实编辑器与公告工作流组合，覆盖插图模式、文件选择与重新选择、正文不覆盖封面、无效文件、拖放、拖离、纯文本粘贴及关闭/销毁后动作。前端全套 447/447。
- 默认 typecheck 新增 6 项实际编辑器/展示端口负向探针，合计 57 项；AdminAnnouncementDialogs 加入严格模板范围，负向编译独立验证组件 props、表单/文案字段、格式参数、ClipboardEvent 和保存动作。当前 31/53 严格 SFC，22 个历史组件未纳入。
- Playwright CLI 使用真实 AdminDashboard/弹窗、本地 API 与图片替身，检查真实 DOM 序列化、格式按钮及选区、合法/非法链接、仅粘贴 plain text、正文拖图、封面上传及正文插图、保存提交锁定、预览、保存后重开、发布/停用、取消/确认删除。1440px 和 390px 截图位于 output/playwright/framework-batch-twenty-one/，窄屏单栏及按钮可达；动态引用和图片的 computed style 命中。最终 PATCH/上传/创建/删除为 1/2/1/1，无 pageerror。开发期另对照旧渲染器 161 组输入输出一致。
- 不以本地替身认定真实图片存储、数据库、线上部署或追踪网络通过；公告列表与文件模块仍待迁移，execCommand 保留原兼容性边界。

### 公告列表受控组件（第二十二批）

- announcement-labels.test.mjs 新增 5 项：旧 visibility 与 audience 优先级、小写发布状态、缺失/未知状态与范围回退、动态语言 getter。前端全套 452/452。
- AdminAnnouncementsPage 加入 strictTemplates：复制生产组件的行插槽缺失字段、publish/page 事件参数、日期格式化参数及 props 必须报错。真实标签工厂新增 2 项端口误用探针，累计 59 项；严格 SFC 32/54，历史 22 个仍待迁移。
- Playwright CLI 执行真实宿主及公告列表/弹窗，本地 API/图片替身回归 CRUD 与编辑器接线；另检查 21 条分页仅一次目标页 GET、重复发布仅一次 POST、末页删除纠正、0 id 编辑、旧 visibility、小写状态、动态语言、时间回退和空状态。1440px/390px 截图在 output/playwright/framework-batch-twenty-two/；窄屏操作栏与表格内部滚动、编辑器单栏和底部按钮可达，无 pageerror。
- 默认类型、i18n、构建、质量门与 diff 检查通过。未访问真实存储、数据库、船司或部署；不据此扩大后端/网络验收范围。

### 管理员文件与预览（第二十三批）

- admin-files.test.mjs 新增 19 项：两类查询协议、0 id、部分初始化成功、乱序与独立列表、过期筛选重置、末页纠正、会话往返/撤权/销毁、显示名更新、过期/已删除/忙碌守卫、下载目标快照、晚到错误、确认固定目标/取消/去重、软删除后刷新故障、写失败重试。
- admin-file-preview.test.mjs 新增 13 项：类型分类与 Office/未知二进制回退、图片/PDF URL 释放、关闭晚到 Blob、延迟文本解析隔离、会话/撤权/销毁清理、错误归属及重试、1 MiB 文本解码、HTML 惰性显示和删除目标匹配。前端累计 484/484。
- 默认类型包含真实文件服务及预览端口的 9 项新误用探针，共 68 项；新弹窗 props、状态字段及方法参数进行实际生产组件负向编译，严格 SFC 33/55，历史 22 个仍待迁移。
- Playwright CLI 使用真实宿主/弹窗及本地 API/Blob 替身：21 条分页单次 GET、下载 2 次且原文件名、过期下载禁用、软删除只请求一次、成功后刷新故障保留 DELETED 行、文本惰性显示、Office 下载提示、图片/PDF URL 释放、关闭后晚到响应、Tab/Escape/恢复焦点、撤权清空。无 pageerror，1440px/390px settled 截图在 output/playwright/framework-batch-twenty-three/。PDF 仅占位字节，不验真实内容；未验证真实后台存储、网络取消或服务器部署。
- 生产构建、质量门、默认类型及 diff 检查通过。文本仅限制解码显示，已开始的原下载副作用保留现状。

### 管理员文件列表与展示（第二十四批）

- admin-file-presentation.test.mjs 新增 10 项：大小单位及异常值、日期验证和动态格式化、0/null 编号、行键、扁平/嵌套票单编号、对象/字符串引用、上传人及实时角色文案、可见范围旧值与语言、deletedAt 优先及规范化待处理状态。前端全套 494/494。
- 默认 typecheck 新增 4 项真实展示工厂误用，累计 72 项；AdminFilesPage 加入严格模板检查，生产组件插槽缺失工作区/货运字段，props、行/分页/筛选事件、日期参数和 DOM Event 的故意错误均须报错。严格 SFC 34/56，历史 22 个未据此认定完成。
- Playwright CLI 使用真实宿主/列表/预览及本地 API/Blob：两套分页与过期筛选、原文件名下载 2 次、删除确认/取消/重复点击仅 1 次、删除成功刷新失败保留审计行、预览类型/晚到响应/URL 释放、Tab/Escape/焦点及撤权。额外验证 0 编号、deletedAt、非法时间/大小、中英文切换和 scoped 信息分行/标签样式；1440px/390px 页面无水平溢出，表格滚动和操作可达，截图位于 output/playwright/framework-batch-twenty-four/，无 pageerror。PDF 占位字节仅验证接线。
- 质量门、默认类型、i18n、生产构建与 diff 检查通过，不连接真实后台、数据库或船司，也不扩大底层传输取消验收。

### 管理员账号模板与弹窗（第二十五批）

- admin-workflows.test.mjs 补充 0 id 编辑、用户名不进入更新 payload、数字/字符串自身保护；dialog-lifecycle.test.mjs 补充工作流初始按钮焦点不被 helper 覆盖，前端全套 496/496。
- 复制真实 AdminEmployeesPage/AdminEmployeeDialogs 进行负向编译，错误 props、表格插槽字段、行/页码/MouseEvent、表单字段、按钮 ref 和工作流参数须失败。严格 SFC 36/58，真实端口误用检查仍 72 项。
- Playwright CLI 使用真实宿主与本地 API/剪贴板替身：新增、0 id 编辑/固定用户名、提交锁定、自身动作保护、重置初始焦点/Tab/Escape、复制等待/完成/关闭清密、启停、删除确认取消/执行、21 条分页单次请求、末页回退、撤权关闭/解锁、中英文及桌面/窄屏。复制完成后的 body 焦点丢失经页面复现后修复，关闭/撤权不抢焦点。截图等待有限入场动画结束，位于 output/playwright/framework-batch-twenty-five/，无 pageerror。
- 类型、质量门、i18n、生产构建和 diff 通过；真实账号服务、OS 剪贴板权限、数据库、船司网络与部署不在本批验收范围。

### 管理员系统配置（第二十六批）

- admin-llm-presentation.test.mjs：4 项生产工厂行为回归，覆盖配置状态、缺失/空密钥预览、未配置与原始密钥隔离、语言切换。
- admin-workflows.test.mjs：新增替换/清除后清理输入且只保留 masked 响应；先读 dirty，再保存非敏感模型/开关草稿，验证 baseline 更新触发 dirty 重新计算。全前端 502/502。
- 默认 typecheck 增加实际新页面 props、表单/已保存配置/监控字段及调用参数负向回归，严格 SFC 38/60；真实展示端口新增 4 项误用，累计 76 项，不计入 Node 测试数量。
- Playwright CLI 使用真实宿主、两个新组件和本地 API 替身验收提交锁定/去重、保留/替换/清除/冲突、失败重试、刷新与页面重挂保持草稿、退出登录清密和迟到响应隔离、中英文、监控未知/0/无效日期、桌面1440px与手机390px单列且无水平溢出。截图 output/playwright/framework-batch-twenty-six/ 已查看；无 pageerror。未验真实数据库、模型供应商或服务器部署。

### 管理员框架收口及独立验收（第二十七批）

- 新增行为50项：admin-overview7、admin-console-copy2、admin-business-lists17、admin-console12、admin-independent-acceptance7、admin-auth-adapter5。全前端552/552，含真实生产工厂组合及实际API/client/session模块测试。
- 默认typecheck覆盖45/67 SFC（25 module、20 feature），94项真实端口/注册误用负向探针。七个新页面/壳复制生产源码注入错误props、字段、事件；四类表格插槽也检查行字段。宿主JS装配不计为严格模板迁移，历史仍22个。
- 联合回归覆盖并行部分成功、busy写锁、0/空编号、账号/角色更换、dispose晚响应、有效分页及末页缩减；退出API显式原令牌、晚200/401不清新令牌、失败清原令牌、纯登录和默认兼容分别运行生产适配器。
- Playwright CLI使用真实AdminDashboard/七个新组件及本地fetch替身：4图切页dispose/重建、审计/客户/票单/交接21条两页、客户取消不DELETE、末页和0编号删除仅一次、成功后总览503仍保留删除结果、中文英语、BUSINESS/空id拒绝、0管理员、登录用户名trim/密码空白保留、退出清密码。1440px/390px截图output/playwright/admin-batch27/，图表及登录/表格窄屏布局人工查看，无pageerror。
- 质量门、i18n、Vite生产构建和diff检查通过；未连接真实后端、数据库、船司、服务器或投放平台。普通API旧401全局行为仍为既有独立风险，本轮只隔离退出请求。
