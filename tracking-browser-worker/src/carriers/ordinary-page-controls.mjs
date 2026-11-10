// Ordinary cookie dialogs only. These helpers do not interact with site security challenges.
async function optionalVisible(control) {
  try {
    await control.waitFor({state: 'visible', timeout: 2000});
    return true;
  } catch (error) {
    if (error.name === 'TimeoutError') return false;
    throw error;
  }
}

export async function dismissMscCookieNotice(page) {
  // The current translated MSC banner has this stable ordinary OneTrust ID.
  const reject=page.locator('#onetrust-reject-all-handler');
  if(!await optionalVisible(reject))return;
  await reject.click({timeout:5000});
  await reject.waitFor({state:'hidden',timeout:5000});
}

export async function dismissOoclCookieNotice(page) {
  const preference = page.locator('#preference');
  if (!(await optionalVisible(preference))) return;
  const update = page.locator('#updatePreference');
  if (!(await update.isVisible())) await preference.click({timeout: 5000});
  // OOCL exposes only Accept All on the first screen. Its settings allow the
  // necessary cookies to remain enabled while functional/statistical cookies stay off.
  await page.locator('#cookieSwitch1').setChecked(false, {timeout: 5000});
  await page.locator('#cookieSwitch2').setChecked(false, {timeout: 5000});
  await update.click({timeout: 5000});
  await preference.waitFor({state: 'hidden', timeout: 5000});
}

export async function dismissHapagCookieNotice(page, {remaining = () => 5000} = {}) {
  // An open preference center covers the banner's Reject All button. Confirm
  // its existing choices first; never force-click through the modal overlay.
  const timeout = () => Math.max(1, Math.min(5000, remaining()));
  const confirm = page.getByRole('button', {name: /^(?:Confirm My Choices|确认我的选择)$/});
  if (await confirm.isVisible()) {
    await confirm.click({timeout: timeout()});
    await confirm.waitFor({state: 'hidden', timeout: timeout()});
  }
  const reject = page.locator('#onetrust-reject-all-handler');
  if (await reject.isVisible()) {
    await reject.click({timeout: timeout()});
    await reject.waitFor({state: 'hidden', timeout: timeout()});
  }
}
