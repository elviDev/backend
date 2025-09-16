# 🚀 Render Deployment Checklist

## Pre-Deployment

### 1. Code Preparation
- [ ] Push code to GitHub repository
- [ ] Ensure `render.yaml` is in the root directory
- [ ] Test application locally with `npm start`
- [ ] Verify all environment variables are documented

### 2. Redis Service Setup

#### Option A: Render Redis (Recommended)
- [ ] Create Redis service on Render
- [ ] Note the internal connection string format: `redis://red-xxxxx:6379`
- [ ] No password needed for Render Redis

#### Option B: External Redis Services

**Redis Labs (redis.com)**
- [ ] Sign up at redis.com
- [ ] Create database (30MB free tier)
- [ ] Get connection string: `rediss://username:password@redis-xxxxx.cloud.redislabs.com:port`

**Upstash (upstash.com)**
- [ ] Sign up at upstash.com  
- [ ] Create serverless Redis database
- [ ] Get connection string: `rediss://username:password@global-xxxxx.upstash.io:6379`

### 3. Environment Variables

Copy these to Render environment variables:

```bash
# Required - Update these values
DATABASE_URL=postgresql://postgres:ThisSuperColl@database-1.cmze6s8yeur2.us-east-1.rds.amazonaws.com:5432/postgres
REDIS_URL=redis://your-redis-connection-string
JWT_SECRET=generate-64-char-secret
JWT_REFRESH_SECRET=generate-64-char-secret
CORS_ORIGIN=https://your-frontend-domain.com

# Default values (can customize)
NODE_ENV=production
PORT=10000
HOST=0.0.0.0
LOG_LEVEL=info
SEED_DATABASE=false
```

## Deployment Steps

### 1. Create Render Services
1. **Redis First**: Create Redis service and get connection string
2. **Web Service**: Create web service from GitHub repo

### 2. Web Service Configuration
- **Build Command**: `npm install && npm run build:prod`
- **Start Command**: `npm start`  
- **Environment**: Node.js
- **Health Check**: `/health`

### 3. Environment Variables
- Add all required environment variables
- Use Redis connection string from step 1
- Generate secure JWT secrets (64+ characters)

### 4. Deploy
- Connect GitHub repository
- Configure auto-deploy on push (optional)
- Deploy and monitor logs

## Post-Deployment Testing

### 1. Health Check
```bash
curl https://your-app.onrender.com/health
```
Expected response: `{ "status": "healthy", ... }`

### 2. API Endpoints
```bash
# Test API
curl https://your-app.onrender.com/api/v1/health

# Test with specific endpoints
curl https://your-app.onrender.com/api/v1/users
```

### 3. Database Connection
- Monitor logs for successful database connection
- Check for any migration errors

### 4. Redis Connection  
- Monitor logs for Redis connection success
- Test cache functionality

## Common Issues & Solutions

### Build Failures
- **TypeScript errors**: Build uses `--skipLibCheck` to bypass type issues
- **Missing dependencies**: Check package.json includes all deps
- **Memory issues**: Use higher Render plan if needed

### Runtime Issues
- **Port binding**: Ensure `PORT` env var is set to `10000`
- **Database timeout**: Check DATABASE_URL and network connectivity  
- **Redis connection**: Verify REDIS_URL format and service availability

### Performance
- **Cold starts**: Render free tier has sleep after 15min inactivity
- **Memory usage**: Monitor and upgrade plan if needed
- **Response times**: Check database query performance

## Monitoring

### 1. Render Dashboard
- Monitor service health and metrics
- Check deployment logs
- Set up notifications

### 2. Application Logs
```bash
# View logs in Render dashboard or via CLI
render logs <service-id>
```

### 3. Database Monitoring
- Monitor RDS metrics in AWS Console
- Set up CloudWatch alerts if needed

## Security Checklist

- [ ] JWT secrets are strong (64+ characters) 
- [ ] Database credentials are secure
- [ ] CORS is properly configured
- [ ] Rate limiting is enabled
- [ ] Debug modes are disabled in production
- [ ] No secrets committed to Git

## Scaling Considerations

### Free Tier Limitations
- 512MB RAM, 0.1 CPU
- Service sleeps after 15min inactivity
- 750 hours/month limit

### Paid Plans
- More RAM/CPU for better performance
- No sleep timeout
- Custom domains
- Better SLA

## Backup Strategy

- [ ] Database backups configured (AWS RDS automated backups)
- [ ] Redis data is cacheable (can be rebuilt)
- [ ] Code is in version control
- [ ] Environment variables documented