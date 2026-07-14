# Twig Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Twig — a hand-written lexer, recursive-descent parser, and tree-walking evaluator for a small language, wrapped in a single-file `index.html` playground with live Tokens/Parse Tree/Trace/Output views — then document it and deploy it to GitHub Pages.

**Architecture:** All interpreter logic (Lexer, Parser, Evaluator, Environment, TwigError) lives in one `<script id="twig-core">` block inside `index.html`, exposed as a single global `Twig` object (`var Twig = { Lexer, Parser, Evaluator, ... }` — `var` at script top level attaches to `window` in the browser). A second `<script>` block below it holds only DOM/UI code that calls into `Twig.*`. Dev-time tests never touch the DOM: a small Node helper (`tests/support/load-twig-core.mjs`) extracts the `twig-core` script's source text out of `index.html` with a regex and runs it in a `node:vm` sandbox, so the exact same code that ships to the browser is what gets unit-tested — no build step, no duplication, no npm dependencies.

**Tech Stack:** Vanilla JS (ES2020+), HTML, CSS. Dev-only: Node.js 20+ built-in test runner (`node:test`, `node:assert/strict`, `node:vm`) — no `package.json`, no `npm install`.

## Global Constraints

- Everything shipped to production is one file: `index.html`. No build step, no bundler, no external JS/CSS libraries (per spec's "single file, zero dependencies" requirement).
- `if`/`while` conditions must be actual booleans — no truthy/falsy coercion. A non-boolean condition is a runtime `TwigError`.
- Every `TwigError` (phase `lex` | `parse` | `runtime`) carries `{ message, line, col, phase }`.
- Recursion depth is capped at `MAX_CALL_DEPTH = 200` inside the evaluator, well below any mainstream JS engine's real stack limit, so Twig-level infinite recursion always raises a clean `TwigError` and never crashes the tab with a native `RangeError`.
- Dark, dev-tool visual theme; side-by-side layout (editor+controls left, tabs right).
- GitHub Pages serves from the repo root on `main` — `index.html` must be at the repo root.
- Commit history stays granular: one commit per task below (never squash lexer+parser+evaluator+UI+README into one commit).

---

## Task 1: Project scaffold + Lexer

**Files:**
- Create: `index.html` (skeleton + `twig-core` script with `TwigError` and `Lexer`)
- Create: `tests/support/load-twig-core.mjs`
- Create: `tests/lexer.test.mjs`

**Interfaces:**
- Produces: `Twig.TwigError` — `class TwigError extends Error { constructor(message, line, col, phase) }`, instance has `.line`, `.col`, `.phase` (`'lex'|'parse'|'runtime'`).
- Produces: `Twig.Lexer` — `class Lexer { constructor(source); tokenize(): Token[] }`. `Token = { type: string, value: any, line: number, col: number }`. Token types used: `NUMBER, STRING, IDENT, LET, IF, ELSE, WHILE, FUNCTION, RETURN, PRINT, TRUE, FALSE, PLUS, MINUS, STAR, SLASH, PERCENT, ASSIGN, EQ, NEQ, LT, LE, GT, GE, AND, OR, NOT, LPAREN, RPAREN, LBRACE, RBRACE, COMMA, SEMI, EOF`. The token stream always ends with one `EOF` token.
- Produces: `tests/support/load-twig-core.mjs` exports `loadTwigCore()` — reads `index.html` from the repo root, regex-extracts the contents of `<script id="twig-core">...</script>`, runs it via `vm.runInContext` in a fresh sandbox, and returns the sandbox's `Twig` object. Every later task that adds classes to `twig-core` and extends the `Twig` export automatically becomes visible through this same function — it never needs to change.

- [ ] **Step 1: Write `tests/support/load-twig-core.mjs`**

```js
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import vm from 'node:vm';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.join(__dirname, '..', '..', 'index.html');

export function loadTwigCore() {
  const html = readFileSync(indexPath, 'utf8');
  const match = html.match(/<script id="twig-core">([\s\S]*?)<\/script>/);
  if (!match) {
    throw new Error('Could not find <script id="twig-core"> block in index.html');
  }
  const sandbox = {};
  vm.createContext(sandbox);
  vm.runInContext(match[1], sandbox, { filename: 'twig-core.js' });
  if (!sandbox.Twig) {
    throw new Error('twig-core script did not define a global Twig object');
  }
  return sandbox.Twig;
}
```

- [ ] **Step 2: Write `index.html` skeleton with an empty-ish `twig-core` block**

```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Twig Playground</title>
</head>
<body>
<script id="twig-core">
var Twig = {};
</script>
</body>
</html>
```

- [ ] **Step 3: Write `tests/lexer.test.mjs` (failing test suite)**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadTwigCore } from './support/load-twig-core.mjs';

const { Lexer, TwigError } = loadTwigCore();

function types(source) {
  return new Lexer(source).tokenize().map((t) => t.type);
}

test('tokenizes numbers, including decimals', () => {
  const tokens = new Lexer('42 3.14').tokenize();
  assert.equal(tokens[0].type, 'NUMBER');
  assert.equal(tokens[0].value, 42);
  assert.equal(tokens[1].type, 'NUMBER');
  assert.equal(tokens[1].value, 3.14);
  assert.equal(tokens[2].type, 'EOF');
});

test('tokenizes strings with escapes', () => {
  const tokens = new Lexer('"hi\\n\\"there\\""').tokenize();
  assert.equal(tokens[0].type, 'STRING');
  assert.equal(tokens[0].value, 'hi\n"there"');
});

test('tokenizes keywords distinctly from identifiers', () => {
  assert.deepEqual(
    types('let if else while function return print true false x'),
    ['LET', 'IF', 'ELSE', 'WHILE', 'FUNCTION', 'RETURN', 'PRINT', 'TRUE', 'FALSE', 'IDENT', 'EOF'],
  );
});

test('tokenizes operators, including two-character operators', () => {
  assert.deepEqual(
    types('+ - * / % = == != < <= > >= && || ! ( ) { } , ;'),
    [
      'PLUS', 'MINUS', 'STAR', 'SLASH', 'PERCENT', 'ASSIGN', 'EQ', 'NEQ',
      'LT', 'LE', 'GT', 'GE', 'AND', 'OR', 'NOT', 'LPAREN', 'RPAREN',
      'LBRACE', 'RBRACE', 'COMMA', 'SEMI', 'EOF',
    ],
  );
});

test('skips line comments', () => {
  assert.deepEqual(types('1 // this is ignored\n2'), ['NUMBER', 'NUMBER', 'EOF']);
});

test('tracks line and column across newlines', () => {
  const tokens = new Lexer('let x\n  = 1;').tokenize();
  const eq = tokens.find((t) => t.type === 'ASSIGN');
  assert.equal(eq.line, 2);
  assert.equal(eq.col, 3);
});

test('unterminated string raises a lex-phase TwigError', () => {
  assert.throws(() => new Lexer('"never closed').tokenize(), (err) => {
    assert.ok(err instanceof TwigError);
    assert.equal(err.phase, 'lex');
    assert.match(err.message, /Unterminated string/);
    return true;
  });
});

