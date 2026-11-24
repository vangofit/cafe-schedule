import "./globals.css";
import type { ReactNode } from "react";
import type { Viewport } from "next";

export const metadata = {
  title: "월영당 근무표",
  description: "월영당 근무표 자동 편성과 수당표 자동 계산",
  appleWebApp: { capable: true, title: "월영당 근무표", statusBarStyle: "black-translucent" as const },
};
export const viewport: Viewport = { themeColor: "#1b2235", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link href="https://fonts.googleapis.com/css2?family=Gowun+Batang:wght@400;700&family=Noto+Sans+KR:wght@400;500;700;800&display=swap" rel="stylesheet" />
      </head>
      <body>{children}</body>
    </html>
  );
}
