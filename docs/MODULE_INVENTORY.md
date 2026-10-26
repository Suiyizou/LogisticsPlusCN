# 模块清单与重构任务记录（T01）

> 本文是接手后的基线快照：记录仓库现状、入口、角色、表、部署方式、验证入口与
> 逐项任务记录。重构过程中保持更新，任何批次开始前先读本文与
> [REFACTORING.md](REFACTORING.md)。

## 0. 接手状态

| 项         | 值                                                                                                            |
| ---------- | ------------------------------------------------------------------------------------------------------------- |
| 本地目录   | `C:\Users\ASUS\Documents\ChatGPT\daily\projects\thirty-party-shippment-tracking`                              |
| 远端       | Gitee `https://gitee.com/zhnn112/thirty-party-shippment-tracking.git`                                         |
| 当前分支   | `codex/refactor-customer-directory`（领先 `origin/main`，第一批改动已提交 `8368f97`）                         |
| 线上网站   | Drewes Logistics（地址与访问方式待补充，见 T13 所需信息）                                                     |
| 技术栈     | Vue 3 + Vite + Element Plus / Java 17 + Spring Boot 3.5 / Node.js 20+（追踪服务）/ MySQL 8.4 / Docker Compose |
| 第一批改动 | 客户目录查询迁移 MyBatis、拆分 DTO/权限范围、消除员工信息 N+1、统一验证入口。详见 `docs/REFACTORING.md`       |
| 基线提交   | `f1116fe`（origin/main）→ `8368f97`（第一批已保存，可回退到此提交）                                           |

### 已有验证基线（本次在本地重新确认）

| 检查                            | 命令                               | 结果                                                                                                                              |
| ------------------------------- | ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| 后端 JUnit                      | `mvn -q test`（backend）           | 26 个测试类、208 项通过，0 失败 0 错误 0 跳过                                                                                     |
| Node 追踪                       | `npm test`（tracking-service）     | 103 项通过，0 失败                                                                                                                |
| 装箱回归                        | `npm run test:packing`（frontend） | 4 组脚本                                                                                                                          |
| 前端                            | `npm run build`（frontend）        | i18n 扫描 + Vite 生产构建                                                                                                         |
| 真实 MySQL / Docker / CI / 线上 | —                                  | 真实 MySQL 8.0.42（临时实例 3307）已验证 schema/MyBatis/Flyway；Docker 引擎未启动，CI 远端与线上未执行（见 `docs/ACCEPTANCE.md`） |

## 1. 模块清单

### 1.1 后端（`backend/`，Spring Boot 3.5，Java 17）

按包划分，包即业务模块：

| 包              | 职责                                                                  | 关键类                                                                                                         | 规模热点                                                             |
| --------------- | --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `auth`          | 内部账号登录、会话/设备、改密、审计拦截                               | `AuthService`、`AuthController`、`AdminAuthInterceptor`、`UserAuthInterceptor`                                 | `AuthService` 511 行                                                 |
| `admin`         | 员工管理、设备管理、系统监控、LLM 设置、启动管理员引导                | `AdminService`、`AdminController`、`AdminBootstrapInitializer`、`LlmSettingsService`                           | `AdminService` 1021 行                                               |
| `customer`      | 客户目录、客户写操作、交接、代理分配、票单绑定、快照失效、客户登录    | `BusinessCustomerService`、`BusinessCustomerController`、`CustomerAuthService`                                 | **`BusinessCustomerService` 5226 行**                                |
| `shipment`      | 票单 CRUD、船司追踪、快照、批量任务、票单业务文件、自动刷新、CMA 会话 | `ShipmentTrackingService`、`ShipmentFileService`、`ShipmentBatchTrackingService`、`ShipmentAutoRefreshService` | **`ShipmentTrackingService` 3591 行**、`ShipmentFileService` 1729 行 |
| `dashboard`     | 业务工作台首页统计                                                    | `BusinessDashboardService`                                                                                     | 348 行                                                               |
| `announcement`  | 系统公告、公告图片                                                    | `AnnouncementService`、`AnnouncementImageService`                                                              | 531 行                                                               |
| `cargoimport`   | 货物 Excel/文本导入解析                                               | `CargoImportParseService`                                                                                      | 1163 行                                                              |
| `excel`         | Excel 清洗任务                                                        | `ExcelCleaningService`                                                                                         | 861 行                                                               |
| `text`          | 文本/图片识别任务                                                     | `TextRecognitionService`                                                                                       | **3602 行**（本次任务未点名，但属同类大文件）                        |
| `workspacefile` | 工作区临时文件、复用、清理                                            | `WorkspaceFileService`                                                                                         | 692 行                                                               |
| `common`        | 异常处理、请求统计、路径清洗、Web 配置                                | `ApiExceptionHandler`、`RequestStatsFilter`                                                                    | 小                                                                   |

