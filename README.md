# 货代业务平台（装箱规划 + 货物追踪）

这是一个面向货代装箱估算、箱型选择、可视化剖析与货物追踪的统一业务平台。装箱工作台保留浏览器端 WebWorker 本地计算；货物追踪工作台使用 Node.js 双通道适配器；Spring Boot + MySQL 统一负责公司员工账号、设备登录限制和总管理员后台。

## 当前架构

- 前端：Vue 3 + Vite
- 3D 可视化：Three.js
- 装箱计算：WebWorker 本地计算
- 桌面打包：Electron
- 后端：Spring Boot 3 + JDBC
- 货物追踪：Node.js + Playwright，源码位于 `tracking-service/`
- 智能导入：后台可控制 LLM 开关、API Key、Base URL 和模型，未配置 Key 时使用规则兜底
- 数据库：MySQL 8
- 部署：单仓库 Docker Compose；Nginx 代理 `/api/` 到 Spring、`/tracking/` 到追踪服务

## 已有能力

- 录入货物长、宽、高、数量、单重、摆放规则和颜色。
- 按箱型本地计算，生成推荐箱型排序。
- 使用 Three.js 展示当前货舱 3D 摆放结果，可拖动、缩放查看。
- 支持剩余空间、质量重心偏载可视化和导出报告。
- 提供 CSV 导入导出、Excel 样板说明、示例数据、清空货物和算法说明页面。
- 新增管理后台：总管理员登录、员工账号管理、在线设备/IP 查看、设备踢下线、基础运行监控。
- 同一账号默认限制最多 5 台在线设备。
- 智能导入支持两条路径：本地规则预览，以及后端文本识别任务；管理员启用 LLM 后可由模型抽取非标准文本。

## 公开主页与工作台入口

根路径 `/` 是 DrewesLogistics 公开品牌主页，包含中英文内容、首屏翻页动效、平台能力与建设路线。主页导航和能力卡均提供 Cargo Tracking 入口，可直接访问同域路径 `/tracking/`。

`/tracking/` 页面及其查询 API 面向访客公开，不要求企业账号。Nginx 会清除代理到追踪服务的 Cookie，并对公开查询 API 按来源 IP 限流，避免平台登录 token 泄漏或追踪通道被无约束调用。

企业员工登录成功后进入 `/workbenches`，再进入装箱规划工作台；总管理员登录后直接进入 `/admin`。`/workbenches`、`/planner`、`/home`、`/containers`、`/algorithm` 与 `/admin` 等业务路径仍由统一登录状态和角色权限保护。两个模块的源码、入口、网关和 Compose 编排均位于本仓库的 `combine` 分支，运行时继续按清晰的业务边界使用 Spring 与 Node 两个服务容器。

前端入口链接的构建时变量为：

```env
VITE_TRACKING_WORKBENCH_URL=/tracking/
```

默认部署路径固定为 `/tracking/`。如果修改它，还需同步调整 `docker/nginx.conf` 与 `frontend/vite.config.js` 中的代理路径，不能只修改这个变量。

## 后端与数据库

建表脚本：

```text
backend/sql/schema.sql
```

系统不再创建带固定口令的默认管理员。新数据库首次部署时，请在 `.env` 临时设置一次性引导参数：

```env
APP_BOOTSTRAP_ADMIN_ENABLED=true
APP_BOOTSTRAP_ADMIN_USERNAME=你的管理员账号
APP_BOOTSTRAP_ADMIN_PASSWORD=至少12位且包含大小写字母、数字和符号的随机密码
APP_BOOTSTRAP_ADMIN_DISPLAY_NAME=系统管理员
```

引导只会在 `cp_users` 为空时创建管理员。首次启动并确认可以登录后，立即将 `APP_BOOTSTRAP_ADMIN_ENABLED=false`，从 `.env` 删除密码并重启服务。升级前必须先轮换或禁用历史 `admin` 默认账户；后端检测到旧版已知固定凭据仍处于启用状态时会拒绝启动。浏览器 Web 端无法可靠读取真实 MAC 地址，因此当前版本记录的是设备指纹、IP、浏览器 UA，并预留 `mac_address` 字段给后续桌面客户端或内网 Agent 上报。

货物相关文件默认通过 Docker 绑定目录持久化。生产环境请把 `SHIPMENT_FILE_HOST_PATH` 指向宿主机 SSD 的专用目录，并按磁盘容量调整以下配额：

```env
SHIPMENT_FILE_HOST_PATH=/mnt/ssd/drewes/shipment-files
APP_SHIPMENT_FILE_MAX_SIZE_BYTES=83886080
APP_SHIPMENT_FILE_MAX_FILES_PER_SHIPMENT=200
APP_SHIPMENT_FILE_MAX_BYTES_PER_SHIPMENT=2147483648
APP_SHIPMENT_FILE_MAX_BYTES_PER_CUSTOMER=5368709120
APP_SHIPMENT_FILE_MIN_FREE_SPACE_BYTES=1073741824
```

