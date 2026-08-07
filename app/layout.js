import "./site.css";

export const metadata = {
  title: "ThreadSignal｜Threads 商機雷達",
  description: "以關鍵字整理公開 Threads 內容、辨識需求強度並協助準備回覆文案。"
};

export default function RootLayout({ children }) {
  return (
    <html lang="zh-Hant">
      <body>
        <header className="siteHeader">
          <a className="logo" href="/"><span>TS</span> ThreadSignal</a>
          <nav>
            <a href="/privacy">隱私政策</a>
            <a href="/terms">服務條款</a>
            <a href="/data-deletion">資料刪除</a>
          </nav>
        </header>
        {children}
        <footer>
          <strong>ThreadSignal</strong>
          <p>由伊鑽企業社營運，以公開資料與人工判斷，建立更尊重、更有價值的商業對話。</p>
          <small>© 2026 伊鑽企業社 · 聯絡信箱：dragonboat8966@gmail.com</small>
        </footer>
      </body>
    </html>
  );
}
