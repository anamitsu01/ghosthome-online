import {
  CHARACTER_IDS,
  CHARACTERS,
  GHOST_ITEM_NAMES,
  GHOST_ITEMS,
  HIDDEN_ITEM_KINDS,
  HUMAN_ITEM_KINDS,
  ITEMS,
  type CharacterId,
  type ItemKind,
} from "./catalog";
import {
  FORCED_ROOMS,
  GHOST_ADJ,
  HUMAN_ADJ,
  MOVE_COST,
  ROOM,
  ROOM_IDS,
  SPOT,
  SPOTS,
  hearsFrom,
  isHall,
  locName,
  spotName,
  type LocId,
  type RoomId,
} from "./map";
import {
  HUNTERS,
  MAX_PLAYERS,
  MIN_PLAYERS,
  type Action,
  type Audience,
  type ClientRoom,
  type Hunter,
  type Item,
  type KnownSpot,
  type Player,
  type RoomSettings,
  type RoomState,
  type Side,
  type SpotContent,
  type Tone,
} from "./types";

export class GameError extends Error {}

const LOGS_KEPT = 80;

function randInt(n: number): number {
  return Math.floor(Math.random() * n);
}
function pick<T>(xs: T[]): T {
  return xs[randInt(xs.length)];
}
function shuffle<T>(xs: T[]): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = randInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function rollDice(n: number): number[] {
  return Array.from({ length: n }, () => 1 + randInt(6));
}
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

function makeCode(): string {
  // No Z, so a real room can never collide with the test code.
  const letters = "ABCDEFGHJKLMNPQRSTUVWXY";
  return Array.from({ length: 5 }, () => letters[randInt(letters.length)]).join("");
}

function newPlayer(id: string, name: string, isHost: boolean, isBot = false): Player {
  return { id, name, connected: true, isHost, isBot };
}

function getPlayer(room: RoomState, playerId: string): Player {
  const player = room.players.find((p) => p.id === playerId);
  if (!player) throw new GameError("このプレイヤーは部屋にいません");
  return player;
}

function requireHost(room: RoomState, playerId: string): void {
  if (!getPlayer(room, playerId).isHost) throw new GameError("ホストだけができる操作です");
}

// ---------- lobby ----------

function emptyGame(): Pick<
  RoomState,
  | "ghostPlayer"
  | "picks"
  | "hunters"
  | "ghost"
  | "spots"
  | "hidden"
  | "placed"
  | "humanKnow"
  | "ghostKnow"
  | "ghostSearchedAll"
  | "turn"
  | "escape"
  | "ghostTurns"
  | "lock"
  | "crystalNext"
  | "usedThisRound"
  | "logs"
  | "logSeq"
  | "winner"
  | "nextItemId"
> {
  return {
    ghostPlayer: "",
    picks: [null, null, null],
    hunters: [],
    ghost: { loc: "hall1", spot: null, hp: 1, collected: 0, real: 0, revived: false, held: [], startSpot: "" },
    spots: {},
    hidden: null,
    placed: { bells: [], ofuda: [], mirrors: [], holy: [], candles: [] },
    humanKnow: { spots: {}, hiddenRoom: null, hiddenFound: false, ghostSearched: [] },
    ghostKnow: {},
    ghostSearchedAll: [],
    turn: { round: 0, side: "ghost", hunter: 0, step: "roll", dice: [], budget: 0, searched: false, resolveSpot: null, pendingEscape: false, path: [] },
    escape: null,
    ghostTurns: 0,
    lock: null,
    crystalNext: false,
    usedThisRound: [],
    logs: [],
    logSeq: 0,
    winner: null,
    nextItemId: 1,
  };
}

export function createRoom(hostId: string, name: string, isTest = false): RoomState {
  return {
    code: makeCode(),
    isTest,
    phase: "lobby",
    players: [newPlayer(hostId, name, true)],
    settings: { ghost: "random", characters: "random" },
    game: 0,
    createdAt: Date.now(),
    ...emptyGame(),
  };
}

export function addPlayer(room: RoomState, playerId: string, name: string): RoomState {
  if (room.phase !== "lobby") throw new GameError("ゲームはすでに始まっています");
  if (room.players.length >= MAX_PLAYERS) throw new GameError(`部屋が満員です(${MAX_PLAYERS}人まで)`);
  room.players.push(newPlayer(playerId, name, false));
  return room;
}

export function removePlayer(room: RoomState, playerId: string): RoomState {
  room.players = room.players.filter((p) => p.id !== playerId);
  if (room.settings.ghost === playerId) room.settings.ghost = "random";
  if (!room.players.some((p) => p.isHost)) {
    const next = room.players.find((p) => !p.isBot);
    if (next) next.isHost = true;
  }
  return room;
}

export function markConnection(room: RoomState, playerId: string, connected: boolean): RoomState {
  getPlayer(room, playerId).connected = connected;
  return room;
}

export function addBot(room: RoomState, hostId: string): RoomState {
  requireHost(room, hostId);
  if (!room.isTest) throw new GameError("テスト用の相手はテスト部屋でだけ使えます");
  if (room.phase !== "lobby") throw new GameError("ゲームはすでに始まっています");
  if (room.players.length >= MAX_PLAYERS) throw new GameError(`部屋が満員です(${MAX_PLAYERS}人まで)`);
  const n = room.players.filter((p) => p.isBot).length + 1;
  room.players.push(newPlayer(`bot-${Date.now()}-${randInt(1e6)}`, `テスト${n}`, false, true));
  return room;
}

export function removeBot(room: RoomState, hostId: string, botId: string): RoomState {
  requireHost(room, hostId);
  if (room.phase !== "lobby") throw new GameError("ゲームはすでに始まっています");
  return removePlayer(room, botId);
}

export function updateSettings(room: RoomState, hostId: string, settings: Partial<RoomSettings>): RoomState {
  requireHost(room, hostId);
  if (room.phase !== "lobby") throw new GameError("ゲームはすでに始まっています");
  if (settings.ghost && (settings.ghost === "random" || room.players.some((p) => p.id === settings.ghost))) {
    room.settings.ghost = settings.ghost;
  }
  if (settings.characters === "random" || settings.characters === "free") room.settings.characters = settings.characters;
  return room;
}

