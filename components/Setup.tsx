"use client";

import { useState } from "react";
import { CHARACTER_IDS, CHARACTERS, type CharacterId } from "@/lib/catalog";
import type { Action, ClientRoom } from "@/lib/types";

/** Free character choice: the human side picks 3 of the 7 characters. */
export default function Setup({
  room,
  send,
}: {
  room: ClientRoom;
  send: (a: Action) => Promise<string | null>;
}) {
  const [error, setError] = useState<string | null>(null);
  const isHuman = room.viewerSide === "human";
  const ghostName = room.players.find((p) => p.side === "ghost")?.name;
  const humans = room.players.filter((p) => p.side === "human");
  const nextSlot = room.picks.findIndex((c) => !c);

  async function toggle(id: CharacterId) {
    const at = room.picks.indexOf(id);
    if (at >= 0) setError(await send({ t: "pick", slot: at, character: null }));
    else if (nextSlot >= 0) setError(await send({ t: "pick", slot: nextSlot, character: id }));
  }

  return (
    <div className="mx-auto w-full max-w-2xl text-center">
      <h2 className="mb-1 text-2xl font-bold">キャラクター選択</h2>
      <p className="mb-6 text-sm text-white/60">
        幽霊: <b className="text-ink">{ghostName}</b> ・ 人間側: {humans.map((p) => p.name).join("、")}
      </p>
      <div className="mb-6 grid grid-cols-3 gap-2">
        {room.picks.map((c, slot) => (
          <div key={slot} className="rounded-xl border border-white/10 bg-panel/70 p-3 text-sm">
            <p className="text-xs text-white/40">
              {slot + 1}人目 ・ {humans[slot % humans.length]?.name}
            </p>
            {c ? (
              <p className="mt-1 flex items-center justify-center gap-1.5 font-bold">
                <span className="inline-flex h-6 w-6 items-center justify-center rounded-full text-sm font-black text-[#1d1b3a]" style={{ background: CHARACTERS[c].color }}>
                  {CHARACTERS[c].icon}
                </span>
                {CHARACTERS[c].name}
              </p>
            ) : (
              <p className="mt-1 text-white/30">未選択</p>
            )}
          </div>
        ))}
      </div>
      <ul className="mb-6 grid gap-2 text-left sm:grid-cols-2">
        {CHARACTER_IDS.map((id) => {
          const c = CHARACTERS[id];
          const chosen = room.picks.includes(id);
          return (
            <li key={id}>
              <button
                disabled={!isHuman || (!chosen && nextSlot < 0)}
                onClick={() => toggle(id)}
                className={`flex w-full items-start gap-3 rounded-xl border p-3 text-left ${
                  chosen ? "border-gold bg-gold/10" : "border-white/10 bg-white/5 enabled:hover:bg-white/10"
                }`}
              >
                <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-lg font-black text-[#1d1b3a]" style={{ background: c.color }}>
                  {c.icon}
                </span>
                <span>
                  <b>{c.name}</b>
                  <span className="block text-xs text-white/60">{c.desc}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {isHuman ? (
        <button
          disabled={nextSlot >= 0}
          onClick={async () => setError(await send({ t: "confirmSetup" }))}
          className="rounded-full bg-violet px-8 py-3 font-bold text-white hover:brightness-110 disabled:opacity-40"
        >
          この3人で始める
        </button>
      ) : (
        <p className="text-white/60">人間側がキャラクターを選んでいます…</p>
      )}
      {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
    </div>
  );
}
