(function () {
  'use strict';

  const { Calculator, CalcParser } = globalThis;

  const calculator = new Calculator();

  const display = document.querySelector('.display');
  const expressionLine = document.getElementById('expression');
  const resultLine = document.getElementById('result');
  const announcer = document.getElementById('announcer');
  const keypad = document.querySelector('.keypad');

  const OPERATOR_SYMBOLS = { '+': '+', '-': '−', '*': '×', '/': '÷' };

  function formatNumber(number) {
    return number.replace(/^(-?)(\d+)/, (match, sign, int) => (sign && '−') + int.replace(/\B(?=(\d{3})+$)/g, ','));
  }

  function formatExpression(expression) {
    let tokens;
    try {
      tokens = CalcParser.tokenize(expression);
    } catch {
      return expression;
    }
    return tokens
      .map((token) => {
        if (token.type === 'number') return formatNumber(token.raw);
        if (token.type === 'op') return ` ${OPERATOR_SYMBOLS[token.value]} `;
        if (token.type === 'unary') return OPERATOR_SYMBOLS[token.value];
        return token.raw;
      })
      .join('');
  }

  function fitScale(text) {
    if (text.length <= 10) return 1;
    if (text.length <= 13) return 0.8;
    if (text.length <= 17) return 0.64;
    return 0.52;
  }

  function render() {
    const state = calculator.getState();
    let mainText;
    display.dataset.mode = state.mode;

    if (state.mode === 'result') {
      expressionLine.textContent = `${formatExpression(state.history)} =`;
      mainText = formatNumber(state.expression);
      resultLine.textContent = mainText;
    } else {
      mainText = state.expression ? formatExpression(state.expression) : '0';
      expressionLine.textContent = mainText;
      if (state.openParens > 0) {
        const ghost = document.createElement('span');
        ghost.className = 'ghost';
        ghost.setAttribute('aria-hidden', 'true');
        ghost.textContent = ')'.repeat(state.openParens);
        expressionLine.append(ghost);
      }
      resultLine.textContent = state.mode === 'error' ? state.error : formatNumber(state.preview);
    }

    display.style.setProperty('--fit', fitScale(mainText));
    expressionLine.scrollLeft = expressionLine.scrollWidth;
    return state;
  }

  function announce(message) {
    announcer.textContent = '';
    setTimeout(() => {
      announcer.textContent = message;
    }, 50);
  }

  function run(action, value) {
    calculator.dispatch(action, value);
    const state = render();
    if (action === 'evaluate' && state.mode === 'result') {
      announce(`${formatExpression(state.history)} equals ${formatNumber(state.expression)}`);
    } else if (action === 'evaluate' && state.mode === 'error') {
      announce(`Error: ${state.error}`);
    } else if (action === 'clear') {
      announce('Cleared');
    }
  }

  keypad.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-action]');
    if (!button) return;
    run(button.dataset.action, button.dataset.value);
    if (event.detail > 0) button.blur();
  });

  const KEY_BINDINGS = new Map([
    ['+', ['operator', '+']],
    ['-', ['operator', '-']],
    ['*', ['operator', '*']],
    ['x', ['operator', '*']],
    ['X', ['operator', '*']],
    ['/', ['operator', '/']],
    ['.', ['decimal']],
    [',', ['decimal']],
    ['(', ['paren', '(']],
    [')', ['paren', ')']],
    ['%', ['percent']],
    ['Enter', ['evaluate']],
    ['=', ['evaluate']],
    ['Backspace', ['backspace']],
    ['Escape', ['clear']],
    ['Delete', ['clear']],
    ['F9', ['negate']],
  ]);

  function bindingFor(key) {
    return /^\d$/.test(key) ? ['digit', key] : KEY_BINDINGS.get(key);
  }

  function buttonFor(action, value) {
    const valueSelector = value === undefined ? '' : `[data-value="${value}"]`;
    return keypad.querySelector(`[data-action="${action}"]${valueSelector}`);
  }

  const highlightTimers = new WeakMap();

  function highlight(button) {
    if (!button) return;
    button.classList.add('is-pressed');
    clearTimeout(highlightTimers.get(button));
    highlightTimers.set(button, setTimeout(() => button.classList.remove('is-pressed'), 150));
  }

  document.addEventListener('keydown', (event) => {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.key === 'Enter' && event.target instanceof Element && event.target.closest('.keypad button')) return;

    const binding = bindingFor(event.key);
    if (!binding) return;
    event.preventDefault();
    const [action, value] = binding;
    run(action, value);
    highlight(buttonFor(action, value));
  });

  render();
})();
