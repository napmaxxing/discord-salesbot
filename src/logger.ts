import chalk from "chalk";

// Ensure chalk color support
chalk.level = 2;

// Define log levels with numeric values (higher = more verbose)
enum LogLevel {
  NONE = 0, // No logging at all
  ERROR = 1, // Only errors
  WARNING = 2, // Errors and warnings
  SUCCESS = 3, // Errors, warnings, and success messages
  INFO = 4, // Standard information messages
  DEBUG = 5, // Verbose debug information
}

// Get current log level from environment variable (default to INFO)
const currentLevel = (() => {
  const envLevel = process.env.LOG_LEVEL?.toUpperCase();

  switch (envLevel) {
    case "NONE":
      return LogLevel.NONE;
    case "ERROR":
      return LogLevel.ERROR;
    case "WARNING":
      return LogLevel.WARNING;
    case "SUCCESS":
      return LogLevel.SUCCESS;
    case "INFO":
      return LogLevel.INFO;
    case "DEBUG":
      return LogLevel.DEBUG;
    default:
      return LogLevel.INFO;
  }
})();

const shouldLog = (level: LogLevel): boolean => level <= currentLevel;

// Helper to format any input for logging
const formatMessage = (...args: unknown[]): string => {
  return args
    .map((arg) => {
      if (arg === null) return "null";
      if (arg === undefined) return "undefined";
      if (arg instanceof Error) return arg.stack ?? arg.message;
      if (typeof arg === "object") {
        try {
          return JSON.stringify(arg, null, 2);
        } catch {
          return String(arg);
        }
      }
      return String(arg);
    })
    .join(" ");
};

const logger = {
  success: (...args: unknown[]) => {
    if (shouldLog(LogLevel.SUCCESS)) {
      console.log(chalk.green(`[SUCCESS] ${formatMessage(...args)}`));
    }
  },
  info: (...args: unknown[]) => {
    if (shouldLog(LogLevel.INFO)) {
      console.log(chalk.blue(`[INFO] ${formatMessage(...args)}`));
    }
  },
  warn: (...args: unknown[]) => {
    if (shouldLog(LogLevel.WARNING)) {
      console.log(chalk.yellow(`[WARNING] ${formatMessage(...args)}`));
    }
  },
  error: (...args: unknown[]) => {
    if (shouldLog(LogLevel.ERROR)) {
      console.log(chalk.red(`[ERROR] ${formatMessage(...args)}`));
    }
  },
  debug: (...args: unknown[]) => {
    if (shouldLog(LogLevel.DEBUG)) {
      console.log(chalk.cyan(`[DEBUG] ${formatMessage(...args)}`));
    }
  },
};

export default logger;
