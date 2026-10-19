// Run with: node --test
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { calculate, tokenize, toRPN, CalcError } = require('../js/parser.js');

/** Asserts that every [expression, expected] pair evaluates as expected. */
function expectResults(cases) {
  for (const [expression, expected] of cases) {
    assert.equal(calculate(expression), expected, `${expression} should be ${expected}`);
  }
}

/** Asserts that every expression fails with the given CalcError code. */
function expectError(code, expressions) {
  for (const expression of expressions) {
    assert.throws(
      () => calculate(expression),
      (err) => err instanceof CalcError && err.code === code,
      `"${expression}" should fail with ${code}`,
    );
  }
}

const rpn = (expression) =>
  toRPN(tokenize(expression))
    .map((t) => (t.type === 'number' ? t.raw : t.type === 'unary' ? 'neg' : t.value))
    .join(' ');

test('tokenizer tells unary signs from binary operators', () => {
  assert.deepEqual(tokenize('-2').map((t) => t.type), ['unary', 'number']);
  assert.deepEqual(
    tokenize('2-(-3)').map((t) => t.type),
    ['number', 'op', 'lparen', 'unary', 'number', 'rparen'],
  );
  assert.deepEqual(
    tokenize('5%-1').map((t) => t.type),
    ['number', 'percent', 'op', 'number'],
  );
  assert.deepEqual(tokenize(' 12.5 × 3 ').map((t) => t.raw), ['12.5', '×', '3']);
});

test('shunting-yard produces the right RPN', () => {
  assert.equal(rpn('2+3*4'), '2 3 4 * +');
  assert.equal(rpn('2*3+4'), '2 3 * 4 +');
  assert.equal(rpn('(2+3)*4'), '2 3 + 4 *');
  assert.equal(rpn('10-4-3'), '10 4 - 3 -');
  assert.equal(rpn('-2*3'), '2 neg 3 *');
  assert.equal(rpn('2*-3+1'), '2 3 neg * 1 +');
  assert.equal(rpn('50+10%'), '50 10 % +');
  assert.equal(rpn('2(3+4)'), '2 3 4 + *');
});

test('operator precedence and associativity', () => {
  expectResults([
    ['2+3*4', '14'],
    ['2*3+4', '10'],
    ['2+3*4-6/2', '11'],
    ['10-4-3', '3'],
    ['100/10/5', '2'],
    ['2*3*4', '24'],
    ['1+2+3+4', '10'],
    ['8/2*4', '16'],
    ['8-2+1', '7'],
  ]);
});

test('parentheses override precedence', () => {
  expectResults([
    ['(2+3)*4', '20'],
    ['2*(3+4)*5', '70'],
    ['((1+2)*(3+4))', '21'],
    ['(((7)))', '7'],
    ['10/(4-2)', '5'],
    ['(1+2)*(3+4)/(5-2)', '7'],
  ]);
});

test('unary minus and plus', () => {
  expectResults([
    ['-5+3', '-2'],
    ['2*-3', '-6'],
    ['-(2+3)', '-5'],
    ['--5', '5'],
    ['2--3', '5'],
    ['-2*-2', '4'],
    ['+5', '5'],
    ['-0', '0'],
    ['6/-3', '-2'],
  ]);
});

test('floating point results are exact', () => {
  expectResults([
    ['0.1+0.2', '0.3'],
    ['0.3-0.1', '0.2'],
    ['1.1*1.1', '1.21'],
    ['0.1*3', '0.3'],
    ['0.1*3-0.3', '0'],
    ['0.3/0.1', '3'],
    ['1.005*1000', '1005'],
    ['.5+.5', '1'],
    ['5.', '5'],
    ['1/3', '0.333333333333333'],
    ['2/3', '0.666666666666667'],
    ['1/3*3', '1'],
    ['0.1+0.7', '0.8'],
  ]);
});

test('percent', () => {
  expectResults([
    ['50%', '0.5'],
    ['50+10%', '55'],
    ['200-25%', '150'],
    ['50*10%', '5'],
    ['50/10%', '500'],
    ['(50+50)%', '1'],
    ['-10%', '-0.1'],
    ['50+-10%', '45'],
    ['2+3*4%', '2.12'],
    ['12.5%', '0.125'],
  ]);
});

test('implicit multiplication', () => {
  expectResults([
    ['2(3+4)', '14'],
    ['(1+2)(3+4)', '21'],
    ['(2)3', '6'],
    ['50%(2)', '1'],
  ]);
});

test('display symbols, whitespace and scientific literals', () => {
  expectResults([
    ['6×7', '42'],
    ['8÷2', '4'],
    ['5−3', '2'],
    [' 2 +  3 ', '5'],
    ['1e+21*10', '1e+22'],
    ['1e-7*1', '1e-7'],
    ['1.5e3', '1500'],
    ['0.000001', '0.000001'],
  ]);
});

test('large numbers and rounding to 15 significant digits', () => {
  expectResults([
    ['123456789012345', '123456789012345'],
    ['999999999999999+1', '1e+15'],
    ['99999999*99999999', '9.9999998e+15'],
    ['1e99', '1e+99'],
    ['0.1+1e-20', '0.1'],
  ]);
});

test('division by zero', () => {
  expectError('DIV_ZERO', ['5/0', '0/0', '5/(2-2)', '1/0%', '7/(0.1-0.1)']);
});

test('invalid syntax', () => {
  expectError('SYNTAX', ['*2', '2**3', '()', '(2+)', '1.2.3', '.', '2 3', 'abc', '2^3', '2x3', '2(+)', '%5', '2e']);
});

test('incomplete expressions', () => {
  expectError('INCOMPLETE', ['', '   ', '2+', '-', '(2+', '3*(']);
});

test('mismatched parentheses', () => {
  expectError('PARENS', ['(2+3', '2+3)', '((1)', ')(', '1)+(2', ')', '2+)']);
});

test('overflow', () => {
  expectError('OVERFLOW', ['1e100', '1e99*10', '1e2000', '9.999999999999999e99']);
});
