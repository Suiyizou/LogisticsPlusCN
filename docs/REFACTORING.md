# 渐进重构与验证

## 当前完成范围

第一批迁移 `GET /api/business/customers` 的客户目录查询。接口仍返回
`{ "items": [...], "total": ... }`，保留原来的 20 个客户字段、空值、UTC 时间字符串、
客户排序和三种员工的数据范围。列表仍为完整列表；分页属于下一次接口变更，不能
在本次重构中偷偷改变 `total` 的含义。

查询路径：

```text
BusinessCustomerController
  -> BusinessCustomerService（原入口兼容委托）
  -> CustomerDirectoryService
  -> CustomerDirectoryScope（从认证身份确定可见范围）
  -> CustomerDirectoryMapper + CustomerDirectoryMapper.xml
  -> MySQL
```

`customer/dto/` 存放类型明确的目录响应；`customer/persistence/` 存放 Mapper 和
时间类型处理器；SQL 放在 `resources/mappers/customer/`。使用 MyBatis starter 3.0.5，
与当前 Java 17 / Spring Boot 3.5 配套。`JdbcTemplate` 与 MyBatis 共用 Spring 数据源，
这批只读查询没有增加独立数据源或事务管理器。

旧查询每返回一个客户，就再查询一次分配员工。新查询通过 LEFT JOIN 一次取回员工信息，
SQL 往返次数从 `1 + 客户数量` 减少到 1。`cp_customer_employee_assignments.customer_id`
为主键，因此这个 JOIN 不会产生重复客户。票单数量仍按原逻辑统计所有绑定，包含未发布
绑定，使用相关 COUNT 子查询；减少数据库往返不等于消除数据库内部的统计成本。

权限范围：管理员读取全部有效货主/收货人，业务员读取自己负责的客户，海外代理读取分配
给自己的客户。缺失或不支持的身份在查询前返回 403。失效的员工分配不会删除客户行，
只将员工显示字段返回 null，与原接口一致。

## 验证入口

需要 Java 17、Maven 和 Node.js 20+，以及 backend 的 Maven 依赖、frontend 和
tracking-service 的 npm 依赖，以及根目录的格式和 Lint 依赖。首次准备依赖：

```sh
npm ci --include=dev
npm --prefix frontend ci --include=dev --ignore-scripts
npm --prefix tracking-service ci
```

前端这里只准备 Web 构建与回归测试，跳过 Electron 安装脚本。需要桌面打包时，在
frontend 目录执行 `npm rebuild electron`，准备 Electron 运行时后再执行桌面构建。

在仓库根目录执行：

```sh
npm run verify                  # 质量、类型、功能、发布、后端、追踪、装箱和构建
npm run verify:backend          # 后端全部 JUnit 测试
npm run verify:tracking         # Node 追踪服务全部测试
npm run verify:packing          # 现有装箱算法回归脚本
npm run verify:frontend         # i18n 检查 + Vite 构建
node scripts/verify.mjs backend tracking  # 选择多个检查
```

命令兼容 Windows 和 Linux/macOS，任意检查失败立即返回非零退出码。现有前端装箱检查
保留原脚本，尚未迁移到统一的前端测试框架。这些命令可以作为后续 CI 的任务入口；
本批尚未配置远端 CI。

新增后端测试覆盖角色隔离、无权限身份、归档客户过滤、员工失效、空值、时间格式、
排序、多条客户只执行一个 SQL、Spring Boot 自动发现 Mapper，以及 HTTP 返回值与
既有客户详情元数据的逐字段一致性。数据库测试使用 H2 的 MySQL 模式，仍需在真实
MySQL 8.4 的测试环境验收，不能据此断言线上部署已验证。

`.gitattributes` 与 `.editorconfig` 将源码约定为 UTF-8 / LF；Windows 命令脚本使用
CRLF。没有对历史源码执行整仓库换行归一化，避免给审查混入大量无关差异。追踪服务
读取源码的回归检查显式归一化 CRLF，避免 Windows 工作树换行引发假失败。

### 本批验证记录（2026-10-06）

| 检查                       | 结果                                               |
| -------------------------- | -------------------------------------------------- |
| 后端全部 JUnit             | 25 个测试类、200 项测试通过，无失败或跳过          |
| Node 追踪服务              | 103 项测试通过                                     |
| 装箱算法                   | 4 组既有回归脚本全部通过，包含大批量家具与恢复场景 |
| 前端                       | 650 条既有 i18n 基线检查通过，Vite 生产构建通过    |
| 差异格式                   | `git diff --check` 通过                            |
| 真实 MySQL / Docker / 线上 | 尚未验证；本机 Docker 引擎未启动，没有执行生产部署 |

统一入口执行到前端构建时，首次因本地未安装 Vite 而失败；按锁文件安装前端依赖后，
使用 `node scripts/verify.mjs frontend` 单独重试通过。前面的后端、追踪与装箱检查已经
通过，未重复运行耗时较长的装箱场景。验证使用本地数据库测试夹具与模拟请求，未进行
真实船司抓取或在线账号操作。

