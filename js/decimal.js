/**
 * decimal.js: exact decimal arithmetic built on BigInt.
 *
 * JavaScript numbers are binary floating point, so 0.1 + 0.2 evaluates to
 * 0.30000000000000004. To avoid that, every number is stored as a BigInt
 * mantissa and a decimal scale: value = m × 10^-s. Addition, subtraction and
 * multiplication are then exact. Division is the only operation that can
 * produce endless digits (1 ÷ 3), so it is rounded to DIV_PRECISION
 * significant digits, far more than the 15 digits the calculator displays.
 *
 * A Decimal is a frozen object { m: BigInt, s: Number }; functions never
 * mutate their arguments.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CalcDecimal = api;
})(globalThis, function () {
  'use strict';

  /** Significant digits kept when a division does not terminate. */
  const DIV_PRECISION = 32;
  /** Literal exponents beyond this are rejected before any BigInt work. */
  const MAX_LITERAL_EXPONENT = 1000;

  const abs = (n) => (n < 0n ? -n : n);
  const pow10 = (n) => 10n ** BigInt(n);
  const digitCount = (n) => abs(n).toString().length;

  /** Creates a normalized Decimal: scale >= 0 and no trailing zeros in m. */
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

  /** Parses "12", "0.5", ".5", "5." or "1.5e+21" into a Decimal. */
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

  /** Divides a by b, rounding half away from zero to DIV_PRECISION digits. */
  function div(a, b) {
    if (b.m === 0n) throw new RangeError('Division by zero');
    // a / b = (|a.m| · 10^b.s) / (|b.m| · 10^a.s), an exact ratio of integers.
    let numerator = abs(a.m) * pow10(b.s);
    const denominator = abs(b.m) * pow10(a.s);
    // Scale the numerator up so the integer quotient carries enough digits.
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

  /** Power of ten of the leading digit: 1234 → 3, 0.05 → -2. */
  function exponentOf(a) {
    return digitCount(a.m) - 1 - a.s;
  }

  /** Rounds to `digits` significant digits, half away from zero. */
  function roundSignificant(a, digits) {
    const extra = digitCount(a.m) - digits;
    if (extra <= 0) return a;
    const unit = pow10(extra);
    let q = abs(a.m) / unit;
    if ((abs(a.m) % unit) * 2n >= unit) q += 1n;
    return create(a.m < 0n ? -q : q, a.s - extra);
  }

  /** Plain notation: "-12.5", "0.003", "1500". */
  function toPlainString(a) {
    const sign = a.m < 0n ? '-' : '';
    const digits = abs(a.m).toString().padStart(a.s + 1, '0');
    if (a.s === 0) return sign + digits;
    const point = digits.length - a.s;
    return `${sign}${digits.slice(0, point)}.${digits.slice(point)}`;
  }

  /** Scientific notation in JavaScript's style: "1.5e+21", "-2e-9". */
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
