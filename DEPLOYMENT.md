# Deployment

当前项目采用单仓库、统一入口、分服务容器部署：

- `frontend`：Nginx 静态前端与统一网关。
- `backend`：Spring Boot 管理账号、设备登录、监控接口。
- `tracking`：纯静态 Nginx 追踪页面，仅在 Compose 的 `app` 网络暴露 `3000`；最终镜像不含 Node.js、Playwright 或浏览器。
- `mysql`：保存用户、客户、票单、追踪快照、文件元数据、设备和审计日志，仅接入内部 `data` 网络。

路由关系：

| 外部路径                                  | 目标                   |
| ----------------------------------------- | ---------------------- |
| `/`                                       | Vue 公开品牌主页       |
| `/planner/*`、`/admin`、`/workbenches` 等 | Vue 企业登录与权限门禁 |
| `/api/*`                                  | Spring Boot            |
| `/tracking/*`                             | Nginx 追踪静态资源     |

实时查询经过 Spring 的业务员/管理员鉴权，由后端调用内网穿透后的本地 Chrome 队列 API；客户读取已授权快照。静态容器保留 `/api/health` 供存活检查，旧浏览器查询与通道检查端点返回 `410 TRACKING_CLOUD_ADAPTER_REMOVED`。完整契约见 [本地 Chrome API 对接](docs/LOCAL_CHROME_TRACKING_API.md)。

如果 Docker Nginx 前方还有 CDN 或宿主机反向代理，需要仅对受信任的代理地址配置 `set_real_ip_from` 与 `real_ip_header`。否则 `$binary_remote_addr` 会是统一的前置代理 IP，所有访客将共用同一追踪查询限额。

## Docker 部署

```bash
docker compose up -d --build
```

首次启动 MySQL 时会自动执行：

```text
backend/sql/schema.sql
```

后端同时启用 Flyway 版本化迁移（`backend/src/main/resources/db/migration/`）：

- 新库：Flyway 执行 `V1__baseline.sql` 创建全部表；
- 已有库：`baseline-on-migrate=true` 先写入 baseline(0)，再幂等执行 `V1`，不覆盖已有数据；
- 需要在演练/回退时可不改代码，仅用环境变量关闭：`SPRING_FLYWAY_ENABLED=false`。

迁移开关与回退方式已在真实 MySQL 8.0 验证（见 `docs/ACCEPTANCE.md`）。升级生产前仍应先
导出结构（`mysqldump --no-data`）与实际库比对，再规划后续 `V2+` 迁移。

系统不再内置固定管理员账号或密码。首次部署请先复制 `.env.example` 为 `.env`，设置强数据库密码，并临时启用显式管理员引导：

```env
APP_BOOTSTRAP_ADMIN_ENABLED=true
APP_BOOTSTRAP_ADMIN_USERNAME=你的管理员账号
APP_BOOTSTRAP_ADMIN_PASSWORD=12-128位、包含大小写字母数字符号、且不含管理员账号
APP_BOOTSTRAP_ADMIN_DISPLAY_NAME=系统管理员
```

管理员创建成功后，立即把 `APP_BOOTSTRAP_ADMIN_ENABLED` 改回 `false`，清除部署环境中的引导密码并重建 backend。引导密码必须为 12-128 位，包含大小写字母、数字和符号，并且不得包含管理员账号（不区分大小写）；例如账号为 `admin` 时，`Admin@123456` 会因包含账号而被拒绝，而不是因为长度不足。

升级旧数据库时，后端仍会拒绝使用已知历史固定口令（`123456` 或 `Admin@123456`）的活动账号；`password_iterations=120000` 只用于缩小检查范围，不会单独判定账号不安全。若数据库中只有一个命中的旧管理员，可复用一次性引导变量原地轮换：

