import { CHARACTER_IDS, CHARACTERS, HIDDEN_ITEM_KINDS, HUMAN_ITEM_KINDS, ITEMS } from "@/lib/catalog";

export default function RulesPanel({ defaultOpen = false }: { defaultOpen?: boolean }) {
  return (
    <details open={defaultOpen} className="rounded-xl border border-white/10 bg-panel/80 p-4 text-sm leading-relaxed">
      <summary className="cursor-pointer text-base font-bold text-ink">ルール</summary>
      <RulesContent className="mt-3" />
    </details>
  );
}

export function RulesContent({ className = "" }: { className?: string }) {
  const b = "text-ink";
  return (
    <div className={`space-y-3 text-white/70 ${className}`}>
      <p>
        <b className={b}>幽霊1人 vs 人間3人</b>。幽霊は屋敷に隠された<b className={b}>3つの品</b>(呪いの腕輪・真っ黒な宝石・神錆びた包丁)を集めて力を取り戻す。
        人間は幽霊を探し出して退治する。幽霊の居場所は人間には見えない。
      </p>
      <p>
        <b className={b}>屋敷</b>: 2階建て11部屋、潜伏場所32か所。隣の部屋・廊下・階段への移動はどれも<b className={b}>2</b>。
        人間は出入口しか通れない。幽霊は壁を抜けられる(屋根裏部屋だけは子供部屋からしか出入りできない)。
      </p>
      <p>
        <b className={b}>手番</b>: 幽霊 → 人間3人(順番固定) → 幽霊…。サイコロの目が移動と探索に使える力。余った目は捨ててよい。
        探索は1ターン1回で、探索するとそれ以上動けない。
      </p>
      <p>
        <b className={b}>幽霊のターン</b>: サイコロ2個(復活後3個)。移動 → 探索(任意) → 潜伏。同じ部屋の潜伏場所への移動は0。廊下で終えてもよいが廊下では探索できない。
        探索すると、同じ部屋の人間には場所まで、隣の部屋・その階の廊下の人間には部屋だけ<b className={b}>気配</b>が伝わる。
      </p>
      <p>
        <b className={b}>人間のターン</b>: サイコロ1個。探索コストは幽霊より1少ない。幽霊が潜む潜伏場所を探索すると<b className={b}>発見</b>して1ダメージ(獣の槍なら2)。
        ダメージを受けた幽霊はすぐサイコロを振り直して<b className={b}>緊急逃走</b>する。アイテムはサイコロの前後・移動中にいつでも使える(探索するとターン終了)。
        同じ部屋・廊下の仲間とはアイテムを受け渡しできる。
      </p>
      <p>
        <b className={b}>幽霊の成長</b>: 品なしは見つかれば即退治。1つ目で体力2+ワープ、2つ目で人間全員を屋根裏部屋かバスルームへ引きずり込み+ワープ、
        3つ目で<b className="text-red-400">完全復活</b>(体力+1、サイコロ3個、居場所が人間にも見える、移動した部屋・廊下の人間を即死させる)。
        完全復活後は、幽霊のいる場所を探索(コスト0)したとき勾玉の剣か獣の槍を持っていればダメージ。布の色は白→薄ピンク→濃いピンク→真っ赤。
      </p>
      <p>
        <b className={b}>勝敗</b>: 幽霊の体力が0で人間の勝ち。人間が全滅したら幽霊の勝ち。ターン制限なし。死んだ人間の持ち物はなくなる。
      </p>
      <div>
        <b className={b}>人間のアイテム</b>(1人2つまで。潜伏場所にランダム。探索で見つけたら取る・持ち物と交換・置いていくを選べる)
        <ul className="mt-1 grid gap-x-4 gap-y-0.5 sm:grid-cols-2">
          {[...HUMAN_ITEM_KINDS, ...HIDDEN_ITEM_KINDS].map((k) => (
            <li key={k}>
              {ITEMS[k].icon} <b className={b}>{ITEMS[k].name}</b>: {ITEMS[k].desc}
            </li>
          ))}
        </ul>
      </div>
      <div>
        <b className={b}>キャラクター</b>(7人から3人。ランダムか自由に選ぶ)
        <ul className="mt-1 grid gap-x-4 gap-y-0.5 sm:grid-cols-2">
          {CHARACTER_IDS.map((id) => (
            <li key={id}>
              {CHARACTERS[id].icon} <b className={b}>{CHARACTERS[id].name}</b>: {CHARACTERS[id].desc}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
