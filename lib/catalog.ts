// Items and characters.

export type HumanItemKind =
  | "bell"
  | "ofuda"
  | "kenchi"
  | "doll"
  | "holywater"
  | "crystal"
  | "sword"
  | "gambler"
  | "flashlight"
  | "candle"
  | "mirror"
  | "redbeads"
  | "bluebeads";
export type HiddenItemKind = "stone" | "spear";
/** "fake": the magician's fake ghost item. */
export type ItemKind = HumanItemKind | HiddenItemKind | "fake";
export type GhostItemName = "bracelet" | "jewel" | "knife";

/** How an item is used during a human's turn. */
export type ItemUse =
  | "room" // placed in the current room
  | "spot" // placed on a hiding spot in the current room
  | "self" // used on the spot, no target
  | "passive"; // works just by being held

export interface ItemDef {
  kind: ItemKind;
  name: string;
  icon: string;
  use: ItemUse;
  /** Limited uses, after which the item is gone. */
  uses?: number;
  /** Once placed, can be picked up again by a human in that room. */
  retrievable?: boolean;
  desc: string;
}

export const ITEMS: Record<ItemKind, ItemDef> = {
  bell: { kind: "bell", name: "聖なる鈴", icon: "🔔", use: "room", retrievable: true, desc: "部屋に設置。幽霊がその部屋に入るたびに鳴り、人間全員に知らせる(鳴ったことは幽霊にも分かる)。" },
  ofuda: { kind: "ofuda", name: "落魂札", icon: "📜", use: "spot", retrievable: true, desc: "潜伏場所に設置。幽霊がその場所を通る(止まる・ワープで来る)と1ダメージ。発動すると消える。" },
  kenchi: { kind: "kenchi", name: "検知鬼くん", icon: "👹", use: "self", uses: 3, desc: "幽霊のいる部屋が分かる。同じ部屋なら潜伏場所まで分かる。3回まで。使ったことは幽霊にも伝わる。" },
  doll: { kind: "doll", name: "身代わり人形", icon: "🧸", use: "passive", desc: "完全復活した幽霊の攻撃を1度だけ防ぐ。防ぐと消える。" },
  holywater: { kind: "holywater", name: "聖水", icon: "💧", use: "room", desc: "今いる部屋に撒く。次の幽霊ターンが終わるまで幽霊はその部屋に入れない。幽霊が部屋にいれば1ダメージ。" },
  crystal: { kind: "crystal", name: "水晶玉", icon: "🔮", use: "self", desc: "次の幽霊ターンのサイコロの目が見える。何度でも使える。" },
  sword: { kind: "sword", name: "勾玉の剣", icon: "🗡️", use: "passive", desc: "完全復活した幽霊のいる場所を探索すると1ダメージ。" },
  gambler: { kind: "gambler", name: "ギャンブラーのサイコロ", icon: "🎲", use: "self", uses: 3, desc: "使った次の自分のターン、サイコロが1個増える。3回まで。" },
  flashlight: { kind: "flashlight", name: "懐中電灯", icon: "🔦", use: "passive", desc: "持って隠しアイテムのある部屋に入ると、懐中電灯と引き換えにその場で隠しアイテムを手に入れる。" },
  candle: { kind: "candle", name: "マッチと蝋燭", icon: "🕯️", use: "room", desc: "今いる部屋に設置。幽霊がその部屋で探索するコストが+2(ゲーム終了まで)。幽霊は部屋に入ると気づく。使い捨て。" },
  mirror: { kind: "mirror", name: "手鏡", icon: "🪞", use: "spot", retrievable: true, desc: "潜伏場所に設置。幽霊がそこに潜伏すると、次の幽霊ターンはその部屋から出られない。" },
  redbeads: { kind: "redbeads", name: "赤い数珠", icon: "📿", use: "passive", desc: "青い数珠と両方持っていればサイコロ+1。" },
  bluebeads: { kind: "bluebeads", name: "青い数珠", icon: "🧿", use: "passive", desc: "赤い数珠と両方持っていればサイコロ+1。" },
  stone: { kind: "stone", name: "正邪の秘石", icon: "💎", use: "passive", desc: "隠しアイテム。完全復活した幽霊に殺されるとき1ダメージを返す。" },
  spear: { kind: "spear", name: "獣の槍", icon: "🔱", use: "passive", desc: "隠しアイテム。幽霊を探索で見つけたときのダメージが2になる(復活前も後も)。" },
  fake: { kind: "fake", name: "偽物", icon: "🎭", use: "passive", desc: "手品師の偽の幽霊アイテム。探索した潜伏場所に置くと、幽霊が拾って本物だと思い込む。" },
};

