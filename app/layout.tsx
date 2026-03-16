import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "KMA Weather Map",
  description: "기상청 API 기반 내일 지도 + 모레/글피 기온 대시보드",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
