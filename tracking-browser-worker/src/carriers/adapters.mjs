// 11 家船司「货物追踪」适配器
//
// 每家一个对象：入口 URL、单号归一化、在页面上要做的动作、命中判定。
// 这些细节全部来自实跑（见 docs/全船司11家-实现结果.md），不要凭猜测改。
//
// 约定：
//   reference   样本单号（也是 offline 测试用的默认值）
//   normalize   按官网要求把单号改成它能接受的形态
//   steps       page 上按官网真实动作操作；需要接 popup 的就 return 那个新页面
//   expect      命中判定正则（页面可见文本），没命中就不算成功
//   hasBusiness  CSV 浏览器查询的业务命中判定，避免把搜索框回显和页面标题当作结果
//   urlHasReference  入口地址里已经带单号，无需再填

import {assertCarrierAccess} from './carrier-access.mjs';
import {collectCmaDetails} from './cma-details.mjs';
import {collectMscDetails} from './msc-details.mjs';
import {collectMaerskDetails} from './maersk-details.mjs';
import {collectEvergreenDetails} from './evergreen-details.mjs';
import {collectCoscoDetails} from './cosco-details.mjs';
import {collectHmmDetails} from './hmm-details.mjs';
import {collectOoclDetails} from './oocl-details.mjs';
import {collectYmlDetails} from './yml-details.mjs';
import {collectMatsonDetails} from './matson-details.mjs';
import {collectOneDetails} from './one-details.mjs';
import {collectHapagDetails} from './hapag-details.mjs';
import {collectHapagLegacyContainerDetails, probeHapagLegacyContainerOverview} from './hapag-legacy-details.mjs';
import {queryHapagLegacyContainer} from './hapag-legacy-session.mjs';
import {dismissOoclCookieNotice, dismissHapagCookieNotice, dismissMscCookieNotice} from './ordinary-page-controls.mjs';
import {assertCmaHumanVerification} from './cma-human-verification.mjs';
import {checkHapagVerification, checkWanHaiVerification} from './carrier-verification.mjs';

const TIMEOUT = Number(process.env.CARRIER_TIMEOUT_MS ?? 60000);
const EXAMPLE_CONTAINERS = new Set(['EISU1234567', 'ABCD1234567', 'MSDU1234567', 'OOLU1234567', 'TLLU1234567', 'HLCU1234567']);
const HAPAG_QUERY_RECEIPTS = new WeakMap();
const hapagReference = value => String(value ?? '').replace(/\s+/g, '').toUpperCase();

function hasContainerResult(text, submitted) {
  // 搜索框、输入标签和示例中的箱号均不能单独证明已查到货踪。
  return (text.match(/\b[A-Z]{4}(?:\d{7}|\d{6}-\d)\b/g) ?? []).some((value) => {
    const number = value.replace('-', '');
    return number !== submitted && !EXAMPLE_CONTAINERS.has(number);
  });
}

