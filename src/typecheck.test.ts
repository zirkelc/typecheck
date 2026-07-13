import { execSync, type ExecSyncOptionsWithStringEncoding } from "node:child_process";
import * as path from "node:path";
import { describe, expect, test } from "vitest";

const cliPath = path.resolve(import.meta.dirname, `../dist/typecheck.mjs`);
const fixturesPath = path.resolve(import.meta.dirname, `../test/fixtures`);

/**
 * GITHUB_ACTIONS is cleared so that the tests behave the same whether or not they
 * themselves run on CI. Tests that exercise the annotation output opt back in.
 */
const execOptions: ExecSyncOptionsWithStringEncoding = {
  encoding: `utf-8`,
  env: { ...process.env, FORCE_COLOR: `0`, GITHUB_ACTIONS: `` },
};

function runTypecheck(
  cwd: string,
  args: Array<string> = [],
  env: NodeJS.ProcessEnv = {},
): { stdout: string; exitCode: number } {
  try {
    const stdout = execSync([`node`, cliPath, ...args].join(` `), {
      ...execOptions,
      env: { ...execOptions.env, ...env },
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

  test(`should print a code frame with the error location`, () => {
    // Arrange
    const cwd = path.join(fixturesPath, `errors`);

    // Act
    const result = runTypecheck(cwd);

    // Assert
    expect(result.stdout).toContain(
      `index.ts:1:7 - error TS2322: Type 'number' is not assignable to type 'string'.`,
    );
    expect(result.stdout).toContain(`1 const message: string = 123;`);
    expect(result.stdout).toContain(`~~~~~~~`);
  });

  test(`should emit GitHub Actions annotations on CI`, () => {
    // Arrange
    const cwd = path.join(fixturesPath, `errors`);

    // Act
    const result = runTypecheck(cwd, [], { GITHUB_ACTIONS: `true` });

    // Assert
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain(
      `::error file=index.ts,line=1,col=7::TS2322: Type 'number' is not assignable to type 'string'.`,
    );
  });

  test(`should not emit GitHub Actions annotations outside CI`, () => {
    // Arrange
    const cwd = path.join(fixturesPath, `errors`);

    // Act
    const result = runTypecheck(cwd);

    // Assert
    expect(result.exitCode).toBe(1);
    expect(result.stdout).not.toContain(`::error`);
  });
});
