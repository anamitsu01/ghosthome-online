"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CHARACTERS, GHOST_COLORS, GHOST_ITEMS, GHOST_TOOL_LIMIT, GHOST_TOOLS, ITEMS, type GhostToolKind } from "@/lib/catalog";
import { FORCED_ROOMS, GHOST_ADJ, HUMAN_ADJ, MOVE_COST, ROOM, SPOT, SPOTS, doorId, isHall, locName, spotName, type LocId, type RoomId } from "@/lib/map";
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
  const [pickState, setPickState] = useState<{ key: string; spot: string | null; mode: "none" | "psychic" | "door" }>({
    key: "",
    spot: null,
    mode: "none",
  });
  const mode = pickState.key === stepKey ? pickState.mode : "none";
  const selected = pickState.key === stepKey ? pickState.spot : null;
  const psychicMode = mode === "psychic";
  const setSelected = (spot: string | null) => setPickState({ key: stepKey, spot, mode: "none" });
  const setPsychicMode = (on: boolean) => setPickState({ key: stepKey, spot: null, mode: on ? "psychic" : "none" });
  const setDoorMode = (on: boolean) => setPickState({ key: stepKey, spot: null, mode: on ? "door" : "none" });

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

  /** Ghost tools: the 首無し地蔵 first asks for a door on the map. */
  function onTool(kind: GhostToolKind) {
    if (kind === "jizo") return setDoorMode(mode !== "door");
    return send({ t: "gtool", kind });
  }

  // ---------- what can be clicked ----------

  const ghost = room.ghost;
  const ghostStep = escape ? escape.step : turn.step;
  const budget = escape ? escape.budget ?? 0 : turn.budget ?? 0;

  const [targets, glow] = useMemo<[Set<string>, Set<LocId>]>(() => {
    const t = new Set<string>();
    const lit = new Set<LocId>();
    if (!myTurn || room.phase !== "playing") return [t, lit];
    if (ghostTurn && ghost) {
      if (ghostStep === "warp") {
        SPOTS.forEach((s) => t.add(s.id));
        return [t, lit];
      }
      if (ghostStep !== "move" && ghostStep !== "hide") return [t, lit];
      const here = SPOTS.filter((s) => s.room === ghost.loc);
      here.forEach((s) => t.add(s.id));
      if (ghostStep === "hide" || budget < MOVE_COST) return [t, lit];
      if (room.lock && room.lock.room === ghost.loc && room.ghostTurns < room.lock.until) return [t, lit];
      // Rooms the ghost can step into light up as a whole; it enters by clicking a spot inside.
      for (const n of GHOST_ADJ[ghost.loc]) {
        if (isHall(n)) t.add(n);
        else {
          lit.add(n);
          SPOTS.filter((s) => s.room === n).forEach((s) => t.add(s.id));
        }
      }
      return [t, lit];
    }
    if (active) {
      if (psychicMode) {
        (Object.keys(HUMAN_ADJ) as LocId[]).filter((l) => l !== active.loc).forEach((l) => t.add(l));
        return [t, lit];
      }
      if (turn.step === "resolve") return [t, lit];
      const shut = new Set(room.doorBlocks.map((d) => d.door));
      if (turn.step === "move" && budget >= MOVE_COST) HUMAN_ADJ[active.loc].filter((l) => !shut.has(doorId(active.loc, l))).forEach((l) => t.add(l));
      if (!isHall(active.loc)) SPOTS.filter((s) => s.room === active.loc).forEach((s) => t.add(s.id));
    }
    return [t, lit];
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
            <HouseMap
              room={room}
              targets={targets}
              glow={glow}
              selected={selected}
              onSpot={onSpot}
              onLoc={onLoc}
              flashes={flashes}
              onDoor={
                mode === "door"
                  ? (door) => {
                      setDoorMode(false);
                      send({ t: "gtool", kind: "jizo", door });
                    }
                  : undefined
              }
              overlay={
                room.phase === "playing" && (
                  <QuickActions
                    room={room}
                    myTurn={myTurn}
                    actorName={actorName}
                    selected={selected}
                    send={send}
                    error={error}
                    psychicMode={psychicMode}
                    setPsychicMode={setPsychicMode}
                    doorMode={mode === "door"}
                    onTool={onTool}
                  />
                )
              }
            />
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
            myTurn &&
            !ghostTurn && (
              <div className="rounded-xl border border-violet/40 bg-violet/10 p-3">
                <HunterControls room={room} hunter={active!} selected={selected} send={send} />
                {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
              </div>
            )
          )}
          {myTurn && !escape && turn.step === "resolve" && turn.resolveSpot && (
            <ResolveModal key={turn.resolveSpot} room={room} hunter={active} spotId={turn.resolveSpot} send={send} />
          )}
          {side === "ghost" && ghost && (
            <GhostStatus room={room} canUse={myTurn && !escape && ["roll", "move", "hide"].includes(turn.step)} onTool={onTool} />
          )}
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

// ---------- quick actions (in the 2nd floor's open space) ----------

/** The ghost's search cost as it knows it: +2 in candle rooms it has walked into. */
export function ghostCost(room: ClientRoom, spotId: string): number {
  const s = SPOT[spotId];
  return s.cost + (room.ghostCandles.includes(s.room) ? 2 : 0);
}

function QBtn({ children, onClick, primary, disabled }: { children: React.ReactNode; onClick: () => void; primary?: boolean; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`w-full rounded-md px-1 py-1 font-bold disabled:opacity-35 sm:py-1.5 ${
        primary ? "bg-violet text-white hover:brightness-110" : "border border-white/20 bg-white/5 text-white/85 hover:bg-white/10"
      }`}
    >
      {children}
    </button>
  );
}

