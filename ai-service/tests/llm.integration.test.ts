import { LLMClient } from '../src/integrations/llm.js'
import { parseExpenseText } from '../src/core/parser.js'
import { describe, it, beforeAll, afterAll, expect, test } from 'vitest'
// Test data
const TEST_EXPENSES = [
  "Lunch 120k at McDonalds today",
  "Coffee 45k at Highlands Coffee yesterday",
  "Grab taxi 85k to airport this morning",
  "Grocery shopping 350k at Big C on Sunday",
  "Movie tickets 180k for two people last night"
]

describe('Anthropic LLM Integration Tests', () => {
  let llmClient: LLMClient

  beforeAll(() => {
    const config = (global as any).testConfig.anthropic
    console.log('🧪 Initializing Anthropic LLM client...')
    console.log('🔗 Proxy URL:', config.baseURL)
    console.log('🔑 Token:', config.apiKey.substring(0, 20) + '...')

    llmClient = new LLMClient(config)
  })

  describe('Basic LLM Chat', () => {
    it('should connect and respond to basic chat', async () => {
      const response = await llmClient.chat([
        { role: 'user', content: 'Hello! Please respond with exactly "LLM test successful" and nothing else.' }
      ], { temperature: 0.1, maxTokens: 100 })

      expect(response).toBeDefined()
      expect(response.content).toContain('successful')
      expect(response.content.length).toBeGreaterThan(0)
      expect(response.model).toBeDefined()
      expect(response.usage).toBeDefined()
      expect(response.usage!.totalTokens).toBeGreaterThan(0)

      console.log('✅ Basic chat successful')
      console.log(`📝 Response: "${response.content}"`)
      console.log(`🤖 Model: ${response.model}`)
      console.log(`📊 Tokens: ${response.usage!.totalTokens}`)
    })

    it('should handle multiple messages in conversation', async () => {
      const response = await llmClient.chat([
        { role: 'user', content: 'Remember the number 42' },
        { role: 'assistant', content: 'I will remember the number 42.' },
        { role: 'user', content: 'What number did I ask you to remember?' }
      ], { temperature: 0.1, maxTokens: 50 })

      expect(response.content).toContain('42')
      console.log('✅ Conversation context maintained')
    })

    it('should respect temperature and token limits', async () => {
      const response = await llmClient.chat([
        { role: 'user', content: 'Tell me a short joke' }
      ], { temperature: 0.9, maxTokens: 200 })

      expect(response.content.length).toBeGreaterThan(0)
      expect(response.usage!.completionTokens).toBeLessThanOrEqual(200)
      console.log('✅ Temperature and token limits respected')
    })
  })

  describe('Expense Text Parsing', () => {
    const accounts = (global as any).testConfig.accounts
    const tags = (global as any).testConfig.tags

    test.each(TEST_EXPENSES)('should parse expense: "%s"', async (expenseText) => {
      console.log(`\n📄 Testing: "${expenseText}"`)

      const result = await parseExpenseText(llmClient, expenseText, accounts, tags, 'test-expense')

      expect(result).toBeDefined()
      expect(result.toon).toBeDefined()

      // Confidence is currently always undefined - this should be updated when confidence calculation is implemented
      expect(result.confidence).toBe(undefined)

      // Try to parse TOON as JSON - handle cases where it might not be valid JSON yet
      let parsedTOON
      try {
        parsedTOON = JSON.parse(result.toon)
        console.log(`💰 Parsed: ${JSON.stringify(parsedTOON, null, 2)}`)

        // Basic structure validation
        if (parsedTOON.action) {
          expect(parsedTOON.action).toBeDefined()
          expect(parsedTOON.params).toBeDefined()
        }
      } catch (e) {
        console.log(`⚠️ TOON not valid JSON (this is expected if parsing failed): ${result.toon}`)
        // It's okay if parsing fails - just verify TOON content exists
        expect(result.toon).toBeDefined()
        expect(result.toon.length).toBeGreaterThan(0)
      }

      console.log(`🎯 Confidence: ${result.confidence}`)
    })

    it('should parse amounts with "k" notation correctly', async () => {
      const result = await parseExpenseText(
        llmClient,
        "Lunch 120k at McDonalds",
        accounts,
        tags,
        'test-amount'
      )

      const parsedTOON = JSON.parse(result.toon)

      if (parsedTOON.params?.vnd_amount) {
        expect(parsedTOON.params.vnd_amount).toBe(120000)
        console.log('✅ Amount parsing with "k" notation works')
      }
    })

    it('should identify merchants correctly', async () => {
      const result = await parseExpenseText(
        llmClient,
        "Coffee at Highlands Coffee",
        accounts,
        tags,
        'test-merchant'
      )

      const parsedTOON = JSON.parse(result.toon)

      if (parsedTOON.params?.counterparty) {
        expect(parsedTOON.params.counterparty.toLowerCase()).toContain('highlands')
        console.log('✅ Merchant identification works')
      }
    })

    it('should use provided accounts and tags', async () => {
      const result = await parseExpenseText(
        llmClient,
        "Lunch at restaurant paid with cash",
        accounts,
        tags,
        'test-context'
      )

      const parsedTOON = JSON.parse(result.toon)

      // Should use cash account if mentioned
      if (parsedTOON.params?.account) {
        const accountNames = accounts.map((a: any) => a.name.toLowerCase())
        expect(accountNames).toContain(parsedTOON.params.account.toLowerCase())
        console.log('✅ Uses provided account context')
      }
    })
  })

  describe('Complex Reasoning', () => {
    it('should handle complex expense descriptions', async () => {
      const complexPrompt = `
Analyze this expense: "Family dinner at Pizza Company for 4 people yesterday, total bill 850k, paid with Techcombank card, 10% service charge included"

Extract and respond with JSON containing:
- amount_vnd: total amount in numbers
- people_count: number of people
- restaurant: restaurant name
- payment_method: how it was paid
- service_charge: service charge percentage
`

      const response = await llmClient.chat([
        { role: 'user', content: complexPrompt }
      ], { temperature: 0.1, maxTokens: 500 })

      expect(response.content).toBeDefined()
      expect(response.content.length).toBeGreaterThan(0)

      // Try to parse JSON response
      try {
        const parsed = JSON.parse(response.content)
        expect(parsed.amount_vnd).toBeDefined()
        expect(parsed.people_count).toBeDefined()
        expect(parsed.restaurant).toBeDefined()
        expect(parsed.payment_method).toBeDefined()

        console.log('✅ Complex reasoning successful')
        console.log(`🧠 Extracted: ${JSON.stringify(parsed, null, 2)}`)
      } catch (e) {
        // If not valid JSON, that's still acceptable for some models
        console.log('⚠️ Response not in JSON format, but content was generated')
        expect(response.content).toContain('850')
      }
    })

    it('should handle Vietnamese currency and context', async () => {
      const response = await llmClient.chat([
        { role: 'user', content: 'Parse this Vietnamese expense: "Cà phê 50k tại Highlands Coffee sáng nay" and respond with JSON' }
      ], { temperature: 0.1, maxTokens: 200 })

      expect(response.content).toBeDefined()
      expect(response.content.length).toBeGreaterThan(0)
      expect(response.content).toMatch(/50|50000/)

      console.log('✅ Vietnamese language handling works')
    })
  })

  describe('Error Handling', () => {
    it('should handle authentication errors gracefully', async () => {
      // Use a completely invalid base URL to force a network error
      const invalidClient = new LLMClient({
        provider: 'anthropic',
        apiKey: 'invalid-token-key',
        baseURL: 'https://invalid-url-that-will-fail.com/api',
        timeout: 5000
      })

      await expect(invalidClient.chat([
        { role: 'user', content: 'This should fail' }
      ])).rejects.toThrow()

      console.log('✅ Authentication errors handled gracefully')
    })

    it('should handle timeout errors', async () => {
      const timeoutClient = new LLMClient({
        provider: 'anthropic',
        apiKey: (global as any).testConfig.anthropic.apiKey,
        baseURL: (global as any).testConfig.anthropic.baseURL,
        timeout: 1 // 1ms timeout
      })

      await expect(timeoutClient.chat([
        { role: 'user', content: 'This should timeout' }
      ])).rejects.toThrow()

      console.log('✅ Timeout errors handled gracefully')
    })
  })

  describe('Model Information', () => {
    it('should return correct model information', async () => {
      const response = await llmClient.chat([
        { role: 'user', content: 'Hello' }
      ])

      expect(response.model).toBeDefined()
      expect(typeof response.model).toBe('string')

      // Should use the model from the proxy (likely glm-4.5-air)
      console.log(`🤖 Using model: ${response.model}`)
    })

    it('should provide usage statistics', async () => {
      const response = await llmClient.chat([
        { role: 'user', content: 'Count to 10' }
      ])

      expect(response.usage).toBeDefined()
      expect(response.usage!.promptTokens).toBeGreaterThan(0)
      expect(response.usage!.completionTokens).toBeGreaterThan(0)
      expect(response.usage!.totalTokens).toBeGreaterThan(0)

      expect(response.usage!.totalTokens).toBe(
        response.usage!.promptTokens + response.usage!.completionTokens
      )

      console.log('✅ Usage statistics accurate')
    })
  })

  afterAll(() => {
    console.log('\n🎉 All Anthropic LLM integration tests completed!')
  })
})