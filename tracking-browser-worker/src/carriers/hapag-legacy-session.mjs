import {checkHapagVerification} from './carrier-verification.mjs';
import {dismissHapagCookieNotice} from './ordinary-page-controls.mjs';
import {probeHapagLegacyContainerOverview} from './hapag-legacy-details.mjs';

export const HAPAG_CONTAINER_ENTRY='https://www.hapag-lloyd.com/en/online-business/track/track-by-container-solution.html';
const normalized=value=>String(value??'').replace(/\s+/g,'').toUpperCase();
const containerUrl=value=>{try{const url=new URL(value);return url.origin==='https://www.hapag-lloyd.com'&&url.pathname==='/en/online-business/track/track-by-container-solution.html'?url:null;}catch{return null;}};
export const isHapagApplicationSessionExpired=text=>/Your session has been cancel(?:l)?ed for security reasons\./i.test(String(text));

// Standard document-navigation timing only. No application/challenge internals,
// cookies, profile data or verification token is inspected or changed.
export function readHapagDocumentIdentity(){return {timeOrigin:performance.timeOrigin};}

export function observeFreshHapagContainerNavigation({page,reference,beforeTimeOrigin,generation}){
  const requests=new Set();let armed=false,response=null,committed=false,documentReady=false;
  const matches=value=>{const url=containerUrl(value);return !!url&&normalized(url.searchParams.get('container'))===normalized(reference);};
  const requestListener=request=>{
    if(!armed)return;
    try{if(request.isNavigationRequest()&&request.frame()===page.mainFrame()&&matches(request.url()))requests.add(request);}catch{}
  };
  const responseListener=value=>{
    if(!armed)return;
    try{const request=value.request(),status=value.status();
      if(!requests.has(request)||!request.isNavigationRequest()||request.frame()!==page.mainFrame()||status<200||status>=300||!matches(value.url()))return;
      response={url:value.url(),status};committed=false;documentReady=false;
    }catch{}
  };
  const navigationListener=frame=>{
    if(!armed||!response||frame!==page.mainFrame())return;
    if(matches(frame.url())){committed=true;documentReady=false;}
  };
  const readyListener=()=>{if(armed&&response&&committed&&matches(page.url()))documentReady=true;};
  page.on('request',requestListener);page.on('response',responseListener);page.on('framenavigated',navigationListener);page.on('domcontentloaded',readyListener);
  return {
    arm(){if(armed)throw Error('Normal Find observation may only be armed once');armed=true;},
    async confirmed(){
      if(!response||!committed||!documentReady||!matches(page.url()))return null;
      const identity=await page.evaluate(readHapagDocumentIdentity);
      if(!Number.isFinite(beforeTimeOrigin)||!Number.isFinite(identity?.timeOrigin)||identity.timeOrigin===beforeTimeOrigin)return null;
      return {confirmed:true,submitted:reference,normalizedReference:normalized(reference),queryType:'CONTAINER',
        responseUrl:response.url,responseStatus:response.status,generation,
        freshRequestObserved:true,mainFrameCommitted:true,documentReady:true,documentOriginChanged:true};
    },
    dispose(){page.off('request',requestListener);page.off('response',responseListener);page.off('framenavigated',navigationListener);page.off('domcontentloaded',readyListener);},
  };
}

/** Normal legacy container business lifecycle. The caller supplies only its own
 * page. All stages share one deadline and one explicit application-session
 * renewal. Verification handling is observed through the unchanged verifier;
 * no verification action or session/profile material is manipulated here.
 */
