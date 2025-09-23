# CEO Communication Platform - API Documentation

## 📋 Overview

This document provides comprehensive API documentation for the CEO Communication Platform backend with the new hierarchical endpoint structure.

**Base URL:** `http://localhost:3000/api/v1`

## 📋 Complete Endpoint List

### Message Management
- `GET /channels/:channelId/messages` - Get channel messages
- `POST /channels/:channelId/messages` - Send message to channel  
- `PUT /channels/:channelId/messages/:messageId` - Update message
- `DELETE /channels/:channelId/messages/:messageId` - Delete message

### Message Pinning
- `POST /channels/:channelId/messages/:messageId/pin` - Pin/unpin message
- `DELETE /channels/:channelId/messages/:messageId/pin` - Unpin message

### Thread Management
- `GET /channels/:channelId/messages/:messageId/thread` - Get thread replies
- `POST /channels/:channelId/messages/:messageId/thread` - Create thread reply

### Direct Replies Management
- `GET /channels/:channelId/messages/:messageId/replies` - Get direct replies
- `POST /channels/:channelId/messages/:messageId/replies` - Create direct reply
- `PUT /channels/:channelId/messages/:messageId/replies/:replyId` - Update reply ⭐ **NEW**
- `DELETE /channels/:channelId/messages/:messageId/replies/:replyId` - Delete reply ⭐ **NEW**

### Reactions Management
- `GET /channels/:channelId/messages/:messageId/reactions` - Get message reactions
- `POST /channels/:channelId/messages/:messageId/reactions` - Add/toggle reaction
- `DELETE /channels/:channelId/messages/:messageId/reactions/:emoji` - Remove specific reaction

## 🔐 Authentication

All endpoints require authentication via JWT token in the Authorization header:
```
Authorization: Bearer <jwt_token>
```

### Login to get token:
```bash
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "alex.ceo@company.com",
    "password": "TempPass123!"
  }'
```

---

## 📨 Messages API

### Get Channel Messages
```http
GET /channels/:channelId/messages?limit=50&offset=0
```

**Example:**
```bash
curl -X GET "http://localhost:3000/api/v1/channels/{CHANNEL_ID}/messages?limit=10" \
  -H "Authorization: Bearer {JWT_TOKEN}"
```

### Send Message to Channel
```http
POST /channels/:channelId/messages
```

**Request Body:**
```json
{
  "content": "Hello everyone!",
  "message_type": "text",
  "mentions": ["user-id-1", "user-id-2"],
  "attachments": [],
  "metadata": {}
}
```

**Example:**
```bash
curl -X POST http://localhost:3000/api/v1/channels/{CHANNEL_ID}/messages \
  -H "Authorization: Bearer {JWT_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "content": "Hello team! Let me know your thoughts on the new design.",
    "message_type": "text"
  }'
```

### Update Message
```http
PUT /channels/:channelId/messages/:messageId
```

Updates an existing message. Users can only edit their own messages (except CEOs who can edit any message). Messages older than 24 hours cannot be edited (except by CEOs).

**Request Body:**
```json
{
  "content": "Updated message content"
}
```

**Example:**
```bash
curl -X PUT http://localhost:3000/api/v1/channels/{CHANNEL_ID}/messages/{MESSAGE_ID} \
  -H "Authorization: Bearer {JWT_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "content": "Updated message with corrected information."
  }'
```

### Delete Message
```http
DELETE /channels/:channelId/messages/:messageId
```

Deletes an existing message. Users can only delete their own messages (except CEOs who can delete any message).

**Example:**
```bash
curl -X DELETE http://localhost:3000/api/v1/channels/{CHANNEL_ID}/messages/{MESSAGE_ID} \
  -H "Authorization: Bearer {JWT_TOKEN}"
```

### Pin Message
```http
POST /channels/:channelId/messages/:messageId/pin
```

Pins or unpins a message in the channel. Only CEOs and channel administrators can pin messages.

**Request Body:**
```json
{
  "pinned": true
}
```

**Example:**
```bash
curl -X POST http://localhost:3000/api/v1/channels/{CHANNEL_ID}/messages/{MESSAGE_ID}/pin \
  -H "Authorization: Bearer {JWT_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "pinned": true
  }'
```

### Unpin Message
```http
DELETE /channels/:channelId/messages/:messageId/pin
```

Unpins a message in the channel. Only CEOs and channel administrators can unpin messages.

**Example:**
```bash
curl -X DELETE http://localhost:3000/api/v1/channels/{CHANNEL_ID}/messages/{MESSAGE_ID}/pin \
  -H "Authorization: Bearer {JWT_TOKEN}"
```

