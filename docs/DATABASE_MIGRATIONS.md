# 数据库结构版本与旧库接入

数据库结构只有一个执行入口：Flyway。新库直接执行 V1、V2、冻结的 Java V3 和后续版本；Docker 不再挂载 schema.sql，业务 Service、ApplicationRunner 和请求路径不再建表或补列。backend/sql/schema.sql 仅为参考快照，不是部署脚本。

## 新增模块或修改字段

普通 CRUD 由统一持久层处理，表结构变更仍须形成明确的版本迁移。开发者可用模块生成工具产生迁移草稿；新模块使用新的 Vn__description.sql，复杂历史数据转换使用版本私有 Java migration。Flyway 在部署时执行已审核的变更，不推断字段是否重命名，也不从 Entity 自动修改生产数据库。

已发布的 V1、V2 和 V3 不修改。V3 将原启动升级中的角色转换、责任人/快照归属、代理委托范围、文件可见角色、历史引用清理、补列、约束和索引升级冻结到一次性执行的版本中。V3 的 Flyway checksum 来源于同目录 manifest；单测核对 manifest 中的 SHA-256 与 Java 源码。修改已发布 V3 会导致源码校验或 Flyway validate 失败，应新增版本。

结构变化优先采取：增加兼容列或表 → 发布兼容读写 → 可重入分批回填 → 验证数据与权限 → 切换代码 → 后续独立版本删除旧字段。不能根据两个字段名的差异自动执行 DROP COLUMN；收紧 NOT NULL/UNIQUE 或增加外键前，先验证历史数据能满足约束。MySQL DDL 不保证与所有数据转换组成一个可整体回滚的应用事务，失败后先检查实际状态，再做向前修复。

## 从空库开始

MySQL 只创建空数据库及部署用户。正常启动保留 SPRING_FLYWAY_ENABLED=true，baseline-on-migrate 固定为 false。迁移失败应停止发布并检查原因，不能用 repair、改旧迁移或打开自动 baseline 消除报错。

生产建议在维护窗口通过独立迁移账号执行本工具的 --migrate，再启动应用。迁移账号与运行账号应采用独立凭据，应用写业务数据的权限不应被无限扩大。部署流程中的数据库备份还应包括加密主密钥与业务文件。

## 已有未版本化数据库：显式接入

默认拒绝未包含 flyway_schema_history 的非空数据库。受控接入命令是管理 CLI，不是 Web API，也不会被正常启动调用。

1. 核对实际目标、停止旧应用写入，使用 scripts/backup.sh 完成数据库、主密钥和文件备份，并校验 checksums.sha256。备份后的源 SQL 不要改写。
2. 先把备份导入隔离数据库演练。当前 CLI 只接受冻结 V1 的已知 34 张表及关键历史列；表集合或关键列不匹配会拒绝，新增历史布局应单独审核，不放宽成“任意非空库”。
3. 使用当前打包 JAR 的 --inspect 导出真实结构和 SHA-256 fingerprint。检查列、索引、外键和 CHECK，以及 V3 需要转换的数据；指纹仅证明“本次审核的就是这个结构”，不代替数据正确性审查。
4. 将审核过的 fingerprint 和已验证备份的 checksums.sha256 路径显式传给 --adopt-legacy。CLI 验证整个备份清单的文件存在、目录边界、非空和 SHA-256，并要求数据库结构与审核指纹完全匹配；成功后只记录 baseline 0，不运行结构升级。
5. 单独执行 --migrate，检查结果、数据量、可见范围和业务回归，再执行 --validate。

连接配置只从 SPRING_DATASOURCE_URL、SPRING_DATASOURCE_USERNAME、SPRING_DATASOURCE_PASSWORD 环境变量读取；不要把密码写进命令参数或版本库。以下命令假定已安全设置这些环境变量：

```bash
mvn -f backend/pom.xml package
java -Dloader.main=com.cargoplanner.backend.database.DatabaseMigrationCli \
  -cp backend/target/cargo-planner-backend-0.1.0.jar \
  org.springframework.boot.loader.launch.PropertiesLauncher --inspect > schema-before.json

java -Dloader.main=com.cargoplanner.backend.database.DatabaseMigrationCli \
  -cp backend/target/cargo-planner-backend-0.1.0.jar \
  org.springframework.boot.loader.launch.PropertiesLauncher --adopt-legacy \
  --expected-fingerprint <审核后的64位SHA256> \
  --backup-manifest <备份目录>/checksums.sha256

java -Dloader.main=com.cargoplanner.backend.database.DatabaseMigrationCli \
  -cp backend/target/cargo-planner-backend-0.1.0.jar \
  org.springframework.boot.loader.launch.PropertiesLauncher --migrate
```

Windows PowerShell 中使用单行命令，或用反引号换行；将 -Dloader.main=... 整个参数放进单引号可避免 PowerShell 参数解析差异。

## 自动 MySQL 验收

```bash
mvn -f backend/pom.xml package
node scripts/verify-database-migrations.mjs
# CI 同源入口：Maven / Java 均在隔离容器运行，宿主只需 Node20 + Docker
node scripts/verify-database-ci.mjs
# 可选：只读导入给定历史备份，在独立容器副本上复验
node scripts/verify-database-migrations.mjs --legacy-sql /absolute/path/cargo_planner.sql
```

