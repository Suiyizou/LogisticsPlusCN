# 模块平台与数据库演进

本轮的默认开发方式：**模块化单体 + 受控 MyBatis-Plus Repository + Flyway 迁移 + OpenAPI 类型客户端 + 按角色隔离的前端宿主**。保留 Vue 3 / Spring Boot / Node / MySQL，不重写已有业务。

## 各层职责

| 层       | 统一机制                                                    | 业务仍需实现的部分                 |
| -------- | ----------------------------------------------------------- | ---------------------------------- |
| 前端     | registration、surface、导航、懒加载、模块语言包、类型化 API | 业务流程、表单交互、跨模块命令     |
| Java API | 明确请求/响应 DTO、分页、错误响应、认证入口                 | HTTP 能力与授权动作                |
| 应用服务 | 注入 Repository、事务、审计端口                             | 订单状态、审批条件、金额规则、幂等 |
| 数据读写 | MyBatis-Plus 处理普通 CRUD；Repository 执行权限             | 跨企业范围、聚合查询、复杂并发 SQL |
| 数据库   | Flyway 唯一迁移入口；显式旧库接管                           | 数据清洗、回填与破坏性迁移审核     |
| Node     | 执行适配器 registry、授权策略、能力与生命周期               | 各船司协议、结果归一化、上游资源   |

数据库 Entity 不直接返回给前端；客户端也不直接操作 Mapper。生成器不会根据表字段自动公开密码、内部成本或企业数据。

## 可运行样板：服务目录

规格文件：`module-specs/service-catalog.json`。新增的是内部参考资料模块，允许 ADMIN / BUSINESS。它不是对客户的保险销售或订单履约系统。

- 后端：`backend/.../servicecatalog/{api,application,domain,infrastructure}`。
- 前端：`frontend/src/modules/service-catalog`，自动登记到 `generatedRegistrations.js`。
- 迁移：`V4__service_catalog.sql`。
- API：`/api/business/service-catalog`，GET 分页 / POST 新增 / PATCH 指定记录。
- 开放字段：code、name、description、enabled；公开 UUID、版本号与时间；内部主键和操作者字段不进入响应。
- 写入和审计在同一事务；更新按版本比较，过期提交返回 409；不生成任意删除能力。

公告普通读写和客户基本资料也已使用 MyBatis-Plus 受控仓库。历史客户目录的复杂只读 SQL、复合已读键操作及原子更新保留明确 Mapper；本轮没有强行替换所有历史 SQL。

## 新增一个模块

安装与校验环境：Node 20+、Java 17；根目录和 frontend 分别 `npm ci --include=dev`（前端可加 `--ignore-scripts` 避免 Electron 安装）。

1. 复制 `module-specs/service-catalog.json` 为新的规格文件，修改稳定 id、独占表名、角色、字段、双语文案和未使用的 Flyway 版本号。
2. 先预览，再生成：

```bash
npm run module:create -- module-specs/vendor-tags.json --dry-run
npm run module:create -- module-specs/vendor-tags.json
```

3. 审核生成的表约束、权限和 HTTP 操作，在 application/domain 中补真实规则，在模块 workflow 中补交互。
4. 加权限、空值、冲突、事务和交互测试，执行：

```bash
npm run verify:modules
npm run verify:typecheck
npm run verify:backend
npm run verify:customers
npm run verify:frontend
```

5. 有数据库变更时，还必须执行真实 MySQL 迁移矩阵，命令见 `DATABASE_MIGRATIONS.md`。迁移与应用作为同一次发布审查。

自动注册不需要在路由、侧栏和宿主模板各复制一份配置。生成器会保护生成文件和已发布迁移的摘要；应用服务、Controller、Repository、页面与 workflow 是手工扩展文件，重复生成不会覆盖。字段映射与字段描述单独生成，增添普通字段不必重复维护映射清单。

**当前自动生成范围明确限定为内部参考数据**：字符串、长文本、布尔、整数。客户订单、金额、多币种、文件授权与审批不能直接套这个权限策略。先定义领域模型和数据范围，再使用相同分层及接口工具；这类业务规则需要开发，不需要为每个普通增删改查手写 SQL。

## 字段和表结构更新

以规格中的字段定义为生成源，数据库变更进入新的 Flyway 文件，不能修改已经执行的 V1/V2/V3/V4。

- 新增可空普通字段：增加字段、选择新迁移版本、重跑生成命令，得到 `ADD COLUMN` 草案与更新后的 DTO / 类型 / 表单描述。
- 必填字段、默认值、唯一约束、字段重命名、类型变化、删字段：生成器拒绝自动猜测。采用“先扩展结构 → 回填 → 校验 → 切换读写 → 后续版本收缩”的发布过程。
- 数据回填、复杂索引、锁影响、历史脏数据属于人工评审内容，可以使用明确的 SQL 或 Java Flyway migration。自动生成 SQL 不等于免审核上线。
- 已有数据库没有 Flyway 历史表时，先做只读检查与备份校验，再用显式接管 CLI；正常启动不自动 baseline，不靠每个 Service 启动时补列。

