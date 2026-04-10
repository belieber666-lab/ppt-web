"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";

const Layout = dynamic(() => import("./Layout").then(m => m.Layout), { ssr: false });
const AdminPanel = dynamic(() => import("./AdminPanel").then(m => m.AdminPanel), { ssr: false });

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "/api-backend";

interface AuthUser {
  id: string;
  username: string;
  is_admin: boolean;
}

export function LayoutClient() {
  const [entered, setEntered] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [showAdmin, setShowAdmin] = useState(false);

  // 启动时从 localStorage 恢复登录状态
  useEffect(() => {
    const saved = localStorage.getItem("ppt_token");
    if (!saved) return;
    fetch(`${API_BASE}/api/auth/me`, { headers: { Authorization: `Bearer ${saved}` } })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data) { setToken(saved); setUser(data); }
        else localStorage.removeItem("ppt_token");
      })
      .catch(() => localStorage.removeItem("ppt_token"));
  }, []);

  const handleLogin = (t: string, u: AuthUser) => {
    localStorage.setItem("ppt_token", t);
    setToken(t);
    setUser(u);
  };

  const handleLogout = () => {
    localStorage.removeItem("ppt_token");
    setToken(null);
    setUser(null);
    setEntered(false);
    setLeaving(false);
  };

  const handleEnter = () => {
    setLeaving(true);
    setTimeout(() => setEntered(true), 480);
  };

  // 管理员后台
  if (showAdmin && token && user?.is_admin) return <AdminPanel onBack={() => setShowAdmin(false)} />;

  // 已登录 + 已进入 → 主应用
  if (entered && token && user) return <Layout />;

  // 已登录但还在落地页 → 落地页
  if (token && user && !entered) return <HeroLanding onEnter={handleEnter} leaving={leaving} user={user} onLogout={handleLogout} onAdmin={user.is_admin ? () => setShowAdmin(true) : undefined} />;

  // 未登录 → 登录页
  return <LoginPage onLogin={handleLogin} />;
}

/* ─────────────────────────────────────────────────────────────── */
/*  Login Page                                                      */
/* ─────────────────────────────────────────────────────────────── */

