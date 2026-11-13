/* ============ CONFIG ============ */
const CONFIG = {
  discordInvite: "https://discord.gg/se8T7kWWZN",
  discordClientId: "1563922688962199562",
  // نفس مجلد الموقع (يشتغل على github.io وعلى أي دومين لاحقاً) — لازم يكون مسجّل في Redirects بالدسكورد
  discordRedirect: location.origin + location.pathname.replace(/[^/]*$/, ''),
  // رابط Webhook روم التقديمات يُقرأ من config.js
  quizWebhook: (typeof window!=='undefined' && window.HV_WEBHOOK) || "",
  passPercent: 80,
};

/* ============ safe storage ============ */
const store = {
  get(k){ try{return JSON.parse(localStorage.getItem(k))}catch(e){return null} },
  set(k,v){ try{localStorage.setItem(k,JSON.stringify(v))}catch(e){} },
  del(k){ try{localStorage.removeItem(k)}catch(e){} },
};

/* ============ header: discord login, user chip, menu ============ */
function initChrome(){
  const yr=document.getElementById('yr'); if(yr) yr.textContent=new Date().getFullYear();
  document.querySelectorAll('[data-discord]').forEach(a=>a.href=CONFIG.discordInvite);
  const mb=document.getElementById('menubtn'), nl=document.getElementById('navlinks');
  if(mb&&nl) mb.onclick=()=>nl.classList.toggle('open');
  const lb=document.getElementById('loginBtn'); if(lb) lb.onclick=discordLogin;
  handleOAuth();
  const u=store.get('hv_user'); if(u) showUser(u);
}
function b64url(buf){ return btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,''); }
async function discordLogin(returnTo){
  if(typeof returnTo==='string') store.set('hv_return',returnTo);
  const ver=b64url(crypto.getRandomValues(new Uint8Array(48)));
  const ch=b64url(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(ver)));
  store.set('hv_pkce',ver);
  const p=new URLSearchParams({client_id:CONFIG.discordClientId,redirect_uri:CONFIG.discordRedirect,response_type:"code",scope:"identify role_connections.write",code_challenge:ch,code_challenge_method:"S256"});
  location.href="https://discord.com/oauth2/authorize?"+p.toString();
}
function showUser(u){
  const lb=document.getElementById('loginBtn'); if(lb) lb.style.display='none';
  const chip=document.getElementById('userchip'); if(!chip) return;
  chip.style.display='flex';
  const nm=document.getElementById('uname'); if(nm) nm.textContent='@'+u.username;
  const av=document.getElementById('uavatar'); if(av) av.src=u.avatar?`https://cdn.discordapp.com/avatars/${u.id}/${u.avatar}.png?size=64`:`https://cdn.discordapp.com/embed/avatars/0.png`;
  chip.onclick=()=>{ if(confirm('تسجيل الخروج؟')){store.del('hv_user');store.del('hv_tok');location.reload();} };
}
function afterToken(tok,exp,scope){
  store.set('hv_tok',{t:tok,exp:Date.now()+Math.max(0,(exp||604800)-60)*1000,scope:scope||''});
  fetch('https://discord.com/api/users/@me',{headers:{Authorization:'Bearer '+tok}})
    .then(r=>r.json()).then(u=>{
      if(u&&u.id){ const user={id:u.id,username:u.global_name||u.username,tag:u.username,avatar:u.avatar}; store.set('hv_user',user); showUser(user); }
      const rt=store.get('hv_return'); if(rt){ store.del('hv_return'); if(rt!==location.pathname.split('/').pop()) location.href=rt; else initQuiz(); }
    }).catch(()=>{ const rt=store.get('hv_return'); if(rt){ store.del('hv_return'); location.href=rt; } });
}
async function handleOAuth(){
  const q=new URLSearchParams(location.search);
  if(q.get('error')){ history.replaceState(null,'',location.pathname); alert('Discord: '+(q.get('error_description')||q.get('error'))); return; }
  if(q.get('code')){
    const code=q.get('code'), ver=store.get('hv_pkce');
    history.replaceState(null,'',location.pathname);
    try{
      const r=await fetch('https://discord.com/api/v10/oauth2/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},
        body:new URLSearchParams({client_id:CONFIG.discordClientId,grant_type:'authorization_code',code,redirect_uri:CONFIG.discordRedirect,code_verifier:ver||''})});
      const j=await r.json(); store.del('hv_pkce');
      if(j.access_token) afterToken(j.access_token,j.expires_in,j.scope);
      else alert('Discord login: '+(j.error_description||j.error||r.status));
    }catch(e){ alert('Discord login error: '+e); }
    return;
  }
  if(location.hash.includes('access_token')){
    const h=new URLSearchParams(location.hash.slice(1));
    history.replaceState(null,'',location.pathname+location.search);
    if(h.get('access_token')) afterToken(h.get('access_token'),+(h.get('expires_in')||0),h.get('scope'));
  }
}

