const express = require('express');
const crypto = require('crypto');
const { db, hashPassword, verifyPassword } = require('../models/database');

const router = express.Router();

const STATUSES = {
  new: 'Новый',
  paid: 'Оплачен',
  packed: 'Укомплектован',
  shipping: 'В доставке',
  done: 'Выполнен',
  cancelled: 'Отменён'
};
const DELIVERY_METHODS = ['courier', 'pickup', 'post'];
const PAYMENT_METHODS = ['card_online', 'card_pickup', 'cash'];

function statusText(order) {
  if (order.status === 'shipping' && order.delivery_method === 'pickup') return 'Готов к выдаче';
  return STATUSES[order.status] || order.status;
}

function authUser(req) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return null;
  return db.prepare('SELECT id, username, email, role FROM users WHERE token = ?').get(token) || null;
}

function requireAuth(req, res) {
  const user = authUser(req);
  if (!user) {
    res.status(401).json({ error: 'Требуется авторизация' });
    return null;
  }
  return user;
}

function requireAdmin(req, res) {
  const user = authUser(req);
  if (!user) {
    res.status(401).json({ error: 'Требуется авторизация' });
    return null;
  }
  if (user.role !== 'admin') {
    res.status(403).json({ error: 'Доступ только для администратора' });
    return null;
  }
  return user;
}

function asInt(value) {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? n : null;
}

function parseSpecs(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
    } catch {}
  }
  return {};
}

function productWithStats(id) {
  const product = db.prepare(`
    SELECT p.*, c.name AS category_name, c.slug AS category_slug
    FROM products p JOIN categories c ON c.id = p.category_id
    WHERE p.id = ?
  `).get(id);
  if (!product) return null;
  product.specs = parseSpecs(product.specs);
  const stats = db.prepare(`
    SELECT ROUND(AVG(rating), 1) AS rating, COUNT(*) AS review_count
    FROM reviews WHERE product_id = ?
  `).get(product.id);
  return { ...product, rating: stats.rating, review_count: stats.review_count };
}

function validateProductPayload(body, existing = null) {
  const errors = [];
  const name = String(body.name || '').trim();
  const description = String(body.description || '').trim();
  const image = String(body.image || '').trim();
  const categoryId = asInt(body.category_id);
  const price = Number(body.price);
  const oldPriceRaw = body.old_price;
  const oldPrice = oldPriceRaw === '' || oldPriceRaw === null || oldPriceRaw === undefined ? null : Number(oldPriceRaw);
  const stock = asInt(body.stock);
  const specs = parseSpecs(body.specs);
  const isFeatured = body.is_featured ? 1 : 0;
  const isActive = body.is_active === undefined || body.is_active === null
    ? (existing ? Number(existing.is_active) : 1)
    : (body.is_active ? 1 : 0);

  if (name.length < 2) errors.push('Название – минимум 2 символа');
  if (!description || description.length < 10) errors.push('Описание – минимум 10 символов');
  if (!image) errors.push('Укажите изображение');
  if (!categoryId || !db.prepare('SELECT id FROM categories WHERE id = ?').get(categoryId)) errors.push('Выберите категорию');
  if (!Number.isFinite(price) || price <= 0) errors.push('Цена должна быть больше нуля');
  if (oldPrice !== null && (!Number.isFinite(oldPrice) || oldPrice <= 0)) errors.push('Старая цена указана неверно');
  if (stock === null || stock < 0) errors.push('Остаток должен быть неотрицательным');

  const cleanSpecs = {};
  for (const [key, value] of Object.entries(specs)) {
    const k = String(key).trim();
    const v = String(value ?? '').trim();
    if (k && v) cleanSpecs[k] = v;
  }

  return {
    errors,
    data: {
      name,
      description,
      image,
      category_id: categoryId,
      price: Math.round(price * 100) / 100,
      old_price: oldPrice === null ? null : Math.round(oldPrice * 100) / 100,
      stock,
      specs: cleanSpecs,
      is_featured: isFeatured,
      is_active: isActive
    }
  };
}

