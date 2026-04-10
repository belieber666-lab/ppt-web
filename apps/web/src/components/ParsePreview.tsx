"use client";

import { useCallback, useState } from "react";

/* ── Types ────────────────────────────────────────────────────── */

export interface TaggedLineData {
  text: string;
  role: string;
  source: string;
  level: number;
}

export interface ParsedBlockData {
  title: string;
  desc: string;
}

export interface ParsedPageData {
  page_index: number;
  page_type: string;
  title: string;
  subtitle: string;
  blocks: ParsedBlockData[];
  data_items?: { value: string; label: string }[];
  unused_lines: string[];
  tagged_lines: TaggedLineData[];
}

/* ── Role definitions (5 categories) ─────────────────────────── */

const ROLES = [
  { value: "page_title",  label: "页面主标题", color: "#cafd00", icon: "title" },
  { value: "block_title", label: "模块标题",   color: "#7cff67", icon: "widgets" },
  { value: "block_desc",  label: "模块说明",   color: "#67d4ff", icon: "notes" },
  { value: "paragraph",   label: "正文",       color: "#c4a8ff", icon: "article" },
  { value: "data",        label: "数据类",     color: "#ffd467", icon: "monitoring" },
] as const;

function roleInfo(r: string) {
  return ROLES.find(ro => ro.value === r) ?? ROLES[3];
}

const PAGE_TYPES = [
  { value: "hero",    label: "封面页",     color: "#cafd00" },
  { value: "content", label: "内容页",     color: "#7cff67" },
  { value: "vlist",   label: "竖向列表页", color: "#67d4ff" },
  { value: "closing", label: "结尾页",     color: "#ff8ec4" },
];

function normalizePageType(t: string): string {
  if (t === "hero") return "hero";
  if (t === "closing") return "closing";
  if (t === "vlist") return "vlist";
  return "content";
}

function typeLabel(t: string) {
  const norm = normalizePageType(t);
  return PAGE_TYPES.find(p => p.value === norm) ?? PAGE_TYPES[1];
}

/* ── Props ────────────────────────────────────────────────────── */

interface ParsePreviewProps {
  pages: ParsedPageData[];
  onChange: (pages: ParsedPageData[]) => void;
}

/* ── Component ────────────────────────────────────────────────── */

