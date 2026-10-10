/* Нұсқа жаңарғанда профиль мен тарих өшпейтінін тексеру.
 * Жобаның КӨШІРМЕСІН бөлек қалтада іске қосыңыз (тест сол көшірмедегі sw.js-ті өзгертеді):
 *   cp -r . /tmp/upd && cd /tmp/upd && python3 -m http.server 8098
 *   node tests/update.test.cjs /tmp/upd http://localhost:8098/
 */
const { chromium } = require('playwright'); const fs = require('fs');
const DIR = process.argv[2]; const U = process.argv[3] || 'http://localhost:8098/';
if (!DIR) { console.error('Көшірме қалтасын көрсетіңіз'); process.exit(2); }
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined }); const c = await b.newContext(); const p = await c.newPage();
  const nav = async (h, sel) => { await p.evaluate(x => { location.hash = x; }, h); await p.waitForSelector(sel); };
  await p.goto(U + '#pick'); await p.waitForSelector('#f-G'); await p.fill('#f-G', '30'); await p.fill('#f-M', '100');
  await nav('profiles', '#pName'); await p.fill('#pName', 'Жаңартуға дейін'); await p.click('#pAdd');
  await nav('history', '#hAdd'); await p.click('#hAdd'); await p.fill('#h0-G', '22');
  await p.evaluate(async () => { await navigator.serviceWorker.ready; }); await p.reload(); await p.waitForTimeout(500);
  const swPath = DIR + '/sw.js'; const old = fs.readFileSync(swPath, 'utf8');
  fs.writeFileSync(swPath, old.replace(/tarif-model-v[\d.]+/, 'tarif-model-v9.9.9'));
  await p.reload(); await p.evaluate(async () => { const r = await navigator.serviceWorker.getRegistration(); await r.update(); });
  await p.waitForSelector('#updBanner', { timeout: 10000 });
  await Promise.all([p.waitForEvent('load'), p.click('#updGo')]); await p.waitForTimeout(500);
  const keys = await p.evaluate(() => caches.keys());
  await nav('profiles', '#pName'); const n = await p.locator('[data-pren]').count();
  await nav('history', '#h0-G'); const hv = await p.inputValue('#h0-G');
  fs.writeFileSync(swPath, old);
  const ok = n === 1 && hv === '22' && keys.length === 1 && keys[0] === 'tarif-model-v9.9.9';
  console.log((ok ? 'PASS' : 'FAIL') + '  Жаңарту ескертуі шықты; жаңартудан кейін профиль: ' + n + ', тарих: ' + hv + ' ГБ, кэш: ' + keys.join(','));
  await b.close(); process.exit(ok ? 0 : 1);
})().catch(e => { console.error(e); process.exit(2); });
