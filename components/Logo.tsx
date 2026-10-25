import GhostSprite from "./GhostSprite";

/** The title: the little sheet ghost and the name. */
export default function Logo({ size = "lg" }: { size?: "lg" | "sm" }) {
  const big = size === "lg";
  return (
    <span className={`inline-flex items-center ${big ? "gap-3" : "gap-2"}`}>
      <GhostSprite color="#f4f4f6" size={big ? 52 : 28} className="gh-float" />
      <span className={`font-black ${big ? "whitespace-nowrap text-3xl tracking-[0.12em] sm:text-5xl" : "whitespace-nowrap text-lg tracking-[0.1em]"}`}>
        <span className="text-ink">ゴースト</span>
        <span className="text-violet">ホーム</span>
      </span>
    </span>
  );
}
