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
  if (req.method !== 'POST') return res.status(200).send('OK');

  try {
    const events = req.body.events || [];
    for (let event of events) {
      if (event.type === 'message') {
        // 1. 識別儲存空間：優先使用 groupId，若非群組則用 userId
        const storageId = event.source.groupId || event.source.userId;
        const displayName = await client.getProfile(event.source.userId).then(p => p.displayName).catch(() => "成員");
        
        let messagesForAI = [];
        let userLogContent = "";

        // 2. 處理文字與圖片
        if (event.message.type === 'text') {
          userLogContent = `${displayName}: ${event.message.text}`;
          messagesForAI.push({ role: "user", content: event.message.text });
        } 
        else if (event.message.type === 'image') {
          const stream = await client.getMessageContent(event.message.id);
          const chunks = [];
          for await (const chunk of stream) { chunks.push(chunk); }
          const base64Image = Buffer.concat(chunks).toString('base64');

          userLogContent = `[${displayName} 傳送了圖片]`;
          messagesForAI.push({
            role: "user",
            content: [
              { type: "text", text: "請識別這張圖片中的行程或重要資訊。" },
              { type: "image_url", image_url: { url: `data:image/jpeg;base64,${base64Image}` } }
            ]
          });
        }

        // 3. 提取該群組的 50 筆共享記憶
        const keys = await kv.keys(`note:${storageId}:*`);
        const recentNotes = [];
        if (keys.length > 0) {
          const sortedKeys = keys.sort().slice(-50);
          for (const key of sortedKeys) {
            recentNotes.push(await kv.get(key));
          }
        }
        const memoryContext = recentNotes.join("\n");

        // 4. 呼叫 Gemini 3 並告知這是在群組環境
        const completion = await openai.chat.completions.create({
          model: "gemini-3-flash-preview",
          messages: [
            { 
              role: "system", 
              content: `你現在是 Cayla 仙女太太與其家人的專屬管家。
              你正在一個群組中服務。
              
              【目前群組共享紀錄】：
              ${memoryContext}
              
              【指令】：
              1. 稱呼：對話中請稱呼 Cayla 仙女太太，並對其他成員保持禮貌。
              2. 記憶：所有人傳送的行程都會存入同一個紀錄庫。
              3. 整理：當有人詢問行程時，請綜合整理這 50 筆紀錄回覆。` 
            },
            ...messagesForAI
          ],
        });

        const replyText = completion.choices[0].message.content;

        // 5. 存入紀錄 (標記是誰說的)
        const timestamp = new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' });
        await kv.set(`note:${storageId}:${Date.now()}`, `[${timestamp}] ${userLogContent}`);

        await client.replyMessage(event.replyToken, { type: 'text', text: replyText });
      }
    }
    return res.status(200).send('OK');
  } catch (error) {
    console.error('群組管家異常:', error);
    return res.status(200).send('OK');
  }
};
