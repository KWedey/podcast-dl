import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { onTestFinished } from 'vitest';

export type Handler = (req: IncomingMessage, res: ServerResponse) => void;

/** A local HTTP server standing in for podcast hosts. Closed when the current test finishes. */
export interface FixtureServer {
  url(path: string): string;
  /** Install or replace the handler for `path`. Unrouted paths get 404. */
  route(path: string, handler: Handler): void;
  isRouted(path: string): boolean;
  /** How many requests `path` has received. */
  hits(path: string): number;
  /** Paths in arrival order. */
  readonly requests: readonly string[];
}

async function listen(server: Server): Promise<number> {
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  onTestFinished(
    () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  );
  return (server.address() as AddressInfo).port;
}

export async function startFixtureServer(): Promise<FixtureServer> {
  const routes = new Map<string, Handler>();
  const requests: string[] = [];

  const port = await listen(
    createServer((req, res) => {
      const path = new URL(req.url ?? '/', 'http://fixture').pathname;
      requests.push(path);
      const handler = routes.get(path);
      if (handler) handler(req, res);
      else res.writeHead(404).end();
    }),
  );

  return {
    url: (path) => `http://127.0.0.1:${port}${path}`,
    route: (path, handler) => void routes.set(path, handler),
    isRouted: (path) => routes.has(path),
    hits: (path) => requests.filter((p) => p === path).length,
    requests,
  };
}

/**
 * A URL whose host drops every connection before answering. The port stays
 * held for the whole test, so no other server can take it over.
 */
export async function deadHostUrl(path: string): Promise<string> {
  const server = createServer();
  server.on('connection', (socket) => socket.destroy());
  return `http://127.0.0.1:${await listen(server)}${path}`;
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

export function redirect(location: string, code: 301 | 302 | 307 | 308 = 302): Handler {
  return (_req, res) => {
    res.writeHead(code, { Location: location }).end();
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
