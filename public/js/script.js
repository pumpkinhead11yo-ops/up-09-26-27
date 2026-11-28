const Cart = {
  KEY: 'technomir_cart',

  get() {
    try { return JSON.parse(localStorage.getItem(this.KEY)) || {}; }
    catch { return {}; }
  },

  save(cart) {
    localStorage.setItem(this.KEY, JSON.stringify(cart));
    this.updateBadge();
  },

  add(id, qty = 1) {
    const cart = this.get();
    cart[id] = (cart[id] || 0) + qty;
    this.save(cart);
    return cart[id];
  },

  set(id, qty) {
    const cart = this.get();
    if (qty <= 0) delete cart[id];
    else cart[id] = qty;
    this.save(cart);
  },

  remove(id) {
    const cart = this.get();
    delete cart[id];
    this.save(cart);
  },

  clear() {
    localStorage.removeItem(this.KEY);
    this.updateBadge();
  },

  count() {
    return Object.values(this.get()).reduce((sum, qty) => sum + qty, 0);
  },

  async items() {
    const cart = this.get();
    const ids = Object.keys(cart).map(Number);
    if (!ids.length) return [];
    const products = await api('/api/products?ids=' + ids.join(','));
    const map = new Map(products.map(p => [p.id, p]));
    return ids.map(id => ({ ...map.get(id), qty: cart[id] })).filter(p => p.id);
  },

  updateBadge() {
    const count = this.count();
    document.querySelectorAll('.cart-count').forEach(badge => {
      badge.textContent = count;
      badge.classList.toggle('is-empty', count === 0);
    });
  }
};

const Compare = {
  KEY: 'technomir_compare',
  MAX: 4,

  get() {
    try {
      const list = JSON.parse(localStorage.getItem(this.KEY));
      return Array.isArray(list) ? list : [];
    } catch { return []; }
  },

  count() { return this.get().length; },

  has(id) { return this.get().includes(id); },

  toggle(id) {
    const list = this.get();
    const index = list.indexOf(id);
    if (index >= 0) list.splice(index, 1);
    else if (list.length >= this.MAX) {
      toast(`В сравнении может быть не больше ${this.MAX} товаров`, 'warning');
      return false;
    } else list.push(id);
    localStorage.setItem(this.KEY, JSON.stringify(list));
    this.updateUI();
    return list.includes(id);
  },

  remove(id) {
    localStorage.setItem(this.KEY, JSON.stringify(this.get().filter(x => x !== id)));
    this.updateUI();
  },

  clear() {
    localStorage.removeItem(this.KEY);
    this.updateUI();
  },

  updateUI() {
    const count = this.count();
    document.querySelectorAll('.count-srav').forEach(badge => {
      badge.textContent = count;
      badge.classList.toggle('is-empty', count === 0);
    });
    document.querySelectorAll('[data-compare-id]').forEach(btn => {
      const active = this.has(Number(btn.dataset.compareId));
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-pressed', String(active));
    });

    const bar = document.getElementById('cmp-bar');
    if (bar) {
      bar.hidden = count === 0;
      const counter = bar.querySelector('.cmp-bar-count');
      if (counter) counter.textContent = count;
      document.body.classList.toggle('has-cmp', count > 0);
    }
  }
};

const Auth = {
  KEY: 'technomir_token',

  token() { return localStorage.getItem(this.KEY); },

  user() {
    try { return JSON.parse(localStorage.getItem('technomir_user')); }
    catch { return null; }
  },

  isAdmin() {
    return this.user()?.role === 'admin';
  },

  setSession(data) {
    localStorage.setItem(this.KEY, data.token);
    localStorage.setItem('technomir_user', JSON.stringify({
      username: data.username,
      email: data.email,
      role: data.role
    }));
  },

  logout() {
    const token = this.token();
    if (token) {
      fetch('/api/auth/logout', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      }).catch(() => {});
    }
    localStorage.removeItem(this.KEY);
    localStorage.removeItem('technomir_user');
    location.href = '/';
  },

  headers() {
    const token = this.token();
    return token ? { Authorization: `Bearer ${token}` } : {};
  }
};

async function api(url, options = {}) {
  const res = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...Auth.headers(),
      ...(options.headers || {})
    },
    ...options
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Не удалось выполнить запрос');
  return data;
}

const PRICE_FORMAT = new Intl.NumberFormat('ru-RU');
const fmtPrice = n => PRICE_FORMAT.format(Math.round(Number(n) || 0)) + '\u00a0₽';

const fmtDate = d => new Date(String(d).replace(' ', 'T')).toLocaleDateString('ru-RU', {
  day: 'numeric', month: 'long', year: 'numeric'
});

const fmtDateShort = d => new Date(String(d).replace(' ', 'T')).toLocaleDateString('ru-RU', {
  day: '2-digit', month: '2-digit', year: '2-digit'
});

