#!/usr/bin/env node
import * as path from 'node:path';
import * as ts from 'typescript';

const cwd = process.cwd();
const isCI = process.env.GITHUB_ACTIONS === `true`;

const formatHost: ts.FormatDiagnosticsHost = {
  getCanonicalFileName: (f) => f,
  getCurrentDirectory: () => cwd,
  getNewLine: () => ts.sys.newLine,
};

/** Parse --project flag, default to tsconfig.json */
const projectArgIndex = process.argv.indexOf(`--project`);
const tsconfigName =
  projectArgIndex !== -1 ? process.argv[projectArgIndex + 1] : `tsconfig.json`;

/** Find and parse tsconfig */
const configPath = ts.findConfigFile(cwd, ts.sys.fileExists, tsconfigName);
if (!configPath) {
  console.error(`Could not find ${tsconfigName} in ${cwd}`);
  process.exit(1);
}

const configFile = ts.readConfigFile(configPath, ts.sys.readFile);
if (configFile.error) {
  console.error(
    ts.formatDiagnosticsWithColorAndContext([configFile.error], formatHost),
  );
  process.exit(1);
}

const parsed = ts.parseJsonConfigFileContent(configFile.config, ts.sys, cwd);

/** Create program and collect diagnostics */
const program = ts.createProgram(parsed.fileNames, parsed.options);
const diagnostics = ts.getPreEmitDiagnostics(program);

/**
 * Filter: keep only diagnostics from files inside cwd.
 * Use cwd + path.sep to avoid /packages/api matching /packages/api-chat.
 * Diagnostics without a file (global/config errors) are always kept.
 */
const cwdPrefix = cwd + path.sep;
const filtered = diagnostics.filter((d) => {
  if (!d.file) return true;
  return path.resolve(d.file.fileName).startsWith(cwdPrefix);
});

const externalCount = diagnostics.length - filtered.length;

if (filtered.length > 0) {
  if (isCI) {
    for (const d of filtered) {
      const message = ts.flattenDiagnosticMessageText(d.messageText, ` `);
      if (d.file && d.start !== undefined) {
        const { line, character } = d.file.getLineAndCharacterOfPosition(
          d.start,
        );
        const relPath = path.relative(cwd, d.file.fileName);
        console.log(
          `::error file=${relPath},line=${line + 1},col=${character + 1}::TS${d.code}: ${message}`,
        );
      } else {
        console.log(`::error ::TS${d.code}: ${message}`);
      }
    }
  }

  console.log(ts.formatDiagnosticsWithColorAndContext(filtered, formatHost));

  const parts = [`Found ${filtered.length} error(s)`];
  if (externalCount > 0) {
    parts.push(`(${externalCount} external error(s) filtered)`);
  }
  console.log(parts.join(` `));
  process.exit(1);
}

if (externalCount > 0) {
  console.log(
    `No errors in current package. ${externalCount} external error(s) filtered from dependencies.`,
  );
} else {
  console.log(`No errors found.`);
}