### 1.2 前端（`frontend/`，Vue 3 + Vite）

| 文件                                      | 职责                                                                                     | 规模         |
| ----------------------------------------- | ---------------------------------------------------------------------------------------- | ------------ |
| `src/components/BusinessCustomerPage.vue` | 业务员客户管理全流程（列表、创建、导入、交接、代理分配、票单绑定、快照）                 | **11612 行** |
| `src/components/AdminDashboard.vue`       | 管理员后台（员工、设备、审计、监控、平台信息、文件、公告、LLM）                          | **5592 行**  |
| `src/App.vue`                             | 内部应用外壳与路由容器                                                                   | **3227 行**  |
| `src/components/ExcelTemplatePage.vue`    | Excel 模板与导入                                                                         | 2873 行      |
| `src/components/PublicLandingPage.vue`    | 对外落地页                                                                               | 2736 行      |
| `src/components/WorkbenchPortal.vue`      | 工作台入口                                                                               | 1707 行      |
| `src/workers/packingWorker.js`            | 三维装箱计算 Worker（校验、策略、约束、结果转换、通信）                                  | **7180 行**  |
| `src/services/*.js`                       | API 客户端与领域服务（`adminApi`、`businessCustomerApi`、`apiClient`、`authSession` 等） | 分散         |
| `src/visualization/*.ts`                  | Three.js 装箱场景渲染（已是独立 TS 模块）                                                | 拆分较好     |
| `src/utils/*.js`                          | 格式、约束、重心、剩余空间、报告布局等纯函数                                             | 拆分较好     |

### 1.3 追踪服务（`tracking-service/`，Node.js ESM）

| 文件                            | 职责                                                                           | 规模        |
| ------------------------------- | ------------------------------------------------------------------------------ | ----------- |
| `server.mjs`                    | 启动、依赖组装与兼容导出；HTTP 位于 `http/`，船司编排位于 `services/`          | 82 行       |
| `channels/cosco-playwright.mjs` | COSCO Playwright 通道                                                          | 中          |
| `channels/cma-playwright.mjs`   | CMA Playwright 通道                                                            | 中          |
| `lib/cosco-*.mjs`               | 载荷、代理池、代理、请求守卫、批量任务注册表                                   | 已独立      |
| `public/app.js`                 | 追踪工作台前端（无模块化，全局脚本）                                           | **9450 行** |
| `test/*.test.mjs`               | 当前 211 项（含 HTTP、runtime、endpoint/session、通道执行/回退与补充详情回归） | —           |

### 1.4 部署与工程

