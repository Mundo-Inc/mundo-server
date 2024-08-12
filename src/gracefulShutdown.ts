import logger from "./api/services/logger/index.js";
import { io } from "./socket.js";

const gracefulShutdown = () => {
  if (!shuttingDown) {
    shuttingDown = true;
    logger.info("Received shutdown signal, cleaning up...");

    const cleanupPromises = [
      new Promise((resolve) => {
        io.close(resolve);
      }),
    ];

    Promise.all(cleanupPromises)
      .then(() => {
        logger.info("Cleanup completed successfully.");
        process.exit(0);
      })
      .catch((error) => {
        logger.error("Failed during cleanup:", error);
        process.exit(1);
      });
  }
};

let shuttingDown = false;

export default gracefulShutdown;
