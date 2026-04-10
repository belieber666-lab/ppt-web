"use client";

import { useEffect, useRef, useState } from "react";

interface Props {
  onEnter: () => void;
}

export function HeroPage({ onEnter }: Props) {
  const [visible, setVisible] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);

  // Fade-in on mount
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 60);
    return () => clearTimeout(t);
  }, []);

  // Animated aurora background
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    let t = 0;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    const orbs = [
      { x: 0.3, y: 0.25, r: 0.45, color: "rgba(34,197,94,0.55)"  },  // green
      { x: 0.72, y: 0.2,  r: 0.38, color: "rgba(99,102,241,0.5)"  },  // indigo
      { x: 0.5,  y: 0.6,  r: 0.35, color: "rgba(168,85,247,0.38)" },  // purple
      { x: 0.15, y: 0.55, r: 0.3,  color: "rgba(20,184,166,0.32)" },  // teal
    ];

    const draw = () => {
      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);

      // Base dark background
      ctx.fillStyle = "#070b14";
      ctx.fillRect(0, 0, w, h);

      orbs.forEach((orb, i) => {
        const ox = (orb.x + Math.sin(t * 0.4 + i * 1.3) * 0.07) * w;
        const oy = (orb.y + Math.cos(t * 0.3 + i * 0.9) * 0.06) * h;
        const r  = orb.r * Math.min(w, h) * (1 + Math.sin(t * 0.5 + i) * 0.05);

        const grad = ctx.createRadialGradient(ox, oy, 0, ox, oy, r);
        grad.addColorStop(0, orb.color);
        grad.addColorStop(1, "transparent");

        ctx.globalCompositeOperation = "screen";
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(ox, oy, r, 0, Math.PI * 2);
        ctx.fill();
      });

      ctx.globalCompositeOperation = "source-over";
      // Vignette
      const vig = ctx.createRadialGradient(w / 2, h / 2, h * 0.2, w / 2, h / 2, h * 0.9);
      vig.addColorStop(0, "transparent");
      vig.addColorStop(1, "rgba(0,0,0,0.65)");
      ctx.fillStyle = vig;
      ctx.fillRect(0, 0, w, h);

      t += 0.008;
      animRef.current = requestAnimationFrame(draw);
    };

    draw();
    return () => {
      cancelAnimationFrame(animRef.current);
      window.removeEventListener("resize", resize);
    };
  }, []);

  const handleEnter = () => {
    setLeaving(true);
    setTimeout(() => onEnter(), 600);
  };

  return (
    <div
      className="relative w-screen h-screen overflow-hidden flex flex-col"
      style={{
        opacity: leaving ? 0 : visible ? 1 : 0,
        transform: leaving ? "scale(1.04)" : "scale(1)",
        transition: leaving
          ? "opacity 0.6s ease-in, transform 0.6s ease-in"
          : "opacity 0.8s ease-out",
      }}
    >
      {/* Aurora canvas */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full"
        style={{ filter: "blur(40px)" }}
      />

      {/* Noise grain overlay */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='0.04'/%3E%3C/svg%3E")`,
          opacity: 0.35,
        }}
      />

      {/* Top bar */}
      <header className="relative z-10 flex items-center justify-between px-8 py-5">
        <span className="text-sm font-black text-[#cafd00] tracking-widest uppercase select-none">
          PPT Studio
        </span>
        <button
          onClick={handleEnter}
          className="text-xs font-bold text-white/60 hover:text-white transition-colors px-4 py-1.5
            border border-white/10 rounded-full hover:border-white/30"
        >
          进入应用
        </button>
      </header>

      {/* Hero content */}
      <div className="relative z-10 flex-1 flex flex-col items-center justify-center text-center px-6 -mt-10">

        {/* Badge */}
        <div
          className="flex items-center gap-2 px-4 py-1.5 rounded-full mb-8"
          style={{
            background: "rgba(202,253,0,0.08)",
            border: "1px solid rgba(202,253,0,0.2)",
            transform: visible ? "translateY(0)" : "translateY(16px)",
            opacity: visible ? 1 : 0,
            transition: "opacity 0.7s ease 0.1s, transform 0.7s ease 0.1s",
          }}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-[#cafd00] lc-pulse-dot" />
          <span className="text-[11px] font-bold text-[#cafd00]/80 tracking-widest uppercase">
            AI 驱动 · 智能排版
          </span>
        </div>

        {/* Main headline */}
        <h1
          className="font-black leading-[1.12] tracking-tight mb-5"
          style={{
            fontSize: "clamp(2.8rem, 7vw, 5.5rem)",
            transform: visible ? "translateY(0)" : "translateY(24px)",
            opacity: visible ? 1 : 0,
            transition: "opacity 0.8s ease 0.2s, transform 0.8s ease 0.2s",
          }}
        >
          <span className="text-white">一键生成</span>
          <br />
          <span
            style={{
              background: "linear-gradient(135deg, #ffffff 0%, #cafd00 55%, #86efac 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
            }}
          >
            你的专业幻灯片
          </span>
        </h1>

        {/* Subtitle */}
        <p
          className="text-white/50 text-lg max-w-md leading-relaxed mb-12"
          style={{
            transform: visible ? "translateY(0)" : "translateY(20px)",
            opacity: visible ? 1 : 0,
            transition: "opacity 0.8s ease 0.35s, transform 0.8s ease 0.35s",
          }}
        >
          从文本到视觉，从未如此简单。
        </p>

        {/* CTA button */}
        <div
          style={{
            transform: visible ? "translateY(0)" : "translateY(20px)",
            opacity: visible ? 1 : 0,
            transition: "opacity 0.8s ease 0.5s, transform 0.8s ease 0.5s",
          }}
        >
          <button
            onClick={handleEnter}
            className="group relative px-10 py-4 text-sm font-black text-[#3a4800] rounded-2xl
              transition-all duration-200 active:scale-95"
            style={{
              background: "linear-gradient(135deg, #f3ffca 0%, #cafd00 60%, #a8e600 100%)",
              boxShadow: "0 0 40px rgba(202,253,0,0.4), 0 8px 32px rgba(202,253,0,0.2)",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.boxShadow =
                "0 0 60px rgba(202,253,0,0.6), 0 12px 40px rgba(202,253,0,0.3)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.boxShadow =
                "0 0 40px rgba(202,253,0,0.4), 0 8px 32px rgba(202,253,0,0.2)";
            }}
          >
            立即体验
            <span className="ml-2 inline-block transition-transform duration-200 group-hover:translate-x-1">→</span>
          </button>
        </div>

        {/* Feature pills */}
        <div
          className="flex flex-wrap items-center justify-center gap-3 mt-14"
          style={{
            transform: visible ? "translateY(0)" : "translateY(16px)",
            opacity: visible ? 1 : 0,
            transition: "opacity 0.8s ease 0.65s, transform 0.8s ease 0.65s",
          }}
        >
          {[
            { icon: "auto_awesome", label: "AI 结构分析" },
            { icon: "style",        label: "模板套用" },
            { icon: "category",     label: "自动配图标" },
            { icon: "edit",         label: "在线编辑" },
          ].map((f) => (
            <div
              key={f.label}
              className="flex items-center gap-2 px-4 py-2 rounded-full text-xs font-medium text-white/50"
              style={{
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.08)",
              }}
            >
              <span className="material-symbols-outlined text-sm text-white/30"
                style={{ fontVariationSettings: "'FILL' 1" }}>{f.icon}</span>
              {f.label}
            </div>
          ))}
        </div>
      </div>

      {/* Bottom fade */}
      <div
        className="absolute bottom-0 left-0 right-0 h-32 pointer-events-none"
        style={{ background: "linear-gradient(to top, rgba(7,11,20,0.8), transparent)" }}
      />
    </div>
  );
}
