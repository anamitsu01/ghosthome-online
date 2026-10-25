// The house: 2 floors, 11 rooms, 32 hiding spots, a hallway on each floor
// joined by the stairs.

export type RoomId =
  | "toilet"
  | "bath"
  | "storage"
  | "guest"
  | "kitchen"
  | "living"
  | "bedA"
  | "bedB"
  | "study"
  | "kids"
  | "attic";
export type HallId = "hall1" | "hall2";
export type LocId = RoomId | HallId;
export type Floor = 1 | 2;

export interface Spot {
  /** `${room}-${index}` */
  id: string;
  room: RoomId;
  name: string;
  /** The ghost's search cost. Humans pay 1 less. */
  cost: number;
}

export interface RoomDef {
  id: RoomId;
  name: string;
  floor: Floor;
  spots: Spot[];
}

function room(id: RoomId, name: string, floor: Floor, spots: [string, number][]): RoomDef {
  return { id, name, floor, spots: spots.map(([n, cost], i) => ({ id: `${id}-${i}`, room: id, name: n, cost })) };
}

export const ROOMS: RoomDef[] = [
  room("toilet", "トイレ", 1, [["便器の裏", 2], ["掃除用具入れ", 2]]),
  room("bath", "バスルーム", 1, [["バスタブ", 3], ["ダンボール", 1], ["洗濯機", 3], ["棚", 2]]),
  room("storage", "物置", 1, [["大きな箱", 3], ["小さな箱", 1]]),
  room("guest", "客間", 1, [["照明", 2], ["ピアノ", 3]]),
  room("kitchen", "キッチン", 1, [["ガスコンロ", 2], ["冷蔵庫", 2], ["冷凍庫", 3]]),
  room("living", "リビング", 1, [["キャビネット", 2], ["テレビ", 3], ["ラジカセ", 2]]),
  room("bedA", "寝室A", 2, [["ベッド", 3], ["サイドテーブル", 2], ["照明", 3]]),
  room("bedB", "寝室B", 2, [["ベッド", 3], ["サイドテーブル", 2], ["本棚", 2]]),
  room("study", "書斎", 2, [["本棚", 2], ["書斎机", 3], ["クローゼット", 2], ["ガラス棚", 3]]),
  room("kids", "子供部屋", 2, [["ベッド", 3], ["玩具箱", 1]]),
  room("attic", "屋根裏部屋", 2, [["赤い箱", 3], ["青い箱", 3], ["黄色い箱", 3], ["緑の箱", 3]]),
];

export const ROOM_IDS = ROOMS.map((r) => r.id);
export const ROOM: Record<RoomId, RoomDef> = Object.fromEntries(ROOMS.map((r) => [r.id, r])) as Record<RoomId, RoomDef>;
export const SPOTS: Spot[] = ROOMS.flatMap((r) => r.spots);
export const SPOT: Record<string, Spot> = Object.fromEntries(SPOTS.map((s) => [s.id, s]));

export function isHall(loc: LocId): loc is HallId {
  return loc === "hall1" || loc === "hall2";
}

export function floorOf(loc: LocId): Floor {
  return loc === "hall1" ? 1 : loc === "hall2" ? 2 : ROOM[loc].floor;
}

export function locName(loc: LocId): string {
  return loc === "hall1" ? "1階廊下" : loc === "hall2" ? "2階廊下" : ROOM[loc].name;
}

export function spotName(spotId: string): string {
  const s = SPOT[spotId];
  return `${ROOM[s.room].name}・${s.name}`;
}

/** Every step between neighbouring places costs this much. */
export const MOVE_COST = 2;

type Edge = [LocId, LocId];

/** Doorways: the only way humans get around (the ghost may use them too). */
const DOORS: Edge[] = [
  ["hall1", "storage"],
  ["hall1", "living"],
  ["hall1", "toilet"],
  ["hall1", "guest"],
  ["kitchen", "living"],
  ["kitchen", "guest"],
  ["bath", "toilet"],
  ["hall2", "bedA"],
  ["hall2", "bedB"],
  ["hall2", "kids"],
  ["attic", "kids"],
  ["study", "bedA"],
  ["hall1", "hall2"],
];

/** Shared walls the ghost can pass through. */
const WALLS: Edge[] = [
  ["storage", "guest"],
  ["living", "bath"],
  ["bedB", "kids"],
];

/**
 * The ghost goes through walls, so it reaches the hallway from every room on the
 * floor — except the attic, which only opens onto the children's room.
 */
const GHOST_HALL: Edge[] = [
  ...ROOMS.filter((r) => r.floor === 1).map((r): Edge => ["hall1", r.id]),
  ...ROOMS.filter((r) => r.floor === 2 && r.id !== "attic").map((r): Edge => ["hall2", r.id]),
];

function graph(edges: Edge[]): Record<LocId, LocId[]> {
  const g = {} as Record<LocId, LocId[]>;
  for (const loc of [...ROOM_IDS, "hall1", "hall2"] as LocId[]) g[loc] = [];
  for (const [a, b] of edges) {
    if (!g[a].includes(b)) g[a].push(b);
    if (!g[b].includes(a)) g[b].push(a);
  }
  return g;
}

export const HUMAN_ADJ = graph(DOORS);
export const GHOST_ADJ = graph([...DOORS, ...WALLS, ...GHOST_HALL]);

/**
 * Where a ghost searching in a room can be heard from: rooms sharing a wall or a
 * door, and the hallway of that floor (the attic is not next to the hallway).
 * This is exactly the ghost's graph without the stairs.
 */
export function hearsFrom(room: RoomId): LocId[] {
  return GHOST_ADJ[room];
}

/** Rooms the 2nd ghost item can send every human to. */
export const FORCED_ROOMS: RoomId[] = ["attic", "bath"];

// ---------- floor plan (for drawing) ----------

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const PLAN_W = 600;
export const PLAN_H = 420;

/** Top-down layout of each floor, laid out so shared walls match the adjacency above. */
export const LAYOUT: Record<LocId, Rect> = {
  storage: { x: 0, y: 0, w: 195, h: 160 },
  guest: { x: 195, y: 0, w: 195, h: 160 },
  kitchen: { x: 390, y: 0, w: 210, h: 210 },
  hall1: { x: 0, y: 160, w: 390, h: 90 },
  living: { x: 390, y: 210, w: 210, h: 210 },
  toilet: { x: 0, y: 250, w: 195, h: 170 },
  bath: { x: 195, y: 250, w: 195, h: 170 },

  study: { x: 0, y: 0, w: 195, h: 160 },
  bedA: { x: 195, y: 0, w: 195, h: 160 },
  hall2: { x: 0, y: 160, w: 390, h: 90 },
  bedB: { x: 0, y: 250, w: 270, h: 170 },
  kids: { x: 270, y: 250, w: 165, h: 170 },
  attic: { x: 435, y: 250, w: 165, h: 170 },
};

/** The open space above the stairs on the 2nd floor (not a room). */
export const VOID_2F: Rect = { x: 390, y: 0, w: 210, h: 250 };

export function locsOnFloor(floor: Floor): LocId[] {
  return [...ROOM_IDS.filter((r) => ROOM[r].floor === floor), floor === 1 ? "hall1" : "hall2"];
}

export function doorsOnFloor(floor: Floor): Edge[] {
  return DOORS.filter(([a, b]) => !(isHall(a) && isHall(b)) && floorOf(a) === floor);
}
