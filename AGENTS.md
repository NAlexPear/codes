# Engineering guardrails

- Target Node.js 24 or newer and pnpm.
- Run TypeScript directly with Node's native type stripping. Keep source syntax
  compatible with `erasableSyntaxOnly`; do not add a transpilation step.
- Unit tests must use `node:test` and `node:assert/strict`. Do not add
  third-party test frameworks or assertion libraries.
- Run `pnpm check` before considering a code change complete.