export const HUMAN_ITEM_KINDS: HumanItemKind[] = [
  "bell",
  "ofuda",
  "kenchi",
  "doll",
  "holywater",
  "crystal",
  "sword",
  "gambler",
  "flashlight",
  "candle",
  "mirror",
  "redbeads",
  "bluebeads",
];
export const HIDDEN_ITEM_KINDS: HiddenItemKind[] = ["stone", "spear"];

export const GHOST_ITEMS: Record<GhostItemName, { name: string; icon: string }> = {
  bracelet: { name: "呪いの腕輪", icon: "⛓️" },
  jewel: { name: "真っ黒な宝石", icon: "🖤" },
  knife: { name: "神錆びた包丁", icon: "🔪" },
};
export const GHOST_ITEM_NAMES: GhostItemName[] = ["bracelet", "jewel", "knife"];

/** The ghost's own tools: found in hiding spots like everything else, usable only by the ghost. */
export type GhostToolKind = "scrap" | "tablet";
export const GHOST_TOOLS: Record<GhostToolKind, { name: string; icon: string; desc: string; uses: number }> = {
  scrap: { name: "焼け焦げた切れ端", icon: "🔥", desc: "幽霊の体力を1回復する(最大まで)。使い捨て。", uses: 1 },
  tablet: { name: "地縛霊の石板", icon: "🪦", desc: "人間を1人ランダムに選び、次のターン行動不能にする。3回まで(1ターン1回)。", uses: 3 },
};
export const GHOST_TOOL_KINDS: GhostToolKind[] = ["scrap", "tablet"];

export type CharacterId = "medium" | "miko" | "scientist" | "painter" | "psychic" | "magician" | "jujutsu";

export interface CharacterDef {
  id: CharacterId;
  name: string;
  /** Kanji initial shown on the character's token. */
  icon: string;
  color: string;
  desc: string;
}

export const CHARACTERS: Record<CharacterId, CharacterDef> = {
  medium: { id: "medium", name: "霊媒師", icon: "霊", color: "#a78bfa", desc: "ゲーム開始時の幽霊の潜伏場所が分かる。" },
  miko: { id: "miko", name: "巫女", icon: "巫", color: "#f87171", desc: "部屋に入ると、その部屋で幽霊が探索したことのある潜伏場所が分かる。" },
  scientist: { id: "scientist", name: "科学者", icon: "科", color: "#34d399", desc: "科学者のいる部屋に幽霊が入るとき、移動コスト+2。" },
  painter: { id: "painter", name: "絵描き", icon: "絵", color: "#fbbf24", desc: "アイテムを3つまで持てる。" },
  psychic: { id: "psychic", name: "超能力者", icon: "超", color: "#60a5fa", desc: "1ゲームに1度、サイコロを振る前に好きな部屋・廊下へワープできる。" },
  magician: { id: "magician", name: "手品師", icon: "手", color: "#f472b6", desc: "幽霊アイテムの偽物を1つ持って始まる。探索した場所に置ける。" },
  jujutsu: { id: "jujutsu", name: "呪術師", icon: "呪", color: "#fb923c", desc: "隠しアイテムのある部屋が分かる(手に入れるには懐中電灯を持ってその部屋へ)。" },
};
export const CHARACTER_IDS = Object.keys(CHARACTERS) as CharacterId[];

/** The ghost's sheet colour by number of items collected (fake ones included). */
export const GHOST_COLORS = ["#f4f4f6", "#f7b7c8", "#e95783", "#e3212b"];
