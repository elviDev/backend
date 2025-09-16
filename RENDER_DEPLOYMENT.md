# Render Deployment Guide

## Prerequisites

1. **GitHub Repository**: Push your code to GitHub
2. **Render Account**: Sign up at [render.com](https://render.com)

## Step 1: Create Redis Service on Render

1. In Render Dashboard, click **"New +"** → **"Redis"**
2. Configure:
   - **Name**: `your-app-redis`
   - **Plan**: Choose based on your needs (Free tier available)
   - **Region**: Choose same as your web service
3. After creation, note the **Internal Redis URL** (format: `redis://red-xxx:6379`)

## Step 2: Create PostgreSQL Service (if needed)

If you want to move away from AWS RDS:
1. Click **"New +"** → **"PostgreSQL"**
2. Configure:
   - **Name**: `your-app-postgres`
   - **Plan**: Choose based on your needs
3. Note the **Internal Database URL**

## Step 3: Create Web Service

1. Click **"New +"** → **"Web Service"**
2. Connect your GitHub repository
3. Configure:
   - **Name**: `your-app-backend`
   - **Environment**: `Node`
   - **Build Command**: `npm install && npm run build:prod`
   - **Start Command**: `npm start`
   - **Node Version**: `18` or `20`

## Step 4: Environment Variables

Add these environment variables in Render:

```bash
# Application
NODE_ENV=production
PORT=10000
HOST=0.0.0.0

# Database (use your existing AWS RDS or new Render PostgreSQL)
DATABASE_URL=postgresql://postgres:ThisSuperColl@database-1.cmze6s8yeur2.us-east-1.rds.amazonaws.com:5432/postgres

# Redis (use Render Redis internal URL)
REDIS_URL=redis://red-xxx:6379
REDIS_HOST=red-xxx
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_DB=0
REDIS_PUBSUB_DB=1

# JWT (generate new secure secrets)
JWT_SECRET=your-production-jwt-secret-at-least-64-characters-long-and-very-secure
JWT_REFRESH_SECRET=your-production-refresh-secret-at-least-64-characters-long-and-very-secure
JWT_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

# API Configuration
API_PREFIX=/api
API_VERSION=v1
CORS_ORIGIN=https://your-frontend-domain.com
RATE_LIMIT_MAX=1000

# Security
BCRYPT_ROUNDS=12
MAX_LOGIN_ATTEMPTS=5
LOCKOUT_DURATION=15m

# Performance & Caching
CACHE_TTL_SHORT=5m
CACHE_TTL_MEDIUM=1h
CACHE_TTL_LONG=24h
QUERY_TIMEOUT=30s
REQUEST_TIMEOUT=30s

# Logging
LOG_LEVEL=info
LOG_FORMAT=json

# Production Settings
SEED_DATABASE=false
DEBUG_SQL=false
DEBUG_WEBSOCKET=false
```

## Alternative Redis Options

### Option 1: Redis Labs (Recommended for production)
- Sign up at [redis.com](https://redis.com)
- Create free database (30MB)
- Use connection URL in REDIS_URL

### Option 2: Upstash Redis
- Sign up at [upstash.com](https://upstash.com)
- Create serverless Redis database
- Use REST API or Redis protocol

### Option 3: Railway Redis
- Sign up at [railway.app](https://railway.app)
- Add Redis service
- Use connection details

## Deployment Steps

1. **Push to GitHub**: Ensure your code is in a GitHub repo
2. **Connect Render**: Connect your GitHub repo to Render
3. **Create Services**: Create Redis → PostgreSQL (optional) → Web Service
4. **Configure Environment**: Add all environment variables
5. **Deploy**: Render will automatically build and deploy

## Build Script Addition

Add this to your package.json:

```json
{
  "scripts": {
    "build:prod": "npm run clean && tsc --skipLibCheck"
  }
}
```

## Health Check Endpoint

Render can use your existing health check endpoint at `/health` for monitoring.

## Domain Configuration

After deployment:
1. Get your Render service URL: `https://your-app-backend.onrender.com`
2. Configure custom domain if needed
3. Update CORS_ORIGIN to include your frontend domain

## Important Notes

- Render services sleep after 15 minutes of inactivity on free tier
- Use environment-specific configurations
- Never commit production secrets to Git
- Test thoroughly before going live