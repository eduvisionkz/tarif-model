/* Тариф таңдау моделі — интерфейс.
 * Есептеу тек engine.js-те; бұл файл енгізу, көрсету, сақтау және экспортпен айналысады. */
(function () {
  'use strict';
  var E = window.TariffEngine, D = window.TARIFF_DATA, S = window.Store;
  var T = D.TARIFFS;
  var APP_VERSION = '1.0.0';
  S.migrate();

  /* ================= күй ================= */
  function newPerson() { return { label: '', G: '', Gu: 'GB', M: '', S: '0' }; }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  var DEFAULT_FORM = { mode: 'single', single: { G: '', Gu: 'GB', M: '', S: '', B: '', typeFilter: 'all' },
    persons: [newPerson(), newPerson()], multiB: '', combos: true, place: '' };
  function normalizeForm(f) {
    var d = clone(DEFAULT_FORM);
    if (!f || typeof f !== 'object') return d;
    d.mode = f.mode === 'multi' ? 'multi' : 'single';
    if (f.single) Object.keys(d.single).forEach(function (k) { if (f.single[k] != null) d.single[k] = String(f.single[k]); });
    if (Array.isArray(f.persons) && f.persons.length) d.persons = f.persons.map(function (p) { var n = newPerson(); Object.keys(n).forEach(function (k) { if (p && p[k] != null) n[k] = String(p[k]); }); return n; });
    if (f.multiB != null) d.multiB = String(f.multiB);
    if (f.combos != null) d.combos = !!f.combos;
    if (f.place != null) d.place = String(f.place);
    return d;
  }
  var form = normalizeForm(S.load('form', null));
  var net = S.load('net', {}) || {};
  var profiles = S.load('profiles', []) || [];
  var hist = S.load('history', null) || { months: [], reserve: 15, method: 'avg' };
  var currentProfileId = S.load('currentProfile', null);
  var cmpSel = S.load('compare', null) || { a: 'izi-ultra-boost', b: 'altel-erkin-plus', count: '1' };
  var LAST = null;

  function saveForm() { S.save('form', form); }
  function saveNet() { S.save('net', net); }
  function saveProfiles() { S.save('profiles', profiles); }
  function saveHist() { S.save('history', hist); }

  /* ================= көмекшілер ================= */
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  var fmtNum = E.fmtNum, fmtMoney = E.fmtMoney, eqSign = E.eqSign;
  function today() { var d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function nowText() { var d = new Date(); return String(d.getDate()).padStart(2, '0') + '.' + String(d.getMonth() + 1).padStart(2, '0') + '.' + d.getFullYear() + ' ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); }
  function uid() { return 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  var toastTimer;
  function toast(msg) {
    var el = $('#toast'); if (!el) { el = document.createElement('div'); el.id = 'toast'; el.className = 'toast'; el.setAttribute('role', 'status'); document.body.appendChild(el); }
    el.textContent = msg; el.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(function () { el.hidden = true; }, 2600);
  }
  function twoStep(btn, label, action) {
    if (btn.dataset.armed === '1') { action(); return; }
    var orig = btn.textContent; btn.dataset.armed = '1'; btn.textContent = label;
    setTimeout(function () { if (btn.isConnected) { btn.dataset.armed = ''; btn.textContent = orig; } }, 4000);
  }

  /* ================= енгізуді оқу ================= */
  function parseField(str, opts) {
    opts = opts || {};
    var s = String(str == null ? '' : str).trim().replace(/\s/g, '').replace(',', '.');
    if (s === '') return { val: null };
    if (/^-/.test(s)) return { val: null, err: 'Теріс сан болмайды' };
    if (!/^\d*\.?\d+$|^\d+\.$/.test(s)) return { val: null, err: 'Тек сан енгізіңіз' };
    var v = Number(s);
    if (!isFinite(v)) return { val: null, err: 'Тек сан енгізіңіз' };
    if (v < 0) return { val: null, err: 'Теріс сан болмайды' };
    if (opts.int && !Number.isInteger(v)) return { val: null, err: 'Бүтін сан енгізіңіз' };
    return { val: v };
  }
  function mbWarn(val, unit) {
    if (unit === 'MB' && val != null && val > 0 && val < 1024)
      return 'МБ бірлігі дұрыс таңдалды ма? ' + fmtNum(val) + ' МБ = ' + fmtNum(val) + ' / 1024 ' + eqSign(val / 1024) + ' ' + fmtNum(val / 1024) + ' ГБ. Егер ' + fmtNum(val) + ' ГБ керек болса, бірлікті ГБ деп ауыстырыңыз.';
    return null;
  }
  function netCtx() { var o = {}; D.NETWORKS.forEach(function (n) { o[n] = net[n] || 'unknown'; }); return o; }
  function readInput() {
    var errs = {}, warns = {};
    if (form.mode === 'single') {
      var s = form.single;
      var G = parseField(s.G), M = parseField(s.M, { int: true }), Sm = parseField(s.S, { int: true }), B = parseField(s.B);
      if (G.err) errs['f-G'] = G.err; if (M.err) errs['f-M'] = M.err; if (Sm.err) errs['f-S'] = Sm.err; if (B.err) errs['f-B'] = B.err;
      var w = mbWarn(G.val, s.Gu); if (w) warns['f-G'] = w;
      var empty = G.val == null && M.val == null && Sm.val == null;
      return { errs: errs, warns: warns, empty: empty,
        input: { mode: 'single', G: E.toGB(G.val, s.Gu), Graw: G.val, Gu: s.Gu, M: M.val, S: Sm.val, B: B.val, net: netCtx(), typeFilter: s.typeFilter, place: form.place } };
    }
    var Bm = parseField(form.multiB); if (Bm.err) errs['f-mB'] = Bm.err;
    var anyVal = false;
    var persons = form.persons.map(function (p, i) {
      var G = parseField(p.G), M = parseField(p.M, { int: true }), Sm = parseField(p.S, { int: true });
      if (G.err) errs['p' + i] = 'Интернет: ' + G.err; else if (M.err) errs['p' + i] = 'Минут: ' + M.err; else if (Sm.err) errs['p' + i] = 'SMS: ' + Sm.err;
      var w = mbWarn(G.val, p.Gu); if (w) warns['p' + i] = w;
      if (G.val != null || M.val != null) anyVal = true;
      return { label: p.label.trim(), G: E.toGB(G.val, p.Gu), Graw: G.val, Gu: p.Gu, M: M.val, S: Sm.val };
    });
    return { errs: errs, warns: warns, empty: !anyVal,
      input: { mode: 'multi', persons: persons, B: Bm.val, net: netCtx(), combos: form.combos, place: form.place } };
  }
  function compute() {
    var r = readInput();
    if (Object.keys(r.errs).length || r.empty) { LAST = { r: r, plans: null }; return LAST; }
    var plans = E.buildPlans(r.input, T);
    var groups = E.groupPlans(plans);
    LAST = { r: r, plans: plans, groups: groups, summary: E.summarize(groups) };
    return LAST;
  }
  function inputChips(inp) {
    var a = [];
    var gtxt = function (raw, unit, gb) { return raw == null ? 'енгізілмеген' : unit === 'MB' ? fmtNum(raw) + ' МБ ' + eqSign(gb) + ' ' + fmtNum(gb) + ' ГБ' : fmtNum(gb) + ' ГБ'; };
    if (inp.mode === 'single') {
      a.push('G = ' + gtxt(inp.Graw, inp.Gu, inp.G), 'M = ' + (inp.M == null ? 'енгізілмеген' : inp.M + ' мин'), 'S = ' + (inp.S == null ? 'енгізілмеген' : inp.S), 'N = 1');
    } else {
      var P = inp.persons, G = E.sumField(P, 'G'), M = E.sumField(P, 'M'), Sx = E.sumField(P, 'S');
      a.push('N = ' + P.length + ' адам', 'ΣG = ' + (G == null ? '?' : fmtNum(G) + ' ГБ'), 'ΣM = ' + (M == null ? '?' : M + ' мин'), 'ΣS = ' + (Sx == null ? '?' : Sx));
    }
    a.push('B = ' + (inp.B == null ? 'енгізілмеген' : fmtMoney(inp.B)));
    if (inp.place) a.push('Мекен: ' + inp.place);
    return a;
  }

  /* ================= навигация ================= */
  var ICONS = {
    home: '<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>',
    pick: '<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="16" cy="6" r="2" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="10" cy="12" r="2" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="18" cy="18" r="2" fill="none" stroke="currentColor" stroke-width="2"/>',
    result: '<path d="M4 6l2 2 3-3M4 13l2 2 3-3M12 7h8M12 14h8M5 20h15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
    history: '<path d="M4 20V10M10 20V5M16 20v-8M22 20H2" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
    more: '<circle cx="5" cy="12" r="2" fill="currentColor"/><circle cx="12" cy="12" r="2" fill="currentColor"/><circle cx="19" cy="12" r="2" fill="currentColor"/>'
  };
  var MAIN = [['home', 'Басты'], ['pick', 'Таңдау'], ['result', 'Нәтиже'], ['history', 'Тарих'], ['more', 'Тағы']];
  var SUB = [['profiles', 'Профильдер', 'Талаптар жиынын сақтау, ашу, өшіру'], ['compare', 'Екі тарифті салыстыру', 'Ресурстар, сәйкестік, 12 төлем'],
    ['model', 'Модель қалай есептейді?', 'Формулалар және зерттеуден мысал'], ['sources', 'Дереккөздер және шектеулер', 'Ресми сілтемелер, күндер, тариф базасы'], ['about', 'Жоба туралы', 'Автор, жетекші, құпиялылық']];
  var TOP = [['home', 'Басты'], ['pick', 'Таңдау'], ['result', 'Нәтиже'], ['history', 'Тарих'], ['compare', 'Салыстыру'], ['profiles', 'Профильдер'], ['more', 'Тағы']];
  var route = 'home';
  function buildNav() {
    $('#bnav').innerHTML = MAIN.map(function (m) { return '<li><a href="#' + m[0] + '" data-r="' + m[0] + '"><svg viewBox="0 0 24 24" aria-hidden="true">' + ICONS[m[0]] + '</svg><span>' + m[1] + '</span></a></li>'; }).join('');
    $('#topnav').innerHTML = TOP.map(function (m) { return '<a href="#' + m[0] + '" data-r="' + m[0] + '">' + m[1] + '</a>'; }).join('');
  }
  function markNav() {
    var group = SUB.some(function (s) { return s[0] === route; }) ? 'more' : route;
    $$('#bnav a').forEach(function (a) { if (a.dataset.r === group) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
    $$('#topnav a').forEach(function (a) { var on = a.dataset.r === route || (a.dataset.r === 'more' && group === 'more' && !TOP.some(function (t) { return t[0] === route; })); if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
  }
  var SCREENS = {};
  function go(r, keepScroll) {
    if (!SCREENS[r]) r = 'home';
    route = r;
    if (location.hash !== '#' + r) { try { history.replaceState(null, '', '#' + r); } catch (e) { location.hash = r; } }
    var view = $('#view');
    view.innerHTML = '<div class="screen">' + SCREENS[r].html() + '</div>';
    if (SCREENS[r].bind) SCREENS[r].bind();
    markNav();
    if (!keepScroll) window.scrollTo(0, 0);
    document.title = (r === 'home' ? '' : (titleOf(r) + ' · ')) + 'Тариф таңдау моделі';
  }
  function titleOf(r) { var all = MAIN.concat(SUB, TOP); for (var i = 0; i < all.length; i++) if (all[i][0] === r) return all[i][1]; return ''; }
  window.addEventListener('hashchange', function () { var r = location.hash.slice(1); if (r !== route) go(r); });
  document.addEventListener('click', function (e) {
    var a = e.target.closest('a[data-r]'); if (a) { e.preventDefault(); go(a.dataset.r); return; }
    var g = e.target.closest('[data-go]'); if (g) { e.preventDefault(); go(g.dataset.go); }
  });

  /* ================= БАСТЫ ================= */
  SCREENS.home = {
    html: function () {
      var nT = T.length, brands = Array.from(new Set(T.map(function (t) { return t.operator; }))).length;
      var h = '<section class="hero"><svg class="hero-bars" viewBox="0 0 150 110" aria-hidden="true"><rect x="0" y="70" width="26" height="40" rx="4" fill="#fff"/><rect x="40" y="48" width="26" height="62" rx="4" fill="#fff"/><rect x="80" y="24" width="26" height="86" rx="4" fill="#fff"/><rect x="120" y="0" width="26" height="110" rx="4" fill="#fff"/></svg>' +
        '<span class="eyebrow" style="color:#FFC9A8">Ұялы байланыс тарифін таңдау</span>' +
        '<h1>Ең арзан тариф сізге сәйкес келе ме? Есеппен тексеріңіз.</h1>' +
        '<p>Қанша интернет, минут, SMS және нөмір керегін, қанша төлей алатыныңызды енгізіңіз. Қолданба әр тарифті бірдей ережемен тексеріп, неге сәйкес келетінін немесе нақты не жетпейтінін санмен көрсетеді.</p>' +
        '<div class="formula-mini">K = min(Gт/G, Mт/M, Sт/S, Nт/N) ≥ 1 ?</div>' +
        '<div class="row"><a class="btn primary" href="#pick" data-r="pick">Таңдауды бастау</a><button class="btn" type="button" id="hMulti">Отбасыға / бірнеше адамға</button></div>' +
        '<p class="meta">Тариф базасы: ' + nT + ' тариф, ' + brands + ' бренд · деректер күні ' + esc(D.TARIFF_BASE.checkedLabel) + '</p></section>';
      h += '<div class="steps3">' +
        '<div class="card"><span class="n">1</span><div><h4>Қажеттілік</h4><p class="small muted">G — интернет, M — минут, S — шығыс SMS, N — нөмір, B — бюджет.</p></div></div>' +
        '<div class="card"><span class="n">2</span><div><h4>Тексеру</h4><p class="small muted">Әр ресурс: «тарифте бар / керек». Ең кіші қатынас — K.</p></div></div>' +
        '<div class="card"><span class="n">3</span><div><h4>Шешім</h4><p class="small muted">Сәйкес · нақтылау қажет · сәйкес емес. Сәйкестері толық бағасы бойынша реттеледі.</p></div></div></div>';
      if (profiles.length) {
        h += '<div class="card stack"><div class="row between"><h3>Сақталған профильдер</h3><a href="#profiles" data-r="profiles" class="small">Барлығы</a></div><div class="row">' +
          profiles.slice(0, 4).map(function (p) { return '<button class="btn sm" type="button" data-open="' + esc(p.id) + '">' + esc(p.name) + '</button>'; }).join('') + '</div></div>';
      }
      h += '<div class="grid2"><a class="card tint" href="#history" data-r="history" style="text-decoration:none;color:inherit"><h4>Шығын тарихынан бастау</h4><p class="small muted">Детализациядағы 1–12 айдың шығынын енгізсеңіз, қолданба орташа не ең көп айды алып, таңдалған пайыз қормен қажеттілікті есептейді.</p></a>' +
        '<div class="notice info"><b class="i">i</b><div>Қолданба бүкіл Қазақстанға бір «ең жақсы» тарифті жарияламайды. Нәтиже сіздің талабыңызға, тариф базасына, бюджетке және өз мекеніңіздегі желі туралы белгіңізге байланысты.</div></div></div>';
      return h;
    },
    bind: function () {
      $('#hMulti').onclick = function () { form.mode = 'multi'; saveForm(); go('pick'); };
      $$('[data-open]').forEach(function (b) { b.onclick = function () { openProfile(b.dataset.open); }; });
    }
  };

  /* ================= ТАҢДАУ (форма) ================= */
  function fieldHTML(id, label, value, o) {
    o = o || {};
    var after = o.unit ? '<select class="unit" id="' + id + 'u" aria-label="Өлшем бірлігі"><option value="GB"' + (o.unit === 'GB' ? ' selected' : '') + '>ГБ</option><option value="MB"' + (o.unit === 'MB' ? ' selected' : '') + '>МБ</option></select>' : (o.suffix ? '<span class="suffix">' + o.suffix + '</span>' : '');
    return '<div class="field"><label for="' + id + '">' + label + '</label><div class="inp"><input id="' + id + '" type="text" inputmode="' + (o.int ? 'numeric' : 'decimal') + '" autocomplete="off" value="' + esc(value) + '"' + (o.ph ? ' placeholder="' + esc(o.ph) + '"' : '') + '>' + after + '</div>' +
      (o.hint ? '<span class="hint">' + o.hint + '</span>' : '') + '<span class="err" id="' + id + '-err"></span><div class="warnbox" id="' + id + '-warn" hidden></div></div>';
  }
  function formHTML() {
    var s = form.single, h = '';
    var cur = profiles.find(function (p) { return p.id === currentProfileId; });
    h += '<div class="row between"><h2>Қажеттілік</h2>' + (cur ? '<span class="pill plain">Профиль: ' + esc(cur.name) + '</span>' : '') + '</div>';
    h += '<div class="seg" role="group" aria-label="Режим"><button type="button" data-mode="single" aria-pressed="' + (form.mode === 'single') + '">Бір адам</button><button type="button" data-mode="multi" aria-pressed="' + (form.mode === 'multi') + '">Бірнеше адам</button></div>';
    if (form.mode === 'single') {
      h += fieldHTML('f-G', 'Интернет, G', s.G, { unit: s.Gu, ph: 'мысалы, 30', hint: '1 ГБ = 1024 МБ. Бос өріс — дерек жоқ; 0 — интернет керек емес.' });
      h += '<div class="two">' + fieldHTML('f-M', 'Минут, M', s.M, { suffix: 'мин', int: true, ph: '100' }) + fieldHTML('f-S', 'Шығыс SMS, S', s.S, { suffix: 'дана', int: true, ph: '0' }) + '</div>';
      h += fieldHTML('f-B', 'Бюджет, B', s.B, { suffix: '₸', ph: 'міндетті емес', hint: 'Бір төлемге жұмсай алатын сома.' });
      h += '<div class="field"><label for="f-T">Қандай тарифтер</label><select id="f-T"><option value="all"' + (s.typeFilter === 'all' ? ' selected' : '') + '>Барлығы</option><option value="individual"' + (s.typeFilter === 'individual' ? ' selected' : '') + '>Тек жеке тарифтер</option><option value="family"' + (s.typeFilter === 'family' ? ' selected' : '') + '>Отбасылық тарифтер де (бір нөмірге)</option></select></div>';
    } else {
      h += '<p class="small muted">Әр адамның қажеттілігін бөлек енгізіңіз. Отбасылық тарифте ортақ ресурстар қосылады, ал жеке тарифтерде әр адамның пакеті бөлек тексеріледі. Рөл не есім міндетті емес және интернет мөлшерін өздігінен анықтамайды.</p>';
      h += '<div class="stack" style="gap:10px">' + form.persons.map(function (p, i) {
        return '<div class="person"><div class="person-h"><b>' + (i + 1) + '-адам</b><input type="text" id="p' + i + '-L" placeholder="есімі не рөлі (міндетті емес)" value="' + esc(p.label) + '" aria-label="' + (i + 1) + '-адамның белгісі"><button class="iconbtn" type="button" data-rm="' + i + '" aria-label="' + (i + 1) + '-адамды өшіру"' + (form.persons.length < 2 ? ' disabled' : '') + '>✕</button></div>' +
          '<div class="p3"><div class="field"><label class="small" for="p' + i + '-G">Интернет</label><div class="inp"><input type="text" inputmode="decimal" id="p' + i + '-G" value="' + esc(p.G) + '"><select class="unit" id="p' + i + '-Gu" aria-label="Бірлік"><option value="GB"' + (p.Gu === 'GB' ? ' selected' : '') + '>ГБ</option><option value="MB"' + (p.Gu === 'MB' ? ' selected' : '') + '>МБ</option></select></div></div>' +
          '<div class="field"><label class="small" for="p' + i + '-M">Минут</label><input type="text" inputmode="numeric" id="p' + i + '-M" value="' + esc(p.M) + '"></div>' +
          '<div class="field"><label class="small" for="p' + i + '-S">SMS</label><input type="text" inputmode="numeric" id="p' + i + '-S" value="' + esc(p.S) + '"></div></div>' +
          '<span class="err" id="p' + i + '-err"></span><div class="warnbox" id="p' + i + '-warn" hidden></div></div>';
      }).join('') + '</div>';
      h += '<button class="btn sm" type="button" id="addP"' + (form.persons.length >= 12 ? ' disabled' : '') + '>+ Адам қосу</button>';
      h += fieldHTML('f-mB', 'Бюджет, B (барлығына)', form.multiB, { suffix: '₸', ph: 'міндетті емес' });
      h += '<label class="check"><input type="checkbox" id="f-combo"' + (form.combos ? ' checked' : '') + '><span>Аралас нұсқаларды да көрсету: отбасылық тариф + 1–2 жеке тариф (адам саны отбасылық шектен асса)</span></label>';
    }
    h += '<div class="field"><label for="f-place">Пайдаланатын мекен</label><input type="text" id="f-place" value="' + esc(form.place) + '" placeholder="мысалы, Тұғыл ауылы"></div>';
    h += '<div class="stack" style="gap:8px"><span class="flabel">Сол мекенде желі қалай жұмыс істейді?</span>' +
      D.NETWORKS.map(function (n, i) { var v = net[n] || 'unknown'; return '<div class="netrow"><label for="net-' + i + '">' + esc(n) + '</label><select id="net-' + i + '" data-net="' + esc(n) + '" class="net-' + v + '">' +
        [['unknown', 'тексерілмеген'], ['yes', 'жұмыс істейді'], ['weak', 'әлсіз'], ['no', 'жұмыс істемейді']].map(function (o) { return '<option value="' + o[0] + '"' + (o[0] === v ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select></div>'; }).join('') +
      '<p class="tiny muted">Бұл — сіздің өз бақылауыңыз, тек осы құрылғыда сақталады. Оператор картасы нақты үйдегі байланысқа кепілдік бермейді. «Тексерілмеген» не «әлсіз» болса, қолданба түпкілікті ұсыныс жасамайды.</p></div>';
    h += '<div class="row"><button class="btn sm ghost" type="button" id="exFill">Мысал: 40 ГБ, 100 мин</button><button class="btn sm ghost" type="button" id="clearF">Тазарту</button></div>';
    return h;
  }
  function pickHTML() {
    return '<div class="pick-layout"><div class="formcol card stack" id="formCard">' + formHTML() + '</div><div class="rescol stack" id="resCol"></div></div>' +
      '<div class="stickybar" id="stickyBar"></div>';
  }
  function updateErrors(r) {
    $$('#formCard .err').forEach(function (e) { e.textContent = ''; });
    $$('#formCard .warnbox').forEach(function (e) { e.hidden = true; e.textContent = ''; });
    Object.keys(r.errs).forEach(function (k) { var el = document.getElementById(k + '-err'); if (el) el.textContent = r.errs[k]; });
    Object.keys(r.warns).forEach(function (k) { var el = document.getElementById(k + '-warn'); if (el) { el.hidden = false; el.textContent = r.warns[k]; } });
  }
  function refreshResults() {
    var L = compute();
    if ($('#formCard')) updateErrors(L.r);
    var rc = $('#resCol'); if (rc) { rc.innerHTML = resultsHTML(L, true); bindResults(rc); }
    var sb = $('#stickyBar');
    if (sb) {
      if (!L.plans) sb.innerHTML = Object.keys(L.r.errs).length ? '<div class="notice bad"><b class="i">!</b><div>Қызыл жазуы бар өрісті түзетіңіз.</div></div>' : '';
      else sb.innerHTML = '<a class="btn primary block" href="#result" data-r="result">Нәтиже: ' + L.groups.ok.length + ' сәйкес · ' + L.groups.unclear.length + ' нақтылау · ' + L.groups.fail.length + ' сәйкес емес →</a>';
    }
  }
  function bindForm() {
    var fc = $('#formCard');
    $$('[data-mode]', fc).forEach(function (b) { b.onclick = function () { form.mode = b.dataset.mode; saveForm(); rerenderForm(); }; });
    var add = $('#addP'); if (add) add.onclick = function () { if (form.persons.length < 12) { form.persons.push(newPerson()); saveForm(); rerenderForm(); var el = document.getElementById('p' + (form.persons.length - 1) + '-G'); if (el) el.focus(); } };
    $$('[data-rm]', fc).forEach(function (b) { b.onclick = function () { if (form.persons.length > 1) { form.persons.splice(+b.dataset.rm, 1); saveForm(); rerenderForm(); } }; });
    var cb = $('#f-combo'); if (cb) cb.onchange = function () { form.combos = cb.checked; saveForm(); refreshResults(); };
    $('#exFill').onclick = function () { form.mode = 'single'; form.single = { G: '40', Gu: 'GB', M: '100', S: '0', B: '', typeFilter: 'all' }; saveForm(); rerenderForm(); toast('Зерттеудегі 1-есеп енгізілді'); };
    $('#clearF').onclick = function () { var keepMode = form.mode; form = clone(DEFAULT_FORM); form.mode = keepMode; currentProfileId = null; S.save('currentProfile', null); saveForm(); rerenderForm(); };
    $$('input:not([type=checkbox]),select', fc).forEach(function (el) {
      el.addEventListener(el.tagName === 'SELECT' ? 'change' : 'input', function () {
        var id = el.id, m;
        if (el.dataset.net) { net[el.dataset.net] = el.value; el.className = 'net-' + el.value; saveNet(); }
        else if (id === 'f-place') form.place = el.value;
        else if (id === 'f-T') form.single.typeFilter = el.value;
        else if (id === 'f-mB') form.multiB = el.value;
        else if (id === 'f-Gu') form.single.Gu = el.value;
        else if ((m = id.match(/^f-([GMSB])$/))) form.single[m[1]] = el.value;
        else if ((m = id.match(/^p(\d+)-(L|G|Gu|M|S)$/))) form.persons[+m[1]][m[2] === 'L' ? 'label' : m[2]] = el.value;
        else return;
        saveForm(); refreshResults();
      });
    });
  }
  function rerenderForm() { var fc = $('#formCard'); if (!fc) return; fc.innerHTML = formHTML(); bindForm(); refreshResults(); }
  SCREENS.pick = { html: pickHTML, bind: function () { bindForm(); refreshResults(); } };

  /* ================= НӘТИЖЕ ================= */
  function pillHTML(st) {
    if (st === 'ok') return '<span class="pill ok">✓ Сәйкес</span>';
    if (st === 'fail') return '<span class="pill fail">✗ Сәйкес емес</span>';
    return '<span class="pill unclear">? Нақтылау қажет</span>';
  }
  function kCells(plan) {
    return E.RES_KEYS.map(function (k) {
      var best = null, state = 'skip';
      plan.packages.forEach(function (p) {
        var it = p.pk.items.filter(function (i) { return i.k === k; })[0];
        if (it.unknown || it.paidUnknown) { if (state !== 'val') state = 'unknown'; }
        else if (it.missingInput) { if (state === 'skip') state = 'missing'; }
        else if (it.paid) { if (state !== 'val' && state !== 'unknown') state = 'paid'; }
        else if (it.r != null) { state = 'val'; best = best == null ? it.r : Math.min(best, it.r); }
      });
      var v = state === 'val' ? fmtNum(best) : state === 'unknown' ? 'белгісіз' : state === 'paid' ? 'ақылы' : state === 'missing' ? 'бос' : 'керек емес';
      return '<div class="kc' + (state === 'val' ? (best < 1 ? ' lo' : '') : ' na') + '"><b>' + E.RES[k].sym + '</b><span>' + v + '</span></div>';
    }).join('');
  }
  function cardHTML(plan, top) {
    var rs = [];
    plan.fails.forEach(function (x) { rs.push('<li class="f">' + esc(x) + '</li>'); });
    plan.unknowns.forEach(function (x) { rs.push('<li class="u">' + esc(x) + '</li>'); });
    if (plan.status !== 'fail') plan.oks.forEach(function (x) { rs.push('<li class="o">' + esc(x) + '</li>'); });
    var kind = { single: 'жеке тариф', familySingle: 'отбасылық тариф', family: 'отбасылық, ортақ пакет', perPerson: 'жеке тарифтер, әрқайсысы бөлек', combo: 'аралас' }[plan.kind] || '';
    var promo = plan.tariffs.filter(function (t) { return t.promo; }).map(function (t) { return '<li>' + esc(E.tName(t)) + ': алғашқы ' + t.promo.payments + ' төлем ' + fmtMoney(t.promo.price) + ', кейін ' + fmtMoney(t.price) + '</li>'; }).join('');
    var steps = plan.steps.map(function (s) { return s.h ? '<div class="h">' + esc(s.h) + '</div>' : '<div class="s' + (s.strong ? ' b' : '') + '">' + esc(s.s) + '</div>'; }).join('');
    var tag = top ? (plan.status === 'ok' ? '<span class="pill top">Ең арзан сәйкес</span>' : '<span class="pill top">Сандық тұрғыдан ең арзан</span>') : '';
    return '<article class="rcard ' + plan.status + (top ? ' top' : '') + '">' +
      '<div class="rc-h"><div><div class="rc-op">' + esc(plan.networks.join(' + ')) + ' · ' + kind + '</div><h4>' + esc(plan.title) + '</h4></div><div class="stack" style="gap:4px;align-items:flex-end">' + pillHTML(plan.status) + tag + '</div></div>' +
      '<div class="pricebox"><span class="price">' + fmtMoney(plan.price) + (plan.priceKnown ? '' : '+?') + ' <small>/ ' + esc(plan.periodText) + '</small></span>' +
      (plan.budget ? (plan.budget.ok ? '<span class="small" style="color:var(--ok)">≤ B (' + fmtMoney(plan.budget.B) + ')</span>' : '<span class="small" style="color:var(--bad);font-weight:700">> B (' + fmtMoney(plan.budget.B) + ')</span>') : '') + '</div>' +
      (plan.priceParts.length > 1 ? '<div class="tiny muted mono">' + plan.priceParts.map(function (p) { return esc(p.label) + ': ' + esc(p.expr); }).join(' · ') + '</div>' : '') +
      '<div class="kbig"><span class="small muted">K =</span><b>' + (plan.K == null ? '—' : fmtNum(plan.K)) + '</b><span class="small muted">' + (plan.K == null ? 'есептелмеді' : (plan.K >= 1 ? '≥ 1' : '< 1') + (plan.unknowns.some(function (u) { return /тариф шамасы белгісіз/.test(u); }) ? ' · тек белгілі ресурстар бойынша' : '')) + '</span></div>' +
      '<div class="kgrid">' + kCells(plan) + '</div>' +
      '<ul class="reasons">' + rs.join('') + '</ul>' +
      (plan.notes.length || promo ? '<ul class="reasons small muted">' + plan.notes.map(function (n) { return '<li>' + esc(n) + '</li>'; }).join('') + promo + '</ul>' : '') +
      '<details class="more"><summary>Қадамдап есептеу</summary><div class="stepbox">' + steps + '</div></details>' +
      (plan.checks.length ? '<details class="more"><summary>Қосылар алдында тексеру</summary><ul class="checklist">' + plan.checks.map(function (c) { return '<li>' + esc(c) + '</li>'; }).join('') + '</ul></details>' : '') +
      '</article>';
  }
  function generalChecks(L) {
    var c = ['Ресми бетте баға мен пакеттің қазіргі шарттарын қайта қараңыз (база күні ' + D.TARIFF_BASE.checkedLabel + ')',
      'Төлем кезеңін нақтылаңыз: «ай» мен «30 күн» бірдей емес',
      'Тариф пен акция жаңа абонентке ғана ма, нөмірді көшіргенде қолжетімді ме'];
    var nets = [];
    var plan = L.summary && L.summary.plan;
    if (plan) plan.netPending.forEach(function (x) { nets.push(x.nw); });
    if (nets.length) c.unshift(nets.join(', ') + ' желісін өз мекеніңізде (үйде, жұмыста, жолда) тексеріңіз: қоңырау мен мобильді интернет');
    if (plan) plan.checks.forEach(function (x) { if (c.indexOf(x) < 0) c.push(x); });
    return c;
  }
  function resultsHTML(L, compact) {
    if (!L || !L.plans) {
      if (L && Object.keys(L.r.errs).length) return '<div class="notice bad"><b class="i">!</b><div>Енгізілген мәнде қате бар. Қызыл жазуы бар өрісті түзетіңіз, сонда нәтиже қайта есептеледі.</div></div>';
      return '<div class="card empty"><h3>Әзірге нәтиже жоқ</h3><p class="muted">Интернет пен минут қажеттілігін енгізіңіз. Нәтиже бірден есептеледі.</p>' + (compact ? '' : '<a class="btn primary" href="#pick" data-r="pick">Қажеттілікті енгізу</a>') + '</div>';
    }
    var g = L.groups, s = L.summary, h = '';
    h += '<section class="summary ' + s.kind + '"><span class="eyebrow">Қысқа ұсыныс</span><p class="big">' + esc(s.text) + '</p>' + (s.periodNote ? '<p class="small">' + esc(s.periodNote) + '</p>' : '') +
      '<div class="inputs">' + inputChips(L.r.input).map(function (x) { return '<span>' + esc(x) + '</span>'; }).join('') + '</div>' +
      '<details class="more"><summary>Қосылмас бұрын не тексеру керек</summary><ul class="checklist">' + generalChecks(L).map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul></details>' +
      (compact ? '' : '<div class="row"><button class="btn sm" type="button" id="xCsv">CSV жүктеу</button><button class="btn sm" type="button" id="xPrint">Басып шығару</button><button class="btn sm" type="button" id="xSave">Профиль ретінде сақтау</button>' + (g.ok.length + g.unclear.length >= 2 ? '<button class="btn sm" type="button" id="xCmp">Алғашқы екеуін салыстыру</button>' : '') + '</div>') +
      '</section>';
    var topId = s.plan ? s.plan.id : null;
    function group(title, color, list, open, empty) {
      return '<details class="stack" ' + (open ? 'open' : '') + ' style="gap:10px"><summary class="ghead" style="cursor:pointer;list-style:none"><span class="dot" style="background:' + color + '"></span><h3>' + title + '</h3><span class="cnt">' + list.length + '</span></summary>' +
        (list.length ? '<div class="cards">' + list.map(function (p) { return cardHTML(p, p.id === topId); }).join('') + '</div>' : '<p class="small muted">' + empty + '</p>') + '</details>';
    }
    h += group('Сәйкес', 'var(--ok)', g.ok, true, 'Барлық тексерілген шарттан өткен тариф жоқ.');
    h += group('Нақтылау қажет', 'var(--warn)', g.unclear, true, 'Жоқ.');
    h += group('Сәйкес емес', 'var(--bad)', g.fail, !compact || g.ok.length + g.unclear.length === 0, 'Жоқ.');
    return h;
  }
  function bindResults(root) {
    var x;
    if ((x = $('#xCsv', root))) x.onclick = exportCSV;
    if ((x = $('#xPrint', root))) x.onclick = printResult;
    if ((x = $('#xSave', root))) x.onclick = function () { go('profiles'); setTimeout(function () { var n = $('#pName'); if (n) n.focus(); }, 50); };
    if ((x = $('#xCmp', root))) x.onclick = function () {
      var list = LAST.groups.ok.concat(LAST.groups.unclear).filter(function (p) { return p.tariffs.length === 1; });
      if (list.length >= 2) { cmpSel.a = list[0].tariffs[0].id; cmpSel.b = list[1].tariffs[0].id; S.save('compare', cmpSel); }
      go('compare');
    };
  }
  SCREENS.result = {
    html: function () { var L = compute(); return '<div class="screen-h"><span class="eyebrow">Нәтиже</span><h2>Тарифтерді тексеру нәтижесі</h2><p class="small muted">Тариф деректері: ' + esc(D.TARIFF_BASE.checkedLabel) + '. <a href="#pick" data-r="pick">Талаптарды өзгерту</a></p></div>' + resultsHTML(L, false); },
    bind: function () { bindResults($('#view')); }
  };

  /* ================= ЭКСПОРТ ================= */
  function csvCell(v) { var s = String(v == null ? '' : v).replace(/ /g, ' '); return '"' + s.replace(/"/g, '""') + '"'; }
  function groupName(st) { return st === 'ok' ? 'Сәйкес' : st === 'fail' ? 'Сәйкес емес' : 'Нақтылау қажет'; }
  function exportRows() {
    var L = LAST && LAST.plans ? LAST : compute();
    if (!L.plans) return null;
    var inp = L.r.input, rows = [];
    rows.push(['Тариф таңдау моделі — нәтиже']);
    rows.push(['Жасалған уақыты', nowText()]);
    rows.push(['Тариф деректерінің күні', D.TARIFF_BASE.checkedLabel]);
    rows.push(['Қолданба нұсқасы', APP_VERSION]);
    rows.push([]);
    rows.push(['Енгізілген талаптар']);
    if (inp.mode === 'single') {
      rows.push(['Режим', 'Бір адам']);
      rows.push(['G, интернет', inp.Graw == null ? 'енгізілмеген' : fmtNum(inp.Graw) + (inp.Gu === 'MB' ? ' МБ (' + fmtNum(inp.G) + ' ГБ)' : ' ГБ')]);
      rows.push(['M, минут', inp.M == null ? 'енгізілмеген' : inp.M]);
      rows.push(['S, шығыс SMS', inp.S == null ? 'енгізілмеген' : inp.S]);
    } else {
      rows.push(['Режим', 'Бірнеше адам (' + inp.persons.length + ')']);
      rows.push(['Адам', 'Интернет', 'Минут', 'Шығыс SMS']);
      inp.persons.forEach(function (p, i) { rows.push([(i + 1) + (p.label ? ' (' + p.label + ')' : ''), p.Graw == null ? '' : fmtNum(p.Graw) + (p.Gu === 'MB' ? ' МБ' : ' ГБ'), p.M == null ? '' : p.M, p.S == null ? '' : p.S]); });
    }
    rows.push(['B, бюджет', inp.B == null ? 'енгізілмеген' : fmtMoney(inp.B)]);
    rows.push(['Мекен', inp.place || '—']);
    D.NETWORKS.forEach(function (n) { rows.push(['Желі: ' + n, E.NET_LABEL[inp.net[n]] + ' (пайдаланушы белгісі)']); });
    rows.push([]);
    rows.push(['Қысқа ұсыныс', L.summary.text]);
    rows.push([]);
    rows.push(['Топ', 'Тариф', 'K', 'Шектеуші ресурс', 'Толық баға, ₸', 'Төлем кезеңі', 'Бюджет', 'Жетіспейтіні / сәйкес еместігі', 'Нақтылау қажет', 'Расталғаны', 'Қосылар алдында тексеру']);
    L.groups.ok.concat(L.groups.unclear, L.groups.fail).forEach(function (p) {
      rows.push([groupName(p.status), p.title, p.K == null ? '' : fmtNum(p.K), p.limiting.map(function (k) { return E.RES[k].name; }).join(', '),
        Math.round(p.price) + (p.priceKnown ? '' : ' + белгісіз'), p.periodText, p.budget ? (p.budget.ok ? 'сыяды' : 'асады ' + Math.round(p.budget.diff)) : 'тексерілмеді',
        p.fails.join('; '), p.unknowns.join('; '), p.oks.join('; '), p.checks.join('; ')]);
    });
    rows.push([]);
    rows.push(['Ескерту', 'Нәтиже пакет көлемі мен бағаға ғана қатысты. Желі сапасы — пайдаланушы белгісі. Қосылар алдында ресми шартты тексеріңіз.']);
    return rows;
  }
  function download(name, mime, text) {
    var blob = new Blob([text], { type: mime });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 1500);
  }
  function exportCSV() {
    var rows = exportRows(); if (!rows) { toast('Алдымен қажеттілікті енгізіңіз'); return; }
    var csv = '﻿' + rows.map(function (r) { return r.map(csvCell).join(';'); }).join('\r\n');
    download('tarif-natizhe-' + today() + '.csv', 'text/csv;charset=utf-8', csv);
    toast('CSV файлы жүктелді');
  }
  function printResult() {
    var L = LAST && LAST.plans ? LAST : compute(); if (!L.plans) { toast('Алдымен қажеттілікті енгізіңіз'); return; }
    var inp = L.r.input;
    var h = '<h1>Тариф таңдау моделі — нәтиже</h1><p>Жасалған уақыты: ' + esc(nowText()) + ' · Тариф деректерінің күні: ' + esc(D.TARIFF_BASE.checkedLabel) + ' · Нұсқа ' + APP_VERSION + '</p>';
    h += '<h2>Енгізілген талаптар</h2><p>' + inputChips(inp).map(esc).join(' · ') + '</p>';
    if (inp.mode === 'multi') h += '<table><tr><th>Адам</th><th>Интернет</th><th>Минут</th><th>SMS</th></tr>' + inp.persons.map(function (p, i) { return '<tr><td>' + (i + 1) + (p.label ? ' (' + esc(p.label) + ')' : '') + '</td><td>' + (p.Graw == null ? '' : fmtNum(p.Graw) + (p.Gu === 'MB' ? ' МБ' : ' ГБ')) + '</td><td>' + (p.M == null ? '' : p.M) + '</td><td>' + (p.S == null ? '' : p.S) + '</td></tr>'; }).join('') + '</table>';
    h += '<p>Желі (пайдаланушы белгісі): ' + D.NETWORKS.map(function (n) { return esc(n) + ' — ' + E.NET_LABEL[inp.net[n]]; }).join('; ') + '</p>';
    h += '<h2>Қысқа ұсыныс</h2><p>' + esc(L.summary.text) + '</p>';
    h += '<h2>Тарифтер</h2><table><tr><th>Топ</th><th>Тариф</th><th>K</th><th>Толық баға</th><th>Кезең</th><th>Себептер</th></tr>' +
      L.groups.ok.concat(L.groups.unclear, L.groups.fail).map(function (p) { return '<tr><td>' + groupName(p.status) + '</td><td>' + esc(p.title) + '</td><td>' + (p.K == null ? '—' : fmtNum(p.K)) + '</td><td>' + fmtMoney(p.price) + (p.priceKnown ? '' : ' + ?') + '</td><td>' + esc(p.periodText) + '</td><td>' + esc(p.fails.concat(p.unknowns).join('; ') || p.oks.join('; ')) + '</td></tr>'; }).join('') + '</table>';
    h += '<h2>Қосылмас бұрын тексеру</h2><ul>' + generalChecks(L).map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>';
    h += '<p style="font-size:9pt">Нәтиже пакет көлемі мен бағаға ғана қатысты; желі сапасы — пайдаланушы белгісі. Дереккөздер: қолданбаның «Дереккөздер және шектеулер» бөлімі.</p>';
    $('#printArea').innerHTML = h;
    setTimeout(function () { try { window.print(); } catch (e) { toast('Басып шығару бұл ортада қолжетімсіз'); } }, 50);
  }

  /* ================= ТАРИХ ================= */
  function histParsed() {
    return hist.months.map(function (m) {
      var g = parseField(m.G), mi = parseField(m.M, { int: true }), s = parseField(m.S, { int: true });
      return { label: m.label, G: E.toGB(g.val, m.Gu), M: mi.val, S: s.val, err: g.err || mi.err || s.err, warn: mbWarn(g.val, m.Gu) };
    });
  }
  function barChart(values, labels, color, unit, avg) {
    var W = 320, H = 150, L = 34, R = 8, Tp = 12, B = 24;
    var vals = values.map(function (v) { return v == null ? 0 : v; });
    var mx = Math.max.apply(null, vals.concat([avg || 0, 1]));
    var nice = function (x) { var p = Math.pow(10, Math.floor(Math.log10(x))); var f = x / p; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p; };
    var top = nice(mx);
    var sy = function (v) { return Tp + (1 - v / top) * (H - Tp - B); };
    var n = values.length, bw = (W - L - R) / Math.max(n, 1);
    var s = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(unit) + ' бойынша айлық шығын">';
    [0, top / 2, top].forEach(function (v) { s += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + sy(v) + '" y2="' + sy(v) + '" stroke="var(--line)"/><text x="' + (L - 4) + '" y="' + (sy(v) + 4) + '" text-anchor="end" font-size="10" fill="var(--muted)">' + fmtNum(v, 1) + '</text>'; });
    values.forEach(function (v, i) {
      var x = L + i * bw + bw * 0.18, w = bw * 0.64;
      if (v != null) s += '<rect x="' + x + '" y="' + sy(v) + '" width="' + w + '" height="' + Math.max(0, sy(0) - sy(v)) + '" rx="3" fill="' + color + '"><title>' + esc(labels[i]) + ': ' + fmtNum(v) + ' ' + unit + '</title></rect>';
      s += '<text x="' + (x + w / 2) + '" y="' + (H - 8) + '" text-anchor="middle" font-size="10" fill="var(--muted)">' + (i + 1) + '</text>';
    });
    if (avg != null) s += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + sy(avg) + '" y2="' + sy(avg) + '" stroke="var(--accent)" stroke-width="2" stroke-dasharray="5 4"/><text x="' + (W - R) + '" y="' + (sy(avg) - 4) + '" text-anchor="end" font-size="10" font-weight="700" fill="var(--accent)">орташа ' + fmtNum(avg, 1) + '</text>';
    return s + '</svg>';
  }
  function histStatsHTML() {
    var P = histParsed(), res = [['G', 'Интернет', 'ГБ', 'var(--c-g)'], ['M', 'Минут', 'мин', 'var(--c-m)'], ['S', 'Шығыс SMS', 'SMS', 'var(--c-s)']];
    if (!P.length) return '<div class="card empty"><h3>Тарих бос</h3><p class="muted">Детализациядан кемінде бір айдың шығынын енгізіңіз. Қолданба өздігінен ешбір мән қоспайды.</p></div>';
    var bad = P.filter(function (p) { return p.err; }).length;
    var h = bad ? '<div class="notice bad"><b class="i">!</b><div>' + bad + ' жолда сан дұрыс емес — ол жол есепке алынбайды.</div></div>' : '';
    var q = hist.reserve, method = hist.method;
    var labels = P.map(function (p, i) { return p.label || (i + 1) + '-ай'; });
    var out = {};
    h += '<div class="stats">' + res.map(function (r) {
      var st = E.historyStats(P.map(function (p) { return p.err ? null : p[r[0]]; }), q); out[r[0]] = st;
      if (!st) return '<div class="stat"><span class="t" style="color:' + r[3] + '">' + r[1] + '</span><span class="small muted">Дерек жоқ</span></div>';
      var need = method === 'max' ? st.needMax : st.needAvg;
      return '<div class="stat"><span class="t" style="color:' + r[3] + '">' + r[1] + ' · ' + st.n + ' ай</span>' +
        '<span class="small">Орташа: <b class="mono">' + fmtNum(st.avg, 2) + '</b> ' + r[2] + ' · Ең көп: <b class="mono">' + fmtNum(st.max, 2) + '</b></span>' +
        '<span class="v">' + fmtNum(need) + ' <small class="small">' + r[2] + '</small></span>' +
        '<span class="tiny muted mono">⌈' + fmtNum(method === 'max' ? st.max : st.avg, 2) + ' × ' + fmtNum(1 + q / 100) + '⌉ = ' + fmtNum(need) + '</span></div>';
    }).join('') + '</div>';
    h += '<div class="grid2">' + res.map(function (r) {
      var st = out[r[0]]; if (!st) return '';
      return '<div class="card chart"><h4 style="color:' + r[3] + '">' + r[1] + ', ' + r[2] + '</h4>' + barChart(P.map(function (p) { return p.err ? null : p[r[0]]; }), labels, r[3], r[2], st.avg) + '</div>';
    }).join('') + '</div>';
    var canMove = out.G || out.M || out.S;
    h += '<button class="btn primary" type="button" id="hMove"' + (canMove ? '' : ' disabled') + '>Таңдау формасына көшіру</button><p class="tiny muted">Көшірілгенде «Бір адам» режиміндегі G, M, S өрістері ауысады. Бюджет пен желі белгілері өзгермейді.</p>';
    SCREENS.history._out = out;
    return h;
  }
  function histRowsHTML() {
    return '<div class="hrow hrow-h"><span>Ай</span><span>Интернет</span><span>Минут</span><span>Шығыс SMS</span><span></span></div>' +
      hist.months.map(function (m, i) {
        return '<div class="hrow"><div class="c-lab"><input type="text" id="h' + i + '-label" value="' + esc(m.label) + '" placeholder="' + (i + 1) + '-ай (мысалы, қыркүйек)" aria-label="Ай атауы"></div>' +
          '<div class="c-g inp"><input type="text" inputmode="decimal" id="h' + i + '-G" value="' + esc(m.G) + '" placeholder="интернет" aria-label="Интернет"><select class="unit" id="h' + i + '-Gu" aria-label="Бірлік"><option value="GB"' + (m.Gu === 'GB' ? ' selected' : '') + '>ГБ</option><option value="MB"' + (m.Gu === 'MB' ? ' selected' : '') + '>МБ</option></select></div>' +
          '<div class="c-m"><input type="text" inputmode="numeric" id="h' + i + '-M" value="' + esc(m.M) + '" placeholder="минут" aria-label="Минут"></div>' +
          '<div class="c-s"><input type="text" inputmode="numeric" id="h' + i + '-S" value="' + esc(m.S) + '" placeholder="SMS" aria-label="Шығыс SMS"></div>' +
          '<div class="c-del"><button class="iconbtn" type="button" data-hdel="' + i + '" aria-label="' + (i + 1) + '-айды өшіру">✕</button></div></div>';
      }).join('');
  }
  SCREENS.history = {
    html: function () {
      return '<div class="screen-h"><span class="eyebrow">Шығын тарихы</span><h2>Өз шығыныңыздан қажеттілікті есептеу</h2><p class="small muted">Оператор детализациясынан 1–12 айдың нақты шығынын енгізіңіз. Деректер тек осы құрылғыда сақталады. Бұл сіздің жеке шығыныңыз, жалпы халықтың статистикасы емес.</p></div>' +
        '<div class="card stack"><div id="hRows" class="stack" style="gap:8px">' + histRowsHTML() + '</div>' +
        '<div class="row"><button class="btn sm" type="button" id="hAdd"' + (hist.months.length >= 12 ? ' disabled' : '') + '>+ Ай қосу</button><span class="small muted">' + hist.months.length + ' / 12 ай</span>' + (hist.months.length ? '<button class="btn sm danger" type="button" id="hClear">Тарихты тазарту</button>' : '') + '</div></div>' +
        '<div class="card stack"><div class="grid2"><div class="field"><label for="hQ">Қор: <b id="hQv">' + hist.reserve + '%</b></label><input type="range" id="hQ" min="0" max="50" step="5" value="' + hist.reserve + '"></div>' +
        '<div class="field"><span class="flabel">Негізге алынатын мән</span><div class="seg" role="group" aria-label="Әдіс"><button type="button" data-hm="avg" aria-pressed="' + (hist.method === 'avg') + '">Орташа ай</button><button type="button" data-hm="max" aria-pressed="' + (hist.method === 'max') + '">Ең көп ай</button></div></div></div>' +
        '<div class="formula small"><span>Gорт = (G₁ + G₂ + … + Gₙ) / n</span><span class="b">Gқаж = ⌈Gорт × (1 + q/100)⌉</span><span class="muted" style="font-family:var(--f)">⌈x⌉ — жоғары қарай бүтінге дөңгелектеу. Минут пен SMS үшін де солай. Орташа әдіс қалыпты айды, ең көп ай әдісі жоғары тұтынуды ескереді.</span></div></div>' +
        '<div id="hStats" class="stack">' + histStatsHTML() + '</div>';
    },
    bind: function () {
      function refreshStats() { $('#hStats').innerHTML = histStatsHTML(); bindMove(); }
      function bindMove() {
        var b = $('#hMove'); if (!b) return;
        b.onclick = function () {
          var o = SCREENS.history._out, pickV = function (st) { return st ? String(hist.method === 'max' ? st.needMax : st.needAvg) : ''; };
          form.mode = 'single'; form.single.G = pickV(o.G); form.single.Gu = 'GB'; form.single.M = pickV(o.M); form.single.S = pickV(o.S);
          saveForm(); toast('Қажеттілік формаға көшірілді'); go('pick');
        };
      }
      function bindRows() {
        $$('#hRows input, #hRows select').forEach(function (el) {
          el.addEventListener(el.tagName === 'SELECT' ? 'change' : 'input', function () {
            var m = el.id.match(/^h(\d+)-(label|G|Gu|M|S)$/); if (!m) return;
            hist.months[+m[1]][m[2]] = el.value; saveHist(); refreshStats();
          });
        });
        $$('[data-hdel]').forEach(function (b) { b.onclick = function () { hist.months.splice(+b.dataset.hdel, 1); saveHist(); go('history', true); }; });
      }
      $('#hAdd').onclick = function () { if (hist.months.length < 12) { hist.months.push({ label: '', G: '', Gu: 'GB', M: '', S: '' }); saveHist(); go('history', true); var el = document.getElementById('h' + (hist.months.length - 1) + '-G'); if (el) el.focus(); } };
      var c = $('#hClear'); if (c) c.onclick = function () { twoStep(c, 'Иә, барлық айды өшіру', function () { hist.months = []; saveHist(); go('history', true); toast('Тарих тазартылды'); }); };
      $('#hQ').oninput = function () { hist.reserve = +this.value; $('#hQv').textContent = hist.reserve + '%'; saveHist(); refreshStats(); };
      $$('[data-hm]').forEach(function (b) { b.onclick = function () { hist.method = b.dataset.hm; saveHist(); $$('[data-hm]').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); }); refreshStats(); }; });
      bindRows(); bindMove();
    }
  };

  /* ================= ПРОФИЛЬДЕР ================= */
  function profileSummary(p) {
    var f = normalizeForm(p.form);
    if (f.mode === 'single') return 'Бір адам · G ' + (f.single.G || '—') + ' ' + (f.single.Gu === 'MB' ? 'МБ' : 'ГБ') + ' · M ' + (f.single.M || '—') + ' · S ' + (f.single.S || '—') + (f.single.B ? ' · B ' + f.single.B + ' ₸' : '');
    return f.persons.length + ' адам' + (f.multiB ? ' · B ' + f.multiB + ' ₸' : '');
  }
  function openProfile(id) {
    var p = profiles.find(function (x) { return x.id === id; }); if (!p) return;
    form = normalizeForm(p.form); if (p.net) net = clone(p.net);
    currentProfileId = p.id; S.save('currentProfile', p.id); saveForm(); saveNet();
    toast('«' + p.name + '» ашылды'); go('pick');
  }
  SCREENS.profiles = {
    html: function () {
      var h = '<div class="screen-h"><span class="eyebrow">Профильдер</span><h2>Сақталған талаптар</h2></div>';
      h += '<div class="notice info"><b class="i">i</b><div>Есептік жазба жоқ. Профильдер тек осы құрылғыдағы браузерде сақталады және басқа құрылғымен синхрондалмайды. Браузер деректерін тазаласаңыз, олар өшеді. Сақтық көшірмені төменнен жүктей аласыз.</div></div>';
      h += '<div class="card stack"><h3>Ағымдағы талаптарды сақтау</h3><p class="small muted">' + esc(profileSummary({ form: form })) + '</p><div class="row"><input type="text" id="pName" placeholder="Атауы, мысалы: Үй · 4 адам" style="flex:1;min-width:200px" maxlength="60"><button class="btn primary" type="button" id="pAdd">Жаңа профиль</button></div><span class="err" id="pErr"></span></div>';
      h += '<div class="plist">' + (profiles.length ? profiles.map(function (p) {
        return '<div class="card pitem"><div class="nm"><input type="text" value="' + esc(p.name) + '" data-pren="' + esc(p.id) + '" aria-label="Профиль атауы" maxlength="60"><div class="tiny muted" style="margin-top:4px">' + esc(profileSummary(p)) + ' · жаңартылды ' + esc(p.updatedText || '') + (p.id === currentProfileId ? ' · <b>ашық</b>' : '') + '</div></div>' +
          '<div class="row"><button class="btn sm primary" type="button" data-popen="' + esc(p.id) + '">Ашу</button><button class="btn sm" type="button" data-pupd="' + esc(p.id) + '">Ағымдағымен жаңарту</button><button class="btn sm danger" type="button" data-pdel="' + esc(p.id) + '">Өшіру</button></div></div>';
      }).join('') : '<div class="card empty"><p class="muted">Әзірге профиль жоқ.</p></div>') + '</div>';
      h += '<div class="card stack"><h3>Сақтық көшірме</h3><p class="small muted">Профильдер, шығын тарихы және желі белгілері бір JSON файлға жазылады. Басқа құрылғыда «Көшірмені жүктеу» арқылы қосуға болады (бар профильдер өшпейді).</p><div class="row"><button class="btn sm" type="button" id="bkOut">Көшірмені сақтау (JSON)</button><label class="btn sm" for="bkIn">Көшірмені жүктеу</label><input type="file" id="bkIn" accept="application/json,.json" hidden></div></div>';
      return h;
    },
    bind: function () {
      $('#pAdd').onclick = function () {
        var name = $('#pName').value.trim();
        if (!name) { $('#pErr').textContent = 'Профильге атау беріңіз'; $('#pName').focus(); return; }
        var p = { id: uid(), name: name, created: Date.now(), updated: Date.now(), updatedText: nowText(), form: clone(form), net: clone(net) };
        profiles.unshift(p); currentProfileId = p.id; S.save('currentProfile', p.id); saveProfiles(); toast('Профиль сақталды'); go('profiles', true);
      };
      $$('[data-popen]').forEach(function (b) { b.onclick = function () { openProfile(b.dataset.popen); }; });
      $$('[data-pupd]').forEach(function (b) { b.onclick = function () { var p = profiles.find(function (x) { return x.id === b.dataset.pupd; }); p.form = clone(form); p.net = clone(net); p.updated = Date.now(); p.updatedText = nowText(); saveProfiles(); toast('«' + p.name + '» жаңартылды'); go('profiles', true); }; });
      $$('[data-pdel]').forEach(function (b) { b.onclick = function () { twoStep(b, 'Иә, өшіру', function () { profiles = profiles.filter(function (x) { return x.id !== b.dataset.pdel; }); if (currentProfileId === b.dataset.pdel) { currentProfileId = null; S.save('currentProfile', null); } saveProfiles(); toast('Профиль өшірілді'); go('profiles', true); }); }; });
      $$('[data-pren]').forEach(function (inp) { inp.onchange = function () { var v = inp.value.trim(); var p = profiles.find(function (x) { return x.id === inp.dataset.pren; }); if (v && p) { p.name = v; p.updated = Date.now(); p.updatedText = nowText(); saveProfiles(); toast('Атауы өзгерді'); } else inp.value = p.name; }; });
      $('#bkOut').onclick = function () { download('tarif-koshirme-' + today() + '.json', 'application/json', JSON.stringify(S.exportAll(), null, 2)); toast('Көшірме жүктелді'); };
      $('#bkIn').onchange = function () {
        var f = this.files && this.files[0]; if (!f) return;
        var rd = new FileReader();
        rd.onload = function () { try { var n = S.importAll(JSON.parse(rd.result)); profiles = S.load('profiles', []); hist = S.load('history', null) || hist; toast(n + ' профиль қосылды'); go('profiles', true); } catch (e) { toast('Қате: ' + e.message); } };
        rd.readAsText(f);
      };
    }
  };

  /* ================= САЛЫСТЫРУ ================= */
  function tOpt(sel) { return T.map(function (t) { return '<option value="' + t.id + '"' + (t.id === sel ? ' selected' : '') + '>' + esc(E.tName(t)) + '</option>'; }).join(''); }
  function resText(v, unit, note) { return v == null ? '<span style="color:var(--warn)">белгісіз</span>' + (note ? ' — ' + esc(note) : '') : '<b>' + fmtNum(v) + '</b> ' + unit + (note ? ' — ' + esc(note) : ''); }
  SCREENS.compare = {
    html: function () {
      var a = T.find(function (t) { return t.id === cmpSel.a; }) || T[0], b = T.find(function (t) { return t.id === cmpSel.b; }) || T[1];
      var cnt = parseField(cmpSel.count, { int: true }).val || 1;
      var h = '<div class="screen-h"><span class="eyebrow">Салыстыру</span><h2>Екі тарифті қатар қою</h2></div>';
      h += '<div class="card stack"><div class="two"><div class="field"><label for="cA">Бірінші тариф</label><select id="cA">' + tOpt(a.id) + '</select></div><div class="field"><label for="cB">Екінші тариф</label><select id="cB">' + tOpt(b.id) + '</select></div></div></div>';
      if (a.period !== b.period) h += '<div class="notice warn"><b class="i">!</b><div>Төлем кезеңдері әртүрлі: ' + esc(E.tName(a)) + ' — ' + E.periodLabel(a.period) + ', ' + esc(E.tName(b)) + ' — ' + E.periodLabel(b.period) + '. Бір төлемнің бағасы бірдей уақыт аралығы емес; 12 × 30 күн = 360 күн, ал 12 ай — күнтізбелік жыл.</div></div>';
      var rows = [
        ['Түрі', function (t) { return t.type === 'family' ? 'отбасылық' : 'жеке'; }],
        ['Нөмір саны', function (t) { return t.maxNumbers == null ? '<span style="color:var(--warn)">нақтылау қажет</span>' : (t.type === 'family' ? t.maxNumbers + '-ге дейін' : '1'); }],
        ['Интернет, Gт', function (t) { return resText(t.gb, 'ГБ', t.gbNote); }],
        ['Минут, Mт', function (t) { return resText(t.minutes, 'мин', t.minutesDir); }],
        ['Шығыс SMS, Sт', function (t) { return t.sms == null ? '<span style="color:var(--warn)">белгісіз</span>' : '<b>' + t.sms + '</b>'; }],
        ['Пакеттен тыс SMS', function (t) { return t.smsPrice == null ? '<span style="color:var(--warn)">бағасы белгісіз</span>' : fmtMoney(t.smsPrice) + ' / дана'; }],
        ['Бір төлем', function (t) { return '<b>' + fmtMoney(t.price) + '</b> / ' + E.periodLabel(t.period); }],
        ['Акция', function (t) { return t.promo ? 'алғашқы ' + t.promo.payments + ' төлем: ' + fmtMoney(t.promo.price) : '—'; }],
        ['Деректер', function (t) { return '<a href="' + esc(t.source) + '" target="_blank" rel="noopener">[' + t.sourceNo + ']</a> ' + esc(t.checked); }]
      ];
      h += '<div class="cmp"><div class="hd lab"></div><div class="hd">' + esc(E.tName(a)) + '</div><div class="hd">' + esc(E.tName(b)) + '</div>' +
        rows.map(function (r) { return '<div class="lab">' + r[0] + '</div><div class="v">' + r[1](a) + '</div><div class="v">' + r[1](b) + '</div>'; }).join('') + '</div>';
      // сәйкестік
      var r = readInput(), si = r.input;
      var needOk = form.mode === 'single' && !r.empty && !Object.keys(r.errs).length;
      h += '<div class="card stack"><h3>Сіздің талабыңызға сәйкестігі</h3>';
      if (!needOk) h += '<p class="small muted">Салыстыру бір адамның қажеттілігімен жасалады. «Таңдау» бөлімінде «Бір адам» режимінде мәндерді енгізіңіз. <a href="#pick" data-r="pick">Енгізу</a></p>';
      else {
        h += '<div class="inputs">' + inputChips(si).map(function (x) { return '<span>' + esc(x) + '</span>'; }).join('') + '</div><div class="cards">' +
          [a, b].map(function (t) { var p = E.evaluatePlan({ id: t.id, kind: t.type === 'family' ? 'familySingle' : 'single', title: E.tName(t), packages: [{ label: '', pk: E.checkPackage(t, { g: si.G, m: si.M, s: si.S, n: 1 }) }] }, { B: si.B, net: si.net }); return cardHTML(p, false); }).join('') + '</div>';
      }
      h += '</div>';
      // 12 төлем
      var smsA = 0, smsB = 0;
      if (needOk && si.S) { [a, b].forEach(function (t, i) { var pk = E.checkPackage(t, { g: si.G, m: si.M, s: si.S, n: 1 }); if (i === 0) smsA = pk.smsExtraUnknown ? null : pk.smsExtra; else smsB = pk.smsExtraUnknown ? null : pk.smsExtra; }); }
      h += '<div class="card stack"><div class="row between"><h3>12 төлем</h3><div class="field" style="flex-direction:row;align-items:center;gap:8px"><label for="cN" class="small">Нөмір саны (жеке тарифке)</label><input type="text" inputmode="numeric" id="cN" value="' + esc(cmpSel.count) + '" style="width:5em"></div></div>' +
        '<div class="grid2">' + [[a, smsA], [b, smsB]].map(function (x) {
          var t = x[0], c = t.type === 'family' ? 1 : cnt, p = E.payments12(t, c, x[1] || 0);
          return '<div class="formula"><span class="b" style="font-family:var(--f)">' + esc(E.tName(t)) + '</span>' +
            (p.promoN ? '<span>' + p.promoN + ' × ' + fmtMoney(p.promoPrice) + ' = ' + fmtMoney(p.first) + '</span>' : '') +
            '<span>' + p.restN + ' × ' + fmtMoney(t.price) + ' = ' + fmtMoney(p.rest) + '</span>' +
            (c > 1 ? '<span>Бір нөмір: ' + fmtMoney(p.perNumber) + ' × ' + c + ' нөмір</span>' : '') +
            (x[1] ? '<span>Ақылы SMS: 12 × ' + fmtMoney(x[1]) + ' = ' + fmtMoney(p.extra) + '</span>' : '') +
            (x[1] === null ? '<span style="color:var(--warn)">+ пакеттен тыс SMS (бағасы белгісіз)</span>' : '') +
            '<span class="b">12 төлемнің бағасы: ' + fmtMoney(p.total) + (x[1] === null ? ' + ?' : '') + '</span>' +
            '<span class="tiny muted" style="font-family:var(--f)">' + (t.period === '30d' ? '12 × 30 күн = 360 күн' : '12 күнтізбелік ай') + (t.type === 'family' ? '; отбасылық тариф — бір төлем барлық нөмірге' : '') + '</span></div>';
        }).join('') + '</div>' +
        '<details class="more"><summary>Бұл есепке не кірмейді</summary><ul class="checklist">' +
        ['Қосымша интернет не минут пакеттері (қолданба оларды автоматты қоспайды)', 'Пакеттен тыс қоңырау, басқа бағыттағы минуттар, роуминг', 'SIM-карта, нөмір көшіру не қосылу ақысы', 'Бағасы белгісіз пакеттен тыс SMS', 'Акция мерзімі өзгеруі не жаңа абонентке ғана берілуі', 'Тариф бағасының жыл ішінде өзгеруі'].map(function (x) { return '<li>' + x + '</li>'; }).join('') + '</ul></details></div>';
      return h;
    },
    bind: function () {
      $('#cA').onchange = function () { cmpSel.a = this.value; S.save('compare', cmpSel); go('compare', true); };
      $('#cB').onchange = function () { cmpSel.b = this.value; S.save('compare', cmpSel); go('compare', true); };
      $('#cN').onchange = function () { var v = parseField(this.value, { int: true }).val; cmpSel.count = v && v >= 1 && v <= 12 ? String(v) : '1'; S.save('compare', cmpSel); go('compare', true); };
    }
  };

  /* ================= МОДЕЛЬ ================= */
  SCREENS.model = {
    html: function () {
      var three = ['altel-erkin', 'izi-ultra-boost', 'altel-erkin-plus'].map(function (id) { return T.find(function (t) { return t.id === id; }); });
      var ex = E.buildPlans({ mode: 'single', G: 40, M: 100, S: 0, B: null, net: {} }, three);
      var h = '<div class="screen-h"><span class="eyebrow">Модель қалай есептейді?</span><h2>Сәйкестік коэффициенті K</h2></div>';
      h += '<div class="card stack"><div class="formula"><span>Kг = Gт / G &nbsp; Kм = Mт / M</span><span>Kс = Sт / S &nbsp; Kн = Nт / N</span><span class="b">K = min(Kг, Kм, Kс, Kн)</span><span style="font-family:var(--f)">K ≥ 1 — белгілі ресурстар жеткілікті. K &lt; 1 — кемінде біреуі жетпейді.</span></div>' +
        '<p class="small">G — қажетті интернет (ГБ), M — минут, S — шығыс SMS, N — нөмір саны, B — бюджет. «т» белгісі — тариф беретін шама. P — тарифтің бір төлемі.</p></div>';
      h += '<div class="card stack"><h3>Зерттеуден мысал: 40 ГБ, 100 минут</h3><div class="tblwrap"><table class="tbl cardify"><thead><tr><th>Тариф</th><th class="n">Kг</th><th class="n">Kм</th><th class="n">K</th><th>Нәтиже</th></tr></thead><tbody>' +
        ex.map(function (p) { var it = p.packages[0].pk.items; return '<tr><td data-l="Тариф">' + esc(p.title) + '</td><td class="n" data-l="Kг">' + it[0].offer + '/40 = ' + fmtNum(it[0].r) + '</td><td class="n" data-l="Kм">' + it[1].offer + '/100 = ' + fmtNum(it[1].r) + '</td><td class="n" data-l="K"><b>' + fmtNum(p.K) + '</b></td><td data-l="Нәтиже">' + (p.K >= 1 ? 'ресурс жетеді, ' + fmtMoney(p.price) + ' / ' + p.periodText : esc(p.fails[0])) + '</td></tr>'; }).join('') +
        '</tbody></table></div><p class="small muted">Ең арзан IZI-де 5 ГБ жетпейді, сондықтан ол сәйкес деп көрсетілмейді. Желі мен бюджет бөлек тексеріледі.</p></div>';
      var det = [
        ['Неге орташа емес, ең кіші мән?', 'Kг = 2, Kм = 0,5 болса, орташа (2 + 0,5) / 2 = 1,25 — «жетеді» деп қателеседі. Ал min(2; 0,5) = 0,5 &lt; 1: минут жетпейді. Бір ресурстың артығы екіншісінің жетіспеушілігін алмастырмайды.'],
        ['Нөлге тең қажеттілік', 'S = 0 болса, Kс есептелмейді: нөлге бөлуге болмайды, ал SMS жібермейтін адамға тарифте SMS болмауы кедергі емес. Бос өріс басқа: ол «дерек енгізілмеген» дегенді білдіреді.'],
        ['Белгісіз тариф шамасы', 'Ресми шартта сан жоқ болса (мысалы, «шексіз» интернеттің жоғары жылдамдық шегі), коэффициент есептелмейді. Тариф «Нақтылау қажет» тобына түседі. Белгісіз мән 0-ге де, шексізге де теңестірілмейді.'],
        ['Толық баға және SMS', 'Pтолық = P + (S − Sт) × бір SMS бағасы, егер пакеттен тыс SMS бағасы расталған болса. Мысалы, IZI: 3 690 + 10 × 18 = 3 870 ₸. Баға белгісіз болса, нәтиже нақтылауды қажет етеді. Содан кейін Pтолық ≤ B тексеріледі.'],
        ['Ортақ және жеке пакет', 'Отбасылық ортақ пакетте адамдардың қажеттілігі қосылады: ΣG, ΣM, ΣS, ал N — адам саны. Бірнеше жеке тарифте әр адамның пакеті бөлек тексеріледі, бағалары қосылады; бір адамның артық интернеті екіншісіне берілмейді.'],
        ['Желі белгісі', 'Пайдаланушы әр желіге «жұмыс істейді», «әлсіз», «жұмыс істемейді» не «тексерілмеген» деп белгі қояды. «Жұмыс істемейді» — сәйкес емес. «Тексерілмеген» не «әлсіз» — түпкілікті ұсыныс жоқ, тек сандық нәтиже.'],
        ['Шешім реті', '1) K &lt; 1 тарифтер шығарылады. 2) Толық баға мен бюджет тексеріледі. 3) Желі белгісі қаралады. 4) Барлық шарттан өткендер толық бағасы бойынша өсу ретімен тізіледі. Бағасы тең болса, интернеті көбі жоғары тұрады. Талаптар ешқашан өздігінен төмендетілмейді.'],
        ['Акция және 12 төлем', 'Алғашқы бағаны 12-ге көбейтпейміз: 3 × 4 790 + 9 × 5 990 = 68 280 ₸. Нәтиже «12 төлем» деп аталады, «жылдық баға» емес, өйткені 12 × 30 күн = 360 күн.']
      ];
      h += '<div class="stack">' + det.map(function (d) { return '<details class="card"><summary style="cursor:pointer;font-weight:700">' + d[0] + '</summary><p class="small" style="margin-top:8px">' + d[1] + '</p></details>'; }).join('') + '</div>';
      return h;
    }
  };

  /* ================= ДЕРЕККӨЗДЕР ================= */
  SCREENS.sources = {
    html: function () {
      var h = '<div class="screen-h"><span class="eyebrow">Дереккөздер және шектеулер</span><h2>Тариф базасы: ' + esc(D.TARIFF_BASE.checkedLabel) + '</h2></div>';
      h += '<div class="notice warn"><b class="i">!</b><div>' + esc(D.TARIFF_BASE.note) + '</div></div>';
      h += '<div class="card stack"><h3>Шектеулер</h3><ul class="checklist">' +
        ['Есеп пакет көлемі мен баға жетіп-жетпейтінін көрсетеді. Байланыстың нақты сапасын өлшемейді.',
          'Оператор карталары [4–6] мәлімделген аймақты көрсетеді. Олар Тұғыл ауылындағы не Тарбағатай ауданындағы нақты үйде байланыс болатынына кепілдік бермейді.',
          'База — оқу жиыны: Қазақстандағы барлық тариф, жеке не архивтік акция емес.',
          '«Шексіз» сөзі жоғары жылдамдықтың сандық кепілі емес; шегі белгісіз тариф «нақтылау қажет» тобына түседі.',
          'Қосымша интернет пакеттері (мысалы, Beeline 50 ГБ — 3 999 ₸) автоматты таңдалмайды: олардың мерзімі мен шарты қолданбада тексерілмейді.',
          '12 төлем есебі күнтізбелік жылдық баға емес.',
          'Шығын тарихы мен профильдер тек осы құрылғыда сақталады; серверге ештеңе жіберілмейді.'].map(function (x) { return '<li>' + x + '</li>'; }).join('') + '</ul></div>';
      h += '<div class="card stack"><h3>Тарифтер (' + T.length + ')</h3><div class="tblwrap"><table class="tbl cardify"><thead><tr><th>Тариф</th><th>Нөмір</th><th>Интернет</th><th>Минут</th><th>SMS</th><th class="n">Төлем</th><th>Акция</th><th>Нақтылау қажет</th><th>Дереккөз</th></tr></thead><tbody>' +
        T.map(function (t) {
          return '<tr><td data-l="Тариф"><b>' + esc(E.tName(t)) + '</b><br><span class="tiny muted">' + (t.type === 'family' ? 'отбасылық' : 'жеке') + '</span></td><td data-l="Нөмір">' + (t.maxNumbers == null ? '?' : t.maxNumbers) + '</td>' +
            '<td data-l="Интернет">' + (t.gb == null ? '? — ' : t.gb + ' ГБ — ') + esc(t.gbNote) + '</td><td data-l="Минут">' + (t.minutes == null ? '? — ' : t.minutes + ' — ') + esc(t.minutesDir) + '</td>' +
            '<td data-l="SMS">' + (t.sms == null ? '?' : t.sms) + (t.smsPrice != null ? '; +' + t.smsPrice + ' ₸/дана' : '') + '</td><td class="n" data-l="Төлем">' + fmtMoney(t.price) + ' / ' + E.periodLabel(t.period) + '</td>' +
            '<td data-l="Акция">' + (t.promo ? t.promo.payments + ' × ' + fmtMoney(t.promo.price) : '—') + '</td><td data-l="Нақтылау">' + (t.unclear.length ? esc(t.unclear.join('; ')) : '—') + '</td>' +
            '<td data-l="Дереккөз"><a href="' + esc(t.source) + '" target="_blank" rel="noopener">[' + t.sourceNo + ']</a> ' + esc(t.checked) + '</td></tr>';
        }).join('') + '</tbody></table></div></div>';
      h += '<div class="card stack"><h3>Ресми дереккөздер</h3><ol class="checklist">' + D.SOURCES.map(function (s) { return '<li value="' + s[0] + '">' + esc(s[1]) + '. <a href="' + esc(s[2]) + '" target="_blank" rel="noopener">' + esc(s[2].replace(/^https:\/\//, '')) + '</a> (қаралған күні: 08.10.2026)</li>'; }).join('') + '</ol></div>';
      return h;
    }
  };

  /* ================= ЖОБА ТУРАЛЫ / ТАҒЫ ================= */
  SCREENS.about = {
    html: function () {
      return '<div class="screen-h"><span class="eyebrow">Жоба туралы</span><h2>Ауылдағы байланыс: ұялы байланыс тарифін таңдаудың математикалық моделі</h2></div>' +
        '<div class="card"><dl style="display:grid;grid-template-columns:minmax(0,10em) minmax(0,1fr);gap:8px 14px;margin:0">' +
        '<dt class="muted">Жоба авторы</dt><dd style="margin:0">Аманжолова Кәусар, 8 «А» сыныбы</dd>' +
        '<dt class="muted">Мектебі</dt><dd style="margin:0">«Ш. Уәлиханов атындағы орта мектебі» КММ</dd>' +
        '<dt class="muted">Ғылыми жетекшісі</dt><dd style="margin:0">Қайратқызы Назерке</dd>' +
        '<dt class="muted">Қолданба нұсқасы</dt><dd style="margin:0" class="mono">' + APP_VERSION + ' · тариф базасы ' + esc(D.TARIFF_BASE.version) + '</dd></dl></div>' +
        '<div class="card stack"><h3>Құпиялылық</h3><p class="small">Қолданбада сервер жоқ. Телефон нөмірі, есім, детализация жиналмайды. Енгізілген мәндер, профильдер мен шығын тарихы тек осы құрылғының браузерінде сақталады. Нұсқа жаңарғанда олар өшірілмейді.</p>' +
        '<p class="small">Орнатылғаннан кейін қолданба интернетсіз де ашылады: есептеу мен тариф базасы құрылғыда.</p><p class="small muted">Сақтау: ' + (S.available() ? 'құрылғы жадында' : 'уақытша (браузер сақтауды бұғаттаған)') + '</p></div>';
    }
  };
  SCREENS.more = {
    html: function () {
      return '<div class="screen-h"><span class="eyebrow">Тағы</span><h2>Қосымша бөлімдер</h2></div><nav class="menu">' +
        SUB.map(function (s) { return '<a href="#' + s[0] + '" data-r="' + s[0] + '"><b>' + s[1] + '</b><span class="small muted">' + s[2] + '</span></a>'; }).join('') + '</nav>';
    }
  };

  /* ================= PWA: орнату және жаңарту ================= */
  var deferredPrompt = null;
  window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); deferredPrompt = e; $('#installBtn').hidden = false; });
  $('#installBtn').onclick = function () { if (!deferredPrompt) return; deferredPrompt.prompt(); deferredPrompt.userChoice.then(function () { deferredPrompt = null; $('#installBtn').hidden = true; }); };
  window.addEventListener('appinstalled', function () { $('#installBtn').hidden = true; toast('Қолданба орнатылды'); });

  function showUpdate(reg) {
    if ($('#updBanner')) return;
    var b = document.createElement('div'); b.className = 'banner'; b.id = 'updBanner'; b.setAttribute('role', 'status');
    b.innerHTML = '<span style="flex:1;min-width:200px">Жаңа нұсқа дайын. Профильдер мен шығын тарихы сақталады.</span><button class="btn sm primary" type="button" id="updGo">Жаңарту</button><button class="btn sm ghost" type="button" id="updLater" style="color:#fff">Кейін</button>';
    document.body.appendChild(b);
    $('#updGo').onclick = function () { if (reg.waiting) reg.waiting.postMessage({ type: 'SKIP_WAITING' }); };
    $('#updLater').onclick = function () { b.remove(); };
  }
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').then(function (reg) {
        if (reg.waiting && navigator.serviceWorker.controller) showUpdate(reg);
        reg.addEventListener('updatefound', function () {
          var nw = reg.installing; if (!nw) return;
          nw.addEventListener('statechange', function () { if (nw.state === 'installed' && navigator.serviceWorker.controller) showUpdate(reg); });
        });
      }).catch(function () {});
      var reloaded = false;
      navigator.serviceWorker.addEventListener('controllerchange', function () { if (reloaded) return; reloaded = true; location.reload(); });
    });
  }
  S.requestPersist();

  /* ================= іске қосу ================= */
  buildNav();
  go(location.hash ? location.hash.slice(1) : 'home');
  window.__tarifApp = { compute: compute, go: go, version: APP_VERSION };
})();
