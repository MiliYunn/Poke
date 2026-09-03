import { env } from '$env/dynamic/private';

export function stripModelReasoning(value: string) {
  return value
    .replace(/<(think|analysis)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '')
    .replace(/<\/?(?:think|analysis)\b[^>]*>/gi, '')
    .trim();
}

export class AIGateway {
  private baseUrl = env.GONKA_BASE_URL || 'https://api.gonkarouter.io/v1';
  readonly primaryModel = env.GONKA_MODEL || 'deepseek-ai/DeepSeek-V4-Flash-0731';
  readonly secondaryModel = env.GONKA_MODEL_SECONDARY || '';
  async chat(messages: Array<{role: string; content: string}>, stream = false, model = this.primaryModel, maxTokens = 1800) {
    if (!env.GONKA_API_KEY) throw new Error('GONKA_API_KEY is not configured');
    const controller=new AbortController(); const timer=setTimeout(()=>controller.abort(),30_000);
    try { return await fetch(`${this.baseUrl}/chat/completions`, { method: 'POST', headers: { 'content-type':'application/json', authorization:`Bearer ${env.GONKA_API_KEY}` }, body: JSON.stringify({ model, messages, stream, temperature:0.1, max_tokens:maxTokens }), signal:controller.signal }); }
    catch(error){ if(error instanceof Error&&error.name==='AbortError') throw new Error('GonkaRouter timed out after 30 seconds. Please try again.'); throw error; }
    finally { clearTimeout(timer); }
  }

  async complete(messages: Array<{role: string; content: string}>, model = this.primaryModel, maxTokens = 1800) {
    const response = await this.chat(messages, false, model, maxTokens);
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(`GonkaRouter returned ${response.status}`);
    const rawContent = body?.choices?.[0]?.message?.content;
    if (typeof rawContent !== 'string' || !rawContent.trim()) throw new Error('GonkaRouter returned an empty response');
    const content = stripModelReasoning(rawContent);
    if (!content) throw new Error('GonkaRouter returned reasoning without a final answer. Please retry.');
    const requestId = response.headers.get('x-gonka-request-id') || response.headers.get('x-request-id') || response.headers.get('request-id') || body?.request_id || body?.id || 'not-provided';
    return { content, requestId: String(requestId), model: String(body?.model || model) };
  }

  async consensus(messages: Array<{role: string; content: string}>) {
    const models = [...new Set([this.primaryModel, this.secondaryModel].filter(Boolean))];
    return Promise.all(models.map((model) => this.complete(messages, model)));
  }
}
