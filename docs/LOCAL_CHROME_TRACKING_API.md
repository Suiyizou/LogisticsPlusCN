# 本地 Chrome 货踪 API 对接

查询和浏览器登录态位于 `D:\AI\shipping-tracking`。云端 Java 后端通过内网穿透访问该服务，只传单号并取得 JSON，不启动或控制云端浏览器。此改动不包含前端渲染、船司抓取逻辑或实际隧道部署。

## 启用配置

后端环境变量（已接入 `application.yml` 和 `docker-compose.yml`）：

```dotenv
APP_TRACKING_ADAPTER_MODE=LOCAL_QUEUE
APP_TRACKING_LOCAL_BASE_URL=http://host.docker.internal:18791
# 当前本地未启用业务鉴权时留空；启用时填写与本机一致的令牌。
APP_TRACKING_LOCAL_TOKEN=
APP_TRACKING_LOCAL_JOB_TIMEOUT=7m
APP_TRACKING_LOCAL_POLL_INTERVAL=2s
APP_TRACKING_LOCAL_REQUEST_TIMEOUT=15s
```

Compose 和 `.env.example` 默认使用 `LOCAL_QUEUE`；Java 单独运行时保留 `LEGACY` 默认值供旧适配器本地开发兼容。云端静态镜像已经不含旧适配器，已有 `.env` 若设为 `LEGACY` 须改成 `LOCAL_QUEUE`。实时查询不会在隧道断开时回落到云端 Chrome。token 仅保存在后端环境变量中，不传给页面，也不使用 `X-Tracking-Adapter-Key` 替代。

云端 `tracking` 服务现为纯静态 Nginx，保留 3000 端口和 `/api/health`，服务存活不代表本地 API 已连通。旧 `/tracking/api/track*` 与通道检查端点返回 410；页面应继续调用 Spring 的 `/api/public/shipments/track`。正在使用旧 Node 基底的预览容器和 `docker/dev-preview/tracking-static-update.Dockerfile` 只用于过渡预览，新静态镜像直接通过 `tracking-service/Dockerfile` 构建，不复用旧预览覆盖镜像。

本地服务使用 `npm run chrome` 和 `npm run serve`；配置 `TRACK_TOKEN`（若同时设置 `TOKEN`，本地服务优先使用 `TOKEN`）。当前本地队列共享一个浏览器工作页，请设置 `CONCURRENCY=1`。后端实例内也串行提交，多个后端副本应共用这个单并发本地队列。

当前联调环境由服务维护者配置为 `DISABLE_UI=1`、未设置业务令牌。关闭 UI 与 API 鉴权是独立的：本地有效 `TOKEN`/`TRACK_TOKEN` 为空时不校验 Authorization，Java 即使发送任意 Bearer 也不会因此得到 401；Java 配置留空即可。生产启用时，在本机设置非空 `TRACK_TOKEN`（或优先级更高的 `TOKEN`）并重启队列服务，同时更新 Java 的 `APP_TRACKING_LOCAL_TOKEN` 并重建后端。只有本地已启用鉴权且 Java 令牌缺失/不一致才返回 401，云端映射为 502 `TRACKING_LOCAL_UNAUTHORIZED`；此时 `/health` 同样要求 Bearer。

地址必须是**后端实际可访问**的隧道 HTTP 地址。Java 直接运行在云主机上时可使用 `http://127.0.0.1:18791`；Docker 内的 `127.0.0.1` 指容器自身。Compose 已添加 `host.docker.internal:host-gateway`；使用此域名时，隧道业务监听地址需允许 Docker 网桥访问，仅监听宿主机回环地址无法通过该域名访问。也可配置容器可访问的 HTTPS 反代地址。

默认任务总期限 7 分钟（含等待本实例串行队列、提交、轮询和读取结果），单次 HTTP 请求最多 15 秒。同步页面接口的现有 Nginx 等待时间为 480 秒；提高总期限时须同步调整代理超时。已有平台批量任务接口在后台执行查询，页面继续轮询原任务接口。

维护者给出的当前耗时参考是普通单条约 3–15 秒、SML/MSC 约 40–60 秒、COSCO 首次切换查询模式约 18 秒；这是联调参考而非 SLA。15 秒限制的是单次 HTTP 提交/取状态/取结果，不是整条浏览器查询；现有 7 分钟总期限无需因这些正常耗时调大。

如果 frps 的 18791 对公网监听且业务无鉴权，外部请求也可以提交查单。部署时应将云安全组/主机防火墙的 18791 限制到 Java 后端实际来源 IP/网段，或启用业务令牌；同机部署优先使用容器可达的宿主机内部监听或受控反代。开启 `DISABLE_UI=1` 不会关闭 `/jobs`，不能替代端口限制或鉴权。本次代码调整没有改动运行中的令牌、监听地址或安全组。

## 云端到本地的契约

1. `POST /jobs`，请求 `{"items":[{"carrier":"COSCO","reference":"COSU000010001"}],"source":"LogisticsPlusCN"}`；正常返回 **202 Accepted**，读取 `job_id`，不能要求仅 200 成功。空 items 返回 `400 NO_ITEMS`，云端映射成 `400 INVALID_REFERENCE`。
2. `GET /jobs/{job_id}`，读取 job 状态与唯一 `items[0]` 的状态；job 的 `queued/running/completed/completed_with_gaps/failed/cancelled` 与 item 的状态分开处理。
3. `GET /jobs/{job_id}/result`，读取 `tracking.v1` 批次的 `shipments[0]`。409 结果未就绪时继续等同一个任务，不重复提交。
4. 取消平台批量任务时，映射至 `POST /jobs/{job_id}/cancel`。任务超时也尝试取消。浏览器内正在执行的单条是否立即停止，以本地服务的取消实现为准。

