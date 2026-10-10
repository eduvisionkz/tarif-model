/* Есептеу қозғалтқышын негізгі жұмыстың есептерімен тексеру.
 * Іске қосу:  node tests/engine.test.cjs
 */
const E = require('../js/engine.js');
const D = require('../js/tariffs.js');
const T = D.TARIFFS;
const ALL_YES = { 'Beeline': 'yes', 'Kcell/activ': 'yes', 'Tele2/Altel': 'yes', 'IZI': 'yes' };

const results = [];
function near(a, b) { return a != null && Math.abs(a - b) < 1e-9; }
function check(code, title, expected, fn) {
  let actual = '', pass = false;
  try { const r = fn(); actual = r.actual; pass = !!r.pass; } catch (e) { actual = 'ҚАТЕ: ' + e.message; }
  results.push({ code, title, expected, actual, pass });
}
const pick = (plans, id) => plans.find(p => p.id === id);
const single = (G, M, S, B, net, tariffs) => E.buildPlans({ mode: 'single', G, M, S, B, net: net || ALL_YES, typeFilter: 'all' }, tariffs || T);
const three = T.filter(t => ['izi-ultra-boost', 'altel-erkin', 'altel-erkin-plus'].includes(t.id));
const persons = (n, G, M, S) => Array.from({ length: n }, () => ({ label: '', G, M, S }));

