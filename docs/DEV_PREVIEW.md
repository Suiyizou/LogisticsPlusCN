# 用户 SQL 的隔离 Docker 预览

本环境运行当前工作区的真实前端、Java 后端、MySQL 和独立追踪服务。它使用用户提供的 `C:/Users/ASUS/Desktop/cargo_planner.sql`，没有用页面 mock 替换数据库。默认 Compose 安装和已有 E2E 环境保持原样。

## 入口和命令

| 用途            | 本机入口                                |
| --------------- | --------------------------------------- |
| 完整网站/工作台 | http://127.0.0.1:18088/                 |
| 独立追踪前端    | http://127.0.0.1:18088/tracking/        |
| 后端健康检查    | http://127.0.0.1:18089/actuator/health  |
| MySQL           | 127.0.0.1:13316，schema `cargo_preview` |

在项目根目录执行：

```powershell
# 首次构建、导入和启动；后续启动不会覆盖已有预览库
powershell -ExecutionPolicy Bypass -File scripts/start-dev-preview.ps1

# 已有镜像时快速重启，仍会校验数据库迁移
powershell -ExecutionPolicy Bypass -File scripts/start-dev-preview.ps1 -NoBuild

# 真实容器状态、HTTP 状态和数据计数
powershell -ExecutionPolicy Bypass -File scripts/status-dev-preview.ps1

# 停止本预览，保留其数据库和上传卷
node scripts/dev-preview.mjs stop
```

也可直接使用 `node scripts/dev-preview.mjs start|status|stop`。指定其他 SQL 路径用 `--sql=C:/path/file.sql`；若当前预览已经导入不同哈希的 SQL，脚本拒绝覆盖。首次需要 Docker Desktop/Compose、Node.js，以及构建依赖的网络访问。Compose 使用现有 `docker/backend.Dockerfile`、`docker/frontend.Dockerfile` 和 `tracking-service/Dockerfile` 从源码构建。

## 数据和账号

SQL 原文件不修改。首次导入新 schema 后，脚本调用项目 `DatabaseMigrationCli`：检查 schema 指纹、校验备份、显式接管 legacy baseline 0，再迁移并校验到 v5。没有关闭 Flyway 规避兼容检查。

员工账号继续使用 SQL 内现有账号和密码。未创建或重置管理员；管理员 bootstrap 为 false。不要把应用登录密码写进本脚本、Compose 或说明。MySQL/内部适配器的预览随机凭据由脚本生成到被 Git 忽略的 `.tmp/dev-preview/preview.env`，与员工登录凭据无关。

SQL 中的附件路径只有元数据，原上传文件、公告图片、加密密钥文件未随 SQL 提供。原文件预览/下载和凭据解密可能因此不可用，应按实际错误展示；不能把新生成的文件冒充原附件。备份中的 `secrets.tgz` 和 `workspace-files.tgz` 仅对应新预览的空卷，不代表已找回原生产文件。

## 隔离范围

- 项目名为 `cargo-ui-preview`；容器、镜像、网络和数据卷均使用该独立前缀。
- 覆盖文件 `docker-compose.dev-preview.yml` 替换原 compose 的固定名称、共享外部 MySQL 卷和原上传目录。新卷为 `cargo-ui-preview-mysql-data`、`workspace-files`、`shipment-files`、`backend-secrets`（后面三者也带完整项目前缀）。
- backend、tracking、mysql 只连接 `internal: true` 网络，不能向船司、模型提供方或生产数据库发起连接。
- 唯一连接普通 bridge 的网关只向三个固定容器地址转发 TCP。发布端口全部绑定 `127.0.0.1`。前后端代理和容器间实际数据读取仍工作。
- 自动刷新和补充重试均 false；追踪健康监视器 false；MySQL event scheduler OFF。文件自动清理延迟十年，避免验收时清理历史元数据。点击真实上游查询不会伪造成功结果，隔离环境会返回连接失败/不可用。
- 脚本不提供删除卷或重置数据操作。`stop` 仅停止该项目的容器。

## 2026-10-28 运行记录

源 SQL：3,273,250 字节；SHA-256 `73aabf602eb041fdeb0c5eb7f1e3b254973e59dde929bff72a18047749d3e6a0`。

首次在独立库导入成功，原34表集合与 legacy 接管协议一致，随后成功应用 V1–V5 并通过 Flyway 校验。五个容器正在运行；Java/MySQL/tracking 健康检查通过，三个 HTTP 入口均返回200。重复执行 `start --no-build` 通过，没有重复导入或清空数据。

| 数据         | 导入后计数 |
| ------------ | ---------: |
| 员工         |          5 |
| 客户         |          9 |
| 票单         |         53 |
| 追踪快照     |        113 |
| 刷新任务     |         48 |
| 文件元数据   |          8 |
| 公告         |          1 |
| 客户交接申请 |          0 |

