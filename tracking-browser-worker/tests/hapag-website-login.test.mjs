import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {runHapagNavigatorItem,clickExactlyOne} from '../src/carriers/hapag-navigator.mjs';
import {createHapagWebsiteLoginGate,hapagWebsitePageKind,hapagWebsiteAutoLoginEnabled,
  readHapagWebsiteCredentials} from '../src/carriers/hapag-website-login.mjs';

const NAVIGATOR='https://www.hapag-lloyd.com/solutions/navigator/';
const LOGIN='https://identity.hapag-lloyd.com/hlagwebprod.onmicrosoft.com/b2c_1a_signup_signin/oauth2/v2.0/authorize';
const SYNTHETIC={username:'offline@example.invalid',password:'offline-only-secret-never-a-real-account'};
const ANNOUNCEMENT='My Compass is ready for you\n\nTry the new workspace for managing your shipments, tasks, and daily work in one place.\n\nOpen My Compass\nSkip This Time';

function fixture(options={}) {
  let now=100000,reads=0,reservations=0;
  const state={phase:options.phase??'login',challenge:false,mfa:false,rejected:false,panel:options.panel??false,
    announcement:options.announcement??false,submittedAt:null,...options};
  const calls=[],handlers=new Map(),lifecycle={};
  const sync=()=>{if(state.submittedAt!==null&&now-state.submittedAt>=(state.readyAfter??13000))state.phase='ready';};
  const url=()=>{sync();return state.url??(state.phase==='ready'?NAVIGATOR:state.phase==='blank'?'about:blank':LOGIN);};
  const body=()=>{sync();return state.bodyText??(state.challenge?'Please verify you are human':state.mfa?'Enter verification code':state.rejected?'Password is incorrect':now<(state.pendingUntil??0)?'Checking your browser':'Ordinary observed website page');};
  const bodyLocator={isVisible:async()=>true,innerText:async()=>body()};
  const frame={parentFrame:()=>null,url,locator:selector=>{assert.equal(selector,'body');return bodyLocator;}};
  const countFor=name=>state.phase==='login'?(state.duplicates===name?2:1):0;
  const fields=name=>({count:async()=>countFor(name),isVisible:async()=>countFor(name)>0,isEnabled:async()=>true,
    getAttribute:async attr=>{state.attributeHook?.(name,attr);return attr==='id'?(state.changedIds? 'changed':name==='Password'?'password':'signInName'):attr==='type'?(name==='Password'?'password':'text'):null;},
    fill:async value=>{calls.push(['fill',name,value]);if(value&&state.throwFill)throw Error(SYNTHETIC.password+' '+SYNTHETIC.username+' sensitive native diagnostic');
      if(value&&name==='E-mail Address')state.afterUsername?.();}});
  const button=name=>({count:async()=>state.duplicates===name?2:name==='Skip This Time'?(state.announcement?1:0):name==='Confirm My Choices'?(state.panel?1:0):countFor(name),
    isVisible:async()=>true,isEnabled:async()=>true,
    click:async()=>{calls.push(['click',name]);if(name==='Log in'){state.submittedAt=now;state.phase='transition';}
      if(name==='Confirm My Choices')state.panel=false;if(name==='Skip This Time')state.announcement=false;}});
  const panel={count:async()=>1,isVisible:async()=>state.panel,
    locator:selector=>{assert.equal(selector,'input[id^="ot-group-id-"]');return {evaluateAll:async()=>{
      state.optionalReads=(state.optionalReads??0)+1;
      return Array.from({length:4},(_,i)=>({id:`ot-group-id-${i}`,type:'checkbox',checked:state.optionalChecked===true||
        (state.changeChoicesOnSecondRead===true&&state.optionalReads>1)}));
    }};},getByRole:(role,{name})=>{assert.equal(role,'button');return button(name);},
    waitFor:async({state:expected})=>{assert.equal(expected,'hidden');assert.equal(state.panel,false);}};
  const announcement={count:async()=>state.announcement?1:0,innerText:async()=>state.announcementText??ANNOUNCEMENT,
    getByRole:(role,{name})=>{assert.equal(role,'button');return button(name);},
    waitFor:async({state:expected})=>{assert.equal(expected,'hidden');assert.equal(state.announcement,false);}};
  const page={url,frames:()=>[frame],mainFrame:()=>frame,
    on:(kind,handler)=>{if(!handlers.has(kind))handlers.set(kind,new Set());handlers.get(kind).add(handler);},
    off:(kind,handler)=>handlers.get(kind)?.delete(handler),
    waitForTimeout:async ms=>{assert.ok(ms>0&&ms<=200);calls.push(['passive-wait',ms]);now+=ms;state.afterWait?.(now);},
    getByText:()=>({syntheticMask:true}),
    getByRole:(role,{name})=>{
      if(role==='textbox')return fields(name);
      if(role==='button')return button(name);
      if(role==='searchbox'||role==='combobox')return {count:async()=>{sync();return state.phase==='ready'?1:0;},isVisible:async()=>state.phase==='ready'};
      throw Error('Unexpected role '+role);
    },
    locator:selector=>{
      if(selector==='body')return bodyLocator;
      if(selector==='input[type="password"]:visible')return {count:async()=>state.phase==='login'?1:0};
      if(selector==='input[type="password"], #signInName')return {syntheticMask:true};
      if(selector==='#onetrust-pc-sdk')return panel;
      if(selector==='[role="dialog"]:visible')return {count:async()=>state.unknownDialog?1:state.phase==='ready'&&state.announcement?1:0};
      if(selector==='[role="dialog"].q-dialog---announcement:visible')return announcement;
      throw Error('Unexpected selector '+selector);
    },
  };
  const gate=createHapagWebsiteLoginGate(page,{end:state.deadline??250000,lifecycle,reservationPath:'/synthetic/attempt.json',
    credentialPath:'/synthetic/website-login.json',readCredentials:async()=>{reads++;return {...SYNTHETIC};},
    reserveAttempt:async(_filename,document)=>{reservations++;assert.equal(JSON.stringify(document).includes(SYNTHETIC.password),false);}});
  return {page,gate,state,calls,lifecycle,now:()=>now,setNow:value=>{now=value;},get reads(){return reads;},get reservations(){return reservations;},
    commit:()=>{for(const handler of handlers.get('framenavigated')??[])handler(frame);
      for(const handler of handlers.get('domcontentloaded')??[])handler();},
    emit:(status,responseUrl=LOGIN,type='xhr',options={})=>{
      const request={resourceType:()=>type,isNavigationRequest:()=>options.navigation===true,frame:()=>options.subframe?{}:frame,
        headers:()=>{throw Error('Headers forbidden');},postData:()=>{throw Error('Body forbidden');}};
      for(const handler of handlers.get('request')??[])handler(request);
      for(const handler of handlers.get('response')??[])handler({status:()=>status,url:()=>responseUrl,request:()=>request});}};
}

