export const metadata = { title: "隱私政策｜ThreadSignal" };
export default function Privacy() {
  return <main className="document"><p className="eyebrow">PRIVACY POLICY</p><h1>隱私政策</h1><p className="updated">最後更新：2026 年 8 月 27 日</p>
    <h2>營運與資料責任主體</h2><p>ThreadSignal 由伊鑽企業社營運。伊鑽企業社負責本服務所處理資料的管理、安全與資料請求。</p>
    <h2>一、我們處理的資料</h2><p>ThreadSignal 透過 Meta Threads API，在使用者明確授權後取得公開貼文的文字、公開帳號名稱、發布時間、永久連結及 API 提供的公開識別碼。我們也會處理使用者設定的關鍵字、分類結果及文案草稿。</p>
    <h2>二、處理目的</h2><p>資料僅用於關鍵字搜尋、內容整理、需求強度判斷、產生待人工審核的回覆草稿，以及維持服務安全與品質。</p>
    <h2>三、我們不做的事</h2><p>我們不販售個人資料、不以本服務自動大量留言或私訊、不蒐集非公開 Threads 內容，也不以貼文推論健康、政治、宗教等敏感特徵。</p>
    <h2>四、保存與安全</h2><p>Threads 長效存取權杖經加密後儲存在 Neon 資料庫，不置於瀏覽器程式碼，也不以明文保存。蒐集結果由服務使用者控制，並依服務設定與實際業務需求定期清理。使用者選擇斷開 Threads 連線時，系統會停止後續存取，並刪除該帳號的授權資料、權杖、蒐集設定與蒐集結果。</p>
    <h2>五、第三方服務</h2><p>本服務使用 Meta Threads API 取得經授權可存取的公開內容；使用 Vercel 提供網站託管與雲端運算；使用 Neon 提供資料庫儲存；只有在啟用或操作 AI 文案功能時，才會將必要的公開內容與文案設定傳送至 OpenAI API 以產生待人工審核的文字草稿。各服務的資料處理亦受其個別政策約束。</p>
    <h2>六、您的權利</h2><p>您可以要求查詢、更正、停止使用或刪除由本服務控制的資料，也可以隨時於 Threads／Meta 帳號設定中撤回應用程式授權。</p>
    <h2>七、聯絡方式</h2><p>隱私或資料請求請寄至：<a href="mailto:dragonboat8966@gmail.com">dragonboat8966@gmail.com</a>。</p>
  </main>;
}
