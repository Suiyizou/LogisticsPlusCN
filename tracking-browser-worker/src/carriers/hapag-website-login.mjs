// Opt-in, ordinary website login only. No challenge action, alternate entry,
// context replacement, API call, cookie import, or credential logging.
import fs from 'node:fs/promises';
import {constants} from 'node:fs';
import path from 'node:path';
import {checkHapagVerification} from './carrier-verification.mjs';

const guards = new WeakMap();
const NORMAL_LOGIN_PATH = /^\/hlagwebprod\.onmicrosoft\.com\/b2c_1a_signup_signin\/oauth2\/v2\.0\/authorize$/i;
const CATEGORY = /^(?:Booking No\.|B\/L No\.|Container No\.|Invoice No\.)$/;
const ANNOUNCEMENT_TEXT = 'My Compass is ready for you Try the new workspace for managing your shipments, tasks, and daily work in one place. Open My Compass Skip This Time';
const clean = value => String(value ?? '').replace(/\s+/g,' ').trim();
const fail = (code, message) => Object.assign(new Error(message), {name:'HapagWebsiteLoginError', code});
const MAX_SECRET_BYTES = 16384;

// OneTrust currently places role=dialog on children of these stable SDK roots.
// Recognize the actual privacy controls, never an arbitrary login-form parent.
export function areKnownHapagPrivacyDialogs(nodes) {
  return nodes.length>0 && nodes.every(dialog=>{
    const panel=dialog.closest('#onetrust-pc-sdk');
    if(panel)return panel.querySelectorAll('input[id^="ot-group-id-"]').length>=4 &&
      [...panel.querySelectorAll('button')].some(button=>button.textContent.replace(/\s+/g,' ').trim()==='Confirm My Choices');
    const banner=dialog.closest('#onetrust-banner-sdk');
    return !!banner && banner.querySelectorAll('#onetrust-reject-all-handler').length===1 &&
      /Depending on your consent and your cookie settings/.test(banner.textContent);
  });
}

export const hapagWebsiteAutoLoginEnabled = () => process.env.HAPAG_AUTO_LOGIN === '1';
export const hapagPublicEntryWaitEnabled = () => process.env.HAPAG_PUBLIC_ENTRY_WAIT_MS === '600000';
export function hapagTestDeadline() {
  const value=process.env.HAPAG_TEST_DEADLINE_UTC;
  if(!value)return Infinity;
  const parsed=Date.parse(value);
  if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)||!Number.isFinite(parsed))
    throw fail('HAPAG_TEST_DEADLINE_INVALID','The optional QA deadline must be a valid UTC timestamp; no page action was started');
  return parsed;
}

export function hapagWebsitePageKind(value) {
  try {
    const url = new URL(value);
    if (url.origin === 'https://identity.hapag-lloyd.com')
      return NORMAL_LOGIN_PATH.test(url.pathname) ? 'NORMAL_LOGIN' : 'OFFICIAL_IDENTITY_TRANSITION';
    if (url.origin === 'https://www.hapag-lloyd.com')
      return /^\/solutions\/navigator\/?$/.test(url.pathname) ? 'NAVIGATOR' : 'OFFICIAL_WEBSITE_TRANSITION';
    return value === 'about:blank' ? 'OWNED_BLANK' : 'UNEXPECTED_ORIGIN';
  } catch { return value === 'about:blank' ? 'OWNED_BLANK' : 'UNEXPECTED_ORIGIN'; }
}

function safeStat(stat, uid) {
  return stat?.isFile?.() === true && stat.uid === uid && (stat.mode & 0o7777) === 0o600 &&
    Number.isSafeInteger(stat.size) && stat.size > 0 && stat.size <= MAX_SECRET_BYTES;
}

// Dependency injection is for offline tests. The runtime uses the real Linux
// UID, O_NOFOLLOW and descriptor stat; it never falls back to readFile(path).
export async function readHapagWebsiteCredentials(filename, {
  fileSystem = fs, fileConstants = constants, platform = process.platform,
  uid = typeof process.getuid === 'function' ? process.getuid() : null,
} = {}) {
  let handle,buffer;
  try {
    if (platform !== 'linux' || !Number.isSafeInteger(uid) || !path.posix.isAbsolute(filename ?? '') ||
        filename.includes('\0') || !Number.isInteger(fileConstants.O_NOFOLLOW) || fileConstants.O_NOFOLLOW <= 0) throw Error();
    const before = await fileSystem.lstat(filename);
    if (before.isSymbolicLink() || !safeStat(before,uid)) throw Error();
    handle = await fileSystem.open(filename,fileConstants.O_RDONLY | fileConstants.O_NOFOLLOW);
    const opened = await handle.stat();
    if (!safeStat(opened,uid) || opened.dev !== before.dev || opened.ino !== before.ino) throw Error();
    buffer = Buffer.alloc(MAX_SECRET_BYTES + 1);
    let length = 0;
    while (length < buffer.length) {
      const {bytesRead} = await handle.read(buffer,length,buffer.length-length,length);
      if (!bytesRead) break;
      length += bytesRead;
    }
    if (length > MAX_SECRET_BYTES) throw Error();
    const after = await handle.stat();
    if (!safeStat(after,uid) || after.dev !== opened.dev || after.ino !== opened.ino || after.size !== length) throw Error();
    let value;
    try { value = JSON.parse(buffer.toString('utf8',0,length)); }
    finally { buffer.fill(0); }
    if (!value || typeof value.username !== 'string' || typeof value.password !== 'string' ||
        !value.username.trim() || value.username.length > 320 || /[\r\n\0]/.test(value.username) ||
        !value.password || value.password.length > 4096 || value.password.includes('\0')) throw Error();
    return {username:value.username,password:value.password};
  } catch {
    throw fail('HAPAG_LOGIN_CREDENTIALS_UNSAFE','The opt-in website credential file is unavailable or fails the required Linux owner, 0600, regular-file and no-symlink checks; no credential was submitted');
  } finally { buffer?.fill(0);await handle?.close().catch(()=>{}); }
}

function budget(end, maximum = 3000) {
  const remaining = end - Date.now();
  if (remaining < 100) throw fail('LOGIN_REQUIRED','Normal website login did not reach Navigator within the original 150-second query budget');
  return Math.max(1,Math.min(maximum,remaining - 50));
}

const OBSERVED_STATIC_NAVIGATION_URLS=new Set([
  'https://www.hapag-lloyd.com/etc/designs/website/solutions/navigation/online-business/zh.json',
  'https://www.hapag-lloyd.com/etc/designs/website/solutions/navigation/online-business/footer/en.json',
  'https://www.hapag-lloyd.com/etc/designs/website/solutions/navigation/online-business/left/en.json',
]);
export function hapagObservedStaticNavigation403(response) {
  try {
    const request=response.request();
    return response.status()===403&&request.method()==='GET'&&['xhr','fetch'].includes(request.resourceType())&&
      OBSERVED_STATIC_NAVIGATION_URLS.has(response.url());
  }catch{return false;}
}

function sensitiveResponse(response) {
  if(hapagObservedStaticNavigation403(response))return false;
  try {
    const url = new URL(response.url());
    const type = response.request().resourceType();
    return ['document','xhr','fetch'].includes(type) &&
      ['https://www.hapag-lloyd.com','https://identity.hapag-lloyd.com','https://navigator.api.hlag.cloud'].includes(url.origin);
  } catch { return false; }
}