async function run(f,callback) {
  const previous=Date.now;Date.now=f.now;
  try {return await callback();} finally {Date.now=previous;f.gate.stop();}
}

test('observed cold normal login confirms unchecked privacy, submits once, then skips the exact ordinary announcement',async()=>{
  const f=fixture({panel:true,announcement:true});
  await run(f,async()=>{
    const audit=await f.gate.ensureReady();
    assert.equal(audit.status,'AUTHENTICATED_QUERY_UI_READY');assert.equal(audit.credentialSubmissions,1);
    assert.equal(audit.optionalCookieConfirms,1);assert.equal(audit.announcementSkips,1);assert.equal(audit.verificationActions,0);
    assert.equal(f.reads,1);assert.equal(f.reservations,1);assert.ok(f.now()-100000>=13000);
    assert.deepEqual(f.calls.filter(call=>call[0]==='click').map(call=>call[1]),['Confirm My Choices','Log in','Skip This Time']);
    assert.equal(f.gate.redact(SYNTHETIC.username+' '+SYNTHETIC.password).includes('offline'),false);
  });
});

test('current SSO query UI needs no credential file read or login attempt',async()=>{
  const f=fixture({phase:'ready'});await run(f,async()=>{
    const audit=await f.gate.ensureReady();assert.equal(audit.credentialSubmissions,0);assert.equal(f.reads,0);assert.equal(f.reservations,0);
    await f.gate.assertAvailable();assert.equal(await f.gate.safeToCapture(),true);
  });
});

test('the exact observed announcement may mount late and is dismissed before a subsequent query action',async()=>{
  const f=fixture({phase:'ready'});await run(f,async()=>{
    await f.gate.ensureReady();f.state.announcement=true;
    await f.gate.assertAvailable();assert.equal(f.state.announcement,false);
    assert.equal(f.lifecycle.websiteLogin.announcementSkips,1);assert.equal(f.reads,0);
  });
});