async function reusableCmaForm(page) {
  if (!/^https:\/\/www\.cma-cgm\.com\/ebusiness\/tracking(?:[/?#]|$)/i.test(page.url())) return false;
  if (!await page.locator('#Reference').isVisible().catch(() => false)) return false;
  // Reuse an unlocked form, never an old ticket's displayed business result.
  const text = await page.locator('body').innerText({timeout: 3000}).catch(() => '');
  return !hasContainerResult(text, '');
}

async function reusableHapagForm(page, job = {}) {
  if (!/^https:\/\/www\.hapag-lloyd\.com\/(?:solutions\/tracking\/?|en\/online-business\/track\/track-by-(?:booking|container)-solution\.html)(?:[?#]|$)/i.test(page.url())) return false;
  const modern = await page.getByRole('searchbox', {name: /Container, Booking or B\/L No\./i}).isVisible().catch(() => false);
  const legacy = await page.getByLabel('Bill of Lading No.', {exact: true}).isVisible().catch(() => false);
  const container = await page.getByLabel('Container No.', {exact: true}).isVisible().catch(() => false);
  const suitableLegacy = legacy && job.reference_type !== 'CONTAINER';
  const suitableContainer = container && (!job.reference_type || job.reference_type === 'CONTAINER');
  if (!modern && !suitableLegacy && !suitableContainer) return false;
  const text = await page.locator('body').innerText({timeout: 3000}).catch(() => '');
  return !hasContainerResult(text, '') && !/Container Information/i.test(text);
}

async function reusableWanHaiForm(page) {
  return /^https:\/\/www\.wanhai\.com\/views\/quick\/cargo_tracking\.xhtml(?:[;?#]|$)/i.test(page.url()) &&
    await page.locator('#q_ref_no1').isVisible().catch(() => false);
}

export const CARRIERS = {
  MATSON: {
    collectDetails: collectMatsonDetails,
    detailBudgetMs: 60000,
    name: 'Matson 美森',
    reference: 'MATS8807956000',
    hasBusiness: hasContainerResult,
    normalize: (r) => r, // 报告：输入完整 MATS 单号
    async steps(page, ref, type) {
      const response = await page.goto('https://www.matson.com/shipment-tracking.html', {waitUntil: 'domcontentloaded', timeout: TIMEOUT});
      await page.waitForTimeout(2500);
      await assertCarrierAccess(page, response, 'MATSON');
      // 美森是 radio 三选一：#containerNumber / #bookingNumber / #billNumber
      const radio = type === 'CONTAINER' ? '#containerNumber' : type === 'BOOKING' ? '#bookingNumber' : '#billNumber';
      await page.locator(radio).check({timeout: 5000});
      const input = page.locator('#track-number-top');
      const target = (await input.count()) ? input : page.locator('input[name=trackingnumber]').first();
      await target.fill(ref);
      // 美森的 #shipTrackFormTop 里没有提交按钮，回车即提交（点站内搜索会跑到 search-result）
      await target.press('Enter');
      await page.waitForTimeout(12000);
    },
    expect: /USAU\d{7}|MATS8807956000|RETURNED FROM CONSIGNEE|LONG BEACH/i,
  },

  ONE: {
    collectDetails: collectOneDetails,
    detailBudgetMs: 60000,
    name: 'ONE 海洋网联',
    reference: 'ONEYNBOGG0610700',
    hasBusiness: hasContainerResult,
    normalize: (r) => r.replace(/^ONEY/, ''), // 报告：去 ONEY 前缀
    async steps(page, ref, type) {
      await page.goto('https://www.one-line.com/one-ecom/manage-shipment/cargo-tracking', {waitUntil: 'domcontentloaded', timeout: TIMEOUT});
      await page.waitForTimeout(3000);
      if (type === 'CONTAINER') {
        await page.getByRole('button', {name: 'BL No. or Booking No.', exact: true}).click();
        await page.getByRole('option', {name: 'Container No.', exact: true}).click();
      }
      const input = page.getByPlaceholder(type === 'CONTAINER' ? /Search by Container/i : /Search by BL No\. or Booking No\./i).first();
      await input.fill(ref);
      await input.press('Enter');
      await page.waitForTimeout(1800);
      // 关闭首次操作引导（OK / Skip）
      for (let i = 0; i < 4; i += 1) {
        for (const name of ['OK', 'Skip', 'Skip Tips', 'OK, got it']) {
          const el = page.getByText(name, {exact: true}).first();
          if (await el.isVisible().catch(() => false)) await el.click({timeout: 2000}).catch(() => {});
        }
        await page.waitForTimeout(400);
      }
      const btn = page.locator('#cargo-tracking-search-btn');
      if (await btn.count()) await btn.click({timeout: 5000}).catch(() => {});
      else await page.getByRole('button', {name: /^Search$/i}).first().click({timeout: 5000}).catch(() => {});
      await page.waitForTimeout(6000);
      // collectOneDetails expands each real row and disables latest-only mode.
    },
    expect: /NYKU3930669|MOL EXPERIENCE|NBOGG0610700|NINGBO/i,
  },

  HMM: {
    collectDetails: collectHmmDetails,
    detailBudgetMs: 60000,
    name: 'HMM 韩新海运',
    reference: 'HDMUSHAM54160100',
    hasBusiness: hasContainerResult,
    normalize: (r) => r.replace(/^HDMU/, ''), // 报告：B/L 框最长 12 位，去 HDMU
    async steps(page, ref, type) {
      const response = await page.goto('https://www.hmm21.com/e-service/general/trackNTrace/TrackNTrace.do?lang=en', {waitUntil: 'domcontentloaded', timeout: TIMEOUT});
      await page.waitForTimeout(3000);
      await assertCarrierAccess(page, response, 'HMM');
      const field = type === 'CONTAINER' ? 'srchCntrNo1' : type === 'BOOKING' ? 'srchBkgNo1' : 'srchBlNo1';
      const target = page.locator('input[name=' + field + ']').first();
      await target.fill(ref);
      const retrieve = page.getByRole('button', {name: /Retrieve|Search|查询/i}).first();
      if (await retrieve.count()) await retrieve.click({timeout: 5000}).catch(() => {});
      else await target.press('Enter');
    },
    expect: /Shipment Progress|Shipment History|HMMU\d{7}|Arrival at Destination/i,
  },

  EVERGREEN: {
    collectDetails: collectEvergreenDetails,
    detailBudgetMs: 60000,
    name: 'Evergreen 长荣',
    reference: 'EGLV149605962138',
    hasBusiness: hasContainerResult,
    normalize: (r) => r.replace(/^EGLV/, ''), // 报告：去 EGLV
    async steps(page, ref, type) {
      await page.goto('https://ct.shipmentlink.com/servlet/TDB1_CargoTracking.do', {waitUntil: 'domcontentloaded', timeout: TIMEOUT});
      await page.waitForTimeout(2500);
      const essentialCookies = page.locator('#btn_cookie_essential_only');
      if (await essentialCookies.isVisible()) await essentialCookies.click({timeout:5000});
      // 长荣：三个 input[name=NO] 分别属于 B/L / 箱号 / 订舱三个隐藏页签。
      // 逐个勾选 radio，直到某个输入框变为可见，再往那个框里填。
      const quick = page.getByRole('button', {name: /^Quick Tracking$/i}).first();
      if (await quick.count()) await quick.click({timeout: 5000}).catch(() => {});
      await page.waitForTimeout(1500);

      const radio = type === 'CONTAINER' ? '#s_cntr' : type === 'BOOKING' ? '#s_bk' : '#s_bl';
      await page.locator(radio).check();
      const target = page.locator('input[name=NO]:visible').first();
      await target.fill(ref);
      const submit = page.locator('input[type=submit], input[type=image]').first();
      if (await submit.count()) await submit.click({timeout: 5000, force: true}).catch(() => {});
      else await target.press('Enter');
      await page.waitForTimeout(12000);
    },
    expect: /149605962138|TIIU4288353|Empty container returned|YANTIAN/i,
  },

  MAERSK: {
    collectDetails: collectMaerskDetails,
    detailBudgetMs: 60000,
    name: 'Maersk 马士基',
    reference: 'MAEU802356593',
    hasBusiness: hasContainerResult,
    normalize: (r) => r.replace(/^MAEU/, ''), // 报告：B/L 9 位
    async steps(page, ref) {
      await page.goto(`https://www.maersk.com/tracking/${ref}`, {waitUntil: 'domcontentloaded', timeout: TIMEOUT});
      await page.waitForTimeout(6000);
      // cookie 弹层会挡住查询渲染：先关掉，再重载一次
      let accepted = false;
      for (const name of ['Essential only', 'Allow all', 'Accept all', 'Accept']) {
        const el = page.getByRole('button', {name, exact: false}).first();
        if (await el.isVisible().catch(() => false)) { await el.click({timeout: 4000}).catch(() => {}); accepted = true; break; }
      }
      if (accepted) {
        await page.waitForTimeout(1500);
        await page.reload({waitUntil: 'domcontentloaded', timeout: TIMEOUT}).catch(() => {});
      }
      await page.waitForTimeout(8000);
      // Public event expansion is handled per container by collectMaerskDetails.
    },
    expect: /MIEU3422410|NINGBO|LOS ANGELES|802356593|View \d+ events/i,
    urlHasReference: true,
  },

  MSC: {
    collectDetails: collectMscDetails,
    detailBudgetMs: 60000,
    name: 'MSC 地中海',
    reference: 'MEDUW8444954',
    hasBusiness: hasContainerResult,
    normalize: (r) => r,
    async steps(page, ref, type) {
      await page.goto('https://www.msc.com/en/track-a-shipment', {waitUntil: 'domcontentloaded', timeout: TIMEOUT});
      await page.waitForTimeout(6000);
      await dismissMscCookieNotice(page);
      // 订舱号（如 177QBWBWS017777）必须切到 Booking Number 页签
      if (type === 'BOOKING' || (!type && !/^(?:MEDU|MSCU)/i.test(ref) && !/^[A-Z]{4}\d{7}$/i.test(ref))) {
        const bookingTab = page.getByText(/^Booking Number$/i).first();
        await bookingTab.click({timeout: 5000});
        await page.waitForTimeout(1500);
      }
      const input = page.locator('#trackingNumber');
      const target = (await input.count()) ? input : page.getByPlaceholder(/Container\/Bill of Lading/i).first();
      await target.waitFor({state: 'visible', timeout: 15000});
      await target.fill(ref);
      const search = page.getByRole('button', {name: /^Search$/i}).first();
      if (await search.count()) await search.click({timeout: 6000}).catch(() => {});
      else await target.press('Enter');
      await page.waitForTimeout(6000);
      // Container bars are expanded by collectMscDetails. The public "Show all"
      // footer can be a static explanation, so text alone is never clicked.
      await dismissMscCookieNotice(page);
    },
    expect: /CONTAINERS|[A-Z]{4}\d{7}|Latest move/i,
  },

  CMA_CGM: {
    collectDetails: collectCmaDetails,
    detailBudgetMs: 60000,
    name: 'CMA CGM 达飞',
    reference: 'TJN0940917',
    hasBusiness: hasContainerResult,
    normalize: (r) => r,
    canReusePage: reusableCmaForm,
    checkVerification: assertCmaHumanVerification,
    async steps(page, ref) {
      if (!await reusableCmaForm(page)) {
        await page.goto('https://www.cma-cgm.com/ebusiness/tracking', {waitUntil: 'domcontentloaded', timeout: TIMEOUT});
        await page.waitForTimeout(6000);
      }
      await assertCmaHumanVerification(page);
      // 真实输入框：#Reference（name=SearchViewModel.Reference，placeholder "Ex: ABCD1234567"）
      let input = page.locator('#Reference');
      if (!(await input.count())) input = page.getByPlaceholder(/ABCD1234567/).first();
      try {
        await input.waitFor({state: 'visible', timeout: 20000});
      } catch (error) {
        if (error.name === 'TimeoutError') await assertCmaHumanVerification(page);
        throw error;
      }
      await input.fill(ref);
      await page.waitForTimeout(600);
      const search = page.getByRole('button', {name: /^Search$/i}).first();
      if (await search.count() && await search.isEnabled().catch(() => false)) await search.click({timeout: 8000});
      else await input.press('Enter');
      await page.waitForTimeout(15000);
    },
    expect: /TLLU4745847|TRHU8582015|SAVANNAH|GATE IN EMPTY/i,
  },

  HAPAG_LLOYD: {
    name: 'Hapag-Lloyd 赫伯罗特',
    reference: 'HLCUBO2260433677',
    hasBusiness: hasContainerResult,
    normalize: (r) => r,
    canReusePage: reusableHapagForm,
    checkVerification: checkHapagVerification,
    async steps(page, ref, type, {now = Date.now} = {}) {
      HAPAG_QUERY_RECEIPTS.delete(page);
      if (type === 'CONTAINER') {
        const receipt = await queryHapagLegacyContainer(page, ref, {now});
        HAPAG_QUERY_RECEIPTS.set(page, receipt);
        return;
      }
      // One total budget covers natural security checks, form discovery and the
      // single normal query. Do not reset it when the site changes page layout.
      const deadline = now() + 150000;
      let lastText = '';
      const stopped = (code, message) => Object.assign(new Error(message), {
        code, verificationText: lastText,
      });
      const incomplete = () => stopped('CARRIER_QUERY_INCOMPLETE',
        'Hapag-Lloyd 在150秒内未完成本次查询，已保留页面供核对，不自动重复提交。');
      const remaining = () => Math.max(1, deadline - now());
      const pause = async () => {
        if (now() >= deadline) throw incomplete();
        await page.waitForTimeout(Math.min(1000, remaining()));
      };
      const readPage = async () => {
        const state = await checkHapagVerification(page);
        lastText = state.text;
        return state;
      };
      const isFinished = text => hasContainerResult(text, ref)
        || (/Container No\.\s+Tare \(kg\)/i.test(text) && text.includes(ref))
        || /no (?:results|records|tracking information)|not found/i.test(text);
      if (!await reusableHapagForm(page, {reference_type:type}))
        await page.goto('https://www.hapag-lloyd.com/solutions/tracking/#/', {
          waitUntil: 'domcontentloaded', timeout: Math.min(TIMEOUT, remaining()),
        });
      const modern = page.getByRole('searchbox', {name: /Container, Booking or B\/L No\./i});
      const legacyBill = page.getByLabel('Bill of Lading No.', {exact: true});
      const legacyBooking = page.getByLabel('Booking No.', {exact: true});
      const legacyContainerInput = page.getByLabel('Container No.', {exact: true});
      const busy = page.locator('.q-field--search .q-spinner:visible, .q-field--search [role="progressbar"]:visible');
      let selectedEnglish = false;
      let openedTrackMenu = false;
      let followedBooking = false;
      let target;
      let other;
      let submit;
      let legacyForm = false;
      let legacyContainer = false;
      while (now() < deadline) {
        const {pending} = await readPage();
        if (!pending) {
          await dismissHapagCookieNotice(page, {remaining});
          if (now() >= deadline) throw incomplete();
          const location = new URL(page.url());
          if (location.origin === 'https://www.hapag-lloyd.com' && location.pathname.startsWith('/zh/')) {
            // The official tracking entry was observed to fall back to the
            // Chinese legacy container page on Ubuntu. Use only the website's
            // ordinary language menu, retaining the same browser/session.
            const language = page.getByRole('button', {name: 'Switch language. Current language is zh', exact: true});
            if (!selectedEnglish && await language.isVisible().catch(() => false)) {
              selectedEnglish = true;
              await language.click({timeout: Math.min(8000, remaining())});
              const english = page.getByRole('menuitem', {name: 'English', exact: true});
              await english.waitFor({state: 'visible', timeout: Math.min(8000, remaining())});
              await english.click({timeout: Math.min(8000, remaining())});
            }
            await pause();
            continue;
          }
          if (await modern.isVisible().catch(() => false)) {
            target = modern;
            submit = page.getByRole('main').getByRole('button', {name: 'Search', exact: true});
          } else if (await legacyBill.isVisible().catch(() => false)) {
            if (type === 'CONTAINER') {
              throw Object.assign(new Error('Hapag-Lloyd 当前普通查询表单只提供提单号和订舱号，请使用对应查询类型。'), {code: 'UNSUPPORTED_REFERENCE_TYPE'});
            }
            target = type === 'BOOKING' ? legacyBooking : legacyBill;
            other = type === 'BOOKING' ? legacyBill : legacyBooking;
            submit = page.locator('[id="tracing_by_booking_f:hl18"]');
            legacyForm = true;
          } else if (type === 'CONTAINER' && location.origin === 'https://www.hapag-lloyd.com' &&
              location.pathname === '/en/online-business/track/track-by-container-solution.html' &&
              await legacyContainerInput.isVisible().catch(() => false)) {
            target = legacyContainerInput;
            submit = page.locator('[id="tracing_by_container_f:hl25"]');
            legacyForm = true;
            legacyContainer = true;
          } else if (location.origin === 'https://www.hapag-lloyd.com' &&
              location.pathname === '/en/online-business/track/track-by-container-solution.html' && !followedBooking) {
            // Follow the actual public by Booking link, rather than composing
            // a replacement URL or entering a bill into the container field.
            const navigation = page.getByRole('navigation', {name: 'Main navigation', exact: true});
            const bookingLink = navigation.getByRole('link', {name: 'by Booking', exact: true});
            if (await bookingLink.isVisible().catch(() => false)) {
              const href = await bookingLink.getAttribute('href', {timeout: Math.min(8000, remaining())});
              if (href !== '/en/online-business/track/track-by-booking-solution.html')
                throw stopped('CARRIER_QUERY_INCOMPLETE', 'Hapag-Lloyd 官网按订舱查询链接已改变，已停止导航并保留页面供核对。');
              followedBooking = true;
              await bookingLink.click({timeout: Math.min(8000, remaining())});
            } else if (!openedTrackMenu) {
              const track = navigation.getByRole('button', {name: 'Track', exact: true});
              if (await track.isVisible().catch(() => false)) {
                openedTrackMenu = true;
                await track.click({timeout: Math.min(8000, remaining())});
              }
            }
            await pause();
            continue;
          }
          if (target) break;
        }
        await pause();
      }
      if (!target || now() >= deadline) throw incomplete();
      await dismissHapagCookieNotice(page, {remaining});
      if (now() >= deadline) throw incomplete();
      const sameReference = value => legacyContainer ? hapagReference(value) === hapagReference(ref) : value === ref;
      if (legacyForm) {
        // An already empty other-type field must not receive an unnecessary
        // input event. The real legacy form retains the full bill after normal
        // keyboard entry and an ordinary Tab blur; fill alone was unreliable.
        if (other && await other.inputValue({timeout: Math.min(10000, remaining())}) !== '') {
          await other.click({timeout: Math.min(10000, remaining())});
          await other.press('ControlOrMeta+A', {timeout: Math.min(10000, remaining())});
          await other.press('Backspace', {timeout: Math.min(10000, remaining())});
          await other.press('Tab', {timeout: Math.min(10000, remaining())});
        }
        await target.click({timeout: Math.min(10000, remaining())});
        await target.press('ControlOrMeta+A', {timeout: Math.min(10000, remaining())});
        await target.pressSequentially(ref, {delay: 60, timeout: Math.min(10000, remaining())});
        if (!sameReference(await target.inputValue({timeout: Math.min(10000, remaining())})))
          throw stopped('CARRIER_QUERY_INCOMPLETE', 'Hapag-Lloyd 查询表单未保留完整单号，已在提交前停止，请核对本次查询。');
        await target.press('Tab', {timeout: Math.min(10000, remaining())});
        await page.waitForTimeout(Math.min(1500, remaining()));
      } else await target.fill(ref, {timeout: Math.min(10000, remaining())});
      // A prior query can leave the same no-records wording in this form. Only
      // a response after this Find/Search can classify the current reference.
      const beforeSubmitText = (await readPage()).text;
      // Fill is not proof that the page retained the reference. The Ubuntu
      // legacy form was observed with maxlength=17 but only HLCU afterwards;
      // that does not establish why it changed. Read back the actual visible
      // value, and never submit a partial or otherwise changed reference.
      const filledValue = await target.inputValue({timeout: Math.min(10000, remaining())});
      const filledOther = other ? await other.inputValue({timeout: Math.min(10000, remaining())}) : '';
      if (!sameReference(filledValue) || filledOther) {
        throw stopped('CARRIER_QUERY_INCOMPLETE',
          'Hapag-Lloyd 查询表单未保留完整单号，已在提交前停止，请核对本次查询。');
      }
      if (now() >= deadline) throw incomplete();
      const priorNotFound = /\bDOCUMENT does not exist\./i.test(beforeSubmitText);
      let mainNavigated = false;
      let navigatedSinceSubmit = false;
      // 只看路径/查询串的变化：Hapag 是 hash 路由（#/单号），hash 变化也会触发
      // framenavigated，但它不代表官网真的换了页面，不能当作「已跳转」把重提守卫挡死。
      const pagePath = () => {
        try { const url = new URL(page.url()); return url.pathname + url.search; } catch { return ''; }
      };
      let pathAtSubmit = pagePath();
      const observedNavigation = frame => {
        if (frame !== page.mainFrame?.()) return;
        mainNavigated = true;
        if (pagePath() !== pathAtSubmit) navigatedSinceSubmit = true;
      };
      page.on?.('framenavigated', observedNavigation);
      // 官网常见毛病：提交后页面停在同一张空表单（无跳转、无 loading、无结果），
      // 而同页再点一次普通 Search 就能出结果。默认仍然只提交一次；
      // 只有 HAPAG_RESUBMIT=1 且满足守卫（同票、同表单、无跳转、无结果、无验证）时，才允许重提一次。
      const allowResubmit = process.env.HAPAG_RESUBMIT === '1';
      let submitCount = 0;
      let submittedAt = 0;
      let normalClickStarted = false;
      const observedResponse = response => {
        if (!legacyContainer || !normalClickStarted) return;
        try {
          const request = response.request();
          const url = new URL(response.url());
          const status = response.status();
          if (!request.isNavigationRequest() || request.frame() !== page.mainFrame?.() || status < 200 || status >= 300 ||
              url.origin !== 'https://www.hapag-lloyd.com' || url.pathname !== '/en/online-business/track/track-by-container-solution.html' ||
              hapagReference(url.searchParams.get('container')) !== hapagReference(ref)) return;
          HAPAG_QUERY_RECEIPTS.set(page, {confirmed:true,submitted:ref,normalizedReference:hapagReference(ref),
            responseUrl:url.href,responseStatus:status,queryType:'CONTAINER'});
        } catch { /* Unreadable/unrelated responses do not confirm this query. */ }
      };
      page.on?.('response', observedResponse);
      try {
        // 默认只做一次普通提交（防重复查询）；重提受 HAPAG_RESUBMIT 与上面那组守卫约束。
        try {
          normalClickStarted = true;
          await submit.click({timeout: Math.min(10000, remaining())});
          submitCount = 1;
          submittedAt = now();
          pathAtSubmit = pagePath();
        } catch (error) {
          const {pending} = await readPage();
          const sameModernQuery = !legacyForm && new URL(page.url()).hash === '#/' + ref;
          if (error.name !== 'TimeoutError' || !(pending || (!legacyForm && (sameModernQuery || await busy.count())))) throw error;
        }
        while (now() < deadline) {
          const {text, pending} = await readPage();
          if (!pending) {
            if (await target.isVisible().catch(() => false)) {
              const value = await target.inputValue().catch(() => ref);
              const otherValue = other ? await other.inputValue().catch(() => '') : '';
              if (allowResubmit && submitCount === 1 && !navigatedSinceSubmit
                && now() - submittedAt > 20000 && value === ref && !otherValue
                && !isFinished(text) && !/\bDOCUMENT does not exist\./i.test(text)) {
                submitCount = 2;
                submittedAt = now();
                navigatedSinceSubmit = false;
                pathAtSubmit = pagePath();
                console.log('[hapag] 提交后停在空表单、无跳转无结果：按守卫规则同页重提一次 Search');
                await submit.click({timeout: Math.min(10000, remaining())}).catch(() => {});
                continue;
              }
              if ((value && !sameReference(value)) || otherValue) {
                throw stopped('CARRIER_QUERY_INCOMPLETE',
                  'Hapag-Lloyd 查询表单中的单号已改变，已保留页面并停止自动提交，请核对本次查询。');
              }
            }
            if (/\bDOCUMENT does not exist\./i.test(text) && (!priorNotFound || mainNavigated)) {
              throw stopped('CARRIER_REFERENCE_NOT_FOUND',
                'Hapag-Lloyd 官网返回 DOCUMENT does not exist.，本次未找到所提交单号，不自动重试。');
            }
            let completed = isFinished(text);
            if (legacyContainer) {
              const queryReceipt = HAPAG_QUERY_RECEIPTS.get(page);
              const probe = await probeHapagLegacyContainerOverview({page,job:{reference:ref,submitted:ref,reference_type:type},queryReceipt,text});
              completed = probe?.ok === true;
            }
            if (!await busy.count() && completed) return;
          }
          await pause();
        }
        throw incomplete();
      } finally {
        page.off?.('framenavigated', observedNavigation);
        page.off?.('response', observedResponse);
      }
    },
    expect: /HLCUSHA2610DDHU2|BMOU\d{7}|Vessel arrived|CHARLESTON|Gate|Arrival|Booking/i,
  },

  OOCL: {
    collectDetails: collectOoclDetails,
    detailBudgetMs: 60000,
    name: 'OOCL 东方海外',
    reference: 'OOLU8882861060',
    hasBusiness: hasContainerResult,
    normalize: (r) => r,
    async steps(page, ref, type) {
      await page.goto('https://www.oocl.com/', {waitUntil: 'domcontentloaded', timeout: TIMEOUT});
      // 首页货物追踪表单需要明确选择提单号码；官网提交把查询上下文带入 Control Tower。
      const select = page.locator('#ooclCargoSelector');
      await select.waitFor({state: 'visible', timeout: 20000});
      await dismissOoclCookieNotice(page);
      await select.selectOption(type === 'CONTAINER' ? 'cont' : type === 'BOOKING' ? 'booking' : 'bl', {timeout: 20000});
      const panel = page.getByRole('tabpanel', {name: /货物追踪|貨物追蹤|Cargo Tracking/i});
      const input = panel.locator('#SEARCH_NUMBER');
      await input.fill(ref);
      const popupPromise = page.waitForEvent('popup', {timeout: 30000}).catch(() => null);
      await panel.locator('#container_btn').click({timeout: 8000});
      const popup = await popupPromise;
      if (popup) await popup.waitForLoadState('domcontentloaded', {timeout: 30000}).catch(() => {});
      return popup ?? page;
    },
    expect: /OOLU6350169|TCKU6090717|OOLU9106217|COSCO BELGIUM|BKG\s*\d{5,}|Current Status|Departure|B\/L\s*\d{5,}/i,
  },

  YML: {
    collectDetails: collectYmlDetails,
    detailBudgetMs: 60000,
    name: 'Yang Ming 阳明',
    reference: 'YMJAE237071981',
    hasBusiness: hasContainerResult,
    normalize: (r) => r,
    async steps(page, ref) {
      await page.goto('https://www.yangming.com/en/esolution/tracking/cargo_tracking', {waitUntil: 'domcontentloaded', timeout: TIMEOUT});
      await page.waitForTimeout(3000);
      const agree = page.getByRole('button', {name: 'Agree', exact: true}).first();
      if (await agree.isVisible().catch(() => false)) await agree.click({timeout: 3000}).catch(() => {});
      // Current Yang Ming form accepts up to 20 references in a textarea;
      // its generated react-aria id is not stable between builds.
      const input = page.locator('textarea').first();
      await input.waitFor({state: 'visible', timeout: 15000});
      await input.fill(ref);
      const search = page.getByRole('button', {name: 'Search', exact: true}).first();
      if (await search.count()) await search.click({timeout: 5000});
      else await input.press('Enter');
      await page.waitForTimeout(12000);
    },
    expect: /YMJAE237071981|successCnt|Cargo Tracking/i,
  },

  COSCO: {
    collectDetails: collectCoscoDetails,
    detailBudgetMs: 60000,
    name: 'COSCO 中远海运',
    reference: 'COSU9509479300',
    hasBusiness(text, submitted) {
      if (hasContainerResult(text, submitted)) return true;
      // 船期已经确认、尚未配箱时，箱表会显示“暂无数据”；此时以带单号的订舱详情和预计船期为准。
      const booking = /订舱["“]([A-Z0-9]+)["”][ \t]*更多信息/.exec(text);
      return booking?.[1] === submitted && /预计离港\s+\d{4}-\d{2}-\d{2}/.test(text);
    },
    normalize: (r) => r.replace(/^(?:COSU|CSNU|CBHU|CCLU)/, ''), // 报价/跟踪都按 9 位数字
    // COSCO 的订舱号与提单号是两套并存的号（订舱号先出、提单号后出），
    // 前缀不能可靠区分，所以两种 trackingType 都试，谁出数据用谁。
    variants: ['BILLOFLADING', 'BOOKING', 'CONTAINER'].map(label => ({
      label,
      async run(page, ref) {
        await page.goto(`https://elines.coscoshipping.com/scct/public/ct/base?lang=zh&trackingType=${label}&number=${encodeURIComponent(ref)}`, {waitUntil: 'domcontentloaded', timeout: TIMEOUT});
        await page.waitForTimeout(1500);
        return page;
      },
    })),
    expect: /CSNU5895608|CSCL EAST CHINA SEA|9509479300|9508236200|还空箱|Empty|集装箱信息|实际离港|实际到港/i,
    urlHasReference: true,
  },

  ZIM: {
    name: 'ZIM 以星',
    reference: 'ZIMUSNH22285870',
    normalize: (r) => r,
    async steps(page, ref) {
      await page.goto('https://www.zim.com/tools/track-a-shipment', {waitUntil: 'domcontentloaded', timeout: TIMEOUT});
      await page.waitForTimeout(6000);
      for (const name of ['Accept All', 'Accept all', 'I Accept', 'Accept']) {
        const btn = page.getByRole('button', {name}).first();
        if (await btn.isVisible().catch(() => false)) { await btn.click({timeout: 3000}).catch(() => {}); break; }
      }
      const input = page.locator('#shipment-main-search-2').first();
      await input.waitFor({state: 'visible', timeout: 20000});
      await input.fill(ref);
      await page.waitForTimeout(1000);
      const submit = page.locator('input[type=submit]').first();
      if (await submit.count()) await submit.click({timeout: 5000});
      else await input.press('Enter');
      await page.waitForTimeout(15000);
      // 有时会跳到结果页，等它渲染
      await page.waitForTimeout(5000);
    },
    expect: /ZIMUSNH22285870|Container|Vessel|Arrival|Departure/i,
  },

  SML: {
    name: 'SM Line',
    reference: 'SHFO6B957700',
    normalize: (r) => r,
    async steps(page, ref, type) {
      // 真实页面：https://esvc.smlines.com/smline/CUP_HOM_3301.do?sessLocale=en
      // 搜索框是 <textarea id="searchName">（不是 input），类型下拉是 #searchType
      await page.goto('https://esvc.smlines.com/smline/CUP_HOM_3301.do?sessLocale=en', {waitUntil: 'domcontentloaded', timeout: TIMEOUT});
      await page.waitForTimeout(3000);

      const select = page.locator('#searchType');
      await select.selectOption(type === 'CONTAINER' ? 'C' : 'B'); // B = BL No. or Booking No.

      const box = page.locator('#searchName');
      await box.waitFor({state: 'visible', timeout: 25000});
      await box.click({timeout: 5000}).catch(() => {});
      await box.fill(ref);
      await page.waitForTimeout(800);

      // Search 按钮：文案 Search（可能在 table 里，不是 <button>）
      let clicked = false;
      for (const candidate of [
        page.getByRole('button', {name: /^Search$/i}).first(),
        page.locator('a:has-text("Search"), input[value="Search"], button:has-text("Search")').first(),
        page.getByText(/^Search$/).first(),
      ]) {
        if (await candidate.count()) {
          await candidate.click({timeout: 6000}).catch(() => {});
          clicked = true;
          break;
        }
      }
      if (!clicked) await box.press('Enter');
      await page.waitForTimeout(2500);
    },
    expect: /SMCU\d{7}|Vessel Departure from Port of Loading|Oboard Date/i,
  },

  KMTC: {
    name: 'KMTC 高丽海运',
    reference: 'KORPNBO9908727',
    normalize: (r) => r,
    async steps(page, ref, type) {
      await page.goto('https://www.ekmtc.com/index.html#/cargo-tracking', {waitUntil: 'domcontentloaded', timeout: TIMEOUT});
      await page.waitForTimeout(9000);
      if (type === 'CONTAINER') {
        throw Object.assign(new Error('KMTC 官网此查询表单仅提供提单号和订舱号'), {code: 'UNSUPPORTED_REFERENCE_TYPE'});
      }
      if (type === 'BOOKING') {
        await page.locator('select').filter({has: page.locator('option[value="BK"]')}).selectOption('BK');
      }
      const input = page.locator('#blNo');
      await input.waitFor({state: 'visible', timeout: 20000});
      await input.fill(ref);
      const btn = page.getByRole('button', {name: /Search|查询|查詢|Track/i}).first();
      if (await btn.count()) await btn.click({timeout: 5000}).catch(() => {});
      else await input.press('Enter');
      await page.waitForTimeout(15000);
    },
    expect: /KORPNBO9908727|Vessel|Voyage|Container|Port/i,
  },

  WAN_HAI: {
    name: '万海 Wan Hai',
    reference: 'WHLC040GX05516',
    hasBusiness(text, submitted) {
      const rows = text.matchAll(/^\s*\d+[ \t]+([A-Z0-9]+)[ \t]+\d{4}[/-]\d{1,2}[/-]\d{1,2}[ \t]+\S+[ \t]+\S/gm);
      return [...rows].some((row) => row[1] === submitted);
    },
    normalize: (r) => r.replace(/^WHLC/, ''), // 报告：去 WHLC
    canReusePage: reusableWanHaiForm,
    checkVerification: checkWanHaiVerification,
    async steps(page, ref, type) {
      // 报告：CSV 的 /apps/TrackNTrace 报地址错 → 走 /views/quick/cargo_tracking.xhtml
      // 真实控件：#cargoType（类型下拉）/ #q_ref_no1（单号）/ #quick_ctnr_query（提交）
      const input = page.locator('#q_ref_no1');
      if (!page.url().startsWith('https://www.wanhai.com/views/quick/cargo_tracking.xhtml') || !(await input.isVisible())) {
        await page.goto('https://www.wanhai.com/views/quick/cargo_tracking.xhtml', {waitUntil: 'domcontentloaded', timeout: TIMEOUT});
      }
      await checkWanHaiVerification(page);
      const select = page.locator('#cargoType');
      if (await select.count()) {
        const options = await select.locator('option').all().catch(() => []);
        for (const option of options) {
          const label = (await option.innerText().catch(() => '')) || '';
          const desired = type === 'CONTAINER' ? /container|cntr/i : /B\/?L|BL no/i;
          if (desired.test(label)) { await select.selectOption(await option.getAttribute('value')); break; }
        }
        if (type === 'CONTAINER' && !/container|cntr/i.test(await select.locator('option:checked').innerText())) throw new Error('未找到万海箱号查询选项');
      }
      try {
        await input.waitFor({state: 'visible', timeout: 20000});
      } catch (error) {
        await checkWanHaiVerification(page);
        throw error;
      }
      await input.fill(ref);
      // 关键：这个 form 是 target="_blank"，结果在新窗口打开（tracking_data_list.xhtml）
      const popupPromise = page.waitForEvent('popup', {timeout: 30000}).catch(() => null);
      const submit = page.locator('#quick_ctnr_query').first();
      if (await submit.count()) await submit.click({timeout: 8000});
      else await input.press('Enter');
      const popup = await popupPromise;
      if (popup) {
        await popup.waitForLoadState('domcontentloaded', {timeout: 30000}).catch(() => {});
        await popup.waitForTimeout(4000);
        return popup;
      }
      // 结果也可能留在当前标签。其他工作标签可能含有先前的查询结果。
      return page;
    },
    // 报告：万海只提供 120 天内历史；命中判定看船名/上船日
    expect: /040GX05516|WAN HAI 352|W042|Oboard Date/i,
  },
};

// Keep the audited Hapag query/resubmit block byte-identical. Supplementary
// history capture is registered separately and runs only after a valid result.
CARRIERS.HAPAG_LLOYD.collectDetails = options => options.job.reference_type === 'CONTAINER' &&
  /^\/en\/online-business\/track\/track-by-container-solution\.html$/.test(new URL(options.page.url()).pathname)
  ? collectHapagLegacyContainerDetails(options) : collectHapagDetails(options);
CARRIERS.HAPAG_LLOYD.probeOverview = async options => {
  if (!/^\/en\/online-business\/track\/track-by-container-solution\.html$/.test(new URL(options.page.url()).pathname)) return options.overview;
  const receipt = HAPAG_QUERY_RECEIPTS.get(options.page);
  const overview = await probeHapagLegacyContainerOverview({...options,queryReceipt:receipt});
  if (overview.ok && receipt?.query_lifecycle) overview.fields.hapag_query_lifecycle = {...receipt.query_lifecycle};
  return overview;
};
CARRIERS.HAPAG_LLOYD.detailBudgetMs = 60000;
