# CI 接入说明（T11）

## 1. 目标

目标执行顺序为：质量门 → 模块/契约检查 → 类型检查 → 后端与前端行为测试 → 追踪测试 → 装箱回归
→ 前端生产构建 → 真实 MySQL 新旧库迁移验收 → 镜像构建。CI 不在仓库里保存任何密钥；需要镜像推送时，凭据放在
Gitee 控制台的“变量/凭据”。

## 2. 配置位置

- 流水线文件：`.workflow/ci.yml`（Gitee Go 自定义流水线）。
- 常规执行入口与本地一致：`node scripts/verify.mjs` 及其子命令。
- 数据库独立阶段使用 `node scripts/verify-database-ci.mjs`：通过生产 Dockerfile 的 build 阶段打包当前 JAR，随后运行同一个真实 MySQL 矩阵；Maven 和 Java17 都在隔离容器执行。
- 镜像阶段在具备 Docker 能力的 Node Runner 中显式执行 `docker build`。后端和前端使用仓库根目录作为 context；追踪服务使用 `tracking-service`，避免把根目录依赖误装进追踪镜像。`--file` 只指定 Dockerfile，不会切换 context。

## 3. 开通步骤（需要仓库管理员权限）

1. 打开 Gitee 仓库 → `流水线` → 开通 **Gitee Go**。
2. 选择“自定义流水线”，把 `.workflow/ci.yml` 的内容粘贴/覆盖进去并保存。
3. 确认已绑定可用的 **Runner**（公共 Runner 或自有主机）。
4. 首次运行前在 `变量/凭据` 配置（仅镜像推送阶段需要）：
   - `DOCKER_REGISTRY`、`DOCKER_USERNAME`、`DOCKER_PASSWORD`
     这些名称只作为占位；`ci.yml` 当前只构建镜像、不推送，因此可以暂不配置。
5. 提交一次 `push` 或发起 PR，确认流水线被真实触发并跑绿。

## 4. 质量门基线（修复复查 R06）

旧实现只在 `origin/main...HEAD` 有差异时检查，当 CI 在 main 的新提交上运行时
`origin/main` 就等于 `HEAD`，差集为空，质量门会静默退回只检查 `scripts/`，
从而漏掉新增错误并返回成功。现已修正：

- 优先使用 `QUALITY_BASE_REF`（CI 传入 push 的前一 SHA / PR 目标基线）；
- 任何等于 `HEAD` 的候选基线都会被跳过；
- CI 下退回 `HEAD~1`；仍取不到可信基线则直接失败（退出码 2），不回退到固定目录；
- 显式 `QUALITY_BASE_REF` 无法解析时直接失败，不静默降级。

本地对照（验证修复）：

```sh
QUALITY_BASE_REF=does-not-exist node scripts/quality.mjs   # 退出码 2
CI=1 QUALITY_BASE_REF=HEAD node scripts/quality.mjs         # 退出码 2
CI=1 node scripts/quality.mjs                               # 退回 HEAD~1，检查真实变更
```

Runner 必须能访问足够历史（非浅克隆），否则质量门会失败；也可显式传入正确基线。
PR 建议传入目标分支的 merge-base。

## 5. 依赖锁文件

根目录已提交 `package-lock.json`，流水线使用 `npm ci --include=dev`；前端与追踪服务
同样使用 `npm ci`。本地与 CI 的 Node / Java / MySQL 版本应保持一致。

## 6. Runner 与真实执行状态

迁移验收和镜像构建都要求 Docker-capable Runner。数据库阶段的宿主只需 Node20 与 Docker，但必须能获取官方 Maven、Java17、MySQL8.4 镜像及 Maven 依赖；Docker 不可用或构建失败应让阶段失败，不能删除这道质量门或静默跳过。

本轮未触发远端 Gitee 流水线，也未把本地成功当作远端已跑绿。仓库管理员需要核对已开通的 Gitee Go、Runner 的 Docker 能力、可信 Git 历史和镜像仓库配置；推送凭据只放控制台。实际远端结果以触发后的 job 日志和报告为准。

本地同源入口如下，是否通过以本次实际输出为准：

```sh
npm ci --include=dev
node scripts/verify.mjs   # quality + modules + typecheck + customers + release + backend + tracking + packing + frontend
node --test scripts/test/schema-equivalence.test.mjs
node scripts/verify-database-ci.mjs  # 当前 Docker 构建 + 隔离 Java17/MySQL8.4 矩阵
```

数据库矩阵从纯空库、合成历史库分别迁移到当前版本，检查受控 baseline 门禁、数据/权限回填、结构等价、重复迁移和真实应用两次启动。仅允许已审核的 InnoDB 外键动作别名与客户归属表三项已审核历史命名别名等价，仍校验类型、NULL、默认值、唯一性、索引列顺序、前缀和级联规则。受控接入的指纹保持原始精确值，不被语义比较替换。

本轮 2026-10-14 已在本机实际运行同源数据库 job：生产 Dockerfile 的 build 目标成功，隔离 Java17 / MySQL8.4 矩阵 26 / 26 通过；追加实际历史 SQL 副本的最终 JAR 矩阵 30 / 30 通过。结构比较器单测 14 / 14 通过。结果、JAR 和历史 SQL 摘要存于 [验收证据](evidence/database-migrations-2026-10-14.json)。这证明命令已执行，未证明 Gitee Runner 已配置或远端已跑绿；其余服务生产镜像阶段也未在此数据库 job 中验收。

CI 入口默认报告路径为 `.tmp/database-migrations-ci.json`，可由 Runner 归档。镜像拉取超时是外部执行失败，不是迁移测试通过；详见 [数据库迁移与接入](DATABASE_MIGRATIONS.md)。

## 7. 与“只交付 YAML”的区别

- CI 命令就是本地验证通过的同一套命令（见 `docs/ENGINEERING.md`）。
- 流水线文件使用 Gitee Go 的 `build@nodejs` / `build@maven` 步骤，Docker 构建命令显式声明 context，
  但“远端是否真实跑绿”必须在获得仓库权限后确认。在此之前，本文件的状态是
  **已就绪、待远端触发验证**，不作为“已接通 CI”的结论。

## 8. 新模块与模板类型门

verify 的 modules 任务校验模块元数据、接线、生成契约及平台约束；typecheck 包含 TypeScript、vue-tsc 严格模板、真实组件负向回归及模块端口编译回归。新增模块自动纳入约定目录和检查入口，不通过复制一套 CI 完成接入。安装开发依赖需使用 include=dev，具体工具版本以锁文件为准。

覆盖统计以检查脚本的本次输出为准，不在此复制历史组件数量。`frontend/scripts/check-sfc-typecheck.mjs` 禁止已纳入范围的组件退回 JS 或跳过模板检查；`check-module-port-types.mjs` 验证工作流和展示端口的真实工厂及误用探针。前端 OpenAPI 类型生成不能替代后端权限和数据范围验证。

远端 Gitee 是否已运行仍须单独确认；本地同源命令、Docker/数据库专项结果与远端平台状态分别记录。