test('unknown character raises a lex-phase TwigError', () => {
  assert.throws(() => new Lexer('1 @ 2').tokenize(), (err) => {
    assert.ok(err instanceof TwigError);
    assert.equal(err.phase, 'lex');
    assert.match(err.message, /Unexpected character/);
    return true;
  });
});
```

- [ ] **Step 4: Run the suite and verify it fails**

Run: `node --test tests/lexer.test.mjs`
Expected: FAILs — `Twig.Lexer is not a constructor` (or similar), since `Twig` is currently `{}`.

- [ ] **Step 5: Implement the Lexer inside `index.html`'s `twig-core` script**

Replace the contents of `<script id="twig-core">` with:

```js
class TwigError extends Error {
  constructor(message, line, col, phase) {
    super(message);
    this.name = 'TwigError';
    this.line = line;
    this.col = col;
    this.phase = phase;
  }
}

const KEYWORDS = new Set(['let', 'if', 'else', 'while', 'function', 'return', 'print', 'true', 'false']);

const TWO_CHAR_OPS = { '==': 'EQ', '!=': 'NEQ', '<=': 'LE', '>=': 'GE', '&&': 'AND', '||': 'OR' };
const ONE_CHAR_OPS = {
  '+': 'PLUS', '-': 'MINUS', '*': 'STAR', '/': 'SLASH', '%': 'PERCENT',
  '=': 'ASSIGN', '<': 'LT', '>': 'GT', '!': 'NOT',
  '(': 'LPAREN', ')': 'RPAREN', '{': 'LBRACE', '}': 'RBRACE',
  ',': 'COMMA', ';': 'SEMI',
};
const ESCAPES = { n: '\n', t: '\t', '"': '"', '\\': '\\' };

class Lexer {
  constructor(source) {
    this.source = source;
    this.pos = 0;
    this.line = 1;
    this.col = 1;
    this.tokens = [];
  }

  peek(offset = 0) {
    return this.source[this.pos + offset];
  }

  advance() {
    const ch = this.source[this.pos++];
    if (ch === '\n') { this.line++; this.col = 1; } else { this.col++; }
    return ch;
  }

  addToken(type, value, line, col) {
    this.tokens.push({ type, value, line, col });
  }

  tokenize() {
    while (this.pos < this.source.length) {
      this.skipWhitespaceAndComments();
      if (this.pos >= this.source.length) break;
      const startLine = this.line;
      const startCol = this.col;
      const ch = this.peek();
      if (this.isDigit(ch)) {
        this.readNumber(startLine, startCol);
      } else if (ch === '"') {
        this.readString(startLine, startCol);
      } else if (this.isIdentStart(ch)) {
        this.readIdentifier(startLine, startCol);
      } else {
        this.readOperator(startLine, startCol);
      }
    }
    this.tokens.push({ type: 'EOF', value: null, line: this.line, col: this.col });
    return this.tokens;
  }

  skipWhitespaceAndComments() {
    for (;;) {
      const ch = this.peek();
      if (ch === ' ' || ch === '\t' || ch === '\r' || ch === '\n') {
        this.advance();
      } else if (ch === '/' && this.peek(1) === '/') {
        while (this.pos < this.source.length && this.peek() !== '\n') this.advance();
      } else {
        break;
      }
    }
  }

  isDigit(ch) { return ch >= '0' && ch <= '9'; }
  isIdentStart(ch) { return ch !== undefined && /[A-Za-z_]/.test(ch); }
  isIdentPart(ch) { return ch !== undefined && /[A-Za-z0-9_]/.test(ch); }

  readNumber(line, col) {
    let text = '';
    while (this.pos < this.source.length && this.isDigit(this.peek())) text += this.advance();
    if (this.peek() === '.' && this.isDigit(this.peek(1))) {
      text += this.advance();
      while (this.pos < this.source.length && this.isDigit(this.peek())) text += this.advance();
    }
    this.addToken('NUMBER', Number(text), line, col);
  }

  readString(line, col) {
    this.advance();
    let text = '';
    for (;;) {
      if (this.pos >= this.source.length || this.peek() === '\n') {
        throw new TwigError('Unterminated string literal', line, col, 'lex');
      }
      const ch = this.peek();
      if (ch === '"') { this.advance(); break; }
      if (ch === '\\') {
        this.advance();
        const esc = this.advance();
        if (!(esc in ESCAPES)) {
          throw new TwigError(`Unknown escape sequence \\${esc}`, this.line, this.col, 'lex');
        }
        text += ESCAPES[esc];
      } else {
        text += this.advance();
      }
    }
    this.addToken('STRING', text, line, col);
  }

  readIdentifier(line, col) {
    let text = '';
    while (this.pos < this.source.length && this.isIdentPart(this.peek())) text += this.advance();
    this.addToken(KEYWORDS.has(text) ? text.toUpperCase() : 'IDENT', text, line, col);
  }

  readOperator(line, col) {
    const two = this.source.slice(this.pos, this.pos + 2);
    if (TWO_CHAR_OPS[two]) {
      this.advance(); this.advance();
      this.addToken(TWO_CHAR_OPS[two], two, line, col);
      return;
    }
    const ch = this.advance();
    if (ONE_CHAR_OPS[ch]) {
      this.addToken(ONE_CHAR_OPS[ch], ch, line, col);
    } else {
      throw new TwigError(`Unexpected character '${ch}'`, line, col, 'lex');
    }
  }
}