## 下一批迁移顺序

1. 拆客户写操作：创建、修改、归档与删除；先保持现有事务、审计、重复身份检查与会话吊销。
2. 拆客户交接与代理分配：独立应用服务与 Mapper，保留交接原子性和票单权限。
3. 拆票单绑定、快照与附件：明确事务边界；为列表单独设计分页与索引，并测量 MySQL 执行计划。
4. 拆 Node `server.mjs`：路由、船司适配器、代理调度、浏览器会话与错误转换；保留现有回归测试。
5. 拆 Vue 大页面与追踪页面：按业务区域分组件、API 模块和状态；装箱算法独立成纯计算模块。
6. 数据库迁移纳入 Flyway：先比对实际数据库、初始化脚本与运行时补表逻辑，再建立基线。

本批没有接管线上数据库版本。不能直接移除 SchemaInitializer 或对现有生产数据库执行
未经核验的 Flyway baseline。部署前需要真实数据库备份、结构比对、迁移演练和回滚验证。

后续按一个业务入口一个变更批次实施；新接口先写 DTO，权限在应用服务校验，SQL 通过
Mapper 管理。复杂 SQL 仍可以保留手写形式，目标是让职责、类型和事务清晰，而不是
强制把查询改为无法审查的自动生成逻辑。

---

# 第二批及以后（T02–T12）

详细模块清单、任务状态与阻塞项见 [MODULE_INVENTORY.md](MODULE_INVENTORY.md)。

## T02 工程规范

见 [ENGINEERING.md](ENGINEERING.md)。Prettier + ESLint 变更棘轮、`tsc --noEmit`、
Checkstyle 新包门，统一入口 `node scripts/verify.mjs`（新增 `quality`、`typecheck`）。

## T03 回归测试

见 [TEST_MATRIX.md](TEST_MATRIX.md)。新增 `HttpAuthorizationRegressionTest`（真实
`WebConfig` 路径规则 + 真实拦截器，覆盖公开路径豁免、401、三角色 403、双通道 token 隔离、
OPTIONS 预检）。后端测试 200 → 208（含代理一次性口令回归）。

## T06 数据库迁移（Flyway）

- `backend/src/main/resources/db/migration/V1__baseline.sql`：与 `backend/sql/schema.sql`
  等价的初始结构（去掉 `CREATE DATABASE` / `USE`）。
- `application.yml`：`spring.flyway` 开启，`baseline-on-migrate=true`、`baseline-version=0`。
- 真实 MySQL 8.0.42 验证：
  - 空库启动 → 应用 V1，业务表 34 张 + `flyway_schema_history`；
  - 已有 34 张表、无 history 的库启动 → 先写 BASELINE(0) 再幂等执行 V1，数据保留。
- **未**删除 `SchemaInitializer`；其补列逻辑后续逐条转为 V2+ 迁移，避免盲目 baseline。

## T10 Docker 与部署

- `docker/backend.Dockerfile` 安装 curl 供健康检查；`docker-compose.yml` 增加 backend
  健康检查，前端 `depends_on` 改为 `service_healthy`。
- `scripts/backup.sh` / `deploy.sh` / `rollback.sh`：备份数据库、密钥卷与版本；部署后
  冒烟前端与追踪；失败打印回滚命令（不自动回滚）。
- `docker compose config` 与脚本 `bash -n` 通过；容器实跑受 Docker 引擎阻塞。

## T11 CI

见 [CI.md](CI.md)。`.workflow/ci.yml` 使用 Gitee Go 实际语法（`build@nodejs` /
`build@maven` / `build@docker`），执行命令与本地一致。远端触发需要仓库流水线/Runner 权限。

## T12 本地验收

见 [ACCEPTANCE.md](ACCEPTANCE.md)。真实 MySQL 8.0.42（临时实例）完成 schema、后端 API、
MyBatis 目录查询（单次请求 1 条客户查询）与 Flyway 两条路径；追踪服务 `/api/health` 正常。
Docker 引擎未启动，容器编排、浏览器全栈与回滚演练未执行。

## T04/T05 拆分进展与后续方案

`BusinessCustomerService`（原 5226 行）与 `ShipmentTrackingService`（3591 行）共享大量
私有 guard、审计、select 与 mapper，直接搬移会造成循环依赖。因此采用“先抽共享支撑层，
再抽领域服务”的组合式拆分。

### 已完成：批次 1（HTTP 鉴权/审计/输入规则 + 海外代理领域）

新增（均纳入 Checkstyle 门）：

| 类                     | 职责                                                      |
| ---------------------- | --------------------------------------------------------- |
| `CustomerAccessGuard`  | 运营读取 / 业务管理 / 转移管理 / 管理员权限守卫           |
| `CustomerInputRules`   | 用户名、显示名校验，内部密码校验，删除账号登录名生成      |
| `CustomerAuditService` | 客户域审计写入（CUSTOMER / SHIPMENT / 自定义 targetType） |
| `OverseaAgentService`  | 代理账号 CRUD、可用代理列表、代理范围同步（`sync*`）      |

