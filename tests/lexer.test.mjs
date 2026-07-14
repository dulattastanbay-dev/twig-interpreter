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
