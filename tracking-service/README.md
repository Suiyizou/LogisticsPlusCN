# Shipment Track — 多船司货运跟踪工作台

当前版本实现统一船司适配层、COSCO 双通道查询以及 CMA CGM 服务端 HTML 查询。COSCO 通道一直接调用网页内部网络接口，通道二由 Playwright 操作真实 Chrome；CMA CGM 通过 Playwright 提交服务端渲染的查询表单，展开逐箱历史节点，并保留每箱 PDF 报告地址。所有通道最终返回相同的统一快照。

## 为什么不是纯静态前端

COSCO 接口对来自 `localhost` 或其他站点的浏览器 CORS 预检返回 `403`，因此浏览器不能直接读取响应。项目由 Node 服务端统一执行查询：通道一使用服务端网络请求，通道二使用 Playwright 浏览器自动化。

## 运行

要求 Node.js 20 或更高版本。

```powershell
npm start
```

打开 <http://127.0.0.1:3000>。页面查询成功后会把查询条件写入地址栏，也可以直接使用：

```text
http://127.0.0.1:3000/?carrier=COSCO&type=BILLOFLADING&number=6502077380#tracking
```

## 测试

```powershell
npm test
```

## 当前范围

- 通道一 `NETWORK`：网络接口，默认通道，已实现
- 通道二 `PLAYWRIGHT`：真实浏览器查询，已实现
- 统一 `POST /api/track` 船司分发入口
- COSCO：网络接口与 Playwright 双通道；CMA CGM：服务端 HTML + 逐箱 PDF 地址
- 默认英文界面，支持中英文即时切换并记忆语言偏好
- 提单号、订舱号、箱号查询
- 5 分钟内存缓存
- 启动时立即探测通道一，之后每 6 小时绕过业务缓存复检
- 浏览器不保存统一追踪快照；已登录用户直接读取数据库中的最新快照
- Overview 总览展示账户票单，支持按单号、Job、客户、港口和状态搜索
- 详情页优先使用已加载的数据库快照，不会因打开详情而静默重查船司
- 实际离港、实际到港、预计最终到达、最新动态
- 分段运输 Routing：船名/航次、装卸港、预计与实际离到时间
- 集装箱状态、主提单号、订舱号和上游可用的其他参考信息
- 原始解码 JSON 开发者视图
- 上游未提供的外部/订单参考号会明确标记为缺失，不生成模拟值

## 通道一监控

监控只请求 COSCO 核心详情接口，不经过 5 分钟业务缓存。状态保存在当前 Node 进程内，可通过以下接口读取：

```http
GET /api/channels/network/status
```

默认使用示例提单 `6502077380` 探测。可以通过环境变量调整：

```powershell
$env:CHANNEL_C_MONITOR_NUMBER="6502077380"
$env:CHANNEL_C_MONITOR_TYPE="BILLOFLADING"
$env:CHANNEL_C_MONITOR_INTERVAL_MS="21600000"
npm start
```

设置 `CHANNEL_C_MONITOR_ENABLED=false` 可以停用进程内定时监控。旧的 `GET /api/channels/c/status` 继续作为兼容入口。生产环境如果部署多个 Node 实例，建议把定时任务迁移到单独的 Cron、任务队列或带分布式锁的调度器，避免每个实例重复探测。

## 通道二 Playwright

通道二默认复用系统安装的 Chrome，并以无头模式运行。每次查询创建独立浏览器上下文，查询结束后立即释放上下文；Chrome 进程由服务复用。

```powershell
$env:PLAYWRIGHT_BROWSER_CHANNEL="chrome"
$env:PLAYWRIGHT_HEADLESS="true"
npm start
```

Playwright work is globally capacity-limited per Node process so different shipment
queries cannot create unbounded browser contexts. The network channel is not gated.
The defaults allow two active browser contexts and eight queued requests; a full or
expired queue returns HTTP `429` with `PLAYWRIGHT_BUSY` details.

```powershell
$env:PLAYWRIGHT_MAX_CONCURRENCY="2"
$env:PLAYWRIGHT_QUEUE_LIMIT="8"
$env:PLAYWRIGHT_QUEUE_TIMEOUT_MS="15000"
npm start
```

## COSCO 代理、限速与 403 冷却

COSCO 的 `PROXY` 通道使用独立的 HTTP(S)/SOCKS5 代理出口，仅允许已登录业务员或管理员选择。`AUTO`、`NETWORK` 和 `PLAYWRIGHT` 仍使用服务器直连出口。代理账号和密码必须使用独立变量，不要嵌入 URL，也不要提交到 Git：