function productImage(image) {
  if (!image) return '/images/products/test.jpg';
  const value = String(image).trim();
  if (/^(https?:)?\/\//.test(value) || value.startsWith('/') || value.startsWith('data:')) return value;
  return '/images/products/' + value;
}

function plural(n, one, few, many) {
  const value = Math.abs(n) % 100;
  const last = value % 10;
  if (value > 10 && value < 20) return many;
  if (last > 1 && last < 5) return few;
  if (last === 1) return one;
  return many;
}

function icon(name, cls = '') {
  return `<i data-lucide="${name}" class="${cls}" aria-hidden="true"></i>`;
}

const TOAST_ICONS = { success: 'check', warning: 'triangle-alert', info: 'info' };
const ALERT_ICONS = { success: 'check', info: 'info', error: 'triangle-alert' };

function stars(rating, size = '') {
  const value = Number(rating) || 0;
  let out = `<span class="stars ${size}" aria-label="Рейтинг ${value} из 5">`;
  for (let i = 1; i <= 5; i++) {
    out += `<span class="star ${i <= Math.round(value) ? 'is-on' : ''}">★</span>`;
  }
  return out + '</span>';
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[char]));
}

function refreshIcons() {
  if (window.lucide) lucide.createIcons();
}

function initLazyImages(root = document) {
  root.querySelectorAll('img[data-lazy-anim]').forEach(img => {
    if (img.dataset.lazyBound) return;
    img.dataset.lazyBound = '1';
    img.classList.add('img-lazy');
    const media = img.closest('.tovar-media');
    if (media) media.classList.add('is-loading');
    const done = () => {
      img.classList.add('is-ready');
      if (media) media.classList.remove('is-loading');
    };
    if (img.complete && img.naturalWidth) {
      requestAnimationFrame(done);
    } else {
      img.addEventListener('load', done, { once: true });
      img.addEventListener('error', done, { once: true });
    }
  });
}

function toast(message, type = 'success') {
  let box = document.getElementById('toast-box');
  if (!box) {
    box = document.createElement('div');
    box.id = 'toast-box';
    box.className = 'toast-box';
    document.body.appendChild(box);
  }
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  const iconName = TOAST_ICONS[type] || 'info';
  el.innerHTML = `${icon(iconName)}<span>${escapeHtml(message)}</span>`;
  box.appendChild(el);
  refreshIcons();
  setTimeout(() => {
    el.classList.add('is-leaving');
    setTimeout(() => el.remove(), 320);
  }, 2800);
}

function showAlert(el, message, type = 'error') {
  if (!el) return;
  const iconName = ALERT_ICONS[type] || 'triangle-alert';
  el.innerHTML = `<div class="alert alert-${type}">${icon(iconName)}<span>${escapeHtml(message)}</span></div>`;
  refreshIcons();
}

function contactHrefValue(href) {
  const value = String(href || '').trim();
  if (value.startsWith('mailto:')) return value.slice(7).split('?')[0];
  if (value.startsWith('tel:')) {
    const digits = value.slice(4).replace(/[^\d+]/g, '');
    const only = digits.replace(/\D/g, '');
    if (digits.startsWith('+7') && only.length === 11) {
      const d = only.slice(1);
      return `+7 (${d.slice(0, 4)}) ${d.slice(4, 6)}-${d.slice(6, 8)}-${d.slice(8, 10)}`;
    }
    return digits;
  }
  return value;
}

function fallbackCopy(text) {
  const area = document.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', '');
  area.style.position = 'fixed';
  area.style.opacity = '0';
  document.body.appendChild(area);
  area.select();
  try { document.execCommand('copy'); } catch {}
  area.remove();
}

function copyContact(href) {
  const value = contactHrefValue(href);
  if (!value) return;
  const done = () => toast('Скопировано', 'success');
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(value).then(done).catch(() => { fallbackCopy(value); done(); });
  } else {
    fallbackCopy(value);
    done();
  }
}

function initContactCopy() {
  if (document.body.dataset.admin === 'true') return;
  document.addEventListener('click', event => {
    const link = event.target.closest('a[href^="tel:"], a[href^="mailto:"]');
    if (!link) return;
    event.preventDefault();
    copyContact(link.getAttribute('href'));
  });
}

const CATEGORY_LINKS = [
  ['smartphones', 'Смартфоны и гаджеты'],
  ['parts', 'Компьютеры и периферия'],
  ['appliances', 'Бытовая электроника'],
  ['gaming', 'Игры и консоли'],
  ['accessories', 'Аксессуары'],
  ['audio', 'Аудио и звук']
];

function logoHtml(light = false) {
  return `
    <a class="brand ${light ? 'brand-light' : ''}" href="/" aria-label="Техномир – на главную">
      <span class="brand-mark" aria-hidden="true">
        <svg viewBox="0 0 34 34" fill="none">
          <path d="M7 8.5h20M17 8.5v18" stroke="currentColor" stroke-width="4.6" stroke-linecap="square"/>
          <path d="M23 22.5l4 4" stroke="currentColor" stroke-width="4.6" stroke-linecap="square"/>
        </svg>
      </span>
      <span class="brand-word">техномир<span>.</span></span>
    </a>`;
}

