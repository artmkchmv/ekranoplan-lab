/* =====================================================================
   Аппараты для симулятора.
   Метки у каждого числа: 'src' — из источника (номер в списке источников),
   'est' — оценка автора, 'own' — наша модель (измерить самим).
   Внутри — единицы СИ (м, кг, м/с).
   Массы: massBase — «масса без груза» (пустой аппарат + экипаж + топливо),
          payload  — груз; mtow — максимальная взлётная масса из источника (для предупреждения о перегрузе).
   ===================================================================== */
window.PRESETS = {
  model: {
    name: 'Наша модель (35 см)', short: 'Наша модель', style: 'oros', kind: 'glider', surface: 'floor',
    L: 0.35, H: 0.093,
    b: 0.35, chord: 0.07, shape: 'rect', endplates: false,
    massBase: 0.020, payload: 0, V: 5, h: 0.03, alpha: 6, wind: 0,
    cd0: 0.05, clmax: 0.9, alpha0: 0, engine: null, energy: null, mtow: null,
    payloadName: 'Груз (монеты)',
    units: { len: 'cm', mass: 'g', speed: 'ms' },
    ranges: { h: [0.005, 0.6, 0.005], V: [2, 10, 0.1], massBase: [0.008, 0.06, 0.001], payload: [0, 0.02, 0.001],
              b: [0.2, 0.6, 0.01], chord: [0.04, 0.14, 0.005], wind: [-3, 3, 0.1] },
    facts: [
      ['Длина и размах', '35 см', 'own', 'в 10 раз меньше модели Самарского университета'],
      ['Площадь крыла', '245 см²', 'own', 'одинаковая у крыльев А, Б, В'],
      ['Масса', 'около 20 г', 'own', 'взвесить свою модель'],
      ['Груз', 'до 20 г (монеты)', 'own', ''],
      ['Скорость запуска', 'около 5 м/с', 'own', 'измерить по видео'],
      ['Сопротивление корпуса Cx₀', '0,05', 'est', 'типичное для лёгкой модели'],
    ]
  },
  samara: {
    name: 'Модель ОРОС-1 Самарского университета', short: 'Модель ОРОС-1 (3,5 м)', style: 'oros', kind: 'powered', surface: 'water',
    L: 3.5, H: 0.93,
    b: 3.5, chord: 0.7, shape: 'rect', endplates: false,
    massBase: 25, payload: 0, V: 20, h: 0.3, alpha: null, wind: 0,
    cd0: 0.04, clmax: 1.1, alpha0: -2, engine: null, energy: 'elec', mtow: null,
    payloadName: 'Груз',
    units: { len: 'm', mass: 'kg', speed: 'kmh' },
    ranges: { h: [0.05, 3, 0.01], V: [5, 27, 0.5], massBase: [10, 60, 1], payload: [0, 5, 0.5],
              b: [2, 5, 0.05], chord: [0.3, 1.2, 0.02], wind: [-8, 8, 0.5] },
    facts: [
      ['Длина', 'около 3,5 м', 'src', [7]], ['Размах крыльев', 'около 3,5 м', 'src', [7]],
      ['Двигатели', '3 электромотора: в хвосте и два на переднем оперении', 'src', [7]],
      ['Скорость', 'до 90 км/ч', 'src', [7]], ['Материал', 'стеклопластик', 'src', [7]],
      ['Масса', 'не опубликована, в симуляторе 25 кг', 'est', ''],
      ['Груз', 'до 5 кг', 'est', 'модель беспилотная'],
      ['Площадь и форма крыла', 'не опубликованы, условно 3,5 × 0,7 м', 'est', ''],
      ['Мощность моторов', 'не опубликована', 'est', '']
    ]
  },
  oros_full: {
    name: 'ОРОС-1, 10-местный (условная модель)', short: 'ОРОС-1 (условно)', style: 'oros', kind: 'powered', surface: 'water',
    L: 17.5, H: 4.6,
    b: 17.5, chord: 2.6, shape: 'rect', endplates: false,
    massBase: 3000, payload: 1000, V: 41.7, h: 1.0, alpha: null, wind: 0,
    cd0: 0.035, clmax: 1.2, alpha0: -2, engine: null, energy: 'fuel', mtow: null,
    payloadName: 'Пассажиры и багаж',
    units: { len: 'm', mass: 'kg', speed: 'kmh' },
    ranges: { h: [0.1, 15, 0.05], V: [15, 70, 0.5], massBase: [2000, 5000, 50], payload: [0, 1500, 50],
              b: [10, 25, 0.1], chord: [1.5, 4, 0.05], wind: [-12, 12, 0.5] },
    facts: [
      ['Пассажиры', '10, в будущем 15', 'src', [7, 8]],
      ['Разработчик', 'компания «Ферсель»', 'src', [8]],
      ['Длина и размах', 'около 17,5 м (3,5 м × 5)', 'est', 'прикидка, не официальная цифра'],
      ['Масса без груза', '3000 кг', 'est', 'по аналогии с «Волгой-2»'],
      ['Пассажиры и багаж', 'до 1500 кг (15 человек по 100 кг)', 'est', ''],
      ['Скорость и высота полёта', '150 км/ч, 1 м', 'est', 'условно'],
    ]
  },
  volga2: {
    name: '«Волга-2» (СССР, 1986)', short: '«Волга-2»', style: 'volga2', kind: 'powered', surface: 'water',
    L: 11, H: 3,
    b: 8, chord: 5.6, shape: 'rect', endplates: true,
    massBase: 2150, payload: 800, V: 33.3, h: 0.6, alpha: null, wind: 0,
    cd0: 0.04, clmax: 1.2, alpha0: -2, engine: { type: 'prop', P_W: 2 * 110.3e3, text: '2 × 150 л.с.' }, energy: 'fuel',
    vmaxSrc: 150, mtow: 2950,
    payloadName: 'Пассажиры и груз',
    units: { len: 'm', mass: 'kg', speed: 'kmh' },
    ranges: { h: [0.1, 6, 0.02], V: [12, 56, 0.5], massBase: [1950, 2950, 25], payload: [0, 800, 25],
              b: [5, 12, 0.1], chord: [3, 8, 0.1], wind: [-12, 12, 0.5] },
    facts: [
      ['Длина', '11 м', 'src', [6]], ['Размах', '8 м', 'src', [6]], ['Высота', '3 м', 'src', [6]],
      ['Масса пустого', '1950 кг', 'src', [6]], ['Максимальная взлётная масса', '2950 кг', 'src', [6]],
      ['Груз', '8 пассажиров или 800 кг', 'src', [6]],
      ['Двигатели', '2 × 150 л.с.', 'src', [6]], ['Максимальная скорость', '150 км/ч', 'src', [6]],
      ['Дальность', '110 км', 'src', [6]], ['Высота полёта', '0,5–0,8 м', 'src', [6]],
      ['Площадь крыла около 45 м², шайбы', '', 'est', 'в источнике нет']
    ]
  },
  orlyonok: {
    name: 'А-90 «Орлёнок» (СССР, 1972)', short: '«Орлёнок»', style: 'orlyonok', kind: 'powered', surface: 'water',
    L: 58.1, H: 16.3,
    b: 31.5, chord: 9.65, shape: 'rect', endplates: true,
    massBase: 112000, payload: 28000, V: 100, h: 3, alpha: null, wind: 0,
    cd0: 0.03, clmax: 1.2, alpha0: -2, engine: { type: 'prop', P_W: 11033e3, text: 'маршевый НК-12МК, 11 033 кВт' }, energy: 'fuel',
    vmaxSrc: 400, mtow: 140000,
    payloadName: 'Груз',
    units: { len: 'm', mass: 't', speed: 'kmh' },
    ranges: { h: [0.5, 25, 0.1], V: [40, 125, 1], massBase: [100000, 140000, 1000], payload: [0, 28000, 500],
              b: [20, 45, 0.5], chord: [6, 14, 0.1], wind: [-15, 15, 0.5] },
    facts: [
      ['Длина', '58,1 м', 'src', [4]], ['Размах', '31,5 м', 'src', [4]], ['Площадь крыла', '304 м²', 'src', [4]],
      ['Масса пустого', '100 т', 'src', [14]],
      ['Максимальная взлётная масса', '140 т (в другом источнике 125 т)', 'src', [4, 2]],
      ['Груз', 'до 28 т или до 150–200 человек', 'src', [4, 14]],
      ['Маршевый двигатель', 'НК-12МК, 11 033 кВт', 'src', [4]],
      ['Скорость', 'крейсерская 360 км/ч, максимальная 400 км/ч', 'src', [14, 4]],
      ['Дальность', '1500 км', 'src', [4]],
      ['Высота полёта 3 м, шайбы', '', 'est', 'в источнике: «несколько метров»']
    ]
  },
  lun: {
    name: '«Лунь» (СССР, 1987)', short: '«Лунь»', style: 'lun', kind: 'powered', surface: 'water',
    L: 73.8, H: 19.2,
    b: 44, chord: 12.5, shape: 'rect', endplates: true,
    massBase: 286000, payload: 94000, V: 125, h: 2.5, alpha: null, wind: 0,
    cd0: 0.03, clmax: 1.2, alpha0: -2, engine: { type: 'jet', T_N: 8 * 127.4e3, text: '8 × НК-87 по 127,4 кН' }, energy: 'fuel',
    vmaxSrc: 550, mtow: 380000,
    payloadName: 'Груз',
    units: { len: 'm', mass: 't', speed: 'kmh' },
    ranges: { h: [0.5, 20, 0.1], V: [50, 160, 1], massBase: [286000, 380000, 2000], payload: [0, 100000, 1000],
              b: [30, 60, 0.5], chord: [8, 18, 0.1], wind: [-15, 15, 0.5] },
    facts: [
      ['Длина', '73,8 м', 'src', [5]], ['Размах', '44 м', 'src', [5]], ['Площадь крыла', '550 м²', 'src', [5]],
      ['Масса пустого', '286 т', 'src', [5]],
      ['Максимальная взлётная масса', '380 т (в другом источнике 400 т)', 'src', [5, 2]],
      ['Груз', '100 т (в другой части статьи 137 т)', 'src', [5]],
      ['Двигатели', '8 × НК-87 по 127,4 кН', 'src', [5]],
      ['Крейсерская скорость', '450 км/ч на высоте 2,5 м', 'src', [5]],
      ['Шайбы', '', 'est', 'упрощение']
    ]
  },
  km: {
    name: 'КМ «Каспийский монстр» (СССР, 1966)', short: 'КМ', style: 'km', kind: 'powered', surface: 'water',
    L: 92, H: 21.8,
    b: 37.6, chord: 17.62, shape: 'rect', endplates: true,
    massBase: 240000, payload: 304000, V: 119.4, h: 4, alpha: null, wind: 0,
    cd0: 0.025, clmax: 1.2, alpha0: -2, engine: { type: 'jet', T_N: 2 * 127.53e3, text: 'в полёте 2 хвостовых ВД-7 по 127,5 кН' }, energy: 'fuel',
    vmaxSrc: 500, mtow: 544000,
    payloadName: 'Груз и топливо',
    units: { len: 'm', mass: 't', speed: 'kmh' },
    ranges: { h: [0.5, 25, 0.1], V: [50, 150, 1], massBase: [240000, 544000, 2000], payload: [0, 304000, 2000],
              b: [25, 55, 0.5], chord: [10, 24, 0.1], wind: [-15, 15, 0.5] },
    facts: [
      ['Длина', '92 м', 'src', [3]], ['Размах', '37,6 м', 'src', [3]], ['Площадь крыла', '662,5 м²', 'src', [3]],
      ['Масса пустого', '240 т', 'src', [3, 15]], ['Максимальная взлётная масса', '544 т', 'src', [3, 15]],
      ['Грузоподъёмность', '304 т', 'src', [15]],
      ['Двигатели', '10 × ВД-7: 8 носовых для взлёта, 2 хвостовых в полёте', 'src', [3]],
      ['Скорость', 'крейсерская 430 км/ч, максимальная 500 км/ч', 'src', [3]], ['Высота полёта', '4–14 м', 'src', [3]],
      ['Шайбы', '', 'est', 'упрощение']
    ]
  }
};

