// Manual game builder: a page in the browser where you edit a game file as text, see every
// problem the checker finds, and download the result. Runs only on this computer.
import { createServer, type ServerResponse } from "node:http";
import { validateGame } from "../engine/validate.js";
import { BUILDER_PAGE } from "./builder-page.js";

function send(res: ServerResponse, status: number, body: string, type: string) {
  res.writeHead(status, { "content-type": type, "cache-control": "no-store" });
  res.end(body);
}

export function createBuilderServer(starter: string) {
  return createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    if (req.method === "GET" && url.pathname === "/") return send(res, 200, BUILDER_PAGE(starter), "text/html; charset=utf-8");
    if (req.method === "POST" && url.pathname === "/api/validate") {
      let text = "";
      req.on("data", (c: Buffer) => {
        text += c.toString("utf8");
        if (text.length > 1_000_000) req.destroy();
      });
      req.on("end", () => {
        let parsed: unknown;
        try {
          parsed = JSON.parse(text);
        } catch (err) {
          return send(res, 200, JSON.stringify({ ok: false, errors: [`That is not valid JSON yet: ${(err as Error).message}`] }), "application/json");
        }
        return send(res, 200, JSON.stringify(validateGame(parsed)), "application/json");
      });
      return;
    }
    send(res, 404, "Not found", "text/plain");
  });
}