结果：`BusinessCustomerService` 5226 → 4873 行；代理领域逻辑 440 行独立；
`BusinessCustomerService` 对 guard / 规则 / 审计 / 代理全部改为薄委托，Controller 与
外部接口签名不变。事务语义保持一致（批量建代理仍在同一 Bean 内整体事务；`sync*` 加入
调用方事务）。后端 208 项测试全绿，Checkstyle 通过。

### 已完成：批次 2（共享客户查询/访问判定）

新增：

| 类                      | 职责                                                                                                              |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `CustomerRecord`        | 客户档案只读投影（由内部 record 提升为包级类型）                                                                  |
| `CustomerLookupService` | `baseCustomerSelect`、按角色可见的 `requireManaged/TransferCustomer/AccessibleCustomer`、客户元数据投影、会话吊销 |

`BusinessCustomerService` 对这些能力改为薄委托，`CustomerRecord` 成为多个领域服务可共享的类型。
这是拆分交接、绑定、客户建档的前置：这些域都依赖“按角色取客户”的同一套逻辑。
`BusinessCustomerService` 4873 → 4707 行，后端 208 项测试全绿。

### 已完成：批次 3（客户交接域）

新增 `CustomerHandoverService`（907 行）：直接交接 `handoverCustomers`、交接列表/详情、
审核批准/驳回，以及交接请求查询/校验/审计。共享能力通过 `CustomerAccessGuard`、
`CustomerAuditService`、`CustomerLookupService` 组合注入；新增 `CustomerLookupService.lockShipment/
lockCustomer` 与 `UNIQUE_PARTY_ROLES` 共享，避免跨服务复制行锁逻辑。

`BusinessCustomerService` 4707 → 3899 行（较初始 5226 行减少 1327 行），交接公开方法改为
薄委托，Controller 与接口签名、`@Transactional` 边界均不变。H2 全量 208 项通过，
交接的三个既有用例（直接交接、不可重复审核、校验失败回滚）继续通过，Checkstyle 通过。

### 已完成：批次 4（代理-客户关联归入代理域）

把 `listOverseaAgentCustomers` / `updateOverseaAgentCustomers` 与
`requireOverseaAgent(CustomerRecord)` 从 `BusinessCustomerService` 移入 `OverseaAgentService`，
使“代理账号 + 代理分配”在同一领域服务内。同步把这 4 条 SQL 迁到 `OverseaAgentMapper`
（`findLinkedCustomers` / `findLinkedCustomerIds` / `deleteAgentCustomers` / `upsertAgentCustomer`），
新增 `LinkedCustomerRow` DTO，`assigned_at` 用 `UtcTimestampStringTypeHandler` 保持 UTC 字符串输出。

`BusinessCustomerService` 3899 → 3796 行；代理公开方法改为薄委托，接口与事务边界不变。
H2 全量 208 项通过，Checkstyle 通过。

### 已完成：批次 5（客户建档/生命周期域）

新增 `CustomerProfileService`（508 行）：客户详情、单个/批量创建、编辑、启用/停用、删除/归档、
重置客户码与密码，以及客户输入规则（状态/身份/客户码/密码）与口令生成。新增共享
`CustomerShipmentAccessPolicy`（同票单角色唯一性校验）与 `CustomerInputRules.normalizeCode`。

`BusinessCustomerService` 3796 → 3397 行（较初始 5226 减少 1829 行）；公开方法改为薄委托，
接口与 `@Transactional` 边界不变。H2 全量 208 项通过，Checkstyle 通过。

### 已完成：批次 6（票单快照/追踪只读查询）

新增 `CustomerShipmentQueryService`（906 行，纯只读）：业务端票单快照列表（4 个重载）、
批量追踪候选、单票快照查询，以及计数/业务状态 SQL/ETA 排序/JSON 映射。
同时抽出共享工具：`ShipmentReferences`（参考号与批量 ID 规范化、COSCO 数字身份、JSON 文本）
与 `ShipmentRowMappers`（时间格式化、刷新结果字段），供查询与绑定两域共用。

`BusinessCustomerService` 3397 → 2588 行（较初始 5226 行减少 2638 行，约 50%）；
公开查询方法改为薄委托，接口与事务边界不变。H2 全量 208 项通过，Checkstyle 通过。

### 已完成：批次 7（客户转移/代理分配）

新增 `CustomerTransferService`（239 行）：批量把客户分配给内部海外代理账号或遗留代理客户，
保留票单绑定与历史，同步代理范围与票单参与人。`BusinessCustomerService` 2588 → 2406 行。

### 已完成：批次 8/9（共享运单查询 + 票单绑定域）

新增 `ShipmentLookupService`（281 行，共享运单解析/行锁/绑定读取）与顶层 `ShipmentRecord`；
新增 `CustomerShipmentBindingService`（332 行）：单个/批量绑定、删除票单、发布状态、解绑、
客户侧票单列表。`BusinessCustomerService` 2406 → 1944 行（较初始 5226 减少约 63%）。

