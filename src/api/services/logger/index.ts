import buildDevLogger from "./dev-logger";
import buildProdLogger from "./prod-logger";
import { Logger } from "winston";

let logger: Logger =
  process.env.NODE_ENV === "development" ? buildDevLogger() : buildProdLogger();

export default logger;