function renderLayout() {
  if (document.body.dataset.admin === 'true') return;

  const headerEl = document.getElementById('shapka');
  const footerEl = document.getElementById('podval');
  const page = location.pathname.replace(/\/$/, '') || '/';
  document.body.classList.toggle('page-home', page === '/' || page === '/index.html');

  const links = [
    ['/', 'Главная'],
    ['/catalog.html', 'Каталог'],
    ['/about.html', 'О нас'],
    ['/contacts.html', 'Контакты']
  ];

  const navHtml = links.map(([href, text]) => {
    const active = page === href || href === '/' ? page === href : page.startsWith(href);
    return `<a class="nav-link ${active ? 'is-active' : ''}" href="${href}"><span>${text}</span></a>`;
  }).join('');

  const user = Auth.user();
  const authHtml = user
    ? `<a class="user-chip" href="/profile.html" title="Личный кабинет">
      <span class="user-avatar">${escapeHtml(user.username.slice(0, 1).toUpperCase())}</span>
      <span class="user-chip-name">${escapeHtml(user.username)}</span>
      </a>`
    : `<a class="icon-btn login-btn" href="/login.html" title="Войти" aria-label="Войти">
      ${icon('user')}
      </a>`;

  if (headerEl) {
    headerEl.innerHTML = `
      <div class="header" id="shapka-bar">
        <div class="box shapka-in">
          ${logoHtml()}

          <nav class="nav" aria-label="Основная навигация">${navHtml}</nav>

          <div class="shapka-acts">
            <button class="icon-btn" type="button" data-search-open aria-label="Поиск" title="Поиск">
              ${icon('search')}
            </button>
            <a class="icon-btn cmp-link" href="/compare.html" title="Сравнение" aria-label="Сравнение товаров">
              ${icon('git-compare')}<span class="action-count count-srav is-empty">0</span>
            </a>
            <button class="icon-btn theme-toggle" type="button" data-theme-toggle aria-label="Тёмная тема" title="Тёмная тема" aria-pressed="false">
              <span class="theme-moon">${icon('moon')}</span>
              <span class="theme-sun">${icon('sun')}</span>
            </button>
            ${authHtml}
            <a class="cart-btn" href="/cart.html" aria-label="Корзина">
              ${icon('shopping-bag')}
              <span class="cart-btn-text">Корзина</span>
              <span class="cart-count is-empty">0</span>
            </a>
            <button class="burger" id="burger-btn" type="button" aria-label="Меню" aria-expanded="false">
              <span></span><span></span>
            </button>
          </div>
        </div>
      </div>

      <div class="mobile-menu" id="mobile-menu" aria-hidden="true">
        <div class="menu-head">
          <span class="mono">Навигация</span>
          <span class="mono">Оренбург · 09:00–21:00</span>
        </div>
        <nav class="menu-nav" aria-label="Мобильная навигация">
          ${links.map(([href, text], index) => `
            <a class="menu-link" href="${href}" style="--i:${index}">
              <span>${text}</span>${icon('arrow-up-right')}
            </a>`).join('')}
          <a class="menu-link" href="/compare.html" style="--i:4">
            <span>Сравнение</span>${icon('arrow-up-right')}
          </a>
          <a class="menu-link" href="/track.html" style="--i:5">
            <span>Отследить заказ</span>${icon('arrow-up-right')}
          </a>
          ${user
            ? `<a class="menu-link" href="/profile.html" style="--i:6">
              <span>Личный кабинет</span>${icon('arrow-up-right')}
            </a>`
            : `<a class="menu-link" href="/login.html" style="--i:6">
              <span>Войти в аккаунт</span>${icon('arrow-up-right')}
            </a>`}
        </nav>
        <div class="menu-foot">
          <a href="tel:+73532201234">${icon('phone')} +7 (3532) 20-12-34</a>
          <span>${icon('map-pin')} ТРЦ «Территория Севера», пр-кт Дзержинского, 23</span>
        </div>
      </div>

      <div class="poisk-panel" id="poisk-panel" aria-hidden="true">
        <div class="box search-inner">
          <div class="search-head">
            <button class="icon-btn icon-btn-dark" type="button" data-search-close aria-label="Закрыть поиск">${icon('x')}</button>
          </div>
          <form class="search-form" action="/catalog.html" method="get" role="search">
            <span class="search-icon">${icon('search')}</span>
            <input type="search" name="q" placeholder="Смартфон, ноутбук, наушники…" aria-label="Поиск по каталогу" autocomplete="off">
            <button class="btn btn-acid" type="submit">Найти ${icon('arrow-right')}</button>
          </form>
          <div class="search-tags">
            <span class="mono">Популярное:</span>
            <a href="/catalog.html?q=смартфон">смартфоны</a>
            <a href="/catalog.html?q=ноутбук">ноутбуки</a>
            <a href="/catalog.html?q=наушники">наушники</a>
            <a href="/catalog.html?q=телевизор">телевизоры</a>
            <a href="/catalog.html?q=консоль">консоли</a>
          </div>
        </div>
      </div>`;

    const burger = document.getElementById('burger-btn');
    const menu = document.getElementById('mobile-menu');
    if (burger && menu) {
      const setMenu = open => {
        menu.classList.toggle('is-open', open);
        menu.setAttribute('aria-hidden', String(!open));
        burger.setAttribute('aria-expanded', String(open));
        burger.classList.toggle('is-open', open);
        document.body.classList.toggle('has-menu', open);
      };
      burger.addEventListener('click', () => setMenu(!menu.classList.contains('is-open')));
      menu.querySelectorAll('a').forEach(link => link.addEventListener('click', () => setMenu(false)));
    }

    const searchPanel = document.getElementById('poisk-panel');
    const openSearch = () => {
      if (!searchPanel) return;
      searchPanel.classList.add('is-open');
      searchPanel.setAttribute('aria-hidden', 'false');
      document.body.classList.add('has-search');
      setTimeout(() => searchPanel.querySelector('input')?.focus(), 220);
    };
    const closeSearch = () => {
      if (!searchPanel) return;
      searchPanel.classList.remove('is-open');
      searchPanel.setAttribute('aria-hidden', 'true');
      document.body.classList.remove('has-search');
    };
    document.querySelectorAll('[data-search-open]').forEach(btn => btn.addEventListener('click', openSearch));
    document.querySelectorAll('[data-search-close]').forEach(btn => btn.addEventListener('click', closeSearch));
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape') {
        closeSearch();
        if (menu && menu.classList.contains('is-open')) setMenu(false);
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        openSearch();
      }
    });
  }

  if (footerEl) {
    footerEl.innerHTML = `
      <div class="footer">
        <div class="box">
          <div class="podval-top">
            <div class="podval-lead">
              <h2>Техника, которой<br>хочется пользоваться.</h2>
            </div>
            <form class="podval-sub" onsubmit="subscribeFooter(event)">
              <label for="podval-email" class="mono">Письма о новинках и скидках</label>
              <div class="podval-sub-row">
                <input id="podval-email" type="email" placeholder="you@example.com" required autocomplete="email">
                <button class="btn btn-acid" type="submit">${icon('arrow-up-right')}</button>
              </div>
            </form>
          </div>

          <div class="podval-grid">
            <div class="podval-brand">
              ${logoHtml(true)}
              <p>Магазин электроники в Оренбурге. Подбираем, проверяем и настраиваем технику – с гарантией до двух лет.</p>
              <div class="podval-socials">
                <a href="https://vk.com" target="_blank" rel="noopener" aria-label="VK">${icon('at-sign')}</a>
                <a href="https://youtube.com" target="_blank" rel="noopener" aria-label="YouTube">${icon('play')}</a>
              </div>
            </div>

            <div class="podval-col">
              <h4 class="mono">Каталог</h4>
              ${CATEGORY_LINKS.map(([slug, name]) =>
                `<a href="/catalog.html?category=${slug}">${name}</a>`
              ).join('')}
            </div>

            <div class="podval-col">
              <h4 class="mono">Покупателям</h4>
              <a href="/catalog.html">Все товары</a>
              <a href="/compare.html">Сравнение</a>
              <a href="/cart.html">Корзина</a>
              <a href="/track.html">Отслеживание заказа</a>
              <a href="/profile.html">Личный кабинет</a>
            </div>

            <div class="podval-col foot-contacts">
              <h4 class="mono">Магазин</h4>
              <a href="tel:+73532201234">+7 (3532) 20-12-34</a>
              <a href="mailto:info@technomir.ru">info@technomir.ru</a>
              <p>г. Оренбург,<br>пр-кт Дзержинского, 23<br>ТРЦ «Территория Севера»</p>
              <p>Пн–Сб 09:00–21:00<br>Вс 10:00–20:00</p>
            </div>
          </div>

          <div class="foot-logo" aria-hidden="true">техномир<span>*</span></div>
        </div>
      </div>`;
  }

  if (!document.getElementById('cmp-bar')) {
    const bar = document.createElement('div');
    bar.id = 'cmp-bar';
    bar.className = 'cmp-bar';
    bar.hidden = true;
    bar.innerHTML = `
      <span class="cmp-bar-text">${icon('git-compare')} В сравнении: <b class="cmp-bar-count">0</b></span>
      <div class="cmp-bar-acts">
        <button class="cmp-bar-clear" type="button" onclick="Compare.clear()">Очистить</button>
        <a class="btn btn-acid btn-sm" href="/compare.html">Сравнить ${icon('arrow-right')}</a>
      </div>`;
    document.body.appendChild(bar);
  }

  if (!document.getElementById('dock')) {
    const inCompare = page === '/compare.html';
    const inCart = page === '/cart.html';
    const inProfile = page === '/profile.html' || page === '/login.html';
    const dock = document.createElement('nav');
    dock.id = 'dock';
    dock.className = 'dock';
    dock.setAttribute('aria-label', 'Быстрая навигация');
    dock.innerHTML = `
      <a class="dock-link ${page === '/' ? 'is-active' : ''}" href="/">${icon('house')}<span>Главная</span></a>
      <a class="dock-link ${page === '/catalog.html' ? 'is-active' : ''}" href="/catalog.html">${icon('layout-grid')}<span>Каталог</span></a>
      <button class="dock-link" type="button" data-search-open>${icon('search')}<span>Поиск</span></button>
      <a class="dock-link ${inCart ? 'is-active' : ''}" href="/cart.html">${icon('shopping-bag')}<span>Корзина</span><span class="dock-count cart-count is-empty">0</span></a>
      <a class="dock-link ${inProfile ? 'is-active' : ''}" href="${user ? '/profile.html' : '/login.html'}">${icon('user')}<span>${user ? 'Кабинет' : 'Войти'}</span></a>`;
    document.body.appendChild(dock);
    dock.querySelector('[data-search-open]')?.addEventListener('click', () => {
      const panel = document.getElementById('poisk-panel');
      if (panel) {
        panel.classList.add('is-open');
        panel.setAttribute('aria-hidden', 'false');
        document.body.classList.add('has-search');
        setTimeout(() => panel.querySelector('input')?.focus(), 220);
      }
    });
  }

  refreshIcons();
}