### 已完成：批次 10/11（票单写域 + 客户端匹配）——T04 收尾

新增 `CustomerShipmentMutationService`（创建/导入冲突/指定客户创建/手工快照/更新/删除/备注/发布校验）
与 `CustomerClientMatchService`（导入客户端匹配队列）。

**`BusinessCustomerService` 从 5226 行降到约 600 行（减少约 88%）**，现在只保留 HTTP 入口委托、
共享 guard/lookup 委托与少量元数据投影，成为薄门面。完整分层：

```text
Controller -> BusinessCustomerService（门面）
  -> CustomerProfileService / CustomerTransferService / CustomerHandoverService
  -> OverseaAgentService / CustomerShipmentQueryService / CustomerShipmentBindingService
  -> CustomerShipmentMutationService / CustomerClientMatchService
共享: CustomerAccessGuard / CustomerInputRules / CustomerAuditService / CustomerLookupService
      ShipmentLookupService / CustomerShipmentAccessPolicy / ShipmentReferences / ShipmentRowMappers
```

H2 全量 208 项通过，Checkstyle 覆盖全部新类。

### 已完成：T05 批次（海外代理模块 SQL 迁移）

`OverseaAgentService` 中全部 JdbcTemplate 语句（3 条读 + 15 条写/同步）迁到
`OverseaAgentMapper` + `mappers/customer/OverseaAgentMapper.xml`，参数全部 `#{}` 绑定，
新增 DTO `OverseaAgentListRow` / `BusinessAgentListRow` / `OverseaAgentRow`。
JSON 输出形状保持不变（如代理列表 `id` 仍为字符串）。H2 全量 208 项通过，
真库冒烟创建/列表/禁用/删除全部 200，删除后操作返回 404。

### 已完成：框架模块拆分（2026-10-10）

追踪入口从 1,515 行收敛到 82 行，将 HTTP 服务、请求控制器与 COSCO runtime 分离。
前端将票单详情状态拆为 composable，将工作台图表拆为组件、纯配置及资源管理模块。
统一验证入口包含前端功能模块测试；不再通过 VM 拼装 Vue 页面中的生产函数。
详细依赖方向、验证边界和后续批次见 [FRAMEWORK_REFACTOR.md](FRAMEWORK_REFACTOR.md)。

第二批进一步抽出批量任务、导入/刷新操作与进度展示；任务观察与弹窗解耦，修复取消和
卸载竞态、Excel 解析乱序。角色菜单和业务 URL 共用配置，Vue Router 处理详情与历史。
质量门增加 Vue JS SFC 未定义变量检查。该批前端功能模块 70 项、追踪回归 119 项，
格式、Lint、类型范围检查、i18n 扫描和生产构建通过。真实浏览器 DOM 仍待独立验收。

第三批把客户目录与关联资源、客户写操作、票单列表/筛选/勾选及快照标准化移入独立模块。
修复客户切换后的旧资源残留、后台刷新覆盖未保存编辑、旧目录读取覆盖写入、跨客户保存回填、
部分删除失败后的列表同步和分页响应乱序。分页动效计时器也随作用域释放。
新增客户工作区 23 项、票单列表/模型/分页 13 项；前端功能模块当前 106 项，追踪回归仍为 119 项。

### 后续批次（每步可独立验证）

第四批已抽出客户批量导入、代理管理及客户交接流程，并将代理表格规则移到纯模块。
统一客户/代理/交接写锁，增加解析与列表版本保护、凭据清理及中断队列派发；直接交接成功后
刷新客户和票单范围。新增 42 项真实 composable/XLSX 回归，前端功能模块当前 148 项。

优先继续拆业务页面的各列表/表单/批量弹窗模板、手工票单创建/导入及个人资料流程，再扩大路由与类型保护。
后端客户域已完成职责拆分，下一步迁移剩余域的 SQL 到 Mapper；不重复做已经完成的 Service 拆分。
追踪后端继续分离船司调用与快照持久化，Node runtime 继续拆 endpoint 和通道执行器。
每批保持权限、事务、取消、刷新与发布行为的独立回归。

### 第七批：业务模块页面与公共操作（2026-10-11）

客户目录/详情、票单详情与批量追踪/业务字段弹窗由各模块页面渲染；客户与票单的关联写入各自拥有固定对象的工作流。新增 ID 导航及双端刷新命令、开发环境可运行的新模块样板。修复部分绑定失败误报成功、关联读取失败仍报告刷新完成、代理管理入口露出和移动端表单裁切。

本地前端 233 项行为测试、客户/票单批量导入检查、质量门、现有类型检查、i18n 和生产构建通过；真实 Vue 浏览器配合拦截 API 验证详情/弹窗、样板错误重试、角色入口及 390px 布局。证据和未迁移边界见 [FRAMEWORK_REFACTOR.md](FRAMEWORK_REFACTOR.md)。客户弹窗、代理/交接模板及父容器 workflow 创建仍待下一批，不将页面拆分称为全部框架重构完成。

