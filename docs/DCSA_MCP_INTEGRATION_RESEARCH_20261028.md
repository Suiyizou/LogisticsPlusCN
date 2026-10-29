# DCSA 与货运 MCP 接入核查

核查时间：2026-10-28。范围：海运货物追踪，以及用户指定的 GetTransport 文章所列 MCP 服务。本轮为调研与只读协议探测，未安装第三方服务、未发起报价/订舱、未调用真实票单查询，未修改业务运行配置。

## 1. 文章核查

原文：https://blog.gettransport.com/trends-in-logistic/freight-mcp-servers-teardown-2026/

页面标注发布日期 2026-06-17，并标注其作为存档文章尚未经过现行编辑流程审核。文章列出 Warp、CargoMART、FreightUtils、Easyship。四者均能从厂商资料或维护者代码核实，但工具数、支持传输方式等不能继续照搬文章的旧值。

这篇文章未提供一个覆盖七家海运船司的 DCSA 数据服务，也未证明其所列 MCP 拥有这些船司的全部数据授权。

| 项目 | 官方材料核实 | 本轮实际连接 | 与当前海运货踪的关系 |
| --- | --- | --- | --- |
| Warp | 维护者代码确认提供公路货运网络的报价、订舱、追踪；现在也提供远程 HTTP MCP | 远程握手与 `tools/list` 成功，发现 37 个工具。未执行业务工具，不代表已取得货物数据权限 | 可研究工具接口设计；不能据此认定可查询 CMA、ONE 等船司提单 |
| CargoMART | CargoAi 官方公告确认 MCP 对其用户开放，业务为航空货运 | 未用 CargoMART 账号鉴权；公开公告未给出可直接验证的通用连接 URL，因此没有猜测地址 | 与海运船司追踪范围不同，需要空运业务时再评估 |
| FreightUtils | 维护者代码确认主要为物流计算、地点/货物资料、编号校验等 | 匿名握手、列出 25 个工具；调用只读体积工具成功，120×80×100 cm、2 件得到 1.92 m³ | 可作为辅助工具接入；`validate` 是编号校验，不是实时货踪 |
| Easyship | 官方文档明确远程 MCP 地址和 Bearer Token 鉴权，主要面向包裹/快递 | 未带凭据连接返回 HTTP 401，符合其鉴权要求。未查询真实货件 | 可追踪其授权范围中的包裹；不能把快递覆盖数解释为七家海运船司覆盖 |

### 可核实的服务地址

- Warp：`https://mcp.wearewarp.com/api/mcp`
- FreightUtils：`https://www.freightutils.com/api/mcp`
- Easyship：`https://mcp.easyship.com/mcp`
- CargoMART：通过实际账号与 CargoAi 获取连接方式；本轮不提供未经核实的地址。

探测记录：`output/carrier-tracking-20261028/mcp-public-probes.json`。仅记录服务名、状态码、工具名及合成的只读计算结果，不包含会话 ID、API Key 或业务资料。

官方/维护者来源：

- https://github.com/warpfreight/warp-agent-mcp
- https://www.cargoai.co/press/cargoai-mcp-ai-platforms-2026/
- https://github.com/SoapyRED/freightutils-mcp
- https://developers.easyship.com/docs/easyship-mcp-server

## 2. DCSA 与 MCP 的分工

| 层次 | 作用 | 谁提供业务数据 |
| --- | --- | --- |
| DCSA Track & Trace | 定义事件类型、字段、查询和交换规则 | 实际发布事件的船司、码头或其他数据提供方 |
| 船司官方 API | 按其接口合同、权限和配额返回真实事件 | 船司 |
| 我们的业务服务 | 执行票单权限、缓存、快照、队列与定时刷新 | 调用已获授权的上游或读取已有快照 |
| MCP | 把业务能力描述成工具，供 AI 发现与调用 | 工具背后的业务服务 |

DCSA 不是注册一次即可取得所有船司数据的聚合 API。其实施指南明确要求消费者建立 API 客户端，连接具体发布者。MCP 也不提供船司数据权限，更不会使网页 403 自动消失。

DCSA 参考实现和 conformance sandbox 用于协议开发及一致性验证，不是生产货踪数据库。部分旧指南中的 GitHub/SwaggerHub 链接本轮访问失败；应从当前官方 Reference 页面查找版本和文档，不以旧链接作为部署依据。

参考：

- https://dcsa.org/standards/track-and-trace
- https://reference.dcsa.org/content/standards/guidelines/implementation-guides/implementing-track-and-trace
- https://modelcontextprotocol.io/docs/learn/architecture

## 3. 我们如何接入 DCSA

当前项目扮演事件消费者。按各船司实际支持的版本接入，不把不同版本当作完全相同的 JSON。CMA、ONE 的本轮已核实文档为 2.2；未来新增版本独立标记能力和解析方式。

实施顺序：