router.get('/api/categories', (req, res) => {
  const rows = db.prepare(`
    SELECT c.id, c.name, c.slug, COUNT(p.id) AS product_count
    FROM categories c
    LEFT JOIN products p ON p.category_id = c.id AND p.is_active = 1
    GROUP BY c.id
    ORDER BY c.id
  `).all();
  res.json(rows);
});

router.get('/api/products', (req, res) => {
  const { category, q, sort, min, max, featured, ids, in_stock } = req.query;
  const where = ['p.is_active = 1'];
  const params = [];

  if (ids) {
    const parts = String(ids).split(',').map(Number).filter(n => Number.isInteger(n) && n > 0);
    if (!parts.length) return res.json([]);
    where.push(`p.id IN (${parts.map(() => '?').join(',')})`);
    params.push(...parts);
  }
  if (category) {
    const parts = String(category).split(',').map(s => s.trim()).filter(Boolean);
    const conds = [];
    for (const part of parts) {
      conds.push('(c.slug = ? OR c.id = ?)');
      params.push(part, isNaN(+part) ? -1 : +part);
    }
    where.push('(' + conds.join(' OR ') + ')');
  }
  if (q) {
    where.push('(p.name LIKE ? OR p.description LIKE ?)');
    params.push(`%${q}%`, `%${q}%`);
  }
  if (min !== undefined && min !== '') {
    where.push('p.price >= ?');
    params.push(+min);
  }
  if (max !== undefined && max !== '') {
    where.push('p.price <= ?');
    params.push(+max);
  }
  if (featured === '1') where.push('p.is_featured = 1');
  if (in_stock === '1') where.push('p.stock > 0');

  let orderBy = 'p.is_featured DESC, p.id DESC';
  if (sort === 'price_asc') orderBy = 'p.price ASC';
  else if (sort === 'price_desc') orderBy = 'p.price DESC';
  else if (sort === 'name') orderBy = 'p.name COLLATE NOCASE ASC';
  else if (sort === 'new') orderBy = 'p.id DESC';
  else if (sort === 'rating') orderBy = '(SELECT AVG(r.rating) FROM reviews r WHERE r.product_id = p.id) DESC, p.id DESC';
  else if (sort === 'popular') orderBy = '(SELECT COUNT(*) FROM reviews r WHERE r.product_id = p.id) DESC, p.id DESC';

  const sql = `
    SELECT p.id, p.name, p.description, p.price, p.old_price, p.image, p.stock,
            p.is_featured, p.specs,
            c.name AS category_name, c.slug AS category_slug,
            (SELECT ROUND(AVG(r.rating), 1) FROM reviews r WHERE r.product_id = p.id) AS rating,
            (SELECT COUNT(*) FROM reviews r WHERE r.product_id = p.id) AS review_count
    FROM products p
    JOIN categories c ON c.id = p.category_id
    WHERE ${where.join(' AND ')}
    ORDER BY ${orderBy}
  `;
  const rows = db.prepare(sql).all(...params);
  rows.forEach(row => { row.specs = parseSpecs(row.specs); });
  res.json(rows);
});

router.get('/api/products/:id', (req, res) => {
  const product = productWithStats(req.params.id);
  if (!product || !product.is_active) return res.status(404).json({ error: 'Товар не найден' });
  res.json(product);
});

router.get('/api/products/:id/reviews', (req, res) => {
  const rows = db.prepare(`
    SELECT id, author_name, rating, text, created_at
    FROM reviews WHERE product_id = ?
    ORDER BY created_at DESC, id DESC
  `).all(req.params.id);
  res.json(rows);
});

