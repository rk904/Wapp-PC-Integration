// Vercel serverless entry. State is in memory per function instance: the demo day is
// re-seeded on each cold start and attached exports do not persist (see README).
export { handle as default } from "../dashboard/server.js";
