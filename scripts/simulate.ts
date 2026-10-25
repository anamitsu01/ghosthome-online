// Checks a few rules on hand-set situations, then plays random bot games and prints statistics.
import assert from "node:assert/strict";
import { act, addBot, botAct, createRoom, pendingBot, startGame, updateSettings, viewFor } from "../lib/gameEngine";
import { GHOST_ADJ, HUMAN_ADJ, SPOT, SPOTS } from "../lib/map";
import type { Item, RoomState } from "../lib/types";

// ---------- map ----------

assert.equal(SPOTS.length, 32);
assert.equal(SPOTS.filter((s) => SPOT[s.id].room === "bath").length, 4);
assert.ok(!GHOST_ADJ.hall2.includes("attic"), "attic is not next to the hallway");
assert.ok(GHOST_ADJ.hall1.includes("bath") && !HUMAN_ADJ.hall1.includes("bath"), "ghost reaches the hall from the bath, humans don't");
assert.ok(GHOST_ADJ.storage.includes("guest") && !HUMAN_ADJ.storage.includes("guest"));

function newGame(): RoomState {
  let room = createRoom("host", "H", true);
  room = addBot(room, "host");
  room = updateSettings(room, "host", { ghost: room.players[1].id });
  return startGame(room, "host");
}

// ---------- setup ----------

for (let i = 0; i < 200; i++) {
  const room = newGame();
  const ghostSpots = SPOTS.filter((s) => room.spots[s.id]?.type === "ghost");
  assert.equal(ghostSpots.length, 3);
  assert.ok(ghostSpots.filter((s) => s.cost === 3).length >= 2);
  assert.equal(SPOTS.filter((s) => room.spots[s.id]?.type === "human").length, 13);
  const flash = SPOTS.find((s) => {
    const c = room.spots[s.id];
    return c?.type === "human" && c.item.kind === "flashlight";
  })!;
  assert.notEqual(room.hidden!.room, flash.room);
  assert.equal(room.phase, "playing");
  assert.equal(room.turn.side, "ghost");
  assert.ok(room.hunters.every((h) => h.loc === "hall1"));
}

// ---------- scripted situations ----------

const ghostId = (room: RoomState) => room.ghostPlayer;
/** Ends the ghost's turn where it is and hands the first hunter a fixed roll. */
function toHunters(room: RoomState, budget = 6) {
  act(room, ghostId(room), { t: "roll" });
  act(room, ghostId(room), { t: "end" });
  room.turn.step = "move";
  room.turn.budget = budget;
  room.turn.dice = [budget];
}
function give(room: RoomState, slot: number, kind: Item["kind"]) {
  room.hunters[slot].items.push({ id: `t-${kind}`, kind, uses: 3 });
}

{
  // Found before any item: one hit ends it.
  const room = newGame();
  room.ghost.loc = "toilet";
  room.ghost.spot = "toilet-0";
  toHunters(room);
  act(room, "host", { t: "move", loc: "toilet" });
  act(room, "host", { t: "search", spot: "toilet-0" });
  assert.equal(room.phase, "gameover");
  assert.equal(room.winner, "human");
}

{
  // With HP 2 a hit triggers the emergency escape, then the next hunter plays.
  const room = newGame();
  room.ghost.loc = "toilet";
  room.ghost.spot = "toilet-0";
  room.ghost.hp = 2;
  room.ghost.collected = 1;
  room.spots["toilet-0"] = null;
  toHunters(room);
  act(room, "host", { t: "move", loc: "toilet" });
  act(room, "host", { t: "search", spot: "toilet-0" });
  assert.equal(room.ghost.hp, 1);
  assert.ok(room.escape, "escape started");
  assert.equal(viewFor(room, "host").actor, ghostId(room));
  act(room, ghostId(room), { t: "roll" });
  room.escape!.budget = 4;
  act(room, ghostId(room), { t: "gmove", to: "bath-0" });
  act(room, ghostId(room), { t: "end" });
  assert.equal(room.escape, null);
  assert.equal(room.turn.hunter, 1);
}

