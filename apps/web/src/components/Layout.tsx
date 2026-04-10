"use client";

import { forwardRef, useCallback, useEffect, useRef, useState } from "react";
import Sketch from "@uiw/react-color-sketch";
import { TemplatePicker, type TemplateItem } from "./TemplatePicker";
import { PreviewGrid, type SlideItem } from "./PreviewGrid";
import { ParsePreview, type ParsedPageData } from "./ParsePreview";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "/api-backend";

function authFetch(url: string, init?: RequestInit): Promise<Response> {
  const token = typeof window !== "undefined" ? localStorage.getItem("ppt_token") : null;
  if (!token) return fetch(url, init);
  const headers = new Headers(init?.headers);
  if (!headers.has("Authorization")) headers.set("Authorization", `Bearer ${token}`);
  return fetch(url, { ...init, headers });
}

async function apiErrorMessage(res: Response): Promise<string> {
  const text = await res.text();
  if (!text.trim()) return `HTTP ${res.status}`;
  try {
    const b = JSON.parse(text) as { detail?: unknown; error?: unknown };
    const d = b.detail ?? b.error;
    if (typeof d === "string") return d;
    if (Array.isArray(d)) return JSON.stringify(d);
    if (d != null) return String(d);
  } catch {
    /* 非 JSON（如代理/HTML 错误页） */
  }
  return text.length > 280 ? `${text.slice(0, 280)}…` : text;
}

/* ── Types ────────────────────────────────────────────────────── */

type Step  = 1 | 2 | 3;
type Stage = "idle" | "parsing" | "parsed" | "generating" | "done" | "error";

interface JobResult {
  job_id: string;
  slide_count: number;
  preview_count: number;
  slides: SlideItem[];
}

/* ── Main ─────────────────────────────────────────────────────── */

