/**
 * Structured JSON logging. One JSON object per line so platform log collectors (Vercel, a log
 * drain, etc.) can parse and index every field — including the correlation id — without regex.
 * Edge-safe: only `console` + `Date`, no Node-only deps.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

/** Where a finished log line goes. Injectable so tests can capture output deterministically. */
export type LogSink = (level: LogLevel, line: string) => void;

export interface LoggerOptions {
  /** Minimum level to emit; defaults to LOG_LEVEL env or 'info'. */
  level?: LogLevel;
  /** Output sink; defaults to console (error/warn → stderr, else stdout). */
  sink?: LogSink;
  /** Clock, injectable for deterministic tests. */
  now?: () => string;
}

export type LogFields = Record<string, unknown>;

export interface Logger {
  debug(msg: string, fields?: LogFields): void;
  info(msg: string, fields?: LogFields): void;
  warn(msg: string, fields?: LogFields): void;
  error(msg: string, fields?: LogFields): void;
  /** A logger with additional permanent bindings (e.g. correlationId) merged into every line. */
  child(bindings: LogFields): Logger;
}

const REDACT_KEY = /(secret|password|token|authorization|api[-_]?key|cookie)/i;
const REDACTED = '[redacted]';

function redact(fields: LogFields): LogFields {
  const out: LogFields = {};
  for (const [k, v] of Object.entries(fields)) {
    out[k] = REDACT_KEY.test(k) ? REDACTED : v;
  }
  return out;
}

function defaultSink(level: LogLevel, line: string): void {
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

function envLevel(): LogLevel {
  const raw = typeof process !== 'undefined' ? process.env?.LOG_LEVEL : undefined;
  return raw && raw in LEVEL_ORDER ? (raw as LogLevel) : 'info';
}

/** Create a structured logger. `bindings` are merged into every line it emits. */
export function createLogger(bindings: LogFields = {}, options: LoggerOptions = {}): Logger {
  const minLevel = options.level ?? envLevel();
  const sink = options.sink ?? defaultSink;
  const now = options.now ?? (() => new Date().toISOString());
  const base = redact(bindings);

  function emit(level: LogLevel, msg: string, fields?: LogFields): void {
    if (LEVEL_ORDER[level] < LEVEL_ORDER[minLevel]) return;
    const record = { time: now(), level, msg, ...base, ...(fields ? redact(fields) : {}) };
    sink(level, JSON.stringify(record));
  }

  return {
    debug: (msg, fields) => emit('debug', msg, fields),
    info: (msg, fields) => emit('info', msg, fields),
    warn: (msg, fields) => emit('warn', msg, fields),
    error: (msg, fields) => emit('error', msg, fields),
    child: (extra) => createLogger({ ...base, ...extra }, { level: minLevel, sink, now }),
  };
}
