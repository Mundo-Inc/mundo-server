module.exports = {
  apps: [
    {
      name: "genz-server",
      script: "./dist/server.js",
      autorestart: true,
      watch: false,
    },
  ],
};
