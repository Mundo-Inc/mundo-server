import { env } from "../../../env.js";
import buildDevLogger from "./dev-logger.js";
import buildProdLogger from "./prod-logger.js";

const logger = buildDevLogger()

export default logger;
