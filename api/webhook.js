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
  // 必須處理 LINE Verify 的 GET 請求或非 POST 請求
  if (req.method !== 'POST') {
    return res.status(200).send('OK');
  }

  try {
    const events = req.body.events || [];
    
    for (let event of events) {
      // 只處理文字訊息
      if (event.type === 'message' && event.message.type === 'text') {
        const userId = event.source.userId;
        const userText = event.message.text;

        // 1. 召喚管家：強制使用 v1 版本以避開 404 錯誤
        const model = genAI.getGenerativeModel(
          { model: "gemini-pro" },
          { apiVersion: 'v1' }
        );

        const prompt = `你現在是 Cayla 最厲害、最貼心的專屬私人工管家。你的工作是幫 Cayla 紀錄生活。
        現在 Cayla 說了：「${userText}」。
        請依照以下規則回覆：
        - 如果是紀錄事項，請提取重點並回覆「✅ 遵命，Cayla 小姐，已為您紀錄：...」。
        - 如果是聊天，請以體貼專業的管家口吻稱呼她為「Cayla 小姐」。
        請用繁體中文。`;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        const replyText = response.text();

        // 2. 存入資料庫
        await kv.set(`note:${userId}:${Date.now()}`, userText);

        // 3. 回傳訊息給 LINE
        await client.replyMessage(event.replyToken, {
          type: 'text',
          text: replyText
        });
      }
    }
    return res.status(200).send('OK');
  } catch (error) {
    console.error('系統運作異常:', error);
    return res.status(200).send('Error Handled');
  }
};