var Twig = { TwigError, Lexer };
</script>
```

- [ ] **Step 6: Run the suite and verify it passes**

Run: `node --test tests/lexer.test.mjs`
Expected: PASS — all 8 tests green.

- [ ] **Step 7: Commit**

```bash
git add index.html tests/support/load-twig-core.mjs tests/lexer.test.mjs
git commit -m "Add Twig lexer"
```

---

## Task 2: Parser

**Files:**
- Modify: `index.html` (append `Parser` inside `<script id="twig-core">`, extend the `Twig` export)
- Create: `tests/parser.test.mjs`

**Interfaces:**
- Consumes: `Twig.Lexer`, `Twig.TwigError` from Task 1.
- Produces: `Twig.Parser` — `class Parser { constructor(tokens); parseProgram(): Program }`.
- Produces AST node shapes (every node has `line`, `col` from its starting token):
  - `Program { type, body: Stmt[] }`
  - `LetStmt { type, name, value: Expr, line, col }`
  - `AssignStmt { type, name, value: Expr, line, col }`
  - `IfStmt { type, test: Expr, consequent: Block, alternate: Block|null, line, col }`
  - `WhileStmt { type, test: Expr, body: Block, line, col }`
  - `FunctionDecl { type, name, params: string[], body: Block, line, col }`
  - `ReturnStmt { type, value: Expr|null, line, col }`
  - `PrintStmt { type, value: Expr, line, col }`
  - `ExprStmt { type, expr: Expr, line, col }`
  - `Block { type, body: Stmt[], line, col }`
  - `NumberLit { type, value: number, line, col }`
  - `StringLit { type, value: string, line, col }`
  - `BoolLit { type, value: boolean, line, col }`
  - `Identifier { type, name: string, line, col }`
  - `Unary { type, op: '-'|'!', argument: Expr, line, col }`
  - `Binary { type, op: string, left: Expr, right: Expr, line, col }`
  - `Logical { type, op: '&&'|'||', left: Expr, right: Expr, line, col }`
  - `Call { type, callee: Expr, args: Expr[], line, col }`
- Grammar (braces are mandatory around every `if`/`else`/`while`/function body — there is no bare single-statement form): `program := statement* EOF`; expression precedence from loosest to tightest: `||`, `&&`, `== !=`, `< <= > >=`, `+ -`, `* / %`, unary `- !`, call, primary.

- [ ] **Step 1: Write `tests/parser.test.mjs` (failing test suite)**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadTwigCore } from './support/load-twig-core.mjs';

const { Lexer, Parser, TwigError } = loadTwigCore();

function parse(source) {
  return new Parser(new Lexer(source).tokenize()).parseProgram();
}

test('parses a let statement', () => {
  const ast = parse('let x = 1;');
  assert.equal(ast.body[0].type, 'LetStmt');
  assert.equal(ast.body[0].name, 'x');
  assert.equal(ast.body[0].value.type, 'NumberLit');
  assert.equal(ast.body[0].value.value, 1);
});

test('parses an assignment', () => {
  const ast = parse('x = 2;');
  assert.equal(ast.body[0].type, 'AssignStmt');
  assert.equal(ast.body[0].name, 'x');
});

test('respects arithmetic precedence: 2 + 3 * 4', () => {
  const ast = parse('let x = 2 + 3 * 4;');
  const top = ast.body[0].value;
  assert.equal(top.type, 'Binary');
  assert.equal(top.op, '+');
  assert.equal(top.left.value, 2);
  assert.equal(top.right.type, 'Binary');
  assert.equal(top.right.op, '*');
});

test('parses if/else with mandatory blocks', () => {
  const ast = parse('if (x < 1) { print(1); } else { print(2); }');
  const node = ast.body[0];
  assert.equal(node.type, 'IfStmt');
  assert.equal(node.test.type, 'Binary');
  assert.equal(node.consequent.type, 'Block');
  assert.equal(node.alternate.type, 'Block');
});

test('parses while loops', () => {
  const ast = parse('while (x < 10) { x = x + 1; }');
  assert.equal(ast.body[0].type, 'WhileStmt');
});

test('parses function declarations and return', () => {
  const ast = parse('function add(a, b) { return a + b; }');
  const fn = ast.body[0];
  assert.equal(fn.type, 'FunctionDecl');
  assert.deepEqual(fn.params, ['a', 'b']);
  assert.equal(fn.body.body[0].type, 'ReturnStmt');
});

test('parses nested and chained calls', () => {
  const ast = parse('let y = makeCounter()();');
  const call = ast.body[0].value;
  assert.equal(call.type, 'Call');
  assert.equal(call.callee.type, 'Call');
  assert.equal(call.callee.callee.name, 'makeCounter');
});

test('every node carries line and col', () => {
  const ast = parse('let x = 1;');
  assert.equal(typeof ast.body[0].line, 'number');
  assert.equal(typeof ast.body[0].col, 'number');
});

test('unterminated block raises a parse-phase TwigError', () => {
  assert.throws(() => parse('function f() { let x = 1;'), (err) => {
    assert.ok(err instanceof TwigError);
    assert.equal(err.phase, 'parse');
    return true;
  });
});

test('unterminated parenthesized expression raises a parse-phase TwigError', () => {
  assert.throws(() => parse('let x = (1 + 2;'), (err) => {
    assert.ok(err instanceof TwigError);
    assert.equal(err.phase, 'parse');
    return true;
  });
});

test('missing semicolon raises a parse-phase TwigError', () => {
  assert.throws(() => parse('let x = 1'), (err) => {
    assert.ok(err instanceof TwigError);
    assert.equal(err.phase, 'parse');
    return true;
  });
});
```

- [ ] **Step 2: Run the suite and verify it fails**

Run: `node --test tests/parser.test.mjs`
Expected: FAILs — `Twig.Parser is not a constructor`.

- [ ] **Step 3: Implement the Parser — insert before the final `var Twig = ...` line in `index.html`'s `twig-core` script**