function LoginPage({ onLogin }: { onLogin: (token: string, user: AuthUser) => void }) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => { setTimeout(() => setVisible(true), 80); }, []);

  const switchMode = () => {
    setMode(m => m === "login" ? "register" : "login");
    setError("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password) return;
    if (mode === "register" && password !== confirmPw) {
      setError("两次输入的密码不一致");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const form = new FormData();
      form.append("username", username);
      form.append("password", password);
      const endpoint = mode === "login" ? "/api/auth/login" : "/api/auth/register";
      const res = await fetch(`${API_BASE}${endpoint}`, { method: "POST", body: form });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.detail || `${mode === "login" ? "登录" : "注册"}失败 (${res.status})`);
      }
      const { token, user } = await res.json();
      onLogin(token, user);
    } catch (err: any) {
      setError(err.message || "操作失败");
    } finally {
      setLoading(false);
    }
  };

  const inputStyle: React.CSSProperties = {
    padding: "12px 16px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.1)",
    background: "rgba(255,255,255,0.05)", color: "#fff", fontSize: 14,
    outline: "none", transition: "border-color 0.2s",
  };

  return (
    <div style={{
      width: "100vw", height: "100vh", display: "flex",
      alignItems: "center", justifyContent: "center",
      background: "#05030f", position: "relative", overflow: "hidden",
    }}>
      <AuroraBackground />
      <div style={{
        position: "absolute", inset: 0, pointerEvents: "none",
        background: "radial-gradient(ellipse at center, transparent 25%, rgba(2,1,12,0.55) 100%)",
      }} />

      <div style={{
        position: "relative", zIndex: 10, width: "100%", maxWidth: 380, padding: "0 24px",
        transition: "opacity 0.6s ease, transform 0.6s ease",
        opacity: visible ? 1 : 0, transform: visible ? "translateY(0)" : "translateY(20px)",
      }}>
        <div style={{ textAlign: "center", marginBottom: 36 }}>
          <h1 style={{
            fontWeight: 900, fontSize: "2rem", letterSpacing: "-0.02em",
            background: "linear-gradient(160deg, #ffffff 35%, rgba(255,255,255,0.45) 100%)",
            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text",
            marginBottom: 8,
          }}>PPT Studio</h1>
          <p style={{ fontSize: 13, color: "rgba(255,255,255,0.35)" }}>
            {mode === "login" ? "登录你的账号以继续" : "创建新账号"}
          </p>
        </div>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <input
            type="text"
            placeholder="用户名"
            value={username}
            onChange={e => setUsername(e.target.value)}
            autoFocus
            style={inputStyle}
            onFocus={e => e.target.style.borderColor = "rgba(202,253,0,0.4)"}
            onBlur={e => e.target.style.borderColor = "rgba(255,255,255,0.1)"}
          />
          <input
            type="password"
            placeholder="密码"
            value={password}
            onChange={e => setPassword(e.target.value)}
            style={inputStyle}
            onFocus={e => e.target.style.borderColor = "rgba(202,253,0,0.4)"}
            onBlur={e => e.target.style.borderColor = "rgba(255,255,255,0.1)"}
          />
          {mode === "register" && (
            <input
              type="password"
              placeholder="确认密码"
              value={confirmPw}
              onChange={e => setConfirmPw(e.target.value)}
              style={inputStyle}
              onFocus={e => e.target.style.borderColor = "rgba(202,253,0,0.4)"}
              onBlur={e => e.target.style.borderColor = "rgba(255,255,255,0.1)"}
            />
          )}
          {error && (
            <p style={{ fontSize: 12, color: "#ff7351", textAlign: "center" }}>{error}</p>
          )}
          <button
            type="submit"
            disabled={loading || !username || !password || (mode === "register" && !confirmPw)}
            style={{
              marginTop: 4, padding: "13px 0", borderRadius: 10, border: "none",
              fontWeight: 800, fontSize: 14, cursor: "pointer",
              background: "linear-gradient(135deg, #f3ffca 0%, #cafd00 100%)",
              color: "#3a5000", opacity: loading ? 0.6 : 1,
              transition: "all 0.2s",
            }}
          >
            {loading
              ? (mode === "login" ? "登录中..." : "注册中...")
              : (mode === "login" ? "登 录" : "注 册")}
          </button>
        </form>

        <p style={{ marginTop: 20, textAlign: "center", fontSize: 13, color: "rgba(255,255,255,0.3)" }}>
          {mode === "login" ? "还没有账号？" : "已有账号？"}
          <button
            type="button"
            onClick={switchMode}
            style={{
              background: "none", border: "none", color: "#cafd00", cursor: "pointer",
              fontSize: 13, fontWeight: 700, marginLeft: 4, padding: 0,
              textDecoration: "underline", textUnderlineOffset: 3,
            }}
          >
            {mode === "login" ? "立即注册" : "返回登录"}
          </button>
        </p>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────── */
/*  Aurora Background — exact port of react-bits Aurora shader     */
/*  colorStops: ["#5227FF","#7cff67","#5227FF"]                    */
/*  amplitude : 1.1   blend : 0.6                                  */
/* ─────────────────────────────────────────────────────────────── */

const AURORA_VERT = `#version 300 es
in vec2 position;
void main() {
  gl_Position = vec4(position, 0.0, 1.0);
}`;

const AURORA_FRAG = `#version 300 es
precision highp float;

uniform float uTime;
uniform float uAmplitude;
uniform vec3  uColorStops[3];
uniform vec2  uResolution;
uniform float uBlend;

out vec4 fragColor;

vec3 permute(vec3 x) {
  return mod(((x * 34.0) + 1.0) * x, 289.0);
}

float snoise(vec2 v) {
  const vec4 C = vec4(
    0.211324865405187,  0.366025403784439,
   -0.577350269189626,  0.024390243902439
  );
  vec2 i  = floor(v + dot(v, C.yy));
  vec2 x0 = v - i + dot(i, C.xx);
  vec2 i1  = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod(i, 289.0);
  vec3 p = permute(
    permute(i.y + vec3(0.0, i1.y, 1.0))
    + i.x + vec3(0.0, i1.x, 1.0)
  );
  vec3 m = max(
    0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)),
    0.0
  );
  m = m * m;
  m = m * m;
  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
  vec3 g;
  g.x  = a0.x  * x0.x  + h.x  * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}

struct ColorStop {
  vec3  color;
  float position;
};

#define COLOR_RAMP(colors, factor, finalColor) {                             \
  int index = 0;                                                             \
  for (int i = 0; i < 2; i++) {                                             \
    ColorStop currentColor = colors[i];                                      \
    bool isInBetween = currentColor.position <= factor;                      \
    index = int(mix(float(index), float(i), float(isInBetween)));            \
  }                                                                          \
  ColorStop currentColor = colors[index];                                    \
  ColorStop nextColor    = colors[index + 1];                               \
  float range      = nextColor.position - currentColor.position;            \
  float lerpFactor = (factor - currentColor.position) / range;              \
  finalColor = mix(currentColor.color, nextColor.color, lerpFactor);        \
}

void main() {
  vec2 uv = gl_FragCoord.xy / uResolution;

  ColorStop colors[3];
  colors[0] = ColorStop(uColorStops[0], 0.0);
  colors[1] = ColorStop(uColorStops[1], 0.5);
  colors[2] = ColorStop(uColorStops[2], 1.0);

  vec3 rampColor;
  COLOR_RAMP(colors, uv.x, rampColor);

  float height = snoise(vec2(uv.x * 2.0 + uTime * 0.1, uTime * 0.25)) * 0.5 * uAmplitude;
  height = exp(height);
  height = (uv.y * 2.0 - height + 0.2);
  float intensity = 0.6 * height;

  float midPoint   = 0.20;
  float auroraAlpha = smoothstep(midPoint - uBlend * 0.5, midPoint + uBlend * 0.5, intensity);

  vec3 auroraColor = intensity * rampColor;

  fragColor = vec4(auroraColor * auroraAlpha, auroraAlpha);
}`;

function AuroraBackground() {
  const ctnRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const ctn = ctnRef.current;
    if (!ctn) return;

    const canvas = document.createElement("canvas");
    canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block;";
    ctn.appendChild(canvas);

    const gl = canvas.getContext("webgl2", { alpha: true, premultipliedAlpha: true, antialias: true });
    if (!gl) { ctn.removeChild(canvas); return; }

    gl.clearColor(0, 0, 0, 0);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

    const compile = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS))
        console.error("Aurora shader error:", gl.getShaderInfoLog(s));
      return s;
    };
    const prog = gl.createProgram()!;
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, AURORA_VERT));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, AURORA_FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS))
      console.error("Aurora link error:", gl.getProgramInfoLog(prog));
    gl.useProgram(prog);

    /* Full-screen triangle (same as react-bits Triangle geometry) */
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const posLoc = gl.getAttribLocation(prog, "position");
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

    /* colorStops: #5227FF → #7cff67 → #5227FF */
    const colorData = new Float32Array([
      0x52 / 255, 0x27 / 255, 0xff / 255,   // #5227FF purple
      0x7c / 255, 0xff / 255, 0x67 / 255,   // #7cff67 green
      0x52 / 255, 0x27 / 255, 0xff / 255,   // #5227FF purple
    ]);

    const uTime       = gl.getUniformLocation(prog, "uTime");
    const uAmplitude  = gl.getUniformLocation(prog, "uAmplitude");
    const uColorStops = gl.getUniformLocation(prog, "uColorStops");
    const uResolution = gl.getUniformLocation(prog, "uResolution");
    const uBlend      = gl.getUniformLocation(prog, "uBlend");

    const resize = () => {
      canvas.width  = ctn.offsetWidth  || window.innerWidth;
      canvas.height = ctn.offsetHeight || window.innerHeight;
      gl.viewport(0, 0, canvas.width, canvas.height);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(ctn);

    let raf: number;
    const start = performance.now();
    const draw = (ts: number) => {
      /* react-bits: uTime = t_ms * 0.01 * speed * 0.1  (speed=1) = t_s */
      const t = (ts - start) * 0.001;
      gl.uniform1f(uTime, t);
      gl.uniform1f(uAmplitude, 1.1);
      gl.uniform3fv(uColorStops, colorData);
      gl.uniform2f(uResolution, canvas.width, canvas.height);
      gl.uniform1f(uBlend, 0.6);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      if (ctn.contains(canvas)) ctn.removeChild(canvas);
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    };
  }, []);

  return <div ref={ctnRef} style={{ position: "absolute", inset: 0 }} />;
}

