#!/bin/sh

set -eu

echo "Syncing Prisma schema for development..."
npx prisma db push --skip-generate

echo "Starting API dev server..."
exec npm run dev
