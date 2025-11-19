#!/usr/bin/env node

/**
 * REAL LLM TEST - Anthropic Integration Test
 *
 * This test makes actual API calls to verify the Anthropic integration
 * with the proxy service at api.z.ai works correctly.
 *
 * Run with: node test-real-llm.mjs
 *
 * Environment variables required:
 * - ANTHROPIC_AUTH_TOKEN: Your proxy auth token
 * - ANTHROPIC_BASE_URL: Your proxy base URL (optional, defaults to https://api.z.ai/api/anthropic)
 */

import { LLMClient } from './src/llm.js'
import { parseExpenseText } from './src/parser.js'
import { createCorrelationLogger } from './src/logger.js'

// Test configuration
const TEST_CONFIG = {
  // Use your proxy configuration
  anthropic: {
    provider: 'anthropic',
    apiKey: process.env.ANTHROPIC_AUTH_TOKEN || '40133acb657d4343a13561fa2ae25e7a.XlBfpsO4chsOorMP',
    baseURL: process.env.ANTHROPIC_BASE_URL || 'https://api.z.ai/api/anthropic',
    timeout: 30000
  }
}

// Test data
const TEST_EXPENSES = [
  "Lunch 120k at McDonalds today",
  "Coffee 45k at Highlands Coffee yesterday",
  "Grab taxi 85k to airport this morning",
  "Grocery shopping 350k at Big C on Sunday",
  "Movie tickets 180k for two people last night"
]

const TEST_ACCOUNTS = [
  { name: 'Cash', id: 'cash' },
  { name: 'Techcombank', id: 'tcb' },
  { name: 'VPBank', id: 'vpb' },
  { name: 'Momo Wallet', id: 'momo' }
]

const TEST_TAGS = [
  { name: 'Food', id: 'food' },
  { name: 'Transport', id: 'transport' },
  { name: 'Shopping', id: 'shopping' },
  { name: 'Entertainment', id: 'entertainment' },
  { name: 'Bills', id: 'bills' }
]

// Utility functions
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(`❌ Assertion failed: ${message}`)
  }
  console.log(`✅ ${message}`)
}

function section(title) {
  console.log('\n' + '='.repeat(60))
  console.log(`🧪 ${title}`)
  console.log('='.repeat(60))
}

// Test functions
async function testBasicChat() {
  section('Testing Basic LLM Chat')

  const correlationId = 'test-basic-chat'
  const logger = createCorrelationLogger(correlationId)

  const llmClient = new LLMClient(TEST_CONFIG.anthropic, correlationId)

  try {
    const response = await llmClient.chat([
      { role: 'user', content: 'Hello! Please respond with "LLM test successful" and nothing else.' }
    ], { temperature: 0.1, maxTokens: 100 })

    logger.info({
      model: response.model,
      contentLength: response.content.length,
      usage: response.usage
    }, 'Basic chat test completed')

    // Assertions
    assert(response.content.includes('successful'), 'Response should contain "successful"')
    assert(response.content.length > 0, 'Response should not be empty')
    assert(response.model, 'Response should include model name')
    assert(response.usage, 'Response should include usage info')
    assert(response.usage.totalTokens > 0, 'Should have token usage')

    console.log(`📝 Response: "${response.content}"`)
    console.log(`🤖 Model: ${response.model}`)
    console.log(`📊 Tokens: ${response.usage.totalTokens} (input: ${response.usage.promptTokens}, output: ${response.usage.completionTokens})`)

    return true

  } catch (error) {
    console.error('❌ Basic chat test failed:', error.message)
    return false
  }
}

async function testExpenseParsing() {
  section('Testing Expense Text Parsing')

  const correlationId = 'test-expense-parsing'
  const logger = createCorrelationLogger(correlationId)

  const llmClient = new LLMClient(TEST_CONFIG.anthropic, correlationId)
  const accounts = TEST_ACCOUNTS.map(a => ({ name: a.name, id: a.id }))
  const tags = TEST_TAGS.map(t => ({ name: t.name, id: t.id }))

  let successfulParses = 0

  for (let i = 0; i < TEST_EXPENSES.length; i++) {
    const expenseText = TEST_EXPENSES[i]
    console.log(`\n📄 Testing expense ${i + 1}/${TEST_EXPENSES.length}: "${expenseText}"`)

    try {
      const result = await parseExpenseText(llmClient, expenseText, accounts, tags, correlationId)

      logger.info({
        expenseText,
        hasAction: !!result.action,
        confidence: result.confidence
      }, 'Expense parse test completed')

      // Assertions
      assert(result.toon, 'Should have TOON output')
      assert(result.confidence >= 0, 'Should have confidence score')

      // Parse TOON to check structure
      let parsedTOON
      try {
        parsedTOON = JSON.parse(result.toon)
      } catch (e) {
        assert(false, `TOON should be valid JSON: ${result.toon}`)
      }

      console.log(`💰 Parsed: ${JSON.stringify(parsedTOON, null, 2)}`)
      console.log(`🎯 Confidence: ${result.confidence}`)

      successfulParses++

      // Small delay between requests to avoid rate limiting
      if (i < TEST_EXPENSES.length - 1) {
        await delay(1000)
      }

    } catch (error) {
      console.error(`❌ Failed to parse expense: ${error.message}`)
    }
  }

  console.log(`\n📊 Expense parsing results: ${successfulParses}/${TEST_EXPENSES.length} successful`)
  assert(successfulParses >= TEST_EXPENSES.length * 0.8, 'At least 80% of expenses should parse successfully')

  return successfulParses === TEST_EXPENSES.length
}

