"use client";

import type { ReactNode } from "react";
import { CHARACTERS, GHOST_COLORS, GHOST_ITEMS, GHOST_TOOLS, ITEMS } from "@/lib/catalog";
import {
  LAYOUT,
  PLAN_H,
  PLAN_W,
  ROOM,
  VOID_2F,
  doorsOnFloor,
  isHall,
  locsOnFloor,
  type Floor,
  type LocId,
  type Rect,
  type RoomId,
} from "@/lib/map";
import type { ClientRoom, KnownSpot } from "@/lib/types";
import { GhostShape } from "./GhostSprite";

export interface MapProps {
  room: ClientRoom;
  /** Spot ids and location ids that can be clicked now. */
  targets: Set<string>;
  selected: string | null;
  onSpot: (spotId: string) => void;
  onLoc: (loc: LocId) => void;
  /** Places to pulse (recent events). */
  flashes: { loc?: LocId; spot?: string; seq: number }[];
  /** Rooms lit as a whole (where the ghost can step); their spots stay clickable without their own glow. */
  glow?: Set<LocId>;
  /** Controls shown in the open space of the 2nd floor, so they are always next to the map. */
  overlay?: ReactNode;
}

const SPOT_W = 92;
const SPOT_H = 56;

/** Where each hiding spot sits inside its room. */
function spotRects(r: RoomId): Rect[] {
  const box = LAYOUT[r];
  const n = ROOM[r].spots.length;
  const cols = n <= 2 && box.w < 230 ? 1 : 2;
  const rows = Math.ceil(n / cols);
  const w = Math.min(SPOT_W, (box.w - (cols + 1) * 6) / cols);
  const top = box.y + 30;
  const gapX = (box.w - cols * w) / (cols + 1);
  const gapY = Math.max(4, (box.h - 30 - 32 - rows * SPOT_H) / (rows + 1));
  return ROOM[r].spots.map((_, i) => {
    const c = i % cols;
    const row = Math.floor(i / cols);
    return { x: box.x + gapX + c * (w + gapX), y: top + gapY + row * (SPOT_H + gapY), w, h: SPOT_H };
  });
}

/** The doorway between two rectangles: the middle of their shared edge. */
function doorway(a: Rect, b: Rect): [number, number, number, number] | null {
  const ix0 = Math.max(a.x, b.x);
  const ix1 = Math.min(a.x + a.w, b.x + b.w);
  const iy0 = Math.max(a.y, b.y);
  const iy1 = Math.min(a.y + a.h, b.y + b.h);
  const L = 34;
  if (ix0 === ix1 && iy1 > iy0) {
    const m = (iy0 + iy1) / 2;
    return [ix0, m - L / 2, ix0, m + L / 2];
  }
  if (iy0 === iy1 && ix1 > ix0) {
    const m = (ix0 + ix1) / 2;
    return [m - L / 2, iy0, m + L / 2, iy0];
  }
  return null;
}

function knownIcon(k: KnownSpot | undefined): string | null {
  if (!k) return null;
  if (k.type === "empty") return null;
  if (k.type === "human") return ITEMS[k.kind].icon;
  if (k.type === "tool") return GHOST_TOOLS[k.kind].icon;
  return k.fake ? "🎭" : GHOST_ITEMS[k.name].icon;
}

export function ghostColor(room: ClientRoom): string {
  const g = room.ghost;
  if (!g) return GHOST_COLORS[0];
  if (g.revived) return GHOST_COLORS[3];
  // Humans only ever see the revived (red) ghost; the ghost sees its own shade.
  return room.viewerSide === "ghost" || room.phase === "gameover" ? GHOST_COLORS[Math.min(g.collected, 2)] : GHOST_COLORS[0];
}

/** Colours of the house; after the full revival it turns blood red and black. */
const CALM = {
  room: "#1c1833",
  hall: "#141127",
  wall: "#4a4370",
  label: "#cfc8f5",
  spot: "#26213f",
  spotHot: "#3a3266",
  spotText: "#f1eeff",
  hatch: "#2a2547",
  dim: "#8a82b5",
};
const HORROR = {
  room: "#240609",
  hall: "#140304",
  wall: "#7c1420",
  label: "#ff9a9a",
  spot: "#36080e",
  spotHot: "#5c121b",
  spotText: "#ffe0e0",
  hatch: "#3d0a10",
  dim: "#c0606a",
};