function subscribeFooter(event) {
  event.preventDefault();
  const input = document.getElementById('podval-email');
  if (!input || !input.value.trim()) return;
  toast('Готово – подписка оформлена', 'success');
  event.target.reset();
}

function productCard(p, index = 0) {
  const discount = p.old_price ? Math.round((1 - p.price / p.old_price) * 100) : 0;
  const rating = Number(p.rating) || 0;
  const compareActive = Compare.has(p.id);
  const lowStock = p.stock > 0 && p.stock <= 3;
  const soldOut = p.stock <= 0;
  const href = `/product.html?id=${p.id}`;

  return `
    <article class="tovar-card" data-reveal data-tilt style="--d:${(index % 4) * 60}ms">
      <div class="tovar-media">
        <a class="tovar-link" href="${href}" aria-label="${escapeHtml(p.name)}" data-cursor-label="Смотреть">
          <img src="${productImage(p.image)}" alt="${escapeHtml(p.name)}" loading="lazy" decoding="async" data-lazy-anim>
        </a>
        <div class="tovar-badges">
          ${discount ? `<span class="tag tag-sale">−${discount}%</span>` : ''}
          ${p.is_featured && !discount ? '<span class="tag tag-acid">Хит</span>' : ''}
          ${lowStock ? '<span class="tag tag-line">Мало</span>' : ''}
          ${soldOut ? '<span class="tag tag-dark">Нет в наличии</span>' : ''}
        </div>
        <span class="tovar-foto">${icon('arrow-up-right')} Смотреть</span>
      </div>

      <div class="tovar-body">
        <div class="tovar-meta">
          <span>${escapeHtml(p.category_name)}</span>
          <span class="tovar-stars">${p.review_count ? `★ ${rating}` : 'NEW'}</span>
        </div>
        <h3 class="tovar-title"><a href="${href}">${escapeHtml(p.name)}</a></h3>
        <div class="tovar-buy">
          <div class="tovar-price">
            <strong>${fmtPrice(p.price)}</strong>
            ${p.old_price ? `<del>${fmtPrice(p.old_price)}</del>` : ''}
          </div>
          <span class="tovar-stock">${soldOut ? 'нет в наличии' : lowStock ? `осталось ${p.stock}` : 'в наличии'}</span>
        </div>
        <div class="tovar-acts">
          <button class="btn btn-blue btn-sm tovar-cta" type="button"
                  onclick="addToCart(${p.id}, 1, this)" ${soldOut ? 'disabled' : ''}>
            <span data-cart-label>${soldOut ? 'Нет в наличии' : 'В корзину'}</span>
          </button>
          <button class="tovar-compare ${compareActive ? 'is-active' : ''}"
                  type="button"
                  data-compare-id="${p.id}"
                  aria-pressed="${compareActive}"
                  onclick="toggleCompare(${p.id}, this)"
                  aria-label="Сравнить товар"
                  title="Сравнить товар">
            ${icon('git-compare')}
          </button>
        </div>
      </div>
    </article>`;
}

