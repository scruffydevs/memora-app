// Cloud model call. PROTOTYPE: DeepSeek, synthetic data only. Production needs a zero-retention provider.
export const llmEnabled = () => Boolean(process.env.DEEPSEEK_API_KEY);
export const providerName = () => (llmEnabled() ? 'deepseek (synthetic data only)' : 'none (dry run)');

export async function callModel(messages) {
  if (!llmEnabled()) throw new Error('LLM_DISABLED');
  const base = process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com';
  const res = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}` },
    body: JSON.stringify({ model: process.env.DEEPSEEK_MODEL || 'deepseek-chat', messages, temperature: 0.1 }),
  });
  if (!res.ok) throw new Error(`LLM_ERROR ${res.status}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content?.trim() ?? '';
}

// OpenRouter (OpenAI-compatible). Used to write the patient portfolio from the onboarding answers.
// PROTOTYPE: synthetic or volunteer data only. Set PORTFOLIO_AI=off to switch it off.
export const openRouterEnabled = () => Boolean(process.env.OPENROUTER_API_KEY) && process.env.PORTFOLIO_AI !== 'off';
export const openRouterModel = () => process.env.OPENROUTER_MODEL || 'anthropic/claude-haiku-5.5';

export async function callOpenRouter(messages, { maxTokens = 3000, json = true } = {}) {
  if (!openRouterEnabled()) throw new Error('LLM_DISABLED');
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      'HTTP-Referer': process.env.PUBLIC_URL || 'https://memora-app.deploygrid.net',
      'X-Title': 'Memora',
    },
    body: JSON.stringify({ model: openRouterModel(), messages, temperature: 0.2, max_tokens: maxTokens, ...(json ? { response_format: { type: 'json_object' } } : {}) }),
    signal: AbortSignal.timeout(90000),
  });
  if (!res.ok) throw new Error(`LLM_ERROR ${res.status}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content?.trim() ?? '';
}
