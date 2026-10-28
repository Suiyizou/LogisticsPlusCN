# logisticspluscn V2：独立追踪前端交付与验收清单

范围：C 包 `tracking-service/public/`（不含 A 包生成的 tokens、字体资产）。本清单区分“源码已实现”和“真实浏览器已验收”；CSS 覆盖、单元测试、jsdom 验证都不等同于视觉验收。本包未请求真实船司、未修改线上数据、未提交 Git。

## 实现矩阵

| ID  | 已实现内容                                                                                                                  | 浏览器验收状态                                                                                         |
| --- | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| T01 | 匿名品牌顶栏、授权角色侧栏、双语与字体；访客不显示账户统计、实时或业务结束判断                                              | root 已检查匿名代表页；其余断点待验收                                                                  |
| T02 | 原生 select 保持值、name、事件与 capability；桌面增强 combobox、选项弹层、选中/聚焦/禁用、键盘与 typeahead；触屏恢复 native | root 已检查桌面下拉及 ArrowDown/Enter 写回；移动、最终 AX 树待验收                                     |
| T03 | 运单标题/编号/来源/更新时间、航线摘要、实际与预计时间、纵向里程碑、箱号展开详情                                             | 实现完成；真实 stored result、长字段、空字段待验收                                                     |
| T04 | 历史筛选、搜索、分页、关注、展开信息；访客空态与账户空态分开                                                                | 实现完成；角色范围与加载/空/失败代表态待验收                                                           |
| T05 | 代理表格、选中行、全选/半选、操作栏；批量刷新固定发起身份，身份改变中断                                                     | 实现完成；真实授权代理与批量操作代表态待验收                                                           |
| T06 | 客户资料、只读账户/客户码/身份、长昵称、窄屏字段布局                                                                        | 实现完成；真实客户身份待验收                                                                           |
| T07 | 账号菜单、键盘首项导航/Escape、角色入口、登录返回与公告按钮                                                                 | root 已实测 r3 首次 ArrowDown 聚焦“返回平台首页”、Escape 回触发器；其余角色回跳待验收                  |
| T08 | 正式入口导航同源 `/customers/shipments`，由现有 Vue“批量追踪”承载客户/发布/冲突确认；旧 tracking 批量 dialog 保留但休眠     | 旧 dialog 不计可达覆盖；待 Docker 前端重建后验收正式导航及 Vue 真实流程                                |
| T09 | 720px 文件抽屉、文件记录/权限/讨论/上传分区、分类菜单键盘、错误/重试、焦点圈定与恢复                                        | root 已实测第二次打开聚焦 drawer、关闭回文件按钮、390px 宽无溢出；文件内容/上传/可见范围待隔离环境验收 |
| T10 | 旧 document-drawer：保留 DOM、元数据渲染和样式，但没有当前可达打开链                                                        | 休眠，不计为现有可达页面；当前文件入口走 T09 RelatedFilesDrawer                                        |
| T11 | 业务参考号编辑、标签与字段、滚动主体、固定操作区、取消/保存                                                                 | 实现完成；保存/取消待隔离环境验收                                                                      |
| T12 | 旧 document-editor-dialog：只被隐藏的旧文档抽屉按钮调用                                                                     | 休眠，不计为现有可达弹窗；真实上传/分类/权限流程在 T09                                                 |
| T13 | PDF/图片/文本/Markdown/Word/表格预览及原降级；下载、失败、不支持格式、长文件名                                              | 实现完成；各真实格式与降级待验收                                                                       |
| T14 | 公告标题/内容/图片、滚动主体、固定确认区、原已读行为                                                                        | 实现完成；真实公告待验收                                                                               |
| T15 | 代理更新任务实际成功/失败/待处理计数、当前项、真实进度、完成/中断、关闭禁用                                                 | 实现完成；真实任务动态状态待隔离环境验收                                                               |
| T16 | CMA 配置按原 canManageFileVisibility 权限展示整个面板；匿名/客户不展示维护细节                                              | 原角色权限单测通过；浏览器角色切换待验收                                                               |
| T17 | 等待/错误/空态、原生 dialog 确认、对象与影响范围、取消门控、嵌套 Escape、reduced motion                                     | 实现完成；动态进入/退出、焦点与慢请求待验收                                                            |
| T18 | embed=1 隐藏重复壳、单号深链、returnTo、本地返回和窄屏表内滚动                                                              | 原契约测试通过；真实嵌入/深链/返回待验收                                                               |

## 字体与交互契约

- 共享字体由 A 包唯一源生成；引入 `fonts/brand-fonts.css`，仅 preload Latin Inter，不预加载整套 CJK。
- 消费共享 `--radius-control: 6px`、`--radius-card: 10px`、`--radius-dialog: 12px`。正文/表单 15px，表格 14px，说明最低 12px；三份追踪 CSS 没有小于 12px 的字号声明。
- 原 DOM id、data-*、表单 name 和业务事件保留。桌面源 select 退出 AX/Tab，增强控件负责交互；coarse pointer 恢复源 select 语义与 Tab 序。
- 选择弹层具有 Arrow/Home/End/Enter/Space/Escape/Tab/typeahead；只在提交新选项时向原 select 发送一次 input/change。关闭立即 hidden、aria-hidden、inert。
- 结果只对摘要做一次短入场，不对长表逐行 stagger。drawer/modal 与原生 top-layer 生命周期配合；reduced motion 不使用全局 0.01ms 破坏关闭生命周期。
- 5 处浏览器 confirm 换为真实 dialog；取消/Escape 返回 false，默认聚焦取消。文档编辑的 2 处 alert 改为就地可读错误。

## Astra P2 修正

