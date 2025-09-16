# 🚀 Redis Enterprise Cloud Setup (5 Minutes)

## Step 1: Create Account
1. Go to [redis.com](https://redis.com)
2. Sign up for free account
3. Verify email

## Step 2: Create Database
1. Click **"New Database"**
2. Choose **"Fixed"** (not Flexible)
3. Configuration:
   - **Name**: `ceo-app-redis`
   - **Region**: `us-east-1` (same as your AWS)
   - **Redis Version**: Latest
   - **Memory**: 30MB (free tier)
4. Click **"Create Database"**

## Step 3: Get Connection Details
1. Click on your database
2. Copy connection details:
   ```bash
   Public endpoint: redis-12345.c1.us-east-1-2.ec2.cloud.redislabs.com:12345
   Username: default
   Password: [your-password]
   ```

## Step 4: Update Environment Variables

### Development (.env)
```bash
# Replace localhost Redis with Redis Cloud
REDIS_URL=rediss://default:YOUR_PASSWORD@redis-12345.c1.us-east-1-2.ec2.cloud.redislabs.com:12345
REDIS_HOST=redis-12345.c1.us-east-1-2.ec2.cloud.redislabs.com
REDIS_PORT=12345
REDIS_PASSWORD=YOUR_PASSWORD
REDIS_DB=0
REDIS_PUBSUB_DB=0
```

### Production (Render Environment Variables)
```bash
REDIS_URL=rediss://default:YOUR_PASSWORD@redis-12345.c1.us-east-1-2.ec2.cloud.redislabs.com:12345
```

## Step 5: Test Connection

```bash
# Test locally
npm run dev

# Should see in logs:
# ✅ Redis client connected
# ✅ Redis client ready for operations
```

## Security Configuration

### 1. IP Whitelist (Optional)
- In Redis Cloud dashboard
- Go to **"Security"** → **"Source IP/Subnet"**
- Add your Render IP ranges or specific IPs

### 2. TLS/SSL
- Redis Cloud uses TLS by default (`rediss://`)
- No additional configuration needed

## Pricing

### Free Tier
- 30MB storage
- 30 connections
- Shared cluster
- Community support

### Paid Plans (when you need more)
- **Essential**: $5/month (100MB, dedicated)
- **Standard**: $15/month (1GB, multi-AZ)
- **Professional**: $60/month (5GB, clustering)

## Migration from Local Redis

Your existing code will work without changes! Just update the environment variables.

## Monitoring

### Redis Cloud Dashboard
- Real-time metrics
- Memory usage
- Connection count
- Throughput graphs

### Application Logs
```bash
# Check your app logs for:
[INFO] Redis client connected
[INFO] Redis client ready for operations
```

## Backup & Persistence

- **Free tier**: No persistence (cache only)
- **Paid plans**: Automatic backups, point-in-time recovery

## Performance

- **Latency**: ~1-3ms (same region)
- **Throughput**: Up to 25K ops/sec (free tier)
- **Availability**: 99.9% SLA (paid plans)

## Troubleshooting

### Connection Issues
```bash
# Test connection directly
redis-cli -u "rediss://default:password@redis-12345.c1.us-east-1-2.ec2.cloud.redislabs.com:12345"
```

### Common Issues
1. **Wrong URL format**: Must use `rediss://` (with 's' for SSL)
2. **IP blocking**: Check if your IP is whitelisted
3. **Password**: Ensure password is correct and URL-encoded

### Debug Mode
```bash
# In your .env for debugging
DEBUG_REDIS=true
LOG_LEVEL=debug
```