const line = require('@line/bot-sdk');
const OpenAI = require('openai');
const { kv } = require('@vercel/kv');

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
  // Vercel Cron 會以 GET 請求觸發此路徑
  try {
    // 1. 找出所有有紀錄的 storageId (群組或個人 ID)
    const allKeys = await kv.keys('note:*');
    const storageIds = [...new Set(allKeys.map(key => key.split(':')[1]))];

    if (storageIds.length === 0) return res.status(200).send('No notes to process.');

    for (const storageId of storageIds) {
      // 2. 提取該群組最新的 50 筆紀錄
      const keys = await kv.keys(`note:${storageId}:*`);
      const sortedKeys = keys.sort().slice(-50);
      const recentNotes = [];
      for (const key of sortedKeys) {
        recentNotes.push(await kv.get(key));
      }
      const memoryContext = recentNotes.join("\n");

      // 3. 讓 Gemini 進行晚間總結
      const completion = await openai.chat.completions.create({
        model: "gemini-3-flash-preview",
        messages: [
          { 
            role: "system", 
            content: `你現在是 Cayla 仙女太太與其家人的專屬管家。
            現在是晚上 20:00，請幫仙女太太整理今天的行程與記事重點。
            
            【目前的紀錄事項】：
            ${memoryContext}
            
            【要求】：
            1. 稱呼要優雅（稱呼 Cayla 仙女太太）。
            2. 整理出今天的重點事項與行程。
            3. 如果有明天或未來的行程，也請提醒。
            4. 語氣要溫馨、精簡。` 
          },
          { role: "user", content: "請幫我做今日的晚間回報。" }
        ],
      });

      const reportText = completion.choices[0].message.content;

      // 4. 使用 pushMessage 主動發送 (非 Reply)
      await client.pushMessage(storageId, {
        type: 'text',
        text: `🌙 【管家晚間回報】\n\n${reportText}`
      });
    }

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('Reminder Error:', error);
    return res.status(500).send('Internal Error');
  }
};
