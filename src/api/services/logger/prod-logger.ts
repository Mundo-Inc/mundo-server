import { createLogger, format, transports, Logger } from "winston";
import "winston-mongodb";
import { config } from "../../../config";

const { timestamp, errors } = format;

const customConsoleFormat = format.combine(
  errors({ stack: true }),
  format.colorize(),
  timestamp({ format: "YYYY-MM-DD HH-mm-ss" }),

  format.printf((x) => {
    const { level, message, timestamp, label, metadata } = x;
    const labelString = label ? `[${label}]` : "";
    let output = `${timestamp} ${labelString} [${level}]: ${message}`;
    if (metadata && metadata.stack) {
      output += `${metadata.stack}`;
    }
    return output;
  })
);

const mongoDBformat = format.combine(
  format.timestamp(),
  format.errors({ stack: true }),
  format.json()
);

export default function buildProdLogger(): Logger {
  return createLogger({
    format: format.combine(
      errors({ stack: true }),
      timestamp(),
      format.json(),
      format.metadata()
    ),
    defaultMeta: { service: "user-service" },
    transports: [
      new transports.Console({
        format: customConsoleFormat,
      }),
      new transports.MongoDB({
        db: `${config.DB_URI}/${config.DB_NAME}`,
        collection: "logs",
        format: mongoDBformat,
        options: { useUnifiedTopology: true },
      }),
    ],
  });
}

// USAGE:
// logger.error("Error occurred", {
//     error: new Error("yo error"),
//     additionalData: "Some additional info",
//   });