对5个员工逐项比较原 SQL 与迁移后数据库的 salt/hash/iterations，全部保持一致；记录只保存布尔结论，不输出密码字段。浏览器登录和逐页面验收由主任务继续执行，不把 HTTP200 当作已登录验收。

运行日志/状态均在 `.tmp/dev-preview/`：`state.json`、`build.log`、`import.log`、`schema-before.log`、`adopt.log`、`migrate.log`、`validate.log`、`restart-check.log`、`credential-preservation.json`。备份位于其 `backup/` 子目录。

## 本地验收夹具（与原 SQL 数据分开）

```powershell
# 仅允许已核验的 cargo-ui-preview 项目、cargo_preview schema、指定 loopback 端口。
# 可重复执行；正常 API 创建账号/票单/授权/附件，不覆写原记录。
node scripts/seed-dev-preview.mjs
```

脚本会核对 MySQL/backend/gateway 的 Compose 项目标签、service 标签、schema、loopback 端口、internal 网络、关闭的刷新开关和已迁移状态。仅独立 `ui-preview-admin` 使用与项目一致的 PBKDF2-HMAC-SHA256（120000轮）受控初始化，之后全部走真实登录/业务 API。没有修改正常创建接口，也没有绕过单 BUSINESS 领域约束。

| 角色/账号                   | 入口和数据来源                                                                          |
| --------------------------- | --------------------------------------------------------------------------------------- |
| 原 SQL 管理员               | 18088，继续原账号/原密码，查看原 SQL 历史和明确标记的新增样本                           |
| `ui-preview-admin`          | 18088，新建的本地验收管理账号，仅供夹具操作                                             |
| `ui-preview-internal-agent` | 18088，内部员工 OVERSEA_AGENT，新建样本客户和样票的明确授权关系                         |
| `ui-preview-shipper`        | 18088，CUSTOMER + SHIPPER，仅已发布的本地样票                                           |
| `ui-preview-legacy-agent`   | 18088，CUSTOMER + OVERSEA_AGENT，“ui-preview 本地兼容验收样本”，仅关联的新样本客户/样票 |
| `e2e-owner`                 | **51221**，现有独立 E2E BUSINESS 标准夹具；不是18088原 SQL 业务历史                     |

本地凭据：`.tmp/dev-preview/fixture-accounts.json`；账号、票单、附件公共 ID 和验证事实：`.tmp/dev-preview/fixture-manifest.json`。该凭据文件包含独立样本密码和 E2E 示例凭据，不包含用户原管理员密码，也不纳入版本控制。客户账号使用其账号、密码和客户码登录；内部海外代理使用员工入口。

主预览新建样票为 `UI-PREVIEW-BOOKING-001`，公共 ID `2a615dea-c07d-49ec-9ec9-be2b03267c08`。主预览管理端可从 `/customers/shipments/2a615dea-c07d-49ec-9ec9-be2b03267c08` 查看；客户登录后在授权票单中查看。它是手动本地验收样本，说明和事件均明确标记，未发送船司请求。

新样本附件为 `ui-preview-sample.pdf` 和 `ui-preview-notes.txt`。PDF包含一页静态文字，无脚本、外部链接、嵌入文件或个人数据，已通过结构和渲染检查。附件通过正常 multipart API 存入新文件卷，并显式授权 SHIPPER/OVERSEA_AGENT；原8条附件元数据和缺失二进制保持原样。

- PDF员工预览 API：`http://127.0.0.1:18088/api/shipment-files/e312ebca-b6c9-4a37-b860-a64e56db5a00/preview`
- 文本员工预览 API：`http://127.0.0.1:18088/api/shipment-files/8c30de4c-9b57-4f40-b83c-cc75a2a1ec6d/preview`

这些 API 要求已认证的授权请求头，由网站文件预览界面发起；URL 不携带凭据。客户使用对应 `/api/customer/shipment-files/{id}/preview`，由当前客户会话请求。

三个新业务角色均已通过实际 API 登录、授权列表仅1票和真实PDF预览验证。脚本重复运行通过，没有重复账号、票单或文件。夹具后主库共7员工、11客户、54票单、114快照、48刷新任务；新增2个安全附件。原5名员工密码字段再次逐项验证不变；有效BUSINESS仍1个，交接申请保留真实0条，用于验收空态和操作弹窗。

## 追踪静态更新记录

2026-10-28 C包最后修正后，常规追踪镜像构建两次遭遇 MCR Playwright 基镜像 TLS 握手超时。未改运行中的依赖；改用已成功构建的本地预览镜像，离线复制本次冻结的三个静态文件：

