# Shipment Track — 多船司货运跟踪工作台

当前版本实现统一船司适配层和 COSCO 双通道查询：通道一由服务端直接调用 COSCO 网页内部网络接口；通道二由 Playwright 操作真实 Chrome 完成网页查询并拦截结果。两个通道都会完成 Base64 + XOR 解码，并返回相同的统一快照。CMA CGM 已加入船司注册表和界面选择器，实际查询适配器尚未实现。

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
- COSCO：可查询；CMA CGM：已预留、返回未实现状态
- 默认英文界面，支持中英文即时切换并记忆语言偏好
- 提单号、订舱号、箱号查询
- 5 分钟内存缓存
- 启动时立即探测通道一，之后每 6 小时绕过业务缓存复检
- 浏览器 LocalStorage 保存最近 20 个统一快照，有效期 24 小时
- Overview 总览展示本机查询记录、船司、路线国旗、最新状态和查询时间
- 实时查询失败且本地快照仍有效时，自动显示浏览器缓存并提示数据来源
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

也可以独立验证：

```powershell
npm run track:playwright -- 6502077380
npm run track:playwright -- 6502077380 --headed
```

## 浏览器缓存

LocalStorage 只保存后端转换后的统一 `snapshot`，不保存 COSCO 原始报文。查询时会先显示同一查询条件下的有效本地快照，同时向后端请求最新数据；实时查询成功后会覆盖本地快照。

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

将 `channel` 改为 `PLAYWRIGHT` 即使用通道二。不传时默认使用通道一。

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
```

这是对船司网页及其内部接口的非官方适配。上游页面、接口、请求字段或解码逻辑发生变化时，需要更新相应通道适配器。