// ---------- logging ----------

function log(room: RoomState, to: Audience, text: string, tone: Tone = "info", where: { loc?: LocId; spot?: string } = {}): void {
  room.logs.push({ seq: ++room.logSeq, to, text, tone, ...where });
  room.logs = room.logs.slice(-LOGS_KEPT);
}

function hunterName(h: Hunter): string {
  return CHARACTERS[h.character].name;
}

// ---------- setup ----------

export function startGame(room: RoomState, hostId: string): RoomState {
  requireHost(room, hostId);
  if (room.phase !== "lobby") throw new GameError("ゲームはすでに始まっています");
  if (room.players.length < MIN_PLAYERS) throw new GameError("2人以上そろうと始められます");
  Object.assign(room, emptyGame());
  room.game += 1;
  room.ghostPlayer = room.settings.ghost === "random" ? pick(room.players).id : room.settings.ghost;
  const humansSide = humanPlayers(room);
  const allBots = humansSide.every((p) => p.isBot);
  if (room.settings.characters === "random" || allBots) {
    beginPlay(room, shuffle(CHARACTER_IDS).slice(0, HUNTERS));
  } else {
    room.phase = "setup";
  }
  return room;
}

function humanPlayers(room: RoomState): Player[] {
  return room.players.filter((p) => p.id !== room.ghostPlayer);
}

function sideOf(room: RoomState, playerId: string): Side | null {
  if (room.phase === "lobby") return null;
  if (!room.players.some((p) => p.id === playerId)) return null;
  return playerId === room.ghostPlayer ? "ghost" : "human";
}

function setupPick(room: RoomState, playerId: string, slot: number, character: CharacterId | null): RoomState {
  if (room.phase !== "setup") throw new GameError("キャラクター選択中ではありません");
  if (sideOf(room, playerId) !== "human") throw new GameError("人間側のプレイヤーが選びます");
  if (!(slot >= 0 && slot < HUNTERS)) throw new GameError("不正な枠です");
  if (character && !CHARACTER_IDS.includes(character)) throw new GameError("不明なキャラクターです");
  if (character && room.picks.some((c, i) => c === character && i !== slot)) throw new GameError("そのキャラクターは選択済みです");
  room.picks[slot] = character;
  return room;
}

function confirmSetup(room: RoomState, playerId: string): RoomState {
  if (room.phase !== "setup") throw new GameError("キャラクター選択中ではありません");
  if (sideOf(room, playerId) !== "human") throw new GameError("人間側のプレイヤーが決定します");
  if (room.picks.some((c) => !c)) throw new GameError("3人ぶん選んでください");
  beginPlay(room, room.picks as CharacterId[]);
  return room;
}

function newItem(room: RoomState, kind: ItemKind): Item {
  const item: Item = { id: `i${room.nextItemId++}`, kind };
  if (ITEMS[kind].uses) item.uses = ITEMS[kind].uses;
  return item;
}

function beginPlay(room: RoomState, characters: CharacterId[]): void {
  room.phase = "playing";
  const controllers = humanPlayers(room);
  room.hunters = characters.map((character, slot) => ({
    slot,
    character,
    controller: controllers[slot % controllers.length].id,
    loc: "hall1",
    alive: true,
    items: [],
    psychicUsed: false,
    gamblerNext: false,
  }));

  // Ghost items: at least 2 of the 3 behind cost-3 spots, no other evening out.
  const spots: Record<string, SpotContent> = Object.fromEntries(SPOTS.map((s) => [s.id, null]));
  const cost3 = shuffle(SPOTS.filter((s) => s.cost === 3).map((s) => s.id));
  const ghostSpots = cost3.slice(0, 2);
  ghostSpots.push(pick(SPOTS.map((s) => s.id).filter((id) => !ghostSpots.includes(id))));
  shuffle(GHOST_ITEM_NAMES).forEach((name, i) => (spots[ghostSpots[i]] = { type: "ghost", name, fake: false }));
  // Human items: completely random over the remaining spots.
  const free = shuffle(SPOTS.map((s) => s.id).filter((id) => !spots[id]));
  HUMAN_ITEM_KINDS.forEach((kind, i) => (spots[free[i]] = { type: "human", item: newItem(room, kind) }));
  room.spots = spots;
  // Hidden item: in a room (not a spot), never the room holding the flashlight.
  const flashSpot = Object.keys(spots).find((id) => {
    const c = spots[id];
    return c?.type === "human" && c.item.kind === "flashlight";
  })!;
  const hiddenRoom = pick(ROOM_IDS.filter((r) => r !== SPOT[flashSpot].room));
  room.hidden = { kind: pick(HIDDEN_ITEM_KINDS), room: hiddenRoom };

  const start = pick(SPOTS);
  room.ghost.loc = start.room;
  room.ghost.spot = start.id;
  room.ghost.startSpot = start.id;

  log(room, "all", `ゲーム開始。人間側: ${room.hunters.map(hunterName).join("・")}`, "info");
  for (const h of room.hunters) {
    if (h.character === "magician") {
      const fake = newItem(room, "fake");
      fake.mimic = pick(GHOST_ITEM_NAMES);
      h.items.push(fake);
    }
    if (h.character === "medium") {
      log(room, "human", `霊媒師の力: 幽霊は ${spotName(start.id)} に潜んでいる…`, "good", { spot: start.id });
    }
    if (h.character === "jujutsu") {
      room.humanKnow.hiddenRoom = hiddenRoom;
      log(room, "human", `呪術師の力: 隠しアイテムは ${ROOM[hiddenRoom].name} にある`, "good", { loc: hiddenRoom });
    }
  }
  log(room, "ghost", `あなたは ${spotName(start.id)} で目を覚ました。3つの品を集めて力を取り戻せ。`, "info", { spot: start.id });
  startGhostTurn(room);
}

// ---------- shared helpers ----------

function aliveHunters(room: RoomState): Hunter[] {
  return room.hunters.filter((h) => h.alive);
}

function capacity(h: Hunter): number {
  return h.character === "painter" ? 3 : 2;
}

