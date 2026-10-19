const { test } = require('node:test');
const assert = require('node:assert/strict');
const Calculator = require('../js/calculator.js');

const SPECIAL_KEYS = {
  '.': ['decimal'],
  '%': ['percent'],
  '(': ['paren', '('],
  ')': ['paren', ')'],
  '=': ['evaluate'],
  n: ['negate'],
  '<': ['backspace'],
  C: ['clear'],
};

function press(keys) {
  const calculator = new Calculator();
  for (const key of keys) {
    if (/\d/.test(key)) calculator.dispatch('digit', key);
    else if ('+-*/'.includes(key)) calculator.dispatch('operator', key);
    else calculator.dispatch(...SPECIAL_KEYS[key]);
  }
  return calculator.getState();
}

const expressionAfter = (keys) => press(keys).expression;

test('evaluates with operator precedence and keeps the history', () => {
  const state = press('2+3*4=');
  assert.equal(state.mode, 'result');
  assert.equal(state.expression, '14');
  assert.equal(state.history, '2+3*4');
  assert.equal(press('.1+.2=').expression, '0.3');
});

test('digits and decimal point', () => {
  assert.equal(expressionAfter('005'), '5');
  assert.equal(expressionAfter('0.05'), '0.05');
  assert.equal(expressionAfter('.5'), '0.5');
  assert.equal(expressionAfter('1.2.3'), '1.23');
  assert.equal(expressionAfter('2+.'), '2+0.');
  assert.equal(expressionAfter('1234567890123456789'), '123456789012345');
});

test('operators replace each other and allow a unary minus', () => {
  assert.equal(expressionAfter('2+*'), '2*');
  assert.equal(expressionAfter('2*-'), '2*-');
  assert.equal(expressionAfter('2*-+'), '2+');
  assert.equal(press('2*-3=').expression, '-6');
  assert.equal(expressionAfter('-'), '-');
  assert.equal(expressionAfter('*'), '0*');
  assert.equal(expressionAfter('(*'), '(');
  assert.equal(expressionAfter('(-'), '(-');
  assert.equal(expressionAfter('5.+'), '5+');
});

test('parentheses', () => {
  assert.equal(expressionAfter('2(3'), '2*(3');
  assert.equal(expressionAfter(')'), '');
  assert.equal(expressionAfter('2)'), '2');
  assert.equal(expressionAfter('(2+)'), '(2+');
  assert.equal(expressionAfter('()'), '(');
  assert.equal(expressionAfter('(2+3)4'), '(2+3)*4');
  assert.equal(press('(2+3').openParens, 1);

  const autoClosed = press('2*(3+4=');
  assert.equal(autoClosed.expression, '14');
  assert.equal(autoClosed.history, '2*(3+4)');
});

test('percent', () => {
  assert.equal(press('50+10%=').expression, '55');
  assert.equal(press('200-25%=').expression, '150');
  assert.equal(expressionAfter('%'), '');
  assert.equal(expressionAfter('5%%'), '5%');
  assert.equal(expressionAfter('5%3'), '5%*3');
});

test('negate toggles the sign of the last operand', () => {
  assert.equal(expressionAfter('5n'), '-5');
  assert.equal(expressionAfter('5nn'), '5');
  assert.equal(expressionAfter('2+3n'), '2+-3');
  assert.equal(expressionAfter('5-3n'), '5--3');
  assert.equal(press('5-3n=').expression, '8');
  assert.equal(expressionAfter('(2+3)n'), '-(2+3)');
  assert.equal(expressionAfter('5%n'), '-5%');
  assert.equal(expressionAfter('n'), '-');
  assert.equal(expressionAfter('2*n'), '2*-');
  assert.equal(press('2*n3=').expression, '-6');
});

test('backspace', () => {
  assert.equal(expressionAfter('123<'), '12');
  assert.equal(expressionAfter('2+<'), '2');
  assert.equal(expressionAfter('<'), '');
  const afterResult = press('12+2=<');
  assert.equal(afterResult.expression, '1');
  assert.equal(afterResult.mode, 'editing');
});

test('after a result: digits start over, operators continue', () => {
  assert.equal(expressionAfter('2+3=7'), '7');
  assert.equal(expressionAfter('2+3=.'), '0.');
  assert.equal(expressionAfter('2+3=('), '(');
  assert.equal(press('2+3=*2=').expression, '10');
  assert.equal(expressionAfter('2+3=n'), '-5');
  assert.equal(expressionAfter('2+3=%'), '5%');
  assert.equal(press('2+3==').expression, '5');
});

test('errors keep the expression so it can be fixed', () => {
  const state = press('5/0=');
  assert.equal(state.mode, 'error');
  assert.equal(state.error, 'Cannot divide by zero');
  assert.equal(state.expression, '5/0');

  assert.equal(press('5/0=<').mode, 'editing');
  assert.equal(expressionAfter('5/0=<'), '5/');
  assert.equal(press('5/0=2=').expression, '2.5');
  assert.equal(press('2+=').error, 'Incomplete expression');
});

test('live preview while typing', () => {
  assert.equal(press('2+3*4').preview, '14');
  assert.equal(press('(2+3').preview, '5');
  assert.equal(press('5').preview, '');
  assert.equal(press('5.').preview, '');
  assert.equal(press('2+').preview, '');
  assert.equal(press('5/0').preview, '');
  assert.equal(press('50%').preview, '0.5');
});

test('clear resets everything', () => {
  const state = press('2+3=C');
  assert.deepEqual(state, { mode: 'editing', expression: '', history: '', preview: '', error: '', openParens: 0 });
  assert.equal(press('=').mode, 'editing');
});
