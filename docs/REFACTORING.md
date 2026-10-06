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
tracking-service 的 npm 依赖。仓库根目录的 package.json 只有命令入口，不需要安装
根目录依赖。首次准备依赖：

```sh
npm --prefix frontend ci --ignore-scripts
npm --prefix tracking-service ci
```

前端这里只准备 Web 构建与回归测试，跳过 Electron 安装脚本。需要桌面打包时，在
frontend 目录执行 `npm rebuild electron`，准备 Electron 运行时后再执行桌面构建。

在仓库根目录执行：

```sh
npm run verify                  # 后端 + 追踪测试 + 装箱测试 + 前端生产构建
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
OPTIONS 预检）。后端测试 200 → 207。

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
调用方事务）。后端 207 项测试全绿，Checkstyle 通过。

### 已完成：T05 批次（海外代理模块 SQL 迁移）

`OverseaAgentService` 中全部 JdbcTemplate 语句（3 条读 + 15 条写/同步）迁到
`OverseaAgentMapper` + `mappers/customer/OverseaAgentMapper.xml`，参数全部 `#{}` 绑定，
新增 DTO `OverseaAgentListRow` / `BusinessAgentListRow` / `OverseaAgentRow`。
JSON 输出形状保持不变（如代理列表 `id` 仍为字符串）。H2 全量 207 项通过，
真库冒烟创建/列表/禁用/删除全部 200，删除后操作返回 404。

### 后续批次（每步可独立验证）

1. `CustomerHandoverService`：交接申请、列表、审核、原子转移（含
   `grantBusinessHandoverParticipant`、`auditCustomerHandover`）。
2. `CustomerShipmentBindingService`：票单绑定/解绑/发布/删除，保留事务与权限过滤。
3. `CustomerShipmentQueryService`：只读快照/追踪查询（`snapshotShipmentSelect`、
   `enrichShipmentRelations`、计数与排序），随后把该模块 SQL 迁到 MyBatis。
4. `CustomerProfileService`：客户建档/修改/归档/删除与会话吊销。
5. 同样方式拆 `ShipmentTrackingService`：适配器调用、快照持久化、批量任务、自动刷新分离。

每完成一批，把新类加入 `backend/pom.xml` 的 Checkstyle `<includes>`，并把该模块 SQL
迁到 Mapper（T05）。保持 Controller 只处理 HTTP、Service 处理业务与事务、Mapper 管理 SQL、
请求/响应使用明确 DTO。
