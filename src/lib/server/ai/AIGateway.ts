import { env } from '$env/dynamic/private';
export class AIGateway {
  private baseUrl = env.GONKA_BASE_URL || 'https://api.gonkarouter.io/v1';
  readonly primaryModel = env.GONKA_MODEL || 'deepseek-ai/DeepSeek-V4-Flash-0731';
  async chat(messages: Array<{role: string; content: string}>, stream = false, model = this.primaryModel) {
    if (!env.GONKA_API_KEY) throw new Error('GONKA_API_KEY is not configured');
    const controller=new AbortController(); const timer=setTimeout(()=>controller.abort(),30_000);
    try { return await fetch(`${this.baseUrl}/chat/completions`, { method: 'POST', headers: { 'content-type':'application/json', authorization:`Bearer ${env.GONKA_API_KEY}` }, body: JSON.stringify({ model, messages, stream, temperature:0.1 }), signal:controller.signal }); }
    catch(error){ if(error instanceof Error&&error.name==='AbortError') throw new Error('GonkaRouter timed out after 30 seconds. Please try again.'); throw error; }
    finally { clearTimeout(timer); }
  }

  async complete(messages: Array<{role: string; content: string}>, model = this.primaryModel) {
    const response = await this.chat(messages, false, model);
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(`GonkaRouter returned ${response.status}`);
    const content = body?.choices?.[0]?.message?.content;
    if (typeof content !== 'string' || !content.trim()) throw new Error('GonkaRouter returned an empty response');
    const requestId = response.headers.get('x-gonka-request-id') || response.headers.get('x-request-id') || response.headers.get('request-id') || body?.request_id || body?.id || 'not-provided';
    return { content, requestId: String(requestId), model: String(body?.model || model) };
  }
}