### 第八批：客户、代理与交接模块组件（2026-10-11）

迁移客户六类弹窗、代理目录与两个弹窗、交接页面与两个弹窗；页面使用独立加载器，弹窗宿主接回唯一生产 workflow。提取共用焦点生命周期与 scoped 弹窗样式，清理父容器已迁出专属选择器。改密结果关闭、权限变化和销毁时清空凭据，阻止晚到复制回调影响新弹窗；补录受控关闭和客户码浏览器校验修复。

前端行为测试当前 243 项，客户与票单 XLSX 检查、质量门、现有类型范围、i18n 和生产构建通过。真实浏览器配合拦截 API 验证客户、代理、交接提交、关闭保护、角色入口及桌面/390px 布局；不替代生产认证或数据库验收。父容器总览、workflow 创建、历史样式及其他工作台仍待后续，接入规范见 [MODULE_GUIDE.md](MODULE_GUIDE.md)。

### 第九批：总览路由与客户域组装（2026-10-11）

总览独立管理读取、统计校验与图表资源，父容器不再渲染旧条件模板。账号/角色改变和离开页面阻止旧响应回填，普通失败明确缓存范围，401/403 不展示缓存。客户表单、代理、导入、交接和凭据由容器作用域的 useCustomerOperations 注入服务与权限后创建，共用唯一目录和写锁；列表与总览使用相同日期规则。

新增 19 项回归，前端总计 262 项；客户/票单 XLSX、质量门、现有类型范围、i18n 与构建通过。真实 Vue 浏览器与拦截 API 验证总览图表、失败/权限/晚到响应、双语、目录状态及客户/代理/交接写入接线、弹窗和窄屏。票单组装、模块合同、历史样式和其他工作台仍待后续；本批没有修改后端或部署线上。

### 第十批：票单组装、页面合同与列表写入（2026-10-11）

- useShipmentOperations 在同一容器作用域创建列表、详情、建单/导入、批量任务和列表写入；继续使用同一客户目录、选中票单与追踪通道，路由切换不另建工作流。服务、反馈、导航和文件适配器由入口注入。
- createShipmentModulePages 明确投影列表、弹窗与详情合同；状态仍是原生产 ref，没有复制表单或创建第二套 store。移除父页面遗留的票单列表直接 API 写入。
- 批量字段编辑、单张/批量删除与列表追踪增加权限、身份版本、作用域与固定目标保护。选择/筛选 A→B→A 也不清除新勾选；写入成功但列表读取失败报告读取失败，不诱导重复写入。编辑失败保留草稿，提交与刷新中禁止关闭弹窗。
- 列表追踪复用共享传输端口和 AbortController，取消或卸载忽略晚到结果；批量任务启动、恢复、取消与打开增加直接调用的角色守卫。OperationsEntry 的工作区 key 随账号或角色变化重新创建作用域，显示名称修改保留原实例。

新增列表写入 16 项和票单组合/合同/会话 7 项，前端总计 285 项。质量门、现有类型范围、客户/票单 XLSX 检查、i18n 与生产构建通过。真实 Vue 浏览器与全量拦截 API 验证批量字段失败重试和忙碌关闭保护、详情保存/刷新/返回、手工建单、导入入口、跨路由批量任务观察、删除、只读入口以及桌面/390px 布局。截图在 output/playwright/framework-batch-ten/；不代表真实账号、船司、数据库或线上集成验收。

本批未修改后端接口、数据库、定时刷新调度或部署。客户/代理/交接合同投影、展示辅助函数和父页面历史样式仍待后续；列表命令的互斥保护不等于所有票单写入已有统一事务锁。

### 第十一批：客户、代理、交接合同与票单展示规则（2026-10-11）

- 客户、代理和交接的页面及弹窗合同分别由 createCustomerModulePages、createAgentModulePages、createHandoverModulePages 组装，并通过各模块 index.js 导出；票单合同也改用公共入口。父容器只注入原 workflow、权限、导航、格式化及共享资源，不再拼接这三个模块的逐项状态和动作。
- 所有投影仍引用同一 ref 和受控命令。客户详情使用原目录与票单绑定流程，代理创建刷新同一分配代理列表，交接继续共享目录和写锁；重新组装合同不重建请求、表单或凭据会话。表格与文件 input 仍写回原 workflow。
- shipmentPresentation.js 独立管理业务状态优先级、订舱查询编号、客户展示及绑定身份规则，不读取组件、浏览器或服务。客户目录和关联索引由调用方显式传入，避免模块移动后依赖旧父页面闭包。父页面仅保留读取最新目录的适配与翻译包装。
- 清理父页面已迁出的未使用解构、辅助函数和导入。旧客户导入检查移除依赖父页面函数名称的断言；保留实际模块 UI 检查，并增加真实 XLSX 写出/读回验证，页面接线由生产 workflow 行为测试覆盖。

新增模块页面协作 8 项、票单纯展示规则 8 项，前端总计 301 项。客户/票单 XLSX 检查、质量门、现有类型范围、i18n 与生产构建通过。

