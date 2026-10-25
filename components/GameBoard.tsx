"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CHARACTERS, GHOST_COLORS, GHOST_ITEMS, ITEMS } from "@/lib/catalog";
import { FORCED_ROOMS, GHOST_ADJ, HUMAN_ADJ, MOVE_COST, ROOM, SPOT, SPOTS, isHall, locName, spotName, type LocId, type RoomId } from "@/lib/map";
import type { ClientToServerEvents } from "@/lib/socketEvents";
import type { Action, ClientHunter, ClientRoom, Item, LogEntry } from "@/lib/types";
import HouseMap, { ghostColor } from "./HouseMap";
import GhostSprite from "./GhostSprite";
import { DICE_RESULT_MS, DiceResult, DiceRow, RollButton } from "./Dice";
import { HitPopup, InfoPopup, NoisePopup, RevivePopup, VictoryBanner } from "./Effects";

type ActFn = <E extends keyof ClientToServerEvents>(
  event: E,
  payload: Omit<Parameters<ClientToServerEvents[E]>[0], "code">
) => Promise<string | null>;

const FLASH_MS = 5000;

export default function GameBoard({ room, viewerId, act }: { room: ClientRoom; viewerId: string; act: ActFn }) {
  const [error, setError] = useState<string | null>(null);
  const side = room.viewerSide;
  const myTurn = room.actor === viewerId;
  const turn = room.turn!;
  const escape = room.escape;
  const me = room.players.find((p) => p.id === viewerId);
  const ghostTurn = !!escape || turn.side === "ghost";
  const active: ClientHunter | null = !ghostTurn ? room.hunters[turn.hunter] : null;
  const actorName = room.players.find((p) => p.id === room.actor)?.name ?? "";

  // Selection belongs to one turn step.
  const stepKey = `${turn.round}-${turn.side}-${turn.hunter}-${turn.step}-${escape?.step ?? ""}`;
  const [pickState, setPickState] = useState<{ key: string; spot: string | null; psychic: boolean }>({ key: "", spot: null, psychic: false });
  const selected = pickState.key === stepKey ? pickState.spot : null;
  const psychicMode = pickState.key === stepKey && pickState.psychic;
  const setSelected = (spot: string | null) => setPickState({ key: stepKey, spot, psychic: false });
  const setPsychicMode = (psychic: boolean) => setPickState({ key: stepKey, spot: null, psychic });

  // Flash the places mentioned by log entries newer than what has been shown.
  const newest = room.logs.length ? room.logs[room.logs.length - 1].seq : 0;
  const [seenSeq, setSeenSeq] = useState(newest);
  const flashes = room.logs.filter((l) => l.seq > seenSeq && (l.loc || l.spot)).map((l) => ({ loc: l.loc, spot: l.spot, seq: l.seq }));
  useEffect(() => {
    if (newest <= seenSeq) return;
    const timer = setTimeout(() => setSeenSeq(newest), FLASH_MS);
    return () => clearTimeout(timer);
  }, [newest, seenSeq]);

  // Rolls: the big button in the middle of the map, then the result for a moment.
  const boardRef = useRef<HTMLDivElement>(null);
  const shownDice = (escape ? escape.dice : turn.dice) ?? [];
  const rollKey = shownDice.length ? `${turn.round}-${turn.side}-${turn.hunter}-${escape ? "escape" : ""}-${shownDice.join()}` : "";
  const [seenRoll, setSeenRoll] = useState(rollKey);
  const showRoll = rollKey !== "" && rollKey !== seenRoll && myTurn;
  useEffect(() => {
    if (!showRoll) return;
    const timer = setTimeout(() => setSeenRoll(rollKey), DICE_RESULT_MS);
    return () => clearTimeout(timer);
  }, [showRoll, rollKey]);

  // The winner banner, until it's clicked away.
  const [closedWin, setClosedWin] = useState<number | null>(null);

  async function send(action: Action) {
    const err = await act("game:act", { action });
    setError(err);
    return err;
  }

  // ---------- what can be clicked ----------

  const ghost = room.ghost;
  const ghostStep = escape ? escape.step : turn.step;
  const budget = escape ? escape.budget ?? 0 : turn.budget ?? 0;

  const targets = useMemo(() => {
    const t = new Set<string>();
    if (!myTurn || room.phase !== "playing") return t;
    if (ghostTurn && ghost) {
      if (ghostStep === "warp") {
        SPOTS.forEach((s) => t.add(s.id));
        return t;
      }
      if (ghostStep !== "move" && ghostStep !== "hide") return t;
      const here = SPOTS.filter((s) => s.room === ghost.loc);
      here.forEach((s) => t.add(s.id));
      if (ghostStep === "hide" || budget < MOVE_COST) return t;
      if (room.lock && room.lock.room === ghost.loc && room.ghostTurns < room.lock.until) return t;
      for (const n of GHOST_ADJ[ghost.loc]) {
        if (isHall(n)) t.add(n);
        else SPOTS.filter((s) => s.room === n).forEach((s) => t.add(s.id));
      }
      return t;
    }
    if (active) {
      if (psychicMode) {
        (Object.keys(HUMAN_ADJ) as LocId[]).filter((l) => l !== active.loc).forEach((l) => t.add(l));
        return t;
      }
      if (turn.step === "resolve") return t;
      if (turn.step === "move" && budget >= MOVE_COST) HUMAN_ADJ[active.loc].forEach((l) => t.add(l));
      if (!isHall(active.loc)) SPOTS.filter((s) => s.room === active.loc).forEach((s) => t.add(s.id));
    }
    return t;
  }, [myTurn, room, ghostTurn, ghost, ghostStep, budget, active, psychicMode, turn.step]);

  function onLoc(loc: LocId) {
    if (ghostTurn) send({ t: "gmove", to: loc });
    else if (psychicMode) {
      setPsychicMode(false);
      send({ t: "psychic", loc });
    } else send({ t: "move", loc });
  }

  function onSpot(spotId: string) {
    if (ghostTurn && ghost) {
      if (ghostStep === "warp") return send({ t: "warp", spot: spotId });
      // Spots in another room: step straight in. In this room: choose move or search.
      if (SPOT[spotId].room !== ghost.loc) return send({ t: "gmove", to: spotId });
      if (ghostStep === "hide" || escape) return spotId !== ghost.spot && send({ t: "gmove", to: spotId });
      setSelected(spotId === selected ? null : spotId);
      return;
    }
    setSelected(spotId === selected ? null : spotId);
  }

  // ---------- render ----------

  return (
    <div className="flex flex-col gap-3">
      <TurnBanner room={room} actorName={actorName} myTurn={myTurn} />
      {room.phase === "playing" && <FoundPopup room={room} />}
      {room.phase === "gameover" && room.winner && closedWin !== room.game && (
        <VictoryBanner winner={room.winner} onClose={() => setClosedWin(room.game)} />
      )}

      <div className="grid gap-3 xl:grid-cols-[1fr_330px]">
        <div className="min-w-0">
          <div ref={boardRef}>
            <HouseMap room={room} targets={targets} selected={selected} onSpot={onSpot} onLoc={onLoc} flashes={flashes} />
          </div>
          {myTurn && room.phase === "playing" && (ghostTurn ? ghostStep === "roll" : turn.step === "roll" && !psychicMode) && (
            <RollButton
              anchor={boardRef}
              diceCount={ghostTurn ? (ghost?.revived ? 3 : 2) : hunterDice(active!)}
              label={escape ? "逃走のサイコロを振る" : "サイコロを振る"}
              note={escape ? "見つかった! 振り直して逃げる" : ghostTurn ? undefined : `${CHARACTERS[active!.character].name}の番`}
              onRoll={() => send({ t: "roll" })}
            />
          )}
          {showRoll && (
            <DiceResult key={rollKey} anchor={boardRef} dice={shownDice} text={`移動力 ${shownDice.reduce((a, b) => a + b, 0)}!`} />
          )}
          <Legend side={side} />
        </div>

        <div className="flex min-w-0 flex-col gap-3">
          {room.phase === "gameover" ? (
            <GameOver room={room} isHost={!!me?.isHost} act={act} />
          ) : (
            myTurn && (
              <div className="rounded-xl border border-violet/40 bg-violet/10 p-3">
                {ghostTurn ? (
                  <GhostControls room={room} selected={selected} send={send} />
                ) : (
                  <HunterControls
                    room={room}
                    hunter={active!}
                    selected={selected}
                    send={send}
                    psychicMode={psychicMode}
                    setPsychicMode={setPsychicMode}
                  />
                )}
                {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
              </div>
            )
          )}
          {side === "ghost" && ghost && <GhostStatus room={room} />}
          {side === "human" && <HuntersPanel room={room} viewerId={viewerId} />}
          {side === "ghost" && <HuntersPublic room={room} />}
          <LogPanel logs={room.logs} />
          {me?.isHost && room.phase === "playing" && !myTurn && (
            <SkipButton room={room} act={act} />
          )}
        </div>
      </div>
    </div>
  );
}

function TurnBanner({ room, actorName, myTurn }: { room: ClientRoom; actorName: string; myTurn: boolean }) {
  const turn = room.turn!;
  if (room.phase === "gameover") return null;
  const escape = room.escape;
  let title: string;
  if (escape) title = "幽霊の緊急逃走";
  else if (turn.side === "ghost") title = "幽霊のターン";
  else title = `${CHARACTERS[room.hunters[turn.hunter].character].name}のターン`;
  const dice = escape ? escape.dice : turn.dice;
  const budget = escape ? escape.budget : turn.budget;
  return (
    <div
      className={`flex flex-wrap items-center gap-3 rounded-xl border px-4 py-2 ${
        myTurn ? "border-gold/60 bg-gold/10" : "border-white/10 bg-panel/70"
      }`}
    >
      <span className="text-xs text-white/40">ラウンド {turn.round}</span>
      <span className="font-bold">{title}</span>
      <span className="text-sm text-white/60">{myTurn ? "あなたの番です" : `${actorName} が操作中…`}</span>
      {dice && dice.length > 0 && (
        <span className="ml-auto flex items-center gap-2 text-sm">
          <DiceRow dice={dice} />
          <span className="text-white/60">残り移動力</span>
          <b className="text-lg text-gold">{budget}</b>
        </span>
      )}
    </div>
  );
}

function Btn({
  children,
  onClick,
  primary,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  primary?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`rounded-full px-4 py-2 text-sm font-bold disabled:opacity-40 ${
        primary ? "bg-violet text-white hover:brightness-110" : "border border-white/15 bg-white/5 text-white/80 hover:bg-white/10"
      }`}
    >
      {children}
    </button>
  );
}

