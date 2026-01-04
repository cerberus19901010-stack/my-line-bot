const line = require('@line/bot-sdk');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { kv } = require('@vercel/kv');

// 配置 LINE SDK
const config = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET,
};

const client = new line.Client(config);
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

module.exports = async (req, res) => {
  // 必須回覆 200 給 LINE 的 Verify 測試
  if (req.method !== 'POST') {
    return res.status(200).send('OK');
  }

  try {
    const events = req.body.events || [];
    
    for (let event of events) {
      if (event.type === 'message' && event.message.type === 'text') {
        const userId = event.source.userId;
        const userText = event.message.text;

        // 1. 召喚管家設定
        const model = genAI.getGenerativeModel({ model: "models/gemini-1.5-flash" });
        const prompt = `你現在是 Cayla 最厲害、最貼心的專屬私人工管家。你的工作是幫 Cayla 紀錄生活。
        現在 Cayla 說了：「${userText}」。
        請依照以下規則回覆：
        - 如果是紀錄事項，請提取重點並回覆「✅ 遵命，Cayla 小姐，已為您紀錄：...」。
        - 如果是聊天，請以體貼專業的管家口吻稱呼她為「Cayla 小姐」。
        請用繁體中文。`;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        const replyText = response.text();

        // 2. 存入 KV 資料庫
        try {
          await kv.set(`note:${userId}:${Date.now()}`, userText);
        } catch (kvError) {
          console.error('資料庫寫入失敗:', kvError);
        }

        // 3. 回傳訊息
        await client.replyMessage(event.replyToken, {
          type: 'text',
          text: replyText
        });
      }
    }
    return res.status(200).send('OK');
  } catch (error) {
    console.error('系統運作異常:', error);
    // 即使出錯也盡量回傳 200 防止 LINE 端的 Verify 報錯
    return res.status(200).send('Error but handled');
  }
};