| 文件                                                                                     | 作用                                                                                                                                                    |
| ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docker-compose.yml`                                                                     | 4 个服务：`mysql`、`backend`、`tracking`、`frontend`；网络 `app`/`data`；卷 `mysql-data`(external)、`workspace-files`、`backend-secrets`、`app`、`data` |
| `docker/backend.Dockerfile`、`docker/frontend.Dockerfile`、`tracking-service/Dockerfile` | 镜像构建                                                                                                                                                |
| `docker/nginx.conf`                                                                      | 前端 Nginx，代理 `/api/`→backend、`/tracking/`→tracking                                                                                                 |
| `docker-compose.proxy-pool.yml`                                                          | 可选 Mihomo 代理池 overlay                                                                                                                              |
| `backend/sql/schema.sql`                                                                 | 初始化 schema（首次挂载进 MySQL `docker-entrypoint-initdb.d`）                                                                                          |
| `*.SchemaInitializer`（announcement/customer/shipment/workspacefile）                    | 运行时补表/补列                                                                                                                                         |
| `.env.example`                                                                           | 环境变量清单（真实 `.env` 未提交）                                                                                                                      |
| `scripts/verify.mjs` + 根 `package.json`                                                 | 统一验证入口（backend/tracking/packing/frontend）                                                                                                       |

## 2. 角色与权限

内部通道三角色（`cp_users.role`）：

| 角色            | 权限范围                                                           |
| --------------- | ------------------------------------------------------------------ |
| `ADMIN`         | 全部：员工、设备、审计、监控、平台信息、系统设置、全部票单业务文件 |
| `BUSINESS`      | 全系统仅一个；全部客户、票单、船司更新、发布、海外代理、业务分配   |
| `OVERSEA_AGENT` | 仅分配给自己的客户及其票单细节（备注、文件、留言）                 |

外部客户通道独立（`cp_customers` + `party_role` = `SHIPPER`/`CONSIGNEE`/`OVERSEA_AGENT`），
只能读取业务员已发布并授权的数据，不能触发船司查询或修改内部数据。

数据可见性必须由认证身份推导，不能来自请求参数（第一批 `CustomerDirectoryScope`
已按此约定实现）。

## 3. 关键业务流程清单

| #   | 流程                      | 入口                                                                                             | 关键约束                                                                   |
| --- | ------------------------- | ------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------- |
| F1  | 内部登录 / 设备会话       | `POST /api/auth/login`、`/logout`、`/change-password`、`/profile`                                | 设备数上限；改密后保留当前设备、其他设备下线；审计不记录密码/令牌          |
| F2  | 客户目录查询              | `GET /api/business/customers`                                                                    | 三种角色范围；仅 `ACTIVE` 且 `SHIPPER`/`CONSIGNEE`；员工失效只置空显示字段 |
| F3  | 客户创建 / 批量导入       | `POST /api/business/customers`、`/batch`                                                         | 客户码 6–10 位全局唯一；重复身份检查；密码复杂度                           |
| F4  | 客户编辑 / 归档删除       | `PATCH/DELETE /api/business/customers/{id}`、`/reset-code`、`/reset-password`                    | 有关联票单时安全归档并撤销登录，保留历史                                   |
| F5  | 客户交接                  | `POST /handover`、`GET /handover-requests`、`/api/admin/customer-handovers`                      | 交接请求原子性、待确认/驳回、票单权限随交接迁移                            |
| F6  | 代理分配                  | `POST /transfer`、`/oversea-agents*`、`/{customerId}/linked-customers`                           | 客户→代理单向；只展示可用代理；事务性转移                                  |
| F7  | 票单创建 / 绑定           | `POST /shipments`、`/{customerId}/shipments`、`/shipments/batch`                                 | 必须先选客户；创建后自动绑定；可选立即发布                                 |
| F8  | 票单发布与授权            | `PATCH /{customerId}/shipments/{shipmentId}/publication`                                         | 控制客户可见性（草稿授权 vs 发布）                                         |
| F9  | 票单追踪更新              | `POST /api/business/shipments/refresh-all`、`/batch-refresh`、`POST /api/public/shipments/track` | 船司抓取、代理切换、限流、冷却、取消、补充重试                             |
| F10 | 快照                      | `GET /{shipmentId}/snapshot`、`POST /manual-snapshot`、`POST /invalidate-snapshot`               | 快照持久化与失效、刷新事件                                                 |
| F11 | 票单业务文件 / 工作区文件 | `/api/shipments/{id}/files`、`/api/workspace-files`、`/api/admin/shipment-files`                 | 配额、扩展名白名单、可见性角色、审计、磁盘锁                               |
| F12 | 客户文件与留言            | `/api/customer/shipments/{id}/files`、`/file-comments`                                           | 仅已发布票单范围                                                           |
| F13 | 批量追踪任务              | `POST /api/business/shipment-batch-tasks`、`/{taskId}`、`/cancel`                                | 任务注册表、进度、取消、失败项                                             |
| F14 | Excel / 文本导入          | `/api/excel-cleaning/*`、`/api/text-recognition/*`、`/api/cargo-imports/*`                       | 任务状态、清洗结果、LLM 开关与规则兜底                                     |
| F15 | 公告                      | `/api/admin/announcements`、`/api/announcements/today`、`/api/customer/announcements`            | 发布/停用、已读记录、图片上传                                              |
| F16 | 装箱计算                  | 前端 Web Worker                                                                                  | 校验、策略搜索、约束、3D 展示、报告导出；超时/取消/恢复兼容                |

## 4. 数据表清单（`backend/sql/schema.sql`，34 张）

按领域分组：

- 账号与安全：`cp_users`、`cp_security_migrations`、`cp_login_devices`、`cp_login_events`、`cp_admin_audit_log`
- 客户：`cp_customers`、`cp_customer_employee_assignments`、`cp_oversea_agent_customers`、
  `cp_customer_sessions`、`cp_customer_shipment_access`、`cp_oversea_agent_shipment_scopes`、
  `cp_oversea_agent_customer_transfer_log`、`cp_customer_transfer_log`、
  `cp_customer_handover_requests`、`cp_customer_handover_request_items`、
  `cp_oversea_agent_shipment_follows`
- 票单与追踪：`cp_shipments`、`cp_shipment_references`、`cp_tracking_snapshots`、
  `cp_tracking_refresh_jobs`、`cp_shipment_participants`、`cp_shipment_client_match_queue`、
  `cp_tracking_credentials`
- 文件：`cp_shipment_files`、`cp_shipment_file_comments`、`cp_shipment_file_visibility_roles`、
  `cp_shipment_file_audit`、`cp_shipment_file_storage_lock`、`cp_workspace_files`
- 任务与配置：`cp_excel_cleaning_tasks`、`cp_text_recognition_tasks`、`cp_system_settings`
- 公告：`cp_announcements`、`cp_announcement_reads`

> 运行时还存在 `*.SchemaInitializer` 补表/补列，与实际数据库、`schema.sql` 三方必须
> 在 T06 对齐，不能直接删补表逻辑或盲目 Flyway baseline。

## 5. 部署方式

```text
浏览器
  └─ frontend (Nginx :80)
        ├─ /api/      → backend (Spring Boot :8080)
        │                   └─ MySQL :3306 (mysql:8.4)
        └─ /tracking/ → tracking (Node :3000)
                            └─ Playwright 浏览器 / COSCO·CMA 上游 / 可选代理池
```

- 数据持久化：MySQL 卷 `mysql-data`（external）；文件卷 `workspace-files`、`data`(shipment-files)；
  密钥卷 `backend-secrets`。
- 健康检查：MySQL `mysqladmin ping`；tracking `GET /api/health`；backend 依赖二者健康后启动。
- 密钥：`TRACKING_ADAPTER_KEY`、`APP_TRACKING_SECRET_KEY_FILE`、代理账号只走 `.env`/卷，不入库。

## 6. 重构任务记录（T01–T13）

状态：`[ ]` 未开始 / `[~]` 进行中 / `[x]` 已完成（以本地可验证为准）。

| 编号 | 任务                                                     | 状态 | 备注                                                                                                                                                                                                                                             |
| ---- | -------------------------------------------------------- | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| T01  | 接手并确认基线                                           | [x]  | 第一批已保存 `8368f97`；本文即模块/流程/任务记录；线上访问信息仍在第 7 节列出                                                                                                                                                                    |
| T02  | 工程规范（格式/Lint/类型/统一命令）                      | [x]  | 见 `docs/ENGINEERING.md`：Prettier+ESLint 变更棘轮、`tsc --noEmit`、Checkstyle 新包门、`verify.mjs` 增 quality/typecheck                                                                                                                         |
| T03  | 回归测试（登录/权限/客户/交接/票单/快照/附件/追踪/装箱） | [~]  | 见 `docs/TEST_MATRIX.md`；新增 HTTP 角色鉴权矩阵（7 项，后端 208 项）；附件/快照/回滚沿用既有用例；前端页面级仍待 T08                                                                                                                            |
| T04  | 拆 Java 大 Service（客户、交接、代理、票单、快照、附件） | [x]  | 11 个领域/共享服务，`BusinessCustomerService` 5226→约 600 行（薄门面）；208 项测试全绿                                                                                                                                                           |
| T05  | JdbcTemplate → MyBatis 逐模块迁移                        | [~]  | 已迁：客户目录、海外代理（含代理-客户关联，共 22 条语句，`OverseaAgentMapper`，真库冒烟通过）；其余模块待迁                                                                                                                                      |
| T06  | 数据库迁移（Flyway 等）                                  | [~]  | 已引入 Flyway + `V1__baseline.sql`，新库初始化/现有库 baseline 均在真实 MySQL 8.0.42 验证通过（见 `docs/ACCEPTANCE.md`）；SchemaInitializer 逐条转 V2+ 待后续                                                                                    |
| T07  | 拆 Node `server.mjs`                                     | [~]  | 已拆启动、HTTP/controller/runtime、endpoint/session、通道执行/回退和补充详情；浏览器资源作用域及独立 UI 仍待后续                                                                                                                                 |
| T08  | 拆前端大页面与 `public/app.js`                           | [~]  | 已抽票单详情、图表、批量任务、角色导航、客户目录/表单、客户导入、代理/交接状态及票单列表/筛选；已抽手工票单/Excel 导入及个人资料逻辑与弹窗；第六批新增注册表、真实页面路由、统一业务入口及票单列表页面，剩余模板、管理员页面和独立工作台仍待拆分 |
| T09  | 拆装箱 `packingWorker.js`                                | [ ]  | 7180 行；保持结果/超时/取消/恢复/3D/报告兼容                                                                                                                                                                                                     |
| T10  | Docker 与部署整理                                        | [~]  | 已加 backend 健康检查、前端依赖 backend 健康、镜像内 curl；新增 `scripts/backup.sh                                                                                                                                                               | deploy.sh | rollback.sh`；`docker compose config` 通过；容器实跑待 Docker 引擎 |
| T11  | 接通 CI                                                  | [~]  | 已交付 `.workflow/ci.yml`（Gitee Go 实际语法）+ 本地同源命令；远端触发需仓库流水线/Runner 权限（见 `docs/CI.md`）                                                                                                                                |
| T12  | 本地验收（真实 MySQL + Docker + 浏览器）                 | [~]  | 见 `docs/ACCEPTANCE.md`：真实 MySQL 8.0.42 + 后端 API + MyBatis + Flyway + 追踪服务已验证；Docker/浏览器/回滚演练待引擎                                                                                                                          |
| T13  | 更新线上                                                 | [ ]  | 需服务器/发布权限与备份条件（见第 7 节）                                                                                                                                                                                                         |

## 7. 缺少的条件（阻塞项）

以下信息/权限当前不可用，相关线上动作不会执行，也不会宣称已上线：

1. **Docker 网络出站**：Docker 引擎现已启动，本机另有一个来自不同目录
   (`Documents/ThirtyPartyShippmentTracking`) 的运行栈（前端 :8088、后端 :8080），不属本仓库，未触碰。
   但 `docker.io` 出站被阻断（拉取 maven/eclipse-temurin 基础镜像超时），本仓库镜像无法真正构建，
   R01 仅能用等价的 Maven 输入复现验证；容器联调、回滚演练、浏览器全栈与 MySQL 8.4 验证仍缺基础镜像/外网。
2. **真实 MySQL**：已用独立临时实例（端口 3307，仓库外数据目录）完成 schema/MyBatis/Flyway
   验证；本机原有 `MySQL80`（3308）仍无凭据，不用于验收。
3. **CI**：缺少 Gitee 仓库的 Runner/流水线配置权限，无法触发远端流水线（见 `docs/CI.md`）。
4. **线上服务器**：缺少 Drewes Logistics 的部署访问方式（SSH/面板）、备份目录与回滚入口。
5. **线上数据库结构**：需要一份结构导出（`SHOW CREATE TABLE` 或 `mysqldump --no-data`），
   用于比对 Flyway baseline 与生产实际差异。

## 8. 变更纪律

- 一个业务入口一个批次；每批次可独立验证与回退（对应提交/分支）。
- 不以“移动文件”代替职责拆分；不再堆积巨大 Service/页面/入口文件。
- 保持现有接口、字段、权限、事务语义与数据兼容。
- 不提交密码、Token、Cookie、代理账号、加密密钥。
- 测试不得连接生产数据库或修改线上业务数据。
- 批次开始时更新本表的“状态”，批结束时在 `docs/REFACTORING.md` 追加验证记录。

## 9. 复查问题修复记录（R01–R09）

针对 `daily/output/shipment-refactor-review-20261007.md` 的 9 个阻断项：

| 编号 | 问题                                   | 修复                                                                                                    | 验证                                                                            |
| ---- | -------------------------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| R01  | 后端镜像缺 Checkstyle 配置导致构建失败 | `docker/backend.Dockerfile` 复制 `backend/config`                                                       | 复现 Docker 输入：无 config 失败、有 config 成功出 jar                          |
| R02  | 部署失败回滚指向新版本                 | `deploy.sh` 先记录 `CURRENT_REF` 并在切换代码前备份                                                     | 代码顺序审查 + 脚本语法/模拟                                                    |
| R03  | 回滚不恢复旧镜像                       | 不可变 `IMAGE_TAG`；回滚停写、恢复数据后用备份记录的镜像标签或重建旧代码                                | `docker compose config` + 脚本审查；实跑待 Docker                               |
| R04  | 把 `.env` 当脚本执行                   | `scripts/lib/common.sh:dotenv_value` 只按键取读，禁止 source                                            | 含空格/`#`/`$`/引号的探针通过                                                   |
| R05  | 备份遗漏附件/工作区/公告图片           | 备份补齐 `shipment-files.tgz`、`workspace-files.tgz`、`checksums.sha256`；回滚增加恢复                  | 脚本实现；实跑待 Docker                                                         |
| R06  | 质量门在 main 上漏检                   | `quality.mjs` 跳过=HEAD 基线、CI 回退 HEAD~1、取不到基线即失败；CI 传 `QUALITY_BASE_REF`、改用 `npm ci` | 三种场景复现：显式不可解析=2、CI 且基线=HEAD=2、origin/main=HEAD 时检查真实变更 |
| R07  | Flyway 开关未传入容器                  | compose 增加 `SPRING_FLYWAY_ENABLED`，`.env.example` 补条目                                             | `docker compose config` 默认 true、宿主 false 时透传 false                      |
| R08  | 脚本无可执行位                         | `git update-index --chmod=+x` 四个脚本 → `100755`                                                       | `git ls-files -s` 确认                                                          |
| R09  | 代理重置口令可预测                     | `CustomerInputRules.generateTemporaryPassword()` 安全随机 16 位                                         | 后端测试全绿；旧格式无测试依赖                                                  |

遗留（未在本批完成，需后续或权限/环境）：

- 25 个模块与 4 个 feature TS SFC 已有严格模板检查及故意错误回归；默认检查包含 31 项模块端口/注册合同负向探针。另 22 个历史 SFC 与 workflow 内部 JS 服务输入仍待扩大类型边界。
- 真实 Spring 事务失败回滚测试、真实 MySQL 权限/并发用例。
- MySQL 8.4 与 Docker 全栈、浏览器关键流程、备份/回滚真实演练。
- Flyway 仅 V1，`SchemaInitializer` 结构变更尚未转为 V2+。

2026-10-11 第七批迁移客户目录/详情、票单详情与批量追踪/业务字段弹窗页面，新增公共业务命令、独立关联写入 workflow 和开发样板。第八批进一步迁移客户弹窗、代理/交接页面及弹窗；增加共用焦点生命周期与 scoped 样式，修复改密结果会话安全和客户码原生校验。第九批将总览迁为独立路由页面，客户域统一作用域组装；补齐统计读取生命周期、缓存授权边界和共享写锁回归。第十批抽出票单域组装、票单页面合同和列表写入；补齐受控关闭、选择/身份版本及账号作用域释放保护。第十一批迁移客户/代理/交接的明确页面合同及票单纯展示规则，所有工厂通过各模块公共入口导出；父容器清理失去用途的解构和辅助函数。前端行为测试当前 301 项。翻译包装、布局/服务适配及历史样式仍待后续。当前结构与验证记录见 [FRAMEWORK_REFACTOR.md](FRAMEWORK_REFACTOR.md)；上表其余热点行数保留初始盘点口径。

第十二批完成父容器展示与历史样式收敛、作用域提示生命周期及严格 modules 模板类型检查。前端 318 项行为回归通过；25/51 个 SFC 受 vue-tsc strictTemplates 保护，默认 typecheck 含真实页面负向回归，另 26 个历史/feature SFC 仍待迁移。样式与实际页面验收见 FRAMEWORK_REFACTOR.md 第十二批，后端/数据库/调度/线上范围未据此宣称完成。

第十三批补齐四个模块页面工厂、展示/注入/命令合同与共享 DOM 引用守卫；手工建单、Excel 导入、个人资料及总览图表纳入严格模板范围，当前 29/51 个 SFC，默认类型检查含 22 项模块端口负向探针。前端行为 319 项、追踪服务 132 项；独立追踪响应和诊断规则已抽为纯模块，批量任务与定时刷新策略保持现状。仍有 22 个历史 SFC、内部 workflow 服务及其他大页等待迁移，不以端口类型检查宣称全项目完成。

第十四批将 COSCO 接口协议、解码、超时/取消和公共查询会话下沉到 services/cosco-endpoint-client.mjs；原 runtime 共享 upstream、gate 与出口 Cookie 状态，健康监控使用同一客户端。Node 回归当前 154 项。通道选择/回退编排、独立追踪 UI 和管理员组件仍待后续，不以物理拆分声称所有追踪重构完成。

第十五批将单通道快照执行与授权回退分别下沉到 cosco-channel-executor.mjs 和 cosco-fallback-runner.mjs；runtime 共享实例、队列和关闭边界不变。新增 30 项行为回归，追踪全套当前 184 项。补充详情工作流、浏览器资源作用域及独立追踪 UI 仍需后续收敛。

第十六批将选定来源补充查询、部分失败及网络/浏览器结果投影下沉到 cosco-supplemental-workflow.mjs；与主查询复用同一 gate、endpoint 和回退链。新增 26 项工作流行为回归与 1 项 runtime 队列接线测试，两项旧源码回归改为运行生产实例，追踪全套当前 211 项。浏览器生命周期和补充查询取消协议仍待后续。

第十七批将内置模块及开发样板的元数据和懒加载器归属各自 module.js，宿主只维护一份注册清单，新增模块无需重复修改 views.js。组装阶段验证加载器所有权、关闭模块预留合同及宿主入口/路由重名；保留公共加载器与旧路由兼容。新增 16 项行为回归，前端当前 335 项；默认端口/注册合同负向探针 31 项。后续优先历史工作台及类型/代码骨架，暂缓船司网络链路任务。

第十八批将员工账号/凭据与 LLM 配置工作流迁入 features/admin，原宿主继续组合服务及确认框。前端当前 360 项行为回归、默认 39 项端口/注册误用探针；严格 SFC 仍为 29/51。管理员模板、公告、文件与设备及整体缓存/生命周期仍待后续，不以两项工作流拆分宣称整页已完成。外部网络任务继续暂缓。

第十九批独立 useAdminDevices 与严格 TS 的 AdminDevicesPage，宿主组合三项管理员工作流；管理员表格基础样式归入共享 scoped CSS。前端行为 383 项、默认端口负向探针 44 项，严格 SFC 30/52，遗留 SFC 仍为 22 个。设备分页、会话撤销和删除已有作用域/重复提交/刷新失败回归，公告、文件、其他管理员模板和全局缓存一致性仍待推进。

第二十批独立 useAdminAnnouncements 与公告文案/字符面板，宿主通过类型化服务和编辑器回调端口组装第四项管理员工作流。前端行为 419 项、默认端口负向探针 51 项，严格 SFC 仍为 30/52。公告草稿、分页、上传归属与写入已具备会话隔离和成功后刷新故障处理；DOM 富文本、Markdown 渲染、公告列表/弹窗模板、文件工作流及整体缓存一致性仍待迁移。网络链路继续暂缓。

第二十一批独立 AdminAnnouncementDialogs、useAnnouncementEditor 和 announcementPresentation；公告草稿仍由同一工作流拥有，宿主只装配服务与编辑器回调。列表/弹窗样式分属独立 scoped CSS，动态正文样式已修正。前端行为 447 项、默认端口负向探针 57 项，严格 SFC 31/53，历史 SFC 仍有 22 个。实际弹窗通过本地替身验收格式、粘贴、图片、保存、重开、预览和窄屏；公告列表模板、管理员文件与其他大页及整体缓存一致性继续待办。浏览器 execCommand 保持旧实现并隔离，没有增加网络或后端范围。

第二十二批独立 AdminAnnouncementsPage 与共享 announcementLabels；宿主仍拥有同一公告工作流，组件接收严格行/分页/格式化合同并发出操作事件。列表与预览兼容旧 visibility、动态语言与时间回退；实际插槽/props/事件负向检查、分页/重复发布/末页删除与窄屏验收已补齐。前端行为 452 项、端口探针 59 项、严格 SFC 32/54，历史仍有 22 个。管理员文件工作流与预览、其他历史模板和整体缓存一致性继续待办；外部网络任务暂缓。

第二十三批独立管理员文件工作流/预览生命周期和严格 TS 的预览弹窗；两个文件列表保留独立分页、过期筛选和软删除审计，关闭/切换/撤权释放预览资源，成功后读取失败不诱导再次提交。前端行为 484 项、端口探针 68 项、严格 SFC 33/55，历史 22 个。真实宿主使用本地替身完成桌面/窄屏、下载、分页、故障、焦点及 URL 清理验收；占位 PDF 仅验证接线。文件列表模板/展示合同、账号/模型等历史模板与整体缓存仍待推进，原下载传输与网络取消协议未改变，外部网络继续暂缓。

第二十四批独立严格 TS 的 AdminFilesPage 和 adminFilePresentation，文件表格/分页/过期筛选以受控 props/events 复用宿主工作流；文件专属 CSS scoped，移除旧原生表格宽度规则。0 id、非法时间/大小及 deletedAt 与状态标签一致性已补齐。前端行为 494 项、端口探针 72 项、严格 SFC 34/56，历史仍有 22 个。真实宿主使用本地替身验收桌面/窄屏、语言切换及文件操作，不代表真实存储/网络/部署；账号、模型等剩余模板、宿主职责和整体缓存继续待办，网络任务暂缓。

第二十五批独立严格 TS 的 AdminEmployeesPage/AdminEmployeeDialogs；宿主只注入同一账号工作流与行/分页/翻译/格式化端口，组件不创建第二份账号状态。修复 0 id 编辑、非法登录时间、提交锁定、复制结果焦点与标签挤压，账号 CSS scoped。前端 496 项、严格 SFC 36/58、端口探针 72 项，历史仍 22 个。实际账号组件通过本地接口/剪贴板替身验收分页、写入、键盘、撤权清理及桌面/窄屏；模型配置与其他剩余模板、宿主职责和整体缓存继续待办，外部网络暂缓。

第二十六批独立严格 TS 的 AdminSystemSettingsPage/AdminLlmSettingsPanel，复用原模型工作流；展示工厂与专属 CSS scoped，修复非响应式草稿 baseline、缺失 Key 预览、未知计数/非法时间和提交锁定。前端 502 项、严格 SFC 38/60、端口探针 76 项，历史仍22个。实际页面使用本地替身验收密钥/草稿/失败/会话/语言与桌面/手机布局；剩余总览、审计、票单、交接模板、宿主职责和整体缓存继续待办，外部网络暂缓。

第二十七批完成管理员剩余总览、审计、客户、票单、交接、登录及导航壳组件，Console/BusinessLists 工作流独立，AdminDashboard 当前872行且仅保留装配职责。前端552项行为回归、45/67严格SFC、94项端口探针；管理员本轮页面/宿主拆分范围完成。22个尚未纳入严格模板门的历史SFC（17个JS、5个TS）及普通API全局过期策略仍为明确后续项，真实后端/数据库/外部网络与部署未验。章节2的5592行等数字保留初始盘点历史口径，当前实现以本段及 FRAMEWORK_REFACTOR.md 为准。
