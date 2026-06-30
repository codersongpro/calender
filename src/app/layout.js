import "./globals.css";

export const metadata = {
  title: "월별 행사계획",
  description: "학교와 기관을 위한 월별 행사계획 웹앱",
};

export default function RootLayout({ children }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
