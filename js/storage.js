/*
 * Құрылғыдағы сақтау (localStorage). Сервер жоқ: деректер тек осы құрылғыда.
 * Нұсқа жаңарғанда сақталған профильдер мен тарих өшірілмейді:
 *  - кілттер тұрақты (tarifModel.*), service worker кэшінен бөлек;
 *  - схема өзгерсе, migrate() ескі деректі түрлендіреді, ешқашан жоймайды.
 */
(function (root) {
  var PREFIX = 'tarifModel.';
  var SCHEMA = 1;
  var memory = {}; // localStorage жоқ кезде (жеке терезе) уақытша сақтау

  function rawGet(k) { try { return localStorage.getItem(PREFIX + k); } catch (e) { return memory[k] == null ? null : memory[k]; } }
  function rawSet(k, v) { try { localStorage.setItem(PREFIX + k, v); return true; } catch (e) { memory[k] = v; return false; } }
  function rawDel(k) { try { localStorage.removeItem(PREFIX + k); } catch (e) { delete memory[k]; } }

  function load(k, fallback) {
    var v = rawGet(k);
    if (v == null) return fallback;
    try { return JSON.parse(v); } catch (e) { return fallback; }
  }
  function save(k, val) { return rawSet(k, JSON.stringify(val)); }

  function migrate() {
    var cur = parseInt(rawGet('schema') || '0', 10);
    if (cur >= SCHEMA) return cur;
    // 0 → 1: алғашқы орнату. Бұрынғы деректер жоқ, тек нұсқа белгісін қоямыз.
    // Келешек түрлендірулер осында қосылады (cur === 1 → 2 ...). Деректер жойылмайды.
    rawSet('schema', String(SCHEMA));
    return SCHEMA;
  }

  function available() { try { var k = PREFIX + '__t'; localStorage.setItem(k, '1'); localStorage.removeItem(k); return true; } catch (e) { return false; } }

  function requestPersist() {
    try { if (navigator.storage && navigator.storage.persist) return navigator.storage.persist(); } catch (e) {}
    return Promise.resolve(false);
  }

  /* Сақтық көшірме: профильдер, тарих, желі белгілері — бір JSON */
  function exportAll() {
    return { app: 'tarif-model', schema: SCHEMA, exported: new Date().toISOString(),
      profiles: load('profiles', []), history: load('history', null), net: load('net', {}), form: load('form', null) };
  }
  function importAll(obj) {
    if (!obj || obj.app !== 'tarif-model') throw new Error('Бұл файл осы қолданбаның сақтық көшірмесі емес');
    var cur = load('profiles', []);
    var ids = {}; cur.forEach(function (p) { ids[p.id] = true; });
    var added = 0;
    (obj.profiles || []).forEach(function (p) { if (p && p.id && !ids[p.id]) { cur.push(p); added++; } });
    save('profiles', cur);
    if (obj.history && !load('history', null)) save('history', obj.history);
    return added;
  }

  root.Store = { load: load, save: save, del: rawDel, migrate: migrate, available: available, requestPersist: requestPersist, exportAll: exportAll, importAll: importAll, SCHEMA: SCHEMA };
})(this);
