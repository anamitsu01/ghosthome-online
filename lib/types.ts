import type { CharacterId, GhostItemName, GhostToolKind, ItemKind } from "./catalog";
import type { LocId, RoomId } from "./map";

export type Side = "ghost" | "human";

export interface Player {
  id: string;
  name: string;
  connected: boolean;
  isHost: boolean;
  /** Server-driven test player (ZZZZZ rooms) that only rolls and wanders. */
  isBot: boolean;
}

export interface Item {
  id: string;
  kind: ItemKind;
  /** Uses left, for items with limited uses. */
  uses?: number;
  /** For the fake: which ghost item it imitates. */
  mimic?: GhostItemName;
}

/** What lies in a hiding spot. Traps placed by humans are tracked separately. */
export type SpotContent =
  | null
  | { type: "human"; item: Item }
  | { type: "ghost"; name: GhostItemName; fake: boolean }
  | { type: "tool"; kind: GhostToolKind; uses: number };

/** A spot's content as one side last saw it (the item may have been taken since). */
export type KnownSpot =
  | { type: "empty" }
  | { type: "human"; kind: ItemKind }
  | { type: "ghost"; name: GhostItemName; fake: boolean }
  | { type: "tool"; kind: GhostToolKind };

export interface Hunter {
  slot: number;
  character: CharacterId;
  /** Player who moves this character. */
  controller: string;
  loc: LocId;
  alive: boolean;
  items: Item[];
  psychicUsed: boolean;
  /** 霊媒師: the once-a-game sight has been used. */
  mediumUsed: boolean;
  /** Gambler's dice used: one extra die on this character's next roll. */
  gamblerNext: boolean;
  /** 地縛霊の石板: this character loses its next turn. */
  stunned: boolean;
  /** 壁抜けの巻物 read this turn: moves like the ghost, through walls. */
  wallwalk: boolean;
}

export interface GhostState {
  loc: LocId;
  /** Hiding spot, null in a hallway. */
  spot: string | null;
  /** 1 at the start: any damage before the first item finishes it. */
  hp: number;
  /** Ghost items picked up, fakes included. */
  collected: number;
  /** Real ghost items picked up. */
  real: number;
  revived: boolean;
  /** What the ghost thinks it holds (fakes look real to it). */
  held: GhostItemName[];
  /** Ghost tools in hand, with uses left. */
  tools: { kind: GhostToolKind; uses: number }[];
  startSpot: string;
}

/** Human-placed things. Humans always see these; the ghost only finds out when one goes off. */
export interface Placed {
  bells: { room: RoomId; item: Item }[];
  mirrors: { spot: string; item: Item }[];
  /** Blocks the room while ghostTurns < until. */
  /** Rooms (and, once the ghost has fully revived, hallways) sprinkled with holy water. */
  holy: { room: LocId; until: number }[];
  candles: RoomId[];
}

/** A doorway shut by the 首無し地蔵: humans can't pass while ghostTurns < until. */
export interface DoorBlock {
  door: string;
  until: number;
}

export type Step =
  | "roll" // before rolling the dice (items may be used)
  | "move" // moving with the dice
  | "resolve" // human: deciding what to take / leave after a search
  | "hide" // ghost: searched, may only shift spots inside the room
  | "forced" // ghost: 2nd item, choosing where to send the humans
  | "warp"; // ghost: item pickup warp

export interface TurnState {
  round: number;
  side: Side;
  /** Active hunter slot on the human side. */
  hunter: number;
  step: Step;
  dice: number[];
  budget: number;
  searched: boolean;
  /** Human search waiting for take/leave. */
  resolveSpot: string | null;
  /** Ghost was damaged by this hunter's search: it escapes once the turn ends. */
  pendingEscape: boolean;
  /** The ghost has just fully revived: it rolls 2 dice and moves again at once (no more searching). */
  dash?: boolean;
  /** Locations passed this turn (drawn as a trail). */
  path: LocId[];
}

/** The ghost's emergency escape after taking damage, slotted into the human turn. */
export interface EscapeState {
  step: "roll" | "move";
  dice: number[];
  budget: number;
  /** "continue": back to the same hunter's turn. "next": that hunter's turn is over. */
  resume: "continue" | "next";
}

export type Audience = "all" | "ghost" | "human";
export type Tone = "info" | "good" | "bad" | "warn";

export interface LogEntry {
  seq: number;
  to: Audience;
  text: string;
  tone: Tone;
  /** Place to flash on the map. */
  loc?: LocId;
  spot?: string;
  /** An item was discovered: shown as a popup to this side. */
  found?: KnownSpot;
  /** A moment shown as a popup: the full revival, a hit on the ghost, a noise heard, 検知鬼くん, a bell. */
  event?: "revive" | "hit" | "noise" | "kenchi" | "bell" | "forced" | "curse" | "candle" | "jizo" | "medium" | "trap" | "phone" | "phoneEnd" | "letter" | "stairs" | "twins" | "floor" | "hole";
  /** Damage dealt, for a hit. */
  amount?: number;
  /** Several places at once (a noise with the 双子の幽霊's fakes). */
  locs?: LocId[];
  /** A floor (検知鬼くん(弱)). */
  floor?: 1 | 2;
}

