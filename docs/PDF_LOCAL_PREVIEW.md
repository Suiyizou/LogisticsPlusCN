# 本地 PDF 页面预览

管理员文件预览与追踪文件预览使用固定版本 `pdfjs-dist@6.4.299`，采用该版本的 legacy 入口及配套 worker，以兼容尚无 `Uint8Array.toHex` 的浏览器。这里的 legacy 是同一版本的兼容构建。主线程、worker、CMap、标准字体、ICC 和解码辅助资源均来自本项目，不调用外部阅读服务或 CDN，也不放宽现有 CSP。

Vue 管理员预览读取现有鉴权 API 返回的 Blob。PDF 分支只绘制 canvas，提供上一页、下一页、适宽和原文件下载；图片、文本预览及列表下载保持原协议。下载按钮复用管理员文件列表现有的授权下载流程。

阅读器禁用 XFA，使用 `useWasm:false`、`stopAtErrors:true`；保留默认 FontFace 字体加载。它不创建脚本、表单、附件、链接或 annotation 交互层。绘制采用不超过 2 的设备像素比，并把单页画布限制在 800 万像素以内；源页面图像仍完整参与缩放绘制。

既有盖章、批注和已填写表单的外观通过 `annotationMode:1` 绘入 canvas，仍不创建任何交互表单或批注 DOM。回归使用带红色印章和绿色已填字段外观的惰性 PDF，通过真实 PDF.js 画布像素检查保留外观；禁用批注的负对照相同位置为白色。

关闭、切换文件、切换身份或组件销毁时，立即使旧请求失效，取消正在绘制的任务并销毁该文档独占的 worker。适宽和翻页先等待前一次绘制结束，避免同时写同一个 canvas。弹窗离场过渡期间也观察原始打开状态，不等动画结束才清理。只有第一页绘制成功才显示就绪；损坏、加密或阅读组件失败显示明确错误并保留下载入口。

翻页请求单独保存目标页，加载或绘制第二页时发生适宽仍停在第二页。ResizeObserver 只在可用宽度变化时安排绘制，忽略加载提示引起的高度变化，避免短页反复闪动加载状态；同一帧内的宽度变化合并处理。

前端 `predev` / `prebuild` 从固定依赖复制本地资源到 `frontend/public/pdfjs/6.4.299/`；该目录是忽略的生成产物。正常 Docker 构建通过 `npm ci` 和 `npm run build` 重新生成资源。host Node 24.9.0、Docker Node 22.23.4 已核对满足包要求 `>=22.13.0 || >=24`。

## 可重复检查

```powershell
node --test frontend/test/admin-file-preview.test.mjs frontend/test/pdf-canvas-preview.test.mjs
npm --prefix frontend run test:features
frontend/node_modules/.bin/tsc.cmd -p frontend/tsconfig.json
frontend/node_modules/.bin/vue-tsc.cmd -p frontend/tsconfig.vue.json --noEmit
npm --prefix frontend run build
```

新增回归覆盖多页绘制、适宽与像素限制、关闭 A 后打开 B、迟到的文档/运行时响应、绘制取消、组件加载失败、损坏/加密错误、身份变化清理，以及关闭后禁止下载旧文件。完整日志在 `.tmp/ui-pdf-frontend-*.log`。

## 隔离预览样本

`scripts/dev-preview-pdf-sample.py` 使用系统中文字体子集嵌入 PDF，生成两页惰性样本：第一页中文文本，第二页扫描图像。生成后用 pypdf 检查无表单、注释、打开动作，再用 PDFium 渲染两页 PNG 并查看。

```powershell
node scripts/seed-dev-preview.mjs --pdf-reader-only
```

该命令只允许已验证的 `cargo-ui-preview` 项目、`cargo_preview` schema、回环 18088/18089/13316 端口及禁用调度的环境。它使用现有独立本地夹具管理员，通过正常上传 API 幂等新增 `ui-preview-chinese-embedded.pdf`，不修改原文件或原账号。样本 ID 和授权预览 URL 保存在 `.tmp/dev-preview/fixture-manifest.json` 的 `files.pdfReaderEmbedded`；凭据继续只保存在忽略的本地文件。

当前样本 ID：`430fdf00-d17b-4aee-8923-479be863997c`，所属本地票单 `UI-PREVIEW-BOOKING-001`。管理员文件页和追踪票单文件区均可找到。此样本与用户 SQL 历史附件明确区分；原历史附件缺少二进制的情况不会由样本替代。

本地 PDFium 渲染和鉴权 HTTP 下载检查只证明样本与接口可用；浏览器中实际 canvas、多页切换、手机尺寸、焦点归还及 CSP 验收由根任务另行记录。