仅在 Java 配置了非空令牌时，每一步发送 `Authorization: Bearer <token>`，包括本地健康检查；空令牌时省略该头。只请求配置地址下的固定路径，不跟随重定向或服务返回的任意 `result_url`。

校验进度 items 的船司/原始 reference，以及结果批次 ID、schema、唯一记录、船司和 `query.reference_input`，防止串单。本地去前缀后的 `reference_submitted` 仅供展示，原请求仍是入库关联身份。别名在单条/批量追踪入口的校验、去重及快照关联之前统一，映射如下：

| 输入别名 | 平台规范编码 | 发给本地的编码 |
|---|---|---|
| `CMA` / `CMA_CGM` / `CMA CGM` | `CMA` | `CMA_CGM` |
| `HPL` | `HAPAG_LLOYD` | `HAPAG_LLOYD` |
| `YANGMING` / `YANG MING` / `YML` | `YML` | `YML` |
| `WHL` / `WHZ` / `WAN HAI` | `WAN_HAI` | `WAN_HAI` |
| `MSK` | `MAERSK` | `MAERSK` |
| `EMC` | `EVERGREEN` | `EVERGREEN` |
| `MATSN` | `MATSON` | `MATSON` |

平台登记的 16 个编码不等于本地全部实现了抓取适配器。例如本地名称表中可登记 `WAN_HAI`、`HEDE`，适配器未实现时仍可能接受 job，再返回 item 的 `carrier_not_implemented`；云端将其作为 `404 UNSUPPORTED_CARRIER` 处理，不能落库为空的成功快照。未知输入编码不猜成 COSCO。CMA 使用订舱号，其他船司支持订舱/提单引用；本接口不将箱号当成持久票单身份。

`items[].status` 的 `human_required`、`no_business_data`、`carrier_not_implemented`、`failed` 会在取结果前直接转成对应错误，哪怕 job 仍为 `running` 或返回的结果状态看似成功，也不会覆盖条目失败。`pending/running` 继续等待，`done` 再检查结果。结果 `query.status` 仍保留第二层校验，并统一处理大小写；不依赖失败条目一定生成 `result.json`。

本地模式不调用单独的 COSCO 补全/箱号发现端点。完整结果中的箱号、运输分段和扩展信息一次映射；直接调用旧补全接口返回 `TRACKING_LOCAL_OPERATION_UNSUPPORTED`。

## 健康判断与手动 canary

业务员/管理员可带平台 `X-Auth-Token` 调用：

| 接口 | 行为 |
|---|---|
| `GET /api/tracking/local-service/health` | 调本地 `/health`，只读，不提交查单 |
| `POST /api/tracking/local-service/canary` | 提交一条已知有效单号，验证完整队列链路，不写票单/快照数据库 |

canary 请求示例：

```json
{"carrier":"COSCO","type":"BILLOFLADING","number":"COSU9510184670"}
```

成功返回 `status:SUCCEEDED`、`verified:true`、`persisted:false` 和 `localJobId`。失败沿用查询错误代码。普通真实查询成功也能刷新验证时间；成功证据有效期为 10 分钟，且仅保存在本后端实例内存中，重启或另一个副本首次读取时需要重新验证。

健康状态分层判定：HTTP 可达只代表 `serviceReachable:true`；首次 `chrome.connected:false` 为 `UNVERIFIED`，不判故障；观察到连接或成功查询后再断开为 `DISCONNECTED`，需要 canary 核验本地是否能自动重连。连接恢复但没有新的查询成功也不会沿用断开前的验证结果。当前连接为 true 且最近 10 分钟有成功查询才为 `READY`；canary 失败为 `DEGRADED`。响应同时给出 `chromeConnected`、`requiresCanary`、`lastVerifiedAt`、`lastCanaryAt`、`lastCanaryErrorCode`。`localTokenConfigured` 仅描述 Java 是否填了令牌，`authenticationEnforced:UNKNOWN` 不臆测本地鉴权开关。

可由运维按约 10 分钟、使用仍有效的已知单号调用 canary；本次只提供手动接口，没有创建定时任务，也不会在 GET 健康检查时自动启动 Chrome 查询。

本机排查时应绕过环境 HTTP 代理，例如 PowerShell `Invoke-RestMethod -NoProxy http://127.0.0.1:8791/health`，避免把代理返回的 502 误判成本地服务故障。本次只读检查确认该端点无需 Bearer 即返回 200，且当时 `chrome.connected=true`、`concurrency=2`；后者仍须由本地服务启动配置改为 1 并重启队列，本文及 Java 单实例串行限制不会自动修改已运行的本地队列并发数。HTTP 可达与 Chrome 已连接仍不等于完成了 canary。

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
| 本地条目船司未实现 | 404 `UNSUPPORTED_CARRIER` |
| 本地条目查询失败 | 502 `TRACKING_QUERY_FAILED` |
| 命中页面但没有结构化数据 | 502 `UPSTREAM_EMPTY` |
| carrier/schema/原始单号不匹配 | 502 `TRACKING_LOCAL_INVALID_RESPONSE` |
| 已取消 | 409 `TRACKING_CANCELLED` |

`completed_with_gaps` 不直接视为成功，先检查进度 `items[].status`，再检查结果 `query.status`。失败不写入成功快照；有旧快照时沿用原后端的降级保留规则。本次验证只使用模拟 HTTP 与 H2，没有触发真实 canary 或船司查询。
