import { useEffect, useState } from "react";

// Lightweight dependency-free confetti burst. Renders when `fire` flips true.
const COLORS = ["#EA4306", "#FF751A", "#FFC24B", "#FFFFFF", "#A7C4A0", "#E8B4B8"];

interface Piece { id: number; left: number; delay: number; dur: number; rot: number; color: string; w: number; h: number; }

export function Confetti({ fire }: { fire: boolean }) {
  const [pieces, setPieces] = useState<Piece[]>([]);

  useEffect(() => {
    if (!fire) return;
    const arr: Piece[] = Array.from({ length: 90 }, (_, i) => ({
      id: i + Math.random(),
      left: Math.random() * 100,
      delay: Math.random() * 0.5,
      dur: 1.8 + Math.random() * 1.8,
      rot: Math.random() * 360,
      color: COLORS[i % COLORS.length],
      w: 6 + Math.random() * 8,
      h: 8 + Math.random() * 8,
    }));
    setPieces(arr);
    const t = setTimeout(() => setPieces([]), 4200);
    return () => clearTimeout(t);
  }, [fire]);

  if (!pieces.length) return null;
  return (
    <div className="fixed inset-0 z-[60] pointer-events-none overflow-hidden">
      {pieces.map((p) => (
        <span
          key={p.id}
          style={{
            position: "absolute",
            top: "-6%",
            left: `${p.left}%`,
            width: p.w,
            height: p.h,
            background: p.color,
            borderRadius: 2,
            transform: `rotate(${p.rot}deg)`,
            animation: `confetti-fall ${p.dur}s ${p.delay}s cubic-bezier(.2,.6,.4,1) forwards`,
          }}
        />
      ))}
      <style>{`@keyframes confetti-fall { to { transform: translateY(112vh) rotate(760deg); opacity: .15; } }`}</style>
    </div>
  );
}
