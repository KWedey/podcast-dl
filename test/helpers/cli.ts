import { spawn, type ChildProcess } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { expect, onTestFinished } from 'vitest';

const CLI_ENTRY = new URL('../../src/cli.ts', import.meta.url);
const TSCONFIG = fileURLToPath(new URL('../../tsconfig.json', import.meta.url));
const TSX_LOADER = pathToFileURL(createRequire(import.meta.url).resolve('tsx')).href;

export interface ProcessResult {
  code: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
}

export interface RunningProcess {
  child: ChildProcess;
  done: Promise<ProcessResult>;
}

/**
 * Run a TypeScript entry point in its own Node process. A process still
 * running when the test finishes is killed before the test's other cleanup.
 */
export function startTypeScript(
  entry: URL,
  args: string[],
  cwd: string,
  env: NodeJS.ProcessEnv = {},
): RunningProcess {
  const child = spawn(
    process.execPath,
    // tsx's loader trips DEP0205 on Node 26: harness noise, not program output.
    ['--disable-warning=DEP0205', '--import', TSX_LOADER, fileURLToPath(entry), ...args],
    {
      cwd,
      env: {
        ...process.env,
        // picocolors enables colour whenever CI is set; assertions need plain text.
        NO_COLOR: '1',
        // tsx would otherwise look for a tsconfig upward from the temp cwd.
        TSX_TSCONFIG_PATH: TSCONFIG,
        ...env,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );

  let stdout = '';
  let stderr = '';
  child.stdout!.setEncoding('utf8').on('data', (chunk: string) => (stdout += chunk));
  child.stderr!.setEncoding('utf8').on('data', (chunk: string) => (stderr += chunk));

  const done = new Promise<ProcessResult>((resolve, reject) => {
    child.once('error', reject);
    child.once('close', (code, signal) => resolve({ code, signal, stdout, stderr }));
  });

  onTestFinished(async () => {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    await done.catch(() => {});
  });

  return { child, done };
}

export function runTypeScript(
  entry: URL,
  args: string[],
  cwd: string,
  env?: NodeJS.ProcessEnv,
): Promise<ProcessResult> {
  return startTypeScript(entry, args, cwd, env).done;
}

/** Start the real CLI with `cwd` as its project directory, where it keeps data/ and downloads/. */
export function startCli(args: string[], cwd: string, env?: NodeJS.ProcessEnv): RunningProcess {
  return startTypeScript(CLI_ENTRY, args, cwd, env);
}

export function runCli(args: string[], cwd: string, env?: NodeJS.ProcessEnv): Promise<ProcessResult> {
  return startCli(args, cwd, env).done;
}

/** Exit code 0 and nothing at all on stderr. */
export function expectSuccess(result: ProcessResult): void {
  expect(result.code, result.stderr).toBe(0);
  expect(result.stderr).toBe('');
}
