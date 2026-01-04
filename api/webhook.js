const line = require('@line/bot-sdk');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { kv } = require('@vercel/kv');

// 初始化 LINE 客戶端
const client = new line.Client({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET
});

// 初始化 Gemini AI
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

module.exports = async (req, res) => {
  // 只處理 POST 請求 (LINE 傳來的訊息)
  if (req.method !== 'POST') {
    return res.status(200).send('OK');
  }

  try {
    const events = req.body.events;
    
    for (let event of events) {
      // 只處理文字訊息
      if (event.type === 'message' && event.message.type === 'text') {
        const userId = event.source.userId;
        const userText = event.message.text;

        // 1. 設定 Gemini 的人格：Cayla 的厲害管家
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        const prompt = `你現在是 Cayla 最厲害、最貼心的專屬私人工管家。
        你的工作是幫 Cayla 紀錄生活大小事並提供專業的回應。
        
        現在 Cayla 說了：「${userText}」。

        請依照以下規則回覆：
        1. 如果是需要紀錄的事項，請提取重點，並用優雅專業的口吻回覆，開頭必須包含「✅ 遵命，Cayla 仙女太太，已為您紀錄：」。
        2. 如果只是日常聊天，請以管家的身分體貼、禮貌地回覆她，稱呼她為「Cayla 仙女太太」。
        3. 語氣要專業、謙卑、充滿智慧且具備能力感。
        請始終使用繁體中文。`;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        const replyText = response.text();

        // 2. 將原始訊息存入 Vercel KV 資料庫（方便日後查詢）
        await kv.set(`note:${userId}:${Date.now()}`, userText);

        // 3. 回傳管家的回覆給 Cayla 仙女太太
        await client.replyMessage(event.replyToken, {
          type: 'text',
          text: replyText
        });
      }
    }
    res.status(200).send('OK');
  } catch (