function has(h: Hunter, kind: ItemKind): boolean {
  return h.items.some((i) => i.kind === kind);
}

function holyBlocked(room: RoomState, r: RoomId): boolean {
  return room.placed.holy.some((h) => h.room === r && room.ghostTurns < h.until);
}

function lockedRoom(room: RoomState): RoomId | null {
  return room.lock && room.ghostTurns < room.lock.until ? room.lock.room : null;
}

function endGame(room: RoomState, winner: Side, text: string): void {
  room.winner = winner;
  room.phase = "gameover";
  room.escape = null;
  log(room, "all", text, winner === "human" ? "good" : "bad");
}

function over(room: RoomState): boolean {
  return room.phase !== "playing";
}

/** Damage to the ghost. Returns true if that finished it. */
function damageGhost(room: RoomState, amount: number, cause: string): boolean {
  room.ghost.hp -= amount;
  log(room, "all", `${cause} 幽霊に${amount}ダメージ!`, "good", room.ghost.revived ? { spot: room.ghost.spot ?? undefined } : {});
  if (room.ghost.hp <= 0) {
    endGame(room, "human", "幽霊は消え去った…人間側の勝利!");
    return true;
  }
  return false;
}

// ---------- ghost ----------

function ghostDice(room: RoomState): number {
  return room.ghost.revived ? 3 : 2;
}

function startGhostTurn(room: RoomState): void {
  room.turn = {
    round: room.turn.round + 1,
    side: "ghost",
    hunter: 0,
    step: "roll",
    dice: [],
    budget: 0,
    searched: false,
    resolveSpot: null,
    pendingEscape: false,
    path: [room.ghost.loc],
  };
  room.usedThisRound = [];
}

interface GhostStep {
  loc: LocId;
  spot: string | null;
  cost: number;
}

/**
 * Where the ghost can go from where it is, and what it costs. `to` is a spot id
 * or a hallway. After searching, only other spots in the same room.
 */
export function ghostStepCost(room: RoomState, to: string, afterSearch: boolean): GhostStep | string {
  const g = room.ghost;
  let target: { loc: LocId; spot: string | null };
  if (SPOT[to]) target = { loc: SPOT[to].room, spot: to };
  else if (to === "hall1" || to === "hall2") target = { loc: to, spot: null };
  else return "その場所には行けません";
  if (target.loc === g.loc) {
    if (!target.spot || target.spot === g.spot) return "すでにそこにいます";
    return { ...target, cost: 0 };
  }
  if (afterSearch) return "探索した後は部屋から出られません";
  const locked = lockedRoom(room);
  if (locked && g.loc === locked) return "手鏡の力で、この部屋から出られません";
  if (!GHOST_ADJ[g.loc].includes(target.loc)) return "隣の部屋・廊下にしか移動できません";
  if (!isHall(target.loc) && holyBlocked(room, target.loc)) return "聖水が撒かれていて入れません";
  if (!isHall(target.loc) && !target.spot) return "部屋に入るときは潜伏場所を選びます";
  let cost = MOVE_COST;
  if (!isHall(target.loc) && aliveHunters(room).some((h) => h.character === "scientist" && h.loc === target.loc)) {
    cost += 2;
  }
  return { ...target, cost };
}

/** Puts the ghost on a place and runs everything that happens there. Returns true if the game ended. */
function ghostArrive(room: RoomState, loc: LocId, spot: string | null, canKill: boolean): boolean {
  const g = room.ghost;
  const entered = loc !== g.loc;
  g.loc = loc;
  g.spot = spot;
  if (room.turn.path[room.turn.path.length - 1] !== loc) room.turn.path.push(loc);

  if (entered && !isHall(loc)) {
    for (const b of room.placed.bells) {
      if (b.room === loc) log(room, "human", `🔔 ${ROOM[loc].name}の鈴が鳴った!`, "warn", { loc });
    }
  }
  if (spot) {
    const ofuda = room.placed.ofuda.find((o) => o.spot === spot);
    if (ofuda) {
      room.placed.ofuda = room.placed.ofuda.filter((o) => o !== ofuda);
      log(room, "all", `📜 ${spotName(spot)}の落魂札が発動した!`, "warn", { spot });
      if (damageGhost(room, 1, "落魂札の力で")) return true;
    }
  }
  if (canKill && g.revived) {
    for (const h of aliveHunters(room).filter((x) => x.loc === loc)) {
      const doll = h.items.find((i) => i.kind === "doll");
      if (doll) {
        h.items = h.items.filter((i) => i !== doll);
        log(room, "all", `🧸 ${hunterName(h)}の身代わり人形が砕けた!`, "warn", { loc });
        continue;
      }
      h.alive = false;
      const stone = has(h, "stone");
      h.items = [];
      log(room, "all", `💀 ${hunterName(h)}は幽霊に襲われた…`, "bad", { loc });
      if (!aliveHunters(room).length) {
        endGame(room, "ghost", "人間は全滅した…幽霊の勝利!");
        return true;
      }
      if (stone && damageGhost(room, 1, "正邪の秘石が光り、")) return true;
    }
  }
  return false;
}

/** Hiding at the end of a ghost turn or escape: the hand mirror springs here. */
function ghostHide(room: RoomState, normalTurn: boolean): void {
  const g = room.ghost;
  if (!g.spot) return;
  const mirror = room.placed.mirrors.find((m) => m.spot === g.spot);
  if (mirror) {
    room.placed.mirrors = room.placed.mirrors.filter((m) => m !== mirror);
    room.lock = { room: g.loc as RoomId, until: room.ghostTurns + (normalTurn ? 2 : 1) };
    log(room, "all", `🪞 ${spotName(g.spot)}の手鏡が幽霊を映した! 次の幽霊ターンは${ROOM[g.loc as RoomId].name}から出られない`, "warn", {
      spot: g.spot,
    });
  }
}

function ghostRoll(room: RoomState): void {
  const dice = rollDice(ghostDice(room));
  room.turn.dice = dice;
  room.turn.budget = sum(dice);
  room.turn.step = "move";
  log(room, "ghost", `サイコロ: ${dice.join(" + ")} = ${sum(dice)}`);
  if (room.crystalNext) {
    room.crystalNext = false;
    log(room, "human", `🔮 水晶玉: 幽霊のサイコロは ${dice.join(" + ")} = ${sum(dice)}`, "good");
  }
}

