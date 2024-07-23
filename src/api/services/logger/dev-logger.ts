import { createLogger, format, transports, type Logger } from "winston";
const { timestamp, colorize, printf, errors } = format;

const customFormat = format.combine(
  colorize(),
  timestamp({ format: "HH:mm:ss" }),
  errors({ stack: true }), // Attach stack trace to errors
  printf(({ level, message, timestamp, stack }) => {
    let logMessage = `${timestamp} [${level}] ${message}`;
    if (stack) {
      logMessage += `\nStack Trace: ${stack}`; // Append stack trace if available
    }
    return logMessage;
  }),
  format.metadata(),
);

export default function buildDevLogger(): Logger {
  return createLogger({
    level: "debug",
    format: customFormat,
    defaultMeta: { service: "user-service" },
    transports: [new transports.Console()],
  });
}