check('1', '40 ГБ, 100 мин, 0 SMS, бюджет жеткілікті (6 000 ₸)', 'IZI ✗ 5 ГБ; Еркін ✗ 15 ГБ; Еркін+ ✓ K = 1', () => {
  const p = single(40, 100, 0, 6000); const i = pick(p, 'izi-ultra-boost'), e = pick(p, 'altel-erkin'), ep = pick(p, 'altel-erkin-plus');
  const gi = i.packages[0].pk.items[0], ge = e.packages[0].pk.items[0];
  return { actual: `IZI K=${E.fmtNum(i.K)} ${i.status}, ${E.fmtNum(gi.deficit)} ГБ; Еркін K=${E.fmtNum(e.K)} ${e.status}, ${E.fmtNum(ge.deficit)} ГБ; Еркін+ K=${E.fmtNum(ep.K)} ${ep.status}`,
    pass: near(i.K, .875) && i.status === 'fail' && near(gi.deficit, 5) && near(e.K, .625) && e.status === 'fail' && near(ge.deficit, 15) && near(ep.K, 1) && ep.status === 'ok' };
});
check('2', '25 ГБ, 150 мин', 'Еркін: 50 минут жетіспейді', () => {
  const p = single(25, 150, 0, null); const e = pick(p, 'altel-erkin'); const m = e.packages[0].pk.items[1];
  return { actual: `Еркін K=${E.fmtNum(e.K)}; ${e.fails[0]}`, pass: near(m.deficit, 50) && e.status === 'fail' && near(e.K, 100 / 150) };
});
check('3', '35 ГБ, 200 мин, B = 3 690 ₸', 'IZI: K = 1, P = B — шекаралық сәйкестік', () => {
  const p = single(35, 200, 0, 3690); const i = pick(p, 'izi-ultra-boost');
  return { actual: `IZI K=${E.fmtNum(i.K)}, P=${E.fmtMoney(i.price)}, ${i.status}`, pass: near(i.K, 1) && i.status === 'ok' && i.budget.ok && i.budget.diff === 0 };
});
check('4', '35 ГБ, 200 мин, B = 3 689 ₸', 'IZI бюджеттен 1 ₸ асады', () => {
  const p = single(35, 200, 0, 3689); const i = pick(p, 'izi-ultra-boost');
  const g = E.groupPlans(p.filter(x => three.some(t => t.id === x.id)));
  return { actual: `IZI ${i.status}: ${i.fails.join('; ')}; үш тарифтің сәйкесі: ${g.ok.length}`, pass: i.status === 'fail' && i.budget.diff === 1 && g.ok.length === 0 };
});
check('5', '40 ГБ, 100 мин, B = 5 000 ₸', 'Еркін+ ресурс жетеді, бюджеттен 490 ₸ асады', () => {
  const p = single(40, 100, 0, 5000); const ep = pick(p, 'altel-erkin-plus');
  return { actual: `Еркін+ K=${E.fmtNum(ep.K)}, ${ep.status}: ${ep.fails.join('; ')}`, pass: near(ep.K, 1) && ep.status === 'fail' && ep.budget.diff === 490 };
});
check('6', '40 МБ', 'G = 40/1024 ГБ; Еркін Kг = 640', () => {
  const G = E.toGB(40, 'MB'); const e = pick(single(G, 100, 0, null), 'altel-erkin');
  return { actual: `G=${E.fmtNum(G, 7)} ГБ; Kг=${E.fmtNum(e.packages[0].pk.items[0].r)}`, pass: near(G, 40 / 1024) && near(e.packages[0].pk.items[0].r, 640) };
});
check('7', '6 адам, ортақ 200 ГБ, 300 мин', 'Beeline х6: Kн = 1, Kг = 1,8, Kм = 2, K = 1', () => {
  const ps = persons(6, 200 / 6, 50, 0);
  const x6 = pick(E.buildPlans({ mode: 'multi', persons: ps, B: null, net: ALL_YES }, T), 'beeline-x6');
  const it = x6.packages[0].pk.items;
  return { actual: `Kг=${E.fmtNum(it[0].r)}, Kм=${E.fmtNum(it[1].r)}, Kн=${E.fmtNum(it[3].r)}, K=${E.fmtNum(x6.K)}, шектеуші: ${x6.limiting.map(k => E.RES[k].name)}`,
    pass: near(it[0].r, 1.8) && near(it[1].r, 2) && near(it[3].r, 1) && near(x6.K, 1) && x6.limiting.includes('n') && x6.price === 23999 };
});
check('8', 'IZI, 10 шығыс SMS', '3 690 + 10 × 18 = 3 870 ₸', () => {
  const i = pick(single(25, 100, 10, null), 'izi-ultra-boost');
  return { actual: `${i.priceParts.map(x => E.fmtMoney(x.amount)).join(' + ')} = ${E.fmtMoney(i.price)} (${i.status})`, pass: i.price === 3870 && i.status === 'ok' };
});
check('9', 'Белгісіз шек және тексерілмеген желі', 'Tele2 → нақтылау қажет; желі тексерілмесе Еркін+ сәйкес болып шықпайды', () => {
  const p = single(40, 100, 0, 6000, {}); const t2 = pick(p, 'tele2-all'), ep = pick(p, 'altel-erkin-plus');
  const p2 = single(40, 100, 0, 6000); const t2b = pick(p2, 'tele2-all');
  const s = E.summarize(E.groupPlans(p));
  return { actual: `Tele2: ${t2b.status} (желі расталса да); Еркін+ желісіз: ${ep.status}, numericOk=${ep.numericOk}; қорытынды: ${s.kind}`,
    pass: t2b.status === 'unclear' && t2.status === 'unclear' && ep.status === 'unclear' && ep.numericOk && s.kind === 'numeric' };
});
check('9а', '«Әлсіз» желі', 'Түпкілікті «сәйкес» болмайды', () => {
  const ep = pick(single(40, 100, 0, 6000, Object.assign({}, ALL_YES, { 'Tele2/Altel': 'weak' })), 'altel-erkin-plus');
  return { actual: `Еркін+: ${ep.status}; ${ep.unknowns.join('; ')}`, pass: ep.status === 'unclear' };
});
check('9ә', '«Жұмыс істемейді» желі', 'Тариф «сәйкес емес»', () => {
  const ep = pick(single(40, 100, 0, 6000, Object.assign({}, ALL_YES, { 'Tele2/Altel': 'no' })), 'altel-erkin-plus');
  return { actual: `Еркін+: ${ep.status}`, pass: ep.status === 'fail' };
});
check('10', '12 модельдік сұраныс: G ∈ {20,30,35,40}, M ∈ {50,100,150}, B = 6 000 ₸, желі жарамды', '9 жағдайда IZI; 40 ГБ-та 3 жағдайда IZI-ге 5 ГБ жетпейді, Еркін+', () => {
  let izi = 0, erk = 0, short5 = 0; const rows = [];
  [20, 30, 35, 40].forEach(G => [50, 100, 150].forEach(M => {
    const p = single(G, M, 0, 6000, ALL_YES, three); const g = E.groupPlans(p); const best = g.ok[0];
    const i = pick(p, 'izi-ultra-boost');
    if (best && best.id === 'izi-ultra-boost') izi++;
    if (best && best.id === 'altel-erkin-plus') erk++;
    if (i.status === 'fail' && near(i.packages[0].pk.items[0].deficit, 5)) short5++;
    rows.push(`${G}/${M}:${best ? best.tariffs[0].name : '—'}`);
  }));
  return { actual: `IZI ${izi}, Еркін+ ${erk}, IZI-ге 5 ГБ жетпеген: ${short5}`, pass: izi === 9 && erk === 3 && short5 === 3 };
});
check('11', 'M = 201 мин, 35 ГБ', 'Үш тарифтің ешқайсысы өтпейді', () => {
  const g = E.groupPlans(single(35, 201, 0, 6000, ALL_YES, three));
  return { actual: `сәйкес: ${g.ok.length}, сәйкес емес: ${g.fail.length}`, pass: g.ok.length === 0 && g.fail.length === 3 };
});
check('12', '2, 4, 6 адам × (20 ГБ, 100 мин): Beeline vs n × IZI', 'Айырма 8 619; 5 239; 1 859 ₸', () => {
  const out = []; let ok = true; const exp = { 2: 8619, 4: 5239, 6: 1859 };
  [2, 4, 6].forEach(n => {
    const p = E.buildPlans({ mode: 'multi', persons: persons(n, 20, 100, 0), B: null, net: ALL_YES }, T);
    const fam = pick(p, 'beeline-x' + n), ind = pick(p, 'pp-izi-ultra-boost');
    out.push(`${n}: ${E.fmtMoney(fam.price - ind.price)}`);
    if (fam.price - ind.price !== exp[n] || fam.status !== 'ok' || ind.status !== 'ok') ok = false;
  });
  return { actual: out.join('; '), pass: ok };
});
check('13', '5 адам: х4 + IZI және х6', '23 689 ₸; 23 999 ₸; х4 жалғыз: 1 нөмір жетіспейді', () => {
  const p = E.buildPlans({ mode: 'multi', persons: persons(5, 20, 100, 0), B: null, net: ALL_YES, combos: true }, T);
  const c = pick(p, 'combo-beeline-x4-izi-ultra-boost'), x6 = pick(p, 'beeline-x6'), x4 = pick(p, 'beeline-x4');
  return { actual: `${E.fmtMoney(c.price)} (${c.status}); ${E.fmtMoney(x6.price)}; х4: ${x4.fails.join('; ')}`,
    pass: c.price === 23689 && c.status === 'ok' && x6.price === 23999 && x4.status === 'fail' && /1 нөмір жетіспейді/.test(x4.fails.join()) };
});
check('14', 'Жеке пакеттер ортақ қорға айналмайды', '2 адам: 50 ГБ + 10 ГБ → IZI-де 1-адамға 15 ГБ жетпейді (жиыны 60 ≤ 70 болса да)', () => {
  const p = E.buildPlans({ mode: 'multi', persons: [{ label: '', G: 50, M: 10, S: 0 }, { label: '', G: 10, M: 10, S: 0 }], B: null, net: ALL_YES }, T);
  const i = pick(p, 'pp-izi-ultra-boost');
  return { actual: `${i.status}: ${i.fails.join('; ')}`, pass: i.status === 'fail' && /15 ГБ жетіспейді/.test(i.fails.join()) };
});
check('15', '12 төлем', 'Tele2: 68 280 және 89 880 ₸; Altel «Моя семья 7»: 219 270 ₸', () => {
  const f = id => E.payments12(T.find(t => t.id === id)).total;
  return { actual: `${E.fmtMoney(f('tele2-all'))}; ${E.fmtMoney(f('tele2-full'))}; ${E.fmtMoney(f('altel-family-7'))}`, pass: f('tele2-all') === 68280 && f('tele2-full') === 89880 && f('altel-family-7') === 219270 };
});
check('16', 'Шығын тарихы: 18, 24, 30 ГБ, қор 15%', 'Орташа 24 → 28 ГБ; ең көп 30 → 35 ГБ', () => {
  const s = E.historyStats([18, 24, 30], 15);
  return { actual: `орташа ${E.fmtNum(s.avg)} → ${s.needAvg}; ең көп ${s.max} → ${s.needMax}`, pass: near(s.avg, 24) && s.needAvg === 28 && s.max === 30 && s.needMax === 35 };
});
check('17', 'IZI, B = 4 000 ₸', 'Ең көбі 17 SMS (3 996 ₸); 18 SMS = 4 014 ₸ — бюджеттен асады', () => {
  const izi = T.find(t => t.id === 'izi-ultra-boost');
  const a = pick(single(25, 100, 17, 4000), 'izi-ultra-boost'), b = pick(single(25, 100, 18, 4000), 'izi-ultra-boost');
  return { actual: `max=${E.maxSms(izi, 4000)}; 17 → ${E.fmtMoney(a.price)} ${a.status}; 18 → ${E.fmtMoney(b.price)} ${b.status}`, pass: E.maxSms(izi, 4000) === 17 && a.price === 3996 && a.status === 'ok' && b.price === 4014 && b.status === 'fail' };
});
check('18', 'SMS бағасы белгісіз тариф, S > 0', 'Altel «Еркін+» → нақтылау қажет (SMS ойдан толтырылмайды)', () => {
  const ep = pick(single(40, 100, 5, 6000), 'altel-erkin-plus');
  return { actual: `${ep.status}: ${ep.unknowns.join('; ')}`, pass: ep.status === 'unclear' };
});
check('19', 'Бос өріс пен нөл', 'G бос → нақтылау қажет; G = 0 → интернет тексерілмейді', () => {
  const a = pick(single(null, 100, 0, null), 'izi-ultra-boost'), b = pick(single(0, 100, 0, null), 'izi-ultra-boost');
  return { actual: `бос: ${a.status}; нөл: ${b.status}, K=${E.fmtNum(b.K)}`, pass: a.status === 'unclear' && b.status === 'ok' && near(b.K, 1) };
});
check('20', 'Қосымша 50 ГБ пакет', 'Автоматты қосылмайды: 6 адам 400 ГБ → х6 сәйкес емес, 40 ГБ жетіспейді', () => {
  const p = E.buildPlans({ mode: 'multi', persons: persons(6, 400 / 6, 500 / 6, 0), B: null, net: ALL_YES }, T);
  const x6 = pick(p, 'beeline-x6'); const addonPlans = p.filter(x => /addon/.test(x.id));
  return { actual: `х6 ${x6.status}: ${x6.fails.join('; ')}; қосымша пакетті жоспарлар: ${addonPlans.length}`, pass: x6.status === 'fail' && /40 ГБ жетіспейді/.test(x6.fails.join()) && addonPlans.length === 0 };
});

const failed = results.filter(r => !r.pass);
results.forEach(r => console.log((r.pass ? 'PASS' : 'FAIL') + '  [' + r.code + '] ' + r.title + '\n      күтілген: ' + r.expected + '\n      шықты:    ' + r.actual));
console.log('\n' + (results.length - failed.length) + ' / ' + results.length + ' сценарий өтті');
if (typeof module !== 'undefined') module.exports = results;
if (require.main === module && failed.length) process.exit(1);
