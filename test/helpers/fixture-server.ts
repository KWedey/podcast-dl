import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { onTestFinished } from 'vitest';

export type Handler = (req: IncomingMessage, res: ServerResponse) => void;

/** A local HTTP server standing in for podcast hosts. Closed when the current test finishes. */
export interface FixtureServer {
  url(path: string): string;
  /** Install or replace the handler for `path`. Unrouted paths get 404. */
  route(path: string, handler: Handler): void;
  /** How many requests `path` has received. */
  hits(path: string): number;
  /** Paths in arrival order. */
  readonly requests: readonly string[];
}

export async function startFixtureServer(): Promise<FixtureServer> {
  const routes = new Map<string, Handler>();
  const requests: string[] = [];

  const server = createServer((req, res) => {
    const path = new URL(req.url ?? '/', 'http://fixture').pathname;
    requests.push(path);
    const handler = routes.get(path);
    if (handler) handler(req, res);
    else res.writeHead(404).end();
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;

  onTestFinished(
    () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  );

  return {
    url: (path) => `http://127.0.0.1:${port}${path}`,
    route: (path, handler) => void routes.set(path, handler),
    hits: (path) => requests.filter((p) => p === path).length,
    requests,
  };
}

/** A URL on a port nothing is listening on: the connection is refused. */
export async function unreachableUrl(path: string): Promise<string> {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return `http://127.0.0.1:${port}${path}`;
}

export function xml(body: string): Handler {
  return (_req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/rss+xml; charset=utf-8' }).end(body);
  };
}

export function html(body: string): Handler {
  return (_req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(body);
  };
}

export function audio(body: Buffer): Handler {
  return (_req, res) => {
    res.writeHead(200, { 'Content-Type': 'audio/mpeg', 'Content-Length': body.length }).end(body);
  };
}

export function status(code: number): Handler {
  return (_req, res) => {
    res.writeHead(code).end();
  };
}

/**
 * Promise the full body, send the first `sentBytes`, then cut the connection:
 * the client sees a truncated download, not an HTTP error.
 */
export function dropMidStream(body: Buffer, sentBytes: number): Handler {
  return (_req, res) => {
    res.writeHead(200, { 'Content-Type': 'audio/mpeg', 'Content-Length': body.length });
    res.write(body.subarray(0, sentBytes), () => res.destroy());
  };
}

/**
 * Promise the full body, send the first `sentBytes`, then hold the connection open.
 * `sent` resolves once those bytes are flushed; `finish()` sends the rest.
 */
export function stallMidStream(body: Buffer, sentBytes: number) {
  let markSent!: () => void;
  const sent = new Promise<void>((resolve) => (markSent = resolve));
  let finish = (): void => {
    throw new Error('stallMidStream: finish() called before the request arrived');
  };
  const handler: Handler = (_req, res) => {
    res.writeHead(200, { 'Content-Type': 'audio/mpeg', 'Content-Length': body.length });
    finish = () => void res.end(body.subarray(sentBytes));
    res.write(body.subarray(0, sentBytes), () => markSent());
  };
  return { handler, sent, finish: () => finish() };
}

/** Use each handler for one request in turn; the last one answers every request after that. */
export function sequence(...handlers: Handler[]): Handler {
  let calls = 0;
  return (req, res) => handlers[Math.min(calls++, handlers.length - 1)](req, res);
}