本地模式前置条件为 Java 17、当前打包的 Spring Boot JAR、Docker Engine 和 mysql:8.4 镜像。使用 --java-runtime docker 可在隔离 Java17 容器中执行同一矩阵；verify-database-ci.mjs 还会用生产 Dockerfile 的 build 阶段生成当前 JAR，因此 CI 宿主只需要 Node20 与 Docker。脚本不连接现有 MySQL，不操作原部署容器：只创建 cargo-migration-test- 随机名称的 MySQL，Docker Java 模式额外创建带所有者 label 的 Java 容器与内部网络，随机端口仅绑定 127.0.0.1；清理前同时检查名字和所有者 label，仅删除自己的容器、匿名卷与临时网络。

默认矩阵覆盖：纯 Flyway 空库；合成历史布局和权限数据；非空库无隐式 baseline；不匹配指纹/损坏备份/未知表集合拒绝；显式接入；角色、会话、代理范围、快照归属、文件可见角色、业务字段与无效引用转换；新旧路径列/索引/约束等价；重复迁移及真实应用两次启动不重复执行历史权限回填；V3 checksum 持久化。可选历史 SQL 还核对客户/票单数量、结构等价、源文件哈希不变。JSON 报告默认写入 .tmp/，不包含凭据和原始业务行。

这套矩阵不能替代真实页面验收、所有业务 API 权限测试或上一版本应用二进制的兼容性演练。发布涉及删列/改类型等不兼容变化时，须额外运行上一版应用读写测试。CI 应在具备 Docker 能力的 job 中先打包 JAR 再运行脚本；Docker 不可用时失败，不伪造通过或静默跳过。

## 备份与回退

Flyway validate 校验版本与 checksum，不等于实时数据库没有漂移；结构比对和数据回归属于独立检查。回滚整个数据库会覆盖备份后的业务写入，属于灾备操作，不能当作普通功能回退。常规发布优先依赖兼容扩展与旧应用回退，必要时向前修复。恢复数据库时必须配套恢复对应加密密钥与业务文件。

需要更新 schema.sql 参考快照时，从全新数据库完整迁移后导出 --no-data 结构，保留参考说明；禁止通过维护另一份手写建表脚本形成第二个结构入口。

## 历史结构的等价与命名

受控接入输出的原始 fingerprint 不忽略任何已采集结构字段。验收中的语义等价比较只在 InnoDB 表上将 NO ACTION 与 RESTRICT 归一，并只接受 cp_customer_employee_assignments 表三项已核实的历史别名：assignment_actor → assigned_by、assignment_customer → customer、assignment_employee → user（完整名称见 scripts/lib/schema-equivalence.mjs）。引用表、引用列、约束动作、索引列顺序、唯一性等仍须完全一致；其他名称和其他表不会被放宽。

现有迁移没有依赖这些历史别名执行 DROP FOREIGN KEY。未来若确需删除/替换这些外键，必须查询 INFORMATION_SCHEMA 获取实际约束名称并核对列和引用关系，或者明确支持已知别名；不能假定所有旧库物理名称都等于 V1 的名称。为统一外观而删除重建有效外键没有必要。

## 本轮实测记录（2026-10-14）

以下均为本地真实执行，未连接生产数据库，未触发远端 Gitee job。可归档证据见 [数据库矩阵 JSON](evidence/database-migrations-2026-10-14.json)。

| 验收入口                                                          | 实际结果                                                                                            |
| ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| 最终打包 JAR + Docker Java17 / MySQL8.4 + 桌面历史 SQL 的只读副本 | 30 / 30 检查通过，包含新库、合成旧库、实际历史库、显式接管、V1 至 V4、应用两次启动及清理            |
| 生产 Dockerfile 的 build 阶段 + 同源 CI 数据库矩阵                | Docker 构建成功，26 / 26 检查通过；冷缓存 dependency:go-offline 耗时 764.4 秒，随后 package 24.3 秒 |
| 结构等价边界单元测试                                              | 14 / 14 通过，包含不应归一的类型、NULL、唯一性、前缀、级联与未知命名反例                            |

最终本机 JAR SHA-256 为 `d037c7536861f60a51dec7531771bdd9181719516688f16cfbc305eeae2b2756`；Docker 构建产物 SHA-256 为 `08ec67974338e153438a466b4cd944e54ee62a29e4aa6a3226de93a36365b299`（分别构建的压缩包摘要，不要求相同）。历史 SQL 在验收前后保持 SHA-256 `73aabf602eb041fdeb0c5eb7f1e3b254973e59dde929bff72a18047749d3e6a0`。

所有本轮专用测试容器、匿名数据卷和内部网络已清理；原有部署容器未由脚本启动或修改。此处 Docker 成功指后端生产 Dockerfile 的 build 目标及迁移运行环境，未把其余服务的完整生产镜像构建或远端部署算作通过。备份门禁已实测，不等同于完整灾备恢复演练。