router.post('/api/products/:id/reviews', (req, res) => {
  const product = db.prepare('SELECT id FROM products WHERE id = ? AND is_active = 1').get(req.params.id);
  if (!product) return res.status(404).json({ error: 'Товар не найден' });

  const { author_name, rating, text } = req.body || {};
  if (!author_name || !String(author_name).trim()) return res.status(400).json({ error: 'Укажите имя' });
  if (!rating || rating < 1 || rating > 5) return res.status(400).json({ error: 'Оценка от 1 до 5' });
  if (!text || String(text).trim().length < 5) return res.status(400).json({ error: 'Напишите текст отзыва' });

  const user = authUser(req);
  const info = db.prepare(`
    INSERT INTO reviews (product_id, user_id, author_name, rating, text)
    VALUES (?, ?, ?, ?, ?)
  `).run(product.id, user ? user.id : null, String(author_name).trim(), +rating, String(text).trim());
  res.status(201).json({ id: info.lastInsertRowid });
});

router.get('/api/reviews/latest', (req, res) => {
  const limit = Math.min(Math.max(parseInt(req.query.limit) || 6, 1), 24);
  const rows = db.prepare(`
    SELECT r.id, r.author_name, r.rating, r.text, r.created_at,
            p.id AS product_id, p.name AS product_name
    FROM reviews r
    JOIN products p ON p.id = r.product_id
    WHERE p.is_active = 1
    ORDER BY r.created_at DESC, r.id DESC
    LIMIT ?
  `).all(limit);
  res.json(rows);
});

router.post('/api/auth/register', (req, res) => {
  const { username, email, password } = req.body || {};
  if (!username || String(username).trim().length < 3) return res.status(400).json({ error: 'Логин – минимум 3 символа' });
  if (!email || !/^\S+@\S+\.\S+$/.test(String(email))) return res.status(400).json({ error: 'Некорректный email' });
  if (!password || String(password).length < 6) return res.status(400).json({ error: 'Пароль – минимум 6 символов' });

  const exists = db.prepare('SELECT id FROM users WHERE username = ? OR email = ?').get(String(username).trim(), String(email).trim());
  if (exists) return res.status(409).json({ error: 'Пользователь с таким логином или email уже существует' });

  const token = crypto.randomBytes(32).toString('hex');
  db.prepare('INSERT INTO users (username, email, password_hash, token) VALUES (?, ?, ?, ?)')
    .run(String(username).trim(), String(email).trim(), hashPassword(password), token);
  res.status(201).json({ token, username: String(username).trim(), email: String(email).trim(), role: 'customer' });
});

router.post('/api/auth/login', (req, res) => {
  const { login, password } = req.body || {};
  if (!login || !password) return res.status(400).json({ error: 'Введите логин и пароль' });

  const user = db.prepare('SELECT * FROM users WHERE username = ? OR email = ?').get(login, login);
  if (!user || !verifyPassword(password, user.password_hash)) {
    return res.status(401).json({ error: 'Неверный логин или пароль' });
  }
  const token = crypto.randomBytes(32).toString('hex');
  db.prepare('UPDATE users SET token = ? WHERE id = ?').run(token, user.id);
  res.json({ token, username: user.username, email: user.email, role: user.role });
});

router.post('/api/auth/logout', (req, res) => {
  const user = authUser(req);
  if (user) db.prepare('UPDATE users SET token = NULL WHERE id = ?').run(user.id);
  res.json({ ok: true });
});

router.get('/api/auth/me', (req, res) => {
  const user = authUser(req);
  if (!user) return res.status(401).json({ error: 'Не авторизован' });
  res.json(user);
});