test('an announcement mounting while the unique shipment candidate is awaited is skipped before the actual candidate click',async()=>{
  const f=fixture({phase:'ready'});await run(f,async()=>{
    await f.gate.ensureReady();let candidateClicks=0;
    const candidate={page:()=>f.page,count:async()=>1,waitFor:async()=>{f.state.announcement=true;},
      click:async()=>{assert.equal(f.state.announcement,false);candidateClicks++;}};
    await clickExactlyOne(candidate,250000);
    assert.equal(candidateClicks,1);assert.equal(f.lifecycle.websiteLogin.announcementSkips,1);
    assert.equal(f.reads,0);assert.equal(f.calls.filter(c=>c[0]==='click'&&c[1]==='Skip This Time').length,1);
  });
});

test('same-named API Portal fields and an unexpected origin never receive credentials',async()=>{
  for(const url of [LOGIN.replace('b2c_1a_signup_signin','B2C_1A_APIPORTAL_SIGNUP_SIGNIN'),'https://example.invalid/login']) {
    const f=fixture({url});await run(f,async()=>{
      await assert.rejects(f.gate.ensureReady());assert.equal(f.reads,0);assert.equal(f.calls.some(c=>c[0]==='click'),false);
    });
  }
  assert.equal(hapagWebsitePageKind(LOGIN),'NORMAL_LOGIN');
});

test('interactive CAPTCHA and MFA stop before any credential or cookie action',async()=>{
  for(const [flag,code] of [['challenge','HUMAN_CAPTCHA'],['mfa','HAPAG_MFA_REQUIRED']]) {
    const f=fixture({[flag]:true,panel:true});await run(f,async()=>{
      await assert.rejects(f.gate.ensureReady(),{code});assert.equal(f.reads,0);assert.equal(f.reservations,0);
      assert.equal(f.calls.some(c=>c[0]==='click'),false);assert.equal(await f.gate.safeToCapture(),false);
    });
  }
});

test('a CAPTCHA appearing after username fill prevents password fill and submission',async()=>{
  const f=fixture();f.state.afterUsername=()=>{f.state.challenge=true;};
  await run(f,async()=>{
    await assert.rejects(f.gate.ensureReady(),{code:'HUMAN_CAPTCHA'});
    assert.equal(f.calls.some(c=>c[0]==='fill'&&c[1]==='Password'&&c[2]),false);
    assert.equal(f.calls.some(c=>c[0]==='click'&&c[1]==='Log in'),false);
    assert.equal(f.lifecycle.websiteLogin.credentialSubmissions,0);
  });
});

test('official document, identity xhr and website fetch 403/429 are sticky and third-party analytics is ignored',async()=>{
  for(const [status,url,type,code] of [[403,NAVIGATOR,'document','HAPAG_WEBSITE_ACCESS_DENIED'],
    [403,LOGIN,'xhr','HAPAG_WEBSITE_ACCESS_DENIED'],[429,NAVIGATOR,'fetch','HAPAG_WEBSITE_RATE_LIMITED']]) {
    const f=fixture();f.emit(status,url,type);await run(f,async()=>{
      await assert.rejects(f.gate.ensureReady(),{code});f.state.phase='ready';await assert.rejects(f.gate.ensureReady(),{code});
      assert.equal(f.reads,0);assert.equal(f.calls.some(c=>c[0]==='click'),false);
    });
  }
  const f=fixture({phase:'ready'});f.emit(403,'https://analytics.example.invalid/track','xhr');
  await run(f,()=>f.gate.ensureReady());assert.equal(f.lifecycle.websiteLogin.status,'AUTHENTICATED_QUERY_UI_READY');
});

test('checked or asynchronously changed cookie choices and duplicate confirmation cause zero privacy clicks',async()=>{
  for(const options of [{optionalChecked:true},{changeChoicesOnSecondRead:true},{duplicates:'Confirm My Choices'}]) {
    const f=fixture({panel:true,...options});await run(f,async()=>{
      await assert.rejects(f.gate.ensureReady());assert.equal(f.calls.some(c=>c[0]==='click'),false);assert.equal(f.reads,0);
    });
  }
});

test('changed or duplicate normal login fields are rejected before reading credentials',async()=>{
  for(const options of [{changedIds:true},{duplicates:'E-mail Address'},{duplicates:'Password'},{duplicates:'Log in'}]) {
    const f=fixture(options);await run(f,async()=>{
      await assert.rejects(f.gate.ensureReady(),{code:'HAPAG_LOGIN_FORM_UNRECOGNIZED'});assert.equal(f.reads,0);
    });
  }
});

