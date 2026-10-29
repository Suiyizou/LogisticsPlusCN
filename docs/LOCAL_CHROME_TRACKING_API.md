# 本地 Chrome 货踪 API 对接

查询和浏览器登录态位于 `D:\AI\shipping-tracking`。云端 Java 后端通过内网穿透访问该服务，只传单号并取得 JSON，不启动或控制云端浏览器。此改动不包含前端渲染、船司抓取逻辑或实际隧道部署。

## 启用配置

后端环境变量（已接入 `application.yml` 和 `docker-compose.yml`）：

```dotenv
APP_TRACKING_ADAPTER_MODE=LOCAL_QUEUE
APP_TRACKING_LOCAL_BASE_URL=http://host.docker.internal:18791
APP_TRACKING_LOCAL_TOKEN=<与本地服务 TRACK_TOKEN 一致>
APP_TRACKING_LOCAL_JOB_TIMEOUT=7m
APP_TRACKING_LOCAL_POLL_INTERVAL=2s
APP_TRACKING_LOCAL_REQUEST_TIMEOUT=15s
```

Compose 和 `.env.example` 默认使用 `LOCAL_QUEUE`；Java 单独运行时保留 `LEGACY` 默认值供旧适配器本地开发兼容。云端静态镜像已经不含旧适配器，已有 `.env` 若设为 `LEGACY` 须改成 `LOCAL_QUEUE`。实时查询不会在隧道断开时回落到云端 Chrome。token 仅保存在后端环境变量中，不传给页面，也不使用 `X-Tracking-Adapter-Key` 替代。

云端 `tracking` 服务现为纯静态 Nginx，保留 3000 端口和 `/api/health`，服务存活不代表本地 API 已连通。旧 `/tracking/api/track*` 与通道检查端点返回 410；页面应继续调用 Spring 的 `/api/public/shipments/track`。正在使用旧 Node 基底的预览容器和 `docker/dev-preview/tracking-static-update.Dockerfile` 只用于过渡预览，新静态镜像直接通过 `tracking-service/Dockerfile` 构建，不复用旧预览覆盖镜像。

本地服务使用 `npm run chrome` 和 `npm run serve`；配置 `TRACK_TOKEN`（若同时设置 `TOKEN`，本地服务优先使用 `TOKEN`）。当前本地队列共享一个浏览器工作页，请设置 `CONCURRENCY=1`。后端实例内也串行提交，多个后端副本应共用这个单并发本地队列。

地址必须是**后端实际可访问**的隧道 HTTP 地址。Java 直接运行在云主机上时可使用 `http://127.0.0.1:18791`；Docker 内的 `127.0.0.1` 指容器自身。Compose 已添加 `host.docker.internal:host-gateway`；使用此域名时，隧道业务监听地址需允许 Docker 网桥访问，仅监听宿主机回环地址无法通过该域名访问。也可配置容器可访问的 HTTPS 反代地址。

默认任务总期限 7 分钟（含等待本实例串行队列、提交、轮询和读取结果），单次 HTTP 请求最多 15 秒。同步页面接口的现有 Nginx 等待时间为 480 秒；提高总期限时须同步调整代理超时。已有平台批量任务接口在后台执行查询，页面继续轮询原任务接口。

## 云端到本地的契约

1. `POST /jobs`，请求 `{"items":[{"carrier":"COSCO","reference":"COSU000010001"}],"source":"LogisticsPlusCN"}`；读取返回的 `job_id`。
2. `GET /jobs/{job_id}`，等待 `completed` 或 `completed_with_gaps`。
3. `GET /jobs/{job_id}/result`，读取 `tracking.v1` 批次的 `shipments[0]`。409 结果未就绪时继续等同一个任务，不重复提交。
4. 取消平台批量任务时，映射至 `POST /jobs/{job_id}/cancel`。任务超时也尝试取消。浏览器内正在执行的单条是否立即停止，以本地服务的取消实现为准。

每一步均发送 `Authorization: Bearer <token>`。只请求配置地址下的固定路径，不跟随重定向或服务返回的任意 `result_url`。

校验批次 ID、schema、唯一记录、船司和 `query.reference_input`，防止串单。平台 `CMA` 转成本地 `CMA_CGM`，返回快照仍是 `CMA`；本地去前缀后的 `reference_submitted` 仅供展示，原请求仍是入库关联身份。平台支持该模块登记的 16 家船司；这是接口支持范围，具体查询成功与否以本地船司适配器和结果状态为准。CMA 使用订舱号，其他船司支持订舱/提单引用；本接口不将箱号当成持久票单身份。

本地模式不调用单独的 COSCO 补全/箱号发现端点。完整结果中的箱号、运输分段和扩展信息一次映射；直接调用旧补全接口返回 `TRACKING_LOCAL_OPERATION_UNSUPPORTED`。

## 给渲染进程的现有页面契约

继续调用 `POST /api/public/shipments/track`，请求、业务员/管理员鉴权以及客户只读已授权快照的规则不变：

```json
{"carrier":"COSCO","channel":"AUTO","type":"BILLOFLADING","number":"COSU000010001","forceRefresh":true}
```

响应仍为 `{snapshot, shipmentId, persisted, cacheSource, ...}`，可以经既有快照读取接口再次获取。`snapshot` 的对接字段：

| 字段 | 含义 |
|---|---|
| `schemaVersion`, `channel` | `tracking.v1`、`LOCAL_CHROME` |
| `provider`, `tracking` | 平台船司编码、原请求类型与单号 |
| `summary`, `references` | 提单/订舱引用、起终点、船名航次、最新状态和声明/抽取箱量 |
| `containers`, `routingLegs` | 箱级信息及实际返回的运输分段 |
| `keyTimes` | 来源明确的 ETA/ETD/ATA/ATD，保留时间原文 |
| `events` | 来源条目；未明确时间语义时 `occurredAt=null`，原时间在 `reportedTime` |
| `sourceDetails` | `queryStatus`、`strategy`、`referenceSubmitted`、`referenceType`、`durationSeconds`、`warnings`、`fields`、`extraFields`、`additionalEvents`、`jobId`、`confidence` |

`sourceDetails.businessVerified` 固定 `false`。缺失字段不猜测，起终点名称不会被生成成事件节点。本地截图/文本证据路径不返回页面，仅提供 `evidenceAvailable` 布尔值。前端无需直接访问本地端口、处理隧道 token 或轮询桌面任务。

## 失败语义

| 场景 | HTTP / code |
|---|---|
| 本地 API 或隧道不可达 | 503 `TRACKING_LOCAL_UNAVAILABLE` |
| token 不匹配 | 502 `TRACKING_LOCAL_UNAUTHORIZED` |
| 总期限超时 | 504 `TRACKING_LOCAL_TIMEOUT` |
| 上游任务失败 | 502 `TRACKING_LOCAL_JOB_FAILED` |
| 本地人工验证 | 409 `TRACKING_HUMAN_REQUIRED` |
| 无业务数据 | 404 `TRACKING_NO_BUSINESS_DATA` |
| 命中页面但没有结构化数据 | 502 `UPSTREAM_EMPTY` |
| carrier/schema/原始单号不匹配 | 502 `TRACKING_LOCAL_INVALID_RESPONSE` |
| 已取消 | 409 `TRACKING_CANCELLED` |

`completed_with_gaps` 不直接视为成功，仍检查记录级 `query.status`。失败不写入成功快照；有旧快照时沿用原后端的降级保留规则。未进行真实船司查询，后端模拟 HTTP 与 H2 验证不代表隧道已部署。
