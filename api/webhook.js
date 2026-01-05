const line = require('@line/bot-sdk');
const OpenAI = require('openai');
const { kv } = require('@vercel/kv');

const client = new line.Client({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET
});

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
        let userContent = "";

        // 1. 處理訊息內容
        if (event.message.type === 'text') {
          userContent = event.message.text;
        } else if (event.message.type === 'image') {
          // 標記收到圖片，未來若升級視覺功能可在此擴充
          userContent = "[系統提醒：Cayla 小姐上傳了一張圖片，請提醒她若有重要細節請輔以文字說明]";
        }

        // 2. 深度提取記憶：將數量從 10 筆提升至 50 筆
        const keys = await kv.keys(`note:${userId}:*`);
        let memoryContext = "目前尚無任何紀錄。";
        
        if (keys.length > 0) {
          // 排序並取得最新 50 筆紀錄
          const sortedKeys = keys.sort().slice(-50); 
          const recentNotes = [];
          for (const key of sortedKeys) {
            const val = await kv.get(key);
            recentNotes.push(val);
          }
          memoryContext = recentNotes.join("\n");
        }

        // 3. 呼叫大腦並帶入長效記憶
        const completion = await openai.chat.completions.create({
          model: "gemini-3-flash-preview", 
          messages: [
            { 
              role: "system", 
              content: `你現在是 Cayla 小姐的專屬私人工管家。
              你的特質：優雅、記憶力極強、能從瑣碎紀錄中整理條理。
              
              【小姐的歷史行程紀錄庫 (最新 50 筆)】：
              ${memoryContext}
              
              【指令】：
              1. 稱呼：務必稱呼使用者為「Cayla 小姐」。
              2. 記憶檢索：當小姐詢問行程、計畫或過去的事，請務必先從下方的紀錄庫中搜尋。
              3. 紀錄任務：小姐說出的任何事項，請優雅地確認已紀錄。
              4. 智慧整理：若小姐問「今天有什麼行程」，請自動忽略過期的紀錄，只整理出相關的項目。` 
            },
            { role: "user", content: userContent }
          ],
        });

        const replyText = completion.choices[0].message.content;

        // 4. 存入新紀錄 (包含精確時間，方便 AI 判斷新舊)
        const timestamp = new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' });
        await kv.set(`note:${userId}:${Date.now()}`, `[時間:${timestamp}] ${userContent}`);

        // 5. 回傳給 LINE
        await client.replyMessage(event.replyToken, {
          type: 'text',
          text: replyText
        });
      }
    }
    return res.status(200).send('OK');
  } catch (error) {
    console.error('管家運行異常:', error);
    return res.status(200).send('OK');
  }
};
