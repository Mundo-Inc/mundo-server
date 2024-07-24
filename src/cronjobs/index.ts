export async function loadCronJobs(environment: "development" | "production") {
  await import("./scheduledTasks.js");
  await import("./updateTrendScores.js");
  await import("./bots.js");

  if (environment === "production") {
    await import("./notification.js");
    await import("./backup.js");
  }
}
