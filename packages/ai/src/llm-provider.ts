/**
 * LLM Provider Abstraction — OpenAI + Anthropic.
 *
 * Her provider için ortak interface. Tenant ayarları hangi provider'ın
 * kullanılacağını belirler (env default fallback).
 */

export type LlmProvider = 'openai' | 'anthropic';

export type LlmModel =
  | 'gpt-4o-mini'
  | 'gpt-4o'
  | 'gpt-3.5-turbo'
  | 'claude-3-haiku-20240307'
  | 'claude-3-sonnet-20240229'
  | 'claude-3-opus-20240229';

export interface LlmMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LlmRequest {
  messages: LlmMessage[];
  model?: LlmModel;
  temperature?: number;
  maxTokens?: number;
  /** JSON response zorla (provider destekliyorsa) */
  jsonMode?: boolean;
  /** Yanıtta yer alacak tool'lar */
  tools?: LlmTool[];
  /** Stop sequences */
  stop?: string[];
}

export interface LlmTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface LlmUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface LlmResponse {
  /** Üretilen içerik (text) */
  content: string;
  /** Eğer tool çağrısı varsa */
  toolCalls?: Array<{ name: string; args: Record<string, unknown> }>;
  /** Kullanım istatistikleri */
  usage: LlmUsage;
  /** Model adı */
  model: string;
  /** Finish reason */
  finishReason: 'stop' | 'length' | 'tool_use' | 'content_filter' | 'error';
}

export interface LlmProviderImpl {
  readonly name: LlmProvider;
  chat(request: LlmRequest, apiKey: string): Promise<LlmResponse>;
  /** Provider'ın mevcut modelleri. */
  readonly supportedModels: ReadonlyArray<LlmModel>;
  /** Token başına tahmini USD maliyet (1K token). */
  readonly costPer1kTokens: Record<LlmModel, { input: number; output: number }>;
}

// ───────────────────────────────────────────────────────────
// OPENAI PROVIDER
// ───────────────────────────────────────────────────────────

export const OpenAIProvider: LlmProviderImpl = {
  name: 'openai',
  supportedModels: ['gpt-4o-mini', 'gpt-4o', 'gpt-3.5-turbo'],
  costPer1kTokens: {
    'gpt-4o-mini': { input: 0.00015, output: 0.0006 },
    'gpt-4o': { input: 0.005, output: 0.015 },
    'gpt-3.5-turbo': { input: 0.0005, output: 0.0015 },
    'claude-3-haiku-20240307': { input: 0, output: 0 },
    'claude-3-sonnet-20240229': { input: 0, output: 0 },
    'claude-3-opus-20240229': { input: 0, output: 0 },
  },
  async chat(request, apiKey) {
    const model = request.model ?? 'gpt-4o-mini';
    const body: Record<string, unknown> = {
      model,
      messages: request.messages.map((m) => ({ role: m.role, content: m.content })),
      temperature: request.temperature ?? 0.7,
      max_tokens: request.maxTokens ?? 1024,
    };
    if (request.jsonMode) body['response_format'] = { type: 'json_object' };
    if (request.stop) body['stop'] = request.stop;

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`OpenAI API error (${res.status}): ${err.slice(0, 200)}`);
    }
    const data = (await res.json()) as {
      choices: Array<{
        message: { content: string; tool_calls?: Array<{ function: { name: string; arguments: string } }> };
        finish_reason: string;
      }>;
      usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
    };
    const choice = data.choices[0]!;
    return {
      content: choice.message.content ?? '',
      toolCalls: choice.message.tool_calls?.map((tc) => ({
        name: tc.function.name,
        args: JSON.parse(tc.function.arguments),
      })),
      usage: {
        promptTokens: data.usage.prompt_tokens,
        completionTokens: data.usage.completion_tokens,
        totalTokens: data.usage.total_tokens,
      },
      model,
      finishReason: choice.finish_reason as LlmResponse['finishReason'],
    };
  },
};

// ───────────────────────────────────────────────────────────
// ANTHROPIC PROVIDER
// ───────────────────────────────────────────────────────────

export const AnthropicProvider: LlmProviderImpl = {
  name: 'anthropic',
  supportedModels: [
    'claude-3-haiku-20240307',
    'claude-3-sonnet-20240229',
    'claude-3-opus-20240229',
  ],
  costPer1kTokens: {
    'gpt-4o-mini': { input: 0, output: 0 },
    'gpt-4o': { input: 0, output: 0 },
    'gpt-3.5-turbo': { input: 0, output: 0 },
    'claude-3-haiku-20240307': { input: 0.00025, output: 0.00125 },
    'claude-3-sonnet-20240229': { input: 0.003, output: 0.015 },
    'claude-3-opus-20240229': { input: 0.015, output: 0.075 },
  },
  async chat(request, apiKey) {
    const model = (request.model ?? 'claude-3-haiku-20240307') as
      | 'claude-3-haiku-20240307'
      | 'claude-3-sonnet-20240229'
      | 'claude-3-opus-20240229';
    const systemMsg = request.messages.find((m) => m.role === 'system');
    const otherMsgs = request.messages.filter((m) => m.role !== 'system');

    const body: Record<string, unknown> = {
      model,
      max_tokens: request.maxTokens ?? 1024,
      temperature: request.temperature ?? 0.7,
      messages: otherMsgs.map((m) => ({ role: m.role, content: m.content })),
    };
    if (systemMsg) body['system'] = systemMsg.content;
    if (request.stop) body['stop_sequences'] = request.stop;

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Anthropic API error (${res.status}): ${err.slice(0, 200)}`);
    }
    const data = (await res.json()) as {
      content: Array<{ type: 'text'; text: string }>;
      stop_reason: string;
      usage: { input_tokens: number; output_tokens: number };
    };
    const content = data.content.map((c) => c.text).join('');
    return {
      content,
      usage: {
        promptTokens: data.usage.input_tokens,
        completionTokens: data.usage.output_tokens,
        totalTokens: data.usage.input_tokens + data.usage.output_tokens,
      },
      model,
      finishReason: data.stop_reason as LlmResponse['finishReason'],
    };
  },
};

// ───────────────────────────────────────────────────────────
// PROVIDER ROUTER
// ───────────────────────────────────────────────────────────

export function getProvider(name: LlmProvider): LlmProviderImpl {
  switch (name) {
    case 'openai':
      return OpenAIProvider;
    case 'anthropic':
      return AnthropicProvider;
    default:
      throw new Error(`Unknown LLM provider: ${name}`);
  }
}

export function estimateCost(
  provider: LlmProvider,
  model: LlmModel,
  usage: LlmUsage,
): number {
  const p = getProvider(provider);
  const cost = p.costPer1kTokens[model];
  if (!cost) return 0;
  return (
    (usage.promptTokens / 1000) * cost.input +
    (usage.completionTokens / 1000) * cost.output
  );
}