// ---------- ghost ----------

function GhostControls({ room, selected, send }: { room: ClientRoom; selected: string | null; send: (a: Action) => void }) {
  const g = room.ghost!;
  const escape = room.escape;
  const step = escape ? escape.step : room.turn!.step;
  const budget = escape ? escape.budget ?? 0 : room.turn!.budget ?? 0;
  const candle = false; // the ghost can't see candles; the server checks the real cost
  if (step === "roll") {
    return (
      <div className="space-y-2">
        <p className="text-sm text-white/70">
          {escape ? "見つかった! サイコロを振って逃げよう(探索はできない)。" : `サイコロを${g.revived ? 3 : 2}個振る。`}
          マップ中央のサイコロをタップ。
        </p>
      </div>
    );
  }
  if (step === "forced") {
    return (
      <div className="space-y-2">
        <p className="text-sm text-white/70">2つ目の品の力。人間3人をどこへ引きずり込む?</p>
        <div className="flex gap-2">
          {FORCED_ROOMS.map((r) => (
            <Btn key={r} primary onClick={() => send({ t: "forced", room: r })}>
              {ROOM[r].name}
            </Btn>
          ))}
        </div>
      </div>
    );
  }
  if (step === "warp") {
    return <p className="text-sm text-white/70">✨ 品の力でワープできる。マップの好きな潜伏場所をクリック。</p>;
  }
  const sel = selected && SPOT[selected];
  return (
    <div className="space-y-2">
      <p className="text-sm text-white/70">
        {step === "hide"
          ? "探索した。部屋の中の好きな潜伏場所に隠れてから終了。"
          : "光っている場所をクリックして移動(隣の部屋・廊下は2)。今いる部屋の潜伏場所を選ぶと探索できる。"}
      </p>
      {sel && !escape && step === "move" && (
        <div className="rounded-lg border border-white/10 bg-black/20 p-2 text-sm">
          <p className="mb-2 font-bold">{spotName(sel.id)}</p>
          <div className="flex flex-wrap gap-2">
            {sel.id !== g.spot && <Btn onClick={() => send({ t: "gmove", to: sel.id })}>ここへ移る(0)</Btn>}
            <Btn primary disabled={sel.cost + (candle ? 2 : 0) > budget} onClick={() => send({ t: "search", spot: sel.id })}>
              🔍 探索する(コスト{sel.cost})
            </Btn>
          </div>
          <p className="mt-1 text-xs text-white/40">探索すると、その後は部屋の中でしか動けない。</p>
        </div>
      )}
      <Btn primary onClick={() => send({ t: "end" })}>
        {g.spot ? "ここに潜伏して終了" : "廊下に潜んで終了"}
      </Btn>
    </div>
  );
}