function ghostMove(room: RoomState, to: string): void {
  const step = ghostStepCost(room, to, room.turn.searched);
  if (typeof step === "string") throw new GameError(step);
  if (step.cost > room.turn.budget) throw new GameError(`移動力が足りません(必要 ${step.cost})`);
  room.turn.budget -= step.cost;
  ghostArrive(room, step.loc, step.spot, true);
}

function ghostSearch(room: RoomState, spotId: string): void {
  const g = room.ghost;
  const spot = SPOT[spotId];
  if (room.turn.searched) throw new GameError("探索は1ターンに1回です");
  if (!spot || spot.room !== g.loc) throw new GameError("今いる部屋の潜伏場所しか探索できません");
  const cost = spot.cost + (room.placed.candles.includes(spot.room) ? 2 : 0);
  if (cost > room.turn.budget) throw new GameError(`移動力が足りません(探索コスト ${cost})`);
  room.turn.budget -= cost;
  room.turn.searched = true;
  room.turn.step = "hide";
  if (!room.ghostSearchedAll.includes(spotId)) room.ghostSearchedAll.push(spotId);

  // Noise: same room hears the exact spot, the rooms around hear the room.
  const near = hearsFrom(spot.room);
  const sameRoom = aliveHunters(room).some((h) => h.loc === spot.room);
  if (sameRoom) {
    log(room, "human", `👻 気配! ${spotName(spotId)}で何かが探っている`, "warn", { spot: spotId });
  } else if (aliveHunters(room).some((h) => near.includes(h.loc))) {
    log(room, "human", `👻 気配… ${ROOM[spot.room].name}で何かが動いた`, "warn", { loc: spot.room });
  }

  const content = room.spots[spotId];
  room.ghostKnow[spotId] = known(content);
  if (content?.type !== "ghost") {
    log(room, "ghost", `${spotName(spotId)}を探索: ${content ? `${ITEMS[content.item.kind].name}(人間の道具)` : "何もない"}`, "info", {
      spot: spotId,
    });
    return;
  }

  room.spots[spotId] = null;
  room.ghostKnow[spotId] = { type: "empty" };
  g.collected += 1;
  if (!content.fake) g.real += 1;
  g.held.push(content.name);
  log(room, "ghost", `✨ ${spotName(spotId)}で${GHOST_ITEMS[content.name].name}を手に入れた!`, "good", { spot: spotId });
  if (g.collected === 1) {
    g.hp += 1;
    room.turn.step = "warp";
    log(room, "ghost", "力が少し戻った(体力2)。好きな潜伏場所へワープできる。", "good");
  } else if (g.collected === 2) {
    room.turn.step = "forced";
    log(room, "ghost", "人間たちを屋根裏部屋かバスルームへ引きずり込め。その後ワープできる。", "good");
  } else if (!g.revived && g.real >= 3) {
    g.revived = true;
    g.hp += 1;
    log(room, "all", `🟥 幽霊が完全復活した! 居場所は ${spotName(g.spot!)}`, "bad", { spot: g.spot! });
  } else {
    log(room, "ghost", "…何も起きない。どれかが偽物だったようだ。", "warn");
  }
}

function ghostForced(room: RoomState, target: RoomId): void {
  if (!FORCED_ROOMS.includes(target)) throw new GameError("屋根裏部屋かバスルームを選びます");
  for (const h of aliveHunters(room)) arriveHunter(room, h, target);
  log(room, "all", `🌀 人間たちは全員${ROOM[target].name}へ引きずり込まれた!`, "bad", { loc: target });
  room.turn.step = "warp";
}

function ghostWarp(room: RoomState, spotId: string): void {
  const spot = SPOT[spotId];
  if (!spot) throw new GameError("潜伏場所を選んでください");
  if (holyBlocked(room, spot.room)) throw new GameError("聖水が撒かれていて入れません");
  log(room, "ghost", `${spotName(spotId)}へワープした`, "info", { spot: spotId });
  if (ghostArrive(room, spot.room, spotId, false)) return;
  finishGhostTurn(room);
}

function finishGhostTurn(room: RoomState): void {
  ghostHide(room, true);
  room.ghostTurns += 1;
  if (room.lock && room.ghostTurns >= room.lock.until) room.lock = null;
  room.placed.holy = room.placed.holy.filter((h) => room.ghostTurns < h.until);
  const first = aliveHunters(room)[0];
  startHunterTurn(room, first.slot);
}

function ghostAction(room: RoomState, action: Action): void {
  const t = room.turn;
  switch (action.t) {
    case "roll":
      if (t.step !== "roll") throw new GameError("もうサイコロを振りました");
      ghostRoll(room);
      return;
    case "gmove":
      if (t.step !== "move" && t.step !== "hide") throw new GameError("今は移動できません");
      ghostMove(room, action.to);
      return;
    case "search":
      if (t.step !== "move") throw new GameError("今は探索できません");
      ghostSearch(room, action.spot);
      return;
    case "forced":
      if (t.step !== "forced") throw new GameError("今は選べません");
      ghostForced(room, action.room);
      return;
    case "warp":
      if (t.step !== "warp") throw new GameError("今はワープできません");
      ghostWarp(room, action.spot);
      return;
    case "end":
      if (t.step !== "move" && t.step !== "hide") throw new GameError("今は終了できません");
      log(room, "ghost", room.ghost.spot ? `${spotName(room.ghost.spot)}に潜伏した` : `${locName(room.ghost.loc)}に潜んだ`);
      finishGhostTurn(room);
      return;
    default:
      throw new GameError("幽霊にはできない操作です");
  }
}

// ---------- emergency escape ----------

function startEscape(room: RoomState, resume: "continue" | "next"): void {
  room.escape = { step: "roll", dice: [], budget: 0, resume };
  log(room, "ghost", "見つかった! 緊急逃走(サイコロを振り直して移動。探索はできない)", "bad");
  log(room, "human", "幽霊が逃げていく…", "info");
}

