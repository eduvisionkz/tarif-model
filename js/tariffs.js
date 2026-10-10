/*
 * Тариф деректері — оқу жиыны.
 * Дереккөз: «Ауылдағы байланыс: ұялы байланыс тарифін таңдаудың математикалық моделі»
 * негізгі жұмысының 2.1 және 2.8 кестелері (ресми беттер 08.10.2026 қаралған).
 *
 * ЖАҢАРТУ ЕРЕЖЕСІ
 *  - Баға не көлем өзгерсе, тек сол жазбаны өзгертіңіз және `checked` күнін жаңартыңыз.
 *  - Ресми бетте сан көрсетілмесе, өріске null жазыңыз. null = «нақтылау қажет».
 *    null-ды 0-ге не «шексізге» ауыстыруға болмайды.
 *  - Жаңа нұсқа шыққанда TARIFF_BASE.version мен sw.js ішіндегі CACHE_VERSION мәнін өзгертіңіз.
 *
 * Өрістер:
 *  type: 'individual' | 'family'
 *  maxNumbers: ең көп нөмір саны (null — белгісіз)
 *  gb: жоғары жылдамдықтағы интернет, ГБ (null — шегі белгісіз)
 *  minutes: пакеттегі минут (null — белгісіз); minutesDir: қай бағытқа
 *  sms: пакеттегі шығыс SMS (null — белгісіз); smsPrice: пакеттен тыс 1 SMS бағасы, ₸ (null — белгісіз)
 *  price: толық төлем (акциядан кейінгі), ₸; period: 'month' (күнтізбелік ай) | '30d' (30 күн)
 *  promo: { price, payments } — алғашқы `payments` төлемнің расталған бағасы, болмаса null
 *  addonsInfo: оператор жариялаған қосымша пакеттер — тек ақпарат; қолданба автоматты қоспайды
 */