export function Layout() {
  const [step, setStep] = useState<Step>(1);

  const [templates,       setTemplates]       = useState<TemplateItem[]>([]);
  const [selectedTplId,   setSelectedTplId]   = useState<string | null>(null);
  const [templatesLoaded, setTemplatesLoaded] = useState(false);
  const [uploadingTpl,    setUploadingTpl]    = useState(false);

  const [contentFile, setContentFile] = useState<File | null>(null);
  const contentRef = useRef<HTMLInputElement>(null);

  const [stage,     setStage]     = useState<Stage>("idle");
  const [errMsg,    setErrMsg]    = useState("");
  const [jobResult, setJobResult] = useState<JobResult | null>(null);

  const [progress, setProgress] = useState(0);
  const progressRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const [enableIcons, setEnableIcons] = useState(true);
  const [enableDalle, setEnableDalle] = useState(false);
  const [enableNanobanana, setEnableNanobanana] = useState(false);
  const [nanobananaModel, setNanobananaModel] = useState("dall-e-3");

  const [parsedPages, setParsedPages] = useState<ParsedPageData[]>([]);
  const [aiUsed, setAiUsed] = useState(false);

  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const logoRef = useRef<HTMLInputElement>(null);

  // 持久化 Logo 库
  interface SavedLogo { id: string; name: string; url: string; size: number; public?: boolean }
  const [savedLogos, setSavedLogos] = useState<SavedLogo[]>([]);
  const [selectedLogoId, setSelectedLogoId] = useState<string | null>(null);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [tplAnalysis, setTplAnalysis] = useState<Record<string, any> | null>(null);
  const [tplAnalysisLoading, setTplAnalysisLoading] = useState(false);

  /* ── 加载模板库 ── */
  const loadTemplates = useCallback(async () => {
    try {
      const res = await authFetch(`${API_BASE}/api/templates`);
      if (!res.ok) throw new Error(await apiErrorMessage(res));
      const data: TemplateItem[] = await res.json();
      setTemplates(data);
      setTemplatesLoaded(true);
      if (data.length > 0 && !selectedTplId) setSelectedTplId(data[0].id);
    } catch (e) {
      console.error("加载模板库失败:", e);
      setTemplatesLoaded(true);
    }
  }, [selectedTplId]);

  useEffect(() => { loadTemplates(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // 加载已保存的 Logo 列表
  const loadSavedLogos = useCallback(async () => {
    try {
      const res = await authFetch(`${API_BASE}/api/logos`);
      if (res.ok) setSavedLogos(await res.json());
    } catch { /* ignore */ }
  }, []);
  useEffect(() => { loadSavedLogos(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── 选择模板后自动解析样式（优先读取已保存版本） ── */
  useEffect(() => {
    if (!selectedTplId) { setTplAnalysis(null); return; }
    let cancelled = false;
    setTplAnalysisLoading(true);
    authFetch(`${API_BASE}/api/templates/${selectedTplId}/analyze`)
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (!cancelled) setTplAnalysis(data); })
      .catch(() => { if (!cancelled) setTplAnalysis(null); })
      .finally(() => { if (!cancelled) setTplAnalysisLoading(false); });
    return () => { cancelled = true; };
  }, [selectedTplId]);

  /* ── 模板解析调整后自动持久化（防抖 800ms） ── */
  const tplAnalysisRef = useRef(tplAnalysis);
  tplAnalysisRef.current = tplAnalysis;
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initialLoadRef = useRef(true);

  useEffect(() => {
    if (!selectedTplId || !tplAnalysis) return;
    if (initialLoadRef.current) {
      initialLoadRef.current = false;
      return;
    }
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      const data = tplAnalysisRef.current;
      if (!data) return;
      authFetch(`${API_BASE}/api/templates/${selectedTplId}/analysis`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }).catch(() => {});
    }, 800);
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); };
  }, [tplAnalysis, selectedTplId]);

  useEffect(() => { initialLoadRef.current = true; }, [selectedTplId]);

  /* ── Logo 选择 ── */
  const handleLogoSelect = useCallback(async (f: File) => {
    setLogoFile(f);
    if (logoPreview) URL.revokeObjectURL(logoPreview);
    setLogoPreview(URL.createObjectURL(f));
    // 同时持久化到后端
    try {
      const fd = new FormData();
      fd.append("file", f);
      const res = await authFetch(`${API_BASE}/api/logos`, { method: "POST", body: fd });
      if (res.ok) {
        const saved = await res.json();
        setSelectedLogoId(saved.id);
        loadSavedLogos();
      }
    } catch { /* ignore */ }
  }, [logoPreview, loadSavedLogos]);

  const handleLogoPickSaved = useCallback(async (logo: { id: string; name: string; url: string }) => {
    setSelectedLogoId(logo.id);
    if (logoPreview) URL.revokeObjectURL(logoPreview);
    setLogoPreview(`${API_BASE}${logo.url}`);
    try {
      const res = await authFetch(`${API_BASE}${logo.url}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const f = new File([blob], logo.name || "logo.png", { type: blob.type || "image/png" });
      setLogoFile(f);
    } catch (e) {
      console.error("Logo fetch failed:", e);
    }
  }, [logoPreview]);

  const handleLogoDeleteSaved = useCallback(async (id: string) => {
    try {
      await authFetch(`${API_BASE}/api/logos/${id}`, { method: "DELETE" });
      setSavedLogos(prev => prev.filter(l => l.id !== id));
      if (selectedLogoId === id) {
        setSelectedLogoId(null);
        setLogoFile(null);
        if (logoPreview) URL.revokeObjectURL(logoPreview);
        setLogoPreview(null);
      }
    } catch { /* ignore */ }
  }, [selectedLogoId, logoPreview]);

  const handleLogoClear = useCallback(() => {
    setLogoFile(null);
    setSelectedLogoId(null);
    if (logoPreview) URL.revokeObjectURL(logoPreview);
    setLogoPreview(null);
    if (logoRef.current) logoRef.current.value = "";
  }, [logoPreview]);

  /* ── 上传新模板 ── */
  const handleUploadTemplate = useCallback(async (file: File, name: string) => {
    setUploadingTpl(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("name", name);
      const res = await authFetch(`${API_BASE}/api/templates`, { method: "POST", body: fd });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        throw new Error(b.detail ?? `HTTP ${res.status}`);
      }
      const newTpl: TemplateItem = await res.json();
      setTemplates(prev => [...prev, newTpl]);
      setSelectedTplId(newTpl.id);
    } catch (e) {
      setErrMsg(`上传失败：${e instanceof Error ? e.message : String(e)}`);
      setStage("error");
    } finally {
      setUploadingTpl(false);
    }
  }, []);

  /* ── 删除 / 重命名模板 ── */
  const handleDeleteTemplate = useCallback(async (id: string) => {
    if (!confirm("确定删除该模板吗？")) return;
    try {
      await authFetch(`${API_BASE}/api/templates/${id}`, { method: "DELETE" });
      setTemplates(prev => prev.filter(t => t.id !== id));
      if (selectedTplId === id) setSelectedTplId(null);
    } catch { /* ignore */ }
  }, [selectedTplId]);

  const handleRenameTemplate = useCallback(async (id: string, newName: string) => {
    try {
      const res = await authFetch(`${API_BASE}/api/templates/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName }),
      });
      if (res.ok) setTemplates(prev => prev.map(t => t.id === id ? { ...t, name: newName } : t));
    } catch { /* ignore */ }
  }, []);

  /* ── 生成进度 ── */
  const startProgress = useCallback(() => {
    setProgress(0);
    if (progressRef.current) clearInterval(progressRef.current);
    const steps = [
      { target: 15 }, { target: 30 }, { target: 55 },
      { target: 75 }, { target: 88 }, { target: 95 },
    ];
    let stepIdx = 0, current = 0;
    progressRef.current = setInterval(() => {
      if (stepIdx >= steps.length) return;
      const speed = stepIdx < 2 ? 2 : stepIdx < 4 ? 1.2 : 0.6;
      current = Math.min(current + speed, steps[stepIdx].target);
      setProgress(Math.round(current));
      if (current >= steps[stepIdx].target) stepIdx++;
    }, 300);
  }, []);

  const stopProgress = useCallback((success: boolean) => {
    if (progressRef.current) { clearInterval(progressRef.current); progressRef.current = null; }
    setProgress(success ? 100 : 0);
  }, []);

  const parseLabel = progress < 50 ? "提取内容结构…" : progress < 90 ? "语义分析中…" : "解析完成";

  const generateLabel = progress <= 15 ? "解析模板…"
    : progress <= 30 ? "提取内容…"
    : progress <= 55 ? "AI 分析结构…"
    : progress <= 75 ? "匹配布局…"
    : progress <= 88 ? "注入文字与图标…"
    : "渲染预览…";

  const progressLabel = stage === "parsing" ? parseLabel : generateLabel;

  /* ── 第一步：解析内容 ── */
  const handleParse = useCallback(async () => {
    if (!contentFile) return;
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setStage("parsing");
    setErrMsg("");
    setProgress(0);
    const fakeTimer = setInterval(() => {
      setProgress(p => Math.min(p + 0.5, 90));
    }, 500);
    try {
      const fd = new FormData();
      fd.append("content", contentFile);
      const res = await authFetch(`${API_BASE}/api/jobs/parse`, { method: "POST", body: fd, signal: ac.signal });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        throw new Error(b.detail ?? b.error ?? `HTTP ${res.status}`);
      }
      const data = await res.json();
      clearInterval(fakeTimer);
      setProgress(100);
      setParsedPages(data.pages ?? []);
      setAiUsed(!!data.ai_used);
      setStage("parsed");
    } catch (e) {
      clearInterval(fakeTimer);
      if (e instanceof DOMException && e.name === "AbortError") {
        setProgress(0);
        setStage("idle");
        return;
      }
      setProgress(0);
      setErrMsg(e instanceof Error ? e.message : String(e));
      setStage("error");
    }
  }, [contentFile]);

  const handleCancelTask = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    if (progressRef.current) { clearInterval(progressRef.current); progressRef.current = null; }
    setProgress(0);
    setStage("idle");
  }, []);

  /* ── 第二步：确认生成 ── */
  const handleConfirmGenerate = useCallback(async () => {
    if (!selectedTplId || !contentFile) return;
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setStage("generating");
    setErrMsg("");
    startProgress();
    try {
      const fd = new FormData();
      fd.append("template_id", selectedTplId);
      fd.append("content", contentFile);
      fd.append("enable_icons", enableIcons ? "true" : "false");
      fd.append("enable_dalle_fallback", enableDalle ? "true" : "false");
      fd.append("enable_nanobanana", enableNanobanana ? "true" : "false");
      fd.append("nanobanana_model", nanobananaModel);
      if (parsedPages.length > 0) {
        fd.append("parsed_pages", JSON.stringify(parsedPages));
      }
      if (selectedLogoId) {
        fd.append("logo_id", selectedLogoId);
      } else if (logoFile) {
        fd.append("logo", logoFile);
      }
      const res = await authFetch(`${API_BASE}/api/jobs`, { method: "POST", body: fd, signal: ac.signal });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        throw new Error(b.detail ?? b.error ?? `HTTP ${res.status}`);
      }
      const data = await res.json();
      stopProgress(true);
      setJobResult({
        job_id:        data.job_id,
        slide_count:   data.slide_count ?? data.slides?.length ?? 0,
        preview_count: data.preview_count ?? 0,
        slides:        data.slides ?? [],
      });
      setStage("done");
      setStep(3);
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") {
        stopProgress(false);
        setProgress(0);
        setStage("idle");
        return;
      }
      stopProgress(false);
      setErrMsg(e instanceof Error ? e.message : String(e));
      setStage("error");
    }
  }, [selectedTplId, contentFile, enableIcons, enableDalle, enableNanobanana, nanobananaModel, parsedPages, selectedLogoId, logoFile, startProgress, stopProgress]);

  /* ── 下载 / 重置 ── */
  const handleDownload = useCallback(() => {
    if (!jobResult) return;
    window.open(`${API_BASE}/api/jobs/${jobResult.job_id}/download`, "_blank");
  }, [jobResult]);

  const handleReset = useCallback(() => {
    setStep(1); setStage("idle"); setErrMsg(""); setJobResult(null);
    setContentFile(null); setParsedPages([]); setAiUsed(false);
    handleLogoClear();
    if (contentRef.current) contentRef.current.value = "";
  }, [handleLogoClear]);

  const step2Enabled = !!selectedTplId && !!tplAnalysis;
  const step3Enabled = stage === "done";

  return (
    <div className="flex flex-col h-screen bg-[#0e0e0e] text-white overflow-hidden relative">
      <div className="ambient-bg" />

      {/* ── Header ──────────────────────────────────────────────── */}
      <header className="shrink-0 h-14 flex items-center justify-between px-6
        bg-[#1a1919]/70 glass border-b border-white/[0.06]
        shadow-[0_4px_24px_rgba(0,0,0,0.6)] z-40">

        <div className="flex items-center gap-6">
          <span className="text-base font-black text-[#cafd00] tracking-widest uppercase select-none">
            PPT Studio
          </span>
          {/* 步骤导航 */}
          <nav className="flex items-center">
            {([
              [1, "选择模板"],
              [2, "上传内容"],
              [3, "预览编辑"],
            ] as [Step, string][]).map(([n, label], i) => {
              const isActive = step === n;
              const canClick =
                n === 1 ||
                (n === 2 && step2Enabled) ||
                (n === 3 && step3Enabled);
              return (
                <button
                  key={n}
                  onClick={() => {
                    if (canClick) setStep(n);
                  }}
                  disabled={!canClick}
                  className={`
                    flex items-center gap-2 px-4 py-1.5 text-xs font-bold rounded-lg transition-all
                    ${isActive
                      ? "bg-[#cafd00]/10 text-[#cafd00] border border-[#cafd00]/30"
                      : canClick
                        ? "text-[#adaaaa] hover:text-white hover:bg-white/5"
                        : "text-white/20 cursor-not-allowed"
                    }
                  `}
                >
                  <span className={`
                    w-5 h-5 rounded-full text-[10px] font-black flex items-center justify-center shrink-0
                    ${isActive ? "bg-[#cafd00] text-[#516700]" : canClick ? "bg-white/10 text-white/60" : "bg-white/5 text-white/20"}
                  `}>{n}</span>
                  {label}
                  {i < 2 && <span className="ml-2 text-white/15">›</span>}
                </button>
              );
            })}
          </nav>
        </div>

        {/* 右侧操作 */}
        <div className="flex items-center gap-3">
          {step === 3 && jobResult && (
            <button
              onClick={handleDownload}
              className="flex items-center gap-2 px-5 py-1.5 text-xs font-bold
                bg-gradient-to-r from-[#f3ffca] to-[#cafd00] text-[#516700]
                rounded-xl glow-primary hover:brightness-110 active:scale-95 transition-all"
            >
              <span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: "'FILL' 1" }}>download</span>
              导出 PPT
            </button>
          )}
          {step === 3 && (
            <button
              onClick={handleReset}
              className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-bold
                text-[#adaaaa] hover:text-white hover:bg-white/5 rounded-xl transition-all"
            >
              <span className="material-symbols-outlined text-sm">restart_alt</span>
              重新开始
            </button>
          )}
        </div>
      </header>

      {/* ── Main content ────────────────────────────────────────── */}
      <main className={`flex-1 min-h-0 ${step === 3 ? "overflow-hidden" : "overflow-y-auto"}`}>

        {/* Step 1 — 选择模板 */}
        {step === 1 && (
          <div className="max-w-5xl mx-auto px-6 py-8 space-y-6">
            <SectionTitle
              icon="dashboard"
              title="选择模板"
              desc="从模板库中选择样式"
            />
            {!templatesLoaded ? (
              <div className="flex justify-center py-16">
                <LCSpinner />
              </div>
            ) : (
              <TemplatePicker
                templates={templates}
                selected={selectedTplId}
                onSelect={setSelectedTplId}
              />
            )}
            <div className="flex justify-end pt-2">
              <LCButton
                onClick={() => setStep(2)}
                disabled={!step2Enabled}
                icon="arrow_forward"
                variant="primary"
              >
                下一步：上传内容
              </LCButton>
            </div>
          </div>
        )}

        {/* Step 2 — 上传内容 */}
        {step === 2 && (
          <div className={`mx-auto px-6 py-8 space-y-5 ${stage === "parsed" || stage === "generating" ? "max-w-6xl" : "max-w-2xl"}`}>
            {stage !== "parsed" && stage !== "generating" && (
              <>
                <SectionTitle
                  icon="upload_file"
                  title="上传内容 PPT"
                  desc="上传只含文字的内容 PPT，AI 将自动分析文字角色并套用模板样式"
                />

                {/* 已选模板条 */}
                <SelectedTemplateBar
                  template={templates.find(t => t.id === selectedTplId) ?? null}
                  onChange={() => setStep(1)}
                />

                {/* 内容上传区 */}
                <ContentUploadZone
                  ref={contentRef}
                  file={contentFile}
                  onSelect={(f) => {
                    setContentFile(f);
                    setParsedPages([]);
                    if (stage === "error") setStage("idle");
                  }}
                />

                {/* Logo 上传 + 已保存 Logo 库 */}
                <div className="frosted rounded-2xl px-5 py-4 space-y-3">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="material-symbols-outlined text-sm text-[#cafd00]">branding_watermark</span>
                    <p className="text-[11px] font-bold text-[#adaaaa] uppercase tracking-widest">品牌 Logo（可选）</p>
                  </div>
                  <p className="text-[10px] text-[#adaaaa]/60">上传 PNG 格式的品牌 Logo，将自动置入每页幻灯片顶部。已上传的 Logo 会一直保存，可随时选用。</p>

                  {/* 已保存 Logo 网格 */}
                  {savedLogos.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {savedLogos.map(logo => (
                        <div
                          key={logo.id}
                          className={`group relative h-12 px-3 rounded-lg flex items-center justify-center cursor-pointer transition-all ${
                            selectedLogoId === logo.id
                              ? "bg-[#cafd00]/15 ring-2 ring-[#cafd00] shadow-[0_0_8px_rgba(202,253,0,0.2)]"
                              : "bg-white/5 ghost-border hover:bg-white/10"
                          }`}
                          onClick={() => handleLogoPickSaved(logo)}
                          title={logo.name}
                        >
                          <img
                            src={`${API_BASE}${logo.url}`}
                            alt={logo.name}
                            className="max-h-8 max-w-[100px] object-contain"
                          />
                          {!logo.public && (
                            <button
                              className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-red-600 hover:bg-red-500
                                text-white text-[9px] items-center justify-center shadow hidden group-hover:flex transition-colors"
                              onClick={(e) => { e.stopPropagation(); handleLogoDeleteSaved(logo.id); }}
                              title="删除此 Logo"
                            >
                              ✕
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* 当前选择状态 + 取消 */}
                  {logoPreview && (
                    <div className="flex items-center gap-3">
                      <div className="h-10 px-3 rounded-lg bg-[#cafd00]/10 border border-[#cafd00]/30 flex items-center justify-center">
                        <img src={logoPreview} alt="Logo" className="max-h-8 max-w-[120px] object-contain" />
                      </div>
                      <span className="text-xs text-[#cafd00]/80 truncate flex-1">已选: {logoFile?.name ?? "Logo"}</span>
                      <button
                        onClick={handleLogoClear}
                        className="text-xs text-[#ff7351] hover:text-[#ff7351]/80 transition-colors shrink-0"
                      >
                        取消选择
                      </button>
                    </div>
                  )}

                  {/* 上传新 Logo */}
                  <label className="flex items-center gap-3 px-4 py-2.5 rounded-xl border border-dashed border-white/10 hover:border-[#cafd00]/40 hover:bg-[#cafd00]/5 cursor-pointer transition-all">
                    <span className="material-symbols-outlined text-base text-[#adaaaa]">add_photo_alternate</span>
                    <span className="text-xs text-[#adaaaa]">上传新 Logo（PNG）</span>
                    <input
                      ref={logoRef}
                      type="file"
                      accept="image/png"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) handleLogoSelect(f);
                      }}
                    />
                  </label>
                </div>

                {/* AI 配图选项 */}
                <div className="frosted rounded-2xl px-5 py-4 space-y-3">
                  <p className="text-[11px] font-bold text-[#adaaaa] uppercase tracking-widest mb-1">视觉增强选项</p>

                  <div className="flex items-start gap-3 py-1">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                      style={{ background: "rgba(124,255,103,0.12)", border: "1px solid rgba(124,255,103,0.25)" }}>
                      <span className="material-symbols-outlined text-sm" style={{ color: "#7cff67" }}>auto_awesome</span>
                    </div>
                    <div className="min-w-0">
                      <p className="text-[12px] font-bold text-white/80">自动添加装饰图形 <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full ml-1" style={{ background: "rgba(124,255,103,0.15)", color: "#7cff67" }}>自动</span></p>
                      <p className="text-[10px] text-[#adaaaa]/60 mt-0.5">根据文字内容自动添加强调线、序号徽章、数字高亮框等装饰</p>
                    </div>
                  </div>

                  <div className="w-full h-px bg-white/[0.05]" />

                  <LCToggle
                    checked={enableIcons}
                    onChange={() => setEnableIcons(v => !v)}
                    label="为每页幻灯片配 Icon"
                    desc="从 Iconify 图标库（20万+）自动匹配关键词图标"
                    color="#cafd00"
                  />
                  {enableIcons && (
                    <div className="ml-4 pl-4 border-l-2 border-[#cafd00]/20 py-1 bg-white/[0.02] rounded-r-lg">
                      <LCToggle
                        checked={enableDalle}
                        onChange={() => setEnableDalle(v => !v)}
                        label="无匹配时用 DALL-E 生成"
                        desc="需要 OpenAI API Key，每张额外消耗 token"
                        color="#a78bfa"
                        compact
                      />
                    </div>
                  )}

                  <div className="w-full h-px bg-white/[0.05]" />

                  <LCToggle
                    checked={enableNanobanana}
                    onChange={() => setEnableNanobanana(v => !v)}
                    label="AI 配图"
                    desc="为每页生成 AI 插画装饰（需要网络，每页约 10-60 秒）"
                    color="#ff9f43"
                  />
                  {enableNanobanana && (
                    <div className="ml-4 pl-4 border-l-2 border-[#ff9f43]/20 py-2 bg-white/[0.02] rounded-r-lg">
                      <label className="text-xs text-[#adaaaa] mb-1 block">图片模型</label>
                      <select
                        value={nanobananaModel}
                        onChange={e => setNanobananaModel(e.target.value)}
                        className="w-full bg-white/[0.06] border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white/90 focus:outline-none focus:border-[#ff9f43]/50 transition-colors"
                      >
                        <option value="dall-e-3">DALL-E 3</option>
                        <option value="flux-pro">Flux Pro</option>
                        <option value="flux-schnell">Flux Schnell (快速)</option>
                        <option value="gpt-image-1">GPT Image 1</option>
                        <option value="midjourney">Midjourney</option>
                        <option value="flux-pro-1.1-ultra">Flux Pro Ultra</option>
                      </select>
                    </div>
                  )}
                </div>
              </>
            )}

            {/* 错误提示 */}
            {stage === "error" && errMsg && (
              <div className="flex items-start gap-3 bg-[#ff7351]/10 border border-[#ff7351]/30 rounded-xl px-4 py-3 text-sm text-[#ff7351]">
                <span className="material-symbols-outlined text-base shrink-0">error</span>
                <span><span className="font-bold">失败：</span>{errMsg}</span>
              </div>
            )}

            {/* 进度条 — 解析中或生成中 */}
            {(stage === "parsing" || stage === "generating") && (
              <div className="space-y-2 pt-1">
                <div className="flex items-center justify-between text-xs text-[#adaaaa]">
                  <span>{progressLabel}</span>
                  <span className="font-mono font-bold text-[#cafd00]">{progress}%</span>
                </div>
                <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-300 ease-out"
                    style={{
                      width: `${progress}%`,
                      background: "linear-gradient(90deg, #cafd00, #f3ffca)",
                      boxShadow: "0 0 8px rgba(202,253,0,0.5)",
                    }}
                  />
                </div>
                <div className="flex items-center justify-center gap-3">
                  <p className="text-[11px] text-[#adaaaa]/60">
                    {stage === "parsing"
                      ? "正在使用 AI 大模型分析内容结构，请稍候…"
                      : "正在生成 PPT 并渲染预览，请稍候…"}
                  </p>
                  <button
                    onClick={handleCancelTask}
                    className="text-[11px] text-red-400/70 hover:text-red-300 transition-colors px-2 py-0.5 rounded border border-red-400/20 hover:border-red-400/40 hover:bg-red-400/5"
                  >
                    取消
                  </button>
                </div>
              </div>
            )}

            {/* 解析结果预览 */}
            {(stage === "parsed" || stage === "generating") && parsedPages.length > 0 && (
              <div className="frosted rounded-2xl px-6 py-5 space-y-4">
                {aiUsed && (
                  <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-[#cafd00]/[0.06] border border-[#cafd00]/15">
                    <span className="material-symbols-outlined text-[#cafd00]/70 text-base" style={{ fontVariationSettings: "'FILL' 1" }}>
                      smart_toy
                    </span>
                    <span className="text-[11px] text-[#cafd00]/60 font-medium">
                      已使用 AI 大模型辅助分析（GPT-4o）
                    </span>
                  </div>
                )}
                <ParsePreview
                  pages={parsedPages}
                  onChange={setParsedPages}
                />
              </div>
            )}

            <div className="flex justify-between pt-1">
              <LCButton
                onClick={() => {
                  if (stage === "parsed" || stage === "generating") {
                    setParsedPages([]);
                    setStage("idle");
                  } else {
                    setStep(1);
                  }
                }}
                variant="ghost"
                icon="arrow_back"
                disabled={stage === "generating"}
              >
                {stage === "parsed" || stage === "generating" ? "重新上传" : "返回选择模板"}
              </LCButton>

              {stage === "parsed" || stage === "generating" ? (
                <div className="flex items-center gap-3">
                  <LCButton
                    onClick={() => { setParsedPages([]); handleParse(); }}
                    variant="ghost"
                    icon="refresh"
                    disabled={stage === "generating"}
                  >
                    重新解析
                  </LCButton>
                  <LCButton
                    onClick={handleConfirmGenerate}
                    disabled={!selectedTplId || stage === "generating"}
                    variant="primary"
                    icon={stage === "generating" ? undefined : "bolt"}
                    loading={stage === "generating"}
                  >
                    {stage === "generating" ? generateLabel : "确认生成"}
                  </LCButton>
                </div>
              ) : (
                <LCButton
                  onClick={handleParse}
                  disabled={!contentFile || stage === "parsing"}
                  variant="primary"
                  icon={stage === "parsing" ? undefined : "psychology"}
                  loading={stage === "parsing"}
                >
                  {stage === "parsing" ? parseLabel : "解析内容"}
                </LCButton>
              )}
            </div>
          </div>
        )}

        {/* Step 3 — 预览编辑 */}
        {step === 3 && jobResult && (
          <PreviewGrid
            jobId={jobResult.job_id}
            slides={jobResult.slides}
            previewCount={jobResult.preview_count}
            onDownload={handleDownload}
            onReset={handleReset}
          />
        )}
      </main>

      {/* ── Footer ──────────────────────────────────────────────── */}
      <footer className="shrink-0 h-9 flex items-center justify-between px-5
        bg-[#0a0a0a] border-t border-white/[0.05] z-40">
        <span className="text-[10px] text-[#adaaaa]/50">PPT Studio v2.0</span>
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-[#cafd00] lc-pulse-dot" />
          <span className="text-[9px] text-[#adaaaa]/40 uppercase tracking-widest">系统在线</span>
        </div>
      </footer>
    </div>
  );
}


/* ── Sub-components ───────────────────────────────────────────── */

function SectionTitle({ icon, title, desc }: { icon?: string; title: string; desc: string }) {
  return (
    <div className="flex items-start gap-4">
      {icon && (
        <div className="frosted w-10 h-10 rounded-xl flex items-center justify-center shrink-0 mt-0.5">
          <span className="material-symbols-outlined text-[#cafd00] text-xl"
            style={{ fontVariationSettings: "'FILL' 1" }}>{icon}</span>
        </div>
      )}
      <div>
        <h2 className="text-base font-black text-white tracking-tight">{title}</h2>
        <p className="text-xs text-[#adaaaa] mt-0.5">{desc}</p>
      </div>
    </div>
  );
}

function LCButton({
  children, onClick, disabled, variant = "ghost", icon, loading,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  variant?: "primary" | "ghost" | "danger";
  icon?: string;
  loading?: boolean;
}) {
  const base = "flex items-center gap-2 px-5 py-2.5 text-xs font-bold rounded-xl transition-all active:scale-95 select-none";
  const variants = {
    primary: disabled
      ? "bg-white/5 text-white/20 cursor-not-allowed"
      : "bg-gradient-to-r from-[#f3ffca] to-[#cafd00] text-[#516700] glow-primary hover:brightness-110",
    ghost: "text-[#adaaaa] hover:text-white hover:bg-white/5 border border-white/[0.06]",
    danger: "text-[#ff7351] hover:bg-[#ff7351]/10 border border-[#ff7351]/20",
  };
  return (
    <button onClick={onClick} disabled={disabled || loading} className={`${base} ${variants[variant]}`}>
      {loading ? (
        <span className="w-3.5 h-3.5 border-2 border-current/40 border-t-current rounded-full lc-spin" />
      ) : icon ? (
        <span className="material-symbols-outlined text-base leading-none"
          style={{ fontVariationSettings: "'FILL' 1" }}>{icon}</span>
      ) : null}
      {children}
    </button>
  );
}

function LCToggle({
  checked, onChange, label, desc, color = "#cafd00", compact = false,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
  desc: string;
  color?: string;
  compact?: boolean;
}) {
  const trackW = compact ? "w-8" : "w-9";
  const trackH = compact ? "h-[18px]" : "h-5";
  const dotSize = compact ? "w-3.5 h-3.5" : "w-4 h-4";
  const dotOn = compact ? "translateX(14px)" : "translateX(16px)";
  return (
    <label className="flex items-center gap-3 cursor-pointer group">
      <div
        onClick={onChange}
        className={`flex items-center ${trackW} ${trackH} rounded-full transition-all shrink-0 ghost-border`}
        style={{ background: checked ? color + "33" : "rgba(255,255,255,0.05)" }}
      >
        <div
          className={`${dotSize} rounded-full shadow transition-all duration-200`}
          style={{
            background: checked ? color : "#555",
            transform: checked ? dotOn : "translateX(2px)",
            boxShadow: checked ? `0 0 8px ${color}88` : "none",
          }}
        />
      </div>
      <div>
        <p className={`${compact ? "text-[11px]" : "text-xs"} font-semibold text-white/80`}>{label}</p>
        <p className={`${compact ? "text-[9px]" : "text-[10px]"} text-[#adaaaa]/60`}>{desc}</p>
      </div>
    </label>
  );
}

/* eslint-disable @typescript-eslint/no-explicit-any */

const TPL_ROLE_META: Record<string, { label: string; color: string }> = {
  page_title:  { label: "页面主标题", color: "#cafd00" },
  block_title: { label: "模块标题",   color: "#7cff67" },
  block_desc:  { label: "模块说明",   color: "#5def8f" },
  paragraph:   { label: "正文",       color: "#adaaaa" },
  data:        { label: "数据类",     color: "#a78bfa" },
};

function _gradientCSS(stops: any[], angle?: number): string {
  if (!stops || stops.length === 0) return "transparent";
  const deg = angle ?? 90;
  const parts = stops.map((s: any) => `${s.color} ${s.pos}%`).join(", ");
  return `linear-gradient(${deg}deg, ${parts})`;
}

function TemplateAnalysisPanel({
  analysis, loading, onChange, onReparse,
}: {
  analysis: Record<string, any> | null;
  loading: boolean;
  onChange?: (updated: Record<string, any>) => void;
  onReparse?: () => void;
}) {
  const [open, setOpen] = useState(true);
  const [activePage, setActivePage] = useState(0);
  const [pickerTarget, setPickerTarget] = useState<{
    kind: "role_color" | "role_grad_stop" | "text_color" | "text_grad_stop";
    role?: string;
    pageIdx?: number;
    textIdx?: number;
    stopIdx?: number;
  } | null>(null);
  const pickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setPickerTarget(null);
      }
    };
    if (pickerTarget) document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [pickerTarget]);

  if (loading) {
    return (
      <div className="frosted rounded-2xl px-5 py-4 flex items-center gap-3 text-sm text-[#adaaaa]">
        <span className="material-symbols-outlined animate-spin text-base text-[#cafd00]">progress_activity</span>
        正在解析模板样式…
      </div>
    );
  }
  if (!analysis) return null;

  const style = analysis.style ?? analysis;
  const slides: any[] = analysis.slides ?? [];
  const rolesStyle: Record<string, any> = analysis.roles_style ?? {};
  const bg = style.background ?? {};
  const activeSlide = slides[activePage];

  const _recalcRolesStyle = (newSlides: any[]) => {
    const allTexts: any[] = [];
    for (const sld of newSlides) {
      for (const t of (sld.texts ?? [])) allTexts.push(t);
    }
    const bucket: Record<string, any> = {};
    for (const t of allTexts) {
      if (!bucket[t.role]) {
        bucket[t.role] = { fonts: {} as Record<string, number>, sizes: {} as Record<number, number>, colors: {} as Record<string, number>, gradient: false, count: 0, grad_sample: null as any };
      }
      const rs = bucket[t.role];
      rs.count++;
      if (t.font) rs.fonts[t.font] = (rs.fonts[t.font] || 0) + 1;
      rs.sizes[t.size_pt] = (rs.sizes[t.size_pt] || 0) + 1;
      if (t.color) rs.colors[t.color] = (rs.colors[t.color] || 0) + 1;
      if (t.gradient) rs.gradient = true;
      if (t.gradient_stops && !rs.grad_sample) rs.grad_sample = t;
    }
    const finalRoles: Record<string, any> = {};
    for (const [role, rs] of Object.entries(bucket) as [string, any][]) {
      const topFont = Object.entries(rs.fonts).sort((a: any, b: any) => b[1] - a[1])[0];
      const topSize = Object.entries(rs.sizes).sort((a: any, b: any) => b[1] - a[1])[0];
      const topColor = Object.entries(rs.colors).sort((a: any, b: any) => b[1] - a[1])[0];
      const obj: any = {
        font: topFont ? topFont[0] : "",
        size_pt: topSize ? Number(topSize[0]) : 0,
        color: topColor ? topColor[0] : null,
        gradient: rs.gradient,
        count: rs.count,
      };
      if (rs.grad_sample) {
        obj.gradient_stops = rs.grad_sample.gradient_stops;
        obj.gradient_angle = rs.grad_sample.gradient_angle ?? 0;
      }
      finalRoles[role] = obj;
    }
    return finalRoles;
  };

  const updateTextRole = (pageIdx: number, textIdx: number, newRole: string) => {
    if (!onChange) return;
    const newSlides = slides.map((sld: any, si: number) => {
      if (si !== pageIdx) return sld;
      const newTexts = sld.texts.map((txt: any, ti: number) =>
        ti === textIdx ? { ...txt, role: newRole } : txt
      );
      return { ...sld, texts: newTexts };
    });
    onChange({ ...analysis, slides: newSlides, roles_style: _recalcRolesStyle(newSlides) });
  };

  const updateRoleColor = (role: string, newColor: string) => {
    if (!onChange) return;
    const newSlides = slides.map((sld: any) => ({
      ...sld,
      texts: sld.texts?.map((t: any) =>
        t.role === role && !t.gradient ? { ...t, color: newColor } : t
      ) ?? [],
    }));
    const newRoles = { ...rolesStyle, [role]: { ...rolesStyle[role], color: newColor } };
    onChange({ ...analysis, slides: newSlides, roles_style: newRoles });
  };

  const updateRoleGradStop = (role: string, stopIdx: number, newColor: string) => {
    if (!onChange) return;
    const rs = rolesStyle[role];
    if (!rs?.gradient_stops) return;
    const newStops = rs.gradient_stops.map((s: any, i: number) =>
      i === stopIdx ? { ...s, color: newColor } : s
    );
    const newSlides = slides.map((sld: any) => ({
      ...sld,
      texts: sld.texts?.map((t: any) => {
        if (t.role !== role || !t.gradient_stops) return t;
        return { ...t, gradient_stops: t.gradient_stops.map((s: any, i: number) => i === stopIdx ? { ...s, color: newColor } : s) };
      }) ?? [],
    }));
    const newRoles = { ...rolesStyle, [role]: { ...rolesStyle[role], gradient_stops: newStops } };
    onChange({ ...analysis, slides: newSlides, roles_style: newRoles });
  };

  const updateTextColor = (pageIdx: number, textIdx: number, newColor: string) => {
    if (!onChange) return;
    const newSlides = slides.map((sld: any, si: number) => {
      if (si !== pageIdx) return sld;
      return { ...sld, texts: sld.texts.map((t: any, ti: number) => ti === textIdx ? { ...t, color: newColor } : t) };
    });
    onChange({ ...analysis, slides: newSlides, roles_style: _recalcRolesStyle(newSlides) });
  };

  const updateTextGradStop = (pageIdx: number, textIdx: number, stopIdx: number, newColor: string) => {
    if (!onChange) return;
    const newSlides = slides.map((sld: any, si: number) => {
      if (si !== pageIdx) return sld;
      return {
        ...sld,
        texts: sld.texts.map((t: any, ti: number) => {
          if (ti !== textIdx || !t.gradient_stops) return t;
          return { ...t, gradient_stops: t.gradient_stops.map((s: any, i: number) => i === stopIdx ? { ...s, color: newColor } : s) };
        }),
      };
    });
    onChange({ ...analysis, slides: newSlides, roles_style: _recalcRolesStyle(newSlides) });
  };

  const isPickerOpen = (kind: string, opts: Record<string, any>) => {
    if (!pickerTarget || pickerTarget.kind !== kind) return false;
    return Object.entries(opts).every(([k, v]) => (pickerTarget as any)[k] === v);
  };

  const ColorSwatch = ({ color, onClick }: { color: string; onClick?: () => void }) => (
    <span
      onClick={onClick}
      className={`inline-block w-4 h-4 rounded shrink-0 ${onClick ? "cursor-pointer hover:ring-2 hover:ring-[#cafd00]/50 transition-all" : ""}`}
      style={{ background: color, border: "1px solid rgba(255,255,255,0.2)" }}
    />
  );

  const GradientSwatch = ({ stops, angle, onClickStop }: { stops: any[]; angle?: number; onClickStop?: (idx: number) => void }) => (
    <span className="inline-flex items-center gap-0.5 shrink-0">
      <span
        className="inline-block w-12 h-4 rounded shrink-0"
        style={{ background: _gradientCSS(stops, angle), border: "1px solid rgba(255,255,255,0.2)" }}
      />
      {onClickStop && stops.map((s: any, i: number) => (
        <span
          key={i}
          onClick={() => onClickStop(i)}
          className="inline-block w-3.5 h-3.5 rounded-full cursor-pointer hover:ring-2 hover:ring-[#cafd00]/50 transition-all"
          style={{ background: s.color, border: "1px solid rgba(255,255,255,0.3)" }}
          title={`${s.color} @ ${s.pos}%`}
        />
      ))}
    </span>
  );

  const renderPicker = () => {
    if (!pickerTarget) return null;
    let currentColor = "#ffffff";
    let onChangeColor: (hex: string) => void = () => {};
    if (pickerTarget.kind === "role_color" && pickerTarget.role) {
      currentColor = rolesStyle[pickerTarget.role]?.color ?? "#ffffff";
      onChangeColor = (hex) => updateRoleColor(pickerTarget.role!, hex);
    } else if (pickerTarget.kind === "role_grad_stop" && pickerTarget.role != null && pickerTarget.stopIdx != null) {
      const stops = rolesStyle[pickerTarget.role]?.gradient_stops;
      currentColor = stops?.[pickerTarget.stopIdx]?.color ?? "#ffffff";
      onChangeColor = (hex) => updateRoleGradStop(pickerTarget.role!, pickerTarget.stopIdx!, hex);
    } else if (pickerTarget.kind === "text_color" && pickerTarget.pageIdx != null && pickerTarget.textIdx != null) {
      currentColor = slides[pickerTarget.pageIdx]?.texts?.[pickerTarget.textIdx]?.color ?? "#ffffff";
      onChangeColor = (hex) => updateTextColor(pickerTarget.pageIdx!, pickerTarget.textIdx!, hex);
    } else if (pickerTarget.kind === "text_grad_stop" && pickerTarget.pageIdx != null && pickerTarget.textIdx != null && pickerTarget.stopIdx != null) {
      const t = slides[pickerTarget.pageIdx]?.texts?.[pickerTarget.textIdx];
      currentColor = t?.gradient_stops?.[pickerTarget.stopIdx]?.color ?? "#ffffff";
      onChangeColor = (hex) => updateTextGradStop(pickerTarget.pageIdx!, pickerTarget.textIdx!, pickerTarget.stopIdx!, hex);
    }
    return (
      <div ref={pickerRef} className="absolute z-[100] mt-1" style={{ right: 0 }}>
        <Sketch
          color={currentColor}
          onChange={(c) => onChangeColor(c.hex)}
          style={{ background: "#1a1919" }}
        />
      </div>
    );
  };

  return (
    <div className="frosted rounded-2xl overflow-hidden">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-2 px-5 py-3 text-left hover:bg-white/[0.03] transition-colors"
      >
        <span className="material-symbols-outlined text-base text-[#cafd00]">palette</span>
        <span className="text-[11px] font-bold text-[#adaaaa] uppercase tracking-widest flex-1">
          模板文字分类解析
          {slides.length > 0 && <span className="ml-2 text-white/40">{slides.length} 页</span>}
        </span>
        {onReparse && (
          <span
            onClick={(e) => { e.stopPropagation(); onReparse(); }}
            className="text-[10px] text-white/30 hover:text-[#cafd00] cursor-pointer transition-colors flex items-center gap-0.5 mr-2"
            title="丢弃调整，重新解析模板"
          >
            <span className="material-symbols-outlined text-xs">refresh</span>
            重新解析
          </span>
        )}
        <span className="material-symbols-outlined text-sm text-[#adaaaa] transition-transform" style={{ transform: open ? "rotate(180deg)" : "rotate(0)" }}>
          expand_more
        </span>
      </button>

      {open && (
        <div className="px-5 pb-4 space-y-4">
          {/* 按角色汇总样式 */}
          <div className="space-y-1.5">
            {Object.entries(TPL_ROLE_META).map(([key, meta]) => {
              const rs = rolesStyle[key];
              if (!rs) return null;
              const hasGradStops = rs.gradient && rs.gradient_stops?.length > 0;
              return (
                <div key={key} className="relative flex items-center gap-2 text-[11px] py-1.5 px-2.5 rounded-lg bg-white/[0.02]">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ background: meta.color }} />
                  <span className="font-bold w-16 shrink-0" style={{ color: meta.color }}>{meta.label}</span>
                  <span className="text-white/50">{rs.font}</span>
                  <span className="text-white/50">·</span>
                  <span className="text-white/50">{rs.size_pt}pt</span>
                  <span className="text-white/50">·</span>
                  {hasGradStops ? (
                    <GradientSwatch
                      stops={rs.gradient_stops}
                      angle={rs.gradient_angle}
                      onClickStop={(idx) => setPickerTarget({ kind: "role_grad_stop", role: key, stopIdx: idx })}
                    />
                  ) : rs.gradient ? (
                    <span className="text-white/50 text-[10px] px-1.5 py-0.5 rounded bg-white/5">渐变</span>
                  ) : rs.color ? (
                    <ColorSwatch
                      color={rs.color}
                      onClick={() => setPickerTarget({ kind: "role_color", role: key })}
                    />
                  ) : null}
                  <span className="text-white/20 ml-auto">{rs.count} 处</span>
                  {(isPickerOpen("role_color", { role: key }) || isPickerOpen("role_grad_stop", { role: key })) && renderPicker()}
                </div>
              );
            })}
          </div>

          <div className="flex items-center gap-1.5 text-[11px] text-white/40">
            <ColorSwatch color={bg.color ?? "#000"} />
            背景 {bg.color} {bg.is_dark ? "(深色)" : "(浅色)"}
            {style.accent_color && (
              <><span className="mx-1">|</span><ColorSwatch color={style.accent_color} />强调色</>
            )}
          </div>

          {/* 页面切换标签 */}
          {slides.length > 0 && (
            <>
              <div className="w-full h-px bg-white/[0.05]" />
              <div className="flex flex-wrap gap-1.5">
                {slides.map((sld: any, i: number) => {
                  const hasText = sld.texts?.length > 0;
                  return (
                    <button
                      key={i}
                      onClick={() => setActivePage(i)}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all ${
                        i === activePage
                          ? "bg-[#cafd00]/20 text-[#cafd00] border border-[#cafd00]/40"
                          : hasText
                            ? "bg-white/5 text-white/60 hover:bg-white/10"
                            : "bg-white/[0.02] text-white/20"
                      }`}
                    >
                      第 {i + 1} 页
                    </button>
                  );
                })}
              </div>

              {/* 当前页文字列表 */}
              {activeSlide && (
                <div className="space-y-2">
                  {activeSlide.texts?.length > 0 ? (
                    activeSlide.texts.map((item: any, ti: number) => {
                      const meta = TPL_ROLE_META[item.role] ?? TPL_ROLE_META.paragraph;
                      const itemHasGradStops = item.gradient && item.gradient_stops?.length > 0;
                      return (
                        <div key={ti} className="relative flex items-start gap-2 py-1.5 px-3 rounded-lg bg-white/[0.03]">
                          <select
                            value={item.role}
                            onChange={(e) => updateTextRole(activePage, ti, e.target.value)}
                            className="shrink-0 text-[10px] font-bold px-2 py-1 rounded mt-0.5 appearance-none cursor-pointer
                              bg-transparent border outline-none transition-colors"
                            style={{
                              background: `${meta.color}22`,
                              color: meta.color,
                              borderColor: `${meta.color}44`,
                            }}
                          >
                            {Object.entries(TPL_ROLE_META).map(([key, m]) => (
                              <option key={key} value={key} style={{ background: "#1a1919", color: m.color }}>
                                {m.label}
                              </option>
                            ))}
                          </select>
                          <div className="flex-1 min-w-0">
                            <p className="text-[12px] text-white/80 break-all leading-relaxed">{item.text}</p>
                            <p className="text-[10px] text-white/30 mt-0.5 flex items-center gap-1 flex-wrap">
                              {item.font} · {item.size_pt}pt
                              {itemHasGradStops ? (
                                <>
                                  <span>·</span>
                                  <GradientSwatch
                                    stops={item.gradient_stops}
                                    angle={item.gradient_angle}
                                    onClickStop={(idx) => setPickerTarget({ kind: "text_grad_stop", pageIdx: activePage, textIdx: ti, stopIdx: idx })}
                                  />
                                </>
                              ) : item.gradient ? (
                                <span> · 渐变</span>
                              ) : item.color ? (
                                <>
                                  <span>·</span>
                                  <ColorSwatch
                                    color={item.color}
                                    onClick={() => setPickerTarget({ kind: "text_color", pageIdx: activePage, textIdx: ti })}
                                  />
                                </>
                              ) : null}
                            </p>
                          </div>
                          {(isPickerOpen("text_color", { pageIdx: activePage, textIdx: ti }) ||
                            isPickerOpen("text_grad_stop", { pageIdx: activePage, textIdx: ti })) && renderPicker()}
                        </div>
                      );
                    })
                  ) : (
                    <p className="text-[11px] text-white/30 text-center py-3">此页无文字内容</p>
                  )}
                </div>
              )}
            </>
          )}

          {/* 角色图例 */}
          <div className="flex items-center gap-3 pt-1 text-[10px] text-white/40">
            <span>角色说明：</span>
            {Object.entries(TPL_ROLE_META).map(([key, m]) => (
              <span key={key} className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full" style={{ background: m.color }} />
                {m.label}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
/* eslint-enable @typescript-eslint/no-explicit-any */

function SelectedTemplateBar({
  template, onChange,
}: {
  template: TemplateItem | null;
  onChange: () => void;
}) {
  if (!template) return null;
  const thumbUrl = template.thumbnail_url ? `${API_BASE}${template.thumbnail_url}` : null;
  return (
    <div className="flex items-center gap-3 frosted rounded-xl px-4 py-3">
      {thumbUrl && (
        <img src={thumbUrl} alt="" className="w-14 h-8 object-cover rounded-lg shrink-0 ghost-border" />
      )}
      <div className="flex-1 min-w-0">
        <p className="text-[10px] font-bold text-[#cafd00]/80 uppercase tracking-widest">已选模板</p>
        <p className="text-sm font-semibold text-white truncate mt-0.5">{template.name}</p>
      </div>
      <button
        onClick={onChange}
        className="text-xs text-[#adaaaa] hover:text-[#cafd00] transition-colors shrink-0 underline decoration-dotted"
      >
        更换
      </button>
    </div>
  );
}

interface ContentUploadZoneProps {
  file: File | null;
  onSelect: (f: File) => void;
}

const ContentUploadZone = forwardRef<HTMLInputElement, ContentUploadZoneProps>(
  ({ file, onSelect }, ref) => {
    const [dragOver, setDragOver] = useState(false);

    return (
      <label
        className={`
          flex flex-col items-center justify-center gap-4 p-10 rounded-2xl border-2 border-dashed cursor-pointer transition-all
          ${file
            ? "border-[#cafd00]/40 bg-[#cafd00]/5"
            : dragOver
              ? "border-[#cafd00]/60 bg-[#cafd00]/8"
              : "border-white/10 bg-white/[0.02] hover:border-white/20 hover:bg-white/5"
          }
        `}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const f = e.dataTransfer.files[0];
          if (f) onSelect(f);
        }}
      >
        <input
          ref={ref}
          type="file"
          accept=".pptx,.ppt,.key"
          className="sr-only"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) onSelect(f); }}
        />
        {file ? (
          <>
            <div className="frosted w-14 h-14 rounded-2xl flex items-center justify-center">
              <span className="material-symbols-outlined text-3xl text-[#cafd00]"
                style={{ fontVariationSettings: "'FILL' 1" }}>attach_file</span>
            </div>
            <div className="text-center">
              <p className="text-sm font-bold text-white">{file.name}</p>
              <p className="text-xs text-[#adaaaa] mt-1">
                {(file.size / 1024 / 1024).toFixed(1)} MB · 点击重新选择
              </p>
            </div>
          </>
        ) : (
          <>
            <div className="frosted w-14 h-14 rounded-2xl flex items-center justify-center">
              <span className="material-symbols-outlined text-3xl text-[#adaaaa]">upload</span>
            </div>
            <div className="text-center">
              <p className="text-sm font-semibold text-white/80">点击或拖拽内容 PPT</p>
              <p className="text-xs text-[#adaaaa]/60 mt-1">支持 .pptx / .ppt / .key · 最大 500MB</p>
            </div>
          </>
        )}
      </label>
    );
  }
);
ContentUploadZone.displayName = "ContentUploadZone";

function LCSpinner() {
  return (
    <div className="flex flex-col items-center gap-3">
      <div className="w-10 h-10 rounded-full border-2 border-white/10 border-t-[#cafd00] lc-spin" />
      <span className="text-xs text-[#adaaaa]">加载中…</span>
    </div>
  );
}
