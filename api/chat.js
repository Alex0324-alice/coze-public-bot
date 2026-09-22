export default async function handler(request) {
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: '只支持 POST 请求' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const body = await request.json();
    const { message, userId, conversationId } = body;

    if (!message) {
      return new Response(JSON.stringify({ error: '缺少 message' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const COZE_API_TOKEN = process.env.COZE_API_TOKEN;
    const COZE_BOT_ID = process.env.COZE_BOT_ID;
    const COZE_API_BASE = process.env.COZE_API_BASE || 'https://api.coze.cn';

    if (!COZE_API_TOKEN || !COZE_BOT_ID) {
      return new Response(JSON.stringify({ error: '缺少环境变量' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const headers = {
      'Authorization': `Bearer ${COZE_API_TOKEN}`,
      'Content-Type': 'application/json',
    };

    const createBody = {
      bot_id: COZE_BOT_ID,
      user_id: userId || 'anonymous',
      stream: false,
      auto_save_history: true,
      additional_messages: [
        {
          role: 'user',
          content: message,
          content_type: 'text',
        },
      ],
    };

    if (conversationId) {
      createBody.conversation_id = conversationId;
    }

    const createRes = await fetch(`${COZE_API_BASE}/v3/chat`, {
      method: 'POST',
      headers,
      body: JSON.stringify(createBody),
    });

    const createData = await createRes.json();

    if (createData.code !== 0) {
      return new Response(JSON.stringify({ error: '创建聊天失败', detail: createData }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const chatId = createData.data.id;
    const convId = createData.data.conversation_id;
    let status = createData.data.status;
    let retrieveData = createData;

    for (let i = 0; i < 6 && status === 'in_progress'; i++) {
      await new Promise((r) => setTimeout(r, 1000));

      const retrieveRes = await fetch(
        `${COZE_API_BASE}/v3/chat/retrieve?chat_id=${chatId}&conversation_id=${convId}`,
        {
          method: 'GET',
          headers: { Authorization: `Bearer ${COZE_API_TOKEN}` },
        }
      );

      retrieveData = await retrieveRes.json();

      if (retrieveData.code !== 0) {
        return new Response(JSON.stringify({ error: '查询聊天状态失败', detail: retrieveData }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      status = retrieveData.data.status;
    }

    if (status !== 'completed') {
      return new Response(JSON.stringify({ error: '聊天未完成或超时' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const listRes = await fetch(
      `${COZE_API_BASE}/v3/chat/message/list?chat_id=${chatId}&conversation_id=${convId}`,
      {
        method: 'GET',
        headers: { Authorization: `Bearer ${COZE_API_TOKEN}` },
      }
    );

    const listData = await listRes.json();

    if (listData.code !== 0) {
      return new Response(JSON.stringify({ error: '获取消息失败', detail: listData }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const messages = listData.data || [];
    const answerMsg = messages.find((m) => m.role === 'assistant' && m.type === 'answer');
    const answer = answerMsg ? answerMsg.content : '没有找到回答';

    return new Response(JSON.stringify({ answer, conversationId: convId }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
