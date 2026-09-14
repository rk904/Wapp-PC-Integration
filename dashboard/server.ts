import { readFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { ConsoleError, ConsoleService } from "../src/console/consoleService.js";

/**
 * WA-Intake console server. Plain Node http, no framework.
 *   npm run console            → http://localhost:4400
 * Seeds the synthetic demo day, then accepts WhatsApp chat exports via the UI.
 */

const here = fileURLToPath(new URL(".", import.meta.url));
const PUBLIC_DIR = resolve(here, "public");
const PORT = Number(process.env.PORT ?? 4400);
const MAX_UPLOAD = 25 * 1024 * 1024;

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".ico": "image/x-icon",
};

const service = new ConsoleService();
if (process.env.WA_CONSOLE_DEMO !== "0") await service.seedDemo();

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);

    if (req.method === "GET" && url.pathname === "/api/snapshot") return json(res, 200, service.snapshot());

    if (req.method === "POST" && url.pathname === "/api/import") {
      const fileName = decodeURIComponent(String(req.headers["x-file-name"] ?? "WhatsApp Chat.txt"));
      const groupName = req.headers["x-group-name"] ? decodeURIComponent(String(req.headers["x-group-name"])) : undefined;
      const body = await readBody(req);
      if (body.length === 0) return json(res, 400, { error: "The attached file is empty." });
      return json(res, 200, await service.importExport(fileName, body, groupName));
    }

    if (req.method === "POST" && url.pathname === "/api/ingest/whatsapp-web") {
      const body = JSON.parse(Buffer.from(await readBody(req)).toString("utf8")) as { rows?: unknown; extractions?: Record<string, unknown> };
      if (!Array.isArray(body.rows)) return json(res, 400, { error: "Body must be { rows: WhatsAppWebRow[], extractions?: { [messageId]: ExtractionResult } }" });
      return json(res, 200, await service.ingestWhatsAppWeb(body.rows as never, body.extractions ?? {}));
    }

    const review = url.pathname.match(/^\/api\/requirements\/([^/]+)\/(approve|reject)$/);
    if (req.method === "POST" && review) {
      const id = decodeURIComponent(review[1]!);
      return json(res, 200, review[2] === "approve" ? service.approve(id) : service.reject(id));
    }

    if (req.method === "GET") return serveStatic(url.pathname, res);
    return json(res, 405, { error: "Method not allowed" });
  } catch (err) {
    if (err instanceof ConsoleError) return json(res, err.status, { error: err.message });
    console.error(err);
    return json(res, 500, { error: err instanceof Error ? err.message : "Unexpected error" });
  }
});

server.listen(PORT, () => {
  const m = service.mode;
  console.log(`WA-Intake console → http://localhost:${PORT}`);
  console.log(`  AI: ${m.ai === "claude" ? `Claude (${m.model})` : "demo fixtures only (set ANTHROPIC_API_KEY for attached exports)"}`);
  console.log(`  Geocoder: ${m.geocoder === "google-places" ? "Google Places" : "offline demo table (set GOOGLE_MAPS_API_KEY)"}`);
});

function json(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(JSON.stringify(body));
}

async function readBody(req: IncomingMessage): Promise<Uint8Array> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_UPLOAD) throw new ConsoleError(413, "That export is larger than 25 MB. Export the chat without media and attach the .txt.");
    chunks.push(chunk as Buffer);
  }
  return new Uint8Array(Buffer.concat(chunks));
}

async function serveStatic(pathname: string, res: ServerResponse) {
  const rel = pathname === "/" ? "index.html" : decodeURIComponent(pathname).replace(/^\/+/, "");
  const file = normalize(join(PUBLIC_DIR, rel));
  if (!file.startsWith(PUBLIC_DIR + sep)) return json(res, 403, { error: "Forbidden" });
  try {
    const data = await readFile(file);
    res.writeHead(200, { "Content-Type": TYPES[extname(file).toLowerCase()] ?? "application/octet-stream" });
    res.end(data);
  } catch {
    json(res, 404, { error: "Not found" });
  }
}
