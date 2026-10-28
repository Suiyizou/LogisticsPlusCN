# logisticspluscn · 第二轮全面界面精修计划（只读决策稿）

日期：2026-10-28。基线分支：`codex/logisticspluscn-ui-a`，HEAD：`59075b2`。

本文记录第二轮设计与实施边界，不代表用户已认可最终视觉。用户已明确上一轮字体、CSS、下拉框和动态效果不满意；测试通过不能等同于设计获认可。初稿阶段浏览器连接曾中止，随后已恢复内置浏览器并成功登录线上，实际检查工作台、客户详情和定时任务状态页。其余判断结合本地源码与用户截图，不能当作线上全部页面的验收结果。

后续范围确认：线上独立订舱平台保留独立入口；当前分支缺少定时更新状态接口，用户明确“暂不考虑，先做个样子出来”。因此新增定时任务设计预览，状态/数量使用占位并注明待接入，不回移另一分支后端代码。实现与本地验证记录另见 `UI_REFINEMENT_V2_ACCEPTANCE.md`。

## 1. 设计依据与已锁定方向

用户参考图：`C:/Users/ASUS/AppData/Local/Temp/codex-clipboard-deff86e4-f8e3-4a80-9e3a-56098ada54d1.png`，已实际查看。截图的重要结构是白色全宽导航面板、三组服务列表、右侧独立详情卡；列表 hover/focus 改变右卡。其公司标识与服务名称不属于本项目，不照搬。

品牌继续为上海罗加国际货物运输代理有限公司 / logisticspluscn。保留 A 的深海蓝、陶土橙、港口影像方向，第二轮重点是信息层级、排版、控件完成度和连续的交互反馈，不是另一轮批量替换颜色。

已读取 `C:/Users/ASUS/.codex/skills/ui-ux-pro-max/SKILL.md`，完成 design-system、typography、ux、Vue 与 motion 数据库查询。数据库匹配的 Enterprise Gateway 支持 mega-menu；采用其键盘可达、触屏替代、字体加载回退和 reduced-motion 原则。未采纳自动返回的黑金配色、Calistoga 装饰字、客户 Logo/Contact Sales 假内容、跳跃式 stagger；这些与用户截图和现有业务不符。数据库的“WCAG AAA”标签不作为本项目达标证据。

## 2. 导航：必须落地的全宽 mega-menu

### 桌面结构

- Header 高度约 88px，标识左侧、主导航中间、账号入口右侧；全站官网内容栅格建议最大 1440px，1440 视口两侧 48px，宽屏居中；不能把大菜单限制在某个按钮下方的 260px 小框。
- 面板铺满 header 下方可视宽度，内部跟随 header 栅格。使用 `minmax(0, 1fr)` 的三列服务组 + 320–360px 详情卡；列间距 32–40px，顶部眉题/分隔线，服务项高度 44–48px。
- 右卡上部固定比例影像（约 16:7），下部服务标题、两行说明、2–3 条已实现能力、权限说明与真实入口。尺寸固定，切换内容不推动其它列。
- 主导航建议“平台能力”“货物追踪”“装箱规划”；平台能力展开三组。不要复制截图的 AI 赋能、预约演示等没有对应真实链路的按钮。
- 列组拟定“运输与装载”“业务与客户”“管理与协作”。具体条目从现有 module metadata/已有固定入口映射，维护单一展示 catalog，不能为官网再写一套权限规则。
- 运输与装载：公开货物追踪、装箱规划、箱型资料、算法与装载说明。后三项保持当前真实鉴权，不得凭展示意图改成公开。
- 业务与客户：业务总览、票单管理、客户目录、海外代理、业务交接；根据现有角色限制显示“需员工账号/授权范围”。
- 管理与协作：客户空间、通知公告、管理控制台；管理员细分管理项目可在右卡说明，不把管理员全部后台项目堆给匿名访客。
- 询价、订舱、保险、金融、港口信息、机场代码、关税模拟、汇率换算等截图条目，除非已核实真实实现，否则不作为可用产品呈现。允许展示“能力说明”，但不提供会进入空白页/假成功的 CTA。

