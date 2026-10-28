import type { ScreenshotArtifact } from "../browser/browser-session.js";
import type { RunEventSink } from "../run-events.js";

export interface FinalScreenshotBrowser {
  captureFinalScreenshot(): Promise<ScreenshotArtifact>;
}

export async function retainFinalRunScreenshot(
  browser: FinalScreenshotBrowser,
  onEvent: RunEventSink,
  turn = 0,
): Promise<boolean> {
  const startedAt = Date.now();
  const toolCallId = "run-final-screenshot";
  const turnData = turn > 0 ? { turn } : {};
  onEvent({
    type: "TOOL_CALL",
    message: "准备留存浏览器最终页面截图",
    status: "RUNNING",
    outcome: "RUNNING",
    ...turnData,
    decisionSummary: "浏览器执行即将结束；系统自动保存最终可见页面，不依赖模型主动截图。",
    stage: "VISUAL_INSPECTION",
    rationale: "每个真实浏览器 run 都必须保留一张可审计的最终页面截图。",
    action: "截取当前浏览器可见区域；不执行新导航。",
    observation: "最终截图尚未执行。",
    nextStep: "声明受 run 权限保护的截图附件，然后关闭浏览器。",
    toolName: "browser_screenshot",
    toolCallId,
    toolInput: { capture: "最终浏览器可见区域", automatic: true },
  });

  try {
    const shot = await browser.captureFinalScreenshot();
    onEvent({
      type: "TOOL_RESULT",
      message: "浏览器最终页面截图已留存",
      status: "SUCCESS",
      outcome: "SUCCESS",
      ...turnData,
      stage: "VISUAL_INSPECTION",
      rationale: "系统终态截图调用已成功返回。",
      action: "留存浏览器关闭前的最终可见页面。",
      observation: "截图已生成受 run 权限保护的附件引用；未公开路径或图片字节。",
      nextStep: "关闭浏览器并继续输出本次 run 的结构化终态。",
      retry: { willRetry: false, mode: "NONE" },
      toolName: "browser_screenshot",
      toolCallId,
      toolOutput: { success: true, captured: true, automatic: true },
      durationMs: Date.now() - startedAt,
      attachments: [{
        type: "SCREENSHOT",
        artifactId: shot.artifactId,
        label: shot.label,
        mimeType: shot.mimeType,
      }],
    });
    return true;
  } catch {
    // Never replace the actual run outcome with provider/browser exception
    // text. The failed audit capture remains explicit in the public trace.
    onEvent({
      type: "TOOL_RESULT",
      message: "浏览器最终页面截图留存失败",
      status: "SCREENSHOT_CAPTURE_FAILED",
      outcome: "ERROR",
      ...turnData,
      stage: "VISUAL_INSPECTION",
      rationale: "浏览器已无法生成终态截图，原始异常详情不进入公开轨迹。",
      action: "停止截图重试，继续安全关闭浏览器。",
      observation: "本次自动终态截图未生成附件。",
      nextStep: "保留原有 run 终态，并在汇总中明确标记无最终截图。",
      retry: { willRetry: false, mode: "NONE", reason: "终态截图调用失败" },
      toolName: "browser_screenshot",
      toolCallId,
      toolOutput: { success: false, errorCategory: "BROWSER", automatic: true },
      durationMs: Date.now() - startedAt,
    });
    return false;
  }
}
