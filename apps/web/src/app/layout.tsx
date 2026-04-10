import type { Metadata } from "next";
import "./globals.css";
import ClickSpark from "@/components/ClickSpark";

export const metadata: Metadata = {
  title: "PPT 智能套用",
  description: "上传内容 PPT，AI 分析结构并套用模板样式",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" className="dark">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="antialiased overflow-hidden">
        <ClickSpark
          sparkColor="#cafd00"
          sparkSize={10}
          sparkRadius={15}
          sparkCount={8}
          duration={400}
          extraScale={1.0}
        >
          {children}
        </ClickSpark>
      </body>
    </html>
  );
}
