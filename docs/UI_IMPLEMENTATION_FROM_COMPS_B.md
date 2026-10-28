# 整页设计图落地记录：B 包（第3轮）

目标图已逐张查看：`05-admin-overview-ui.png`、`07-planner-results-ui.png`、`08-workbench-ui.png`，位于 `output/ui-full-design-20261028/`。本轮按 `UI_IMPLEMENTATION_FROM_COMPS.md` 改实际组件结构，不以整页图片替代运行界面。

| 图/路由               | 实际落地                                                                                                                                                                                                                                                                                                                                          |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 08 `/workbenches`     | 260px侧栏/64px顶栏；四个可用入口改为2×2横卡，左序号/标题/短说明/功能标签/橙CTA，右40%原生SVG插图；图形随hover轻移、航线路径流动；公告46px紧凑条只显示真实公告计数；补已有权限范围内的客户目录、票单、箱型、算法快捷入口。保留资料/改密/公告/退出和原入口权限、独立订舱说明边界。                                                                  |
| 07 `/planner/results` | 240px侧栏/56px顶栏；五组真实汇总横带；原七项校验和运价保留为可展开详情；左工具栏+370px真实WebGL/2D画布+导出，右货物图例/真实重心示意及数值；剩余空间/箱体统计收进按需展开区；底部真实候选比较表可切换方案；进度折成48px状态带，计算时自动展开原完整进度与日志。默认显示货物，剩余空间由真实开关开启。当前状态跟随所选候选，单位与字段来自原模型。 |
| 05 `/admin` 总览      | 四主KPI保留真实指标，第五“今日活动”移到标题meta；趋势60%/构成40%，次行账号状态横条45%/操作分布55%；底部复用当前审计API数据前5条和查看全部。趋势继续使用原业务/管理双序列、双轴，不构造合计柱；状态/分布方向调整保留原计数和未知状态。                                                                                                             |
| 后台其余9页           | 同一244px侧栏/56px顶栏、页面标题与刷新动作、图标导航、独立可折叠分组、真实角色；手机所有导航仍可横滚访问；共享表格50px行、14px正文和既有表单/弹窗。没有改权限、API或业务厂函数。                                                                                                                                                                  |

新增共享展示组件：`WorkbenchEntryCard.vue`、`WorkbenchIllustration.vue`。原接口、业务参数、Three、Worker、导出、分箱、tooltip、图例隐藏、重心与剩余空间交互保持。

共享唯一token源 `design-system/logisticspluscn-maritime/tokens.css`：card6、control6、overlay12、H1 32、section20、body14、caption12、KPI30，motion180/240/320。通过原同步脚本生成两端 `brand-tokens.css`；未复制一份手工配色。图表字体读取统一字体栈；reduce-motion关闭图表绘制动画，位移动效降为短淡入淡出。

验证：

- 最终frontend功能测试664/664通过（含C包新增回归），日志 `.tmp/ui-comp-b-features-final.log`。图表改向后仅更新相应轴断言，双轴、不可变输入、未知状态和空数据约束保留。
- 完整 `typecheck`、前端 `build` 通过；日志 `.tmp/ui-comp-b-typecheck.log`、`ui-comp-b-build.log`。收尾再次构建见 `ui-comp-b-build-final.log`，直接Vue类型检查见 `ui-comp-b-vue-types-final.log`。
- App和ContainerScene相对HEAD的AST事件/双向绑定对比：96/96、35/35，无缺失。记录 `.tmp/ui-comp-b-binding-preservation.json`。
- token同步检查、i18n扫描和相关ESLint通过；没有扩大硬编码baseline。相关12项回归再次通过。

本轮没有重建Docker。实际1440×1000/390×844浏览器截图与逐页视觉验收由主任务在全包冻结后继续，不能用自动检查代替已完成的视觉验收。

## P2：最近审计与分页列表隔离

总览近期审计现由 `useAdminConsole.loadRecentAudit` 独立缓存和读取，固定调用已有审计API的 `page: 0, size: 5`。完整审计列表的 `apiAuditPage`、pageSize、total和rows保持独立，不再用用户当前分页的数据冒充最新记录。总览返回和整页刷新均加载此缓存；独立请求版本和现有会话guard拦截旧请求。卡片明确区分加载、失败（含局部重试）和成功后无记录。

新增5项有意义回归覆盖分页隔离/刷新、失败重试、身份切换、退出后晚响应、并发请求替换；全量669/669通过。直接tsc/vue-tsc、build、i18n扫描、ESLint通过，未运行会刷新Vite配置的故障注入脚本。Astra完成源码复审并确认未发现后续问题。

另对真实 `cargo_preview` 旧审计API运行读取：审计列表保留第3页20条请求，总览另取第一页5条。第3页首条时间2026-09-14，最近首条2026-10-28，页码和原列表rows保持不变。证据 `.tmp/dev-preview/audit-page-regression.json`，未调用船司。

此次只正常重建并替换frontend、刷新gateway代理，tracking/backend/MySQL均未重启。308前端文件及8项HTTP摘要匹配；tracking132文件仍匹配。证据 `.tmp/dev-preview/audit-runtime-verification.json` 和 `audit-final-status.log`。检查日志 `.tmp/ui-comp-b-audit-{tests,features,build,eslint}.log`。
