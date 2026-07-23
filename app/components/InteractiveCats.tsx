"use client";

import { type CSSProperties, useEffect, useRef, useState } from "react";

type Point = {
  x: number;
  y: number;
};

const cats = [
  { name: "mimi", fur: "#f7c66a", ear: "#e78b7a", scale: 0.96 },
  { name: "nana", fur: "#f2f4f7", ear: "#eca5b5", scale: 1.08 },
  { name: "duoduo", fur: "#6b7280", ear: "#f0a3a3", scale: 0.92 },
];

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function getLookStyle(target: Point, element: HTMLElement | null) {
  if (!element) {
    return {
      head: "translate3d(0, 0, 0) rotate(0deg)",
      eyes: "translate3d(0, 0, 0)",
    };
  }

  const rect = element.getBoundingClientRect();
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height * 0.45;
  const dx = target.x - centerX;
  const dy = target.y - centerY;
  const angle = clamp((Math.atan2(dy, dx) * 180) / Math.PI, -28, 28);
  const eyeX = clamp(dx / 34, -5, 5);
  const eyeY = clamp(dy / 42, -3, 5);
  const headX = clamp(dx / 90, -6, 6);
  const headY = clamp(dy / 110, -3, 5);

  return {
    head: `translate3d(${headX}px, ${headY}px, 0) rotate(${angle * 0.18}deg)`,
    eyes: `translate3d(${eyeX}px, ${eyeY}px, 0)`,
  };
}

function Backpack() {
  return (
    <svg className="cat-pack" viewBox="0 0 52 58" aria-hidden="true">
      <path
        d="M16 17c.8-8 5.2-12 10-12s9.2 4 10 12"
        fill="none"
        stroke="#46566f"
        strokeWidth="5"
        strokeLinecap="round"
      />
      <rect x="9" y="16" width="34" height="37" rx="10" fill="#2f80ed" />
      <rect x="14" y="30" width="24" height="16" rx="5" fill="#7cc4ff" />
      <path d="M15 24h22" stroke="#f9fafb" strokeWidth="4" strokeLinecap="round" />
      <circle cx="19" cy="38" r="2" fill="#155dfc" />
      <circle cx="33" cy="38" r="2" fill="#155dfc" />
    </svg>
  );
}

function Cat({
  name,
  fur,
  ear,
  scale,
  target,
}: {
  name: string;
  fur: string;
  ear: string;
  scale: number;
  target: Point;
}) {
  const catRef = useRef<HTMLDivElement | null>(null);
  const look = getLookStyle(target, catRef.current);

  return (
    <div className={`cat cat-${name}`} ref={catRef} style={{ "--cat-scale": scale } as CSSProperties}>
      <div className="cat-shadow" />
      <div className="cat-tail" style={{ background: fur }}>
        <span />
      </div>
      <div className="cat-body" style={{ background: fur }}>
        <div className="cat-belly" />
        <div className="cat-paw left" />
        <div className="cat-paw right" />
      </div>
      <div className="cat-head" style={{ background: fur, transform: look.head }}>
        <span className="cat-patch" />
        <span className="cat-ear left" style={{ background: fur }}>
          <i style={{ background: ear }} />
        </span>
        <span className="cat-ear right" style={{ background: fur }}>
          <i style={{ background: ear }} />
        </span>
        <span className="cat-bow left" />
        <span className="cat-bow knot" />
        <span className="cat-bow right" />
        <span className="cat-stripe one" />
        <span className="cat-stripe two" />
        <span className="cat-stripe three" />
        <div className="cat-face">
          <span className="cat-eye left">
            <i style={{ transform: look.eyes }} />
          </span>
          <span className="cat-eye right">
            <i style={{ transform: look.eyes }} />
          </span>
          <span className="cat-nose" />
          <span className="cat-mouth" />
        </div>
      </div>
    </div>
  );
}

