import { S3Client, type S3ClientConfig } from "@aws-sdk/client-s3";

import { env } from "../env.js";

const config: S3ClientConfig = {
  region: env.AWS_S3_REGION,
};

if (env.NODE_ENV === "development") {
  if (!env.AWS_DEVELOPER_ACCESS_KEY || !env.AWS_DEVELOPER_SECRET_ACCESS_KEY) {
    throw new Error(
      "AWS_DEVELOPER_ACCESS_KEY and AWS_DEVELOPER_SECRET_ACCESS_KEY are required in development mode.",
    );
  }

  config.credentials = {
    accessKeyId: env.AWS_DEVELOPER_ACCESS_KEY,
    secretAccessKey: env.AWS_DEVELOPER_SECRET_ACCESS_KEY,
  };
}

export const s3Client = new S3Client(config);