export default function HouseMap(props: MapProps) {
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <FloorPlan floor={2} {...props} />
      <FloorPlan floor={1} {...props} />
    </div>
  );
}

/** The 2nd floor's open space, as percentages of the drawn plan (for placing HTML over it). */
const VOID_BOX = {
  left: `${((VOID_2F.x + 6 + 5) / (PLAN_W + 12)) * 100}%`,
  top: `${((VOID_2F.y + 6 + 5) / (PLAN_H + 12)) * 100}%`,
  width: `${((VOID_2F.w - 10) / (PLAN_W + 12)) * 100}%`,
  height: `${((VOID_2F.h - 10) / (PLAN_H + 12)) * 100}%`,
};

function FloorPlan({ floor, room, targets, selected, onSpot, onLoc, flashes, glow, overlay }: MapProps & { floor: Floor }) {
  const locs = locsOnFloor(floor);
  const placed = room.placed;
  const know = room.humanKnow;
  const flashSpots = new Set(flashes.map((f) => f.spot).filter(Boolean));
  const flashLocs = new Set(flashes.map((f) => f.loc).filter(Boolean));
  const ghost = room.ghost;
  const path = room.turn?.path ?? [];
  const horror = !!ghost?.revived;
  const C = horror ? HORROR : CALM;

  return (
    <div className={`relative overflow-hidden rounded-xl border p-2 ${horror ? "gh-horror border-red-800/80 bg-[#0e0204]" : "border-white/10 bg-panel/70"}`}>
      <div className="mb-1 flex items-center justify-between px-1 text-xs text-white/50">
        <span className={`font-bold ${horror ? "text-red-400" : "text-white/70"}`}>{floor}階</span>
        {horror && <span className="gh-flicker font-bold text-red-500">幽霊が完全復活している</span>}
      </div>
      {horror && <div className="gh-vignette pointer-events-none absolute inset-0 z-10" />}
      <div className="relative">
      {floor === 2 && overlay && (
        <div className="absolute z-20" style={VOID_BOX}>
          {overlay}
        </div>
      )}
      <svg viewBox={`-6 -6 ${PLAN_W + 12} ${PLAN_H + 12}`} className="w-full select-none">
        {floor === 2 && (
          <g>
            <rect {...VOID_2F} fill={`url(#void-hatch-${horror ? "h" : "c"})`} opacity="0.5" />
            {!overlay && (
              <text x={VOID_2F.x + VOID_2F.w / 2} y={VOID_2F.y + 150} textAnchor="middle" fontSize="18" fill={C.dim}>
                吹き抜け
              </text>
            )}
          </g>
        )}
        <defs>
          <pattern id={`void-hatch-${horror ? "h" : "c"}`} width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="10" stroke={C.hatch} strokeWidth="3" />
          </pattern>
        </defs>

        {/* floors */}
        {locs.map((loc) => {
          const r = LAYOUT[loc];
          const clickable = targets.has(loc);
          const lit = clickable || !!glow?.has(loc);
          const onPath = path.includes(loc);
          return (
            <g key={loc} onClick={() => clickable && onLoc(loc)} className={clickable ? "cursor-pointer" : ""}>
              <rect
                x={r.x}
                y={r.y}
                width={r.w}
                height={r.h}
                fill={isHall(loc) ? C.hall : C.room}
                stroke={C.wall}
                strokeWidth="3"
              />
              {onPath && <rect x={r.x + 4} y={r.y + 4} width={r.w - 8} height={r.h - 8} fill="none" stroke="#8b7dff" strokeOpacity="0.35" strokeWidth="2" strokeDasharray="6 5" />}
              {lit && <rect x={r.x + 3} y={r.y + 3} width={r.w - 6} height={r.h - 6} fill="#b6a8ff" fillOpacity="0.16" stroke="#b6a8ff" strokeWidth="3" className="gh-breathe" />}
              {flashLocs.has(loc) && <rect x={r.x + 2} y={r.y + 2} width={r.w - 4} height={r.h - 4} fill="#ffcf5a" className="gh-flash" />}
              <text x={r.x + 10} y={r.y + 23} fontSize="19" fontWeight="700" fill={C.label}>
                {isHall(loc) ? `${floor}階廊下` : ROOM[loc as RoomId].name}
              </text>
              {isHall(loc) && (
                <g>
                  {/* stairs */}
                  {[0, 1, 2, 3, 4].map((i) => (
                    <rect key={i} x={r.x + r.w - 92 + i * 15} y={r.y + 34} width="13" height={56} fill={C.hatch} stroke={C.wall} />
                  ))}
                  <text x={r.x + r.w - 56} y={r.y + 26} textAnchor="middle" fontSize="13" fill={C.dim}>
                    階段 ⇅
                  </text>
                </g>
              )}
              {!isHall(loc) && (
                <RoomBadges
                  r={r}
                  bell={placed?.bells.some((b) => b.room === loc)}
                  holy={placed?.holy.some((h) => h.room === loc && room.ghostTurns < h.until)}
                  candle={placed ? placed.candles.includes(loc as RoomId) : room.ghostCandles.includes(loc as RoomId)}
                  hidden={know?.hiddenRoom === loc ? "known" : room.hidden?.room === loc ? "found" : null}
                  locked={room.lock?.room === loc && room.ghostTurns < room.lock.until}
                />
              )}
            </g>
          );
        })}

        {/* doorways */}
        {doorsOnFloor(floor).map(([a, b]) => {
          const d = doorway(LAYOUT[a], LAYOUT[b]);
          if (!d) return null;
          return (
            <g key={`${a}-${b}`} pointerEvents="none">
              <line x1={d[0]} y1={d[1]} x2={d[2]} y2={d[3]} stroke={C.hall} strokeWidth="6" />
              <line x1={d[0]} y1={d[1]} x2={d[2]} y2={d[3]} stroke="#e0b85a" strokeWidth="2" strokeDasharray="4 3" />
            </g>
          );
        })}

        {/* hiding spots */}
        {locs
          .filter((l): l is RoomId => !isHall(l))
          .map((r) =>
            ROOM[r].spots.map((s, i) => {
              const rect = spotRects(r)[i];
              const clickable = targets.has(s.id);
              // Inside a lit room the room glows instead of each spot.
              const hot = clickable && !glow?.has(r);
              const isSel = selected === s.id;
              const icon = knownIcon(room.known[s.id]);
              const ofuda = placed?.ofuda.some((o) => o.spot === s.id);
              const mirror = placed?.mirrors.some((m) => m.spot === s.id);
              const searched = know?.ghostSearched.includes(s.id);
              const humanCost = Math.max(0, s.cost - 1);
              return (
                <g key={s.id} onClick={(e) => (e.stopPropagation(), clickable && onSpot(s.id))} className={clickable ? "cursor-pointer" : ""}>
                  <rect
                    x={rect.x}
                    y={rect.y}
                    width={rect.w}
                    height={rect.h}
                    rx="8"
                    fill={hot ? C.spotHot : C.spot}
                    stroke={isSel ? "#ffe08a" : hot ? "#b6a8ff" : C.wall}
                    strokeWidth={isSel ? 3 : 1.5}
                  />
                  {flashSpots.has(s.id) && <rect x={rect.x} y={rect.y} width={rect.w} height={rect.h} rx="8" fill="#ffcf5a" className="gh-flash" />}
                  <text x={rect.x + rect.w / 2} y={rect.y + 21} textAnchor="middle" fontSize={s.name.length > 5 ? 12.5 : s.name.length > 4 ? 14 : 16} fontWeight="600" fill={C.spotText}>
                    {s.name}
                  </text>
                  {/* search cost for this viewer's side */}
                  <circle cx={rect.x + 15} cy={rect.y + rect.h - 15} r="11" fill="#ffcf5a" />
                  <text x={rect.x + 15} y={rect.y + rect.h - 9.5} textAnchor="middle" fontSize="16" fontWeight="800" fill="#1d1b3a">
                    {room.viewerSide === "ghost" ? s.cost + (room.ghostCandles.includes(r) ? 2 : 0) : humanCost}
                  </text>
                  {room.known[s.id]?.type === "empty" && (
                    <text x={rect.x + rect.w / 2 + 4} y={rect.y + rect.h - 7} textAnchor="middle" fontSize="22" fontWeight="900" fill="#ef4444">
                      ✕
                    </text>
                  )}
                  {icon && (
                    <text x={rect.x + rect.w / 2 + 4} y={rect.y + rect.h - 8} textAnchor="middle" fontSize="19">
                      {icon}
                    </text>
                  )}
                  <text x={rect.x + rect.w - 5} y={rect.y + rect.h - 8} textAnchor="end" fontSize="14">
                    {ofuda ? "📜" : ""}
                    {mirror ? "🪞" : ""}
                    {searched ? "👣" : ""}
                  </text>
                </g>
              );
            })
          )}

        {/* hunters */}
        {locs.map((loc) => {
          const here = room.hunters.filter((h) => h.loc === loc);
          if (!here.length) return null;
          const r = LAYOUT[loc];
          const y = isHall(loc) ? r.y + r.h - 26 : r.y + r.h - 18;
          const x0 = isHall(loc) ? r.x + 28 : r.x + r.w - 20 - (here.length - 1) * 32;
          return here.map((h, i) => {
            const c = CHARACTERS[h.character];
            const active = room.turn?.side === "human" && room.turn.hunter === h.slot && !room.escape;
            return (
              <g key={h.slot} transform={`translate(${x0 + i * 32} ${y})`} opacity={h.alive ? 1 : 0.35} pointerEvents="none">
                {active && <circle r="19" fill="none" stroke="#ffe08a" strokeWidth="2.5" className="gh-breathe" />}
                <circle r="15" fill={c.color} stroke="#0b0918" strokeWidth="2" />
                <text y="6" textAnchor="middle" fontSize="17" fontWeight="900" fill="#1d1b3a">
                  {h.alive ? c.icon : "✝"}
                </text>
                {h.alive && h.stunned && (
                  <text x="12" y="-8" fontSize="14">
                    🪦
                  </text>
                )}
              </g>
            );
          });
        })}

        {/* ghost */}
        {ghost && locs.includes(ghost.loc) && <GhostToken room={room} />}
      </svg>
      </div>
    </div>
  );
}

