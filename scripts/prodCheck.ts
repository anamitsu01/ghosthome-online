// Plays a few rounds as the humans against the test bot ghost on the deployed server.
import { io } from "socket.io-client";
import { HUMAN_ADJ, SPOTS, isHall } from "../lib/map";
import type { Action, ClientRoom } from "../lib/types";

const URL = process.argv[2] ?? "https://ghosthome-online-production.up.railway.app";
const ROUNDS = Number(process.argv[3] ?? 6);
const s = io(URL, { transports: ["websocket"] });
let room: ClientRoom;
let me = "";
let busy = false;
let actions = 0;
const t0 = Date.now();

function emit<T>(ev: string, data: unknown): Promise<{ ok: boolean; error?: string; data?: T }> {
  return new Promise((r) => (s.emit as (e: string, d: unknown, cb: (x: never) => void) => void)(ev, data, r));
}
const pick = <T>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)];

function done(code: number, msg: string) {
  console.log(`${msg} (${actions} human actions, ${((Date.now() - t0) / 1000).toFixed(0)}s)`);
  s.close();
  process.exit(code);
}

async function step() {
  if (busy || room.phase !== "playing" || room.actor !== me) return;
  if (room.ghost) return done(1, "ghost position leaked to the human side");
  busy = true;
  const t = room.turn!;
  const h = room.hunters[t.hunter];
  let a: Action;
  if (t.step === "resolve") a = { t: "resolve", take: (h.items?.length ?? 0) < 2, leave: null };
  else if (t.step === "roll") a = { t: "roll" };
  else {
    const here = SPOTS.filter((sp) => sp.room === h.loc && Math.max(0, sp.cost - 1) <= (t.budget ?? 0));
    if (!isHall(h.loc) && here.length && Math.random() < 0.5) a = { t: "search", spot: pick(here).id };
    else if ((t.budget ?? 0) >= 2) a = { t: "move", loc: pick(HUMAN_ADJ[h.loc]) };
    else a = { t: "end" };
  }
  const res = await emit("game:act", { code: room.code, action: a });
  actions++;
  if (!res.ok) console.log("refused:", a.t, res.error);
  busy = false;
  // The update for this action may have arrived while we were waiting.
  void step();
}

s.on("connect", async () => {
  const res = await emit<{ room: ClientRoom; playerId: string }>("room:createTest", { name: "確認" });
  room = res.data!.room;
  me = res.data!.playerId;
  const bot = room.players.find((p) => p.isBot)!;
  await emit("room:settings", { code: room.code, settings: { ghost: bot.id, characters: "random" } });
  const st = await emit("room:start", { code: room.code });
  console.log("room", room.code, "start", st.ok ? "ok" : st.error);
});
s.on("room:update", (r: ClientRoom) => {
  room = r;
  if (r.phase === "gameover") return done(0, `gameover: ${r.winner} wins at round ${r.turn?.round}`);
  if ((r.turn?.round ?? 0) > ROUNDS) return done(0, `played ${ROUNDS} rounds fine; hunters ${r.hunters.map((h) => h.character + "@" + h.loc).join(" ")}`);
  void step();
});
setTimeout(() => done(1, `timeout at round ${room?.turn?.round}`), 240_000);
