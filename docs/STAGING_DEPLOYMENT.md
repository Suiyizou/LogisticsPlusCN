# 隔离测试部署

测试部署使用独立的 `cargo-staging` Compose 项目、容器、网络和数据卷。宿主已有的 Nginx、MySQL 和原项目目录不由本流程修改。默认入口仅绑定 `127.0.0.1:18080`，通过 SSH 隧道访问。

## 代码与发布范围

当前测试分支为 `codex/staging-ci-20261026`。首次部署用于验证已经完成本地验收的重构快照及工作簿导入。远端 `combine` 比原重构基线另有 7 个功能提交，需在独立合并验收后再启用该分支的自动测试发布；本次没有覆盖 `combine`。

## Gitee 接入

`.workflow/ci.yml` 的测试部署阶段在检查、数据库验收、镜像构建之后调用 `node scripts/ci-staging-deploy.mjs`。默认关闭，未配置或设置 `STAGING_DEPLOY_ENABLED=false` 时只报告跳过。

账号侧需要开通流水线，选择具备 Docker 能力的 Runner，并在受保护的发布分支范围配置：

| 变量                      | 内容                                             |
| ------------------------- | ------------------------------------------------ |
| `STAGING_DEPLOY_ENABLED`  | 验证接入完成后设置 `true`                        |
| `STAGING_HOST`            | 测试服务器地址                                   |
| `STAGING_USER`            | SSH 账号                                         |
| `STAGING_PORT`            | SSH 端口，默认 22                                |
| `STAGING_ROOT`            | 独立测试目录，必须为绝对路径并以 `-staging` 结尾 |
| `STAGING_BRANCH`          | 实际允许发布的分支，默认 `combine`               |
| `STAGING_SSH_PRIVATE_KEY` | 专用 SSH 私钥，使用平台凭据保存                  |
| `STAGING_SSH_KNOWN_HOSTS` | 经核实的目标服务器 known_hosts 记录              |

本地人工验收可用 `STAGING_SSH_KEY_FILE` 指向本机受保护的密钥文件，替代私钥环境变量。密钥、初始管理员密码和数据库密码均不能提交 Git 或写入日志。平台生产凭据不得开放给 PR 或不受信任分支；脚本内部的分支校验不能替代平台凭据权限配置。

部署器核对当前 checkout SHA 与远端允许分支的 HEAD，上传 Git 源码归档，校验 SHA-256 后才解压到按 SHA 命名的目录。服务器以独占锁执行构建，四服务共用本次发布标签。测试账号和数据库凭据在服务器首次启动时生成，保存在测试目录 `shared/staging.env`，权限为 0600。初始账号为 `staging_admin`。

## 首次部署与访问

Compose 版本至少 2.24.4，用于端口列表的 `!reset` / `!override`。服务器需有 Git、Bash、flock、Python3、Docker 和 Compose；Python3仅用于首次随机凭据生成。服务器无需安装 Node、Java 或 Maven，构建在 Docker 内运行。小内存机器按后端、追踪、前端顺序构建。

首次空库由 Flyway 执行 V1～V5。该测试实例不采用主机已有 MySQL 或旧 Docker 数据卷，因此不涉及旧业务库接管。成功初始化后关闭 `APP_BOOTSTRAP_ADMIN_ENABLED`；保留或更换初始密码应由操作者在服务器私有环境中处理。

通过 SSH 本地转发：

```text
本机 127.0.0.1:18080 → SSH 加密连接 → 测试服务器 127.0.0.1:18080
```

域名原站不自动改成测试应用，也不自动创建公网端口或 DNS 记录。

## 验收与边界

`node scripts/verify-staging-compose.mjs` 实际解析 Compose，检查端口、容器、网络和卷隔离。`scripts/test/staging-deploy.test.mjs` 检查输入、默认关闭和归档校验；`staging-runtime.test.mjs` 执行实际 Bash 部署脚本，验证串行构建、公共资源探测、失败不发布和部署锁/归属门禁。

服务器发布检查首页、后端健康、追踪健康及 favicon/manifest 等静态文件。Nginx镜像发布时统一静态资源可读权限，避免源码归档采用严格 umask 后，Vite复制的公共资源返回403。

再次部署前保存测试数据库转储及校验和。本流程目前不是完整的文件/密钥灾备恢复系统，也不自动恢复数据库或自动回退。首次部署、服务器手工调用部署器成功，不代表 Gitee 流水线已经开通或远端 CI 已通过。

服务器磁盘较小时，需要控制发布与构建缓存保留量。脚本不自动清理原有镜像、容器或数据卷；正式上线前应进一步配置镜像仓库、运行镜像固定摘要、维护窗口和完整回退演练。
