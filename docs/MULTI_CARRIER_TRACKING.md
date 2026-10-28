# 多船司票单追踪接入

本轮将票单校验、查询、快照保存、批量刷新和定时刷新接入六家船司。COSCO 和 CMA 保留既有通道；Maersk、Hapag-Lloyd、MSC、OOCL 复用 `carrier-agent-lab`，其合格结果写入现有 MySQL 票单快照，而非仅作为 Agent 预览展示。

## 查询策略

| 船司 | 查询方式 | 业务查询标识 |
| --- | --- | --- |
| COSCO | 现有网络、代理及 Playwright 通道 | 保留原订舱号规则 |
| CMA CGM | 现有 Playwright 通道与后端加密会话 | 保留原订舱号规则 |
| Maersk | 已配置的官方 DCSA API，否则浏览器 Agent | 订舱号、提单号；独立查询支持箱号 |
| Hapag-Lloyd | 已配置的官方 DCSA API，否则浏览器 Agent | 订舱号、提单号；独立查询支持箱号 |
| MSC | 已配置的官方 DCSA API，否则浏览器 Agent | 订舱号、提单号；独立查询支持箱号 |
| OOCL | 已配置的官方 DCSA API，否则浏览器 Agent | 订舱号、提单号；独立查询支持箱号 |

箱号是可重复使用的设备标识，不会作为长期票单的唯一业务身份。船司前缀处理仅适用于该船司的提单或订舱参考号，不能将箱主前缀直接当作承运船司。

新增四家船司的追踪要求已登录的工作区；Node 追踪服务同时校验 `TRACKING_ADAPTER_KEY`，避免从公开端点直接消耗模型或船司接口配额。原 COSCO 公开路径保持原有规则。

## 启动浏览器 Agent

沿用已有可用的 pi 模型凭据，启动现有 Compose 叠加配置：

```bash
docker compose -f docker-compose.yml -f docker-compose.carrier-agent.yml up -d --build
```

确认 `PI_PROVIDER` 与 `PI_MODEL` 对应实际开通、支持视觉和工具调用的模型。模型配置与官网账号、API 凭据是三个独立的概念。后端与追踪服务的 `TRACKING_ADAPTER_KEY` 必须一致。

叠加配置会设置：

- 追踪服务到 Agent 的内部地址 `http://carrier-agent:4317`；
- 查询总等待上限 450 秒，取消或超时会请求取消 Agent 任务；
- 后端 Agent 查询等待上限 480 秒，普通 COSCO/CMA 查询仍沿用原配置；
- 自动刷新任务租约 10 分钟，覆盖 Agent 等待时间；
- Agent 单任务并发与有限队列继续沿用原模块配置。

Nginx 的业务 API 与统一公开追踪路由等待上限已同步调整。未修改 MySQL 表结构，不需要新增数据库迁移。

## 可选的官方 API

官网账号密码不能当作 API Key。接入正式 API 前，需在船司开发者平台开通对应 DCSA Track & Trace 产品，确认实际事件接口地址和请求头。

追踪服务支持以下环境变量，`CARRIER` 替换为 `MAERSK`、`HAPAG_LLOYD`、`MSC` 或 `OOCL`：

```text
CARRIER_TRACKING_API_URL=
CARRIER_TRACKING_API_KEY=
CARRIER_TRACKING_API_KEY_HEADER=
```

例如 Maersk 的变量是 `MAERSK_TRACKING_API_URL`、`MAERSK_TRACKING_API_KEY` 和 `MAERSK_TRACKING_API_KEY_HEADER`。Compose 叠加配置已传递四家的这些变量。

没有配置 URL 时，AUTO 直接交给浏览器 Agent；指定 NETWORK 则明确返回尚未配置。只支持官方 HTTPS 域名及请求头凭据，不接受含账号密码或 Token 的 URL。

当前接口解析器支持标准 DCSA 事件数组或 `{ "events": [...] }`，并处理 `Next-Page-Cursor` 分页。不能将官网的任意网页内部接口地址当作 DCSA 接口填写。接口合同不同，需要单独增加解析器。

API 明确返回无记录或限流时，不会再盲目启动浏览器重试。网络故障或凭据失效可在 AUTO 策略中交给浏览器；单号不符或分页不完整则拒绝保存。

## 官网合法会话

需要登录的船司可以由管理员在正常浏览器完成一次登录和必要的人机验证，保存 Playwright storage state，按船司命名：

```text
MAERSK.json
HAPAG_LLOYD.json
MSC.json
OOCL.json
```

本地运行通过 `CARRIER_BROWSER_STATE_DIR` 指定目录。Docker 通过 `CARRIER_BROWSER_STATE_HOST_DIR` 将该目录只读挂载到 Agent。默认目录为 `carrier-agent-lab/.browser-states/`，已加入 Git 忽略。

Agent 只从服务端目录读取所选船司的文件；模型和请求参数不能指定文件路径。只保留该船司允许域名下的 Cookie 和 LocalStorage，避免将其他网站的登录态送入浏览器。会话文件属于凭据，应仅向运行 Agent 的账号开放读取权限。

会话失效、验证码或出口限制仍可能需要人工重新验证。文件保存不会令所有环境自动通过船司验证；特别是绑定出口 IP 的会话，应在实际部署环境取得。

## 结果与失败处理

只有船司、查询类型、原始单号和官网证据相符的 FOUND 结果才保存快照。保留每个集装箱与运输节点；预计事件不升级成实际事件，不推断时区、国家或未提供的日期。

| 状态 | 处理 |
| --- | --- |
| FOUND | 保存统一快照，原票单列表和详情读取同一份结果 |
| 明确 NOT_FOUND | 返回无匹配记录，不用空数据覆盖旧快照 |
| TRACKING_HUMAN_REQUIRED | 提示前往官网核验；暂停自动刷新，避免反复消耗查询 |
| TRACKING_PAGE_UNAVAILABLE | 页面拒绝或加载失败，保留旧快照，按原退避规则处理 |
| 单号不匹配或缺证据 | 拒绝保存，显示查询失败 |

人工处理后可在票单工作台重新查询。成功快照会重新进入已有刷新调度流程。

## 验收边界

2026-10-28 已用项目既有业务样例验证 Maersk：普通 Chrome 查询成功；后续通过主系统 tracker → Agent HTTP 服务 → 真实模型与 Playwright → 快照校验整条链路，成功取得 1 个集装箱、6 项官网证据。该测试使用管理员配置的可见浏览器及限定域名的合法会话，不代表生产 Linux 无头环境已通过。同一网页内部查询接口从服务端匿名请求返回 403，故没有将它冒充为可直接调用的公开匿名 API。

四家浏览器 Agent 的官网实测仍受各站点验证、页面加载和模型结构化提交影响，不能据此宣称四家无人值守实时追踪全部通过。MSC 实测明确触发人工验证；OOCL 返回页面请求拒绝；Hapag-Lloyd 返回安全验证。已对这些情况保留独立错误状态。

已分别验证代码层、真实模型隔离样例和官网访问。隔离样例通过不等于业务官网查询通过；尚未开通的官方 API 也不计为实测成功。

官方依据：

- [Maersk API 接入与 Consumer Key](https://www.maersk.com/support/faqs/how-to-start-with-api)
- [MSC Track and Trace API](https://developerportal.msc.com/api-details/)
- [OOCL 货踪入口升级公告](https://moc.digital.oocl.com/static/oocl_tracking_announcement.html)
