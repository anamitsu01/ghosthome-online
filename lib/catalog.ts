// Items and characters.

export type HumanItemKind =
  | "bell"
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
  | "bluebeads"
  | "ticket"
  | "kenchiWeak"
  | "scroll";
export type HiddenItemKind = "stone" | "spear";
/** "fake": the magician's fake ghost item. */
export type ItemKind = HumanItemKind | HiddenItemKind | "fake";
export type GhostItemName = "bracelet" | "jewel" | "knife";

/** How an item is used during a human's turn. */
export type ItemUse =
  | "room" // placed in the current room
  | "spot" // placed on a hiding spot in the current room
  | "trade" // takes an item from a teammate anywhere
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
  kenchi: { kind: "kenchi", name: "検知鬼くん", icon: "👹", use: "self", uses: 1, desc: "幽霊のいる部屋が分かる。同じ部屋なら潜伏場所まで分かる。使い捨て。使ったことは幽霊にも伝わる。" },
  doll: { kind: "doll", name: "身代わり人形", icon: "🧸", use: "passive", desc: "完全復活した幽霊の攻撃を1度だけ防ぐ。防ぐと消える。" },
  holywater: { kind: "holywater", name: "聖水", icon: "💧", use: "room", desc: "今いる部屋に撒く。次の幽霊ターンが終わるまで幽霊はその部屋に入れない。幽霊が部屋にいれば1ダメージ。" },
  crystal: { kind: "crystal", name: "水晶玉", icon: "🔮", use: "passive", desc: "人間の誰かが持っていれば、幽霊のサイコロの目がいつも見える。" },
  sword: { kind: "sword", name: "勾玉の剣", icon: "🗡️", use: "passive", desc: "完全復活した幽霊のいる場所を探索すると1ダメージ。" },
  gambler: { kind: "gambler", name: "ギャンブラーのサイコロ", icon: "🎲", use: "self", uses: 3, desc: "使った次の自分のターン、サイコロが1個増える。3回まで。" },
  flashlight: { kind: "flashlight", name: "懐中電灯", icon: "🔦", use: "passive", desc: "持って隠しアイテムのある部屋に入ると、懐中電灯と引き換えにその場で隠しアイテムを手に入れる。" },
  candle: { kind: "candle", name: "マッチと蝋燭", icon: "🕯️", use: "room", desc: "今いる部屋に設置。幽霊がその部屋で探索するコストが+2(ゲーム終了まで)。幽霊は部屋に入ると気づく。使い捨て。" },
  mirror: { kind: "mirror", name: "手鏡", icon: "🪞", use: "spot", retrievable: true, desc: "潜伏場所に設置。幽霊がそこに潜伏すると、次の幽霊ターンはその部屋から出られない。" },
  redbeads: { kind: "redbeads", name: "赤い数珠", icon: "📿", use: "passive", desc: "青い数珠と両方持っていればサイコロ+1。" },
  ticket: { kind: "ticket", name: "遠隔取引券", icon: "🎫", use: "trade", desc: "どこにいる仲間からでもアイテムを1つもらえる(券と入れ替わりで手に入る)。使い捨て。" },
  kenchiWeak: { kind: "kenchiWeak", name: "検知鬼くん(弱)", icon: "👺", use: "self", uses: 1, desc: "幽霊が1階と2階のどちらにいるかが分かる。使い捨て。使ったことは幽霊にも伝わる。" },
  scroll: { kind: "scroll", name: "壁抜けの巻物", icon: "📜", use: "self", desc: "使ったターンの間、幽霊と同じように壁を抜けて移動できる(首無し地蔵に塞がれた扉も通れる)。使い捨て。" },
  bluebeads: { kind: "bluebeads", name: "青い数珠", icon: "🧿", use: "passive", desc: "赤い数珠と両方持っていればサイコロ+1。" },
  stone: { kind: "stone", name: "正邪の秘石", icon: "💎", use: "passive", desc: "隠しアイテム。完全復活した幽霊に殺されるとき1ダメージを返す。" },
  spear: { kind: "spear", name: "獣の槍", icon: "🔱", use: "passive", desc: "隠しアイテム。幽霊を探索で見つけたときのダメージが2になる(復活前も後も)。" },
  fake: { kind: "fake", name: "偽物", icon: "🎭", use: "passive", desc: "手品師の偽の幽霊アイテム。探索した潜伏場所に置くと、幽霊が拾って本物だと思い込む。" },
};

export const HUMAN_ITEM_KINDS: HumanItemKind[] = [
  "bell",
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
  "ticket",
  "kenchiWeak",
  "scroll",
];
export const HIDDEN_ITEM_KINDS: HiddenItemKind[] = ["stone", "spear"];

