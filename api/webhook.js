const line = require('@line/bot-sdk'); // 這裡改了
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { kv } = require('@vercel/kv');

// 初始化 LINE 客戶端 (這裡的寫法改了)
const client = new line.Client({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET
});

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(200).send('OK');

  try {
    const events = req.body.events;
    for (let event of events) {
      if (event.type === 'message' && event.message.type === 'text') {
        const userId = event.source.userId;
        const userText = event.message.text;

        // 1. 呼叫 Gemini
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        const prompt = `你是一個記事助手。用戶說："${userText}"。請提取重點並回覆「✅ 已記錄：...」，如果不是紀錄事項則簡單回覆。`;
        const result = await model.generateContent(prompt);
        const response = await result.response;
        const replyText = response.text();

        // 2. 存入資料庫
        await kv.set(`note:${userId}:${Date.now()}`, userText);

        // 3. 回傳 LINE (這裡的語法也微調了)
        await client.replyMessage(event.replyToken, {
          type: 'text',
          text: replyText
        });
      }
    }
    res.status(200).send('OK');
  } catch (error) {
    console.error(error);
    res.status(500).send('Internal Server Error');
  }
};