```js
class Parser {
  constructor(tokens) {
    this.tokens = tokens;
    this.pos = 0;
  }

  peek(offset = 0) { return this.tokens[this.pos + offset]; }
  current() { return this.peek(); }
  check(type) { return this.current().type === type; }
  advance() { return this.tokens[this.pos++]; }

  match(...types) {
    if (types.includes(this.current().type)) return this.advance();
    return null;
  }

  expect(type, message) {
    if (this.check(type)) return this.advance();
    const tok = this.current();
    throw new TwigError(message ?? `Expected ${type} but found ${tok.type}`, tok.line, tok.col, 'parse');
  }

  parseProgram() {
    const body = [];
    while (!this.check('EOF')) body.push(this.parseStatement());
    return { type: 'Program', body };
  }

  parseStatement() {
    switch (this.current().type) {
      case 'LET': return this.parseLet();
      case 'IF': return this.parseIf();
      case 'WHILE': return this.parseWhile();
      case 'FUNCTION': return this.parseFunctionDecl();
      case 'RETURN': return this.parseReturn();
      case 'PRINT': return this.parsePrint();
      case 'LBRACE': return this.parseBlock();
      case 'IDENT':
        if (this.peek(1).type === 'ASSIGN') return this.parseAssign();
        return this.parseExprStatement();
      default:
        return this.parseExprStatement();
    }
  }

  parseLet() {
    const startTok = this.expect('LET');
    const name = this.expect('IDENT', 'Expected variable name after "let"').value;
    this.expect('ASSIGN', 'Expected "=" after variable name');
    const value = this.parseExpression();
    this.expect('SEMI', 'Expected ";" after variable declaration');
    return { type: 'LetStmt', name, value, line: startTok.line, col: startTok.col };
  }

  parseAssign() {
    const nameTok = this.expect('IDENT');
    this.expect('ASSIGN');
    const value = this.parseExpression();
    this.expect('SEMI', 'Expected ";" after assignment');
    return { type: 'AssignStmt', name: nameTok.value, value, line: nameTok.line, col: nameTok.col };
  }

  parseIf() {
    const startTok = this.expect('IF');
    this.expect('LPAREN', 'Expected "(" after "if"');
    const test = this.parseExpression();
    this.expect('RPAREN', 'Expected ")" after if condition');
    const consequent = this.parseBlock();
    const alternate = this.match('ELSE') ? this.parseBlock() : null;
    return { type: 'IfStmt', test, consequent, alternate, line: startTok.line, col: startTok.col };
  }

  parseWhile() {
    const startTok = this.expect('WHILE');
    this.expect('LPAREN', 'Expected "(" after "while"');
    const test = this.parseExpression();
    this.expect('RPAREN', 'Expected ")" after while condition');
    const body = this.parseBlock();
    return { type: 'WhileStmt', test, body, line: startTok.line, col: startTok.col };
  }

  parseFunctionDecl() {
    const startTok = this.expect('FUNCTION');
    const name = this.expect('IDENT', 'Expected function name').value;
    this.expect('LPAREN', 'Expected "(" after function name');
    const params = [];
    if (!this.check('RPAREN')) {
      params.push(this.expect('IDENT', 'Expected parameter name').value);
      while (this.match('COMMA')) params.push(this.expect('IDENT', 'Expected parameter name').value);
    }
    this.expect('RPAREN', 'Expected ")" after parameters');
    const body = this.parseBlock();
    return { type: 'FunctionDecl', name, params, body, line: startTok.line, col: startTok.col };
  }

  parseReturn() {
    const startTok = this.expect('RETURN');
    const value = this.check('SEMI') ? null : this.parseExpression();
    this.expect('SEMI', 'Expected ";" after return statement');
    return { type: 'ReturnStmt', value, line: startTok.line, col: startTok.col };
  }

  parsePrint() {
    const startTok = this.expect('PRINT');
    this.expect('LPAREN', 'Expected "(" after "print"');
    const value = this.parseExpression();
    this.expect('RPAREN', 'Expected ")" after print argument');
    this.expect('SEMI', 'Expected ";" after print statement');
    return { type: 'PrintStmt', value, line: startTok.line, col: startTok.col };
  }

  parseBlock() {
    const startTok = this.expect('LBRACE', 'Expected "{"');
    const body = [];
    while (!this.check('RBRACE')) {
      if (this.check('EOF')) {
        throw new TwigError('Unterminated block: expected "}"', startTok.line, startTok.col, 'parse');
      }
      body.push(this.parseStatement());
    }
    this.expect('RBRACE');
    return { type: 'Block', body, line: startTok.line, col: startTok.col };
  }

  parseExprStatement() {
    const tok = this.current();
    const expr = this.parseExpression();
    this.expect('SEMI', 'Expected ";" after expression statement');
    return { type: 'ExprStmt', expr, line: tok.line, col: tok.col };
  }

  parseExpression() { return this.parseLogicOr(); }

  parseLogicOr() {
    let left = this.parseLogicAnd();
    while (this.check('OR')) {
      const op = this.advance();
      left = { type: 'Logical', op: '||', left, right: this.parseLogicAnd(), line: op.line, col: op.col };
    }
    return left;
  }

  parseLogicAnd() {
    let left = this.parseEquality();
    while (this.check('AND')) {
      const op = this.advance();
      left = { type: 'Logical', op: '&&', left, right: this.parseEquality(), line: op.line, col: op.col };
    }
    return left;
  }

  parseEquality() {
    let left = this.parseComparison();
    while (this.check('EQ') || this.check('NEQ')) {
      const op = this.advance();
      left = { type: 'Binary', op: op.value, left, right: this.parseComparison(), line: op.line, col: op.col };
    }
    return left;
  }

  parseComparison() {
    let left = this.parseTerm();
    while (['LT', 'LE', 'GT', 'GE'].includes(this.current().type)) {
      const op = this.advance();
      left = { type: 'Binary', op: op.value, left, right: this.parseTerm(), line: op.line, col: op.col };
    }
    return left;
  }

  parseTerm() {
    let left = this.parseFactor();
    while (this.check('PLUS') || this.check('MINUS')) {
      const op = this.advance();
      left = { type: 'Binary', op: op.value, left, right: this.parseFactor(), line: op.line, col: op.col };
    }
    return left;
  }

  parseFactor() {
    let left = this.parseUnary();
    while (['STAR', 'SLASH', 'PERCENT'].includes(this.current().type)) {
      const op = this.advance();
      left = { type: 'Binary', op: op.value, left, right: this.parseUnary(), line: op.line, col: op.col };
    }
    return left;
  }

  parseUnary() {
    if (this.check('MINUS') || this.check('NOT')) {
      const op = this.advance();
      return { type: 'Unary', op: op.value, argument: this.parseUnary(), line: op.line, col: op.col };
    }
    return this.parseCall();
  }

  parseCall() {
    let expr = this.parsePrimary();
    while (this.check('LPAREN')) {
      const startTok = this.advance();
      const args = [];
      if (!this.check('RPAREN')) {
        args.push(this.parseExpression());
        while (this.match('COMMA')) args.push(this.parseExpression());
      }
      this.expect('RPAREN', 'Expected ")" after arguments');
      expr = { type: 'Call', callee: expr, args, line: startTok.line, col: startTok.col };
    }
    return expr;
  }

  parsePrimary() {
    const tok = this.current();
    if (tok.type === 'NUMBER') { this.advance(); return { type: 'NumberLit', value: tok.value, line: tok.line, col: tok.col }; }
    if (tok.type === 'STRING') { this.advance(); return { type: 'StringLit', value: tok.value, line: tok.line, col: tok.col }; }
    if (tok.type === 'TRUE') { this.advance(); return { type: 'BoolLit', value: true, line: tok.line, col: tok.col }; }
    if (tok.type === 'FALSE') { this.advance(); return { type: 'BoolLit', value: false, line: tok.line, col: tok.col }; }
    if (tok.type === 'IDENT') { this.advance(); return { type: 'Identifier', name: tok.value, line: tok.line, col: tok.col }; }
    if (tok.type === 'LPAREN') {
      this.advance();
      const expr = this.parseExpression();
      this.expect('RPAREN', 'Expected ")" after expression');
      return expr;
    }
    throw new TwigError(`Unexpected token '${tok.value ?? tok.type}'`, tok.line, tok.col, 'parse');
  }
}
```

Then update the export line at the bottom of the script to:

```js
var Twig = { TwigError, Lexer, Parser };
```

- [ ] **Step 4: Run the suite and verify it passes**

Run: `node --test tests/parser.test.mjs`
Expected: PASS — all 11 tests green.

- [ ] **Step 5: Run the full test suite to confirm no regressions**

Run: `node --test tests/`
Expected: PASS — lexer + parser suites both green.

- [ ] **Step 6: Commit**

```bash
git add index.html tests/parser.test.mjs
git commit -m "Add Twig parser"
```

---

## Task 3: Evaluator

**Files:**
- Modify: `index.html` (append `Environment`, `TwigFunction`, `ReturnSignal`, `Evaluator` inside `<script id="twig-core">`, extend the `Twig` export)
- Create: `tests/evaluator.test.mjs`

**Interfaces:**
- Consumes: `Twig.Lexer`, `Twig.Parser`, `Twig.TwigError`, and all AST node shapes from Tasks 1–2.
- Produces: `Twig.Environment` — `class Environment { constructor(parent?); define(name, value); get(name); set(name, value); has(name) }`. `get`/`set` throw a plain `Error` (not `TwigError`) on an undefined variable — the evaluator is responsible for translating that into a `TwigError` with AST position info.
- Produces: `Twig.TwigFunction` — `class TwigFunction { constructor(decl: FunctionDecl, closure: Environment) }`, has `.decl`, `.closure`.
- Produces: `Twig.Evaluator` — `class Evaluator { constructor({ onTrace, onPrint } = {}); run(program: Program): void }`.
  - `onPrint(text: string)` — called once per `print(...)` statement with the already-stringified value.
  - `onTrace(event)` — called on every function call and every function return. `event = { kind: 'call', name: string, args: any[], depth: number } | { kind: 'return', name: string, value: any, depth: number }`. `depth` is the 1-based call-nesting depth (a `call` and its matching `return` share the same `depth`).
  - Throws `TwigError` (phase `'runtime'`) for: division/modulo by zero (`"Division by zero"`), non-boolean `if`/`while` condition (`"Expected a boolean condition, got <type>"`), calling a non-function (`"TypeError: <value> is not callable"`), undefined variable (`"Undefined variable: <name>"`), exceeding `MAX_CALL_DEPTH` (`"Stack overflow: max call depth exceeded"`), and type mismatches in arithmetic/unary operators.
- `MAX_CALL_DEPTH = 200` — chosen well below the real JS engine stack limit (a Twig call costs ~4–5 real JS stack frames through `execStatement → evalExpr → evalCall → callFunction → execBlockBody`; 200 × 5 = ~1000 frames, safely under every mainstream browser's and Node's actual limit) so the evaluator's own check always fires first.

- [ ] **Step 1: Write `tests/evaluator.test.mjs` (failing test suite)**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadTwigCore } from './support/load-twig-core.mjs';

const { Lexer, Parser, Evaluator, TwigError } = loadTwigCore();

function runTwig(source) {
  const prints = [];
  const trace = [];
  const tokens = new Lexer(source).tokenize();
  const ast = new Parser(tokens).parseProgram();
  const evaluator = new Evaluator({
    onPrint: (text) => prints.push(text),
    onTrace: (event) => trace.push(event),
  });
  evaluator.run(ast);
  return { prints, trace };
}

