import test from'node:test';import assert from'node:assert/strict';
import{areKnownHapagPrivacyDialogs}from'../src/carriers/hapag-website-login.mjs';
import{dismissYmlNecessaryCookieNotice}from'../src/carriers/ordinary-page-controls.mjs';
test('Hapag recognizes nested OneTrust dialogs together and rejects an unknown sibling',()=>{
 const panel={querySelectorAll:s=>s.startsWith('input')?[{},{},{},{}]:[{textContent:'Confirm My Choices'}]};
 const banner={textContent:'Depending on your consent and your cookie settings',querySelectorAll:()=>[{}]};
 const p={closest:s=>s==='#onetrust-pc-sdk'?panel:null},b={closest:s=>s==='#onetrust-banner-sdk'?banner:null},unknown={closest:()=>null};
 assert.equal(areKnownHapagPrivacyDialogs([p,b]),true);assert.equal(areKnownHapagPrivacyDialogs([p,b,unknown]),false);assert.equal(areKnownHapagPrivacyDialogs([]),false);
 panel.querySelectorAll=()=>[];assert.equal(areKnownHapagPrivacyDialogs([p]),false);
});
for(const wrong of[false,true])test('late Yang Ming necessary-cookie notice '+(wrong?'rejects an unrelated Agree button':'is dismissed before search'),async()=>{
 const calls=[];const agree={waitFor:async o=>calls.push(o.state),count:async()=>1,click:async()=>calls.push('click')};
 const page={getByRole:(role,o)=>{assert.equal(role,'button');assert.equal(o.name,'Agree');return agree;},locator:()=>({innerText:async()=>wrong?'Unrelated permission':'This Website uses necessary cookies to collect data'})};
 if(wrong){await assert.rejects(()=>dismissYmlNecessaryCookieNotice(page),/Unrecognized/);assert.deepEqual(calls,['visible']);}
 else{await dismissYmlNecessaryCookieNotice(page);assert.deepEqual(calls,['visible','click','hidden']);}
});
