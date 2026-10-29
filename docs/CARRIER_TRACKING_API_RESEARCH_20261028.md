# 七家船司货物追踪 API 调研

核查日期：2026-10-28。范围为账号文件中的 COSCO、CMA CGM、Maersk、Hapag-Lloyd、MSC、OOCL，加 ONE。仅涉及读取货踪，不涉及订舱、单证提交或订单变更。未复制账号文件中的凭据，未申请产品或使用尚未取得的 API Key 进行业务实测。

## 结论

应区分官网可查、官网内部 HTTP 接口、官方开放 API 和合同授权的商业集成。公开文档不等于匿名访问、永久免费或已取得该公司的数据权限。

| 船司 | 官方货踪能力与准入证据 | 项目处理建议 |
| --- | --- | --- |
| COSCO | 当前代码使用官网 `scct/scct_customer/public/cargoTracking` 等查询接口；COSCO 另有正式开放平台，列出 Cargo Tracking 及注册、订阅、联调步骤 | 保留已验证的官网适配；正式开放平台作为长期接入选项，不能把当前网页接口视作合同保证的开放 API |
| CMA CGM | Logistic Tracking service API / DCSA T&T 2.2。公开数据以 API Key 鉴权，私有数据以 OAuth2 client credentials 鉴权并核对订舱业务关系。公开 API 请求头为 `KeyId` | 首先接入基础货踪 API，浏览器作为独立备用通道 |
| Maersk | 官方 Ocean Track & Trace API/EDI 产品面向 Maersk Ocean 客户。开发者门户需创建集成、申请 API 产品，客户 API 有 customer code/票单当事方范围 | 选定 Ocean T&T 产品并申请授权后，按其具体合同实现；不要将付费多船司 Visibility Studio 与单船司基础 T&T 混为一套 API |
| Hapag-Lloyd | 官方目录明确有 Track & Trace，覆盖 shipment、equipment、transport events；Live Position 是另一个产品 | 优先申请基础 T&T，登录、订阅及数据范围以门户实际发放为准。需要 GPS 时再评估 Live Position |
| MSC | 官方目录列有 DCSA Track and Trace；订阅文档确认有 T&T API 及相同事件格式的 Azure Service Bus 推送 | 通过官方入口申请接入，核实 REST API 的实际凭据和数据范围；不要将 ASB 凭据配置到 REST API |
| OOCL | 官方数字化产品资料确认 API 集成及 N2C3 Lite 货踪能力；本轮没有找到可自助开通、匿名调用的公开货踪 API 文档 | 联系 OOCL 数字化/e-Commerce 团队取得接口合同；取得前保留受控浏览器查询，不标记为官方 API 已接通 |
| ONE | 官方 Developer Portal 有 DCSA T&T 2.2 文档。token 请求为 `POST /v1/oauth/accesstoken`，事件查询为 `GET /v2/events`；需应用 API Key 和 OAuth 访问令牌 | 单独增加 ONE 注册及 OAuth token 管理，拿到正式应用权限后接入，不能当作只需一个固定请求头的接口 |

### 官方来源

- COSCO 开放平台：https://cop.lines.coscoshipping.com/copPortal/
- CMA 产品：https://api-portal.cma-cgm.com/products/visibility?summaryId=operation.trackandtrace.v1
- CMA 鉴权、分页与 CORS：https://api-portal.cma-cgm.com/usage-guide
- CMA 试用入口：https://api-portal.cma-cgm.com/getting-started
- CMA FAQ：https://api-portal.cma-cgm.com/faq
- Maersk Ocean Track & Trace：https://developer.maersk.com/api-catalogue/Track%20and%20Trace%20Plus/Learn-more
- Maersk 准入与权限 FAQ：https://developer.maersk.com/support/faqs
- Hapag-Lloyd API 目录：https://www.hapag-lloyd.com/en/services-information/data-solutions/api-portal.html
- Hapag-Lloyd T&T 产品：https://api-portal.hlag.com/products/portfolio/events-tracing-for-web-api-product-d73213
- MSC 目录：https://developerportal.msc.com/api-details/
- MSC 事件订阅说明：https://developerportal.msc.com/content/TnT_Subscription_Customer_Onboarding.pdf
- OOCL 官方数字化资料：https://www.oocl.com/canada/eng/localinformation/digitalsolutions/Documents/EcommerceOverviewUpdatedCanadaVersion.pdf
- ONE T&T：https://www.one-line.com/all-digital-solutions/one-developer-portal/api-and-edi-catalog/track-trace
- ONE 官网查询与单号规则：https://www.one-line.com/one-ecom/manage-shipment/cargo-tracking?sessLocale=en-ONE