test('unknown, changed, or duplicated ordinary announcements cannot be dismissed generically',async()=>{
  for(const options of [{unknownDialog:true},{announcement:true,announcementText:'Please accept new terms'},
    {announcement:true,duplicates:'Skip This Time'}]) {
    const f=fixture({phase:'ready',...options});await run(f,async()=>{
      await assert.rejects(f.gate.ensureReady(),{code:'HAPAG_NAVIGATOR_UNEXPECTED_DIALOG'});
      assert.equal(f.calls.some(c=>c[0]==='click'),false);assert.equal(f.reads,0);
    });
  }
});

test('a normal login required during a business query stops without second submission or ready claim',async()=>{
  const f=fixture({phase:'ready'});await run(f,async()=>{
    await f.gate.ensureReady();f.state.phase='login';
    await assert.rejects(f.gate.assertAvailable(),{code:'LOGIN_REQUIRED'});
    assert.equal(f.lifecycle.websiteLogin.blockedReason,'MID_QUERY_LOGIN_REQUIRED');assert.equal(f.reads,0);
    assert.equal(await f.gate.safeToCapture(),false);
  });
});

test('a URL change or official refusal arriving during the last awaited password count cannot authorize success',async()=>{
  for(const refusal of [false,true]) {
    const f=fixture({phase:'ready'});await run(f,async()=>{
      await f.gate.ensureReady();
      const original=f.page.locator;
      f.page.locator=selector=>selector==='input[type="password"]:visible'?{count:async()=>{
        if(refusal)f.emit(403);else {f.state.url=LOGIN;f.state.phase='transition';}return 0;
      }}:original(selector);
      await assert.rejects(f.gate.assertAvailable(),{code:refusal?'HAPAG_WEBSITE_ACCESS_DENIED':'LOGIN_REQUIRED'});
      assert.equal(f.reads,0);
    });
  }
});

test('a refusal during awaited final login-field validation stops before filling either credential',async()=>{
  const f=fixture();f.state.attributeHook=(name,attr)=>{if(f.reads&&name==='Password'&&attr==='type')f.emit(403);};
  await run(f,async()=>{
    await assert.rejects(f.gate.ensureReady(),{code:'HAPAG_WEBSITE_ACCESS_DENIED'});
    assert.equal(f.reads,1);assert.equal(f.lifecycle.websiteLogin.credentialSubmissions,0);
    assert.equal(f.calls.some(c=>c[0]==='fill'&&c[2]),false);
  });
});

test('a normal official detail-UI 401 after readiness is a latched incomplete query, never another login attempt',async()=>{
  const f=fixture({phase:'ready'});await run(f,async()=>{
    await f.gate.ensureReady();f.emit(401,'https://navigator.api.hlag.cloud/ordinary-detail-route','fetch');
    await assert.rejects(f.gate.assertAvailable(),{code:'LOGIN_REQUIRED'});
    assert.equal(f.lifecycle.websiteLogin.blockedReason,'MID_QUERY_LOGIN_REQUIRED');assert.equal(f.reads,0);
  });
});

test('automatic checking clears passively on the same page or stops at its fixed 30-second cap',async()=>{
  const natural=fixture({phase:'ready',pendingUntil:104000});await run(natural,async()=>{
    await natural.gate.ensureReady();assert.equal(natural.lifecycle.websiteLogin.passiveCheckMs,4000);
    assert.ok(natural.calls.every(c=>c[0]==='passive-wait'));assert.equal(natural.reads,0);
  });
  const blocked=fixture({pendingUntil:Infinity});await run(blocked,async()=>{
    await assert.rejects(blocked.gate.ensureReady(),{code:'HUMAN_CAPTCHA'});
    assert.equal(blocked.lifecycle.websiteLogin.blockedReason,'PASSIVE_CHECK_TIMEOUT');assert.equal(blocked.now(),130000);
    assert.equal(blocked.reads,0);assert.ok(blocked.calls.every(c=>c[0]==='passive-wait'));
  });
});

test('a rejected credential or native error has a fixed safe message, one reservation, and no credential screenshot permission',async()=>{
  const f=fixture({throwFill:true});await run(f,async()=>{
    await assert.rejects(f.gate.ensureReady(),error=>error.code==='HAPAG_LOGIN_ACTION_STOPPED'&&
      !error.message.includes(SYNTHETIC.password)&&!error.message.includes(SYNTHETIC.username));
    assert.equal(f.reservations,1);assert.equal(f.lifecycle.websiteLogin.credentialSubmissions,0);assert.equal(await f.gate.safeToCapture(),false);
  });
  const rejected=fixture({rejected:true});await run(rejected,async()=>{
    await assert.rejects(rejected.gate.ensureReady(),{code:'HAPAG_LOGIN_CREDENTIALS_REJECTED'});assert.equal(rejected.reads,0);
  });
});