export interface HumanKnowledge {
  spots: Record<string, KnownSpot>;
  /** Room of the hidden item, while it is known (呪術師) and still there. */
  hiddenRoom: RoomId | null;
  /** The flashlight has already turned it up. */
  hiddenFound: boolean;
  /** Spots the ghost has searched, as revealed by the 巫女. */
  ghostSearched: string[];
}

export type CharacterMode = "random" | "free";

export interface RoomSettings {
  /** Player id of the ghost, or "random". */
  ghost: string;
  characters: CharacterMode;
}

export interface RoomState {
  code: string;
  isTest: boolean;
  phase: "lobby" | "setup" | "playing" | "gameover";
  players: Player[];
  settings: RoomSettings;
  game: number;
  ghostPlayer: string;
  /** Character picks during setup (free mode). */
  picks: (CharacterId | null)[];
  hunters: Hunter[];
  ghost: GhostState;
  spots: Record<string, SpotContent>;
  hidden: { kind: "stone" | "spear"; room: RoomId } | null;
  placed: Placed;
  humanKnow: HumanKnowledge;
  ghostKnow: Record<string, KnownSpot>;
  /** Every spot the ghost has ever searched (for the 巫女). */
  ghostSearchedAll: string[];
  /** Candle rooms the ghost has walked into (so it knows about them). */
  ghostCandles: RoomId[];
  /** Doorways shut by the 首無し地蔵 (public). */
  doorBlocks: DoorBlock[];
  /** あの世の電話 is ringing: humans can't enter rooms until one of them reaches the attic (public). */
  phone: boolean;
  /** 十三階段の思い出: humans can't change floors while ghostTurns < stairsUntil (public). */
  stairsUntil: number;
  /** 双子の幽霊 is out this ghost turn: a noise the humans hear comes with two fakes. */
  twins: boolean;
  turn: TurnState;
  escape: EscapeState | null;
  /** Normal ghost turns completed. */
  ghostTurns: number;
  /** Ghost may not leave this room while ghostTurns < until (手鏡). */
  lock: { room: RoomId; until: number } | null;
  /** Item ids used this round (each item once per human turn). */
  usedThisRound: string[];
  logs: LogEntry[];
  logSeq: number;
  winner: Side | null;
  nextItemId: number;
  createdAt: number;
}

// ---------- client view ----------

export interface ClientPlayer extends Player {
  side: Side | null;
}

export interface ClientHunter {
  slot: number;
  character: CharacterId;
  controller: string;
  loc: LocId;
  alive: boolean;
  /** Hidden from the ghost. */
  items: Item[] | null;
  itemCount: number;
  psychicUsed: boolean;
  mediumUsed: boolean;
  gamblerNext: boolean;
  stunned: boolean;
  wallwalk: boolean;
}

export interface ClientRoom {
  code: string;
  isTest: boolean;
  phase: RoomState["phase"];
  players: ClientPlayer[];
  settings: RoomSettings;
  game: number;
  viewerSide: Side | null;
  picks: (CharacterId | null)[];
  hunters: ClientHunter[];
  /** The ghost's own view, the revived ghost (public), or everything at game over. */
  ghost: (GhostState & { visible: boolean }) | null;
  turn: (Omit<TurnState, "dice" | "budget"> & { dice: number[] | null; budget: number | null }) | null;
  escape: (Omit<EscapeState, "dice" | "budget"> & { dice: number[] | null; budget: number | null }) | null;
  /** Player id expected to act now. */
  actor: string | null;
  placed: Placed | null;
  /** Spot contents this viewer knows. */
  known: Record<string, KnownSpot>;
  humanKnow: HumanKnowledge | null;
  /** The ghost's view: candle rooms it knows of. */
  ghostCandles: RoomId[];
  doorBlocks: DoorBlock[];
  phone: boolean;
  /** 十三階段の思い出 is in force. */
  stairsBlocked: boolean;
  hidden: RoomState["hidden"];
  lock: RoomState["lock"];
  ghostTurns: number;
  usedThisRound: string[];
  logs: LogEntry[];
  winner: Side | null;
}

export type Action =
  | { t: "pick"; slot: number; character: CharacterId | null }
  | { t: "confirmSetup" }
  | { t: "roll" }
  | { t: "move"; loc: LocId }
  | { t: "gmove"; to: string }
  | { t: "search"; spot: string }
  /**
   * After a search: take what was found (swapping if `leave` is given), and/or leave something in the spot.
   * `setTrap`: a talisman or hand mirror being left is set right there as a trap instead of just put down.
   */
  | { t: "resolve"; take: boolean; leave: string | null; setTrap?: boolean }
  | { t: "end" }
  | { t: "warp"; spot: string }
  | { t: "gtool"; kind: GhostToolKind; door?: string }
  | { t: "medium" }
  | { t: "forced"; room: RoomId }
  | { t: "psychic"; loc: LocId }
  /** `spot`: where a spot item goes. `from` / `take`: the teammate and item a 遠隔取引券 fetches. */
  | { t: "use"; item: string; spot?: string; from?: number; take?: string }
  | { t: "pickup"; item: string }
  /** Hand an item to / take one from a teammate in the same place; `swap` sends one back when the hands are full. */
  | { t: "give"; item: string; to: number; swap?: string }
  | { t: "take"; item: string; from: number; swap?: string };

/** Entering this room code opens a private test room with a wandering bot. */
export const TEST_ROOM_CODE = "ZZZZZ";
export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 4;
export const HUNTERS = 3;
