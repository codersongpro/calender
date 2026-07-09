import Script from "next/script";

import "./globals.css";

export const metadata = {
  title: "월별 행사계획",
  description: "학교와 기관을 위한 월별 행사계획 웹앱",
};

export default function RootLayout({ children }) {
  return (
    <html lang="ko">
      <body>
        {/*
          Chrome can fire beforeinstallprompt as soon as the manifest/service
          worker are evaluated - which can happen before React finishes
          hydrating, especially on a fast load. There's no way to "replay" a
          missed event, so without this the "바로가기 추가" button would
          silently and permanently fall back to the manual instructions on
          every visit. beforeInteractive runs this before hydration so the
          event is always captured, then PlannerApp picks it up from
          window.__deferredInstallPrompt once it mounts.
        */}
        <Script id="capture-install-prompt" strategy="beforeInteractive">
          {`
            window.addEventListener("beforeinstallprompt", function (event) {
              event.preventDefault();
              window.__deferredInstallPrompt = event;
              window.dispatchEvent(new CustomEvent("deferredinstallpromptready"));
            });
          `}
        </Script>
        {children}
      </body>
    </html>
  );
}