/* ============ RULES ============ */
const RULES = [
  {t:"قوانين عامة", items:["العمر المطلوب +17 سنة، ويجب امتلاك مايك واضح.","شخصية واحدة لكل لاعب، وحساب واحد؛ ممنوع مشاركة الحساب.","اسم الشخصية يجب أن يكون واقعياً ومناسباً، بلا رموز أو إساءات.","ممنوع استخدام أي برامج غش أو تعديلات تعطي أفضلية.","احترم الجميع داخل اللعبة وخارجها؛ الإدارة قرارها نهائي."]},
  {t:"قانون الحياة الجديدة (NLR)", items:["عند موت شخصيتك ونقلك للمستشفى، تنسى أحداث موتك ومن قتلك.","ممنوع العودة لنفس المكان أو الثأر من نفس الحدث بعد الموت.","ابدأ حياتك من جديد وكأن ما جرى سابقاً ذكرى لا تُستعاد."]},
  {t:"القتل العشوائي (RDM)", items:["ممنوع قتل أي لاعب دون سبب رول واضح أو تهديد مسبق.","لا بد من تفاعل وإنذار قبل أي عمل عنيف.","القتل لمجرد التسلية مخالفة جسيمة تؤدي للحظر."]},
  {t:"الدهس العشوائي (VDM)", items:["ممنوع استخدام المركبة كسلاح لدهس اللاعبين دون سياق رول.","القيادة المتهورة بقصد الأذى تُعامل كقتل عشوائي."]},
  {t:"الميتاجيمنغ (Metagaming)", items:["ممنوع استخدام معلومات من خارج اللعبة (بث، دسكورد، مقاطع) داخلها.","ما يحدث داخل الشخصية يبقى داخلها فقط.","ممنوع تمرير مواقع أو معلومات لاعبين عبر وسائل خارجية."]},
  {t:"الباورجيمنغ (Powergaming)", items:["ممنوع فرض أفعال غير واقعية أو إجبار الآخرين على سيناريو.","التزم بقدرات واقعية لشخصيتك؛ لست خارقاً.","ممنوع استغلال ثغرات اللعبة لتحقيق أفضلية."]},
  {t:"الخوف على الحياة (NVL)", items:["عند تهديدك بسلاح عليك إظهار خوف واقعي والتجاوب.","لا تخاطر بحياتك في مواقف يستحيل النجاة منها واقعياً.","حياة شخصيتك ثمينة؛ تصرّف على هذا الأساس."]},
  {t:"تقدير الحياة", items:["تجنّب التهوّر والمجازفة غير المبرّرة بحياتك أو حياة غيرك.","فضّل التفاوض قبل تعريض لاعب آخر للخطر.","الرول الجيد يحافظ على استمرارية القصة لا إنهائها بسرعة."]},
  {t:"القيادة الواقعية", items:["قُد بواقعية واحترم إشارات المرور قدر الإمكان.","ممنوع القفزات والاستعراضات غير الواقعية بالمركبات.","حوادث القيادة يجب أن تُرول بشكل منطقي."]},
  {t:"البث والستريم", items:["ممنوع التلصص على بث الخصم (Stream Sniping).","ممنوع التواصل الخارجي أثناء اللعب للحصول على أفضلية.","التزم بالرول داخل اللعبة ولا تكتب خارج السياق."]},
  {t:"سلوك السيرفر", items:["ممنوع البوتات أو السبام في الدسكورد أو اللعبة.","مطالبات التعويض تُقدّم بدليل (صورة/مقطع) عبر التذاكر.","ممنوع الإهانة أو التمييز العنصري أو الديني بأي شكل.","التداول والتحويلات بين اللاعبين تخضع لضوابط الإدارة."]},
  {t:"نظام الإنذارات", items:["المخالفات تُعالج بنظام إنذارات متصاعد ثم حظر مؤقت فدائم.","بعض المخالفات الجسيمة تؤدي للحظر مباشرة دون إنذار.","تراكم الإنذارات يُصعّد العقوبة تلقائياً."]},
  {t:"قوانين الشرطة", items:["الالتزام بالتسلسل والأوامر وسلسلة القيادة.","استخدام القوة والسلاح يكون متناسباً مع التهديد فقط.","التعامل مع الأدلة بأمانة وعدم التلاعب بها.","المداهمات والإيقافات تتم وفق مبرر رول واضح.","الإخلال بالواجب أو إساءة استخدام الصلاحية يُحاسب عليه."]},
  {t:"قوانين الإسعاف", items:["الإسعاف جهة محايدة؛ ممنوع الانحياز أو المشاركة في النزاعات.","استخدام مركبات ومعدات الإسعاف لأغراضها فقط.","الالتزام بأوقات الدوام والاستراحات المحددة.","التعامل المهني مع المرضى وإنقاذ الأرواح أولوية."]},
  {t:"قوانين العصابات", items:["حجم العصابة وعدد أفرادها يخضع لحد تحدده الإدارة.","الحروب والثأر تتم بإجراءات وتبليغ مسبق للإدارة.","ممنوع الهجمات العشوائية بين العصابات دون سبب رول.","لكل عصابة حدود نشاط ومناطق نفوذ متفق عليها."]},
  {t:"قوانين وزارة العدل", items:["القضاة والمدعون والمحامون يلتزمون بالحياد والنزاهة.","المذكرات والأوامر القضائية تصدر وفق إجراءات واضحة.","آداب المحكمة واجبة على الجميع.","محو السجل الجنائي يتم بشروط محددة عبر المحكمة."]},
  {t:"قوانين الجرائم", items:["السرقات والخطف لها حدود زمنية وعددية تحددها الإدارة.","الرهائن يُعاملون برول واقعي ولهم حق التفاوض.","عند الاستسلام يُحترم الوضع ولا يُستغل غدراً.","التعامل مع رجال الأمن أثناء الجريمة يخضع لضوابط صارمة."]},
];
function renderRules(){
  const rg=document.getElementById('rulegrid'); if(!rg) return;
  RULES.forEach((r,i)=>{
    const d=document.createElement('details'); d.className='rule';
    d.innerHTML=`<summary><span class="num">${i+1}</span>${r.t}<span class="chev">▾</span></summary><div class="body"><ul>${r.items.map(x=>`<li>${x}</li>`).join('')}</ul></div>`;
    rg.appendChild(d);
  });
}

