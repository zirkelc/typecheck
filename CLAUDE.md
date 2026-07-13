# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

TypeScript type checker for monorepo packages. Runs `tsc --noEmit` using the TypeScript compiler API and filters out diagnostics from files outside the current package directory. Solves the problem of internal packages exporting raw `.ts` files where errors in dependencies get reported in the consuming package.

## Commands

```sh
pnpm build      # Build with tsdown → dist/typecheck.mjs
pnpm typecheck  # Type-check with tsc --noEmit
pnpm test       # Run tests with vitest
pnpm lint       # Run oxlint with auto-fix
pnpm format     # Format with oxfmt
```

## Architecture

Single-file CLI tool (`src/typecheck.ts`) that:

1. Parses `--project` flag (defaults to `tsconfig.json`), resolving it against cwd and then searching ancestor directories
2. Opens the project with the TypeScript 7 API (`new API()` → `updateSnapshot()` → `getProject()`)
3. Collects config/program/global/syntactic/semantic diagnostics from `project.program` (the equivalent of the old `getPreEmitDiagnostics`; suggestions are excluded)
4. Filters diagnostics by checking if file path starts with `cwd + path.sep`
5. Formats output with a hand-rolled code frame (TS7 has no `formatDiagnosticsWithColorAndContext`)
6. Supports GitHub Actions annotation format (`::error file=...`), flattening message chains onto one line
7. Exits 1 on errors, 0 on success

### TypeScript 7 notes

TypeScript 7 is the native (Go) compiler. It has **no `ts.createProgram`-style API**; the
compiler runs as a child process driven over IPC via `typescript/unstable/sync`:

- `Diagnostic` is a plain object (`fileName`, `pos`, `end`, `code`, `category`, `text`), not a
  `ts.Diagnostic`. Nested messages live in `messageChain`.
- Positions are offsets. Use `SourceFile.getLineAndCharacterOfPosition()` to map them, and
  `SourceFile.text` for the source.
- `api.close()` must be called or the child process keeps the CLI alive.
- The `unstable/` export path is not covered by TypeScript's stability guarantees, so minor
  TypeScript releases may break it.

## Tooling

- **Package manager:** pnpm
- **Bundler:** tsdown
- **Testing:** vitest
- **Linter/Formatter:** oxlint and oxfmt
