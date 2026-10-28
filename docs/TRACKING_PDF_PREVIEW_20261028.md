# 独立 tracking 本地 PDF 预览修复

## 实现与边界

- `tracking-service/package.json` 与 lock exact pin `pdfjs-dist@6.4.299`。实际运行容器 Node **v24.17.0** 满足 package engine；本机 v24.9.0 的部分新内建方法缺失，因此客户端与 worker 统一采用同版本 `legacy/build` 兼容入口，不添加 eval 或外部 viewer。
- PDF 使用原先带会话的同源 `/preview` fetch，原404/405到下载回退、401清会话、403与下载动作保留。已取到的Blob转Uint8Array，PDF.js不再接收源文件URL；图片、文本、Markdown、CSV、Word、表格分支保留。
- `pdf-canvas-preview.mjs` 仅构建页码、上一页/下一页、适宽 canvas、加载与明确失败状态。首次绘制promise成功之后才提示就绪。无脚本、注释/链接、附件或表单层；`enableXfa:false`、`useWasm:false`、`stopAtErrors:true`，保留默认FontFace。root显式要求的兼容 `isEvalSupported:false` 字段保留，但v6已移除此API，不把该无效字段当作安全隔离手段。
- 不改CSP。`createStaticRouter` 仅允许版本化 `/vendor/pdfjs/6.4.299/` 的legacy入口/worker、实际cmaps/standard_fonts、必要解码JS fallback/wasm及ICC；禁止其它版本、package.json、源码类型、viewer和QuickJS资源。MJS/WASM MIME正确。全部资源相对import.meta.url解析，支持直连与 `/tracking/` 代理路径。
- 单canvas串行渲染，resize先取消旧render，再等待串行链；保留目标页。DPR≤2、canvas约8MP上限，不使用maxImageSize静默删除原图。
- 最终appearance审查修正为 `annotationMode:1`（PDF.js AnnotationMode.ENABLE）：文件已有盖章、批注及填写字段的静态外观继续画入canvas；不创建交互annotation/form DOM或执行脚本，`enableXfa:false`保持。
- 独立generation与AbortController：新预览、关闭、会话失效及pagehide取消旧请求、render与loadingTask/worker。fetch、blob、arrayBuffer、模块导入、getDocument、getPage、render每次await后核验当前代与dialog仍open。同会话A晚响应不能覆盖B；内部清DOM不递增generation。

## 检查与真实像素证据

- tracking完整测试 **288/288**：包括迟A关闭再B、fetch/blob/arrayBuffer/render各阶段、迟401不清新预览、有效401及logout、worker失败、密码/损坏错误、首次成功时机、页码、resize取消、资源白名单/MIME/CSP回归。
- 原安全断言保留并更新为无PDF iframe、认证fetch与取消契约；没有放宽sandbox或服务端授权。
- 自动真实绘制测试：隔离两页PDF，第一页实际文字提取及黑色字形像素，第二页内嵌RGB图像像素；损坏字节明确失败，不以HTTP200或文案“就绪”代替绘制成功。
- B提供的嵌入中文TTF子集样本 `.tmp/dev-preview/samples/ui-preview-chinese-embedded.pdf`，两页通过PDF.js实际绘制并`view_image`实看。输出 `output/pdfjs-canvas-verification/tracking-chinese-page-1.png` 和 `tracking-chinese-page-2.png`；中文说明完整、扫描图颜色与边框完整。非白像素分别20499、429772。
- 此手动像素验证在Node canvas环境中用同版legacy及 `disableFontFace:true` 路径字形模式（Node无浏览器FontFace）；不把它冒充浏览器CSP/字体路径验收。未嵌入字体的旧CID样本在该Node环境显示方框，不能仅凭中文可提取声称已可读。
- JS语法、Prettier与diff检查通过；未改Vue/B文件或运行配置，未请求真实船司。

## 重建后必须实看

依赖及静态路由发生变更，B必须完整重建tracking服务，不能只走旧static-only增量镜像。root在真实代理路径以原2127byte安全PDF及新中文/扫描两页样本，检查可读canvas、翻页、适宽resize、手机、下载、关闭/回焦和会话失效；保持现CSP默认FontFace路径验收。此文档不将该待验环节标记为通过。

## 2026-10-29 最终appearance修正

root回传浏览器实测：嵌字体中文两页、扫描图、390适宽、关闭回焦与canvas销毁均正常。Astra随后发现mode0会抹去已有静态AP外观，已改mode1，仅静态canvas绘制，原代际/取消/权限保持。真实PDF回归含红色stamp及绿色filled-widget两份已有appearance；mode0对照像素均为0，mode1红色超过8000、绿色超过6000，并验证字段值为FILLED。helper测试同时断言无a/form/input/iframe/object/embed交互树。完整tracking **289/289**，JS语法、Prettier与diff通过；已委托B在两端同修后正常重建。