test('login wait cannot extend the original query deadline or retry its one submission',async()=>{
  const f=fixture({readyAfter:Infinity,deadline:101000});await run(f,async()=>{
    await assert.rejects(f.gate.ensureReady(),{code:'LOGIN_REQUIRED'});assert.equal(f.lifecycle.websiteLogin.credentialSubmissions,1);
    assert.equal(f.reservations,1);assert.ok(f.now()<=101000);
  });
});

function credentialFs({mode=0o100600,uid=1000,symlink=false,openedIno=7,content=JSON.stringify(SYNTHETIC)}={}) {
  let opens=0,closes=0;
  const source=Buffer.from(content),stat=()=>({isFile:()=>true,isSymbolicLink:()=>symlink,mode,uid,size:source.length,dev:1,ino:7});
  const fileSystem={lstat:async()=>stat(),open:async(_filename,flags)=>{opens++;assert.ok(flags&131072);return {
    stat:async()=>({...stat(),ino:openedIno}),
    read:async(buffer,offset,length,position)=>{const bytesRead=source.copy(buffer,offset,position,Math.min(source.length,position+length));return {bytesRead};},
    close:async()=>{closes++;},
  };}};
  return {fileSystem,fileConstants:{O_RDONLY:0,O_NOFOLLOW:131072},platform:'linux',uid:1000,
    counts:()=>({opens,closes})};
}

test('credential loader uses no-follow fd identity, exact 0600/current UID, bounded JSON and closes its descriptor',async()=>{
  const f=credentialFs();assert.deepEqual(await readHapagWebsiteCredentials('/synthetic/credentials.json',f),SYNTHETIC);
  assert.deepEqual(f.counts(),{opens:1,closes:1});
  for(const options of [{mode:0o100644},{mode:0o104600},{uid:0},{symlink:true},{openedIno:8},
    {content:'{ malformed '+SYNTHETIC.password},{content:'x'.repeat(16385)}]) {
    const bad=credentialFs(options);
    await assert.rejects(readHapagWebsiteCredentials('/synthetic/credentials.json',bad),error=>
      error.code==='HAPAG_LOGIN_CREDENTIALS_UNSAFE'&&!error.message.includes(SYNTHETIC.password));
    const {opens,closes}=bad.counts();assert.equal(closes,opens);
  }
});

test('relative path, missing O_NOFOLLOW and non-Linux cannot bypass the credential policy',async()=>{
  for(const [filename,options] of [['relative.json',{}],['/synthetic/file',{platform:'win32'}],
    ['/synthetic/file',{uid:null}],['/synthetic/file',{fileConstants:{O_RDONLY:0}}]]) {
    const f=credentialFs();await assert.rejects(readHapagWebsiteCredentials(filename,{...f,...options}),{code:'HAPAG_LOGIN_CREDENTIALS_UNSAFE'});
    assert.equal(f.counts().opens,0);
  }
});

test('auto login is selected only by the explicit HAPAG_AUTO_LOGIN=1 environment flag',()=>{
  const original=process.env.HAPAG_AUTO_LOGIN;
  try {for(const [value,enabled] of [['',false],['true',false],['0',false],['1',true]]) {
    process.env.HAPAG_AUTO_LOGIN=value;assert.equal(hapagWebsiteAutoLoginEnabled(),enabled);
  }} finally {if(original===undefined)delete process.env.HAPAG_AUTO_LOGIN;else process.env.HAPAG_AUTO_LOGIN=original;}
});