function renderProductsGrid(container, products, options = {}) {
  if (!container) return;
  const { append = false, offset = 0 } = options;
  if (!products.length) {
    if (!append) {
      container.innerHTML = `
        <div class="empty-state empty-wide">
          <span class="empty-ico">${icon('search-x')}</span>
          <h3>Ничего не найдено</h3>
          <p>Попробуйте изменить фильтры или поисковый запрос.</p>
          <button class="btn btn-ghost" type="button" onclick="document.getElementById('filtry')?.classList.remove('is-open'); location.reload()">Сбросить</button>
        </div>`;
      refreshIcons();
    }
    return;
  }
  const cards = products.map((product, index) => productCard(product, offset + index)).join('');
  if (append) container.insertAdjacentHTML('beforeend', cards);
  else container.innerHTML = cards;
  initLazyImages(container);
  Compare.updateUI();
  refreshIcons();
  Remotion.scan(container);
}

function addToCart(id, qty = 1, btn = null) {
  Cart.add(id, qty);
  toast('Товар добавлен в корзину', 'success');
  if (btn) {
    const label = btn.querySelector('[data-cart-label]');
    if (label) {
      const original = label.textContent;
      label.textContent = 'В корзине';
      btn.classList.add('is-added');
      setTimeout(() => {
        label.textContent = original;
        btn.classList.remove('is-added');
      }, 1400);
    } else {
      const original = btn.innerHTML;
      btn.innerHTML = icon('check');
      btn.classList.add('is-added');
      refreshIcons();
      setTimeout(() => {
        btn.innerHTML = original;
        btn.classList.remove('is-added');
        refreshIcons();
      }, 1400);
    }
  }
}