```powershell
docker build --pull=false --network=none -t cargo-ui-preview-tracking:local -f docker/dev-preview/tracking-static-update.Dockerfile tracking-service
docker compose --project-name cargo-ui-preview --env-file .tmp/dev-preview/preview.env -f docker-compose.yml -f docker-compose.dev-preview.yml up -d --no-deps tracking
docker compose --project-name cargo-ui-preview --env-file .tmp/dev-preview/preview.env -f docker-compose.yml -f docker-compose.dev-preview.yml restart frontend gateway
```

此离线方式只适用于 `public/app.js`、`public/index.html`、`public/tracking-refinement.css` 的静态修订；服务代码或依赖变化仍需正常完整构建。未重建 Java/MySQL、未重导 SQL，前端镜像未变；代理重启以刷新追踪容器地址。

18088返回的上述三个文件与冻结源码逐字节相同，均HTTP200；HTML为 `no-cache, no-store, must-revalidate`，JS/CSS为 `no-cache, must-revalidate`。记录见 `.tmp/dev-preview/tracking-static-verification.json` 和 `post-tracking-status.log`。

## 第3轮整页代码的最终 Docker 更新

全 A/B/C 源码冻结后，2026-10-28 已重新编译本机 frontend dist，并正常完成 `frontend` 与 `tracking` 两个 Docker 源码镜像构建。本次 MCR 基镜像解析成功，**未使用前一节的三文件离线更新方式**。追踪镜像带完整当前 public 目录，包括 `tracking-composition.css`、`tracking-presentation.mjs`、生成的品牌 tokens、字体和全部资源。

本次部署命令：

```powershell
npm --prefix frontend run build
docker compose --project-name cargo-ui-preview --env-file .tmp/dev-preview/preview.env -f docker-compose.yml -f docker-compose.dev-preview.yml build frontend tracking
docker compose --project-name cargo-ui-preview --env-file .tmp/dev-preview/preview.env -f docker-compose.yml -f docker-compose.dev-preview.yml up -d --no-deps --no-build --wait tracking
docker compose --project-name cargo-ui-preview --env-file .tmp/dev-preview/preview.env -f docker-compose.yml -f docker-compose.dev-preview.yml up -d --no-deps --no-build --wait frontend
docker compose --project-name cargo-ui-preview --env-file .tmp/dev-preview/preview.env -f docker-compose.yml -f docker-compose.dev-preview.yml restart gateway
node scripts/dev-preview.mjs status
node scripts/verify-dev-preview-runtime.mjs
```

只替换两个展示服务并刷新网关代理。数据库/后端容器 ID 和启动时间均未改变，没有重新导入 SQL、执行夹具或重置账号。部署前后业务计数一致：7 员工、11 客户、54 票单、114 快照、48 刷新任务、10 个附件；本地夹具凭据文件摘要也未变化。

只读核验覆盖：

- frontend 容器内308个源产物文件与本机最终 dist 全部匹配。
- tracking 容器内132个 public 源文件全部匹配。
- 8项经18088实际HTTP返回的入口、bundle、追踪JS/CSS/presentation/tokens字节摘要匹配。
- MySQL、backend、tracking 均healthy；前端和网关running；网站、后端健康、追踪健康HTTP200。

可直接在 `http://127.0.0.1:18088/` 检查新的工作台、后台总览、装箱结果及其余页面。BUSINESS标准E2E角色仍属51221独立环境，未并入SQL预览。

日志：`.tmp/dev-preview/comps-final-local-build.log`、`comps-normal-build.log`、`comps-final-status.log`、`comps-runtime-before.json`、`comps-runtime-verification.json`。`verify-dev-preview-runtime.mjs` 需要对应部署前基准文件，读取时会复核Compose项目、健康状态、DB/backend容器身份、数据计数和凭据摘要，不会写业务数据。

最近审计P2修复后又进行一次仅frontend的正常源码构建和替换。`tracking`、backend、MySQL容器ID及启动时间均未改变。源产物/HTTP校验和现有业务计数、夹具凭据摘要保持一致，见 `.tmp/dev-preview/audit-runtime-verification.json`。复核命令：

```powershell
node scripts/verify-dev-preview-runtime.mjs --frontend-only --baseline=audit-runtime-before.json --output=audit-runtime-verification.json
```

总览最近审计固定请求已有API第一页5条；不重置完整审计页的当前页码。真实SQL分页隔离证据见 `audit-page-regression.json`；浏览器可刷新18088后台总览继续验收。

## 本地 PDF 阅读器与几何小修的统一更新

