// These exact prompts were visible in the saved CMA challenge screenshot.
// Read visible document text only; never interact with the verification widget.
const HUMAN_PROMPT = /我们需要与您确认此网页操作行为确实出自您本人|向右滑动以保护您的访问/u;

async function visibleFrameText(frame) {
  try {
    // A nested frame is visible only when each embedding frame is visible.
    for (let current = frame; current.parentFrame(); current = current.parentFrame()) {
      const element = await current.frameElement();
      try {
        if (!await element.isVisible()) return null;
      } finally {
        await element.dispose();
      }
    }
    const body = frame.locator('body');
    if (!await body.isVisible()) return null;
    return await body.innerText({timeout: 3000});
  } catch {
    // A detached/unreadable frame is not evidence of a human challenge.
    return null;
  }
}

export async function visibleFrameDocuments(page) {
  const documents = [];
  for (const frame of page.frames()) {
    const text = await visibleFrameText(frame);
    if (text !== null) documents.push({frame, text, url: frame.url?.() || ''});
  }
  return documents;
}

export function humanVerificationError(message, text) {
  return Object.assign(new Error(message), {code: 'HUMAN_CAPTCHA', verificationText: text});
}

export async function assertCmaHumanVerification(page) {
  const documents = await visibleFrameDocuments(page);
  const text = documents.map(document => document.text).join('\n');
  if (HUMAN_PROMPT.test(text.replace(/\s+/gu, ''))) {
    throw humanVerificationError('CMA CGM 官网要求本人安全验证，请在同一个 Chrome 会话完成验证后重试。', text);
  }
}