test('driver opt-in admits the retained normal login page before fixed entry and suppresses sensitive failure artifacts',async t=>{
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'hapag-login-artifacts-'));
  t.after(async()=>{assert.equal(path.dirname(path.resolve(directory)),path.resolve(os.tmpdir()));
    assert.ok(path.basename(directory).startsWith('hapag-login-artifacts-'));await fs.rm(directory,{recursive:true,force:true});});
  const f=fixture();f.gate.stop();
  let navigations=0,screenshots=0;
  f.page.isClosed=()=>false;f.page.setDefaultTimeout=()=>{};
  f.page.goto=async value=>{assert.equal(value,NAVIGATOR);navigations++;};
  f.page.screenshot=async()=>{screenshots++;throw Error('Sensitive login page must not be captured');};
  const originalFlag=process.env.HAPAG_AUTO_LOGIN,originalFile=process.env.HAPAG_WEBSITE_CREDENTIALS_FILE;
  try {
    process.env.HAPAG_AUTO_LOGIN='1';process.env.HAPAG_WEBSITE_CREDENTIALS_FILE='/nonexistent-offline-fixture-only/website-login.json';
    const raw=await runHapagNavigatorItem({carrier:'HAPAG_LLOYD',reference_type:'BOOKING',reference:'35276518'},
      {context:{newPage:async()=>f.page,pages:()=>{throw Error('Preexisting pages must never be read');}},outDir:directory});
    assert.equal(navigations,1);assert.equal(raw.navigator_error_code,'HAPAG_LOGIN_CREDENTIALS_UNSAFE');assert.equal(raw.page_pool.state,'QUARANTINED');
    assert.equal(raw.navigator_ui_lifecycle.searchesStarted,0);assert.equal(raw.navigator_ui_lifecycle.websiteLogin.credentialSubmissions,0);
    assert.equal(screenshots,0);assert.equal(raw.evidence.screenshot,undefined);assert.ok(raw.evidence.login_state);
    for(const name of await fs.readdir(directory)) {
      const text=await fs.readFile(path.join(directory,name),'utf8');
      assert.equal(text.includes(SYNTHETIC.password),false);assert.equal(text.includes(SYNTHETIC.username),false);
      assert.equal(name.endsWith('.txt')||name.endsWith('.png'),false);
    }
  } finally {
    if(originalFlag===undefined)delete process.env.HAPAG_AUTO_LOGIN;else process.env.HAPAG_AUTO_LOGIN=originalFlag;
    if(originalFile===undefined)delete process.env.HAPAG_WEBSITE_CREDENTIALS_FILE;else process.env.HAPAG_WEBSITE_CREDENTIALS_FILE=originalFile;
  }
});

test('a committed main-document 403 with contemporaneous passive checking may naturally reach exact login before one normal submission',async()=>{
  const f=fixture({phase:'checking',url:NAVIGATOR,pendingUntil:104000});
  f.emit(403,NAVIGATOR+'?auth=must-not-be-recorded#fragment','document',{navigation:true});f.commit();
  let loginCommitted=false,readyCommitted=false;
  f.state.afterWait=now=>{
    if(now>=104000&&!loginCommitted){f.state.phase='login';f.state.url=LOGIN;loginCommitted=true;f.commit();}
    if(f.state.submittedAt!==null&&now-f.state.submittedAt>=13000&&!readyCommitted){f.state.phase='ready';f.state.url=NAVIGATOR;readyCommitted=true;f.commit();}
  };
  await run(f,async()=>{
    await f.gate.ensureReady();const audit=f.lifecycle.websiteLogin,item=audit.statusResponses[0];
    assert.equal(audit.transientDocument403sCleared,1);assert.equal(audit.credentialSubmissions,1);assert.equal(audit.passiveCheckMs,4000);
    assert.equal(item.status,403);assert.equal(item.origin,'https://www.hapag-lloyd.com');assert.equal(item.path,'/solutions/navigator/');
    assert.equal(item.resourceType,'document');assert.equal(item.mainFrameNavigation,true);assert.equal(item.documentGeneration,1);
    assert.equal(item.automaticCheckPendingObserved,true);assert.equal(item.interactiveVerificationObserved,false);
    assert.equal(item.pendingEvidenceKind,'CHECKING_YOUR_BROWSER');assert.equal(item.navigationSequence,1);
    assert.equal(item.classification,'TRANSIENT_AUTOMATIC_CHECK_CLEARED');assert.equal(item.clearedTo,'NORMAL_LOGIN');
    assert.ok(item.pendingObservedAt&&item.clearedAt);assert.equal(JSON.stringify(audit).includes('must-not-be-recorded'),false);
    assert.equal(JSON.stringify(audit).includes('?'),false);assert.equal(audit.verificationActions,0);
    assert.equal(f.calls.filter(c=>c[0]==='click'&&c[1]==='Log in').length,1);
  });
});

