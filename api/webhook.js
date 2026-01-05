const line = require('@line/bot-sdk');
const OpenAI = require('openai');
const { kv } = require('@vercel/kv');

// 初始化 LINE
const client = new line.Client({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET
});

// 初始化 OpenAI (SDK 會自動讀取 OPENAI_API_KEY 環境變數)
const openai = new OpenAI();

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(200).send('OK');

  try {
    const events = req.body.events || [];
    for (let event of events) {
      if (event.type === 'message' && event.message.type === 'text') {
        const userId = event.source.userId;
        const userText = event.message.text;

        // 1. 呼叫最新的 OpenAI Responses API
        const response = await openai.responses.create({
          model: "gpt-5-nano", // 參考教學中的模型名稱
          input: `你現在是 Cayla 最厲害、最貼心的專屬私人工管家。你的工作是幫 Cayla 紀錄生活。
          現在 Cayla 說了：「${userText}」。
          請依照以下規則回覆：
          - 如果是紀錄事項，請提取重點並回覆「✅ 遵命，Cayla 小姐，已為您紀錄：...」。
          - 如果是聊天，請以體貼專業的管家口吻稱呼她為「Cayla 小姐」。
          請用繁體中文回覆。`
        });

        // 2. 取得 AI 回覆文字 (最新語法為 output_text)
        const replyText = response.output_text;

        // 3. 存入資料庫
        await kv.set(`note:${userId}:${Date.now()}`, userText);

        // 4. 回傳 LINE
        await client.replyMessage(event.replyToken, {
          type: 'text',
          text: replyText
        });
      }
    }
    return res.status(200).send('OK');
  } catch (error) {
    console.error('GPT 管家運作異常:', error);
    return res.status(200).send('Error');
  }
};
