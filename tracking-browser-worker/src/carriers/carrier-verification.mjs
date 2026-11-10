import {visibleFrameDocuments, humanVerificationError} from './cma-human-verification.mjs';

async function visibleCheckbox(frame) {
  return frame.locator('input[type="checkbox"], [role="checkbox"]').first().isVisible().catch(() => false);
}

export async function checkHapagVerification(page, {final = false} = {}) {
  const documents = await visibleFrameDocuments(page);
  const text = documents.map(document => document.text).join('\n');
  // The security page's generic FAQ mentions solving a CAPTCHA even while
  // Cloudflare is only performing an automatic check. That FAQ is not a widget.
  const explicitPrompt = /verify (?:that )?you are human|please complete the captcha/i;
  for (const document of documents) {
    const cloudflare = /^https:\/\/challenges\.cloudflare\.com\//i.test(document.url);
    if (explicitPrompt.test(document.text) || (cloudflare &&
        (/please continue solving the captcha/i.test(document.text) || await visibleCheckbox(document.frame)))) {
      throw humanVerificationError('Hapag-Lloyd 官网要求人工验证，请在同一个 Chrome 会话完成验证后重试。', text);
    }
  }
  const pending = (/Security Check/i.test(text) && /Managed Challenge|security service|Captcha/i.test(text)) ||
    /\bchecking your browser\b/i.test(text);
  if (pending && final) {
    throw humanVerificationError('Hapag-Lloyd 官网安全检查未在等待时间内完成，请在同一个 Chrome 会话查看验证后重试。', text);
  }
  return {pending, text};
}

export async function checkWanHaiVerification(page) {
  const documents = await visibleFrameDocuments(page);
  const text = documents.map(document => document.text).join('\n');
  for (const document of documents) {
    const verificationFrame = /_Incapsula_Resource|hcaptcha\.com/i.test(document.url);
    if (/Additional security check is required/i.test(document.text.replace(/\s+/g, ' ')) ||
        (verificationFrame && (/我是真实访客/u.test(document.text) || await visibleCheckbox(document.frame)))) {
      throw humanVerificationError('万海官网要求安全验证，请在同一个 Chrome 会话完成验证后重试。', text);
    }
  }
  return {pending: false, text};
}
