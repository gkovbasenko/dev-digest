/**
 * Logger for the MCP server. Writes ONLY to stderr — stdout is the stdio
 * protocol channel used to talk to the MCP client, and any stray write there
 * (e.g. an accidental `console.log`) corrupts the protocol stream. Never add
 * a stdout-writing path to this module.
 */

type Level = 'debug' | 'info' | 'warn' | 'error';

function write(level: Level, message: string, meta?: unknown): void {
  const line = `[${new Date().toISOString()}] [${level}] [devdigest-mcp] ${message}`;
  if (meta !== undefined) {
    process.stderr.write(`${line} ${safeStringify(meta)}\n`);
  } else {
    process.stderr.write(`${line}\n`);
  }
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export const log = {
  debug: (message: string, meta?: unknown) => write('debug', message, meta),
  info: (message: string, meta?: unknown) => write('info', message, meta),
  warn: (message: string, meta?: unknown) => write('warn', message, meta),
  error: (message: string, meta?: unknown) => write('error', message, meta),
};
