"use client";

import { useState } from "react";
import type { ClientRoom, RoomSettings } from "@/lib/types";
import { MAX_PLAYERS, MIN_PLAYERS } from "@/lib/types";
import RulesPanel from "./RulesPanel";
import GhostSprite from "./GhostSprite";

export default function Lobby({
  room,
  viewerId,
  onStart,
  onSettings,
  onAddBot,
  onRemoveBot,
}: {
  room: ClientRoom;
  viewerId: string;
  onStart: () => Promise<string | null>;
  onSettings: (settings: Partial<RoomSettings>) => Promise<string | null>;
  onAddBot: () => Promise<string | null>;
  onRemoveBot: (botId: string) => Promise<string | null>;
}) {
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const me = room.players.find((p) => p.id === viewerId);
  const isHost = !!me?.isHost;
  const shareUrl = typeof window !== "undefined" ? `${window.location.origin}/room/${room.code}` : "";
  const count = room.players.length;
  const startBlocker = count < MIN_PLAYERS ? "もう1人以上来るのを待っています(2〜4人)" : null;
  const botControls = room.isTest && isHost;

  async function handleStart() {
    setStarting(true);
    const err = await onStart();
    setStarting(false);
    setError(err);
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(shareUrl);
    } catch {
      // clipboard unavailable; user can copy manually
    }
  }

  const choice = (active: boolean) =>
    `rounded-lg border px-3 py-1.5 ${active ? "border-violet bg-violet/25 text-white" : "border-white/10 text-white/50 enabled:hover:bg-white/10"}`;

  return (
    <div className="mx-auto w-full max-w-xl text-center">
      {room.isTest ? (
        <p className="mb-6 rounded-lg border border-gold/40 bg-gold/10 px-4 py-2 text-sm text-gold">
          🧪 動作確認用の部屋: テスト相手はサイコロを振って適当に動くだけです。
        </p>
      ) : (
        <>
          <p className="mb-1 text-white/60">部屋コード</p>
          <div className="mb-4 flex items-center justify-center gap-3">
            <span className="pl-[0.3em] text-5xl font-black tracking-[0.3em] text-ink">{room.code}</span>
          </div>
          <div className="mb-6 flex items-center justify-center gap-2">
            <input
              readOnly
              value={shareUrl}
              className="w-full max-w-sm rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/70"
            />
            <button onClick={copyLink} className="whitespace-nowrap rounded-lg bg-white/10 px-3 py-2 text-sm hover:bg-white/20">
              リンクをコピー
            </button>
          </div>
        </>
      )}

      <ul className="mb-6 space-y-2 text-left">
        {room.players.map((p) => {
          const isGhost = room.settings.ghost === p.id;
          return (
            <li key={p.id} className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-4 py-3">
              <span className={`min-w-0 flex-1 truncate ${p.connected ? "" : "opacity-40"}`}>
                {p.name}
                {p.isBot && " 🧪"}
                {p.isHost && <span className="ml-1 text-xs text-white/40">(ホスト)</span>}
                {p.id === viewerId && <span className="ml-1 text-xs text-white/40">(あなた)</span>}
              </span>
              <button
                disabled={!isHost}
                onClick={async () => setError(await onSettings({ ghost: isGhost ? "random" : p.id }))}
                className={`flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-xs ${
                  isGhost ? "border-violet bg-violet/25 text-white" : "border-white/10 text-white/40 enabled:hover:bg-white/10"
                }`}
              >
                <GhostSprite color="#f4f4f6" size={16} />
                {isGhost ? "幽霊役" : "幽霊にする"}
              </button>
              {botControls && p.isBot && (
                <button
                  onClick={async () => setError(await onRemoveBot(p.id))}
                  className="rounded border border-white/15 px-1.5 text-xs text-white/60 hover:bg-white/10"
                  title="テスト相手を外す"
                >
                  ×
                </button>
              )}
            </li>
          );
        })}
        {botControls && count < MAX_PLAYERS && (
          <li>
            <button
              onClick={async () => setError(await onAddBot())}
              className="w-full rounded-lg border border-dashed border-white/15 py-2 text-sm text-white/60 hover:bg-white/10"
            >
              + テスト相手を追加
            </button>
          </li>
        )}
      </ul>

      <div className="mb-6 space-y-3 rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm">
        <div className="flex flex-wrap items-center justify-center gap-2">
          <span className="text-white/50">幽霊役</span>
          <button disabled={!isHost} onClick={async () => setError(await onSettings({ ghost: "random" }))} className={choice(room.settings.ghost === "random")}>
            ランダム
          </button>
          <span className="text-xs text-white/40">(上の一覧で指名もできる)</span>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <span className="text-white/50">人間のキャラクター</span>
          <button disabled={!isHost} onClick={async () => setError(await onSettings({ characters: "random" }))} className={choice(room.settings.characters === "random")}>
            ランダム
          </button>
          <button disabled={!isHost} onClick={async () => setError(await onSettings({ characters: "free" }))} className={choice(room.settings.characters === "free")}>
            自由に選ぶ
          </button>
        </div>
        <p className="text-xs text-white/40">人間は3人。人間側のプレイヤーが1〜3人で分担して動かす。</p>
      </div>

      {startBlocker && <p className="mb-4 text-sm text-white/50">{startBlocker}</p>}

      {isHost ? (
        <button
          onClick={handleStart}
          disabled={starting || !!startBlocker}
          className="rounded-full bg-violet px-8 py-3 font-bold text-white hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {starting ? "開始中..." : "ゲームを始める"}
        </button>
      ) : (
        <p className="text-white/60">ホストの開始を待っています…</p>
      )}
      {error && <p className="mt-3 text-sm text-red-400">{error}</p>}

      <div className="mt-10 text-left">
        <RulesPanel defaultOpen />
      </div>
    </div>
  );
}
