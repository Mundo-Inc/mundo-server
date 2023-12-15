export const config = {
  // App configuration
  APP_PORT: process.env.PORT || 3020,

  // Database
  DB_URI: process.env.DB_URI || "mongodb://localhost:27017",
  DB_NAME: process.env.DB_NAME || "genz",

  // JWT
  JWT_SECRET: process.env.JWT_SECRET!,
};