test('arithmetic and print', () => {
  const { prints } = runTwig('print(2 + 3 * 4);');
  assert.deepEqual(prints, ['14']);
});

test('if/else branching', () => {
  const { prints } = runTwig('if (1 < 2) { print("yes"); } else { print("no"); }');
  assert.deepEqual(prints, ['yes']);
});

test('while loop accumulates a sum', () => {
  const { prints } = runTwig(`
    let i = 1;
    let sum = 0;
    while (i <= 5) {
      sum = sum + i;
      i = i + 1;
    }
    print(sum);
  `);
  assert.deepEqual(prints, ['15']);
});

test('recursive fibonacci', () => {
  const { prints } = runTwig(`
    function fib(n) {
      if (n <= 1) { return n; }
      return fib(n - 1) + fib(n - 2);
    }
    print(fib(10));
  `);
  assert.deepEqual(prints, ['55']);
});

test('closures capture the defining environment, not the call site', () => {
  const { prints } = runTwig(`
    function makeCounter() {
      let count = 0;
      function increment() {
        count = count + 1;
        return count;
      }
      return increment;
    }
    let counter = makeCounter();
    print(counter());
    print(counter());
    print(counter());
  `);
  assert.deepEqual(prints, ['1', '2', '3']);
});

test('trace records call and return events with matching nesting depth', () => {
  const { trace } = runTwig(`
    function id(x) { return x; }
    id(1);
  `);
  const call = trace.find((e) => e.kind === 'call');
  const ret = trace.find((e) => e.kind === 'return');
  assert.equal(call.name, 'id');
  assert.equal(ret.name, 'id');
  assert.equal(call.depth, ret.depth);
  assert.equal(ret.value, 1);
});

test('division by zero raises a runtime TwigError', () => {
  assert.throws(() => runTwig('print(1 / 0);'), (err) => {
    assert.ok(err instanceof TwigError);
    assert.equal(err.phase, 'runtime');
    assert.match(err.message, /Division by zero/);
    return true;
  });
});

test('modulo by zero raises a runtime TwigError', () => {
  assert.throws(() => runTwig('print(1 % 0);'), (err) => {
    assert.ok(err instanceof TwigError);
    assert.match(err.message, /Division by zero/);
    return true;
  });
});

test('calling a non-function raises a runtime TypeError', () => {
  assert.throws(() => runTwig('let x = 5; x();'), (err) => {
    assert.ok(err instanceof TwigError);
    assert.equal(err.phase, 'runtime');
    assert.match(err.message, /not callable/);
    return true;
  });
});

test('referencing an undefined variable raises a runtime TwigError', () => {
  assert.throws(() => runTwig('print(doesNotExist);'), (err) => {
    assert.ok(err instanceof TwigError);
    assert.match(err.message, /Undefined variable: doesNotExist/);
    return true;
  });
});

test('a non-boolean if-condition raises a runtime TwigError', () => {
  assert.throws(() => runTwig('if (5) { print(1); }'), (err) => {
    assert.ok(err instanceof TwigError);
    assert.match(err.message, /boolean/);
    return true;
  });
});

test('unconditional recursion raises a clean stack-overflow TwigError, not a native crash', () => {
  assert.throws(() => runTwig('function loop() { return loop(); } loop();'), (err) => {
    assert.ok(err instanceof TwigError);
    assert.equal(err.phase, 'runtime');
    assert.match(err.message, /Stack overflow/);
    return true;
  });
});
```

- [ ] **Step 2: Run the suite and verify it fails**

Run: `node --test tests/evaluator.test.mjs`
Expected: FAILs — `Twig.Evaluator is not a constructor`.

- [ ] **Step 3: Implement Environment, TwigFunction, ReturnSignal, Evaluator — insert before the final `var Twig = ...` line**

```js
class Environment {
  constructor(parent = null) {
    this.vars = new Map();
    this.parent = parent;
  }

  define(name, value) {
    this.vars.set(name, value);
  }

  get(name) {
    if (this.vars.has(name)) return this.vars.get(name);
    if (this.parent) return this.parent.get(name);
    throw new Error(`Undefined variable: ${name}`);
  }

  set(name, value) {
    if (this.vars.has(name)) { this.vars.set(name, value); return; }
    if (this.parent) { this.parent.set(name, value); return; }
    throw new Error(`Undefined variable: ${name}`);
  }

  has(name) {
    if (this.vars.has(name)) return true;
    return this.parent ? this.parent.has(name) : false;
  }
}

class TwigFunction {
  constructor(decl, closure) {
    this.decl = decl;
    this.closure = closure;
  }
}

class ReturnSignal {
  constructor(value) {
    this.value = value;
  }
}

// Well below any mainstream JS engine's real stack limit, so this always
// fires before a native RangeError would.
const MAX_CALL_DEPTH = 200;

class Evaluator {
  constructor({ onTrace = null, onPrint = null } = {}) {
    this.onTrace = onTrace;
    this.onPrint = onPrint;
    this.callDepth = 0;
    this.global = new Environment();
  }

  trace(event) {
    if (this.onTrace) this.onTrace({ ...event, depth: this.callDepth });
  }

  run(program) {
    this.execBlockBody(program.body, this.global);
  }

  execBlockBody(statements, env) {
    for (const stmt of statements) this.execStatement(stmt, env);
  }

  execStatement(node, env) {
    switch (node.type) {
      case 'LetStmt':
        env.define(node.name, this.evalExpr(node.value, env));
        return;
      case 'AssignStmt': {
        const value = this.evalExpr(node.value, env);
        try {
          env.set(node.name, value);
        } catch {
          throw new TwigError(`Undefined variable: ${node.name}`, node.line, node.col, 'runtime');
        }
        return;
      }
      case 'IfStmt': {
        const test = this.evalExpr(node.test, env);
        this.assertBoolean(test, node.test);
        if (test) this.execStatement(node.consequent, env);
        else if (node.alternate) this.execStatement(node.alternate, env);
        return;
      }
      case 'WhileStmt':
        for (;;) {
          const test = this.evalExpr(node.test, env);
          this.assertBoolean(test, node.test);
          if (!test) break;
          this.execStatement(node.body, env);
        }
        return;
      case 'FunctionDecl':
        env.define(node.name, new TwigFunction(node, env));
        return;
      case 'ReturnStmt':
        throw new ReturnSignal(node.value ? this.evalExpr(node.value, env) : null);
      case 'PrintStmt': {
        const value = this.evalExpr(node.value, env);
        if (this.onPrint) this.onPrint(this.stringify(value));
        return;
      }
      case 'ExprStmt':
        this.evalExpr(node.expr, env);
        return;
      case 'Block': {
        const blockEnv = new Environment(env);
        this.execBlockBody(node.body, blockEnv);
        return;
      }
      default:
        throw new Error(`Unknown statement type: ${node.type}`);
    }
  }

  assertBoolean(value, node) {
    if (typeof value !== 'boolean') {
      throw new TwigError(`Expected a boolean condition, got ${this.typeName(value)}`, node.line, node.col, 'runtime');
    }
  }

  assertNumbers(left, right, node) {
    if (typeof left !== 'number' || typeof right !== 'number') {
      throw new TwigError(`Expected numbers, got ${this.typeName(left)} and ${this.typeName(right)}`, node.line, node.col, 'runtime');
    }
  }

