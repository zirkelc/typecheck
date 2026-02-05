# @zirkelc/typecheck

TypeScript type checker for monorepo packages. Runs `tsc --noEmit` using the TypeScript compiler API and filters out diagnostics from files outside the current package directory.

This solves the problem of [internal packages](https://turborepo.dev/docs/core-concepts/internal-packages) exporting raw `.ts` files:

> Errors in internal dependencies will be reported: When directly exporting TypeScript, type-checking in a dependent package will fail if code in an internal dependency has TypeScript errors. You may find this confusing or problematic in some situations.

## Install

```sh
pnpm add -D @zirkelc/typecheck
```

## Usage

Add a script to your monorepo packages `package.json`:

```json
{
  "scripts": {
    "typecheck": "typecheck"
  }
}
```

Then run in your monorepo packages:

```sh
# Uses tsconfig.json by default
pnpm typecheck

# Use a custom tsconfig
pnpm typecheck --project tsconfig.build.json
```

## How it works

1. Reads the `tsconfig.json` (or `--project` target) in `process.cwd()`
2. Creates a `ts.Program` and collects all diagnostics via `ts.getPreEmitDiagnostics()`
3. Filters diagnostics: only keeps errors where the source file is inside the current directory
4. Formats remaining errors with colors and code context using `ts.formatDiagnosticsWithColorAndContext()`
5. Exits with code 1 if local errors exist, 0 otherwise
