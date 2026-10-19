# Interactive Calculator

A calculator built with vanilla HTML, CSS and JavaScript for the GDG Algiers frontend challenge. It has full keyboard support and correct operator precedence, and it uses no framework, no library, and no `eval()`.

**Live demo:** https://YOUR-USERNAME.github.io/interactive-calculator/ <!-- replace after deploying -->

## Features

- **Operations:** `+ − × ÷`, decimals, parentheses, percent, `±` (negate), `AC` and backspace.
- **Correct precedence:** `2 + 3 × 4 = 14` and `(2 + 3) × 4 = 20`. Negative numbers such as `2 × −3` and implicit multiplication such as `2(3 + 4)` also work.
- **Exact decimals:** `0.1 + 0.2 = 0.3` and `1.1 × 1.1 = 1.21`, with no floating-point noise.
- **Full expression and result:** the expression is shown as you type, with a live preview of the result. After `=`, the expression stays visible above the result.
- **Clear errors:** division by zero, invalid or incomplete expressions, mismatched parentheses and overflow each get a message. The expression is kept so you can fix it.
- **Keyboard support:** the matching on-screen button lights up on every key press.
- **Responsive:** a card layout on desktop, a full-screen layout on phones, and a side-by-side layout in landscape. Light and dark themes follow the system setting.
- **Accessible:** real `<button>`s with labels, visible focus rings, `aria-keyshortcuts`, results and errors announced to screen readers, and support for reduced motion.

### Keyboard shortcuts

| Key | Action |
| --- | --- |
| `0`–`9`, `.` or `,` | Digits, decimal point |
| `+` `-` `*` (or `x`) `/` | Operators |
| `(` `)` `%` | Parentheses, percent |
| `Enter` or `=` | Compute |
| `Backspace` | Delete the last character |
| `Escape` or `Delete` | Clear everything |
| `F9` | Toggle sign (same key as the Windows calculator) |

## How operator precedence is handled

The expression is evaluated in three stages in [`js/parser.js`](js/parser.js), without `eval()` or `Function()`:

1. **Tokenizer.** It splits the text into numbers, operators, parentheses and `%`. A `-` counts as a **unary minus** when no operand comes before it: at the start, after an operator, or after `(`.
2. **Shunting-yard (Dijkstra).** It reorders the tokens into Reverse Polish Notation, using an operator stack and this precedence table:

   | Operator | Precedence | Associativity |
   | --- | --- | --- |
   | `%` (postfix) | 4 | — |
   | unary `−` | 3 | right |
   | `×` `÷` | 2 | left |
   | `+` `−` | 1 | left |

   Before an operator is pushed onto the stack, every operator on the stack with equal or higher precedence is popped to the output. Parentheses act as barriers. The same pass checks the grammar, so `2 + × 3`, `()` or `2 + 3)` are rejected with a clear error.
3. **RPN evaluation.** A stack machine pushes numbers and applies each operator to the values on top of the stack.

```
2 + 3 × 4   →   tokens: 2  +  3  ×  4
            →   RPN:    2 3 4 × +        (× is output before +)
            →   stack:  [2] [2,3] [2,3,4] [2,12] [14]   =  14
```

**Percent** works like on phone calculators. `x%` means `x / 100`, but after `+` or `−` it is a percentage of the left side: `50 + 10% = 55` and `200 − 25% = 150`, while `50 × 10% = 5`.

**Floating point.** JavaScript numbers are binary floats, so `0.1 + 0.2` would give `0.30000000000000004`. [`js/decimal.js`](js/decimal.js) stores every number as a `BigInt` mantissa with a decimal scale, which makes `+ − ×` exact. `÷` is computed to 32 significant digits, and results are shown rounded to 15.

## Project structure

```
index.html          markup: display, keypad, live region
style.css           design tokens, light/dark themes, responsive layout
js/decimal.js       exact decimal arithmetic on BigInt
js/parser.js        tokenizer → shunting-yard → RPN evaluator (no DOM)
js/calculator.js    input rules: what each key does to the expression (no DOM)
js/app.js           DOM layer: rendering, clicks, keyboard, announcements
tests/*.test.js     unit tests for the three logic modules
```

The parsing and input logic is kept separate from the UI. The three logic modules never touch the DOM, so they run unchanged in the browser and in Node.

## Running locally

Open `index.html` in a browser. There is no build step and nothing to install, and the plain `<script>` tags also work from `file://`.

Run the tests with Node 20 or later, using its built-in test runner:

```sh
node --test
```
