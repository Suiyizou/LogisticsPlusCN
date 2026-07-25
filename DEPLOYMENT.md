# Deployment

当前项目采用单仓库、统一入口、分服务容器部署：

- `frontend`：Nginx 静态前端与统一网关。
- `backend`：Spring Boot 管理账号、设备登录、监控接口。
- `tracking`：Node.js + Playwright 货物追踪适配器，仅在 Compose 的 `app` 网络暴露 `3000`。
- `mysql`：保存用户、客户、票单、追踪快照、文件元数据、设备和审计日志，仅接入内部 `data` 网络。

路由关系：

| 外部路径 | 目标 |
| --- | --- |
| `/` | Vue 公开品牌主页 |
| `/planner/*`、`/admin`、`/workbenches` 等 | Vue 企业登录与权限门禁 |
| `/api/*` | Spring Boot |
| `/tracking/*` | Node.js 公开追踪服务 |

`/tracking/` 页面和查询 API 面向访客公开。CMA 会话维护区会读取同域平台登录 token，但只允许 `BUSINESS`/`ADMIN` 调用 Spring 的受保护维护接口；普通员工、客户和匿名访客不能上传或查看会话。Nginx 代理到 Node 时仍会清空浏览器 `Cookie`，并只对成本较高的追踪查询与通道检查接口按来源 IP 限流；国旗、承运人列表与状态接口不计入该限流。

如果 Docker Nginx 前方还有 CDN 或宿主机反向代理，需要仅对受信任的代理地址配置 `set_real_ip_from` 与 `real_ip_header`。否则 `$binary_remote_addr` 会是统一的前置代理 IP，所有访客将共用同一追踪查询限额。

## Docker 部署

```bash
docker compose up -d --build
```

首次启动 MySQL 时会自动执行：

```text
backend/sql/schema.sql
```

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

首次构建 `tracking` 会拉取 Playwright Chromium 基础镜像，下载体积较大。Compose 已为浏览器兜底通道设置 `1gb` 共享内存和健康检查；服务器还需要能够访问船司查询站点。`PLAYWRIGHT_MAX_CONCURRENCY`、`PLAYWRIGHT_QUEUE_LIMIT` 和 `PLAYWRIGHT_QUEUE_TIMEOUT_MS` 分别限制浏览器并发数、排队数量和最长排队时间，默认值为 `2`、`8`、`15000`。海外小规格服务器不要盲目提高并发，队列满或超时会返回 `429`，不会继续挤占内存。

若 COSCO 已限制服务器出口 IP，可在服务器 `.env` 配置 `COSCO_PROXY_ENABLED=true`、`COSCO_PROXY_SERVER=http://代理地址:端口`、`COSCO_PROXY_USERNAME` 和 `COSCO_PROXY_PASSWORD`。这组代理同时作用于 COSCO REST 网络通道与 Playwright Chrome；只支持 HTTP/HTTPS 代理。建议保持默认的 `COSCO_QUERY_MIN_INTERVAL_MS=10000`、`COSCO_QUERY_MAX_INTERVAL_MS=12000` 与 `COSCO_BLOCK_COOLDOWN_MS=1800000`。正常请求会在 10–12 秒随机窗口内串行发起；确认 `403/429` 后进入冷却，不会按 10 秒继续重试。还需确认代理服务条款允许该业务流量，且代理凭据不得写入镜像、仓库或工单截图。

批量查询使用可取消的任务 ID。浏览器停止按钮先中止本地请求，再经 Spring `POST /api/public/shipments/batch-tasks/{taskId}/cancel` 转发给 Node；正在运行的请求会退出，未完成条目保留为待处理。Node 重启会清空内存中的任务状态，但不影响浏览器保存的待处理队列。

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

Compose 把 `frontend`、`backend`、`tracking` 放入 `app` 网络，只让 `backend` 额外加入内部 `data` 网络访问 MySQL。这样公开的 Node/Playwright 追踪服务无法直接连接数据库。附件实体文件由 `SHIPMENT_FILE_HOST_PATH` 挂载到宿主机固态硬盘，MySQL 只保存安全文件名、路径和可见性元数据；该目录必须纳入独立备份并限制宿主机权限。

### CMA DataDome 会话

服务器 `.env` 不需要填写或传输 DataDome。业务员或管理员登录平台后进入 `/tracking/`，选择 `CMA CGM`，在“DataDome 会话”区域粘贴 `datadome` 值或 CMA 请求的完整 `Cookie` 头并保存。页面不会把该值写入 LocalStorage，保存成功后也不会回显。

后端把会话以 AES-GCM 密文保存到 `cp_tracking_credentials`，加密密钥首次使用时自动生成到 Compose 的 `backend-secrets` 命名卷。备份和迁移服务器时必须把 MySQL 数据与该命名卷一起迁移；只恢复数据库而丢失密钥时，旧密文无法恢复，需要业务员重新保存会话。更新与清除操作都会写入审计日志。

“已保存”不代表 DataDome 已验证可用。DataDome 可能把会话绑定到 User-Agent、来源 IP 或浏览器指纹；业务员保存后必须立即用服务器实际查询一票。若返回“已保存会话被拒绝”，需要重新获取与服务器出口环境兼容的会话，不能通过反复重试绕过挑战。

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
