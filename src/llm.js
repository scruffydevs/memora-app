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
