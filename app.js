'use strict';
/* ============ anti-clickjacking (GitHub Pages can't send X-Frame-Options) ============ */
if (window.top !== window.self) { document.documentElement.style.display = 'none'; try { window.top.location = window.self.location.href; } catch (e) {} }

/* ============ CONFIG ============ */
const API = 'https://haven-api.havencitycfw.workers.dev';   // Cloudflare Worker (webhook lives there, not here)
const CONFIG = {
  discordInvite: "https://discord.gg/se8T7kWWZN",
  guildId: "1555953633986875472",
  quizRoleId: "1570670949097934969",      // قدّم الاختبار الإلكتروني
  activeRoleId: "1556312175767720026",    // مفعل
  discordClientId: "1563922688962199562",
  storeUrl: "https://haven-city-store.tebex.store/",
  // نفس مجلد الموقع — لازم يكون مسجّل في Redirects بالدسكورد
  discordRedirect: location.origin + location.pathname.replace(/[^/]*$/, ''),
};

/* ============ safe storage ============ */
const store = {
  get(k){ try{ return JSON.parse(localStorage.getItem(k)); }catch(e){ return null; } },
  set(k,v){ try{ localStorage.setItem(k, JSON.stringify(v)); }catch(e){} },
  del(k){ try{ localStorage.removeItem(k); }catch(e){} },
};
const sess = {
  get(k){ try{ return JSON.parse(sessionStorage.getItem(k)); }catch(e){ return null; } },
  set(k,v){ try{ sessionStorage.setItem(k, JSON.stringify(v)); }catch(e){} },
  del(k){ try{ sessionStorage.removeItem(k); }catch(e){} },
};
function esc(x){ return String(x ?? '').replace(/[&<>"'`]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;','`':'&#96;'}[c])); }
const isSnowflake = x => typeof x === 'string' && /^\d{15,21}$/.test(x);

/* ============ Discord login (implicit grant + CSRF state) ============ */
function randomState(){ const a = new Uint8Array(24); crypto.getRandomValues(a); return Array.from(a, b => b.toString(16).padStart(2,'0')).join(''); }
function discordLogin(returnTo){
  if (typeof returnTo === 'string' && /^[a-z]+\.html$/.test(returnTo)) sess.set('hv_return', returnTo);
  const state = randomState(); sess.set('hv_state', state);
  const p = new URLSearchParams({ client_id: CONFIG.discordClientId, redirect_uri: CONFIG.discordRedirect, response_type: 'token', scope: 'identify guilds.members.read', state });
  location.href = 'https://discord.com/oauth2/authorize?' + p.toString();
}
function logout(){ store.del('hv_user'); store.del('hv_tok'); sess.del('hv_member'); location.reload(); }
function validTok(){ const t = store.get('hv_tok'); return (t && typeof t.t === 'string' && t.exp > Date.now()) ? t.t : null; }

async function handleOAuth(){
  if (!location.hash || location.hash.length < 2) return;
  const h = new URLSearchParams(location.hash.slice(1));
  if (!h.has('access_token') && !h.has('error')) return;
  history.replaceState(null, '', location.pathname + location.search);   // token never stays in the URL
  const expected = sess.get('hv_state'); sess.del('hv_state');
  if (!expected || h.get('state') !== expected) return;                    // reject forged / replayed logins
  if (h.get('error')) return;
  const tok = h.get('access_token');
  if (!tok || !/^[\w.-]{10,200}$/.test(tok)) return;
  const exp = Math.min(+(h.get('expires_in') || 0) || 604800, 604800);
  store.set('hv_tok', { t: tok, exp: Date.now() + Math.max(0, exp - 60) * 1000 });
  try {
    const r = await fetch('https://discord.com/api/v10/users/@me', { headers: { Authorization: 'Bearer ' + tok } });
    const u = await r.json();
    if (u && isSnowflake(u.id)) store.set('hv_user', { id: u.id, username: String(u.global_name || u.username).slice(0, 40), tag: String(u.username).slice(0, 40), avatar: (typeof u.avatar === 'string' && /^(a_)?[0-9a-f]{32}$/.test(u.avatar)) ? u.avatar : null });
  } catch (e) {}
  sess.del('hv_member');
  const rt = sess.get('hv_return'); sess.del('hv_return');
  if (rt && rt !== (location.pathname.split('/').pop() || 'index.html')) { location.href = rt; return true; }
}

/* membership + roles, cached for 3 minutes in this tab only */
async function getMember(force){
  const tok = validTok(); if (!tok) return { state: 'guest' };
  const c = sess.get('hv_member'); if (!force && c && Date.now() - c.at < 180000) return c;
  let res = { state: 'unknown', roles: [], at: Date.now() };
  try {
    const r = await fetch(`https://discord.com/api/v10/users/@me/guilds/${CONFIG.guildId}/member`, { headers: { Authorization: 'Bearer ' + tok } });
    if (r.status === 401 || r.status === 403) { store.del('hv_tok'); return { state: 'guest' }; }
    if (r.status === 404) res.state = 'outside';
    else if (r.ok) { const m = await r.json(); res.roles = Array.isArray(m.roles) ? m.roles.filter(isSnowflake) : []; res.state = 'member'; }
  } catch (e) {}
  if (res.state !== 'unknown') sess.set('hv_member', res);
  return res;
}
const isActive = m => m.state === 'member' && m.roles.includes(CONFIG.activeRoleId);

/* ============ header / chrome ============ */
function showUser(u){
  const lb = document.getElementById('loginBtn'); if (lb) lb.style.display = 'none';
  const chip = document.getElementById('userchip'); if (!chip) return;
  chip.style.display = 'flex';
  document.getElementById('uname').textContent = '@' + u.username;
  const av = document.getElementById('uavatar');
  av.src = (u.avatar && isSnowflake(u.id)) ? `https://cdn.discordapp.com/avatars/${u.id}/${u.avatar}.png?size=64` : 'https://cdn.discordapp.com/embed/avatars/0.png';
  chip.onclick = () => { if (confirm('تسجيل الخروج؟')) logout(); };
}
function applyGates(active){ document.body.classList.toggle('is-active', !!active); document.body.classList.add('gates-ready'); }

const ACTIONS = {
  login: el => discordLogin(el.dataset.return || (location.pathname.split('/').pop() || 'index.html')),
  startQuiz: () => startQuiz(),
  prevQ: () => prevQ(),
  nextQ: () => nextQ(),
  retryQuiz: () => initQuiz(true),
};
document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]'); if (!el) return;
  const fn = ACTIONS[el.dataset.act]; if (fn) { e.preventDefault(); fn(el); }
});