function escapeAction(room: RoomState, action: Action): void {
  const e = room.escape!;
  switch (action.t) {
    case "roll": {
      if (e.step !== "roll") throw new GameError("もうサイコロを振りました");
      e.dice = rollDice(ghostDice(room));
      e.budget = sum(e.dice);
      e.step = "move";
      log(room, "ghost", `逃走のサイコロ: ${e.dice.join(" + ")} = ${e.budget}`);
      return;
    }
    case "gmove": {
      if (e.step !== "move") throw new GameError("先にサイコロを振ってください");
      const step = ghostStepCost(room, action.to, false);
      if (typeof step === "string") throw new GameError(step);
      if (step.cost > e.budget) throw new GameError(`移動力が足りません(必要 ${step.cost})`);
      e.budget -= step.cost;
      ghostArrive(room, step.loc, step.spot, true);
      return;
    }
    case "end": {
      if (e.step !== "move") throw new GameError("先にサイコロを振ってください");
      ghostHide(room, false);
      log(room, "ghost", room.ghost.spot ? `${spotName(room.ghost.spot)}に逃げ込んだ` : `${locName(room.ghost.loc)}に逃げ込んだ`);
      room.escape = null;
      const h = room.hunters[room.turn.hunter];
      if (e.resume === "next" || !h.alive) nextHunter(room);
      return;
    }
    default:
      throw new GameError("逃走中はサイコロ・移動・潜伏だけです");
  }
}

// ---------- humans ----------

function startHunterTurn(room: RoomState, slot: number): void {
  room.turn = {
    round: room.turn.round,
    side: "human",
    hunter: slot,
    step: "roll",
    dice: [],
    budget: 0,
    searched: false,
    resolveSpot: null,
    pendingEscape: false,
    path: [room.hunters[slot].loc],
  };
}

function nextHunter(room: RoomState): void {
  if (over(room)) return;
  if (room.turn.pendingEscape) {
    room.turn.pendingEscape = false;
    startEscape(room, "next");
    return;
  }
  const next = aliveHunters(room).find((h) => h.slot > room.turn.hunter);
  if (next) startHunterTurn(room, next.slot);
  else startGhostTurn(room);
}

function hunterDice(h: Hunter): number {
  return 1 + (has(h, "redbeads") && has(h, "bluebeads") ? 1 : 0) + (h.gamblerNext ? 1 : 0);
}

function known(content: SpotContent): KnownSpot {
  if (!content) return { type: "empty" };
  if (content.type === "human") return { type: "human", kind: content.item.kind };
  return { type: "ghost", name: content.name, fake: content.fake };
}

function describe(content: SpotContent): string {
  if (!content) return "何もない";
  if (content.type === "human") return ITEMS[content.item.kind].name;
  return content.fake ? `${GHOST_ITEMS[content.name].name}(偽物)` : `${GHOST_ITEMS[content.name].name}(幽霊の品)`;
}

/** A hunter steps into a place: the flashlight and the 巫女 work on arrival. */
function arriveHunter(room: RoomState, h: Hunter, loc: LocId): void {
  h.loc = loc;
  if (room.turn.side === "human" && room.turn.hunter === h.slot && room.turn.path[room.turn.path.length - 1] !== loc) {
    room.turn.path.push(loc);
  }
  if (isHall(loc)) return;
  if (room.hidden && room.hidden.room === loc && has(h, "flashlight") && !room.humanKnow.hiddenFound) {
    room.humanKnow.hiddenFound = true;
    room.humanKnow.hiddenRoom = loc;
    log(room, "human", `🔦 懐中電灯が${ROOM[loc].name}に隠された${ITEMS[room.hidden.kind].name}を照らし出した!(探索で取れる)`, "good", { loc });
    if (room.ghost.loc === loc) log(room, "ghost", `${hunterName(h)}が${ROOM[loc].name}で何かを見つけたようだ…`, "warn", { loc });
  }
  if (h.character === "miko") {
    const found = room.ghostSearchedAll.filter((s) => SPOT[s].room === loc && !room.humanKnow.ghostSearched.includes(s));
    if (found.length) {
      room.humanKnow.ghostSearched.push(...found);
      log(room, "human", `⛩ 巫女の力: 幽霊は ${found.map((s) => SPOT[s].name).join("・")} を探ったことがある`, "good", { loc });
    }
  }
}

function hunterAction(room: RoomState, h: Hunter, action: Action): void {
  const t = room.turn;
  if (t.step === "resolve" && action.t !== "resolve") throw new GameError("探索の結果を決めてください");
  if (t.searched && t.step !== "resolve") throw new GameError("探索したのでターンは終わりです");
  switch (action.t) {
    case "roll": {
      if (t.step !== "roll") throw new GameError("もうサイコロを振りました");
      const dice = rollDice(hunterDice(h));
      h.gamblerNext = false;
      t.dice = dice;
      t.budget = sum(dice);
      t.step = "move";
      log(room, "human", `${hunterName(h)}のサイコロ: ${dice.join(" + ")}${dice.length > 1 ? ` = ${sum(dice)}` : ""}`);
      return;
    }
    case "psychic": {
      if (h.character !== "psychic") throw new GameError("超能力者だけの力です");
      if (h.psychicUsed) throw new GameError("ワープはもう使いました");
      if (t.step !== "roll") throw new GameError("ワープはサイコロを振る前だけです");
      if (!(action.loc in HUMAN_ADJ) || action.loc === h.loc) throw new GameError("その場所には行けません");
      h.psychicUsed = true;
      log(room, "all", `🌀 超能力者が${locName(action.loc)}へワープした`, "info", { loc: action.loc });
      arriveHunter(room, h, action.loc);
      return;
    }
    case "move": {
      if (t.step !== "move") throw new GameError("先にサイコロを振ってください");
      if (!HUMAN_ADJ[h.loc].includes(action.loc)) throw new GameError("出入口でつながった隣の部屋・廊下にしか行けません");
      if (MOVE_COST > t.budget) throw new GameError(`移動力が足りません(必要 ${MOVE_COST})`);
      t.budget -= MOVE_COST;
      arriveHunter(room, h, action.loc);
      return;
    }
    case "search":
      hunterSearch(room, h, action.spot);
      return;
    case "hidden":
      takeHidden(room, h);
      return;
    case "resolve":
      resolveSearch(room, h, action.take, action.leave);
      return;
    case "use":
      applyItem(room, h, action.item, action.spot);
      return;
    case "pickup":
      pickupPlaced(room, h, action.item);
      return;
    case "give":
    case "take": {
      const other = room.hunters[action.t === "give" ? action.to : action.from];
      if (!other || other === h || !other.alive) throw new GameError("相手がいません");
      if (other.loc !== h.loc) throw new GameError("同じ部屋・廊下にいる仲間とだけ受け渡しできます");
      const [from, to] = action.t === "give" ? [h, other] : [other, h];
      const item = from.items.find((i) => i.id === action.item);
      if (!item) throw new GameError("そのアイテムを持っていません");
      if (to.items.length >= capacity(to)) throw new GameError(`${hunterName(to)}はもう持てません`);
      from.items = from.items.filter((i) => i !== item);
      to.items.push(item);
      log(room, "human", `${hunterName(from)} → ${hunterName(to)}: ${ITEMS[item.kind].name}を渡した`);
      return;
    }
    case "end":
      log(room, "human", `${hunterName(h)}は${locName(h.loc)}でターンを終えた`);
      nextHunter(room);
      return;
    default:
      throw new GameError("人間にはできない操作です");
  }
}

