"use client";

import { useState } from "react";
import { GHOST_COLORS } from "@/lib/catalog";
import { locName, spotName, type LocId } from "@/lib/map";
import type { ClientRoom, Side } from "@/lib/types";
import GhostSprite from "./GhostSprite";

const CONFETTI_COLORS = ["#ffcf5a", "#8b7dff", "#f4f4f6", "#e95783", "#34d399", "#60a5fa", "#fb923c", "#f472b6"];

/** Colorful paper falling over the result. Decoration only: it never catches a click. */
export function Confetti() {
  const [pieces] = useState(() =>
    Array.from({ length: 110 }, (_, i) => ({
      left: Math.random() * 100,
      size: 6 + Math.random() * 7,
      color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
      delay: Math.random() * 2.5,
      duration: 2.8 + Math.random() * 2.4,
      drift: (Math.random() - 0.5) * 30,
      spin: (Math.random() < 0.5 ? -1 : 1) * (360 + Math.random() * 720),
    }))
  );
  return (
    <div className="pointer-events-none fixed inset-0 z-50 overflow-hidden" aria-hidden>
      {pieces.map((p, i) => (
        <span
          key={i}
          className="gh-confetti absolute top-0 block rounded-[1px]"
          style={
            {
              left: `${p.left}%`,
              width: p.size,
              height: p.size * 1.6,
              background: p.color,
              animationDelay: `${p.delay}s`,
              animationDuration: `${p.duration}s`,
              "--gh-drift": `${p.drift}vw`,
              "--gh-spin": `${p.spin}deg`,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}

/** The winner, big in the middle of the screen, with confetti. Click to see the board. */
export function VictoryBanner({ winner, onClose }: { winner: Side; onClose: () => void }) {
  const humans = winner === "human";
  return (
    <>
      <Confetti />
      <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/55 px-4" onClick={onClose}>
        <div
          className={`gh-victory flex flex-col items-center rounded-3xl border-2 bg-panel/95 px-10 py-8 text-center shadow-2xl ${
            humans ? "border-gold/80 shadow-[0_0_60px_rgba(255,207,90,0.4)]" : "border-red-500/80 shadow-[0_0_60px_rgba(227,33,43,0.45)]"
          }`}
        >
          <GhostSprite
            color={humans ? GHOST_COLORS[0] : GHOST_COLORS[3]}
            size={96}
            className={humans ? "gh-vanish" : "gh-float"}
          />
          <p className={`mt-3 text-4xl font-black sm:text-5xl ${humans ? "text-gold" : "text-red-400"}`}>
            {humans ? "人間側の勝利!" : "幽霊の勝利!"}
          </p>
          <p className="mt-2 text-sm text-white/60">{humans ? "幽霊は屋敷から消え去った。" : "屋敷は再び幽霊のものになった。"}</p>
          <p className="mt-4 text-xs text-white/40">クリックで盤面を見る</p>
        </div>
      </div>
    </>
  );
}

/** "The ghost is fully revived!" — shown once to both sides. */
export function RevivePopup({ room, spot, onClose }: { room: ClientRoom; spot?: string; onClose: () => void }) {
  const ghost = room.viewerSide === "ghost";
  return (
    <div className="gh-blood-in fixed inset-0 z-40 flex items-center justify-center bg-[#2a0006]/80 px-4" onClick={onClose}>
      <div
        className="gh-pop w-full max-w-sm rounded-3xl border-2 border-red-600 bg-[#160306] p-6 text-center shadow-[0_0_70px_rgba(227,33,43,0.55)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-center">
          <GhostSprite color={GHOST_COLORS[3]} size={110} className="gh-shake" />
        </div>
        <p className="gh-flicker mt-3 text-3xl font-black text-red-500">幽霊が完全復活した!</p>
        {spot && <p className="mt-2 text-sm text-red-200/70">現れた場所: {spotName(spot)}</p>}
        <p className="mt-3 text-sm leading-relaxed text-red-100/80">
          {ghost
            ? "力が完全に戻った。サイコロは3個、移動した部屋・廊下にいる人間を襲える。"
            : "居場所は丸見えになった。移動してきた幽霊に襲われると即死。勾玉の剣か獣の槍で立ち向かえ。"}
        </p>
        <button onClick={onClose} className="mt-5 rounded-full bg-red-700 px-8 py-2 font-bold text-white hover:brightness-110">
          OK
        </button>
      </div>
    </div>
  );
}

/** A hunter's search found the ghost and hurt it. */
export function HitPopup({
  room,
  spot,
  amount,
  text,
  onClose,
}: {
  room: ClientRoom;
  spot?: string;
  amount: number;
  text: string;
  onClose: () => void;
}) {
  const ghost = room.viewerSide === "ghost";
  const revived = !!room.ghost?.revived;
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 px-4" onClick={onClose}>
      <div
        className={`gh-pop w-full max-w-sm rounded-3xl border-2 bg-panel p-6 text-center shadow-2xl ${
          ghost ? "border-red-500/80" : "border-emerald-400/80 shadow-[0_0_50px_rgba(52,211,153,0.35)]"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <p className={`text-sm font-black ${ghost ? "text-red-300" : "text-emerald-300"}`}>{ghost ? "見つかった!" : "幽霊を発見!"}</p>
        <div className="relative my-3 flex justify-center">
          <GhostSprite color={revived ? GHOST_COLORS[3] : GHOST_COLORS[0]} size={100} className="gh-shake" />
          <span className="gh-hit absolute -right-1 top-0 text-5xl font-black text-gold drop-shadow">-{amount}</span>
        </div>
        <p className="text-2xl font-black">{amount}ダメージ!</p>
        {spot && <p className="mt-1 text-sm text-white/50">{spotName(spot)}</p>}
        <p className="mt-3 text-sm leading-relaxed text-white/70">
          {ghost ? "サイコロを振り直して緊急逃走だ(探索はできない)。" : "幽霊は緊急逃走する。どこへ逃げたかは分からない。"}
        </p>
        <p className="mt-2 text-xs text-white/40">{text}</p>
        <button onClick={onClose} className="mt-4 rounded-full bg-violet px-8 py-2 font-bold text-white hover:brightness-110">
          OK
        </button>
      </div>
    </div>
  );
}

/** The humans heard the ghost searching somewhere near. */
export function NoisePopup({ spot, loc, onClose }: { spot?: string; loc?: LocId; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 px-4" onClick={onClose}>
      <div
        className="gh-pop w-full max-w-sm rounded-3xl border-2 border-violet/70 bg-panel p-6 text-center shadow-[0_0_50px_rgba(139,125,255,0.35)]"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-sm font-black text-violet">気配を感じた…</p>
        <div className="my-3 flex justify-center">
          <GhostSprite color={GHOST_COLORS[0]} size={90} className="gh-fade-ghost" />
        </div>
        <p className="text-2xl font-black">{spot ? spotName(spot) : loc ? locName(loc) : ""}</p>
        <p className="mt-3 text-sm leading-relaxed text-white/70">
          {spot
            ? "同じ部屋で、何かがここを探っていた。"
            : "この部屋で何かが探っていた。近くにいたので部屋までは分かったが、どこを探ったかまでは分からない。"}
        </p>
        <button onClick={onClose} className="mt-4 rounded-full bg-violet px-8 py-2 font-bold text-white hover:brightness-110">
          OK
        </button>
      </div>
    </div>
  );
}

/** A plain announcement: a big icon, a title, where, and a line of explanation. */
export function InfoPopup({
  icon,
  title,
  place,
  note,
  tone,
  onClose,
}: {
  icon: React.ReactNode;
  title: string;
  place?: string;
  note?: string;
  tone: "good" | "bad" | "dull";
  onClose: () => void;
}) {
  const color = {
    good: "border-emerald-400/80 shadow-[0_0_50px_rgba(52,211,153,0.3)] text-emerald-300",
    bad: "border-red-500/80 shadow-[0_0_50px_rgba(227,33,43,0.35)] text-red-300",
    dull: "border-white/25 text-white/70",
  }[tone];
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 px-4" onClick={onClose}>
      <div className={`gh-pop w-full max-w-sm rounded-3xl border-2 bg-panel p-6 text-center shadow-2xl ${color}`} onClick={(e) => e.stopPropagation()}>
        <div className="my-2 flex justify-center text-7xl">{icon}</div>
        <p className="text-2xl font-black text-ink">{title}</p>
        {place && <p className="mt-2 text-lg font-bold text-ink/90">{place}</p>}
        {note && <p className="mt-3 text-sm leading-relaxed text-white/70">{note}</p>}
        <button onClick={onClose} className="mt-5 rounded-full bg-violet px-8 py-2 font-bold text-white hover:brightness-110">
          OK
        </button>
      </div>
    </div>
  );
}
