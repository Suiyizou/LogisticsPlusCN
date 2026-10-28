# 本地逐页检查入口

独立于产品的本地 review hub，只绑定 `127.0.0.1`，不会进入生产导航或前端构建。

```powershell
node scripts/dev-review/verify.mjs
node scripts/dev-review/serve.mjs --port 51224
```

打开 <http://127.0.0.1:51224>。默认业务环境为 SQL 隔离预览 `http://127.0.0.1:18088`，另提供现有环境 `http://127.0.0.1:51221` 供对照。可以改为其他 loopback HTTP/HTTPS 地址；服务不会代理 API、读取会话或执行登录。

## 页面与检查项

`catalog.mjs` 直接读取当前启用的 module registry、公开服务目录及管理页面定义，列出真实路径与角色。`checks.mjs` 补充人工操作位置：页内标签、展开区、详情、弹窗、抽屉和旧 query 入口。禁用示例模块只显示说明，不生成可用链接。

`verify.mjs` 用当前真实 router 的 memory history 校验链接、逐个核对启用模块页面及角色，扫描全部 Vue dialog 声明，防止遗漏弹窗来源。它不会访问或修改业务数据。生成完整清单：

```powershell
node scripts/dev-review/snapshot.mjs
```

详情页需要当前账号有权限查看的真实记录。没有 ID 时，一键打开对应列表；来源行按钮/操作位置已在卡片中注明。不打开虚构的 ID、不自动弹窗、不通过测试后门制造任务进度、空态或错误态。

若准备运行的人已通过正常 API 得到真实 ID，可在本目录写 `.local-records.json`。该文件已被本目录 `.gitignore` 排除，不提交，也不保存账号、密码、token 或客户名称。格式如下，值由真实环境提供，留空表示未知：

```json
{
  "baseUrl": "http://127.0.0.1:18088",
  "customerId": "",
  "shipmentId": "",
  "trackingNumber": "",
  "trackingCarrier": "COSCO",
  "trackingType": "BOOKING"
}
```

推荐始终提供 `baseUrl`，避免切换到另一套数据库后复用错误的记录。选择其他环境会清理界面内 ID 并重载匹配的本地记录。ID 只在本页内存使用，不写入浏览器保存的检查结果或导出的 JSON。账号仍必须在真实产品页正常登录，服务端权限保持有效。

检查状态默认为待检查，打开链接不会自动标记已完成。人工分别记录正常态、异常态、缺数据、缺文件、问题或条件不足，并勾选可达、非空正常态、子视图、详情/弹窗、角色、桌面、窄屏及证据。截图/录屏文件名可录入证据字段，随检查JSON导出；保存仅位于本检查站点localStorage，并按业务环境origin隔离，51221的证据不会自动算作18088历史库验收。旧v1记录保留在原存储键中，不自动提升为新矩阵证据。不要在备注中填写敏感账号资料。

`reviewMatrix.mjs`读取Astra的 `docs/UI_FULL_PAGE_REVIEW_PLAN.md`，为每项显示矩阵ID和数据/验收条件。45个主视图、D01–D35条件组、源码modal声明与hub卡片数量是不同维度，不能互相充数；`verify.mjs`检查所有矩阵ID都指向存在的检查记录。

## 整页 UI 参照

根任务生成的整页设计图片放在 `output/ui-full-design-20261028/`，支持 PNG、WebP、JPG。hub 的独立画廊读取此目录，后续新增图片点击“刷新设计图”即可显示；不复制到产品资源，也不将其伪装成可交互业务页。

服务仅提供 hub 自身静态文件、只读目录数据、指定字体目录和指定设计图目录。没有通用文件读取/写入、代理业务请求或提交表单的接口。

## 当前检查边界

- 128 个检查记录，包括入口、子视图、兼容链接、条件态与休眠说明；启用模块路由/角色、12个公开服务详情、4个追踪hash视图均有来源，45主视图与35矩阵条件组全部建立映射。35个Vue dialog声明有来源索引，声明存在不表示用户可达。
- 完成清单校验、JS/格式静态检查及 loopback HTTP 冒烟后，仍需在真实登录环境逐项人工验收。清单覆盖不代表页面已通过视觉验收。
- 追踪端旧批量dialog、旧document drawer/editor经根任务/C/Astra确认均休眠，hub禁用其打开链接，不计可达。正式批量追踪在Vue票单工作台，tracking标题链接仅内部ADMIN/BUSINESS可见并同源前往该页。RelatedFilesDrawer从真实结果“票单文件”打开，文件预览由该抽屉行触发。
- `tracking/#shipments`及其批量更新属于兼容代理客户：CUSTOMER会话且partyRole=OVERSEA_AGENT，与内部OVERSEA_AGENT员工严格区分。角色过滤的CUSTOMER_AGENT是检查身份标签，不修改后端角色或授权。
- 原附件只有元数据没有文件时标缺文件；历史快照优先从列表进入，不因视觉检查自动重刷外部船司。当前8张整页图在独立画廊显示，废弃混合稿不列入。
- 系统保留操作、调度预览、超时/一次性密码结果等均按实际状态注明条件，不冒充已实现的新业务。
