"use client";

import { useState } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "/api-backend";

export interface TemplateItem {
  id: string;
  name: string;
  filename: string;
  slide_count: number;
  created_at: string;
  bg_color: string;
  thumbnail_url: string | null;
}

interface Props {
  templates: TemplateItem[];
  selected: string | null;
  onSelect: (id: string) => void;
}

export function TemplatePicker({ templates, selected, onSelect }: Props) {
  return (
    <div className="space-y-6">
      {templates.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-14 rounded-2xl
          border border-dashed border-white/10 bg-white/[0.02]">
          <span className="material-symbols-outlined text-4xl text-white/20 mb-3"
            style={{ fontVariationSettings: "'FILL' 1" }}>folder_open</span>
          <p className="text-sm font-medium text-[#adaaaa]">暂无可用模板</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {templates.map((t) => (
            <TemplateCard
              key={t.id}
              template={t}
              isSelected={selected === t.id}
              onSelect={() => onSelect(t.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}


/* ── 单张模板卡片（只读） ─────────────────────────────────────────── */

function TemplateCard({
  template: t, isSelected, onSelect,
}: {
  template: TemplateItem;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const [thumbUrl] = useState(
    t.thumbnail_url ? `${API_BASE}${t.thumbnail_url}` : null
  );
  const bgHex = t.bg_color ? `#${t.bg_color}` : "#1e293b";

  return (
    <div
      onClick={onSelect}
      className={`
        group relative cursor-pointer rounded-xl overflow-hidden transition-all duration-200
        ${isSelected
          ? "ring-2 ring-[#cafd00] shadow-[0_0_20px_rgba(202,253,0,0.2)]"
          : "ring-1 ring-white/[0.06] hover:ring-white/20 hover:shadow-[0_4px_20px_rgba(0,0,0,0.5)]"
        }
      `}
    >
      {/* 缩略图 */}
      <div className="aspect-[16/9] relative" style={{ background: thumbUrl ? undefined : bgHex }}>
        {thumbUrl ? (
          <img src={thumbUrl} alt={t.name} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <span className="text-white/20 text-xs">无预览</span>
          </div>
        )}

        {isSelected && (
          <div className="absolute inset-0 bg-[#cafd00]/10 flex items-center justify-center">
            <div className="w-7 h-7 rounded-full bg-[#cafd00] text-[#516700] flex items-center justify-center text-sm font-black shadow-lg">
              ✓
            </div>
          </div>
        )}
      </div>

      {/* 信息栏 */}
      <div className={`px-3 py-2.5 transition-colors ${isSelected ? "bg-[#cafd00]/8" : "bg-[#1a1919]"}`}>
        <p className={`text-sm font-bold truncate select-none
          ${isSelected ? "text-[#cafd00]" : "text-white/80"}`}>
          {t.name}
        </p>
        <p className="text-[10px] text-[#adaaaa]/50 mt-0.5">{t.slide_count} 页版式</p>
      </div>
    </div>
  );
}
