// Local room server. Runs on the host's own computer, with no outside hosting.
// It serves the TV page, the phone page, the host page, a small JSON API, and a live-update stream.
// One process runs one room. Ballots are kept in memory until the process stops.
//
// A "step" is one thing the room shows at a time: a ranked-picks round, or one question
// from a trivia, poll, rating or superlatives round. The host moves between steps.

import { createServer, type IncomingMessage, type ServerResponse, type Server } from "node:http";
import { randomUUID, timingSafeEqual } from "node:crypto";
import QRCode from "qrcode";
import type { GameDefinition } from "../engine/types.js";
import { BallotBox } from "../engine/ballots.js";
import { scoreRankedPicks } from "../rounds/ranked-picks/scoring.js";
import { scoreTriviaAnswer, type TriviaAnswer } from "../rounds/trivia/scoring.js";
import { tallyChoices, leaders } from "../rounds/poll/scoring.js";
import { tallyRatings, averageRating } from "../rounds/rating/scoring.js";
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

/** One answer from one guest to one question step. `value` is a choice index or a rating. */
interface QuestionAnswer {
  value: number;
  elapsedMs: number;
  /** Write-in text, only for write-in steps. Never sent to guests or the TV. */
  text?: string;
}

type Step =
  | { id: string; kind: "ranked"; roundTitle: string; prompt: string; entryIds: string[]; maxPicks: number; points: number[] }
  | { id: string; kind: "trivia"; roundTitle: string; prompt: string; choices: string[]; correctIndex: number; points: number; limitSeconds: number; speedBonusMax: number }
  | { id: string; kind: "poll"; roundTitle: string; prompt: string; choices: string[] }
  | { id: string; kind: "rating"; roundTitle: string; prompt: string; scale: number }
  | { id: string; kind: "superlative"; roundTitle: string; prompt: string; entryIds: string[]; choices: string[] }
  | { id: string; kind: "writein"; roundTitle: string; prompt: string; maxLength: number };

