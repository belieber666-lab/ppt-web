export type SlideSize = {
    width: number;
    height: number;
};
export type Transform = {
    x: number;
    y: number;
    w: number;
    h: number;
    rotation: number;
};
export type ElementBase = {
    id: string;
    name?: string;
    transform: Transform;
    zIndex: number;
    locked?: boolean;
    hidden?: boolean;
};
export type TextStyle = {
    fontFamily: string;
    fontSize: number;
    fontWeight?: number;
    color: string;
    align?: "left" | "center" | "right";
    lineHeight?: number;
    underline?: boolean;
    strikeThrough?: boolean;
    letterSpacing?: number;
    paragraphBefore?: number;
    paragraphAfter?: number;
    vertical?: boolean;
};
export type TextElement = ElementBase & {
    type: "text";
    text: {
        content: string;
        style: TextStyle;
        bindingKey?: string;
    };
    placeholder?: {
        kind: "text";
        key: string;
    };
};
export type ImageElement = ElementBase & {
    type: "image";
    image: {
        assetUrl: string | null;
        fitMode: "cover" | "contain";
    };
    placeholder?: {
        kind: "image";
        key: string;
    };
};
export type RectElement = ElementBase & {
    type: "rect";
    rect: {
        shape?: "rect" | "roundRect" | "circle" | "triangle" | "diamond";
        fill: string;
        stroke?: string;
        strokeWidth?: number;
        radius?: number;
    };
};
export type Element = TextElement | ImageElement | RectElement;
export type Slide = {
    id: string;
    size: SlideSize;
    elements: Element[];
};
export type Project = {
    id: string;
    name: string;
    variables: Record<string, string>;
    slides: Slide[];
};
export declare const DEFAULT_SLIDE_16_9: SlideSize;