```env
APP_BOOTSTRAP_ADMIN_ENABLED=true
APP_BOOTSTRAP_ADMIN_USERNAME=旧管理员的准确账号
APP_BOOTSTRAP_ADMIN_PASSWORD=新的强密码且不得包含该账号
APP_BOOTSTRAP_ADMIN_DISPLAY_NAME=系统管理员
```

成功启动后会更新该管理员的口令哈希、撤销已有登录设备会话并写入审计日志，不会创建第二个管理员。随后立即禁用引导并清除密码。若命中多个账号，或命中的是非管理员账号，需先在受控数据库环境中逐一轮换或停用，后端不会猜测迁移目标。

`tracking` 构建阶段根据锁文件准备页面所需资源，最终阶段仅复制到 `nginx:alpine`。默认 Compose 不再启动船司浏览器、通道监控或代理池，也不分配浏览器共享内存。`docker-compose.carrier-agent.yml`、`docker-compose.proxy-pool.yml` 属于旧适配器实验配置，不用于这套云端部署。

部署环境中配置：

```env
APP_TRACKING_ADAPTER_MODE=LOCAL_QUEUE
APP_TRACKING_LOCAL_BASE_URL=http://host.docker.internal:18791
APP_TRACKING_LOCAL_TOKEN=
```

若已有 `.env` 写入 `APP_TRACKING_ADAPTER_MODE=LEGACY`，需改为 `LOCAL_QUEUE`。本地 `D:\AI\shipping-tracking` 运行 Chrome 和队列，设置 `CONCURRENCY=1`；云端只需能访问隧道 API，不需要访问船司官网。Docker 到宿主机隧道监听地址的配置见接口说明。

本地未启用业务令牌时，Java 令牌可以留空；启用时本地 `TRACK_TOKEN`/`TOKEN` 与云端令牌必须一致，并重启相应服务，本地 `/health` 同样受鉴权。`DISABLE_UI=1` 只关闭页面入口，不保护 `/jobs`。若 18791 仍对公网开放，应在云安全组限制到后端来源 IP/网段，或启用业务令牌。健康接口与不入库的手动 canary 见接口说明，不以 HTTP 200 或首次 `chrome.connected:false` 单独判断查询能力。

批量取消由 Spring 映射为本地 `POST /jobs/{id}/cancel`。超时也会尝试取消已知作业；本地正在执行的单条是否立即中止，以本地服务实现为准。

### 票单手动更新

海外代理保留与客户主页一致的“总览”看板，更新操作集中在“分配票单”页面。代理只能更新业务员已授权给自己的票单，可使用单票更新、勾选批量更新和一键更新；业务员仍可在原工作台手动更新。

系统定时自动更新默认关闭：

```env
APP_TRACKING_AUTO_REFRESH_ENABLED=false
APP_TRACKING_AUTO_REFRESH_DAILY_TIME=00:00
APP_TRACKING_AUTO_REFRESH_TIME_ZONE=Asia/Shanghai
APP_TRACKING_AUTO_REFRESH_CLAIM_BATCH_SIZE=10
```

部署环境应保持 `APP_TRACKING_AUTO_REFRESH_ENABLED=false`。一键更新会跳过已空箱归还的终止票单，批量更新仅处理代理勾选的授权票单；所有接口都会重新校验海外代理与票单的有效授权关系。

Compose 把 `frontend`、`backend`、`tracking` 放入 `app` 网络，只让 `backend` 额外加入内部 `data` 网络访问 MySQL。静态追踪容器不连接数据库，也不保存 API Token。附件实体文件由 `SHIPMENT_FILE_HOST_PATH` 挂载到宿主机固态硬盘，MySQL 只保存安全文件名、路径和可见性元数据；该目录必须纳入独立备份并限制宿主机权限。

### 本地 Chrome 登录态与旧会话数据

本地 API 模式使用 Windows 上专用 Chrome 的登录态，CMA 查询不要求云端保存 DataDome Cookie。云端只配置队列 API 的业务 Token。

