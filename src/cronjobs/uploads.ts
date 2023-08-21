import cron from "node-cron";
import Upload from "../models/Upload";
import { bucketName, s3 } from "../utilities/storage";
import { DeleteObjectCommand } from "@aws-sdk/client-s3";

cron.schedule("*/15 * * * *", async () => {
  const uploads = await Upload.find({
    // created at more than 15 minutes ago
    createdAt: { $lt: new Date(Date.now() - 1000 * 60 * 15) },
  });

  for (const upload of uploads) {
    await s3.send(
      new DeleteObjectCommand({
        Bucket: bucketName,
        Key: upload.key,
      })
    );

    Upload.findByIdAndDelete(upload._id);
  }
});