function GhostToken({ room }: { room: ClientRoom }) {
  const g = room.ghost!;
  let cx: number;
  let cy: number;
  if (g.spot) {
    const r = g.spot.split("-")[0] as RoomId;
    const idx = ROOM[r].spots.findIndex((s) => s.id === g.spot);
    const rect = spotRects(r)[idx];
    cx = rect.x + rect.w - 2;
    cy = rect.y + 2;
  } else {
    const r = LAYOUT[g.loc];
    cx = r.x + r.w / 2 - 40;
    cy = r.y + r.h / 2;
  }
  return (
    <g transform={`translate(${cx - 15} ${cy - 16})`} pointerEvents="none" className="gh-float">
      <g transform="scale(0.9)">
        <GhostShape color={ghostColor(room)} />
      </g>
    </g>
  );
}

function RoomBadges({
  r,
  bell,
  holy,
  candle,
  hidden,
  locked,
}: {
  r: Rect;
  bell?: boolean;
  holy?: boolean;
  candle?: boolean;
  hidden: "known" | "found" | null | false;
  locked?: boolean;
}) {
  const icons = [bell && "🔔", holy && "💧", candle && "🕯️", hidden === "found" ? "✨" : hidden === "known" ? "❔" : null, locked && "🪞"].filter(
    Boolean
  ) as string[];
  return (
    <text x={r.x + r.w - 8} y={r.y + 23} textAnchor="end" fontSize="17" pointerEvents="none">
      {icons.join("")}
    </text>
  );
}
