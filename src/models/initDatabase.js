const fs = require('fs');
const path = require('path');
const { db, hashPassword } = require('./database');

function metaGet(key) {
  const row = db.prepare('SELECT value FROM meta WHERE key = ?').get(key);
  return row ? row.value : null;
}

function metaSet(key, value) {
  db.prepare(`
    INSERT INTO meta (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(key, String(value));
}

function seedBase() {
  const count = db.prepare('SELECT COUNT(*) AS c FROM products').get().c;
  if (count > 0) return;

  const insertCat = db.prepare('INSERT INTO categories (name, slug) VALUES (?, ?)');
  const cats = {};
  [
    ['Смартфоны и гаджеты', 'smartphones'],
    ['Компьютеры и периферия', 'parts'],
    ['Бытовая электроника', 'appliances'],
    ['Игры и консоли', 'gaming'],
    ['Аксессуары', 'accessories'],
  ].forEach(([name, slug]) => {
    cats[slug] = insertCat.run(name, slug).lastInsertRowid;
  });

  const products = [
    [cats.smartphones, 'Смартфон Nova X5 128 ГБ', 'Флагманский смартфон с ярким AMOLED-экраном 6.7", мощным процессором и основной камерой 108 Мп. Поддерживает 5G и быструю зарядку 65 Вт.', 24990, 28990, 'smartphone.jpg', 15, { 'Экран': '6.7" AMOLED, 120 Гц', 'Процессор': 'NovaCore X2', 'Оперативная память': '8 ГБ', 'Накопитель': '128 ГБ', 'Камера': '108 + 12 + 8 Мп', 'Аккумулятор': '5000 мА·ч', '5G': 'Да' }, 1],
    [cats.smartphones, 'Смартфон Aura Lite 64 ГБ', 'Компактный смартфон для повседневных задач: отличный экран, автономная батарея и качественная основная камера.', 12990, null, 'smartphone.jpg', 22, { 'Экран': '6.1" IPS, 90 Гц', 'Процессор': 'Aura S1', 'Оперативная память': '4 ГБ', 'Накопитель': '64 ГБ', 'Камера': '50 + 8 Мп', 'Аккумулятор': '4500 мА·ч' }, 0],
    [cats.smartphones, 'Планшет PixelPad 10.4"', 'Большой планшет для работы и развлечений: поддержка стилуса, четыре динамика и 10 часов автономной работы.', 19990, 22990, 'tablet.jpg', 9, { 'Экран': '10.4" IPS, 2000×1200', 'Процессор': 'PixelPad A8', 'Оперативная память': '6 ГБ', 'Накопитель': '128 ГБ', 'Камера': '13 Мп', 'Аккумулятор': '7500 мА·ч' }, 1],
    [cats.smartphones, 'Смарт-часы FitTrack Pro', 'Спортивные часы с GPS, пульсометром и защитой от воды 5ATM. Более 100 режимов тренировок.', 8990, null, 'smartwatch.jpg', 30, { 'Экран': '1.43" AMOLED', 'GPS': 'Встроенный', 'Пульсометр': 'Да', 'Защита': '5 ATM', 'Аккумулятор': 'до 14 дней' }, 1],
    [cats.smartphones, 'Наушники Buds Air Pro', 'Беспроводные наушники с активным шумоподавлением и режимом прозрачности. До 32 часов работы с кейсом.', 5490, 6990, 'earbuds.jpg', 40, { 'Тип': 'Вкладыши TWS', 'Шумоподавление': 'ANC', 'Время работы': '8 ч + 24 ч кейс', 'Защита': 'IPX5', 'Bluetooth': '5.3' }, 1],
    [cats.smartphones, 'Видеокамера ActionCam 4K', 'Экшн-камера для съёмки в движении: 4K 60 fps, стабилизация и влагозащита до 10 метров.', 18990, null, 'camera.jpg', 7, { 'Видео': '4K 60 fps', 'Стабилизация': 'Электронная', 'Защита': '10 м без бокса', 'Аккумулятор': '120 мин' }, 0],
    [cats.smartphones, 'Дрон SkyHawk 4K', 'Квадрокоптер с камерой 4K, полётом до 30 минут и дальностью связи 8 км. Автоматический возврат домой.', 32990, 38990, 'drone.jpg', 5, { 'Камера': '4K 30 fps', 'Время полёта': 'до 30 мин', 'Дальность': '8 км', 'Взлётная масса': '595 г' }, 0],
    [cats.parts, 'Ноутбук Ultrabook Air 14"', 'Тонкий и лёгкий ноутбук для работы и учёбы: 16 ГБ ОЗУ, SSD 512 ГБ и экран с разрешением 2.8K.', 64990, 72990, 'laptop.jpg', 11, { 'Экран': '14" 2.8K IPS', 'Процессор': 'Core i5-1335U', 'Оперативная память': '16 ГБ', 'Накопитель': 'SSD 512 ГБ', 'Время работы': 'до 15 ч', 'Вес': '1.29 кг' }, 1],
    [cats.parts, 'Системный блок Gaming Pro', 'Игровой ПК в сборе: мощная видеокарта, 32 ГБ ОЗУ и SSD на 1 ТБ. Готов к VR и стримингу.', 89990, null, 'pcparts.jpg', 4, { 'Процессор': 'Core i7-14700F', 'Видеокарта': 'RTX 4060 8 ГБ', 'Оперативная память': '32 ГБ DDR5', 'Накопитель': 'SSD 1 ТБ NVMe', 'Блок питания': '750 Вт 80+ Gold' }, 1],
    [cats.parts, 'Монитор ViewMax 27" QHD', 'Профессиональный монитор с IPS-матрицей, частотой 165 Гц и калибровкой Delta E < 2.', 21990, null, 'monitor.jpg', 13, { 'Экран': '27" IPS, 2560×1440', 'Частота': '165 Гц', 'Яркость': '350 кд/м²', 'Порты': 'HDMI 2.1, DP 1.4' }, 1],
    [cats.parts, 'Клавиатура MechKey RGB', 'Механическая клавиатура с горячей заменой переключателей и RGB-подсветкой каждой клавиши.', 7990, 9490, 'keyboard.jpg', 25, { 'Тип': 'Механическая, hot-swap', 'Подключение': 'USB + Bluetooth', 'Переключатели': 'Hot-swap', 'Подсветка': 'RGB', 'Раскладка': '104 клавиши' }, 0],
    [cats.parts, 'Мышь ErgoPro Wireless', 'Эргономичная беспроводная мышь с 6 программируемыми кнопками и точным сенсором 16 000 DPI.', 3490, null, 'mouse.jpg', 50, { 'Подключение': '2.4 ГГц + BT', 'Сенсор': '16 000 DPI', 'Кнопки': '6 программируемых', 'Время работы': 'до 70 дней' }, 0],
    [cats.parts, 'SSD NVMe 1 ТБ Gen4', 'Быстрый накопитель формата M.2 для игр и работы с большими файлами. Скорость чтения до 5000 МБ/с.', 8990, null, 'ssd.jpg', 18, { 'Объём': '1 ТБ', 'Интерфейс': 'PCIe 4.0 ×4', 'Чтение': 'до 5000 МБ/с', 'Гарантия': '5 лет' }, 0],
    [cats.appliances, 'Телевизор Vision 55" 4K', 'Умный телевизор с экраном 4K, HDR10+ и голосовым ассистентом. Тонкие рамки и режим «Картинка в картинке».', 54990, 61990, 'tv1.jpg', 8, { 'Экран': '55" 4K UHD', 'Частота': '60 Гц', 'Smart TV': 'VisionOS', 'Звук': '2×20 Вт, Dolby Digital', 'HDMI': '3 порта' }, 1],
    [cats.appliances, 'Телевизор Vision 43" Full HD', 'Компактный телевизор для кухни или спальни. Яркая картинка, встроенный ресивер и мобильное приложение.', 27990, null, 'tv2.jpg', 12, { 'Экран': '43" Full HD', 'Smart TV': 'VisionOS', 'Звук': '2×10 Вт', 'HDMI': '2 порта' }, 0],
    [cats.appliances, 'Колонка BoomBox Mini', 'Портативная колонка с басовым излучателем, защитой IP67 и 20 часами воспроизведения от одного заряда.', 5990, 7490, 'speaker.jpg', 35, { 'Мощность': '20 Вт', 'Время работы': '20 ч', 'Защита': 'IP67', 'Bluetooth': '5.3', 'Вес': '0.8 кг' }, 0],
    [cats.gaming, 'Консоль GameBox S', 'Игровая консоль нового поколения: 4K-графика, SSD 825 ГБ и эксклюзивные игры. Поддержка геймпада из коробки.', 45990, null, 'console.jpg', 6, { 'GPU': 'RDNA 2, 10.3 TFLOPS', 'CPU': '8 ядер Zen 2', 'Память': '16 ГБ GDDR6', 'Накопитель': '825 ГБ SSD', 'Выход': '4K 120 fps' }, 1],
    [cats.gaming, 'Геймпад Pro Controller', 'Профессиональный геймпад с Hall-эффект стиками, адаптивными триггерами и до 40 часов работы.', 6490, 7990, 'controller.jpg', 28, { 'Подключение': 'USB-C + BT 5.0', 'Стики': 'Hall-эффект', 'Время работы': 'до 40 ч', 'Вибрация': 'HD rumble' }, 0],
    [cats.gaming, 'VR-шлем VRZone', 'Шлем виртуальной реальности с экранами 1832×1920 на глаз и внутренними камерами слежения.', 32990, null, 'gaming.jpg', 3, { 'Экраны': '1832×1920 на глаз', 'Частота': '90/120 Гц', 'Трекинг': 'Inside-out', 'Звук': 'Встроенные наушники' }, 0],
    [cats.accessories, 'Роутер NetCore AC1200', 'Двухдиапазонный маршрутизатор с Wi-Fi 5, 4 внешними антеннами и приложением для настройки.', 5490, 6990, 'router.jpg', 20, { 'Стандарт': 'Wi-Fi 5 (802.11ac)', 'Скорость': 'до 1200 Мбит/с', 'Антенны': '4 внешние', 'Порты': '1×WAN, 4×LAN' }, 0],
    [cats.accessories, 'Пауэрбанк Volt 20000 мА·ч', 'Мощный внешний аккумулятор с быстрой зарядкой 22.5 Вт и двумя портами USB-C/USB-A.', 2990, 3990, 'powerbank.jpg', 60, { 'Ёмкость': '20000 мА·ч', 'Мощность': '22.5 Вт', 'Порты': '2×USB-C, 1×USB-A', 'Дисплей': 'LED-индикатор' }, 0],
  ];

  const insertMany = db.prepare(`
    INSERT INTO products (category_id, name, description, price, old_price, image, stock, specs, is_featured)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  db.exec('BEGIN');
  try {
    for (const p of products) {
      insertMany.run(p[0], p[1], p[2], p[3], p[4], p[5], p[6], JSON.stringify(p[7]), p[8]);
    }
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }

  const insertReview = db.prepare(`
    INSERT INTO reviews (product_id, author_name, rating, text, created_at)
    VALUES (?, ?, ?, ?, datetime('now','localtime', ?))
  `);
  const reviewData = [
    [1, 'Дмитрий К.', 5, 'Отличный смартфон за свои деньги: камера радует даже вечером, батарея держит два дня. Доставили в Оренбург за 2 дня.', '-3 days'],
    [1, 'Анна С.', 4, 'Хороший аппарат, но в комплекте хотелось бы чехол. В целом рекомендую.', '-10 days'],
    [8, 'Игорь В.', 5, 'Брал для учёбы и работы – справляется отлично, вес почти не чувствуется. Экран 2.8K – просто супер.', '-5 days'],
    [8, 'Мария Л.', 4, 'Клавиатура удобная, тачпад немного скользкий. В остальном всё хорошо.', '-12 days'],
    [14, 'Сергей П.', 5, 'Телевизор яркий, картинка чёткая. Smart-функции работают без лагов. Советую!', '-7 days'],
    [16, 'Ольга Н.', 5, 'Колонка звучит мощно для своего размера, IP67 реально работает – брала на дачу.', '-2 days'],
    [18, 'Артём Ж.', 5, 'Геймпад топ! Hall-стики не дрейфуют, держит заряд неделю. Для ПК и консоли подходит.', '-6 days'],
    [4, 'Елена Р.', 4, 'Часы удобные, GPS точный. Из минусов – ремешок тонковат.', '-15 days'],
    [3, 'Павел Т.', 5, 'Планшет стал основной рабочей машиной – стилус отзывчивый, экран большой.', '-8 days'],
    [21, 'Наталья Д.', 5, 'Пауэрбанк реально заряжает ноутбук. Дисплей с процентом – мелочь, а приятно.', '-1 days'],
    [10, 'Роман А.', 5, 'Монитор откалиброван отлично, 165 Гц чувствуются сразу. Для работы и игр – идеально.', '-4 days'],
    [17, 'Кирилл М.', 5, 'Приставка тихая, игры летают. За такую цену – лучший вариант.', '-9 days'],
  ];
  for (const r of reviewData) insertReview.run(...r);
}

function seedCatalogV2() {
  const categoryRefs = [
    ['Смартфоны и гаджеты', 'smartphones'],
    ['Компьютеры и периферия', 'parts'],
    ['Бытовая электроника', 'appliances'],
    ['Игры и консоли', 'gaming'],
    ['Аксессуары', 'accessories'],
    ['Аудио и звук', 'audio'],
  ];
  const catStmt = db.prepare('INSERT OR IGNORE INTO categories (name, slug) VALUES (?, ?)');
  for (const [name, slug] of categoryRefs) catStmt.run(name, slug);
  db.prepare("UPDATE categories SET name = 'Компьютеры и периферия' WHERE slug = 'parts'").run();

  const catId = slug => db.prepare('SELECT id FROM categories WHERE slug = ?').get(slug).id;

  const audioId = catId('audio');
  db.prepare(`
    UPDATE products SET category_id = ? WHERE id IN (5, 16)
  `).run(audioId);

  if (metaGet('seed_catalog_v2') === 'done') return;

  const extra = [

    ['smartphones', 'Смартфон Nova X5 Pro 256 ГБ', 'Флагман с 6.8" LTPO-экраном 144 Гц, камерой 200 Мп и зарядкой 100 Вт. Титан в отделке, IP68 и семь лет обновлений.', 34990, 39990, 'smartphone.jpg', 12, { 'Экран': '6.8" LTPO AMOLED, 144 Гц', 'Процессор': 'NovaCore X3 Ultra', 'Оперативная память': '12 ГБ', 'Накопитель': '256 ГБ', 'Камера': '200 + 50 + 12 Мп', 'Аккумулятор': '5500 мА·ч', 'Зарядка': '100 Вт', '5G': 'Да' }, 1],
    ['smartphones', 'Смартфон Aura Note 5G 128 ГБ', 'Сбалансированный смартфон с AMOLED 120 Гц, стереодинамиками и быстрой зарядкой. Хороший выбор на каждый день.', 17990, 20990, 'smartphone.jpg', 18, { 'Экран': '6.5" AMOLED, 120 Гц', 'Процессор': 'Aura N2', 'Оперативная память': '8 ГБ', 'Накопитель': '128 ГБ', 'Камера': '64 + 8 + 2 Мп', 'Аккумулятор': '5000 мА·ч', 'Зарядка': '33 Вт', '5G': 'Да' }, 0],
    ['smartphones', 'Планшет PixelPad Mini 8.7"', 'Компактный планшет с экраном 2.5K, поддержкой стилуса и защитой от случайных брызг. Помещается в рюкзак.', 15990, null, 'tablet.jpg', 14, { 'Экран': '8.7" IPS, 2560×1600, 90 Гц', 'Процессор': 'PixelPad A7', 'Оперативная память': '8 ГБ', 'Накопитель': '128 ГБ', 'Камера': '12 Мп', 'Аккумулятор': '5100 мА·ч', 'Стилус': 'В комплекте' }, 0],
    ['smartphones', 'Смарт-часы FitTrack Ultra', 'Титановые смарт-часы с ЭКГ, двойным GPS и автономностью до трёх недель. Для спорта и повседневности.', 14990, 17990, 'smartwatch.jpg', 16, { 'Экран': '1.5" AMOLED, 466×466', 'Корпус': 'Титан', 'GPS': 'Двухдиапазонный', 'Датчики': 'ЭКГ, SpO2, пульс', 'Защита': '10 ATM', 'Аккумулятор': 'до 21 дня' }, 1],
    ['smartphones', 'Экшн-камера ActionCam Pro 5K', 'Съёмка 5K при 60 кадрах в секунду, гиперстабилизация и два дисплея. Работает под водой без бокса.', 27990, null, 'camera.jpg', 8, { 'Видео': '5K 60 fps / 4K 120 fps', 'Стабилизация': 'HyperFlow 3.0', 'Защита': '12 м без бокса', 'Дисплеи': '2 (фронтальный и основной)', 'Аккумулятор': '180 мин' }, 0],
    ['smartphones', 'Дрон SkyHawk Mini', 'Компактный дрон весом 249 г: 4K 60 fps, 34 минуты полёта и передача сигнала до 12 км.', 24990, 28990, 'drone.jpg', 9, { 'Камера': '4K 60 fps, 1/1.3"', 'Время полёта': 'до 34 мин', 'Дальность': '12 км', 'Вес': '249 г', 'Датчики': 'Обход препятствий' }, 0],

    ['parts', 'Ноутбук Ultrabook Pro 16"', 'Рабочая станция в тонком корпусе: 3K OLED 120 Гц, 32 ГБ ОЗУ, RTX 4060 и 1 ТБ NVMe. Для дизайна, кода и монтажа.', 109990, 119990, 'laptop.jpg', 6, { 'Экран': '16" 3K OLED, 120 Гц', 'Процессор': 'Intel Core Ultra 7', 'Видеокарта': 'RTX 4060 8 ГБ', 'Оперативная память': '32 ГБ LPDDR5', 'Накопитель': 'SSD 1 ТБ', 'Вес': '1.8 кг', 'Аккумулятор': '99 Вт·ч' }, 1],
    ['parts', 'Ноутбук Ultrabook Go 15"', 'Лёгкий ноутбук для учёбы и офиса: быстрый SSD, матовый экран и до 12 часов автономной работы.', 49990, null, 'laptop.jpg', 13, { 'Экран': '15.6" Full HD IPS', 'Процессор': 'AMD Ryzen 5 7530U', 'Оперативная память': '16 ГБ', 'Накопитель': 'SSD 512 ГБ', 'Время работы': 'до 12 ч', 'Вес': '1.6 кг' }, 0],
    ['parts', 'Монитор ViewMax 32" 4K', '32-дюймовый 4K-монитор с HDR600, USB-C 90 Вт и точной цветопередачей. Один кабель для работы и зарядки.', 38990, null, 'monitor.jpg', 10, { 'Экран': '32" IPS, 3840×2160', 'Частота': '144 Гц', 'HDR': 'DisplayHDR 600', 'Порты': 'USB-C 90 Вт, HDMI 2.1, DP 1.4', 'Крепление': 'VESA 100×100' }, 0],
    ['parts', 'Видеокарта GeForce RTX 4070 12 ГБ', 'Производительная видеокарта для 2K-гейминга и творческих задач. DLSS 3, трассировка лучей и тихое охлаждение.', 59990, 64990, 'pcparts.jpg', 5, { 'Память': '12 ГБ GDDR6X', 'Частота': 'до 2.48 ГГц', 'Интерфейс': 'PCIe 4.0', 'Питание': '200 Вт, 8-pin', 'Выходы': '3×DP 1.4a, HDMI 2.1' }, 1],
    ['parts', 'Клавиатура MechKey TKL', 'Компактная механическая клавиатура без цифрового блока: hot-swap, PBT-кейкапы и беспроводной режим.', 5990, null, 'keyboard.jpg', 32, { 'Формат': 'TKL, 87 клавиш', 'Переключатели': 'Hot-swap, линейные', 'Кейкапы': 'PBT double-shot', 'Подключение': 'USB-C, Bluetooth, 2.4 ГГц', 'Подсветка': 'White backlight' }, 0],
    ['parts', 'Мышь ErgoPro Ultra 8K', 'Ультралёгкая мышь 58 г с частотой опроса 8000 Гц и сенсором 32 000 DPI. Для киберспорта.', 4990, 5990, 'mouse.jpg', 24, { 'Вес': '58 г', 'Сенсор': '32 000 DPI', 'Частота опроса': '8000 Гц', 'Подключение': '2.4 ГГц', 'Время работы': 'до 90 ч' }, 0],
    ['parts', 'Накопитель SSD NVMe 2 ТБ', 'Быстрый SSD PCIe 4.0 для игр, монтажа и больших библиотек. Скорость чтения до 7400 МБ/с.', 15990, null, 'ssd.jpg', 15, { 'Объём': '2 ТБ', 'Интерфейс': 'PCIe 4.0 ×4', 'Чтение': 'до 7400 МБ/с', 'Запись': 'до 6900 МБ/с', 'Гарантия': '5 лет' }, 0],

    ['appliances', 'Телевизор Vision 65" QLED', 'Большой QLED-телевизор с 120 Гц, Dolby Vision и игровым режимом. Кинематографичная картинка дома.', 89990, 99990, 'tv1.jpg', 4, { 'Экран': '65" QLED 4K', 'Частота': '120 Гц', 'HDR': 'Dolby Vision, HDR10+', 'Звук': '4.2.2, 60 Вт', 'HDMI': '4 × HDMI 2.1', 'Smart TV': 'VisionOS 3' }, 1],
    ['appliances', 'Телевизор Vision 32" Smart', 'Компактный Smart TV для кухни или спальни. Поддержка Wi-Fi, приложений и голосового поиска.', 14990, null, 'tv2.jpg', 20, { 'Экран': '32" HD', 'Smart TV': 'VisionOS Lite', 'Wi-Fi': '2.4/5 ГГц', 'HDMI': '2 порта', 'Звук': '2×8 Вт' }, 0],
    ['appliances', 'Саундбар BoomBox Cinema 5.1', 'Саундбар с беспроводным сабвуфером и Dolby Atmos. Превращает гостиную в маленький кинотеатр.', 24990, null, 'speaker.jpg', 11, { 'Каналы': '5.1', 'Мощность': '320 Вт', 'Звук': 'Dolby Atmos', 'Сабвуфер': 'Беспроводной', 'Порты': 'HDMI eARC, оптический, BT 5.3' }, 0],
    ['appliances', 'Проектор CinemaBeam 1080p', 'Проектор с автофокусом, Android TV и яркостью 4500 люмен. Картинка до 120 дюймов на любой стене.', 29990, 34990, 'tv2.jpg', 7, { 'Разрешение': 'Full HD 1080p', 'Яркость': '4500 люмен', 'Диагональ': 'до 120"', 'ОС': 'Android TV', 'Автофокус': 'Да', 'Порты': 'HDMI, USB, Wi-Fi' }, 0],

    ['gaming', 'Консоль GameBox S Digital', 'Цифровая версия игровой консоли с SSD 1 ТБ, 4K 120 fps и поддержкой трассировки лучей.', 39990, null, 'console.jpg', 8, { 'GPU': 'RDNA 2, 10.3 TFLOPS', 'CPU': '8 ядер Zen 2', 'Память': '16 ГБ GDDR6', 'Накопитель': '1 ТБ SSD', 'Выход': '4K 120 fps', 'Привод': 'Нет (Digital)' }, 0],
    ['gaming', 'Игровая гарнитура BoomBox X', 'Беспроводная гарнитура с 7.1-звуком, съёмным микрофоном и памятью из пены с эффектом памяти.', 8990, 10990, 'headphones.jpg', 25, { 'Звук': '7.1 Surround', 'Подключение': '2.4 ГГц + Bluetooth', 'Время работы': 'до 40 ч', 'Микрофон': 'Съёмный, шумоподавление', 'Вес': '290 г' }, 1],
    ['gaming', 'Гоночный руль DrivePro', 'Руль с обратной связью, педалями и углом поворота 900°. Полное погружение в гонки.', 24990, null, 'controller.jpg', 9, { 'Угол поворота': '900°', 'Обратная связь': 'Force Feedback', 'Педали': 'В комплекте', 'Платформы': 'PC, GameBox', 'Крепление': 'Струбцина' }, 0],
    ['gaming', 'VR-шлем VRZone 2 Pro', 'VR-шлем с 4K на каждый глаз, 120 Гц и pancake-линзами. Без компьютера, с библиотекой игр.', 49990, null, 'gaming.jpg', 5, { 'Экраны': '4K на глаз', 'Частота': '120 Гц', 'Линзы': 'Pancake', 'Трекинг': 'Inside-out 6DoF', 'Память': '256 ГБ', 'Время работы': '3 ч' }, 0],
    ['gaming', 'Игровое кресло AeroSeat', 'Эргономичное кресло с поддержкой поясницы, регулировкой подлокотников и дышащей сеткой.', 17990, 20990, 'gaming.jpg', 12, { 'Материал': 'Сетка + экокожа', 'Максимальная нагрузка': '150 кг', 'Регулировки': 'Высота, подлокотники, наклон', 'Колёса': '60 мм, тихие' }, 0],

    ['accessories', 'Зарядное устройство GaN 100 Вт', 'Компактный блок питания GaN на 100 Вт: два USB-C и два USB-A. Заряжает ноутбук и смартфон одновременно.', 3490, null, 'powerbank.jpg', 45, { 'Мощность': '100 Вт', 'Порты': '2×USB-C, 2×USB-A', 'Протоколы': 'PD 3.1, QC 4+', 'Вес': '180 г' }, 0],
    ['accessories', 'Кабель USB-C 240 Вт, 2 м', 'Нейлоновый кабель с поддержкой зарядки 240 Вт и передачи данных 480 Мбит/с. Усиленные коннекторы.', 1490, null, 'powerbank.jpg', 80, { 'Длина': '2 м', 'Мощность': '240 Вт', 'Разъёмы': 'USB-C – USB-C', 'Материал': 'Нейлоновая оплётка' }, 0],
    ['accessories', 'Пауэрбанк Volt Slim 10000', 'Тонкий пауэрбанк с магнитом, беспроводной зарядкой 15 Вт и дисплеем заряда.', 2490, null, 'powerbank.jpg', 55, { 'Ёмкость': '10 000 мА·ч', 'Беспроводная зарядка': '15 Вт', 'Порты': 'USB-C 20 Вт', 'Вес': '210 г' }, 0],
    ['accessories', 'Wi-Fi Mesh система NetCore 6', 'Два узла Wi-Fi 6E для равномерного покрытия до 250 м². Бесшовный роуминг и родительский контроль.', 12990, 14990, 'router.jpg', 18, { 'Стандарт': 'Wi-Fi 6E', 'Покрытие': 'до 250 м²', 'Узлы': '2 шт.', 'Скорость': 'до 3000 Мбит/с', 'Порты': '2.5G WAN + 2×LAN' }, 0],
    ['accessories', 'Веб-камера StreamCam 4K', '4K-камера с автофокусом, HDR и встроенными микрофонами. Для стримов, созвонов и записи курсов.', 8990, null, 'camera.jpg', 20, { 'Разрешение': '4K 30 fps / 1080p 60 fps', 'Автофокус': 'Да', 'Микрофоны': 'Двойные с шумоподавлением', 'Крепление': 'Клипса + штатив', 'Подключение': 'USB-C' }, 0],
    ['accessories', 'Док-станция USB-C 12-в-1', 'Превращает ноутбук в рабочую станцию: два 4K-дисплея, Ethernet, кардридер и зарядка 100 Вт.', 6990, null, 'pcparts.jpg', 22, { 'Порты': '2×HDMI, DP, 3×USB-A, 2×USB-C, RJ-45, SD', 'Зарядка': 'PD 100 Вт', 'Видео': '2×4K 60 Гц', 'Материал': 'Алюминий' }, 0],

    ['audio', 'Наушники StudioMax ANC', 'Полноразмерные наушники с адаптивным шумоподавлением, LDAC и автономностью 60 часов.', 14990, 17990, 'headphones.jpg', 21, { 'Тип': 'Накладные, беспроводные', 'Шумоподавление': 'Адаптивное ANC', 'Драйверы': '40 мм', 'Время работы': 'до 60 ч', 'Кодеки': 'LDAC, AAC, SBC', 'Вес': '250 г' }, 1],
    ['audio', 'TWS-наушники Buds Air 2', 'Компактные TWS-наушники с ANC, режимом прозрачности и защитой IPX5. 28 часов с кейсом.', 3990, 4990, 'earbuds.jpg', 50, { 'Тип': 'TWS', 'Шумоподавление': 'ANC', 'Время работы': '8 ч + 20 ч кейс', 'Защита': 'IPX5', 'Bluetooth': '5.4' }, 0],
    ['audio', 'Саундбар BoomBox Bar 2.1', 'Саундбар 2.1 с беспроводным сабвуфером, HDMI ARC и ночным режимом. Чистый звук без лишних проводов.', 14990, null, 'speaker.jpg', 15, { 'Каналы': '2.1', 'Мощность': '160 Вт', 'Сабвуфер': 'Беспроводной', 'Порты': 'HDMI ARC, оптический, USB', 'Bluetooth': '5.3' }, 0],
    ['audio', 'Наушники MixMaster Studio', 'Открытые студийные наушники с нейтральной АЧХ и съёмным кабелем. Для сведения и мониторинга.', 19990, null, 'headphones.jpg', 9, { 'Тип': 'Открытые, проводные', 'Импеданс': '250 Ом', 'Драйверы': '45 мм', 'Кабель': 'Съёмный, 3 м', 'Разъём': '6.3 мм + переходник' }, 0],
    ['audio', 'Колонка BoomBox Micro', 'Мини-колонка с ремешком, защитой IP67 и 12 часами работы. Звучит заметно крупнее своих размеров.', 2990, null, 'speaker.jpg', 60, { 'Мощность': '10 Вт', 'Время работы': '12 ч', 'Защита': 'IP67', 'Bluetooth': '5.3', 'Вес': '320 г' }, 0],
  ];

  const insert = db.prepare(`
    INSERT INTO products (category_id, name, description, price, old_price, image, stock, specs, is_featured)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const exists = db.prepare('SELECT id FROM products WHERE name = ?');

  db.exec('BEGIN');
  try {
    for (const row of extra) {
      if (exists.get(row[1])) continue;
      insert.run(catId(row[0]), row[1], row[2], row[3], row[4], row[5], row[6], JSON.stringify(row[7]), row[8]);
    }
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }

  metaSet('seed_catalog_v2', 'done');
}

function seedReviewsV2() {
  if (metaGet('seed_reviews_v2') === 'done') return;

  const reviews = [
    ['Смартфон Nova X5 Pro 256 ГБ', 'Алексей Г.', 5, 'Перешёл с прошлого флагмана – разница огромная. Экран яркий, камера ночью снимает без шума. Заряжается меньше чем за полчаса.'],
    ['Смартфон Nova X5 Pro 256 ГБ', 'Софья М.', 5, 'Взяла в титане, в руке лежит идеально. Отдельное спасибо консультанту за перенос данных.'],
    ['Смартфон Aura Note 5G 128 ГБ', 'Денис П.', 4, 'За свои деньги отличный аппарат. Камера днём супер, ночью средняя. Батареи хватает на полтора дня.'],
    ['Планшет PixelPad Mini 8.7"', 'Мария В.', 5, 'Маленький, но экран отличный. Стилус в комплекте – приятный бонус. Читаю и рисую каждый день.'],
    ['Смарт-часы FitTrack Ultra', 'Артур С.', 4, 'Автономность реально около трёх недель. ЭКГ работает, но приложение иногда подтормаживает.'],
    ['Экшн-камера ActionCam Pro 5K', 'Никита Р.', 5, 'Снимал подводную рыбалку – стабилизация как на стедикаме. Батарея держит заявленное время.'],
    ['Дрон SkyHawk Mini', 'Владимир Т.', 5, 'Для поездок идеальный: маленький, лёгкий, не нужно регистрировать. Картинка 4K отличная.'],
    ['Ноутбук Ultrabook Pro 16"', 'Екатерина Л.', 5, 'Экран OLED – отдельная любовь. Монтаж 4K летает, вентиляторы почти не слышно. Тяжёлый, но это ожидаемо.'],
    ['Ноутбук Ultrabook Go 15"', 'Илья К.', 4, 'Для учёбы хватает с головой. Экран матовый, клавиатура удобная. Зарядку держит весь день.'],
    ['Монитор ViewMax 32" 4K', 'Сергей Н.', 5, 'Цвета после калибровки почти идеальные. USB-C с зарядкой ноутбука – очень удобно.'],
    ['Видеокарта GeForce RTX 4070 12 ГБ', 'Роман Б.', 5, 'В 2K все игры на ультра. Тихая, под нагрузкой не греется выше 70 градусов.'],
    ['Клавиатура MechKey TKL', 'Антон Ф.', 4, 'Сборка отличная, звук приятный. Хотелось бы RGB, но белая подсветка выглядит строже.'],
    ['Мышь ErgoPro Ultra 8K', 'Кирилл Д.', 4, 'Лёгкая, сенсор точный. 8K частоту замечаешь в шутерах. Кабель в комплекте коротковат.'],
    ['Накопитель SSD NVMe 2 ТБ', 'Павел Щ.', 5, 'Игры загружаются мгновенно. Скорость соответствует заявленной.'],
    ['Телевизор Vision 65" QLED', 'Ольга Б.', 5, 'Картинка потрясающая, особенно Dolby Vision. Звук тоже достойный, саундбар пока не нужен.'],
    ['Телевизор Vision 32" Smart', 'Наталья К.', 4, 'На кухню – идеально. Приложения работают быстро, пульт удобный.'],
    ['Саундбар BoomBox Cinema 5.1', 'Артём В.', 4, 'Atmos слышно, сабвуфер мощный. Настройка заняла немного времени.'],
    ['Проектор CinemaBeam 1080p', 'Дмитрий Л.', 5, 'Смотрим кино на стене каждый вечер. Автофокус работает, картинка яркая даже днём.'],
    ['Консоль GameBox S Digital', 'Игорь С.', 4, 'Цифровая версия – то, что нужно, диски больше не покупаю. Тихо и быстро.'],
    ['Игровая гарнитура BoomBox X', 'Максим П.', 5, 'Микрофон чистый, в играх слышно всё. Держит заряд два дня активного использования.'],
    ['Гоночный руль DrivePro', 'Владислав Н.', 4, 'Обратная связь приятная, педали не скользят. Для начала в симрейсинге отлично.'],
    ['VR-шлем VRZone 2 Pro', 'Егор А.', 5, 'Разрешение высокое, сетка почти не видна. Pancake-линзы действительно компактные.'],
    ['Игровое кресло AeroSeat', 'Анастасия Р.', 5, 'Спина перестала уставать. Сетка дышит, сборка понятная.'],
    ['Зарядное устройство GaN 100 Вт', 'Тимур Ж.', 5, 'Заряжает ноутбук и телефон сразу. Размер маленький, в сумме не мешает.'],
    ['Кабель USB-C 240 Вт, 2 м', 'Виктор М.', 4, 'Толстый, надёжный, зарядка быстрая. Два метра – удобно.'],
    ['Пауэрбанк Volt Slim 10000', 'Лилия С.', 4, 'Тонкий и лёгкий, магнит держит хорошо. Беспроводная зарядка немного греется.'],
    ['Wi-Fi Mesh система NetCore 6', 'Андрей К.', 5, 'В квартире 90 м² теперь стабильный сигнал везде. Настройка заняла пять минут.'],
    ['Веб-камера StreamCam 4K', 'Ксения О.', 4, 'Картинка отличная, микрофон лучше встроенного в ноутбук. Автофокус немного шумный.'],
    ['Док-станция USB-C 12-в-1', 'Григорий Т.', 5, 'Два монитора 4K работают без проблем, ноутбук заряжается. Алюминий приятный.'],
    ['Наушники StudioMax ANC', 'Елина Д.', 5, 'Шумоподавление на уровне, LDAC слышно сразу. Сидят комфортно даже после нескольких часов.'],
    ['TWS-наушники Buds Air 2', 'Валерия М.', 4, 'Для города отличные: лёгкие, ANC есть. Кейс чуть скользкий.'],
    ['Саундбар BoomBox Bar 2.1', 'Олег С.', 4, 'Звук стал намного лучше телевизора. HDMI ARC всё упростил.'],
    ['Наушники MixMaster Studio', 'Александр Б.', 5, 'Свожу на них треки – детали слышны. Открытые, но это ожидаемо. Кабель хороший.'],
    ['Колонка BoomBox Micro', 'Юлия Н.', 5, 'Беру в поездки, звук для такого размера удивительный. Не боится воды.'],
  ];

  const findProduct = db.prepare('SELECT id FROM products WHERE name = ?');
  const insert = db.prepare(`
    INSERT INTO reviews (product_id, author_name, rating, text, created_at)
    VALUES (?, ?, ?, ?, datetime('now','localtime', ?))
  `);

  db.exec('BEGIN');
  try {
    reviews.forEach((row, index) => {
      const product = findProduct.get(row[0]);
      if (!product) return;
      const offset = `-${(index % 20) + 1} days`;
      insert.run(product.id, row[1], row[2], row[3], offset);
    });
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }

  metaSet('seed_reviews_v2', 'done');
}

function seedDemoData() {
  if (metaGet('seed_demo_v1') === 'done') return;

  const insertUser = db.prepare(`
    INSERT INTO users (username, email, password_hash, role) VALUES (?, ?, ?, 'customer')
  `);
  const findUser = db.prepare('SELECT id FROM users WHERE username = ? OR email = ?');
  const demoUsers = [
    ['alexey', 'alexey@example.com', 'demo123'],
    ['marina', 'marina@example.com', 'demo123'],
    ['igor', 'igor@example.com', 'demo123'],
  ];
  for (const [username, email, password] of demoUsers) {
    if (!findUser.get(username, email)) {
      insertUser.run(username, email, hashPassword(password));
    }
  }

  const findProduct = db.prepare('SELECT id, name, price FROM products WHERE name = ?');
  const orders = [
    {
      customer_name: 'Марина Волкова', email: 'marina@example.com', phone: '+7 (922) 145-67-89',
      city: 'Оренбург', postal_code: '460000', address: 'ул. Советская, 24, кв. 12',
      delivery_method: 'courier', payment_method: 'card_online', status: 'done', daysAgo: 12,
      items: [['Ноутбук Ultrabook Air 14"', 1], ['Клавиатура MechKey RGB', 1]],
    },
    {
      customer_name: 'Игорь Соколов', email: 'igor@example.com', phone: '+7 (903) 221-45-12',
      city: 'Оренбург', postal_code: '460001', address: 'пр-кт Победы, 148, кв. 7',
      delivery_method: 'pickup', payment_method: 'card_pickup', status: 'done', daysAgo: 9,
      items: [['Консоль GameBox S', 1], ['Геймпад Pro Controller', 1]],
    },
    {
      customer_name: 'Алексей Гордеев', email: 'alexey@example.com', phone: '+7 (987) 334-78-01',
      city: 'Оренбург', postal_code: '460018', address: 'ул. Чкалова, 55, кв. 31',
      delivery_method: 'courier', payment_method: 'card_online', status: 'shipping', daysAgo: 5,
      items: [['Смартфон Nova X5 128 ГБ', 1]],
    },
    {
      customer_name: 'Марина Волкова', email: 'marina@example.com', phone: '+7 (922) 145-67-89',
      city: 'Оренбург', postal_code: '460000', address: 'ул. Советская, 24, кв. 12',
      delivery_method: 'courier', payment_method: 'card_online', status: 'packed', daysAgo: 4,
      items: [['Монитор ViewMax 27" QHD', 1], ['Мышь ErgoPro Wireless', 1]],
    },
    {
      customer_name: 'Алексей Гордеев', email: 'alexey@example.com', phone: '+7 (987) 334-78-01',
      city: 'Оренбург', postal_code: '460018', address: 'ул. Чкалова, 55, кв. 31',
      delivery_method: 'pickup', payment_method: 'card_online', status: 'paid', daysAgo: 3,
      items: [['Смартфон Nova X5 Pro 256 ГБ', 1]],
    },
    {
      customer_name: 'Игорь Соколов', email: 'igor@example.com', phone: '+7 (903) 221-45-12',
      city: 'Оренбург', postal_code: '460001', address: 'пр-кт Победы, 148, кв. 7',
      delivery_method: 'courier', payment_method: 'card_online', status: 'new', daysAgo: 1,
      items: [['Телевизор Vision 55" 4K', 1]],
    },
    {
      customer_name: 'Ольга Белова', email: 'olga@example.com', phone: '+7 (909) 556-90-33',
      city: 'Оренбург', postal_code: '460040', address: 'ул. Терешковой, 10, кв. 92',
      delivery_method: 'post', payment_method: 'card_online', status: 'done', daysAgo: 7,
      items: [['Наушники StudioMax ANC', 1], ['Колонка BoomBox Micro', 1]],
    },
    {
      customer_name: 'Марина Волкова', email: 'marina@example.com', phone: '+7 (922) 145-67-89',
      city: 'Оренбург', postal_code: '460000', address: 'ул. Советская, 24, кв. 12',
      delivery_method: 'courier', payment_method: 'cash', status: 'cancelled', daysAgo: 2,
      items: [['Смарт-часы FitTrack Pro', 1]],
    },
  ];

  const insertOrder = db.prepare(`
    INSERT INTO orders (order_number, user_id, customer_name, email, phone, city, postal_code,
                        address, delivery_method, payment_method, total, status, comment, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now','localtime', ?))
  `);
  const insertItem = db.prepare(`
    INSERT INTO order_items (order_id, product_id, name, price, qty) VALUES (?, ?, ?, ?, ?)
  `);
  const updateNumber = db.prepare('UPDATE orders SET order_number = ? WHERE id = ?');

  db.exec('BEGIN');
  try {
    for (const [index, order] of orders.entries()) {
      let total = 0;
      const lines = [];
      for (const [name, qty] of order.items) {
        const product = findProduct.get(name);
        if (!product) continue;
        total += product.price * qty;
        lines.push({ product, qty });
      }
      if (!lines.length) continue;
      const info = insertOrder.run(
        `TMP-${Date.now()}-${index}`, null, order.customer_name, order.email, order.phone,
        order.city, order.postal_code, order.address, order.delivery_method,
        order.payment_method, total, order.status,
        index === 5 ? 'Позвонить за час до доставки' : null,
        `-${order.daysAgo} days`
      );
      const orderId = Number(info.lastInsertRowid);
      updateNumber.run(`ТМ-${String(orderId).padStart(5, '0')}`, orderId);
      for (const line of lines) {
        insertItem.run(orderId, line.product.id, line.product.name, line.product.price, line.qty);
      }
    }

    const insertMessage = db.prepare(`
      INSERT INTO messages (name, email, phone, subject, message, is_read, created_at)
      VALUES (?, ?, ?, ?, ?, ?, datetime('now','localtime', ?))
    `);
    insertMessage.run('Артём', 'artem@example.com', '+7 (912) 345-67-89', 'Вопрос о товаре',
      'Здравствуйте! Подскажите, есть ли Nova X5 Pro в титановом цвете и можно ли приехать посмотреть сегодня вечером?', 0, '-2 hours');
    insertMessage.run('Светлана', 'sveta@example.com', null, 'Заказ и доставка',
      'Можно ли изменить адрес доставки в заказе ТМ-00006? Телефон тот же.', 0, '-6 hours');
    insertMessage.run('ООО «ТехСнаб»', 'partner@example.com', '+7 (3532) 44-55-66', 'Сотрудничество',
      'Предлагаем поставки периферии и аксессуаров напрямую. Пришлите, пожалуйста, контакты закупщика.', 1, '-3 days');

    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    console.error(e);
  }

  metaSet('seed_demo_v1', 'done');
}

function seedParsedCatalog() {
  if (metaGet('seed_parsed_catalog') === 'done') return;
  const catalogFile = path.join(__dirname, 'catalog.json');
  if (!fs.existsSync(catalogFile)) return;

  const parsed = JSON.parse(fs.readFileSync(catalogFile, 'utf8'));
  if (!Array.isArray(parsed.products)) return;

  const categoryIds = new Map(db.prepare('SELECT id, slug FROM categories').all().map((row) => [row.slug, row.id]));
  const findProduct = db.prepare('SELECT id, name FROM products WHERE id = ?');
  const updateProduct = db.prepare(`
    UPDATE products
    SET category_id = ?, name = ?, description = ?, price = ?, old_price = ?,
        image = ?, stock = ?, specs = ?, is_featured = ?,
        updated_at = datetime('now','localtime')
    WHERE id = ?
  `);
  const updateOrderItem = db.prepare('UPDATE order_items SET name = ? WHERE product_id = ? AND name = ?');
  const imageDir = path.join(__dirname, '..', '..', 'public', 'images', 'products');

  db.exec('BEGIN');
  try {
    for (const item of parsed.products) {
      const current = findProduct.get(item.id);
      if (!current || !categoryIds.has(item.category)) continue;
      if (!fs.existsSync(path.join(imageDir, item.image))) continue;
      updateProduct.run(
        categoryIds.get(item.category),
        item.name,
        item.description,
        item.price,
        item.oldPrice == null ? null : item.oldPrice,
        item.image,
        item.stock,
        JSON.stringify(item.specs || {}),
        item.featured ? 1 : 0,
        item.id
      );
      updateOrderItem.run(item.name, item.id, current.name);
    }
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }

  metaSet('seed_parsed_catalog', 'done');
}

function ensureAdmin() {
  const admin = db.prepare("SELECT id FROM users WHERE role = 'admin' LIMIT 1").get();
  if (admin) return;
  const exists = db.prepare('SELECT id FROM users WHERE username = ? OR email = ?').get('admin', 'admin@technomir.ru');
  if (exists) {
    db.prepare("UPDATE users SET role = 'admin' WHERE id = ?").run(exists.id);
    return;
  }
  db.prepare(`INSERT INTO users (username, email, password_hash, role) VALUES (?, ?, ?, 'admin')`)
    .run('admin', 'admin@technomir.ru', hashPassword('admin123'));
  console.log('Создан администратор: admin / admin123');
}

function initDatabase() {
  db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'customer',
    token TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );

  CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE
  );

  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category_id INTEGER NOT NULL REFERENCES categories(id),
    name TEXT NOT NULL,
    description TEXT NOT NULL,
    price REAL NOT NULL,
    old_price REAL,
    image TEXT NOT NULL,
    stock INTEGER NOT NULL DEFAULT 0,
    specs TEXT NOT NULL DEFAULT '{}',
    is_featured INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );

  CREATE TABLE IF NOT EXISTS reviews (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    author_name TEXT NOT NULL,
    rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
    text TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );

  CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_number TEXT NOT NULL UNIQUE,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    customer_name TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT NOT NULL,
    city TEXT,
    postal_code TEXT,
    address TEXT NOT NULL,
    delivery_method TEXT NOT NULL,
    payment_method TEXT NOT NULL,
    total REAL NOT NULL,
    status TEXT NOT NULL DEFAULT 'new',
    comment TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );

  CREATE TABLE IF NOT EXISTS order_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    price REAL NOT NULL,
    qty INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT,
    subject TEXT,
    message TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );

  CREATE TABLE IF NOT EXISTS meta (
    key TEXT PRIMARY KEY,
    value TEXT
  );
  `);

  const orderColumns = db.prepare('PRAGMA table_info(orders)').all().map(c => c.name);
  if (!orderColumns.includes('city')) db.exec('ALTER TABLE orders ADD COLUMN city TEXT');
  if (!orderColumns.includes('postal_code')) db.exec('ALTER TABLE orders ADD COLUMN postal_code TEXT');

  const productColumns = db.prepare('PRAGMA table_info(products)').all().map(c => c.name);
  if (!productColumns.includes('is_active')) db.exec('ALTER TABLE products ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1');
  if (!productColumns.includes('updated_at')) db.exec('ALTER TABLE products ADD COLUMN updated_at TEXT');

  const messageColumns = db.prepare('PRAGMA table_info(messages)').all().map(c => c.name);
  if (!messageColumns.includes('is_read')) db.exec('ALTER TABLE messages ADD COLUMN is_read INTEGER NOT NULL DEFAULT 0');

  db.exec("UPDATE products SET specs = REPLACE(specs, 'Бluetooth', 'Bluetooth') WHERE specs LIKE '%Бluetooth%'");

  seedBase();
  seedCatalogV2();
  seedReviewsV2();
  seedDemoData();
  seedParsedCatalog();
  ensureAdmin();
  return db;
}

module.exports = { initDatabase };
