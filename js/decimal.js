(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CalcDecimal = api;
})(globalThis, function () {
  'use strict';

  const DIV_PRECISION = 32;
  const MAX_LITERAL_EXPONENT = 1000;

  const abs = (n) => (n < 0n ? -n : n);
  const pow10 = (n) => 10n ** BigInt(n);
  const digitCount = (n) => abs(n).toString().length;

  function create(m, s) {
    if (s < 0) {
      m *= pow10(-s);
      s = 0;
    }
    while (s > 0 && m % 10n === 0n) {
      m /= 10n;
      s -= 1;
    }
    return Object.freeze({ m, s });
  }

  const ZERO = create(0n, 0);

  function fromString(text) {
    const match = /^(\d*)(?:\.(\d*))?(?:e([+-]?\d+))?$/i.exec(text);
    if (!match || match[1] + (match[2] || '') === '') {
      throw new SyntaxError(`Invalid number "${text}"`);
    }
    const [, intDigits, fracDigits = '', exponent = '0'] = match;
    const exp = Number(exponent);
    if (Math.abs(exp) > MAX_LITERAL_EXPONENT) {
      throw new RangeError(`Exponent out of range in "${text}"`);
    }
    return create(BigInt(intDigits + fracDigits), fracDigits.length - exp);
  }

  function add(a, b) {
    const s = Math.max(a.s, b.s);
    return create(a.m * pow10(s - a.s) + b.m * pow10(s - b.s), s);
  }

  function negate(a) {
    return create(-a.m, a.s);
  }

  function sub(a, b) {
    return add(a, negate(b));
  }

  function mul(a, b) {
    return create(a.m * b.m, a.s + b.s);
  }

  function div(a, b) {
    if (b.m === 0n) throw new RangeError('Division by zero');
    let numerator = abs(a.m) * pow10(b.s);
    const denominator = abs(b.m) * pow10(a.s);
    const shift = Math.max(0, DIV_PRECISION - (digitCount(numerator) - digitCount(denominator)));
    numerator *= pow10(shift);
    let quotient = numerator / denominator;
    if ((numerator % denominator) * 2n >= denominator) quotient += 1n;
    const negative = (a.m < 0n) !== (b.m < 0n);
    return create(negative ? -quotient : quotient, shift);
  }

  function isZero(a) {
    return a.m === 0n;
  }

  function exponentOf(a) {
    return digitCount(a.m) - 1 - a.s;
  }

  function roundSignificant(a, digits) {
    const extra = digitCount(a.m) - digits;
    if (extra <= 0) return a;
    const unit = pow10(extra);
    let q = abs(a.m) / unit;
    if ((abs(a.m) % unit) * 2n >= unit) q += 1n;
    return create(a.m < 0n ? -q : q, a.s - extra);
  }

  function toPlainString(a) {
    const sign = a.m < 0n ? '-' : '';
    const digits = abs(a.m).toString().padStart(a.s + 1, '0');
    if (a.s === 0) return sign + digits;
    const point = digits.length - a.s;
    return `${sign}${digits.slice(0, point)}.${digits.slice(point)}`;
  }

  function toExponentialString(a) {
    const sign = a.m < 0n ? '-' : '';
    const digits = abs(a.m).toString().replace(/0+$/, '') || '0';
    const mantissa = digits.length > 1 ? `${digits[0]}.${digits.slice(1)}` : digits;
    const exp = exponentOf(a);
    return `${sign}${mantissa}e${exp < 0 ? '-' : '+'}${Math.abs(exp)}`;
  }

  return {
    DIV_PRECISION,
    ZERO,
    fromString,
    add,
    sub,
    mul,
    div,
    negate,
    isZero,
    exponentOf,
    roundSignificant,
    toPlainString,
    toExponentialString,
  };
});
