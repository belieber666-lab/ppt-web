"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Sketch from "@uiw/react-color-sketch";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "/api-backend";

function authFetch(url: string, init?: RequestInit): Promise<Response> {
  const token = typeof window !== "undefined" ? localStorage.getItem("ppt_token") : null;
  if (!token) return fetch(url, init);
  const headers = new Headers(init?.headers);
  if (!headers.has("Authorization")) headers.set("Authorization", `Bearer ${token}`);
  return fetch(url, { ...init, headers });
}

export interface SlideItem {
  index: number;
  title: string;
  subtitle: string;
  body_paragraphs: { text: string; level: number; role?: string }[];
  preview_url: string;
  total_text_length?: number;
  // AI 结构标注
  page_type?: string;
  block_structure?: string;
  page_type_hint?: string;
  block_type?: string;
  block_titles?: string[];
}

/** AI page_type → 中文简称 + 颜色 */
const PAGE_TYPE_LABELS: Record<string, { label: string; color: string }> = {
  cover:              { label: "封面",   color: "#7c67ff" },
  value_proposition:  { label: "价值",   color: "#5b8cff" },
  feature_list:       { label: "功能",   color: "#67b7ff" },
  process:            { label: "流程",   color: "#67ffd4" },
  problem:            { label: "问题",   color: "#ff8c67" },
  data_result:        { label: "数据",   color: "#7cff67" },
  conclusion:         { label: "总结",   color: "#cafd00" },
};

interface GradientStop {
  color: string;
  pos: number; // 0–100
}

interface FontGradient {
  angle: number;
  stops: GradientStop[];
}

interface ShapeElement {
  id: string;
  name: string;
  text: string;
  type?: "text" | "image" | "card";
  imageData?: string | null;
  _deleted?: boolean;
  xPct: number;
  yPct: number;
  wPct: number;
  hPct: number;
  fontSize: number;
  fontColor: string;
  fontFamily: string;
  fontWeight: number;
  fontItalic: boolean;
  fontUnderline: boolean;
  fontStrikethrough: boolean;
  textAlign: "left" | "center" | "right";
  fontGradient?: FontGradient | null;
  fillColor?: string | null;
  fillOpacity?: number;
  borderColor?: string | null;
  borderWidth?: number;
  borderOpacity?: number;
  borderRadius?: number;
}

type AlignType = "left" | "right" | "centerH" | "top" | "bottom" | "middleV" | "distH" | "distV";

interface Props {
  jobId: string;
  slides: SlideItem[];
  previewCount: number;
  onDownload: () => void;
  onReset: () => void;
}