export const GHOST_ITEMS: Record<GhostItemName, { name: string; icon: string }> = {
  bracelet: { name: "呪いの腕輪", icon: "⛓️" },
  jewel: { name: "真っ黒な宝石", icon: "🖤" },
  knife: { name: "神錆びた包丁", icon: "🔪" },
};
export const GHOST_ITEM_NAMES: GhostItemName[] = ["bracelet", "jewel", "knife"];

/** The ghost's own tools: found in hiding spots like everything else, usable only by the ghost. */
export type GhostToolKind = "scrap" | "tablet" | "jizo" | "phone" | "letter" | "stairs" | "twins" | "hole";
export const GHOST_TOOLS: Record<GhostToolKind, { name: string; icon: string; desc: string; uses: number }> = {
  scrap: { name: "焼け焦げた切れ端", icon: "🔥", desc: "幽霊の体力を1回復する(最大まで)。使い捨て。", uses: 1 },
  tablet: { name: "地縛霊の石板", icon: "🪦", desc: "人間を2人ランダムに選び、次のターン行動不能にする。3回まで(1ターン1回)。", uses: 3 },
  jizo: { name: "首無し地蔵", icon: "🗿", desc: "扉を1つ選び、次の幽霊ターンが終わるまで人間が通れないようにする。使い捨て。", uses: 1 },
  phone: {
    name: "あの世の電話",
    icon: "📞",
    desc: "人間の誰かが屋根裏部屋に入るまで、人間は部屋に入れない(屋根裏部屋へ向かう道と、廊下へ出るための隣の部屋は例外)。使い捨て。",
    uses: 1,
  },
  letter: {
    name: "死者からの手紙",
    icon: "✉️",
    desc: "まだ探索していない潜伏場所を1つランダムに選び、何があるか(何もないか)が分かる。仕掛けられた札や手鏡は分からない。使い捨て。",
    uses: 1,
  },
  stairs: { name: "十三階段の思い出", icon: "🪜", desc: "人間はこの先2ターンの間、階を移動できない(階段が使えない)。使い捨て。", uses: 1 },
  hole: { name: "暗闇の穴", icon: "🕳️", desc: "人間全員を、ランダムに選ばれた1つの部屋へ引きずり込む。使い捨て。", uses: 1 },
  twins: {
    name: "双子の幽霊",
    icon: "👥",
    desc: "使ったターンに気配が人間に伝わると、本当の部屋に加えてランダムな2部屋からも気配がする。使い捨て。",
    uses: 1,
  },
};
export const GHOST_TOOL_KINDS: GhostToolKind[] = ["scrap", "tablet", "jizo", "phone", "letter", "stairs", "twins", "hole"];
/** The ghost carries at most this many tools (its revival items don't count). */
export const GHOST_TOOL_LIMIT = 2;

export type CharacterId = "medium" | "miko" | "scientist" | "painter" | "psychic" | "magician" | "jujutsu" | "cheater";

export interface CharacterDef {
  id: CharacterId;
  name: string;
  /** Kanji initial shown on the character's token. */
  icon: string;
  color: string;
  desc: string;
}

export const CHARACTERS: Record<CharacterId, CharacterDef> = {
  medium: { id: "medium", name: "霊媒師", icon: "霊", color: "#a78bfa", desc: "1ゲームに1度、自分のターン中(サイコロの前でも後でも)に幽霊のいる部屋が分かる。使ったことは幽霊にも伝わる。" },
  miko: { id: "miko", name: "巫女", icon: "巫", color: "#f87171", desc: "部屋に入ると、その部屋で幽霊が探索したことのある潜伏場所が分かる。" },
  scientist: { id: "scientist", name: "科学者", icon: "科", color: "#34d399", desc: "科学者のいる部屋に幽霊が入るとき、移動コスト+2。" },
  painter: { id: "painter", name: "絵描き", icon: "絵", color: "#fbbf24", desc: "アイテムを3つまで持てる。" },
  psychic: { id: "psychic", name: "超能力者", icon: "超", color: "#60a5fa", desc: "1ゲームに1度、サイコロを振る前に好きな部屋・廊下へワープできる。" },
  magician: { id: "magician", name: "手品師", icon: "手", color: "#f472b6", desc: "幽霊アイテムの偽物を1つ持って始まる。探索した場所に置ける。" },
  cheater: { id: "cheater", name: "イカサマ師", icon: "イ", color: "#94a3b8", desc: "サイコロで1が出ない(2〜6が同じ確率で出る)。" },
  jujutsu: { id: "jujutsu", name: "呪術師", icon: "呪", color: "#fb923c", desc: "隠しアイテムのある部屋が分かる(手に入れるには懐中電灯を持ってその部屋へ)。" },
};
export const CHARACTER_IDS = Object.keys(CHARACTERS) as CharacterId[];

/** The ghost's sheet colour by number of items collected (fake ones included). */
export const GHOST_COLORS = ["#f4f4f6", "#f7b7c8", "#e95783", "#e3212b"];
