#!/usr/bin/env node
import * as fs from "node:fs";
import * as path from "node:path";
import type { SourceFile } from "typescript/unstable/ast";
import { API, type Diagnostic, DiagnosticCategory, type Program } from "typescript/unstable/sync";

const cwd = process.cwd();
const isCI = process.env.GITHUB_ACTIONS === `true`;

/**
 * Colors are enabled for interactive terminals only, unless overridden.
 * NO_COLOR and FORCE_COLOR follow the de-facto standard of the ecosystem.
 */
const useColor = (() => {
  if (process.env.NO_COLOR) return false;
  if (process.env.FORCE_COLOR !== undefined) return process.env.FORCE_COLOR !== `0`;
  return Boolean(process.stdout.isTTY);
})();

const Style = {
  reset: `\x1b[0m`,
  red: `\x1b[91m`,
  yellow: `\x1b[93m`,
  cyan: `\x1b[96m`,
  grey: `\x1b[90m`,
} as const;

function color(style: string, text: string): string {
  return useColor ? `${style}${text}${Style.reset}` : text;
}

/** Parse --project flag, default to tsconfig.json */
const projectArgIndex = process.argv.indexOf(`--project`);
const tsconfigName = projectArgIndex !== -1 ? process.argv[projectArgIndex + 1] : `tsconfig.json`;

if (!tsconfigName) {
  console.error(`Missing value for --project`);
  process.exit(1);
}

/**
 * Resolve the tsconfig: an explicit path or directory wins, otherwise the
 * name is searched for in the current directory and its ancestors.
 */
