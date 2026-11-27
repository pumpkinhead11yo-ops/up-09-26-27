const formFields = [
  {
    selector: '#imya',
    type: 'name',
    message: 'Укажите имя – минимум 2 символа'
  },
  {
    selector: '#email',
    type: 'email',
    message: 'Введите корректный email, например name@mail.ru'
  },
  {
    selector: '#telefon',
    type: 'phone',
    optional: true,
    message: 'Укажите телефон в формате +7 (3532) 20-12-34'
  },
  {
    selector: '#tekst',
    type: 'message',
    message: 'Опишите вопрос подробнее – минимум 10 символов'
  }
];

function isValidValue(field, value) {
  if (field.optional && !value) return true;
  if (field.type === 'name') return value.length >= 2;
  if (field.type === 'email') return /^[^\s@]+@[^\s@]+\.[a-zа-яё]{2,}$/i.test(value);
  if (field.type === 'phone') {
    return /^[+\d][\d\s()-]{8,}$/.test(value) && value.replace(/\D/g, '').length >= 10;
  }
  return value.length >= 10;
}

function showError(input, message) {
  const field = input.closest('.form-field');
  const error = document.querySelector('#' + input.id + '-error');
  if (!field || !error) return;
  field.classList.add('is-invalid');
  input.setAttribute('aria-invalid', 'true');
  error.textContent = message;
  error.classList.add('is-visible');
}

function clearError(input) {
  const field = input.closest('.form-field');
  const error = document.querySelector('#' + input.id + '-error');
  if (!field || !error) return;
  field.classList.remove('is-invalid');
  input.removeAttribute('aria-invalid');
  error.textContent = '';
  error.classList.remove('is-visible');
}

function validateForm() {
  let firstInvalid = null;
  formFields.forEach(field => {
    const input = document.querySelector(field.selector);
    if (!input) return;
    const value = input.value.trim();
    if (isValidValue(field, value)) {
      clearError(input);
    } else {
      showError(input, field.message);
      if (!firstInvalid) firstInvalid = input;
    }
  });
  return firstInvalid;
}

function openModal() {
  const modal = document.querySelector('#modal-ok');
  if (!modal) return;
  modal.hidden = false;
  document.body.classList.add('has-modal');
}

function closeModal() {
  const modal = document.querySelector('#modal-ok');
  if (!modal) return;
  modal.hidden = true;
  document.body.classList.remove('has-modal');
}

function setBurger(open) {
  const burger = document.querySelector('#burger-btn');
  const menu = document.querySelector('#mobile-menu');
  if (!burger || !menu) return;
  menu.classList.toggle('is-open', open);
  menu.setAttribute('aria-hidden', String(!open));
  burger.classList.toggle('is-open', open);
  burger.setAttribute('aria-expanded', String(open));
  document.body.classList.toggle('has-menu', open);
}

function initBurger() {
  const burger = document.querySelector('#burger-btn');
  const menu = document.querySelector('#mobile-menu');
  if (!burger || !menu) return;
  burger.addEventListener('click', () => setBurger(!menu.classList.contains('is-open')));
  menu.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', () => setBurger(false));
  });
}

function initContactForm() {
  const form = document.querySelector('#forma-svyaz');
  if (!form) return;

  form.addEventListener('submit', event => {
    event.preventDefault();
    const firstInvalid = validateForm();
    if (firstInvalid) {
      firstInvalid.focus();
      return;
    }
    form.reset();
    formFields.forEach(field => {
      const input = document.querySelector(field.selector);
      if (input) clearError(input);
    });
    openModal();
  });

  formFields.forEach(field => {
    const input = document.querySelector(field.selector);
    if (!input) return;
    input.addEventListener('input', () => {
      if (isValidValue(field, input.value.trim())) clearError(input);
    });
    input.addEventListener('blur', () => {
      const value = input.value.trim();
      if (value && !isValidValue(field, value)) showError(input, field.message);
    });
  });

  const modal = document.querySelector('#modal-ok');
  if (modal) {
    modal.querySelectorAll('[data-modal-close]').forEach(button => {
      button.addEventListener('click', closeModal);
    });
  }
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      closeModal();
      setBurger(false);
    }
  });
}

function initNavActive() {
  const nav = document.querySelector('.nav');
  if (!nav) return;
  const page = location.pathname.split('/').pop() || 'index.html';
  nav.querySelectorAll('.nav-link').forEach(link => {
    const href = link.getAttribute('href').split('/').pop() || 'index.html';
    link.classList.toggle('is-active', href === page);
  });
}

initBurger();
initContactForm();
initNavActive();
