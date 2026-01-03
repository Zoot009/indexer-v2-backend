# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./
COPY prisma.config.ts ./

# Install dependencies
RUN npm ci

# Copy source code
COPY . .

# Generate Prisma Client
RUN npx prisma generate

# Production stage
FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies only
RUN npm ci --omit=dev

# Copy built files from builder
COPY --from=builder /app/generated ./generated
COPY --from=builder /app/workers ./workers
COPY --from=builder /app/api ./api
COPY --from=builder /app/lib ./lib
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/tsconfig.json ./
COPY --from=builder /app/prisma.config.ts ./

# Install tsx globally for running TypeScript
RUN npm install -g tsx

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Change ownership
RUN chown -R nodejs:nodejs /app

USER nodejs

EXPOSE 3001

# Default to worker, can be overridden in docker-compose
CMD ["tsx", "workers/index.ts"]
