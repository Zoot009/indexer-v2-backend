# Indexer Backend

Backend service for URL indexing and monitoring with BullMQ job queues, Redis, and PostgreSQL.

## 🚀 Quick Start

### Local Development

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Set up environment variables:**
   ```bash
   cp .env.example .env
   # Edit .env with your actual values
   ```

3. **Start local Redis and PostgreSQL** (or use Docker)

4. **Generate Prisma Client:**
   ```bash
   npm run db:generate
   ```

5. **Run migrations:**
   ```bash
   npm run db:migrate
   ```

6. **Start the services:**
   ```bash
   # Terminal 1 - Worker
   npm run worker:dev

   # Terminal 2 - API
   npm run api:dev
   ```

## 📦 Production Deployment

See **[DEPLOYMENT.md](DEPLOYMENT.md)** for complete VPS deployment instructions with Docker.

## 🔑 Environment Variables

### Required Variables

- `DATABASE_URL` - PostgreSQL connection string (Supabase or self-hosted)
- `REDIS_PASSWORD` - Password for Redis authentication
- `SCRAPEDO_API_KEY` - API key for Scrape.do service

### Optional Variables

- `API_PORT` - API server port (default: 3001)

**Important:** 
- Never commit `.env` files with real passwords
- Use `.env.production` as a template (safe to commit)
- In production, passwords are injected from VPS `.env` file (not committed)

## 🐳 Docker Services

The application consists of 3 Docker services:

1. **Redis** - Job queue and caching (port 6379)
2. **Worker** - Processes URL indexing jobs
3. **API** - Stats SSE endpoint (port 3001)

## 📁 Project Structure

```
├── api/                    # API server
│   └── stats-sse.ts       # Server-Sent Events endpoint
├── lib/                   # Shared libraries
│   ├── prisma.ts         # Database client
│   ├── redis.ts          # Redis client
│   └── stats-aggregator.ts
├── workers/               # Background workers
│   ├── index.ts          # Worker entry point
│   ├── processor.ts      # Job processor
│   ├── scrape.ts         # Scraping logic
│   └── domain-rules.ts   # Domain filtering
├── prisma/
│   └── schema.prisma     # Database schema
├── docker-compose.yml     # Docker orchestration
├── Dockerfile            # Container image
└── DEPLOYMENT.md         # Deployment guide
```

## 🔒 Security Notes

1. **Redis Password**: Always set a strong password when exposing Redis externally
2. **Environment Files**: 
   - `.env` is in `.gitignore` (never committed)
   - `.env.production` is a template only (safe to commit)
3. **Docker Compose**: Uses `${REDIS_PASSWORD}` which pulls from `.env` file
4. **External Access**: Construct Redis URL manually for external services (e.g., Vercel)

## 📊 External Access (Vercel/Next.js)

To connect from Vercel, add this to your Vercel environment variables:

```bash
REDIS_URL=redis://:YOUR_REDIS_PASSWORD@your-vps-ip:6379
```

Replace:
- `YOUR_REDIS_PASSWORD` - Same password as VPS `.env`
- `your-vps-ip` - Your VPS public IP or domain

## 📜 Available Scripts

- `npm run worker:dev` - Start worker in development mode
- `npm run worker:start` - Start worker in production mode
- `npm run api:dev` - Start API server in development mode
- `npm run api:start` - Start API server in production mode
- `npm run db:generate` - Generate Prisma Client
- `npm run db:migrate` - Run database migrations

## 📝 License

ISC
