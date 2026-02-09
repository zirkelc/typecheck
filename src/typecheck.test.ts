import { execSync, type ExecSyncOptionsWithStringEncoding } from "node:child_process";
import * as path from "node:path";
import { describe, expect, test } from "vitest";

const cliPath = path.resolve(import.meta.dirname, `../dist/typecheck.mjs`);
const fixturesPath = path.resolve(import.meta.dirname, `../test/fixtures`);

const execOptions: ExecSyncOptionsWithStringEncoding = {
  encoding: `utf-8`,
  env: { ...process.env, FORCE_COLOR: `0` },
};

function runTypecheck(cwd: string, args: Array<string> = []): { stdout: string; exitCode: number } {
  try {
    const stdout = execSync([`node`, cliPath, ...args].join(` `), {
      ...execOptions,
      cwd,
    });
    return { stdout, exitCode: 0 };
  } catch (error) {
    const e = error as { stdout: string; status: number };
    return { stdout: e.stdout, exitCode: e.status };
  }
}

describe(`typecheck`, () => {
  test(`should exit 0 for valid project`, () => {
    // Arrange
    const cwd = path.join(fixturesPath, `valid`);

    // Act
    const result = runTypecheck(cwd);

    // Assert
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain(`No errors found`);
  });

  test(`should exit 1 for project with errors`, () => {
    // Arrange
    const cwd = path.join(fixturesPath, `errors`);

    // Act
    const result = runTypecheck(cwd);

    // Assert
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain(`Found 2 error(s)`);
  });

  test(`should support --project flag`, () => {
    // Arrange
    const cwd = path.join(fixturesPath, `valid`);

    // Act
    const result = runTypecheck(cwd, [`--project`, `tsconfig.json`]);

    // Assert
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain(`No errors found`);
  });

  test(`should filter out errors from external dependencies`, () => {
    // Arrange
    const cwd = path.join(fixturesPath, `external-errors/package`);

    // Act
    const result = runTypecheck(cwd);

    // Assert
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain(`1 external error(s) filtered`);
  });
});