export default function InteractiveCats() {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [target, setTarget] = useState<Point>({ x: 0, y: 0 });
  const [pack, setPack] = useState<Point>({ x: 50, y: 32 });

  useEffect(() => {
    const setInitialTarget = () => {
      const rect = wrapRef.current?.getBoundingClientRect();
      if (!rect) return;
      setTarget({ x: rect.left + rect.width / 2, y: rect.top + 30 });
      setPack({ x: 50, y: 30 });
    };

    const onMove = (event: PointerEvent) => {
      const rect = wrapRef.current?.getBoundingClientRect();
      if (!rect) return;
      const x = clamp(event.clientX - rect.left, 28, rect.width - 28);
      const y = clamp(event.clientY - rect.top, 18, rect.height - 18);

      setTarget({ x: event.clientX, y: event.clientY });
      setPack({
        x: (x / rect.width) * 100,
        y: (y / rect.height) * 100,
      });
    };

    setInitialTarget();
    window.addEventListener("resize", setInitialTarget);
    window.addEventListener("pointermove", onMove, { passive: true });

    return () => {
      window.removeEventListener("resize", setInitialTarget);
      window.removeEventListener("pointermove", onMove);
    };
  }, []);

  return (
    <section className="cat-footer" ref={wrapRef} aria-hidden="true">
      <style>{`
        .cat-footer {
          position: relative;
          height: 156px;
          margin-top: 32px;
          overflow: hidden;
          border-radius: 16px 16px 0 0;
          background:
            radial-gradient(circle at 18% 34%, rgba(255, 255, 255, .9) 0 34px, transparent 35px),
            linear-gradient(180deg, #e9f5ff 0%, #f8fbff 56%, #d8ecdc 57%, #c8e2ce 100%);
          border: 1px solid #dbeafe;
          border-bottom: 0;
        }

        .cat-footer::after {
          content: "";
          position: absolute;
          left: 0;
          right: 0;
          bottom: 0;
          height: 34px;
          background: linear-gradient(90deg, #b8d9bf, #d4e9ca, #b8d9bf);
        }

        .cat-pack {
          position: absolute;
          z-index: 4;
          left: var(--pack-x);
          top: var(--pack-y);
          width: 42px;
          transform: translate(-50%, -50%);
          filter: drop-shadow(0 8px 10px rgba(30, 41, 59, .16));
          transition: transform .08s linear;
          pointer-events: none;
        }

        .cat-row {
          position: absolute;
          z-index: 3;
          left: 50%;
          bottom: 10px;
          display: flex;
          align-items: end;
          justify-content: center;
          gap: min(8vw, 92px);
          width: min(760px, 92vw);
          transform: translateX(-50%);
        }

        .cat {
          --cat-scale: 1;
          position: relative;
          width: 108px;
          height: 112px;
          transform: scale(var(--cat-scale));
          transform-origin: bottom center;
        }

        .cat-tail {
          position: absolute;
          display: none;
          box-shadow: inset -5px -7px 0 rgba(15, 23, 42, .08);
        }

        .cat-tail span {
          position: absolute;
          inset: auto;
          display: block;
        }

        .cat-shadow {
          position: absolute;
          left: 13px;
          right: 13px;
          bottom: 0;
          height: 14px;
          border-radius: 999px;
          background: rgba(30, 41, 59, .14);
          filter: blur(1px);
        }

        .cat-body {
          position: absolute;
          left: 22px;
          bottom: 8px;
          width: 64px;
          height: 62px;
          border-radius: 31px 31px 22px 22px;
          box-shadow: inset -8px -10px 0 rgba(15, 23, 42, .08);
        }

        .cat-belly {
          position: absolute;
          display: none;
          left: 18px;
          bottom: 11px;
          width: 28px;
          height: 34px;
          border-radius: 999px;
          background: rgba(255, 255, 255, .5);
        }

        .cat-paw {
          position: absolute;
          bottom: 4px;
          width: 20px;
          height: 14px;
          border-radius: 999px;
          background: rgba(255, 255, 255, .42);
        }

        .cat-paw.left { left: 10px; }
        .cat-paw.right { right: 10px; }

        .cat-head {
          position: absolute;
          left: 16px;
          top: 14px;
          width: 76px;
          height: 66px;
          border-radius: 34px 34px 30px 30px;
          box-shadow: inset -7px -8px 0 rgba(15, 23, 42, .08);
          transition: transform .1s linear;
          transform-origin: 50% 78%;
        }

        .cat-patch,
        .cat-bow,
        .cat-stripe {
          position: absolute;
          display: none;
        }

        .cat-ear {
          position: absolute;
          top: -10px;
          width: 28px;
          height: 28px;
          clip-path: polygon(50% 0, 100% 100%, 0 100%);
        }

        .cat-ear.left { left: 8px; transform: rotate(-18deg); }
        .cat-ear.right { right: 8px; transform: rotate(18deg); }

        .cat-ear i {
          position: absolute;
          left: 8px;
          top: 8px;
          width: 12px;
          height: 13px;
          clip-path: polygon(50% 0, 100% 100%, 0 100%);
          opacity: .95;
        }

        .cat-face {
          position: absolute;
          inset: 0;
        }

        .cat-eye {
          position: absolute;
          top: 27px;
          width: 14px;
          height: 16px;
          overflow: hidden;
          border-radius: 999px;
          background: #fff;
          box-shadow: inset 0 0 0 1px rgba(15, 23, 42, .08);
        }

        .cat-eye.left { left: 20px; }
        .cat-eye.right { right: 20px; }

        .cat-eye i {
          position: absolute;
          left: 4px;
          top: 5px;
          width: 6px;
          height: 8px;
          border-radius: 999px;
          background: #111827;
          transition: transform .08s linear;
        }

        .cat-nose {
          position: absolute;
          left: 50%;
          top: 43px;
          width: 8px;
          height: 6px;
          border-radius: 999px 999px 7px 7px;
          background: #ef7c8e;
          transform: translateX(-50%);
        }

        .cat-mouth {
          position: absolute;
          left: 50%;
          top: 49px;
          width: 16px;
          height: 9px;
          border-bottom: 2px solid rgba(17, 24, 39, .62);
          border-radius: 0 0 999px 999px;
          transform: translateX(-50%);
        }

        .cat-mimi .cat-tail {
          display: block;
          left: -1px;
          bottom: 34px;
          width: 36px;
          height: 24px;
          border-radius: 999px 0 0 999px;
          transform: rotate(-18deg);
        }

        .cat-mimi .cat-tail span {
          right: -8px;
          top: 4px;
          width: 14px;
          height: 14px;
          border-radius: 999px;
          background: rgba(255, 255, 255, .28);
        }

        .cat-mimi .cat-body {
          border-radius: 34px 30px 22px 24px;
        }

        .cat-mimi .cat-stripe {
          display: block;
          top: 12px;
          width: 3px;
          height: 14px;
          border-radius: 999px;
          background: rgba(154, 82, 34, .34);
        }

        .cat-mimi .cat-stripe.one { left: 31px; transform: rotate(-18deg); }
        .cat-mimi .cat-stripe.two { left: 37px; }
        .cat-mimi .cat-stripe.three { left: 43px; transform: rotate(18deg); }

        .cat-nana .cat-body {
          left: 18px;
          width: 72px;
          height: 66px;
          border-radius: 40px 40px 24px 24px;
        }

        .cat-nana .cat-head {
          left: 12px;
          top: 10px;
          width: 84px;
          height: 70px;
          border-radius: 42px 42px 34px 34px;
        }

        .cat-nana .cat-belly {
          display: block;
          left: 22px;
          width: 30px;
          height: 37px;
        }

        .cat-nana .cat-ear {
          width: 24px;
          height: 24px;
          top: -7px;
        }

        .cat-nana .cat-eye.left { left: 24px; }
        .cat-nana .cat-eye.right { right: 24px; }

        .cat-nana .cat-bow {
          display: block;
          top: -8px;
          background: #ef7c8e;
          z-index: 2;
        }

        .cat-nana .cat-bow.left {
          left: 48px;
          width: 16px;
          height: 14px;
          border-radius: 12px 4px 12px 4px;
          transform: rotate(22deg);
        }

        .cat-nana .cat-bow.right {
          left: 62px;
          width: 16px;
          height: 14px;
          border-radius: 4px 12px 4px 12px;
          transform: rotate(-22deg);
        }

        .cat-nana .cat-bow.knot {
          left: 60px;
          top: -4px;
          width: 8px;
          height: 8px;
          border-radius: 999px;
          background: #db4d68;
        }

        .cat-duoduo .cat-body {
          left: 27px;
          width: 54px;
          height: 66px;
          border-radius: 28px 28px 18px 18px;
        }

        .cat-duoduo .cat-head {
          left: 19px;
          top: 16px;
          width: 70px;
          height: 61px;
          border-radius: 30px 30px 28px 28px;
        }

        .cat-duoduo .cat-tail {
          display: block;
          right: -3px;
          bottom: 34px;
          width: 15px;
          height: 54px;
          border-radius: 999px;
          transform: rotate(23deg);
        }

        .cat-duoduo .cat-ear {
          top: -13px;
          width: 30px;
          height: 31px;
        }

        .cat-duoduo .cat-patch {
          display: block;
          right: 5px;
          top: 8px;
          width: 29px;
          height: 32px;
          border-radius: 999px 999px 999px 12px;
          background: rgba(17, 24, 39, .2);
        }

        .cat-duoduo .cat-eye.left { left: 17px; }
        .cat-duoduo .cat-eye.right { right: 17px; }

        @media (max-width: 640px) {
          .cat-footer {
            height: 138px;
            margin-top: 24px;
          }

          .cat-row {
            gap: 8px;
            width: 100%;
          }

          .cat {
            width: 92px;
            transform: scale(calc(var(--cat-scale) * .84));
          }
        }
      `}</style>
      <div
        style={
          {
            "--pack-x": `${pack.x}%`,
            "--pack-y": `${pack.y}%`,
          } as CSSProperties
        }
      >
        <Backpack />
      </div>
      <div className="cat-row">
        {cats.map((cat) => (
          <Cat key={cat.name} {...cat} target={target} />
        ))}
      </div>
    </section>
  );
}
