import {
  format,
  createLogger,
  transports,
  Logger,
  level,
  debug,
} from "winston";
const { timestamp, colorize, printf, errors } = format;

const customFormat = format.combine(
  colorize(),
  timestamp({ format: "MM/DD HH:mm:ss" }),
  printf(({ level, message, timestamp, label }) => {
    const labelString = label ? ` [${label}] ` : "";
    return `${timestamp}${labelString} [${level}] ${message}`;
  }),
  errors({ stack: true }),
  format.metadata()
);

export default function buildDevLogger(): Logger {
  return createLogger({
    level: "debug",
    format: customFormat,
    defaultMeta: { service: "user-service" },
    transports: [new transports.Console()],
  });
}
