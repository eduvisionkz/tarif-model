/*
 * Есептеу қозғалтқышы — авторлық модель (негізгі жұмыс, 2.2-бөлім).
 *   Kг = Gт/G, Kм = Mт/M, Kс = Sт/S, Kн = Nт/N;  K = min(...)
 * Қажеттілігі 0 ресурс қатынасқа кірмейді (нөлге бөлінбейді).
 * Белгісіз тариф шамасы (null) 0-ге де, шексізге де теңестірілмейді — «нақтылау қажет».
 * Шешім дөңгелектелген санға емес, нақты мәнге сүйенеді.
 * Интерфейстен тәуелсіз: браузерде де, Node.js-те де (тесттер) жұмыс істейді.
 */
(function (root) {
  var MB_PER_GB = 1024;
  var PERIOD_LABEL = { month: 'ай', '30d': '30 күн' };
  var RES_KEYS = ['g', 'm', 's', 'n'];
  var RES = {
    g: { sym: 'Kг', name: 'интернет', letter: 'G', unit: 'ГБ' },
    m: { sym: 'Kм', name: 'минут', letter: 'M', unit: 'мин' },
    s: { sym: 'Kс', name: 'шығыс SMS', letter: 'S', unit: 'SMS' },
    n: { sym: 'Kн', name: 'нөмір', letter: 'N', unit: 'нөмір' }
  };
  var NET_LABEL = { yes: 'жұмыс істейді', weak: 'әлсіз', no: 'жұмыс істемейді', unknown: 'тексерілмеген' };

  /* ---------- форматтау ---------- */
  function grp(s) { return String(s).replace(/\B(?=(\d{3})+(?!\d))/g, ' '); }
  function fmtNum(x, maxDec) {
    if (x == null || !isFinite(x)) return '—';
    var dec = maxDec == null ? 3 : maxDec;
    var neg = x < 0; x = Math.abs(x);
    if (x > 0 && x < 0.1) dec = Math.max(dec, 4);
    var s = (Math.round(x * Math.pow(10, dec)) / Math.pow(10, dec)).toFixed(dec);
    if (s.indexOf('.') >= 0) s = s.replace(/0+$/, '').replace(/\.$/, '');
    var p = s.split('.');
    return (neg ? '−' : '') + grp(p[0]) + (p[1] ? ',' + p[1] : '');
  }
  function isExact(x) { return Math.abs(x * 1000 - Math.round(x * 1000)) < 1e-9; }
  function eqSign(x) { return isExact(x) ? '=' : '≈'; }
  function fmtMoney(n) { return n == null ? '—' : grp(String(Math.round(n))) + ' ₸'; }
  function periodLabel(p) { return PERIOD_LABEL[p] || p; }
  function tName(t) { return t.operator + ' «' + t.name + '»'; }
  function deficitText(k, d) {
    var v = fmtNum(d);
    if (k === 'g') return v + ' ГБ жетіспейді';
    if (k === 'm') return v + ' минут жетіспейді';
    if (k === 's') return v + ' SMS жетіспейді';
    return v + ' нөмір жетіспейді';
  }
  function toGB(value, unit) { return value == null ? null : (unit === 'MB' ? value / MB_PER_GB : value); }

  /* ---------- бір пакетті тексеру ----------
   * need: { g, m, s, n } — g ГБ-пен; null — енгізілмеген; 0 — қажет емес */
  function checkPackage(t, need) {
    var offer = { g: t.gb, m: t.minutes, s: t.sms, n: t.maxNumbers };
    var items = [], smsExtra = 0, smsExtraUnknown = false;
    RES_KEYS.forEach(function (k) {
      var nd = need[k];
      if (nd == null) { items.push({ k: k, missingInput: true }); return; }
      if (nd === 0) { items.push({ k: k, skipped: true, need: 0 }); return; }
      var of = offer[k];
      if (of == null) { items.push({ k: k, unknown: true, need: nd }); return; }
      var r = of / nd;
      var it = { k: k, need: nd, offer: of, r: r, ok: of >= nd, deficit: of < nd ? nd - of : 0 };
      if (k === 's' && !it.ok) {
        if (t.smsPrice != null) {
          it.paid = true; it.paidCount = nd - of; it.paidCost = (nd - of) * t.smsPrice; smsExtra += it.paidCost;
        } else {
          it.paidUnknown = true; smsExtraUnknown = true;
        }
      }
      items.push(it);
    });
    var ks = items.filter(function (i) { return i.r != null && !i.paid && !i.paidUnknown; });
    var K = ks.length ? Math.min.apply(null, ks.map(function (i) { return i.r; })) : null;
    var limiting = K == null ? [] : ks.filter(function (i) { return i.r === K; }).map(function (i) { return i.k; });
    return { t: t, need: need, offer: offer, items: items, K: K, limiting: limiting, smsExtra: smsExtra, smsExtraUnknown: smsExtraUnknown };
  }

  /* ---------- жоспарды бағалау ----------
   * spec: { id, kind, title, packages:[{label, pk, count}], notes }
   * ctx: { B, net: { [network]: 'yes'|'weak'|'no'|'unknown' } } */
  function evaluatePlan(spec, ctx) {
    var fails = [], unknowns = [], oks = [], steps = [], checks = [];
    var networks = [], periods = [], tariffs = [];
    var price = 0, priceParts = [], counts = {};
    spec.packages.forEach(function (p) {
      var t = p.pk.t;
      if (networks.indexOf(t.network) < 0) networks.push(t.network);
      if (periods.indexOf(t.period) < 0) periods.push(t.period);
      if (!counts[t.id]) { counts[t.id] = { t: t, c: 0 }; tariffs.push(t); }
      counts[t.id].c++;
    });
    tariffs.forEach(function (t) {
      var c = counts[t.id].c, sum = c * t.price; price += sum;
      priceParts.push({ label: (c > 1 ? c + ' × ' : '') + tName(t), expr: (c > 1 ? c + ' × ' + fmtMoney(t.price) + ' = ' : '') + fmtMoney(sum), amount: sum });
      (t.check || []).forEach(function (x) { if (checks.indexOf(x) < 0) checks.push(x); });
    });

    var K = null, missing = [];
    spec.packages.forEach(function (p) {
      var pk = p.pk, t = pk.t, pre = p.label ? p.label + ': ' : '';
      steps.push({ h: (p.label ? p.label + ' — ' : '') + tName(t) });
      var kList = [];
      pk.items.forEach(function (it) {
        var R = RES[it.k];
        if (it.missingInput) { if (missing.indexOf(R.letter) < 0) missing.push(R.letter); steps.push({ s: R.sym + ': ' + R.letter + ' енгізілмеген → тексерілмеді' }); return; }
        if (it.skipped) { steps.push({ s: R.sym + ': ' + R.letter + ' = 0, ' + R.name + ' қажет емес → есептелмейді' }); return; }
        if (it.unknown) {
          var what = it.k === 'g' ? t.gbNote : it.k === 'm' ? t.minutesDir : it.k === 'n' ? 'қатысушы саны расталмаған' : 'жарияланбаған';
          unknowns.push(pre + R.name + ' бойынша тариф шамасы белгісіз (' + what + ')');
          steps.push({ s: R.sym + ': тарифтегі ' + R.name + ' белгісіз → коэффициент есептелмейді' });
          return;
        }
        var base = R.sym + ' = ' + fmtNum(it.offer) + ' / ' + fmtNum(it.need) + ' ' + eqSign(it.r) + ' ' + fmtNum(it.r);
        if (it.paid) {
          steps.push({ s: base + '; пакеттен тыс ' + fmtNum(it.paidCount) + ' SMS ақылы: ' + fmtNum(it.paidCount) + ' × ' + fmtMoney(t.smsPrice) + ' = ' + fmtMoney(it.paidCost) });
          oks.push(pre + 'SMS ақылы түрде есептелді: +' + fmtMoney(it.paidCost));
          return;
        }
        if (it.paidUnknown) {
          steps.push({ s: base + '; пакеттен тыс SMS бағасы белгісіз' });
          unknowns.push(pre + fmtNum(it.deficit) + ' SMS пакетке кірмейді, ал оның бағасы белгісіз');
          return;
        }
        kList.push(it.r);
        if (it.ok) steps.push({ s: base + ' ≥ 1 ✓' });
        else {
          steps.push({ s: base + ' < 1 → ' + fmtNum(it.need) + ' − ' + fmtNum(it.offer) + ' = ' + deficitText(it.k, it.deficit) });
          fails.push(pre + deficitText(it.k, it.deficit) + ' (' + R.sym + ' ' + eqSign(it.r) + ' ' + fmtNum(it.r) + ')');
        }
      });
      if (pk.K != null) {
        steps.push({ s: 'K = min(' + kList.map(function (x) { return fmtNum(x); }).join('; ') + ') ' + eqSign(pk.K) + ' ' + fmtNum(pk.K) + (pk.K >= 1 ? ' ≥ 1' : ' < 1'), strong: true });
        K = K == null ? pk.K : Math.min(K, pk.K);
      }
    });
    missing.forEach(function (l) { unknowns.push(l + ' енгізілмеген (бос өріс — дерек жоқ)'); });

    var smsTotal = 0, smsUnknown = false;
    spec.packages.forEach(function (p) { smsTotal += p.pk.smsExtra; if (p.pk.smsExtraUnknown) smsUnknown = true; });
    if (smsTotal > 0) { price += smsTotal; priceParts.push({ label: 'Ақылы SMS', expr: fmtMoney(smsTotal), amount: smsTotal }); }
    var priceKnown = !smsUnknown;

    steps.push({ h: 'Толық баға' });
    steps.push({ s: 'Pтолық = ' + priceParts.map(function (x) { return fmtMoney(x.amount); }).join(' + ') + (priceParts.length > 1 ? ' = ' + fmtMoney(price) : '') + (priceKnown ? '' : ' + (белгісіз SMS шығыны)'), strong: true });

    var budget = null;
    if (ctx.B != null) {
      budget = { B: ctx.B, ok: price <= ctx.B, diff: Math.abs(ctx.B - price) };
      if (!budget.ok) { steps.push({ s: 'Pтолық ≤ B орындалмайды: ' + fmtMoney(price) + ' > ' + fmtMoney(ctx.B) }); fails.push('Бюджеттен ' + fmtMoney(budget.diff) + ' асады (' + fmtMoney(price) + ' > ' + fmtMoney(ctx.B) + ')'); }
      else if (!priceKnown) { steps.push({ s: 'Белгілі бөлігі: ' + fmtMoney(price) + ' ≤ ' + fmtMoney(ctx.B) + ', бірақ толық баға белгісіз' }); unknowns.push('Толық баға белгісіз, сондықтан бюджетке сыйятыны расталмады'); }
      else { steps.push({ s: 'Pтолық ≤ B: ' + fmtMoney(price) + ' ≤ ' + fmtMoney(ctx.B) + ' ✓' }); oks.push('Бюджетке сыяды' + (budget.diff ? ': ' + fmtMoney(budget.diff) + ' қалады' : ': P = B, шекаралық жағдай')); }
    } else steps.push({ s: 'Бюджет енгізілмеген → Pтолық ≤ B тексерілмеді' });

    steps.push({ h: 'Желі (пайдаланушы белгісі)' });
    var netPending = [];
    networks.forEach(function (nw) {
      var st = (ctx.net && ctx.net[nw]) || 'unknown';
      steps.push({ s: nw + ': ' + NET_LABEL[st] });
      if (st === 'no') fails.push(nw + ' желісі қажетті жерде жұмыс істемейді (сіздің белгіңіз)');
      else if (st === 'yes') oks.push(nw + ' желісі жұмыс істейді (сіздің белгіңіз)');
      else netPending.push({ nw: nw, st: st });
    });
    netPending.forEach(function (x) {
      unknowns.push(x.st === 'weak' ? x.nw + ' желісі әлсіз деп белгіленген — сапасын өзіңіз тексеріңіз' : x.nw + ' желісі қажетті жерде тексерілмеген');
    });

    if (K != null && K >= 1 && !fails.length) oks.unshift('Белгілі ресурстар жеткілікті: K ' + eqSign(K) + ' ' + fmtNum(K) + ' ≥ 1');
    var status = fails.length ? 'fail' : (unknowns.length ? 'unclear' : 'ok');
    /* «Сандық сәйкес»: ресурс пен баға расталған, тек желі тексерілмеген не әлсіз */
    var numericOk = !fails.length && unknowns.length === netPending.length && netPending.length > 0;

    var limiting = [];
    spec.packages.forEach(function (p) {
      if (p.pk.K != null && K != null && p.pk.K === K) p.pk.limiting.forEach(function (k) { if (limiting.indexOf(k) < 0) limiting.push(k); });
    });
    return {
      id: spec.id, kind: spec.kind, title: spec.title, networks: networks, tariffs: tariffs, counts: counts,
      packages: spec.packages, K: K, limiting: limiting, price: price, priceKnown: priceKnown, priceParts: priceParts,
      periods: periods, periodText: periods.length === 1 ? periodLabel(periods[0]) : periods.map(periodLabel).join(' + ') + ' (кезеңдер әртүрлі)',
      budget: budget, status: status, numericOk: numericOk, fails: fails, unknowns: unknowns, oks: oks,
      notes: (spec.notes || []).slice(), checks: checks, steps: steps, netPending: netPending,
      gbTotal: spec.packages.reduce(function (a, p) { return a + (p.pk.offer.g || 0); }, 0)
    };
  }

  function sumField(list, f) { var s = 0; for (var i = 0; i < list.length; i++) { if (list[i][f] == null) return null; s += list[i][f]; } return s; }
  function personLabel(p, i) { return (i + 1) + '-адам' + (p.label ? ' (' + p.label + ')' : ''); }

  /* ---------- барлық нұсқаларды құру ----------
   * input.mode = 'single': { G, M, S, B, net, typeFilter }  (G — ГБ)
   * input.mode = 'multi':  { persons:[{label,G,M,S}], B, net, combos }
   * tariffs — тарифтер массиві */
  function buildPlans(input, tariffs) {
    var ctx = { B: input.B == null ? null : input.B, net: input.net || {} };
    var plans = [];
    if (input.mode === 'single') {
      var need = { g: input.G, m: input.M, s: input.S, n: 1 };
      tariffs.forEach(function (t) {
        if (input.typeFilter && input.typeFilter !== 'all' && t.type !== input.typeFilter) return;
        plans.push(evaluatePlan({ id: t.id, kind: t.type === 'family' ? 'familySingle' : 'single', title: tName(t), packages: [{ label: '', pk: checkPackage(t, need) }] }, ctx));
      });
      return plans;
    }
    var P = input.persons || [], n = P.length;
    if (!n) return plans;
    var agg = { g: sumField(P, 'G'), m: sumField(P, 'M'), s: sumField(P, 'S'), n: n };
    tariffs.filter(function (t) { return t.type === 'family'; }).forEach(function (t) {
      plans.push(evaluatePlan({ id: t.id, kind: 'family', title: tName(t),
        packages: [{ label: 'Ортақ пакет (' + n + ' адам)', pk: checkPackage(t, agg) }],
        notes: ['Ортақ пакет: интернет, минут және SMS қажеттілігі қосылды (ΣG, ΣM, ΣS)'] }, ctx));
    });
    tariffs.filter(function (t) { return t.type === 'individual'; }).forEach(function (t) {
      plans.push(evaluatePlan({ id: 'pp-' + t.id, kind: 'perPerson', title: (n > 1 ? n + ' × ' : '') + tName(t),
        packages: P.map(function (p, i) { return { label: personLabel(p, i), pk: checkPackage(t, { g: p.G, m: p.M, s: p.S, n: 1 }) }; }),
        notes: ['Жеке тарифтер: әр адамның пакеті бөлек тексерілді, ресурстар адамдар арасында қосылмайды; бағалар қосылды'] }, ctx));
    });
    if (input.combos) {
      tariffs.filter(function (t) { return t.type === 'family' && t.maxNumbers != null && t.maxNumbers < n && n - t.maxNumbers <= 2; }).forEach(function (F) {
        var famP = P.slice(0, F.maxNumbers), rest = P.slice(F.maxNumbers);
        var famNeed = { g: sumField(famP, 'G'), m: sumField(famP, 'M'), s: sumField(famP, 'S'), n: famP.length };
        tariffs.filter(function (t) { return t.type === 'individual'; }).forEach(function (I) {
          plans.push(evaluatePlan({ id: 'combo-' + F.id + '-' + I.id, kind: 'combo',
            title: tName(F) + ' + ' + (rest.length > 1 ? rest.length + ' × ' : '') + tName(I),
            packages: [{ label: '1–' + F.maxNumbers + '-адам (ортақ)', pk: checkPackage(F, famNeed) }].concat(rest.map(function (p, j) { return { label: personLabel(p, F.maxNumbers + j) + ' (жеке)', pk: checkPackage(I, { g: p.G, m: p.M, s: p.S, n: 1 }) }; })),
            notes: ['Аралас нұсқа: отбасылық топқа алғашқы ' + F.maxNumbers + ' адам, қалғаны жеке тарифке. Құрылымдар әртүрлі, әр желі бөлек тексеріледі'] }, ctx));
        });
      });
    }
    return plans;
  }

  function groupPlans(plans) {
    var byPrice = function (a, b) { return a.price - b.price || b.gbTotal - a.gbTotal; };
    return {
      ok: plans.filter(function (p) { return p.status === 'ok'; }).sort(byPrice),
      unclear: plans.filter(function (p) { return p.status === 'unclear'; }).sort(function (a, b) { return (b.numericOk - a.numericOk) || byPrice(a, b); }),
      fail: plans.filter(function (p) { return p.status === 'fail'; }).sort(function (a, b) { return ((b.K == null ? -1 : b.K) - (a.K == null ? -1 : a.K)) || byPrice(a, b); })
    };
  }

  /* ---------- қысқа ұсыныс ---------- */
  function summarize(groups) {
    if (groups.ok.length) {
      var best = groups.ok[0], same = groups.ok.filter(function (p) { return p.periods.join() === best.periods.join(); });
      var other = groups.ok.filter(function (p) { return p.periods.join() !== best.periods.join(); });
      return { kind: 'ok', plan: best,
        text: 'Барлық тексерілген шарттан өткен ' + groups.ok.length + ' нұсқа бар. Толық бағасы ең төмені — ' + best.title + ': ' + fmtMoney(best.price) + ' / ' + best.periodText + '.',
        periodNote: other.length ? 'Сәйкес нұсқалардың төлем кезеңі әртүрлі (ай және 30 күн): бір төлемнің бағасы ғана салыстырылды.' : '' };
    }
    var numeric = groups.unclear.filter(function (p) { return p.numericOk; });
    if (numeric.length) {
      var b = numeric[0];
      return { kind: 'numeric', plan: b,
        text: 'Түпкілікті ұсыныс жоқ: желі тексерілмеген. Сандық шарттар бойынша ең арзаны — ' + b.title + ': ' + fmtMoney(b.price) + ' / ' + b.periodText + '. Қосылмас бұрын ' + b.netPending.map(function (x) { return x.nw; }).join(', ') + ' желісін өз мекеніңізде тексеріңіз.' };
    }
    if (groups.unclear.length) return { kind: 'unclear', plan: null, text: 'Түпкілікті шешім жоқ: ресурсы жетпейтін тарифтер шығарылды, ал қалғандарының маңызды дерегі белгісіз. Төмендегі «Нақтылау қажет» тобын қараңыз.' };
    return { kind: 'none', plan: null, text: 'Енгізілген талаптардың бәрін орындайтын тариф табылмады. Әр тарифке не жетпейтіні төменде санмен көрсетілген. Қолданба талаптарыңызды өздігінен төмендетпейді.' };
  }

  /* ---------- 12 төлем ---------- */
  function payments12(t, count, extraPerPayment) {
    count = count || 1; extraPerPayment = extraPerPayment || 0;
    var promoN = t.promo ? Math.min(12, t.promo.payments) : 0;
    var first = promoN * (t.promo ? t.promo.price : 0);
    var rest = (12 - promoN) * t.price;
    var one = first + rest;
    return { promoN: promoN, promoPrice: t.promo ? t.promo.price : null, restN: 12 - promoN, first: first, rest: rest,
      perNumber: one, count: count, extra: 12 * extraPerPayment, total: one * count + 12 * extraPerPayment, period: t.period,
      days: t.period === '30d' ? 360 : null };
  }

  /* ---------- шығын тарихы ---------- */
  function historyStats(values, reservePct) {
    var v = values.filter(function (x) { return x != null && isFinite(x); });
    if (!v.length) return null;
    var sum = v.reduce(function (a, b) { return a + b; }, 0), avg = sum / v.length, max = Math.max.apply(null, v);
    var q = 1 + (reservePct || 0) / 100;
    return { n: v.length, sum: sum, avg: avg, max: max,
      needAvg: Math.ceil(avg * q - 1e-9), needMax: Math.ceil(max * q - 1e-9) };
  }

  function maxSms(t, B) {
    if (t.smsPrice == null || !t.smsPrice) return null;
    if (B < t.price) return -1;
    return Math.floor((B - t.price) / t.smsPrice + 1e-9) + (t.sms || 0);
  }

  var api = { MB_PER_GB: MB_PER_GB, RES: RES, RES_KEYS: RES_KEYS, NET_LABEL: NET_LABEL, PERIOD_LABEL: PERIOD_LABEL,
    grp: grp, fmtNum: fmtNum, fmtMoney: fmtMoney, eqSign: eqSign, periodLabel: periodLabel, tName: tName, deficitText: deficitText, toGB: toGB,
    checkPackage: checkPackage, evaluatePlan: evaluatePlan, buildPlans: buildPlans, groupPlans: groupPlans, summarize: summarize,
    payments12: payments12, historyStats: historyStats, maxSms: maxSms, sumField: sumField };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TariffEngine = api;
})(this);