async function initChrome(){
  const yr = document.getElementById('yr'); if (yr) yr.textContent = new Date().getFullYear();
  document.querySelectorAll('[data-discord]').forEach(a => a.href = CONFIG.discordInvite);
  const mb = document.getElementById('menubtn'), nl = document.getElementById('navlinks');
  if (mb && nl) mb.onclick = () => nl.classList.toggle('open');
  if (await handleOAuth()) return false;
  const u = store.get('hv_user'); if (u && validTok()) showUser(u);
  const m = await getMember();
  applyGates(isActive(m));
  return m;
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
  const rg = document.getElementById('rulegrid'); if (!rg) return;
  RULES.forEach((r, i) => {
    const d = document.createElement('details'); d.className = 'rule';
    d.innerHTML = `<summary><span class="num">${i+1}</span>${esc(r.t)}<span class="chev">▾</span></summary><div class="body"><ul>${r.items.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>`;
    rg.appendChild(d);
  });
}

/* ============ STORE (activated members only) ============ */
const PRODUCTS = {
  cars: [
    ['دفع رباعي جبلي', 10, 140, 4, 'رباعي'], ['كوبيه رياضية فاخرة', 10, 250, 2, 'رباعي'], ['سيدان عائلية', 10, 145, 4, 'أمامي'], ['سيدان اقتصادية', 10, 271, 4, 'رباعي'],
    ['SUV عائلية', 10, 140, 4, 'رباعي'], ['سيارة عضلية', 10, 300, 4, 'خلفي'], ['دفع رباعي فاخر', 10, 135, 4, 'رباعي'], ['بيك أب', 10, 130, 2, 'رباعي'],
  ],
  other: [['تغيير معلومات الشخصية', 10, 'تعديل اسم أو معلومات شخصيتك — التنفيذ يدوي من الإدارة']],
};
function gateBox(icon, title, text, btn){
  return `<div class="gate"><div class="big">${icon}</div><h2>${esc(title)}</h2><p>${esc(text)}</p>${btn||''}</div>`;
}
const loginBtn = rt => `<button type="button" class="btn primary" data-act="login" data-return="${rt}">دخول بالدسكورد</button>`;
const discordBtn = () => `<a class="btn primary" href="${esc(CONFIG.discordInvite)}" target="_blank" rel="noopener noreferrer">سيرفر الدسكورد</a>`;

