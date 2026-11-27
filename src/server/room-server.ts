// Local room server. Runs on the host's own computer, with no outside hosting.
// It serves the TV page, the phone page, the host page, a small JSON API, and a live-update stream.
// One process runs one room. Ballots are kept in memory until the process stops.
//
// A "step" is one thing the room shows at a time: one ranked-picks round, or one trivia question.
// The host moves between steps; everything else keys off the step.

import { createServer, type IncomingMessage, type ServerResponse, type Server } from "node:http";
import { randomUUID, timingSafeEqual } from "node:crypto";
import QRCode from "qrcode";
import type { GameDefinition, RankedPicksRound, TriviaQuestion, TriviaRound } from "../engine/types.js";
import { BallotBox } from "../engine/ballots.js";
import { scoreRankedPicks } from "../rounds/ranked-picks/scoring.js";
import { scoreTriviaAnswer, countChoices, type TriviaAnswer } from "../rounds/trivia/scoring.js";
import { validateGame } from "../engine/validate.js";
import { TV_PAGE, PHONE_PAGE, HOST_PAGE } from "./pages.js";

const VOTER_COOKIE = "pge_voter";
const MAX_NAME = 20;

export interface RoomServerOptions {
  game: GameDefinition;
  /** Address phones should open, e.g. http://192.168.1.20:3000/join. Encoded in the QR code. */
  joinUrl: string;
  /** Secret for the host page. Only the host's computer shows it, in the terminal. */
  hostToken: string;
}

type Step =
  | { id: string; kind: "ranked"; roundTitle: string; round: RankedPicksRound }
  | { id: string; kind: "trivia"; roundTitle: string; round: TriviaRound; question: TriviaQuestion };

