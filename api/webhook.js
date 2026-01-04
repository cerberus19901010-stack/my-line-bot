const { MessagingApiClient } = require('@line/bot-sdk');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { kv } = require('@vercel/kv');

const client = new MessagingApiClient({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN
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

        // 呼叫 Gemini AI
        const model = genAI.getGenerativeModel({ model: "gemini-pro"});
        const prompt = `你是一個記事本助手。用戶說："${userText}"。請判斷這是否包含需要紀錄的事項，如果是，請簡短回覆「✅ 已記錄：...」。`;
        const result = await model.generateContent(prompt);
        const response = await result.response;
        const replyText = response.text();

        // 存入資料庫
        await kv.set(`note:${userId}:${Date.now()}`, userText);

        // 回傳 LINE 訊息
        await client.replyMessage({
          replyToken: event.replyToken,
          messages: [{ type: 'text', text: replyText }]
        });
      }
    }
    res.status(200).send('OK');
  } catch (error) {
    console.error(error);
    res.status(500).send('Internal Server Error');
  }
};