  typeName(value) {
    if (value === null) return 'null';
    if (value instanceof TwigFunction) return 'function';
    return typeof value;
  }

  stringify(value) {
    if (value === null) return 'null';
    if (value instanceof TwigFunction) return `<function ${value.decl.name}>`;
    return String(value);
  }

  evalExpr(node, env) {
    switch (node.type) {
      case 'NumberLit': return node.value;
      case 'StringLit': return node.value;
      case 'BoolLit': return node.value;
      case 'Identifier':
        try {
          return env.get(node.name);
        } catch {
          throw new TwigError(`Undefined variable: ${node.name}`, node.line, node.col, 'runtime');
        }
      case 'Unary': {
        const value = this.evalExpr(node.argument, env);
        if (node.op === '-') {
          if (typeof value !== 'number') throw new TwigError(`Cannot negate ${this.typeName(value)}`, node.line, node.col, 'runtime');
          return -value;
        }
        if (typeof value !== 'boolean') throw new TwigError(`Cannot apply ! to ${this.typeName(value)}`, node.line, node.col, 'runtime');
        return !value;
      }
      case 'Logical': {
        const left = this.evalExpr(node.left, env);
        this.assertBoolean(left, node.left);
        if (node.op === '&&' && !left) return false;
        if (node.op === '||' && left) return true;
        const right = this.evalExpr(node.right, env);
        this.assertBoolean(right, node.right);
        return right;
      }
      case 'Binary': return this.evalBinary(node, env);
      case 'Call': return this.evalCall(node, env);
      default:
        throw new Error(`Unknown expression type: ${node.type}`);
    }
  }

  evalBinary(node, env) {
    const left = this.evalExpr(node.left, env);
    const right = this.evalExpr(node.right, env);
    switch (node.op) {
      case '+':
        if (typeof left === 'number' && typeof right === 'number') return left + right;
        if (typeof left === 'string' && typeof right === 'string') return left + right;
        throw new TwigError(`Cannot apply + to ${this.typeName(left)} and ${this.typeName(right)}`, node.line, node.col, 'runtime');
      case '-': this.assertNumbers(left, right, node); return left - right;
      case '*': this.assertNumbers(left, right, node); return left * right;
      case '/':
        this.assertNumbers(left, right, node);
        if (right === 0) throw new TwigError('Division by zero', node.line, node.col, 'runtime');
        return left / right;
      case '%':
        this.assertNumbers(left, right, node);
        if (right === 0) throw new TwigError('Division by zero', node.line, node.col, 'runtime');
        return left % right;
      case '==': return left === right;
      case '!=': return left !== right;
      case '<': this.assertNumbers(left, right, node); return left < right;
      case '<=': this.assertNumbers(left, right, node); return left <= right;
      case '>': this.assertNumbers(left, right, node); return left > right;
      case '>=': this.assertNumbers(left, right, node); return left >= right;
      default:
        throw new Error(`Unknown binary operator: ${node.op}`);
    }
  }

  evalCall(node, env) {
    const callee = this.evalExpr(node.callee, env);
    const args = node.args.map((a) => this.evalExpr(a, env));
    if (!(callee instanceof TwigFunction)) {
      throw new TwigError(`TypeError: ${this.stringify(callee)} is not callable`, node.line, node.col, 'runtime');
    }
    return this.callFunction(callee, args, node);
  }

  callFunction(fn, args, callNode) {
    if (this.callDepth >= MAX_CALL_DEPTH) {
      throw new TwigError('Stack overflow: max call depth exceeded', callNode.line, callNode.col, 'runtime');
    }
    const callEnv = new Environment(fn.closure);
    fn.decl.params.forEach((param, i) => callEnv.define(param, args[i] !== undefined ? args[i] : null));
    this.callDepth++;
    this.trace({ kind: 'call', name: fn.decl.name, args });
    try {
      this.execBlockBody(fn.decl.body.body, callEnv);
      this.trace({ kind: 'return', name: fn.decl.name, value: null });
      return null;
    } catch (signal) {
      if (signal instanceof ReturnSignal) {
        this.trace({ kind: 'return', name: fn.decl.name, value: signal.value });
        return signal.value;
      }
      throw signal;
    } finally {
      this.callDepth--;
    }
  }
}
```

Then update the export line at the bottom of the script to:

```js
var Twig = { TwigError, Lexer, Parser, Environment, TwigFunction, Evaluator };
```

- [ ] **Step 4: Run the suite and verify it passes**

Run: `node --test tests/evaluator.test.mjs`
Expected: PASS — all 12 tests green.

- [ ] **Step 5: Run the full test suite to confirm no regressions**

Run: `node --test tests/`
Expected: PASS — lexer + parser + evaluator suites all green (31 tests total).

- [ ] **Step 6: Commit**

```bash
git add index.html tests/evaluator.test.mjs
git commit -m "Add Twig evaluator"
```

---

## Task 4: Playground UI

**Files:**
- Modify: `index.html` (add `<style>` block, add example-program constants and UI logic in a second `<script>` block after `twig-core`)

**Interfaces:**
- Consumes: `Twig.Lexer`, `Twig.Parser`, `Twig.Evaluator`, `Twig.TwigError` as browser globals (the `twig-core` script runs inline in the page, so `Twig` is already `window.Twig` — no import needed).
- Produces: nothing consumed by later code tasks. Task 5 (README/screenshot) interacts with this UI only through the browser, not through code.
- No automated tests for this task — DOM/UI correctness is verified manually in a real browser as part of Task 5's screenshot step (per the project's "test UI changes in a browser" requirement). This task's own verification step is a manual checklist (Step 3 below).

- [ ] **Step 1: Add the dark-theme layout CSS**

Insert this `<style>` block into `index.html`'s `<head>`, after the `<title>`:

```html
<style>
  :root {
    --bg: #1e1e2e;
    --panel: #262638;
    --border: #3a3a52;
    --text: #e4e4f0;
    --muted: #9090a8;
    --accent: #7aa2f7;
    --error-bg: #4a1d24;
    --error-border: #e06c75;
  }
  * { box-sizing: border-box; }
  html, body {
    margin: 0;
    height: 100%;
    background: var(--bg);
    color: var(--text);
    font-family: -apple-system, Segoe UI, Roboto, sans-serif;
  }
  .layout {
    display: flex;
    height: 100vh;
    gap: 1px;
    background: var(--border);
  }
  .pane {
    background: var(--bg);
    display: flex;
    flex-direction: column;
    flex: 1;
    min-width: 0;
  }
  .pane-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 12px;
    border-bottom: 1px solid var(--border);
  }
  select, button {
    background: var(--panel);
    color: var(--text);
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 6px 10px;
    font-size: 13px;
    cursor: pointer;
  }
  button.run { background: var(--accent); color: #10101a; font-weight: 600; border: none; }
  #editor {
    flex: 1;
    background: var(--bg);
    color: var(--text);
    border: none;
    outline: none;
    resize: none;
    font-family: 'SF Mono', Consolas, monospace;
    font-size: 14px;
    line-height: 1.5;
    padding: 12px;
  }
  .tabs {
    display: flex;
    border-bottom: 1px solid var(--border);
  }
  .tab {
    padding: 10px 16px;
    cursor: pointer;
    color: var(--muted);
    border-bottom: 2px solid transparent;
    font-size: 13px;
  }
  .tab.active { color: var(--text); border-bottom-color: var(--accent); }
  .tab-content {
    flex: 1;
    overflow: auto;
    padding: 12px;
    font-family: 'SF Mono', Consolas, monospace;
    font-size: 13px;
    white-space: pre-wrap;
    display: none;
  }
  .tab-content.active { display: block; }
  .error-banner {
    display: none;
    background: var(--error-bg);
    border-bottom: 1px solid var(--error-border);
    color: #ffb3ba;
    padding: 10px 12px;
    font-family: 'SF Mono', Consolas, monospace;
    font-size: 13px;
  }
  .error-banner.active { display: block; }
  .token { color: var(--accent); }
  .tree-indent { color: var(--muted); }
  .trace-line { white-space: pre; }
