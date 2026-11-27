// `npm start` entry point. Starts the room on this computer and prints the links.
import { readFileSync } from "node:fs";
import { networkInterfaces } from "node:os";
import { join } from "node:path";
import type { GameDefinition } from "../engine/types.js";
import { createRoomServer } from "./room-server.js";

const gamePath = process.argv[2] ?? join(process.cwd(), "examples/thanksgiving-cookoff/game.json");
const port = Number(process.env.PORT ?? 3000);
const game = JSON.parse(readFileSync(gamePath, "utf8")) as GameDefinition;

const lan = Object.values(networkInterfaces())
  .flat()
  .find((i) => i && i.family === "IPv4" && !i.internal)?.address;
// Phones need the computer's Wi-Fi address, not "localhost", so the QR code uses it.
const joinUrl = `http://${lan ?? "localhost"}:${port}/join`;

const server = await createRoomServer({ game, joinUrl });
server.listen(port, "0.0.0.0", () => {
  console.log(`\n${game.title} is running.\n`);
  console.log(`  TV screen (open on the TV's laptop): http://localhost:${port}`);
  console.log(`  Phones (same Wi-Fi):                 ${joinUrl}`);
  console.log(`  Or scan the QR code on the TV screen.`);
  console.log(`\nPress Ctrl+C to stop.\n`);
});