export async function createRoomServer({ game, joinUrl, hostToken }: RoomServerOptions): Promise<Server> {
  const check = validateGame(game);
  if (!check.ok) throw new Error(`Invalid game:\n- ${check.errors.join("\n- ")}`);
  if (hostToken.length < 16) throw new Error("hostToken must be at least 16 characters.");

  // The QR code is drawn once at startup, as an SVG picture of the phone address.
  const qrSvg = await QRCode.toString(joinUrl, { type: "svg", margin: 1, errorCorrectionLevel: "M" });

  const steps: Step[] = game.rounds.flatMap((round): Step[] =>
    round.type === "ranked-picks"
      ? [{ id: round.id, kind: "ranked", roundTitle: round.title, round }]
      : round.questions.map((question) => ({
          id: `${round.id}:${question.id}`,
          kind: "trivia",
          roundTitle: round.title,
          round,
          question,
        })),
  );
  const stepsById = new Map(steps.map((s) => [s.id, s]));
  const entriesById = new Map(game.entries.map((e) => [e.id, e]));

  const rankedBallots = new BallotBox<string[]>();
  const triviaBallots = new BallotBox<TriviaAnswer>();
  const triviaAnswers = new Map<string, Map<string, TriviaAnswer>>(); // stepId -> voterId -> answer
  const revealed = new Set<string>(); // trivia step ids the host has revealed
  const nicknames = new Map<string, string>();
  const listeners = new Set<ServerResponse>();

  // Room state the host controls. Guests and the TV only see what publicState() returns.
  let stepIndex = 0;
  let votingOpen = true;
  let openedAt = Date.now();

  const currentStep = (): Step => steps[stepIndex]!;

  function secondsLeft(step: Step): number | undefined {
    if (step.kind !== "trivia") return undefined;
    const limit = step.round.config.questionSeconds * 1000;
    return Math.max(0, Math.ceil((openedAt + limit - Date.now()) / 1000));
  }

  function hasVoted(stepId: string, voterId: string): boolean {
    const step = stepsById.get(stepId);
    if (!step) return false;
    if (step.kind === "ranked") return voterHasRanked.has(`${stepId}\u0000${voterId}`);
    return triviaAnswers.get(stepId)?.has(voterId) ?? false;
  }
  const voterHasRanked = new Set<string>();

  // Points per guest, from revealed trivia questions only.
  function leaderboard() {
    const points = new Map<string, number>();
    for (const stepId of revealed) {
      const step = stepsById.get(stepId);
      if (!step || step.kind !== "trivia") continue;
      for (const [voterId, answer] of triviaAnswers.get(stepId) ?? []) {
        const gained = scoreTriviaAnswer(step.question, step.round.config, answer);
        points.set(voterId, (points.get(voterId) ?? 0) + gained);
      }
    }
    return [...points.entries()]
      .map(([voterId, pts]) => ({ name: nicknames.get(voterId) ?? "Guest", points: pts }))
      .sort((a, b) => b.points - a.points)
      .slice(0, 10);
  }

  function publicState(voterId: string | undefined) {
    const step = currentStep();
    const base = {
      title: game.title,
      joinUrl,
      theme: game.theme ?? {},
      kind: step.kind,
      stepId: step.id,
      stepNumber: stepIndex + 1,
      stepCount: steps.length,
      roundTitle: step.roundTitle,
      votingOpen,
      youHaveVoted: voterId ? hasVoted(step.id, voterId) : false,
      yourName: voterId ? nicknames.get(voterId) ?? "" : "",
      leaderboard: leaderboard(),
    };

    if (step.kind === "ranked") {
      const ballotsForRound = rankedBallots.forRound(step.id);
      const scores = scoreRankedPicks(step.round.entryIds, ballotsForRound, step.round.config);
      return {
        ...base,
        round: { id: step.round.id, title: step.round.title, config: step.round.config, entryIds: step.round.entryIds },
        entries: game.entries.filter((e) => step.round.entryIds.includes(e.id)),
        scores,
        ballotCount: ballotsForRound.length,
      };
    }

    const answers = [...(triviaAnswers.get(step.id)?.values() ?? [])];
    const isRevealed = revealed.has(step.id);
    return {
      ...base,
      question: {
        id: step.question.id,
        prompt: step.question.prompt,
        choices: step.question.choices,
        points: step.question.points,
        correctIndex: isRevealed ? step.question.correctIndex : undefined,
      },
      yourChoice: voterId ? triviaAnswers.get(step.id)?.get(voterId)?.choice : undefined,
      questionSeconds: step.round.config.questionSeconds,
      secondsLeft: secondsLeft(step),
      revealed: isRevealed,
      counts: countChoices(step.question.choices.length, answers),
      ballotCount: answers.length,
    };
  }

  function hostState() {
    return { ...publicState(undefined), stepId: currentStep().id };
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

  function parseJson(text: string): Record<string, unknown> | undefined {
    try {
      const value: unknown = JSON.parse(text);
      return typeof value === "object" && value !== null && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : undefined;
    } catch {
      return undefined;
    }
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

  function openStep(index: number) {
    stepIndex = index;
    votingOpen = true;
    openedAt = Date.now();
    broadcast();
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
        return json(res, 200, publicState(voter.id), cookieHeaders);
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

      // ----- Guest: name for the leaderboard -----
      if (method === "POST" && url.pathname === "/api/nickname") {
        const body = parseJson(await readBody(req));
        const name = typeof body?.name === "string" ? body.name.trim().slice(0, MAX_NAME) : "";
        if (name === "") {
          nicknames.delete(voter.id);
        } else {
          nicknames.set(voter.id, name);
        }
        broadcast();
        return json(res, 200, { ok: true, name }, cookieHeaders);
      }

      // ----- Guest: answer -----
      if (method === "POST" && url.pathname === "/api/ballot") {
        const body = parseJson(await readBody(req));
        const step = currentStep();
        if (!body) {
          return json(res, 400, { error: "Could not read your answer. Please try again." }, cookieHeaders);
        }
        if (!votingOpen) {
          return json(res, 409, { error: "Voting is closed." }, cookieHeaders);
        }
        if (body.stepId !== step.id) {
          return json(res, 400, { error: "This is not the question on screen." }, cookieHeaders);
        }

        if (step.kind === "ranked") {
          const picks = body.picks;
          const round = step.round;
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
          const result = rankedBallots.submit(step.id, voter.id, picksList);
          if (result.status === "already-submitted") {
            return json(res, 409, { error: "You have already voted in this round." }, cookieHeaders);
          }
          voterHasRanked.add(`${step.id}\u0000${voter.id}`);
          broadcast();
          return json(res, 200, { ok: true }, cookieHeaders);
        }

        // Trivia
        const choice = body.choice;
        const limitMs = step.round.config.questionSeconds * 1000;
        const elapsedMs = Date.now() - openedAt;
        if (elapsedMs > limitMs) {
          return json(res, 409, { error: "Time is up for this question." }, cookieHeaders);
        }
        if (typeof choice !== "number" || !Number.isInteger(choice) || choice < 0 || choice >= step.question.choices.length) {
          return json(res, 400, { error: "Pick one of the answers." }, cookieHeaders);
        }
        const answer: TriviaAnswer = { choice, elapsedMs: Math.max(0, elapsedMs) };
        const result = triviaBallots.submit(step.id, voter.id, answer);
        if (result.status === "already-submitted") {
          return json(res, 409, { error: "You have already answered this question." }, cookieHeaders);
        }
        const byVoter = triviaAnswers.get(step.id) ?? new Map<string, TriviaAnswer>();
        byVoter.set(voter.id, answer);
        triviaAnswers.set(step.id, byVoter);
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
          return json(res, 200, hostState());
        }
        if (method === "POST" && url.pathname === "/api/host/next") {
          if (stepIndex < steps.length - 1) openStep(stepIndex + 1);
          return json(res, 200, hostState());
        }
        if (method === "POST" && url.pathname === "/api/host/previous") {
          if (stepIndex > 0) openStep(stepIndex - 1);
          return json(res, 200, hostState());
        }
        if (method === "POST" && url.pathname === "/api/host/voting") {
          const body = parseJson(await readBody(req));
          if (typeof body?.open !== "boolean") {
            return json(res, 400, { error: 'Send { "open": true } or { "open": false }.' });
          }
          votingOpen = body.open;
          broadcast();
          return json(res, 200, hostState());
        }
        if (method === "POST" && url.pathname === "/api/host/reveal") {
          const step = currentStep();
          if (step.kind !== "trivia") {
            return json(res, 409, { error: "Reveal is only for trivia questions." });
          }
          revealed.add(step.id);
          votingOpen = false;
          broadcast();
          return json(res, 200, hostState());
        }
      }

      json(res, 404, { error: "Not found" }, cookieHeaders);
    } catch {
      json(res, 500, { error: "Something went wrong on the host computer." });
    }
  });
}
