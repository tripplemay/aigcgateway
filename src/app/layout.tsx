import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AIGC Gateway",
  description: "AIGC 基础设施中台",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