function renderStore(m){
  const box = document.getElementById('storebox'); if (!box) return;
  if (m.state === 'guest') { box.innerHTML = gateBox('🔒', 'المتجر للمفعّلين فقط', 'سجّل دخولك بالدسكورد لنتأكد إنك مفعّل بالسيرفر.', loginBtn('store.html')); return; }
  if (m.state === 'outside') { box.innerHTML = gateBox('🚪', 'ادخل سيرفر الدسكورد أولاً', 'المتجر متاح لأعضاء هيفن المفعّلين فقط.', discordBtn()); return; }
  if (!isActive(m)) { box.innerHTML = gateBox('⛔', 'المتجر للمفعّلين فقط', 'لازم تكون مفعّل بسيرفر هيفن عشان تشتري. قدّم الاختبار وانتظر التفعيل من الإدارة.', '<a class="btn red" href="test.html">قدّم الاختبار</a>'); return; }
  const S = esc(CONFIG.storeUrl);
  const card = (img, name, price, lines) => `<article class="stcard">${img ? `<img src="${img}" alt="" loading="lazy">` : ''}<div class="b">
      <div class="sttop"><h3>${esc(name)}</h3><span class="price">${price}$</span></div>
      <ul>${lines.map(l => `<li>${esc(l)}</li>`).join('')}</ul>
      <a class="btn primary" href="${S}" target="_blank" rel="noopener noreferrer">اشترِ من المتجر</a></div></article>`;
  box.innerHTML = `<div class="stnote">كل المشتريات عن طريق <b>Tebex</b>، المنصة الرسمية المعتمدة من Cfx.re. وقت الشراء بتكتب <b>اسم الشخصية</b> يلي بدك المنتج يوصلها، والتسليم <b>يدوي من الإدارة خلال 72 ساعة</b> كحد أقصى.</div>
    <h2 class="sthead">السيارات الخاصة</h2>
    <div class="stgrid">${PRODUCTS.cars.map((c, i) => card(`st_car${i+1}.jpg`, c[0], c[1], [`السرعة القصوى: ${c[2]} كم/س`, `المقاعد: ${c[3]}`, `الدفع: ${c[4]}`])).join('')}</div>
    <h2 class="sthead">الشخصية</h2>
    <div class="stgrid">${PRODUCTS.other.map(o => card('', o[0], o[1], [o[2]])).join('')}</div>
    <h2 class="sthead">أولوية الدخول</h2>
    <div class="stgrid"><article class="stcard"><div class="b"><div class="sttop"><h3>أولوية الدخول</h3></div><ul><li>غير متوفر حالياً</li></ul><span class="btn" aria-disabled="true">غير متوفر</span></div></article></div>`;
}

