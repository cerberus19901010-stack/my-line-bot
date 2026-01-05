const line = require('@line/bot-sdk');
const OpenAI = require('openai');
const { kv } = require('@vercel/kv');

// 1. 初始化 LINE
const client = new line.Client({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET
});

// 2. 修正初始化方式：明確指定使用 GEMINI_API_KEY 變數
const openai = new OpenAI({
  apiKey: process.env.GEMINI_API_KEY, 
  baseURL: "https://generativelanguage.googleapis.com/v1beta/" 
});

module.exports = async (req, res) => {
  // 必須回傳 200 給 LINE Verify
  if (req.method !== 'POST') {
    return res.status(200).send('OK');
  }

  try {
    const events = req.body.events || [];
    for (let event of events) {
      if (event.type === 'message' && event.message.type === 'text') {
        const userId = event.source.userId;
        const userText = event.message.text;

        // 3. 使用指定的 gemini-1.5-flash 模型
        const completion = await openai.chat.completions.create({
          model: "gemini-1.5-flash", 
          messages: [
            { 
              role: "system", 
              content: "你現在是 Cayla 小姐的專屬管家。請以體貼專業的口吻回覆。若是紀錄，請說「✅ 遵命，Cayla 小姐，已紀錄：...」。請用繁體中文。" 
            },
            { role: "user", content: userText }
          ],
        });

        const replyText = completion.choices[0].message.content;

        // 4. 存入 KV 資料庫
        await kv.set(`note:${userId}:${Date.now()}`, userText);

        // 5. 回傳訊息
        await client.replyMessage(event.replyToken, {
          type: 'text',
          text: replyText
        });
      }
    }
    return res.status(200).send('OK');
  } catch (error) {
    console.error('管家運行異常:', error);
    // 即使失敗也要回傳 200，避免 LINE 顯示 500 錯誤
    return res.status(200).send('Error Handled');
  }
};