function searchCost(room: RoomState, spotId: string): number {
  if (room.ghost.revived && room.ghost.spot === spotId) return 0;
  return Math.max(0, SPOT[spotId].cost - 1);
}

function hunterSearch(room: RoomState, h: Hunter, spotId: string): void {
  const t = room.turn;
  const spot = SPOT[spotId];
  if (!spot || spot.room !== h.loc) throw new GameError("今いる部屋の潜伏場所しか探索できません");
  const cost = searchCost(room, spotId);
  if (cost > t.budget) throw new GameError(`移動力が足りません(探索コスト ${cost})`);
  t.budget -= cost;
  t.searched = true;

  const content = room.spots[spotId];
  room.humanKnow.spots[spotId] = known(content);
  log(room, "human", `${hunterName(h)}が${spotName(spotId)}を探索: ${describe(content)}`, "info", { spot: spotId });
  if (room.ghost.loc === spot.room) {
    log(room, "ghost", `${hunterName(h)}が${spotName(spotId)}を探索した: ${describe(content)}`, "warn", { spot: spotId });
  }

  if (room.ghost.spot === spotId) {
    const dmg = has(h, "spear") ? 2 : room.ghost.revived ? (has(h, "sword") ? 1 : 0) : 1;
    if (dmg === 0) {
      log(room, "all", `${hunterName(h)}は幽霊の前に立ったが、傷つける武器がない…`, "warn", { spot: spotId });
    } else {
      if (!room.ghost.revived) log(room, "all", `❗ ${hunterName(h)}が${spotName(spotId)}で幽霊を見つけた!`, "good", { spot: spotId });
      if (damageGhost(room, dmg, `${hunterName(h)}の一撃で`)) return;
      t.pendingEscape = true;
    }
  }

  const canTake = content?.type === "human";
  const canLeave = !content && h.items.length > 0;
  if (canTake || canLeave) {
    t.step = "resolve";
    t.resolveSpot = spotId;
  } else {
    nextHunter(room);
  }
}

function resolveSearch(room: RoomState, h: Hunter, take: boolean, leaveId: string | null): void {
  const t = room.turn;
  if (t.step !== "resolve" || !t.resolveSpot) throw new GameError("決めることはありません");
  const spotId = t.resolveSpot;
  const content = room.spots[spotId];
  const leave = leaveId ? h.items.find((i) => i.id === leaveId) : undefined;
  if (leaveId && !leave) throw new GameError("そのアイテムを持っていません");
  if (content?.type === "human") {
    if (take) {
      if (!leave && h.items.length >= capacity(h)) throw new GameError("持ち物がいっぱいです。置いていくアイテムを選んでください");
      h.items.push(content.item);
      room.spots[spotId] = null;
      log(room, "human", `${hunterName(h)}は${ITEMS[content.item.kind].name}を手に入れた`, "good", { spot: spotId });
    } else if (leave) {
      throw new GameError("取らないなら置くこともできません");
    }
  }
  if (leave) {
    if (room.spots[spotId]) throw new GameError("そこにはもう物があります");
    h.items = h.items.filter((i) => i !== leave);
    room.spots[spotId] =
      leave.kind === "fake" ? { type: "ghost", name: leave.mimic!, fake: true } : { type: "human", item: leave };
    log(room, "human", `${hunterName(h)}は${spotName(spotId)}に${ITEMS[leave.kind].name}${leave.kind === "fake" ? `(${GHOST_ITEMS[leave.mimic!].name})` : ""}を置いた`, "info", {
      spot: spotId,
    });
    if (room.ghost.loc === SPOT[spotId].room) {
      log(room, "ghost", `${hunterName(h)}が${spotName(spotId)}に何かを置いた: ${describe(room.spots[spotId])}`, "warn", { spot: spotId });
    }
  }
  room.humanKnow.spots[spotId] = known(room.spots[spotId]);
  t.step = "move";
  t.resolveSpot = null;
  nextHunter(room);
}

function takeHidden(room: RoomState, h: Hunter): void {
  const t = room.turn;
  if (!room.hidden || !room.humanKnow.hiddenFound || room.hidden.room !== h.loc) throw new GameError("ここに見つけた隠しアイテムはありません");
  if (h.items.length >= capacity(h)) throw new GameError("持ち物がいっぱいです(仲間に渡すか置いてから)");
  t.searched = true;
  h.items.push(newItem(room, room.hidden.kind));
  log(room, "human", `${hunterName(h)}は${ITEMS[room.hidden.kind].name}を手に入れた!`, "good", { loc: h.loc });
  if (room.ghost.loc === h.loc) log(room, "ghost", `${hunterName(h)}が${ITEMS[room.hidden.kind].name}を手に入れた!`, "bad", { loc: h.loc });
  room.hidden = null;
  nextHunter(room);
}