已有 `cp_tracking_credentials` 与 `backend-secrets` 卷仍保留在备份流程中，避免升级时丢失历史数据；新本地查询链不依赖这些旧会话。

Compose 为 `app`、`data` 固定使用 `cargo-planner-app`、`cargo-planner-data` 两个 Docker 网络名；代码目录改名或 Compose 项目名变化时不会再生成另一套网络，同时不会改变既有 MySQL 数据卷名。若升级前已经出现“backend 解析不到 `mysql`”，先检查新网络和旧 MySQL 的网络归属：

```bash
docker network inspect cargo-planner-data
docker inspect cargo-planner-mysql --format '{{json .NetworkSettings.Networks}}'
```

如果 MySQL 的输出中没有 `cargo-planner-data`，将旧容器接入固定网络后再重建后端。若 `docker network connect` 提示已存在，直接继续下一条：

```bash
docker network connect cargo-planner-data cargo-planner-mysql
docker compose up -d --force-recreate backend
docker compose ps
```

最后再次检查两个容器，确认它们都列出 `cargo-planner-data`。

## 前端路由刷新

前端使用 Vue Router history 模式，线上 Nginx 必须把非 `/api`、非 `/tracking`、非静态资源的路径回退到 `index.html`。否则直接刷新 `/planner/results`、`/smart-import`、`/admin` 等地址会由 Nginx 当作真实文件路径处理，从而出现 404/405。

`docker/nginx.conf` 已包含必要配置：

```nginx
location / {
  add_header Cache-Control "no-cache";
  try_files $uri $uri/ /index.html;
  error_page 404 /index.html;
}
```

如果服务器没有走 Docker 内置 Nginx，需把同等配置同步到线上站点配置后执行 `nginx -t && nginx -s reload`。

## 更新与排查

拉取 `combine` 分支后可统一重建：

```bash
git pull origin combine
docker compose up -d --build
docker compose ps
docker compose logs --tail=100 frontend backend tracking
```

追踪容器内部健康接口为 `http://127.0.0.1:3000/api/health`，Compose 会自动探测。浏览器不再保存统一追踪快照；已登录用户的总览与详情直接读取 Spring Boot 持久化到 MySQL 的快照。Node 进程缓存仍只用于短期请求去重。Spring Boot 只保存同时含稳定订舱号/提单号和有效运输节点、路线、箱信息或关键时间的追踪快照；空快照不会创建或覆盖数据库记录，已有有效快照时返回旧快照并标记为 stale。仅有集装箱号且无法解析出稳定订舱号/提单号的结果也只作为临时查询结果，不会作为长期票单主键。

生产环境只需对外开放 Nginx 的 `80/443`。Compose 中后端 `8080` 与 MySQL `3306` 默认绑定 `127.0.0.1`，用于服务器本机排查；生产服务器若不需要宿主机直连数据库，建议通过 production override 删除 MySQL 的 `ports`。如确需远程直连，必须同时调整绑定地址、强密码和防火墙规则。

## LLM 文本识别

智能导入里的“交给 Agent 识别”由后台“系统管理”控制，默认启用 LLM，默认模型为 `deepseek-v4-flash`。如果尚未配置 API Key，会自动使用规则兜底。

推荐操作：

```text
管理员登录后台 -> 系统管理 -> 智能识别模型配置 -> 填写 API Key -> 保存
```

`.env` 可作为首次启动的默认种子值：

```env
SPRING_AI_CHAT_MODEL=none
SPRING_AI_OPENAI_API_KEY=你的_API_Key
SPRING_AI_OPENAI_BASE_URL=https://api.deepseek.com
SPRING_AI_OPENAI_MODEL=deepseek-v4-flash
EXCEL_AGENT_BATCH_CONCURRENCY=3
```

说明：后台保存后的配置存入 MySQL，修改 LLM 开关、API Key、Base URL、模型名后不需要重新打包。