router.post('/api/orders', (req, res) => {
  const user = authUser(req);
  const {
    customer_name, email, phone, city, postal_code, address,
    delivery_method, payment_method, comment, items
  } = req.body || {};

  if (!customer_name || !email || !phone || !city || !address) {
    return res.status(400).json({ error: 'Заполните все поля получателя' });
  }
  if (!/^\S+@\S+\.\S+$/.test(String(email))) return res.status(400).json({ error: 'Некорректный email' });
  if (!DELIVERY_METHODS.includes(delivery_method)) return res.status(400).json({ error: 'Некорректный способ доставки' });
  if (!PAYMENT_METHODS.includes(payment_method)) return res.status(400).json({ error: 'Некорректный способ оплаты' });
  if (delivery_method === 'post' && !String(postal_code || '').trim()) {
    return res.status(400).json({ error: 'Для отправки транспортной компанией укажите индекс' });
  }
  if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ error: 'Корзина пуста' });

  const cart = db.prepare('SELECT id, name, price, stock FROM products WHERE id = ? AND is_active = 1');
  const lines = [];
  let total = 0;
  for (const it of items) {
    const qty = Math.floor(+it.qty);
    if (!qty || qty < 1 || qty > 99) return res.status(400).json({ error: 'Некорректное количество товара' });
    const p = cart.get(+it.id);
    if (!p) return res.status(400).json({ error: `Товар #${it.id} не найден` });
    if (p.stock < qty) return res.status(400).json({ error: `«${p.name}»: недостаточно на складе (осталось ${p.stock})` });
    lines.push({ product: p, qty });
    total += p.price * qty;
  }
  total = Math.round(total * 100) / 100;

  const nextId = db.prepare('SELECT COALESCE(MAX(id), 0) + 1 AS id FROM orders').get().id;
  const orderNumber = `ТМ-${String(nextId).padStart(5, '0')}`;

  const insertOrder = db.prepare(`
    INSERT INTO orders (id, order_number, user_id, customer_name, email, phone, city, postal_code,
                        address, delivery_method, payment_method, total, comment)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertItem = db.prepare(`
    INSERT INTO order_items (order_id, product_id, name, price, qty) VALUES (?, ?, ?, ?, ?)
  `);
  const decStock = db.prepare('UPDATE products SET stock = stock - ? WHERE id = ?');

  db.exec('BEGIN');
  try {
    insertOrder.run(nextId, orderNumber, user ? user.id : null, String(customer_name).trim(),
      String(email).trim(), String(phone).trim(), String(city).trim(),
      postal_code ? String(postal_code).trim() : null, String(address).trim(),
      delivery_method, payment_method, total, comment ? String(comment).trim() : null);
    for (const line of lines) {
      insertItem.run(nextId, line.product.id, line.product.name, line.product.price, line.qty);
      decStock.run(line.qty, line.product.id);
    }
    db.exec('COMMIT');
    res.status(201).json({ order_id: nextId, order_number: orderNumber, total });
  } catch (e) {
    db.exec('ROLLBACK');
    console.error(e);
    res.status(500).json({ error: 'Ошибка при создании заказа' });
  }
});

router.get('/api/orders/track', (req, res) => {
  const { number, phone } = req.query;
  if (!number || !phone) return res.status(400).json({ error: 'Укажите номер заказа и телефон' });
  const order = db.prepare(`
    SELECT id, order_number, customer_name, total, status, delivery_method, payment_method,
            city, postal_code, address, created_at, comment
    FROM orders WHERE order_number = ? AND phone = ?
  `).get(String(number).trim(), String(phone).trim());
  if (!order) return res.status(404).json({ error: 'Заказ не найден. Проверьте номер и телефон.' });
  order.items = db.prepare('SELECT product_id, name, price, qty FROM order_items WHERE order_id = ?').all(order.id);
  order.status_text = statusText(order);
  res.json(order);
});

router.get('/api/orders/my', (req, res) => {
  const user = requireAuth(req, res);
  if (!user) return;
  const orders = db.prepare(`
    SELECT id, order_number, total, status, created_at, delivery_method, city, address
    FROM orders WHERE user_id = ? ORDER BY id DESC
  `).all(user.id);
  const itemStmt = db.prepare('SELECT product_id, name, price, qty FROM order_items WHERE order_id = ?');
  orders.forEach(o => {
    o.items = itemStmt.all(o.id);
    o.status_text = statusText(o);
  });
  res.json(orders);
});

router.post('/api/messages', (req, res) => {
  const { name, email, phone, subject, message } = req.body || {};
  if (!name || !email || !message) return res.status(400).json({ error: 'Заполните имя, email и сообщение' });
  db.prepare('INSERT INTO messages (name, email, phone, subject, message) VALUES (?, ?, ?, ?, ?)')
    .run(String(name).trim(), String(email).trim(), phone ? String(phone).trim() : null,
      subject ? String(subject).trim() : null, String(message).trim());
  res.status(201).json({ ok: true });
});

router.get('/api/stats', (req, res) => {
  const products = db.prepare('SELECT COUNT(*) AS c FROM products WHERE is_active = 1').get().c;
  const orders = db.prepare('SELECT COUNT(*) AS c FROM orders').get().c;
  const categories = db.prepare('SELECT COUNT(*) AS c FROM categories').get().c;
  const customers = db.prepare("SELECT COUNT(*) AS c FROM users WHERE role = 'customer'").get().c;
  const reviews = db.prepare('SELECT COUNT(*) AS c FROM reviews').get().c;
  const rating = db.prepare('SELECT ROUND(AVG(rating), 1) AS r FROM reviews').get().r || 4.9;
  res.json({ products, orders, categories, customers, reviews, rating });
});

router.get('/api/admin/overview', (req, res) => {
  const admin = requireAdmin(req, res);
  if (!admin) return;

  const revenueRow = db.prepare("SELECT COALESCE(SUM(total), 0) AS v FROM orders WHERE status != 'cancelled'").get();
  const revenue30 = db.prepare(`
    SELECT COALESCE(SUM(total), 0) AS v FROM orders
    WHERE status != 'cancelled' AND date(created_at) >= date('now','localtime','-29 days')
  `).get().v;
  const revenuePrev30 = db.prepare(`
    SELECT COALESCE(SUM(total), 0) AS v FROM orders
    WHERE status != 'cancelled'
      AND date(created_at) >= date('now','localtime','-59 days')
      AND date(created_at) < date('now','localtime','-29 days')
  `).get().v;
  const ordersCount = db.prepare('SELECT COUNT(*) AS c FROM orders').get().c;
  const newOrders = db.prepare("SELECT COUNT(*) AS c FROM orders WHERE status = 'new'").get().c;
  const productsCount = db.prepare('SELECT COUNT(*) AS c FROM products WHERE is_active = 1').get().c;
  const lowStock = db.prepare('SELECT COUNT(*) AS c FROM products WHERE is_active = 1 AND stock <= 3').get().c;
  const usersCount = db.prepare("SELECT COUNT(*) AS c FROM users WHERE role = 'customer'").get().c;
  const unreadMessages = db.prepare('SELECT COUNT(*) AS c FROM messages WHERE is_read = 0').get().c;
  const reviewsCount = db.prepare('SELECT COUNT(*) AS c FROM reviews').get().c;
  const avgOrder = db.prepare("SELECT COALESCE(AVG(total), 0) AS v FROM orders WHERE status != 'cancelled'").get().v;

  const byStatus = db.prepare('SELECT status, COUNT(*) AS count FROM orders GROUP BY status').all();

  const seriesRows = db.prepare(`
    SELECT date(created_at) AS day, COALESCE(SUM(total), 0) AS total, COUNT(*) AS count
    FROM orders
    WHERE status != 'cancelled' AND date(created_at) >= date('now','localtime','-13 days')
    GROUP BY date(created_at)
  `).all();
  const seriesMap = new Map(seriesRows.map(row => [row.day, row]));
  const series = [];
  for (let i = 13; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    const row = seriesMap.get(key);
    series.push({
      day: key,
      label: date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }),
      total: row ? Number(row.total) : 0,
      count: row ? Number(row.count) : 0
    });
  }

  const recentOrders = db.prepare(`
    SELECT id, order_number, customer_name, total, status, created_at
    FROM orders ORDER BY id DESC LIMIT 6
  `).all();

  const topProducts = db.prepare(`
    SELECT oi.product_id AS id, oi.name, SUM(oi.qty) AS sold, SUM(oi.qty * oi.price) AS revenue
    FROM order_items oi
    JOIN orders o ON o.id = oi.order_id
    WHERE o.status != 'cancelled'
    GROUP BY oi.product_id, oi.name
    ORDER BY sold DESC LIMIT 5
  `).all();

  const lowStockProducts = db.prepare(`
    SELECT id, name, stock, image FROM products
    WHERE is_active = 1 AND stock <= 3 ORDER BY stock ASC, id DESC LIMIT 5
  `).all();

  res.json({
    revenue: Number(revenueRow.v),
    revenue30: Number(revenue30),
    revenuePrev30: Number(revenuePrev30),
    orders: ordersCount,
    newOrders,
    products: productsCount,
    lowStock,
    users: usersCount,
    unreadMessages,
    reviews: reviewsCount,
    avgOrder: Math.round(Number(avgOrder)),
    byStatus,
    series,
    recentOrders,
    topProducts,
    lowStockProducts
  });
});

router.get('/api/admin/products', (req, res) => {
  const admin = requireAdmin(req, res);
  if (!admin) return;
  const { q, category } = req.query;
  const where = [];
  const params = [];
  if (q) {
    where.push('(p.name LIKE ? OR p.description LIKE ?)');
    params.push(`%${q}%`, `%${q}%`);
  }
  if (category && category !== 'all') {
    where.push('p.category_id = ?');
    params.push(+category);
  }
  const rows = db.prepare(`
    SELECT p.*, c.name AS category_name, c.slug AS category_slug,
            (SELECT ROUND(AVG(r.rating), 1) FROM reviews r WHERE r.product_id = p.id) AS rating,
            (SELECT COUNT(*) FROM reviews r WHERE r.product_id = p.id) AS review_count
    FROM products p JOIN categories c ON c.id = p.category_id
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY p.id DESC
  `).all(...params);
  rows.forEach(row => { row.specs = parseSpecs(row.specs); });
  res.json(rows);
});

router.post('/api/admin/products', (req, res) => {
  const admin = requireAdmin(req, res);
  if (!admin) return;
  const { errors, data } = validateProductPayload(req.body || {});
  if (errors.length) return res.status(400).json({ error: errors.join('. ') });

  const info = db.prepare(`
    INSERT INTO products (category_id, name, description, price, old_price, image, stock, specs, is_featured, is_active, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now','localtime'))
  `).run(data.category_id, data.name, data.description, data.price, data.old_price, data.image,
    data.stock, JSON.stringify(data.specs), data.is_featured, data.is_active);
  res.status(201).json(productWithStats(Number(info.lastInsertRowid)));
});

router.put('/api/admin/products/:id', (req, res) => {
  const admin = requireAdmin(req, res);
  if (!admin) return;
  const existing = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Товар не найден' });
  const { errors, data } = validateProductPayload(req.body || {}, existing);
  if (errors.length) return res.status(400).json({ error: errors.join('. ') });

  db.prepare(`
    UPDATE products SET category_id = ?, name = ?, description = ?, price = ?, old_price = ?,
      image = ?, stock = ?, specs = ?, is_featured = ?, is_active = ?,
      updated_at = datetime('now','localtime')
    WHERE id = ?
  `).run(data.category_id, data.name, data.description, data.price, data.old_price, data.image,
    data.stock, JSON.stringify(data.specs), data.is_featured, data.is_active, existing.id);
  res.json(productWithStats(existing.id));
});

router.patch('/api/admin/products/:id/stock', (req, res) => {
  const admin = requireAdmin(req, res);
  if (!admin) return;
  const stock = asInt(req.body?.stock);
  if (stock === null || stock < 0) return res.status(400).json({ error: 'Некорректный остаток' });
  const info = db.prepare("UPDATE products SET stock = ?, updated_at = datetime('now','localtime') WHERE id = ?")
    .run(stock, req.params.id);
  if (!info.changes) return res.status(404).json({ error: 'Товар не найден' });
  res.json({ ok: true, stock });
});

router.delete('/api/admin/products/:id', (req, res) => {
  const admin = requireAdmin(req, res);
  if (!admin) return;
  const info = db.prepare('DELETE FROM products WHERE id = ?').run(req.params.id);
  if (!info.changes) return res.status(404).json({ error: 'Товар не найден' });
  res.json({ ok: true });
});

router.get('/api/admin/categories', (req, res) => {
  const admin = requireAdmin(req, res);
  if (!admin) return;
  const rows = db.prepare(`
    SELECT c.id, c.name, c.slug, COUNT(p.id) AS product_count
    FROM categories c LEFT JOIN products p ON p.category_id = c.id
    GROUP BY c.id ORDER BY c.id
  `).all();
  res.json(rows);
});

router.post('/api/admin/categories', (req, res) => {
  const admin = requireAdmin(req, res);
  if (!admin) return;
  const name = String(req.body?.name || '').trim();
  let slug = String(req.body?.slug || '').trim().toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '');
  if (name.length < 2) return res.status(400).json({ error: 'Название – минимум 2 символа' });
  if (!slug) slug = `category-${Date.now()}`;
  if (db.prepare('SELECT id FROM categories WHERE slug = ?').get(slug)) {
    return res.status(409).json({ error: 'Категория с таким slug уже существует' });
  }
  const info = db.prepare('INSERT INTO categories (name, slug) VALUES (?, ?)').run(name, slug);
  res.status(201).json({ id: Number(info.lastInsertRowid), name, slug, product_count: 0 });
});

router.put('/api/admin/categories/:id', (req, res) => {
  const admin = requireAdmin(req, res);
  if (!admin) return;
  const category = db.prepare('SELECT * FROM categories WHERE id = ?').get(req.params.id);
  if (!category) return res.status(404).json({ error: 'Категория не найдена' });
  const name = String(req.body?.name || '').trim();
  const slug = String(req.body?.slug || category.slug).trim().toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '') || category.slug;
  if (name.length < 2) return res.status(400).json({ error: 'Название – минимум 2 символа' });
  const duplicate = db.prepare('SELECT id FROM categories WHERE slug = ? AND id != ?').get(slug, category.id);
  if (duplicate) return res.status(409).json({ error: 'Категория с таким slug уже существует' });
  db.prepare('UPDATE categories SET name = ?, slug = ? WHERE id = ?').run(name, slug, category.id);
  res.json({ id: category.id, name, slug });
});

router.delete('/api/admin/categories/:id', (req, res) => {
  const admin = requireAdmin(req, res);
  if (!admin) return;
  const count = db.prepare('SELECT COUNT(*) AS c FROM products WHERE category_id = ?').get(req.params.id).c;
  if (count > 0) return res.status(409).json({ error: `В категории ${count} товаров. Сначала перенесите или удалите их.` });
  const info = db.prepare('DELETE FROM categories WHERE id = ?').run(req.params.id);
  if (!info.changes) return res.status(404).json({ error: 'Категория не найдена' });
  res.json({ ok: true });
});

function adminOrder(order) {
  const items = db.prepare('SELECT product_id, name, price, qty FROM order_items WHERE order_id = ?').all(order.id);
  return { ...order, items, item_count: items.reduce((s, i) => s + i.qty, 0), status_text: statusText(order) };
}

router.get('/api/admin/orders', (req, res) => {
  const admin = requireAdmin(req, res);
  if (!admin) return;
  const { status, q } = req.query;
  const where = [];
  const params = [];
  if (status && status !== 'all') {
    where.push('status = ?');
    params.push(status);
  }
  if (q) {
    where.push('(order_number LIKE ? OR customer_name LIKE ? OR phone LIKE ? OR email LIKE ?)');
    params.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`);
  }
  const rows = db.prepare(`
    SELECT * FROM orders
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY id DESC
  `).all(...params);
  res.json(rows.map(adminOrder));
});