export async function createRoomServer({ game, joinUrl, hostToken }: RoomServerOptions): Promise<Server> {
  const check = validateGame(game);
  if (!check.ok) throw new Error(`Invalid game:\n- ${check.errors.join("\n- ")}`);
  if (hostToken.length < 16) throw new Error("hostToken must be at least 16 characters.");

  // The QR code is drawn once at startup, as an SVG picture of the phone address.
  const qrSvg = await QRCode.toString(joinUrl, { type: "svg", margin: 1, errorCorrectionLevel: "M" });

  const entriesById = new Map(game.entries.map((e) => [e.id, e]));
  const nameOf = (id: string) => entriesById.get(id)?.name ?? id;

  const steps: Step[] = game.rounds.flatMap((round): Step[] => {
    switch (round.type) {
      case "ranked-picks":
        return [{ id: round.id, kind: "ranked", roundTitle: round.title, prompt: round.title, entryIds: round.entryIds, maxPicks: round.config.maxPicks, points: round.config.points }];
      case "trivia":
        return round.questions.map((q) => ({
          id: `${round.id}:${q.id}`,
          kind: "trivia" as const,
          roundTitle: round.title,
          prompt: q.prompt,
          choices: q.choices,
          correctIndex: q.correctIndex,
          points: q.points,
          limitSeconds: round.config.questionSeconds,
          speedBonusMax: round.config.speedBonusMax,
        }));
      case "poll":
        return round.questions.map((q) => ({ id: `${round.id}:${q.id}`, kind: "poll" as const, roundTitle: round.title, prompt: q.prompt, choices: q.choices }));
      case "rating":
        return round.questions.map((q) => ({ id: `${round.id}:${q.id}`, kind: "rating" as const, roundTitle: round.title, prompt: q.prompt, scale: round.config.scale }));
      case "write-ins":
        return round.questions.map((q) => ({
          id: `${round.id}:${q.id}`,
          kind: "writein" as const,
          roundTitle: round.title,
          prompt: q.prompt,
          maxLength: round.config.maxLength,
        }));
      case "head-to-head":
      case "superlatives":
        return round.questions.map((q) => ({
          id: `${round.id}:${q.id}`,
          kind: "superlative" as const,
          roundTitle: round.title,
          prompt: q.prompt,
          entryIds: q.entryIds,
          choices: q.entryIds.map(nameOf),
        }));
    }
  });
  const stepsById = new Map(steps.map((s) => [s.id, s]));

  const rankedBallots = new BallotBox<string[]>();
  const rankedVoters = new Set<string>(); // `${stepId}\u0000${voterId}`
  const answers = new Map<string, Map<string, QuestionAnswer>>(); // stepId -> voterId -> answer
  const revealed = new Set<string>(); // step ids the host has revealed
  const shownWriteIns = new Map<string, number[]>(); // stepId -> answer indexes the host showed, in order
  const nicknames = new Map<string, string>();
  const listeners = new Set<ServerResponse>();

  // Room state the host controls. Guests and the TV only see what publicState() returns.
  let stepIndex = 0;
  let votingOpen = true;
  let openedAt = Date.now();

  const currentStep = (): Step => steps[stepIndex]!;

  function secondsLeft(step: Step): number | undefined {
    if (step.kind !== "trivia") return undefined;
    return Math.max(0, Math.ceil((openedAt + step.limitSeconds * 1000 - Date.now()) / 1000));
  }

  function hasVoted(step: Step, voterId: string): boolean {
    if (step.kind === "ranked") return rankedVoters.has(`${step.id}\u0000${voterId}`);
    return answers.get(step.id)?.has(voterId) ?? false;
  }

  function yourChoice(step: Step, voterId: string | undefined): number | undefined {
    if (!voterId || step.kind === "ranked") return undefined;
    return answers.get(step.id)?.get(voterId)?.value;
  }

  // Points per guest, from revealed trivia questions only.
  function leaderboard() {
    const points = new Map<string, number>();
    for (const stepId of revealed) {
      const step = stepsById.get(stepId);
      if (!step || step.kind !== "trivia") continue;
      for (const [voterId, a] of answers.get(stepId) ?? []) {
        const gained = scoreTriviaAnswer(
          { id: stepId, prompt: step.prompt, choices: step.choices, correctIndex: step.correctIndex, points: step.points },
          { questionSeconds: step.limitSeconds, speedBonusMax: step.speedBonusMax },
          { choice: a.value, elapsedMs: a.elapsedMs } satisfies TriviaAnswer,
        );
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
      youHaveVoted: voterId ? hasVoted(step, voterId) : false,
      yourChoice: yourChoice(step, voterId),
      yourName: voterId ? nicknames.get(voterId) ?? "" : "",
      leaderboard: leaderboard(),
    };

    if (step.kind === "ranked") {
      const ballotsForRound = rankedBallots.forRound(step.id);
      const scores = scoreRankedPicks(step.entryIds, ballotsForRound, { maxPicks: step.maxPicks, points: step.points });
      return {
        ...base,
        round: { id: step.id, title: step.roundTitle, config: { maxPicks: step.maxPicks, points: step.points }, entryIds: step.entryIds },
        entries: game.entries.filter((e) => step.entryIds.includes(e.id)),
        scores,
        ballotCount: ballotsForRound.length,
      };
    }

    const stepAnswers = [...(answers.get(step.id)?.values() ?? [])];
    const isRevealed = revealed.has(step.id);
    const values = stepAnswers.map((a) => a.value);
    const common = {
      ...base,
      prompt: step.prompt,
      revealed: isRevealed,
      ballotCount: stepAnswers.length,
    };

    if (step.kind === "writein") {
      const shown = shownWriteIns.get(step.id) ?? [];
      const texts = stepAnswers.map((a) => a.text ?? "");
      return {
        ...common,
        maxLength: step.maxLength,
        // Only the texts the host has chosen to show. Nobody's name is ever attached.
        shownTexts: shown.map((i) => texts[i] ?? ""),
      };
    }

    if (step.kind === "trivia") {
      return {
        ...common,
        question: { prompt: step.prompt, choices: step.choices, points: step.points, correctIndex: isRevealed ? step.correctIndex : undefined },
        questionSeconds: step.limitSeconds,
        secondsLeft: secondsLeft(step),
        counts: tallyChoices(step.choices.length, values),
      };
    }
    if (step.kind === "poll") {
      return { ...common, choices: step.choices, counts: tallyChoices(step.choices.length, values) };
    }
    if (step.kind === "superlative") {
      const counts = tallyChoices(step.choices.length, values);
      return { ...common, choices: step.choices, counts, winners: isRevealed ? leaders(counts) : undefined };
    }
    // rating
    return {
      ...common,
      scale: step.scale,
      counts: tallyRatings(step.scale, values),
      average: isRevealed ? averageRating(values) : undefined,
    };
  }

  function hostState() {
    const step = currentStep();
    const writeIns =
      step.kind === "writein"
        ? [...(answers.get(step.id)?.values() ?? [])].map((a, index) => ({
            index,
            text: a.text ?? "",
            shown: (shownWriteIns.get(step.id) ?? []).includes(index),
          }))
        : undefined;
    return { ...publicState(undefined), stepId: step.id, writeIns };
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

  /** Returns an error message, or undefined when the answer was stored. */
  function recordAnswer(step: Step, voterId: string, body: Record<string, unknown>): { error: string; status: number } | undefined {
    if (step.kind === "ranked") {
      const picks = body.picks;
      if (!Array.isArray(picks) || picks.some((p) => typeof p !== "string")) return { status: 400, error: "Picks must be a list of entries." };
      const list = picks as string[];
      if (list.length === 0 || list.length > step.maxPicks) return { status: 400, error: `Pick between 1 and ${step.maxPicks} entries.` };
      if (new Set(list).size !== list.length) return { status: 400, error: "Each entry can only be picked once." };
      if (list.some((id) => !step.entryIds.includes(id))) return { status: 400, error: "One of those entries is not in this round." };
      const result = rankedBallots.submit(step.id, voterId, list);
      if (result.status === "already-submitted") return { status: 409, error: "You have already voted in this round." };
      rankedVoters.add(`${step.id}\u0000${voterId}`);
      return undefined;
    }

    const elapsedMs = Math.max(0, Date.now() - openedAt);
    if (step.kind === "trivia" && elapsedMs > step.limitSeconds * 1000) {
      return { status: 409, error: "Time is up for this question." };
    }

    let value: unknown;
    if (step.kind === "writein") {
      const text = typeof body.text === "string" ? body.text.trim() : "";
      if (text === "" || text.length > step.maxLength) {
        return { status: 400, error: `Write something up to ${step.maxLength} characters long.` };
      }
      const byVoter = answers.get(step.id) ?? new Map<string, QuestionAnswer>();
      if (byVoter.has(voterId)) return { status: 409, error: "You have already sent an answer for this one." };
      byVoter.set(voterId, { value: 0, elapsedMs, text });
      answers.set(step.id, byVoter);
      return undefined;
    }

    if (step.kind === "rating") {
      value = body.rating;
      if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > step.scale) {
        return { status: 400, error: `Pick a number from 1 to ${step.scale}.` };
      }
    } else {
      value = body.choice;
      if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value >= step.choices.length) {
        return { status: 400, error: "Pick one of the answers." };
      }
    }
    const byVoter = answers.get(step.id) ?? new Map<string, QuestionAnswer>();
    if (byVoter.has(voterId)) {
      const same = byVoter.get(voterId)!.value === value;
      return same ? undefined : { status: 409, error: step.kind === "trivia" ? "You have already answered this question." : "You have already voted." };
    }
    byVoter.set(voterId, { value: value as number, elapsedMs });
    answers.set(step.id, byVoter);
    return undefined;
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
        res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-store", connection: "keep-alive" });
        res.write(": connected\n\n");
        listeners.add(res);
        req.on("close", () => listeners.delete(res));
        return;
      }

      // ----- Guest: name for the leaderboard -----
      if (method === "POST" && url.pathname === "/api/nickname") {
        const body = parseJson(await readBody(req));
        const name = typeof body?.name === "string" ? body.name.trim().slice(0, MAX_NAME) : "";
        if (name === "") nicknames.delete(voter.id);
        else nicknames.set(voter.id, name);
        broadcast();
        return json(res, 200, { ok: true, name }, cookieHeaders);
      }

      // ----- Guest: answer -----
      if (method === "POST" && url.pathname === "/api/ballot") {
        const body = parseJson(await readBody(req));
        if (!body) return json(res, 400, { error: "Could not read your answer. Please try again." }, cookieHeaders);
        const step = currentStep();
        if (!votingOpen) return json(res, 409, { error: "Voting is closed." }, cookieHeaders);
        if (body.stepId !== step.id) return json(res, 400, { error: "This is not the question on screen." }, cookieHeaders);
        const problem = recordAnswer(step, voter.id, body);
        if (problem) return json(res, problem.status, { error: problem.error }, cookieHeaders);
        broadcast();
        return json(res, 200, { ok: true }, cookieHeaders);
      }

      // ----- Host (needs the secret token) -----
      if (url.pathname === "/host" || url.pathname.startsWith("/api/host/")) {
        if (!isHost(req, url)) {
          return json(res, 403, { error: "Host access needs the link printed in the host computer's terminal." });
        }
        if (method === "GET" && url.pathname === "/host") return send(res, 200, HOST_PAGE, "text/html; charset=utf-8");
        if (method === "GET" && url.pathname === "/api/host/state") return json(res, 200, hostState());
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
          if (typeof body?.open !== "boolean") return json(res, 400, { error: 'Send { "open": true } or { "open": false }.' });
          votingOpen = body.open;
          broadcast();
          return json(res, 200, hostState());
        }
        if (method === "POST" && url.pathname === "/api/host/show") {
          const step = currentStep();
          const body = parseJson(await readBody(req));
          if (step.kind !== "writein") return json(res, 409, { error: "Show is only for write-in answers." });
          const count = answers.get(step.id)?.size ?? 0;
          if (typeof body?.index !== "number" || !Number.isInteger(body.index) || body.index < 0 || body.index >= count) {
            return json(res, 400, { error: "No answer with that number." });
          }
          const shown = shownWriteIns.get(step.id) ?? [];
          if (!shown.includes(body.index)) shown.push(body.index);
          shownWriteIns.set(step.id, shown);
          broadcast();
          return json(res, 200, hostState());
        }
        if (method === "POST" && url.pathname === "/api/host/reveal") {
          const step = currentStep();
          if (step.kind === "ranked") return json(res, 409, { error: "Reveal is for questions, not ranked rounds." });
          if (step.kind === "writein") return json(res, 409, { error: "For write-ins, show each answer with its own button." });
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