/* ─────────────────────────────────────────────────────────────── */
/*  Hero Landing Page                                              */
/* ─────────────────────────────────────────────────────────────── */

function HeroLanding({ onEnter, leaving, user, onLogout, onAdmin }: { onEnter: () => void; leaving: boolean; user?: AuthUser | null; onLogout?: () => void; onAdmin?: () => void }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 80);
    return () => clearTimeout(t);
  }, []);

  return (
    <div
      style={{
        position: "relative",
        width: "100vw",
        height: "100vh",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: "#05030f",
        transition: "opacity 0.48s ease, transform 0.48s ease",
        opacity: leaving ? 0 : visible ? 1 : 0,
        transform: leaving ? "scale(1.04)" : visible ? "scale(1)" : "scale(0.97)",
      }}
    >
      {/* Aurora WebGL background */}
      <AuroraBackground />

      {/* Dark vignette overlay */}
      <div style={{
        position: "absolute", inset: 0, pointerEvents: "none",
        background: "radial-gradient(ellipse at center, transparent 25%, rgba(2,1,12,0.55) 100%)",
      }} />

      {/* Content */}
      <div
        style={{
          position: "relative",
          zIndex: 10,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          textAlign: "center",
          padding: "0 24px",
          transition: "opacity 0.6s ease 0.15s, transform 0.6s ease 0.15s",
          opacity: visible ? 1 : 0,
          transform: visible ? "translateY(0)" : "translateY(24px)",
        }}
      >
        {/* Badge */}
        <div style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "6px 16px", borderRadius: 9999, marginBottom: 32,
          border: "1px solid rgba(255,255,255,0.12)",
          background: "rgba(255,255,255,0.06)",
          backdropFilter: "blur(8px)",
        }}>
          <span style={{
            width: 6, height: 6, borderRadius: "50%",
            background: "#cafd00", boxShadow: "0 0 6px #cafd00",
            animation: "lc-pulse-dot 2s ease-in-out infinite",
            display: "inline-block",
          }} />
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(255,255,255,0.55)" }}>
            AI Powered · PPT Studio
          </span>
        </div>

        {/* Title */}
        <h1 style={{
          fontWeight: 900,
          lineHeight: 1.08,
          letterSpacing: "-0.02em",
          marginBottom: 20,
          fontSize: "clamp(2.8rem, 7vw, 5.2rem)",
          background: "linear-gradient(160deg, #ffffff 35%, rgba(255,255,255,0.45) 100%)",
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
          backgroundClip: "text",
        }}>
          一键生成<br />你的专业幻灯片
        </h1>

        {/* Subtitle */}
        <p style={{
          marginBottom: 40,
          maxWidth: 380,
          fontSize: "clamp(0.9rem, 1.8vw, 1.05rem)",
          color: "rgba(255,255,255,0.42)",
          lineHeight: 1.8,
        }}>
          从文本到视觉，从未如此简单。<br />
          上传内容 PPT，AI 自动分析结构并套用精美模板。
        </p>

        {/* CTA Button */}
        <button
          onClick={onEnter}
          className="group"
          style={{
            position: "relative",
            outline: "none",
            border: "none",
            background: "none",
            cursor: "pointer",
          }}
        >
          {/* Glow layer */}
          <div style={{
            position: "absolute", inset: 0, borderRadius: 12,
            background: "#cafd00",
            filter: "blur(14px)",
            transform: "scale(1.08)",
            opacity: 0.65,
            transition: "opacity 0.3s",
          }} />
          <div
            className="group-hover:brightness-110 active:scale-95"
            style={{
              position: "relative",
              padding: "14px 40px",
              borderRadius: 12,
              fontWeight: 900,
              fontSize: "1rem",
              letterSpacing: "0.04em",
              transition: "all 0.2s",
              background: "linear-gradient(135deg, #f3ffca 0%, #cafd00 100%)",
              color: "#3a5000",
            }}
          >
            立即体验 →
          </div>
        </button>

        {user && (
          <div style={{ marginTop: 28, display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ fontSize: 12, color: "rgba(255,255,255,0.3)" }}>
              {user.username}{user.is_admin ? " · 管理员" : ""}
            </span>
            {onAdmin && (
              <button
                onClick={(e) => { e.stopPropagation(); onAdmin(); }}
                style={{
                  fontSize: 11, color: "rgba(202,253,0,0.5)", background: "none",
                  border: "1px solid rgba(202,253,0,0.2)", borderRadius: 6,
                  padding: "3px 10px", cursor: "pointer", transition: "all 0.2s",
                }}
                onMouseEnter={e => { e.currentTarget.style.color = "#cafd00"; e.currentTarget.style.borderColor = "rgba(202,253,0,0.5)"; }}
                onMouseLeave={e => { e.currentTarget.style.color = "rgba(202,253,0,0.5)"; e.currentTarget.style.borderColor = "rgba(202,253,0,0.2)"; }}
              >
                管理后台
              </button>
            )}
            <button
              onClick={(e) => { e.stopPropagation(); onLogout?.(); }}
              style={{
                fontSize: 11, color: "rgba(255,255,255,0.25)", background: "none",
                border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6,
                padding: "3px 10px", cursor: "pointer", transition: "all 0.2s",
              }}
              onMouseEnter={e => { e.currentTarget.style.color = "#fff"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.3)"; }}
              onMouseLeave={e => { e.currentTarget.style.color = "rgba(255,255,255,0.25)"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)"; }}
            >
              退出登录
            </button>
          </div>
        )}
      </div>

      {/* Bottom fade */}
      <div style={{
        position: "absolute", bottom: 0, left: 0, right: 0, height: 120, pointerEvents: "none",
        background: "linear-gradient(to bottom, transparent, rgba(2,1,12,0.5))",
      }} />
    </div>
  );
}