{
  // The talisman hurts when the ghost steps on its spot; the hand mirror locks the room.
  const room = newGame();
  room.ghost.loc = "hall1";
  room.ghost.spot = null;
  room.ghost.hp = 2;
  room.placed.ofuda.push({ spot: "kitchen-0", item: { id: "o", kind: "ofuda" } });
  room.placed.mirrors.push({ spot: "kitchen-1", item: { id: "m", kind: "mirror" } });
  act(room, ghostId(room), { t: "roll" });
  room.turn.budget = 12;
  act(room, ghostId(room), { t: "gmove", to: "kitchen-0" });
  assert.equal(room.ghost.hp, 1);
  act(room, ghostId(room), { t: "gmove", to: "kitchen-1" });
  act(room, ghostId(room), { t: "end" });
  assert.equal(room.lock?.room, "kitchen");
  // Next ghost turn: may not leave the kitchen.
  for (let i = 0; i < 3; i++) act(room, room.hunters[i].controller, { t: "end" });
  act(room, ghostId(room), { t: "roll" });
  room.turn.budget = 12;
  assert.throws(() => act(room, ghostId(room), { t: "gmove", to: "hall1" }), /出られません/);
  act(room, ghostId(room), { t: "gmove", to: "kitchen-2" });
  act(room, ghostId(room), { t: "end" });
  assert.equal(room.lock, null);
}

{
  // Item 1: HP 2 and a warp. Item 2: humans dragged to the bath. Item 3 (real): full revival.
  const room = newGame();
  for (const s of SPOTS) room.spots[s.id] = null;
  room.spots["attic-0"] = { type: "ghost", name: "bracelet", fake: false };
  room.spots["attic-1"] = { type: "ghost", name: "jewel", fake: false };
  room.spots["attic-2"] = { type: "ghost", name: "knife", fake: false };
  const pickUp = (spot: string) => {
    room.ghost.loc = "attic";
    room.ghost.spot = "attic-3";
    act(room, ghostId(room), { t: "roll" });
    room.turn.budget = 6;
    act(room, ghostId(room), { t: "search", spot });
  };
  pickUp("attic-0");
  assert.equal(room.ghost.hp, 2);
  assert.equal(room.turn.step, "warp");
  act(room, ghostId(room), { t: "warp", spot: "study-0" });
  assert.equal(room.turn.side, "human");
  for (let i = 0; i < 3; i++) act(room, room.hunters[i].controller, { t: "end" });
  pickUp("attic-1");
  assert.equal(room.turn.step, "forced");
  act(room, ghostId(room), { t: "forced", room: "bath" });
  assert.ok(room.hunters.every((h) => h.loc === "bath"));
  act(room, ghostId(room), { t: "warp", spot: "kids-0" });
  for (let i = 0; i < 3; i++) act(room, room.hunters[i].controller, { t: "end" });
  pickUp("attic-2");
  assert.ok(room.ghost.revived);
  assert.equal(room.ghost.hp, 3);
  assert.ok(viewFor(room, "host").ghost, "revived ghost is visible to humans");
  // Revived: a human with the doll survives, the others in the room die.
  act(room, ghostId(room), { t: "end" });
  room.hunters[0].loc = "kids";
  room.hunters[1].loc = "kids";
  give(room, 1, "doll");
  for (let i = 0; i < 3; i++) act(room, room.hunters[i].controller, { t: "end" });
  act(room, ghostId(room), { t: "roll" });
  room.turn.budget = 6;
  act(room, ghostId(room), { t: "gmove", to: "kids-0" });
  assert.equal(room.hunters[0].alive, false);
  assert.equal(room.hunters[1].alive, true);
  assert.equal(room.hunters[1].items.length, 0);
}

