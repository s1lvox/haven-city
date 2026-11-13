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
function discordLogin(returnTo){
  if(typeof returnTo==='string') store.set('hv_return',returnTo);
  const p=new URLSearchParams({client_id:CONFIG.discordClientId,redirect_uri:CONFIG.discordRedirect,response_type:"token",scope:"identify"});
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
  if(location.hash.includes('error=')){ const h=new URLSearchParams(location.hash.slice(1)); history.replaceState(null,'',location.pathname); alert('Discord: '+(h.get('error_description')||h.get('error'))); return; }
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

/* ============ WHITELIST APPLICATION (written answers) ============ */
// type: text | date | area ; min = minimum characters ; max = maximum characters
const QUIZ = [
  {q:"عرّفنا عن نفسك: اسمك الحقيقي وتاريخ ميلادك", f:[{k:"name",l:"الاسم الحقيقي",t:"text",min:2,max:60},{k:"dob",l:"تاريخ الميلاد",t:"date"}]},
  {q:"بيانات شخصيتك داخل المدينة", f:[{k:"cname",l:"اسم الشخصية (الأول والأخير)",t:"text",min:3,max:60},{k:"cdob",l:"تاريخ ميلاد الشخصية",t:"date"},{k:"corigin",l:"البلد الأصلي للشخصية",t:"text",min:2,max:40},{k:"clang",l:"اللغة اللي تتكلمها الشخصية",t:"text",min:2,max:40}]},
  {q:"اكتب قصة شخصيتك: من وين جاية، شو صار معها، وليش وصلت لهيفن", f:[{k:"a",l:"قصة الشخصية",t:"area",min:150,max:1500}]},
  {q:"من خلال القصة، شو نقاط القوة ونقاط الضعف بشخصيتك؟", f:[{k:"a",l:"الإيجابيات والسلبيات",t:"area",min:40,max:600}]},
  {q:"عندك خبرة سابقة بالرول بلاي؟ احكيلنا عنها (سيرفرات، مدة، نوع الشخصيات)", f:[{k:"a",l:"خبرتك",t:"area",min:20,max:600}]},
  {q:"ليش اخترت هيفن؟ وشو بتضيف شخصيتك للمدينة؟", f:[{k:"a",l:"سبب الانضمام",t:"area",min:30,max:600}]},
  {q:"وأنت ماشي بالسوق شفت شاب خطف شنطة سيدة كبيرة بالعمر وهرب لزقاق جانبي، والسيدة وقعت على الأرض. شو بتعمل شخصيتك خطوة بخطوة؟", f:[{k:"a",l:"تصرّفك",t:"area",min:60,max:700}]},
  {q:"شخصيتك شغالة بورشة سيارات، وإجاك زبون عرض عليك مبلغ كبير عشان تمسح رقم الهيكل لسيارة واضح إنها مسروقة. كيف بتتصرف؟ وشو العواقب المحتملة داخل الرول؟", f:[{k:"a",l:"تصرّفك",t:"area",min:60,max:700}]},
  {q:"الشرطة أوقفتك وأنت بريء، والضابط عم يتعامل معك بأسلوب مستفز. كيف بتتصرف داخل الرول؟ ومتى بيحق لك تفتح تذكرة للإدارة؟", f:[{k:"a",l:"تصرّفك",t:"area",min:60,max:700}]},
  {q:"خسرت كل فلوسك بصفقة فاشلة، وعليك إيجار شقة لازم يندفع خلال أسبوع. اذكر ٣ طرق قانونية داخل المدينة تجمع فيها المبلغ.", f:[{k:"a",l:"الطرق القانونية",t:"area",min:60,max:700}]},
];
const MIN_AGE=17;
function ageOf(d){ if(!d) return null; const b=new Date(d), n=new Date(); let a=n.getFullYear()-b.getFullYear(); const m=n.getMonth()-b.getMonth(); if(m<0||(m===0&&n.getDate()<b.getDate())) a--; return a; }
function esc(x){ return String(x??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }
let Q={i:0,ans:{}};
function validTok(){ const t=store.get('hv_tok'); return (t&&t.t&&t.exp>Date.now()&&true)?t.t:null; }
function loginGate(box,msg){
  box.innerHTML=`<div class="gate"><div class="big">🔒</div><h2 style="font-size:24px;font-weight:900;margin-bottom:8px">سجّل الدخول لبدء الاختبار</h2><p style="color:var(--muted);margin-bottom:20px">${msg}</p><button class="btn primary" onclick="discordLogin('test.html')">دخول بالدسكورد</button></div>`;
}
async function initQuiz(){
  const box=document.getElementById('quizbox'); if(!box) return;
  const u=store.get('hv_user'), tok=validTok();
  if(!u||!tok){ loginGate(box,'سجّل دخولك بالدسكورد عشان يوصل تقديمك للإدارة باسمك وتوصلك رتبة «قدّم الاختبار الإلكتروني».'); return; }
  box.innerHTML=`<div class="result"><div style="font-size:40px">⏳</div></div>`;
  if(store.get('hv_done_'+u.id)){ doneScreen(box,true,true); return; }
  box.innerHTML=`<div style="text-align:center"><div style="font-size:50px">📝</div><h2 style="font-size:24px;font-weight:900;margin:10px 0">تقديم الوايت لست — ${QUIZ.length} أسئلة</h2><p style="color:var(--muted);max-width:500px;margin:0 auto 10px">أسئلة مكتوبة عن نفسك وعن شخصيتك ومواقف داخل المدينة. اكتب بأسلوبك وبالتفصيل — الإدارة تقرأ كل إجابة. اقرأ القوانين قبل ما تبدأ — <b>مسموح تقديم واحد فقط</b>.</p><p style="color:var(--muted);font-size:13px;margin-bottom:20px">المتقدّم: <b>@${u.username}</b></p><button class="btn red" onclick="startQuiz()">ابدأ الاختبار</button></div>`;
}
function startQuiz(){ Q={i:0,ans:store.get('hv_draft')||{}}; renderQ(); }
function fieldHtml(f,v){
  const id='f_'+f.k;
  if(f.t==='area') return `<label class="flabel" for="${id}">${f.l}</label><textarea class="finput farea" id="${id}" maxlength="${f.max}" placeholder="اكتب إجابتك هنا...">${esc(v)}</textarea><div class="fcount" data-for="${id}"></div>`;
  if(f.t==='date') return `<label class="flabel" for="${id}">${f.l}</label><input class="finput" type="date" id="${id}" value="${esc(v)}" max="${new Date().toISOString().slice(0,10)}">`;
  return `<label class="flabel" for="${id}">${f.l}</label><input class="finput" type="text" id="${id}" maxlength="${f.max}" value="${esc(v)}">`;
}
function renderQ(){
  const box=document.getElementById('quizbox'); const it=QUIZ[Q.i]; const a=Q.ans[Q.i]||{};
  const ageBox = Q.i===0 ? `<div class="flabel">العمر (يُحسب تلقائياً)</div><div class="fage" id="fage">—</div>` : '';
  box.innerHTML=`<div class="qprog"><span style="width:${((Q.i+1)/QUIZ.length)*100}%"></span></div>
    <div class="qnum">السؤال ${Q.i+1} من ${QUIZ.length}</div><div class="qtext">${it.q}</div>
    <div class="fwrap">${it.f.map(f=>fieldHtml(f,a[f.k])).join('')}${ageBox}</div>
    <div class="ferr" id="ferr"></div>
    <div class="qfoot"><button class="btn ghost" onclick="prevQ()" ${Q.i===0?'disabled':''}>→ السابق</button><span style="color:var(--muted);font-size:12.5px">${Q.i+1} / ${QUIZ.length} · Enter للمتابعة</span><button class="btn red" onclick="nextQ()">${Q.i===QUIZ.length-1?'إرسال التقديم':'التالي ←'}</button></div>`;
  const upd=()=>{
    box.querySelectorAll('.fcount').forEach(c=>{ const el=document.getElementById(c.dataset.for); const f=it.f.find(x=>'f_'+x.k===el.id); const n=el.value.trim().length; c.textContent=`${n} / ${f.max}`+(n<f.min?` — الحد الأدنى ${f.min} حرف`:''); c.style.color=n<f.min?'var(--warn)':'var(--muted)'; });
    const ag=document.getElementById('fage'); if(ag){ const v=document.getElementById('f_dob').value; const n=ageOf(v); ag.textContent=n==null?'—':n+' سنة'; ag.style.color=(n!=null&&n<MIN_AGE)?'var(--warn)':''; }
    saveDraft();
  };
  box.querySelectorAll('.finput').forEach(el=>{ el.addEventListener('input',upd); el.addEventListener('keydown',e=>{ if(e.key==='Enter'&&(el.tagName!=='TEXTAREA'||e.ctrlKey)){ e.preventDefault(); nextQ(); } }); });
  upd(); const first=box.querySelector('.finput'); if(first) first.focus();
}
function collect(){ const it=QUIZ[Q.i], o={}; it.f.forEach(f=>{ const el=document.getElementById('f_'+f.k); o[f.k]=el?el.value.trim():''; }); return o; }
function saveDraft(){ try{ Q.ans[Q.i]=collect(); store.set('hv_draft',Q.ans); }catch(e){} }
function prevQ(){ saveDraft(); if(Q.i>0){ Q.i--; renderQ(); } }
function nextQ(){
  const it=QUIZ[Q.i], v=collect(), err=document.getElementById('ferr');
  for(const f of it.f){
    const x=v[f.k];
    if(f.t==='date'){ if(!x){ err.textContent='اكتب '+f.l+'.'; return; } }
    else if(x.length<(f.min||1)){ err.textContent=`«${f.l}» قصير — الحد الأدنى ${f.min} حرف.`; return; }
  }
  if(Q.i===0){ const n=ageOf(v.dob); if(n==null||n<MIN_AGE||n>90){ err.textContent=`العمر المطلوب للدخول ${MIN_AGE}+ سنة.`; return; } }
  Q.ans[Q.i]=v; store.set('hv_draft',Q.ans);
  Q.i++; if(Q.i<QUIZ.length) renderQ(); else finishQuiz();
}
async function finishQuiz(){
  const box=document.getElementById('quizbox'), u=store.get('hv_user')||{username:'لاعب',id:'0'};
  box.innerHTML=`<div class="result"><div style="font-size:40px">⏳</div><p style="color:var(--muted)">جاري إرسال التقديم...</p></div>`;
  const sent=await submitQuiz(u);
  if(sent){ store.set('hv_done_'+u.id,1); store.del('hv_draft'); }
  doneScreen(box,sent,sent);
}
function doneScreen(box,sent,role){
  box.innerHTML=`<div class="result">
    <div style="font-size:60px">✅</div>
    <h2 style="font-size:26px;margin:6px 0;color:var(--ok)">تم استلام تقديمك</h2>
    <p style="color:var(--muted);max-width:500px;margin:0 auto 10px">الإدارة رح تراجع أجوبتك وترد عليك بالدسكورد.</p>
    <p style="font-size:13px;color:${role?'var(--ok)':'var(--warn)'};margin-bottom:6px">${role?'✓ رتبة «قدّم الاختبار الإلكتروني» رح توصلك بالدسكورد خلال دقيقة':'⚠ تعذّر إرسال التقديم — حاول مرة ثانية أو تواصل مع الإدارة'}</p>
    <p style="font-size:12.5px;color:var(--muted);margin-bottom:18px">لازم تكون داخل سيرفر الدسكورد عشان توصلك الرتبة.</p>
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
async function submitQuiz(u){
  if(!CONFIG.quizWebhook) return false;
  const A=Q.ans, p=A[0]||{}, c=A[1]||{}, cut=(x,n)=>{x=String(x||'—');return x.length>n?x.slice(0,n-1)+'…':x;};
  const foot={text:"Haven City — تقديم الوايت لست • UID:"+u.id};
  const head={title:"📝 تقديم وايت لست جديد",color:3447003,fields:[
    {name:"المتقدّم",value:`<@${u.id}> — @${u.tag||u.username} \`(${u.id})\``},
    {name:"الاسم الحقيقي",value:cut(p.name,200),inline:true},
    {name:"العمر",value:`${ageOf(p.dob)} سنة (${p.dob})`,inline:true},
    {name:"الشخصية",value:cut(`${c.cname} — مواليد ${c.cdob}\nالأصل: ${c.corigin} • اللغة: ${c.clang}`,1000)},
  ],footer:foot,timestamp:new Date().toISOString()};
  const story={title:"📖 "+QUIZ[2].q.slice(0,200),description:cut((A[2]||{}).a,4000),color:3447003,footer:foot};
  const qf=(from,to)=>{ const f=[]; for(let i=from;i<=to;i++) f.push({name:cut(`${i+1}. ${QUIZ[i].q}`,250),value:cut((A[i]||{}).a,1024)}); return f; };
  const e2={title:"👤 الشخصية والخبرة",color:3447003,fields:qf(3,5),footer:foot};
  const e3={title:"🎭 المواقف",color:3447003,fields:qf(6,9),footer:foot};
  const post=async embeds=>{ const r=await fetch(CONFIG.quizWebhook,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({username:"Haven Whitelist",allowed_mentions:{parse:[]},embeds})}); return r.ok; };
  try{ const ok1=await post([head,story]); const ok2=await post([e2]); const ok3=await post([e3]); return ok1&&ok2&&ok3; }
  catch(e){ return false; }
}
document.addEventListener('DOMContentLoaded',()=>{ initChrome(); renderRules(); initQuiz(); });