router.get('/api/admin/orders/:id', (req, res) => {
  const admin = requireAdmin(req, res);
  if (!admin) return;
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
  if (!order) return res.status(404).json({ error: 'Заказ не найден' });
  res.json(adminOrder(order));
});

router.patch('/api/admin/orders/:id', (req, res) => {
  const admin = requireAdmin(req, res);
  if (!admin) return;
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
  if (!order) return res.status(404).json({ error: 'Заказ не найден' });
  const { status, comment } = req.body || {};
  if (status && !STATUSES[status]) return res.status(400).json({ error: 'Некорректный статус' });
  db.prepare('UPDATE orders SET status = ?, comment = ? WHERE id = ?')
    .run(status || order.status, comment !== undefined ? String(comment) : order.comment, order.id);
  const updated = db.prepare('SELECT * FROM orders WHERE id = ?').get(order.id);
  res.json(adminOrder(updated));
});

router.delete('/api/admin/orders/:id', (req, res) => {
  const admin = requireAdmin(req, res);
  if (!admin) return;
  const info = db.prepare('DELETE FROM orders WHERE id = ?').run(req.params.id);
  if (!info.changes) return res.status(404).json({ error: 'Заказ не найден' });
  res.json({ ok: true });
});

router.get('/api/admin/reviews', (req, res) => {
  const admin = requireAdmin(req, res);
  if (!admin) return;
  const rows = db.prepare(`
    SELECT r.id, r.author_name, r.rating, r.text, r.created_at,
            p.id AS product_id, p.name AS product_name
    FROM reviews r JOIN products p ON p.id = r.product_id
    ORDER BY r.id DESC LIMIT 200
  `).all();
  res.json(rows);
});

