export default function Home() {
  return (
    <main>
      <section className="heroLegal">
        <p className="eyebrow">THREADS LEAD INTELLIGENCE</p>
        <h1>把公開訊號，整理成<br />值得回應的真實需求。</h1>
        <p className="lede">ThreadSignal 由伊鑽企業社營運，提供使用者依自訂關鍵字搜尋及整理公開 Threads 貼文、排除重複結果、判斷需求強度，並產生可供人工審核的回覆草稿。</p>
        <div className="pillRow"><span>官方 API</span><span>人工複核</span><span>尊重使用者隱私</span></div>
        <p><a href="/review-demo" style={{ display: "inline-flex", marginTop: 22, padding: "12px 18px", borderRadius: 10, background: "#ff826a", color: "white", textDecoration: "none", fontWeight: 750 }}>Threads 授權與搜尋示範</a></p>
      </section>
      <section className="cards">
        <article><b>01</b><h2>蒐集</h2><p>僅透過授權 API 取得符合關鍵字的公開內容。</p></article>
        <article><b>02</b><h2>整理</h2><p>依文字中的需求與時效訊號協助排序，不建立敏感個人輪廓。</p></article>
        <article><b>03</b><h2>回應</h2><p>產生回覆草稿，實際發布或聯繫前仍須由使用者人工確認。</p></article>
      </section>
    </main>
  );
}
