const line = require('@line/bot-sdk');
const OpenAI = require('openai');
const { kv } = require('@vercel/kv');

// 1. 初始化 LINE
const client = new line.Client({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET
});

// 2. 參考教學：使用 OpenAI SDK 呼叫 Gemini (Custom Provider)
const openai = new OpenAI({
  apiKey: process.env.GEMINI_API_KEY, // 這裡填 Gemini 的 Key
  baseURL: "https://generativelanguage.googleapis.com/v1beta/" // 關鍵：指向 Google 接口
});

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(200).send('OK');

  try {
    const events = req.body.events || [];
    for (let event of events) {
      if (event.type === 'message' && event.message.type === 'text') {
        const userId = event.source.userId;
        const userText = event.message.text;

        // 3. 呼叫 Gemini 模型 (使用文章推薦的 gemini-1.5-flash 省錢又快速)
        const completion = await openai.chat.completions.create({
          model: "gemini-1.5-flash", 
          messages: [
            { 
              role: "system", 
              content: "你現在是 Cayla 的專屬管家。請以貼心專業的口吻稱呼她為「Cayla 小姐」。若是紀錄事項，請回覆「✅ 遵命，Cayla 小姐，已紀錄：...」。請用繁體中文。" 
            },
            { role: "user", content: userText }
          ],
        });

        const replyText = completion.choices[0].message.content;

        // 4. 存入資料庫
        await kv.set(`note:${userId}:${Date.now()}`, userText);

        // 5. 回傳 LINE
        await client.replyMessage(event.replyToken, {
          type: 'text',
          text: replyText
        });
      }
    }
    return res.status(200).send('OK');
  } catch (error) {
    console.error('管家運行異常:', error);
    return res.status(200).send('Error Handled');
  }
};