```powershell
$env:COSCO_PROXY_ENABLED="true"
$env:COSCO_PROXY_SERVER="socks5://proxy-host:1080"
$env:COSCO_PROXY_USERNAME="proxy-user"
$env:COSCO_PROXY_PASSWORD="proxy-password"
$env:TRACKING_ADAPTER_KEY="replace-with-a-long-random-internal-secret"
$env:COSCO_QUERY_MIN_INTERVAL_MS="10000"
$env:COSCO_QUERY_MAX_INTERVAL_MS="12000"
$env:COSCO_QUERY_QUEUE_LIMIT="50"
$env:COSCO_QUERY_QUEUE_TIMEOUT_MS="120000"
$env:COSCO_BLOCK_COOLDOWN_MS="1800000"
npm start
```

直连与代理使用独立熔断器和 Cookie 缓存，因此直连 IP 被封时不会阻止代理通道。`TRACKING_ADAPTER_KEY` 必须在 Spring 后端和 Node 追踪服务中配置为同一个随机长字符串，防止匿名请求直接消耗代理。COSCO 查询仍按进程串行，并在 10–12 秒的随机窗口内启动下一次请求，避免固定节奏或批量任务瞬时打满上游。同一出口确认上游返回 HTTP `403/429` 后会开启该出口自己的冷却。`GET /api/health` 只暴露脱敏后的代理协议、主机、队列和熔断状态。

机场订阅中的 Shadowsocks/VMess 节点需要由 Mihomo 转换成内部 SOCKS5 出口。仓库提供
`docker-compose.proxy-pool.yml` 和 `docker/proxy-pool/config.yaml`，但不会保存任何节点凭据。
Mihomo 控制接口启用后，追踪服务会把节点按香港、台湾、日本、韩国、新加坡、美国排序；
遇到代理传输失败或 COSCO `403/429` 时切换到下一个未冷却节点：

```env
COSCO_PROXY_POOL_CONTROLLER=http://proxy-pool:9090
COSCO_PROXY_POOL_GROUP=TRACKING-POOL
COSCO_PROXY_POOL_MAX_ROTATIONS_PER_REQUEST=3
COSCO_PROXY_POOL_NODE_COOLDOWN_MS=1800000
```

也可以独立验证：

```powershell
npm run track:playwright -- 6502077380
npm run track:playwright -- 6502077380 --headed
```

## CMA CGM 会话

CMA CGM 搜索页由 DataDome 保护。适配器不会绕过验证。线上环境由已登录的业务员或管理员在 `/tracking/` 页面选择 `CMA CGM` 后维护合法会话；Spring Boot 使用后端持久密钥进行 AES-GCM 加密，数据库只保存密文，查询时再按次传给 Node。Cookie 不会写入统一快照、浏览器 LocalStorage 或返回给页面。

```powershell
$env:CMA_PLAYWRIGHT_TIMEOUT_MS="45000"
npm start
```

生产部署不需要在 `.env` 中设置 `CMA_SESSION_COOKIE`。Compose 会为后端创建 `backend-secrets` 命名卷，首次保存时自动生成加密密钥；必须同时备份 MySQL 和该命名卷。维护页面会自动填写当前浏览器 User-Agent，并与会话一同交给 Playwright，因为 DataDome 可能绑定浏览器指纹和出口 IP。

DataDome 会话属于敏感信息，不要写入代码、日志、Git 或 `.env`。会话失效时接口会返回 `503` 和 `DATADOME` 标识，业务员或管理员在页面更新合法会话后即可重试。Node 仍保留 `CMA_CDP_URL`/`CMA_SESSION_COOKIE` 作为独立开发调试兼容项，不用于 Compose 生产部署。

## 快照存储

统一 `snapshot` 由 Spring Boot 持久化到 MySQL。页面加载账户票单与打开详情时直接使用数据库快照，不再将追踪结果写入 LocalStorage；历史版本遗留的浏览器快照会在页面初始化时清理。批量导入的待处理队列、语言偏好和登录会话仍按各自用途保留本机状态。

## 接口

```http
POST /api/track
Content-Type: application/json

{
  "carrier": "COSCO",
  "channel": "NETWORK",
  "type": "BILLOFLADING",
  "number": "6502077380"
}
```

将 `channel` 改为 `PLAYWRIGHT` 即使用通道二；改为 `PROXY` 即强制通过已配置的代理出口实时查询。不传时默认使用自动通道。

批量查询为每次运行附带 16-80 位的 `batchTaskId`。停止任务时调用：

```http
POST /api/batch-tasks/{batchTaskId}/cancel
```

接口返回 `202`；正在执行的网络请求或 Playwright 浏览器上下文会被中止，页面把当前条目恢复为待处理。再次继续时会生成新的任务 ID，只处理剩余条目。

查询通道注册表：

```http
GET /api/channels
```

船司注册表：

```http
GET /api/carriers
```

原有 `POST /api/track/cosco` 作为通道一兼容入口继续保留；也可显式调用：

```http
POST /api/track/cosco/network
POST /api/track/cosco/playwright
POST /api/track/cma
```

这是对船司网页及其内部接口的非官方适配。上游页面、接口、请求字段或解码逻辑发生变化时，需要更新相应通道适配器。
