import OpenAI from 'openai'
import Anthropic from '@anthropic-ai/sdk'
import { createCorrelationLogger } from '../utils/logger.js'
import { withRetry } from '../utils/retry.js'
import { loadConfig } from '../utils/config.js'

export type LLMProvider = 'openai' | 'anthropic' | 'zai'

export interface LLMConfig {
  provider?: LLMProvider
  apiKey?: string
  model?: string
  timeout?: number
  baseURL?: string
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface LLMResponse {
  content: string
  model: string
  usage?: {
    promptTokens: number
    completionTokens: number
    totalTokens: number
  }
}

interface ResolvedLLMConfig {
  provider: LLMProvider
  apiKey: string
  model?: string
  timeout: number
  baseURL?: string
}

export class LLMClient {
  private config: ResolvedLLMConfig
  private correlationLogger: any
  private client: OpenAI | Anthropic

  /**
   * Create a new LLM client.
   *
   * If fields are omitted from the passed config, they are resolved from
   * the application configuration loaded via `loadConfig()`. In particular:
   * - provider defaults to `MODEL_PROVIDER`
   * - OpenAI apiKey defaults to `OPENAI_API_KEY`
   * - Anthropic/ZAI apiKey defaults to `ANTHROPIC_AUTH_TOKEN` or `ANTHROPIC_API_KEY`
   * - baseURL for Anthropic/ZAI defaults to `ANTHROPIC_BASE_URL`
   */
  constructor(config: LLMConfig = {}, correlationId?: string) {
    this.correlationLogger = createCorrelationLogger(correlationId)

    const appCfg = loadConfig()

    const provider: LLMProvider = config.provider ?? appCfg.MODEL_PROVIDER

    let apiKey = config.apiKey
    let baseURL = config.baseURL

    if (provider === 'openai') {
      apiKey = apiKey ?? appCfg.OPENAI_API_KEY
      // allow caller to override baseURL if needed in the future
    } else if (provider === 'anthropic' || provider === 'zai') {
      apiKey = apiKey ?? appCfg.ANTHROPIC_AUTH_TOKEN ?? appCfg.ANTHROPIC_API_KEY
      baseURL = baseURL ?? appCfg.ANTHROPIC_BASE_URL
    }

    if (!apiKey) {
      throw new Error(`Missing API key for provider: ${provider}`)
    }

    this.config = {
      provider,
      apiKey,
      model: config.model,
      timeout: config.timeout ?? 30000,
      baseURL,
    }

    if (this.config.provider === 'openai') {
      this.client = new OpenAI({
        apiKey: this.config.apiKey,
        timeout: this.config.timeout,
        ...(this.config.baseURL && { baseURL: this.config.baseURL }),
      })
    } else if (this.config.provider === 'anthropic' || this.config.provider === 'zai') {
      this.client = new Anthropic({
        apiKey: this.config.apiKey,
        timeout: this.config.timeout,
        ...(this.config.baseURL && { baseURL: this.config.baseURL }),
      })
    } else {
      throw new Error(`Unsupported provider: ${this.config.provider}`)
    }
  }

  async chat(
    messages: ChatMessage[],
    options: {
      temperature?: number
      maxTokens?: number
    } = {}
  ): Promise<LLMResponse> {
    const provider = this.config.provider

    return withRetry(
      async () => {
        this.correlationLogger.debug(
          {
            provider,
            messageCount: messages.length,
            model: this.getModel(),
          },
          'Starting LLM chat request'
        )

        let response: LLMResponse

        if (provider === 'openai') {
          response = await this.handleOpenAIChat(messages, options)
        } else if (provider === 'anthropic' || provider === 'zai') {
          response = await this.handleAnthropicChat(messages, options)
        } else {
          throw new Error(`Unsupported provider: ${provider}`)
        }

        this.correlationLogger.info(
          {
            provider,
            model: response.model,
            contentLength: response.content.length,
            usage: response.usage,
          },
          'Successfully completed LLM request'
        )

        return response
      },
      `llm-chat-${provider}`,
      {
        maxAttempts: 2,
        baseDelayMs: 1000,
        maxDelayMs: 10000,
        retryableErrors: ['429', '503', '502', 'timeout', 'ECONNRESET'],
      }
    )
  }

  private async handleOpenAIChat(
    messages: ChatMessage[],
    options: {
      temperature?: number
      maxTokens?: number
    }
  ): Promise<LLMResponse> {
    if (!this.client) {
      throw new Error('OpenAI client not initialized')
    }
    if (!(this.client instanceof OpenAI)) {
      throw new Error('Client is not an OpenAI client')
    }

    const completion = await this.client.chat.completions.create({
      model: this.getModel(),
      messages: messages.map(msg => ({
        role: msg.role as 'system' | 'user' | 'assistant',
        content: msg.content
      })),
      temperature: options.temperature ?? 0.2,
      max_tokens: options.maxTokens ?? 1000
    })

    const content = completion.choices[0]?.message?.content || ''

    return {
      content,
      model: completion.model,
      usage: completion.usage ? {
        promptTokens: completion.usage.prompt_tokens,
        completionTokens: completion.usage.completion_tokens,
        totalTokens: completion.usage.total_tokens
      } : undefined
    }
  }

  private async handleAnthropicChat(
    messages: ChatMessage[],
    options: {
      temperature?: number
      maxTokens?: number
    }
  ): Promise<LLMResponse> {
    if (!this.client) {
      throw new Error('Anthropic client not initialized')
    }
    if (!(this.client instanceof Anthropic)) {
      throw new Error('Client is not an Anthropic client')
    }

    // Anthropic requires the first message to be a user message
    // and combines system messages into the API call
    const systemMessages = messages.filter(msg => msg.role === 'system')
    const userMessages = messages.filter(msg => msg.role !== 'system')

    if (userMessages.length === 0) {
      throw new Error('Anthropic requires at least one user message')
    }

    const systemPrompt = systemMessages.map(msg => msg.content).join('\n\n')

    const completion = await this.client.messages.create({
      model: this.getModel(),
      max_tokens: options.maxTokens ?? 1000,
      temperature: options.temperature ?? 0.2,
      system: systemPrompt || undefined,
      messages: userMessages.map(msg => ({
        role: msg.role as 'user' | 'assistant',
        content: msg.content
      }))
    })

    const content = completion.content[0]?.type === 'text' ? completion.content[0].text : ''

    return {
      content,
      model: completion.model,
      usage: {
        promptTokens: completion.usage.input_tokens,
        completionTokens: completion.usage.output_tokens,
        totalTokens: completion.usage.input_tokens + completion.usage.output_tokens,
      },
    }
  }

  getProvider(): LLMProvider {
    return this.config.provider
  }

  getModel(): string {
    return this.config.model || this.getDefaultModel()
  }

  private getDefaultModel(): string {
    switch (this.config.provider) {
      case 'openai':
        return 'gpt-4o-mini'
      case 'anthropic':
        return 'claude-3-5-haiku-20241022'
      case 'zai':
        return 'glm-4.7'
      default:
        throw new Error(`No default model for provider: ${this.config.provider}`)
    }
  }
}