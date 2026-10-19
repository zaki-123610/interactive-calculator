/**
 * app.js: the DOM layer.
 *
 * Renders the Calculator state into the display and turns button clicks into
 * calculator actions. There is no maths here: parsing and evaluation live in
 * parser.js, input rules in calculator.js.
 */
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

  /* ---------- Formatting ---------- */

  /** Thousands separators and a true minus sign: "-1234.5" → "−1,234.5". */
  function formatNumber(number) {
    return number.replace(/^(-?)(\d+)/, (match, sign, int) => (sign && '−') + int.replace(/\B(?=(\d{3})+$)/g, ','));
  }

  /** Pretty-prints an ASCII expression: "2*-3+4" → "2 × −3 + 4". */
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

  /** Font scale for the main line, so long numbers stay readable. */
  function fitScale(text) {
    if (text.length <= 10) return 1;
    if (text.length <= 13) return 0.8;
    if (text.length <= 17) return 0.64;
    return 0.52;
  }

  /* ---------- Rendering ---------- */

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
        // Show, greyed out, the parentheses that "=" will close.
        const ghost = document.createElement('span');
        ghost.className = 'ghost';
        ghost.setAttribute('aria-hidden', 'true');
        ghost.textContent = ')'.repeat(state.openParens);
        expressionLine.append(ghost);
      }
      resultLine.textContent = state.mode === 'error' ? state.error : formatNumber(state.preview);
    }

    display.style.setProperty('--fit', fitScale(mainText));
    expressionLine.scrollLeft = expressionLine.scrollWidth; // keep the latest input in view
    return state;
  }

  /** Reads a message out through the polite live region. */
  function announce(message) {
    announcer.textContent = '';
    // Setting the text in a later task makes screen readers repeat identical messages.
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

  /* ---------- Pointer input ---------- */

  keypad.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-action]');
    if (button) run(button.dataset.action, button.dataset.value);
  });

  render();
})();