function createOrdinaryHapagWebsiteLoginGate(page, {end, lifecycle, reservationPath,
  credentialPath = process.env.HAPAG_WEBSITE_CREDENTIALS_FILE,
  externalSafetyBarrier,
  externalSafetyObservation,
  readCredentials = readHapagWebsiteCredentials,
  reserveAttempt = (filename,document) => fs.writeFile(filename,JSON.stringify(document,null,2),{flag:'wx',mode:0o600}),
} = {}) {
  if (!page || !Number.isFinite(end) || !lifecycle || !reservationPath || guards.has(page))
    throw fail('HAPAG_LOGIN_GATE_SETUP_FAILED','The ordinary website login gate requires this task\'s worker-created page, fixed deadline and unique attempt receipt');
  const audit = {enabled:true,status:'OBSERVING',credentialSubmissions:0,loginAttemptsReserved:0,
    optionalCookieConfirms:0,announcementSkips:0,passiveCheckMs:0,verificationActions:0,
    fixedEntryNavigations:0,midQueryRecovery:false,blockedReason:null,statusResponses:[],
    transientDocument403sCleared:0};
  lifecycle.websiteLogin = audit;
  const privateValues = [];
  let sticky = null, lastPendingAt = null, ready = false, stopped = false;
  let normalDialogDeadline=null,normalDialogActive=false;
  const mainFrame = page.mainFrame?.();
  let documentGeneration = 0, currentDocument = null, document403Deadline = null;
  let navigationSequence = 0, activeNavigationRequest = null;
  const documentRequestRefs = new WeakMap();
  const document403s = [];
  const publicLocation = value => {
    const location=hapagSafePublicLocation(value);return location.origin?location:null;
  };
  const sameLocation = (left,right) => left && right && left.origin === right.origin && left.path === right.path;
  const unresolved403s = () => document403s.filter(item=>item.classification !== 'TRANSIENT_AUTOMATIC_CHECK_CLEARED');
  const blocked = (code,message,reason=code) => {
    sticky ??= fail(code,message);
    audit.status = 'BLOCKED';audit.blockedReason ??= reason;
    throw sticky;
  };
  const responseListener = response => {
    const status = response.status();
    if (![401,403,429].includes(status)) return;
    let request,location,type,navigation=false;
    try {
      request=response.request();location=publicLocation(response.url());type=request.resourceType();
      navigation=type==='document'&&request.isNavigationRequest?.()===true&&!!mainFrame&&request.frame?.()===mainFrame;
    } catch {sticky??=fail('HAPAG_WEBSITE_ACCESS_DENIED','An official refusal could not be safely attributed to its ordinary page response; automatic actions stopped');return;}
    if (!location) {sticky??=fail('HAPAG_WEBSITE_ACCESS_DENIED','An ordinary refusal response could not be recorded without exposing an invalid URL; automatic actions stopped');return;}
    if (audit.statusResponses.length >= 100) {sticky??=fail('HAPAG_WEBSITE_ACCESS_DENIED','The bounded ordinary refusal audit is full; automatic actions stopped without dropping a new refusal');return;}
    const item={sequence:audit.statusResponses.length+1,at:new Date().toISOString(),...location,
      resourceType:type,status,mainFrameNavigation:navigation,classification:'IGNORED_NON_ACCOUNT_RESOURCE'};
    audit.statusResponses.push(item);
    if(hapagObservedStaticNavigation403(response)){
      Object.assign(item,{classification:'NON_BUSINESS_STATIC_NAVIGATION_RESOURCE',method:'GET',hasQuery:false,hasFragment:false,exactStaticUrlConfirmed:true});return;
    }
    if (!sensitiveResponse(response)) return;
    if (status === 401 && ready) {
      sticky ??= fail('LOGIN_REQUIRED','The normal official account UI lost authentication during this query; the incomplete task stopped without another login or reused result');
      audit.blockedReason ??= 'MID_QUERY_LOGIN_REQUIRED';
    }
    if (status === 401) item.classification=ready?'MID_QUERY_AUTHENTICATION_LOST':'PRE_LOGIN_AUTHENTICATION_RESPONSE';
    if (status === 403) {
      if (navigation && request===activeNavigationRequest) {
        item.classification='DOCUMENT_403_AWAITING_VISIBLE_CHECK';
        item.receivedGeneration=documentGeneration;item.navigationSequence=navigationSequence;
        documentRequestRefs.set(item,request);
        document403s.push(item);
        document403Deadline??=Math.min(end,Date.now()+Math.max(0,30000-audit.passiveCheckMs));
      } else {
        item.classification='HARD_DENIAL';
        sticky ??= fail('HAPAG_WEBSITE_ACCESS_DENIED','The ordinary official UI returned a non-main-document 403; automatic actions stopped without retry');
      }
    }
    if (status === 429) {item.classification='HARD_RATE_LIMIT';sticky ??= fail('HAPAG_WEBSITE_RATE_LIMITED','The ordinary official website UI returned 429; login and query actions stopped without retry');}
  };
  const requestListener = request => {
    let mainNavigation=false;
    try {mainNavigation=request.resourceType()==='document'&&request.isNavigationRequest?.()===true&&!!mainFrame&&request.frame?.()===mainFrame;} catch {return;}
    if(!mainNavigation)return;
    const unproven=document403s.filter(item=>item.classification==='DOCUMENT_403_AWAITING_VISIBLE_CHECK');
    if(unproven.length) {
      for(const item of unproven)item.classification='UNKNOWN_DOCUMENT_403';
      sticky??=fail('HAPAG_WEBSITE_ACCESS_DENIED','A new main-frame navigation replaced a document 403 before its own visible automatic-check evidence was captured; no later document can clear that unknown refusal');
      audit.blockedReason??='DOCUMENT_403_REPLACED_BEFORE_PASSIVE_PROOF';
    }
    navigationSequence++;activeNavigationRequest=request;
  };
  const navigationListener = frame => {
    if (!mainFrame || frame !== mainFrame) return;
    documentGeneration++;
    currentDocument={...publicLocation(frame.url()),generation:documentGeneration,domReady:false};
    for(const item of document403s)if(item.classification==='DOCUMENT_403_AWAITING_VISIBLE_CHECK' &&
      item.receivedGeneration===documentGeneration-1 && item.navigationSequence===navigationSequence &&
      documentRequestRefs.get(item)===activeNavigationRequest && sameLocation(item,currentDocument)) item.documentGeneration=documentGeneration;
  };
  const domReadyListener = () => {if(currentDocument)currentDocument.domReady=true;};
  page.on('response',responseListener);
  page.on('request',requestListener);
  page.on('framenavigated',navigationListener);
  page.on('domcontentloaded',domReadyListener);

  const unconfirmed403 = () => {
    for(const item of document403s)if(item.classification==='DOCUMENT_403_AWAITING_VISIBLE_CHECK')item.classification='UNKNOWN_DOCUMENT_403';
    blocked('HAPAG_WEBSITE_ACCESS_DENIED','A document 403 was not proven to be its own visible automatic browser-check document; later login or query UI cannot clear that unknown refusal','DOCUMENT_403_NOT_CONFIRMED_AUTOMATIC_CHECK');
  };

  // Synchronous final barrier after awaited DOM reads and immediately before
  // an action or success decision; their earlier URL/status cannot be reused.
  const barrier = expectedKind => {
    externalSafetyBarrier?.();
    if (sticky) blocked(sticky.code,sticky.message);
    if (unresolved403s().length) unconfirmed403();
    budget(end);
    const kind = hapagWebsitePageKind(page.url());
    if (kind === 'UNEXPECTED_ORIGIN' || (expectedKind && kind !== expectedKind))
      blocked('LOGIN_REQUIRED','The owned official page changed during an awaited UI observation; no further action or success was accepted');
    return kind;
  };

  const redact = value => {
    if (typeof value === 'string') {
      let result = value;
      for (const secret of privateValues) if (secret) result = result.replaceAll(secret,'[credential redacted]');
      return result.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,'[email redacted]');
    }
    if (Array.isArray(value)) return value.map(redact);
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,redact(item)]));
    return value;
  };

  const observeSafety = async ({allowBlank=false}={}) => {
    externalSafetyBarrier?.();
    await externalSafetyObservation?.();
    if (sticky) blocked(sticky.code,sticky.message);
    budget(end);
    const kind = hapagWebsitePageKind(page.url());
    if (kind === 'UNEXPECTED_ORIGIN' || (kind === 'OWNED_BLANK' && !allowBlank))
      blocked('HAPAG_LOGIN_UNEXPECTED_ORIGIN','The owned page left the observed official website login origins; no credentials or alternate navigation were used');
    const observedGeneration=documentGeneration;
    let verification;
    try { verification = await checkHapagVerification(page); }
    catch (error) {
      if (error?.code === 'HUMAN_CAPTCHA') blocked('HUMAN_CAPTCHA','The official page requires human verification; no verification action or browser replacement was made');
      blocked('HAPAG_LOGIN_OBSERVATION_FAILED','The owned page could not be safely observed; no further login action was made');
    }
    const text = verification.text;
    if (/请验证您是真人/u.test(String(text).replace(/\s+/gu,'')) || /verify (?:that )?you are human|please complete the captcha/i.test(text))
      blocked('HUMAN_CAPTCHA','The official page requires human verification; no verification action or browser replacement was made');
    if (/verification code|verify your email|multi[ -]?factor|authenticator|one[ -]time (?:code|password)|two[ -]?factor/i.test(text))
      blocked('HAPAG_MFA_REQUIRED','The normal website login requires MFA or email verification; automatic recovery stopped without entering a code');
    if (/password is incorrect|invalid username|invalid password|incorrect.*password|can['’]t seem to find|cannot find your account/i.test(text))
      blocked('HAPAG_LOGIN_CREDENTIALS_REJECTED','The official normal website login rejected the account credentials; no further submission was attempted');
    if (/^\s*403 Forbidden\b|\baccess denied\b/i.test(text))
      blocked('HAPAG_WEBSITE_ACCESS_DENIED','The ordinary official page refused access; no login retry was made');
    if (/^\s*429\b|too many requests|rate limit exceeded/i.test(text))
      blocked('HAPAG_WEBSITE_RATE_LIMITED','The ordinary official page reported rate limiting; no login retry was made');
    const awaiting=document403s.filter(item=>item.classification==='DOCUMENT_403_AWAITING_VISIBLE_CHECK');
    if(awaiting.length) {
      // This must be the committed, DOM-ready document belonging to each 403,
      // never the previous document or a later normal login after a redirect.
      const body=await page.locator('body').innerText({timeout:budget(end)}).catch(()=> '');
      // The main body is a later observation than the frame check above. A
      // newly visible refusal must win over its earlier pending-only result.
      if (/请验证您是真人/u.test(body.replace(/\s+/gu,'')) || /verify (?:that )?you are human|please complete the captcha/i.test(body))
        blocked('HUMAN_CAPTCHA','The document 403 now visibly requires human verification; no automatic-check clearance or verification action was made');
      if (/verification code|verify your email|multi[ -]?factor|authenticator|one[ -]time (?:code|password)|two[ -]?factor/i.test(body))
        blocked('HAPAG_MFA_REQUIRED','The document 403 now visibly requires MFA; no automatic-check clearance or code entry was made');
      if (/password is incorrect|invalid username|invalid password|incorrect.*password|can['’]t seem to find|cannot find your account/i.test(body))
        blocked('HAPAG_LOGIN_CREDENTIALS_REJECTED','The document now visibly rejects the normal credentials; no automatic-check clearance or retry was made');
      if (/^\s*403 Forbidden\b|\baccess denied\b/i.test(body))
        blocked('HAPAG_WEBSITE_ACCESS_DENIED','The document 403 now visibly refuses access; no automatic-check clearance was made');
      if (/^\s*429\b|too many requests|rate limit exceeded/i.test(body))
        blocked('HAPAG_WEBSITE_RATE_LIMITED','The document now visibly reports rate limiting; no automatic-check clearance was made');
      const evidenceKind=/\bchecking your browser\b/i.test(body)?'CHECKING_YOUR_BROWSER':
        /\bSecurity Check\b/i.test(body)&&/\bTechnical Details\b[\s\S]*\bManaged Challenge\b/i.test(body)?'TECHNICAL_DETAILS_MANAGED_CHALLENGE':null;
      const mainPending=!!evidenceKind;
      if (!verification.pending || !mainPending || documentGeneration!==observedGeneration || !currentDocument?.domReady ||
          !sameLocation(currentDocument,publicLocation(page.url())) || awaiting.some(item=>
            item.documentGeneration!==documentGeneration||!sameLocation(item,currentDocument))) unconfirmed403();
      for(const item of awaiting) {
        item.classification='PASSIVE_AUTOMATIC_CHECK_OBSERVED';
        item.pendingObservedAt=new Date().toISOString();item.pendingEvidenceKind=evidenceKind;
        item.automaticCheckPendingObserved=true;item.interactiveVerificationObserved=false;
      }
    }
    if (lastPendingAt !== null) audit.passiveCheckMs += Date.now() - lastPendingAt;
    lastPendingAt = verification.pending || unresolved403s().length ? Date.now() : null;
    if (audit.passiveCheckMs >= 30000 || (unresolved403s().length && Date.now()>=document403Deadline))
      blocked('HUMAN_CAPTCHA','The passive official browser check did not finish within 30 seconds of the original query budget; no verification action was made','PASSIVE_CHECK_TIMEOUT');
    if(normalDialogActive&&verification.pending&&Date.now()>=normalDialogDeadline)
      blocked('HAPAG_LOGIN_UNEXPECTED_DIALOG','The unrecognized ordinary login dialog did not disappear within its single bounded read-only wait; no unknown dialog was clicked');
    if (sticky) blocked(sticky.code,sticky.message);
    externalSafetyBarrier?.();
    return {kind,pending:verification.pending};
  };

  const pause = async () => page.waitForTimeout(Math.min(200,budget(end,200)));
  const resolveObservedDocument403s = async () => {
    const unresolved=unresolved403s();
    if(!unresolved.length)return true;
    if(unresolved.some(item=>item.classification!=='PASSIVE_AUTOMATIC_CHECK_OBSERVED'))unconfirmed403();
    const generation=documentGeneration,kind=hapagWebsitePageKind(page.url());
    let terminal=null;
    if(kind==='NORMAL_LOGIN') {
      const username=page.getByRole('textbox',{name:'E-mail Address',exact:true});
      const password=page.getByRole('textbox',{name:'Password',exact:true});
      const submit=page.getByRole('button',{name:'Log in',exact:true});
      if(await username.count()===1&&await username.isVisible()&&await password.count()===1&&await password.isVisible()&&
          await submit.count()===1&&await submit.isVisible()&&await submit.isEnabled()&&
          await username.getAttribute('id')==='signInName'&&await username.getAttribute('type')==='text'&&
          await password.getAttribute('id')==='password'&&await password.getAttribute('type')==='password'&&
          await page.locator('input[type="password"]:visible').count()===1)terminal='NORMAL_LOGIN';
    } else if(kind==='NAVIGATOR') {
      const search=page.getByRole('searchbox',{name:'Search text',exact:true});
      const category=page.getByRole('combobox',{name:CATEGORY});
      if(await search.count()===1&&await search.isVisible()&&await category.count()===1&&await category.isVisible()&&
          await page.locator('input[type="password"]:visible').count()===0)terminal='NAVIGATOR_QUERY_UI';
    }
    if(sticky)blocked(sticky.code,sticky.message);
    if(document403s.some(item=>item.classification==='DOCUMENT_403_AWAITING_VISIBLE_CHECK'))unconfirmed403();
    budget(end);
    if(Date.now()>=document403Deadline)
      blocked('HUMAN_CAPTCHA','The proven automatic-check document did not naturally reach normal login or Navigator within its original 30-second passive budget','PASSIVE_CHECK_TIMEOUT');
    if(!terminal||generation!==documentGeneration||kind!==hapagWebsitePageKind(page.url()))return false;
    for(const item of unresolved) {
      item.classification='TRANSIENT_AUTOMATIC_CHECK_CLEARED';item.clearedAt=new Date().toISOString();item.clearedTo=terminal;
      audit.transientDocument403sCleared++;
    }
    lastPendingAt=null;
    return true;
  };
  const safetyReady = async options => {
    for (;;) {
      const observed = await observeSafety(options);
      if (!observed.pending && await resolveObservedDocument403s()) return {...observed,kind:hapagWebsitePageKind(page.url())};
      audit.status = 'PASSIVE_CHECK';
      await pause();
    }
  };
  const uniqueVisible = async locator => await locator.count() === 1 && await locator.isVisible();

  const confirmCookiePreferences = async () => {
    const pageKind = hapagWebsitePageKind(page.url());
    const panel = page.locator('#onetrust-pc-sdk');
    if (await panel.count() > 1) blocked('HAPAG_LOGIN_COOKIE_DIALOG_UNRECOGNIZED','The ordinary privacy preference panel is ambiguous; no privacy choice was changed');
    if (!await panel.isVisible().catch(()=>false)) return;
    if (audit.optionalCookieConfirms !== 0)
      blocked('HAPAG_LOGIN_COOKIE_DIALOG_UNRECOGNIZED','The privacy preference panel reappeared after its one confirmed action; automatic login stopped');
    const choices = () => panel.locator('input[id^="ot-group-id-"]').evaluateAll(elements=>elements.map(element=>({id:element.id,type:element.type,checked:element.checked})));
    const choicesSafe = optional => optional.length >= 4 && optional.every(item=>item.type === 'checkbox' && item.checked === false) && new Set(optional.map(item=>item.id)).size === optional.length;
    if (!choicesSafe(await choices()))
      blocked('HAPAG_LOGIN_COOKIE_CHOICES_UNCONFIRMED','The observed optional privacy checkboxes are not all uniquely present and unchecked; no privacy confirmation was made');
    const button = panel.getByRole('button',{name:'Confirm My Choices',exact:true});
    if (!await uniqueVisible(button) || !await button.isEnabled())
      blocked('HAPAG_LOGIN_COOKIE_DIALOG_UNRECOGNIZED','The unique observed privacy confirmation is unavailable; no other privacy button was used');
    await safetyReady();
    if(hapagWebsitePageKind(page.url())==='NORMAL_LOGIN'&&!await waitNormalLoginDialog())
      blocked('LOGIN_REQUIRED','The ordinary login destination changed while its known privacy confirmation was being checked');
    if (!await uniqueVisible(button) || !await button.isEnabled() || !choicesSafe(await choices()))
      blocked('HAPAG_LOGIN_COOKIE_CHOICES_UNCONFIRMED','The observed optional privacy choices changed before confirmation; no privacy confirmation was made');
    barrier(pageKind);
    audit.optionalCookieConfirms++;
    await button.click({timeout:budget(end,7000)});
    await panel.waitFor({state:'hidden',timeout:budget(end,7000)});
  };

  const dismissObservedAnnouncement = async () => {
    const dialogs = page.locator('[role="dialog"]:visible');
    const count = await dialogs.count();
    if (!count) return;
    const announcement = page.locator('[role="dialog"].q-dialog---announcement:visible');
    if (count !== 1 || await announcement.count() !== 1 || clean(await announcement.innerText()) !== ANNOUNCEMENT_TEXT || audit.announcementSkips !== 0)
      blocked('HAPAG_NAVIGATOR_UNEXPECTED_DIALOG','An unrecognized or repeated ordinary account dialog blocks Navigator; no generic close or alternate product link was clicked');
    const skip = announcement.getByRole('button',{name:'Skip This Time',exact:true});
    if (!await uniqueVisible(skip) || !await skip.isEnabled())
      blocked('HAPAG_NAVIGATOR_UNEXPECTED_DIALOG','The exact observed Navigator announcement does not expose one ready Skip This Time button');
    await safetyReady();
    if (await dialogs.count() !== 1 || await announcement.count() !== 1 || clean(await announcement.innerText()) !== ANNOUNCEMENT_TEXT ||
        !await uniqueVisible(skip) || !await skip.isEnabled())
      blocked('HAPAG_NAVIGATOR_UNEXPECTED_DIALOG','The exact observed announcement changed before its one Skip This Time action');
    barrier('NAVIGATOR');
    audit.announcementSkips++;
    await skip.click({timeout:budget(end,7000)});
    await announcement.waitFor({state:'hidden',timeout:budget(end,7000)});
  };

  const clearFilledLogin = async () => {
    if (hapagWebsitePageKind(page.url()) !== 'NORMAL_LOGIN') return;
    for (const name of ['Password','E-mail Address']) {
      const field = page.getByRole('textbox',{name,exact:true});
      if (await uniqueVisible(field).catch(()=>false)) await field.fill('',{timeout:Math.min(1000,Math.max(1,end-Date.now()))}).catch(()=>{});
    }
  };

  const requireLoginControls = async (username,password,submit) => {
    if(!await waitNormalLoginDialog())
      blocked('LOGIN_REQUIRED','The ordinary login destination changed while its unknown dialog was being observed');
    if (hapagWebsitePageKind(page.url()) !== 'NORMAL_LOGIN' || !await uniqueVisible(username) ||
        !await uniqueVisible(password) || !await uniqueVisible(submit) || !await submit.isEnabled() ||
        await username.getAttribute('id') !== 'signInName' || await username.getAttribute('type') !== 'text' ||
        await password.getAttribute('id') !== 'password' || await password.getAttribute('type') !== 'password')
      blocked('HAPAG_LOGIN_FORM_UNRECOGNIZED','The exact normal website login destination or unique field identities changed; no further credential action was made');
    barrier('NORMAL_LOGIN');
  };

  const waitNormalLoginDialog = async () => {
    const dialogs=page.locator('[role="dialog"]:visible');
    try {
      for(;;) {
        const count=await dialogs.count();
        if(!count){
          if(normalDialogActive&&Date.now()>=normalDialogDeadline){
            audit.normalLoginDialogWait.status='TIMEOUT';
            blocked('HAPAG_LOGIN_UNEXPECTED_DIALOG','The unknown login dialog disappeared only after its fixed read-only deadline; no subsequent action was authorized');
          }
          if(audit.normalLoginDialogWait)audit.normalLoginDialogWait.status='NATURALLY_DISAPPEARED';return true;
        }
        if(hapagWebsitePageKind(page.url())!=='NORMAL_LOGIN')return false;
        // Only the already observed privacy panel can be delegated to its
        // existing exact handler. An SDK/login-form parent is not guessed.
        if(count===1&&await dialogs.getAttribute?.('id')==='onetrust-pc-sdk')return true;
        if(count>0 && typeof dialogs.evaluateAll==='function' &&
          await dialogs.evaluateAll(areKnownHapagPrivacyDialogs))return true;
        normalDialogDeadline??=Math.min(end-100,Date.now()+8000);
        audit.normalLoginDialogWait??={startedAt:new Date(Date.now()).toISOString(),deadline:new Date(normalDialogDeadline).toISOString(),
          policy:'READ_ONLY_UNRECOGNIZED_DIALOG',dialogClicks:0,status:'WAITING',observations:0};
        audit.normalLoginDialogWait.status='WAITING';
        normalDialogActive=true;audit.normalLoginDialogWait.observations++;
        await safetyReady();
        if(Date.now()>=normalDialogDeadline) {
          audit.normalLoginDialogWait.status='TIMEOUT';
          blocked('HAPAG_LOGIN_UNEXPECTED_DIALOG','The unrecognized ordinary login dialog remained after its single 8-second read-only wait; no unknown dialog was clicked');
        }
        if(hapagWebsitePageKind(page.url())!=='NORMAL_LOGIN')return false;
        if(!await dialogs.count()){
          if(Date.now()>=normalDialogDeadline){
            audit.normalLoginDialogWait.status='TIMEOUT';
            blocked('HAPAG_LOGIN_UNEXPECTED_DIALOG','The unknown login dialog was confirmed gone only after its fixed read-only deadline; no subsequent action was authorized');
          }
          audit.normalLoginDialogWait.status='NATURALLY_DISAPPEARED';return true;
        }
        await page.waitForTimeout(Math.min(200,normalDialogDeadline-Date.now(),budget(end,200)));
      }
    }finally{normalDialogActive=false;}
  };

  const ensureReady = async () => {
    try {
      for (;;) {
        const {kind} = await safetyReady();
        const passwordCount = await page.locator('input[type="password"]:visible').count();
        if (kind === 'NAVIGATOR' && passwordCount === 0) {
          const search = page.getByRole('searchbox',{name:'Search text',exact:true});
          const category = page.getByRole('combobox',{name:CATEGORY});
          if (await search.count() > 1 || await category.count() > 1)
            blocked('HAPAG_LOGIN_QUERY_UI_AMBIGUOUS','The owned Navigator page has ambiguous ordinary query controls; no query was started');
          if (await uniqueVisible(search) && await uniqueVisible(category)) {
            await confirmCookiePreferences();
            await dismissObservedAnnouncement();
            await safetyReady();
            if (hapagWebsitePageKind(page.url()) !== 'NAVIGATOR' || await page.locator('input[type="password"]:visible').count() !== 0 ||
                !await uniqueVisible(search) || !await uniqueVisible(category)) continue;
            barrier('NAVIGATOR');
            ready = true;audit.status = 'AUTHENTICATED_QUERY_UI_READY';
            return {...audit};
          }
        }
        if (passwordCount > 0 && kind !== 'NORMAL_LOGIN')
          blocked('LOGIN_REQUIRED','A password form outside the observed normal website login contract appeared; no credentials were entered');
        if (kind === 'NORMAL_LOGIN') {
          if(!await waitNormalLoginDialog())continue;
          await confirmCookiePreferences();
          if(!await waitNormalLoginDialog())continue;
          const username = page.getByRole('textbox',{name:'E-mail Address',exact:true});
          const password = page.getByRole('textbox',{name:'Password',exact:true});
          const submit = page.getByRole('button',{name:'Log in',exact:true});
          if (await username.count() > 1 || await password.count() > 1 || await submit.count() > 1 || passwordCount > 1)
            blocked('HAPAG_LOGIN_FORM_UNRECOGNIZED','The exact normal website login controls are ambiguous; no credential was entered');
          if (!audit.loginAttemptsReserved && await uniqueVisible(username) && await uniqueVisible(password) && await uniqueVisible(submit) && await submit.isEnabled()) {
            await requireLoginControls(username,password,submit);
            await safetyReady();
            const credentials = await readCredentials(credentialPath);
            privateValues.push(credentials.username,credentials.password);
            await safetyReady();
            if (hapagWebsitePageKind(page.url()) !== 'NORMAL_LOGIN')
              blocked('HAPAG_LOGIN_FORM_UNRECOGNIZED','The owned login destination changed before the one normal credential submission');
            await reserveAttempt(reservationPath,{at:new Date().toISOString(),normalWebsiteLogin:true,apiPortalLogin:false,
              maximumSubmissions:1,credentialValuesRecorded:false,originalQueryDeadline:new Date(end).toISOString()});
            audit.loginAttemptsReserved = 1;audit.status = 'LOGIN_SUBMITTED';
            await requireLoginControls(username,password,submit);
            await username.fill(credentials.username,{timeout:budget(end,7000)});
            await safetyReady();
            await requireLoginControls(username,password,submit);
            await password.fill(credentials.password,{timeout:budget(end,7000)});
            await safetyReady();
            await requireLoginControls(username,password,submit);
            audit.credentialSubmissions = 1;
            await submit.click({timeout:budget(end,10000)});
          }
        }
        await pause();
      }
    } catch (error) {
      // A detected verification/access block permits no further page actions.
      // Unknown native failures may clear this task's filled normal fields;
      // all unfinished login pages are excluded from evidence either way.
      if (privateValues.length && !sticky && !unresolved403s().length && error?.name !== 'HapagWebsiteLoginError') await clearFilledLogin().catch(()=>{});
      if (error?.name === 'HapagWebsiteLoginError') {audit.status='BLOCKED';audit.blockedReason??=error.code;throw error;}
      blocked('HAPAG_LOGIN_ACTION_STOPPED','The exact normal website login or observed ordinary dialog action could not complete; no alternative action or credential retry was made');
    }
  };

  const guard = {audit,redact,
    beforeEntry:async()=>{
      try {await safetyReady({allowBlank:true});audit.fixedEntryNavigations = 1;}
      catch (error) {if(error?.name==='HapagWebsiteLoginError')throw error;blocked('HAPAG_LOGIN_OBSERVATION_FAILED','The owned page could not be safely checked before its fixed Navigator entry');}
    },
    ensureReady,
    assertAvailable:async()=>{
      await safetyReady();
      // This ordinary product announcement can mount after the search input.
      // Handle only its already observed exact contract; container dialogs are
      // left to the bound shipment controller.
      if (ready && await page.locator('[role="dialog"].q-dialog---announcement:visible').count()) {
        await dismissObservedAnnouncement();
        await safetyReady();
      }
      const passwordCount = await page.locator('input[type="password"]:visible').count();
      barrier();
      if (!ready || hapagWebsitePageKind(page.url()) !== 'NAVIGATOR' || passwordCount)
        blocked('LOGIN_REQUIRED','Normal account login became required during the query; this candidate stopped the incomplete task without mid-query login, replacement page, or reused result','MID_QUERY_LOGIN_REQUIRED');
    },
    safeToCapture:async()=>ready && hapagWebsitePageKind(page.url()) === 'NAVIGATOR' &&
      await page.locator('input[type="password"]:visible').count().catch(()=>1) === 0,
    screenshotOptions:()=>({mask:[page.locator('input[type="password"], #signInName'),
      page.getByText(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i),
      ...privateValues.filter(Boolean).map(value=>page.getByText(value,{exact:false}))]}),
    safeError:error=>{
      const own = ['HapagWebsiteLoginError','HapagNavigatorError'].includes(error?.name);
      const code = /^[A-Z0-9_]{1,80}$/.test(error?.code ?? '') ? error.code : 'NAVIGATOR_UI_FAILURE';
      return Object.assign(new Error(own ? redact(error.message) : 'The owned Navigator UI action stopped before complete fresh evidence was confirmed; sensitive browser diagnostics were omitted'),
        {name:own?error.name:'HapagNavigatorError',code});
    },
    stop:()=>{if(!stopped){page.off('response',responseListener);page.off('request',requestListener);page.off('framenavigated',navigationListener);page.off('domcontentloaded',domReadyListener);stopped=true;guards.delete(page);}},
  };
  guards.set(page,guard);
  return guard;
}

export const hapagWebsiteLoginGuard = page => guards.get(page);

const PUBLIC_ENTRY='https://www.hapag-lloyd.com/solutions/navigator/';
const HUMAN_TEXT=/请?验证[您你]?是?真人|verify (?:that )?you are human|please complete the captcha/i;
const humanPrompt=text=>HUMAN_TEXT.test(text)||/请?验证[您你]?是?真人/.test(text.replace(/\s+/g,''));
const SECURITY_TEXT=/Security Check|checking your browser|Managed Challenge|Interactive Challenge/i;
const MFA_TEXT=/verification code|verify your email|multi[ -]?factor|authenticator|one[ -]time (?:code|password)|two[ -]?factor/i;
const WRONG_PASSWORD=/password is incorrect|invalid username|invalid password|incorrect.*password|can['’]t seem to find|cannot find your account/i;
export const hapagSafePublicLocation=value=>{try{const u=new URL(value);
  if(['https:','http:'].includes(u.protocol)) {
    let publicPath=u.pathname;
    if(u.hostname==='challenges.cloudflare.com'||u.hostname.endsWith('.challenges.cloudflare.com'))
      publicPath=u.pathname.startsWith('/cdn-cgi/challenge-platform/')?'/cdn-cgi/challenge-platform/[opaque]':u.pathname.startsWith('/turnstile/')?'/turnstile/[opaque]':'/[opaque]';
    else if(u.hostname==='hcaptcha.com'||u.hostname.endsWith('.hcaptcha.com'))publicPath='/[opaque]';
    return {origin:u.origin,path:publicPath};
  }
  return {origin:u.protocol,path:u.protocol==='about:'&&['blank','srcdoc'].includes(u.pathname)?u.pathname:'[opaque]'};
}catch{return {origin:null,path:null};}};
const shortLocation=hapagSafePublicLocation;
const readFailureReason=error=>{
  const text=String(error?.message??error??'');
  if(/execution context.*destroyed|cannot find context|context.*not found|most likely because of a navigation/i.test(text))return 'CONTEXT_DESTROYED';
  if(/detached|frame.*closed/i.test(text))return 'FRAME_DETACHED';
  if(error?.name==='TimeoutError'||/timed? ?out|timeout.*exceeded/i.test(text))return 'READ_TIMEOUT';
  return 'READ_UNAVAILABLE';
};

// Read-only tri-state observation. Checkbox inspection is independent of body
// readability; an unreadable verification frame is UNKNOWN, never false.
export async function readHapagPublicEntrySnapshot(page,{timeout=2000,deadline=Infinity}={}) {
  const capturedUrl=page.url(),kind=hapagWebsitePageKind(capturedUrl);
  let mainText='',mainRead='READ',mainFailureReason=null;
  try{if(Date.now()>=deadline)throw Error();mainText=await page.locator('body').innerText({timeout:Math.max(1,Math.min(timeout,deadline-Date.now()))});}catch(error){mainRead='UNKNOWN';mainFailureReason=readFailureReason(error);}
  const mainSecurity=SECURITY_TEXT.test(mainText),frames=[],readFailures=[];
  let widget=humanPrompt(mainText)?'PRESENT':'NOT_OBSERVED';
  let verificationSurface=mainSecurity||widget==='PRESENT',mfa=MFA_TEXT.test(mainText),wrongPassword=WRONG_PASSWORD.test(mainText);
  let frameIndex=0;
  for(const frame of page.frames()) {
    if(Date.now()>=deadline){if(widget!=='PRESENT')widget='UNKNOWN';readFailures.push({operation:'observation-deadline'});break;}
    const index=frameIndex++,row={index,...shortLocation(frame.url?.()??''),visible:null,textRead:'NOT_READ',checkboxRead:'NOT_READ',visibleCheckboxes:null};
    let element,isChallenge=/challenges\.cloudflare\.com|turnstile/i.test(frame.url?.()??''),width=0,height=0,ordinaryAuxiliary=false;
    try {
      if(frame.parentFrame()) {
        for(let current=frame;current.parentFrame();current=current.parentFrame()) {
          const embed=await current.frameElement();
          try{if(!await embed.isVisible()){row.visible=false;break;}}finally{await embed.dispose();}
        }
        if(row.visible===false){frames.push(row);continue;}
        element=await frame.frameElement();const box=await element.boundingBox();width=box?.width??0;height=box?.height??0;
        const title=await element.getAttribute('title')??'',src=await element.getAttribute('src')??'',name=await element.getAttribute('name')??'';
        ordinaryAuxiliary=title==='onetrust-text-resize';
        isChallenge||=/challenges\.cloudflare\.com|turnstile/i.test(src)||/cloudflare|challenge|turnstile/i.test(title)||/^cf-/i.test(name);
        row.challengeFrame=isChallenge;row.visible=width>1&&height>1;
        if(!row.visible){frames.push(row);continue;}
      } else row.visible=true;
      try {
        const boxes=frame.locator('input[type="checkbox"], [role="checkbox"]');let count=0;
        for(let i=0;i<await boxes.count();i++)if(await boxes.nth(i).isVisible())count++;
        row.visibleCheckboxes=count;row.checkboxRead='READ';
      }catch(error){row.checkboxRead='UNKNOWN';readFailures.push({index,operation:'checkbox',reason:readFailureReason(error)});}
      let text='';
      try{text=frame.parentFrame()?await frame.locator('body').innerText({timeout:Math.max(1,Math.min(timeout,deadline-Date.now()))}):mainText;row.textRead=frame.parentFrame()?'READ':mainRead;}
      catch(error){row.textRead='UNKNOWN';readFailures.push({index,operation:'body',reason:readFailureReason(error)});}
      const frameSecurity=SECURITY_TEXT.test(text),human=humanPrompt(text);
      mfa||=MFA_TEXT.test(text);wrongPassword||=WRONG_PASSWORD.test(text);
      if(human||((isChallenge||frameSecurity||mainSecurity)&&row.visibleCheckboxes>0))widget='PRESENT';
      else if(widget!=='PRESENT'&&((isChallenge&&(row.textRead==='UNKNOWN'||!text||row.checkboxRead==='UNKNOWN'))||
        (!ordinaryAuxiliary&&row.checkboxRead==='UNKNOWN')||
        (!ordinaryAuxiliary&&frame.parentFrame()&&width>32&&height>32&&(row.textRead==='UNKNOWN'||!text))))widget='UNKNOWN';
      verificationSurface||=isChallenge||frameSecurity||human;
    }catch(error){
      row.textRead='UNKNOWN';readFailures.push({index,operation:'frame-observation',reason:readFailureReason(error)});
      if(isChallenge&&row.visible!==false)verificationSurface=true;
      if(widget!=='PRESENT')widget='UNKNOWN';
    }finally{await element?.dispose().catch(()=>{});}
    frames.push(row);
  }
  if(mainRead==='UNKNOWN'){readFailures.push({index:0,operation:'main-body',reason:mainFailureReason});if(widget!=='PRESENT')widget='UNKNOWN';}
  let terminal=null;
  const unique=async locator=>await locator.count()===1&&await locator.isVisible();
  if(Date.now()>=deadline){if(widget!=='PRESENT')widget='UNKNOWN';readFailures.push({operation:'observation-deadline'});}
  if(!verificationSurface&&widget==='NOT_OBSERVED'&&mainRead==='READ') {
    if(kind==='NORMAL_LOGIN') {
      const user=page.getByRole('textbox',{name:'E-mail Address',exact:true}),password=page.getByRole('textbox',{name:'Password',exact:true}),submit=page.getByRole('button',{name:'Log in',exact:true});
      if(await unique(user)&&await unique(password)&&await unique(submit)&&await submit.isEnabled()&&
        await user.getAttribute('id')==='signInName'&&await user.getAttribute('type')==='text'&&
        await password.getAttribute('id')==='password'&&await password.getAttribute('type')==='password'&&
        await page.locator('input[type="password"]:visible').count()===1)terminal='NORMAL_LOGIN';
    } else if(kind==='NAVIGATOR') {
      const search=page.getByRole('searchbox',{name:'Search text',exact:true}),category=page.getByRole('combobox',{name:CATEGORY});
      if(await unique(search)&&await unique(category)&&await page.locator('input[type="password"]:visible').count()===0)terminal='NAVIGATOR_QUERY_UI';
    }
  }
  const observedEndUrl=page.url(),pageChangedDuringObservation=observedEndUrl!==capturedUrl;
  const sameOfficialNavigatorLocation=kind==='NAVIGATOR'&&hapagWebsitePageKind(observedEndUrl)==='NAVIGATOR';
  if(pageChangedDuringObservation||Date.now()>=deadline)terminal=null;
  return {kind,...shortLocation(capturedUrl),terminal,widget,verificationSurface,mainTextRead:mainRead,frames,readFailures,pageChangedDuringObservation,sameOfficialNavigatorLocation,mfa,wrongPassword,
    accessDenied:/^\s*403 Forbidden\b|\baccess denied\b/i.test(mainText),rateLimited:/^\s*429\b|too many requests|rate limit exceeded/i.test(mainText)};
}

function createPassiveHapagWebsiteLoginGate(page,options) {
  const {lifecycle,reservationPath,epochId='UNPROVIDED',ownedPageId='UNPROVIDED',publicSnapshotReader=readHapagPublicEntrySnapshot}=options;
  if(!page||!lifecycle||!reservationPath||guards.has(page))throw fail('HAPAG_LOGIN_GATE_SETUP_FAILED','The passive gate requires its original worker-created page and task receipt');
  let inner=null,sticky=null,stopped=false,started=false,ordinary=false,skipNavigation=false,queryEnd=null,hardEnd=null,passiveEnd=null;
  const base={enabled:true,status:'OBSERVING',credentialSubmissions:0,loginAttemptsReserved:0,verificationActions:0,statusResponses:[]};
  const audit={enabled:true,configuredMs:600000,epochId,ownedPageId,phase:'PRE_ENTRY',startedAt:null,passiveDeadline:null,overallDeadline:null,
    ordinaryStartedAt:null,ordinaryDeadline:null,elapsedMs:0,pageActionsDuringWait:0,verificationActions:0,CaptchaSolved:false,
    widgetSeen:false,securitySeen:false,widgetDetection:'UNKNOWN',readFailureCount:0,observations:[],statusResponses:[],classification:'PUBLIC_ENTRY_WAIT_UNRESOLVED'};
  base.publicEntryWait=audit;lifecycle.websiteLogin=base;
  const block=(code,message,reason=code)=>{
    sticky??=fail(code,message);audit.phase='BLOCKED';audit.blockedReason??=reason;
    if(started)audit.elapsedAtStopMs=Date.now()-Date.parse(audit.startedAt);
    (inner?.audit??base).status='BLOCKED';(inner?.audit??base).blockedReason??=reason;throw sticky;
  };
  const assertHard=()=>{
    if(sticky)throw sticky;
    if(hardEnd===null&&Date.now()>=hapagTestDeadline())block('HUMAN_CAPTCHA','The optional QA deadline ended before the passive entry; no page action was made','QA_DEADLINE');
    if(hardEnd!==null&&Date.now()>=hardEnd)block('HUMAN_CAPTCHA','The fixed QA/750-second task deadline ended; no further page action was made','OVERALL_DEADLINE');
    if(ordinary&&Date.now()>=queryEnd)block('LOGIN_REQUIRED','The original 150-second normal-login and query budget ended; no new passive window was opened','ORDINARY_DEADLINE');
  };
  const responseListener=response=>{
    const status=response.status();if(![401,403,429].includes(status))return;
    let request,type,location,navigation=false;
    try{request=response.request();type=request.resourceType();location=shortLocation(response.url());navigation=type==='document'&&request.isNavigationRequest?.()===true&&request.frame?.()===page.mainFrame?.();}
    catch{sticky??=fail('HAPAG_WEBSITE_ACCESS_DENIED','An ordinary refusal response could not be safely observed');return;}
    if(audit.statusResponses.length>=100){sticky??=fail('HAPAG_WEBSITE_ACCESS_DENIED','The bounded refusal audit is full; automatic actions stopped');return;}
    const item={sequence:audit.statusResponses.length+1,at:new Date().toISOString(),...location,resourceType:type,status,mainFrameNavigation:navigation,classification:'IGNORED_NON_ACCOUNT_RESOURCE'};
    audit.statusResponses.push(item);
    if(hapagObservedStaticNavigation403(response)){
      Object.assign(item,{classification:'NON_BUSINESS_STATIC_NAVIGATION_RESOURCE',method:'GET',hasQuery:false,hasFragment:false,exactStaticUrlConfirmed:true});return;
    }
    if(!sensitiveResponse(response))return;
    if(status===429){item.classification='HARD_RATE_LIMIT';sticky??=fail('HAPAG_WEBSITE_RATE_LIMITED','The official UI returned 429; passive observation cannot authorize a retry');}
    if(status===403) {
      if(!ordinary&&started&&navigation&&location.origin==='https://www.hapag-lloyd.com'&&/^\/solutions\/navigator\/?$/.test(location.path)) {
        item.classification='PUBLIC_ENTRY_WAIT_UNRESOLVED';audit.securitySeen=true;
      } else {item.classification='HARD_DENIAL';sticky??=fail('HAPAG_WEBSITE_ACCESS_DENIED','An official response outside the passive public-entry exception returned 403; automatic actions stopped');}
    }
    if(status===401&&ordinary&&inner?.audit.status==='AUTHENTICATED_QUERY_UI_READY'){item.classification='MID_QUERY_AUTHENTICATION_LOST';sticky??=fail('LOGIN_REQUIRED','The official account UI lost authentication after query readiness; no new passive window was opened');}
    else if(status===401)item.classification='PRE_LOGIN_AUTHENTICATION_RESPONSE';
  };
  page.on('response',responseListener);
  const observe=async({deadlineOverride=Infinity}={})=>{
    assertHard();
    if(page.isClosed?.())block('HAPAG_LOGIN_OBSERVATION_FAILED','The original owned page closed; no replacement page was adopted');
    let snapshot;
    const observationEnd=Math.min((ordinary?queryEnd:passiveEnd)??hapagTestDeadline(),deadlineOverride);
    try{snapshot=await publicSnapshotReader(page,{timeout:Math.max(1,Math.min(2000,observationEnd-Date.now())),deadline:observationEnd});}
    catch{block('HAPAG_LOGIN_OBSERVATION_FAILED','The original page could not be safely observed; sensitive diagnostics were omitted');}
    assertHard();
    if(snapshot.kind==='UNEXPECTED_ORIGIN')block('HAPAG_LOGIN_UNEXPECTED_ORIGIN','The original page left the official login origins; no alternate entry was used');
    if(snapshot.mfa)block('HAPAG_MFA_REQUIRED','The official page requires MFA; the passive public-entry exception cannot enter a code');
    if(snapshot.wrongPassword)block('HAPAG_LOGIN_CREDENTIALS_REJECTED','The normal website rejected credentials; no passive or credential retry was made');
    if(snapshot.rateLimited)block('HAPAG_WEBSITE_RATE_LIMITED','The official page reports rate limiting; passive waiting cannot authorize a retry');
    audit.widgetSeen||=snapshot.widget==='PRESENT';audit.securitySeen||=snapshot.verificationSurface||snapshot.widget==='PRESENT';
    audit.widgetDetection=snapshot.widget;audit.readFailureCount+=snapshot.readFailures?.length??0;
    const row={at:new Date().toISOString(),elapsedMs:started?Date.now()-Date.parse(audit.startedAt):0,
      kind:snapshot.kind,origin:snapshot.origin,path:snapshot.path,terminal:snapshot.terminal,widget:snapshot.widget,
      verificationSurface:snapshot.verificationSurface,mainTextRead:snapshot.mainTextRead,frames:snapshot.frames,readFailures:snapshot.readFailures,
      pageChangedDuringObservation:snapshot.pageChangedDuringObservation,sameOfficialNavigatorLocation:snapshot.sameOfficialNavigatorLocation,accessDenied:snapshot.accessDenied};
    if(audit.observations.length<650)audit.observations.push(row);
    return snapshot;
  };
  let initialSnapshot=null;
  let ordinaryObservationDeadline=null;
  const ordinaryObservation=async()=>{
    const observationStarted=Date.now();let snapshot=await observe(),waitingThisCall=false;
    for(;;) {
      const knownChallenge=snapshot.frames?.some(frame=>frame.visible!==false&&(frame.challengeFrame||/challenges\.cloudflare\.com|hcaptcha\.com/i.test(frame.origin??'')));
      if(snapshot.verificationSurface||snapshot.widget==='PRESENT'||knownChallenge)
        block('HUMAN_CAPTCHA','Verification reappeared after the ordinary phase began; no new passive window or verification action was used','VERIFICATION_REAPPEARED_AFTER_ENTRY');
      if(snapshot.accessDenied)block('HAPAG_WEBSITE_ACCESS_DENIED','The ordinary account page visibly refused access after the passive entry phase ended');
      const readableNavigator=state=>state.kind==='NAVIGATOR'&&state.sameOfficialNavigatorLocation===true&&
        state.mainTextRead==='READ'&&state.widget==='NOT_OBSERVED'&&!state.verificationSurface&&(state.readFailures?.length??0)===0;
      if(snapshot.pageChangedDuringObservation&&readableNavigator(snapshot)&&inner?.audit.status==='AUTHENTICATED_QUERY_UI_READY') {
        const stableDeadline=Math.min(observationStarted+2000,queryEnd,hardEnd);
        const stableAudit={startedAt:new Date(observationStarted).toISOString(),deadline:new Date(stableDeadline).toISOString(),
          policy:'READ_ONLY_NAVIGATOR_URL_STABILITY',pageActions:0,status:'WAITING',observations:0};
        audit.navigatorUrlStabilityWaits??=[];audit.navigatorUrlStabilityWaits.push(stableAudit);
        for(;;) {
          if(Date.now()>=stableDeadline){stableAudit.status='TIMEOUT';block('HAPAG_LOGIN_OBSERVATION_FAILED','The readable Navigator URL did not stabilize within its fixed 2-second observation window','NAVIGATOR_URL_UNSTABLE');}
          await page.waitForTimeout(Math.max(1,Math.min(100,stableDeadline-Date.now())));
          snapshot=await observe({deadlineOverride:stableDeadline});stableAudit.observations++;
          const challenge=snapshot.frames?.some(frame=>frame.visible!==false&&(frame.challengeFrame||/challenges\.cloudflare\.com|hcaptcha\.com/i.test(frame.origin??'')));
          if(snapshot.verificationSurface||snapshot.widget==='PRESENT'||challenge)
            block('HUMAN_CAPTCHA','Verification appeared during Navigator URL observation; no further page action was made','VERIFICATION_REAPPEARED_AFTER_ENTRY');
          if(snapshot.accessDenied)block('HAPAG_WEBSITE_ACCESS_DENIED','The official page refused access during Navigator URL observation');
          if(!readableNavigator(snapshot)) {
            stableAudit.status='INCOMPLETE';
            block('HAPAG_LOGIN_OBSERVATION_FAILED','Navigator URL observation became unreadable or left its exact official location; the exception did not authorize an unknown frame','NAVIGATOR_URL_OBSERVATION_INCOMPLETE');
          }
          if(Date.now()>=stableDeadline){stableAudit.status='TIMEOUT';block('HAPAG_LOGIN_OBSERVATION_FAILED','Navigator was observed stable only after its fixed URL observation deadline','NAVIGATOR_URL_UNSTABLE');}
          if(!snapshot.pageChangedDuringObservation){stableAudit.status='STABLE';stableAudit.elapsedMs=Date.now()-observationStarted;break;}
        }
      }
      if(snapshot.widget==='NOT_OBSERVED'&&!snapshot.pageChangedDuringObservation&&(!waitingThisCall||snapshot.terminal)) {
        if(waitingThisCall) {
          if(Date.now()>=ordinaryObservationDeadline){audit.ordinaryObservationWait.status='TIMEOUT';block('HAPAG_LOGIN_OBSERVATION_FAILED','Ordinary navigation became readable only after its fixed observation deadline; no further action was authorized','ORDINARY_OBSERVATION_INCOMPLETE');}
          audit.ordinaryObservationWait.status='READABLE_AGAIN';audit.ordinaryObservationWait.lastResolvedAt=new Date(Date.now()).toISOString();
        }
        return;
      }
      const navigationReadFailure=waitingThisCall||snapshot.pageChangedDuringObservation||snapshot.readFailures?.some(item=>['CONTEXT_DESTROYED','FRAME_DETACHED','READ_TIMEOUT'].includes(item.reason));
      const eligible=inner?.audit.credentialSubmissions===1&&inner.audit.status!=='AUTHENTICATED_QUERY_UI_READY'&&
        ['NORMAL_LOGIN','OFFICIAL_IDENTITY_TRANSITION','OFFICIAL_WEBSITE_TRANSITION','NAVIGATOR'].includes(snapshot.kind)&&navigationReadFailure;
      if(!eligible)block('HAPAG_LOGIN_OBSERVATION_FAILED','The ordinary page observation is incomplete without confirmed verification; no credential or page retry was made','ORDINARY_OBSERVATION_INCOMPLETE');
      ordinaryObservationDeadline??=Math.min(observationStarted+8000,queryEnd,hardEnd);
      waitingThisCall=true;
      audit.ordinaryObservationWait??={startedAt:new Date(observationStarted).toISOString(),deadline:new Date(ordinaryObservationDeadline).toISOString(),
        policy:'READ_ONLY_POST_SUBMIT_NAVIGATION',pageActions:0,status:'WAITING',observations:0};
      audit.ordinaryObservationWait.observations++;audit.ordinaryObservationWait.status='WAITING';
      if(Date.now()>=ordinaryObservationDeadline) {
        audit.ordinaryObservationWait.status='TIMEOUT';
        block('HAPAG_LOGIN_OBSERVATION_FAILED','The single bounded post-submit navigation observation remained incomplete; no CAPTCHA was inferred and no login was repeated','ORDINARY_OBSERVATION_INCOMPLETE');
      }
      await page.waitForTimeout(Math.max(1,Math.min(200,ordinaryObservationDeadline-Date.now())));
      snapshot=await observe({deadlineOverride:ordinaryObservationDeadline});
    }
  };
  const wrapper={audit:base,
    beforeEntry:async()=>{
      initialSnapshot=await observe();
      skipNavigation=!['OWNED_BLANK','UNEXPECTED_ORIGIN'].includes(initialSnapshot.kind)&&(initialSnapshot.verificationSurface||initialSnapshot.widget!=='NOT_OBSERVED');
    },
    beginEntry:()=>{
      if(started)block('HAPAG_LOGIN_GATE_SETUP_FAILED','The passive entry epoch cannot be restarted');
      const now=Date.now();hardEnd=Math.min((options.jobStartedAt??now)+750000,hapagTestDeadline());passiveEnd=Math.min(now+600000,hardEnd);started=true;
      audit.jobStartedAt=new Date(options.jobStartedAt??now).toISOString();
      audit.startedAt=new Date(now).toISOString();audit.passiveDeadline=new Date(passiveEnd).toISOString();audit.overallDeadline=new Date(hardEnd).toISOString();
      audit.phase='PASSIVE_WAIT';audit.entryNavigations=skipNavigation?0:1;base.fixedEntryNavigations=audit.entryNavigations;
      assertHard();return passiveEnd;
    },
    shouldNavigateEntry:()=>!skipNavigation,
    ensureReady:async()=>{
      if(!started)block('HAPAG_LOGIN_GATE_SETUP_FAILED','The single fixed public-entry epoch must begin before observation');
      for(;;) {
        const snapshot=await observe();audit.elapsedMs=Date.now()-Date.parse(audit.startedAt);
        if(Date.now()>=passiveEnd) {
          if(snapshot.accessDenied&&!audit.widgetSeen)block('HAPAG_WEBSITE_ACCESS_DENIED','The public entry still refused access at its fixed passive deadline','PUBLIC_ENTRY_ACCESS_DENIED_TIMEOUT');
          block('HUMAN_CAPTCHA','The public entry did not reach a verified ordinary UI before its fixed passive deadline','PUBLIC_ENTRY_UNRESOLVED_TIMEOUT');
        }
        if(snapshot.terminal&&snapshot.widget==='NOT_OBSERVED'&&!snapshot.verificationSurface) {
          assertHard();ordinary=true;queryEnd=Math.min(Date.now()+150000,hardEnd);
          audit.phase='ORDINARY';audit.ordinaryStartedAt=new Date(Date.now()).toISOString();audit.ordinaryDeadline=new Date(queryEnd).toISOString();
          audit.terminal=snapshot.terminal;audit.classification='PUBLIC_ENTRY_SELF_RESOLVED_WITHOUT_ACTION';
          for(const item of audit.statusResponses)if(item.classification==='PUBLIC_ENTRY_WAIT_UNRESOLVED')item.followedBy='PUBLIC_ENTRY_SELF_RESOLVED_WITHOUT_ACTION';
          // Install the inner listener before releasing wrapper ownership. The
          // outer hard-refusal listener remains active through task completion.
          guards.delete(page);
          inner=createOrdinaryHapagWebsiteLoginGate(page,{...options,end:queryEnd,externalSafetyBarrier:assertHard,externalSafetyObservation:ordinaryObservation});
          inner.audit.publicEntryWait=audit;lifecycle.websiteLogin=inner.audit;wrapper.audit=inner.audit;guards.set(page,wrapper);
          await inner.ensureReady();assertHard();return {...inner.audit};
        }
        await page.waitForTimeout(Math.max(1,Math.min(1000,passiveEnd-Date.now())));
      }
    },
    queryDeadline:()=>queryEnd,
    assertAvailable:async()=>{assertHard();if(!ordinary||!inner)block('HUMAN_CAPTCHA','The original public entry is still in its zero-action waiting phase');await inner.assertAvailable();assertHard();},
    safeToCapture:async()=>!!inner&&Date.now()<hardEnd&&Date.now()<queryEnd&&await inner.safeToCapture(),
    screenshotOptions:()=>inner?.screenshotOptions()??{},
    redact:value=>inner?inner.redact(value):value,
    safeError:error=>inner?inner.safeError(error):Object.assign(new Error(error?.name==='HapagWebsiteLoginError'?error.message:'The passive owned-page observation stopped; sensitive diagnostics were omitted'),
      {name:'HapagWebsiteLoginError',code:/^[A-Z0-9_]{1,80}$/.test(error?.code??'')?error.code:'HAPAG_LOGIN_OBSERVATION_FAILED'}),
    stop:()=>{if(!stopped){inner?.stop();page.off('response',responseListener);guards.delete(page);stopped=true;}},
  };
  guards.set(page,wrapper);return wrapper;
}

export function createHapagWebsiteLoginGate(page,options={}) {
  return hapagPublicEntryWaitEnabled()?createPassiveHapagWebsiteLoginGate(page,options):createOrdinaryHapagWebsiteLoginGate(page,options);
}
