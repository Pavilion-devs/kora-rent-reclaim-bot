import * as winston from 'winston';
import * as path from 'path';
import * as fs from 'fs';
import { getConfig } from './config';

const { combine, timestamp, printf, colorize, align } = winston.format;

// Custom format for console output
const consoleFormat = printf(({ level, message, timestamp, ...meta }) => {
  const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
  return `${timestamp} [${level}]: ${message}${metaStr}`;
});

// Custom format for file output
const fileFormat = printf(({ level, message, timestamp, ...meta }) => {
  const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
  return `${timestamp} [${level.toUpperCase()}]: ${message}${metaStr}`;
});

let logger: winston.Logger | null = null;

/**
 * Creates and returns the logger instance
 */
export function createLogger(): winston.Logger {
  if (logger) {
    return logger;
  }

  const config = getConfig();

  // Ensure log directory exists
  if (config.logFilePath) {
    const logDir = path.dirname(config.logFilePath);
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
  }

  const transports: winston.transport[] = [
    // Console transport with colors
    new winston.transports.Console({
      format: combine(
        colorize({ all: true }),
        timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        align(),
        consoleFormat
      ),
    }),
  ];

  // File transport if path is configured
  if (config.logFilePath) {
    transports.push(
      new winston.transports.File({
        filename: config.logFilePath,
        format: combine(
          timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
          fileFormat
        ),
        maxsize: 5242880, // 5MB
        maxFiles: 5,
      })
    );

    // Separate error log file
    const errorLogPath = config.logFilePath.replace('.log', '-error.log');
    transports.push(
      new winston.transports.File({
        filename: errorLogPath,
        level: 'error',
        format: combine(
          timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
          fileFormat
        ),
        maxsize: 5242880,
        maxFiles: 5,
      })
    );
  }

  logger = winston.createLogger({
    level: config.logLevel,
    transports,
    exitOnError: false,
  });

  return logger;
}

/**
 * Gets the existing logger or creates a new one
 */
export function getLogger(): winston.Logger {
  return logger || createLogger();
}

/**
 * Log helper functions with context
 */
export const log = {
  debug: (message: string, meta?: Record<string, unknown>) => {
    getLogger().debug(message, meta);
  },
  info: (message: string, meta?: Record<string, unknown>) => {
    getLogger().info(message, meta);
  },
  warn: (message: string, meta?: Record<string, unknown>) => {
    getLogger().warn(message, meta);
  },
  error: (message: string, meta?: Record<string, unknown>) => {
    getLogger().error(message, meta);
  },
  
  // Specialized log functions
  discovery: (message: string, meta?: Record<string, unknown>) => {
    getLogger().info(`[DISCOVERY] ${message}`, meta);
  },
  monitor: (message: string, meta?: Record<string, unknown>) => {
    getLogger().info(`[MONITOR] ${message}`, meta);
  },
  reclaim: (message: string, meta?: Record<string, unknown>) => {
    getLogger().info(`[RECLAIM] ${message}`, meta);
  },
  transaction: (message: string, meta?: Record<string, unknown>) => {
    getLogger().info(`[TX] ${message}`, meta);
  },
  telegram: (message: string, meta?: Record<string, unknown>) => {
    getLogger().info(`[TELEGRAM] ${message}`, meta);
  },
  database: (message: string, meta?: Record<string, unknown>) => {
    getLogger().debug(`[DB] ${message}`, meta);
  },
};

export default log;
