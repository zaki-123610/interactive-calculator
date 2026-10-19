/**
 * parser.js: turns an expression string into a number, without eval().
 *
 *   "2+3×4"  ── tokenize ────▶  [2] [+] [3] [×] [4]
 *            ── toRPN ───────▶  2 3 4 × +     (shunting-yard, Dijkstra 1961)
 *            ── evaluateRPN ─▶  14            (stack machine, exact decimals)
 *
 * Pure logic with no DOM access, so it runs in the browser and in Node tests.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./decimal.js'));
  else root.CalcParser = factory(root.CalcDecimal);
})(globalThis, function (D) {
  'use strict';

  /** Significant digits shown in results. */
  const RESULT_PRECISION = 15;
  /** Like a handheld calculator, magnitudes of 1e100 and above overflow. */
  const MAX_EXPONENT = 99;

  const MESSAGES = {
    SYNTAX: 'Invalid expression',
    INCOMPLETE: 'Incomplete expression',
    PARENS: 'Mismatched parentheses',
    DIV_ZERO: 'Cannot divide by zero',
    OVERFLOW: 'Number too large',
  };

  /** Raised for any expression the calculator cannot evaluate. */
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

  /* ---------- 1. Tokenizer: string → tokens ---------- */

  // Display symbols are accepted alongside their ASCII equivalents.
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

  /**
   * Splits the input into tokens { type, value, raw, pos } where type is one
   * of: number, op (binary operator), unary, percent, lparen, rparen.
   * "-" and "+" are unary when they cannot follow an operand: at the start,
   * after another operator, or after "(".
   */
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
        // Rejects a lone "." and a second decimal point as in "1.2.3".
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

  /* ---------- 2. Shunting-yard: infix tokens → Reverse Polish Notation ---------- */

  // Higher binds tighter. Binary operators are left-associative; unary minus
  // binds tighter than any binary operator; "%" (postfix) tighter still.
  const PRECEDENCE = { '+': 1, '-': 1, '*': 2, '/': 2 };
  const UNARY_PRECEDENCE = 3;
  const precedenceOf = (token) => (token.type === 'unary' ? UNARY_PRECEDENCE : PRECEDENCE[token.value]);

  /**
   * Reorders tokens into RPN with Dijkstra's shunting-yard algorithm and
   * validates the grammar on the way: `expectOperand` says whether the next
   * token must start an operand (number, "(", unary sign) or follow one
   * (binary operator, ")", "%").
   */
  function toRPN(tokens) {
    const output = [];
    const stack = [];
    let expectOperand = true;
    let previous = null;

    const pushOperator = (token) => {
      // Pop everything that binds at least as tightly (left associativity).
      while (stack.length > 0) {
        const top = stack[stack.length - 1];
        if (top.type === 'lparen' || precedenceOf(top) < precedenceOf(token)) break;
        output.push(stack.pop());
      }
      stack.push(token);
    };

    for (const token of tokens) {
      // Implicit multiplication: 2(3), (1+2)(3+4), (2)3, 50%(2). Not "2 3".
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
          // A prefix operator has no left operand yet, so it never pops.
          // Unary plus changes nothing and is dropped.
          if (token.value === '-') stack.push(token);
          break;
        case 'lparen':
          stack.push(token);
          break;
        case 'rparen':
          if (!stack.some((t) => t.type === 'lparen')) fail('PARENS'); // ")" without "("
          if (expectOperand) fail('SYNTAX'); // "()" or "(2+)"
          while (stack[stack.length - 1].type !== 'lparen') output.push(stack.pop());
          stack.pop();
          break;
        case 'percent':
          if (expectOperand) fail('SYNTAX');
          // Postfix and tightest of all: its operand is already in the output.
          output.push(token);
          break;
        case 'op':
          if (expectOperand) fail('SYNTAX'); // "*2", "2**3"
          pushOperator(token);
          expectOperand = true;
          break;
      }
      previous = token;
    }

    if (expectOperand) fail('INCOMPLETE'); // empty input or trailing operator
    while (stack.length > 0) {
      const token = stack.pop();
      if (token.type === 'lparen') fail('PARENS'); // "(" never closed
      output.push(token);
    }
    return output;
  }

  /* ---------- 3. RPN evaluation ---------- */

  const HUNDREDTH = D.fromString('0.01');

  function checkRange(value) {
    if (D.exponentOf(value) > MAX_EXPONENT) fail('OVERFLOW');
    return value;
  }

  function applyOperator(op, a, b) {
    // After + or −, a percentage is a percentage of the left operand:
    // 50 + 10% = 50 + 5 = 55, as on phone and desktop calculators.
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

  /**
   * Runs an RPN program on a stack of { value, percent } entries. Numbers are
   * pushed; operators pop their operands and push the result.
   */
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

  /* ---------- Public API ---------- */

  /** Evaluates an expression to a Decimal rounded to RESULT_PRECISION digits. */
  function evaluate(input) {
    const value = evaluateRPN(toRPN(tokenize(input)));
    return checkRange(D.roundSignificant(value, RESULT_PRECISION));
  }

  /** Formats a result; very large or very small magnitudes use "1.5e+21". */
  function formatResult(value) {
    const exp = D.exponentOf(value);
    return exp >= RESULT_PRECISION || exp <= -7 ? D.toExponentialString(value) : D.toPlainString(value);
  }

  /** Evaluates an expression and returns the formatted result string. */
  function calculate(input) {
    return formatResult(evaluate(input));
  }

  return { CalcError, RESULT_PRECISION, tokenize, toRPN, evaluateRPN, evaluate, formatResult, calculate };
});