`EXCEL_AGENT_BATCH_CONCURRENCY` 控制同一个 Excel 识别任务的并发批次数，范围为 `1-4`，默认 `3`。供应商限流严格时可设为 `2`；设为 `1` 可恢复串行识别。后端对 `408/429/502/503/504` 会按 `Retry-After` 或有界指数退避自动重试。该参数属于后端进程配置，修改后需要重启后端。

如果修改了 Java 源码，仅执行 `docker compose restart backend` 不会生成新 JAR，固定镜像标签也不会自动更新。拉取代码后必须重新构建并强制重建后端容器：

```bash
git pull
docker compose build --no-cache backend
docker compose up -d --force-recreate backend
docker compose logs --tail=100 backend
```

登录后访问 `/api/text-recognition/capabilities`，新识别引擎应返回 `adaptiveBatching: true`、`parallelBatching: true`、`maxConcurrentBatchRequests: 3`（或部署值）和 `engineVersion: excel-agent-batch-v5`。如果前端配置了 `VITE_API_BASE_URL`，还要在浏览器 Network 面板确认识别请求实际发往新后端地址，而不是旧 API 实例。

## 本地开发

前端：

```bash
cd frontend
npm install
npm run dev
```

后端：

```bash
cd backend
mvn spring-boot:run
```

货物追踪：

```bash
cd tracking-service
npm ci
npm start
```

MySQL 可以使用本机服务，也可以只启动 compose 里的数据库：

```bash
docker compose up -d mysql
```

## 运行模式

- 装箱计算仍在用户浏览器的 WebWorker 中完成，不消耗服务器 CPU。
- 后端主要承载账号、登录设备限制、管理员后台和监控数据。
- Web 端无法直接读取真实 MAC 地址；当前记录设备指纹、IP、UA，并预留 MAC 字段。

## 香港优先的机场代理池

机场文件中的 Shadowsocks/VMess 节点不能直接交给 Node.js 的 SOCKS5 客户端。部署时使用
`docker-compose.proxy-pool.yml` 启动 Mihomo 侧车，由 Mihomo 读取私有的 `proxies:` 文件并向
tracking 容器提供内部 SOCKS5 端口。机场文件必须放在仓库外并限制权限：

```bash
sudo install -d -m 700 /opt/cargo-secrets
sudo install -m 600 /path/to/airport.yaml /opt/cargo-secrets/airport.yaml
```

服务器 `.env` 增加：

```env
PROXY_PROVIDER_FILE=/opt/cargo-secrets/airport.yaml
COSCO_PROXY_POOL_MAX_ATTEMPTS_PER_SHIPMENT=3
COSCO_PROXY_POOL_NODE_COOLDOWN_MS=1800000
COSCO_PROXY_CORE_TIMEOUT_MS=15000
COSCO_PROXY_ENRICHMENT_TIMEOUT_MS=8000
```

随后使用基础 Compose 与代理池覆盖文件一起部署：

```bash
docker compose -f docker-compose.yml -f docker-compose.proxy-pool.yml config
docker compose -f docker-compose.yml -f docker-compose.proxy-pool.yml up -d --build
```

代理池只接收香港、台湾、日本、韩国、新加坡和美国节点，自动排除“下载专用”“免费”等节点。
应用侧排序固定为香港优先；当前出口收到 COSCO `403/429`、发生代理传输故障或主查询超过
代理专用超时窗口后，tracking 服务通过 Mihomo 内部控制接口选择下一个节点，并将失败节点
冷却 30 分钟。每张票单的主查询最多尝试 3 个出口，首次请求包含在这 3 次内；代理池耗尽后
Spring 批量任务不会再叠加一轮重试。Mihomo 的 7890、
9090 端口仅在 Docker `app` 网络中暴露，不映射到公网。不要把订阅地址、UUID、密码或完整
provider 文件提交到 Git。