function findConfigFile(name: string): string | undefined {
  const resolved = path.resolve(cwd, name);
  if (fs.existsSync(resolved)) {
    const stat = fs.statSync(resolved);
    return stat.isDirectory() ? path.join(resolved, `tsconfig.json`) : resolved;
  }

  const baseName = path.basename(name);
  let dir = cwd;
  while (true) {
    const candidate = path.join(dir, baseName);
    if (fs.existsSync(candidate)) return candidate;

    const parent = path.dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
}

const configPath = findConfigFile(tsconfigName);
if (!configPath) {
  console.error(`Could not find ${tsconfigName} in ${cwd}`);
  process.exit(1);
}

/**
 * The API spawns the native compiler as a child process, so it must be closed
 * explicitly or the process will not exit.
 */
const api = new API({ cwd });

function exit(code: number): never {
  api.close();
  process.exit(code);
}

const snapshot = api.updateSnapshot({ openProjects: [configPath] });
const project = snapshot.getProject(configPath);
if (!project) {
  console.error(`Could not load project from ${configPath}`);
  exit(1);
}

/**
 * Equivalent of the pre-emit diagnostics: everything that would be reported by
 * `tsc --noEmit`. Suggestions are deliberately excluded.
 */
const program = project.program;
const diagnostics = [
  ...program.getConfigFileParsingDiagnostics(),
  ...program.getProgramDiagnostics(),
  ...program.getGlobalDiagnostics(),
  ...program.getSyntacticDiagnostics(),
  ...program.getSemanticDiagnostics(),
];

/**
 * Filter: keep only diagnostics from files inside cwd.
 * Use cwd + path.sep to avoid /packages/api matching /packages/api-chat.
 * Diagnostics without a file (global/config errors) are always kept.
 */
const cwdPrefix = cwd + path.sep;
const filtered = diagnostics.filter((d) => {
  if (!d.fileName) return true;
  return path.resolve(d.fileName).startsWith(cwdPrefix);
});

const externalCount = diagnostics.length - filtered.length;

/** Flatten a diagnostic and its nested message chain into indented lines. */
function flattenMessage(diagnostic: Diagnostic, separator: string, depth = 0): string {
  const indent = separator === `\n` ? `  `.repeat(depth) : ``;
  const lines = [`${indent}${diagnostic.text}`];

  for (const child of diagnostic.messageChain ?? []) {
    lines.push(flattenMessage(child, separator, depth + 1));
  }

  return lines.join(separator);
}

function categoryName(category: DiagnosticCategory): string {
  switch (category) {
    case DiagnosticCategory.Error:
      return color(Style.red, `error`);
    case DiagnosticCategory.Warning:
      return color(Style.yellow, `warning`);
    case DiagnosticCategory.Suggestion:
      return color(Style.grey, `suggestion`);
    default:
      return color(Style.grey, `message`);
  }
}

/**
 * Render the offending source lines with a squiggly underline beneath the
 * span of the diagnostic, mirroring the compiler's own pretty output.
 */
function codeFrame(sourceFile: SourceFile, diagnostic: Diagnostic): string {
  const start = sourceFile.getLineAndCharacterOfPosition(diagnostic.pos);
  const end = sourceFile.getLineAndCharacterOfPosition(diagnostic.end);
  const lineStarts = sourceFile.getLineStarts();
  const gutterWidth = String(end.line + 1).length;

  const lines: Array<string> = [];
  for (let line = start.line; line <= end.line; line++) {
    const lineStart = lineStarts[line]!;
    const lineEnd = lineStarts[line + 1] ?? sourceFile.text.length;
    const text = sourceFile.text.slice(lineStart, lineEnd).trimEnd();

    const gutter = String(line + 1).padStart(gutterWidth, ` `);
    lines.push(`${color(Style.grey, gutter)} ${text}`);

    /** The squiggle spans the diagnostic only, so clamp it to this line. */
    const from = line === start.line ? start.character : 0;
    const to = line === end.line ? end.character : text.length;
    const width = Math.max(to - from, 1);

    lines.push(
      `${` `.repeat(gutterWidth)} ${` `.repeat(from)}${color(Style.red, `~`.repeat(width))}`,
    );
  }

  return lines.join(`\n`);
}

function formatDiagnostic(program: Program, diagnostic: Diagnostic): string {
  const message = flattenMessage(diagnostic, `\n`);
  const code = color(Style.grey, `TS${diagnostic.code}`);
  const header = `${categoryName(diagnostic.category)} ${code}: ${message}`;

  const sourceFile = diagnostic.fileName ? program.getSourceFile(diagnostic.fileName) : undefined;
  if (!sourceFile || !diagnostic.fileName) return header;

  const { line, character } = sourceFile.getLineAndCharacterOfPosition(diagnostic.pos);
  const relPath = path.relative(cwd, diagnostic.fileName);
  const location = `${color(Style.cyan, relPath)}:${color(Style.yellow, String(line + 1))}:${color(Style.yellow, String(character + 1))}`;

  return `${location} - ${header}\n\n${codeFrame(sourceFile, diagnostic)}\n`;
}

if (filtered.length > 0) {
  if (isCI) {
    for (const d of filtered) {
      const message = flattenMessage(d, ` `);
      const sourceFile = d.fileName ? program.getSourceFile(d.fileName) : undefined;

      if (sourceFile && d.fileName) {
        const { line, character } = sourceFile.getLineAndCharacterOfPosition(d.pos);
        const relPath = path.relative(cwd, d.fileName);
        console.log(
          `::error file=${relPath},line=${line + 1},col=${character + 1}::TS${d.code}: ${message}`,
        );
      } else {
        console.log(`::error ::TS${d.code}: ${message}`);
      }
    }
  }

  console.log(filtered.map((d) => formatDiagnostic(program, d)).join(`\n`));

  const parts = [`Found ${filtered.length} error(s)`];
  if (externalCount > 0) {
    parts.push(`(${externalCount} external error(s) filtered)`);
  }
  console.log(parts.join(` `));
  exit(1);
}

if (externalCount > 0) {
  console.log(
    `No errors in current package. ${externalCount} external error(s) filtered from dependencies.`,
  );
} else {
  console.log(`No errors found.`);
}

exit(0);