{
  // A fake as the 3rd item does nothing; the real 3rd afterwards revives.
  const room = newGame();
  room.ghost.collected = 2;
  room.ghost.real = 2;
  room.ghost.hp = 2;
  room.ghost.loc = "attic";
  room.ghost.spot = "attic-3";
  room.spots["attic-0"] = { type: "ghost", name: "bracelet", fake: true };
  room.spots["attic-1"] = { type: "ghost", name: "jewel", fake: false };
  act(room, ghostId(room), { t: "roll" });
  room.turn.budget = 6;
  act(room, ghostId(room), { t: "search", spot: "attic-0" });
  assert.equal(room.ghost.revived, false);
  act(room, ghostId(room), { t: "end" });
  for (let i = 0; i < 3; i++) act(room, room.hunters[i].controller, { t: "end" });
  act(room, ghostId(room), { t: "roll" });
  room.turn.budget = 6;
  act(room, ghostId(room), { t: "search", spot: "attic-1" });
  assert.equal(room.ghost.revived, true);
}

{
  // Revived ghost: searching its spot costs 0 but only hurts with a weapon.
  const room = newGame();
  room.ghost.revived = true;
  room.ghost.hp = 3;
  room.ghost.loc = "toilet";
  room.ghost.spot = "toilet-1";
  room.spots["toilet-1"] = null;
  room.hunters[0].items = [];
  toHunters(room, 2);
  act(room, "host", { t: "move", loc: "toilet" });
  act(room, "host", { t: "search", spot: "toilet-1" });
  assert.equal(room.ghost.hp, 3);
  room.hunters[1].loc = "toilet";
  give(room, 1, "sword");
  room.turn.step = "move";
  room.turn.budget = 0;
  act(room, room.hunters[1].controller, { t: "search", spot: "toilet-1" });
  assert.equal(room.ghost.hp, 2);
}

{
  // Holy water on the ghost's room: 1 damage, escape, then the same hunter carries on.
  const room = newGame();
  room.ghost.loc = "storage";
  room.ghost.spot = "storage-0";
  room.ghost.hp = 2;
  toHunters(room);
  give(room, 0, "holywater");
  act(room, "host", { t: "move", loc: "storage" });
  act(room, "host", { t: "use", item: "t-holywater" });
  assert.equal(room.ghost.hp, 1);
  act(room, ghostId(room), { t: "roll" });
  room.escape!.budget = 4;
  act(room, ghostId(room), { t: "gmove", to: "hall1" });
  // The ghost can't come back into the storage room until its next turn ends.
  assert.throws(() => act(room, ghostId(room), { t: "gmove", to: "storage-0" }), /聖水/);
  act(room, ghostId(room), { t: "end" });
  assert.equal(room.turn.hunter, 0);
  assert.equal(room.turn.side, "human");
  act(room, "host", { t: "end" });
}

{
  // Hidden view: humans don't see where the ghost is, the ghost doesn't see human items.
  const room = newGame();
  const human = viewFor(room, "host");
  assert.equal(human.ghost, null);
  assert.equal(human.turn!.dice, null);
  give(room, 0, "bell");
  const ghost = viewFor(room, ghostId(room));
  assert.equal(ghost.hunters[0].items, null);
  assert.equal(ghost.placed, null);
}

console.log("rule checks passed");

// ---------- random bot games ----------

const GAMES = 500;
let humanWins = 0;
let revived = 0;
let stuck = 0;
const rounds: number[] = [];
for (let g = 0; g < GAMES; g++) {
  let room = createRoom("host", "H", true);
  room.players[0].isBot = true;
  room = addBot(room, "host");
  room = startGame(room, "host");
  let guard = 0;
  while (room.phase === "playing" && guard++ < 20000) {
    const bot = pendingBot(room)!;
    room = botAct(room, bot.id);
  }
  if (room.phase === "playing") stuck++;
  if (room.winner === "human") humanWins++;
  if (room.ghost.revived) revived++;
  rounds.push(room.turn.round);
}
rounds.sort((a, b) => a - b);
console.log(
  `random bots, ${GAMES} games: human wins ${humanWins}, ghost revived ${revived}, unfinished ${stuck}, rounds median ${rounds[GAMES >> 1]} (max ${rounds[GAMES - 1]})`
);