function applyItem(room: RoomState, h: Hunter, itemId: string, spotId?: string): void {
  const item = h.items.find((i) => i.id === itemId);
  if (!item) throw new GameError("そのアイテムを持っていません");
  const def = ITEMS[item.kind];
  if (def.use === "passive") throw new GameError("持っているだけで効果があります");
  if (room.usedThisRound.includes(item.id)) throw new GameError("このアイテムはこのターンもう使いました");
  const inRoom = !isHall(h.loc);
  const r = h.loc as RoomId;
  const drop = () => (h.items = h.items.filter((i) => i !== item));
  const spend = () => {
    item.uses = (item.uses ?? 1) - 1;
    if (item.uses <= 0) drop();
  };

  switch (item.kind) {
    case "bell":
    case "holywater":
    case "candle":
      if (!inRoom) throw new GameError("廊下には置けません");
      break;
    case "ofuda":
    case "mirror":
      if (!inRoom) throw new GameError("廊下には置けません");
      if (!spotId || SPOT[spotId]?.room !== h.loc) throw new GameError("今いる部屋の潜伏場所を選んでください");
      break;
  }
  room.usedThisRound.push(item.id);

  switch (item.kind) {
    case "bell":
      drop();
      room.placed.bells.push({ room: r, item });
      log(room, "human", `🔔 ${ROOM[r].name}に聖なる鈴を設置した`, "info", { loc: r });
      return;
    case "ofuda":
      drop();
      room.placed.ofuda.push({ spot: spotId!, item });
      log(room, "human", `📜 ${spotName(spotId!)}に落魂札を仕掛けた`, "info", { spot: spotId });
      return;
    case "mirror":
      drop();
      room.placed.mirrors.push({ spot: spotId!, item });
      log(room, "human", `🪞 ${spotName(spotId!)}に手鏡を置いた`, "info", { spot: spotId });
      return;
    case "candle":
      drop();
      if (!room.placed.candles.includes(r)) room.placed.candles.push(r);
      log(room, "human", `🕯️ ${ROOM[r].name}に蝋燭を灯した(幽霊の探索コスト+2)`, "info", { loc: r });
      return;
    case "holywater": {
      drop();
      room.placed.holy.push({ room: r, until: room.ghostTurns + 1 });
      log(room, "human", `💧 ${ROOM[r].name}に聖水を撒いた`, "info", { loc: r });
      if (room.ghost.loc === r) {
        if (damageGhost(room, 1, "聖水が幽霊を焼いた!")) return;
        startEscape(room, "continue");
      } else {
        log(room, "human", "…何の反応もない", "info");
      }
      return;
    }
    case "kenchi": {
      spend();
      const g = room.ghost;
      const same = g.loc === h.loc && g.spot;
      log(
        room,
        "human",
        `👹 検知鬼くん: 幽霊は${same ? spotName(g.spot!) : locName(g.loc)}にいる!(残り${item.uses ?? 0}回)`,
        "good",
        same ? { spot: g.spot! } : { loc: g.loc }
      );
      log(room, "ghost", `👹 ${hunterName(h)}が検知鬼くんを使った! 居場所を知られた`, "bad");
      return;
    }
    case "crystal":
      room.crystalNext = true;
      log(room, "human", "🔮 水晶玉に念を込めた。次の幽霊のサイコロが見える", "info");
      return;
    case "gambler":
      spend();
      h.gamblerNext = true;
      log(room, "human", `🎲 ${hunterName(h)}は次のターン、サイコロが1個増える(残り${item.uses ?? 0}回)`, "info");
      return;
  }
}

function pickupPlaced(room: RoomState, h: Hunter, itemId: string): void {
  if (h.items.length >= capacity(h)) throw new GameError("持ち物がいっぱいです");
  const p = room.placed;
  const bell = p.bells.find((b) => b.item.id === itemId);
  const ofuda = p.ofuda.find((o) => o.item.id === itemId);
  const mirror = p.mirrors.find((m) => m.item.id === itemId);
  const where = bell ? bell.room : ofuda ? SPOT[ofuda.spot].room : mirror ? SPOT[mirror.spot].room : null;
  if (!where) throw new GameError("回収できるものがありません");
  if (where !== h.loc) throw new GameError("同じ部屋にあるものだけ回収できます");
  if (bell) p.bells = p.bells.filter((b) => b !== bell);
  if (ofuda) p.ofuda = p.ofuda.filter((o) => o !== ofuda);
  if (mirror) p.mirrors = p.mirrors.filter((m) => m !== mirror);
  const item = (bell ?? ofuda ?? mirror)!.item;
  h.items.push(item);
  log(room, "human", `${hunterName(h)}は${ITEMS[item.kind].name}を回収した`, "info", { loc: where });
}

// ---------- dispatch ----------

/** Player who must act now. */
export function actorOf(room: RoomState): string | null {
  if (room.phase !== "playing") return null;
  if (room.escape || room.turn.side === "ghost") return room.ghostPlayer;
  return room.hunters[room.turn.hunter].controller;
}

export function act(room: RoomState, playerId: string, action: Action): RoomState {
  if (action.t === "pick") return setupPick(room, playerId, action.slot, action.character);
  if (action.t === "confirmSetup") return confirmSetup(room, playerId);
  if (room.phase !== "playing") throw new GameError("ゲーム中ではありません");
  if (actorOf(room) !== playerId) throw new GameError("あなたの番ではありません");
  if (room.escape) escapeAction(room, action);
  else if (room.turn.side === "ghost") ghostAction(room, action);
  else hunterAction(room, room.hunters[room.turn.hunter], action);
  return room;
}

export function playAgain(room: RoomState, hostId: string): RoomState {
  requireHost(room, hostId);
  if (room.phase !== "gameover") throw new GameError("ゲームはまだ終わっていません");
  room.phase = "lobby";
  return startGame(room, hostId);
}