function toggleCompare(id, btn = null) {
  const added = Compare.toggle(id);
  if (btn) {
    btn.classList.toggle('is-active', added);
    btn.setAttribute('aria-pressed', String(added));
  }
  if (added) toast('Товар добавлен к сравнению', 'info');
}

const prefersReduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const finePointer = () => window.matchMedia('(pointer: fine)').matches;

const Remotion = {
  io: null,

  init() {
    if (prefersReduced()) {
      document.querySelectorAll('[data-reveal]').forEach(el => el.classList.add('is-in'));
      return;
    }
    this.io = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-in');
        this.io.unobserve(entry.target);
      });
    }, { threshold: 0.1, rootMargin: '0px 0px -8% 0px' });

    this.scan(document);

    let raf = 0;
    new MutationObserver(() => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => this.scan(document));
    }).observe(document.body, { childList: true, subtree: true });
  },

  scan(root = document) {
    if (!this.io) return;
    root.querySelectorAll('[data-reveal]').forEach(el => {
      if (el.dataset.revealBound !== undefined) return;
      el.dataset.revealBound = '';
      this.io.observe(el);
    });
  }
};

const Cursor = {
  init() {
    if (prefersReduced() || !finePointer() || document.body.dataset.admin === 'true') return;

    const fill = document.createElement('div');
    fill.className = 'cursor-fill';
    const ui = document.createElement('div');
    ui.className = 'cursor-ui';
    ui.innerHTML = '<span class="cursor-label"></span>';
    const labelEl = ui.querySelector('.cursor-label');
    document.body.append(fill, ui);
    document.body.classList.add('has-cursor');

    let mx = innerWidth / 2, my = innerHeight / 2, rx = mx, ry = my;
    let started = false;

    const show = () => {
      if (started) return;
      started = true;
      fill.classList.add('is-visible');
      ui.classList.add('is-visible');
    };

    const setState = (name, on) => {
      fill.classList.toggle(name, on);
      ui.classList.toggle(name, on);
    };

    addEventListener('pointermove', event => {
      mx = event.clientX;
      my = event.clientY;
      show();

      const interactive = event.target.closest('a, button, input, textarea, select, label, summary, [data-cursor-label]');
      const card = event.target.closest('.tovar-card, .kat-card, .featured-plate');
      const label = event.target.closest('[data-cursor-label]')?.dataset?.cursorLabel
        || (card ? (card.classList.contains('kat-card') ? 'Открыть' : 'Смотреть') : '');

      setState('has-label', Boolean(label));
      setState('is-hover', Boolean(interactive) && !label);
      if (labelEl) labelEl.textContent = label;
    }, { passive: true });

    addEventListener('pointerdown', () => setState('is-down', true));
    addEventListener('pointerup', () => setState('is-down', false));
    document.documentElement.addEventListener('pointerleave', () => {
      fill.classList.remove('is-visible');
      ui.classList.remove('is-visible');
      started = false;
    });

    let raf = 0;
    const loop = () => {
      rx += (mx - rx) * 0.2;
      ry += (my - ry) * 0.2;
      const transform = `translate3d(${rx}px, ${ry}px, 0) translate(-50%, -50%)`;
      fill.style.transform = transform;
      ui.style.transform = transform;
      raf = requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }
};

const Theme = {
  KEY: 'technomir-theme',
  init() {
    document.querySelectorAll('[data-theme-toggle]').forEach(btn => {
      btn.addEventListener('click', () => this.toggle());
    });
    this.sync();
  },
  current() {
    return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  },
  apply(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    try { localStorage.setItem(this.KEY, theme); } catch {}
    this.sync();
    document.dispatchEvent(new CustomEvent('themechange', { detail: { theme } }));
  },
  toggle() {
    this.apply(this.current() === 'dark' ? 'light' : 'dark');
  },
  sync() {
    const dark = this.current() === 'dark';
    document.querySelectorAll('[data-theme-toggle]').forEach(btn => {
      const label = dark ? 'Светлая тема' : 'Тёмная тема';
      btn.setAttribute('aria-pressed', String(dark));
      btn.setAttribute('aria-label', label);
      btn.setAttribute('title', label);
    });
  }
};

function initHeaderScroll() {
  const header = document.getElementById('shapka-bar');
  if (!header) return;
  const update = () => header.classList.toggle('is-scrolled', scrollY > 12);
  update();
  addEventListener('scroll', update, { passive: true });
}

function initParallax() {
  if (document.body.dataset.admin === 'true') return;
  if (document.querySelector('.bg-scene')) return;

  const scene = document.createElement('div');
  scene.className = 'bg-scene';
  scene.setAttribute('aria-hidden', 'true');
  scene.innerHTML = `
    <span class="bg-blob bg-blob-1"></span>
    <span class="bg-blob bg-blob-2"></span>
    <span class="bg-blob bg-blob-3"></span>`;
  document.body.prepend(scene);

  if (prefersReduced()) return;

  const blobs = [...scene.children];
  const depth = [0.05, -0.03, 0.025];
  const driftX = [16, -12, 9];
  const driftY = [10, 16, -10];
  let scroll = scrollY;
  let mx = 0;
  let my = 0;
  let frame = 0;

  const paint = () => {
    frame = 0;
    blobs.forEach((blob, i) => {
      const x = (mx * driftX[i]).toFixed(2);
      const y = (scroll * depth[i] + my * driftY[i]).toFixed(2);
      blob.style.transform = `translate3d(${x}px, ${y}px, 0)`;
    });
  };

  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(paint);
  };

  addEventListener('scroll', () => { scroll = scrollY; schedule(); }, { passive: true });
  addEventListener('resize', schedule, { passive: true });
  addEventListener('pointermove', event => {
    if (event.pointerType === 'touch') return;
    mx = event.clientX / innerWidth - 0.5;
    my = event.clientY / innerHeight - 0.5;
    schedule();
  }, { passive: true });

  paint();
}