function GhostStatus({ room }: { room: ClientRoom }) {
  const g = room.ghost!;
  return (
    <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-panel/70 p-3">
      <GhostSprite color={ghostColor(room)} size={52} className="gh-float" />
      <div className="min-w-0 text-sm">
        <p className="font-bold">
          幽霊 {g.revived ? <span className="text-red-400">完全復活</span> : <span className="text-white/50">力を失っている</span>}
        </p>
        <p className="text-white/70">
          体力 <b className="text-ink">{g.hp}</b> ・ 集めた品 {g.collected}
        </p>
        <p className="truncate text-white/60">
          {g.held.length ? g.held.map((n) => `${GHOST_ITEMS[n].icon}${GHOST_ITEMS[n].name}`).join(" ") : "まだ何も持っていない"}
        </p>
        <p className="text-xs text-white/40">居場所: {g.spot ? spotName(g.spot) : locName(g.loc)}</p>
      </div>
    </div>
  );
}

function HuntersPublic({ room }: { room: ClientRoom }) {
  return (
    <div className="rounded-xl border border-white/10 bg-panel/70 p-3 text-sm">
      <p className="mb-2 font-bold">人間たち</p>
      <ul className="space-y-1">
        {room.hunters.map((h) => (
          <li key={h.slot} className={`flex items-center gap-2 ${h.alive ? "" : "opacity-40 line-through"}`}>
            <span className="inline-flex h-6 w-6 items-center justify-center rounded-full text-sm font-black text-[#1d1b3a]" style={{ background: CHARACTERS[h.character].color }}>
              {CHARACTERS[h.character].icon}
            </span>
            <span>{CHARACTERS[h.character].name}</span>
            <span className="text-white/50">{locName(h.loc)}</span>
            <span className="ml-auto text-xs text-white/40">道具 {h.itemCount}個</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------- humans ----------

function capacity(h: ClientHunter) {
  return h.character === "painter" ? 3 : 2;
}

function hunterDice(h: ClientHunter) {
  const kinds = (h.items ?? []).map((i) => i.kind);
  return 1 + (kinds.includes("redbeads") && kinds.includes("bluebeads") ? 1 : 0) + (h.gamblerNext ? 1 : 0);
}

function HunterControls({
  room,
  hunter,
  selected,
  send,
  psychicMode,
  setPsychicMode,
}: {
  room: ClientRoom;
  hunter: ClientHunter;
  selected: string | null;
  send: (a: Action) => Promise<string | null>;
  psychicMode: boolean;
  setPsychicMode: (v: boolean) => void;
}) {
  const turn = room.turn!;
  const budget = turn.budget ?? 0;
  const c = CHARACTERS[hunter.character];
  const items = hunter.items ?? [];
  const sel = selected && SPOT[selected];
  const ghost = room.ghost;

  if (turn.step === "resolve" && turn.resolveSpot) {
    return <ResolvePanel room={room} hunter={hunter} spotId={turn.resolveSpot} send={send} />;
  }

  const cost = (id: string) => (ghost?.revived && ghost.spot === id ? 0 : Math.max(0, SPOT[id].cost - 1));

  return (
    <div className="space-y-3 text-sm">
      <p className="flex items-center gap-2 font-bold">
        <span className="inline-flex h-7 w-7 items-center justify-center rounded-full font-black text-[#1d1b3a]" style={{ background: c.color }}>
          {c.icon}
        </span>
        {c.name}({locName(hunter.loc)})
      </p>
      {turn.step === "roll" ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-white/60">マップ中央のサイコロをタップ。振る前にアイテムも使える。</span>
          {hunter.character === "psychic" && !hunter.psychicUsed && (
            <Btn onClick={() => setPsychicMode(!psychicMode)}>{psychicMode ? "ワープをやめる" : "🌀 ワープ(1回だけ)"}</Btn>
          )}
        </div>
      ) : (
        <p className="text-white/60">光っている部屋・廊下をクリックして移動(1マス2)。潜伏場所を選ぶと探索できる(探索するとターン終了)。</p>
      )}
      {psychicMode && <p className="text-gold">ワープ先の部屋・廊下をクリック</p>}

      {sel && (
        <div className="rounded-lg border border-white/10 bg-black/20 p-2">
          <p className="mb-2 font-bold">{spotName(sel.id)}</p>
          <div className="flex flex-wrap gap-2">
            <Btn primary disabled={cost(sel.id) > budget} onClick={() => send({ t: "search", spot: sel.id })}>
              🔍 探索する(コスト{cost(sel.id)})
            </Btn>
            {items
              .filter((i) => ITEMS[i.kind].use === "spot")
              .map((i) => (
                <Btn key={i.id} disabled={room.usedThisRound.includes(i.id)} onClick={() => send({ t: "use", item: i.id, spot: sel.id })}>
                  {ITEMS[i.kind].icon} {ITEMS[i.kind].name}を置く
                </Btn>
              ))}
          </div>
        </div>
      )}

      <ItemList hunter={hunter} room={room} send={send} />
      <PlacedHere room={room} hunter={hunter} send={send} />
      <Transfer room={room} hunter={hunter} send={send} />

      <div className="pt-1">
        <Btn onClick={() => send({ t: "end" })}>ターンを終える</Btn>
      </div>
    </div>
  );
}

function ItemList({ hunter, room, send }: { hunter: ClientHunter; room: ClientRoom; send: (a: Action) => Promise<string | null> }) {
  const items = hunter.items ?? [];
  if (!items.length) return <p className="text-white/40">持ち物なし(最大{capacity(hunter)}つ)</p>;
  return (
    <div>
      <p className="mb-1 text-xs text-white/40">
        持ち物 {items.length}/{capacity(hunter)}
      </p>
      <ul className="space-y-1">
        {items.map((i) => {
          const d = ITEMS[i.kind];
          const usable = d.use === "room" || d.use === "self";
          const used = room.usedThisRound.includes(i.id);
          return (
            <li key={i.id} className="flex items-center gap-2 rounded-lg bg-white/5 px-2 py-1">
              <span title={d.desc}>
                {d.icon} {d.name}
                {i.kind === "fake" && i.mimic ? `(${GHOST_ITEMS[i.mimic].name})` : ""}
                {i.uses !== undefined && <span className="text-xs text-white/50"> 残{i.uses}</span>}
              </span>
              {usable && (
                <button
                  disabled={used || (d.use === "room" && isHall(hunter.loc))}
                  onClick={() => send({ t: "use", item: i.id })}
                  className="ml-auto rounded-full bg-violet/70 px-3 py-0.5 text-xs font-bold disabled:opacity-30"
                >
                  {d.use === "room" ? "この部屋に使う" : "使う"}
                </button>
              )}
              {d.use === "spot" && <span className="ml-auto text-xs text-white/40">潜伏場所を選んで置く</span>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function PlacedHere({ room, hunter, send }: { room: ClientRoom; hunter: ClientHunter; send: (a: Action) => Promise<string | null> }) {
  const p = room.placed;
  if (!p || isHall(hunter.loc)) return null;
  const here: Item[] = [
    ...p.bells.filter((b) => b.room === hunter.loc).map((b) => b.item),
    ...p.ofuda.filter((o) => SPOT[o.spot].room === hunter.loc).map((o) => o.item),
    ...p.mirrors.filter((m) => SPOT[m.spot].room === hunter.loc).map((m) => m.item),
  ];
  if (!here.length) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {here.map((i) => (
        <Btn key={i.id} onClick={() => send({ t: "pickup", item: i.id })}>
          {ITEMS[i.kind].icon} {ITEMS[i.kind].name}を回収
        </Btn>
      ))}
    </div>
  );
}

function Transfer({ room, hunter, send }: { room: ClientRoom; hunter: ClientHunter; send: (a: Action) => Promise<string | null> }) {
  const mates = room.hunters.filter((h) => h.alive && h.slot !== hunter.slot && h.loc === hunter.loc);
  if (!mates.length || ![hunter, ...mates].some((h) => h.items?.length)) return null;
  return (
    <div className="rounded-lg border border-white/10 p-2">
      <p className="mb-1 text-xs text-white/40">同じ場所の仲間と受け渡し</p>
      {mates.map((m) => (
        <div key={m.slot} className="mb-1 flex flex-wrap items-center gap-1 text-xs">
          <span className="mr-1">{CHARACTERS[m.character].name}:</span>
          {(hunter.items ?? []).map((i) => (
            <button key={i.id} onClick={() => send({ t: "give", item: i.id, to: m.slot })} className="rounded-full border border-white/15 px-2 py-0.5 hover:bg-white/10">
              {ITEMS[i.kind].icon}を渡す
            </button>
          ))}
          {(m.items ?? []).map((i) => (
            <button key={i.id} onClick={() => send({ t: "take", item: i.id, from: m.slot })} className="rounded-full border border-white/15 px-2 py-0.5 hover:bg-white/10">
              {ITEMS[i.kind].icon}をもらう
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}

function ResolvePanel({
  room,
  hunter,
  spotId,
  send,
}: {
  room: ClientRoom;
  hunter: ClientHunter;
  spotId: string;
  send: (a: Action) => Promise<string | null>;
}) {
  const k = room.known[spotId];
  const items = hunter.items ?? [];
  const full = items.length >= capacity(hunter);
  const found = k?.type === "human" ? ITEMS[k.kind] : null;
  return (
    <div className="space-y-2 text-sm">
      <p className="font-bold">{spotName(spotId)} の探索結果</p>
      {found ? (
        <>
          <p>
            {found.icon} <b>{found.name}</b> を見つけた
          </p>
          <p className="text-xs text-white/50">{found.desc}</p>
          <div className="flex flex-wrap gap-2">
            {!full && (
              <Btn primary onClick={() => send({ t: "resolve", take: true, leave: null })}>
                手に入れる
              </Btn>
            )}
            {items.map((i) => (
              <Btn key={i.id} onClick={() => send({ t: "resolve", take: true, leave: i.id })}>
                {ITEMS[i.kind].icon}{ITEMS[i.kind].name}と交換
              </Btn>
            ))}
            <Btn onClick={() => send({ t: "resolve", take: false, leave: null })}>取らない</Btn>
          </div>
        </>
      ) : (
        <>
          <p className="text-white/70">何もなかった。持ち物をここに置いていくこともできる。</p>
          <div className="flex flex-wrap gap-2">
            {items.map((i) => (
              <Btn key={i.id} onClick={() => send({ t: "resolve", take: false, leave: i.id })}>
                {ITEMS[i.kind].icon}{ITEMS[i.kind].name}を置く
              </Btn>
            ))}
            <Btn primary onClick={() => send({ t: "resolve", take: false, leave: null })}>
              何も置かない
            </Btn>
          </div>
        </>
      )}
    </div>
  );
}

function HuntersPanel({ room, viewerId }: { room: ClientRoom; viewerId: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-panel/70 p-3 text-sm">
      <p className="mb-2 font-bold">人間たち</p>
      <ul className="space-y-2">
        {room.hunters.map((h) => {
          const c = CHARACTERS[h.character];
          const ctrl = room.players.find((p) => p.id === h.controller);
          return (
            <li key={h.slot} className={`rounded-lg bg-white/5 px-2 py-1.5 ${h.alive ? "" : "opacity-40"}`}>
              <div className="flex items-center gap-2">
                <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-sm font-black text-[#1d1b3a]" style={{ background: c.color }}>
                  {h.alive ? c.icon : "✝"}
                </span>
                <span className="font-bold" title={c.desc}>
                  {c.name}
                </span>
                <span className="text-white/50">{locName(h.loc)}</span>
                <span className={`ml-auto truncate text-xs ${h.controller === viewerId ? "text-gold" : "text-white/40"}`}>
                  {ctrl?.name}
                </span>
              </div>
              <p className="mt-0.5 text-xs text-white/50">{c.desc}</p>
              <p className="mt-0.5 text-xs">
                {(h.items ?? []).length
                  ? (h.items ?? []).map((i) => `${ITEMS[i.kind].icon}${ITEMS[i.kind].name}${i.uses !== undefined ? `(残${i.uses})` : ""}`).join("  ")
                  : <span className="text-white/30">持ち物なし</span>}
                {h.gamblerNext && <span className="ml-1 text-gold">🎲次ターン+1</span>}
              </p>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ---------- shared ----------

function LogPanel({ logs }: { logs: LogEntry[] }) {
  const recent = [...logs].reverse().slice(0, 40);
  const tone = { info: "text-white/70", good: "text-emerald-300", bad: "text-red-300", warn: "text-gold" } as const;
  return (
    <div className="rounded-xl border border-white/10 bg-panel/70 p-3 text-sm">
      <p className="mb-2 font-bold">できごと</p>
      <ul className="max-h-72 space-y-1 overflow-y-auto pr-1">
        {recent.map((l) => (
          <li key={l.seq} className={tone[l.tone]}>
            {l.text}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Legend({ side }: { side: ClientRoom["viewerSide"] }) {
  return (
    <p className="mt-2 px-1 text-xs leading-relaxed text-white/40">
      <span className="text-[#e0b85a]">┅</span> 出入口(人間はここしか通れない。幽霊は壁も抜ける)
      ・ <span className="text-gold">●</span>の数字 = {side === "ghost" ? "幽霊" : "人間"}の探索コスト ・ <span className="font-black text-red-500">✕</span>何もなかった ・ 📜落魂札 🪞手鏡 🔔鈴 💧聖水 🕯️蝋燭 ❔隠しアイテムの部屋 ✨見つけた隠しアイテム
      {side === "human" && " ・ 👣巫女が見た幽霊の探索跡"}
    </p>
  );
}

function GameOver({ room, isHost, act }: { room: ClientRoom; isHost: boolean; act: ActFn }) {
  const humansWon = room.winner === "human";
  return (
    <div className={`rounded-xl border p-4 text-center ${humansWon ? "border-emerald-400/50 bg-emerald-400/10" : "border-red-400/50 bg-red-400/10"}`}>
      <div className="mb-2 flex justify-center">
        <GhostSprite color={humansWon ? GHOST_COLORS[0] : GHOST_COLORS[3]} size={64} className={humansWon ? "opacity-40" : "gh-float"} />
      </div>
      <p className="text-2xl font-black">{humansWon ? "人間側の勝利!" : "幽霊の勝利!"}</p>
      <p className="mt-1 text-sm text-white/60">マップにはすべての潜伏場所の中身が表示されています。</p>
      {room.hidden && (
        <p className="mt-1 text-xs text-white/50">
          隠しアイテム: {ITEMS[room.hidden.kind].name}({ROOM[room.hidden.room as RoomId].name})
        </p>
      )}
      {isHost ? (
        <div className="mt-3 flex justify-center gap-2">
          <Btn primary onClick={() => act("game:playAgain", {})}>
            もう一度遊ぶ
          </Btn>
          <Btn onClick={() => act("game:backToLobby", {})}>ロビーへ戻る</Btn>
        </div>
      ) : (
        <p className="mt-3 text-xs text-white/40">ホストの操作を待っています…</p>
      )}
    </div>
  );
}

/** Pops up what a search (or the flashlight) turned up, and the full revival, one at a time. */
function FoundPopup({ room }: { room: ClientRoom }) {
  const newest = room.logs.length ? room.logs[room.logs.length - 1].seq : 0;
  const [seen, setSeen] = useState(newest);
  const entry = room.logs.find((l) => (l.found || l.event) && l.seq > seen);
  useEffect(() => {
    if (!entry) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSeen(entry.seq);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [entry]);
  const close = () => entry && setSeen(entry.seq);
  if (entry?.event === "revive") return <RevivePopup room={room} spot={entry.spot} onClose={close} />;
  if (entry?.event === "hit") return <HitPopup room={room} spot={entry.spot} amount={entry.amount ?? 1} text={entry.text} onClose={close} />;
  if (entry?.event === "noise") return <NoisePopup spot={entry.spot} loc={entry.loc} onClose={close} />;
  const place = entry?.spot ? spotName(entry.spot) : entry?.loc ? locName(entry.loc) : undefined;
  const isGhost = room.viewerSide === "ghost";
  if (entry?.event === "kenchi") {
    return (
      <InfoPopup
        icon="👹"
        title={isGhost ? "検知鬼くんに見つかった!" : "検知鬼くんが幽霊を見つけた!"}
        place={place}
        note={isGhost ? "人間に居場所を知られた。" : entry.spot ? "同じ部屋にいるので潜伏場所まで分かった。" : "幽霊はこの部屋のどこかにいる。"}
        tone={isGhost ? "bad" : "good"}
        onClose={close}
      />
    );
  }
  if (entry?.event === "bell") {
    return (
      <InfoPopup
        icon={<span className="gh-ring inline-block">🔔</span>}
        title="鈴が鳴った!"
        place={place}
        note={isGhost ? "人間が仕掛けた聖なる鈴だ。この部屋に入ったことを知られた。" : "幽霊がこの部屋に入った!"}
        tone={isGhost ? "bad" : "good"}
        onClose={close}
      />
    );
  }
  if (!entry?.found) return null;
  const f = entry.found;
  if (f.type === "empty") {
    return <InfoPopup icon="❌" title="残念! 何もなかった!" place={place} tone="dull" onClose={close} />;
  }
  const mine = room.viewerSide === "ghost" ? f.type === "ghost" : f.type === "human";
  const icon = f.type === "human" ? ITEMS[f.kind].icon : f.fake ? "🎭" : GHOST_ITEMS[f.name].icon;
  const name = f.type === "human" ? ITEMS[f.kind].name : GHOST_ITEMS[f.name].name;
  const title =
    f.type === "ghost" && room.viewerSide === "ghost"
      ? "幽霊の品を手に入れた!"
      : f.type === "ghost"
        ? f.fake
          ? "偽物の品を見つけた"
          : "幽霊の品を見つけた!"
        : mine
          ? "アイテムを発見!"
          : "人間の道具を見つけた";
  const note =
    f.type === "human"
      ? mine
        ? ITEMS[f.kind].desc
        : "人間の道具は持てない。場所は覚えておける。"
      : room.viewerSide === "ghost"
        ? "力が戻ってくる…"
        : f.fake
          ? "手品師の仕掛けた偽物。幽霊が拾えば本物だと思い込む。"
          : "人間は持てない。幽霊に取られる前に見張ろう。";
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 px-4" onClick={() => setSeen(entry.seq)}>
      <div
        key={entry.seq}
        className={`gh-pop w-full max-w-sm rounded-3xl border-2 bg-panel p-6 text-center shadow-2xl ${
          f.type === "ghost" ? "border-red-400/70" : "border-gold/70"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <p className={`text-sm font-black ${f.type === "ghost" ? "text-red-300" : "text-gold"}`}>{title}</p>
        <div className="my-3 text-7xl">{icon}</div>
        <p className="text-2xl font-black">
          {name}
          {f.type === "ghost" && f.fake && <span className="text-base text-white/60">(偽物)</span>}
        </p>
        {entry.spot && <p className="mt-1 text-sm text-white/50">{spotName(entry.spot)}</p>}
        {!entry.spot && entry.loc && <p className="mt-1 text-sm text-white/50">{locName(entry.loc)}</p>}
        <p className="mt-3 text-sm leading-relaxed text-white/70">{note}</p>
        <p className="mt-2 text-xs text-white/40">{entry.text}</p>
        <button onClick={() => setSeen(entry.seq)} className="mt-4 rounded-full bg-violet px-8 py-2 font-bold text-white hover:brightness-110">
          OK
        </button>
      </div>
    </div>
  );
}

function SkipButton({ room, act }: { room: ClientRoom; act: ActFn }) {
  const actor = room.players.find((p) => p.id === room.actor);
  if (!actor || actor.connected || actor.isBot) return null;
  return (
    <button
      onClick={() => act("game:hostSkip", {})}
      className="rounded-full border border-white/15 px-4 py-2 text-xs text-white/60 hover:bg-white/10"
    >
      {actor.name} が不在: 代わりに1手ランダムに進める
    </button>
  );
}
