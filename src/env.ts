import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
  server: {
    NODE_ENV: z.enum(["development", "production"]).default("development"),
    APP_PORT: z
      .string()
      .regex(/^\d{1,5}$/)
      .transform(Number)
      .refine((port) => port > 0 && port <= 65535, {
        message: "Port number must be between 1 and 65535",
      }),
    DB_URI: z.string().url(),
    DB_NAME: z.string(),

    URL: z.string().url(),

    MUNDO_USER_ID: z.string(),

    // Firebase
    FIREBASE_SERVICE_ACCOUNT_KEY_FILE_NAME: z.string(),
    FIREBASE_ALTERNATE_SERVICE_ACCOUNT_KEY_FILE_NAME: z.string(),
    FIREBASE_WEB_API_KEY: z.string(),
    FIREBASE_SYNC_SECRET: z.string(),

    // Third-party services

    // OpenAI
    OPENAI_API_KEY: z.string(),

    // Google
    GOOGLE_PLACES_API_KEY: z.string(),

    // AWS S3
    AWS_S3_BUCKET_NAME: z.string(),
    AWS_S3_REGION: z.string(),
    // AWS S3 for backups
    AWS_S3_BUCKET_NAME_BACKUP: z.string(),
    // AWS Dev - Only used in development
    AWS_DEVELOPER_ACCESS_KEY: z.string().optional(),
    AWS_DEVELOPER_SECRET_ACCESS_KEY: z.string().optional(),

    // Slack
    SLACK_WEBHOOK_URL_DEV_ASSISTANT: z.string(),
    SLACK_WEBHOOK_URL_PHANTOM_ASSISTANT: z.string(),

    // Brevo
    BREVO_API_KEY: z.string(),

    // Yelp
    YELP_FUSION_API_KEY: z.string(),

    // Foursquare
    FOURSQUARE_API_KEY: z.string(),

    // Twilio
    TWILIO_ACCOUNT_SID: z.string(),
    TWILIO_AUTH_TOKEN: z.string(),
    TWILIO_API_KEY_SID: z.string(),
    TWILIO_API_KEY_SECRET: z.string(),
    TWILIO_SERVICE_SID: z.string(),
    TWILIO_WEBHOOK_URL: z.string(),

    // Stripe
    STRIPE_SECRET_KEY: z.string(),
    STRIPE_API_VERSION: z.string(),
  },

  /**
   * What object holds the environment variables at runtime. This is usually
   * `process.env` or `import.meta.env`.
   */
  runtimeEnv: process.env,

  /**
   * By default, this library will feed the environment variables directly to
   * the Zod validator.
   *
   * This means that if you have an empty string for a value that is supposed
   * to be a number (e.g. `PORT=` in a ".env" file), Zod will incorrectly flag
   * it as a type mismatch violation. Additionally, if you have an empty string
   * for a value that is supposed to be a string with a default value (e.g.
   * `DOMAIN=` in an ".env" file), the default value will never be applied.
   *
   * In order to solve these issues, we recommend that all new projects
   * explicitly specify this option as true.
   */
  emptyStringAsUndefined: true,
});
