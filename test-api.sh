#!/bin/bash

# Login and get token
echo "🔑 Getting authentication token..."
TOKEN=$(curl -s -X POST "http://localhost:3000/api/v1/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"alex.ceo@company.com\",\"password\":\"TestPass123!\"}" | \
  jq -r '.token')

if [ "$TOKEN" = "null" ] || [ -z "$TOKEN" ]; then
  echo "❌ Failed to get token. Let's see the response:"
  curl -s -X POST "http://localhost:3000/api/v1/auth/login" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"alex.ceo@company.com\",\"password\":\"TestPass123!\"}" | jq
  exit 1
fi

echo "✅ Got token: ${TOKEN:0:20}..."

# Test thread API
CHANNEL_ID="17ee782f-736b-4ca7-a8e4-16f468ce75a4"
THREAD_ROOT_ID="aa94e92c-f9c7-4ed2-af33-7375ca46de3f"

echo "🧵 Testing thread API endpoint..."
echo "Channel ID: $CHANNEL_ID"
echo "Thread Root ID: $THREAD_ROOT_ID"

curl -X GET "http://localhost:3000/api/v1/channels/$CHANNEL_ID/messages/$THREAD_ROOT_ID/thread" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" | jq

echo "✅ Thread API test completed"