四个容量配额分别控制单文件、单票文件数、单票累计容量、单客户累计容量，并始终保留 `MIN_FREE_SPACE` 指定的磁盘余量。上传临时文件也位于同一持久化目录下，避免占满容器系统盘。

## LLM 文本识别

默认启用 LLM 开关，默认模型为 `deepseek-v4-flash`，默认 Base URL 为 `https://api.deepseek.com`。如果管理员尚未配置 API Key，文本识别会自动使用规则兜底，不影响系统使用。

管理员登录后台后，可在“系统管理”中修改：

```text
是否启用 LLM
API Key
Base URL
模型名称
```

也可以用 `.env` 作为首次启动的默认种子值：

```env
SPRING_AI_CHAT_MODEL=none
SPRING_AI_OPENAI_API_KEY=你的_API_Key
SPRING_AI_OPENAI_BASE_URL=https://api.deepseek.com
SPRING_AI_OPENAI_MODEL=deepseek-v4-flash
```

说明：`SPRING_AI_CHAT_MODEL=none` 用于避免后端启动阶段强制创建模型 Bean；文本识别任务会按后台数据库配置动态创建 OpenAI-compatible HTTP 调用。

对应接口：

```text
POST /api/text-recognition/tasks
GET  /api/text-recognition/tasks/{id}
GET  /api/text-recognition/tasks/{id}/cleaned-excel
```

## 本地前端开发

```bash
cd frontend
npm install
npm run dev
```

访问：

```text
http://127.0.0.1:5177
```

如果要在 Vite 开发环境访问管理后台，请先启动后端：

```bash
cd backend
mvn spring-boot:run
```

默认后端地址：

```text
http://127.0.0.1:8080/api
```

再启动仓库内的货物追踪服务：

```bash
cd tracking-service
npm ci
npm start
```

Vite 会把 `/tracking/` 代理到 `http://127.0.0.1:3000`。追踪模块测试可运行：

```bash
cd tracking-service
npm test
```

## 构建前端

```bash
cd frontend
npm run build
```

输出目录：

```text
frontend/dist/
```

## 构建后端

```bash
cd backend
mvn -DskipTests package
```

输出文件：

```text
backend/target/cargo-planner-backend-0.1.0.jar
```

## Docker 部署

```bash
docker compose up -d --build
```

默认端口：

```text
统一入口：http://服务器IP/
货物追踪：http://服务器IP/tracking/
后端（服务器本机）：http://127.0.0.1:8080/
MySQL（服务器本机）：127.0.0.1:3306
```

后端与 MySQL 默认只绑定服务器环回地址，公网仅需开放统一入口的 `80/443`。追踪服务的 `3000` 端口只暴露在 Compose 内部网络，不需要单独映射或手工启动。首次构建会拉取含 Chromium 的 Playwright 镜像，体积和内存占用会高于普通 Node 镜像；Chromium 仅在浏览器兜底通道实际使用时启动。

可复制 `.env.example` 为 `.env` 后修改数据库密码、端口和设备登录上限。

## Windows 客户端打包

```bash
cd frontend
npm run desktop:build
```

如果 Electron 下载较慢，可以在 PowerShell 中设置镜像后再执行：

```powershell
$env:ELECTRON_MIRROR='https://npmmirror.com/mirrors/electron/'
$env:ELECTRON_BUILDER_BINARIES_MIRROR='https://npmmirror.com/mirrors/electron-builder-binaries/'
npm run desktop:build
```

输出目录：

```text
frontend/release/
```

## Workspace upload storage

Authenticated Excel/CSV uploads are retained for 14 days by default. Files are stored below a
per-user directory named from the account display name plus the immutable user id; database rows
hold metadata only. Re-uploading the same content under the same name refreshes its expiry without
creating another copy, while changed content receives the next version number.

Docker Compose mounts the named volume `workspace-files` at `/app/uploads`, so uploads survive
backend container rebuilds. The relevant environment variables are:

```env
APP_WORKSPACE_FILE_RETENTION=14d
APP_WORKSPACE_FILE_CLEANUP_INTERVAL_MS=3600000
APP_WORKSPACE_FILE_MAX_SIZE_BYTES=83886080
```

When the backend runs outside Docker, set `APP_WORKSPACE_FILE_ROOT` to an absolute writable path;
otherwise it uses `./uploads`. Expired files are removed by an hourly scheduled cleanup.

User APIs are rooted at `/api/workspace-files`. Administrators can list and inspect all users'
uploads through `/api/admin/workspace-files`. Existing databases must apply the
`cp_workspace_files` statement from `backend/sql/schema.sql` once during upgrade.