test('an unknown document 403 followed by a later login never acquires retrospective passive evidence',async()=>{
  const f=fixture({phase:'checking',url:NAVIGATOR});
  f.emit(403,NAVIGATOR,'document',{navigation:true});f.commit();
  f.state.phase='login';f.state.url=LOGIN;f.commit();
  await run(f,async()=>{
    await assert.rejects(f.gate.ensureReady(),{code:'HAPAG_WEBSITE_ACCESS_DENIED'});
    assert.equal(f.reads,0);assert.equal(f.lifecycle.websiteLogin.transientDocument403sCleared,0);
    assert.equal(f.lifecycle.websiteLogin.statusResponses[0].classification,'UNKNOWN_DOCUMENT_403');
    assert.equal(f.lifecycle.websiteLogin.statusResponses[0].automaticCheckPendingObserved,undefined);
  });
});

test('a previous pending document, an uncommitted new response, or an iframe 403 cannot supply main-document passive proof',async()=>{
  for(const mode of ['previous-document','no-dom-ready','iframe']) {
    const f=fixture({phase:'checking',url:NAVIGATOR,pendingUntil:Infinity});
    if(mode==='previous-document')f.commit();
    f.emit(403,NAVIGATOR,'document',{navigation:true,subframe:mode==='iframe'});
    await run(f,async()=>{
      await assert.rejects(f.gate.ensureReady(),{code:'HAPAG_WEBSITE_ACCESS_DENIED'});
      assert.equal(f.reads,0);assert.equal(f.calls.length,0);assert.equal(f.lifecycle.websiteLogin.transientDocument403sCleared,0);
    });
  }
});

test('a true document access denial or a document 403 without visible checking stops before credentials',async()=>{
  for(const denial of [false,true]) {
    const f=fixture({phase:'login',url:LOGIN});
    if(denial) {
      const original=f.page.frames;
      f.page.frames=()=>original().map(frame=>({...frame,locator:()=>({isVisible:async()=>true,innerText:async()=> '403 Forbidden\nAccess Denied'})}));
    }
    f.emit(403,LOGIN,'document',{navigation:true});f.commit();
    await run(f,async()=>{
      await assert.rejects(f.gate.ensureReady(),{code:'HAPAG_WEBSITE_ACCESS_DENIED'});
      assert.equal(f.reads,0);assert.equal(f.calls.some(c=>c[0]==='click'),false);
      assert.equal(f.lifecycle.websiteLogin.transientDocument403sCleared,0);
    });
  }
});

test('pending document403 proof cannot clear a subsequent XHR403, 429, MFA or interactive challenge',async()=>{
  for(const later of ['xhr403','rate429','mfa','captcha']) {
    const f=fixture({phase:'checking',url:NAVIGATOR,pendingUntil:Infinity});
    f.emit(403,NAVIGATOR,'document',{navigation:true});f.commit();let emitted=false;
    f.state.afterWait=()=>{if(emitted)return;emitted=true;
      if(later==='xhr403')f.emit(403,NAVIGATOR,'xhr');
      if(later==='rate429')f.emit(429,NAVIGATOR,'fetch');
      if(later==='mfa')f.state.mfa=true;
      if(later==='captcha')f.state.challenge=true;
    };
    await run(f,async()=>{
      await assert.rejects(f.gate.ensureReady(),{code:{xhr403:'HAPAG_WEBSITE_ACCESS_DENIED',rate429:'HAPAG_WEBSITE_RATE_LIMITED',mfa:'HAPAG_MFA_REQUIRED',captcha:'HUMAN_CAPTCHA'}[later]});
      assert.equal(f.reads,0);assert.equal(f.lifecycle.websiteLogin.transientDocument403sCleared,0);
      assert.equal(f.lifecycle.websiteLogin.statusResponses[0].classification,'PASSIVE_AUTOMATIC_CHECK_OBSERVED');
      f.state.phase='login';f.state.url=LOGIN;f.commit();await assert.rejects(f.gate.ensureReady());assert.equal(f.reads,0);
    });
  }
});

test('a repeated proven automatic document403 cannot reset the original passive deadline',async()=>{
  const f=fixture({phase:'checking',url:NAVIGATOR,pendingUntil:Infinity});
  f.emit(403,NAVIGATOR,'document',{navigation:true});f.commit();let repeated=false;
  f.state.afterWait=now=>{if(now>=120000&&!repeated){repeated=true;f.emit(403,NAVIGATOR,'document',{navigation:true});f.commit();}};
  await run(f,async()=>{
    await assert.rejects(f.gate.ensureReady(),{code:'HUMAN_CAPTCHA'});assert.equal(f.now(),130000);
    assert.equal(f.lifecycle.websiteLogin.blockedReason,'PASSIVE_CHECK_TIMEOUT');assert.equal(f.reads,0);
    assert.equal(f.lifecycle.websiteLogin.statusResponses.length,2);assert.equal(f.lifecycle.websiteLogin.transientDocument403sCleared,0);
  });
});

