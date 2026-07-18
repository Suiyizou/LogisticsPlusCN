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

`/tracking/` 页面和查询 API 面向访客公开，不读取平台登录状态。Nginx 代理时会清空 `Cookie`，并只对成本较高的追踪查询与通道检查接口按来源 IP 限流；国旗、承运人列表与状态接口不计入该限流。装箱、员工工作台与管理后台继续由 Vue 登录门禁和 Spring API token 校验保护。

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
APP_BOOTSTRAP_ADMIN_PASSWORD=至少12位且包含大小写字母、数字和符号
APP_BOOTSTRAP_ADMIN_DISPLAY_NAME=系统管理员
```

管理员创建成功后，立即把 `APP_BOOTSTRAP_ADMIN_ENABLED` 改回 `false`，清除部署环境中的引导密码并重建 backend。升级旧数据库时，后端会拒绝带已知历史固定口令的活动账号启动；请先在受控环境中完成口令轮换或停用该账号。

首次构建 `tracking` 会拉取 Playwright Chromium 基础镜像，下载体积较大。Compose 已为浏览器兜底通道设置 `1gb` 共享内存和健康检查；服务器还需要能够访问船司查询站点。`PLAYWRIGHT_MAX_CONCURRENCY`、`PLAYWRIGHT_QUEUE_LIMIT` 和 `PLAYWRIGHT_QUEUE_TIMEOUT_MS` 分别限制浏览器并发数、排队数量和最长排队时间，默认值为 `2`、`8`、`15000`。海外小规格服务器不要盲目提高并发，队列满或超时会返回 `429`，不会继续挤占内存。

Compose 把 `frontend`、`backend`、`tracking` 放入 `app` 网络，只让 `backend` 额外加入内部 `data` 网络访问 MySQL。这样公开的 Node/Playwright 追踪服务无法直接连接数据库。附件实体文件由 `SHIPMENT_FILE_HOST_PATH` 挂载到宿主机固态硬盘，MySQL 只保存安全文件名、路径和可见性元数据；该目录必须纳入独立备份并限制宿主机权限。

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

追踪容器内部健康接口为 `http://127.0.0.1:3000/api/health`，Compose 会自动探测。浏览器侧仍可保存本机查询历史；Node 进程缓存用于短期去重，Spring Boot 会把带稳定订舱号或提单号的追踪快照持久化到 MySQL。仅有集装箱号且无法解析出稳定订舱号/提单号的结果只作为临时查询结果，不会作为长期票单主键。

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
