# 发布与回滚手册（R02–R05/R08）

> 目标：部署经过 CI 验证的版本，失败可按已演练方案回滚，并保证数据库、文件、密钥、
> 配置与版本一致。脚本位于 `scripts/`，均可执行（Git 索引为 `100755`）。

## 1. 版本与镜像

- 三个应用镜像使用不可变标签：`docker-compose.yml` 中
  `image: cargo-planner-*:${IMAGE_TAG:-0.1.0}`。
- 发布时由 `deploy.sh` 生成 `IMAGE_TAG=release-<UTC时间>-<短SHA>`，不再复用固定 `0.1.0`
  覆盖旧镜像。
- 每次备份记录 `version.txt`（当前提交、分支、镜像标签）与 `images.txt`
  （容器 → 镜像引用与镜像 ID），回滚据此定位旧镜像。

## 2. 备份（`scripts/backup.sh`）

产物（写入 `./backups/<UTC时间戳>/`，目录已 gitignore）：

| 文件                         | 内容                                            |
| ---------------------------- | ----------------------------------------------- |
| `db.sql`                     | MySQL 全量导出（结构 + 数据 + 触发器/存储过程） |
| `secrets.tgz`                | backend `/app/secrets` 加密密钥卷               |
| `workspace-files.tgz`        | backend `/app/uploads`（工作区文件 + 公告图片） |
| `shipment-files.tgz`         | 宿主机 `SHIPMENT_FILE_HOST_PATH`（票单附件）    |
| `version.txt` / `images.txt` | 版本与镜像定位信息                              |
| `env.snapshot`               | `.env` 键名快照（值全部脱敏）                   |
| `checksums.sha256`           | 上述文件的校验和                                |

备份结束前自动 `sha256sum -c` 校验，校验失败即视为备份失败。

## 3. 部署（`scripts/deploy.sh`）

```sh
scripts/deploy.sh --ref <git-ref>          # 指定版本
scripts/deploy.sh                          # 使用当前工作区
```

顺序（修复复查 R02：旧脚本先切换代码再备份，导致回滚指向新版本）：

1. 记录**当前运行版本** `CURRENT_REF` 与分支；
2. **切换代码之前**执行备份（备份记录的是运行中版本）；
3. 再 `git checkout <ref>` 得到 `TARGET_REF`；
4. 用不可变标签构建、`docker compose up -d --wait`；
5. 冒烟：`/actuator/health`（nginx → 后端）与 `/tracking/api/health`；
6. 失败时打印回滚命令：`scripts/rollback.sh <backup-dir> --checkout <CURRENT_REF>`。

## 4. 回滚（`scripts/rollback.sh`）

```sh
scripts/rollback.sh ./backups/<时间戳> --checkout <旧版本>
scripts/rollback.sh ./backups/<时间戳> --db-only        # 仅恢复数据库
```

顺序（修复复查 R03/R05：旧脚本只 checkout + up，不恢复镜像/文件，且不停写）：

1. 校验备份 `checksums.sha256`，失败即退出，不触碰生产；
2. 停写：`stop backend tracking frontend`，仅保留 MySQL；
3. 恢复数据库并执行可达性检查；
4. 恢复密钥卷、工作区/公告文件、宿主机票单文件；
5. 优先使用备份记录的旧镜像标签启动（`docker image inspect` 命中则复用），
   否则 checkout 旧代码后重新构建；
6. 冒烟检查。

## 5. 配置读取（修复 R04）

`scripts/lib/common.sh` 的 `dotenv_value` 只按行提取键值，**绝不 `source .env`**，
因此 `APP_BOOTSTRAP_ADMIN_DISPLAY_NAME=System Administrator`（含空格）或带 `# $ ' "`
的密码不会被当作命令执行。已验证空格、`#`、`$`、引号、相对路径。

## 6. 演练状态

- 已用脚本语法检查（`bash -n`）、`docker compose config`、`.env` 解析探针与
  Dockerfile 输入复现验证静态正确性。
- **失败/中断场景的真实演练尚未执行**：本机 Docker 引擎不可用（需管理员启动）。
  上线前必须在隔离 Docker + MySQL 环境演练：成功发布、冒烟失败回滚、回滚中断恢复。
- 回滚会覆盖数据库与文件内容，执行前请再次备份当前状态。
