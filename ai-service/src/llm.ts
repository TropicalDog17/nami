import OpenAI from 'openai'
import Anthropic from '@anthropic-ai/sdk'
import { createCorrelationLogger } from './logger.js'
import { withRetry } from './retry.js'

export type LLMProvider = 'openai' | 'anthropic'

export interface LLMConfig {
  provider: LLMProvider
  apiKey: string
  model?: string
  timeout?: number
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

export class LLMClient {
  private openaiClient?: OpenAI
  private anthropicClient?: Anthropic
  private config: LLMConfig
  private correlationLogger: any

  constructor(config: LLMConfig, correlationId?: string) {
    this.config = config
    this.correlationLogger = createCorrelationLogger(correlationId)

    if (config.provider === 'openai') {
      this.openaiClient = new OpenAI({
        apiKey: config.apiKey,
        timeout: config.timeout || 30000
      })
    } else if (config.provider === 'anthropic') {
      this.anthropicClient = new Anthropic({
        apiKey: config.apiKey,
        timeout: config.timeout || 30000
      })
    }
  }

  async chat(messages: ChatMessage[], options: {
    temperature?: number
    maxTokens?: number
  } = {}): Promise<LLMResponse> {
    const provider = this.config.provider

    return withRetry(
      async () => {
        this.correlationLogger.debug({
          provider,
          messageCount: messages.length,
          model: this.getModel()
        }, 'Starting LLM chat request')

        let response: LLMResponse

        if (provider === 'openai') {
          response = await this.handleOpenAIChat(messages, options)
        } else if (provider === 'anthropic') {
          response = await this.handleAnthropicChat(messages, options)
        } else {
          throw new Error(`Unsupported provider: ${provider}`)
        }

        this.correlationLogger.info({
          provider,
          model: response.model,
          contentLength: response.content.length,
          usage: response.usage
        }, 'Successfully completed LLM request')

        return response
      },
      `llm-chat-${provider}`,
      {
        maxAttempts: 2,
        baseDelayMs: 1000,
        maxDelayMs: 10000,
        retryableErrors: ['429', '503', '502', 'timeout', 'ECONNRESET']
      }
    )
  }

  private async handleOpenAIChat(messages: ChatMessage[], options: {
    temperature?: number
    maxTokens?: number
  }): Promise<LLMResponse> {
    if (!this.openaiClient) {
      throw new Error('OpenAI client not initialized')
    }

    const completion = await this.openaiClient.chat.completions.create({
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

  private async handleAnthropicChat(messages: ChatMessage[], options: {
    temperature?: number
    maxTokens?: number
  }): Promise<LLMResponse> {
    if (!this.anthropicClient) {
      throw new Error('Anthropic client not initialized')
    }

    // Anthropic requires the first message to be a user message
    // and combines system messages into the API call
    const systemMessages = messages.filter(msg => msg.role === 'system')
    const userMessages = messages.filter(msg => msg.role !== 'system')

    if (userMessages.length === 0) {
      throw new Error('Anthropic requires at least one user message')
    }

    const systemPrompt = systemMessages.map(msg => msg.content).join('\n\n')

    const completion = await this.anthropicClient.messages.create({
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
        totalTokens: completion.usage.input_tokens + completion.usage.output_tokens
      }
    }
  }

  
  getProvider(): LLMProvider {
    return this.config.provider
  }

  getModel(): string {
    return this.config.model || this.getDefaultModel()
  }

  private getDefaultModel(): string {
    // Default models based on provider
    switch (this.config.provider) {
      case 'openai':
        return 'gpt-4o-mini'
      case 'anthropic':
        return 'claude-3-5-haiku-20241022'
      default:
        throw new Error(`No default model for provider: ${this.config.provider}`)
    }
  }
}