router.delete('/api/admin/reviews/:id', (req, res) => {
  const admin = requireAdmin(req, res);
  if (!admin) return;
  const info = db.prepare('DELETE FROM reviews WHERE id = ?').run(req.params.id);
  if (!info.changes) return res.status(404).json({ error: 'Отзыв не найден' });
  res.json({ ok: true });
});

router.get('/api/admin/messages', (req, res) => {
  const admin = requireAdmin(req, res);
  if (!admin) return;
  const rows = db.prepare('SELECT * FROM messages ORDER BY is_read ASC, id DESC LIMIT 200').all();
  res.json(rows);
});

router.patch('/api/admin/messages/:id', (req, res) => {
  const admin = requireAdmin(req, res);
  if (!admin) return;
  const isRead = req.body?.is_read ? 1 : 0;
  const info = db.prepare('UPDATE messages SET is_read = ? WHERE id = ?').run(isRead, req.params.id);
  if (!info.changes) return res.status(404).json({ error: 'Сообщение не найдено' });
  res.json({ ok: true, is_read: isRead });
});

router.delete('/api/admin/messages/:id', (req, res) => {
  const admin = requireAdmin(req, res);
  if (!admin) return;
  const info = db.prepare('DELETE FROM messages WHERE id = ?').run(req.params.id);
  if (!info.changes) return res.status(404).json({ error: 'Сообщение не найдено' });
  res.json({ ok: true });
});