export async function queryHapagLegacyContainer(page,reference,{now=Date.now,readVerification=checkHapagVerification,budgetMs=150000}={}){
  if(!/^[A-Z]{3}[UJZ]\d{7}$/.test(normalized(reference)))throw Object.assign(new Error('An exact container reference is required'),{code:'CARRIER_QUERY_INCOMPLETE',failure_kind:'INVALID_CONTAINER_REFERENCE'});
  const started=now(),deadline=started+Math.min(150000,Math.max(1,budgetMs));
  const lifecycle={sessionRecoveryUsed:false,normalFindActionsStarted:0,initialEntryLoads:0};
  let lastText='',generation=0,initialNavigationAllowed=true;
  const remaining=()=>Math.max(0,deadline-now());
  const stopped=(message,kind)=>Object.assign(new Error(message),{code:'CARRIER_QUERY_INCOMPLETE',failure_kind:kind,
    verificationText:lastText,query_lifecycle:{...lifecycle}});
  const timeout=(maximum=7000)=>{if(remaining()<1)throw stopped('Hapag-Lloyd query exceeded its original total budget; no further normal action was taken','BUDGET_EXHAUSTED');return Math.max(1,Math.min(maximum,remaining()));};
  const wait=async()=>{await page.waitForTimeout(Math.min(500,timeout()));};
  const ordinaryState=async()=>{
    for(;;){
      if(remaining()<1){await readVerification(page,{final:true});throw stopped('Hapag-Lloyd query exceeded its original total budget','BUDGET_EXHAUSTED');}
      const state=await readVerification(page);lastText=state.text??'';
      if(state.pending){await wait();continue;}
      if(containerUrl(page.url())&&isHapagApplicationSessionExpired(lastText))
        throw Object.assign(new Error('Official Hapag application session was canceled'),{code:'HAPAG_APPLICATION_SESSION_EXPIRED'});
      return state;
    }
  };
  const input=page.getByLabel('Container No.',{exact:true});
  const find=page.locator('[id="tracing_by_container_f:hl25"]');
  const loadSameEntry=async()=>{
    await page.goto(HAPAG_CONTAINER_ENTRY,{waitUntil:'domcontentloaded',timeout:timeout(60000)});
  };
  for(;;){
    let observer;
    try{
      await ordinaryState();
      if(!containerUrl(page.url())){
        if(!initialNavigationAllowed)throw stopped('Official container query did not remain in the expected normal entry','ORDINARY_FORM_NOT_READY');
        initialNavigationAllowed=false;lifecycle.initialEntryLoads++;await loadSameEntry();
      }
      for(;;){await ordinaryState();
        if(!containerUrl(page.url()))throw stopped('Official container query left the supported ordinary entry','ORDINARY_FORM_NOT_READY');
        if(await input.isVisible().catch(()=>false))break;await wait();}
      await dismissHapagCookieNotice(page,{remaining});await ordinaryState();
      await input.click({timeout:timeout()});await ordinaryState();
      await input.press('ControlOrMeta+A',{timeout:timeout()});
      await input.pressSequentially(reference,{delay:60,timeout:timeout(10000)});await ordinaryState();
      if(normalized(await input.inputValue({timeout:timeout()}))!==normalized(reference))throw stopped('Official container form did not retain the full reference before blur','INPUT_NOT_RETAINED');
      await input.press('Tab',{timeout:timeout()});
      await page.waitForTimeout(Math.min(1500,timeout(1500)));await ordinaryState();
      if(normalized(await input.inputValue({timeout:timeout()}))!==normalized(reference))throw stopped('Official container form did not retain the full reference after blur','INPUT_NOT_RETAINED');
      const beforeIdentity=await page.evaluate(readHapagDocumentIdentity);await ordinaryState();
      if(!Number.isFinite(beforeIdentity?.timeOrigin))throw stopped('Ordinary document navigation timing was unavailable','FRESH_QUERY_NOT_CONFIRMED');
      observer=observeFreshHapagContainerNavigation({page,reference,beforeTimeOrigin:beforeIdentity.timeOrigin,generation:++generation});
      observer.arm();lifecycle.normalFindActionsStarted++;
      try{await find.click({timeout:timeout(10000)});}catch(error){
        // A normal click can time out after initiating navigation. Observe this
        // exact generation; never infer a missing click or issue another Find.
        await ordinaryState();if(error.name!=='TimeoutError')throw error;
      }
      for(;;){
        await ordinaryState();
        if(normalized(await input.inputValue({timeout:timeout()}))!==normalized(reference))throw stopped('Container reference changed during the current normal query','INPUT_NOT_RETAINED');
        const receipt=await observer.confirmed();
        if(receipt){
          if(/\bDOCUMENT does not exist\./i.test(lastText))throw Object.assign(new Error('Official Hapag result did not find this submitted container'),{code:'CARRIER_REFERENCE_NOT_FOUND',query_lifecycle:{...lifecycle}});
          const overview=await probeHapagLegacyContainerOverview({page,job:{reference,submitted:reference,reference_type:'CONTAINER'},queryReceipt:receipt,text:lastText});
          if(overview.ok)return {...receipt,query_lifecycle:{...lifecycle}};
        }
        await wait();
      }
    }catch(original){
      let error=original;
      if(error.code!=='HAPAG_APPLICATION_SESSION_EXPIRED'&&error.code!=='HUMAN_CAPTCHA'&&error.code!=='CARRIER_REFERENCE_NOT_FOUND'){
        try{await ordinaryState();}catch(observed){error=observed;}
      }
      if(error.code==='HAPAG_APPLICATION_SESSION_EXPIRED'){
        observer?.dispose();observer=null;
        if(lifecycle.sessionRecoveryUsed||remaining()<1)throw stopped('Official application session remained canceled after the single permitted normal renewal, or its original budget ended','APPLICATION_SESSION_EXPIRED');
        // Re-check immediately before the normal renewal. A later verification
        // screen must not inherit an earlier application-session diagnosis.
        let current;try{current=await readVerification(page);}catch(blocked){blocked.query_lifecycle={...lifecycle};throw blocked;}
        lastText=current.text??lastText;
        if(current.pending){
          try{await readVerification(page,{final:true});}catch(blocked){blocked.query_lifecycle={...lifecycle};throw blocked;}
          throw stopped('Visible verification is pending; the normal application session was not renewed','VERIFICATION_PENDING');
        }
        if(!containerUrl(page.url())||!isHapagApplicationSessionExpired(lastText))
          throw stopped('Application-session error changed before renewal; preserved the current page','APPLICATION_SESSION_EXPIRED');
        lifecycle.sessionRecoveryUsed=true;initialNavigationAllowed=false;
        // Same official container entry, same page and same browser context.
        // Only an explicit ordinary application-session error permits this.
        try{await loadSameEntry();}catch(loadError){
          try{await readVerification(page,{final:true});}catch(blocked){if(blocked.code==='HUMAN_CAPTCHA'){blocked.query_lifecycle={...lifecycle};throw blocked;}}
          throw stopped('The one normal application-session renewal did not finish; no further renewal or Find was attempted','APPLICATION_SESSION_EXPIRED');
        }
        continue;
      }
      if(error.code==='HUMAN_CAPTCHA'||error.code==='CARRIER_REFERENCE_NOT_FOUND'){
        error.query_lifecycle={...lifecycle};throw error;
      }
      if(error.code==='CARRIER_QUERY_INCOMPLETE'){error.query_lifecycle={...lifecycle};throw error;}
      throw stopped('Hapag-Lloyd normal query did not complete; no further Find was attempted','FRESH_QUERY_NOT_CONFIRMED');
    }finally{observer?.dispose();}
  }
}
