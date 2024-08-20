import cron from "node-cron";

import Upload from "../models/Upload.js";
import S3Manager from "../utilities/s3Manager/index.js";

cron.schedule("*/15 * * * *", async () => {
  const FIFTEEN_MINUTES_AGO = new Date(Date.now() - 1000 * 60 * 15);
  const uploads = await Upload.find({
    createdAt: { $lt: FIFTEEN_MINUTES_AGO },
  });

  for (const upload of uploads) {
    await S3Manager.deleteObject(upload.key);
    await Upload.findByIdAndDelete(upload._id);
  }
});