---

## 🧵 Thread Management API

**New Hierarchical Structure:** `/channels/:channelId/messages/:messageId/thread`

### Get Thread Replies
```http
GET /channels/:channelId/messages/:messageId/thread?limit=50&offset=0
```

Retrieves all replies in a thread for a specific message.

**Example:**
```bash
curl -X GET "http://localhost:3000/api/v1/channels/{CHANNEL_ID}/messages/{MESSAGE_ID}/thread" \
  -H "Authorization: Bearer {JWT_TOKEN}"
```

**Response:**
```json
{
  "success": true,
  "data": {
    "parentMessage": {
      "id": "msg-123",
      "content": "Original message",
      "user_details": {...},
      "thread_info": {
        "reply_count": 5,
        "participant_count": 3,
        "last_reply_at": "2025-09-23T10:30:00Z"
      }
    },
    "replies": [
      {
        "id": "reply-456",
        "content": "Thread reply",
        "thread_root_id": "msg-123",
        "reply_to_id": "msg-123",
        "user_details": {...}
      }
    ]
  }
}
```

### Create Thread Reply
```http
POST /channels/:channelId/messages/:messageId/thread
```

Creates a threaded reply to a message.

**Request Body:**
```json
{
  "content": "This is a thread reply",
  "message_type": "text",
  "mentions": [],
  "attachments": []
}
```

**Example:**
```bash
curl -X POST http://localhost:3000/api/v1/channels/{CHANNEL_ID}/messages/{MESSAGE_ID}/thread \
  -H "Authorization: Bearer {JWT_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "content": "Great point! I agree with this approach."
  }'
```

---

## 💬 Direct Replies API

**New Hierarchical Structure:** `/channels/:channelId/messages/:messageId/replies`

### Get Direct Replies
```http
GET /channels/:channelId/messages/:messageId/replies?limit=50&offset=0
```

Retrieves direct replies (non-threaded) to a message.

**Example:**
```bash
curl -X GET "http://localhost:3000/api/v1/channels/{CHANNEL_ID}/messages/{MESSAGE_ID}/replies" \
  -H "Authorization: Bearer {JWT_TOKEN}"
```

### Create Direct Reply
```http
POST /channels/:channelId/messages/:messageId/replies
```

Creates a direct reply to a message (not part of a thread).

**Request Body:**
```json
{
  "content": "This is a direct reply",
  "message_type": "text"
}
```

**Example:**
```bash
curl -X POST http://localhost:3000/api/v1/channels/{CHANNEL_ID}/messages/{MESSAGE_ID}/replies \
  -H "Authorization: Bearer {JWT_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "content": "Quick response to your message!"
  }'
```

### Update Reply
```http
PUT /channels/:channelId/messages/:messageId/replies/:replyId
```

Updates an existing reply. Users can only edit their own replies (except CEOs who can edit any reply). Replies older than 24 hours cannot be edited (except by CEOs).

**Request Body:**
```json
{
  "content": "Updated reply content"
}
```

**Example:**
```bash
curl -X PUT http://localhost:3000/api/v1/channels/{CHANNEL_ID}/messages/{MESSAGE_ID}/replies/{REPLY_ID} \
  -H "Authorization: Bearer {JWT_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "content": "This is my updated reply with corrected information."
  }'
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "reply-456",
    "content": "This is my updated reply with corrected information.",
    "is_edited": true,
    "edited_at": "2025-09-23T10:35:00Z",
    "reply_to_id": "msg-123",
    "user_details": {...}
  },
  "timestamp": "2025-09-23T10:35:00Z"
}
```

### Delete Reply
```http
DELETE /channels/:channelId/messages/:messageId/replies/:replyId
```

Deletes an existing reply. Users can only delete their own replies (except CEOs who can delete any reply).

**Example:**
```bash
curl -X DELETE http://localhost:3000/api/v1/channels/{CHANNEL_ID}/messages/{MESSAGE_ID}/replies/{REPLY_ID} \
  -H "Authorization: Bearer {JWT_TOKEN}"
```

**Response:**
```json
{
  "success": true,
  "message": "Reply deleted successfully",
  "timestamp": "2025-09-23T10:35:00Z"
}
```

---

## ⚡ Reactions API

**New Hierarchical Structure:** `/channels/:channelId/messages/:messageId/reactions`

### Get Message Reactions
```http
GET /channels/:channelId/messages/:messageId/reactions
```

Retrieves all reactions for a specific message.

