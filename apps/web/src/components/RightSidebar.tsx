"use client";

import { useEffect, useState } from "react";
import type { Element } from "@ppt-web/core";

export type RightTab = "style";

type RightSidebarProps = {
  onApplyTheme: (theme: { canvasBackground: string; accent: string }) => void;
  selectedElement: Element | null;
  onUpdateSelectedElement: (updater: (element: Element) => Element) => void;
  onArrangeSelected: (action: "front" | "forward" | "backward" | "back") => void;
};

export function RightSidebar({
  onApplyTheme,
  selectedElement,
  onUpdateSelectedElement,
  onArrangeSelected,
}: RightSidebarProps) {
  const [inspectorTab, setInspectorTab] = useState<"style" | "text" | "arrange">("text");
  const [formatTab, setFormatTab] = useState<"style" | "layout">("style");
  const textElement = selectedElement?.type === "text" ? selectedElement : null;

  useEffect(() => {
    if (selectedElement?.type === "text") {
      setInspectorTab("text");
    }
  }, [selectedElement]);

  const updateTextStyle = (
    patch: Partial<NonNullable<typeof textElement>["text"]["style"]>
  ) => {
    onUpdateSelectedElement((element) =>
      element.type === "text"
        ? {
            ...element,
            text: {
              ...element.text,
              style: {
                ...element.text.style,
                ...patch,
              },
            },
          }
        : element
    );
  };

  return (
    <aside className="flex w-[350px] flex-col border-l border-white/70 bg-white/55 backdrop-blur-xl">
      <div className="flex flex-1 flex-col overflow-hidden px-4 py-4">
        <div className="mb-4 rounded-2xl border border-white/70 bg-white/80 p-3 shadow-[0_10px_28px_rgba(15,23,42,0.08)]">
          <div className="mb-2 text-sm font-semibold text-zinc-700">样式面板</div>
            <div className="mb-3 grid grid-cols-3 gap-1 rounded-xl bg-zinc-100 p-1">
              <button
                type="button"
                onClick={() => setInspectorTab("style")}
                className={`rounded-[8px] px-2 py-1.5 text-xs font-medium ${
                  inspectorTab === "style" ? "bg-[#0071e3] text-white shadow-sm" : "text-zinc-700 hover:bg-zinc-200"
                }`}
              >
                样式
              </button>
              <button
                type="button"
                onClick={() => setInspectorTab("text")}
                className={`rounded-[8px] px-2 py-1.5 text-xs font-medium ${
                  inspectorTab === "text" ? "bg-[#0071e3] text-white shadow-sm" : "text-zinc-700 hover:bg-zinc-200"
                }`}
              >
                文本
              </button>
              <button
                type="button"
                onClick={() => setInspectorTab("arrange")}
                className={`rounded-[8px] px-2 py-1.5 text-xs font-medium ${
                  inspectorTab === "arrange" ? "bg-[#0071e3] text-white shadow-sm" : "text-zinc-700 hover:bg-zinc-200"
                }`}
              >
                排列
              </button>
            </div>

            {!selectedElement ? (
              <div className="rounded-xl border border-zinc-200 bg-white p-3 text-xs text-zinc-500 shadow-sm">
                请选择一个元素后进行样式编辑
              </div>
            ) : null}

            {selectedElement?.type === "rect" && inspectorTab === "style" ? (
              <div className="space-y-3 rounded-xl border border-zinc-200 bg-white p-3 shadow-sm">
                <div className="text-xs font-medium text-zinc-700">形状样式</div>
                <label className="flex items-center justify-between gap-2 text-xs text-zinc-600">
                  填充颜色
                  <input
                    type="color"
                    value={selectedElement.rect.fill}
                    onChange={(e) =>
                      onUpdateSelectedElement((element) =>
                        element.type === "rect"
                          ? { ...element, rect: { ...element.rect, fill: e.target.value } }
                          : element
                      )
                    }
                    className="h-7 w-10 rounded-lg border border-zinc-200 bg-white"
                  />
                </label>
              </div>
            ) : null}

            {textElement && inspectorTab === "text" ? (
              <div className="space-y-3">
                <select className="h-10 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm font-semibold text-zinc-900 shadow-sm">
                  <option>大标题</option>
                  <option>标题</option>
                  <option>正文</option>
                  <option>注释</option>
                </select>

                <div className="grid grid-cols-2 gap-1 rounded-xl border border-zinc-200 bg-zinc-100 p-1">
                  <button
                    type="button"
                    onClick={() => setFormatTab("style")}
                    className={`rounded-[6px] px-2 py-1 text-xs font-medium ${
                      formatTab === "style" ? "bg-white text-zinc-800 shadow-sm" : "text-zinc-600"
                    }`}
                  >
                    样式
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormatTab("layout")}
                    className={`rounded-[6px] px-2 py-1 text-xs font-medium ${
                      formatTab === "layout" ? "bg-white text-zinc-800 shadow-sm" : "text-zinc-600"
                    }`}
                  >
                    布局
                  </button>
                </div>

                {formatTab === "style" ? (
                  <>
                    <div className="border-t border-zinc-200 pt-3">
                      <div className="mb-1 text-xs font-medium text-zinc-700">字体</div>
                      <select
                        value={textElement.text.style.fontFamily}
                        onChange={(e) => updateTextStyle({ fontFamily: e.target.value })}
                        className="h-9 w-full rounded-xl border border-zinc-200 bg-white px-2 text-sm shadow-sm"
                      >
                        <option value="Helvetica Neue, Arial, sans-serif">Helvetica Neue</option>
                        <option value="system-ui, sans-serif">系统默认</option>
                        <option value="PingFang SC, sans-serif">苹方</option>
                        <option value="Microsoft YaHei, sans-serif">微软雅黑</option>
                        <option value="Arial, sans-serif">Arial</option>
                      </select>
                    </div>

                    <div className="grid grid-cols-[1fr_auto] gap-2">
                      <select
                        value={String(textElement.text.style.fontWeight ?? 400)}
                        onChange={(e) => updateTextStyle({ fontWeight: Number(e.target.value) })}
                        className="h-9 rounded-xl border border-zinc-200 bg-white px-2 text-sm shadow-sm"
                      >
                        <option value="400">常规</option>
                        <option value="500">中等</option>
                        <option value="700">粗体</option>
                        <option value="800">特粗</option>
                      </select>
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          min={10}
                          max={240}
                          value={textElement.text.style.fontSize}
                          onChange={(e) =>
                            updateTextStyle({
                              fontSize: Math.max(10, Number(e.target.value) || 10),
                            })
                          }
                          className="h-9 w-16 rounded-xl border border-zinc-200 bg-white px-2 text-sm shadow-sm"
                        />
                        <span className="text-xs text-zinc-600">点</span>
                      </div>
                    </div>

                    <div className="grid grid-cols-4 gap-1 rounded-xl border border-zinc-200 bg-white p-1 shadow-sm">
                      <button
                        type="button"
                        onClick={() =>
                          updateTextStyle({
                            fontWeight: (textElement.text.style.fontWeight ?? 400) >= 600 ? 400 : 700,
                          })
                        }
                        className={`rounded-[6px] px-2 py-1 text-sm ${
                          (textElement.text.style.fontWeight ?? 400) >= 600
                            ? "bg-[#0071e3] text-white"
                            : "text-zinc-600 hover:bg-zinc-100"
                        }`}
                      >
                        B
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          updateTextStyle({ underline: !(textElement.text.style.underline ?? false) })
                        }
                        className={`rounded-[6px] px-2 py-1 text-sm font-semibold ${
                          textElement.text.style.underline
                            ? "bg-[#0071e3] text-white"
                            : "text-zinc-600 hover:bg-zinc-100"
                        }`}
                      >
                        U
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          updateTextStyle({
                            strikeThrough: !(textElement.text.style.strikeThrough ?? false),
                          })
                        }
                        className={`rounded-[6px] px-2 py-1 text-sm font-semibold ${
                          textElement.text.style.strikeThrough
                            ? "bg-[#0071e3] text-white"
                            : "text-zinc-600 hover:bg-zinc-100"
                        }`}
                      >
                        S
                      </button>
                      <button type="button" className="rounded-[6px] px-2 py-1 text-sm text-zinc-600 hover:bg-zinc-100">
                        ⚙
                      </button>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-xs text-zinc-700">字符样式</span>
                      <select className="w-28 rounded-lg border border-zinc-200 bg-white px-2 py-1 text-xs shadow-sm">
                        <option>无</option>
                      </select>
                    </div>

                    <label className="flex items-center justify-between text-xs text-zinc-700">
                      <span>字间距</span>
                      <input
                        type="number"
                        min={-5}
                        max={20}
                        step="0.5"
                        value={textElement.text.style.letterSpacing ?? 0}
                        onChange={(e) =>
                          updateTextStyle({
                            letterSpacing: Math.max(-5, Math.min(20, Number(e.target.value) || 0)),
                          })
                        }
                        className="h-8 w-20 rounded-lg border border-zinc-200 bg-white px-2 py-1 shadow-sm"
                      />
                    </label>

                    <div className="flex items-center justify-between">
                      <span className="text-xs text-zinc-700">文本颜色</span>
                      <input
                        type="color"
                        value={textElement.text.style.color}
                        onChange={(e) => updateTextStyle({ color: e.target.value })}
                        className="h-7 w-16 rounded-lg border border-zinc-200 bg-white"
                      />
                    </div>
                  </>
                ) : null}

                {formatTab === "layout" ? (
                  <>
                    <div className="border-t border-zinc-200 pt-3">
                      <div className="mb-2 text-xs font-semibold text-zinc-700">对齐与布局</div>
                      <div className="grid grid-cols-3 gap-1 rounded-xl border border-zinc-200 bg-white p-1 shadow-sm">
                        <button
                          type="button"
                          onClick={() => updateTextStyle({ align: "left" })}
                          className={`rounded-[6px] px-2 py-1 text-xs ${
                            (textElement.text.style.align ?? "left") === "left"
                              ? "bg-[#0071e3] text-white"
                              : "text-zinc-600 hover:bg-zinc-100"
                          }`}
                        >
                          左
                        </button>
                        <button
                          type="button"
                          onClick={() => updateTextStyle({ align: "center" })}
                          className={`rounded-[6px] px-2 py-1 text-xs ${
                            textElement.text.style.align === "center"
                              ? "bg-[#0071e3] text-white"
                              : "text-zinc-600 hover:bg-zinc-100"
                          }`}
                        >
                          中
                        </button>
                        <button
                          type="button"
                          onClick={() => updateTextStyle({ align: "right" })}
                          className={`rounded-[6px] px-2 py-1 text-xs ${
                            textElement.text.style.align === "right"
                              ? "bg-[#0071e3] text-white"
                              : "text-zinc-600 hover:bg-zinc-100"
                          }`}
                        >
                          右
                        </button>
                      </div>
                    </div>

                    <label className="flex items-center gap-2 text-xs text-zinc-700">
                      <input
                        type="checkbox"
                        checked={textElement.text.style.vertical ?? false}
                        onChange={(e) => updateTextStyle({ vertical: e.target.checked })}
                      />
                      竖排文本
                    </label>

                    <div className="border-t border-zinc-200 pt-3">
                      <div className="mb-2 text-xs font-semibold text-zinc-700">间距</div>
                      <div className="space-y-2">
                        <label className="flex items-center justify-between text-xs text-zinc-700">
                          <span>行距</span>
                          <input
                            type="number"
                            step="0.1"
                            min={0.8}
                            max={3}
                            value={textElement.text.style.lineHeight ?? 1.35}
                            onChange={(e) =>
                              updateTextStyle({
                                lineHeight: Math.min(3, Math.max(0.8, Number(e.target.value) || 1.35)),
                              })
                            }
                            className="h-8 w-20 rounded-lg border border-zinc-200 bg-white px-2 py-1 shadow-sm"
                          />
                        </label>
                        <label className="flex items-center justify-between text-xs text-zinc-700">
                          <span>段前</span>
                          <input
                            type="number"
                            min={0}
                            max={80}
                            value={textElement.text.style.paragraphBefore ?? 0}
                            onChange={(e) =>
                              updateTextStyle({
                                paragraphBefore: Math.max(0, Math.min(80, Number(e.target.value) || 0)),
                              })
                            }
                            className="h-8 w-20 rounded-lg border border-zinc-200 bg-white px-2 py-1 shadow-sm"
                          />
                        </label>
                        <label className="flex items-center justify-between text-xs text-zinc-700">
                          <span>段后</span>
                          <input
                            type="number"
                            min={0}
                            max={80}
                            value={textElement.text.style.paragraphAfter ?? 0}
                            onChange={(e) =>
                              updateTextStyle({
                                paragraphAfter: Math.max(0, Math.min(80, Number(e.target.value) || 0)),
                              })
                            }
                            className="h-8 w-20 rounded-lg border border-zinc-200 bg-white px-2 py-1 shadow-sm"
                          />
                        </label>
                      </div>
                    </div>

                    <div className="flex items-center justify-between border-t border-zinc-200 pt-3 text-xs text-zinc-700">
                      <span>项目符号与列表</span>
                      <select className="h-8 w-24 rounded-lg border border-zinc-200 bg-white px-2 py-1 shadow-sm">
                        <option>无</option>
                      </select>
                    </div>

                    <div className="flex items-center justify-between text-xs text-zinc-700">
                      <label className="flex items-center gap-2">
                        <input type="checkbox" />
                        首字下沉
                      </label>
                      <button type="button" className="h-8 rounded-lg border border-zinc-200 bg-white px-2 py-1 shadow-sm">
                        A▤
                      </button>
                    </div>
                  </>
                ) : null}
              </div>
            ) : null}

            {selectedElement && inspectorTab === "arrange" ? (
              <div className="space-y-2 rounded-xl border border-zinc-200 bg-white p-3 shadow-sm">
                <div className="text-xs font-medium text-zinc-700">排列</div>
                <button
                  type="button"
                  onClick={() => onArrangeSelected("front")}
                  className="h-8 w-full rounded-lg border border-zinc-200 bg-white px-2 text-xs text-zinc-700 hover:bg-zinc-50"
                >
                  置于顶层
                </button>
                <button
                  type="button"
                  onClick={() => onArrangeSelected("forward")}
                  className="h-8 w-full rounded-lg border border-zinc-200 bg-white px-2 text-xs text-zinc-700 hover:bg-zinc-50"
                >
                  上移一层
                </button>
                <button
                  type="button"
                  onClick={() => onArrangeSelected("backward")}
                  className="h-8 w-full rounded-lg border border-zinc-200 bg-white px-2 text-xs text-zinc-700 hover:bg-zinc-50"
                >
                  下移一层
                </button>
                <button
                  type="button"
                  onClick={() => onArrangeSelected("back")}
                  className="h-8 w-full rounded-lg border border-zinc-200 bg-white px-2 text-xs text-zinc-700 hover:bg-zinc-50"
                >
                  置于底层
                </button>
              </div>
            ) : null}

            {inspectorTab === "style" ? (
              <div className="mt-3 rounded-xl border border-zinc-200 bg-white p-3 shadow-sm">
                <div className="mb-2 text-xs font-medium text-zinc-600">品牌主题</div>
                <div className="mb-3 flex gap-2">
                  <button
                    type="button"
                    aria-label="蓝色主题"
                    onClick={() => onApplyTheme({ canvasBackground: "#ffffff", accent: "#3b82f6" })}
                    className="h-5 w-5 rounded-full bg-blue-500"
                  />
                  <button
                    type="button"
                    aria-label="紫色主题"
                    onClick={() => onApplyTheme({ canvasBackground: "#faf5ff", accent: "#8b5cf6" })}
                    className="h-5 w-5 rounded-full bg-violet-500"
                  />
                  <button
                    type="button"
                    aria-label="绿色主题"
                    onClick={() => onApplyTheme({ canvasBackground: "#ecfdf5", accent: "#10b981" })}
                    className="h-5 w-5 rounded-full bg-emerald-500"
                  />
                  <button
                    type="button"
                    aria-label="深色主题"
                    onClick={() => onApplyTheme({ canvasBackground: "#f4f4f5", accent: "#18181b" })}
                    className="h-5 w-5 rounded-full bg-zinc-900"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => onApplyTheme({ canvasBackground: "#ffffff", accent: "#3b82f6" })}
                  className="h-8 w-full rounded-lg border border-zinc-200 bg-white px-3 text-xs text-zinc-700 hover:bg-zinc-50"
                >
                  应用到全部页面
                </button>
              </div>
            ) : null}
        </div>
      </div>
    </aside>
  );
}
