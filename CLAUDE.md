# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

TypeScript type checker for monorepo packages. Runs `tsc --noEmit` using the TypeScript compiler API and filters out diagnostics from files outside the current package directory. Solves the problem of internal packages exporting raw `.ts` files where errors in dependencies get reported in the consuming package.

## Commands

```sh
pnpm build      # Build with tsdown → dist/typecheck.mjs
pnpm test       # Run tests with vitest
pnpm lint       # Run biome with auto-fix
```

## Architecture

Single-file CLI tool (`src/typecheck.ts`) that:
1. Parses `--project` flag (defaults to `tsconfig.json`)
2. Uses `ts.findConfigFile()` and `ts.parseJsonConfigFileContent()` to read tsconfig
3. Creates `ts.Program` and gets diagnostics via `ts.getPreEmitDiagnostics()`
4. Filters diagnostics by checking if file path starts with `cwd + path.sep`
5. Formats output with `ts.formatDiagnosticsWithColorAndContext()`
6. Supports GitHub Actions annotation format (`::error file=...`)
7. Exits 1 on errors, 0 on success

## Tooling

- **Package manager:** pnpm
- **Bundler:** tsdown
- **Testing:** vitest
- **Linter/Formatter:** oxlint and oxfmt