function initScrollUI() {
  const toTop = document.createElement('button');
  toTop.className = 'to-top';
  toTop.type = 'button';
  toTop.setAttribute('aria-label', 'Наверх');
  toTop.innerHTML = '<i data-lucide="arrow-up"></i>';
  toTop.addEventListener('click', () => scrollTo({ top: 0, behavior: prefersReduced() ? 'auto' : 'smooth' }));
  document.body.appendChild(toTop);
  refreshIcons();

  let raf = 0;
  const update = () => {
    toTop.classList.toggle('is-visible', scrollY > 800);
  };
  addEventListener('scroll', () => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(update);
  }, { passive: true });
  addEventListener('resize', update, { passive: true });
  update();
}

function initTilt() {
  if (prefersReduced() || !finePointer()) return;

  document.addEventListener('pointermove', event => {
    const card = event.target.closest('[data-tilt]');
    if (!card) return;
    const rect = card.getBoundingClientRect();
    const px = (event.clientX - rect.left) / rect.width - 0.5;
    const py = (event.clientY - rect.top) / rect.height - 0.5;
    card.style.setProperty('--rx', `${(-py * 2.2).toFixed(2)}deg`);
    card.style.setProperty('--ry', `${(px * 2.2).toFixed(2)}deg`);
  }, { passive: true });

  document.addEventListener('pointerout', event => {
    const card = event.target.closest('[data-tilt]');
    if (card && !card.contains(event.relatedTarget)) {
      card.style.removeProperty('--rx');
      card.style.removeProperty('--ry');
    }
  });
}

function initMagnets() {
  if (prefersReduced() || !finePointer()) return;
  document.addEventListener('pointermove', event => {
    const el = event.target.closest('[data-magnetic]');
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = (event.clientX - rect.left - rect.width / 2) * 0.14;
    const y = (event.clientY - rect.top - rect.height / 2) * 0.18;
    el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
  }, { passive: true });
  document.addEventListener('pointerout', event => {
    const el = event.target.closest('[data-magnetic]');
    if (el && !el.contains(event.relatedTarget)) el.style.transform = '';
  });
}

function initHeroStage() {
  const hero = document.querySelector('.hero');
  if (!hero || prefersReduced() || !finePointer()) return;
  const layers = hero.querySelectorAll('[data-depth]');
  if (!layers.length) return;
  let raf = 0;
  hero.addEventListener('pointermove', event => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      const rect = hero.getBoundingClientRect();
      const x = (event.clientX - rect.left) / rect.width - 0.5;
      const y = (event.clientY - rect.top) / rect.height - 0.5;
      layers.forEach(layer => {
        const depth = Number(layer.dataset.depth) || 1;
        layer.style.transform = `translate3d(${(-x * depth * 18).toFixed(1)}px, ${(-y * depth * 18).toFixed(1)}px, 0)`;
      });
    });
  }, { passive: true });
  hero.addEventListener('pointerleave', () => {
    layers.forEach(layer => { layer.style.transform = ''; });
  });
}

function initCounters() {
  const els = document.querySelectorAll('[data-count]');
  if (!els.length) return;
  if (prefersReduced()) {
    els.forEach(el => { el.textContent = new Intl.NumberFormat('ru-RU').format(Number(el.dataset.count)); });
    return;
  }
  const io = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      const el = entry.target;
      const target = Number(el.dataset.count);
      const duration = 1300;
      const start = performance.now();
      const tick = now => {
        const progress = Math.min(1, (now - start) / duration);
        const eased = 1 - Math.pow(1 - progress, 3);
        el.textContent = new Intl.NumberFormat('ru-RU').format(Math.round(target * eased));
        if (progress < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
      io.unobserve(el);
    });
  }, { threshold: 0.4 });
  els.forEach(el => io.observe(el));
}

function initPreloader() {
  const preloader = document.getElementById('preloader');
  if (!preloader) return;
  document.body.classList.add('is-loading');
  const finish = () => {
    preloader.classList.add('is-done');
    document.body.classList.remove('is-loading');
    setTimeout(() => preloader.remove(), 900);
  };
  const delay = prefersReduced() ? 0 : 900;
  setTimeout(finish, delay);
  addEventListener('load', () => setTimeout(finish, 120), { once: true });
}

