/**
 * The ghost: a sheet with a round top and a wavy hem (like the ghosts in
 * Pac-Man), big eyes and two little hands. The sheet reddens with every item.
 */
export function GhostShape({ color, look = 0 }: { color: string; look?: -1 | 0 | 1 }) {
  const shade = "rgba(0,0,0,0.18)";
  return (
    <g>
      {/* hands */}
      <ellipse cx="4.5" cy="25" rx="4" ry="2.6" fill={color} stroke={shade} strokeWidth="0.8" transform="rotate(-30 4.5 25)" />
      <ellipse cx="35.5" cy="25" rx="4" ry="2.6" fill={color} stroke={shade} strokeWidth="0.8" transform="rotate(30 35.5 25)" />
      {/* sheet */}
      <path
        d="M6 20 A14 14 0 0 1 34 20 V38 L30.5 34.5 L27 38 L23.5 34.5 L20 38 L16.5 34.5 L13 38 L9.5 34.5 L6 38 Z"
        fill={color}
        stroke={shade}
        strokeWidth="0.9"
        strokeLinejoin="round"
      />
      {/* eyes */}
      <ellipse cx="14.5" cy="19" rx="3.6" ry="4.4" fill="#fff" />
      <ellipse cx="25.5" cy="19" rx="3.6" ry="4.4" fill="#fff" />
      <circle cx={14.5 + look * 1.4} cy="20" r="2" fill="#1d1b3a" />
      <circle cx={25.5 + look * 1.4} cy="20" r="2" fill="#1d1b3a" />
    </g>
  );
}

export default function GhostSprite({ color, size = 40, className = "" }: { color: string; size?: number; className?: string }) {
  return (
    <svg viewBox="-2 0 44 40" width={size} height={size} className={className} aria-hidden>
      <GhostShape color={color} />
    </svg>
  );
}