Playwright CLI 使用真实 Vue 页面与全量拦截 API，验证客户编辑、快速导入、改密、客户码补录、分配代理、代理创建、同文件再次选择及 Excel 导入、固定参数的业务交接、提交中关闭保护、焦点恢复、海外代理角色入口和桌面/390px 布局。截图在 output/playwright/framework-batch-eleven/；无页面运行错误。接口采用替身，本批不代表真实服务器、数据库、船司或认证集成验收。

父容器仍负责生命周期组装、服务注入、导航、翻译及部分历史样式。管理员大页面、独立追踪工作台与完整 Vue 模板类型保护仍待后续；本批未修改后端接口、数据库、定时刷新调度或部署。

### 第十二批：模块模板类型与宿主展示/布局（2026-10-11）

三个 agent 补齐剩余前端框架：18 项惰性展示接口、工作区提示生命周期、父历史 CSS 收敛与 25 个模块 TS SFC 严格模板检查。独立追踪返回地址跟随命名路由并保留详情/query/hash，权限变化及销毁后禁用。行为回归共 318 项；两种 XLSX、默认类型与真实模板负向回归、i18n 和构建通过。18 组页面/弹窗、3,191 个可见元素样式前后零差异，实际浏览器复验详情、双语、返回链接及客户弹窗操作。

类型仍未覆盖另外 26 个历史/feature SFC，宿主部分 JS 输入尚待显式合同化；模块自身重复样式、管理员/追踪工作台与后台服务继续独立批次。接入规范和证据边界见 [MODULE_GUIDE.md](MODULE_GUIDE.md)、[FRAMEWORK_REFACTOR.md](FRAMEWORK_REFACTOR.md)。

### 第十三批：显式模块边界与 feature 类型保护（2026-10-11）

四个页面工厂、注入上下文、公共命令与展示工厂有明确输入/输出合同；分页保留行类型，共享文件 input/table 守卫保留真实实例。控件回调过滤错误类型，未知表格行只解析到当前真实客户记录。新增四个 feature TS SFC，使严格模板范围达到 29/51；默认 typecheck 验证真实工厂接线与 22 项端口误用，禁止用跳过指令宣称覆盖。

独立追踪页抽出纯响应/诊断规则与兼容路由判定，当前权限拒绝诊断读取，技术显示遮盖常见凭据；业务 404 保留权威结果，不错误回退。前端行为 319 项、Node 追踪 132 项；两类 XLSX 继续验证真实表格往返。完整批次与后续工作见 FRAMEWORK_REFACTOR.md 第十三批。历史 22 个 SFC、内部服务合同、管理员/追踪工作台业务拆分仍待后续，本批不改调度或部署。

### 第十四批：COSCO endpoint/session 客户端（2026-10-11）

接口协议、载荷解码、超时/取消、公共页会话缓存与 Cookie 过期重试迁到 cosco-endpoint-client.mjs。runtime 注入原 upstream/gate/按出口状态，健康监控也使用这个客户端；通道选择、代理轮换、监控和资源释放仍由原 runtime 管理。接口/会话方法体迁移时逐字校验一致，不改变调度策略。

新增客户端 21 项与 runtime 健康探测 1 项行为回归，原业务码保护的源码断言改为执行生产调用链；追踪全套 154/154、质量门和 diff 检查通过。后续继续分离通道执行与回退编排；管理员 UI 和剩余历史 SFC 仍属独立批次。完整边界与验收记录见 FRAMEWORK_REFACTOR.md 第十四批。

### 第十五批：COSCO 通道执行与授权回退（2026-10-11）

cosco-channel-executor.mjs 执行单个已选通道并统一快照/浏览器错误；cosco-fallback-runner.mjs 编排授权、代理尝试及单次独立出口浏览器回退。runtime 显式注入原 endpoint/upstream/pool/Cookie 状态，不复制队列、熔断器或会话，不改变公开 API、资源关闭和调度。方法体迁移时逐字校验，代理配置可用性改为明确布尔端口。

新增通道 12、回退 16 和 runtime 接线 2 项行为回归，追踪全套 184/184 通过。覆盖状态共享、取消、出口隔离、顺序、失败聚合和权限边界，外部网络与浏览器使用替身。完整边界见 FRAMEWORK_REFACTOR.md 第十五批；剩余补充详情工作流、浏览器资源作用域和独立 UI 仍待后续。

### 第十六批：COSCO 补充详情工作流（2026-10-11）

cosco-supplemental-workflow.mjs 接管来源选择、订舱参考/箱详情查询、部分失败和网络/浏览器结果投影。方法体逐字迁移；runtime 注入同一 endpoint/upstream/gate、授权回退和通道执行函数。主查询与补充查询仍串行共享原 gate，不更改返回结构、自动刷新或资源关闭。