### 交互与语义

- `hover` 有 100–140ms 意图延迟；离开 header 与面板的共同区域后 140ms 关闭，指针跨缝隙不会闪退。点击也能开关；focus 进入对应项时切换右卡。
- Enter/Space 打开主按钮；Tab 顺序跟随三列和详情 CTA；Escape 关闭并返回触发按钮；点击外部关闭。菜单容器用 nav/disclosure 语义，内容链接保持真实 `a`，不混用应用式 menu role 与普通网站 Tab 行为。
- 隐藏状态不可继续接收焦点。右卡切换不能抢走当前焦点，不对屏幕阅读器高频播报整张卡。
- 在小于 1024px 或 coarse pointer 环境切为点击展开的导航面板/分组手风琴；每组展开后显示内嵌说明，不要求 hover。375px 下不保留四列挤压布局。
- 登录后按实际身份显示可达入口；未登录时入口经过现有认证/深链规则。没有权限的控制入口不伪装成可点击；说明性文字不修改后端授权。

## 3. 字体、比例与视觉规范

- 正式字体资产待实施者核验来源/许可后自托管。中文拟采用 Noto Sans SC 或 Source Han Sans SC 的 400/500/600，英文与数字拟用 Inter；两者基线与字重须一起检查。未有可靠字体文件时使用系统回退，不引入运行时 Google Fonts CDN。
- 字体加载使用 `font-display: swap`；只预加载首屏必要 Latin/常用中文字集，按需加载其它字集，不能让整套 CJK 大字体阻塞首页。不得用不完整子集导致客户名/港口名缺字。
- 官网 H1：桌面 56–64px / 1.12，手机 36–42px / 1.2；H2 34–40px / 1.25；正文 16px / 1.65。后台页面标题 28–30px / 1.3，区块标题 18px，正文与表单 14–15px，说明文字最低 12px。
- 表格正文 14px、表头 12–13px、行高 48–52px；密集模式可用 44px，但不可将行文字压到 10px。数据采用 tabular-nums；仅运单号/代码可使用等宽字，不把所有文字改成 monospace。
- 中文普通正文不增加 letter-spacing；英文小标题可 0.08em；长英文服务名、中文公司名和超长用户昵称必须换行/截断可访问，不能靠缩字号。
- 保留品牌主色 `#15384A`、行动色 `#BA4B25` 与背景 `#F2F5F6`。白色内容区、细边框、低饱和状态底色建立层次；状态须同时有文字/图标。
- 控件圆角 6px、卡片 10px、弹层 12px 作为第二轮建议，替代上一轮整站机械的 2px；表格容器保持 8px。统一 tokens 后再实施，不在各页各自创造半径。
- 阴影用于下拉层、抽屉、modal 等浮层建立层级，普通工作台卡片保持细线。不能把作为输入框边界的 inset shadow 当作装饰全部删除。
- 所有图标统一来自现有 Element Plus/SVG 体系，18–20px、统一线重，不以 emoji 充当导航/操作图标。

## 4. 控件与弹层必须完整设计

