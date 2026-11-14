// v397 (AI Studio, 2 Nov: preview "refused to connect" — its container had PORT=8080 already taken): the AI Studio
// preview (npm run dev → tsx server.ts) always uses port 3000. The built server (dist/server.cjs on Cloud Run) keeps
// the PORT the platform gives, exactly as before. A module of its own so it runs BEFORE backend/server.ts reads PORT
// (imports run in order; a plain line in server.ts would run after the imports).
export function devPortFor(argv1: string, env: Record<string, any>): string | undefined {
  return /server\.cjs$/.test(String(argv1 || "")) ? env.PORT : "3000";
}
const port = devPortFor(process.argv[1], process.env);
if (port !== undefined) process.env.PORT = port;