function initContactForm() {
  const form = document.getElementById('forma-svyaz');
  const modal = document.getElementById('modal-ok');
  if (!form || !modal) return;

  const alertBox = document.getElementById('forma-alert');
  const rules = [
    {
      input: document.getElementById('imya'),
      test: value => value.length >= 2,
      message: 'Укажите имя – минимум 2 символа'
    },
    {
      input: document.getElementById('email'),
      test: value => /^[^\s@]+@[^\s@]+\.[a-zа-яё]{2,}$/i.test(value),
      message: 'Введите корректный email, например name@mail.ru'
    },
    {
      input: document.getElementById('telefon'),
      optional: true,
      test: value => /^[+\d][\d\s()-]{8,}$/.test(value) && value.replace(/\D/g, '').length >= 10,
      message: 'Укажите телефон в формате +7 (3532) 20-12-34'
    },
    {
      input: document.getElementById('tekst'),
      test: value => value.length >= 10,
      message: 'Опишите вопрос подробнее – минимум 10 символов'
    }
  ].filter(rule => rule.input);

  const errorOf = input => document.getElementById(input.id + '-error');
  const fieldOf = input => input.closest('.form-field');

  function setError(input, message) {
    const field = fieldOf(input);
    const error = errorOf(input);
    if (!field || !error) return;
    field.classList.add('is-invalid');
    input.setAttribute('aria-invalid', 'true');
    error.textContent = message;
    error.classList.add('is-visible');
  }

  function clearError(input) {
    const field = fieldOf(input);
    const error = errorOf(input);
    if (!field || !error) return;
    field.classList.remove('is-invalid');
    input.removeAttribute('aria-invalid');
    error.textContent = '';
    error.classList.remove('is-visible');
  }

  function validate() {
    let firstInvalid = null;
    rules.forEach(rule => {
      const value = rule.input.value.trim();
      const valid = rule.optional && !value ? true : rule.test(value);
      if (valid) {
        clearError(rule.input);
      } else {
        setError(rule.input, rule.message);
        if (!firstInvalid) firstInvalid = rule.input;
      }
    });
    return firstInvalid;
  }

  rules.forEach(rule => {
    rule.input.addEventListener('input', () => {
      if (fieldOf(rule.input)?.classList.contains('is-invalid')) {
        const value = rule.input.value.trim();
        if (rule.optional && !value) clearError(rule.input);
        else if (rule.test(value)) clearError(rule.input);
      }
    });
    rule.input.addEventListener('blur', () => {
      if (!rule.input.value.trim()) return;
      const value = rule.input.value.trim();
      if (!(rule.optional && !value) && !rule.test(value)) setError(rule.input, rule.message);
    });
  });

  let lastFocused = null;

  function openModal() {
    lastFocused = document.activeElement;
    modal.hidden = false;
    document.body.classList.add('has-modal');
    modal.querySelector('.btn-dark')?.focus();
    refreshIcons();
  }

  function closeModal() {
    modal.hidden = true;
    document.body.classList.remove('has-modal');
    if (lastFocused && typeof lastFocused.focus === 'function') lastFocused.focus();
  }

  modal.querySelectorAll('[data-modal-close]').forEach(el => {
    el.addEventListener('click', closeModal);
  });

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !modal.hidden) closeModal();
  });

  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (alertBox) alertBox.innerHTML = '';

    const firstInvalid = validate();
    if (firstInvalid) {
      firstInvalid.focus();
      firstInvalid.scrollIntoView({ block: 'center', behavior: prefersReduced() ? 'auto' : 'smooth' });
      return;
    }

    const button = form.querySelector('button[type="submit"]');
    const original = button.innerHTML;
    button.disabled = true;
    button.textContent = 'Отправляем…';

    try {
      await api('/api/messages', {
        method: 'POST',
        body: JSON.stringify({
          name: document.getElementById('imya').value.trim(),
          email: document.getElementById('email').value.trim(),
          phone: document.getElementById('telefon')?.value.trim() || '',
          subject: document.getElementById('tema')?.value || 'Другое',
          message: document.getElementById('tekst').value.trim()
        })
      });
      form.reset();
      rules.forEach(rule => clearError(rule.input));
      openModal();
    } catch (error) {
      showAlert(alertBox, error.message);
    } finally {
      button.disabled = false;
      button.innerHTML = original;
      refreshIcons();
    }
  });
}

document.addEventListener('DOMContentLoaded', () => {
  renderLayout();
  Theme.init();
  Cart.updateBadge();
  Compare.updateUI();
  initHeaderScroll();
  initParallax();
  initScrollUI();
  initContactForm();
  initContactCopy();
  document.addEventListener('click', event => {
    const card = event.target.closest('.tovar-card');
    if (!card || event.target.closest('a, button, input, textarea, select, label, [data-no-card-nav]')) return;
    const href = card.querySelector('.tovar-title a')?.href || card.querySelector('.tovar-link')?.href;
    if (href) location.href = href;
  });
  Cursor.init();
  Remotion.init();
  initTilt();
  initMagnets();
  initHeroStage();
  initCounters();
  initPreloader();
  document.body.classList.add('is-loaded');
  refreshIcons();
});
