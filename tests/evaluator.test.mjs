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
