# V2 公共网站覆盖与冻结记录

A 包已冻结，等待整体验收或后续评审修复。没有提交 commit。

## 最终评审修复：公开路由失败反馈

公开 router 独立维护实际导航的 loading、error 和失败目标，不引入业务 router。首次 isReady 拒绝被明确捕获；运行中 lazy chunk 失败显示现有错误页，不再无提示停留旧页。重试完整重载失败 URL，保留路径、查询参数和锚点，以获取当前部署的资源清单。新导航清除旧错误，过期请求失败不遮挡较新的页面；取消与重复导航不显示资源错误。

新增6项真实 memory-router 回归，覆盖直达失败、运行中失败、重试恢复、过期失败、取消/重复及初始拒绝兜底。此次相关17项与全 features 658项通过，完整 npm build（含 i18n 扫描）通过；所属 JS 的 ESLint、Prettier 与无临时配置文件的定向 strict vue-tsc 通过。定向类型检查包含 PublicEntry、AsyncPageError、项目组件类型声明及其依赖。未在本次修复中重复全量类型门禁，也未声称已完成浏览器断网/旧部署资源注入验收。

最后复审补充：重试对同源目标先 replaceState 保留完整失败地址，再明确 location.reload，避免相同页面带锚点时仅发生锚点导航。新增5项动作回归覆盖同URL含锚点、锚点变化、不同页面、默认重试与拒绝外部目标；最新相关22项及定向静态检查通过。上一轮全套为658项，此次仅跑相关回归，没有重跑新增5项后的全套或生产构建。

## 已实现

- 全宽三列 mega 与右侧定高联动卡、hover/focus、Escape 返回焦点、外点关闭及手机分组。
- 轻量公开路由 /、/services 及12个服务详情：transport、planning、containers、booking、operations、shipments、customers、agents、handover、files、customerportal、administration。每页有针对性结构、步骤及真实入口；独立订舱单独登录，不传递凭据。
- 桌面轻量 combobox（完整键盘、typeahead、ARIA、外点关闭），手机/触屏保留 native select；追踪参数不变。
- 官网排版、滚动与状态动效、认证/等待/错误、44px共享控件及完整 Element Plus popper 皮肤。
- 自托管 Inter/Noto Sans SC、三组WebP品牌图；生成来源在资产README，产品不放水印式交付说明。

## 验证与未验收边界

root已确认：桌面mega结构与字体、右卡焦点切换和跳转、Escape返回；375px下全部12个详情与mega分组；桌面船司选择CMA键盘操作通过。桌面规划详情已作为代表查看。不能据此替代各页面英文、200%缩放、慢网、全部账号及所有非理想态验收。

A相关11项回归、design-system/tokens、字体同步、所属JS/测试ESLint及本人文件Prettier通过。直接Vite生产打包通过。完整npm build当次受B编辑中的新中文扫描限制；全features两项为新增调度预览后旧菜单预期/数组索引；直接vue-tsc当次仅B客户目录row作用域错误。均已通知B，最终以root统一检查为准；A不再独立重复全量门禁。

## 字体同步

唯一源：frontend/public/fonts。追踪端 tracking-service/public/fonts 为生成副本，已同步且--check通过。

```sh
node frontend/scripts/sync-brand-fonts.mjs
node frontend/scripts/sync-brand-fonts.mjs --check
```

保留108个发行Unicode分片、OFL许可证及来源hash；按需加载，只预加载Inter Latin，没有运行时字体CDN。

细项实现与早期检查节点见 [A包详细覆盖](UI_REFINEMENT_V2_COVERAGE_A.md)。既有多船司文档及 output/carrier-tracking* 不计入本轮修改。
