const line = require('@line/bot-sdk');
const OpenAI = require('openai');
const { kv } = require('@vercel/kv');

// 1. 初始化 LINE 配置
const client = new line.Client({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET
});

// 2. 初始化 OpenAI SDK (對接 Gemini 2026 最新路徑)
// 參考文章與官方更新，路徑加上 /openai/ 是為了相容 SDK 呼叫
const openai = new OpenAI({
  apiKey: process.env.GEMINI_API_KEY, 
  baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/" 
});

module.exports = async (req, res) => {
  // 處理 LINE Webhook 驗證
  if (req.method !== 'POST') return res.status(200).send('OK');

  try {
    const events = req.body.events || [];
    for (let event of events) {
      if (event.type === 'message' && event.message.type === 'text') {
        const userId = event.source.userId;
        const userText = event.message.text;

        // 3. 呼叫 Gemini 大腦 (模型名稱請對準您的權限)
        const completion = await openai.chat.completions.create({
          model: "gemini-3-flash-preview", // 您的圖 16 權限
          messages: [
            { 
              role: "system", 
              content: `你現在是 Cayla 小姐的專屬 AI 助理。
              1. 語氣：優雅、體貼、專業。
              2. 稱呼：務必稱呼使用者為「Cayla 小姐」。
              3. 任務：如果小姐提供資訊，請紀錄並回覆「✅ 遵命，Cayla 小姐，已為您紀錄：...」。
              4. 語言：一律使用繁體中文。` 
            },
            { role: "user", content: userText }
          ],
        });

        const replyText = completion.choices[0].message.content;

        // 4. 紀錄到資料庫 (比照文章中的數據流概念)
        await kv.set(`note:${userId}:${Date.now()}`, userText);

        // 5. 回傳給 LINE
        await client.replyMessage(event.replyToken, {
          type: 'text',
          text: replyText
        });
      }
    }
    return res.status(200).send('OK');
  } catch (error) {
    console.error('管家運行異常:', error);
    return res.status(200).send('OK'); // 即使失敗也回傳 200 以符合 LINE 規範
  }
};
