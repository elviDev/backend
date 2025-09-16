#!/bin/bash

# Development startup script for CEO Communication Platform Backend

echo "🚀 Starting CEO Communication Platform Backend..."

# Check if .env exists
if [ ! -f ".env" ]; then
    echo "⚠️  .env file not found. Creating from .env.example..."
    cp .env.example .env
    echo "📝 Please update .env with your database credentials and run again."
    echo "💡 Common database URLs:"
    echo "   PostgreSQL: postgresql://username:password@localhost:5432/database_name"
    echo "   For Docker: postgresql://postgres:root@localhost:5432/ceo_platform_dev"
    exit 1
fi

# Check if PostgreSQL is running (basic check)
if ! nc -z localhost 5432; then
    echo "⚠️  PostgreSQL doesn't seem to be running on localhost:5432"
    echo "💡 Start your database service or update DATABASE_URL in .env"
    echo "   For Docker: docker-compose -f docker/docker-compose.dev.yml up -d"
fi

# Check if Redis is running (basic check)  
if ! nc -z localhost 6379; then
    echo "⚠️  Redis doesn't seem to be running on localhost:6379"
    echo "💡 Start Redis or update REDIS_* settings in .env"
fi

echo "📦 Installing dependencies..."
npm install

echo "🗃️  Running migrations..."
npm run db:migrate

echo "🌱 Starting development server with auto-seeding..."
npm run dev