## CMA 403 应如何处理

当前 `tracking-service/lib/cma-query.mjs` 调用 `channels/cma-playwright.mjs`，进入官网 `/ebusiness/tracking/search`，并处理 DataDome 会话。这是网页通道，没有接入正式的 CMA T&T API。

应按响应来源诊断：官网返回验证页或挑战内容，属于网页防护路径；正式 API 返回 401/403，则检查 API Key、所订阅产品、OAuth scope 和业务数据权限。仅凭 403 不能断言没有货踪 API，也不能保证更换浏览器或使用 AI 会解决问题。

优先顺序：

1. 在 CMA API Portal 注册组织/应用并申请 Logistic Tracking service API。官方列有公开 API 30 天限额试用，FAQ 将该货踪产品列入试用范围；长期配额和价格需确认。
2. 先用公开权限读取 Equipment 和 Transport 的基础事件、转船及预计船期；仅在需要私有陆运/商业信息时申请 OAuth2 及关联订舱身份。
3. 从 Node 或 Java 后端发起请求。官方明确不支持前端跨域调用；接口密钥不发往浏览器。
4. 先用一票已知有效业务样例核对每个箱号、实际/预计节点和 ETA，再启用定时刷新。未经确认、已取消或超出产品范围的数据可能不返回。

如需暂时保留浏览器通道，工程建议是使用专用持久化浏览器上下文，在实际运行环境由人员完成正常登录/验证，再在同一上下文执行查询。现有实现即使连接 CDP，仍会新建 context 并转移 Cookie，没有完整复用原页面上下文；因此其成功率不能只由 Cookie 是否存在判断。这是代码分析与改造建议，不是本轮已完成的改造或稳定性承诺。

DataDome 的官方保护 API 接收 IP、User-Agent、TLS 指纹等信息，说明其判定不只依赖 Cookie。仅复制 DataDome Cookie 到另一环境，不足以保证通过。参考：https://docs.datadome.co/reference/validate-request 。

浏览器任务遇到验证应暂停并报告，保留旧快照；解析优先取网页已返回的结构化数据或 DOM，AI 用于必要的页面理解和归一化，不把 AI 当作访问权限或验证码的替代品。

## 现有代码在正式接 API 前需要补齐

- CMA 当前执行适配器仅走浏览器，需新增官方 API 通道与服务端 `KeyId` 凭据。
- ONE 尚未进入主系统七家注册，需要加船司元数据、身份规则、后端校验、前端选项和刷新调度。
- 当前通用 DCSA HTTP 客户端只支持一个配置鉴权头，无法直接满足 ONE 的 API Key + Bearer Token 组合。需要令牌缓存、到期刷新、并发刷新去重、鉴权失败分类。
- 当前分页只读取 `next-page-cursor`。CMA 文档说明使用 `Next-Page`，所以应实现逐船司分页策略；未完整取完的数据不能当作完整快照保存。
- CMA 公开数据可能将 booking reference 脱敏；不能直接把脱敏值认作查询单号错误。需要结合原始查询、返回的箱号、票单商业周期等信息验证归属，不能简单放宽身份校验。
- DCSA 的 Transport 事件可能通过 `references` 关联箱号；需要按各家真实样例适配关联关系，不能只处理顶层 `equipmentReference`。
- 保留统一快照模型，同时按船司分别定义鉴权、请求、分页和字段解析。接口合同一致之后才共享实现，不以 URL 可配置冒充各家正式 API 已接通。
- 官网货踪节点和 ETA 不等同于持续 GPS 定位。地图应明确数据来源和最后更新时间；需要真实位置时评估对应设备/位置产品。

## 推荐实施顺序

1. CMA 基础官方 API：文档明确、可申请限额试用，先解决当前网页 403 带来的阻塞。
2. ONE 官方 API：官方文档完整，增加 OAuth 与第七家接入。
3. Maersk、Hapag-Lloyd、MSC：并行申请企业权限，得到实际产品凭据和样例后分别验收。
4. OOCL：取得商务对接资料；此前维持受控网页备用通道。

本轮为调研与代码复核，未修改业务查询逻辑、未申请产品、未使用账号进行订舱或其他写操作，亦未将“有 API 文档”计为实际接通。
