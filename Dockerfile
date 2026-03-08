# HealthPilot Backend Dockerfile
# Multi-stage build for production optimization

ARG NPM_FETCH_RETRIES=5
ARG NPM_FETCH_RETRY_MINTIMEOUT=20000
ARG NPM_FETCH_RETRY_MAXTIMEOUT=120000

# ============================================
# Stage 1: Dependencies
# ============================================
FROM node:20-alpine AS deps

WORKDIR /app

ARG NPM_FETCH_RETRIES
ARG NPM_FETCH_RETRY_MINTIMEOUT
ARG NPM_FETCH_RETRY_MAXTIMEOUT

# Install dependencies for native modules
RUN apk add --no-cache libc6-compat

# Copy package files
COPY package.json package-lock.json* ./

# Install dependencies
RUN npm config set fetch-retries ${NPM_FETCH_RETRIES} \
    && npm config set fetch-retry-mintimeout ${NPM_FETCH_RETRY_MINTIMEOUT} \
    && npm config set fetch-retry-maxtimeout ${NPM_FETCH_RETRY_MAXTIMEOUT} \
    && i=1 \
    && until npm ci --omit=dev --no-audit --no-fund; do \
      if [ "$i" -ge 3 ]; then exit 1; fi; \
      echo "npm ci failed, retrying ($i/3)..."; \
      i=$((i + 1)); \
      sleep 5; \
    done \
    && npm cache clean --force

# ============================================
# Stage 2: Builder
# ============================================
FROM node:20-alpine AS builder

WORKDIR /app

ARG NPM_FETCH_RETRIES
ARG NPM_FETCH_RETRY_MINTIMEOUT
ARG NPM_FETCH_RETRY_MAXTIMEOUT

# Copy package files
COPY package.json package-lock.json* ./

# Install all dependencies (including dev)
RUN npm config set fetch-retries ${NPM_FETCH_RETRIES} \
    && npm config set fetch-retry-mintimeout ${NPM_FETCH_RETRY_MINTIMEOUT} \
    && npm config set fetch-retry-maxtimeout ${NPM_FETCH_RETRY_MAXTIMEOUT} \
    && i=1 \
    && until npm ci --no-audit --no-fund; do \
      if [ "$i" -ge 3 ]; then exit 1; fi; \
      echo "npm ci failed, retrying ($i/3)..."; \
      i=$((i + 1)); \
      sleep 5; \
    done

# Copy source code
COPY . .

# Generate Prisma client
RUN npx prisma generate

# Build TypeScript
RUN npm run build

# ============================================
# Stage 3: Development Runner
# ============================================
FROM node:20-alpine AS dev

WORKDIR /app

ARG NPM_FETCH_RETRIES
ARG NPM_FETCH_RETRY_MINTIMEOUT
ARG NPM_FETCH_RETRY_MAXTIMEOUT

# Install dependencies for native modules
RUN apk add --no-cache libc6-compat

# Sort env
ENV NODE_ENV=development

# Copy package files
COPY package.json package-lock.json* ./

# Install ALL dependencies (including devDependencies like tsx)
RUN npm config set fetch-retries ${NPM_FETCH_RETRIES} \
    && npm config set fetch-retry-mintimeout ${NPM_FETCH_RETRY_MINTIMEOUT} \
    && npm config set fetch-retry-maxtimeout ${NPM_FETCH_RETRY_MAXTIMEOUT} \
    && i=1 \
    && until npm ci --no-audit --no-fund; do \
      if [ "$i" -ge 3 ]; then exit 1; fi; \
      echo "npm ci failed, retrying ($i/3)..."; \
      i=$((i + 1)); \
      sleep 5; \
    done

# Copy source code
COPY . .

# Generate Prisma client
RUN npx prisma generate

# Expose port
EXPOSE 3000

# Start development server
CMD ["npm", "run", "dev"]

# ============================================
# Stage 4: Production Runner
# ============================================
FROM node:20-alpine AS runner

WORKDIR /app

# Set environment
ENV NODE_ENV=production

# Create non-root user for security
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 healthpilot

# Copy production dependencies
COPY --from=deps /app/node_modules ./node_modules

# Copy built application
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/package.json ./package.json

# Set ownership
RUN chown -R healthpilot:nodejs /app

# Switch to non-root user
USER healthpilot

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

# Start application
CMD ["node", "dist/index.js"]