/* ============ WHITELIST APPLICATION ============ */
const QUIZ = [
  {q:"عرّفنا عن نفسك: اسمك الحقيقي وتاريخ ميلادك", f:[{k:"name",l:"الاسم الحقيقي",t:"text",min:2,max:60},{k:"dob",l:"تاريخ الميلاد",t:"date"}]},
  {q:"بيانات شخصيتك داخل المدينة", f:[{k:"cname",l:"اسم الشخصية (الأول والأخير)",t:"text",min:3,max:60},{k:"cdob",l:"تاريخ ميلاد الشخصية",t:"date"},{k:"corigin",l:"البلد الأصلي للشخصية",t:"text",min:2,max:40},{k:"clang",l:"اللغة اللي تتكلمها الشخصية",t:"text",min:2,max:40}]},
  {q:"اكتب قصة شخصيتك: من وين جاية، شو صار معها، وليش وصلت لهيفن", f:[{k:"a",l:"قصة الشخصية",t:"area",min:150,max:1200}]},
  {q:"من خلال القصة، شو نقاط القوة ونقاط الضعف بشخصيتك؟", f:[{k:"a",l:"الإيجابيات والسلبيات",t:"area",min:40,max:400}]},
  {q:"عندك خبرة سابقة بالرول بلاي؟ احكيلنا عنها (سيرفرات، مدة، نوع الشخصيات)", f:[{k:"a",l:"خبرتك",t:"area",min:20,max:400}]},
  {q:"ليش اخترت هيفن؟ وشو بتضيف شخصيتك للمدينة؟", f:[{k:"a",l:"سبب الانضمام",t:"area",min:30,max:400}]},
  {q:"وأنت ماشي بالسوق شفت شاب خطف شنطة سيدة كبيرة بالعمر وهرب لزقاق جانبي، والسيدة وقعت على الأرض. شو بتعمل شخصيتك خطوة بخطوة؟", f:[{k:"a",l:"تصرّفك",t:"area",min:60,max:500}]},
  {q:"شخصيتك شغالة بورشة سيارات، وإجاك زبون عرض عليك مبلغ كبير عشان تمسح رقم الهيكل لسيارة واضح إنها مسروقة. كيف بتتصرف؟ وشو العواقب المحتملة داخل الرول؟", f:[{k:"a",l:"تصرّفك",t:"area",min:60,max:500}]},
  {q:"الشرطة أوقفتك وأنت بريء، والضابط عم يتعامل معك بأسلوب مستفز. كيف بتتصرف داخل الرول؟ ومتى بيحق لك تفتح تذكرة للإدارة؟", f:[{k:"a",l:"تصرّفك",t:"area",min:60,max:500}]},
  {q:"خسرت كل فلوسك بصفقة فاشلة، وعليك إيجار شقة لازم يندفع خلال أسبوع. اذكر ٣ طرق قانونية داخل المدينة تجمع فيها المبلغ.", f:[{k:"a",l:"الطرق القانونية",t:"area",min:60,max:500}]},
];
const MIN_AGE = 17;
function ageOf(d){ if (!d) return null; const b = new Date(d), n = new Date(); if (isNaN(b)) return null; let a = n.getFullYear() - b.getFullYear(); const m = n.getMonth() - b.getMonth(); if (m < 0 || (m === 0 && n.getDate() < b.getDate())) a--; return a; }
let Q = { i: 0, ans: {} };

