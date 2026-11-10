// Report the carrier's actual refusal before waiting for a form that is absent.
// This does not retry, change browser identity, or treat the refusal as a result.
export async function assertCarrierAccess(page, response, carrier) {
  const status = response?.status?.();
  const text = await page.locator('body').innerText({timeout: 3000}).catch(() => '');
  const compact = text.trim().replace(/\s+/g, ' ');
  const forbidden = status === 403 || /^403 Forbidden(?: nginx(?:\/[\d.]+)?)?$/i.test(compact);
  const hmmLimited = carrier === 'HMM' &&
    /Your access to this site has been limited due to abnormal connection\./i.test(text);
  if (!forbidden && !hmmLimited) return;

  const name = carrier === 'MATSON' ? 'Matson' : carrier;
  const reason = hmmLimited ? '官网因异常连接限制访问' : '官网拒绝访问（403 Forbidden）';
  const reference = hmmLimited
    ? text.match(/(?:Reference|Refernce)\s+Code\s*:\s*([A-Za-z0-9-]{1,80})(?![A-Za-z0-9-])/i)?.[1]
    : null;
  throw Object.assign(new Error(
    `${name} ${reason}${reference ? `，官网参考码：${reference}` : ''}。本次未提交查询，请检查官网提示，必要时联系船公司恢复访问。`,
  ), {code: 'CARRIER_ACCESS_DENIED'});
}
