import { spawn, type ChildProcess } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const CLI_ENTRY = fileURLToPath(new URL('../../src/cli.ts', import.meta.url));
const TSX_LOADER = pathToFileURL(createRequire(import.meta.url).resolve('tsx')).href;

export interface CliResult {
  code: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
}

export interface CliProcess {
  child: ChildProcess;
  done: Promise<CliResult>;
}

/**
 * Start the real CLI as a separate process with `cwd` as its project directory,
 * which is where it keeps data/ and downloads/.
 */
export function startCli(args: string[], cwd: string): CliProcess {
  const child = spawn(process.execPath, ['--import', TSX_LOADER, CLI_ENTRY, ...args], {
    cwd,
    // picocolors enables colour whenever CI is set; assertions need plain text.
    env: { ...process.env, NO_COLOR: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let stdout = '';
  let stderr = '';
  child.stdout!.setEncoding('utf8').on('data', (chunk: string) => (stdout += chunk));
  child.stderr!.setEncoding('utf8').on('data', (chunk: string) => (stderr += chunk));

  const done = new Promise<CliResult>((resolve, reject) => {
    child.once('error', reject);
    child.once('close', (code, signal) => resolve({ code, signal, stdout, stderr }));
  });
  return { child, done };
}

export function runCli(args: string[], cwd: string): Promise<CliResult> {
  return startCli(args, cwd).done;
}