| 控件               | 决策与必须覆盖的状态                                                                                                                               |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| 按钮               | primary/secondary/quiet/danger 层级；默认/hover/pressed/focus/disabled/loading；loading 保持原宽、提交防重复；行操作不每项都做大实底按钮           |
| 输入框             | 42–44px 标准高度，标签置顶；边界清楚；帮助/格式提示/字段错误对应控件；成功不清空用户未确认内容                                                     |
| 单选下拉           | 真实 combobox；输入区域、箭头、clear、选中值统一；弹层 8–12px 内边距、选项至少 36px，选中/键盘聚焦/hover不同；弹层最大高度约280px并局部滚动        |
| 可搜索/多选下拉    | 搜索无结果、加载、远程错误、长名称、多选折叠计数、清空和禁用完整；现有 v-model 值和emit类型保持不变；不能改成只有外观的div                         |
| 日期/分页/批量选择 | 日期区间、清空、快捷选项、页容量弹层、勾选/半选；过滤后仍有当前条件和结果总数；空结果提供清除筛选                                                  |
| 下拉弹层实现       | Vue沿用Element Plus能力统一popper-class与token；原生追踪端短列表优先保留原生select能力，若自定义则必须完成键盘/ARIA/移动fallback，不只隐藏原生控件 |
| 表格               | 固定表头/必要固定操作列、清晰行hover、选中行、批量操作条；长列表不逐行入场；窄屏在表内横滚而非全页溢出                                             |
| 详情               | 标题/编号/状态/更新时间固定层级；业务字段、运输轨迹、绑定对象、附件分区；返回保留筛选/页码；不能把真实未知状态补成“正常”                           |
| Modal              | 480px短确认/640px表单/960px导入；窄屏calc(100vw - 32px)；顶/底操作区固定、主体滚动；focus trap、初始焦点、Escape和关闭后焦点返回                   |
| Drawer             | 560–720px资料与文件抽屉，保持列表上下文；打开不重置底层筛选；编辑脏数据按现有策略处理，不能静默丢失                                                |
| 危险确认           | 对象与影响范围明确，保留原有取消/确认语义；现有window.confirm属于本轮待逐项覆盖界面，替换必须保持异步调用顺序与取消结果                            |
| 空态/错误/等待     | 区分无记录、过滤无结果、无权限、服务错误；真实重试/返回操作；只有可预测真实计数才显示百分比；不能放虚构到达日期/监控数据                           |

## 5. 动效：可观测的状态变化，不做空转装饰

| 场景               | 时间/位移建议                                                  | 约束                                                   |
| ------------------ | -------------------------------------------------------------- | ------------------------------------------------------ |
| Mega-menu打开/关闭 | 220ms ease-out，opacity + translateY(8px→0)，关闭140ms         | 不动画整页height；触发与面板无鼠标断层                 |
| 右卡服务切换       | 120–160ms交叉淡入，文字位移最多4px                             | 固定卡片高；不抢焦点；不循环播放                       |
| 官网首屏           | 图像轻微1.025→1缩放700ms；标题/摘要分别40ms错峰，整体450–550ms | 首屏内容默认可见；只首访当前页面一次，无强制等待遮罩   |
| 官网滚动区         | 一次性opacity/translateY≤16px，350ms，最多3个可见区块错峰      | IntersectionObserver/CSS即可；不滚动劫持、不pin整页    |
| 导航选中/按钮      | 140–180ms颜色/底色；小箭头旋转180ms                            | 不改变元素尺寸引发布局跳动                             |
| Drawer             | 240ms translateX + 遮罩180ms                                   | 屏幕内小幅移动，隐藏态不可focus，返回焦点              |
| Modal              | 200ms opacity + translateY(8px)/scale(.98→1)，退场140ms        | 不弹跳、不反复zoom；保留现有焦点管理                   |
| 筛选/页码切换      | 保留旧表格+局部loading，完成后120ms淡换                        | 不整页遮罩、不每行stagger、不丢scroll/selection        |
| 导入/追踪进度      | 已确认步骤/实际完成项即时更新；变化160ms                       | API未提供进度时indeterminate；失败项仍能查看/重试/取消 |
| 装箱3D             | 沿用现有交互；仅相机/选中状态按现有能力平滑变化                | 不动计算结果，不伪造装载动画替代真实解算               |
| Toast/公告         | 180ms进入/120ms退出，逐条而非堆满                              | 错误可读时间充足，重要失败不能仅短暂toast              |

实现优先 CSS Transition + Vue Transition + 已有 reduced-motion composable；原生追踪用CSS class/WAAPI。当前需求不需要强行引入GSAP。`prefers-reduced-motion`下取消位移、缩放、视差、stagger，保留立即可见的状态文本；最多80ms淡入。不以全局动画时长归零破坏transition生命周期。

## 6. 影像与资产任务

