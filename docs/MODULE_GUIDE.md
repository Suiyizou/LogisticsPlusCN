# 新增模块指南

> 目标：新增一个业务模块时，按固定分层与清单落地，避免再出现巨型 Service、巨型页面、
> 巨型入口文件。现有客户模块已按此结构拆分，可作为模板。

## 1. 后端（Spring Boot）

### 1.1 分层约定

| 层           | 职责                                                        | 放置                                                                      |
| ------------ | ----------------------------------------------------------- | ------------------------------------------------------------------------- |
| Controller   | 只处理 HTTP：路由、参数绑定、状态码；不写 SQL、不做业务判断 | `.../<module>/XxxController.java`                                         |
| 领域 Service | 业务规则与事务边界（`@Transactional`）                      | `.../<module>/XxxService.java`                                            |
| 共享组件     | 跨领域复用的守卫、审计、查询、策略                          | `.../customer/CustomerAccessGuard` 等                                     |
| Mapper       | SQL 唯一归属（MyBatis 接口 + XML）                          | `persistence/XxxMapper.java` + `resources/mappers/<module>/XxxMapper.xml` |
| DTO          | 请求/响应明确类型                                           | `<module>/dto/`；请求对象用具体 record/类                                 |

规则：

- 不新增超过 ~800 行的 Service；超过就按“领域 + 共享组件”拆分（客户模块的拆分过程见 `REFACTORING.md`）。
- 权限从认证身份推导，禁止来自请求参数；新增共享守卫方法放 `CustomerAccessGuard`。
- SQL 一律用 `#{}` 绑定；禁止字符串拼接参数。
- 事务写在领域 Service 的公开方法上；跨领域调用通过注入的服务，避免自调用丢事务。

### 1.2 新增后端模块清单

1. 建包 `com.cargoplanner.backend.<module>`。
2. 写请求/响应 DTO（`dto/`）。
3. 写 `XxxMapper` 接口 + `resources/mappers/<module>/XxxMapper.xml`（读写在 Mapper）。
4. 写 `XxxService`（构造器注入，`@Transactional` 放这里）。
5. 写 `XxxController`（薄）。
6. 权限：在 Service 用 `CustomerAccessGuard`（或新增守卫方法）；需要数据范围时用 `CustomerLookupService`/`ShipmentLookupService`。
7. 审计：写操作调用 `CustomerAuditService.record/customer/shipment`。
8. 把新类加入 `backend/pom.xml` 的 Checkstyle `<includes>`（质量棘轮）。
9. 加测试：Controller 层用 `@WebMvcTest`（参考 `HttpAuthorizationRegressionTest`），Service 层用 H2（参考 `CustomerAccessFlowTest`）。
10. 若有结构变更，加 `resources/db/migration/Vn__*.sql`（见第 4 节）。

## 2. 前端（Vue 3 + Vite）

- 页面按“业务区域”拆组件，单文件超过 ~800 行必须拆出子组件或 composable。
- API 调用集中在 `src/services/*.js`，不要在组件里散写 `fetch`。
- 文案走 i18n（`src/i18n`），新增硬编码中文会被 `npm run i18n:scan` 拦截。
- 语言/主题/会话等横切逻辑放 `src/services` 或 composable。
- 新增页面：`components/` 加组件 → `router.js` 注册 → 复用 `services/apiClient.js`。
- 类型：新增逻辑优先 `.ts`（纳入 `tsc`）；Vue 模板目前未被类型检查（见 `ENGINEERING.md`）。

## 3. 追踪服务（Node，tracking-service）

- `server.mjs` 是入口，只做组装；业务放 `lib/*.mjs`（已有 `cosco-proxy*`、`batch-task-registry` 等）。
- 新增船司适配器：在 `lib/` 加 `xxx-tracking.mjs`，在入口注册；保留限流/冷却/取消/重试行为。
- 新增路由：集中在入口的请求分发，业务逻辑下沉到 lib。
- 加测试到 `test/*.test.mjs`（`node --test`），保持 `npm test` 全绿。

## 4. 数据库迁移（Flyway）

- 结构变更：新增 `backend/src/main/resources/db/migration/V<n>__<描述>.sql`，不要改已发布的 V1。
- 新库由迁移自动初始化；已有库通过 `baseline-on-migrate` 标记基线后增量执行。
- 运行时 `*.SchemaInitializer`（补列）历史逻辑逐步收敛到 V2+，不要直接删除。
- 上线前：导出生产结构（`mysqldump --no-data`）比对，演练升级与回滚。
- 迁移开关：`SPRING_FLYWAY_ENABLED`（compose 已透传）。

## 5. 部署与环境变量

- 新增配置：加到 `.env.example`，并在 `docker-compose.yml` 显式透传到容器（不要只写 .env）。
- 新增服务：在 compose 定义 healthcheck、`depends_on: condition: service_healthy`、持久化卷。
- 镜像标签用 `IMAGE_TAG`（不可变版本），发布/回滚见 `RELEASE.md`。
- 不使用固定 `container_name` 与新项目冲突时，用 compose project 隔离。

## 6. 质量门与 CI

- 提交前：`node scripts/verify.mjs`（quality/typecheck/backend/tracking/packing/frontend）。
- 新文件会自动进入质量棘轮（`scripts/quality.mjs`）与 Checkstyle（加入 includes）。
- CI（`.workflow/ci.yml`）与本地同源命令；新模块无需改 CI，除非新增服务/镜像。