</style>
```

- [ ] **Step 2: Add example programs, the DOM body, and the UI script**

Replace `<body>...</body>` in `index.html` with:

```html
<body>
<script id="twig-core">
<!-- unchanged: Task 1-3 content stays here -->
</script>
<div class="layout">
  <div class="pane">
    <div class="pane-header">
      <select id="example-select"></select>
      <button class="run" id="run-btn">Run ▶</button>
    </div>
    <textarea id="editor" spellcheck="false"></textarea>
  </div>
  <div class="pane">
    <div class="error-banner" id="error-banner"></div>
    <div class="tabs">
      <div class="tab active" data-tab="tokens">Tokens</div>
      <div class="tab" data-tab="tree">Parse Tree</div>
      <div class="tab" data-tab="trace">Trace</div>
      <div class="tab" data-tab="output">Output</div>
    </div>
    <div class="tab-content active" id="tab-tokens"></div>
    <div class="tab-content" id="tab-tree"></div>
    <div class="tab-content" id="tab-trace"></div>
    <div class="tab-content" id="tab-output"></div>
  </div>
</div>
<script>
  const EXAMPLES = {
    'Fibonacci': `function fib(n) {
  if (n <= 1) { return n; }
  return fib(n - 1) + fib(n - 2);
}

print(fib(10));`,
    'Factorial': `function factorial(n) {
  if (n <= 1) { return 1; }
  return n * factorial(n - 1);
}

print(factorial(6));`,
    'FizzBuzz': `let i = 1;
while (i <= 15) {
  if (i % 15 == 0) { print("FizzBuzz"); }
  else if (i % 3 == 0) { print("Fizz"); }
  else if (i % 5 == 0) { print("Buzz"); }
  else { print(i); }
  i = i + 1;
}`,
    'Closures': `function makeCounter() {
  let count = 0;
  function increment() {
    count = count + 1;
    return count;
  }
  return increment;
}

let counter = makeCounter();
print(counter());
print(counter());
print(counter());`,
  };

  const editor = document.getElementById('editor');
  const exampleSelect = document.getElementById('example-select');
  const runBtn = document.getElementById('run-btn');
  const errorBanner = document.getElementById('error-banner');
  const tabTokens = document.getElementById('tab-tokens');
  const tabTree = document.getElementById('tab-tree');
  const tabTrace = document.getElementById('tab-trace');
  const tabOutput = document.getElementById('tab-output');

  for (const name of Object.keys(EXAMPLES)) {
    const opt = document.createElement('option');
    opt.value = name;
    opt.textContent = name;
    exampleSelect.appendChild(opt);
  }
  exampleSelect.addEventListener('change', () => {
    editor.value = EXAMPLES[exampleSelect.value];
  });
  exampleSelect.value = 'Fibonacci';
  editor.value = EXAMPLES.Fibonacci;

  document.querySelectorAll('.tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach((c) => c.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById(`tab-${tab.dataset.tab}`).classList.add('active');
    });
  });

  function renderTokens(tokens) {
    tabTokens.innerHTML = tokens
      .map((t) => `<span class="token">${t.type}</span> ${JSON.stringify(t.value)} <span class="tree-indent">(${t.line}:${t.col})</span>`)
      .join('\n');
  }

  function renderNode(node, depth) {
    const indent = '  '.repeat(depth);
    if (!node || typeof node !== 'object') return '';
    let out = `${indent}${node.type}\n`;
    for (const [key, value] of Object.entries(node)) {
      if (key === 'type' || key === 'line' || key === 'col') continue;
      if (Array.isArray(value)) {
        for (const item of value) out += renderNode(item, depth + 1);
      } else if (value && typeof value === 'object') {
        out += renderNode(value, depth + 1);
      } else if (value !== undefined) {
        out += `${indent}  ${key}: ${JSON.stringify(value)}\n`;
      }
    }
    return out;
  }

  function renderTree(program) {
    tabTree.textContent = renderNode(program, 0);
  }

  function renderTrace(events) {
    tabTrace.innerHTML = events
      .map((e) => {
        const indent = '  '.repeat(Math.max(e.depth - 1, 0));
        const line = e.kind === 'call'
          ? `${indent}call ${e.name}(${e.args.map((a) => JSON.stringify(a)).join(', ')})`
          : `${indent}return ${e.name} = ${JSON.stringify(e.value)}`;
        return `<div class="trace-line">${line}</div>`;
      })
      .join('');
  }

  function renderOutput(lines) {
    tabOutput.textContent = lines.join('\n');
  }

  function showError(err) {
    errorBanner.textContent = `[${err.phase}] ${err.message} (line ${err.line}, col ${err.col})`;
    errorBanner.classList.add('active');
  }

  function clearError() {
    errorBanner.classList.remove('active');
    errorBanner.textContent = '';
  }

  function run() {
    clearError();
    tabTokens.textContent = '';
    tabTree.textContent = '';
    tabTrace.innerHTML = '';
    tabOutput.textContent = '';

    const source = editor.value;
    let tokens;
    try {
      tokens = new Twig.Lexer(source).tokenize();
      renderTokens(tokens);
    } catch (err) {
      renderTokens([]);
      showError(err);
      return;
    }

    let ast;
    try {
      ast = new Twig.Parser(tokens).parseProgram();
      renderTree(ast);
    } catch (err) {
      showError(err);
      return;
    }

    const trace = [];
    const prints = [];
    const evaluator = new Twig.Evaluator({
      onTrace: (e) => trace.push(e),
      onPrint: (text) => prints.push(text),
    });
    try {
      evaluator.run(ast);
      renderTrace(trace);
      renderOutput(prints);
    } catch (err) {
      renderTrace(trace);
      renderOutput(prints);
      showError(err);
    }
  }

  runBtn.addEventListener('click', run);
  run();
</script>
</body>
```

(The `<!-- unchanged: Task 1-3 content stays here -->` line is a placeholder for *this instruction*, not for the file — when editing `index.html`, keep the existing Lexer/Parser/Evaluator code inside `<script id="twig-core">` exactly as Task 3 left it; only the HTML/CSS/second-script around it is new.)

- [ ] **Step 3: Manually verify in a real browser**

Run: `python -m http.server 8000` (or any static file server) from the repo root, then open `http://localhost:8000/` in a browser.

Verify by hand:
- Page loads with dark theme, Fibonacci example pre-loaded in the editor, Tokens tab populated automatically on load.
- Clicking Parse Tree / Trace / Output tabs switches panels and each shows content for the Fibonacci run (Trace shows nested `call fib(...)` / `return fib(...)` lines; Output shows `55`).
- Selecting "FizzBuzz" from the dropdown then clicking Run ▶ updates all four tabs and Output shows 15 lines ending in `13, 14, FizzBuzz`.
- Typing `print(1/0);` into the editor and clicking Run ▶ shows the red error banner with `[runtime] Division by zero (line 1, col 7)`, while the Tokens tab still shows the tokens for that line (partial-success display).
- Typing `function f() { let x = 1;` (no closing brace) and clicking Run ▶ shows a `[parse]` error banner.

