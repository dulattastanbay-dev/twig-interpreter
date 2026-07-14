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
