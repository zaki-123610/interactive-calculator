/**
 * calculator.js: the input state machine behind the keypad.
 *
 * It decides what each key does to the expression being typed (one decimal
 * point per number, no doubled operators, "×" inserted before "(", ...) and
 * delegates the maths to CalcParser. No DOM access: app.js renders it.
 *
 * The expression is kept in ASCII form, e.g. "2*(3+4)"; app.js prettifies it.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./parser.js'));
  else root.Calculator = factory(root.CalcParser);
})(globalThis, function (Parser) {
  'use strict';

  /** Most digits a single number may have. */
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

    /** Runs a keypad action, e.g. dispatch('digit', '7') or dispatch('operator', '*'). */
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
      this.history = ''; // the expression behind the result on screen
      this.error = '';
      this.evaluated = false; // true while a result is on screen
    }

    inputDigit(digit) {
      this.#beginTyping();
      let expr = this.expression;
      if (/[)%]$/.test(expr)) expr += '*'; // "(2+3)" then "4" → "(2+3)×4"
      const number = trailingNumber(expr);
      if (number.includes('e') || number.replace('.', '').length >= MAX_DIGITS) return;
      if (number === '0') expr = expr.slice(0, -1); // no leading zeros: "0" then "5" → "5"
      this.expression = expr + digit;
    }

    inputDecimal() {
      this.#beginTyping();
      let expr = this.expression;
      if (/[)%]$/.test(expr)) expr += '*';
      const number = trailingNumber(expr);
      if (/[.e]/.test(number)) return; // one decimal point per number
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
        this.expression = expr + op; // unary minus: "2×-3", "(-2"
      } else {
        // Replace the trailing operator(s): "2+" then "×" → "2×".
        const base = expr.replace(/[+\-*/]+$/, '');
        if (base !== '' && !base.endsWith('(')) this.expression = base + op;
      }
    }

    openParen() {
      this.#beginTyping();
      let expr = withoutTrailingDot(this.expression);
      if (endsWithOperand(expr)) expr += '*'; // "2(" → "2×("
      this.expression = expr + '(';
    }

    closeParen() {
      if (this.evaluated) return;
      this.error = '';
      const expr = withoutTrailingDot(this.expression);
      // Only close an open "(" right after an operand: no "()" or "(2+)".
      if (openParenCount(expr) > 0 && endsWithOperand(expr)) this.expression = expr + ')';
    }

    percent() {
      this.#resumeTyping();
      const expr = withoutTrailingDot(this.expression);
      if (/[\d)]$/.test(expr)) this.expression = expr + '%';
    }

    /** Toggles the sign of the last operand: 5 → -5, 2+3 → 2+-3, (1+2) → -(1+2). */
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
      // Never leave a dangling exponent such as "1e+" behind.
      this.expression = this.expression.slice(0, -1).replace(/e[+-]?$/, '');
    }

    evaluate() {
      if (this.evaluated || this.expression === '') return;
      // Close any parentheses left open, like most calculators do.
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

    /**
     * Snapshot for rendering. `mode` is 'editing', 'result' or 'error';
     * `preview` is the live result while typing (empty when not computable).
     */
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

    /** Digits, "." and "(" typed after a result start a new expression. */
    #beginTyping() {
      if (this.evaluated) this.clear();
      this.error = '';
    }

    /** Operators, "%", "±" and backspace after a result keep working on it. */
    #resumeTyping() {
      this.evaluated = false;
      this.history = '';
      this.error = '';
    }
  }

  return Calculator;
});
