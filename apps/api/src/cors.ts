export function createCorsOptions() {
  return {
    origin: process.env.CORS_ORIGIN ?? "http://localhost:4200",
    exposedHeaders: ["x-conversation-id"],
  };
}
