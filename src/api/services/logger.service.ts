import winston from "winston";
import fs from "fs";
import path from "path";

const logsDir = path.resolve(__dirname, "..", "logs");

if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir);
}

export const createLogger = (entity?: string) => {
  const logger = winston.createLogger({
    level: "info",
    format: winston.format.json(),
    defaultMeta: { entity }, // variant will be included in all logs from this logger
    transports: [
      new winston.transports.File({
        filename: path.join(logsDir, "error.log"),
        level: "error",
      }),
      new winston.transports.File({
        filename: path.join(logsDir, "combined.log"),
      }),
    ],
  });

  if (process.env.NODE_ENV !== "production") {
    logger.add(
      new winston.transports.Console({
        format: winston.format.simple(),
      })
    );
  }

  return logger;
};

export default createLogger();
