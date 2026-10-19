(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./decimal.js'));
  else root.CalcParser = factory(root.CalcDecimal);
})(globalThis, function (D) {
  'use strict';

  const RESULT_PRECISION = 15;
  const MAX_EXPONENT = 99;

  const MESSAGES = {
    SYNTAX: 'Invalid expression',
    INCOMPLETE: 'Incomplete expression',
    PARENS: 'Mismatched parentheses',
    DIV_ZERO: 'Cannot divide by zero',
    OVERFLOW: 'Number too large',
  };

  class CalcError extends Error {
    constructor(code) {
      super(MESSAGES[code]);
      this.name = 'CalcError';
      this.code = code;
    }
  }

  function fail(code) {
    throw new CalcError(code);
  }

  const OPERATORS = { '+': '+', '-': '-', '−': '-', '*': '*', '×': '*', '/': '/', '÷': '/' };
  const NUMBER = /(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?/iy;

  function parseNumber(raw) {
    try {
      return D.fromString(raw);
    } catch (err) {
      if (err instanceof RangeError) fail('OVERFLOW');
      throw err;
    }
  }

  function tokenize(input) {
    const tokens = [];
    let i = 0;
    while (i < input.length) {
      const ch = input[i];
      if (/\s/.test(ch)) {
        i += 1;
        continue;
      }

      if (/[\d.]/.test(ch)) {
        NUMBER.lastIndex = i;
        const match = NUMBER.exec(input);
        if (!match || input[NUMBER.lastIndex] === '.') fail('SYNTAX');
        tokens.push({ type: 'number', value: parseNumber(match[0]), raw: match[0], pos: i });
        i = NUMBER.lastIndex;
        continue;
      }

      const prev = tokens[tokens.length - 1];
      const afterOperand = prev !== undefined && ['number', 'rparen', 'percent'].includes(prev.type);
      let type;
      let value = ch;
      if (Object.hasOwn(OPERATORS, ch)) {
        value = OPERATORS[ch];
        type = !afterOperand && (value === '+' || value === '-') ? 'unary' : 'op';
      } else if (ch === '(') {
        type = 'lparen';
      } else if (ch === ')') {
        type = 'rparen';
      } else if (ch === '%') {
        type = 'percent';
      } else {
        fail('SYNTAX');
      }
      tokens.push({ type, value, raw: ch, pos: i });
      i += 1;
    }
    return tokens;
  }

  const PRECEDENCE = { '+': 1, '-': 1, '*': 2, '/': 2 };
  const UNARY_PRECEDENCE = 3;
  const precedenceOf = (token) => (token.type === 'unary' ? UNARY_PRECEDENCE : PRECEDENCE[token.value]);

  function toRPN(tokens) {
    const output = [];
    const stack = [];
    let expectOperand = true;
    let previous = null;

    const pushOperator = (token) => {
      while (stack.length > 0) {
        const top = stack[stack.length - 1];
        if (top.type === 'lparen' || precedenceOf(top) < precedenceOf(token)) break;
        output.push(stack.pop());
      }
      stack.push(token);
    };

    for (const token of tokens) {
      if (!expectOperand && (token.type === 'lparen' || token.type === 'number')) {
        if (token.type === 'number' && previous.type === 'number') fail('SYNTAX');
        pushOperator({ type: 'op', value: '*', raw: '', pos: token.pos });
        expectOperand = true;
      }

      switch (token.type) {
        case 'number':
          output.push(token);
          expectOperand = false;
          break;
        case 'unary':
          if (token.value === '-') stack.push(token);
          break;
        case 'lparen':
          stack.push(token);
          break;
        case 'rparen':
          if (!stack.some((t) => t.type === 'lparen')) fail('PARENS');
          if (expectOperand) fail('SYNTAX');
          while (stack[stack.length - 1].type !== 'lparen') output.push(stack.pop());
          stack.pop();
          break;
        case 'percent':
          if (expectOperand) fail('SYNTAX');
          output.push(token);
          break;
        case 'op':
          if (expectOperand) fail('SYNTAX');
          pushOperator(token);
          expectOperand = true;
          break;
      }
      previous = token;
    }

    if (expectOperand) fail('INCOMPLETE');
    while (stack.length > 0) {
      const token = stack.pop();
      if (token.type === 'lparen') fail('PARENS');
      output.push(token);
    }
    return output;
  }

  const HUNDREDTH = D.fromString('0.01');

  function checkRange(value) {
    if (D.exponentOf(value) > MAX_EXPONENT) fail('OVERFLOW');
    return value;
  }

  function applyOperator(op, a, b) {
    const right = b.percent && (op === '+' || op === '-') ? D.mul(a.value, b.value) : b.value;
    switch (op) {
      case '+':
        return D.add(a.value, right);
      case '-':
        return D.sub(a.value, right);
      case '*':
        return D.mul(a.value, right);
      case '/':
        if (D.isZero(right)) fail('DIV_ZERO');
        return D.div(a.value, right);
      default:
        throw new Error(`Unknown operator "${op}"`);
    }
  }

  function evaluateRPN(rpn) {
    const stack = [];
    for (const token of rpn) {
      if (token.type === 'number') {
        stack.push({ value: checkRange(token.value), percent: false });
      } else if (token.type === 'unary') {
        const a = stack.pop();
        stack.push({ value: D.negate(a.value), percent: a.percent });
      } else if (token.type === 'percent') {
        const a = stack.pop();
        stack.push({ value: D.mul(a.value, HUNDREDTH), percent: true });
      } else {
        const b = stack.pop();
        const a = stack.pop();
        stack.push({ value: checkRange(applyOperator(token.value, a, b)), percent: false });
      }
    }
    if (stack.length !== 1) fail('SYNTAX');
    return stack[0].value;
  }

  function evaluate(input) {
    const value = evaluateRPN(toRPN(tokenize(input)));
    return checkRange(D.roundSignificant(value, RESULT_PRECISION));
  }

  function formatResult(value) {
    const exp = D.exponentOf(value);
    return exp >= RESULT_PRECISION || exp <= -7 ? D.toExponentialString(value) : D.toPlainString(value);
  }

  function calculate(input) {
    return formatResult(evaluate(input));
  }

  return { CalcError, RESULT_PRECISION, tokenize, toRPN, evaluateRPN, evaluate, formatResult, calculate };
});