流程中三类模型各有职责：规格控制参考数据字段，DTO 控制公开接口，Flyway 历史记录实际升级过程。不能根据实时数据库结构自动改变公开接口。

## 接口与异步状态

`npm run api:generate` 汇总模块规格与受控历史 DTO 契约，输出 `contracts/platform.openapi.json` 和 TypeScript 类型。`npm run api:check` 检查生成物是否过期。接口契约校验与真实服务行为测试一起执行。

新分页使用零基 `page`，`pageSize` 为 1–100，响应包含 items/page/pageSize/total/totalPages；历史接口保持旧响应兼容。

PATCH 字段缺省保留原值；显式 null 仅能清空可空字段；必填字段提交 null 被拒绝。前端表单仍可提交全部可编辑字段，必须携带原版本号；冲突后保留草稿，刷新核对后再提交。

员工和客户请求使用各自的凭据头。旧请求不能清除新登录会话，也不能把旧账号返回的数据填进新账号页面。离开页面会取消本地请求监听；已经到达服务器的写操作是否完成仍由服务器决定。

## 移动模块与角色边界

registration 的 id、命名路由保持稳定，调整 navigation 决定分组和顺序，mount 控制 URL。改变已发布 URL 时保留 redirect / alias。

surface 支持 business / admin / customer；生产 catalog 统一组装内置与 `generatedModuleRegistrations`，路由、角色范围、排序和管理员导航共用该定义。管理员十个旧页面保留原 workflow / 事件接线，由动态 loader 显示；新页面不增加宿主 `v-if`。

客户宿主入口为 `/customer-workspace/shipments`，使用独立客户会话，登录后通过现有受保护的 `/api/customer/shipments` 验证身份（项目没有客户 `/me` 接口）。客户请求只携带 `X-Customer-Token`，不借用员工令牌；过期、退出和账号变化会撤销客户视图。内置“我的票单”模块读取真实已授权列表并分页；原追踪客户入口及完整文件/货踪功能继续兼容，未在本轮全部搬迁。新模块可以在自己的页面作用域创建 runtime，不需要加入旧的 `BusinessModulePageMap`。

从业务端迁到客户端时，除了页面位置，还要提供客户范围 API 和客户端会话适配；只改 surface 不会授予数据权限。共享状态通过公开模块端口传递，不直接导入别的模块私有 workflow。

## Node 与交付校验

新增船司通过 `tracking-service/lib/carrier-adapter-registry.mjs` 注册可执行适配器，提供 `prepare(input, context)`、`track(prepared, options)` 和 `capabilities`，按需提供 `health()`、`dispose()`。`services/default-carrier-adapters.mjs` 只组装已接入的船司；HTTP 分发器不继续追加船司 if 分支。`prepare` 在缓存读取前完成输入和授权处理；`track` 接收真实取消信号与批量标记。适配器负责船司私有协议和代理策略。

`GET /api/carriers` 返回当前可执行注册表的能力，`GET /api/carriers/{code}/health` 调用对应健康接口。CMA 的 Cookie / User-Agent 只在适配器内使用，缓存按其摘要隔离，不在能力列表或响应中返回凭据；关闭时尝试全部适配器并汇总失败。第三适配器 HTTP fixture 验证新增船司、能力、缓存、授权前置和关闭生命周期，不请求真实船司。

默认 `npm run verify` 包含生成器 / 接口一致性检查；`.workflow/ci.yml` 也执行同一入口。数据库矩阵独立运行 MySQL 8.4，并用随机名称与所有权标签隔离容器，失败即阻断该阶段；不能用 H2 通过替代 MySQL 升级通过。

生产部署先确认备份与升级前置条件，执行迁移检查与应用构建，再发布应用镜像。旧库接管、普通增量升级与空库安装使用不同验证场景；具体指令以数据库迁移文档为准。

## 已有客户模块的实际迁移样板

客户新增、详情、更新已纳入公开 DTO 和类型客户端；contactEmail 通过 V5 可空列升级贯通 UI、仓库和查询投影。复杂历史表不交给内部参考模块生成器接管，其字段变化仍以新的审核后 Flyway 文件记录。客户资料的历史 PATCH 约定、省略/null/空字符串含义和负责人权限需要原样保留。

新增 `npm run verify:e2e` 运行真实 Java/MySQL HTTP 验收；`--serve` 可打开真实浏览器联调环境。命令、证据与测试边界见 [REAL_E2E_ACCEPTANCE.md](REAL_E2E_ACCEPTANCE.md)。