(function (root) {
  var TARIFF_BASE = {
    version: '2026-10-08',
    checkedLabel: '08.10.2026',
    note: 'Деректер негізгі зерттеу жұмысынан алынды. Жұмыс авторы ресми беттерді 08.10.2026 қараған. ' +
          'Қолданбаның осы нұсқасы жасалғанда оператор беттері қайта ашылып салыстырылмады, сондықтан қосылар алдында ресми шартты қайта тексеріңіз.'
  };

  var TARIFFS = [
    { id: 'izi-ultra-boost', operator: 'IZI', network: 'IZI', name: 'ULTRA BOOST', type: 'individual', maxNumbers: 1,
      gb: 35, gbNote: '35 ГБ', minutes: 200, minutesDir: 'ҚР нөмірлеріне',
      sms: 0, smsPrice: 18, price: 3690, period: 'month', promo: null, addonsInfo: [],
      unclear: [],
      check: ['Пакеттен тыс әр шығыс SMS бағасы 18 ₸ екенін растаңыз'],
      source: 'https://izi.me/kz/ru/tariffs', sourceNo: 7, checked: '08.10.2026' },

    { id: 'altel-erkin', operator: 'Altel', network: 'Tele2/Altel', name: 'Еркін', type: 'individual', maxNumbers: 1,
      gb: 25, gbNote: '4G/3G: 25 ГБ', minutes: 100, minutesDir: 'басқа ұялы желілерге',
      sms: null, smsPrice: null, price: 4490, period: '30d', promo: null, addonsInfo: [],
      unclear: ['Пакеттегі шығыс SMS шарты жұмыста көрсетілмеген'],
      check: ['Шығыс SMS шартын нақтылаңыз'],
      source: 'https://altel.kz/tariffs/tariff_smart', sourceNo: 3, checked: '08.10.2026' },

    { id: 'altel-erkin-plus', operator: 'Altel', network: 'Tele2/Altel', name: 'Еркін+', type: 'individual', maxNumbers: 1,
      gb: 40, gbNote: '4G/3G: 40 ГБ', minutes: 200, minutesDir: 'басқа ұялы желілерге',
      sms: null, smsPrice: null, price: 5490, period: '30d', promo: null, addonsInfo: [],
      unclear: ['Пакеттегі шығыс SMS шарты жұмыста көрсетілмеген'],
      check: ['Шығыс SMS шартын нақтылаңыз'],
      source: 'https://altel.kz/tariffs/tariff_smart', sourceNo: 3, checked: '08.10.2026' },

    { id: 'tele2-all', operator: 'Tele2', network: 'Tele2/Altel', name: 'Безлимит для всех', type: 'individual', maxNumbers: 1,
      gb: null, gbNote: 'шексіз деп жарияланған; жоғары жылдамдық шегі (FUP) нақтылануы керек', minutes: 100, minutesDir: 'басқа желілерге',
      sms: null, smsPrice: null, price: 5990, period: '30d', promo: { price: 4790, payments: 3 }, addonsInfo: [],
      unclear: ['Жоғары жылдамдықтағы интернеттің сандық шегі (FUP)', 'Шығыс SMS шарты'],
      check: ['FUP шегін және одан кейінгі жылдамдықты сұраңыз', 'Акция (алғашқы 3 төлем) сізге қолжетімді ме'],
      source: 'https://tele2.kz/new/tariffs', sourceNo: 10, checked: '08.10.2026' },

    { id: 'tele2-full', operator: 'Tele2', network: 'Tele2/Altel', name: 'Безлимит по полной', type: 'individual', maxNumbers: 1,
      gb: null, gbNote: 'шексіз деп жарияланған; жоғары жылдамдық шегі (FUP) нақтылануы керек', minutes: 250, minutesDir: 'басқа желілерге',
      sms: null, smsPrice: null, price: 7990, period: '30d', promo: { price: 5990, payments: 3 }, addonsInfo: [],
      unclear: ['Жоғары жылдамдықтағы интернеттің сандық шегі (FUP)', 'Шығыс SMS шарты'],
      check: ['FUP шегін және одан кейінгі жылдамдықты сұраңыз', 'Акция (алғашқы 3 төлем) сізге қолжетімді ме'],
      source: 'https://tele2.kz/new/tariffs', sourceNo: 10, checked: '08.10.2026' },

    { id: 'beeline-x2', operator: 'Beeline', network: 'Beeline', name: 'Премиум Семья х2', type: 'family', maxNumbers: 2,
      gb: 120, gbNote: '120 ГБ ортақ; кейін жылдамдық төмендейді', minutes: 200, minutesDir: 'басқа желілерге',
      sms: null, smsPrice: null, price: 15999, period: 'month', promo: null, addonsInfo: [],
      unclear: ['Шығыс SMS шарты'],
      check: ['Интернет пен минут барлық қатысушыға ортақ екенін растаңыз'],
      source: 'https://beeline.kz/ru/products/tariffs/premiumfamily', sourceNo: 9, checked: '08.10.2026' },

    { id: 'beeline-x4', operator: 'Beeline', network: 'Beeline', name: 'Премиум Семья х4', type: 'family', maxNumbers: 4,
      gb: 240, gbNote: '240 ГБ ортақ; кейін жылдамдық төмендейді', minutes: 400, minutesDir: 'басқа желілерге',
      sms: null, smsPrice: null, price: 19999, period: 'month', promo: null, addonsInfo: [],
      unclear: ['Шығыс SMS шарты'],
      check: ['Интернет пен минут барлық қатысушыға ортақ екенін растаңыз'],
      source: 'https://beeline.kz/ru/products/tariffs/premiumfamily', sourceNo: 9, checked: '08.10.2026' },

    { id: 'beeline-x6', operator: 'Beeline', network: 'Beeline', name: 'Премиум Семья х6', type: 'family', maxNumbers: 6,
      gb: 360, gbNote: '360 ГБ ортақ; кейін 256 Кбит/с дейін төмендейді', minutes: 600, minutesDir: 'басқа ұялы және қалалық нөмірлерге',
      sms: null, smsPrice: null, price: 23999, period: 'month', promo: null,
      addonsInfo: [{ gb: 50, price: 3999, note: 'Жұмыста қолмен есептелген балама (Есеп 4). Пакеттің әрекет ету мерзімі тексерілмеген, қолданба оны автоматты қоспайды.' }],
      unclear: ['Шығыс SMS шарты'],
      check: ['Интернет пен минут барлық қатысушыға ортақ екенін растаңыз'],
      source: 'https://beeline.kz/ru/products/tariffs/premium-family-x6-v2', sourceNo: 1, checked: '08.10.2026' },

    { id: 'activ-3', operator: 'activ', network: 'Kcell/activ', name: 'Семейный 3', type: 'family', maxNumbers: 3,
      gb: null, gbNote: 'жылдамдық төмендейтін шек нақтылануы керек', minutes: 300, minutesDir: 'басқа ұялы желілерге',
      sms: null, smsPrice: null, price: 12690, period: 'month', promo: null, addonsInfo: [],
      unclear: ['Жоғары жылдамдықтағы интернет шегі', 'Алғашқы жеңілдіктің мөлшері мен мерзімі', 'Шығыс SMS шарты'],
      check: ['Интернет шегін сұраңыз', 'Алғашқы төлемдердегі жеңілдікті нақтылаңыз'],
      source: 'https://promo.activ.kz/familynew', sourceNo: 2, checked: '08.10.2026' },

    { id: 'activ-5', operator: 'activ', network: 'Kcell/activ', name: 'Семейный 5+', type: 'family', maxNumbers: 5,
      gb: null, gbNote: 'жылдамдық төмендейтін шек нақтылануы керек', minutes: 500, minutesDir: 'басқа ұялы желілерге',
      sms: null, smsPrice: null, price: 14690, period: 'month', promo: null, addonsInfo: [],
      unclear: ['Жоғары жылдамдықтағы интернет шегі', 'Алғашқы жеңілдіктің мөлшері мен мерзімі', 'Шығыс SMS шарты'],
      check: ['Интернет шегін сұраңыз', 'Алғашқы төлемдердегі жеңілдікті нақтылаңыз'],
      source: 'https://promo.activ.kz/familynew', sourceNo: 2, checked: '08.10.2026' },

    { id: 'activ-7', operator: 'activ', network: 'Kcell/activ', name: 'Семейный 7+', type: 'family', maxNumbers: 7,
      gb: null, gbNote: 'белгілі көлемнен кейін жылдамдық төмендейді; шегі нақтылануы керек', minutes: 700, minutesDir: 'басқа ұялы желілерге',
      sms: null, smsPrice: null, price: 19690, period: 'month', promo: null, addonsInfo: [],
      unclear: ['Жоғары жылдамдықтағы интернет шегі', 'Алғашқы жеңілдіктің мөлшері мен мерзімі', 'Шығыс SMS шарты'],
      check: ['Интернет шегін сұраңыз', 'Алғашқы төлемдердегі жеңілдікті нақтылаңыз'],
      source: 'https://promo.activ.kz/familynew', sourceNo: 2, checked: '08.10.2026' },

    { id: 'altel-family-7', operator: 'Altel', network: 'Tele2/Altel', name: 'Моя семья 7', type: 'family', maxNumbers: null,
      gb: null, gbNote: 'шегі нақтылануы керек', minutes: null, minutesDir: 'толық шартын тексеру керек',
      sms: null, smsPrice: null, price: 19490, period: 'month', promo: { price: 14620, payments: 3 }, addonsInfo: [],
      unclear: ['Қатысушы саны (жарияланғаны — 7-ге дейін, толық карточкамен қайта тексеріледі)', 'Интернет шегі', 'Минут шарты', 'Шығыс SMS шарты'],
      check: ['Қатысушы санын, интернет пен минут құрамын тарифтің толық карточкасынан қараңыз'],
      source: 'https://altel.kz/new/news/my-family-price', sourceNo: 8, checked: '08.10.2026' }
  ];

  var SOURCES = [
    [1, 'Beeline Kazakhstan. «Премиум Семья х6»: шарттары, төлемі, жылдамдық шегі', 'https://beeline.kz/ru/products/tariffs/premium-family-x6-v2'],
    [2, 'activ. «Семейный» тарифтері: қатысушылар, минуттар, баға, акция', 'https://promo.activ.kz/familynew'],
    [3, 'Altel. «Еркін» және «Еркін+» тарифтері', 'https://altel.kz/tariffs/tariff_smart'],
    [4, 'Beeline Kazakhstan. Желіні дамыту картасы', 'https://beeline.kz/ru/map'],
    [5, 'Tele2 Kazakhstan. Қамту картасы', 'https://tele2.kz/map'],
    [6, 'Altel Kazakhstan. Қамту картасы', 'https://altel.kz/new/map'],
    [7, 'IZI. ULTRA және ULTRA BOOST тарифтері', 'https://izi.me/kz/ru/tariffs'],
    [8, 'Altel. «Моя семья» тарифтерінің бағасы (2026 ж. 22 маусымнан)', 'https://altel.kz/new/news/my-family-price'],
    [9, 'Beeline Kazakhstan. «Премиум Семья» х2, х4, х6', 'https://beeline.kz/ru/products/tariffs/premiumfamily'],
    [10, 'Tele2 Kazakhstan. «Безлимит для всех», «Безлимит по полной»', 'https://tele2.kz/new/tariffs']
  ];

  /* Желі белгісі қойылатын топтар: бір желіде жұмыс істейтін брендтер біріктірілген */
  var NETWORKS = ['Beeline', 'Kcell/activ', 'Tele2/Altel', 'IZI'];

  var api = { TARIFF_BASE: TARIFF_BASE, TARIFFS: TARIFFS, SOURCES: SOURCES, NETWORKS: NETWORKS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TARIFF_DATA = api;
})(this);
