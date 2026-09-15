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

  log(message: unknown, context?: string): void {
    if (this.enabled('log')) super.log(this.fmt(message), context);
  }

  warn(message: unknown, context?: string): void {
    if (this.enabled('warn')) super.warn(this.fmt(message), context);
  }

  error(message: unknown, stack?: string, context?: string): void {
    if (this.enabled('error')) super.error(this.fmt(message), stack, context);
  }

  debug(message: unknown, context?: string): void {
    if (this.enabled('debug')) super.debug(this.fmt(message), context);
  }

  verbose(message: unknown, context?: string): void {
    if (this.enabled('verbose')) super.verbose(this.fmt(message), context);
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
