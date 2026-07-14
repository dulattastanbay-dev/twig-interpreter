# Twig — Design Spec

Date: 2026-07-14
Status: Approved (pending final user pass)

## Purpose

Twig is a small interpreted language built as a university CS admissions
portfolio piece (targeting HKU/HKUST/CUHK). It consists of a hand-written
lexer, a recursive-descent parser, and a tree-walking evaluator, wrapped in
a single-file HTML/CSS/JS playground (no build step) that visualizes tokens,
parse tree, and execution trace live as code runs.

## Language spec

**Types:** numbers (JS double-precision floats), strings (double-quoted,
supports `\n \t \" \\` escapes), booleans (`true` / `false`), functions
(first-class values).

**Declarations & assignment:**
- `let x = expr;` — declare and initialize a variable
- `x = expr;` — reassign an existing variable

**Control flow:**
- `if (cond) { ... } else { ... }` — `else` optional
- `while (cond) { ... }`

**Functions:**
- `function name(params) { ...; return expr; }`
- First-class: can be assigned to variables, passed as arguments, returned
  from other functions
- **Closures**: a function captures the environment in which it was
  *defined*, not the environment it's called from (proper lexical scoping,
  implemented via a chained `Environment` whose parent pointer is set at
  function-definition time)

**Operators:**
- Arithmetic: `+ - * / %` (unary `-` also supported)
- Comparison: `== != < <= > >=`
- Logical: `&& || !`

**Output:** `print(expr);`

**Comments:** `// comment` to end of line

**Semantics note — no truthy/falsy coercion:** `if`/`while` conditions must
evaluate to an actual boolean value. A non-boolean condition (e.g.
`if (5) { }`) is a runtime type error, not silently coerced. This is a
deliberate design choice to avoid JS-style truthiness footguns, and is
called out in the README as an intentional decision.

## Interpreter architecture

Pipeline: **source text → Lexer → tokens → Parser (recursive descent) →
AST → Evaluator (tree-walking) → result / side effects (print output)**.

- **Lexer**: hand-written, produces a flat token stream with
  `{type, value, line, col}` per token. Tracks line/column for error
  reporting.
- **Parser**: recursive-descent, one function per grammar rule (standard
  Pratt-style precedence climbing for expressions). Produces an AST of
  plain JS objects tagged with a `type` field.
- **Evaluator**: tree-walking, dispatches on AST node `type`. Uses a chained
  `Environment` class (`{vars: Map, parent: Environment|null}`) for scoping.
  Function values close over the `Environment` active at their definition
  site.

### Required edge-case handling

These are explicit requirements, not afterthoughts — they're the concrete
answer to "what should be handled before this goes in front of an
admissions committee":

| Case | Behavior |
|---|---|
| Division or modulo by zero | Runtime error: `"Division by zero"` — not `Infinity`/`NaN` |
| Deep recursion | Evaluator tracks call depth explicitly; raises `"Stack overflow: max call depth exceeded"` at a fixed limit (1000) *before* the underlying JS engine throws a native `RangeError` |
| Unterminated block/paren/string | Parser (or lexer, for strings) detects EOF while a token was expected and raises a parse error naming what was expected and where |
| Calling a non-function | Runtime type check before invocation: `"TypeError: <value> is not callable"` |
| Undefined variable reference | Runtime error: `"Undefined variable: x"` — not silent `undefined` |
| Redeclaring a variable in the same scope with `let` | Allowed (rebinds); documented as intentional, not an oversight |

All three error classes (lex, parse, runtime) carry line/column info and
are caught at the top level of the "Run" action — they never throw
uncaught exceptions into the browser console during normal use.

## Playground UI

Single `index.html`. Dark, dev-tool visual theme (monospace fonts,
syntax-colored token/tree output), side-by-side layout:

- **Left half:** example-program dropdown, `<textarea>` code editor (plain,
  no external editor library — keeps the "single file, zero dependencies"
  property honest), Run button.
- **Right half:** tab bar — **Tokens / Parse Tree / Trace / Output** — with
  content panel below. An error banner appears above the tabs when a run
  fails, showing the error message with line/col; the tabs still show
  whatever each stage produced successfully before the failure (e.g. a
  parse error still leaves the Tokens tab populated).

**Trace tab content:** one line per evaluation step (function calls,
returns, key expression evaluations), indented by call depth, so recursion
is visually legible as a nested log — e.g.:
```
call fib(5)
  call fib(4)
    call fib(3)
    ...
  return fib(4) = 3
return fib(5) = 5
```

**Example presets** (four programs, each exercising a distinct capability):
1. **Fibonacci** (recursive) — used for the README screenshot, Trace tab open
2. **Factorial** (recursive) — simple recursion baseline
3. **FizzBuzz** (`while` + `if` + modulo)
4. **Closures demo** (counter via a returned function) — exercises
   first-class functions / lexical scoping

## Repo layout

GitHub Pages serves from the repo root on `main`.

```
twig-interpreter/
├── index.html          # lexer + parser + evaluator + playground UI, single file
├── README.md
├── LICENSE              # MIT
├── .gitignore
└── docs/
    └── screenshot.png   # referenced by README; not served by Pages
```

## Out of scope (for this spec)

- Arrays/lists, for-each loops, other collection types
- A real code-editor widget (syntax highlighting, bracket matching) beyond
  a plain textarea
- Module system / multi-file Twig programs
- Persisting playground state (localStorage, shareable URLs)

## Open follow-up (not part of this design, tracked separately)

- Commit history shape (lexer → parser → evaluator → UI → README, as
  separate believable commits) is a delivery concern, not a design
  concern — handled in the implementation plan.
