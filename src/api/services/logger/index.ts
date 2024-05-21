import { env } from "../../../env.js";
import buildDevLogger from "./dev-logger.js";
import buildProdLogger from "./prod-logger.js";

const logger =
  env.NODE_ENV === "development" ? buildDevLogger() : buildProdLogger();

export default logger;