本轮正常重建并替换 `frontend`、`tracking`，包含工作台卡片密度、客户表格与追踪文件布局修订，以及固定版本 PDF.js 本地 canvas 阅读器。MCR 与 npm 正常完成，未使用静态覆盖回退。Nginx 在 HTTP 层补充 `.mjs` 的 JavaScript MIME 映射，与原 MIME 表合并；JS、CSS、字体和模块 worker 的实际 Content-Type 及 nosniff 均已校验，CSP 未改变。

通过正常上传 API 新增两份明确标记的本地 PDF 验收附件；第二份 `ui-preview-chinese-embedded.pdf` 内嵌中文字体子集，包含中文文本与扫描图两页。旧文件没有被替换。样本详情、生命周期与回归说明见 [PDF_LOCAL_PREVIEW.md](PDF_LOCAL_PREVIEW.md)，追踪端说明见 [TRACKING_PDF_PREVIEW_20261028.md](TRACKING_PDF_PREVIEW_20261028.md)。

部署前后的计数为 7 员工、11 客户、54 票单、114 快照、48 刷新任务、12 附件；DB/backend 的容器 ID、启动时间及夹具凭据文件摘要保持一致。514 个前端源产物和134个追踪 public 文件逐字节匹配运行容器，16项 HTTP 校验通过（包含 lazy worker、本地 CMap、字体、JS/CSS MIME 与 nosniff）。前端额外的 `50x.html` 是基础 Nginx 镜像自带文件。所有服务状态正常，MySQL/backend/tracking 健康。

```powershell
node scripts/verify-dev-preview-runtime.mjs --baseline=pdf-runtime-before.json --output=pdf-runtime-verification.json
```

日志为 `.tmp/dev-preview/pdf-normal-build.log`、`pdf-nginx-build.log`、`pdf-deploy-*.log`、`pdf-final-status.log` 和 `pdf-runtime-verification.json`。本机前端678项回归、直接 TypeScript/Vue 类型检查、构建、定向 ESLint/格式检查通过；追踪端288项回归通过。中文及扫描样本已由 PDFium 和真实 PDF.js 原生画布绘制检查，浏览器当前 CSP、多页交互、手机溢出和焦点归还由根任务继续实际验收。

## 2026-10-29 最终复审修复部署

前端和追踪端再次正常源码构建并部署，随后管理员刷新反馈做了一次仅前端的正常构建更新。本轮未重建、替换或重启 DB/backend，也未重导 SQL、重置账号或改动原文件。SQL预览的既有计数仍为7员工、11客户、54票单、114快照、48刷新任务、12附件。根任务通过正常页面另为本地样本票单新增了一条明确标记的验收留言；该操作不属于镜像部署或历史数据修改。

部署包含：

- G07 场景重心卡移除旧绝对定位类，保持在同一场景行；移除760px旧最小高度和步骤额外留白，右栏详情默认收起、展开时在栏内滚动，对比表保留内部滚动。
- 汇总指标和管理员刷新反馈排除旧 DOM 翻译缓存，保留真实计算字段及真实 busy/disabled 状态。PDF 工具栏修正重复命名空间。
- PDF 保留盖章、批注和已填字段的绘制外观；翻页期间适宽保留目标页；仅宽度变化安排重绘并固定滚条槽，避免高度反馈循环。盖章及填写文字由真实画布像素回归确认，禁用外观的负对照为空白。
- 管理员10个页签使用页面现有的中英标题；共用手机壳限制网格、侧栏、主区和导航的最小宽度，导航单独横滚。页面宽度与最终截图仍由根任务实测记录。
- 既有 G08 密度、客户表格/追踪文件布局及最新局部业务说明样式均保留。

最终前端685项回归通过；完整 `npm run typecheck`（包含SFC、94项端口错误契约、8项API错误用例）、最后模板的直接 Vue 类型检查、品牌 tokens 同步、设计检查、构建及定向 ESLint/格式检查通过。追踪端289项回归通过。

运行资源核验为515个前端源产物、134个追踪 public 文件全部匹配，16项HTTP字节/MIME/nosniff检查通过，`nginx -t`及服务健康通过。DB/backend容器ID和启动时间、所列业务计数、本地夹具凭据摘要不变。最后一次只更新前端，tracking容器身份及启动时间也保持不变。

```powershell
node scripts/verify-dev-preview-runtime.mjs --frontend-only --baseline=admin-refresh-runtime-before.json --output=admin-refresh-runtime-verification.json
```

最终日志：`.tmp/ui-g07-final-features.log`、`ui-g07-final-typecheck.log`、`ui-g07-final-vue-tsc.log`、`ui-g07-final-tokens.log`、`ui-g07-final-design.log`、`ui-g07-final-build.log`、`ui-pdf-p2-tests.log`；Docker与运行校验日志位于 `.tmp/dev-preview/g07-*` 和 `admin-refresh-*`。
