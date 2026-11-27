// Local room server. Runs on the host's own computer, with no outside hosting.
// It serves the TV page, the phone page, the host page, a small JSON API, and a live-update stream.
// One process runs one room. Ballots are kept in memory until the process stops.

import { createServer, type IncomingMessage, type ServerResponse, type Server } from "node:http";
import { randomUUID, timingSafeEqual } from "node:crypto";
import QRCode from "qrcode";
import type { GameDefinition, Round } from "../engine/types.js";
import { BallotBox } from "../engine/ballots.js";
import { scoreRankedPicks } from "../rounds/ranked-picks/scoring.js";
import { validateGame } from "../engine/validate.js";
import { TV_PAGE, PHONE_PAGE, HOST_PAGE } from "./pages.js";

const VOTER_COOKIE = "pge_voter";

export interface RoomServerOptions {
  game: GameDefinition;
  /** Address phones should open, e.g. http://192.168.1.20:3000/join. Encoded in the QR code. */
  joinUrl: string;
  /** Secret for the host page. Only the host's computer shows it, in the terminal. */
  hostToken: string;
}

export async function createRoomServer({ game, joinUrl, hostToken }: RoomServerOptions): Promise<Server> {
  const check = validateGame(game);
  if (!check.ok) throw new Error(`Invalid game:\n- ${check.errors.join("\n- ")}`);
  if (hostToken.length < 16) throw new Error("hostToken must be at least 16 characters.");

  // The QR code is drawn once at startup, as an SVG picture of the phone address.
  const qrSvg = await QRCode.toString(joinUrl, { type: "svg", margin: 1, errorCorrectionLevel: "M" });

  const ballots = new BallotBox<string[]>();
  const listeners = new Set<ServerResponse>();
  const roundsById = new Map<string, Round>(game.rounds.map((r) => [r.id, r]));
  const entriesById = new Map(game.entries.map((e) => [e.id, e]));
  const votedKeys = new Set<string>();

  // Room state the host controls. Guests and the TV only see what stateFor() returns.
  let roundIndex = 0;
  let votingOpen = true;

  const currentRound = (): Round => game.rounds[roundIndex]!;

  function hasVoted(roundId: string, voterId: string) {
    return votedKeys.has(`${roundId}\u0000${voterId}`);
  }

  function stateFor(voterId: string | undefined) {
    const round = currentRound();
    const ballotsForRound = ballots.forRound(round.id);
    const scores = scoreRankedPicks(round.entryIds, ballotsForRound, round.config);
    return {
      title: game.title,
      joinUrl,
      theme: game.theme ?? {},
      round: { id: round.id, title: round.title, config: round.config, entryIds: round.entryIds },
      roundNumber: roundIndex + 1,
      roundCount: game.rounds.length,
      votingOpen,
      entries: game.entries.filter((e) => round.entryIds.includes(e.id)),
      scores,
      ballotCount: ballotsForRound.length,
      youHaveVoted: voterId ? hasVoted(round.id, voterId) : false,
    };
  }

  function hostStateFor() {
    return { ...stateFor(undefined), roundId: currentRound().id };
  }

  function broadcast() {
    for (const res of listeners) {
      res.write(`event: update\ndata: ${JSON.stringify({ at: Date.now() })}\n\n`);
    }
  }

  function readBody(req: IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
      let data = "";
      req.on("data", (chunk: Buffer) => {
        data += chunk.toString("utf8");
        if (data.length > 10_000) {
          reject(new Error("too large"));
          req.destroy();
        }
      });
      req.on("end", () => resolve(data));
      req.on("error", reject);
    });
  }

  function send(res: ServerResponse, status: number, body: string, type: string, extraHeaders: Record<string, string> = {}) {
    res.writeHead(status, { "content-type": type, "cache-control": "no-store", ...extraHeaders });
    res.end(body);
  }

  function json(res: ServerResponse, status: number, value: unknown, extraHeaders: Record<string, string> = {}) {
    send(res, status, JSON.stringify(value), "application/json; charset=utf-8", extraHeaders);
  }

  function voterIdFrom(req: IncomingMessage): { id: string; setCookie?: string } {
    const match = /(?:^|;\s*)pge_voter=([A-Za-z0-9-]{8,64})/.exec(req.headers.cookie ?? "");
    if (match) return { id: match[1]! };
    const id = randomUUID();
    return { id, setCookie: `${VOTER_COOKIE}=${id}; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000` };
  }

  function isHost(req: IncomingMessage, url: URL): boolean {
    const given = String(req.headers["x-host-token"] ?? url.searchParams.get("token") ?? "");
    const a = Buffer.from(given);
    const b = Buffer.from(hostToken);
    return a.length === b.length && timingSafeEqual(a, b);
  }

  return createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const method = req.method ?? "GET";
    const voter = voterIdFrom(req);
    const cookieHeaders: Record<string, string> = voter.setCookie ? { "set-cookie": voter.setCookie } : {};

    try {
      // ----- Public screens -----
      if (method === "GET" && url.pathname === "/") {
        return send(res, 200, TV_PAGE, "text/html; charset=utf-8");
      }
      if (method === "GET" && url.pathname === "/qr.svg") {
        return send(res, 200, qrSvg, "image/svg+xml; charset=utf-8");
      }
      if (method === "GET" && url.pathname === "/join") {
        return send(res, 200, PHONE_PAGE, "text/html; charset=utf-8", cookieHeaders);
      }
      if (method === "GET" && url.pathname === "/api/state") {
        return json(res, 200, stateFor(voter.id), cookieHeaders);
      }
      if (method === "GET" && url.pathname === "/events") {
        res.writeHead(200, {
          "content-type": "text/event-stream",
          "cache-control": "no-store",
          connection: "keep-alive",
        });
        res.write(": connected\n\n");
        listeners.add(res);
        req.on("close", () => listeners.delete(res));
        return;
      }

      // ----- Guest vote -----
      if (method === "POST" && url.pathname === "/api/ballot") {
        let body: { roundId?: unknown; picks?: unknown };
        try {
          body = JSON.parse(await readBody(req));
        } catch {
          return json(res, 400, { error: "Could not read your ballot. Please try again." }, cookieHeaders);
        }
        const round = currentRound();
        if (!votingOpen) {
          return json(res, 409, { error: "Voting is closed for this round." }, cookieHeaders);
        }
        if (body.roundId !== round.id) {
          return json(res, 400, { error: "This round is not open." }, cookieHeaders);
        }
        const picks = body.picks;
        if (!Array.isArray(picks) || picks.some((p) => typeof p !== "string")) {
          return json(res, 400, { error: "Picks must be a list of entries." }, cookieHeaders);
        }
        const picksList = picks as string[];
        if (picksList.length === 0 || picksList.length > round.config.maxPicks) {
          return json(res, 400, { error: `Pick between 1 and ${round.config.maxPicks} entries.` }, cookieHeaders);
        }
        if (new Set(picksList).size !== picksList.length) {
          return json(res, 400, { error: "Each entry can only be picked once." }, cookieHeaders);
        }
        if (picksList.some((id) => !round.entryIds.includes(id) || !entriesById.has(id))) {
          return json(res, 400, { error: "One of those entries is not in this round." }, cookieHeaders);
        }

        const result = ballots.submit(round.id, voter.id, picksList);
        if (result.status === "already-submitted") {
          return json(res, 409, { error: "You have already voted in this round." }, cookieHeaders);
        }
        votedKeys.add(`${round.id}\u0000${voter.id}`);
        broadcast();
        return json(res, 200, { ok: true }, cookieHeaders);
      }

      // ----- Host (needs the secret token) -----
      if (url.pathname === "/host" || url.pathname.startsWith("/api/host/")) {
        if (!isHost(req, url)) {
          return json(res, 403, { error: "Host access needs the link printed in the host computer's terminal." });
        }
        if (method === "GET" && url.pathname === "/host") {
          return send(res, 200, HOST_PAGE, "text/html; charset=utf-8");
        }
        if (method === "GET" && url.pathname === "/api/host/state") {
          return json(res, 200, hostStateFor());
        }
        if (method === "POST" && url.pathname === "/api/host/next") {
          if (roundIndex < game.rounds.length - 1) roundIndex++;
          votingOpen = true;
          broadcast();
          return json(res, 200, hostStateFor());
        }
        if (method === "POST" && url.pathname === "/api/host/previous") {
          if (roundIndex > 0) roundIndex--;
          votingOpen = true;
          broadcast();
          return json(res, 200, hostStateFor());
        }
        if (method === "POST" && url.pathname === "/api/host/voting") {
          let body: { open?: unknown };
          try {
            body = JSON.parse(await readBody(req));
          } catch {
            return json(res, 400, { error: "Could not read that request." });
          }
          if (typeof body.open !== "boolean") {
            return json(res, 400, { error: 'Send { "open": true } or { "open": false }.' });
          }
          votingOpen = body.open;
          broadcast();
          return json(res, 200, hostStateFor());
        }
      }

      json(res, 404, { error: "Not found" }, cookieHeaders);
    } catch {
      json(res, 500, { error: "Something went wrong on the host computer." });
    }
  });
}