1. 取得船司数据产品权限、正式 API 地址、实际鉴权资料及可用于验收的票单。DCSA 标准可公开阅读，船司数据授权仍由船司处理。
2. 为具体船司建立 provider：鉴权/令牌、订舱或提单与箱号条件、分页、超时、限流、错误分类。共享可复用的 DCSA 模型，但保留各家差异。
3. 通过 `/events` 类接口读取事件，按请求身份及商业周期校验归属。不得因为箱号相同就合并不同运输批次。
4. 区分 ACT、EST、PLN，保留来源时间与时区。汇入现有统一快照、数据库和票单详情。
5. 由既有定时刷新任务调用相同 provider；支持上游推送时，另实现该船司真实提供的订阅合同，不把标准支持误认为所有船司都已开放。
6. 用多箱、转船、预计变更、分页、无数据、权限不足等真实样例验收。协议 sandbox 与真实生产样例分别记录。

CMA 和 ONE 的具体准入、鉴权及现有代码差距见同目录 `CARRIER_TRACKING_API_RESEARCH_20261028.md`。

## 4. 我们如何接入 MCP

### 4.1 作为客户端使用第三方 MCP

在后端增加 MCP 客户端连接管理：配置经过核实的服务地址，执行 SDK 生命周期协商，读取 `tools/list`，按工具白名单映射成模型可用的 function tools，模型返回工具调用后由后端执行 `tools/call`，再将结构化结果回传模型。

DeepSeek 支持工具调用。MCP 通信应由 Agent 宿主/Node 客户端执行，不要求模型自己处理 HTTP、OAuth 或 JSON-RPC，也不把密钥交给模型。

远程服务使用 Streamable HTTP；本地开发可使用 stdio。不同客户端配置格式不同，服务 URL 不能不加区分地粘贴进任意 JSON 配置。SDK 应锁定版本并完成服务端兼容测试。

来源：

- https://ts.sdk.modelcontextprotocol.io/client
- https://ts.sdk.modelcontextprotocol.io/v2/clients/connect
- https://api-docs.deepseek.com/guides/tool_calls/

### 4.2 将我们自己的货踪能力开放成 MCP

建议增加薄的 `tracking-mcp` 服务，复用现有 Java 业务 API，避免创建另一套票单数据库或绕过客户数据范围。

```text
AI 助手 → MCP 客户端 → 我们的货踪 MCP → 现有 Java 业务服务
                                         ↓
网页工作台 ─────────────────────────→ 权限、快照、缓存、任务
                                         ↓
                                  Node 船司适配注册表
                                         ↓
                         船司官方 API / 授权浏览器备用
```

建议第一版工具：

| 工具名（设计提案，尚未实现） | 行为 |
| --- | --- |
| `tracking_capabilities` | 列出当前船司、已开通通道、支持的查询类型及配置状态 |
| `get_shipment_tracking` | 按内部票单 ID 读取有权访问的快照，说明来源及更新时间 |
| `request_tracking_refresh` | 对已有票单申请刷新任务，返回任务 ID；会触发上游调用及缓存写入，不能标成无副作用工具 |
| `get_tracking_job` | 读取属于当前授权范围的任务进度与结果 |

工具的参数只描述业务需求，不接受模型指定的任意上游 URL、API Key、客户身份或管理员角色。调用者身份来自 MCP 服务的服务端鉴权上下文，所有查询再经过现有业务权限。船司密钥留在适配层。

MCP 登录权限与船司 API 权限是两层：用户有权访问我们的 MCP，不等于我们取得其所有船司票单的上游授权。

对可能运行数分钟的浏览器查询使用现有任务模式，避免让一个工具同步等待整个浏览器/模型流程。普通读取返回当前快照与新鲜度，强制刷新必须显式申请，按票单去重并复用现有队列。

远程对外部署时使用 HTTPS、服务端鉴权及合适的 OAuth resource-server 集成。内部原型也应有受控身份。不要将“模型客户端传入的 tenantId”作为授权依据。

参考：https://py.sdk.modelcontextprotocol.io/run/authorization/

## 5. 当前代码与推荐交付顺序

已复核代码：

- `tracking-service/lib/carrier-adapter-registry.mjs`：已有执行适配器注册表。
- `tracking-service/services/default-carrier-adapters.mjs`：已有具体船司能力组装。
- `backend/.../shipment/ShipmentTrackingController.java`：现有业务用户/客户访问边界。
- `backend/.../shipment/ShipmentBatchTrackingController.java`：现有任务接口。
- `carrier-agent-lab/src/agent/tools.ts`：现为进程内 pi SDK 浏览器工具，并非已经运行的标准 MCP 服务；需另加 MCP 适配层。

建议交付：

1. 先完成 CMA 官方 API 试用与实际票单核验，随后接 ONE。
2. 对统一快照及刷新任务建立稳定的业务工具接口。
3. 建立自己的货踪 MCP 服务与 DeepSeek 宿主客户端桥接，限定货踪工具集。
4. 需要物流辅助计算时，再接 FreightUtils；Warp、CargoMART、Easyship 按实际运输业务与数据权限另行启用。

当前已证明第三方 MCP 连接与工具发现可行、FreightUtils 的只读计算可用；尚未证明第三方 MCP 能返回本项目七家船司的真实海运货踪，也尚未部署我们自己的 MCP 服务。