export function backToLobby(room: RoomState, hostId: string): RoomState {
  requireHost(room, hostId);
  if (room.phase !== "gameover" && room.phase !== "setup") throw new GameError("ゲームはまだ終わっていません");
  room.phase = "lobby";
  return room;
}

/** Host moves an absent player along with the test bot's random choices. */
export function hostSkip(room: RoomState, hostId: string): RoomState {
  requireHost(room, hostId);
  const actor = actorOf(room);
  if (!actor) throw new GameError("ゲーム中ではありません");
  return botAct(room, actor);
}

// ---------- view ----------

export function viewFor(room: RoomState, viewerId: string): ClientRoom {
  const side = sideOf(room, viewerId);
  const ended = room.phase === "gameover";
  const isGhost = side === "ghost" || ended;
  const isHuman = side === "human" || ended;
  const playing = room.phase === "playing" || ended;
  const showGhost = playing && (isGhost || room.ghost.revived);
  const known: Record<string, KnownSpot> = ended
    ? Object.fromEntries(SPOTS.map((s) => [s.id, knownSpot(room.spots[s.id])]))
    : side === "ghost"
      ? room.ghostKnow
      : side === "human"
        ? room.humanKnow.spots
        : {};
  const ghostDiceVisible = isGhost;
  return {
    code: room.code,
    isTest: room.isTest,
    phase: room.phase,
    players: room.players.map((p) => ({ ...p, side: sideOf(room, p.id) })),
    settings: room.settings,
    game: room.game,
    viewerSide: side,
    picks: room.picks,
    hunters: room.hunters.map((h) => ({
      slot: h.slot,
      character: h.character,
      controller: h.controller,
      loc: h.loc,
      alive: h.alive,
      items: isHuman ? h.items : null,
      itemCount: h.items.length,
      psychicUsed: h.psychicUsed,
      gamblerNext: isHuman ? h.gamblerNext : false,
    })),
    ghost: showGhost ? { ...room.ghost, visible: true, held: isGhost ? room.ghost.held : [] } : null,
    turn: playing
      ? {
          ...room.turn,
          dice: room.turn.side === "human" || ghostDiceVisible ? room.turn.dice : null,
          budget: room.turn.side === "human" || ghostDiceVisible ? room.turn.budget : null,
          path: room.turn.side === "human" || isGhost ? room.turn.path : [],
        }
      : null,
    escape: room.escape
      ? { ...room.escape, dice: isGhost ? room.escape.dice : null, budget: isGhost ? room.escape.budget : null }
      : null,
    actor: actorOf(room),
    placed: isHuman ? room.placed : null,
    known,
    humanKnow: isHuman ? room.humanKnow : null,
    hidden: ended ? room.hidden : null,
    lock: isGhost ? room.lock : null,
    ghostTurns: room.ghostTurns,
    usedThisRound: isHuman ? room.usedThisRound : [],
    logs: room.logs.filter((l) => ended || l.to === "all" || l.to === side),
    winner: room.winner,
  };
}

function knownSpot(content: SpotContent): KnownSpot {
  return known(content);
}

// ---------- test bot (random, just to exercise the game) ----------

export function pendingBot(room: RoomState): Player | undefined {
  if (room.phase !== "playing") return undefined;
  const actor = actorOf(room);
  const p = room.players.find((x) => x.id === actor);
  return p?.isBot ? p : undefined;
}

/** One random action for whoever must act. */
export function botAct(room: RoomState, actorId: string): RoomState {
  const step = (a: Action) => act(room, actorId, a);
  if (room.escape) {
    if (room.escape.step === "roll") return step({ t: "roll" });
    return ghostWander(room, room.escape.budget, false) ?? step({ t: "end" });
  }
  const t = room.turn;
  if (t.side === "ghost") {
    if (t.step === "roll") return step({ t: "roll" });
    if (t.step === "forced") return step({ t: "forced", room: pick(FORCED_ROOMS) });
    if (t.step === "warp") return step({ t: "warp", spot: pick(SPOTS.filter((s) => !holyBlocked(room, s.room))).id });
    if (t.step === "move") {
      const here = SPOTS.filter((s) => s.room === room.ghost.loc);
      const candleCost = (s: (typeof SPOTS)[number]) => s.cost + (room.placed.candles.includes(s.room) ? 2 : 0);
      const affordable = here.filter((s) => candleCost(s) <= t.budget);
      if (affordable.length && Math.random() < 0.55) return step({ t: "search", spot: pick(affordable).id });
      return ghostWander(room, t.budget, true) ?? step({ t: "end" });
    }
    return step({ t: "end" });
  }

  const h = room.hunters[t.hunter];
  if (t.step === "resolve") {
    const c = room.spots[t.resolveSpot!];
    if (c?.type === "human") {
      const full = h.items.length >= capacity(h);
      return step({ t: "resolve", take: true, leave: full ? h.items[0].id : null });
    }
    return step({ t: "resolve", take: false, leave: null });
  }
  if (t.step === "roll") return step({ t: "roll" });
  if (room.hidden && room.humanKnow.hiddenFound && room.hidden.room === h.loc && h.items.length < capacity(h)) {
    return step({ t: "hidden" });
  }
  const here = SPOTS.filter((s) => s.room === h.loc && searchCost(room, s.id) <= t.budget);
  if (!isHall(h.loc) && here.length && (t.budget < MOVE_COST || Math.random() < 0.4)) {
    return step({ t: "search", spot: pick(here).id });
  }
  if (t.budget >= MOVE_COST) return step({ t: "move", loc: pick(HUMAN_ADJ[h.loc]) });
  return step({ t: "end" });
}

/** A random affordable ghost step, or null to stop. */
function ghostWander(room: RoomState, budget: number, normalTurn: boolean): RoomState | null {
  if (Math.random() < 0.15) return null;
  const options = [...SPOTS.map((s) => s.id), "hall1", "hall2"]
    .map((to) => ({ to, step: ghostStepCost(room, to, normalTurn && room.turn.searched) }))
    .filter((o): o is { to: string; step: GhostStep } => typeof o.step !== "string" && o.step.cost > 0 && o.step.cost <= budget);
  if (!options.length) return null;
  return act(room, room.ghostPlayer, { t: "gmove", to: pick(options).to });
}
