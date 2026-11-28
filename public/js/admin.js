(() => {
  'use strict';

  const STATUS = {
    new: { label: 'Новый' },
    paid: { label: 'Оплачен' },
    packed: { label: 'Укомплектован' },
    shipping: { label: 'В доставке' },
    done: { label: 'Выполнен' },
    cancelled: { label: 'Отменён' }
  };
  const STATUS_KEYS = Object.keys(STATUS);

  const DELIVERY = {
    courier: 'Курьер по Оренбургу',
    pickup: 'Самовывоз',
    post: 'Транспортная компания'
  };
  const PAYMENT = {
    card_online: 'Картой онлайн',
    card_pickup: 'Картой при получении',
    cash: 'Наличными'
  };

  const state = {
    me: null,
    section: 'dashboard',
    overview: null,
    categories: [],
    products: [],
    orders: [],
    reviews: [],
    messages: [],
    users: [],
    filters: {
      productQ: '',
      productCategory: 'all',
      orderStatus: 'all',
      orderQ: ''
    }
  };

  const BADGE_SEEN_KEY = 'technomir-admin-seen-badges';
  const SECTION_BADGE_FIELDS = { products: 'products', orders: 'newOrders' };

  let activeRender = 0;
  let productTimer = 0;
  let orderTimer = 0;

  const $ = selector => document.querySelector(selector);
  const $$ = selector => Array.from(document.querySelectorAll(selector));

  const statusLabel = key => STATUS[key]?.label || key;
  const NUMBER_FORMAT = new Intl.NumberFormat('ru-RU');
  const formatNumber = value => NUMBER_FORMAT.format(Number(value) || 0);
  const loadingHtml = (text = 'Загрузка…') =>
    `<div class="loading"><span class="spinner"></span> ${escapeHtml(text)}</div>`;
  const errorHtml = message =>
    `<div class="alert alert-error">${icon('triangle-alert')}<span>${escapeHtml(message)}</span></div>`;
  const emptyHtml = (title, text, iconName = 'inbox') =>
    `<div class="ad-empty">${icon(iconName)}<h3>${escapeHtml(title)}</h3><p>${escapeHtml(text)}</p></div>`;

  function nextRender() {
    return ++activeRender;
  }

  async function adminApi(url, options = {}) {
    const res = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
        ...Auth.headers(),
        ...(options.headers || {})
      },
      ...options
    });
    const data = await res.json().catch(() => ({}));

    if (res.status === 401) {
      localStorage.removeItem('technomir_token');
      localStorage.removeItem('technomir_user');
      showGate('Сессия истекла – войдите снова.');
      throw new Error(data.error || 'Требуется авторизация');
    }
    if (res.status === 403) {
      showGate('Недостаточно прав. Войдите под учётной записью администратора.');
      throw new Error(data.error || 'Нет доступа');
    }
    if (!res.ok) throw new Error(data.error || 'Не удалось выполнить запрос');
    return data;
  }

  function showGate(message = '') {
    state.me = null;
    const gate = $('#ad-gate');
    const app = $('#ad-app');
    if (app) app.hidden = true;
    if (gate) gate.hidden = false;
    const content = $('#ad-content');
    if (content) content.innerHTML = '';
    closeModal();
    setSide(false);
    const alertBox = $('#ad-login-msg');
    if (alertBox) {
      if (message) showAlert(alertBox, message, 'error');
      else alertBox.innerHTML = '';
    }
    refreshIcons();
    setTimeout(() => $('#ad-login')?.focus(), 120);
  }

  function showApp() {
    if (!state.me) return;
    const gate = $('#ad-gate');
    const app = $('#ad-app');
    if (gate) gate.hidden = true;
    if (app) app.hidden = false;

    const avatar = $('#ad-avatar');
    const username = $('#ad-name');
    if (avatar) avatar.textContent = String(state.me.username || 'A').slice(0, 1).toUpperCase();
    if (username) username.textContent = state.me.username;
    $('#ad-login-msg').innerHTML = '';

    if (!location.hash || !SECTIONS[location.hash.slice(1)]) {
      history.replaceState(null, '', '#dashboard');
    }
    route();
    refreshBadges();
    refreshIcons();
  }

  function logout() {
    const token = Auth.token();
    if (token) {
      fetch('/api/auth/logout', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      }).catch(() => {});
    }
    localStorage.removeItem('technomir_token');
    localStorage.removeItem('technomir_user');
    showGate('Вы вышли из панели.');
    toast('Сессия закрыта', 'info');
  }

  async function boot() {
    if (!Auth.token()) {
      showGate();
      return;
    }
    try {
      const me = await adminApi('/api/auth/me');
      if (me.role !== 'admin') {
        showGate('Для доступа в панель нужна учётная запись администратора.');
        return;
      }
      state.me = me;
      showApp();
    } catch {
      showGate();
    }
  }

  function setSide(open) {
    $('#ad-side')?.classList.toggle('is-open', open);
    $('#ad-side-fon')?.classList.toggle('is-open', open);
  }

  function getSeenBadges() {
    try {
      return JSON.parse(localStorage.getItem(BADGE_SEEN_KEY)) || {};
    } catch {
      return {};
    }
  }

  function markSectionSeen(section) {
    const field = SECTION_BADGE_FIELDS[section];
    if (!state.overview || !field) return;
    const seen = getSeenBadges();
    seen[section] = Number(state.overview[field]) || 0;
    localStorage.setItem(BADGE_SEEN_KEY, JSON.stringify(seen));
    updateBadges(state.overview);
  }

  function route() {
    if (!state.me) return;
    const key = (location.hash || '#dashboard').replace(/^#/, '');
    const section = SECTIONS[key] ? key : 'dashboard';
    state.section = section;
    markSectionSeen(section);

    $$('.ad-nav-link').forEach(link => {
      link.classList.toggle('is-active', link.dataset.section === section);
    });

    const meta = SECTIONS[section];
    const title = $('#ad-title');
    if (title) title.textContent = meta.label;

    setSide(false);
    window.scrollTo({ top: 0, behavior: 'auto' });
    meta.render();
  }

  function updateBadges(overview = state.overview) {
    if (!overview) return;
    const seen = getSeenBadges();
    const setBadge = (selector, value, seenKey = '') => {
      const el = $(selector);
      if (!el) return;
      const last = seenKey ? Number(seen[seenKey]) || 0 : 0;
      const count = Math.max(0, (Number(value) || 0) - last);
      el.textContent = formatNumber(count);
      el.classList.toggle('is-zero', count === 0);
    };
    setBadge('#nav-tovary', overview.products, 'products');
    setBadge('#nav-orders', overview.newOrders, 'orders');
    setBadge('#nav-msg', overview.unreadMessages);
  }

  async function refreshBadges() {
    if (!state.me) return;
    try {
      const overview = await adminApi('/api/admin/overview');
      state.overview = overview;
      updateBadges(overview);
      markSectionSeen(state.section);
    } catch {}
  }

  function openModal({ kicker = '', title = '', body = '', footer = '', wide = false }) {
    const root = document.getElementById('ad-modal-root');
    if (!root) return;
    root.innerHTML = `
      <div class="ad-modal" id="ad-modal">
        <div class="ad-modal-dlg ${wide ? 'ad-modal-wide' : ''}" role="dialog" aria-modal="true" aria-label="${escapeHtml(title)}">
          <div class="ad-modal-head">
            <div>
              ${kicker ? `<span class="mono">${escapeHtml(kicker)}</span>` : ''}
              <h2>${escapeHtml(title)}</h2>
            </div>
            <button class="ad-modal-close" type="button" data-admin-action="modal-close" aria-label="Закрыть">${icon('x')}</button>
          </div>
          <div class="ad-modal-body">${body}</div>
          ${footer ? `<div class="ad-modal-foot">${footer}</div>` : ''}
        </div>
      </div>`;
    const modal = document.getElementById('ad-modal');
    document.body.style.overflow = 'hidden';

    void modal.offsetWidth;
    modal.classList.add('is-open');
    refreshIcons();
  }

  function closeModal() {
    const modal = document.getElementById('ad-modal');
    if (!modal) {
      document.body.style.overflow = '';
      return;
    }
    modal.classList.remove('is-open');
    document.body.style.overflow = '';
    setTimeout(() => {
      const root = document.getElementById('ad-modal-root');
      if (root && !root.querySelector('.ad-modal.is-open')) root.innerHTML = '';
    }, 260);
  }

  function setModalSaving(active, label = 'Сохранить') {
    const btn = document.getElementById('modal-save');
    if (!btn) return;
    if (active) {
      btn.dataset.original = btn.innerHTML;
      btn.disabled = true;
      btn.textContent = 'Сохраняем…';
    } else {
      btn.disabled = false;
      if (btn.dataset.original) btn.innerHTML = btn.dataset.original;
      else btn.innerHTML = `${icon('check')} ${label}`;
      refreshIcons();
    }
  }

  const SECTIONS = {
    dashboard: { label: 'Обзор', render: renderDashboard },
    products: { label: 'Товары', render: renderProductsSection },
    orders: { label: 'Заказы', render: renderOrdersSection },
    categories: { label: 'Категории', render: renderCategoriesSection },
    reviews: { label: 'Отзывы', render: renderReviewsSection },
    messages: { label: 'Сообщения', render: renderMessagesSection },
    users: { label: 'Пользователи', render: renderUsersSection }
  };

  function kpiCard({ tone = '', label, iconName, value, delta, deltaTone = '', bg = '' }) {
    return `
      <article class="kpi ${tone}">
        <div class="kpi-label"><span>${escapeHtml(label)}</span>${icon(iconName)}</div>
        <div class="kpi-value">${value}</div>
        <div class="kpi-delta ${deltaTone}">${delta}</div>
        ${bg ? `<span class="kpi-bg" aria-hidden="true">${escapeHtml(bg)}</span>` : ''}
      </article>`;
  }

  function chartSvg(series) {
    if (!series.length) return '';
    const W = 700;
    const H = 220;
    const left = 8;
    const right = 8;
    const top = 10;
    const bottom = 20;
    const max = Math.max(...series.map(item => Number(item.total) || 0), 1);
    const step = (W - left - right) / Math.max(series.length - 1, 1);
    const yFor = value => top + (H - top - bottom) * (1 - (Number(value) || 0) / max);
    const points = series.map((item, index) => [left + step * index, yFor(item.total)]);
    const baseline = (H - bottom).toFixed(1);
    const line = points.map(([x, y], index) => `${index ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
    const area = `M${points[0][0].toFixed(1)},${baseline} ` +
      points.map(([x, y]) => `L${x.toFixed(1)},${y.toFixed(1)}`).join(' ') +
      ` L${points[points.length - 1][0].toFixed(1)},${baseline} Z`;

    const grid = [0, 0.5, 1].map(part => {
      const y = yFor(max * part).toFixed(1);
      return `<line class="chart-path" x1="${left}" x2="${W - right}" y1="${y}" y2="${y}"/>`;
    }).join('');

    const dots = points.map(([x, y], index) => `
      <circle class="chart-dot" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="2.4">
        <title>${escapeHtml(series[index].label)}: ${escapeHtml(fmtPrice(series[index].total))}</title>
      </circle>`).join('');

    return `
      <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="График выручки за 14 дней">
        <defs>
          <linearGradient id="chartArea" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#1453ff" stop-opacity=".55"/>
            <stop offset="100%" stop-color="#1453ff" stop-opacity="0"/>
          </linearGradient>
        </defs>
        ${grid}
        <path class="chart-area" d="${area}"/>
        <path class="chart-line" d="${line}"/>
        ${dots}
      </svg>`;
  }

  function dashboardHtml(o) {
    const series = Array.isArray(o.series) ? o.series : [];
    const byStatus = Array.isArray(o.byStatus) ? o.byStatus : [];
    const recentOrders = Array.isArray(o.recentOrders) ? o.recentOrders : [];
    const topProducts = Array.isArray(o.topProducts) ? o.topProducts : [];
    const lowStockProducts = Array.isArray(o.lowStockProducts) ? o.lowStockProducts : [];

    const revenueDelta = o.revenuePrev30 > 0
      ? Math.round((o.revenue30 - o.revenuePrev30) / o.revenuePrev30 * 100)
      : null;
    const revenueDeltaTone = revenueDelta === null ? '' : revenueDelta >= 0 ? 'is-up' : 'is-down';
    const revenueDeltaText = revenueDelta === null
      ? (o.revenue30 > 0 ? 'первая выручка за период' : 'выручки пока нет')
      : `${revenueDelta > 0 ? '+' : ''}${revenueDelta}%`;

    const chartTotal = series.reduce((sum, item) => sum + (Number(item.total) || 0), 0);
    const chartOrders = series.reduce((sum, item) => sum + (Number(item.count) || 0), 0);
    const statusCounts = Object.fromEntries(byStatus.map(row => [row.status, Number(row.count) || 0]));
    const statusBase = Math.max(Number(o.orders) || 0, 1);

    const statusRows = STATUS_KEYS.map(key => {
      const count = statusCounts[key] || 0;
      const width = Math.round(count / statusBase * 100);
      return `
        <div class="status-row">
          <div class="status-row-top"><span>${statusLabel(key)}</span><b>${count}</b></div>
          <div class="stat-bar stat-bar-${key}"><span style="width:${width}%"></span></div>
        </div>`;
    }).join('');

    return `
      <div class="ad-head">
        <div>
          <h2>Сводка магазина</h2>
          <p>Ключевые показатели, динамика продаж и состояние каталога на текущий момент.</p>
        </div>
        <div class="ad-head-acts">
          <span class="ad-head-count">${formatNumber(o.orders)} заказов · ${formatNumber(o.products)} товаров</span>
          <button class="btn btn-ghost btn-sm" type="button" data-admin-action="reload-dashboard">${icon('refresh-cw')} Обновить</button>
        </div>
      </div>

      <div class="kpi-grid">
        ${kpiCard({
          tone: 'kpi-dark',
          label: 'Выручка · всего',
          iconName: 'wallet',
          value: fmtPrice(o.revenue),
          delta: `Средний чек · <b>${fmtPrice(o.avgOrder)}</b>`,
          bg: '₽'
        })}
        ${kpiCard({
          tone: 'kpi-acid',
          label: 'Оборот за 30 дней',
          iconName: 'trending-up',
          value: fmtPrice(o.revenue30),
          delta: revenueDelta === null
            ? revenueDeltaText
            : `<b>${revenueDeltaText}</b> к прошлым 30 дням`,
          deltaTone: revenueDeltaTone,
          bg: '30'
        })}
        ${kpiCard({
          label: 'Заказы',
          iconName: 'receipt-text',
          value: formatNumber(o.orders),
          delta: `<b>${formatNumber(o.newOrders)}</b> новых в обработке`,
          bg: '№'
        })}
        ${kpiCard({
          label: 'Каталог',
          iconName: 'package',
          value: formatNumber(o.products),
          delta: `<b>${formatNumber(o.lowStock)}</b> с низким остатком`,
          bg: 'TM'
        })}
      </div>

      <section class="ad-grid">
        <div class="panel">
          <div class="panel-head">
            <div>
              <h3 class="panel-title">Динамика продаж</h3>
              <p class="panel-sub">14 дней · выручка по дням</p>
            </div>
            <span class="panel-link">${fmtPrice(chartTotal)}</span>
          </div>
          <div class="chart">
            ${chartSvg(series)}
            <div class="chart-labels">${series.map(item => `<span>${escapeHtml(item.label)}</span>`).join('')}</div>
            <div class="chart-legend">
              <span><i></i> выручка за 14 дней</span>
              <span><i class="is-acid"></i> ${formatNumber(chartOrders)} заказов</span>
            </div>
          </div>
        </div>

        <div style="display:flex;flex-direction:column;gap:10px">
          <div class="panel">
            <div class="panel-head">
              <div>
                <h3 class="panel-title">Заказы по статусам</h3>
                <p class="panel-sub">всего ${formatNumber(o.orders)}</p>
              </div>
              <a class="panel-link" href="#orders">Все ${icon('arrow-right')}</a>
            </div>
            <div class="status-list">${statusRows}</div>
          </div>

          <div class="panel">
            <div class="panel-head">
              <div>
                <h3 class="panel-title">Оперативно</h3>
                <p class="panel-sub">сводка по разделу</p>
              </div>
            </div>
            <div class="ops-list">
              <a class="ops-item" href="#users">
                <span class="ops-item-icon">${icon('users')}</span>
                <div class="ops-item-body"><b>Покупатели</b><span>зарегистрировано</span></div>
                <span class="ops-item-value">${formatNumber(o.users)}</span>
              </a>
              <a class="ops-item" href="#reviews">
                <span class="ops-item-icon">${icon('message-square')}</span>
                <div class="ops-item-body"><b>Отзывы</b><span>на товары</span></div>
                <span class="ops-item-value">${formatNumber(o.reviews)}</span>
              </a>
              <a class="ops-item" href="#messages">
                <span class="ops-item-icon">${icon('mail')}</span>
                <div class="ops-item-body"><b>Сообщения</b><span>без ответа</span></div>
                <span class="ops-item-value ${o.unreadMessages ? 'is-alert' : ''}">${formatNumber(o.unreadMessages)}</span>
              </a>
            </div>
          </div>
        </div>
      </section>

      <section class="panel panel-flush">
        <div class="panel-head">
          <div>
            <h3 class="panel-title">Последние заказы</h3>
            <p class="panel-sub">${formatNumber(recentOrders.length)} из ${formatNumber(o.orders)}</p>
          </div>
          <a class="panel-link" href="#orders">Все заказы ${icon('arrow-right')}</a>
        </div>
        <div class="ad-table-wrap">
          <table class="ad-table">
            <thead>
              <tr>
                <th>Заказ</th>
                <th>Покупатель</th>
                <th class="is-num">Сумма</th>
                <th>Статус</th>
                <th>Дата</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              ${recentOrders.length ? recentOrders.map(order => `
                <tr>
                  <td class="is-mono">${escapeHtml(order.order_number)}</td>
                  <td><b>${escapeHtml(order.customer_name)}</b></td>
                  <td class="is-num">${fmtPrice(order.total)}</td>
                  <td><span class="ad-status ad-status-${escapeHtml(order.status)}">${escapeHtml(statusLabel(order.status))}</span></td>
                  <td class="is-mono">${fmtDateShort(order.created_at)}</td>
                  <td class="is-num">
                    <button class="ad-icon-btn" type="button" data-admin-action="view-order" data-id="${order.id}" title="Открыть заказ">${icon('arrow-up-right')}</button>
                  </td>
                </tr>`).join('') : `<tr><td colspan="6">${emptyHtml('Заказов пока нет', 'Как только покупатель оформит заказ, он появится здесь.')}</td></tr>`}
            </tbody>
          </table>
        </div>
      </section>

      <section class="ad-grid ad-grid-even">
        <div class="panel">
          <div class="panel-head">
            <div>
              <h3 class="panel-title">Топ товаров</h3>
              <p class="panel-sub">по количеству продаж</p>
            </div>
          </div>
          <div class="ops-list">
            ${topProducts.length ? topProducts.map((product, index) => `
              <div class="ops-item">
                <span class="ops-item-icon" style="font-family:var(--font-mono);font-size:9px">${String(index + 1).padStart(2, '0')}</span>
                <div class="ops-item-body">
                  <b>${escapeHtml(product.name)}</b>
                  <span>${formatNumber(product.sold)} продано · ${fmtPrice(product.revenue)}</span>
                </div>
                <span class="ops-item-value">${formatNumber(product.sold)}</span>
              </div>`).join('') : `<p class="status-empty">Продаж пока нет – данные появятся после первых заказов.</p>`}
          </div>
        </div>

        <div class="panel">
          <div class="panel-head">
            <div>
              <h3 class="panel-title">Низкий остаток</h3>
              <p class="panel-sub">3 штуки и меньше</p>
            </div>
            <a class="panel-link" href="#products">Каталог ${icon('arrow-right')}</a>
          </div>
          <div class="ops-list">
            ${lowStockProducts.length ? lowStockProducts.map(product => `
              <a class="ops-item" href="#products">
                <span class="ops-item-icon">${icon('package')}</span>
                <div class="ops-item-body">
                  <b>${escapeHtml(product.name)}</b>
                  <span>${product.stock > 0 ? 'осталось на складе' : 'нет в наличии'}</span>
                </div>
                <span class="ops-item-value ${product.stock <= 0 ? 'is-alert' : ''}">${formatNumber(product.stock)}</span>
              </a>`).join('') : `<p class="status-empty">Все товары в наличии с запасом – пополнение не требуется.</p>`}
          </div>
        </div>
      </section>`;
  }

  async function renderDashboard() {
    const content = $('#ad-content');
    const token = nextRender();
    content.innerHTML = loadingHtml('Загрузка сводки…');
    try {
      const overview = await adminApi('/api/admin/overview');
      if (token !== activeRender) return;
      state.overview = overview;
      updateBadges(overview);
      content.innerHTML = dashboardHtml(overview);
      refreshIcons();
    } catch (error) {
      if (token !== activeRender) return;
      content.innerHTML = errorHtml(error.message);
      refreshIcons();
    }
  }

  async function getCategories(force = false) {
    if (force || !state.categories.length) {
      state.categories = await adminApi('/api/admin/categories');
    }
    return state.categories;
  }

  function adminProductCard(product) {
    const stock = Number(product.stock) || 0;
    const stockClass = stock <= 0 ? 'is-out' : stock <= 3 ? 'is-low' : '';
    return `
      <article class="ad-product">
        <div class="ad-tovar-media">
          <img src="${escapeHtml(productImage(product.image))}" alt="${escapeHtml(product.name)}" loading="lazy">
          <div class="ad-badges">
            ${Number(product.is_active) ? '' : '<span class="tag tag-dark">Скрыт</span>'}
            ${Number(product.is_featured) ? '<span class="tag tag-acid">Хит</span>' : ''}
            ${stock <= 0 ? '<span class="tag tag-sale">Нет</span>' : stock <= 3 ? '<span class="tag tag-line">Мало</span>' : ''}
          </div>
        </div>
        <div class="ad-tovar-body">
          <span class="ad-tovar-cat">${escapeHtml(product.category_name)} · TM-${String(product.id).padStart(4, '0')}</span>
          <h3 class="ad-tovar-name">${escapeHtml(product.name)}</h3>
          <div class="ad-tovar-meta">
            <span class="ad-tovar-price">${fmtPrice(product.price)}</span>
            <span class="ad-tovar-stock ${stockClass}">${stock > 0 ? `${stock} шт.` : 'нет в наличии'}</span>
          </div>
          <div class="ad-tovar-acts">
            <button class="ad-icon-btn" type="button" data-admin-action="edit-product" data-id="${product.id}" title="Редактировать">${icon('pencil')}</button>
            <button class="ad-icon-btn is-danger" type="button" data-admin-action="delete-product" data-id="${product.id}" title="Удалить">${icon('trash-2')}</button>
            <a class="ad-icon-btn" href="/product.html?id=${product.id}" target="_blank" rel="noopener" title="Открыть на сайте">${icon('external-link')}</a>
            <input class="ad-stock-input" type="number" min="0" step="1" value="${stock}"
                  data-admin-change="stock" data-id="${product.id}" style="margin-left:auto"
                  aria-label="Остаток товара ${escapeHtml(product.name)}" title="Остаток на складе">
          </div>
        </div>
      </article>`;
  }

  function renderProductsGrid() {
    const box = $('#ad-products');
    if (!box) return;
    const count = $('#count-tovarov');
    if (count) {
      count.textContent = `${formatNumber(state.products.length)} ${plural(state.products.length, 'позиция', 'позиции', 'позиций')}`;
    }
    if (!state.products.length) {
      box.innerHTML = emptyHtml(
        'Товары не найдены',
        'Измените поисковый запрос или категорию. Новый товар можно добавить кнопкой выше.',
        'package-search'
      );
      refreshIcons();
      return;
    }
    box.innerHTML = `<div class="ad-tovar-grid">${state.products.map(adminProductCard).join('')}</div>`;
    refreshIcons();
  }

  async function loadProducts() {
    const box = $('#ad-products');
    if (!box) return;
    try {
      const params = new URLSearchParams();
      if (state.filters.productQ.trim()) params.set('q', state.filters.productQ.trim());
      if (state.filters.productCategory !== 'all') params.set('category', state.filters.productCategory);
      const suffix = params.toString() ? `?${params.toString()}` : '';
      state.products = await adminApi('/api/admin/products' + suffix);
      renderProductsGrid();
    } catch (error) {
      box.innerHTML = errorHtml(error.message);
      refreshIcons();
    }
  }

  async function renderProductsSection() {
    const content = $('#ad-content');
    const token = nextRender();
    content.innerHTML = loadingHtml('Загрузка каталога…');
    try {
      await getCategories(true);
      if (token !== activeRender) return;
      content.innerHTML = `
        <div class="ad-head">
          <div>
            <h2>Товары</h2>
            <p>Карточки, цены, остатки и характеристики. Изменения сразу отражаются на витрине магазина.</p>
          </div>
          <div class="ad-head-acts">
            <span class="ad-head-count" id="count-tovarov">–</span>
            <button class="btn btn-dark btn-sm" type="button" data-admin-action="add-product">${icon('plus')} Новый товар</button>
          </div>
        </div>

        <div class="ad-toolbar">
          <div class="ad-search">
            ${icon('search')}
            <input type="search" data-admin-input="product-search" value="${escapeHtml(state.filters.productQ)}"
                  placeholder="Поиск по названию или описанию" aria-label="Поиск товаров">
          </div>
          <select class="ad-select" data-admin-change="product-category" aria-label="Категория товаров">
            <option value="all" ${state.filters.productCategory === 'all' ? 'selected' : ''}>Все категории</option>
            ${state.categories.map(category => `
              <option value="${category.id}" ${state.filters.productCategory === String(category.id) ? 'selected' : ''}>
                ${escapeHtml(category.name)} · ${category.product_count}
              </option>`).join('')}
          </select>
          <button class="btn btn-ghost btn-sm" type="button" data-admin-action="reload-products">${icon('refresh-cw')} Обновить</button>
        </div>

        <div id="ad-products">${loadingHtml('Загрузка товаров…')}</div>`;
      refreshIcons();
      await loadProducts();
    } catch (error) {
      if (token !== activeRender) return;
      content.innerHTML = errorHtml(error.message);
      refreshIcons();
    }
  }

  function specRow(key = '', value = '') {
    return `
      <div class="spec-row">
        <input type="text" data-spec-key placeholder="Характеристика" value="${escapeHtml(key)}">
        <input type="text" data-spec-value placeholder="Значение" value="${escapeHtml(value)}">
        <button type="button" data-admin-action="remove-spec" aria-label="Удалить строку">${icon('x')}</button>
      </div>`;
  }

  async function openProductModal(product = null) {
    if (!state.categories.length) {
      try { await getCategories(true); }
      catch (error) { toast(error.message, 'error'); return; }
    }

    const item = product || {
      id: 0,
      name: '',
      description: '',
      image: '',
      category_id: state.categories[0] ? state.categories[0].id : '',
      price: '',
      old_price: '',
      stock: 0,
      specs: {},
      is_featured: 0,
      is_active: 1
    };

    const specEntries = Object.entries(item.specs || {});
    if (!specEntries.length) specEntries.push(['', ''], ['', '']);

    const body = `
      <form class="ad-form" id="tovar-form" data-admin-form="product" data-id="${item.id || ''}">
        <div class="ad-form-error" id="modal-error"></div>
        <div class="form-grid">
          <div class="form-field full">
            <label for="pf-name">Название <span>*</span></label>
            <input id="pf-name" name="name" required minlength="2" value="${escapeHtml(item.name)}" placeholder="Например, iPhone 16 Pro 256 ГБ">
          </div>
          <div class="form-field">
            <label for="pf-category">Категория <span>*</span></label>
            <select id="pf-category" name="category_id" required>
              ${state.categories.map(category => `
                <option value="${category.id}" ${Number(item.category_id) === Number(category.id) ? 'selected' : ''}>
                  ${escapeHtml(category.name)}
                </option>`).join('')}
            </select>
          </div>
          <div class="form-field">
            <label for="pf-image">Изображение <span>*</span></label>
            <input id="pf-image" name="image" required value="${escapeHtml(item.image || '')}" placeholder="phone1.jpg или https://…">
          </div>
          <div class="form-field">
            <label for="pf-price">Цена, ₽ <span>*</span></label>
            <input id="pf-price" type="number" name="price" required min="1" step="1" value="${item.price !== null && item.price !== undefined ? item.price : ''}">
          </div>
          <div class="form-field">
            <label for="pf-old-price">Старая цена, ₽</label>
            <input id="pf-old-price" type="number" name="old_price" min="1" step="1" value="${item.old_price !== null && item.old_price !== undefined ? item.old_price : ''}">
          </div>
          <div class="form-field">
            <label for="pf-stock">Остаток, шт. <span>*</span></label>
            <input id="pf-stock" type="number" name="stock" required min="0" step="1" value="${Number(item.stock) || 0}">
          </div>
          <div class="form-field full">
            <label for="pf-desc">Описание <span>*</span></label>
            <textarea id="pf-desc" name="description" required minlength="10" rows="4" placeholder="Коротко о товаре, его возможностях и комплектации…">${escapeHtml(item.description)}</textarea>
          </div>
        </div>

        <div class="ad-checks">
          <label class="ad-check"><input type="checkbox" name="is_featured" ${Number(item.is_featured) ? 'checked' : ''}> Хит на главной</label>
          <label class="ad-check"><input type="checkbox" name="is_active" ${Number(item.is_active) ? 'checked' : ''}> Показывать в каталоге</label>
        </div>

        <div class="ad-specs">
          <div class="ad-specs-head">
            <span class="form-label">Характеристики</span>
            <button type="button" data-admin-action="add-spec">+ Добавить строку</button>
          </div>
          <div class="spec-editor" id="spec-editor">${specEntries.map(([key, value]) => specRow(key, value)).join('')}</div>
        </div>
      </form>`;

    const footer = `
      ${item.id ? `<button class="btn btn-ghost btn-sm is-left" type="button" data-admin-action="delete-product" data-id="${item.id}">${icon('trash-2')} Удалить</button>` : ''}
      <button class="btn btn-ghost btn-sm" type="button" data-admin-action="modal-close">Отмена</button>
      <button class="btn btn-dark btn-sm" type="submit" form="tovar-form" id="modal-save">${icon('check')} Сохранить</button>`;

    openModal({
      kicker: item.id ? `Каталог / TM-${String(item.id).padStart(4, '0')}` : 'Каталог / новый товар',
      title: item.id ? 'Редактирование товара' : 'Новый товар',
      body,
      footer
    });

    setTimeout(() => $('#pf-name')?.focus(), 100);
  }

  function collectSpecs(form) {
    const specs = {};
    form.querySelectorAll('.spec-row').forEach(row => {
      const key = row.querySelector('[data-spec-key]')?.value.trim();
      const value = row.querySelector('[data-spec-value]')?.value.trim();
      if (key && value) specs[key] = value;
    });
    return specs;
  }

  async function saveProduct(form) {
    const id = Number(form.dataset.id) || 0;
    const data = new FormData(form);
    const oldPriceRaw = String(data.get('old_price') || '').trim();
    const payload = {
      name: String(data.get('name') || '').trim(),
      description: String(data.get('description') || '').trim(),
      image: String(data.get('image') || '').trim(),
      category_id: Number(data.get('category_id')),
      price: Number(data.get('price')),
      old_price: oldPriceRaw ? Number(oldPriceRaw) : null,
      stock: Math.max(0, parseInt(data.get('stock'), 10) || 0),
      specs: collectSpecs(form),
      is_featured: form.querySelector('[name="is_featured"]').checked,
      is_active: form.querySelector('[name="is_active"]').checked
    };

    const errorBox = $('#modal-error');
    setModalSaving(true);
    try {
      await adminApi('/api/admin/products' + (id ? `/${id}` : ''), {
        method: id ? 'PUT' : 'POST',
        body: JSON.stringify(payload)
      });
      closeModal();
      toast(id ? 'Товар обновлён' : 'Товар добавлен в каталог', 'success');
      await loadProducts();
      refreshBadges();
    } catch (error) {
      showAlert(errorBox, error.message);
      setModalSaving(false);
    }
  }

  async function deleteProduct(id) {
    const product = state.products.find(item => item.id === id);
    const name = product ? product.name : `#${id}`;
    if (!confirm(`Удалить товар «${name}»? Действие нельзя отменить.`)) return;
    try {
      await adminApi(`/api/admin/products/${id}`, { method: 'DELETE' });
      closeModal();
      toast('Товар удалён', 'success');
      await loadProducts();
      refreshBadges();
    } catch (error) {
      toast(error.message, 'error');
    }
  }

  async function updateStock(input) {
    const id = Number(input.dataset.id);
    const product = state.products.find(item => item.id === id);
    const value = Math.max(0, parseInt(input.value, 10) || 0);
    input.value = value;
    try {
      await adminApi(`/api/admin/products/${id}/stock`, {
        method: 'PATCH',
        body: JSON.stringify({ stock: value })
      });
      if (product) product.stock = value;
      toast('Остаток обновлён', 'success');
      refreshBadges();
    } catch (error) {
      if (product) input.value = product.stock;
      toast(error.message, 'error');
    }
  }

  function categoryCard(category) {
    return `
      <article class="ad-cat-card">
        <div class="ad-cat-head">
          <div>
            <h3>${escapeHtml(category.name)}</h3>
            <code class="ad-cat-slug">${escapeHtml(category.slug)}</code>
          </div>
          <div class="ad-acts">
            <button class="ad-icon-btn" type="button" data-admin-action="edit-category" data-id="${category.id}" title="Редактировать">${icon('pencil')}</button>
            <button class="ad-icon-btn is-danger" type="button" data-admin-action="delete-category" data-id="${category.id}" title="Удалить">${icon('trash-2')}</button>
          </div>
        </div>
        <div class="ad-cat-foot">
          <span class="ad-cat-count"><b>${formatNumber(category.product_count)}</b> ${plural(category.product_count, 'товар', 'товара', 'товаров')}</span>
          <a class="panel-link" href="/catalog.html?category=${encodeURIComponent(category.slug)}" target="_blank" rel="noopener">На сайте ${icon('arrow-up-right')}</a>
        </div>
      </article>`;
  }

  async function renderCategoriesSection() {
    const content = $('#ad-content');
    const token = nextRender();
    content.innerHTML = loadingHtml('Загрузка категорий…');
    try {
      state.categories = await adminApi('/api/admin/categories');
      if (token !== activeRender) return;
      content.innerHTML = `
        <div class="ad-head">
          <div>
            <h2>Категории</h2>
            <p>Разделы каталога и привязка товаров. Категорию с товарами удалить нельзя – сначала перенесите позиции.</p>
          </div>
          <div class="ad-head-acts">
            <span class="ad-head-count">${formatNumber(state.categories.length)} ${plural(state.categories.length, 'раздел', 'раздела', 'разделов')}</span>
            <button class="btn btn-dark btn-sm" type="button" data-admin-action="add-category">${icon('plus')} Новая категория</button>
          </div>
        </div>
        ${state.categories.length
          ? `<div class="ad-cat-grid">${state.categories.map(categoryCard).join('')}</div>`
          : emptyHtml('Категорий нет', 'Добавьте первый раздел каталога, чтобы приступить к наполнению.', 'shapes')}`;
      refreshIcons();
    } catch (error) {
      if (token !== activeRender) return;
      content.innerHTML = errorHtml(error.message);
      refreshIcons();
    }
  }

  function openCategoryModal(category = null) {
    const item = category || { id: 0, name: '', slug: '' };
    const body = `
      <form class="ad-form" id="kat-form" data-admin-form="category" data-id="${item.id || ''}">
        <div class="ad-form-error" id="modal-error"></div>
        <div class="form-grid">
          <div class="form-field full">
            <label for="cf-name">Название <span>*</span></label>
            <input id="cf-name" name="name" required minlength="2" value="${escapeHtml(item.name)}" placeholder="Например, Аудио и звук">
          </div>
          <div class="form-field full">
            <label for="cf-slug">Slug</label>
            <input id="cf-slug" name="slug" value="${escapeHtml(item.slug)}" placeholder="audio" pattern="[a-z0-9]+(?:-[a-z0-9]+)*">
            <p class="form-note">Используется в ссылке каталога: /catalog.html?category=slug</p>
          </div>
        </div>
      </form>`;
    const footer = `
      ${item.id ? `<button class="btn btn-ghost btn-sm is-left" type="button" data-admin-action="delete-category" data-id="${item.id}">${icon('trash-2')} Удалить</button>` : ''}
      <button class="btn btn-ghost btn-sm" type="button" data-admin-action="modal-close">Отмена</button>
      <button class="btn btn-dark btn-sm" type="submit" form="kat-form" id="modal-save">${icon('check')} Сохранить</button>`;
    openModal({
      kicker: item.id ? `Категории / ${item.slug}` : 'Категории / новая',
      title: item.id ? 'Редактирование категории' : 'Новая категория',
      body,
      footer
    });
    setTimeout(() => $('#cf-name')?.focus(), 100);
  }

  async function saveCategory(form) {
    const id = Number(form.dataset.id) || 0;
    const data = new FormData(form);
    const payload = {
      name: String(data.get('name') || '').trim(),
      slug: String(data.get('slug') || '').trim().toLowerCase()
    };
    setModalSaving(true);
    try {
      await adminApi('/api/admin/categories' + (id ? `/${id}` : ''), {
        method: id ? 'PUT' : 'POST',
        body: JSON.stringify(payload)
      });
      closeModal();
      toast(id ? 'Категория обновлена' : 'Категория добавлена', 'success');
      state.categories = [];
      renderCategoriesSection();
    } catch (error) {
      showAlert($('#modal-error'), error.message);
      setModalSaving(false);
    }
  }

  async function deleteCategory(id) {
    const category = state.categories.find(item => item.id === id);
    const name = category ? category.name : `#${id}`;
    if (!confirm(`Удалить категорию «${name}»?`)) return;
    try {
      await adminApi(`/api/admin/categories/${id}`, { method: 'DELETE' });
      closeModal();
      toast('Категория удалена', 'success');
      state.categories = [];
      renderCategoriesSection();
    } catch (error) {
      toast(error.message, 'error');
    }
  }

  function orderCounts() {
    const counts = { all: state.orders.length };
    STATUS_KEYS.forEach(key => { counts[key] = 0; });
    state.orders.forEach(order => {
      if (counts[order.status] === undefined) counts[order.status] = 0;
      counts[order.status] += 1;
    });
    return counts;
  }

  function renderOrderTabs() {
    const box = $('#order-tabs');
    if (!box) return;
    const counts = orderCounts();
    box.innerHTML = ['all', ...STATUS_KEYS].map(key => {
      const label = key === 'all' ? 'Все' : statusLabel(key);
      return `<button class="ad-tab ${state.filters.orderStatus === key ? 'is-active' : ''}" type="button" data-order-tab="${key}">${label} · ${counts[key] || 0}</button>`;
    }).join('');
  }

  function filteredOrders() {
    let list = state.orders;
    if (state.filters.orderStatus !== 'all') {
      list = list.filter(order => order.status === state.filters.orderStatus);
    }
    const query = state.filters.orderQ.trim().toLowerCase();
    if (query) {
      list = list.filter(order => [
        order.order_number,
        order.customer_name,
        order.phone,
        order.email
      ].some(value => String(value || '').toLowerCase().includes(query)));
    }
    return list;
  }

  function renderOrdersTable() {
    const box = $('#orders-box');
    if (!box) return;
    const list = filteredOrders();
    const countEl = $('#count-orders');
    if (countEl) {
      countEl.textContent = list.length === state.orders.length
        ? `${formatNumber(state.orders.length)} ${plural(state.orders.length, 'заказ', 'заказа', 'заказов')}`
        : `${formatNumber(list.length)} из ${formatNumber(state.orders.length)}`;
    }

    if (!list.length) {
      box.innerHTML = emptyHtml(
        'Заказов не найдено',
        state.orders.length
          ? 'Попробуйте сбросить фильтр или изменить поисковый запрос.'
          : 'Новые заказы появятся здесь сразу после оформления на витрине.',
        'receipt-text'
      );
      refreshIcons();
      return;
    }

    box.innerHTML = `
      <div class="panel panel-flush">
        <div class="ad-table-wrap">
          <table class="ad-table">
            <thead>
              <tr>
                <th>Заказ</th>
                <th>Покупатель</th>
                <th class="is-num">Позиции</th>
                <th class="is-num">Сумма</th>
                <th>Статус</th>
                <th>Дата</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              ${list.map(order => `
                <tr>
                  <td class="is-mono">${escapeHtml(order.order_number)}</td>
                  <td>
                    <b>${escapeHtml(order.customer_name)}</b><br>
                    <span style="color:var(--muted);font-size:10px">${escapeHtml(order.phone || '–')}</span>
                  </td>
                  <td class="is-num">${formatNumber(order.item_count || 0)}</td>
                  <td class="is-num"><b>${fmtPrice(order.total)}</b></td>
                  <td>
                    <select class="ad-role-select" data-admin-change="order-status" data-id="${order.id}" aria-label="Статус заказа ${escapeHtml(order.order_number)}">
                      ${STATUS_KEYS.map(key => `<option value="${key}" ${order.status === key ? 'selected' : ''}>${statusLabel(key)}</option>`).join('')}
                    </select>
                  </td>
                  <td class="is-mono">${fmtDateShort(order.created_at)}</td>
                  <td>
                    <div class="ad-acts">
                      <button class="ad-icon-btn" type="button" data-admin-action="view-order" data-id="${order.id}" title="Открыть заказ">${icon('eye')}</button>
                      <button class="ad-icon-btn is-danger" type="button" data-admin-action="delete-order" data-id="${order.id}" title="Удалить заказ">${icon('trash-2')}</button>
                    </div>
                  </td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>`;
    refreshIcons();
  }

  async function renderOrdersSection() {
    const content = $('#ad-content');
    const token = nextRender();
    content.innerHTML = loadingHtml('Загрузка заказов…');
    try {
      state.orders = await adminApi('/api/admin/orders');
      if (token !== activeRender) return;
      content.innerHTML = `
        <div class="ad-head">
          <div>
            <h2>Заказы</h2>
            <p>Обработка заказов, статусы доставки и связь с покупателями. Статус можно менять прямо в таблице.</p>
          </div>
          <div class="ad-head-acts">
            <span class="ad-head-count" id="count-orders">–</span>
            <button class="btn btn-ghost btn-sm" type="button" data-admin-action="reload-orders">${icon('refresh-cw')} Обновить</button>
          </div>
        </div>

        <div class="ad-toolbar">
          <div class="ad-search">
            ${icon('search')}
            <input type="search" data-admin-input="order-search" value="${escapeHtml(state.filters.orderQ)}"
                  placeholder="Номер, имя, телефон или email" aria-label="Поиск заказов">
          </div>
        </div>

        <div class="ad-tabs" id="order-tabs"></div>
        <div id="orders-box"></div>`;
      renderOrderTabs();
      renderOrdersTable();
      refreshIcons();
      refreshBadges();
    } catch (error) {
      if (token !== activeRender) return;
      content.innerHTML = errorHtml(error.message);
      refreshIcons();
    }
  }

  async function openOrderModal(id) {
    let order;
    try {
      order = await adminApi(`/api/admin/orders/${id}`);
    } catch (error) {
      toast(error.message, 'error');
      return;
    }

    const items = Array.isArray(order.items) ? order.items : [];
    const address = [order.city, order.postal_code, order.address].filter(Boolean).join(', ');
    const body = `
      <div class="ad-form-error" id="modal-error"></div>
      <div class="ad-order-grid">
        <div class="ad-order-cell"><span>Покупатель</span><b>${escapeHtml(order.customer_name)}</b></div>
        <div class="ad-order-cell"><span>Телефон</span><b>${escapeHtml(order.phone || '–')}</b></div>
        <div class="ad-order-cell"><span>Email</span><b>${escapeHtml(order.email || '–')}</b></div>
        <div class="ad-order-cell"><span>Дата оформления</span><b>${fmtDate(order.created_at)}</b></div>
        <div class="ad-order-cell"><span>Доставка</span><b>${escapeHtml(DELIVERY[order.delivery_method] || order.delivery_method || '–')}</b></div>
        <div class="ad-order-cell"><span>Оплата</span><b>${escapeHtml(PAYMENT[order.payment_method] || order.payment_method || '–')}</b></div>
        <div class="ad-order-cell" style="grid-column:1/-1"><span>Адрес получения</span><b>${escapeHtml(address || '–')}</b></div>
        <div class="ad-order-cell" style="grid-column:1/-1"><span>Комментарий к заказу</span><b>${escapeHtml(order.comment || '–')}</b></div>
      </div>

      <div class="ad-order-items">
        ${items.length ? items.map(item => `
          <div class="ad-order-row">
            <span>${escapeHtml(item.name)} × ${item.qty}</span>
            <b>${fmtPrice(item.price * item.qty)}</b>
          </div>`).join('') : '<p class="status-empty">В заказе нет позиций.</p>'}
      </div>
      <div class="ad-order-total"><span>Итого</span><b>${fmtPrice(order.total)}</b></div>

      <div class="ad-form" style="margin-top:18px">
        <div class="form-grid">
          <div class="form-field">
            <label for="order-status">Статус заказа</label>
            <select id="order-status">
              ${STATUS_KEYS.map(key => `<option value="${key}" ${order.status === key ? 'selected' : ''}>${statusLabel(key)}</option>`).join('')}
            </select>
          </div>
          <div class="form-field">
            <label for="order-note">Комментарий</label>
            <textarea id="order-note" rows="2" placeholder="Пожелания по доставке, уточнения…">${escapeHtml(order.comment || '')}</textarea>
          </div>
        </div>
      </div>`;

    const footer = `
      <button class="btn btn-ghost btn-sm is-left" type="button" data-admin-action="delete-order" data-id="${order.id}">${icon('trash-2')} Удалить</button>
      <button class="btn btn-ghost btn-sm" type="button" data-admin-action="modal-close">Закрыть</button>
      <button class="btn btn-dark btn-sm" type="button" data-admin-action="save-order" data-id="${order.id}" id="order-save">${icon('check')} Сохранить</button>`;

    openModal({
      kicker: `Заказы / ${order.order_number}`,
      title: `Заказ ${order.order_number}`,
      body,
      footer,
      wide: true
    });
  }

  function refreshAfterOrderChange() {
    if (state.section === 'orders') {
      renderOrderTabs();
      renderOrdersTable();
    } else if (state.section === 'dashboard') {
      renderDashboard();
    }
    refreshBadges();
  }

  async function updateOrderStatus(select) {
    const id = Number(select.dataset.id);
    const status = select.value;
    select.disabled = true;
    try {
      const updated = await adminApi(`/api/admin/orders/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status })
      });
      const index = state.orders.findIndex(order => order.id === id);
      if (index >= 0) state.orders[index] = updated;
      toast(`Статус: ${statusLabel(status)}`, 'success');
      refreshAfterOrderChange();
    } catch (error) {
      toast(error.message, 'error');
      select.disabled = false;
    }
  }

  async function saveOrder(id) {
    const status = $('#order-status')?.value;
    const comment = $('#order-note')?.value.trim() || '';
    const button = $('#order-save');
    if (button) {
      button.disabled = true;
      button.textContent = 'Сохраняем…';
    }
    try {
      const updated = await adminApi(`/api/admin/orders/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status, comment })
      });
      const index = state.orders.findIndex(order => order.id === id);
      if (index >= 0) state.orders[index] = updated;
      closeModal();
      toast('Заказ обновлён', 'success');
      refreshAfterOrderChange();
    } catch (error) {
      showAlert($('#modal-error'), error.message);
      if (button) {
        button.disabled = false;
        button.innerHTML = `${icon('check')} Сохранить`;
        refreshIcons();
      }
    }
  }

  async function deleteOrder(id) {
    const order = state.orders.find(item => item.id === id);
    const label = order ? order.order_number : `#${id}`;
    if (!confirm(`Удалить заказ ${label}? Действие нельзя отменить.`)) return;
    try {
      await adminApi(`/api/admin/orders/${id}`, { method: 'DELETE' });
      state.orders = state.orders.filter(item => item.id !== id);
      closeModal();
      toast('Заказ удалён', 'success');
      refreshAfterOrderChange();
    } catch (error) {
      toast(error.message, 'error');
    }
  }

  function reviewCard(review) {
    const rating = Math.max(1, Math.min(5, Number(review.rating) || 0));
    const initial = String(review.author_name || '?').slice(0, 1).toUpperCase();
    return `
      <article class="ad-feed-item">
        <div class="ad-feed-head">
          <div class="ad-feed-author">
            <span class="ad-feed-avatar">${escapeHtml(initial)}</span>
            <div>
              <b>${escapeHtml(review.author_name)}</b>
              <span>${escapeHtml(review.product_name)}</span>
            </div>
          </div>
          <span class="ad-feed-date">${fmtDateShort(review.created_at)}</span>
        </div>
        <div class="ad-rating" aria-label="Оценка ${rating} из 5">
          ${[1, 2, 3, 4, 5].map(value => `<span class="${value <= rating ? 'is-on' : ''}">★</span>`).join('')}
        </div>
        <p class="ad-feed-text">${escapeHtml(review.text)}</p>
        <div class="ad-feed-foot">
          <div class="ad-feed-meta">
            ${icon('package')}
            <a href="/product.html?id=${review.product_id}" target="_blank" rel="noopener">${escapeHtml(review.product_name)}</a>
          </div>
          <div class="ad-feed-acts">
            <button class="ad-icon-btn is-danger" type="button" data-admin-action="delete-review" data-id="${review.id}" title="Удалить отзыв">${icon('trash-2')}</button>
          </div>
        </div>
      </article>`;
  }

  function updateReviewCount() {
    const el = $('#count-reviews');
    if (!el) return;
    const total = state.reviews.length;
    const average = total
      ? (state.reviews.reduce((sum, review) => sum + (Number(review.rating) || 0), 0) / total).toFixed(1)
      : '–';
    el.textContent = `${formatNumber(total)} ${plural(total, 'отзыв', 'отзыва', 'отзывов')} · средняя ${average}`;
  }

  function renderReviewsList() {
    const box = $('#review-box');
    if (!box) return;
    updateReviewCount();
    box.innerHTML = state.reviews.length
      ? `<div class="ad-feed">${state.reviews.map(reviewCard).join('')}</div>`
      : emptyHtml('Отзывов пока нет', 'Как только покупатели оценят товары, отзывы появятся здесь.', 'message-square');
    refreshIcons();
  }

  async function renderReviewsSection() {
    const content = $('#ad-content');
    const token = nextRender();
    content.innerHTML = loadingHtml('Загрузка отзывов…');
    try {
      state.reviews = await adminApi('/api/admin/reviews');
      if (token !== activeRender) return;
      content.innerHTML = `
        <div class="ad-head">
          <div>
            <h2>Отзывы покупателей</h2>
            <p>Модерация оценок и комментариев к товарам. Удалённый отзыв исчезает со страницы товара.</p>
          </div>
          <div class="ad-head-acts">
            <span class="ad-head-count" id="count-reviews">–</span>
          </div>
        </div>
        <div id="review-box"></div>`;
      renderReviewsList();
      refreshIcons();
    } catch (error) {
      if (token !== activeRender) return;
      content.innerHTML = errorHtml(error.message);
      refreshIcons();
    }
  }

  async function deleteReview(id) {
    const review = state.reviews.find(item => item.id === id);
    const author = review ? review.author_name : `#${id}`;
    if (!confirm(`Удалить отзыв автора «${author}»?`)) return;
    try {
      await adminApi(`/api/admin/reviews/${id}`, { method: 'DELETE' });
      state.reviews = state.reviews.filter(item => item.id !== id);
      toast('Отзыв удалён', 'success');
      renderReviewsList();
    } catch (error) {
      toast(error.message, 'error');
    }
  }

  function messageCard(message) {
    const initial = String(message.name || '?').slice(0, 1).toUpperCase();
    const unread = !Number(message.is_read);
    return `
      <article class="ad-feed-item ${unread ? 'is-unread' : ''}">
        <div class="ad-feed-head">
          <div class="ad-feed-author">
            <span class="ad-feed-avatar">${escapeHtml(initial)}</span>
            <div>
              <b>${escapeHtml(message.name)}</b>
              <span>${escapeHtml(message.email)}${message.phone ? ` · ${escapeHtml(message.phone)}` : ''}</span>
            </div>
          </div>
          <span class="ad-feed-date">${fmtDateShort(message.created_at)}</span>
        </div>
        ${message.subject ? `<span class="tag tag-line" style="display:inline-flex;margin-top:10px">${escapeHtml(message.subject)}</span>` : ''}
        <p class="ad-feed-text">${escapeHtml(message.message)}</p>
        <div class="ad-feed-foot">
          <div class="ad-feed-meta">
            ${icon('clock')} ${fmtDate(message.created_at)} · ${unread ? 'не прочитано' : 'прочитано'}
          </div>
          <div class="ad-feed-acts">
            <button class="ad-icon-btn" type="button" data-admin-action="toggle-message" data-id="${message.id}"
                    title="${unread ? 'Отметить прочитанным' : 'Вернуть в непрочитанные'}">
              ${icon(unread ? 'check-check' : 'mail')}
            </button>
            <a class="ad-icon-btn" href="mailto:${escapeHtml(message.email)}" title="Ответить письмом">${icon('reply')}</a>
            <button class="ad-icon-btn is-danger" type="button" data-admin-action="delete-message" data-id="${message.id}" title="Удалить сообщение">${icon('trash-2')}</button>
          </div>
        </div>
      </article>`;
  }

  function unreadMessagesCount() {
    return state.messages.filter(message => !Number(message.is_read)).length;
  }

  function updateNotificationBadges(unread = unreadMessagesCount()) {
    const nav = $('#nav-msg');
    if (nav) {
      nav.textContent = formatNumber(unread);
      nav.classList.toggle('is-zero', unread === 0);
    }
    const op = $('.ops-item[href="#messages"] .ops-item-value');
    if (op) {
      op.textContent = formatNumber(unread);
      op.classList.toggle('is-alert', unread > 0);
    }
  }

  function updateMessageCount() {
    const unread = unreadMessagesCount();
    updateNotificationBadges(unread);
    const el = $('#count-msg');
    if (!el) return;
    el.hidden = unread === 0;
    el.textContent = `${formatNumber(unread)} новых · ${formatNumber(state.messages.length)} всего`;
  }

  async function markAllMessagesRead() {
    const unread = state.messages.filter(message => !Number(message.is_read));
    if (!unread.length) return;
    const results = await Promise.all(unread.map(async message => {
      try {
        await adminApi(`/api/admin/messages/${message.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ is_read: 1 })
        });
        return true;
      } catch {
        return false;
      }
    }));
    unread.forEach((message, index) => {
      if (results[index]) message.is_read = 1;
    });
  }

  function renderMessagesList() {
    const box = $('#msg-box');
    if (!box) return;
    updateMessageCount();
    box.innerHTML = state.messages.length
      ? `<div class="ad-feed">${state.messages.map(messageCard).join('')}</div>`
      : emptyHtml('Сообщений нет', 'Обращения из формы на странице контактов появятся здесь.', 'mail');
    refreshIcons();
  }

  async function renderMessagesSection() {
    const content = $('#ad-content');
    const token = nextRender();
    content.innerHTML = loadingHtml('Загрузка сообщений…');
    try {
      state.messages = await adminApi('/api/admin/messages');
      if (token !== activeRender) return;
      await markAllMessagesRead();
      if (token !== activeRender) return;
      content.innerHTML = `
        <div class="ad-head">
          <div>
            <h2>Обращения</h2>
            <p>Сообщения из формы обратной связи. Отмечайте прочитанные и отвечайте покупателям письмом.</p>
          </div>
          <div class="ad-head-acts">
            <span class="ad-head-count" id="count-msg">–</span>
          </div>
        </div>
        <div id="msg-box"></div>`;
      renderMessagesList();
      refreshIcons();
      refreshBadges();
    } catch (error) {
      if (token !== activeRender) return;
      content.innerHTML = errorHtml(error.message);
      refreshIcons();
    }
  }

  async function toggleMessage(id) {
    const message = state.messages.find(item => item.id === id);
    if (!message) return;
    try {
      const data = await adminApi(`/api/admin/messages/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ is_read: message.is_read ? 0 : 1 })
      });
      message.is_read = data.is_read;
      renderMessagesList();
      refreshBadges();
    } catch (error) {
      toast(error.message, 'error');
    }
  }

  async function deleteMessage(id) {
    if (!confirm('Удалить это сообщение?')) return;
    try {
      await adminApi(`/api/admin/messages/${id}`, { method: 'DELETE' });
      state.messages = state.messages.filter(item => item.id !== id);
      toast('Сообщение удалено', 'success');
      renderMessagesList();
      refreshBadges();
    } catch (error) {
      toast(error.message, 'error');
    }
  }

  function userRow(user) {
    const initial = String(user.username || '?').slice(0, 1).toUpperCase();
    const isSelf = state.me && user.id === state.me.id;
    return `
      <tr>
        <td>
          <div class="ad-prod">
            <span class="ad-feed-avatar">${escapeHtml(initial)}</span>
            <div>
              <b>${escapeHtml(user.username)}${isSelf ? ' · вы' : ''}</b>
              <span>ID ${user.id} · ${fmtDateShort(user.created_at)}</span>
            </div>
          </div>
        </td>
        <td><a href="mailto:${escapeHtml(user.email)}">${escapeHtml(user.email)}</a></td>
        <td>
          ${isSelf
            ? '<span class="ad-status ad-status-done">Администратор</span>'
            : `<select class="ad-role-select" data-admin-change="user-role" data-id="${user.id}" data-prev="${escapeHtml(user.role)}" aria-label="Роль пользователя ${escapeHtml(user.username)}">
              <option value="customer" ${user.role === 'customer' ? 'selected' : ''}>Покупатель</option>
              <option value="admin" ${user.role === 'admin' ? 'selected' : ''}>Администратор</option>
            </select>`}
        </td>
        <td class="is-num">${formatNumber(user.order_count)}</td>
        <td class="is-num">${fmtPrice(user.total_spent)}</td>
        <td class="is-num">
          <button class="ad-icon-btn is-danger" type="button" data-admin-action="delete-user" data-id="${user.id}"
                  title="${user.role === 'admin' ? 'Администратора удалить нельзя' : 'Удалить пользователя'}"
                  ${user.role === 'admin' ? 'disabled style="opacity:.3;cursor:not-allowed"' : ''}>
            ${icon('trash-2')}
          </button>
        </td>
      </tr>`;
  }

  function updateUserCount() {
    const el = $('#count-users');
    if (!el) return;
    const customers = state.users.filter(user => user.role === 'customer').length;
    const admins = state.users.length - customers;
    el.textContent = `${formatNumber(state.users.length)} ${plural(state.users.length, 'аккаунт', 'аккаунта', 'аккаунтов')} · ${customers} ${plural(customers, 'покупатель', 'покупателя', 'покупателей')} · ${admins} админ.`;
  }

  function renderUsersList() {
    const box = $('#users-box');
    if (!box) return;
    updateUserCount();
    box.innerHTML = state.users.length ? `
      <div class="panel panel-flush">
        <div class="ad-table-wrap">
          <table class="ad-table">
            <thead>
              <tr>
                <th>Пользователь</th>
                <th>Email</th>
                <th>Роль</th>
                <th class="is-num">Заказы</th>
                <th class="is-num">Сумма</th>
                <th></th>
              </tr>
            </thead>
            <tbody>${state.users.map(userRow).join('')}</tbody>
          </table>
        </div>
      </div>` : emptyHtml('Пользователей нет', 'Зарегистрированные покупатели появятся в этом списке.', 'users');
    refreshIcons();
  }

  async function renderUsersSection() {
    const content = $('#ad-content');
    const token = nextRender();
    content.innerHTML = loadingHtml('Загрузка пользователей…');
    try {
      state.users = await adminApi('/api/admin/users');
      if (token !== activeRender) return;
      content.innerHTML = `
        <div class="ad-head">
          <div>
            <h2>Пользователи</h2>
            <p>Роли и активность аккаунтов. Свою роль изменить нельзя. Администраторов нельзя удалить – сначала понизьте роль.</p>
          </div>
          <div class="ad-head-acts">
            <span class="ad-head-count" id="count-users">–</span>
          </div>
        </div>
        <div id="users-box"></div>`;
      renderUsersList();
      refreshIcons();
    } catch (error) {
      if (token !== activeRender) return;
      content.innerHTML = errorHtml(error.message);
      refreshIcons();
    }
  }

  async function updateUserRole(select) {
    const id = Number(select.dataset.id);
    const role = select.value;
    select.disabled = true;
    try {
      await adminApi(`/api/admin/users/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ role })
      });
      const user = state.users.find(item => item.id === id);
      if (user) user.role = role;
      select.dataset.prev = role;
      toast('Роль обновлена', 'success');
      renderUsersList();
    } catch (error) {
      select.value = select.dataset.prev || 'customer';
      toast(error.message, 'error');
      select.disabled = false;
    }
  }

  async function deleteUser(id) {
    const user = state.users.find(item => item.id === id);
    if (!user) return;
    if (!confirm(`Удалить пользователя «${user.username}»? Его заказы останутся в истории магазина.`)) return;
    try {
      await adminApi(`/api/admin/users/${id}`, { method: 'DELETE' });
      state.users = state.users.filter(item => item.id !== id);
      toast('Пользователь удалён', 'success');
      renderUsersList();
    } catch (error) {
      toast(error.message, 'error');
    }
  }

  function handleAction(action, id, element) {
    switch (action) {
      case 'modal-close': closeModal(); break;
      case 'reload-dashboard': renderDashboard(); break;
      case 'reload-products': loadProducts(); break;
      case 'reload-orders': renderOrdersSection(); break;
      case 'add-product': openProductModal(null); break;
      case 'edit-product': {
        const product = state.products.find(item => item.id === id);
        if (product) openProductModal(product);
        break;
      }
      case 'delete-product': deleteProduct(id); break;
      case 'add-spec':
        $('#spec-editor')?.insertAdjacentHTML('beforeend', specRow());
        refreshIcons();
        break;
      case 'remove-spec': element.closest('.spec-row')?.remove(); break;
      case 'add-category': openCategoryModal(null); break;
      case 'edit-category': {
        const category = state.categories.find(item => item.id === id);
        if (category) openCategoryModal(category);
        break;
      }
      case 'delete-category': deleteCategory(id); break;
      case 'view-order': openOrderModal(id); break;
      case 'delete-order': deleteOrder(id); break;
      case 'save-order': saveOrder(id); break;
      case 'delete-review': deleteReview(id); break;
      case 'toggle-message': toggleMessage(id); break;
      case 'delete-message': deleteMessage(id); break;
      case 'delete-user': deleteUser(id); break;
      default: break;
    }
  }

  async function handleLogin(event) {
    event.preventDefault();
    const alertBox = $('#ad-login-msg');
    alertBox.innerHTML = '';
    const button = event.target.querySelector('button[type="submit"]');
    const original = button.innerHTML;
    button.disabled = true;
    button.textContent = 'Проверяем…';
    try {
      const data = await api('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          login: $('#ad-login').value.trim(),
          password: $('#ad-parol').value
        })
      });
      if (data.role !== 'admin') {
        showAlert(alertBox, 'У этой учётной записи нет доступа к панели.');
        return;
      }
      Auth.setSession(data);
      state.me = await adminApi('/api/auth/me');
      $('#ad-parol').value = '';
      showApp();
      toast(`Добро пожаловать, ${data.username}`, 'success');
    } catch (error) {
      showAlert(alertBox, error.message);
    } finally {
      button.disabled = false;
      button.innerHTML = original;
      refreshIcons();
    }
  }

  function bindEvents() {
    $('#ad-login-form')?.addEventListener('submit', handleLogin);
    $('#ad-logout')?.addEventListener('click', logout);
    $('#ad-burger')?.addEventListener('click', () => setSide(true));
    $('#ad-side-x')?.addEventListener('click', () => setSide(false));
    $('#ad-side-fon')?.addEventListener('click', () => setSide(false));

    document.addEventListener('click', event => {
      const actionEl = event.target.closest('[data-admin-action]');
      if (actionEl) {
        handleAction(actionEl.dataset.adminAction, Number(actionEl.dataset.id) || 0, actionEl);
        return;
      }

      const tab = event.target.closest('[data-order-tab]');
      if (tab) {
        state.filters.orderStatus = tab.dataset.orderTab;
        renderOrderTabs();
        renderOrdersTable();
      }

      if (event.target.closest('.ad-nav-link')) setSide(false);
    });

    document.addEventListener('change', event => {
      const target = event.target;
      if (target.matches('[data-admin-change="stock"]')) updateStock(target);
      else if (target.matches('[data-admin-change="product-category"]')) {
        state.filters.productCategory = target.value;
        loadProducts();
      } else if (target.matches('[data-admin-change="order-status"]')) updateOrderStatus(target);
      else if (target.matches('[data-admin-change="user-role"]')) updateUserRole(target);
    });

    document.addEventListener('input', event => {
      const target = event.target;
      if (target.matches('[data-admin-input="product-search"]')) {
        state.filters.productQ = target.value;
        clearTimeout(productTimer);
        productTimer = setTimeout(loadProducts, 260);
      } else if (target.matches('[data-admin-input="order-search"]')) {
        state.filters.orderQ = target.value;
        clearTimeout(orderTimer);
        orderTimer = setTimeout(renderOrdersTable, 150);
      }
    });

    document.addEventListener('submit', event => {
      const form = event.target.closest('[data-admin-form]');
      if (!form) return;
      event.preventDefault();
      if (form.dataset.adminForm === 'product') saveProduct(form);
      else if (form.dataset.adminForm === 'category') saveCategory(form);
    });

    document.addEventListener('keydown', event => {
      if (event.key !== 'Escape') return;
      if ($('#ad-modal')) closeModal();
      else setSide(false);
    });

    window.addEventListener('hashchange', () => {
      if (state.me) route();
    });
  }

  bindEvents();
  boot();
})();