router.get('/api/admin/users', (req, res) => {
  const admin = requireAdmin(req, res);
  if (!admin) return;
  const rows = db.prepare(`
    SELECT u.id, u.username, u.email, u.role, u.created_at,
            (SELECT COUNT(*) FROM orders o WHERE o.user_id = u.id) AS order_count,
            (SELECT COALESCE(SUM(total), 0) FROM orders o WHERE o.user_id = u.id AND o.status != 'cancelled') AS total_spent
    FROM users u ORDER BY u.id ASC
  `).all();
  res.json(rows);
});

router.patch('/api/admin/users/:id', (req, res) => {
  const admin = requireAdmin(req, res);
  if (!admin) return;
  const id = Number(req.params.id);
  if (id === admin.id) return res.status(400).json({ error: 'Нельзя изменить собственную роль' });
  const role = req.body?.role;
  if (!['customer', 'admin'].includes(role)) return res.status(400).json({ error: 'Некорректная роль' });
  const info = db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, id);
  if (!info.changes) return res.status(404).json({ error: 'Пользователь не найден' });
  res.json({ ok: true, role });
});

router.delete('/api/admin/users/:id', (req, res) => {
  const admin = requireAdmin(req, res);
  if (!admin) return;
  const id = Number(req.params.id);
  if (id === admin.id) return res.status(400).json({ error: 'Нельзя удалить собственную учётную запись' });
  const info = db.prepare("DELETE FROM users WHERE id = ? AND role != 'admin'").run(id);
  if (!info.changes) return res.status(404).json({ error: 'Пользователь не найден или является администратором' });
  res.json({ ok: true });
});

module.exports = router;
