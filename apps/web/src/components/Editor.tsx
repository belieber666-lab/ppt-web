"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { Stage, Layer, Group, Rect, Text, Image as KonvaImage, Transformer, Circle, RegularPolygon, Line } from "react-konva";
import type { Slide } from "@ppt-web/core";

const SCALE_MIN = 0.3;
const SCALE_MAX = 2;
const SNAP_THRESHOLD = 6;

let measureCanvas: HTMLCanvasElement | null = null;

function getTextBounds(
  content: string,
  fontSize: number,
  fontFamily: string,
  fontWeight?: number,
  lineHeight = 1.35,
  letterSpacing = 0,
  paragraphBefore = 0,
  paragraphAfter = 0
): { w: number; h: number } {
  const lines = (content || " ").split("\n");
  if (!measureCanvas) {
    measureCanvas = document.createElement("canvas");
  }
  const ctx = measureCanvas.getContext("2d");
  if (!ctx) {
    const fallbackW = Math.max(64, lines.reduce((m, line) => Math.max(m, line.length), 1) * fontSize);
    const fallbackH = Math.max(28, lines.length * fontSize * lineHeight);
    return { w: fallbackW, h: fallbackH };
  }

  const weight = fontWeight && fontWeight >= 600 ? "700" : "400";
  ctx.font = `${weight} ${fontSize}px ${fontFamily}`;

  let maxLineWidth = 0;
  for (const line of lines) {
    // 真实测量单行文本宽度，避免中英文混排估算误差
    const measured = ctx.measureText(line || " ");
    const extraSpacing = Math.max(0, (line.length - 1) * letterSpacing);
    maxLineWidth = Math.max(maxLineWidth, measured.width + extraSpacing);
  }

  const horizontalPadding = Math.max(12, fontSize * 0.5);
  const verticalPadding = Math.max(10, fontSize * 0.4);
  const linePx = fontSize * lineHeight;
  const w = Math.max(64, maxLineWidth + horizontalPadding * 2);
  const h = Math.max(28, lines.length * linePx + verticalPadding * 2 + paragraphBefore + paragraphAfter);
  return { w, h };
}

function toVerticalText(raw: string): string {
  const lines = (raw || " ").split("\n");
  return lines
    .map((line) => line.split("").join("\n"))
    .join("\n\n");
}

function getTextDecoration(style: {
  underline?: boolean;
  strikeThrough?: boolean;
}): string | undefined {
  const tokens: string[] = [];
  if (style.underline) tokens.push("underline");
  if (style.strikeThrough) tokens.push("line-through");
  return tokens.length ? tokens.join(" ") : undefined;
}

type ZoneOverlay = {
  id: string;
  role: string;
  label: string;
  bounds: { x: number; y: number; w: number; h: number };
  fill: string;
  stroke: string;
  labelBg: string;
  labelColor: string;
};

type EditorProps = {
  slide: Slide;
  onUpdateSlide: (next: Slide) => void;
  onDuplicateElements: (ids: string[], offsetX: number, offsetY: number) => string[];
  canvasBackground: string;
  selectedElementIds: string[];
  onSelectElements: (ids: string[]) => void;
  onBeginTextEdit?: () => void;
  scaleHint?: number;
  onScaleChange?: (scale: number) => void;
  zoneOverlays?: ZoneOverlay[];
};

type AlignmentGuide = {
  orientation: "vertical" | "horizontal";
  position: number;
};

type DistanceHint = {
  orientation: "horizontal" | "vertical";
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  labelX: number;
  labelY: number;
  value: number;
};

function SlideImage({
  src,
  x,
  y,
  w,
  h,
  rotation,
  selected,
}: {
  src: string | null;
  x: number;
  y: number;
  w: number;
  h: number;
  rotation: number;
  selected: boolean;
}) {
  const [image, setImage] = useState<HTMLImageElement | null>(null);

  useEffect(() => {
    if (!src) {
      setImage(null);
      return;
    }
    const img = new window.Image();
    img.src = src;
    img.onload = () => setImage(img);
  }, [src]);

  if (!src || !image) {
    return (
      <Rect
        x={x}
        y={y}
        width={w}
        height={h}
        rotation={rotation}
        fill="#e5e7eb"
        stroke={selected ? "#2563eb" : "#d1d5db"}
        strokeWidth={2}
        dash={[6, 4]}
      />
    );
  }

  return (
    <>
      <KonvaImage
        image={image}
        x={x}
        y={y}
        width={w}
        height={h}
        rotation={rotation}
      />
      {selected ? (
        <Rect
          x={x}
          y={y}
          width={w}
          height={h}
          rotation={rotation}
          stroke="#2563eb"
          strokeWidth={2}
          listening={false}
        />
      ) : null}
    </>
  );
}

