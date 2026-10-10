/* Браузердегі әрекеттерді тексеру (Playwright + Chromium).
 * Іске қосу:
 *   python3 -m http.server 8099   (жоба қалтасында, бөлек терминалда)
 *   node tests/ui.test.cjs [http://localhost:8099/] [скриншот-қалтасы]
 */
const { chromium } = require('playwright');
const BASE = process.argv[2] || 'http://localhost:8099/';
const SHOTS = process.argv[3] || null;
const results = [];
function rec(name, pass, info) { results.push({ name, pass: !!pass, info: info || '' }); console.log((pass ? 'PASS' : 'FAIL') + '  ' + name + (info ? '  — ' + info : '')); }

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
  const ctx = await browser.newContext({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, acceptDownloads: true, locale: 'kk-KZ' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  const noOverflow = async () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
  const shot = async n => { if (SHOTS) await page.screenshot({ path: SHOTS + '/' + n + '.png', fullPage: true }); };

  await page.goto(BASE + '#home'); await page.waitForSelector('.hero');
  rec('Басты экран ашылды, база күні көрінеді', (await page.textContent('.hero')).includes('08.10.2026'));
  rec('Телефон енінде көлденең жылжу жоқ (басты)', await noOverflow());
  await shot('01-home-phone');

  // 1-сценарий: 40 ГБ, 100 мин, 0 SMS, B = 6000, желі расталған
  await page.click('.hero a[data-r="pick"]');
  await page.fill('#f-G', '40'); await page.fill('#f-M', '100'); await page.fill('#f-S', '0'); await page.fill('#f-B', '6000');
  for (let i = 0; i < 4; i++) await page.selectOption('#net-' + i, 'yes');
  const sticky = await page.textContent('#stickyBar');
  rec('Енгізгенде нәтиже бірден есептеледі (sticky жолақ)', /сәйкес/.test(sticky), sticky.trim());
  rec('Телефон енінде көлденең жылжу жоқ (форма)', await noOverflow());
  await shot('02-pick-phone');
  await page.click('#stickyBar a');
  await page.waitForSelector('.summary');
  const sum1 = await page.textContent('.summary .big');
  rec('40 ГБ / 100 мин: ең арзан сәйкес — Altel «Еркін+»', sum1.includes('Еркін+'), sum1);
  const iziCard = await page.locator('.rcard', { hasText: 'ULTRA BOOST' }).first().textContent();
  rec('IZI картасында «5 ГБ жетіспейді»', iziCard.includes('5 ГБ жетіспейді'));
  await page.locator('.rcard.top details.more summary').first().click();
  rec('Қадамдап есептеу ашылады', await page.locator('.rcard.top .stepbox').first().isVisible());
  await shot('03-result-phone');

  // CSV
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#xCsv')]);
  const fs = require('fs'); const p = await dl.path(); const csv = fs.readFileSync(p, 'utf8');
  rec('CSV жүктеледі: талаптар, база күні, нәтиже, себептер', csv.charCodeAt(0) === 0xFEFF && csv.includes('08.10.2026') && csv.includes('G, интернет') && csv.includes('Еркін+') && csv.includes('5 ГБ жетіспейді'), dl.suggestedFilename());

  // Желі тексерілмеген → түпкілікті ұсыныс жоқ
  await page.goto(BASE + '#pick');
  for (let i = 0; i < 4; i++) await page.selectOption('#net-' + i, 'unknown');
  await page.goto(BASE + '#result'); await page.waitForSelector('.summary');
  const sum2 = await page.textContent('.summary .big');
  rec('Желі тексерілмесе түпкілікті ұсыныс жоқ', sum2.includes('Түпкілікті ұсыныс жоқ') && sum2.includes('Еркін+'), sum2.slice(0, 90));

  // МБ ескертуі
  await page.goto(BASE + '#pick');
  await page.selectOption('#f-Gu', 'MB');
  rec('40 МБ енгізгенде «МБ бірлігі дұрыс па?» ескертуі', await page.locator('#f-G-warn').isVisible());
  await page.selectOption('#f-Gu', 'GB');
  await page.fill('#f-M', '-5');
  rec('Теріс сан қабылданбайды', (await page.textContent('#f-M-err')).includes('Теріс'));
  await page.fill('#f-M', '100');

  // Бірнеше адам: 5 адам × 20 ГБ / 100 мин, аралас нұсқалар
  await page.click('[data-mode="multi"]');
  while (await page.locator('.person').count() < 5) await page.click('#addP');
  for (let i = 0; i < 5; i++) { await page.fill('#p' + i + '-G', '20'); await page.fill('#p' + i + '-M', '100'); await page.fill('#p' + i + '-S', '0'); }
  for (let i = 0; i < 4; i++) await page.selectOption('#net-' + i, 'yes');
  await page.goto(BASE + '#result'); await page.waitForSelector('.summary');
  const multiText = await page.textContent('#view');
  rec('5 адам: х4 + IZI = 23 689 ₸ нұсқасы көрінеді', multiText.includes('Премиум Семья х4» + Altel') || multiText.includes('23 689'));
  rec('5 адам: х4 жалғыз — «1 нөмір жетіспейді»', multiText.includes('1 нөмір жетіспейді'));
  await shot('04-multi-phone');

  // Шығын тарихы
  await page.goto(BASE + '#history');
  rec('Тарих әдепкіде бос (ойдан дерек жоқ)', (await page.textContent('#hStats')).includes('Тарих бос'));
  for (const v of ['18', '24', '30']) { await page.click('#hAdd'); const n = await page.locator('.hrow:not(.hrow-h)').count(); await page.fill('#h' + (n - 1) + '-G', v); await page.fill('#h' + (n - 1) + '-M', '100'); }
  const st = await page.textContent('#hStats');
  rec('Тарих: орташа 24 ГБ, 15% қормен 28 ГБ', st.includes('28') && st.includes('24'));
  await page.click('[data-hm="max"]');
  rec('Тарих: ең көп ай әдісі → 35 ГБ', (await page.textContent('#hStats')).includes('35'));
  await shot('05-history-phone');
  await page.click('[data-hm="avg"]');
  await page.click('#hMove');
  await page.waitForSelector('#f-G');
  rec('Тарих формаға көшірілді (G = 28)', (await page.inputValue('#f-G')) === '28');

  // Профильдер
  await page.goto(BASE + '#profiles');
  await page.fill('#pName', 'Тест профилі'); await page.click('#pAdd');
  await page.reload(); await page.goto(BASE + '#profiles');
  rec('Профиль қайта жүктегеннен кейін сақталды', (await page.locator('[data-pren]').count()) === 1);
  await page.fill('#pName', 'Екінші'); await page.click('#pAdd');
  await page.locator('[data-pdel]').first().click(); await page.locator('[data-pdel]').first().click();
  rec('Профиль екі қадаммен өшіріледі', (await page.locator('[data-pren]').count()) === 1);
  await page.locator('[data-popen]').first().click();
  rec('Профиль ашылғанда формаға жүктеледі', (await page.inputValue('#f-G')) === '28');

  // Салыстыру
  await page.goto(BASE + '#compare');
  await page.selectOption('#cA', 'tele2-all'); await page.selectOption('#cB', 'izi-ultra-boost');
  const cmp = (await page.textContent('#view')).replace(/\u00A0/g, ' ');
  rec('Салыстыру: кезең айырмасы ескертіледі және 12 төлем 68 280 ₸', cmp.includes('Төлем кезеңдері әртүрлі') && cmp.includes('68 280'));
  rec('Телефон енінде көлденең жылжу жоқ (салыстыру)', await noOverflow());
  await shot('06-compare-phone');

  for (const r of ['model', 'sources', 'about', 'more']) { await page.goto(BASE + '#' + r); await page.waitForTimeout(100); rec('Экран ашылады: ' + r + ', жылжу жоқ', await noOverflow()); }
  await shot('07-more-phone');

  // PWA: manifest, service worker, желісіз ашылу
  const man = await page.evaluate(async () => { const r = await fetch('manifest.webmanifest'); return r.json(); });
  rec('Manifest: атауы, иконкалар (192, 512, maskable), standalone', man.display === 'standalone' && man.icons.length === 3 && man.icons.some(i => i.purpose === 'maskable'));
  await page.goto(BASE + '#home');
  const swOk = await page.evaluate(async () => { const reg = await navigator.serviceWorker.ready; return !!reg.active; });
  rec('Service worker белсенді', swOk);
  await page.reload(); await page.waitForTimeout(500);
  await ctx.setOffline(true);
  await page.reload(); await page.waitForSelector('.hero', { timeout: 5000 }).catch(() => {});
  rec('Желісіз қайта ашылады', await page.locator('.hero').isVisible());
  await page.goto(BASE + '#pick'); await page.fill('#f-G', '35'); await page.fill('#f-M', '200'); await page.fill('#f-S', '0'); await page.fill('#f-B', '3690');
  await page.goto(BASE + '#result');
  rec('Желісіз есептейді (35 ГБ, 200 мин, B = 3 690 → IZI)', (await page.textContent('.summary .big')).includes('ULTRA BOOST'));
  await ctx.setOffline(false);

  rec('Консольде JavaScript қатесі жоқ', errors.length === 0, errors.join(' | '));

  // Жұмыс үстелі скриншоты
  if (SHOTS) {
    const d = await browser.newContext({ viewport: { width: 1366, height: 860 } }); const dp = await d.newPage();
    await dp.goto(BASE + '#pick'); await dp.fill('#f-G', '40'); await dp.fill('#f-M', '100'); await dp.fill('#f-S', '0'); await dp.fill('#f-B', '6000');
    await dp.screenshot({ path: SHOTS + '/08-pick-desktop.png', fullPage: false });
    await dp.emulateMedia({ colorScheme: 'dark' }); await dp.screenshot({ path: SHOTS + '/09-pick-desktop-dark.png', fullPage: false });
    await d.close();
  }
  await browser.close();
  const failed = results.filter(r => !r.pass).length;
  console.log('\n' + (results.length - failed) + ' / ' + results.length + ' браузер тексерісі өтті');
  require('fs').writeFileSync(process.env.UI_JSON || '/dev/null', JSON.stringify(results, null, 1));
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
