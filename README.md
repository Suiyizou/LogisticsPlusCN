# Shipment Lens — 通道 C 最小系统

当前版本仅实现 COSCO 通道 C：服务端调用 COSCO 公开网页使用的内部查询接口，完成 Base64 + XOR 解码，再由同源静态前端展示运输快照。

## 为什么不是纯静态前端

COSCO 接口对来自 `localhost` 或其他站点的浏览器 CORS 预检返回 `403`，因此浏览器不能直接读取响应。项目使用 Node 内置 HTTP 模块提供一个固定目标、极薄的同源代理；没有第三方运行时依赖。

## 运行

要求 Node.js 20 或更高版本。

```powershell
npm start
```

打开 <http://127.0.0.1:3000>。

## 测试

```powershell
npm test
```

## 当前范围

- 通道 C：已实现
- 提单号、订舱号、箱号查询
- 5 分钟内存缓存
- 运输摘要、运输节点、船期、原始解码 JSON
- 通道 A：未实现
- 通道 B / Playwright：未实现

## 接口

```http
POST /api/track/cosco
Content-Type: application/json

{
  "type": "BILLOFLADING",
  "number": "6502077380"
}
```

这是对船司网页内部接口的非官方适配。上游接口、请求字段或解码逻辑发生变化时，需要更新通道 C 适配器。
