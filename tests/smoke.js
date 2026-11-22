// Click-through + bad-input test. Run: node tests/smoke.js  (needs Playwright + Chromium)
// Serves the folder itself, blocks Firebase so the app runs in "this device" mode.
const {chromium}=require('playwright');const http=require('http');const fs=require('fs');const path=require('path');const os=require('os');
const root=path.join(__dirname,'..');let fails=0;
const ok=(c,msg)=>{console.log((c?'PASS ':'FAIL ')+msg);if(!c)fails++;};
const srv=http.createServer((q,r)=>{const f=path.join(root,decodeURIComponent(q.url.split('?')[0])==='/'?'index.html':decodeURIComponent(q.url.split('?')[0]));
 fs.readFile(f,(e,d)=>{if(e){r.writeHead(404);return r.end();}r.writeHead(200,{'content-type':f.endsWith('.html')?'text/html':f.endsWith('.js')?'text/javascript':'application/octet-stream'});r.end(d);});});
const iso=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
(async()=>{
 await new Promise(r=>srv.listen(0,r));const url=`http://localhost:${srv.address().port}/index.html`;
 const b=await chromium.launch();const ctx=await b.newContext();const p=await ctx.newPage();
 const errs=[];p.on('pageerror',e=>errs.push(e.message));const dialogs=[];p.on('dialog',d=>{dialogs.push(d.message());d.accept();});
 await p.route(/gstatic|googleapis/,r=>r.abort());
 await p.goto(url);await p.waitForFunction(()=>document.getElementById('mode').textContent.includes('device'));
 // every tab renders
 for(const t of ['overview','guide','syllabus','common','journal','exams']){await p.click(`[data-tab=${t}]`);ok(await p.isVisible('#v-'+t),'tab '+t+' shows');}
 // syllabus: tick a topic, mark all done, reset
 await p.click('[data-tab=syllabus]');await p.click('[data-mod=rcc]');await p.click('[data-m=rcc][data-k="0"]');
 ok((await p.textContent('[data-m=rcc][data-k="0"]'))==='Learning','topic cycles to Learning');
 await p.click('[data-all=rcc][data-v="2"]');ok((await p.textContent('[data-mod=rcc]')).includes('17/17'),'mark all done');
 await p.click('[data-all=rcc][data-v="0"]');ok((await p.textContent('[data-mod=rcc]')).includes('0/17'),'reset');
 // common filters
 await p.click('[data-tab=common]');await p.click('[data-cmt=tech]');await p.click('[data-cmx=ibps]');
 ok((await p.textContent('#cmtable')).includes('No subject matches'),'common: tech + IBPS = none');await p.click('[data-cmclr]');
 // journal
 await p.click('[data-tab=journal]');const today=iso(new Date());
 const tom=new Date();tom.setDate(tom.getDate()+1);
 async function entry(o){await p.selectOption('#jType',o.type||'Study');for(const k of ['jDate','jHours','jScore','jTotal']){if(o[k]!==undefined&&await p.isVisible('#'+k))await p.fill('#'+k,String(o[k]));}
  await p.evaluate(()=>document.getElementById('jtoast').textContent='');
  await p.evaluate(()=>{const f=document.getElementById('jform');f.noValidate=true;f.requestSubmit();});await p.waitForTimeout(80);
  return {toast:await p.textContent('#jtoast'),n:await p.$$eval('#ledger .entry',e=>e.length)};}
 let r=await entry({jDate:today,jHours:'3.5'});ok(r.toast==='Saved'&&r.n===1,'valid entry saves');
 r=await entry({jDate:iso(tom),jHours:'2'});ok(r.n===1&&/future/.test(r.toast),'future date refused');
 r=await entry({jDate:today,jHours:'-2'});ok(r.n===1&&/between 0 and 18/.test(r.toast),'negative hours refused');
 r=await entry({jDate:today,jHours:'500'});ok(r.n===1&&/between 0 and 18/.test(r.toast),'500 hours refused');
 r=await entry({jDate:today,jHours:'18'});r=await entry({jDate:today,jHours:'3'});ok(r.n===2&&/24h/.test(r.toast),'over 24h a day refused');
 r=await entry({jDate:'',jHours:'1'});ok(r.n===2&&/real date/.test(r.toast),'empty date refused');
 r=await entry({jDate:'2026-10-01',jHours:'2',type:'Mock',jScore:'150',jTotal:''});ok(r.n===2&&/total/.test(r.toast),'mock without total refused');
 r=await entry({jDate:'2026-10-01',jHours:'2',type:'Mock',jScore:'250',jTotal:'200'});ok(r.n===2&&/more than the total/.test(r.toast),'mock score over total refused');
 r=await entry({jDate:'2026-10-01',jHours:'2',type:'Mock',jScore:'150',jTotal:'0'});ok(r.n===2&&/total/.test(r.toast),'mock total 0 refused');
 r=await entry({jDate:'2026-10-01',jHours:'2',type:'Mock',jScore:'-10',jTotal:'200'});ok(r.n===3,'negative marking score allowed');
 // this week ignores future-dated entries stored by older builds
 await p.evaluate(()=>{state.journal.push({id:'fut',date:'2099-01-01',hours:9,type:'Study'});saveLocal();});
 await p.click('[data-tab=overview]');ok((await p.textContent('#stats')).includes('This week21.5h'),'this week skips future entries');
 // exam dates: bad year refused
 await p.click('[data-tab=exams]');await p.evaluate(()=>{const el=document.getElementById('d-sscje');el.value='0201-11-02';el.dispatchEvent(new Event('change',{bubbles:true}));});
 ok(dialogs.some(d=>/date doesn't look right/.test(d))&&(await p.inputValue('#d-sscje'))==='2026-11-02','bad exam date refused');
 // guide: PYQ count cleaned
 await p.click('[data-tab=guide]');await p.fill('[data-pyq=sm]','2.6');await p.dispatchEvent('[data-pyq=sm]','change');ok((await p.inputValue('[data-pyq=sm]'))==='3','PYQ rounded');
 // sync mode offline: save must not hang (Firestore set never resolves offline)
 await p.evaluate(()=>{window.__w=[];mode='db';db={collection:()=>({doc:()=>({set:x=>{__w.push(x);return new Promise(()=>{});}})})};});
 await p.click('[data-tab=journal]');r=await entry({jDate:today,jHours:'1'});
 ok(r.toast==='Saved'&&(await p.evaluate(()=>__w.length))===1&&(await p.inputValue('#jHours'))==='','offline save in sync mode returns at once');
 await p.evaluate(()=>{mode='local';db=null;});
 // restore: broken backup must not brick the app, restored entries get ids
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'ej-'));const bad=path.join(tmp,'bad.json');
 fs.writeFileSync(bad,JSON.stringify({app:'shiva-exam-journal',journal:'oops',plan:{pyq:null,cur:null},progress:[1,2],exams:{nope:{}}}));
 await p.click('#bkBtn');await p.setInputFiles('#bkIn',bad);await p.waitForTimeout(200);
 for(const t of ['overview','guide','journal'])await p.click(`[data-tab=${t}]`);
 const noid=path.join(tmp,'noid.json');fs.writeFileSync(noid,JSON.stringify({app:'shiva-exam-journal',journal:[{date:'2026-10-29',hours:2,type:'Study'},{date:'2026-10-28',hours:1,type:'Study',id:'x'},{date:'2026-10-27',hours:1,type:'Study',id:'x'}]}));
 await p.click('#bkBtn');await p.setInputFiles('#bkIn',noid);await p.waitForTimeout(200);await p.click('[data-tab=journal]');
 const ids=await p.$$eval('#ledger [data-del]',e=>e.map(x=>x.dataset.del));ok(ids.length===3&&ids.every(Boolean)&&new Set(ids).size===3,'restored entries get unique ids');
 await p.click('#ledger [data-del]');await p.click('[data-confirm]');ok((await p.$$eval('#ledger .entry',e=>e.length))===2,'restored entry can be deleted');
 // bad data already in storage must not break boot
 await p.evaluate(()=>localStorage.setItem('shiva-exam-journal-v1',JSON.stringify({journal:'oops',plan:{pyq:null},progress:'x'})));await p.reload();await p.waitForTimeout(300);
 for(const t of ['overview','guide','journal','syllabus'])await p.click(`[data-tab=${t}]`);
 // odd values in storage / backups (numbers for dates, conf 9, html in counts) must not crash or inject
 for(const [name,data] of [['conf 9',{journal:[{date:'2026-11-01',hours:2,type:'Study',conf:9}]}],['date as number',{journal:[{date:20261101,hours:'x',type:5}]}],
   ['exam date as number',{exams:{sscje:{date:123,status:'zzz'}}}],['html in PYQ count',{plan:{pyq:{sm:'"><b id=pwn>x</b>'},cur:{tech:'nope'}}}],['bad progress',{progress:{rcc:{a:'9',b:-3}},dates:{rcc:{a:7}}}]]){
  const before=errs.length;await p.evaluate(d=>localStorage.setItem('shiva-exam-journal-v1',JSON.stringify(d)),data);await p.reload();await p.waitForTimeout(250);
  for(const t of ['overview','guide','journal','syllabus','exams','common'])await p.click(`[data-tab=${t}]`);await p.click('[data-tab=guide]');
  ok(errs.length===before&&!(await p.$('#pwn')),'survives '+name);}
 await p.evaluate(()=>localStorage.clear());await p.reload();await p.waitForTimeout(250);
 // RRB-style -1/3 marking score
 await p.click('[data-tab=journal]');await p.selectOption('#jType','Mock');await p.fill('#jScore','61.67');ok(await p.$eval('#jScore',e=>e.checkValidity()),'mock score 61.67 accepted');
 // Reset asks first (dismiss keeps progress)
 await p.click('[data-tab=syllabus]');if(await p.getAttribute('[data-mod=rcc]','aria-expanded')!=='true')await p.click('[data-mod=rcc]');await p.click('[data-all=rcc][data-v="2"]');
 p.removeAllListeners('dialog');p.once('dialog',d=>{dialogs.push(d.message());d.dismiss();});await p.click('[data-all=rcc][data-v="0"]');
 ok(dialogs.some(d=>/Reset every topic/.test(d))&&(await p.textContent('[data-mod=rcc]')).includes('17/17'),'reset asks and cancel keeps progress');
 p.on('dialog',d=>{dialogs.push(d.message());d.accept();});await p.click('[data-all=rcc][data-v="0"]');ok((await p.textContent('[data-mod=rcc]')).includes('0/17'),'reset after OK');
 // app left open past midnight: journal date + max roll over
 await p.evaluate(()=>{const y=new Date();y.setDate(y.getDate()-1);shownDay=iso(y);const jd=document.getElementById('jDate');jd.value=shownDay;jd.max=shownDay;dayCheck();});
 ok((await p.inputValue('#jDate'))===today&&(await p.getAttribute('#jDate','max'))===today,'new day rolls journal date');
 // sync mode: a tick waiting in the batch is sent when the app is hidden/closed
 await p.evaluate(()=>{window.__s=[];mode='db';db={doc:k=>({set:x=>{__s.push(k);return Promise.resolve();}})};setTopic('sm',MODS.sm.ids[0],1);flushProgress();});
 ok((await p.evaluate(()=>__s))[0]==='progress/sm','pending tick flushed on close');await p.evaluate(()=>{mode='local';db=null;});
 // week 3: 1h40m hours, double-save guard, appeared exams, paged journal, offline badge
 await p.click('[data-tab=journal]');await p.fill('#jHours','1.67');ok(await p.$eval('#jHours',e=>e.checkValidity()),'1.67 hours accepted');
 r=await entry({jDate:'2026-10-02',jHours:'1.67'});const n0=r.n;r=await entry({jDate:'2026-10-02',jHours:'1.67'});ok(r.n===n0&&/just saved/.test(r.toast),'double tap does not log twice');
 await p.evaluate(()=>{const f=new Date();f.setDate(f.getDate()+5);const g=new Date();g.setDate(g.getDate()+40);state.exams.cgl={date:iso(f),confirmed:false,status:'appeared',notes:''};state.exams.ntpc={date:iso(g),confirmed:false,status:'prep',notes:''};saveLocal();});
 await p.click('[data-tab=overview]');ok((await p.textContent('#stats')).includes('RRB NTPC'),'appeared exam is not the next exam');
 await p.evaluate(()=>{for(let i=0;i<120;i++)state.journal.push({id:'p'+i,date:'2026-09-01',hours:1,type:'Study'});saveLocal();});
 await p.click('[data-tab=journal]');const c1=await p.$$eval('#ledger .entry',e=>e.length);await p.click('[data-more]');const c2=await p.$$eval('#ledger .entry',e=>e.length);
 ok(c1===50&&c2===100,'journal shows 50 at a time ('+c1+','+c2+')');
 await p.evaluate(()=>{mode='db';syncLabel='Synced · test';});await ctx.setOffline(true);await p.waitForTimeout(100);const off=await p.textContent('#mode');await ctx.setOffline(false);await p.waitForTimeout(100);
 ok(/Offline/.test(off)&&/Synced/.test(await p.textContent('#mode')),'sync badge shows offline');await p.evaluate(()=>{mode='local';});

 // week 4 (2026-11-21 audit)
 // long unbroken text (a pasted link) must not push the page wider than a phone / iPad screen; Guide sequence text not clipped
 await p.setViewportSize({width:390,height:844});
 await p.evaluate(()=>{state.journal.push({id:'lnk',date:'2026-09-15',hours:1,type:'Study',topics:'https://drive.google.com/drive/folders/'+'x'.repeat(240),miss:'y'.repeat(240),createdAt:Date.now()});saveLocal();renderAll();});
 for(const t of ['journal','overview','guide']){await p.click(`[data-tab=${t}]`);ok(await p.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth),'phone: '+t+' fits the screen with a long link');}
 ok(await p.evaluate(()=>{const g=document.getElementById('gseq'),h=g.parentElement.firstElementChild;return h.getBoundingClientRect().right<=g.parentElement.getBoundingClientRect().right+1;}),'phone: Guide sequence text not cut off');
 await p.setViewportSize({width:820,height:1180});await p.click('[data-tab=journal]');ok(await p.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth),'iPad portrait: journal fits');
 await p.setViewportSize({width:1280,height:720});
 ok(await p.evaluate(()=>['jTopics','jMockName','jWell','jMiss','jNext','n-cgl'].every(id=>document.getElementById(id)?document.getElementById(id).maxLength===5000:true)&&document.getElementById('jWell').maxLength===5000),'free text capped at 5000 (longer was cut on reload)');
 ok(await p.evaluate(()=>entryHtml({id:'h',date:'2026-09-15',hours:1.3333333,type:'Study',conf:3},true).includes('>1.33h<')),'hours shown rounded');
 // Mark all done / Reset with a demand filter on: only the shown topics
 await p.evaluate(()=>{curExam='sscje';curSrc='';curDem='';openMods.clear();MODS.rcc.ids.forEach(i=>applyTopic('rcc',i,0));saveMod('rcc');});
 await p.click('[data-tab=syllabus]');await p.click('[data-dem=H]');const nH=await p.evaluate(()=>MODS.rcc.t.filter((_,k)=>topicDem('rcc',k)==='H').length);
 ok((await p.textContent('[data-all=rcc][data-v="2"]'))==='Mark shown done','filtered button says "Mark shown done"');
 await p.click('[data-all=rcc][data-v="2"]');ok(await p.evaluate(()=>modPct('rcc').done)===nH&&nH<17,'filtered Mark done only ticks the '+nH+' shown topics');
 await p.click('[data-all=rcc][data-v="0"]');ok(dialogs.some(d=>/Reset the \d+ topics shown/.test(d))&&(await p.evaluate(()=>modPct('rcc').done))===0,'filtered Reset asks about the shown topics');
 await p.click('[data-dem=""]');ok((await p.textContent('[data-all=rcc][data-v="2"]'))==='Mark all done','no filter: "Mark all done"');
 // exam notes save while typing, and when the app is closed mid-note
 await p.click('[data-tab=exams]');await p.click('#n-cgl');await p.fill('#n-cgl','');await p.keyboard.type('Roll 42');await p.waitForTimeout(900);
 ok(await p.evaluate(()=>document.activeElement.id==='n-cgl'&&state.exams.cgl.notes==='Roll 42'&&JSON.parse(localStorage.getItem(LKEY)).exams.cgl.notes==='Roll 42'),'exam notes save while typing');
 await p.keyboard.type(' centre');await p.evaluate(()=>window.dispatchEvent(new Event('pagehide')));
 ok(await p.evaluate(()=>JSON.parse(localStorage.getItem(LKEY)).exams.cgl.notes==='Roll 42 centre'),'exam notes kept when the app closes mid-note');
 await p.click('[data-tab=journal]');
 // an old "Saved" timer must not wipe a newer warning
 r=await entry({jDate:'2026-09-20',jHours:'0.5'});ok(r.toast==='Saved','toast: saved');r=await entry({jDate:'2026-09-20',jHours:'0.5'});await p.waitForTimeout(2600);
 ok(/just saved/.test(await p.textContent('#jtoast')),'toast: warning stays after the old Saved timer');
 // device storage full / blocked: say so instead of losing data silently
 await p.evaluate(()=>{window.__si=Storage.prototype.setItem;Storage.prototype.setItem=function(){throw new DOMException('full','QuotaExceededError');};setTopic('sm',MODS.sm.ids[1],1);});
 ok(/Not saved/.test(await p.textContent('#mode')),'full storage shows a warning');
 await p.evaluate(()=>{Storage.prototype.setItem=window.__si;setTopic('sm',MODS.sm.ids[1],2);});ok((await p.textContent('#mode'))==='Saving on this device only','warning clears once a save works');
 // two tabs on this device: one tab's save must not wipe the other's
 const p2=await ctx.newPage();p2.on('pageerror',e=>errs.push('tab2: '+e.message));await p2.route(/gstatic|googleapis/,r=>r.abort());await p2.goto(url);await p2.waitForFunction(()=>document.getElementById('mode').textContent.includes('device'));
 await p2.evaluate(()=>addEntry({date:'2026-09-21',hours:1,type:'Study',topics:'from tab 2',conf:3,createdAt:Date.now()}));await p.waitForTimeout(200);
 await p.evaluate(()=>setTopic('sm',MODS.sm.ids[2],1));await p2.close();
 ok(await p.evaluate(()=>{const s=JSON.parse(localStorage.getItem(LKEY));return s.journal.some(j=>j.topics==='from tab 2')&&s.progress.sm[MODS.sm.ids[2]]===1;}),'two tabs: both saves kept');
 // odd restore files: friendly messages, no crash
 await p.click('#bkBtn');const nul=path.join(tmp,'null.json');fs.writeFileSync(nul,'null');await p.setInputFiles('#bkIn',nul);await p.waitForTimeout(150);
 ok(dialogs.some(d=>/Could not restore: Not an exam journal backup/.test(d)),'restore: "null" file refused plainly');
 const txt=path.join(tmp,'notes.txt');fs.writeFileSync(txt,'hello');await p.setInputFiles('#bkIn',txt);await p.waitForTimeout(150);ok(dialogs.some(d=>/not valid JSON/.test(d)),'restore: non-JSON file refused plainly');
 const odd=path.join(tmp,'odd.json');fs.writeFileSync(odd,JSON.stringify({app:'shiva-exam-journal',at:12345,journal:[]}));
 p.removeAllListeners('dialog');p.once('dialog',d=>{dialogs.push(d.message());d.dismiss();});await p.setInputFiles('#bkIn',odd);await p.waitForTimeout(150);p.on('dialog',d=>{dialogs.push(d.message());d.accept();});
 ok(dialogs[dialogs.length-1]==='Replace the data here with this backup?','restore: odd "at" value does not break restore');await p.click('#bkX');
 // Escape closes dialogs
 await p.click('#appVerPill');await p.keyboard.press('Escape');ok(!(await p.$('.dlg')),'Escape closes What\'s new');
 // week 5: tab bar keys, dialog focus
 await p.click('[data-tab=overview]');await p.focus('#t-overview');await p.keyboard.press('ArrowRight');
 ok((await p.evaluate(()=>document.activeElement.id))==='t-guide'&&await p.isVisible('#v-guide')&&(await p.getAttribute('#t-guide','aria-controls'))==='v-guide','arrow key moves to the next tab');
 await p.keyboard.press('End');ok((await p.evaluate(()=>document.activeElement.id))==='t-exams','End goes to the last tab');await p.keyboard.press('ArrowRight');ok((await p.evaluate(()=>document.activeElement.id))==='t-overview','wraps to the first tab');
 await p.focus('#appVerPill');await p.keyboard.press('Enter');ok(await p.evaluate(()=>!!document.activeElement.closest('.dlg')),'What\'s new takes focus');
 await p.keyboard.press('Escape');ok(!(await p.$('.dlg'))&&(await p.evaluate(()=>document.activeElement.id))==='appVerPill','Escape closes and focus goes back');
 await p.click('#bkBtn');ok(await p.evaluate(()=>!!document.activeElement.closest('.bkdlg')),'Backup takes focus');await p.click('#bkX');ok((await p.evaluate(()=>document.activeElement.id))==='bkBtn','Backup close returns focus');
 ok(errs.length===0,'no page errors'+(errs.length?': '+errs.join(' | '):''));
 // version + changelog in step
 const v=await p.getAttribute('meta[name=app-version]','content');ok(await p.evaluate(v=>UPDATES[UPDATES.length-1].v===v,v),'UPDATES has an entry for '+v);

 // ---- sync mode, with a stand-in for Firebase (in-memory "cloud") ----
 const FAKE_FB=`(()=>{const I=window.__fsInit||{};const F=window.__fs={docs:I.docs||{},online:I.online!==false,user:I.user||null,commits:[],listeners:[],authCb:null};
 const clone=x=>JSON.parse(JSON.stringify(x));const notify=()=>F.listeners.slice().forEach(l=>l());const later=(v,ms)=>new Promise(r=>setTimeout(()=>r(v),ms||0));
 class D{constructor(p){this.path=p;this.id=p.split('/').pop();}set(d){F.docs[this.path]=clone(d);notify();return Promise.resolve();}delete(){delete F.docs[this.path];notify();return Promise.resolve();}}
 class C{constructor(p){this.path=p;}doc(id){return new D(this.path+'/'+(id||'a'+Math.random().toString(36).slice(2,12)));}
  _docs(){if(!F.online&&I.emptyCache)return [];const pre=this.path+'/';return Object.keys(F.docs).filter(k=>k.startsWith(pre)&&!k.slice(pre.length).includes('/')).map(k=>({id:k.slice(pre.length),data:()=>clone(F.docs[k])}));}
  limit(){return this;}
  get(o){if(o&&o.source==='server'&&!F.online)return Promise.reject({code:'unavailable'});const d=this._docs();return later({empty:!d.length,docs:d},I.getDelay);}
  onSnapshot(cb){const l=()=>{const d=this._docs();cb({empty:!d.length,docs:d});};F.listeners.push(l);setTimeout(l,0);return()=>{F.listeners=F.listeners.filter(x=>x!==l);};}}
 const fs={enablePersistence:()=>Promise.resolve(),doc:p=>new D(p),collection:p=>new C(p),
  batch:()=>{const ops=[];return{set:(r,d)=>ops.push(()=>{F.docs[r.path]=clone(d);}),delete:r=>ops.push(()=>{delete F.docs[r.path];}),commit:()=>{F.commits.push(ops.length);if(ops.length>500)return Promise.reject({code:'invalid-argument'});ops.forEach(f=>f());notify();return Promise.resolve();}};}};
 const auth={onAuthStateChanged(cb){F.authCb=cb;setTimeout(()=>cb(F.user),0);},getRedirectResult:()=>Promise.resolve(),
  signInWithPopup(){F.user={uid:'u1',email:'me@test'};setTimeout(()=>F.authCb(F.user),0);return Promise.resolve();},signOut(){F.user=null;setTimeout(()=>F.authCb(null),0);return Promise.resolve();}};
 const af=()=>auth;af.GoogleAuthProvider=function(){};window.firebase={initializeApp(){},firestore:()=>fs,auth:af};})();`;
 async function fbPage(init,local){const c=await b.newContext();await c.addInitScript(([i,l])=>{window.__fsInit=i;if(l)localStorage.setItem('shiva-exam-journal-v1',JSON.stringify(l));},[init,local]);
  const q=await c.newPage();const e=[];q.on('pageerror',x=>e.push(x.message));q.on('dialog',d=>d.accept());
  await q.route(/gstatic|googleapis/,r=>{const u=r.request().url();return /firebase-app-compat/.test(u)?r.fulfill({contentType:'text/javascript',body:FAKE_FB}):/firebasejs/.test(u)?r.fulfill({contentType:'text/javascript',body:''}):r.abort();});
  await q.goto(url);return {c,q,e};}
 const U={uid:'u1',email:'me@test'},jdocs=(q)=>q.evaluate(()=>Object.keys(__fs.docs).filter(k=>k.startsWith('users/u1/journal/')).length);
 // signed in on a device that also has old device-only data: the screen shows synced data at once (not the device copy while slow reads run)
 let s1=await fbPage({user:U,getDelay:1500,docs:{'users/u1/journal/c1':{date:'2026-10-01',hours:2,type:'Study',createdAt:1}}},{journal:[{id:'dev1',date:'2026-09-01',hours:1,type:'Study'}]});
 await s1.q.waitForTimeout(400);ok((await s1.q.evaluate(()=>state.journal.map(j=>j.id).join()))==='c1','sync: synced data shows at once, not the device copy');
 await s1.q.waitForTimeout(1500);ok((await s1.q.evaluate(()=>__fs.commits.length))===0,'sync: account with data is not overwritten by device data');
 // sign out with a tick still waiting in the batch: no crash, the tick is sent, then this device's own data shows
 await s1.q.evaluate(()=>setTopic('sm',MODS.sm.ids[0],1));await s1.q.click('#authBtn');await s1.q.waitForTimeout(1200);
 ok(s1.e.length===0&&(await s1.q.evaluate(()=>!!__fs.docs['users/u1/progress/sm']&&state.journal.map(j=>j.id).join()==='dev1')),'sign out: pending tick sent, device data shown'+(s1.e.length?' ('+s1.e.join(' | ')+')':''));await s1.c.close();
 let s2=await fbPage({user:U,docs:{'users/u1/journal/c1':{date:'2026-10-01',hours:2,type:'Study',createdAt:1}}},null);await s2.q.waitForTimeout(300);await s2.q.click('#authBtn');await s2.q.waitForTimeout(300);
 ok((await s2.q.evaluate(()=>state.journal.length))===0,'sign out: account data leaves the screen');await s2.c.close();
 // opened offline with an empty cache: never upload old device data over the account
 let s3=await fbPage({user:U,online:false,emptyCache:true,docs:{'users/u1/progress/sm':{s:{a:2,b:2},d:{},r:{}}}},{progress:{sm:{a:1}}});await s3.q.waitForTimeout(600);
 ok(await s3.q.evaluate(()=>__fs.commits.length===0&&__fs.docs['users/u1/progress/sm'].s.b===2),'offline start: device data not uploaded over synced ticks');await s3.c.close();
 // first sign-in with 700 device entries, then restoring a 600-entry backup over it: Firestore's 500-writes-per-batch limit
 const big=n=>Array.from({length:n},(_,i)=>({id:'e'+i,date:'2026-0'+(1+i%9)+'-1'+(i%9),hours:1,type:'Study',createdAt:i}));
 let s4=await fbPage({user:null,docs:{}},{journal:big(700)});await s4.q.waitForFunction(()=>document.getElementById('mode').textContent.includes('device'));await s4.q.click('#authBtn');await s4.q.waitForTimeout(800);
 let cm=await s4.q.evaluate(()=>__fs.commits);ok(cm.length>1&&cm.every(n=>n<=500)&&(await jdocs(s4.q))===700&&(await s4.q.evaluate(()=>state.journal.length))===700,'first sign-in uploads 700 entries in parts ('+cm.join(',')+')');
 const bk=path.join(tmp,'big.json');fs.writeFileSync(bk,JSON.stringify({app:'shiva-exam-journal',at:'2026-11-20',journal:big(600).map(j=>({...j,id:'n'+j.id}))}));
 await s4.q.click('#bkBtn');await s4.q.setInputFiles('#bkIn',bk);await s4.q.waitForTimeout(800);cm=await s4.q.evaluate(()=>__fs.commits.slice(-4));
 ok((await s4.q.evaluate(()=>__fs.commits.every(n=>n<=500)))&&(await jdocs(s4.q))===600&&(await s4.q.evaluate(()=>Object.keys(__fs.docs).filter(k=>k.startsWith('users/u1/journal/n')).length))===600,'restore of 600 over 700 synced entries goes through');
 ok(s4.e.length===0,'sync tests: no page errors'+(s4.e.length?': '+s4.e.join(' | '):''));await s4.c.close();
 // service worker: Firebase scripts come back "opaque"; they must be kept for offline opens
 {const vm=require('vm');const store=new Map();let net;const H={};const cache={match:async r=>store.get(r.url),put:async(r,x)=>{store.set(r.url,x);},addAll:async()=>{}};
  const sc={self:{addEventListener:(t,f)=>H[t]=f,skipWaiting(){},clients:{claim(){}}},caches:{open:async()=>cache,keys:async()=>[]},location:{origin:'https://victus2034.github.io'},URL,setTimeout,Request:function(u,o){this.url=u;Object.assign(this,o);},fetch:r=>net(r)};
  vm.createContext(sc);vm.runInContext(fs.readFileSync(path.join(root,'sw.js'),'utf8'),sc);
  const go=(u,n)=>{net=n;let out;H.fetch({request:{url:u,method:'GET'},respondWith:x=>out=x});return out;};
  const opq={ok:false,type:'opaque',status:0,clone(){return this;}},fb='https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js';
  await go(fb,()=>Promise.resolve(opq));const off=await go(fb,()=>Promise.reject(new Error('offline')));
  await go('https://victus2034.github.io/exam-journal/nope.js',()=>Promise.resolve({ok:false,type:'basic',status:404,clone(){return this;}}));
  ok(off===opq&&!store.has('https://victus2034.github.io/exam-journal/nope.js'),'offline: Firebase script served from the app cache, 404s not cached');
  const page='https://victus2034.github.io/exam-journal/',oldR={ok:true,v:'old',clone(){return this;}},newR={ok:true,v:'new',clone(){return this;}};
  const nav=(n)=>{net=n;let out;H.fetch({request:{url:page,method:'GET',mode:'navigate'},respondWith:x=>out=x});return out;};
  store.set(page,oldR);const got=await nav(()=>Promise.resolve(newR));ok(got===newR&&store.get(page)===newR,'online: a new build is shown on this open, not the next');
  const offp=await nav(()=>Promise.reject(new Error('offline')));ok(offp===newR,'offline: page served from the app cache');}
 await b.close();srv.close();console.log(fails?fails+' failed':'all passed');process.exit(fails?1:0);
})().catch(e=>{console.error(e);process.exit(1);});
