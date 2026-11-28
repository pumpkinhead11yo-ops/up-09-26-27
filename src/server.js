const express = require('express');
const path = require('path');
const fs = require('fs');

const ROOT_DIR = path.resolve(__dirname, '..');
const PUBLIC_DIR = path.join(ROOT_DIR, 'public');
const ENV_FILE = path.join(ROOT_DIR, '.env');

if (typeof process.loadEnvFile === 'function' && fs.existsSync(ENV_FILE)) {
  try {
    process.loadEnvFile(ENV_FILE);
  } catch (error) {
    console.warn('Не удалось прочитать .env:', error.message);
  }
}

const { initDatabase } = require('./models/initDatabase');
const { DB_FILE } = require('./models/database');
const apiRouter = require('./routes/api');

initDatabase();

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));

app.use(express.static(PUBLIC_DIR));

app.use(apiRouter);
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

app.use((req, res, next) => {
  if (req.method !== 'GET') return next();
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

app.use((err, req, res, next) => {
  console.error(err);
  if (res.headersSent) return next(err);
  res.status(500).json({ error: 'Внутренняя ошибка сервера' });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Сервер «ТЕХНОМИР» запущен: http://localhost:${PORT}`);
    console.log(`База данных: ${DB_FILE}`);
    console.log(`Админ-панель: http://localhost:${PORT}/admin.html (admin / admin123)`);
  });
}

module.exports = app;
