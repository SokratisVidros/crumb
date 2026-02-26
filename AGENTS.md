# Agent Guide

## Project
- Runtime: Bun
- Language: TypeScript
- App type: Hono-based HTTP service

## Commands
- Install deps: `bun install`
- Run dev server: `bun run dev`
- Run tests: `bun test`
- Check types: `bun run typecheck`
- Lint: `bun run lint`
- Fix lint issues: `bun run lint:fix`
- Format code: `bun run format`
- Check formatting: `bun run format:check`
- Run lint + format checks: `bun run check`
- Auto-fix lint + formatting: `bun run check:fix`

## Working Rules
- Keep edits small and focused on the requested change.
- Preserve existing behavior unless the task explicitly asks to modify it.
- Before implementing custom logic, always evaluate trusted NPM libraries first.
  - Prefer mature, maintained packages with good adoption and recent activity.
  - Prefer packages that ship types or high-quality `@types`.
  - Prefer minimal, focused dependencies over large framework-like additions.
  - Build custom code only when no suitable trusted library exists.
- Enforce strict type safety:
  - Do not introduce `any` (including `as any`) in production code.
  - Prefer `unknown` + narrowing over unsafe casts.
  - Avoid non-null assertions (`!`) unless there is a proven invariant.
  - Model external input with runtime validation before trusting types.
  - Exhaustively handle unions/discriminated unions.
- Add or update tests when behavior changes.
- Do not commit or push unless explicitly requested.

## Validation
- After code changes, run `bun run check` and relevant tests.
- If tests are unavailable for touched logic, add targeted tests where practical.
