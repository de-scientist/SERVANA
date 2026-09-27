import { ConsoleLogger, Injectable, LoggerService, LogLevel } from '@nestjs/common';

@Injectable()
export class AppLoggerService extends ConsoleLogger implements LoggerService {
  private readonly minLevel: LogLevel;

  private readonly order: Record<LogLevel, number> = {
    verbose: 0,
    debug: 1,
    log: 2,
    warn: 3,
    error: 4,
    fatal: 5,
  };

  constructor(context = 'SERVANA', level: LogLevel = 'log') {
    super(context);
    this.minLevel = (process.env.LOG_LEVEL as LogLevel) || level;
  }

  private enabled(level: LogLevel): boolean {
    return this.order[level] >= this.order[this.minLevel];
  }

  private emit(level: LogLevel, message: unknown, context?: string, stack?: string): void {
    // Production: single-line JSON for log collectors (Datadog/Logtail/etc).
    // Never attach secrets/PII here — callers must redact before logging.
    if (process.env.NODE_ENV === 'production') {
      const line = JSON.stringify({
        level,
        time: new Date().toISOString(),
        context: context ?? this.context,
        msg: typeof message === 'string' ? message : this.fmt(message),
        ...(stack ? { stack } : {}),
      });
      // eslint-disable-next-line no-console
      console.log(line);
      return;
    }
    if (level === 'warn') super.warn(this.fmt(message), context);
    else if (level === 'error' || level === 'fatal') super.error(this.fmt(message), stack, context);
    else if (level === 'debug') super.debug(this.fmt(message), context);
    else if (level === 'verbose') super.verbose(this.fmt(message), context);
    else super.log(this.fmt(message), context);
  }

  log(message: unknown, context?: string): void {
    if (this.enabled('log')) this.emit('log', message, context);
  }

  warn(message: unknown, context?: string): void {
    if (this.enabled('warn')) this.emit('warn', message, context);
  }

  error(message: unknown, stack?: string, context?: string): void {
    if (this.enabled('error')) this.emit('error', message, context, stack);
  }

  debug(message: unknown, context?: string): void {
    if (this.enabled('debug')) this.emit('debug', message, context);
  }

  verbose(message: unknown, context?: string): void {
    if (this.enabled('verbose')) this.emit('verbose', message, context);
  }

  private fmt(message: unknown): string {
    if (typeof message === 'string') return message;
    try {
      return JSON.stringify(message);
    } catch {
      return String(message);
    }
  }
}