新增工作流 26 项与共享队列接线 1 项行为回归，两项源码断言改为生产 runtime 行为测试；追踪全套 211/211 通过。网络、浏览器和池控制采用替身，不作为线上验收。补充查询取消协议与浏览器资源生命周期仍待后续，接入约束及验收见 FRAMEWORK_REFACTOR.md 第十六批。

### 第十七批：模块自注册与骨架组装（2026-10-11）

内置五个业务模块及开发样板的菜单/路由/权限/加载器归入各自 module.js；宿主只维护 registry.js 顺序清单，views.js 自动合并模块加载器。元数据和函数分别组装，保留公共入口与旧路由接口；注册校验模块自己的加载器、关闭模块合同和宿主加载器冲突，路由校验最终树名称，防止新增模块静默覆盖原入口。

新增 16 项真实路由与合同回归，前端 335/335；默认类型检查含 31 项端口/注册负向探针。类型、i18n、构建与质量门通过。接入示例见 MODULE_GUIDE.md，边界与后续见 FRAMEWORK_REFACTOR.md 第十七批。按用户最新要求，优先历史工作台与代码骨架，暂缓网络链路优化；本批未改页面样式、后端、调度或部署。

### 第十八批：管理员工作流边界（2026-10-11）

账号管理和模型设置分别迁入 features/admin，用显式服务/反馈/确认端口和账号作用域组织状态。提交使用固定快照，阻止重复提交；权限撤销、销毁和账号切换清空敏感状态并抑制晚到响应。账号写成功与列表刷新失败分开，模型刷新保留未保存草稿，保存只清理提交的旧密钥。

新增 25 项行为回归，前端 360/360；默认端口负向探针 39 项。真实管理员页面验证账号创建、重置和焦点，以及配置刷新/保存；使用本地替身，没有外部请求或部署。模板仍在历史宿主，严格 SFC 范围保持 29/51，下一批继续公告、文件、设备及模板组件化。细节及验收边界见 FRAMEWORK_REFACTOR.md 第十八批。

### 第十九批：设备管理组件与作用域（2026-10-11）

设备列表、踢下线和删除独立为 useAdminDevices；AdminDevicesPage 接收明确类型的展示 props 并发出操作事件，与宿主共享原表格样式。写操作快照固定对象，阻止重复提交；旧账号响应不会回填新会话，删除末页记录可回到有效页。已提交动作后的列表读取失败单独提示，页头区分当前页在线量与服务端设备总量。

新增 23 项回归，前端 383/383；44 项端口负向探针、严格模板检查（30/52）、i18n 与构建通过。浏览器使用本地替身验收设备操作与桌面/窄屏，不改变后端接口、调度或外部网络；公告和文件仍待后续拆分。详情见 FRAMEWORK_REFACTOR.md 第十九批。

### 第二十批：公告工作流边界

管理员公告状态/CRUD/上传迁入 features/admin/useAdminAnnouncements.js，文案与字符面板迁入 announcementCopy.js；宿主保留模板和富文本 DOM/Markdown，注入编辑器回调与原服务。新增 36 项行为测试，前端 419/419；默认端口探针 51 项，严格 SFC 30/52 未扩大。类型、i18n、构建、质量门通过。真实页面通过本地 API/图片替身检查编辑、上传、插图、发布/停用、取消/确认删除及窄屏滚动操作；截图在 output/playwright/framework-batch-twenty/。本批没有后端、数据库、追踪网络或部署验收，后续拆编辑器与文件工作流。

### 公告编辑与展示组件化（第二十一批）

编辑/预览弹窗迁入严格 TS 的 AdminAnnouncementDialogs，浏览器选区/格式/粘贴/拖图归 useAnnouncementEditor，Markdown/URL/DOM 序列化归无浏览器全局依赖的 announcementPresentation。宿主复用原公告工作流并注入生命周期回调；列表和弹窗各自拥有 scoped 样式，动态正文 :deep 样式已修正。没有新增状态副本、编辑器依赖或改变发布接口。

新增 28 项测试，前端 447/447；57 项端口误用探针、31/53 严格 SFC、i18n、构建、质量门通过。真实页面使用本地替身验收格式、粘贴、正文/封面上传、保存/重开、预览、发布及删除和窄屏滚动；161 组渲染输入保持旧输出。详情见 FRAMEWORK_REFACTOR.md 第二十一批。后续继续公告列表、管理员文件和历史模板迁移；外部网络暂缓。

### 公告列表组件化（第二十二批）

公告列表迁入严格 TS 的 AdminAnnouncementsPage，宿主只注入原状态/服务并接收明确操作事件；列表与预览共享 announcementLabels，兼容旧可见范围和语言切换，小写发布状态的标签与动作保持一致。表格插槽字段、props、事件与日期参数均通过生产组件负向编译验证，时间合同补齐原服务字段，窄屏样式由组件拥有。

前端 452/452、59 项端口误用探针、32/54 严格 SFC、i18n、构建与质量门通过；本地替身浏览器验收分页单次请求、重复发布抑制、末页删除、0 id、语言/时间回退、编辑器接线及桌面/窄屏。后续继续文件工作流/预览和其他历史组件，网络与部署范围未扩大。详情见 FRAMEWORK_REFACTOR.md 第二十二批。