export function Editor({
  slide,
  onUpdateSlide,
  onDuplicateElements,
  canvasBackground,
  selectedElementIds,
  onSelectElements,
  onBeginTextEdit,
  scaleHint,
  onScaleChange,
  zoneOverlays,
}: EditorProps) {
  const MARQUEE_LONG_PRESS_MS = 180;
  const MARQUEE_MIN_SIZE = 2;
  const [scale, setScale] = useState(scaleHint ?? 0.65);
  const [stageSize, setStageSize] = useState({ width: 800, height: 500 });
  const [isShiftPressed, setIsShiftPressed] = useState(false);
  const [editingTextId, setEditingTextId] = useState<string | null>(null);
  const [editingTextValue, setEditingTextValue] = useState("");
  const [alignmentGuides, setAlignmentGuides] = useState<AlignmentGuide[]>([]);
  const [distanceHints, setDistanceHints] = useState<DistanceHint[]>([]);
  const [marquee, setMarquee] = useState<{
    active: boolean;
    startX: number;
    startY: number;
    x: number;
    y: number;
    w: number;
    h: number;
  } | null>(null);

  useEffect(() => {
    if (typeof scaleHint === "number") {
      setScale(scaleHint);
    }
  }, [scaleHint]);

  useEffect(() => {
    const onKeyDown = (evt: KeyboardEvent) => {
      if (evt.key === "Shift") setIsShiftPressed(true);
    };
    const onKeyUp = (evt: KeyboardEvent) => {
      if (evt.key === "Shift") setIsShiftPressed(false);
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);

  const updateElementPosition = useCallback(
    (elementId: string, x: number, y: number) => {
      const next: Slide = {
        ...slide,
        elements: slide.elements.map((item) =>
          item.id === elementId
            ? { ...item, transform: { ...item.transform, x, y } }
            : item
        ),
      };
      onUpdateSlide(next);
    },
    [onUpdateSlide, slide]
  );

  const clearAlignmentGuides = useCallback(() => {
    setAlignmentGuides([]);
    setDistanceHints([]);
  }, []);

  const updateTextContent = useCallback(
    (elementId: string, nextContent: string) => {
      const trimmed = nextContent.trim();
      const finalContent = trimmed.length > 0 ? trimmed : "请输入文本";
      const next: Slide = {
        ...slide,
        elements: slide.elements.map((item) => {
          if (item.id !== elementId || item.type !== "text") return item;
          const fontSize = item.text.style.fontSize;
          const bounds = getTextBounds(
            finalContent,
            fontSize,
            item.text.style.fontFamily,
            item.text.style.fontWeight,
            item.text.style.lineHeight ?? 1.35,
            item.text.style.letterSpacing ?? 0,
            item.text.style.paragraphBefore ?? 0,
            item.text.style.paragraphAfter ?? 0
          );
          return {
            ...item,
            transform: {
              ...item.transform,
              w: bounds.w,
              h: bounds.h,
            },
            text: {
              ...item.text,
              content: finalContent,
            },
          };
        }),
      };
      onUpdateSlide(next);
    },
    [onUpdateSlide, slide]
  );

  const startInlineTextEditing = useCallback((elementId: string, currentText: string) => {
    onBeginTextEdit?.();
    setEditingTextId(elementId);
    setEditingTextValue(currentText);
  }, [onBeginTextEdit]);

  const cancelInlineTextEditing = useCallback(() => {
    setEditingTextId(null);
    setEditingTextValue("");
  }, []);

  const commitInlineTextEditing = useCallback(() => {
    if (!editingTextId) return;
    updateTextContent(editingTextId, editingTextValue);
    cancelInlineTextEditing();
  }, [cancelInlineTextEditing, editingTextId, editingTextValue, updateTextContent]);

  const sortedElements = [...slide.elements].sort((a, b) => a.zIndex - b.zIndex);
  const containerRef = useRef<HTMLDivElement>(null);
  const transformerRef = useRef<any>(null);
  const elementNodeRefs = useRef<Record<string, any>>({});
  const inlineEditorRef = useRef<HTMLTextAreaElement>(null);
  const dragDuplicateLockRef = useRef(false);
  const pressStartRef = useRef<{ x: number; y: number } | null>(null);
  const pressTimerRef = useRef<number | null>(null);
  const isLongPressMarqueeRef = useRef(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setStageSize({ width: el.clientWidth, height: el.clientHeight });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const slideW = slide.size.width;
  const slideH = slide.size.height;
  const stageW = stageSize.width;
  const stageH = stageSize.height;
  const scaledW = slideW * scale;
  const scaledH = slideH * scale;
  const groupX = (stageW - scaledW) / 2;
  const groupY = (stageH - scaledH) / 2;

  const handleWheel = useCallback(
    (e: { evt: WheelEvent }) => {
      e.evt.preventDefault();
      const delta = e.evt.deltaY > 0 ? -0.05 : 0.05;
      setScale((s) => {
        const next = Math.min(SCALE_MAX, Math.max(SCALE_MIN, s + delta));
        onScaleChange?.(next);
        return next;
      });
    },
    [onScaleChange]
  );

  const snapDuringDrag = useCallback(
    (elementId: string, node: any, width: number, height: number) => {
      const rawX = node.x();
      const rawY = node.y();

      const selfV = [
        { value: rawX, offset: 0 },
        { value: rawX + width / 2, offset: width / 2 },
        { value: rawX + width, offset: width },
      ];
      const selfH = [
        { value: rawY, offset: 0 },
        { value: rawY + height / 2, offset: height / 2 },
        { value: rawY + height, offset: height },
      ];

      const vSnapCandidates: number[] = [0, slideW / 2, slideW];
      const hSnapCandidates: number[] = [0, slideH / 2, slideH];

      for (const el of slide.elements) {
        if (el.id === elementId) continue;
        const t = el.transform;
        vSnapCandidates.push(t.x, t.x + t.w / 2, t.x + t.w);
        hSnapCandidates.push(t.y, t.y + t.h / 2, t.y + t.h);
      }

      let bestVSnap: { diff: number; candidate: number; offset: number } | null = null;
      let bestHSnap: { diff: number; candidate: number; offset: number } | null = null;

      for (const p of selfV) {
        for (const c of vSnapCandidates) {
          const diff = Math.abs(p.value - c);
          if (!bestVSnap || diff < bestVSnap.diff) {
            bestVSnap = { diff, candidate: c, offset: p.offset };
          }
        }
      }

      for (const p of selfH) {
        for (const c of hSnapCandidates) {
          const diff = Math.abs(p.value - c);
          if (!bestHSnap || diff < bestHSnap.diff) {
            bestHSnap = { diff, candidate: c, offset: p.offset };
          }
        }
      }

      let nextX = rawX;
      let nextY = rawY;
      const guides: AlignmentGuide[] = [];

      if (bestVSnap && bestVSnap.diff <= SNAP_THRESHOLD) {
        nextX = bestVSnap.candidate - bestVSnap.offset;
        guides.push({ orientation: "vertical", position: bestVSnap.candidate });
      }
      if (bestHSnap && bestHSnap.diff <= SNAP_THRESHOLD) {
        nextY = bestHSnap.candidate - bestHSnap.offset;
        guides.push({ orientation: "horizontal", position: bestHSnap.candidate });
      }

      if (nextX !== rawX || nextY !== rawY) {
        node.position({ x: nextX, y: nextY });
      }
      setAlignmentGuides(guides);

      const left = nextX;
      const top = nextY;
      const right = nextX + width;
      const bottom = nextY + height;
      const centerX = nextX + width / 2;
      const centerY = nextY + height / 2;

      type GapCandidate = {
        gap: number;
        fromX: number;
        fromY: number;
        toX: number;
        toY: number;
        labelX: number;
        labelY: number;
      };

      const hCandidates: GapCandidate[] = [];
      const vCandidates: GapCandidate[] = [];

      // 与画布边界距离
      if (left >= 0) {
        hCandidates.push({
          gap: left,
          fromX: 0,
          fromY: centerY,
          toX: left,
          toY: centerY,
          labelX: left / 2,
          labelY: centerY - 10,
        });
      }
      if (slideW >= right) {
        hCandidates.push({
          gap: slideW - right,
          fromX: right,
          fromY: centerY,
          toX: slideW,
          toY: centerY,
          labelX: (right + slideW) / 2,
          labelY: centerY - 10,
        });
      }
      if (top >= 0) {
        vCandidates.push({
          gap: top,
          fromX: centerX,
          fromY: 0,
          toX: centerX,
          toY: top,
          labelX: centerX + 8,
          labelY: top / 2,
        });
      }
      if (slideH >= bottom) {
        vCandidates.push({
          gap: slideH - bottom,
          fromX: centerX,
          fromY: bottom,
          toX: centerX,
          toY: slideH,
          labelX: centerX + 8,
          labelY: (bottom + slideH) / 2,
        });
      }

      for (const el of slide.elements) {
        if (el.id === elementId) continue;
        const t = el.transform;
        const otherLeft = t.x;
        const otherRight = t.x + t.w;
        const otherTop = t.y;
        const otherBottom = t.y + t.h;

        // 横向距离：要求纵向有重叠
        const overlapTop = Math.max(top, otherTop);
        const overlapBottom = Math.min(bottom, otherBottom);
        if (overlapBottom > overlapTop) {
          const overlapMidY = (overlapTop + overlapBottom) / 2;
          if (otherRight <= left) {
            const gap = left - otherRight;
            hCandidates.push({
              gap,
              fromX: otherRight,
              fromY: overlapMidY,
              toX: left,
              toY: overlapMidY,
              labelX: (otherRight + left) / 2,
              labelY: overlapMidY - 10,
            });
          }
          if (otherLeft >= right) {
            const gap = otherLeft - right;
            hCandidates.push({
              gap,
              fromX: right,
              fromY: overlapMidY,
              toX: otherLeft,
              toY: overlapMidY,
              labelX: (right + otherLeft) / 2,
              labelY: overlapMidY - 10,
            });
          }
        }

        // 纵向距离：要求横向有重叠
        const overlapLeft = Math.max(left, otherLeft);
        const overlapRight = Math.min(right, otherRight);
        if (overlapRight > overlapLeft) {
          const overlapMidX = (overlapLeft + overlapRight) / 2;
          if (otherBottom <= top) {
            const gap = top - otherBottom;
            vCandidates.push({
              gap,
              fromX: overlapMidX,
              fromY: otherBottom,
              toX: overlapMidX,
              toY: top,
              labelX: overlapMidX + 8,
              labelY: (otherBottom + top) / 2,
            });
          }
          if (otherTop >= bottom) {
            const gap = otherTop - bottom;
            vCandidates.push({
              gap,
              fromX: overlapMidX,
              fromY: bottom,
              toX: overlapMidX,
              toY: otherTop,
              labelX: overlapMidX + 8,
              labelY: (bottom + otherTop) / 2,
            });
          }
        }
      }

      const bestH = hCandidates
        .filter((item) => item.gap >= 0)
        .sort((a, b) => a.gap - b.gap)[0];
      const bestV = vCandidates
        .filter((item) => item.gap >= 0)
        .sort((a, b) => a.gap - b.gap)[0];

      const nextHints: DistanceHint[] = [];
      if (bestH && bestH.gap <= 200) {
        nextHints.push({
          orientation: "horizontal",
          fromX: bestH.fromX,
          fromY: bestH.fromY,
          toX: bestH.toX,
          toY: bestH.toY,
          labelX: bestH.labelX,
          labelY: bestH.labelY,
          value: Math.round(bestH.gap),
        });
      }
      if (bestV && bestV.gap <= 200) {
        nextHints.push({
          orientation: "vertical",
          fromX: bestV.fromX,
          fromY: bestV.fromY,
          toX: bestV.toX,
          toY: bestV.toY,
          labelX: bestV.labelX,
          labelY: bestV.labelY,
          value: Math.round(bestV.gap),
        });
      }
      setDistanceHints(nextHints);
    },
    [slide.elements, slideH, slideW]
  );

  const updateElementTransform = useCallback(
    (elementId: string, transformPatch: Partial<Slide["elements"][number]["transform"]>) => {
      const next: Slide = {
        ...slide,
        elements: slide.elements.map((item) =>
          item.id === elementId
            ? { ...item, transform: { ...item.transform, ...transformPatch } }
            : item
        ),
      };
      onUpdateSlide(next);
    },
    [onUpdateSlide, slide]
  );

  const handleTransformEnd = useCallback(
    (elementId: string, node: any) => {
      const current = slide.elements.find((el) => el.id === elementId);
      if (!current) return;
      const scaleX = node.scaleX();
      const scaleY = node.scaleY();

      if (current.type === "text") {
        const baseFont = current.text.style.fontSize;
        const nextFontSize = Math.max(10, Math.round(baseFont * ((scaleX + scaleY) / 2)));
        const textBounds = getTextBounds(
          current.text.content,
          nextFontSize,
          current.text.style.fontFamily,
          current.text.style.fontWeight,
          current.text.style.lineHeight ?? 1.35,
          current.text.style.letterSpacing ?? 0,
          current.text.style.paragraphBefore ?? 0,
          current.text.style.paragraphAfter ?? 0
        );
        const next: Slide = {
          ...slide,
          elements: slide.elements.map((el) =>
            el.id === elementId && el.type === "text"
              ? {
                  ...el,
                  transform: {
                    ...el.transform,
                    x: node.x(),
                    y: node.y(),
                    w: textBounds.w,
                    h: textBounds.h,
                    rotation: node.rotation(),
                  },
                  text: {
                    ...el.text,
                    style: {
                      ...el.text.style,
                      fontSize: nextFontSize,
                    },
                  },
                }
              : el
          ),
        };
        onUpdateSlide(next);
      } else {
        const nextW = Math.max(24, current.transform.w * scaleX);
        const nextH = Math.max(24, current.transform.h * scaleY);
        updateElementTransform(elementId, {
          x: node.x(),
          y: node.y(),
          w: nextW,
          h: nextH,
          rotation: node.rotation(),
        });
      }
      node.scaleX(1);
      node.scaleY(1);
    },
    [onUpdateSlide, slide, slide.elements, updateElementTransform]
  );

  useEffect(() => {
    const transformer = transformerRef.current;
    if (!transformer) return;
    if (selectedElementIds.length > 0) {
      const nodes = selectedElementIds
        .map((id) => elementNodeRefs.current[id])
        .filter(Boolean);
      transformer.nodes(nodes);
    } else {
      transformer.nodes([]);
    }
    transformer.getLayer()?.batchDraw();
  }, [selectedElementIds, slide.elements]);

  useEffect(() => {
    const onKeyDown = (evt: KeyboardEvent) => {
      const active = document.activeElement as HTMLElement | null;
      const tag = active?.tagName?.toLowerCase();
      const isEditable =
        tag === "input" ||
        tag === "textarea" ||
        Boolean(active?.isContentEditable);
      if (isEditable) return;
      if (evt.key !== "Enter" && evt.key !== "F2") return;
      if (selectedElementIds.length !== 1) return;
      const selected = slide.elements.find((el) => el.id === selectedElementIds[0]);
      if (!selected || selected.type !== "text") return;
      evt.preventDefault();
      startInlineTextEditing(selected.id, selected.text.content);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedElementIds, slide.elements, startInlineTextEditing]);

  useEffect(() => {
    if (!editingTextId) return;
    const timer = window.setTimeout(() => {
      inlineEditorRef.current?.focus();
      inlineEditorRef.current?.select();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [editingTextId]);

  const editingTextElement =
    editingTextId
      ? slide.elements.find((el) => el.id === editingTextId && el.type === "text")
      : null;

  const selectSingle = useCallback(
    (id: string) => {
      if (isShiftPressed) {
        if (selectedElementIds.includes(id)) {
          onSelectElements(selectedElementIds.filter((item) => item !== id));
        } else {
          onSelectElements([...selectedElementIds, id]);
        }
        return;
      }
      onSelectElements([id]);
    },
    [isShiftPressed, onSelectElements, selectedElementIds]
  );

  const clearPressTimer = useCallback(() => {
    if (pressTimerRef.current) {
      window.clearTimeout(pressTimerRef.current);
      pressTimerRef.current = null;
    }
  }, []);

  useEffect(() => () => clearPressTimer(), [clearPressTimer]);

  return (
    <div className="rounded-2xl border border-white/70 bg-white/75 p-3 shadow-[0_10px_28px_rgba(15,23,42,0.08)] backdrop-blur-xl">
        <div
          ref={containerRef}
          className="relative mx-auto aspect-video w-full max-w-[1100px] overflow-hidden rounded-xl bg-zinc-100"
        >
          <Stage
            width={stageW}
            height={stageH}
            onWheel={handleWheel}
            onMouseDown={(evt: any) => {
              if (editingTextId) return;
              if (evt.evt?.button !== 0) return;
              const stage = evt.target.getStage();
              if (!stage) return;
              const pos = stage.getPointerPosition();
              if (!pos) return;
              pressStartRef.current = { x: pos.x, y: pos.y };
              isLongPressMarqueeRef.current = false;
              clearPressTimer();
              pressTimerRef.current = window.setTimeout(() => {
                const start = pressStartRef.current;
                if (!start) return;
                isLongPressMarqueeRef.current = true;
                onSelectElements([]);
                setMarquee({
                  active: true,
                  startX: start.x,
                  startY: start.y,
                  x: start.x,
                  y: start.y,
                  w: 0,
                  h: 0,
                });
                if (typeof evt.target?.stopDrag === "function") {
                  evt.target.stopDrag();
                }
              }, MARQUEE_LONG_PRESS_MS);
            }}
            onMouseMove={(evt: any) => {
              if (!marquee?.active && !isLongPressMarqueeRef.current) return;
              const stage = evt.target.getStage();
              if (!stage) return;
              const pos = stage.getPointerPosition();
              if (!pos) return;
              if (!marquee?.active && isLongPressMarqueeRef.current && pressStartRef.current) {
                const start = pressStartRef.current;
                setMarquee({
                  active: true,
                  startX: start.x,
                  startY: start.y,
                  x: start.x,
                  y: start.y,
                  w: 0,
                  h: 0,
                });
              }
              if (!marquee) return;
              const x = Math.min(marquee.startX, pos.x);
              const y = Math.min(marquee.startY, pos.y);
              const w = Math.abs(pos.x - marquee.startX);
              const h = Math.abs(pos.y - marquee.startY);
              setMarquee((prev) =>
                prev ? { ...prev, x, y, w, h } : prev
              );
            }}
            onMouseUp={() => {
              clearPressTimer();
              pressStartRef.current = null;
              const isActive = Boolean(marquee?.active || isLongPressMarqueeRef.current);
              if (!isActive || !marquee) {
                isLongPressMarqueeRef.current = false;
                return;
              }
              // stage -> slide coordinates
              const left = (marquee.x - groupX) / scale;
              const top = (marquee.y - groupY) / scale;
              const right = (marquee.x + marquee.w - groupX) / scale;
              const bottom = (marquee.y + marquee.h - groupY) / scale;

              const picked = slide.elements
                .filter((el) => {
                  const t = el.transform;
                  const elLeft = t.x;
                  const elTop = t.y;
                  const elRight = t.x + t.w;
                  const elBottom = t.y + t.h;
                  const intersects =
                    left <= elRight &&
                    right >= elLeft &&
                    top <= elBottom &&
                    bottom >= elTop;
                  return intersects;
                })
                .map((el) => el.id);

              if (picked.length > 0 && (marquee.w > MARQUEE_MIN_SIZE || marquee.h > MARQUEE_MIN_SIZE)) {
                if (isShiftPressed) {
                  const merged = Array.from(new Set([...selectedElementIds, ...picked]));
                  onSelectElements(merged);
                } else {
                  onSelectElements(picked);
                }
              }
              setMarquee(null);
              isLongPressMarqueeRef.current = false;
            }}
          >
            <Layer>
              <Group x={groupX} y={groupY} scaleX={scale} scaleY={scale}>
                <Rect
                  width={slideW}
                  height={slideH}
                  fill={canvasBackground}
                  shadowColor="#000"
                  shadowBlur={8}
                  shadowOffset={{ x: 2, y: 2 }}
                  shadowOpacity={0.15}
                  cornerRadius={4}
                />
                {zoneOverlays?.map((zone) => (
                  <Group key={zone.id}>
                    <Rect
                      x={zone.bounds.x}
                      y={zone.bounds.y}
                      width={zone.bounds.w}
                      height={zone.bounds.h}
                      fill={zone.fill}
                      stroke={zone.stroke}
                      strokeWidth={1.5}
                      dash={[6, 4]}
                      listening={false}
                    />
                    <Rect
                      x={zone.bounds.x}
                      y={zone.bounds.y}
                      width={Math.min(zone.label.length * 10 + 8, zone.bounds.w)}
                      height={16}
                      fill={zone.labelBg}
                      cornerRadius={[0, 0, 4, 0]}
                      listening={false}
                    />
                    <Text
                      x={zone.bounds.x + 4}
                      y={zone.bounds.y + 2}
                      text={zone.label}
                      fontSize={10}
                      fontStyle="bold"
                      fill={zone.labelColor}
                      listening={false}
                    />
                  </Group>
                ))}
                {sortedElements.map((el) => {
                  const t = el.transform;
                  const isSelected = selectedElementIds.includes(el.id);
                  if (el.type === "text") {
                    const isEditingThisText = editingTextId === el.id;
                    const paragraphBefore = el.text.style.paragraphBefore ?? 0;
                    const paragraphAfter = el.text.style.paragraphAfter ?? 0;
                    const textBounds = getTextBounds(
                      el.text.style.vertical ? toVerticalText(el.text.content) : el.text.content,
                      el.text.style.fontSize,
                      el.text.style.fontFamily,
                      el.text.style.fontWeight,
                      el.text.style.lineHeight ?? 1.35,
                      el.text.style.letterSpacing ?? 0,
                      paragraphBefore,
                      paragraphAfter
                    );
                    return (
                      <Group
                        key={el.id}
                        x={t.x}
                        y={t.y}
                        rotation={t.rotation}
                        draggable
                        ref={(node) => {
                          elementNodeRefs.current[el.id] = node;
                        }}
                        onDragStart={(evt: any) => {
                          if (!evt.evt.altKey || dragDuplicateLockRef.current) return;
                          dragDuplicateLockRef.current = true;
                          const idsToCopy = selectedElementIds.includes(el.id) ? selectedElementIds : [el.id];
                          const clonedIds = onDuplicateElements(idsToCopy, 16, 16);
                          if (clonedIds.length > 0) {
                            onSelectElements(clonedIds);
                          }
                          evt.target.stopDrag();
                          requestAnimationFrame(() => {
                            dragDuplicateLockRef.current = false;
                          });
                        }}
                        onClick={() => selectSingle(el.id)}
                        onTap={() => selectSingle(el.id)}
                        onDblClick={() => startInlineTextEditing(el.id, el.text.content)}
                        onDblTap={() => startInlineTextEditing(el.id, el.text.content)}
                        onDragMove={(evt) =>
                          snapDuringDrag(el.id, evt.target, textBounds.w, textBounds.h)
                        }
                        onDragEnd={(evt) => {
                          updateElementPosition(el.id, evt.target.x(), evt.target.y());
                          clearAlignmentGuides();
                        }}
                        onTransformEnd={(evt) => {
                          handleTransformEnd(el.id, evt.target);
                          clearAlignmentGuides();
                        }}
                      >
                        <Text
                          x={0}
                          y={paragraphBefore}
                          width={textBounds.w}
                          height={Math.max(24, textBounds.h - paragraphBefore - paragraphAfter)}
                          text={el.text.style.vertical ? toVerticalText(el.text.content) : el.text.content}
                          fontSize={el.text.style.fontSize}
                          fontFamily={el.text.style.fontFamily}
                          fontStyle={
                            el.text.style.fontWeight && el.text.style.fontWeight >= 600 ? "bold" : "normal"
                          }
                          lineHeight={el.text.style.lineHeight ?? 1.35}
                          letterSpacing={el.text.style.letterSpacing ?? 0}
                          textDecoration={getTextDecoration(el.text.style)}
                          fill={el.text.style.color}
                          opacity={isEditingThisText ? 0 : isSelected ? 0.85 : 1}
                        />
                      </Group>
                    );
                  }
                  if (el.type === "rect") {
                    const shape = el.rect.shape ?? "rect";
                    const baseStroke = el.rect.stroke;
                    const baseStrokeWidth = el.rect.strokeWidth ?? 0;
                    const strokeColor = isSelected ? "#2563eb" : baseStroke;
                    const strokeWidth = isSelected ? Math.max(2, baseStrokeWidth || 1) : baseStrokeWidth;
                    return (
                      <Group
                        key={el.id}
                        x={t.x}
                        y={t.y}
                        rotation={t.rotation}
                        draggable
                        ref={(node) => {
                          elementNodeRefs.current[el.id] = node;
                        }}
                        onDragStart={(evt: any) => {
                          if (!evt.evt.altKey || dragDuplicateLockRef.current) return;
                          dragDuplicateLockRef.current = true;
                          const idsToCopy = selectedElementIds.includes(el.id) ? selectedElementIds : [el.id];
                          const clonedIds = onDuplicateElements(idsToCopy, 16, 16);
                          if (clonedIds.length > 0) {
                            onSelectElements(clonedIds);
                          }
                          evt.target.stopDrag();
                          requestAnimationFrame(() => {
                            dragDuplicateLockRef.current = false;
                          });
                        }}
                        onClick={() => selectSingle(el.id)}
                        onTap={() => selectSingle(el.id)}
                        onDragMove={(evt) => snapDuringDrag(el.id, evt.target, t.w, t.h)}
                        onDragEnd={(evt) => {
                          updateElementPosition(el.id, evt.target.x(), evt.target.y());
                          clearAlignmentGuides();
                        }}
                        onTransformEnd={(evt) => {
                          handleTransformEnd(el.id, evt.target);
                          clearAlignmentGuides();
                        }}
                      >
                        {shape === "circle" ? (
                          <Circle
                            x={t.w / 2}
                            y={t.h / 2}
                            radius={Math.min(t.w, t.h) / 2}
                            fill={el.rect.fill}
                            stroke={strokeColor}
                            strokeWidth={strokeWidth}
                          />
                        ) : null}
                        {shape === "triangle" ? (
                          <RegularPolygon
                            x={t.w / 2}
                            y={t.h / 2}
                            sides={3}
                            radius={Math.min(t.w, t.h) / 2}
                            rotation={-90}
                            fill={el.rect.fill}
                            stroke={strokeColor}
                            strokeWidth={strokeWidth}
                          />
                        ) : null}
                        {shape === "diamond" ? (
                          <Line
                            points={[t.w / 2, 0, t.w, t.h / 2, t.w / 2, t.h, 0, t.h / 2]}
                            closed
                            fill={el.rect.fill}
                            stroke={strokeColor}
                            strokeWidth={strokeWidth}
                          />
                        ) : null}
                        {shape === "roundRect" ? (
                          <Rect
                            width={t.w}
                            height={t.h}
                            fill={el.rect.fill}
                            cornerRadius={Math.max(12, Math.min(t.w, t.h) * 0.2)}
                            stroke={strokeColor}
                            strokeWidth={strokeWidth}
                          />
                        ) : null}
                        {shape === "rect" ? (
                          <Rect
                            width={t.w}
                            height={t.h}
                            fill={el.rect.fill}
                            cornerRadius={el.rect.radius ?? 0}
                            stroke={strokeColor}
                            strokeWidth={strokeWidth}
                          />
                        ) : null}
                      </Group>
                    );
                  }
                  if (el.type === "image") {
                    return (
                      <Group
                        key={el.id}
                        x={t.x}
                        y={t.y}
                        rotation={t.rotation}
                        draggable
                        ref={(node) => {
                          elementNodeRefs.current[el.id] = node;
                        }}
                        onDragStart={(evt: any) => {
                          if (!evt.evt.altKey || dragDuplicateLockRef.current) return;
                          dragDuplicateLockRef.current = true;
                          const idsToCopy = selectedElementIds.includes(el.id) ? selectedElementIds : [el.id];
                          const clonedIds = onDuplicateElements(idsToCopy, 16, 16);
                          if (clonedIds.length > 0) {
                            onSelectElements(clonedIds);
                          }
                          evt.target.stopDrag();
                          requestAnimationFrame(() => {
                            dragDuplicateLockRef.current = false;
                          });
                        }}
                        onDragMove={(evt) => snapDuringDrag(el.id, evt.target, t.w, t.h)}
                        onDragEnd={(evt) => {
                          updateElementPosition(el.id, evt.target.x(), evt.target.y());
                          clearAlignmentGuides();
                        }}
                        onTransformEnd={(evt) => {
                          handleTransformEnd(el.id, evt.target);
                          clearAlignmentGuides();
                        }}
                        onClick={() => selectSingle(el.id)}
                        onTap={() => selectSingle(el.id)}
                      >
                        <SlideImage
                          src={el.image.assetUrl}
                          x={0}
                          y={0}
                          w={t.w}
                          h={t.h}
                          rotation={0}
                          selected={isSelected}
                        />
                      </Group>
                    );
                  }
                  return null;
                })}
                <Transformer
                  ref={transformerRef}
                  rotateEnabled
                  rotationSnaps={
                    isShiftPressed
                      ? [0, 30, 45, 60, 90, 120, 135, 150, 180, 210, 225, 240, 270, 300, 315, 330]
                      : []
                  }
                  rotationSnapTolerance={6}
                  enabledAnchors={[
                    "top-left",
                    "top-center",
                    "top-right",
                    "middle-right",
                    "bottom-right",
                    "bottom-center",
                    "bottom-left",
                    "middle-left",
                  ]}
                  anchorSize={8}
                  borderStroke="#2563eb"
                  anchorStroke="#2563eb"
                  anchorFill="#ffffff"
                  boundBoxFunc={(oldBox, newBox) => {
                    if (newBox.width < 24 || newBox.height < 24) {
                      return oldBox;
                    }
                    return newBox;
                  }}
                />
                {alignmentGuides.map((guide, idx) =>
                  guide.orientation === "vertical" ? (
                    <Line
                      key={`v-${guide.position}-${idx}`}
                      points={[guide.position, 0, guide.position, slideH]}
                      stroke="#2563eb"
                      dash={[4, 4]}
                      strokeWidth={1}
                      listening={false}
                    />
                  ) : (
                    <Line
                      key={`h-${guide.position}-${idx}`}
                      points={[0, guide.position, slideW, guide.position]}
                      stroke="#2563eb"
                      dash={[4, 4]}
                      strokeWidth={1}
                      listening={false}
                    />
                  )
                )}
                {distanceHints.map((hint, idx) => {
                  const label = `${hint.value}px`;
                  const labelW = Math.max(30, label.length * 7 + 8);
                  const labelH = 18;
                  return (
                    <Group key={`distance-${idx}`} listening={false}>
                      <Line
                        points={[hint.fromX, hint.fromY, hint.toX, hint.toY]}
                        stroke="#0ea5e9"
                        dash={[2, 3]}
                        strokeWidth={1}
                      />
                      <Rect
                        x={hint.labelX - labelW / 2}
                        y={hint.labelY - labelH / 2}
                        width={labelW}
                        height={labelH}
                        fill="#ffffff"
                        stroke="#0ea5e9"
                        cornerRadius={4}
                      />
                      <Text
                        x={hint.labelX - labelW / 2}
                        y={hint.labelY - labelH / 2 + 2}
                        width={labelW}
                        align="center"
                        fontSize={11}
                        fill="#0369a1"
                        text={label}
                      />
                    </Group>
                  );
                })}
              </Group>
            </Layer>
            <Layer listening={false}>
              {marquee && marquee.w > 2 && marquee.h > 2 ? (
                <Rect
                  x={marquee.x}
                  y={marquee.y}
                  width={marquee.w}
                  height={marquee.h}
                  fill="rgba(37,99,235,0.12)"
                  stroke="#2563eb"
                  strokeWidth={1}
                />
              ) : null}
            </Layer>
          </Stage>
          {editingTextElement && editingTextElement.type === "text" ? (
            <textarea
              ref={inlineEditorRef}
              value={editingTextValue}
              onChange={(evt) => setEditingTextValue(evt.target.value)}
              onBlur={commitInlineTextEditing}
              onKeyDown={(evt) => {
                if (evt.key === "Escape") {
                  evt.preventDefault();
                  cancelInlineTextEditing();
                }
                if (evt.key === "Enter" && (evt.metaKey || evt.ctrlKey)) {
                  evt.preventDefault();
                  commitInlineTextEditing();
                }
              }}
              className="absolute resize-none border border-blue-400 bg-white/95 p-1 text-zinc-800 outline-none"
              style={{
                left: groupX + editingTextElement.transform.x * scale,
                top: groupY + editingTextElement.transform.y * scale,
                width:
                  Math.max(
                    64,
                    getTextBounds(
                      editingTextValue || " ",
                      editingTextElement.text.style.fontSize,
                      editingTextElement.text.style.fontFamily,
                      editingTextElement.text.style.fontWeight,
                      editingTextElement.text.style.lineHeight ?? 1.35,
                      editingTextElement.text.style.letterSpacing ?? 0,
                      editingTextElement.text.style.paragraphBefore ?? 0,
                      editingTextElement.text.style.paragraphAfter ?? 0
                    ).w * scale
                  ),
                height:
                  Math.max(
                    30,
                    getTextBounds(
                      editingTextValue || " ",
                      editingTextElement.text.style.fontSize,
                      editingTextElement.text.style.fontFamily,
                      editingTextElement.text.style.fontWeight,
                      editingTextElement.text.style.lineHeight ?? 1.35,
                      editingTextElement.text.style.letterSpacing ?? 0,
                      editingTextElement.text.style.paragraphBefore ?? 0,
                      editingTextElement.text.style.paragraphAfter ?? 0
                    ).h * scale
                  ),
                fontSize: editingTextElement.text.style.fontSize * scale,
                fontFamily: editingTextElement.text.style.fontFamily,
                lineHeight: String(editingTextElement.text.style.lineHeight ?? 1.35),
                letterSpacing: `${(editingTextElement.text.style.letterSpacing ?? 0) * scale}px`,
                textDecoration: getTextDecoration(editingTextElement.text.style),
                paddingTop: `${(editingTextElement.text.style.paragraphBefore ?? 0) * scale}px`,
                paddingBottom: `${(editingTextElement.text.style.paragraphAfter ?? 0) * scale}px`,
                overflow: "hidden",
                transform: `rotate(${editingTextElement.transform.rotation}deg)`,
                transformOrigin: "top left",
              }}
            />
          ) : null}
        </div>
    </div>
  );
}
