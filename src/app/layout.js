import "./globals.css";

export const metadata = {
  title: "월별 행사계획",
  description: "학교와 기관을 위한 월별 행사계획 웹앱",
};

// Chrome fires beforeinstallprompt once, as soon as it finishes checking the
// manifest/service worker - often before React hydrates, and a missed event
// can't be replayed, which leaves "바로가기 추가" permanently stuck on the
// manual-instructions fallback. This must run synchronously during HTML
// parsing, so it's a raw inline <script> in <head>: next/script's
// beforeInteractive does NOT do that for inline scripts - it serializes them
// into the self.__next_s queue, which only executes when Next's own JS chunk
// runs (and is unreliable for inline scripts in the app router).
const captureInstallPrompt = `
window.addEventListener("beforeinstallprompt", function (event) {
  event.preventDefault();
  window.__deferredInstallPrompt = event;
  window.dispatchEvent(new CustomEvent("deferredinstallpromptready"));
});
`;

export default function RootLayout({ children }) {
  return (
    <html lang="ko">
      <head>
        <script dangerouslySetInnerHTML={{ __html: captureInstallPrompt }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
