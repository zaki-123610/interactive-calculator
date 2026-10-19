(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./parser.js'));
  else root.Calculator = factory(root.CalcParser);
})(globalThis, function (Parser) {
  'use strict';

  const MAX_DIGITS = 15;

  const TRAILING_NUMBER = /(?:\d+\.?\d*|\.\d*)(?:e[+-]?\d+)?$/;
  const PLAIN_NUMBER = /^-?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/;

  const endsWithOperand = (expr) => /[\d.)%]$/.test(expr);
  const trailingNumber = (expr) => (TRAILING_NUMBER.exec(expr) || [''])[0];
  const withoutTrailingDot = (expr) => expr.replace(/\.$/, '');
  const isUnaryMinusAt = (expr, i) => expr[i] === '-' && (i === 0 || '+-*/('.includes(expr[i - 1]));

  function openParenCount(expr) {
    let depth = 0;
    for (const ch of expr) {
      if (ch === '(') depth += 1;
      else if (ch === ')') depth -= 1;
    }
    return Math.max(0, depth);
  }

  function matchingOpenParen(expr, closeIndex) {
    let depth = 0;
    for (let i = closeIndex; i >= 0; i--) {
      if (expr[i] === ')') depth += 1;
      else if (expr[i] === '(' && --depth === 0) return i;
    }
    return 0;
  }

  class Calculator {
    constructor() {
      this.clear();
    }

    dispatch(action, value) {
      switch (action) {
        case 'digit': return this.inputDigit(value);
        case 'decimal': return this.inputDecimal();
        case 'operator': return this.inputOperator(value);
        case 'paren': return value === '(' ? this.openParen() : this.closeParen();
        case 'percent': return this.percent();
        case 'negate': return this.negate();
        case 'backspace': return this.backspace();
        case 'clear': return this.clear();
        case 'evaluate': return this.evaluate();
        default: throw new Error(`Unknown action "${action}"`);
      }
    }

    clear() {
      this.expression = '';
      this.history = '';
      this.error = '';
      this.evaluated = false;
    }

    inputDigit(digit) {
      this.#beginTyping();
      let expr = this.expression;
      if (/[)%]$/.test(expr)) expr += '*';
      const number = trailingNumber(expr);
      if (number.includes('e') || number.replace('.', '').length >= MAX_DIGITS) return;
      if (number === '0') expr = expr.slice(0, -1);
      this.expression = expr + digit;
    }

    inputDecimal() {
      this.#beginTyping();
      let expr = this.expression;
      if (/[)%]$/.test(expr)) expr += '*';
      const number = trailingNumber(expr);
      if (/[.e]/.test(number)) return;
      this.expression = expr + (number === '' ? '0.' : '.');
    }

    inputOperator(op) {
      this.#resumeTyping();
      const expr = withoutTrailingDot(this.expression);
      if (expr === '') {
        this.expression = op === '-' ? '-' : `0${op}`;
      } else if (endsWithOperand(expr)) {
        this.expression = expr + op;
      } else if (op === '-' && '(*/'.includes(expr.slice(-1))) {
        this.expression = expr + op;
      } else {
        const base = expr.replace(/[+\-*/]+$/, '');
        if (base !== '' && !base.endsWith('(')) this.expression = base + op;
      }
    }

    openParen() {
      this.#beginTyping();
      let expr = withoutTrailingDot(this.expression);
      if (endsWithOperand(expr)) expr += '*';
      this.expression = expr + '(';
    }

    closeParen() {
      if (this.evaluated) return;
      this.error = '';
      const expr = withoutTrailingDot(this.expression);
      if (openParenCount(expr) > 0 && endsWithOperand(expr)) this.expression = expr + ')';
    }

    percent() {
      this.#resumeTyping();
      const expr = withoutTrailingDot(this.expression);
      if (/[\d)]$/.test(expr)) this.expression = expr + '%';
    }

    negate() {
      this.#resumeTyping();
      const expr = this.expression;
      let end = expr.length;
      while (expr[end - 1] === '%') end -= 1;
      const start = expr[end - 1] === ')'
        ? matchingOpenParen(expr, end - 1)
        : end - trailingNumber(expr.slice(0, end)).length;
      this.expression = isUnaryMinusAt(expr, start - 1)
        ? expr.slice(0, start - 1) + expr.slice(start)
        : `${expr.slice(0, start)}-${expr.slice(start)}`;
    }

    backspace() {
      this.#resumeTyping();
      this.expression = this.expression.slice(0, -1).replace(/e[+-]?$/, '');
    }

    evaluate() {
      if (this.evaluated || this.expression === '') return;
      const expression = this.expression + ')'.repeat(openParenCount(this.expression));
      try {
        const result = Parser.calculate(expression);
        this.history = expression;
        this.expression = result;
        this.evaluated = true;
        this.error = '';
      } catch (err) {
        if (!(err instanceof Parser.CalcError)) throw err;
        this.error = err.message;
      }
    }

    getState() {
      const openParens = openParenCount(this.expression);
      let mode = 'editing';
      let preview = '';
      if (this.evaluated) {
        mode = 'result';
      } else if (this.error) {
        mode = 'error';
      } else if (this.expression !== '' && !PLAIN_NUMBER.test(this.expression)) {
        try {
          preview = Parser.calculate(this.expression + ')'.repeat(openParens));
        } catch (err) {
          if (!(err instanceof Parser.CalcError)) throw err;
        }
      }
      return { mode, expression: this.expression, history: this.history, preview, error: this.error, openParens };
    }

    #beginTyping() {
      if (this.evaluated) this.clear();
      this.error = '';
    }

    #resumeTyping() {
      this.evaluated = false;
      this.history = '';
      this.error = '';
    }
  }

  return Calculator;
});