Expected: all of the above hold true. If any fail, fix the UI code before proceeding — do not commit a broken playground.

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "Add playground UI"
```

---

## Task 5: README, LICENSE, and a real screenshot

**Files:**
- Create: `LICENSE`
- Create: `README.md`
- Create: `docs/screenshot.png` (captured from a real running browser, not mocked up)

**Interfaces:**
- Consumes: the running playground from Task 4, via browser automation — no code-level interface.
- Produces: `README.md` containing the exact placeholder string `https://YOUR-USERNAME.github.io/twig-interpreter/` for the GitHub Pages link. Task 6 finds and replaces this exact string — keep it verbatim so the find/replace in Task 6 is unambiguous.

- [ ] **Step 1: Write `LICENSE` (MIT)**

```
MIT License

Copyright (c) 2026 [your name]

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

Replace `[your name]` with the repo owner's actual name before committing.

- [ ] **Step 2: Capture a real screenshot of the Fibonacci example with the Trace tab open**

Use the `claude-in-chrome` skill (invoke it first, per its own instructions, before calling any of its browser tools) to:
1. Serve the repo locally (`python -m http.server 8000` from the repo root, or equivalent).
2. Open `http://localhost:8000/` in Chrome.
3. Confirm the "Fibonacci" example is selected (it's the default) and click "Run ▶".
4. Click the "Trace" tab so it's the active/visible panel.
5. Take a screenshot of the page.
6. Save it to `docs/screenshot.png` in the repo.

Expected: `docs/screenshot.png` exists, shows the dark-themed playground with the Fibonacci source in the editor on the left and the nested `call fib(...)` / `return fib(...)` trace log visible in the active Trace tab on the right.

- [ ] **Step 3: Write `README.md`**

```markdown
# Twig

Twig is a small interpreted language: a hand-written lexer, a recursive-descent
parser, and a tree-walking evaluator, wrapped in a single-file HTML/CSS/JS
playground (no build step) that shows tokens, parse tree, and execution trace
live as code runs.

**[Try it live](https://YOUR-USERNAME.github.io/twig-interpreter/)**

![Twig playground running the Fibonacci example with the Trace tab open](docs/screenshot.png)

## Language

- Types: numbers, strings, booleans, first-class functions
- `let x = expr;` declarations, `x = expr;` assignment
- `if (cond) { } else { }`, `while (cond) { }` — braces are mandatory, there is
  no bare single-statement form
- `function name(params) { ...; return expr; }` — functions are first-class
  values and close over the scope they were *defined* in (proper lexical
  scoping), not the scope they're called from
- Operators: `+ - * / %`, `== != < <= > >=`, `&& || !`
- `print(expr);` for output, `// comment` to end of line

**Design note:** `if`/`while` conditions must evaluate to an actual boolean.
`if (5) { }` is a runtime type error, not silently coerced — a deliberate
choice to avoid JS-style truthiness footguns.

## Architecture

```
source text -> Lexer -> tokens -> Parser (recursive descent) -> AST -> Evaluator (tree-walking) -> output
```

Everything — lexer, parser, evaluator, and the playground UI — lives in one
file, `index.html`. There's no build step and no external dependencies; open
the file (or serve it statically) and it runs.

## Error handling

Twig is built to fail predictably instead of crashing the browser tab:

| Case | Behavior |
|---|---|
| Division or modulo by zero | Runtime error: `Division by zero` |
| Deep/infinite recursion | Runtime error: `Stack overflow: max call depth exceeded` at a fixed depth of 200 — well below the point where the underlying JavaScript engine would throw its own native stack error |
| Unterminated block, string, or parenthesized expression | Parse or lex error naming what was expected and where |
| Calling a value that isn't a function | Runtime error: `TypeError: <value> is not callable` |
| Referencing an undefined variable | Runtime error: `Undefined variable: <name>` |

Every error carries a line and column and is caught before it reaches the
browser console — the playground shows it in a banner, along with whatever the
Tokens/Parse Tree/Trace tabs managed to produce before the failure.

## Running locally

```bash
python -m http.server 8000
# open http://localhost:8000/
```

## Tests

The lexer, parser, and evaluator have a Node-based unit test suite
(`node:test`, no dependencies, no build step — it extracts the same code that
ships in `index.html` and runs it in a sandbox):

```bash
node --test tests/
```

## License

MIT — see [LICENSE](LICENSE).
```

- [ ] **Step 4: Commit**

```bash
git add LICENSE README.md docs/screenshot.png
git commit -m "Add README, LICENSE, and screenshot"
```

---

## Task 6: Deploy to GitHub Pages and update the README link

This task pushes to a public GitHub remote and changes repo settings —
**confirm with the user before running any push or repo-creation command**,
even if earlier tasks in this plan were pre-approved.

**Files:**
- Modify: `README.md` (replace the placeholder Pages URL with the real one)

- [ ] **Step 1: Confirm remote details with the user**

Ask: GitHub username/org and desired repo name (default: `twig-interpreter`),
and whether to create the repo via `gh repo create` or push to one the user
already created.

- [ ] **Step 2: Create/attach the remote and push (confirm before running)**

```bash
gh repo create <owner>/<repo> --public --source=. --remote=origin
git push -u origin main
```

Expected: push succeeds; `git remote -v` shows `origin` pointing at
`https://github.com/<owner>/<repo>.git`.

- [ ] **Step 3: Enable GitHub Pages from the repo root on `main` (confirm before running)**

```bash
gh api repos/<owner>/<repo>/pages -X POST -f "source[branch]=main" -f "source[path]=/"
```

Expected: `201 Created`, or `409` if Pages is already enabled (harmless).

- [ ] **Step 4: Wait for the Pages build and verify the live URL**

Run: `gh api repos/<owner>/<repo>/pages` (repeat every ~30s until `status` is
`"built"`), then fetch `https://<owner>.github.io/<repo>/` and confirm it
returns the playground page (200 status, contains `<title>Twig Playground</title>`).

- [ ] **Step 5: Update `README.md`'s placeholder link**

Replace the exact string `https://YOUR-USERNAME.github.io/twig-interpreter/`
(both in the `[Try it live]` line) with the real URL from Step 4.

- [ ] **Step 6: Commit and push**

```bash
git add README.md
git commit -m "Update README with live GitHub Pages link"
git push
```

---

## Self-review notes

- **Spec coverage:** language spec (Task 1–3), interpreter architecture + all six edge cases (Task 3), playground UI/tabs/error banner/dark theme/examples (Task 4), repo layout incl. `docs/screenshot.png` and `LICENSE` (Task 5), GitHub Pages deploy + link update (Task 6) — all spec sections have a task.
- **Placeholder scan:** no TBD/TODO; the one literal `<!-- unchanged: ... -->` marker in Task 4 Step 2 is explicitly called out as an instruction-to-the-implementer, not file content, to avoid ambiguity.
- **Type consistency:** `Token`, AST node shapes, `TwigError`, trace `event` shape, and the `Twig` export object are defined once (Tasks 1–3) and referenced identically by name in every later task (UI in Task 4 uses `Twig.Lexer`/`Twig.Parser`/`Twig.Evaluator`/`Twig.TwigError` exactly as produced).
- **Commit granularity:** six commits — lexer, parser, evaluator, UI, README+LICENSE+screenshot, README link update — matches the user's explicit request for a believable incremental history.