/* ============ QUIZ ============ */
const QUIZ = [
  {q:"ماذا يعني قانون الحياة الجديدة (NLR)؟",o:["تنسى أحداث موتك ولا تثأر لمن قتلك","تعود فوراً لمكان موتك وتكمل","تحتفظ بكل ذكرياتك وتثأر","تخسر أموالك فقط"],a:0},
  {q:"ما هو RDM؟",o:["قيادة متهورة في المدينة","قتل لاعب دون سبب رول أو تهديد مسبق","سرقة متجر","التلصص على بث الخصم"],a:1},
  {q:"استخدام معلومات من البث أو الدسكورد داخل اللعبة يُسمى:",o:["باورجيمنغ","ميتاجيمنغ","NLR","تقدير الحياة"],a:1},
  {q:"عند تهديدك بسلاح ناري من مسافة قريبة، التصرف الصحيح:",o:["تتجاهل وتسحب سلاحك فوراً","تُظهر خوفاً واقعياً وتتجاوب مع المطالب","تسجّل خروج من اللعبة","تدهسه بسيارتك"],a:1},
  {q:"ما الحد الأدنى للعمر للانضمام للسيرفر؟",o:["13 سنة","15 سنة","17 سنة","21 سنة"],a:2},
  {q:"استخدام المركبة كسلاح لدهس اللاعبين عشوائياً هو:",o:["VDM (دهس عشوائي)","رول مقبول","NLR","ميتاجيمنغ"],a:0},
  {q:"فرض أفعال غير واقعية أو إجبار لاعب على سيناريو معيّن يُسمى:",o:["تقدير الحياة","باورجيمنغ","قيادة واقعية","NVL"],a:1},
  {q:"كم شخصية يُسمح لكل لاعب في السيرفر؟",o:["شخصية واحدة","شخصيتان","ثلاث شخصيات","عدد غير محدود"],a:0},
  {q:"عند طلب تعويض عن خطأ أو مخالفة، يجب أن يكون:",o:["طلب شفهي داخل اللعبة","مرفق بدليل (صورة/مقطع) عبر التذاكر","عبر البث المباشر","غير مسموح مطلقاً"],a:1},
  {q:"ما دور الإسعاف أثناء النزاعات والاشتباكات؟",o:["ينحاز لطرف ويقاتل معه","جهة محايدة مهمتها إنقاذ الأرواح","يسرق المصابين","يتجاهل الحالات"],a:1},
  {q:"بدء إطلاق نار على لاعب دون أي تفاعل أو إنذار مسبق يُعتبر:",o:["رول صحيح","RDM ومخالفة جسيمة","دفاع عن النفس","باورجيمنغ"],a:1},
  {q:"ماذا يجب أن تفعل عند استسلام لاعب لك (رفع يديه)؟",o:["تقتله مباشرة","تحترم استسلامه وتتعامل بواقعية","تتجاهله وتنصرف دائماً","تجبره على الخروج من اللعبة"],a:1},
  {q:"القيادة الواقعية تعني:",o:["قفزات واستعراضات بأقصى سرعة","احترام قواعد الطريق وقيادة منطقية","دهس المشاة للتسلية","تجاهل الحوادث تماماً"],a:1},
  {q:"ما العقوبة المتوقعة عند تكرار المخالفات؟",o:["لا شيء إطلاقاً","نظام إنذارات متصاعد ثم حظر","مكافأة","ترقية إدارية"],a:1},
  {q:"هل يجوز استخدام برامج أو تعديلات تمنحك أفضلية (غش)؟",o:["نعم في أي وقت","نعم بإذن صديق","لا، وتؤدي للحظر","فقط في المطاردات"],a:2},
];
let Q={i:0,score:0,ans:[]};
function validTok(){ const t=store.get('hv_tok'); return (t&&t.t&&t.exp>Date.now()&&(!t.scope||String(t.scope).includes('role_connections')))?t.t:null; }
function loginGate(box,msg){
  box.innerHTML=`<div class="gate"><div class="big">🔒</div><h2 style="font-size:24px;font-weight:900;margin-bottom:8px">سجّل الدخول لبدء الاختبار</h2><p style="color:var(--muted);margin-bottom:20px">${msg}</p><button class="btn primary" onclick="discordLogin('test.html')">دخول بالدسكورد</button></div>`;
}
async function initQuiz(){
  const box=document.getElementById('quizbox'); if(!box) return;
  const u=store.get('hv_user'), tok=validTok();
  if(!u||!tok){ loginGate(box,'سجّل دخولك بالدسكورد عشان يوصل تقديمك للإدارة باسمك وتوصلك رتبة «قدّم الاختبار الإلكتروني».'); return; }
  box.innerHTML=`<div class="result"><div style="font-size:40px">⏳</div></div>`;
  // already submitted? (stored on Discord, can't be bypassed by clearing the browser)
  try{
    const r=await fetch(`https://discord.com/api/v10/users/@me/applications/${CONFIG.discordClientId}/role-connection`,{headers:{Authorization:'Bearer '+tok}});
    if(r.status===401){ const me=await fetch('https://discord.com/api/v10/users/@me',{headers:{Authorization:'Bearer '+tok}}); if(me.status===401){ store.del('hv_tok'); loginGate(box,'انتهت جلستك، سجّل الدخول من جديد.'); return; } }
    const c=r.ok?await r.json():null;
    if(c&&c.metadata&&String(c.metadata.submitted)==='1'){ doneScreen(box,true,true); return; }
  }catch(e){}
  box.innerHTML=`<div style="text-align:center"><div style="font-size:50px">📝</div><h2 style="font-size:24px;font-weight:900;margin:10px 0">اختبار القبول — ${QUIZ.length} سؤال</h2><p style="color:var(--muted);max-width:500px;margin:0 auto 10px">أسئلة اختيار من متعدد عن قوانين هيفن. اقرأ القوانين قبل ما تبدأ — <b>مسموح تقديم واحد فقط</b>.</p><p style="color:var(--muted);font-size:13px;margin-bottom:20px">المتقدّم: <b>@${u.username}</b></p><button class="btn red" onclick="startQuiz()">ابدأ الاختبار</button></div>`;
}
function startQuiz(){ Q={i:0,score:0,ans:[]}; renderQ(); }
function renderQ(){
  const box=document.getElementById('quizbox'); const it=QUIZ[Q.i];
  box.innerHTML=`<div class="qprog"><span style="width:${(Q.i/QUIZ.length)*100}%"></span></div>
    <div class="qnum">سؤال ${Q.i+1} من ${QUIZ.length}</div><div class="qtext">${it.q}</div>
    <div class="opts">${it.o.map((o,i)=>`<button class="opt" data-i="${i}"><span class="mk">${['أ','ب','ج','د'][i]}</span>${o}</button>`).join('')}</div>
    <div class="qfoot"><span style="color:var(--muted);font-size:13px">اختر إجابة واحدة</span><button class="btn" id="nextBtn" disabled onclick="nextQ()">${Q.i===QUIZ.length-1?'إنهاء وإرسال':'التالي'}</button></div>`;
  box.querySelectorAll('.opt').forEach(b=>b.onclick=()=>{
    box.querySelectorAll('.opt').forEach(x=>x.classList.remove('sel'));
    b.classList.add('sel'); box.dataset.sel=b.dataset.i; document.getElementById('nextBtn').disabled=false;
  });
}
function nextQ(){
  const sel=+document.getElementById('quizbox').dataset.sel;
  Q.ans[Q.i]=sel; if(sel===QUIZ[Q.i].a) Q.score++;
  Q.i++; if(Q.i<QUIZ.length) renderQ(); else finishQuiz();
}
async function finishQuiz(){
  const pct=Math.round((Q.score/QUIZ.length)*100), u=store.get('hv_user')||{username:'لاعب',id:'0'};
  const box=document.getElementById('quizbox');
  box.innerHTML=`<div class="result"><div style="font-size:44px">⏳</div><p style="color:var(--muted);margin-top:8px">جارِ إرسال تقديمك للإدارة...</p></div>`;
  const sent=await submitQuiz(u,pct);
  const role=await grantRole(u,pct);
  doneScreen(box,sent,role);
}
function doneScreen(box,sent,role){
  box.innerHTML=`<div class="result">
    <div style="font-size:60px">✅</div>
    <h2 style="font-size:26px;margin:6px 0;color:var(--ok)">تم استلام تقديمك</h2>
    <p style="color:var(--muted);max-width:500px;margin:0 auto 10px">الإدارة رح تراجع أجوبتك وترد عليك بالدسكورد.</p>
    <p style="font-size:13px;color:${role?'var(--ok)':'var(--warn)'};margin-bottom:6px">${role?'✓ رتبة «قدّم الاختبار الإلكتروني» صارت مستحقّة لك بالدسكورد':'⚠ تعذّر ربط الرتبة — تواصل مع الإدارة'}</p>
    <p style="font-size:12.5px;color:var(--muted);margin-bottom:18px">إذا ما ظهرت الرتبة تلقائياً: بسيرفر الدسكورد افتح قائمة السيرفر ← <b>Linked Roles</b> ← «قدّم الاختبار الإلكتروني».</p>
    <div class="cta" style="justify-content:center;display:flex;gap:12px;flex-wrap:wrap">
      <a class="btn primary" href="${CONFIG.discordInvite}" target="_blank" rel="noopener">الدخول للدسكورد</a>
      <a class="btn ghost" href="rules.html">مراجعة القوانين</a>
    </div></div>`;
}
async function grantRole(u,pct){
  const tok=validTok(); if(!tok) return false;
  try{
    const r=await fetch(`https://discord.com/api/v10/users/@me/applications/${CONFIG.discordClientId}/role-connection`,{
      method:'PUT',headers:{Authorization:'Bearer '+tok,'Content-Type':'application/json'},
      body:JSON.stringify({platform_name:'Haven City',platform_username:u.username,metadata:{submitted:1}})});
    return r.ok;
  }catch(e){ return false; }
}
async function submitQuiz(u,pct){
  if(!CONFIG.quizWebhook) return false;
  const pass=pct>=CONFIG.passPercent;
  const fields=[
    {name:"المتقدّم",value:`<@${u.id}> — @${u.tag||u.username} \`(${u.id})\``,inline:true},
    {name:"النتيجة",value:`**${pct}%** — ${Q.score}/${QUIZ.length} ${pass?'✅':'⚠️'}`,inline:true},
  ];
  QUIZ.forEach((it,i)=>{
    const sel=Q.ans[i], ok=sel===it.a;
    fields.push({name:`${i+1}. ${it.q}`.slice(0,250),value:(`${ok?'✅':'❌'} ${it.o[sel]??'—'}`+(ok?'':`\n↳ الصحيح: ${it.o[it.a]}`)).slice(0,1000)});
  });
  const payload={username:"Haven Whitelist",allowed_mentions:{parse:[]},embeds:[{title:"📝 تقديم اختبار جديد",color:pass?4243543:14703647,fields:fields.slice(0,25),timestamp:new Date().toISOString(),footer:{text:"Haven City — اختبار القبول"}}]};
  try{ const r=await fetch(CONFIG.quizWebhook,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)}); return r.ok; }
  catch(e){ return false; }
}

document.addEventListener('DOMContentLoaded',()=>{ initChrome(); renderRules(); initQuiz(); });