export function PreviewGrid({ jobId, slides: initialSlides, previewCount: initialPreviewCount, onDownload, onReset }: Props) {
  const [slides, setSlides] = useState(initialSlides);
  const [previewCount, setPreviewCount] = useState(initialPreviewCount);
  const [activeIdx, setActiveIdx] = useState(0);
  const [previewVer, setPreviewVer] = useState(0);
  const [elements, setElements] = useState<ShapeElement[]>([]);
  const [slideWidthPx, setSlideWidthPx] = useState(1280);
  const [loadingElements, setLoadingElements] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // pendingEdits: slideIndex → elements[]，跨页缓存所有未保存的改动
  const pendingEditsRef = useRef<Map<number, ShapeElement[]>>(new Map());
  const [dirtyPages, setDirtyPages] = useState<Set<number>>(new Set());
  const elementsRef = useRef<ShapeElement[]>([]);
  const editingIdRef = useRef<string | null>(null);
  const selectedIdsRef = useRef<Set<string>>(new Set());

  // Undo 栈：每页独立，记录 elements 快照
  const undoStackRef = useRef<Map<number, ShapeElement[][]>>(new Map());
  const MAX_UNDO = 50;

  const pushUndo = useCallback((pageIdx: number, snapshot: ShapeElement[]) => {
    const stack = undoStackRef.current.get(pageIdx) ?? [];
    stack.push(snapshot.map(el => ({ ...el })));
    if (stack.length > MAX_UNDO) stack.shift();
    undoStackRef.current.set(pageIdx, stack);
  }, []);

  const popUndo = useCallback(() => {
    const stack = undoStackRef.current.get(activeIdx);
    if (!stack || stack.length === 0) return;
    const prev = stack.pop()!;
    setElements(prev);
    elementsRef.current = prev;
    pendingEditsRef.current.set(activeIdx, prev);
    setDirtyPages(p => new Set(p).add(activeIdx));
  }, [activeIdx]);

  const thumbListRef = useRef<HTMLDivElement>(null);

  // 所有页的元素缓存，用于缩略图渲染
  const [allThumbElements, setAllThumbElements] = useState<Map<number, ShapeElement[]>>(new Map());
  useEffect(() => {
    let cancelled = false;
    async function loadAll() {
      const map = new Map<number, ShapeElement[]>();
      await Promise.all(slides.map(async (_, idx) => {
        try {
          const res = await authFetch(`${API_BASE}/api/jobs/${jobId}/elements/${idx}`);
          if (!res.ok) return;
          const data = await res.json();
          const elems = (data.elements || []).map((e: Record<string, unknown>) => ({
            fontItalic: false, fontUnderline: false, fontStrikethrough: false,
            textAlign: "left" as const, ...e,
          }));
          map.set(idx, elems);
        } catch { /* ignore */ }
      }));
      if (!cancelled) setAllThumbElements(map);
    }
    loadAll();
    return () => { cancelled = true; };
  }, [jobId, slides, previewVer]);

  const hasUnsaved = dirtyPages.size > 0;

  const hasPreview = activeIdx < previewCount;
  const imgUrl = hasPreview ? `${API_BASE}/api/jobs/${jobId}/preview/${activeIdx}?v=${previewVer}` : null;
  const bgImgUrl = hasPreview ? `${API_BASE}/api/jobs/${jobId}/preview-bg/${activeIdx}?v=${previewVer}` : null;

  const selectedElement = elements.find(el => el.id === selectedId) ?? null;

  useEffect(() => {
    setSlides(initialSlides);
    setPreviewCount(initialPreviewCount);
  }, [initialSlides, initialPreviewCount]);

  const loadElements = useCallback(async (idx: number) => {
    // If we have cached edits for this page, show them immediately
    if (pendingEditsRef.current.has(idx)) {
      setElements(pendingEditsRef.current.get(idx)!);
      return;
    }
    setLoadingElements(true);
    try {
      const res = await authFetch(`${API_BASE}/api/jobs/${jobId}/elements/${idx}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const rawW = Number(data.slideWidth) || 12192000;
      setSlideWidthPx(Math.round(rawW / 9525));
      const loaded = (data.elements || []).map((e: Record<string, unknown>) => ({
        fontItalic: false,
        fontUnderline: false,
        fontStrikethrough: false,
        textAlign: "left" as const,
        ...e,
      }));
      setElements(loaded);
      elementsRef.current = loaded;
    } catch (e) {
      console.error("加载形状数据失败:", e);
      setElements([]);
    } finally {
      setLoadingElements(false);
    }
  }, [jobId]);

  // Keep refs in sync to avoid stale closures
  useEffect(() => { elementsRef.current = elements; }, [elements]);
  useEffect(() => { editingIdRef.current = editingId; }, [editingId]);
  useEffect(() => { selectedIdsRef.current = selectedIds; }, [selectedIds]);

  // Keyboard shortcuts: Ctrl+A, Ctrl+Z, Delete, Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (document.activeElement as HTMLElement)?.tagName;
      const isEditing = tag === "TEXTAREA" || tag === "INPUT";

      if ((e.ctrlKey || e.metaKey) && e.key === "a") {
        if (isEditing) return;
        e.preventDefault();
        const ids = new Set(elementsRef.current.filter(el => !el._deleted).map(el => el.id));
        setSelectedIds(ids);
        setSelectedId(elementsRef.current.filter(el => !el._deleted).at(-1)?.id ?? null);
        setEditingId(null);
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey) {
        if (isEditing) return;
        e.preventDefault();
        popUndo();
      }
      if ((e.key === "Delete" || e.key === "Backspace") && !isEditing && editingIdRef.current === null) {
        const sel = selectedIdsRef.current;
        if (sel.size === 0) return;
        e.preventDefault();
        pushUndo(activeIdx, elementsRef.current);
        setElements(prev => {
          const next = prev.map(el => sel.has(el.id) ? { ...el, _deleted: true } : el);
          pendingEditsRef.current.set(activeIdx, next);
          return next;
        });
        setSelectedId(null);
        setSelectedIds(new Set());
        setDirtyPages(prev => new Set(prev).add(activeIdx));
      }
      if (e.key === "Escape") {
        setSelectedId(null);
        setSelectedIds(new Set());
        setEditingId(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [popUndo, activeIdx, pushUndo]);

  useEffect(() => {
    setSelectedId(null);
    setSelectedIds(new Set());
    setEditingId(null);
    loadElements(activeIdx);
  }, [activeIdx, loadElements, previewVer]);

  const updateElement = useCallback((id: string, patch: Partial<ShapeElement>) => {
    pushUndo(activeIdx, elementsRef.current);
    setElements(prev => {
      const next = prev.map(el => el.id === id ? { ...el, ...patch } : el);
      pendingEditsRef.current.set(activeIdx, next);
      return next;
    });
    setDirtyPages(prev => new Set(prev).add(activeIdx));
  }, [activeIdx, pushUndo]);

  // 多选：单击 = 单选，Ctrl/Cmd+单击 = 追加/移除
  const handleSelect = useCallback((id: string, multi: boolean) => {
    if (!id) {
      setSelectedId(null);
      setSelectedIds(new Set());
      return;
    }
    if (multi) {
      setSelectedIds(prev => {
        const next = new Set(prev);
        if (next.has(id)) { next.delete(id); }
        else { next.add(id); }
        return next;
      });
      setSelectedId(id);
    } else {
      setSelectedId(id);
      setSelectedIds(new Set([id]));
    }
    setEditingId(null);
  }, []);

  const selectAll = useCallback(() => {
    const ids = new Set(elements.map(el => el.id));
    setSelectedIds(ids);
    setSelectedId(elements[elements.length - 1]?.id ?? null);
    setEditingId(null);
  }, [elements]);

  const addTextElement = useCallback(() => {
    const newId = `new_text_${Date.now()}`;
    const newEl: ShapeElement = {
      id: newId,
      name: newId,
      text: "双击编辑文字",
      type: "text",
      xPct: 30,
      yPct: 40,
      wPct: 40,
      hPct: 10,
      fontSize: 24,
      fontColor: "#FFFFFF",
      fontFamily: "PingFang SC",
      fontWeight: 400,
      fontItalic: false,
      fontUnderline: false,
      fontStrikethrough: false,
      textAlign: "center",
    };
    pushUndo(activeIdx, elementsRef.current);
    setElements(prev => {
      const next = [...prev, newEl];
      pendingEditsRef.current.set(activeIdx, next);
      return next;
    });
    setSelectedId(newId);
    setSelectedIds(new Set([newId]));
    setEditingId(newId);
    setDirtyPages(prev => new Set(prev).add(activeIdx));
  }, [activeIdx, pushUndo]);

  // 对齐操作：对选中的所有元素批量更新坐标
  const applyAlignment = useCallback((type: AlignType) => {
    const sel = elements.filter(el => selectedIds.has(el.id));
    if (sel.length < 2) return;

    const minX   = Math.min(...sel.map(e => e.xPct));
    const maxX   = Math.max(...sel.map(e => e.xPct + e.wPct));
    const minY   = Math.min(...sel.map(e => e.yPct));
    const maxY   = Math.max(...sel.map(e => e.yPct + e.hPct));
    const ctrX   = (minX + maxX) / 2;
    const ctrY   = (minY + maxY) / 2;

    let patches: Record<string, Partial<ShapeElement>> = {};

    if (type === "left")        sel.forEach(e => { patches[e.id] = { xPct: minX }; });
    else if (type === "right")  sel.forEach(e => { patches[e.id] = { xPct: maxX - e.wPct }; });
    else if (type === "centerH")sel.forEach(e => { patches[e.id] = { xPct: ctrX - e.wPct / 2 }; });
    else if (type === "top")    sel.forEach(e => { patches[e.id] = { yPct: minY }; });
    else if (type === "bottom") sel.forEach(e => { patches[e.id] = { yPct: maxY - e.hPct }; });
    else if (type === "middleV")sel.forEach(e => { patches[e.id] = { yPct: ctrY - e.hPct / 2 }; });
    else if (type === "distH") {
      const sorted = [...sel].sort((a, b) => a.xPct - b.xPct);
      const totalW = sorted.reduce((s, e) => s + e.wPct, 0);
      const gap = (maxX - minX - totalW) / (sorted.length - 1);
      let curX = minX;
      sorted.forEach(e => { patches[e.id] = { xPct: curX }; curX += e.wPct + gap; });
    } else if (type === "distV") {
      const sorted = [...sel].sort((a, b) => a.yPct - b.yPct);
      const totalH = sorted.reduce((s, e) => s + e.hPct, 0);
      const gap = (maxY - minY - totalH) / (sorted.length - 1);
      let curY = minY;
      sorted.forEach(e => { patches[e.id] = { yPct: curY }; curY += e.hPct + gap; });
    }

    pushUndo(activeIdx, elementsRef.current);
    setElements(prev => {
      const next = prev.map(el => patches[el.id] ? { ...el, ...patches[el.id] } : el);
      pendingEditsRef.current.set(activeIdx, next);
      return next;
    });
    setDirtyPages(prev => new Set(prev).add(activeIdx));
  }, [elements, selectedIds, activeIdx, pushUndo]);

  const saveChanges = useCallback(async () => {
    if (dirtyPages.size === 0) return;
    setSaving(true);

    // Flush current page edits into pendingEdits before saving
    if (elementsRef.current.length > 0) {
      pendingEditsRef.current.set(activeIdx, elementsRef.current);
    }

    const pagesToSave = Array.from(dirtyPages);
    let lastPreviewCount = previewCount;
    const failed: number[] = [];

    for (const idx of pagesToSave) {
      const elems = pendingEditsRef.current.get(idx);
      if (!elems) continue;
      try {
        const res = await authFetch(`${API_BASE}/api/jobs/${jobId}/update-slide/${idx}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ elements: elems }),
        });
        if (!res.ok) {
          const b = await res.json().catch(() => ({}));
          throw new Error(b.detail ?? `HTTP ${res.status}`);
        }
        const data = await res.json();
        if (typeof data.preview_count === "number") lastPreviewCount = data.preview_count;
        pendingEditsRef.current.delete(idx);
      } catch (e) {
        failed.push(idx);
        console.error(`第 ${idx + 1} 页保存失败:`, e);
      }
    }

    setPreviewCount(lastPreviewCount);
    setPreviewVer(v => v + 1);
    setDirtyPages(failed.length > 0 ? new Set(failed) : new Set());

    if (failed.length > 0) {
      alert(`第 ${failed.map(i => i + 1).join("、")} 页保存失败，请重试`);
    }
    setSaving(false);
  }, [jobId, activeIdx, dirtyPages, previewCount]);

  const goPrev = useCallback(() => {
    setActiveIdx(i => Math.max(0, i - 1));
  }, []);
  const goNext = useCallback(() => {
    setActiveIdx(i => Math.min(slides.length - 1, i + 1));
  }, [slides.length]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (editingId) return;

      if (e.key === "Escape") {
        setSelectedId(null); setSelectedIds(new Set()); setEditingId(null);
        return;
      }

      const isArrow = ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key);
      if (!isArrow) return;
      e.preventDefault();

      const hasSelection = selectedIds.size > 0;
      if (hasSelection) {
        const step = e.shiftKey ? 0.01 : 0.002;
        const dx = e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
        const dy = e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0;
        if (dx === 0 && dy === 0) return;
        const cur = elementsRef.current;
        pushUndo(activeIdx, cur);
        setElements(prev => {
          const next = prev.map(el =>
            selectedIds.has(el.id)
              ? { ...el, xPct: el.xPct + dx, yPct: el.yPct + dy }
              : el
          );
          pendingEditsRef.current.set(activeIdx, next);
          elementsRef.current = next;
          setDirtyPages(p => new Set(p).add(activeIdx));
          return next;
        });
      } else {
        if (e.key === "ArrowUp" || e.key === "ArrowLeft") goPrev();
        if (e.key === "ArrowDown" || e.key === "ArrowRight") goNext();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [editingId, selectedIds, activeIdx, goPrev, goNext]);

  useEffect(() => {
    const el = thumbListRef.current?.children[activeIdx] as HTMLElement | undefined;
    el?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [activeIdx]);

  return (
    <div className="flex flex-col h-[calc(100vh-92px)] bg-[#0e0e0e]">
      {/* Top bar */}
      <div className="flex items-center justify-between px-5 py-2.5 shrink-0
        border-b border-white/[0.06] bg-[#1a1919]/60 glass">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-[#cafd00] text-base"
            style={{ fontVariationSettings: "'FILL' 1" }}>auto_awesome</span>
          <p className="text-xs font-bold text-white/80">
            生成完成 · <span className="text-[#cafd00]">{slides.length} 页</span>
          </p>
          <span className="text-white/15 mx-1">·</span>
          <p className="text-[11px] text-[#adaaaa]/60">单击选中 · 拖拽移动 · 双击编辑</p>
        </div>
        <div className="flex items-center gap-2">
          {hasUnsaved && (
            <button
              onClick={saveChanges}
              disabled={saving}
              className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold rounded-xl
                bg-[#cafd00]/10 border border-[#cafd00]/30 text-[#cafd00]
                hover:bg-[#cafd00]/20 disabled:opacity-50 transition active:scale-95"
            >
              {saving ? (
                <><span className="w-3 h-3 border-2 border-[#cafd00]/40 border-t-[#cafd00] rounded-full lc-spin" />保存中…</>
              ) : (
                <><span className="material-symbols-outlined text-sm">save</span>
                  保存全部
                  <span className="bg-[#cafd00] text-[#516700] text-[9px] font-black px-1.5 py-0.5 rounded-full">
                    {dirtyPages.size}
                  </span>
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Main two-panel layout */}
      <div className="flex gap-0 flex-1 min-h-0">
        {/* Left: Thumbnail list */}
        <div className="w-[220px] shrink-0 flex flex-col bg-[#131313] border-r border-white/[0.05] overflow-hidden">
          <div className="px-3 py-2.5 border-b border-white/[0.05]">
            <p className="text-[9px] font-bold text-[#adaaaa]/50 uppercase tracking-widest">幻灯片</p>
          </div>
          <div ref={thumbListRef} className="flex-1 overflow-y-auto p-2 space-y-1.5">
            {slides.map((slide, i) => (
              <ThumbItem
                key={i}
                index={i}
                slide={slide}
                jobId={jobId}
                previewCount={previewCount}
                isActive={i === activeIdx}
                isDirty={dirtyPages.has(i)}
                previewVer={previewVer}
                onClick={() => setActiveIdx(i)}
                thumbElements={pendingEditsRef.current.get(i) ?? allThumbElements.get(i)}
                slideWidthPx={slideWidthPx}
              />
            ))}
          </div>
        </div>

        {/* Right: Interactive canvas */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {/* Canvas toolbar */}
          <div className="flex items-center justify-between px-4 py-2 border-b border-white/[0.05] bg-[#1a1919]/80 shrink-0">
            <div className="flex items-center gap-2">
              <button onClick={goPrev} disabled={activeIdx === 0}
                className="w-7 h-7 rounded-lg frosted flex items-center justify-center text-[#adaaaa]
                  hover:text-white disabled:opacity-25 disabled:cursor-not-allowed transition text-base leading-none">
                ‹
              </button>
              <span className="text-[11px] font-bold text-[#adaaaa]/80 min-w-[64px] text-center">
                {activeIdx + 1} / {slides.length}
              </span>
              <button onClick={goNext} disabled={activeIdx === slides.length - 1}
                className="w-7 h-7 rounded-lg frosted flex items-center justify-center text-[#adaaaa]
                  hover:text-white disabled:opacity-25 disabled:cursor-not-allowed transition text-base leading-none">
                ›
              </button>
              <div className="w-px h-4 bg-white/10 mx-1" />
              <button
                onClick={addTextElement}
                title="添加文字框"
                className="px-2.5 py-1 text-[10px] font-bold rounded-lg frosted text-[#adaaaa]
                  hover:text-[#cafd00] hover:border-[#cafd00]/30 transition flex items-center gap-1"
              >
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M8 2v12M2 8h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                </svg>
                文字
              </button>
              <button
                onClick={selectAll}
                title="全选所有元素 (Ctrl+A)"
                className="px-2.5 py-1 text-[10px] font-bold rounded-lg frosted text-[#adaaaa]
                  hover:text-[#cafd00] hover:border-[#cafd00]/30 transition"
              >全选</button>
              {selectedIds.size >= 2 && (
                <span className="text-[10px] text-[#cafd00] font-bold bg-[#cafd00]/10
                  border border-[#cafd00]/20 px-2 py-0.5 rounded-full">
                  {selectedIds.size} 个元素
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {selectedIds.size >= 2 && <AlignToolbar onAlign={applyAlignment} />}
              <div className="flex items-center gap-2 text-[10px] text-[#adaaaa]/40">
                {/* AI 结构标注徽章 */}
                {(() => {
                  const cur = slides[activeIdx];
                  if (!cur) return null;
                  const ptInfo = cur.page_type ? PAGE_TYPE_LABELS[cur.page_type] : null;
                  return (
                    <>
                      {ptInfo && (
                        <span
                          className="text-[9px] font-bold px-2 py-0.5 rounded-full"
                          style={{ background: ptInfo.color + "18", color: ptInfo.color, border: `1px solid ${ptInfo.color}35` }}
                          title={`AI识别页面类型: ${cur.page_type}`}
                        >
                          {ptInfo.label}
                        </span>
                      )}
                      {cur.block_structure && (
                        <span className="text-[8px] text-white/25 bg-white/5 px-1.5 py-0.5 rounded border border-white/[0.08]"
                          title={`AI识别结构: ${cur.block_structure}`}>
                          {cur.block_structure}
                        </span>
                      )}
                    </>
                  );
                })()}
                {loadingElements && (
                  <span className="flex items-center gap-1">
                    <span className="w-2.5 h-2.5 border border-[#adaaaa]/30 border-t-[#adaaaa] rounded-full lc-spin" />
                    加载中
                  </span>
                )}
                {dirtyPages.has(activeIdx) && (
                  <span className="text-[#cafd00]/70 font-bold flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#cafd00] lc-pulse-dot" />
                    已修改
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Canvas area */}
          <div
            className="flex-1 min-h-0 flex items-center justify-center p-8 overflow-hidden relative"
            style={{
              background: `
                radial-gradient(circle, rgba(255,255,255,0.06) 0.4px, transparent 0.4px),
                radial-gradient(ellipse at center, #1a1a1a 0%, #0e0e0e 100%)
              `,
              backgroundSize: "10px 10px, 100% 100%",
            }}
            onMouseDown={(e) => {
              if (e.currentTarget === e.target && !editingId) {
                setSelectedId(null);
                setSelectedIds(new Set());
              }
            }}
          >
            <SlideCanvas
              imgUrl={bgImgUrl}
              elements={elements}
              slideWidthPx={slideWidthPx}
              selectedId={selectedId}
              selectedIds={selectedIds}
              editingId={editingId}
              onSelect={(id, multi) => handleSelect(id, multi)}
              onSelectByIds={(ids) => {
                const idSet = new Set(ids);
                setSelectedIds(idSet);
                setSelectedId(ids[ids.length - 1] ?? null);
                setEditingId(null);
              }}
              onStartEdit={(id) => { setSelectedId(id); setSelectedIds(new Set([id])); setEditingId(id); }}
              onFinishEdit={() => setEditingId(null)}
              onUpdate={updateElement}
              selectedElement={selectedElement}
            />
          </div>
        </div>
      </div>
    </div>
  );
}


/* ── Floating format toolbar ────────────────────────────────────── */

const FONT_SIZES = [10, 12, 14, 16, 18, 20, 24, 28, 32, 36, 40, 48, 56, 64, 72, 96];

/* ── Gradient helpers ───────────────────────────────────────────── */

function gradientToCss(g: FontGradient): string {
  const stops = [...g.stops].sort((a, b) => a.pos - b.pos);
  return `linear-gradient(${g.angle}deg, ${stops.map(s => `${s.color} ${s.pos}%`).join(", ")})`;
}

function hexToRgb(hex: string) {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map(c => c + c).join("") : h, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function interpolateColor(stops: GradientStop[], pos: number): string {
  const sorted = [...stops].sort((a, b) => a.pos - b.pos);
  if (pos <= sorted[0].pos) return sorted[0].color;
  if (pos >= sorted[sorted.length - 1].pos) return sorted[sorted.length - 1].color;
  const right = sorted.findIndex(s => s.pos >= pos);
  const left = right - 1;
  const l = sorted[left], r = sorted[right];
  const t = (pos - l.pos) / (r.pos - l.pos);
  const lc = hexToRgb(l.color), rc = hexToRgb(r.color);
  const mix = (a: number, b: number) => Math.round(a + (b - a) * t);
  return `#${[mix(lc.r, rc.r), mix(lc.g, rc.g), mix(lc.b, rc.b)].map(v => v.toString(16).padStart(2, "0")).join("")}`;
}

const DEFAULT_GRADIENT: FontGradient = {
  angle: 90,
  stops: [{ color: "#FF6B6B", pos: 0 }, { color: "#4ECDC4", pos: 100 }],
};

/* ── GradientEditor ─────────────────────────────────────────────── */

function GradientEditor({ gradient, onChange }: {
  gradient: FontGradient;
  onChange: (g: FontGradient) => void;
}) {
  const [activeIdx, setActiveIdx] = useState(0);
  const barRef = useRef<HTMLDivElement>(null);

  const safeIdx = Math.min(activeIdx, gradient.stops.length - 1);
  const activeStop = gradient.stops[safeIdx];

  const handleBarClick = (e: React.MouseEvent) => {
    const bar = barRef.current;
    if (!bar) return;
    const rect = bar.getBoundingClientRect();
    const pos = Math.round(Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100)));
    const color = interpolateColor(gradient.stops, pos);
    const newStops = [...gradient.stops, { color, pos }];
    onChange({ ...gradient, stops: newStops });
    setActiveIdx(newStops.length - 1);
  };

  const handleStopMouseDown = (idx: number, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setActiveIdx(idx);
    const bar = barRef.current;
    if (!bar) return;
    const rect = bar.getBoundingClientRect();
    const onMove = (ev: MouseEvent) => {
      const pos = Math.round(Math.max(0, Math.min(100, ((ev.clientX - rect.left) / rect.width) * 100)));
      onChange({ ...gradient, stops: gradient.stops.map((s, i) => i === idx ? { ...s, pos } : s) });
    };
    const onUp = () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const deleteActive = () => {
    if (gradient.stops.length <= 2) return;
    const newStops = gradient.stops.filter((_, i) => i !== safeIdx);
    onChange({ ...gradient, stops: newStops });
    setActiveIdx(Math.max(0, safeIdx - 1));
  };

  return (
    <div
      style={{ padding: "10px 12px 4px", width: 260 }}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Gradient bar */}
      <div
        ref={barRef}
        style={{
          height: 22, borderRadius: 6,
          background: gradientToCss(gradient),
          cursor: "crosshair", position: "relative",
          marginBottom: 4, boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.12)",
        }}
        onClick={handleBarClick}
      >
        {gradient.stops.map((stop, idx) => (
          <div
            key={idx}
            style={{
              position: "absolute", left: `${stop.pos}%`, top: "50%",
              transform: "translate(-50%, -50%)",
              width: 14, height: 14, borderRadius: "50%",
              background: stop.color,
              border: idx === safeIdx ? "2.5px solid #3b82f6" : "2px solid white",
              boxShadow: "0 1px 4px rgba(0,0,0,0.35)",
              cursor: "ew-resize", zIndex: 2,
            }}
            onMouseDown={(e) => handleStopMouseDown(idx, e)}
            onClick={(e) => { e.stopPropagation(); setActiveIdx(idx); }}
          />
        ))}
      </div>

      {/* Stop info row */}
      <div style={{ display: "flex", alignItems: "center", fontSize: 11, color: "#64748b", marginBottom: 10, gap: 4 }}>
        <span>节点 {safeIdx + 1}/{gradient.stops.length}</span>
        <span style={{ color: "#cbd5e1" }}>·</span>
        <span>位置 {activeStop?.pos ?? 0}%</span>
        <span style={{ flex: 1 }} />
        <button
          style={{ fontSize: 11, color: gradient.stops.length > 2 ? "#ef4444" : "#cbd5e1", background: "none", border: "none", cursor: gradient.stops.length > 2 ? "pointer" : "default", padding: 0 }}
          onMouseDown={(e) => e.preventDefault()}
          onClick={deleteActive}
          title="删除选中节点"
        >
          删除节点
        </button>
      </div>

      {/* Angle row */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 11, color: "#64748b", minWidth: 30 }}>角度</span>
        <input
          type="range" min={0} max={360} value={gradient.angle}
          style={{ flex: 1, accentColor: "#3b82f6" }}
          onMouseDown={(e) => e.stopPropagation()}
          onChange={(e) => onChange({ ...gradient, angle: Number(e.target.value) })}
        />
        <input
          type="number" min={0} max={360} value={gradient.angle}
          style={{ width: 44, fontSize: 11, border: "1px solid #e2e8f0", borderRadius: 4, textAlign: "center", padding: "2px 4px" }}
          onMouseDown={(e) => e.stopPropagation()}
          onChange={(e) => onChange({ ...gradient, angle: Math.max(0, Math.min(360, Number(e.target.value))) })}
        />
        <span style={{ fontSize: 11, color: "#94a3b8" }}>°</span>
      </div>

      {/* Angle presets */}
      <div style={{ display: "flex", gap: 4, marginBottom: 12 }}>
        {[0, 45, 90, 135, 180, 225, 270, 315].map(a => (
          <button
            key={a}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onChange({ ...gradient, angle: a })}
            style={{
              flex: 1, fontSize: 10, padding: "3px 0", borderRadius: 4,
              border: gradient.angle === a ? "1px solid #3b82f6" : "1px solid #e2e8f0",
              background: gradient.angle === a ? "#eff6ff" : "white",
              color: gradient.angle === a ? "#3b82f6" : "#64748b",
              cursor: "pointer",
            }}
          >
            {a}°
          </button>
        ))}
      </div>

      {/* Selected stop color */}
      <div style={{ borderTop: "1px solid #f1f5f9", paddingTop: 8, marginBottom: 4 }}>
        <div style={{ fontSize: 11, color: "#64748b", marginBottom: 6 }}>节点 {safeIdx + 1} 颜色</div>
        <Sketch
          color={activeStop?.color ?? "#000000"}
          presetColors={[
            "#000000", "#FFFFFF", "#FF0000", "#FF6600", "#FFAA00",
            "#FFD700", "#00AA00", "#00CCCC", "#0066FF", "#9933FF",
            "#FF3399", "#666666", "#CCCCCC", "#7CFC00", "#87CEEB",
          ]}
          onChange={(c) => {
            onChange({ ...gradient, stops: gradient.stops.map((s, i) => i === safeIdx ? { ...s, color: c.hex } : s) });
          }}
          style={{ width: "100%", boxShadow: "none", border: "none", padding: 0 }}
        />
      </div>
    </div>
  );
}

function FloatingToolbar({
  element,
  onUpdate,
  containerW,
  containerH,
}: {
  element: ShapeElement;
  onUpdate: (patch: Partial<ShapeElement>) => void;
  containerW: number;
  containerH: number;
}) {
  const toolbarRef = useRef<HTMLDivElement>(null);
  const colorBtnRef = useRef<HTMLButtonElement>(null);
  const colorPanelRef = useRef<HTMLDivElement>(null);
  const [showSizePicker, setShowSizePicker] = useState(false);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [colorMode, setColorMode] = useState<"solid" | "gradient">(element.fontGradient ? "gradient" : "solid");
  // Fixed position for the color panel (to escape overflow:hidden parents)
  const [colorPanelPos, setColorPanelPos] = useState<{ top: number; left: number } | null>(null);

  // Close color panel when clicking outside
  useEffect(() => {
    if (!showColorPicker) return;
    const handler = (e: MouseEvent) => {
      if (
        colorBtnRef.current && colorBtnRef.current.contains(e.target as Node)
      ) return;
      if (
        colorPanelRef.current && colorPanelRef.current.contains(e.target as Node)
      ) return;
      setShowColorPicker(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showColorPicker]);

  const elTop = element.yPct * containerH;
  const elLeft = element.xPct * containerW;
  const elWidth = element.wPct * containerW;
  const toolbarW = 380;
  const toolbarH = 40;

  let tbLeft = elLeft + elWidth / 2 - toolbarW / 2;
  if (tbLeft < 4) tbLeft = 4;
  if (tbLeft + toolbarW > containerW - 4) tbLeft = containerW - toolbarW - 4;

  let tbTop = elTop - toolbarH - 10;
  const placeBelow = tbTop < 4;
  if (placeBelow) {
    tbTop = elTop + element.hPct * containerH + 10;
  }

  const isBold = element.fontWeight >= 600;

  /* ── Card toolbar (fill / stroke / radius) ─────────────────── */
  if (element.type === "card") {
    return (
      <CardToolbar
        element={element}
        onUpdate={onUpdate}
        tbLeft={tbLeft}
        tbTop={tbTop}
      />
    );
  }

  return (
    <div
      ref={toolbarRef}
      className="absolute flex items-center gap-0.5 px-2 py-1 bg-white rounded-lg shadow-xl border border-slate-200"
      style={{ left: tbLeft, top: tbTop, minWidth: toolbarW, zIndex: 200, pointerEvents: "auto" }}
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {/* Font size */}
      <div className="relative">
        <button
          onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
          onClick={(e) => { e.stopPropagation(); setShowSizePicker(v => !v); setShowColorPicker(false); }}
          className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 rounded transition min-w-[52px] justify-between"
        >
          {element.fontSize}px
          <span className="text-[8px] text-slate-400">▼</span>
        </button>
        {showSizePicker && (
          <div className="absolute top-full left-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-xl py-1 max-h-[200px] overflow-y-auto z-50 w-[70px]">
            {FONT_SIZES.map(s => (
              <button
                key={s}
                onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
                onClick={(e) => { e.stopPropagation(); onUpdate({ fontSize: s }); setShowSizePicker(false); }}
                className={`block w-full text-left px-3 py-1 text-xs hover:bg-blue-50 transition ${
                  s === element.fontSize ? "bg-blue-50 text-blue-700 font-semibold" : "text-slate-700"
                }`}
              >
                {s}px
              </button>
            ))}
          </div>
        )}
      </div>

      <Divider />

      {/* Bold */}
      <TbBtn
        active={isBold}
        onClick={() => onUpdate({ fontWeight: isBold ? 400 : 700 })}
        title="加粗"
      >
        <span className="font-bold text-[13px]">B</span>
      </TbBtn>

      {/* Italic */}
      <TbBtn
        active={element.fontItalic}
        onClick={() => onUpdate({ fontItalic: !element.fontItalic })}
        title="斜体"
      >
        <span className="italic text-[13px] font-serif">I</span>
      </TbBtn>

      {/* Underline */}
      <TbBtn
        active={element.fontUnderline}
        onClick={() => onUpdate({ fontUnderline: !element.fontUnderline })}
        title="下划线"
      >
        <span className="underline text-[13px]">U</span>
      </TbBtn>

      {/* Strikethrough */}
      <TbBtn
        active={element.fontStrikethrough}
        onClick={() => onUpdate({ fontStrikethrough: !element.fontStrikethrough })}
        title="删除线"
      >
        <span className="line-through text-[13px]">S</span>
      </TbBtn>

      <Divider />

      {/* Align left */}
      <TbBtn active={element.textAlign === "left"} onClick={() => onUpdate({ textAlign: "left" })} title="左对齐">
        <AlignLeftIcon />
      </TbBtn>
      {/* Align center */}
      <TbBtn active={element.textAlign === "center"} onClick={() => onUpdate({ textAlign: "center" })} title="居中">
        <AlignCenterIcon />
      </TbBtn>
      {/* Align right */}
      <TbBtn active={element.textAlign === "right"} onClick={() => onUpdate({ textAlign: "right" })} title="右对齐">
        <AlignRightIcon />
      </TbBtn>

      <Divider />

      {/* Color */}
      <div className="relative">
        <button
          ref={colorBtnRef}
          onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
          onClick={(e) => {
            e.stopPropagation();
            const next = !showColorPicker;
            setShowColorPicker(next);
            setShowSizePicker(false);
            setColorMode(element.fontGradient ? "gradient" : "solid");
            if (next && colorBtnRef.current) {
              const rect = colorBtnRef.current.getBoundingClientRect();
              const panelW = 280;
              const panelH = 540;
              // Always place panel at the right edge of the viewport
              // so it never overlaps the slide canvas
              const left = window.innerWidth - panelW - 12;
              // Vertically: align with the button, clamped to viewport
              const top = Math.max(8, Math.min(rect.top, window.innerHeight - panelH - 8));
              setColorPanelPos({ top, left });
            }
          }}
          className="flex flex-col items-center justify-center w-7 h-7 rounded hover:bg-slate-100 transition"
          title="文字颜色"
        >
          <span
            className="text-[13px] font-bold leading-none"
            style={{
              color: element.fontColor,
              // Add a thin contrasting outline so "A" is visible on white backgrounds
              WebkitTextStroke: element.fontColor?.toUpperCase() === "#FFFFFF" || element.fontColor?.toUpperCase() === "FFFFFF"
                ? "0.5px #aaa"
                : undefined,
            }}
          >A</span>
          <div
            className="w-4 h-[3px] rounded-full mt-0.5"
            style={{
              background: element.fontGradient
                ? gradientToCss(element.fontGradient)
                : element.fontColor,
              // Always show a border so the swatch is visible even when white
              outline: "1px solid rgba(0,0,0,0.18)",
              outlineOffset: "0px",
            }}
          />
        </button>
        {showColorPicker && colorPanelPos && (
          <div
            ref={colorPanelRef}
            className="z-[9999] bg-white rounded-xl border border-slate-200"
            style={{
              position: "fixed",
              top: colorPanelPos.top,
              left: colorPanelPos.left,
              boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
              minWidth: 260,
              maxHeight: "calc(100vh - 16px)",
              overflowY: "auto",
            }}
            onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Tabs */}
            <div className="flex border-b border-slate-100">
              {(["solid", "gradient"] as const).map(mode => (
                <button
                  key={mode}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    setColorMode(mode);
                    if (mode === "gradient" && !element.fontGradient) {
                      onUpdate({ fontGradient: DEFAULT_GRADIENT, fontColor: element.fontColor });
                    }
                    if (mode === "solid") {
                      onUpdate({ fontGradient: null });
                    }
                  }}
                  className={`flex-1 py-2 text-xs font-medium transition ${
                    colorMode === mode
                      ? "text-blue-600 border-b-2 border-blue-500"
                      : "text-slate-500 hover:text-slate-700"
                  }`}
                >
                  {mode === "solid" ? "纯色" : "渐变"}
                </button>
              ))}
            </div>

            {/* Solid picker */}
            {colorMode === "solid" && (
              <Sketch
                color={element.fontColor}
                presetColors={[
                  "#000000", "#FFFFFF", "#FF0000", "#FF6600", "#FFAA00",
                  "#FFD700", "#00AA00", "#00CCCC", "#0066FF", "#9933FF",
                  "#FF3399", "#666666", "#CCCCCC", "#7CFC00", "#87CEEB",
                  "#DDA0DD", "#F0E68C", "#FFA07A",
                ]}
                onChange={(color) => onUpdate({ fontColor: color.hex, fontGradient: null })}
                style={{ boxShadow: "none", border: "none", borderRadius: 0 }}
              />
            )}

            {/* Gradient picker */}
            {colorMode === "gradient" && (
              <GradientEditor
                gradient={element.fontGradient ?? DEFAULT_GRADIENT}
                onChange={(g) => onUpdate({ fontGradient: g })}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function TbBtn({ active, onClick, title, children }: {
  active: boolean; onClick: () => void; title: string; children: React.ReactNode;
}) {
  return (
    <button
      onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      title={title}
      className={`w-7 h-7 flex items-center justify-center rounded transition ${
        active
          ? "bg-blue-600 text-white"
          : "text-slate-600 hover:bg-slate-100"
      }`}
    >
      {children}
    </button>
  );
}

function Divider() {
  return <div className="w-px h-5 bg-slate-200 mx-0.5" />;
}


/* ── CardToolbar ────────────────────────────────────────────────── */

const BORDER_WIDTHS = [0, 0.5, 1, 1.5, 2, 3];

function CardToolbar({
  element: el,
  onUpdate,
  tbLeft,
  tbTop,
}: {
  element: ShapeElement;
  onUpdate: (patch: Partial<ShapeElement>) => void;
  tbLeft: number;
  tbTop: number;
}) {
  const [activePanel, setActivePanel] = useState<"fill" | "stroke" | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const fillBtnRef = useRef<HTMLButtonElement>(null);
  const strokeBtnRef = useRef<HTMLButtonElement>(null);
  const [panelPos, setPanelPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });

  useEffect(() => {
    if (!activePanel) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current?.contains(e.target as Node)) return;
      if (fillBtnRef.current?.contains(e.target as Node)) return;
      if (strokeBtnRef.current?.contains(e.target as Node)) return;
      setActivePanel(null);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [activePanel]);

  const openPanel = (which: "fill" | "stroke", btnRef: React.RefObject<HTMLButtonElement | null>) => {
    const next = activePanel === which ? null : which;
    setActivePanel(next);
    if (next && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      setPanelPos({
        top: Math.max(8, Math.min(r.bottom + 4, window.innerHeight - 380)),
        left: Math.max(8, Math.min(r.left, window.innerWidth - 280)),
      });
    }
  };

  const hexToRgb = (hex: string) => {
    const h = hex.replace("#", "");
    return { r: parseInt(h.slice(0, 2), 16) || 0, g: parseInt(h.slice(2, 4), 16) || 0, b: parseInt(h.slice(4, 6), 16) || 0 };
  };
  const rgbStr = (hex: string, opacity: number) => {
    const { r, g, b } = hexToRgb(hex);
    return `rgba(${r},${g},${b},${opacity / 100})`;
  };

  return (
    <>
      <div
        className="absolute flex items-center gap-1 px-2.5 py-1.5 bg-white rounded-lg shadow-xl border border-slate-200"
        style={{ left: tbLeft, top: tbTop, zIndex: 200, pointerEvents: "auto", minWidth: 320 }}
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Fill */}
        <button
          ref={fillBtnRef}
          onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
          onClick={(e) => { e.stopPropagation(); openPanel("fill", fillBtnRef); }}
          className={`flex items-center gap-1.5 px-2 py-1 text-[11px] rounded transition ${activePanel === "fill" ? "bg-blue-50 text-blue-700" : "text-slate-600 hover:bg-slate-100"}`}
          title="填充"
        >
          <div
            className="w-4 h-4 rounded border border-slate-300"
            style={{ background: el.fillColor ? rgbStr(el.fillColor, el.fillOpacity ?? 100) : "repeating-conic-gradient(#ddd 0% 25%, transparent 0% 50%) 50% / 8px 8px" }}
          />
          <span>填充</span>
        </button>

        <Divider />

        {/* Stroke */}
        <button
          ref={strokeBtnRef}
          onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
          onClick={(e) => { e.stopPropagation(); openPanel("stroke", strokeBtnRef); }}
          className={`flex items-center gap-1.5 px-2 py-1 text-[11px] rounded transition ${activePanel === "stroke" ? "bg-blue-50 text-blue-700" : "text-slate-600 hover:bg-slate-100"}`}
          title="线条"
        >
          <div
            className="w-4 h-4 rounded"
            style={{ border: `2px solid ${el.borderColor ? rgbStr(el.borderColor, el.borderOpacity ?? 100) : "#ccc"}` }}
          />
          <span>线条</span>
        </button>

        <Divider />

        {/* Border Radius */}
        <div className="flex items-center gap-1.5 px-1">
          <span className="text-[10px] text-slate-500" title="圆角">R</span>
          <input
            type="range"
            min={0}
            max={8000}
            step={200}
            value={el.borderRadius ?? 0}
            onChange={(e) => onUpdate({ borderRadius: parseInt(e.target.value) })}
            onMouseDown={(e) => e.stopPropagation()}
            className="w-16 h-1 accent-blue-500"
            title={`圆角: ${el.borderRadius ?? 0}`}
          />
          <span className="text-[9px] text-slate-400 w-8 text-right">{Math.round((el.borderRadius ?? 0) / 100) / 10}</span>
        </div>
      </div>

      {/* Color panel (fixed position) */}
      {activePanel && (
        <div
          ref={panelRef}
          className="z-[9999] bg-white rounded-xl border border-slate-200"
          style={{
            position: "fixed",
            top: panelPos.top,
            left: panelPos.left,
            boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
            minWidth: 260,
            maxHeight: "calc(100vh - 16px)",
            overflowY: "auto",
          }}
          onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-3 pt-3 pb-1">
            <p className="text-xs font-semibold text-slate-700 mb-2">
              {activePanel === "fill" ? "填充颜色" : "线条颜色"}
            </p>
          </div>
          <Sketch
            color={activePanel === "fill" ? (el.fillColor || "#000000") : (el.borderColor || "#B4DC19")}
            presetColors={[
              "#000000", "#FFFFFF", "#1A1A2E", "#2A2A3E", "#B4DC19",
              "#CAFD00", "#FF0000", "#FF6600", "#0066FF", "#9933FF",
              "#00AA00", "#00CCCC", "#FFD700", "#FF3399", "#666666",
              "#CCCCCC", "#87CEEB", "#DDA0DD",
            ]}
            onChange={(color) => {
              if (activePanel === "fill") {
                onUpdate({ fillColor: color.hex });
              } else {
                onUpdate({ borderColor: color.hex });
              }
            }}
            style={{ boxShadow: "none", border: "none", borderRadius: 0 }}
          />
          {/* Opacity slider */}
          <div className="px-3 py-2 border-t border-slate-100">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] text-slate-500">透明度</span>
              <span className="text-[10px] text-slate-500 font-mono">
                {activePanel === "fill" ? (el.fillOpacity ?? 100) : (el.borderOpacity ?? 100)}%
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              value={activePanel === "fill" ? (el.fillOpacity ?? 100) : (el.borderOpacity ?? 100)}
              onChange={(e) => {
                const v = parseInt(e.target.value);
                if (activePanel === "fill") onUpdate({ fillOpacity: v });
                else onUpdate({ borderOpacity: v });
              }}
              onMouseDown={(e) => e.stopPropagation()}
              className="w-full h-1.5 accent-blue-500"
            />
          </div>
          {/* Border width (only for stroke panel) */}
          {activePanel === "stroke" && (
            <div className="px-3 py-2 border-t border-slate-100">
              <p className="text-[10px] text-slate-500 mb-1.5">线条粗细 (pt)</p>
              <div className="flex gap-1">
                {BORDER_WIDTHS.map(w => (
                  <button
                    key={w}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => onUpdate({ borderWidth: w })}
                    className={`px-2 py-1 text-[10px] rounded border transition ${
                      (el.borderWidth ?? 0) === w
                        ? "bg-blue-50 border-blue-400 text-blue-700 font-semibold"
                        : "border-slate-200 text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    {w === 0 ? "无" : w}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}


/* ── Alignment guide types & snap logic ─────────────────────────── */

type GuideLine = {
  orientation: "horizontal" | "vertical";
  position: number; // px within container
};

const SNAP_THRESHOLD_PCT = 0.008; // ~1% of slide dimension

function computeSnapAndGuides(
  draggedId: string,
  rawX: number,
  rawY: number,
  w: number,
  h: number,
  allElements: ShapeElement[],
): { snappedX: number; snappedY: number; guides: GuideLine[] } {
  const selfV = [rawX, rawX + w / 2, rawX + w]; // left, center, right
  const selfH = [rawY, rawY + h / 2, rawY + h]; // top, center, bottom

  const vCandidates = [0, 0.5, 1.0]; // slide edges + center
  const hCandidates = [0, 0.5, 1.0];

  for (const el of allElements) {
    if (el.id === draggedId) continue;
    vCandidates.push(el.xPct, el.xPct + el.wPct / 2, el.xPct + el.wPct);
    hCandidates.push(el.yPct, el.yPct + el.hPct / 2, el.yPct + el.hPct);
  }

  let bestV: { diff: number; candidate: number; offset: number } | null = null;
  let bestH: { diff: number; candidate: number; offset: number } | null = null;

  for (const sv of selfV) {
    for (const c of vCandidates) {
      const diff = Math.abs(sv - c);
      if (!bestV || diff < bestV.diff) {
        bestV = { diff, candidate: c, offset: sv - rawX };
      }
    }
  }
  for (const sh of selfH) {
    for (const c of hCandidates) {
      const diff = Math.abs(sh - c);
      if (!bestH || diff < bestH.diff) {
        bestH = { diff, candidate: c, offset: sh - rawY };
      }
    }
  }

  let snappedX = rawX;
  let snappedY = rawY;
  const guides: GuideLine[] = [];

  if (bestV && bestV.diff <= SNAP_THRESHOLD_PCT) {
    snappedX = bestV.candidate - bestV.offset;
    guides.push({ orientation: "vertical", position: bestV.candidate });
  }
  if (bestH && bestH.diff <= SNAP_THRESHOLD_PCT) {
    snappedY = bestH.candidate - bestH.offset;
    guides.push({ orientation: "horizontal", position: bestH.candidate });
  }

  return { snappedX, snappedY, guides };
}


/* ── SlideCanvas ────────────────────────────────────────────────── */

function SlideCanvas({
  imgUrl,
  elements,
  slideWidthPx,
  selectedId,
  selectedIds,
  editingId,
  onSelect,
  onSelectByIds,
  onStartEdit,
  onFinishEdit,
  onUpdate,
  selectedElement,
}: {
  imgUrl: string | null;
  elements: ShapeElement[];
  slideWidthPx: number;
  selectedId: string | null;
  selectedIds: Set<string>;
  editingId: string | null;
  onSelect: (id: string, multi: boolean) => void;
  onSelectByIds: (ids: string[]) => void;
  onStartEdit: (id: string) => void;
  onFinishEdit: () => void;
  onUpdate: (id: string, patch: Partial<ShapeElement>) => void;
  selectedElement: ShapeElement | null;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState({ w: 800, h: 450 });
  const [bgLoaded, setBgLoaded] = useState(false);
  const [guides, setGuides] = useState<GuideLine[]>([]);

  useEffect(() => { setBgLoaded(false); }, [imgUrl]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const parent = el.parentElement;
      if (!parent) return;
      const pw = parent.clientWidth - 48;
      const ph = parent.clientHeight - 48;
      const aspect = 16 / 9;
      let w = pw;
      let h = w / aspect;
      if (h > ph) { h = ph; w = h * aspect; }
      setContainerSize({ w: Math.round(w), h: Math.round(h) });
    });
    ro.observe(el.parentElement!);
    return () => ro.disconnect();
  }, []);

  const handleDragMove = useCallback((id: string, rawXPct: number, rawYPct: number, wPct: number, hPct: number) => {
    const result = computeSnapAndGuides(id, rawXPct, rawYPct, wPct, hPct, elements);
    setGuides(result.guides);
    return { x: result.snappedX, y: result.snappedY };
  }, [elements]);

  const handleDragEnd = useCallback(() => {
    setGuides([]);
  }, []);

  // ── 框选 (Marquee Selection) ──────────────────────────────────────
  type MarqueeRect = { x: number; y: number; w: number; h: number };
  const [marquee, setMarquee] = useState<MarqueeRect | null>(null);

  const handleCanvasMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    const isCanvas = target === e.currentTarget;
    const isBgImg = target.tagName === "IMG" && target.getAttribute("alt") === "";
    if (!isCanvas && !isBgImg) return;
    e.preventDefault();
    const rect = containerRef.current!.getBoundingClientRect();
    const startX = e.clientX - rect.left;
    const startY = e.clientY - rect.top;
    let cur: MarqueeRect = { x: startX, y: startY, w: 0, h: 0 };

    const handleMove = (ev: MouseEvent) => {
      const cx = ev.clientX - rect.left;
      const cy = ev.clientY - rect.top;
      cur = {
        x: Math.min(startX, cx),
        y: Math.min(startY, cy),
        w: Math.abs(cx - startX),
        h: Math.abs(cy - startY),
      };
      setMarquee({ ...cur });
    };

    const handleUp = () => {
      setMarquee(null);
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);

      const { w, h } = cur;
      if (w < 4 && h < 4) {
        onSelect("", false);
        return;
      }
      const cw = containerSize.w;
      const ch = containerSize.h;
      const sx1 = cur.x / cw, sy1 = cur.y / ch;
      const sx2 = (cur.x + cur.w) / cw, sy2 = (cur.y + cur.h) / ch;
      const hit = elements.filter(el => {
        if (el._deleted) return false;
        return el.xPct < sx2 && el.xPct + el.wPct > sx1 &&
               el.yPct < sy2 && el.yPct + el.hPct > sy1;
      });
      if (hit.length > 0) {
        onSelectByIds(hit.map(el => el.id));
      } else {
        onSelect("", false);
      }
    };

    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
  };

  return (
    <div
      ref={containerRef}
      className="relative select-none"
      style={{ width: containerSize.w, height: containerSize.h }}
      onMouseDown={handleCanvasMouseDown}
    >
      {/* Background layer only (no pre-rendered slide image) */}
      {imgUrl ? (
        <>
          {!bgLoaded && (
            <div className="absolute inset-0 bg-[#1a1919] rounded-lg" />
          )}
          <img
            src={imgUrl}
            alt=""
            className={`absolute inset-0 w-full h-full object-cover rounded-lg transition-opacity ${bgLoaded ? "opacity-100" : "opacity-0"}`}
            onLoad={() => setBgLoaded(true)}
            draggable={false}
          />
        </>
      ) : (
        <div className="absolute inset-0 bg-[#1a1919] rounded-lg" />
      )}

      {/* Alignment guide lines */}
      {guides.map((g, i) =>
        g.orientation === "vertical" ? (
          <div
            key={`v-${i}`}
            className="absolute top-0 pointer-events-none z-[90]"
            style={{
              left: g.position * containerSize.w,
              width: 0,
              height: containerSize.h,
              borderLeft: "1.5px dashed #ef4444",
            }}
          />
        ) : (
          <div
            key={`h-${i}`}
            className="absolute left-0 pointer-events-none z-[90]"
            style={{
              top: g.position * containerSize.h,
              height: 0,
              width: containerSize.w,
              borderTop: "1.5px dashed #ef4444",
            }}
          />
        )
      )}

      {/* Interactive text overlays */}
      {elements.filter(el => !el._deleted).map((el) => (
        <DraggableTextBox
          key={el.id}
          element={el}
          containerW={containerSize.w}
          containerH={containerSize.h}
          slideWidthPx={slideWidthPx}
          isSelected={selectedIds.has(el.id)}
          isPrimary={selectedId === el.id}
          isEditing={editingId === el.id}
          onSelect={(multi) => onSelect(el.id, multi)}
          onStartEdit={() => onStartEdit(el.id)}
          onFinishEdit={onFinishEdit}
          onUpdate={(patch) => onUpdate(el.id, patch)}
          onDragMove={handleDragMove}
          onDragEnd={handleDragEnd}
        />
      ))}

      {/* Marquee selection rectangle */}
      {marquee && marquee.w > 2 && marquee.h > 2 && (
        <div
          className="absolute pointer-events-none z-[95]"
          style={{
            left: marquee.x,
            top: marquee.y,
            width: marquee.w,
            height: marquee.h,
            border: "1.5px dashed #3b82f6",
            background: "rgba(59,130,246,0.08)",
          }}
        />
      )}

      {/* Floating toolbar — rendered last so it sits above all text overlays */}
      {selectedElement && !editingId && (
        <FloatingToolbar
          element={selectedElement}
          onUpdate={(patch) => onUpdate(selectedElement.id, patch)}
          containerW={containerSize.w}
          containerH={containerSize.h}
        />
      )}
    </div>
  );
}


/* ── DraggableTextBox ───────────────────────────────────────────── */

// Resize handle directions: corners + edges
type ResizeDir = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";


function ResizeHandle({
  dir,
  onResizeStart,
}: {
  dir: ResizeDir;
  onResizeStart: (e: React.MouseEvent, dir: ResizeDir) => void;
}) {
  const posStyle: React.CSSProperties = (() => {
    const base: React.CSSProperties = { position: "absolute", width: 10, height: 10, background: "#fff", border: "2px solid #3b82f6", borderRadius: 2 };
    if (dir === "nw") return { ...base, top: -5, left: -5, cursor: "nw-resize" };
    if (dir === "n")  return { ...base, top: -5, left: "50%", transform: "translateX(-50%)", cursor: "n-resize" };
    if (dir === "ne") return { ...base, top: -5, right: -5, cursor: "ne-resize" };
    if (dir === "e")  return { ...base, top: "50%", right: -5, transform: "translateY(-50%)", cursor: "e-resize" };
    if (dir === "se") return { ...base, bottom: -5, right: -5, cursor: "se-resize" };
    if (dir === "s")  return { ...base, bottom: -5, left: "50%", transform: "translateX(-50%)", cursor: "s-resize" };
    if (dir === "sw") return { ...base, bottom: -5, left: -5, cursor: "sw-resize" };
    return { ...base, top: "50%", left: -5, transform: "translateY(-50%)", cursor: "w-resize" };
  })();

  return (
    <div
      style={posStyle}
      onMouseDown={(e) => { e.stopPropagation(); e.preventDefault(); onResizeStart(e, dir); }}
    />
  );
}

function normalizeFontFamily(raw: string): string {
  if (!raw || raw === "sans-serif") return "'OPPO Sans', 'PingFang SC', sans-serif";
  const lower = raw.toLowerCase().replace(/\s+/g, "");
  if (lower.includes("oppo")) return `'OPPO Sans', '${raw}', sans-serif`;
  if (lower.includes("pingfang")) return `'PingFang SC', '${raw}', sans-serif`;
  if (lower.includes("microsoft") || lower.includes("yahei")) return `'Microsoft YaHei', '${raw}', sans-serif`;
  if (lower.includes("heiti") || lower.includes("黑体")) return `'STHeiti', '${raw}', sans-serif`;
  if (lower.includes("songti") || lower.includes("宋体")) return `'STSong', '${raw}', serif`;
  return `'${raw}', 'OPPO Sans', 'PingFang SC', sans-serif`;
}

function DraggableTextBox({
  element: el,
  containerW,
  containerH,
  slideWidthPx,
  isSelected,
  isPrimary,
  isEditing,
  onSelect,
  onStartEdit,
  onFinishEdit,
  onUpdate,
  onDragMove,
  onDragEnd,
}: {
  element: ShapeElement;
  containerW: number;
  containerH: number;
  slideWidthPx: number;
  isSelected: boolean;   // 在选中集合中（含多选）
  isPrimary: boolean;    // 是主选元素（单选 or 最后点击的那个）
  isEditing: boolean;
  onSelect: (multi: boolean) => void;
  onStartEdit: () => void;
  onFinishEdit: () => void;
  onUpdate: (patch: Partial<ShapeElement>) => void;
  onDragMove: (id: string, rawX: number, rawY: number, w: number, h: number) => { x: number; y: number };
  onDragEnd: () => void;
}) {
  const [dragging, setDragging] = useState(false);
  const [resizing, setResizing] = useState(false);

  // Local drag position — visual position during drag, committed to parent only on mouseup
  const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null);
  const dragPosRef = useRef<{ x: number; y: number } | null>(null);

  // Always-fresh reference to el props — avoids stale closures in event handlers
  const elRef = useRef(el);
  elRef.current = el;

  const dragStartRef = useRef<{ mx: number; my: number; ox: number; oy: number } | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // During drag use local position; otherwise use committed el props
  const displayX = dragPos !== null ? dragPos.x : el.xPct;
  const displayY = dragPos !== null ? dragPos.y : el.yPct;

  const left = displayX * containerW;
  const top = displayY * containerH;
  const width = el.wPct * containerW;
  const height = el.hPct * containerH;
  const scaledFontSize = Math.max(8, el.fontSize * (containerW / slideWidthPx));

  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.select();
    }
  }, [isEditing]);

  // ── Drag to move ──
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (isEditing || resizing) return;
    e.stopPropagation();
    e.preventDefault();
    const multi = e.ctrlKey || e.metaKey || e.shiftKey;
    onSelect(multi);

    const cur = elRef.current;
    dragStartRef.current = { mx: e.clientX, my: e.clientY, ox: cur.xPct, oy: cur.yPct };
    const startPos = { x: cur.xPct, y: cur.yPct };
    dragPosRef.current = startPos;
    setDragPos(startPos);
    setDragging(true);

    const handleMove = (ev: MouseEvent) => {
      const start = dragStartRef.current;
      if (!start) return;
      const latest = elRef.current;
      const dx = (ev.clientX - start.mx) / containerW;
      const dy = (ev.clientY - start.my) / containerH;
      const MIN_ANCHOR = 0.05;
      const rawX = Math.max(0, Math.min(1 - MIN_ANCHOR, start.ox + dx));
      const rawY = Math.max(0, Math.min(1 - MIN_ANCHOR, start.oy + dy));
      const snapped = onDragMove(latest.id, rawX, rawY, latest.wPct, latest.hPct);
      dragPosRef.current = { x: snapped.x, y: snapped.y };
      setDragPos({ x: snapped.x, y: snapped.y });
    };
    const handleUp = () => {
      // Commit final position to global state once on release
      if (dragPosRef.current) {
        onUpdate({ xPct: dragPosRef.current.x, yPct: dragPosRef.current.y });
      }
      dragStartRef.current = null;
      dragPosRef.current = null;
      setDragPos(null);
      setDragging(false);
      onDragEnd();
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
  // el props deliberately excluded from deps — accessed via elRef to avoid stale closures
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEditing, resizing, containerW, containerH, onSelect, onUpdate, onDragMove, onDragEnd]);

  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (el.type === "image" || el.type === "card") return;
    onStartEdit();
  }, [onStartEdit]);

  // ── Resize handles ──
  const handleResizeStart = useCallback((e: React.MouseEvent, dir: ResizeDir) => {
    setResizing(true);
    const startMx = e.clientX;
    const startMy = e.clientY;
    // Capture start geometry from the ref so it's always fresh
    const { xPct: startX, yPct: startY, wPct: startW, hPct: startH } = elRef.current;
    const resizePosRef = { x: startX, y: startY, w: startW, h: startH };

    const handleMove = (ev: MouseEvent) => {
      const dx = (ev.clientX - startMx) / containerW;
      const dy = (ev.clientY - startMy) / containerH;
      let nx = startX, ny = startY, nw = startW, nh = startH;

      if (dir.includes("e")) { nw = Math.max(0.04, startW + dx); }
      if (dir.includes("w")) { const dw = -dx; nw = Math.max(0.04, startW + dw); nx = startX + startW - nw; }
      if (dir.includes("s")) { nh = Math.max(0.02, startH + dy); }
      if (dir.includes("n")) { const dh = -dy; nh = Math.max(0.02, startH + dh); ny = startY + startH - nh; }

      nx = Math.max(0, Math.min(1 - nw, nx));
      ny = Math.max(0, Math.min(1 - nh, ny));
      resizePosRef.x = nx; resizePosRef.y = ny;
      resizePosRef.w = nw; resizePosRef.h = nh;
      onUpdate({ xPct: nx, yPct: ny, wPct: nw, hPct: nh });
    };
    const handleUp = () => {
      setResizing(false);
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
  // el props excluded — read from elRef at call time
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [containerW, containerH, onUpdate]);

  const gradientActive = !!el.fontGradient;
  const resolvedFont = normalizeFontFamily(el.fontFamily);
  const textStyle: React.CSSProperties = {
    fontSize: scaledFontSize,
    fontFamily: resolvedFont,
    fontWeight: el.fontWeight,
    fontStyle: el.fontItalic ? "italic" : "normal",
    textDecorationLine: [
      el.fontUnderline ? "underline" : "",
      el.fontStrikethrough ? "line-through" : "",
    ].filter(Boolean).join(" ") || "none",
    textAlign: el.textAlign as React.CSSProperties["textAlign"],
    lineHeight: 1.3,
    whiteSpace: "pre-wrap",
    wordBreak: "break-all",
    overflowWrap: "break-word",
    ...(gradientActive ? {
      color: "transparent",
    } : {
      color: el.fontColor,
    }),
  };

  // ── Editing mode (text only) ──
  if (isEditing && el.type !== "image" && el.type !== "card") {
    return (
      <div
        className="absolute z-50"
        style={{ left, top, width, pointerEvents: "auto" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ position: "relative", width: "100%" }}>
          <textarea
            ref={textareaRef}
            value={el.text}
            onChange={(e) => {
              onUpdate({ text: e.target.value });
              // 自动撑高
              const t = e.target;
              t.style.height = "auto";
              t.style.height = t.scrollHeight + "px";
            }}
            onBlur={onFinishEdit}
            onKeyDown={(e) => { if (e.key === "Escape") { e.preventDefault(); onFinishEdit(); } }}
            style={{
              display: "block",
              width: "100%",
              minHeight: scaledFontSize * 1.5,
              height: "auto",
              background: "transparent",
              border: "none",
              outline: "none",
              resize: "none",
              padding: "2px 4px",
              fontSize: scaledFontSize,
              fontFamily: resolvedFont,
              fontWeight: el.fontWeight,
              fontStyle: el.fontItalic ? "italic" : "normal",
              textDecorationLine: [
                el.fontUnderline ? "underline" : "",
                el.fontStrikethrough ? "line-through" : "",
              ].filter(Boolean).join(" ") || "none",
              textAlign: el.textAlign,
              color: el.fontColor,
              lineHeight: 1.35,
              caretColor: "#3b82f6",
              overflow: "hidden",
            }}
          />
          {/* 与选中框完全相同的蓝色虚线边 */}
          <div
            className="absolute -inset-[2px] rounded-sm pointer-events-none"
            style={{ border: "2px dashed #3b82f6" }}
          />
        </div>
      </div>
    );
  }

  // ── Selected & Normal ──
  // 使用完整 width，保证 textAlign (center/right) 在 shape 内正确生效
  return (
    <div
      className={`absolute select-none ${dragging ? "z-50 cursor-grabbing" : resizing ? "z-50" : "cursor-grab"}`}
      style={{ left, top, width, pointerEvents: "auto", position: "absolute" }}
      onMouseDown={handleMouseDown}
      onDoubleClick={handleDoubleClick}
    >
      <div style={{ position: "relative", width: "100%" }}>
        {el.type === "card" ? (
          <div style={{
            width: "100%", height,
            background: el.fillColor
              ? `rgba(${parseInt(el.fillColor.slice(1,3),16)},${parseInt(el.fillColor.slice(3,5),16)},${parseInt(el.fillColor.slice(5,7),16)},${(el.fillOpacity ?? 100) / 100})`
              : "transparent",
            border: el.borderColor && el.borderWidth
              ? `${el.borderWidth * (containerW / slideWidthPx)}px solid rgba(${parseInt(el.borderColor.slice(1,3),16)},${parseInt(el.borderColor.slice(3,5),16)},${parseInt(el.borderColor.slice(5,7),16)},${(el.borderOpacity ?? 100) / 100})`
              : "none",
            borderRadius: el.borderRadius ? (el.borderRadius / 50000) * Math.min(width, height) * 0.5 : 0,
            boxSizing: "border-box",
            pointerEvents: "none",
          }} />
        ) : el.type === "image" && el.imageData ? (
          <img src={el.imageData} alt={el.name} style={{ width: "100%", height, objectFit: "contain", pointerEvents: "none" }} draggable={false} />
        ) : (
          <div style={textStyle}>
            {gradientActive ? (
              <span
                style={{
                  background: gradientToCss(el.fontGradient!),
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  backgroundClip: "text",
                  display: "inline",
                }}
              >{el.text}</span>
            ) : el.text}
          </div>
        )}

        {isSelected ? (
          <>
            {/* 主选：蓝色虚线；多选非主选：青色虚线 */}
            <div
              className="absolute -inset-[2px] rounded-sm"
              style={{
                pointerEvents: "none",
                border: isPrimary
                  ? "2px dashed #3b82f6"
                  : "2px dashed #22d3ee",
              }}
            />
            {/* Resize handles 只在主选时显示 */}
            {isPrimary && (["nw","n","ne","e","se","s","sw","w"] as ResizeDir[]).map(dir => (
              <ResizeHandle key={dir} dir={dir} onResizeStart={handleResizeStart} />
            ))}
            {/* 删除按钮（所有选中元素右上角外侧） */}
            {isPrimary && (
              <button
                className="absolute -right-2 -top-2 w-3.5 h-3.5 rounded-full bg-white/10 hover:bg-red-500/80 border border-white/20 hover:border-red-400 flex items-center justify-center text-white/50 hover:text-white backdrop-blur-sm transition-all duration-200"
                style={{ fontSize: 8, lineHeight: 1, zIndex: 210 }}
                onClick={(e) => { e.stopPropagation(); onUpdate({ _deleted: true }); }}
                title="删除 (Delete)"
              >
                ✕
              </button>
            )}
          </>
        ) : null}
      </div>
    </div>
  );
}


/* ── AlignToolbar ───────────────────────────────────────────────── */

function AlignToolbar({ onAlign }: { onAlign: (type: AlignType) => void }) {
  const btns: { type: AlignType; title: string; icon: React.ReactNode }[] = [
    {
      type: "left", title: "左对齐",
      icon: (
        <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
          <rect x="1" y="2" width="10" height="3" rx="0.5" />
          <rect x="1" y="7" width="14" height="3" rx="0.5" />
          <rect x="1" y="12" width="8" height="3" rx="0.5" />
          <rect x="0" y="0" width="1.5" height="16" rx="0.5" />
        </svg>
      ),
    },
    {
      type: "centerH", title: "水平居中对齐",
      icon: (
        <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
          <rect x="3" y="2" width="10" height="3" rx="0.5" />
          <rect x="1" y="7" width="14" height="3" rx="0.5" />
          <rect x="4" y="12" width="8" height="3" rx="0.5" />
          <rect x="7.25" y="0" width="1.5" height="16" rx="0.5" />
        </svg>
      ),
    },
    {
      type: "right", title: "右对齐",
      icon: (
        <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
          <rect x="5" y="2" width="10" height="3" rx="0.5" />
          <rect x="1" y="7" width="14" height="3" rx="0.5" />
          <rect x="7" y="12" width="8" height="3" rx="0.5" />
          <rect x="14.5" y="0" width="1.5" height="16" rx="0.5" />
        </svg>
      ),
    },
    {
      type: "top", title: "顶对齐",
      icon: (
        <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
          <rect x="2" y="3" width="3" height="10" rx="0.5" />
          <rect x="7" y="3" width="3" height="14" rx="0.5" />
          <rect x="12" y="3" width="3" height="8" rx="0.5" />
          <rect x="0" y="0" width="16" height="1.5" rx="0.5" />
        </svg>
      ),
    },
    {
      type: "middleV", title: "垂直居中对齐",
      icon: (
        <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
          <rect x="2" y="2" width="3" height="12" rx="0.5" />
          <rect x="7" y="0" width="3" height="16" rx="0.5" />
          <rect x="12" y="3" width="3" height="10" rx="0.5" />
          <rect x="0" y="7.25" width="16" height="1.5" rx="0.5" />
        </svg>
      ),
    },
    {
      type: "bottom", title: "底对齐",
      icon: (
        <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
          <rect x="2" y="3" width="3" height="10" rx="0.5" />
          <rect x="7" y="1" width="3" height="12" rx="0.5" />
          <rect x="12" y="5" width="3" height="8" rx="0.5" />
          <rect x="0" y="14.5" width="16" height="1.5" rx="0.5" />
        </svg>
      ),
    },
    {
      type: "distH", title: "水平均匀分布",
      icon: (
        <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
          <rect x="0" y="4" width="3" height="8" rx="0.5" />
          <rect x="6.5" y="4" width="3" height="8" rx="0.5" />
          <rect x="13" y="4" width="3" height="8" rx="0.5" />
          <rect x="0" y="7.25" width="16" height="1.5" rx="0.5" opacity="0.3"/>
        </svg>
      ),
    },
    {
      type: "distV", title: "垂直均匀分布",
      icon: (
        <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
          <rect x="4" y="0" width="8" height="3" rx="0.5" />
          <rect x="4" y="6.5" width="8" height="3" rx="0.5" />
          <rect x="4" y="13" width="8" height="3" rx="0.5" />
          <rect x="7.25" y="0" width="1.5" height="16" rx="0.5" opacity="0.3"/>
        </svg>
      ),
    },
  ];

  return (
    <div className="flex items-center gap-0.5 frosted rounded-lg px-1.5 py-1">
      <span className="text-[9px] text-[#adaaaa]/50 mr-1 font-bold uppercase tracking-wider">对齐</span>
      {btns.map((b) => (
        <button
          key={b.type}
          title={b.title}
          onClick={() => onAlign(b.type)}
          className="w-6 h-6 flex items-center justify-center rounded text-[#adaaaa] hover:bg-[#cafd00]/10 hover:text-[#cafd00] transition"
        >
          {b.icon}
        </button>
      ))}
    </div>
  );
}


/* ── Thumbnail item ─────────────────────────────────────────────── */

function ThumbItem({
  index, slide, jobId, previewCount, isActive, isDirty, previewVer, onClick,
  thumbElements, slideWidthPx,
}: {
  index: number; slide: SlideItem; jobId: string; previewCount: number;
  isActive: boolean; isDirty: boolean; previewVer: number; onClick: () => void;
  thumbElements?: ShapeElement[];
  slideWidthPx: number;
}) {
  const hasPreview = index < previewCount;
  const bgUrl = hasPreview ? `${API_BASE}/api/jobs/${jobId}/preview-bg/${index}?v=${previewVer}` : null;
  const [loaded, setLoaded] = useState(false);
  const [errored, setErrored] = useState(false);
  const thumbRef = useRef<HTMLDivElement>(null);
  const [thumbW, setThumbW] = useState(0);

  useEffect(() => { setLoaded(false); setErrored(false); }, [previewVer]);
  useEffect(() => {
    const el = thumbRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setThumbW(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const ptInfo = slide.page_type ? PAGE_TYPE_LABELS[slide.page_type] : null;
  const scale = thumbW > 0 && slideWidthPx > 0 ? thumbW / slideWidthPx : 0;

  return (
    <div onClick={onClick}
      className={`group cursor-pointer rounded-lg overflow-hidden transition-all duration-200 ${
        isActive
          ? "ring-2 ring-[#cafd00] shadow-[0_0_12px_rgba(202,253,0,0.2)]"
          : "ring-1 ring-white/[0.06] hover:ring-white/20"
      }`}
    >
      <div className="relative">
        {/* 页码 */}
        <div className="absolute top-1 left-1 z-10 bg-black/70 text-white text-[8px] font-black
          px-1.5 py-0.5 rounded min-w-[18px] text-center">
          {index + 1}
        </div>
        {ptInfo && (
          <div
            className="absolute bottom-1 left-1 z-10 text-[7px] font-bold px-1 py-0.5 rounded"
            style={{ background: ptInfo.color + "28", color: ptInfo.color, border: `1px solid ${ptInfo.color}40` }}
            title={`AI识别: ${slide.page_type}${slide.block_structure ? ` / ${slide.block_structure}` : ""}`}
          >
            {ptInfo.label}
          </div>
        )}
        {isDirty && (
          <div className="absolute top-1 right-1 z-10 w-2 h-2 bg-[#cafd00] rounded-full
            shadow-[0_0_4px_rgba(202,253,0,0.8)] lc-pulse-dot" title="有未保存的修改" />
        )}
        <div ref={thumbRef} className="aspect-[16/9] bg-[#1a1919] relative overflow-hidden">
          {bgUrl && !errored ? (
            <>
              {!loaded && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-3 h-3 border border-white/10 border-t-[#cafd00]/60 rounded-full lc-spin" />
                </div>
              )}
              <img src={bgUrl} alt={`第 ${index + 1} 页`}
                className={`w-full h-full object-cover transition-opacity ${loaded ? "opacity-100" : "opacity-0"}`}
                onLoad={() => setLoaded(true)} onError={() => setErrored(true)} />
              {/* 文字叠加层：和右侧画布相同的渲染方式 */}
              {loaded && thumbElements && scale > 0 && thumbElements.filter(el => !el._deleted).map(el => {
                if (el.type === "image") return null;
                const fs = Math.max(1, el.fontSize * scale);
                const resolvedFont = normalizeFontFamily(el.fontFamily);
                const hasGrad = !!el.fontGradient;
                return (
                  <div key={el.id} className="absolute" style={{
                    left: `${el.xPct * 100}%`, top: `${el.yPct * 100}%`,
                    width: `${el.wPct * 100}%`, height: `${el.hPct * 100}%`,
                    pointerEvents: "none", overflow: "hidden",
                  }}>
                    {el.type === "card" ? (
                      <div style={{
                        width: "100%", height: "100%",
                        background: el.fillColor
                          ? `rgba(${parseInt(el.fillColor.slice(1,3),16)},${parseInt(el.fillColor.slice(3,5),16)},${parseInt(el.fillColor.slice(5,7),16)},${(el.fillOpacity ?? 100) / 100})`
                          : "transparent",
                        border: el.borderColor && el.borderWidth
                          ? `${Math.max(0.5, el.borderWidth * scale)}px solid rgba(${parseInt(el.borderColor.slice(1,3),16)},${parseInt(el.borderColor.slice(3,5),16)},${parseInt(el.borderColor.slice(5,7),16)},${(el.borderOpacity ?? 100) / 100})`
                          : "none",
                        borderRadius: el.borderRadius ? (el.borderRadius / 50000) * Math.min(el.wPct * thumbW, el.hPct * thumbW / (16/9)) * 0.5 : 0,
                        boxSizing: "border-box",
                      }} />
                    ) : (
                      <div style={{
                        fontSize: fs, fontFamily: resolvedFont,
                        fontWeight: el.fontWeight, color: hasGrad ? undefined : el.fontColor,
                        fontStyle: el.fontItalic ? "italic" : "normal",
                        textAlign: el.textAlign || "left",
                        lineHeight: 1.2, whiteSpace: "pre-wrap", wordBreak: "break-word",
                        textDecoration: [el.fontUnderline && "underline", el.fontStrikethrough && "line-through"].filter(Boolean).join(" ") || undefined,
                      }}>
                        {hasGrad ? (
                          <span style={{
                            background: gradientToCss(el.fontGradient!),
                            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
                            backgroundClip: "text",
                          }}>{el.text}</span>
                        ) : el.text}
                      </div>
                    )}
                  </div>
                );
              })}
            </>
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center px-2 py-1 bg-[#1e1e1e]">
              {slide.title && <p className="text-white/40 text-[8px] font-medium text-center leading-tight line-clamp-2">{slide.title}</p>}
            </div>
          )}
        </div>
      </div>
      <div className={`px-2 py-1.5 transition-colors ${isActive ? "bg-[#cafd00]/8" : "bg-[#161616]"}`}>
        <p className={`text-[9px] font-semibold truncate ${isActive ? "text-[#cafd00]" : "text-[#adaaaa]/60"}`}>
          {slide.title || `第 ${index + 1} 页`}
        </p>
        {slide.block_structure && (
          <p className="text-[7px] text-white/20 truncate mt-0.5">{slide.block_structure}</p>
        )}
      </div>
    </div>
  );
}


/* ── Icons ──────────────────────────────────────────────────────── */

function DownloadIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
    </svg>
  );
}

function AlignLeftIcon() {
  return (
    <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="currentColor">
      <path d="M2 3h12v1.5H2zm0 4h8v1.5H2zm0 4h10v1.5H2z" />
    </svg>
  );
}

function AlignCenterIcon() {
  return (
    <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="currentColor">
      <path d="M2 3h12v1.5H2zm3 4h6v1.5H5zm1 4h4v1.5H6z" />
    </svg>
  );
}

function AlignRightIcon() {
  return (
    <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="currentColor">
      <path d="M2 3h12v1.5H2zm4 4h8v1.5H6zm2 4h6v1.5H8z" />
    </svg>
  );
}
