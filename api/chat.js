export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Missing OPENROUTER_API_KEY environment variable' });
  }

  try {
    const { messages, model = process.env.OPENROUTER_MODEL || 'openai/gpt-4o-mini', max_tokens = 450 } = req.body || {};

    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'messages must be a non-empty array' });
    }

    const upstreamResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'HTTP-Referer': req.headers.origin || 'https://vercel.app',
        'X-Title': 'Aysh AI Counselor'
      },
      body: JSON.stringify({
        model,
        messages,
        max_tokens
      })
    });

    const data = await upstreamResponse.json();

    if (!upstreamResponse.ok) {
      return res.status(upstreamResponse.status).json({
        error: data?.error?.message || 'OpenRouter request failed'
      });
    }

    return res.status(200).json({
      content: data?.choices?.[0]?.message?.content || ''
    });
  } catch (error) {
    console.error('api/chat error:', error);
    return res.status(500).json({
      error: 'Unexpected server error'
    });
  }
}