/**
 * @eticart/ai — AI/LLM package.
 */
export * from './llm-provider.js';
export * from './ai-service.js';
export * from './guardrails.js';

export const AiHelpers = {
  /**
   * Default config builder (env'den).
   */
  fromEnv(): {
    provider: 'openai' | 'anthropic';
    apiKey: string;
    model: string;
  } {
    const provider = (process.env['AI_PROVIDER'] ?? 'openai') as 'openai' | 'anthropic';
    const apiKey =
      provider === 'openai'
        ? (process.env['OPENAI_API_KEY'] ?? '')
        : (process.env['ANTHROPIC_API_KEY'] ?? '');
    const model =
      process.env['AI_MODEL'] ??
      (provider === 'openai' ? 'gpt-4o-mini' : 'claude-3-haiku-20240307');
    return { provider, apiKey, model: model as never };
  },
};