async function initQuiz(force){
  const box = document.getElementById('quizbox'); if (!box) return;
  const u = store.get('hv_user'), tok = validTok();
  if (!u || !tok) { box.innerHTML = gateBox('🔒', 'سجّل الدخول لبدء الاختبار', 'سجّل دخولك بالدسكورد عشان يوصل تقديمك للإدارة باسمك وتوصلك رتبة «قدّم الاختبار الإلكتروني».', loginBtn('test.html')); return; }
  box.innerHTML = `<div class="result"><div style="font-size:40px">⏳</div></div>`;
  const m = await getMember(!!force);
  if (m.state === 'guest') { box.innerHTML = gateBox('🔒', 'سجّل الدخول من جديد', 'انتهت جلستك.', loginBtn('test.html')); return; }
  if (m.state === 'outside') { box.innerHTML = gateBox('🚪', 'ادخل سيرفر الدسكورد أولاً', 'لازم تكون عضو بسيرفر هيفن بالدسكورد قبل ما تقدّم.', discordBtn() + ' <button type="button" class="btn ghost" data-act="retryQuiz">دخلت ✓</button>'); return; }
  if (isActive(m)) { box.innerHTML = gateBox('✅', 'أنت مفعّل بالفعل', 'حسابك مفعّل بسيرفر هيفن، ما بتحتاج تقدّم الاختبار.', '<a class="btn primary" href="store.html">المتجر</a>'); return; }
  if (m.roles && m.roles.includes(CONFIG.quizRoleId)) { doneScreen(box, true); return; }
  const d = store.get('hv_done_' + u.id); if (d && Date.now() - (+d || 0) < 30 * 60 * 1000) { doneScreen(box, true); return; }
  box.innerHTML = `<div style="text-align:center"><div style="font-size:50px">📝</div><h2 style="font-size:24px;font-weight:900;margin:10px 0">تقديم الوايت لست — ${QUIZ.length} أسئلة</h2><p style="color:var(--muted);max-width:500px;margin:0 auto 10px">أسئلة مكتوبة عن نفسك وعن شخصيتك ومواقف داخل المدينة. اكتب بأسلوبك وبالتفصيل — الإدارة تقرأ كل إجابة. اقرأ القوانين قبل ما تبدأ — <b>مسموح تقديم واحد فقط</b>.</p><p style="color:var(--muted);font-size:13px;margin-bottom:20px">المتقدّم: <b>@${esc(u.username)}</b></p><button type="button" class="btn red" data-act="startQuiz">ابدأ الاختبار</button></div>`;
}
function startQuiz(){ const dr = store.get('hv_draft'); Q = { i: 0, ans: (dr && typeof dr === 'object') ? dr : {} }; renderQ(); }
function fieldHtml(f, v){
  const id = 'f_' + f.k;
  if (f.t === 'area') return `<label class="flabel" for="${id}">${f.l}</label><textarea class="finput farea" id="${id}" maxlength="${f.max}" placeholder="اكتب إجابتك هنا...">${esc(v)}</textarea><div class="fcount" data-for="${id}"></div>`;
  if (f.t === 'date') return `<label class="flabel" for="${id}">${f.l}</label><input class="finput" type="date" id="${id}" value="${esc(v)}" max="${new Date().toISOString().slice(0,10)}">`;
  return `<label class="flabel" for="${id}">${f.l}</label><input class="finput" type="text" id="${id}" maxlength="${f.max}" value="${esc(v)}">`;
}
function renderQ(){
  const box = document.getElementById('quizbox'); const it = QUIZ[Q.i]; const a = Q.ans[Q.i] || {};
  const ageBox = Q.i === 0 ? `<div class="flabel">العمر (يُحسب تلقائياً)</div><div class="fage" id="fage">—</div>` : '';
  box.innerHTML = `<div class="qprog"><span style="width:${((Q.i+1)/QUIZ.length)*100}%"></span></div>
    <div class="qnum">السؤال ${Q.i+1} من ${QUIZ.length}</div><div class="qtext">${it.q}</div>
    <div class="fwrap">${it.f.map(f => fieldHtml(f, a[f.k])).join('')}${ageBox}</div>
    <div class="ferr" id="ferr"></div>
    <div class="qfoot"><button type="button" class="btn ghost" data-act="prevQ" ${Q.i===0?'disabled':''}>→ السابق</button><span style="color:var(--muted);font-size:12.5px">${Q.i+1} / ${QUIZ.length} · Enter للمتابعة</span><button type="button" class="btn red" data-act="nextQ">${Q.i===QUIZ.length-1?'إرسال التقديم':'التالي ←'}</button></div>`;
  const upd = () => {
    box.querySelectorAll('.fcount').forEach(c => { const el = document.getElementById(c.dataset.for); const f = it.f.find(x => 'f_'+x.k === el.id); const n = el.value.trim().length; c.textContent = `${n} / ${f.max}` + (n < f.min ? ` — الحد الأدنى ${f.min} حرف` : ''); c.style.color = n < f.min ? 'var(--warn)' : 'var(--muted)'; });
    const ag = document.getElementById('fage'); if (ag) { const n = ageOf(document.getElementById('f_dob').value); ag.textContent = n == null ? '—' : n + ' سنة'; ag.style.color = (n != null && n < MIN_AGE) ? 'var(--warn)' : ''; }
    saveDraft();
  };
  box.querySelectorAll('.finput').forEach(el => { el.addEventListener('input', upd); el.addEventListener('keydown', e => { if (e.key === 'Enter' && (el.tagName !== 'TEXTAREA' || e.ctrlKey)) { e.preventDefault(); nextQ(); } }); });
  upd(); const first = box.querySelector('.finput'); if (first) first.focus();
}
function collect(){ const it = QUIZ[Q.i], o = {}; it.f.forEach(f => { const el = document.getElementById('f_'+f.k); o[f.k] = el ? el.value.trim().slice(0, f.max || 20) : ''; }); return o; }
function saveDraft(){ try { Q.ans[Q.i] = collect(); store.set('hv_draft', Q.ans); } catch (e) {} }
function prevQ(){ saveDraft(); if (Q.i > 0) { Q.i--; renderQ(); } }
let sending = false;
function nextQ(){
  if (sending) return;
  const it = QUIZ[Q.i], v = collect(), err = document.getElementById('ferr');
  for (const f of it.f) {
    const x = v[f.k];
    if (f.t === 'date') { if (!/^\d{4}-\d{2}-\d{2}$/.test(x)) { err.textContent = 'اكتب ' + f.l + '.'; return; } }
    else if (x.length < (f.min || 1)) { err.textContent = `«${f.l}» قصير — الحد الأدنى ${f.min} حرف.`; return; }
  }
  if (Q.i === 0) { const n = ageOf(v.dob); if (n == null || n < MIN_AGE || n > 90) { err.textContent = `العمر المطلوب للدخول ${MIN_AGE}+ سنة.`; return; } }
  Q.ans[Q.i] = v; store.set('hv_draft', Q.ans);
  Q.i++; if (Q.i < QUIZ.length) renderQ(); else finishQuiz();
}
async function finishQuiz(){
  sending = true;
  const box = document.getElementById('quizbox'), u = store.get('hv_user');
  box.innerHTML = `<div class="result"><div style="font-size:40px">⏳</div><p style="color:var(--muted)">جاري إرسال التقديم...</p></div>`;
  const sent = (u && isSnowflake(u.id)) ? await submitQuiz(u) : false;
  sending = false;
  if (sent) { store.set('hv_done_' + u.id, Date.now()); store.del('hv_draft'); }
  doneScreen(box, sent);
}
function doneScreen(box, ok){
  box.innerHTML = `<div class="result">
    <div style="font-size:60px">${ok ? '✅' : '⚠️'}</div>
    <h2 style="font-size:26px;margin:6px 0;color:${ok ? 'var(--ok)' : 'var(--warn)'}">${ok ? 'تم استلام تقديمك' : 'تعذّر إرسال التقديم'}</h2>
    <p style="color:var(--muted);max-width:500px;margin:0 auto 10px">${ok ? 'الإدارة رح تراجع أجوبتك وترد عليك بالدسكورد. رتبة «قدّم الاختبار الإلكتروني» رح توصلك خلال دقيقة.' : 'حاول مرة ثانية بعد شوي، أو تواصل مع الإدارة بالدسكورد. أجوبتك محفوظة.'}</p>
    <p style="font-size:12.5px;color:var(--muted);margin-bottom:18px">لازم تكون داخل سيرفر الدسكورد عشان توصلك الرتبة.</p>
    <div class="cta center">${discordBtn()}${ok ? '<a class="btn ghost" href="rules.html">مراجعة القوانين</a>' : '<button type="button" class="btn red" data-act="startQuiz">حاول مرة ثانية</button>'}</div></div>`;
}
async function submitQuiz(u){
  const tok = validTok(); if (!tok || !API) return false;
  try {
    const r = await fetch(API + '/apply', { method: 'POST', credentials: 'omit', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: tok, answers: Q.ans }) });
    if (r.status === 409) { sess.del('hv_member'); }
    return r.ok;
  } catch (e) { return false; }
}