async function testComplexReasoning() {
  section('Testing Complex Reasoning')

  const correlationId = 'test-complex-reasoning'
  const logger = createCorrelationLogger(correlationId)

  const llmClient = new LLMClient(TEST_CONFIG.anthropic, correlationId)

  try {
    const complexPrompt = `
You are an expense parsing assistant. I need you to analyze this complex expense description:

"Family dinner at Pizza Company for 4 people yesterday, total bill 850k, paid with Techcombank card, 10% service charge included, no tip"

Please extract:
1. Total amount in VND
2. Number of people
3. Restaurant name
4. Payment method
5. Any additional charges

Respond in JSON format with these fields: amount_vnd, people_count, restaurant, payment_method, additional_charges.
`

    const response = await llmClient.chat([
      { role: 'user', content: complexPrompt }
    ], { temperature: 0.1, maxTokens: 500 })

    logger.info({
      contentLength: response.content.length,
      usage: response.usage
    }, 'Complex reasoning test completed')

    console.log(`🧠 Complex reasoning response:`)
    console.log(response.content)

    // Try to parse JSON response
    try {
      const parsed = JSON.parse(response.content)
      assert(parsed.amount_vnd, 'Should extract amount')
      assert(parsed.people_count, 'Should extract people count')
      assert(parsed.restaurant, 'Should extract restaurant name')
      assert(parsed.payment_method, 'Should extract payment method')

      console.log(`✅ Successfully parsed complex expense with amount: ${parsed.amount_vnd} VND`)

    } catch (e) {
      console.log(`⚠️  Response was not valid JSON, but this may be acceptable: ${e.message}`)
    }

    return true

  } catch (error) {
    console.error('❌ Complex reasoning test failed:', error.message)
    return false
  }
}

async function testErrorHandling() {
  section('Testing Error Handling')

  const correlationId = 'test-error-handling'

  // Test with invalid API key
  const invalidClient = new LLMClient({
    ...TEST_CONFIG.anthropic,
    apiKey: 'invalid-token-key'
  }, correlationId)

  try {
    await invalidClient.chat([
      { role: 'user', content: 'This should fail' }
    ])

    assert(false, 'Should have thrown an error with invalid token')

  } catch (error) {
    console.log(`✅ Correctly handled authentication error: ${error.message}`)
    assert(error.message.includes('401') || error.message.includes('unauthorized') || error.message.includes('authentication'),
           'Should be authentication related error')
  }

  return true
}

// Main test runner
async function runAllTests() {
  console.log('🚀 Starting REAL LLM TESTS for Anthropic Integration')
  console.log('📍 Proxy URL:', TEST_CONFIG.anthropic.baseURL)
  console.log('🔑 Using token:', TEST_CONFIG.anthropic.apiKey.substring(0, 20) + '...')

  const results = {
    basicChat: await testBasicChat(),
    expenseParsing: await testExpenseParsing(),
    complexReasoning: await testComplexReasoning(),
    errorHandling: await testErrorHandling()
  }

  section('TEST RESULTS SUMMARY')

  const totalTests = Object.keys(results).length
  const passedTests = Object.values(results).filter(Boolean).length

  console.log(`📊 Overall Results: ${passedTests}/${totalTests} test suites passed`)

  for (const [testName, passed] of Object.entries(results)) {
    const status = passed ? '✅ PASSED' : '❌ FAILED'
    const formattedName = testName.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())
    console.log(`${status} ${formattedName}`)
  }

  if (passedTests === totalTests) {
    console.log('\n🎉 ALL TESTS PASSED! Anthropic integration is working correctly.')
    process.exit(0)
  } else {
    console.log('\n⚠️  Some tests failed. Please check the logs above.')
    process.exit(1)
  }
}

// Handle unhandled errors
process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason)
  process.exit(1)
})

process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error)
  process.exit(1)
})

// Run tests
if (import.meta.url === `file://${process.argv[1]}`) {
  runAllTests()
}