window.SOURCES = [
  { n: 1, text: 'Испытательную модель десятиместного экраноплана изготовили в Самаре // самара.рф, 06.08.2025', url: 'https://xn--80aa3ak5a.xn--p1ai/news/ispytatelnuyu-model-desyatimestnogo-ekranoplana-izgotovili-v-samare/' },
  { n: 2, text: 'Ground-effect vehicle // Wikipedia, the free encyclopedia', url: 'https://en.wikipedia.org/wiki/Ground-effect_vehicle' },
  { n: 3, text: 'Caspian Sea Monster // Wikipedia, the free encyclopedia', url: 'https://en.wikipedia.org/wiki/Caspian_Sea_Monster' },
  { n: 4, text: 'A-90 Orlyonok // Wikipedia, the free encyclopedia', url: 'https://en.wikipedia.org/wiki/A-90_Orlyonok' },
  { n: 5, text: 'Lun-class ekranoplan // Wikipedia, the free encyclopedia', url: 'https://en.wikipedia.org/wiki/Lun-class_ekranoplan' },
  { n: 6, text: 'Волга-2 (экраноплан) // Википедия: свободная энциклопедия', url: 'https://ru.wikipedia.org/wiki/Волга-2_(экраноплан)' },
  { n: 7, text: 'Самарские инженеры и студенты изготовили испытательную модель десятиместного экраноплана // Самарский университет им. Королёва, 2025', url: 'https://ssau.ru/news/24608-samarskie-inzhenery-i-studenty-izgotovili-ispytatelnuyu-model-desyatimestnogo-ekranoplana' },
  { n: 8, text: 'В Самаре изготовили испытательную модель пассажирского экраноплана // РИА Новости, 05.08.2025', url: 'https://ria.ru/20250805/samara-2033396355.html' },
  { n: 9, text: 'McCormick B. W. Aerodynamics, Aeronautics, and Flight Mechanics. New York: Wiley', url: null },
  { n: 10, text: 'Самарские конструкторы создали модель экраноплана // Mail.ru Наука', url: 'https://science.mail.ru/news/6318-model-ekranoplana/' },
  { n: 11, text: 'В Самарском университете создали модель беспилотного экраноплана // ТАСС Наука', url: 'https://nauka.tass.ru/nauka/24707367' },
  { n: 12, text: 'AirFish 8 WIG Craft // Ship Technology', url: 'https://www.ship-technology.com/projects/airfish-8-wig-craft/' },
  { n: 13, text: 'AirFish 8 // Wigetworks', url: 'https://www.wigetworks.com/airfish-8' },
  { n: 14, text: 'Орлёнок (экраноплан) // Википедия: свободная энциклопедия', url: 'https://ru.wikipedia.org/wiki/Орлёнок_(экраноплан)' },
  { n: 15, text: 'КМ (экраноплан) // Википедия: свободная энциклопедия', url: 'https://ru.wikipedia.org/wiki/КМ_(экраноплан)' },
  { n: 16, text: 'Hoerner S. F. Fluid-Dynamic Drag. Hoerner Fluid Dynamics', url: null },
  { n: 17, text: 'Anderson J. D. Fundamentals of Aerodynamics. New York: McGraw-Hill', url: null }
];