/* ============ content creators ============ */
async function renderCreators(){
  const lg = document.getElementById('livegrid'), cg = document.getElementById('crgrid'); if (!lg || !cg) return;
  let list = [];
  try {
    if (API) { const r = await fetch(API + '/live', { credentials: 'omit' }); if (r.ok) list = (await r.json()).creators || []; }
    if (!list.length) { const r = await fetch('creators.json?v=' + Date.now()); if (r.ok) list = (await r.json()).map(x => ({ name: x.name, kick: x.kick, url: 'https://kick.com/' + x.kick, live: false })); }
  } catch (e) {}
  list = list.filter(x => x && /^[\w-]{2,30}$/.test(x.kick || ''));
  const safeImg = u => (typeof u === 'string' && /^https:\/\/[\w.-]+\.kick\.com\//.test(u)) ? esc(u) : '';
  const href = x => 'https://kick.com/' + encodeURIComponent(x.kick);
  const ini = x => esc(String(x.name || x.kick).trim().charAt(0).toUpperCase());
  const av = x => safeImg(x.avatar) ? `<img src="${safeImg(x.avatar)}" alt="" loading="lazy">` : `<span>${ini(x)}</span>`;
  const fmt = n => (+n || 0).toLocaleString('en');
  const live = list.filter(x => x.live);
  lg.innerHTML = live.length ? live.map(x => `<a class="livecard" href="${href(x)}" target="_blank" rel="noopener noreferrer">
    <div class="thumb">${safeImg(x.thumb) ? `<img src="${safeImg(x.thumb)}" alt="" loading="lazy">` : ''}<span class="lv ltr">● LIVE</span><span class="vw">👁 ${fmt(x.viewers)}</span></div>
    <div class="lmeta"><div class="av">${av(x)}</div><div><div class="lt">${esc(x.title || 'بث مباشر')}</div><div class="ln">${esc(x.name || x.kick)}${x.category ? ' • ' + esc(x.category) : ''}</div></div></div></a>`).join('')
    : `<div class="crempty">ما في حدا بثّ مباشر هلق 📴</div>`;
  cg.innerHTML = list.map(x => `<a class="crcard${x.live ? ' on' : ''}" href="${href(x)}" target="_blank" rel="noopener noreferrer">
    <div class="av">${av(x)}</div><div class="cn">${esc(x.name || x.kick)}</div><div class="ck ltr">kick.com/${esc(x.kick)}</div>
    <span class="st">${x.live ? '● LIVE' : 'OFFLINE'}</span></a>`).join('') || `<div class="crempty">قريباً</div>`;
  const c = document.getElementById('crcount'); if (c) c.textContent = list.length + ' صانع محتوى';
  const u = document.getElementById('crupd'); if (u) u.textContent = API ? 'يتحدّث كل دقيقة' : '';
  if (API && !renderCreators.t) renderCreators.t = setInterval(renderCreators, 60000);
}

/* ============ boot ============ */
document.addEventListener('DOMContentLoaded', async () => {
  renderRules();
  renderCreators();
  const m = await initChrome(); if (m === false) return;
  renderStore(m);
  initQuiz();
});