**Example:**
```bash
curl -X GET "http://localhost:3000/api/v1/channels/{CHANNEL_ID}/messages/{MESSAGE_ID}/reactions" \
  -H "Authorization: Bearer {JWT_TOKEN}"
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "emoji": "👍",
      "count": 3,
      "users": [
        {
          "id": "user-1",
          "name": "John Doe",
          "avatar_url": "https://..."
        }
      ],
      "hasReacted": true
    },
    {
      "emoji": "❤️",
      "count": 1,
      "users": [...],
      "hasReacted": false
    }
  ]
}
```

### Add/Toggle Reaction
```http
POST /channels/:channelId/messages/:messageId/reactions
```

Adds a reaction to a message. If the user has already reacted with the same emoji, it removes the reaction (toggle behavior).

**Request Body:**
```json
{
  "emoji": "👍"
}
```

**Example:**
```bash
curl -X POST http://localhost:3000/api/v1/channels/{CHANNEL_ID}/messages/{MESSAGE_ID}/reactions \
  -H "Authorization: Bearer {JWT_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "emoji": "👍"
  }'
```

**Response:**
```json
{
  "success": true,
  "data": {
    "action": "added",
    "emoji": "👍",
    "messageId": "msg-123"
  }
}
```

### Remove Specific Reaction
```http
DELETE /channels/:channelId/messages/:messageId/reactions/:emoji
```

Removes a specific reaction from a message.

**Example:**
```bash
curl -X DELETE "http://localhost:3000/api/v1/channels/{CHANNEL_ID}/messages/{MESSAGE_ID}/reactions/👍" \
  -H "Authorization: Bearer {JWT_TOKEN}"
```

---

## 📂 Channels API

### Get All Channels
```http
GET /channels?limit=50&offset=0
```

**Example:**
```bash
curl -X GET "http://localhost:3000/api/v1/channels" \
  -H "Authorization: Bearer {JWT_TOKEN}"
```

### Get Channel Details
```http
GET /channels/:channelId
```

**Example:**
```bash
curl -X GET "http://localhost:3000/api/v1/channels/{CHANNEL_ID}" \
  -H "Authorization: Bearer {JWT_TOKEN}"
```

---

## 👥 Users API

### Get Current User Profile
```http
GET /auth/me
```

**Example:**
```bash
curl -X GET "http://localhost:3000/api/v1/auth/me" \
  -H "Authorization: Bearer {JWT_TOKEN}"
```

---

## 🔧 Testing Guide

### 1. Login and Get Token
```bash
# Login as CEO
TOKEN=$(curl -s -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"alex.ceo@company.com","password":"TempPass123!"}' \
  | jq -r '.data.accessToken')

echo "Token: $TOKEN"
```

### 2. Get Channels
```bash
# Get all channels
curl -s -X GET "http://localhost:3000/api/v1/channels" \
  -H "Authorization: Bearer $TOKEN" | jq '.'
```

### 3. Get Channel Messages
```bash
# Replace with actual channel ID from step 2
CHANNEL_ID="your-channel-id"
curl -s -X GET "http://localhost:3000/api/v1/channels/$CHANNEL_ID/messages" \
  -H "Authorization: Bearer $TOKEN" | jq '.'
```

### 4. Send a Message
```bash
MESSAGE_RESPONSE=$(curl -s -X POST "http://localhost:3000/api/v1/channels/$CHANNEL_ID/messages" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"content":"Test message for API documentation"}')

echo $MESSAGE_RESPONSE | jq '.'
MESSAGE_ID=$(echo $MESSAGE_RESPONSE | jq -r '.data.id')
```

### 5. Create Thread Reply
```bash
curl -s -X POST "http://localhost:3000/api/v1/channels/$CHANNEL_ID/messages/$MESSAGE_ID/thread" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"content":"This is a thread reply to test the new API structure"}' | jq '.'
```

### 6. Add Reaction
```bash
curl -s -X POST "http://localhost:3000/api/v1/channels/$CHANNEL_ID/messages/$MESSAGE_ID/reactions" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"emoji":"👍"}' | jq '.'
```

### 7. Get Message Reactions
```bash
curl -s -X GET "http://localhost:3000/api/v1/channels/$CHANNEL_ID/messages/$MESSAGE_ID/reactions" \
  -H "Authorization: Bearer $TOKEN" | jq '.'
```

### 8. Get Thread Replies
```bash
curl -s -X GET "http://localhost:3000/api/v1/channels/$CHANNEL_ID/messages/$MESSAGE_ID/thread" \
  -H "Authorization: Bearer $TOKEN" | jq '.'
```