/** The main moves of the turn — search, hide, end — right on the map, so phones don't need to scroll. */
function QuickActions({
  room,
  myTurn,
  actorName,
  selected,
  send,
  error,
  psychicMode,
  setPsychicMode,
  doorMode,
  onTool,
}: {
  room: ClientRoom;
  myTurn: boolean;
  actorName: string;
  selected: string | null;
  send: (a: Action) => Promise<string | null>;
  error: string | null;
  psychicMode: boolean;
  setPsychicMode: (v: boolean) => void;
  doorMode: boolean;
  onTool: (kind: GhostToolKind) => void;
}) {
  const turn = room.turn!;
  const escape = room.escape;
  const ghostTurn = !!escape || turn.side === "ghost";
  const step = escape ? escape.step : turn.step;
  const budget = (escape ? escape.budget : turn.budget) ?? 0;
  const hunter = ghostTurn ? null : room.hunters[turn.hunter];
  const title = escape ? "幽霊の緊急逃走" : ghostTurn ? "幽霊のターン" : `${CHARACTERS[hunter!.character].name}のターン`;
  const box =
    "flex h-full flex-col gap-1 overflow-y-auto rounded-lg border border-violet/60 bg-panel/95 p-1.5 text-[10px] leading-tight shadow-lg sm:gap-1.5 sm:p-2 sm:text-xs xl:text-[13px]";

  if (!myTurn) {
    return (
      <div className={box}>
        <p className="font-bold text-ink">{title}</p>
        <p className="text-white/50">{actorName} が操作中…</p>
      </div>
    );
  }

  const sel = selected ? SPOT[selected] : null;
  const g = room.ghost;
  const mediumButton = hunter?.character === "medium" && !hunter.mediumUsed && (
    <QBtn onClick={() => send({ t: "medium" })}>🕯 霊視(1回だけ)</QBtn>
  );
  let body: React.ReactNode;
  if (ghostTurn && g) {
    if (step === "roll") {
      body = (
        <QBtn primary onClick={() => send({ t: "roll" })}>
          🎲 サイコロを振る
        </QBtn>
      );
    } else if (step === "forced") {
      body = (
        <>
          <p className="text-white/70">人間3人をどこへ引きずり込む?</p>
          {FORCED_ROOMS.map((r) => (
            <QBtn key={r} primary onClick={() => send({ t: "forced", room: r })}>
              {ROOM[r].name}
            </QBtn>
          ))}
        </>
      );
    } else if (step === "warp") {
      body = <p className="text-gold">✨ ワープ先の潜伏場所をクリック</p>;
    } else if (step === "resolve") {
      body = <p className="text-gold">探索の結果を選んでください</p>;
    } else {
      const inRoom = sel && sel.room === g.loc;
      body = (
        <>
          {inRoom && !escape && step === "move" ? (
            <>
              <p className="font-bold text-ink">{sel.name}</p>
              {sel.id !== g.spot && <QBtn onClick={() => send({ t: "gmove", to: sel.id })}>ここへ移る(0)</QBtn>}
              <QBtn primary disabled={ghostCost(room, sel.id) > budget} onClick={() => send({ t: "search", spot: sel.id })}>
                🔍 探索({ghostCost(room, sel.id)})
              </QBtn>
            </>
          ) : (
            <p className="text-white/60">
              {step === "hide" ? "部屋の中で隠れる場所を選んで終了" : escape ? "光る部屋の潜伏場所へ逃げる" : "光る部屋の潜伏場所へ移動。今の部屋の場所を選ぶと探索"}
            </p>
          )}
          <QBtn primary onClick={() => send({ t: "end" })}>
            {g.spot ? "潜伏して終了" : "廊下に潜んで終了"}
          </QBtn>
        </>
      );
    }
  } else if (hunter) {
    if (step === "roll") {
      body = (
        <>
          <QBtn primary onClick={() => send({ t: "roll" })}>
            🎲 サイコロを振る
          </QBtn>
          {hunter.character === "psychic" && !hunter.psychicUsed && (
            <QBtn onClick={() => setPsychicMode(!psychicMode)}>{psychicMode ? "ワープをやめる" : "🌀 ワープ"}</QBtn>
          )}
          {psychicMode && <p className="text-gold">ワープ先をクリック</p>}
          {mediumButton}
          <QBtn onClick={() => send({ t: "end" })}>ターンを終える</QBtn>
        </>
      );
    } else if (step === "resolve") {
      body = <p className="text-gold">探索の結果を選んでください</p>;
    } else {
      const ghost = room.ghost;
      const cost = sel ? (ghost?.revived && ghost.spot === sel.id ? 0 : Math.max(0, sel.cost - 1)) : 0;
      body = (
        <>
          {sel && sel.room === hunter.loc ? (
            <>
              <p className="font-bold text-ink">{sel.name}</p>
              <QBtn primary disabled={cost > budget} onClick={() => send({ t: "search", spot: sel.id })}>
                🔍 探索({cost})
              </QBtn>
            </>
          ) : (
            <p className="text-white/60">光る部屋へ移動。潜伏場所を選ぶと探索</p>
          )}
          {mediumButton}
          <QBtn onClick={() => send({ t: "end" })}>ターンを終える</QBtn>
        </>
      );
    }
  }

  const tools = ghostTurn && g && !escape && ["roll", "move", "hide"].includes(step) ? g.tools : [];
  const used = (k: string) => room.usedThisRound.includes(`ghost-tool-${k}`);
  return (
    <div className={box}>
      <p className="font-bold text-gold">
        {title}
        {step !== "roll" && budget > 0 && <span className="ml-1 text-white/60">残り{budget}</span>}
      </p>
      {body}
      {tools.map((t) => (
        <QBtn key={t.kind} disabled={used(t.kind)} onClick={() => onTool(t.kind)}>
          {t.kind === "jizo" && doorMode ? "地蔵をやめる" : `${GHOST_TOOLS[t.kind].icon} ${GHOST_TOOLS[t.kind].name}`}
          {GHOST_TOOLS[t.kind].uses > 1 && ` 残${t.uses}`}
        </QBtn>
      ))}
      {doorMode && <p className="text-red-300">🗿 塞ぐ扉をマップでクリック</p>}
      {error && <p className="text-red-400">{error}</p>}
    </div>
  );
}

