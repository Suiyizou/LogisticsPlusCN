# logisticspluscn 整页 UI 参考图

2026-10-28，内置 image_gen 生成；8 张完整界面，含导航、内容、表单/表格、弹层及页脚。设计决策由 Astra Ultra 审视，实际代码及检查索引由 Sol High 实施。

| 文件 | 整页范围 | 实际入口 |
| --- | --- | --- |
| 01-home-ui.png | 官网首页 | `/` |
| 02-service-detail-ui.png | 装箱服务介绍 | `/services/planning` |
| 03-shipment-list-ui.png | 业务票单列表 | `/customers/shipments` |
| 04-tracking-files-ui.png | 独立追踪结果和关联文件抽屉 | `/tracking/` |
| 05-admin-overview-ui.png | 后台企业总览 | `/admin/overview` |
| 06-login-desktop-mobile-ui.png | 员工/客户登录，桌面和手机 | `/workbenches` 未登录状态 |
| 07-planner-results-ui.png | 三维装箱与方案比较 | `/planner/results` |
| 08-workbench-ui.png | 四个业务工作台入口 | `/workbenches` 已登录状态 |

打开本地 [逐页检查台](http://127.0.0.1:51224/) 可查看图集并打开实际页面。网站主地址为 [Docker SQL 预览](http://127.0.0.1:18088/)。图中导航、示例数据、文字和日期是视觉原型，不是操作截图，也不表示新增财务/订舱后端等功能；实际可用范围以代码和检查台入口为准。界面的正式品牌标记、权限与业务文案仍以实际站点为准。

04 使用本项目本地测试截图作为结构参考，避免将 Vue 客户管理与独立 tracking 的文件抽屉误拼成一个页面；此前混合概念稿已废弃，不计入交付图集。生成来源保留在 `$CODEX_HOME/generated_images/01a181cd-c701-72e1-b91d-eff86ceb2f64/`；本目录保存项目副本。

提示词见 [PROMPTS.md](PROMPTS.md)。页面与弹窗完整清单见 `docs/UI_PAGE_REVIEW_INVENTORY.md`，设计决策与角色边界见 `docs/UI_FULL_PAGE_REVIEW_PLAN.md`。
