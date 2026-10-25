"use client";

import { useEffect, useState, type RefObject } from "react";

// Dice as in 陣取りゲーム: a big roll button in the middle of the map, then the
// dice tumble through random faces and land on the roll.

const PIPS: Record<number, [number, number][]> = {
  1: [[1, 1]],
  2: [[0, 0], [2, 2]],
  3: [[0, 0], [1, 1], [2, 2]],
  4: [[0, 0], [2, 0], [0, 2], [2, 2]],
  5: [[0, 0], [2, 0], [1, 1], [0, 2], [2, 2]],
  6: [[0, 0], [2, 0], [0, 1], [2, 1], [0, 2], [2, 2]],
};

export function Die({ value, size = "md" }: { value: number; size?: "sm" | "md" | "lg" | "xl" }) {
  const dim =
    size === "xl" ? "h-24 w-24 p-3.5" : size === "lg" ? "h-16 w-16 p-2.5" : size === "md" ? "h-11 w-11 p-1.5" : "h-7 w-7 p-1";
  // Flick through random faces for a moment, then land on the real roll.
  const [face, setFace] = useState((value % 6) + 1);
  useEffect(() => {
    let ticks = 0;
    const t = setInterval(() => {
      ticks++;
      if (ticks >= 7) {
        setFace(value);
        clearInterval(t);
      } else {
        setFace(1 + Math.floor(Math.random() * 6));
      }
    }, 55);
    return () => clearInterval(t);
  }, [value]);
  return (
    <span className={`gh-roll grid grid-cols-3 grid-rows-3 rounded-xl bg-ink shadow-lg ${dim}`}>
      {Array.from({ length: 9 }, (_, k) => {
        const on = PIPS[face]?.some(([x, y]) => x === k % 3 && y === Math.floor(k / 3));
        return (
          <span key={k} className="flex items-center justify-center">
            {on && <span className={`rounded-full ${face === 1 ? "h-[70%] w-[70%] bg-red-600" : "h-[62%] w-[62%] bg-black"}`} />}
          </span>
        );
      })}
    </span>
  );
}

export function DiceRow({ dice, size = "sm" }: { dice: number[]; size?: "sm" | "md" }) {
  return (
    <span className="flex gap-1.5">
      {dice.map((d, i) => (
        <Die key={`${i}-${d}-${dice.join()}`} value={d} size={size} />
      ))}
    </span>
  );
}

/**
 * Screen position of the middle of the map's visible part (the map can be
 * taller than the screen), so center overlays are always in view.
 */
function useBoardCenter(anchor: RefObject<HTMLDivElement | null>) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  useEffect(() => {
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const r = anchor.current?.getBoundingClientRect();
        if (!r) return;
        const top = Math.max(r.top, 0);
        const bottom = Math.min(r.bottom, window.innerHeight);
        const y = bottom - top > 120 ? (top + bottom) / 2 : window.innerHeight / 2;
        setPos({ x: r.left + r.width / 2, y });
      });
    };
    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [anchor]);
  return pos;
}

function CenterLayer({ anchor, children }: { anchor: RefObject<HTMLDivElement | null>; children: React.ReactNode }) {
  const pos = useBoardCenter(anchor);
  if (!pos) return null;
  return (
    <div className="pointer-events-none fixed z-30 -translate-x-1/2 -translate-y-1/2" style={{ left: pos.x, top: pos.y }}>
      {children}
    </div>
  );
}

export function RollButton({
  anchor,
  diceCount,
  label,
  note,
  onRoll,
}: {
  anchor: RefObject<HTMLDivElement | null>;
  diceCount: number;
  label: string;
  note?: string;
  onRoll: () => Promise<unknown>;
}) {
  const [busy, setBusy] = useState(false);
  const roll = async () => {
    if (busy) return;
    setBusy(true);
    await onRoll();
    setBusy(false);
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === " " || e.key === "Enter") && !(e.target instanceof HTMLButtonElement || e.target instanceof HTMLInputElement)) {
        e.preventDefault();
        void roll();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
  return (
    <CenterLayer anchor={anchor}>
      <button
        disabled={busy}
        onClick={roll}
        className="gh-pop pointer-events-auto flex flex-col items-center gap-1 rounded-3xl border-2 border-violet bg-panel/90 px-8 py-5 shadow-[0_0_40px_rgba(139,125,255,0.45)] backdrop-blur transition-transform hover:scale-105 disabled:opacity-50"
      >
        <span className="gh-wobble text-6xl">{"🎲".repeat(diceCount)}</span>
        <span className="text-lg font-black text-violet">{label}</span>
        {note && <span className="text-xs text-white/60">{note}</span>}
        <span className="text-[10px] text-white/35">タップ(スペースキーでも可)</span>
      </button>
    </CenterLayer>
  );
}

export const DICE_RESULT_MS = 1700;

/** Shows a roll in the middle of the map for a moment. */
export function DiceResult({ anchor, dice, text }: { anchor: RefObject<HTMLDivElement | null>; dice: number[]; text: string }) {
  return (
    <CenterLayer anchor={anchor}>
      <div className="gh-dice-result flex flex-col items-center gap-2 rounded-3xl border-2 border-violet/70 bg-panel/90 px-8 py-5 shadow-2xl backdrop-blur">
        <span className="flex max-w-[80vw] flex-wrap justify-center gap-3">
          {dice.map((d, i) => (
            <Die key={i} value={d} size={dice.length <= 2 ? "xl" : "lg"} />
          ))}
        </span>
        <p className="gh-reveal text-2xl font-black text-gold">{text}</p>
      </div>
    </CenterLayer>
  );
}