### 9. Update a Message
```bash
curl -s -X PUT "http://localhost:3000/api/v1/channels/$CHANNEL_ID/messages/$MESSAGE_ID" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"content":"Updated message content with new information"}' | jq '.'
```

### 10. Pin a Message
```bash
curl -s -X POST "http://localhost:3000/api/v1/channels/$CHANNEL_ID/messages/$MESSAGE_ID/pin" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"pinned":true}' | jq '.'
```

### 11. Unpin a Message
```bash
curl -s -X DELETE "http://localhost:3000/api/v1/channels/$CHANNEL_ID/messages/$MESSAGE_ID/pin" \
  -H "Authorization: Bearer $TOKEN" | jq '.'
```

### 12. Create a Direct Reply
```bash
REPLY_RESPONSE=$(curl -s -X POST "http://localhost:3000/api/v1/channels/$CHANNEL_ID/messages/$MESSAGE_ID/replies" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"content":"This is a direct reply to the message"}')

echo $REPLY_RESPONSE | jq '.'
REPLY_ID=$(echo $REPLY_RESPONSE | jq -r '.data.id')
```

### 13. Update a Reply
```bash
curl -s -X PUT "http://localhost:3000/api/v1/channels/$CHANNEL_ID/messages/$MESSAGE_ID/replies/$REPLY_ID" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"content":"Updated reply with corrected information"}' | jq '.'
```

### 14. Delete a Reply
```bash
curl -s -X DELETE "http://localhost:3000/api/v1/channels/$CHANNEL_ID/messages/$MESSAGE_ID/replies/$REPLY_ID" \
  -H "Authorization: Bearer $TOKEN" | jq '.'
```

### 15. Remove a Specific Reaction
```bash
curl -s -X DELETE "http://localhost:3000/api/v1/channels/$CHANNEL_ID/messages/$MESSAGE_ID/reactions/👍" \
  -H "Authorization: Bearer $TOKEN" | jq '.'
```

---

## 🚨 Error Handling

All endpoints follow a consistent error response format:

```json
{
  "error": {
    "message": "Error description",
    "code": "ERROR_CODE",
    "statusCode": 400
  },
  "timestamp": "2025-09-23T10:30:00Z"
}
```

### Common Error Codes:
- `AUTHENTICATION_FAILED` (401) - Invalid or missing JWT token
- `AUTHORIZATION_ERROR` (403) - User doesn't have access to resource
- `NOT_FOUND` (404) - Resource not found
- `VALIDATION_ERROR` (400) - Invalid request data
- `SERVER_ERROR` (500) - Internal server error

---

## 🔄 WebSocket Events

The API also broadcasts real-time events via WebSocket:

### Message Events:
- `message_sent` - New message created
- `message_updated` - Message edited
- `message_deleted` - Message deleted
- `message_pinned` - Message pinned
- `message_unpinned` - Message unpinned

### Thread Events:
- `thread_reply_sent` - New thread reply created
- `message_reaction_updated` - Reaction added/removed
- `message_reply_sent` - Direct reply created

### Reply Events:
- `reply_updated` - Reply edited (both direct and thread replies)
- `reply_deleted` - Reply deleted (both direct and thread replies)

### Example WebSocket Connection:
```javascript
const socket = io('ws://localhost:3000', {
  auth: {
    token: 'your-jwt-token'
  }
});

socket.on('thread_reply_sent', (data) => {
  console.log('New thread reply:', data);
});
```

---

## 📊 Response Formats

### Success Response Format:
```json
{
  "success": true,
  "data": { ... },
  "timestamp": "2025-09-23T10:30:00Z"
}
```

### Paginated Response Format:
```json
{
  "success": true,
  "data": [...],
  "pagination": {
    "total": 100,
    "limit": 50,
    "offset": 0,
    "hasMore": true
  },
  "timestamp": "2025-09-23T10:30:00Z"
}
```

---

## 🎯 Benefits of New Hierarchical Structure

1. **Clear Context**: Every endpoint knows which channel and message it belongs to
2. **RESTful Design**: Follows REST principles with proper resource nesting
3. **Better Security**: Channel access control applies to all nested resources
4. **Intuitive URLs**: Easy to understand the relationship between resources
5. **Consistent Patterns**: All related resources follow the same hierarchical pattern

---

This documentation covers all the new hierarchical endpoints for testing. The API now provides a much cleaner and more intuitive structure for managing messages, threads, replies, and reactions within channels.