function GhostStatus({ room, canUse, onTool }: { room: ClientRoom; canUse: boolean; onTool: (kind: GhostToolKind) => void }) {
  const g = room.ghost!;
  return (
    <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-panel/70 p-3">
      <GhostSprite color={ghostColor(room)} size={52} className="gh-float" />
      <div className="min-w-0 text-sm">
        <p className="font-bold">
          幽霊 {g.revived ? <span className="text-red-400">完全復活</span> : <span className="text-white/50">力を失っている</span>}
        </p>
        <p className="text-white/70">
          体力 <b className="text-ink">{g.hp}</b> ・ 集めた品 {g.collected} ・ 道具 {g.tools.length}/{GHOST_TOOL_LIMIT}
        </p>
        <p className="truncate text-white/60">
          {g.held.length ? g.held.map((n) => `${GHOST_ITEMS[n].icon}${GHOST_ITEMS[n].name}`).join(" ") : "まだ何も持っていない"}
        </p>
        <p className="text-xs text-white/40">居場所: {g.spot ? spotName(g.spot) : locName(g.loc)}</p>
        {g.tools.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {g.tools.map((t) => {
              const ready = canUse && !room.usedThisRound.includes(`ghost-tool-${t.kind}`);
              return (
                <button
                  key={t.kind}
                  disabled={!ready}
                  title={GHOST_TOOLS[t.kind].desc}
                  onClick={() => onTool(t.kind)}
                  className="rounded-full border border-white/15 bg-white/5 px-2.5 py-0.5 text-xs font-bold enabled:hover:bg-white/10 disabled:opacity-60"
                >
                  {GHOST_TOOLS[t.kind].icon} {GHOST_TOOLS[t.kind].name}
                  {GHOST_TOOLS[t.kind].uses > 1 && <span className="ml-1 text-white/50">残{t.uses}</span>}
                  {ready && <span className="ml-1 text-violet">使う</span>}
                </button>
              );
            })}
          </div>
        )}
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
            {h.alive && h.stunned && <span className="text-xs text-red-300">🪦呪い</span>}
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
}: {
  room: ClientRoom;
  hunter: ClientHunter;
  selected: string | null;
  send: (a: Action) => Promise<string | null>;
}) {
  const turn = room.turn!;
  const c = CHARACTERS[hunter.character];
  const items = hunter.items ?? [];
  const sel = selected && SPOT[selected];
  const spotItems = items.filter((i) => ITEMS[i.kind].use === "spot");

  return (
    <div className="space-y-3 text-sm">
      <p className="flex items-center gap-2 font-bold">
        <span className="inline-flex h-7 w-7 items-center justify-center rounded-full font-black text-[#1d1b3a]" style={{ background: c.color }}>
          {c.icon}
        </span>
        {c.name}({locName(hunter.loc)})
      </p>
      <p className="text-white/60">
        {turn.step === "roll"
          ? "サイコロを振る前にアイテムも使える。振る・探索・ターン終了はマップの吹き抜けの枠から。"
          : "光っている部屋・廊下をクリックして移動(1マス2)。潜伏場所を選ぶと探索できる(探索するとターン終了)。"}
      </p>

      {sel && spotItems.length > 0 && (
        <div className="rounded-lg border border-white/10 bg-black/20 p-2">
          <p className="mb-2 font-bold">{spotName(sel.id)}</p>
          <div className="flex flex-wrap gap-2">
            {spotItems.map((i) => (
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

/** One thing in hand that could be left in a spot. */
interface HandThing {
  id: string;
  label: string;
}

/**
 * After a search, as dialogs over the map (behind any "found" popup):
 * take what was found? then "leave something here? おく / おかない", and if おく, which one.
 * Works for both sides: the humans' items, the ghost's tools.
 */
function ResolveModal({
  room,
  hunter,
  spotId,
  send,
}: {
  room: ClientRoom;
  hunter: ClientHunter | null;
  spotId: string;
  send: (a: Action) => Promise<string | null>;
}) {
  const k = room.known[spotId];
  const ghostSide = !hunter;
  const hand: HandThing[] = ghostSide
    ? (room.ghost?.tools ?? []).map((t) => ({ id: t.kind, label: `${GHOST_TOOLS[t.kind].icon} ${GHOST_TOOLS[t.kind].name}` }))
    : (hunter.items ?? []).map((i) => ({ id: i.id, label: `${ITEMS[i.kind].icon} ${ITEMS[i.kind].name}` }));
  const limit = ghostSide ? GHOST_TOOL_LIMIT : capacity(hunter);
  const found =
    ghostSide && k?.type === "tool"
      ? { icon: GHOST_TOOLS[k.kind].icon, name: GHOST_TOOLS[k.kind].name }
      : !ghostSide && k?.type === "human"
        ? { icon: ITEMS[k.kind].icon, name: ITEMS[k.kind].name }
        : null;
  const [stage, setStage] = useState<"take" | "ask" | "pick" | "swap">(found ? "take" : "ask");
  const [taking, setTaking] = useState(false);
  const resolve = (take: boolean, leave: string | null) => send({ t: "resolve", take, leave });

  function take() {
    if (hand.length >= limit) return setStage("swap");
    if (!hand.length) return resolve(true, null);
    setTaking(true);
    setStage("ask");
  }

  let title: string;
  let body: React.ReactNode;
  if (stage === "take" && found) {
    title = `${found.icon} ${found.name}を見つけた`;
    body = (
      <>
        <Btn primary onClick={take}>
          手に入れる
        </Btn>
        <Btn onClick={() => resolve(false, null)}>取らない</Btn>
      </>
    );
  } else if (stage === "ask") {
    title = ghostSide ? "持っている道具をここに置く?" : "持ち物をここに置く?";
    body = (
      <>
        <Btn primary onClick={() => setStage("pick")}>
          おく
        </Btn>
        <Btn onClick={() => resolve(taking, null)}>おかない</Btn>
      </>
    );
  } else {
    const swap = stage === "swap";
    title = swap ? `持てるのは${limit}つまで。代わりにどれを置く?` : "どれを置く?";
    body = (
      <>
        {hand.map((h) => (
          <Btn key={h.id} primary onClick={() => resolve(swap || taking, h.id)}>
            {h.label}
          </Btn>
        ))}
        <Btn onClick={() => setStage(found && (swap || !taking) ? "take" : "ask")}>もどる</Btn>
      </>
    );
  }
  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/50 px-4">
      <div className="gh-pop w-full max-w-sm rounded-3xl border-2 border-gold/60 bg-panel p-5 text-center shadow-2xl">
        <p className="text-xs text-white/50">{spotName(spotId)} の探索結果</p>
        <p className="mt-1 mb-4 text-lg font-black">{title}</p>
        <div className="flex flex-wrap justify-center gap-2">{body}</div>
      </div>
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
                {h.alive && h.stunned && <span className="ml-1 text-red-300">🪦次ターン行動不能</span>}
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
  if (entry?.event === "forced") {
    return (
      <InfoPopup
        icon={<span className="gh-shake inline-block">🌀</span>}
        title={isGhost ? "人間たちを引きずり込んだ!" : "幽霊に引きずり込まれた!"}
        place={place}
        note={isGhost ? "2つ目の品の力で、人間全員をこの部屋へ集めた。" : "幽霊が2つ目の品を手に入れた。人間は全員この部屋へ強制移動。"}
        tone={isGhost ? "good" : "bad"}
        onClose={close}
      />
    );
  }
  if (entry?.event === "medium") {
    return (
      <InfoPopup
        icon="🕯"
        title="霊媒師の霊視"
        place={place}
        note="幽霊は今この部屋のどこかにいる。"
        tone="good"
        onClose={close}
      />
    );
  }
  if (entry?.event === "jizo") {
    return (
      <InfoPopup
        icon="🗿"
        title="首無し地蔵が扉を塞いだ!"
        place={entry.text.match(/首無し地蔵が (.+) の扉/)?.[1]}
        note={isGhost ? "次の幽霊ターンが終わるまで、人間はこの扉を通れない。" : "次の幽霊ターンが終わるまで、この扉は通れない。"}
        tone={isGhost ? "good" : "bad"}
        onClose={close}
      />
    );
  }
  if (entry?.event === "candle") {
    return (
      <InfoPopup
        icon={<span className="gh-flicker inline-block">🕯️</span>}
        title="蝋燭が灯っている…"
        place={place}
        note="人間が灯したマッチと蝋燭。この部屋で探索するには、探索コストが+2必要。"
        tone="bad"
        onClose={close}
      />
    );
  }
  if (entry?.event === "curse") {
    return (
      <InfoPopup
        icon="🪦"
        title="地縛霊の石板の呪い!"
        note={entry.text.replace(/^🪦 地縛霊の石板の呪い! /, "")}
        tone={isGhost ? "good" : "bad"}
        onClose={close}
      />
    );
  }
  if (!entry?.found) return null;
  const f = entry.found;
  if (f.type === "empty") {
    return <InfoPopup icon="❌" title="残念! 何もなかった!" place={place} tone="dull" onClose={close} />;
  }
  if (f.type === "tool") {
    const t = GHOST_TOOLS[f.kind];
    return (
      <InfoPopup
        icon={t.icon}
        title={isGhost ? `${t.name}を手に入れた!` : `幽霊の道具「${t.name}」を見つけた`}
        place={place}
        note={isGhost ? t.desc : `人間は持てない。${t.desc}`}
        tone={isGhost ? "good" : "bad"}
        onClose={close}
      />
    );
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