1. 菜单键盘开启后，**同步解除 inert 再 focus**，不等待 MutationObserver。打开态 visibility 使用 0s 立即切换，关闭才延迟隐藏；结算样式后聚焦，必要时下一帧补偿一次，且只在菜单仍打开、焦点仍在触发器时执行。关闭或已移焦不会被补偿抢焦。文件抽屉重开也在原 requestAnimationFrame 中同步解除 inert 后聚焦。
2. 全部刷新在加载前固定 session；每个分页返回、确认返回、每条任务执行前及刷新响应返回后重新比较身份指纹。任务沿用发起 token，身份变化中断并复位 busy/mode；不把旧 entries 与新身份 token 组合。
3. 文件删除确认后的 session/票单上下文复核保留；取消或删除失败不会继续移除文档本地 metadata。

## 静态资源缓存交付

- `lib/static-assets.mjs` 原缓存模式会把带连字符的普通长资源名当内容 hash。现在只认可 8–64 位十六进制摘要后缀；普通 CSS/JS/MJS/字体源使用 `no-cache, must-revalidate`。
- index 的 CSS/app 入口及 presentation import 使用稳定版本 `maritime-v2-20261028-r3`，绕过已存在的旧 immutable 缓存。
- index 后置同源 versioned brand-tokens link 用于替换浏览器可能保留的旧 tokens；保留 design-system.css 的首行共享 import，不编辑生成副本。
- 缓存策略属于 Node 模块；已运行服务需重启后加载新策略。版本 URL 可在重启前绕过旧资源 URL。

## 验证证据与边界

- 首轮 V2：完整追踪测试 **249/249**。之后针对 P2 与缓存修正运行相关四组测试 **58/58**，涵盖原公开 UI/安全/静态模块契约、增强控件、确认与身份中断、实际静态 HTTP/ETag 304 缓存响应。随后针对浏览器首次菜单可见性时序的修正，相关控件与缓存测试 **17/17** 通过；root 随后已在真实浏览器确认 r3 首次 ArrowDown 直接聚焦“返回平台首页”。
- 新增回归覆盖：菜单首次键盘聚焦、抽屉二次开启、刷新取消/正常/加载中换身份/确认中换身份/逐项期间换身份，以及普通资源与摘要资源缓存分类。
- 临时 jsdom 行为检查通过：取消不改值、一次 input/change、隐藏/禁用选项跳过、typeahead、程序同步、触屏恢复、modal 边界、drawer 焦点循环/返回、确认取消/继续/并发和唯一 ARIA id。该检查不作为浏览器视觉或原生 inert 的最终证据。
- JS 语法、Prettier、diff 检查通过；静态 HTML 契约比较无删除 id、无删除 data-*、无重复 id。
- 当前包没有为未经浏览器验证的状态宣称通过。root 的后续桌面/375px、英文、200% 缩放、键盘、reduced-motion、角色与动态录屏证据应逐项补入本清单。

## root 回传的真实浏览器证据

- 版本 `maritime-v2-20261028-r3`：账户菜单首次按 ArrowDown，activeElement 直接落到“返回平台首页”，不再需要第二次按键；Escape 返回触发按钮已实测。
- 附件抽屉第二次打开：焦点落到 `related-files-drawer`；关闭后返回原文件按钮，已实测。
- 手机宽度 390px：附件抽屉与视口等宽，没有横向溢出，已实测。此证据不代替 375px、200% 缩放或其它弹层的验收。

以上为 root 实测回传；本包没有补造其它角色、真实上传/删除、批量执行或船司查询的浏览器证据。最终完整追踪测试由 root 统一执行。

## 批量入口与休眠 DOM 审计（最终决策）

- 原独立追踪批量 dialog 的 chooser 位于关闭的 dialog 内，打开函数又只在解析后预览调用，形成不可达环；进一步审计发现该旧流程缺少现行客户归属、发布选择与导入冲突确认，不能只补一个 customerId 后恢复。
- 最终正式入口是标题区 `batch-workspace-trigger`，文案“前往工作台批量追踪 / Batch tracking in workbench”，真实同源链接 `/customers/shipments`。仅带会话的 ADMIN/BUSINESS 展示；沿原平台等待/跳转机制进入 Vue，再使用 Vue 票单页已有“批量追踪”操作。
- 不携带 token、文件内容或伪造 query 自动提交。既有批量 API 仍活跃，业务能力统一由成熟 Vue 流程承载，不宣称后端 API 废弃。
- 旧 tracking 批量 dialog 保留 DOM、旧 API/解析契约与样式，但没有正式可见打开入口，列为休眠，不用 devtools 打开来计算验收覆盖。
- 初始化不再自动恢复/重新提交旧 tracking 本地队列。保留旧记录，管理账号看到明确提示：不会自动继续或迁移，需到工作台重新选择文件。Vue 与旧 tracking 使用不同本地存储，不宣称能在 Vue 恢复旧 task。
- `renderDocumentDrawer(snapshot)` 仍生成隐藏文档 DOM，但源码没有 `documentDrawerLayer.hidden=false` 或 `.classList.add("is-open")`。`openDocumentEditor` 仅由这组隐藏 DOM 的按钮调用，因此 T10/T12 为休眠实现，不把仅存在 DOM/样式当作实际页面覆盖。
- `open-document-drawer` 的兼容绑定指向 `openRelatedFilesDrawer`；真实附件、讨论、上传、可见范围与文件预览按 T09/T13 验收，本轮不恢复旧元数据抽屉来增加覆盖数。
- 最终完整追踪测试 **264/264** 通过，新增真实导航/权限、旧队列不自动执行、休眠链识别等回归。JS 语法、Prettier、diff 检查通过。Docker 服务仍需 B 按本轮源码重建后做真实浏览器导航验收。
