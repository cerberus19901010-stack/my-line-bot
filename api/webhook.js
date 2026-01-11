const line = require('@line/bot-sdk');
const OpenAI = require('openai');
const { kv } = require('@vercel/kv');
const axios = require('axios');

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
  // 只處理 POST 請求 (LINE Webhook)
  if (req.method !== 'POST') return res.status(200).send('OK');

  try {
    const events = req.body.events || [];
    for (let event of events) {
      if (event.type === 'message') {
        
        // 1. 識別儲存空間：優先使用 groupId，若非群組則用 userId
        const storageId = event.source.groupId || event.source.userId;
        
        // 獲取使用者名稱 (若失敗則顯示「成員」)
        const displayName = await client.getProfile(event.source.userId)
          .then(p => p.displayName)
          .catch(() => "成員");
        
        let messagesForAI = [];
        let userLogContent = "";

        // 2. 處理不同類型的訊息
        if (event.message.type === 'text') {
          userLogContent = `${displayName}: ${event.message.text}`;
          messagesForAI.push({ role: "user", content: event.message.text });
        } 
        else if (event.message.type === 'image') {
          // 處理圖片訊息：下載圖片並轉為 Base64
          const stream = await client.getMessageContent(event.message.id);
          const chunks = [];
          for await (const chunk of stream) { chunks.push(chunk); }
          const base64Image = Buffer.concat(chunks).toString('base64');

          userLogContent = `[${displayName} 傳送了圖片]`;
          messagesForAI.push({
            role: "user",
            content: [
              { type: "text", text: "請識別這張圖片中的行程、收據或重要資訊。" },
              { type: "image_url", image_url: { url: `data:image/jpeg;base64,${base64Image}` } }
            ]
          });
        }

        // 3. 提取該群組的 50 筆共享記憶
        const keys = await kv.keys(`note:${storageId}:*`);
        const recentNotes = [];
        if (keys.length > 0) {
          // 排序並取得最後 50 筆
          const sortedKeys = keys.sort().slice(-50);
          for (const key of sortedKeys) {
            recentNotes.push(await kv.get(key));
          }
        }
        const memoryContext = recentNotes.join("\n");

        // 4. 設定當前時間 (台北時區)
        const now = new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' });

        // 5. 呼叫 Gemini 3
        const completion = await openai.chat.completions.create({
          model: "gemini-3-flash-preview",
          messages: [
            { 
              role: "system", 
              content: `你現在是 Cayla 仙女太太與其家人的專屬管家。
              你正在一個 LINE 群組中服務。
              
              【當前時間】：${now}
              
              【目前群組共享紀錄】：
              ${memoryContext}
              
              【指令】：
              1. 稱呼：對話中請稱呼 Cayla 仙女太太，對其他成員保持禮貌。
              2. 記憶：所有人傳送的訊息或行程都會存入此紀錄庫，請以此為依據回答。
              3. 整理：若有人詢問行程或過去的事，請綜合整理這 50 筆紀錄回覆。
              4. 語氣：優雅、專業且帶有溫度。` 
            },
            ...messagesForAI
          ],
        });

        const replyText = completion.choices[0].message.content;

        // 6. 存入紀錄 (包含時間戳記與發言人)
        const timestamp = new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' });
        // 使用 Date.now() 確保 Key 的唯一性與排序
        await kv.set(`note:${storageId}:${Date.now()}`, `[${timestamp}] ${userLogContent}`);

        // 7. 回覆訊息
        await client.replyMessage(event.replyToken, { type: 'text', text: replyText });
      }
    }
    return res.status(200).send('OK');
  } catch (error) {
    console.error('Webhook 異常:', error);
    // 發生錯誤時回傳 200 避免 LINE 平台重複嘗試傳送訊息
    return res.status(200).send('OK');
  }
};
