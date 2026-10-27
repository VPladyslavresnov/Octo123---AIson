import { useEffect, useState, type CSSProperties } from "react";

// Aison's 3D mascot. It floats in place, blinks, glances around, greets on first
// visit, and does an excited HOP (no spin — we never show its back) when content
// is created (listen: window event "aison:content-created").

const FRAMES = {
  front: "/mascot/mascot-wave.png",  // resting, facing you
  blink: "/mascot/mascot-blink.png", // eyes closed
  look: "/mascot/mascot-look.png",   // gaze to the side
} as const;

type Frame = keyof typeof FRAMES;

export function Mascot({ onClick, size = 116 }: { onClick: () => void; size?: number }) {
  const [frame, setFrame] = useState<Frame>("front");
  const [excited, setExcited] = useState(false);
  const [greet, setGreet] = useState(false);
  const [burst, setBurst] = useState<{ id: number; dx: number; dy: number; rot: number; color: string; w: number; h: number }[]>([]);
  const [starPop, setStarPop] = useState<{ id: number; amount: number } | null>(null);

  // First-visit greeting (once)
  useEffect(() => {
    let seen = false;
    try { seen = !!localStorage.getItem("aison_mascot_greeted"); } catch { /* ignore */ }
    if (seen) return;
    const t1 = setTimeout(() => setGreet(true), 1000);
    const t2 = setTimeout(() => {
      setGreet(false);
      try { localStorage.setItem("aison_mascot_greeted", "1"); } catch { /* ignore */ }
    }, 8500);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);

  // Blink loop — briefly close the eyes (only while facing front)
  useEffect(() => {
    let alive = true; let timer: number;
    const loop = () => {
      if (!alive) return;
      timer = window.setTimeout(() => {
        if (!alive) return;
        setFrame((f) => (f === "front" ? "blink" : f));
        window.setTimeout(() => setFrame((f) => (f === "blink" ? "front" : f)), 150);
        // occasional double-blink
        if (Math.random() < 0.25) {
          window.setTimeout(() => setFrame((f) => (f === "front" ? "blink" : f)), 320);
          window.setTimeout(() => setFrame((f) => (f === "blink" ? "front" : f)), 460);
        }
        loop();
      }, 2600 + Math.random() * 3600);
    };
    loop();
    return () => { alive = false; window.clearTimeout(timer); };
  }, []);

  // Glance around — eyes/gaze shift to the side now and then, then back
  useEffect(() => {
    let alive = true; let timer: number;
    const loop = () => {
      if (!alive) return;
      timer = window.setTimeout(() => {
        if (!alive) return;
        setFrame((f) => (f === "front" ? "look" : f));
        window.setTimeout(() => setFrame((f) => (f === "look" ? "front" : f)), 1400);
        loop();
      }, 8000 + Math.random() * 7000);
    };
    loop();
    return () => { alive = false; window.clearTimeout(timer); };
  }, []);

  // Excited hop + confetti pop when content is created
  useEffect(() => {
    const onCreated = (e?: Event) => {
      setFrame("front");
      setExcited(true);
      window.setTimeout(() => setExcited(false), 850);
      // "+N ⭐" badge pop when the event carries an earned-star amount
      const detail = (e as CustomEvent)?.detail as { stars?: number } | undefined;
      if (detail && typeof detail.stars === "number") {
        const id = Date.now();
        setStarPop({ id, amount: detail.stars });
        window.setTimeout(() => setStarPop((p) => (p?.id === id ? null : p)), 1700);
      }
      // burst of confetti around the mascot
      const colors = ["#EA4306", "#FF751A", "#FFC24B", "#FFFFFF", "#A7C4A0", "#E8B4B8"];
      const pieces = Array.from({ length: 22 }, (_, i) => {
        const ang = (-90 + (Math.random() * 200 - 100)) * (Math.PI / 180); // upward-biased spread
        const dist = 55 + Math.random() * 75;
        return {
          id: Date.now() + i,
          dx: Math.cos(ang) * dist,
          dy: Math.sin(ang) * dist - 10,
          rot: Math.random() * 540 - 270,
          color: colors[i % colors.length],
          w: 6 + Math.random() * 6,
          h: 8 + Math.random() * 7,
        };
      });
      setBurst(pieces);
      window.setTimeout(() => setBurst([]), 1100);
    };
    window.addEventListener("aison:content-created", onCreated);
    window.addEventListener("aison:star-earned", onCreated);
    return () => {
      window.removeEventListener("aison:content-created", onCreated);
      window.removeEventListener("aison:star-earned", onCreated);
    };
  }, []);

  return (
    <div className="fixed bottom-2 right-2 z-50 flex items-end gap-1 pointer-events-none">
      {greet && (
        <div className="mb-14 max-w-[210px] rounded-2xl rounded-br-sm bg-card border border-border px-3 py-2 text-sm text-foreground shadow-xl mascot-pop pointer-events-auto">
          Hi! I'm <span className="font-semibold text-primary">Aison</span> ✨<br />
          <span className="text-muted-foreground text-xs">Need anything? Just ask.</span>
        </div>
      )}
      <button
        onClick={onClick}
        aria-label="Open Aison assistant"
        className="relative select-none pointer-events-auto group"
        style={{ width: size, height: size }}
      >
        <div className={`w-full h-full transition-transform group-hover:scale-105 ${excited ? "mascot-hop" : "mascot-float"}`}>
          <img
            src={FRAMES[frame]}
            alt="Aison mascot"
            draggable={false}
            className="w-full h-full object-contain drop-shadow-[0_10px_22px_rgba(234,67,6,0.35)]"
          />
        </div>
        {/* "+N ⭐" badge that pops above the mascot when a star is earned */}
        {starPop && (
          <div
            key={starPop.id}
            className="mascot-starpop absolute left-1/2 -top-1 -translate-x-1/2 flex items-center gap-1 rounded-full bg-card border border-amber-300/50 px-2.5 py-1 shadow-xl pointer-events-none whitespace-nowrap"
            aria-hidden
          >
            <span className="text-amber-300 text-sm leading-none">★</span>
            <span className="text-amber-300 font-extrabold text-sm leading-none tabular-nums">+{starPop.amount}</span>
          </div>
        )}
        {/* Confetti pop around the mascot */}
        {burst.length > 0 && (
          <div className="absolute left-1/2 top-1/2 pointer-events-none" aria-hidden>
            {burst.map((p) => (
              <span
                key={p.id}
                className="mascot-confetti"
                style={{
                  position: "absolute",
                  width: p.w,
                  height: p.h,
                  background: p.color,
                  borderRadius: 2,
                  ["--dx" as string]: `${p.dx}px`,
                  ["--dy" as string]: `${p.dy}px`,
                  ["--rot" as string]: `${p.rot}deg`,
                } as CSSProperties}
              />
            ))}
          </div>
        )}
      </button>

      <style>{`
        @keyframes mascot-float { 0%,100%{transform:translateY(0) rotate(-1deg)} 50%{transform:translateY(-7px) rotate(1deg)} }
        @keyframes mascot-hop {
          0%{transform:translateY(0) scaleX(1) scaleY(1) rotate(0deg)}
          14%{transform:translateY(0) scaleX(1.12) scaleY(.86)}
          38%{transform:translateY(-36px) scaleX(.92) scaleY(1.12) rotate(-6deg)}
          58%{transform:translateY(-30px) scaleX(.97) scaleY(1.05) rotate(6deg)}
          80%{transform:translateY(0) scaleX(1.1) scaleY(.9) rotate(0deg)}
          100%{transform:translateY(0) scaleX(1) scaleY(1)}
        }
        @keyframes mascot-pop { from{opacity:0; transform:translateY(8px) scale(.95)} to{opacity:1; transform:none} }
        @keyframes mascot-confetti {
          0%{ transform:translate(0,0) rotate(0deg) scale(1); opacity:1 }
          70%{ opacity:1 }
          100%{ transform:translate(var(--dx), calc(var(--dy) + 60px)) rotate(var(--rot)) scale(.7); opacity:0 }
        }
        @keyframes mascot-starpop {
          0%{ transform:translate(-50%, 6px) scale(.4); opacity:0 }
          22%{ transform:translate(-50%, -18px) scale(1.15); opacity:1 }
          40%{ transform:translate(-50%, -24px) scale(1); opacity:1 }
          78%{ transform:translate(-50%, -30px) scale(1); opacity:1 }
          100%{ transform:translate(-50%, -46px) scale(.9); opacity:0 }
        }
        .mascot-starpop { animation: mascot-starpop 1.7s cubic-bezier(.2,.8,.3,1) forwards; }
        .mascot-confetti { animation: mascot-confetti 1s cubic-bezier(.2,.7,.3,1) forwards; }
        .mascot-float { animation: mascot-float 3.6s ease-in-out infinite; transform-origin:center bottom; }
        .mascot-hop { animation: mascot-hop .85s cubic-bezier(.34,1.4,.5,1); transform-origin:center bottom; }
        .mascot-pop { animation: mascot-pop .32s ease-out; }
        @media (prefers-reduced-motion: reduce){ .mascot-float, .mascot-hop { animation: none; } }
      `}</style>
    </div>
  );
}
