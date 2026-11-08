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
 ok(errs.length===0,'no page errors'+(errs.length?': '+errs.join(' | '):''));
 // version + changelog in step
 const v=await p.getAttribute('meta[name=app-version]','content');ok(await p.evaluate(v=>UPDATES[UPDATES.length-1].v===v,v),'UPDATES has an entry for '+v);
 await b.close();srv.close();console.log(fails?fails+' failed':'all passed');process.exit(fails?1:0);
})().catch(e=>{console.error(e);process.exit(1);});
