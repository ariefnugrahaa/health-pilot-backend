#!/bin/bash

# HealthPilot Backend Rebuild Script
# Safe defaults:
# - Does NOT remove Docker volumes
# - Does NOT allow destructive schema changes unless ALLOW_DATA_LOSS=1
# Optional env flags:
# - RESET_VOLUMES=1     -> docker-compose down -v (WIPES DATABASE VOLUME)
# - SKIP_DB_PUSH=1      -> skip prisma db push
# - ALLOW_DATA_LOSS=1   -> allow prisma destructive changes
# - RUN_FULL_SEED=1     -> run full seed after startup

set -e

echo "🛑 Stopping containers..."
if [ "${RESET_VOLUMES:-0}" = "1" ]; then
  echo "⚠️ RESET_VOLUMES=1 enabled: database volume will be removed."
  docker-compose down -v
else
  docker-compose down
fi

echo "🔨 Building containers..."
docker-compose build

echo "🚀 Starting containers..."
docker-compose up -d

echo "⏳ Waiting for database to be ready..."
sleep 5

echo "📦 Generating Prisma client..."
docker-compose exec -T api npx prisma generate

if [ "${SKIP_DB_PUSH:-0}" = "1" ]; then
  echo "⏭️ SKIP_DB_PUSH=1 enabled: skipping Prisma db push."
else
  if [ "${ALLOW_DATA_LOSS:-0}" = "1" ]; then
    echo "⚠️ ALLOW_DATA_LOSS=1 enabled: running destructive-capable db push."
    docker-compose exec -T api npx prisma db push --accept-data-loss
  else
    echo "📦 Pushing Prisma schema to database (safe mode, no data-loss allowed)..."
    docker-compose exec -T api npx prisma db push
  fi
fi

echo "🔐 Ensuring admin credentials..."
docker-compose exec -T api npx tsx scripts/create-admin.ts

if [ "${RUN_FULL_SEED:-0}" = "1" ]; then
  echo "🌱 Running full database seed..."
  docker-compose exec -T api npm run prisma:seed
fi

echo "✅ Done! Containers are running."
docker-compose ps
