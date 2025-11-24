#!/usr/bin/env node

/**
 * SIMPLE LLM TEST - Quick Anthropic Integration Test
 *
 * Quick test to verify Anthropic proxy connection works
 *
 * Run with: node test-llm-simple.mjs
 */

import { LLMClient } from './src/llm.js'

const config = {
  provider: 'anthropic',
  apiKey: process.env.ANTHROPIC_AUTH_TOKEN || '40133acb657d4343a13561fa2ae25e7a.XlBfpsO4chsOorMP',
  baseURL: process.env.ANTHROPIC_BASE_URL || 'https://api.z.ai/api/anthropic',
  timeout: 30000
}

console.log('🧪 Testing Anthropic LLM connection...')
console.log('🔗 Proxy URL:', config.baseURL)
console.log('🔑 Token:', config.apiKey.substring(0, 20) + '...')

const client = new LLMClient(config)

try {
  const response = await client.chat([
    { role: 'user', content: 'Parse this expense: "Coffee 45k at Highlands Coffee today". Respond with JSON containing: amount, vendor, category.' }
  ])

  console.log('\n✅ SUCCESS!')
  console.log('🤖 Model:', response.model)
  console.log('📊 Tokens:', response.usage.totalTokens)
  console.log('💬 Response:', response.content)

} catch (error) {
  console.error('\n❌ FAILED:', error.message)
  process.exit(1)
}