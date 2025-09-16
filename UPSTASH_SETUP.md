# 🚀 Upstash Redis Setup (Alternative - 3 Minutes)

Since Redis Enterprise Cloud is having DNS resolution issues, let's try Upstash Redis which is very reliable.

## Step 1: Create Upstash Account
1. Go to [upstash.com](https://upstash.com)
2. Sign up with GitHub or email (free)
3. Verify your account

## Step 2: Create Redis Database
1. Click **"Create Database"**
2. Configuration:
   - **Name**: `ceo-app-redis`
   - **Region**: `us-east-1` (same as your AWS)
   - **Type**: Regional (for better performance)
3. Click **"Create"**

## Step 3: Get Connection Details
After creation, you'll see:
```bash
# REST API (recommended for serverless):
UPSTASH_REDIS_REST_URL=https://global-warm-12345.upstash.io
UPSTASH_REDIS_REST_TOKEN=AXXXXXXexample

# Redis URL (for traditional Redis clients):
REDIS_URL=rediss://default:password@global-warm-12345.upstash.io:6379
```

## Step 4: Update Your .env File

```bash
# Option 3: Upstash Redis (ACTIVE)
REDIS_URL=rediss://default:YOUR_PASSWORD@global-warm-12345.upstash.io:6379
```

## Step 5: Test Connection

```bash
# Test with curl (REST API):
curl -H "Authorization: Bearer YOUR_TOKEN" https://global-warm-12345.upstash.io/ping

# Should return: {"result":"PONG"}
```

## Why Upstash is Great:
- ✅ **Instant DNS resolution** (no hostname issues)
- ✅ **Generous free tier**: 10K commands/day
- ✅ **Serverless**: Pay only for what you use
- ✅ **Global edge locations** for low latency
- ✅ **Works with standard Redis clients** (no code changes needed)
- ✅ **REST API option** for even better compatibility

## Pricing:
- **Free tier**: 10K commands/day, 256MB storage
- **Pay-as-you-go**: $0.2 per 100K commands
- **Fixed plans**: Starting $10/month for unlimited

This should solve the DNS resolution issues you're experiencing with Redis Enterprise Cloud.

Want me to walk you through this setup?