test('generic Security Check CAPTCHA FAQ cannot supply the stronger evidence required to clear a document403',async()=>{
  const f=fixture({phase:'checking',url:NAVIGATOR,bodyText:'Security Check\nOur security service protects this website. FAQ: What is a CAPTCHA?'});
  f.emit(403,NAVIGATOR,'document',{navigation:true});f.commit();
  await run(f,async()=>{
    await assert.rejects(f.gate.ensureReady(),{code:'HAPAG_WEBSITE_ACCESS_DENIED'});assert.equal(f.reads,0);
    assert.equal(f.lifecycle.websiteLogin.statusResponses[0].classification,'UNKNOWN_DOCUMENT_403');
    assert.equal(f.lifecycle.websiteLogin.statusResponses[0].pendingEvidenceKind,undefined);
  });
});

test('another same-URL navigation, whether 200 or 403, cannot lend its pending DOM to an earlier unknown403',async()=>{
  for(const replacement of [200,403]) {
    const f=fixture({phase:'checking',url:NAVIGATOR,pendingUntil:Infinity});
    f.emit(403,NAVIGATOR,'document',{navigation:true});
    f.emit(replacement,NAVIGATOR,'document',{navigation:true});f.commit();
    await run(f,async()=>{
      await assert.rejects(f.gate.ensureReady(),{code:'HAPAG_WEBSITE_ACCESS_DENIED'});assert.equal(f.reads,0);
      assert.equal(f.lifecycle.websiteLogin.blockedReason,'DOCUMENT_403_REPLACED_BEFORE_PASSIVE_PROOF');
      assert.equal(f.lifecycle.websiteLogin.statusResponses[0].classification,'UNKNOWN_DOCUMENT_403');
      assert.equal(f.lifecycle.websiteLogin.transientDocument403sCleared,0);
    });
  }
});

test('explicit main-document Technical Details Managed Challenge may naturally clear to exact Navigator UI without a credential read',async()=>{
  const f=fixture({phase:'checking',url:NAVIGATOR,bodyText:'Security Check\nTechnical Details: hapag-lloyd.com, Managed Challenge'});
  f.emit(403,NAVIGATOR,'document',{navigation:true});f.commit();let cleared=false;
  f.state.afterWait=now=>{if(now>=104000&&!cleared){cleared=true;delete f.state.bodyText;f.state.phase='ready';}};
  await run(f,async()=>{
    await f.gate.ensureReady();const item=f.lifecycle.websiteLogin.statusResponses[0];
    assert.equal(item.pendingEvidenceKind,'TECHNICAL_DETAILS_MANAGED_CHALLENGE');
    assert.equal(item.classification,'TRANSIENT_AUTOMATIC_CHECK_CLEARED');assert.equal(item.clearedTo,'NAVIGATOR_QUERY_UI');
    assert.equal(f.reads,0);assert.ok(f.calls.every(c=>c[0]==='passive-wait'));assert.equal(f.lifecycle.websiteLogin.passiveCheckMs,4000);
  });
});

test('human, MFA or denial appearing between the frame safety read and the main-body proof overrides earlier pending evidence',async()=>{
  for(const [text,code] of [['Checking your browser\nPlease verify you are human','HUMAN_CAPTCHA'],
    ['Checking your browser\nEnter verification code','HAPAG_MFA_REQUIRED'],
    ['Checking your browser\nAccess Denied','HAPAG_WEBSITE_ACCESS_DENIED']]) {
    const f=fixture({phase:'checking',url:NAVIGATOR,pendingUntil:Infinity});
    f.emit(403,NAVIGATOR,'document',{navigation:true});f.commit();
    const original=f.page.locator;
    f.page.locator=selector=>selector==='body'?{innerText:async()=>text}:original(selector);
    await run(f,async()=>{
      await assert.rejects(f.gate.ensureReady(),{code});assert.equal(f.reads,0);assert.equal(f.calls.length,0);
      assert.equal(f.lifecycle.websiteLogin.transientDocument403sCleared,0);
      assert.equal(f.lifecycle.websiteLogin.statusResponses[0].interactiveVerificationObserved,undefined);
    });
  }
});
