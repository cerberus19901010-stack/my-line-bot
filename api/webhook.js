const line = require('@line/bot-sdk');
const OpenAI = require('openai');
const { kv } = require('@vercel/kv');
const axios = require('axios'); // 用於下載 LINE 圖片

const config = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET
};

const client = new line.Client(config);
const openai = new OpenAI({
  apiKey: process.env.GEMINI_API_KEY,
  baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/"
});

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(200).send('OK');

  try {
    const events = req.body.events || [];
    for (let event of events) {
      if (event.type === 'message') {
        const userId = event.source.userId;
        let messagesForAI = [];
        let userLogContent = "";

        // 1. 處理訊息：判斷是文字還是圖片
        if (event.message.type === 'text') {
          userLogContent = event.message.text;
          messagesForAI.push({ role: "user", content: userLogContent });
        } 
        else if (event.message.type === 'image') {
          // 下載 LINE 圖片並轉為 Base64
          const stream = await client.getMessageContent(event.message.id);
          const chunks = [];
          for await (const chunk of stream) { chunks.push(chunk); }
          const buffer = Buffer.concat(chunks);
          const base64Image = buffer.toString('base64');

          userLogContent = "[Cayla 小姐傳送了一張圖片/開會紀錄]";
          messagesForAI.push({
            role: "user",
            content: [
              { type: "text", text: "請分析這張圖片（可能是開會紀錄或行程表），提取關鍵的時間、地點與事項。" },
              { type: "image_url", image_url: { url: `data:image/jpeg;base64,${base64Image}` } }
            ]
          });
        }

        // 2. 提取 50 筆歷史記憶
        const keys = await kv.keys(`note:${userId}:*`);
        const recentNotes = [];
        if (keys.length > 0) {
          const sortedKeys = keys.sort().slice(-50);
          for (const key of sortedKeys) {
            recentNotes.push(await kv.get(key));
          }
        }
        const memoryContext = recentNotes.join("\n");

        // 3. 呼叫 Gemini 3 Flash (支援圖片與文字混和輸入)
        const completion = await openai.chat.completions.create({
          model: "gemini-3-flash-preview",
          messages: [
            { 
              role: "system", 
              content: `你現在是 Cayla 小姐的專屬管家。
              【歷史紀錄區】：
              ${memoryContext}
              
              【指令】：
              1. 稱呼小姐為「Cayla 小姐」。
              2. 若收到圖片，請仔細識別其中的文字資訊（如開會時間、地點）。
              3. 識別後請回覆：「✅ 遵命，Cayla 小姐，已為您從圖片中提取並紀錄：...」。
              4. 詢問行程時，請結合歷史紀錄回覆。` 
            },
            ...messagesForAI
          ],
        });

        const replyText = completion.choices[0].message.content;

        // 4. 存入紀錄
        const timestamp = new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' });
        await kv.set(`note:${userId}:${Date.now()}`, `[時間:${timestamp}] ${userLogContent} -> AI識別結果: ${replyText}`);

        // 5. 回傳 LINE
        await client.replyMessage(event.replyToken, { type: 'text', text: replyText });
      }
    }
    return res.status(200).send('OK');
  } catch (error) {
    console.error('管家視覺模組異常:', error);
    return res.status(200).send('OK');
  }
};
