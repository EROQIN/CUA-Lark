export class Logger {
  info(message: string, meta?: Record<string, unknown>): void {
    this.log("INFO", message, meta);
  }

  warn(message: string, meta?: Record<string, unknown>): void {
    this.log("WARN", message, meta);
  }

  error(message: string, meta?: Record<string, unknown>): void {
    this.log("ERROR", message, meta);
  }

  private log(level: string, message: string, meta?: Record<string, unknown>): void {
    const suffix = meta ? ` ${JSON.stringify(meta)}` : "";
    console.log(`[${new Date().toISOString()}] ${level} ${message}${suffix}`);
  }
}

export const logger = new Logger();