### 第二十三批：管理员文件状态与预览拆分（2026-10-12）

独立 useAdminFiles、useAdminFilePreview、adminFileRules 和严格 TS 的 AdminFilePreviewDialog；原宿主只组装服务/确认/URL 端口，文件列表模板暂留。两类文件独立分页和读取版本，管理员身份/角色/销毁使旧响应失效；确认快照与写锁阻止重复提交。软删除保留审计行，写成功与刷新失败分开提示。预览关闭/替换/撤权释放 URL 并隔离晚到响应，文本解码上限 1 MiB，Office 下载查看，未改变底层传输/取消协议。

新增 32 项行为回归，前端 484/484；默认类型含 68 项端口负向探针，严格 SFC 33/55，历史 22 个。真实页面本地替身验证分页、下载文件名、过期/删除禁用、确认去重、刷新故障、焦点和资源清理，1440px/390px 截图位于 output/playwright/framework-batch-twenty-three/。占位 PDF 仅检查 Blob/iframe 接线。质量门、类型和生产构建通过；整体缓存、剩余列表模板和真实存储未据此认定完成。

### 第二十四批：管理员文件受控列表（2026-10-12）

AdminFilesPage 通过严格行/分页/筛选合同和操作事件复用宿主同一 useAdminFiles；adminFilePresentation 统一兼容编号、上传人、角色、大小、时间、范围及状态，文件专属样式从全局迁为 scoped。修正 0 编号丢失、无效日期抛错和删除时间与状态标签不一致，保留原接口与软删除语义。

新增 10 项展示行为回归，前端 494/494；端口误用探针 72 项，严格 SFC 34/56，22 个历史组件仍待迁移。实际宿主与本地 API/Blob 替身回归分页/下载/筛选/删除/预览/焦点及撤权，另验中英文、0 id、deletedAt 和无效日期/大小；1440px/390px 截图在 output/playwright/framework-batch-twenty-four/。类型、质量门、i18n 和生产构建通过；PDF 只验证占位 Blob 接线，未作真实存储/数据库/网络/部署验收。下一批继续剩余管理员模板及宿主边界。

### 第二十五批：管理员账号模板与对话框（2026-10-12）

AdminEmployeesPage 和 AdminEmployeeDialogs 从历史宿主提取为严格 TS 组件，仍共享原 useAdminAccounts。列表以明确行/分页事件交接，密码弹窗复用真实工厂类型和原按钮 ref。修复 0 id 编辑误判、非法日期展示、忙碌时表单/关闭锁定、复制禁用后的焦点丢失以及英文标签挤压；专属 CSS scoped，交接弹窗样式继续保留。

前端 496/496、严格 SFC 36/58、72 项端口探针通过。真实组件/本地接口和剪贴板替身完成新增/编辑/重置/复制/删除、21 条分页、末页回退、键盘/敏感内容清理/撤权、中英文和窄屏验收，截图已在动画结束后检查。类型、质量门、i18n、构建与 diff 检查通过。尚未整体迁移 AdminDashboard，模型配置等剩余模板、整体缓存和真实网络仍待处理。

### 第二十六批：管理员系统页和模型配置（2026-10-12）

提取严格 TS 的 AdminSystemSettingsPage/AdminLlmSettingsPanel，复用唯一模型工作流，宿主保留全局加载装配。动态展示规则和 scoped 系统配置 CSS 独立；区分草稿与已保存配置，忙碌时锁定输入，缺少预览的密钥状态和缺失监控数据不再显示 undefined 或伪零，非法时间安全回退。

浏览器复验发现并修复 dirty 比较基准非响应式导致保存后提示残留。新增 6 项行为回归，前端 502/502、严格 SFC 38/60、76 项端口误用探针；真实页面通过本地替身验收保存/失败/密钥语义、页面重挂草稿、会话/晚到响应、语言与桌面/手机布局。类型、质量门、i18n 和构建通过。剩余管理员总览、审计、票单、交接及整体缓存继续待办；历史22个SFC未认定完成，外部网络暂缓。

### 第二十七批：管理员骨架完成（2026-10-12）

一次完成剩余五个管理员业务页面、登录和导航壳，以及 Console/BusinessLists 两项工作流。AdminDashboard 收敛为872行组装容器；严格叶子模板、类型化服务端口、展示规则、导航元数据与 scoped 样式分别归属 features/admin。原账号、设备、公告、文件和模型状态复用，不另建第二套实例。

独立验收修复退出请求令牌捕获/晚401污染新会话、审计末页旧响应纠正和票单有效分页同步。552行为回归、45严格SFC、94端口探针、质量门与构建通过；真实页面使用本地替身验收桌面/手机、分页删除、局部故障、语言与权限切换。管理员本轮框架范围已收口，22个历史SFC、普通API过期策略及真实数据库/网络验收另列范围。详细验证见 FRAMEWORK_REFACTOR.md 与 TEST_MATRIX.md。
