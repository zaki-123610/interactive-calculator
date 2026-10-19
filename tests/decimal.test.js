const { test } = require('node:test');
const assert = require('node:assert/strict');
const D = require('../js/decimal.js');

const d = (text) => D.fromString(text);
const plain = (value) => D.toPlainString(value);

test('parses number literals in every accepted shape', () => {
  assert.equal(plain(d('0')), '0');
  assert.equal(plain(d('0.000')), '0');
  assert.equal(plain(d('007')), '7');
  assert.equal(plain(d('12.50')), '12.5');
  assert.equal(plain(d('.5')), '0.5');
  assert.equal(plain(d('5.')), '5');
  assert.equal(plain(d('1.5e3')), '1500');
  assert.equal(plain(d('1.5E-3')), '0.0015');
  assert.equal(plain(d('2e+2')), '200');
});

test('rejects malformed literals', () => {
  for (const bad of ['', '.', 'abc', '1.2.3', '1e', '-1']) {
    assert.throws(() => d(bad), SyntaxError, bad);
  }
  assert.throws(() => d('1e5000'), RangeError);
});

test('addition and subtraction are exact', () => {
  assert.equal(plain(D.add(d('0.1'), d('0.2'))), '0.3');
  assert.equal(plain(D.sub(d('0.3'), d('0.1'))), '0.2');
  assert.equal(plain(D.sub(d('1'), d('1'))), '0');
  assert.equal(plain(D.add(d('0.7'), d('0.1'))), '0.8');
  assert.equal(plain(D.sub(d('2'), d('5.25'))), '-3.25');
});

test('multiplication is exact', () => {
  assert.equal(plain(D.mul(d('1.1'), d('1.1'))), '1.21');
  assert.equal(plain(D.mul(d('0.1'), d('3'))), '0.3');
  assert.equal(plain(D.mul(D.negate(d('2')), d('3'))), '-6');
  assert.equal(plain(D.mul(d('1.005'), d('1000'))), '1005');
});

test('division terminates exactly or rounds to DIV_PRECISION digits', () => {
  assert.equal(plain(D.div(d('0.3'), d('0.1'))), '3');
  assert.equal(plain(D.div(d('1'), d('8'))), '0.125');
  assert.equal(plain(D.div(D.negate(d('1')), d('4'))), '-0.25');
  assert.equal(plain(D.div(d('1'), d('3'))), `0.${'3'.repeat(D.DIV_PRECISION)}`);
  assert.equal(plain(D.div(d('2'), d('3'))), `0.${'6'.repeat(D.DIV_PRECISION - 1)}7`);
  assert.equal(plain(D.div(d('0'), d('7'))), '0');
  assert.throws(() => D.div(d('1'), d('0')), RangeError);
});

test('exponentOf gives the power of ten of the leading digit', () => {
  assert.equal(D.exponentOf(d('1234')), 3);
  assert.equal(D.exponentOf(d('1')), 0);
  assert.equal(D.exponentOf(d('0.05')), -2);
  assert.equal(D.exponentOf(D.ZERO), 0);
});

test('roundSignificant rounds half away from zero', () => {
  const twoThirds = D.div(d('2'), d('3'));
  assert.equal(plain(D.roundSignificant(twoThirds, 15)), '0.666666666666667');
  assert.equal(plain(D.roundSignificant(D.negate(d('1.25')), 2)), '-1.3');
  assert.equal(plain(D.roundSignificant(d('999999999999999.5'), 15)), '1000000000000000');
  assert.equal(plain(D.roundSignificant(d('12.5'), 15)), '12.5');
});

test('formats scientific notation like JavaScript', () => {
  assert.equal(D.toExponentialString(d('1.5e21')), '1.5e+21');
  assert.equal(D.toExponentialString(D.negate(d('2e-9'))), '-2e-9');
  assert.equal(D.toExponentialString(d('1000')), '1e+3');
  assert.equal(D.toExponentialString(d('123.45')), '1.2345e+2');
});
