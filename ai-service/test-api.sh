#!/bin/bash

# AI Service API Testing Script
# This script demonstrates testing the AI service with different LLM providers

BASE_URL="http://localhost:8081"

echo "🚀 AI Service API Testing Script"
echo "================================="

# Check if service is running
echo "Checking if service is running..."
if ! curl -s "$BASE_URL/api/test/health" > /dev/null; then
    echo "❌ Service is not running at $BASE_URL"
    echo "Please start the service with: npm run dev"
    exit 1
fi

echo "✅ Service is running!"
echo

# Test 1: Health Check
echo "1. Health Check"
echo "----------------"
curl -s "$BASE_URL/api/test/health" | jq .
echo

# Test 2: Get Providers
echo "2. Available Providers"
echo "-----------------------"
curl -s "$BASE_URL/api/test/providers" | jq .
echo

# Test 3: OpenAI LLM Chat (if API key provided)
if [ ! -z "$OPENAI_API_KEY" ]; then
    echo "3. OpenAI LLM Chat Test"
    echo "-----------------------"
    curl -s -X POST "$BASE_URL/api/test/llm-chat" \
        -H "Content-Type: application/json" \
        -d "{
            \"messages\": [
                {\"role\": \"system\", \"content\": \"You are a helpful assistant.\"},
                {\"role\": \"user\", \"content\": \"Hello! Please respond briefly.\"}
            ],
            \"provider\": \"openai\",
            \"apiKey\": \"$OPENAI_API_KEY\"
        }" | jq .
    echo
else
    echo "3. OpenAI LLM Chat Test - Skipped (set OPENAI_API_KEY to run)"
    echo
fi

# Test 4: Anthropic LLM Chat (if API key provided)
if [ ! -z "$ANTHROPIC_API_KEY" ]; then
    echo "4. Anthropic LLM Chat Test"
    echo "--------------------------"
    curl -s -X POST "$BASE_URL/api/test/llm-chat" \
        -H "Content-Type: application/json" \
        -d "{
            \"messages\": [
                {\"role\": \"system\", \"content\": \"You are a helpful assistant.\"},
                {\"role\": \"user\", \"content\": \"Hello! Please respond briefly.\"}
            ],
            \"provider\": \"anthropic\",
            \"apiKey\": \"$ANTHROPIC_API_KEY\"
        }" | jq .
    echo
else
    echo "4. Anthropic LLM Chat Test - Skipped (set ANTHROPIC_API_KEY to run)"
    echo
fi

# Test 5: Text Parsing with OpenAI (if API key provided)
if [ ! -z "$OPENAI_API_KEY" ]; then
    echo "5. OpenAI Text Parsing Test"
    echo "---------------------------"
    curl -s -X POST "$BASE_URL/api/test/text-parse" \
        -H "Content-Type: application/json" \
        -d "{
            \"message\": \"Lunch 120k at McDonalds from Vietcombank today\",
            \"provider\": \"openai\",
            \"apiKey\": \"$OPENAI_API_KEY\",
            \"accounts\": [
                {\"name\": \"Vietcombank\", \"id\": \"vcb\"}
            ],
            \"tags\": [
                {\"name\": \"Food\", \"id\": \"food\"}
            ]
        }" | jq .
    echo
else
    echo "5. OpenAI Text Parsing Test - Skipped (set OPENAI_API_KEY to run)"
    echo
fi

# Test 6: Text Parsing with Anthropic (if API key provided)
if [ ! -z "$ANTHROPIC_API_KEY" ]; then
    echo "6. Anthropic Text Parsing Test"
    echo "------------------------------"
    curl -s -X POST "$BASE_URL/api/test/text-parse" \
        -H "Content-Type: application/json" \
        -d "{
            \"message\": \"Lunch 120k at McDonalds from Vietcombank today\",
            \"provider\": \"anthropic\",
            \"apiKey\": \"$ANTHROPIC_API_KEY\",
            \"accounts\": [
                {\"name\": \"Vietcombank\", \"id\": \"vcb\"}
            ],
            \"tags\": [
                {\"name\": \"Food\", \"id\": \"food\"}
            ]
        }" | jq .
    echo
else
    echo "6. Anthropic Text Parsing Test - Skipped (set ANTHROPIC_API_KEY to run)"
    echo
fi

echo "✅ API testing completed!"
echo
echo "To run individual tests:"
echo "  export OPENAI_API_KEY=sk-your-key"
echo "  export ANTHROPIC_API_KEY=sk-ant-your-key"
echo "  ./test-api.sh"