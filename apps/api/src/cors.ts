export function createCorsOptions(origin = process.env.CORS_ORIGIN ?? "http://localhost:4200") {
  return {
    origin,
    credentials: true,
    exposedHeaders: ["x-conversation-id"],
  };
}