- 需要3组同一光线/色彩/构图语言的资产：官网港口hero（21:9/16:9并有手机裁切）；mega-menu运输/装载/协作详情卡图（16:7）；认证侧屏图（4:5）。可从同组生图设计提取，不对每个功能随机生成风格。
- 文案/标识不能烧进图片；留出真正可读的文字负空间，正文由HTML渲染。图片固定宽高与object-position，首屏优先、其余lazy，输出WebP/AVIF及适当fallback。
- 仓库现有生成港口图不是企业现场照片；新增也标注“品牌氛围示意”，不生成可被理解为自有船舶、客户案例、办公团队的证据。
- 工作台仅在空态或入口使用轻量图形，列表/详情/弹窗优先真实数据。航线图不能暗示实时船位；没有位置数据不画实时移动船舶。
- 实施生图必须由负责资产的编写代理使用用户授权的图像技能/工具；本决策稿未生成任何图像。

## 7. 全页面覆盖矩阵（基于本地源码；逐页线上勘察待恢复）

状态统一为“待二轮实施/验收”。路径为已核对路由或组件边界；没有读取具体mount的模块不猜写完整URL。每行需补桌面1440、窄屏375、英文、键盘、loading/empty/error及适用权限证据。

### 7.1 页面/详情

| ID  | 页面/入口与源码                                           | 二轮重点                                      | 不可损失的行为                           |
| --- | --------------------------------------------------------- | --------------------------------------------- | ---------------------------------------- |
| P01 | `/`、`/#/`；PublicLandingPage + public/*                  | 全宽mega-menu、hero、查询dock、服务层级、页脚 | 真实查询参数、兼容入口、语言、登录入口   |
| P02 | LoginPage；受保护路由登录                                 | 新字体、双栏图像、员工/客户tab、表单状态      | 员工/客户各自API、客户码、错误、回跳     |
| P03 | AdminLoginPage                                            | 与认证体系一致，保留管理语义                  | busy、凭据更新emit、submit               |
| P04 | `/customer-workspace`登录；CustomerSurfaceHost            | 客户专属说明、三凭据与错误                    | customer session与员工隔离               |
| P05 | SystemWaitOverlay / AsyncPageError / GlobalApiErrorNotice | 品牌等待、retry/返回、可读错误                | 真实状态触发、contained、卸载清理        |
| W01 | `/workbenches`；WorkbenchPortal                           | 从角色任务进入，导航/账号菜单/公告层级        | 角色入口、改密码、资料、退出、公告       |
| L01 | `/home`；HomePage                                         | 真实概况、设置与工具入口                      | 配置保存、已有状态与用户名               |
| L02 | `/planner/config`；App                                    | 参数分组、箱型列表、算法配置、折叠高级项      | 全部配置、箱型启停、导入/编辑            |
| L03 | `/planner/cargos`；App/ExcelTemplatePage                  | 货物表格、导入预览、错误定位                  | Excel、规格/托盘/约束、批量删除/编辑     |
| L04 | `/planner/results`；ContainerScene等                      | 3D主视图、结果列表、利用率/重心、详情分区     | 真实计算、方案切换、旋转、导出、剩余空间 |
| L05 | `/containers`；ContainerReferencePage                     | 箱型分类、尺寸表、图示与来源                  | 真实规格、分类、选用入口                 |
| L06 | `/algorithm`；AlgorithmPage                               | 阅读层级、术语与约束说明                      | 原有规则说明，不新增性能承诺             |
| L07 | PackingReconciliationPanel / ProjectionCanvas             | 表格与几何图清晰对照                          | 校验异常、视图、真实几何/质量数据        |
| B01 | 业务总览；BusinessOverviewPage                            | 指标条、图表、任务入口、错误/空态             | 原有计算指标、真实数据、角色范围         |
| B02 | `/customers/directory`；CustomerDirectoryPage             | 搜索/筛选、行主次、批量动作                   | 搜索、分页、新建、导入、选择             |
| B03 | `/customers/directory/:customerId`；CustomerDetailPage    | 客户资料、绑定票单、凭据/发布分区             | 返回条件、绑定/解绑、发布、资料、权限    |
| B04 | `/customers/shipments`；ShipmentListPage/Workspace        | 下拉框完整状态、操作栏、表格密度              | 六船司、参考号、批量追踪、分页、刷新     |
| B05 | `/customers/shipments/:shipmentId`；ShipmentDetailPage    | 运单标题/状态/日期、业务字段、客户绑定        | 编辑、保存、跟踪、绑定、失败重试         |
| B06 | AgentDirectoryPage                                        | 代理目录、导入/创建分组                       | 角色权限、筛选、凭据与删除确认           |
| B07 | CustomerHandoverPage                                      | 交接流程和记录、风险确认                      | 原发起/接收/取消与对象范围               |
| B08 | `/customers/service-catalog`；ServiceCatalogPage          | 新模块可沿同一PageHeader/Table/EmptyState扩展 | contractClient、生成模块边界             |
| B09 | CustomerSummaryExamplePage / LegacyBusinessPage           | 以现有启用配置为准覆盖展示                    | 不把示例模块当真实服务宣传               |
| C01 | `/customer-workspace/shipments`；CustomerShipmentsPage    | 客户身份壳、已发布票单、空态/详情入口         | 仅本人授权票单、storage同步、失效处理    |
| A01 | 后台 overview；AdminOverviewPage                          | 真实指标、图表图例、宽度/字体                 | chartToken、数据/空态/降级               |
| A02 | audit；AdminAuditPage                                     | 时间/对象/操作筛选、详情可读                  | 审计查询分页、敏感信息边界               |
| A03 | employees；AdminEmployeesPage                             | 角色分组、员工表、菜单                        | 创建/编辑/停启/重置/删除                 |
| A04 | platform；AdminPlatformPage                               | 客户与负责关系的主次信息                      | 现有客户操作/查询权限                    |
| A05 | handovers；AdminHandoversPage                             | 交接记录、对象与影响范围                      | 审计只读语义                             |
| A06 | tickets；AdminTicketsPage                                 | 全局票单表与筛选/详情                         | 全企业范围/角色边界、分页                |
| A07 | devices；AdminDevicesPage                                 | 设备/IP/状态信息，退出确认                    | 真实会话下线与刷新                       |
| A08 | files；AdminFilesPage                                     | 文件类型/状态/预览/下载                       | 文件权限、不可预览类型与下载             |
| A09 | announcements；AdminAnnouncementsPage                     | 公告列表、编辑、范围/日期清楚                 | 编辑器、图片上传、发布/删除              |
| A10 | system；AdminSystemSettingsPage + AdminLlmSettingsPanel   | 分组设置、保存反馈、服务状态                  | 现有配置与secret显示边界，不假在线       |

### 7.2 Vue弹窗/抽屉/确认层

| ID  | 文件/覆盖对象                                                            | 必须检查                                                      |
| --- | ------------------------------------------------------------------------ | ------------------------------------------------------------- |
| D01 | CargoModal.vue                                                           | 新建/编辑、单位、旋转/托盘/堆叠约束、校验、窄屏、取消         |
| D02 | ContainerModal.vue                                                       | 箱型参数、尺寸单位、编辑值、保存/取消                         |
| D03 | App.vue内置profile/import/result等待及window.confirm                     | 全部实际v-if状态；删除单条/批量确认、导入取消，不只CargoModal |
| D04 | WorkbenchPortal个人资料/改密码                                           | 字段错误、loading、返回焦点、密码规则                         |
| D05 | PersonalProfileDialog.vue                                                | 用户更新与保存错误、角色描述                                  |
| D06 | SystemAnnouncementDialog.vue                                             | 公告内容、图片、已读、关闭/确认                               |
| D07 | ManualShipmentCreateDialog.vue                                           | 多船司/参考类型、手动业务字段、重复/失败                      |
| D08 | ManualShipmentImportDialog.vue                                           | 文件、sheet/column、预览、错误行、实际进度                    |
| D09 | ShipmentListWorkspacePage内批量追踪/批量业务字段                         | 开始/停止/取消、运行中/失败项、列映射、客户发布选项           |
| D10 | CustomerFormDialog.vue                                                   | 新建/编辑、字段帮助/错误、合法空值                            |
| D11 | CustomerImportDialog.vue                                                 | 多sheet、预览、导入结果、错误定位                             |
| D12 | CustomerClientCodeDialog.vue                                             | 客户码查看/更新/复制与提示                                    |
| D13 | CustomerCredentialDialog / CustomerPasswordDialog / PasswordResultDialog | 凭据安全显示、复制、单次结果、重置确认                        |
| D14 | AgentCreateDialog / AgentImportDialog                                    | 账号/代理创建、文件映射、错误反馈                             |
| D15 | BusinessHandoverDialog / CustomerTransferDialog                          | 接收人搜索、范围、理由、危险确认、忙态                        |
| D16 | AdminEmployeeDialogs.vue                                                 | 所有创建/编辑/密码/确认变体                                   |
| D17 | AdminAnnouncementDialogs.vue                                             | 编辑/图片/范围/预览，内容高时主体滚动                         |
| D18 | AdminFilePreviewDialog.vue                                               | loading、错误、无法预览、下载、关闭                           |
| D19 | AdminDashboard ElMessageBox + 全域window.confirm                         | 同一确认语言、焦点与取消结果；不得仅给截图用假弹窗            |
| D20 | CustomerDialogs / AgentDialogs / HandoverDialogs容器                     | 子弹窗挂载/销毁、重入、Escape和表单重置                       |

### 7.3 独立追踪前端

| ID  | DOM入口/视图                                               | 二轮重点与保留能力                                                                |
| --- | ---------------------------------------------------------- | --------------------------------------------------------------------------------- |
| T01 | `/tracking/`匿名壳/导航                                    | 同品牌导航、字体、查询入口；不得显示假账户数据                                    |
| T02 | `tracking-view` / tracking-form                            | 船司/参考类型/单号下拉、查询状态；COSCO/CMA=BOOKING/CONTAINER，其它按实际支持含BL |
| T03 | results/summary/journey/route                              | 摘要→时间线→箱号/详情层次；真实来源/更新时间、ETA与实际时间区分                   |
| T04 | overview-view / history                                    | 筛选/搜索/页码/关注/客户范围；无记录与加载失败不同                                |
| T05 | shipments视图（海外代理）                                  | 授权票单、批量更新、全选/半选/空态                                                |
| T06 | profile-view（客户）                                       | 账号/客户码/身份只读说明，退出路径                                                |
| T07 | account menu / 登录返回/公告按钮                           | 角色入口、深链returnTo、session失效                                               |
| T08 | batch-workspace-dialog + batch-column-preview              | 文件、sheet/column、预览、队列、停止/恢复/结果                                    |
| T09 | related-files-drawer                                       | 文件分类、评论、上传、可见范围、目标客户、错误                                    |
| T10 | document-drawer                                            | 文档详情、票单关联、关闭回原上下文                                                |
| T11 | business-reference-dialog                                  | 补充业务参考号，保存/取消                                                         |
| T12 | document-editor-dialog                                     | 实际文档字段、校验、保存/错误                                                     |
| T13 | file-preview-dialog                                        | 各实际支持格式、下载、无预览和失败                                                |
| T14 | system-announcement-dialog                                 | 真实公告内容/图片、确认/已读                                                      |
| T15 | agent-update-task-dialog                                   | 实际成功/失败/剩余任务与停止状态                                                  |
| T16 | cma-session-panel                                          | 仅现有允许角色维护；敏感会话输入/状态，不扩大权限                                 |
| T17 | system-wait-overlay / platform-route-overlay / error/empty | 真等待、错误、取消/重试；没有虚构进度                                             |
| T18 | `embed=1` / 单号深链 / returnTo                            | 嵌入布局、查询与返回行为保持；不重复顶栏或溢出                                    |

## 8. 可并行工作包与所有权草案

最多三名源码编写代理；用户要求的代码编写模型/推理档由root配置。设计代理只决策和只读评审，不写业务实现。以下仅为待下一回合确认的分工，当前不启动源码修改。

| 包                           | 独占范围                                                                                                                                                                                                                                    | 责任                                                                                                  |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| A 公共品牌/基础控件/官网认证 | canonical tokens及同步产物；frontend design-system.css、main.js、login.css、maritime-public.css、PublicLandingPage/public/_/brand/_、LoginPage/SystemWaitOverlay/AsyncPageError/GlobalApiErrorNotice、前端public资产/字体、共用maritime文案 | mega-menu完整结构/交互、字体系、共享Element Plus popper规则、生成/组织影像；为B/C发布尺寸与motion契约 |
| B Vue全部受保护业务          | App.vue/OperationsEntry/styles.css、workspace组件、WorkbenchPortal/BusinessCustomerPage/AdminDashboard、features/admin及模块展示页/弹窗、装箱展示/导入/详情                                                                                 | 覆盖W/L/B/C/A/D矩阵；保留原state/props/emits/API/role；按实际流程整理而非全局覆盖                     |
| C 独立追踪                   | tracking-service/public除生成brand-tokens.css外文件                                                                                                                                                                                         | T01–T18全状态、公开/内部/客户/嵌入四种表面，原DOM ID/API/session边界不变                              |

- tokens、字体资产、全局控件和overlay层级必须由A唯一写入；C只导入产物，不手工改副本；B不编辑A的global css。
- AdminLoginPage属于B（共享管理壳样式），CustomerSurfaceHost属于B（客户session宿主）。A提供契约和资产后两者对齐，不跨包编辑。
- 业务厂函数、services、后端、适配器、route registry、types端口不在默认视觉编辑范围；若替换confirm等确需改调用签名，由root明确唯一owner并要求行为回归证据。
- 新mega-menu展示catalog不得替换原模块registry，也不得新增平行鉴权逻辑。保持实际模块启用状态/角色限制；增加模块仍走已有注册协议。
- 每包提交coverage条目清单及截图/录屏；不得仅说“global CSS覆盖了所以全完成”。

## 9. 下一回合执行顺序与验收门槛

1. 恢复可信浏览器后继续真实只读线上勘察；记录每个实际菜单、详情和弹窗，再与本地矩阵核对。当前未登录，不编造线上发现。
2. 先实现代表页：官网mega-menu完整交互 + 票单列表的下拉弹层 + 票单详情/导入modal。三者通过视觉和交互检查后把同一规范扩展，避免再产生整站一致但错误的外观。
3. 依矩阵遍历全部页面和弹层；每项至少有默认态与一个非理想态（loading/empty/error/disabled/long text）。有真实保存/删除行为的，仅在隔离测试环境操作。
4. 抽样覆盖匿名、ADMIN、BUSINESS、OVERSEA_AGENT、CUSTOMER五种身份；没有测试凭据的角色标为未验收，不用伪token宣称通过。
5. 视觉断点375/768/1024/1440/1920；中英文；200%缩放；键盘Tab/Enter/Escape；reduced motion；慢网络/加载失败。下拉层不能被容器裁剪、遮住主要按钮或落到modal背后。
6. 为mega-menu打开、服务hover/focus切换、drawer/modal打开/关闭、导入进度制作短录屏或逐帧证据。静态截图无法证明动态效果已完成。
7. 运行与改动相关的typecheck/build/现有功能回归；保留首页兼容入口样式依赖和双端tokens一致性检查。测试通过只是功能门槛，最终设计满意度仍需以实际视觉与用户反馈评估。

本稿因浏览器控制中止而在此冻结：已完成截图解读、skill辅助查询、本地路由/模块/弹层初盘点与设计决策；未完成线上逐页发现、字体资产许可核验、生图制作、源码实现或第二轮浏览器验收。
