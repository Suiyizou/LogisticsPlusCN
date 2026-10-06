# 本地验收记录（T12）

本记录只包含**本地可复现**的验证，不包含线上环境。未执行的部分单独列出并说明阻塞原因。

## 1. 环境

| 项                | 值                                                                                                       |
| ----------------- | -------------------------------------------------------------------------------------------------------- |
| 操作系统          | Windows 10.0.26200                                                                                       |
| Java              | 17.0.7 LTS（Oracle JDK）                                                                                 |
| Maven             | 3.9.9                                                                                                    |
| Node.js / npm     | v24.9.0 / 11.6.0                                                                                         |
| MySQL（真实实例） | 8.0.42，独立临时实例，`127.0.0.1:3307`，数据目录在仓库外 `.tmp/mysql-refactor`（已 gitignore，非生产库） |
| Docker            | 客户端 29.4.0；**引擎未启动**（`com.docker.service` Stopped，启动需管理员权限），因此容器编排未验证      |
| 前端              | Vite 5 生产构建（Node）                                                                                  |

真实 MySQL 实例的启动方式（可复现，不使用生产数据）：

```sh
mysqld --no-defaults --datadir=<tmp>/data --port=3307 --bind-address=127.0.0.1 \
  --mysqlx=OFF --log-error=<tmp>/error.log
mysql --no-defaults -h127.0.0.1 -P3307 -uroot < backend/sql/schema.sql
```

## 2. 已执行的验证与结果

### 2.1 静态与单元/回归

| 检查                             | 命令                                  | 结果                                 |
| -------------------------------- | ------------------------------------- | ------------------------------------ |
| 质量门（Prettier + ESLint 棘轮） | `node scripts/quality.mjs`            | 通过                                 |
| 前端类型检查                     | `npm --prefix frontend run typecheck` | 通过                                 |
| 后端测试 + Checkstyle            | `npm run verify:backend`              | 26 类 / 207 项通过，0 失败           |
| 追踪服务测试                     | `npm run verify:tracking`             | 103 项通过                           |
| 装箱回归                         | `npm run verify:packing`              | 4 组脚本（见 `docs/TEST_MATRIX.md`） |
| 前端生产构建                     | `npm run verify:frontend`             | i18n 扫描 + Vite 构建通过            |

### 2.2 真实 MySQL：schema 与 MyBatis 查询

| 步骤                                         | 结果                                                                                                |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `backend/sql/schema.sql` 应用到空库          | 成功，34 张业务表                                                                                   |
| 后端连接真实 MySQL 启动                      | `/actuator/health` = UP                                                                             |
| 未登录访问 `/api/business/customers`         | 401                                                                                                 |
| 管理员登录 `POST /api/auth/login`            | 200，返回 token                                                                                     |
| 创建客户 `POST /api/business/customers`      | 200，返回 20 字段元数据                                                                             |
| `GET /api/business/customers`（MyBatis）     | 200，含 `createdByDisplayName`、`responsibleAgentDisplayName`、UTC 时间、`shipmentCount` 等原有字段 |
| 单次目录请求的 SQL 次数（MySQL general log） | **1 条客户查询**（JOIN 取回员工信息），N+1 已消除                                                   |

### 2.3 真实 MySQL：Flyway（T06）

| 场景       | 操作                                  | 结果                                                       |
| ---------- | ------------------------------------- | ---------------------------------------------------------- |
| 新库初始化 | 空库启动后端                          | `flyway_schema_history` 记录 V1；业务表 34 张 + history 表 |
| 现有库升级 | 已有 34 张表、无 history 的库启动后端 | 先写 BASELINE(0)，再幂等执行 V1；原有 1 条客户数据保留     |

配置：`spring.flyway`（`baseline-on-migrate: true`、`baseline-version: 0`、`validate-on-migrate: true`），
迁移文件 `backend/src/main/resources/db/migration/V1__baseline.sql`。SchemaInitializer 的补列逻辑
**未删除**，后续批次再逐条转为 V2+。

### 2.4 追踪服务

| 检查                               | 结果                        |
| ---------------------------------- | --------------------------- |
| `node server.mjs`（PORT=3001）启动 | 成功                        |
| `GET /api/health`                  | 200，返回通道/代理/限流状态 |

## 3. 未执行 / 阻塞

| 项                           | 原因                                    | 需要的条件                                                                         |
| ---------------------------- | --------------------------------------- | ---------------------------------------------------------------------------------- |
| `docker compose up` 全栈联调 | Docker 引擎无法启动（需管理员启动服务） | 本机管理员权限启动 Docker Desktop，或改用已有 Docker 主机                          |
| 浏览器端关键流程走查         | 依赖全栈（前端 + 后端 + 追踪 + MySQL）  | 同上                                                                               |
| 前端 Nginx 代理与限流验证    | 同上                                    | 同上                                                                               |
| 数据库“回滚演练”实操         | `scripts/rollback.sh` 需要 MySQL 容器   | Docker 环境；已验证脚本语法（`bash -n`）与 compose 配置（`docker compose config`） |
| 线上更新                     | 无服务器/发布权限                       | 见 `docs/MODULE_INVENTORY.md` 第 7 节                                              |

> 注意：本次验收**不能用**“H2 通过”代替真实 MySQL；上文 2.2/2.3 均在真实 MySQL 8.0.42 上完成。
> 但容器编排与线上部署仍未验证，因此不能声称“已完成完整验收”。

## 4. 复现命令汇总

```sh
# 依赖
npm install --include=dev
npm --prefix frontend install --include=dev --ignore-scripts
npm --prefix tracking-service install

# 本地等价 CI
node scripts/verify.mjs

# 真实 MySQL（临时实例，端口 3307）
mysql -h127.0.0.1 -P3307 -uroot < backend/sql/schema.sql
cd backend && mvn -DskipTests package
SPRING_DATASOURCE_URL='jdbc:mysql://127.0.0.1:3307/cargo_planner?useSSL=false&allowPublicKeyRetrieval=true&serverTimezone=Asia/Shanghai' \
SPRING_DATASOURCE_USERNAME=root SPRING_DATASOURCE_PASSWORD= SERVER_PORT=8081 \
java -jar target/cargo-planner-backend-0.1.0.jar
```
