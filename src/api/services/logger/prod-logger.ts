import { createLogger, format, transports } from "winston";
import "winston-mongodb";

import { env } from "../../../env.js";

const { timestamp, errors } = format;

const customConsoleFormat = format.combine(
  errors({ stack: true }),
  format.colorize(),
  timestamp({ format: "MM/DD HH:mm:ss" }),

  format.printf((x) => {
    const { level, message, timestamp, label, metadata } = x;
    const labelString = label ? `[${label}]` : "";
    let output = `${timestamp} ${labelString} [${level}]: ${message}`;
    if (metadata && metadata.stack) {
      output += `${metadata.stack}`;
    }
    return output;
  }),
);

const mongoDBformat = format.combine(
  format.timestamp(),
  format.errors({ stack: true }),
  format.json(),
);

export default function buildProdLogger() {
  return createLogger({
    level: "warn",
    format: format.combine(
      errors({ stack: true }),
      timestamp(),
      format.json(),
      format.metadata(),
    ),
    defaultMeta: { service: "user-service" },
    transports: [
      new transports.Console({
        format: customConsoleFormat,
      }),
      new transports.MongoDB({
        db: `${env.DB_URI}/${env.DB_NAME}`,
        collection: "logs",
        format: mongoDBformat,
        options: { useUnifiedTopology: true },
      }),
    ],
  });
}