export function ParsePreview({ pages, onChange }: ParsePreviewProps) {
  const [activePage, setActivePage] = useState(0);
  const [undoStack, setUndoStack] = useState<ParsedPageData[][]>([]);
  const [redoStack, setRedoStack] = useState<ParsedPageData[][]>([]);
  const current = pages[activePage];

  const pushUndo = useCallback(() => {
    setUndoStack(prev => [...prev.slice(-30), pages]);
    setRedoStack([]);
  }, [pages]);

  const undo = useCallback(() => {
    if (undoStack.length === 0) return;
    const prev = undoStack[undoStack.length - 1];
    setRedoStack(r => [...r, pages]);
    setUndoStack(u => u.slice(0, -1));
    onChange(prev);
  }, [undoStack, pages, onChange]);

  const redo = useCallback(() => {
    if (redoStack.length === 0) return;
    const next = redoStack[redoStack.length - 1];
    setUndoStack(u => [...u, pages]);
    setRedoStack(r => r.slice(0, -1));
    onChange(next);
  }, [redoStack, pages, onChange]);

  const updatePage = useCallback(
    (idx: number, patch: Partial<ParsedPageData>) => {
      pushUndo();
      onChange(pages.map((p, i) => (i === idx ? { ...p, ...patch } : p)));
    },
    [pages, onChange, pushUndo],
  );

  const updateLine = useCallback(
    (pageIdx: number, lineIdx: number, patch: Partial<TaggedLineData>) => {
      pushUndo();
      const p = pages[pageIdx];
      const newLines = p.tagged_lines.map((l, i) =>
        i === lineIdx ? { ...l, ...patch } : l
      );
      onChange(pages.map((pg, i) => (i === pageIdx ? { ...pg, tagged_lines: newLines } : pg)));
    },
    [pages, onChange, pushUndo],
  );

  const removeLine = useCallback(
    (pageIdx: number, lineIdx: number) => {
      pushUndo();
      const p = pages[pageIdx];
      onChange(pages.map((pg, i) =>
        i === pageIdx
          ? { ...pg, tagged_lines: pg.tagged_lines.filter((_, j) => j !== lineIdx) }
          : pg
      ));
    },
    [pages, onChange, pushUndo],
  );

  const addLine = useCallback(
    (pageIdx: number) => {
      pushUndo();
      const p = pages[pageIdx];
      onChange(pages.map((pg, i) =>
        i === pageIdx
          ? {
              ...pg,
              tagged_lines: [
                ...pg.tagged_lines,
                { text: "", role: "paragraph", source: "body", level: 0 },
              ],
            }
          : pg
      ));
    },
    [pages, onChange, pushUndo],
  );

  if (!current) return null;

  const lines = current.tagged_lines ?? [];
  const displayPageType = normalizePageType(current.page_type);

  return (
    <div className="flex gap-6 min-h-[520px]">
      {/* ─── 左栏：页面列表 ─── */}
      <aside className="w-56 shrink-0 flex flex-col">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold text-white tracking-wide">页面列表</h3>
          <span className="text-[10px] font-medium text-white/40 bg-white/[0.06] rounded-full px-2.5 py-1">
            {pages.length} 页
          </span>
        </div>

        <div className="space-y-2 overflow-y-auto max-h-[56vh] pr-1 flex-1
          scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
          {pages.map((pg, i) => {
            const t = typeLabel(pg.page_type);
            const active = i === activePage;
            return (
              <button
                key={pg.page_index}
                onClick={() => setActivePage(i)}
                className={`
                  w-full text-left rounded-xl transition-all duration-200
                  ${active
                    ? "bg-white/[0.07] ring-1 ring-[#cafd00]/40 shadow-lg shadow-[#cafd00]/5"
                    : "bg-white/[0.03] hover:bg-white/[0.06] ring-1 ring-transparent hover:ring-white/10"}
                `}
                style={{ padding: "12px 14px" }}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span
                        className="text-[9px] font-bold tracking-wider shrink-0"
                        style={{ color: active ? t.color : "rgba(255,255,255,0.35)" }}
                      >
                        第{i + 1}页
                      </span>
                      <span
                        className="text-[9px] font-bold px-1.5 py-0.5 rounded-full shrink-0"
                        style={{ backgroundColor: t.color + "20", color: t.color }}
                      >
                        {t.label}
                      </span>
                    </div>
                    <p className={`text-[13px] font-semibold break-words leading-snug ${active ? "text-white" : "text-white/60"}`}>
                      {pg.title || t.label}
                    </p>
                  </div>
                  {active && (
                    <div className="w-5 h-5 rounded-full bg-[#cafd00]/20 flex items-center justify-center shrink-0">
                      <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                        <path d="M1 4L3.5 6.5L9 1" stroke="#cafd00" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </aside>

      {/* ─── 右栏：预览编辑内容 ─── */}
      <section className="flex-1 min-w-0 flex flex-col">
        {/* 头部 */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <h3 className="text-base font-bold text-white">预览编辑内容</h3>
            <span className="text-[10px] font-medium text-white/40 bg-white/[0.06] rounded-full px-2.5 py-1">
              第{activePage + 1}页
            </span>
            {/* 页面类型选择 */}
            <select
              value={displayPageType}
              onChange={e => updatePage(activePage, { page_type: e.target.value })}
              className="bg-white/[0.06] text-[11px] text-white/70 rounded-full px-3 py-1
                border border-white/10 focus:border-[#cafd00]/50 focus:outline-none
                transition-colors cursor-pointer ml-1"
            >
              {PAGE_TYPES.map(pt => (
                <option
                  key={pt.value}
                  value={pt.value}
                  style={{ background: "#1a1919", color: pt.color }}
                >
                  {pt.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={undo}
              disabled={undoStack.length === 0}
              className="w-8 h-8 rounded-lg bg-white/[0.06] hover:bg-white/[0.10] disabled:opacity-30
                flex items-center justify-center transition-all"
              title="撤销"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                className="text-white/60">
                <path d="M3 10h10a5 5 0 0 1 0 10H9" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M7 6L3 10l4 4" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
            <button
              onClick={redo}
              disabled={redoStack.length === 0}
              className="w-8 h-8 rounded-lg bg-white/[0.06] hover:bg-white/[0.10] disabled:opacity-30
                flex items-center justify-center transition-all"
              title="重做"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                className="text-white/60">
                <path d="M21 10H11a5 5 0 0 0 0 10h4" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M17 6l4 4-4 4" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          </div>
        </div>

        {/* 内容区 */}
        <div className="flex-1 overflow-y-auto max-h-[56vh] pr-1 space-y-3
          scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
          {lines.length === 0 && (
            <div className="flex items-center justify-center py-16">
              <p className="text-sm text-white/20">此页无文字内容</p>
            </div>
          )}

          {lines.map((line, li) => {
            const ri = roleInfo(line.role);
            const isTitle = line.role === "page_title";
            return (
              <div
                key={li}
                className="group rounded-xl bg-white/[0.04] hover:bg-white/[0.06]
                  border border-white/[0.06] hover:border-white/[0.10]
                  transition-all duration-200"
                style={{ padding: "14px 16px" }}
              >
                {/* 角色标签行 */}
                <div className="flex items-center justify-between mb-2.5">
                  <select
                    value={line.role}
                    onChange={e => updateLine(activePage, li, { role: e.target.value })}
                    className="text-[10px] font-bold rounded-full px-3 py-1 border
                      cursor-pointer focus:outline-none transition-colors"
                    style={{
                      backgroundColor: ri.color + "18",
                      borderColor: ri.color + "30",
                      color: ri.color,
                    }}
                  >
                    {ROLES.map(r => (
                      <option
                        key={r.value}
                        value={r.value}
                        style={{ background: "#1a1919", color: r.color }}
                      >
                        {r.label}
                      </option>
                    ))}
                  </select>

                  <button
                    onClick={() => removeLine(activePage, li)}
                    className="w-6 h-6 rounded-md flex items-center justify-center
                      text-white/20 hover:text-red-400 hover:bg-red-400/10
                      opacity-0 group-hover:opacity-100 transition-all"
                    title="删除此行"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
                      stroke="currentColor" strokeWidth="2">
                      <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round"/>
                    </svg>
                  </button>
                </div>

                {/* 文字内容 */}
                {isTitle ? (
                  <input
                    type="text"
                    value={line.text}
                    onChange={e => updateLine(activePage, li, { text: e.target.value })}
                    placeholder="输入标题"
                    className="w-full bg-transparent text-lg font-bold text-white
                      placeholder:text-white/15 focus:outline-none border-none"
                  />
                ) : line.role === "paragraph" || line.role === "block_desc" ? (
                  <textarea
                    value={line.text}
                    onChange={e => updateLine(activePage, li, { text: e.target.value })}
                    placeholder="输入内容"
                    rows={Math.max(2, Math.ceil(line.text.length / 40))}
                    className={`w-full bg-transparent text-[13px] leading-relaxed resize-none
                      placeholder:text-white/15 focus:outline-none border-none
                      ${line.role === "block_desc" ? "text-white/50" : "text-white/70"}`}
                  />
                ) : (
                  <input
                    type="text"
                    value={line.text}
                    onChange={e => updateLine(activePage, li, { text: e.target.value })}
                    placeholder="输入内容"
                    className={`w-full bg-transparent text-[13px] font-medium
                      placeholder:text-white/15 focus:outline-none border-none
                      ${line.role === "block_title" ? "text-white/90" : ""}
                      ${line.role === "data" ? "font-mono text-[#ffd467]/80" : "text-white/80"}`}
                  />
                )}
              </div>
            );
          })}

          {/* 添加内容行 */}
          <button
            onClick={() => addLine(activePage)}
            className="w-full flex items-center justify-center gap-2 py-3.5
              rounded-xl border border-dashed border-white/[0.08] hover:border-white/[0.18]
              text-white/25 hover:text-white/50 transition-all duration-200
              hover:bg-white/[0.02]"
          >
            <span className="text-lg leading-none">+</span>
            <span className="text-[11px] font-medium">添加内容行</span>
          </button>
        </div>
      </section>
    </div>
  );
}
