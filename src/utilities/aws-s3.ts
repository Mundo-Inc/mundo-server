import { S3Client } from "@aws-sdk/client-s3";

import { env } from "../env.js";

const s3Client = new S3Client({
  credentials: {
    accessKeyId: env.AWS_S3_ACCESS_KEY_ID,
    secretAccessKey: env.AWS_S3_SECRET_ACCESS_KEY,
  },
  region: env.AWS_S3_REGION,
});

export { s3Client };
