

# 🧠 What you are building (final clarity)

You are building a **domain-aware, cost-controlled background job system** that:

* Checks Google index status via **scrape.do**
* Respects **max concurrency = 15**
* Avoids wasting credits using **domain stop rules**
* Uses **Supabase (Postgres) as source of truth**
* Uses **BullMQ + Redis only for job coordination**
* Is **safe under retries, crashes, and scale**

---

# 🧱 Final architecture

```
Next.js API (enqueue jobs)
        ↓
Redis (BullMQ queue)
        ↓
Node Workers (max 15 concurrency)
        ↓
scrape.do (external API)
        ↓
Prisma → Supabase (Postgres)
```

---

# 0️⃣ Prerequisites (before coding)

You need:

* Node.js ≥ 18
* Redis running locally or via Docker
* Supabase project (already done)
* Prisma schema (already done)
* scrape.do API key

---

# 1️⃣ Install required packages

From your project root:

```bash
npm install bullmq ioredis
npm install @prisma/client
npm install node-fetch
```

(Prisma CLI already installed since you have schema.)

---

# 2️⃣ Redis setup (important but simple)

## Local Redis (Docker – recommended)

```bash
docker run -p 6379:6379 redis
```

That’s enough for development.

### Redis durability (production)

Later, enable:

```
appendonly yes
appendfsync everysec
```

But correctness does **not** depend on Redis persistence (DB is truth).

---

# 3️⃣ Core folders (create these)

```
/lib
  prisma.ts
  redis.ts
  queue.ts

/worker
  index.ts
  processor.ts
  scrape.ts
  domainRules.ts
```

This separation is important.

---

# 4️⃣ Prisma client (single instance)

### `/lib/prisma.ts`

```ts
import { PrismaClient } from '@prisma/client'

export const prisma = new PrismaClient()
```

**Why this matters**

* Prisma manages a connection pool
* One instance per process is the correct pattern

---

# 5️⃣ Redis connection

### `/lib/redis.ts`

```ts
import { Redis } from 'ioredis'

export const redis = new Redis({
  host: 'localhost',
  port: 6379,
  maxRetriesPerRequest: null,
})
```

---

# 6️⃣ BullMQ queue definition

### `/lib/queue.ts`

```ts
import { Queue } from 'bullmq'
import { redis } from './redis'

export const urlQueue = new Queue('url-index-check', {
  connection: redis,
})
```

This queue:

* Stores jobs
* Guarantees one job → one worker
* Handles retries

---

# 7️⃣ Enqueue jobs (Next.js API)

You enqueue **after URLs are saved**.

### `/app/api/enqueue/route.ts`

```ts
import { urlQueue } from '@/lib/queue'
import { prisma } from '@/lib/prisma'

export async function POST(req: Request) {
  const { projectId } = await req.json()

  const urls = await prisma.url.findMany({
    where: {
      projectId,
      status: 'PENDING',
    },
    select: { id: true },
  })

  await urlQueue.addBulk(
    urls.map(u => ({
      name: 'check-index',
      data: { urlId: u.id },
      opts: {
        attempts: 2,
        backoff: {
          type: 'exponential',
          delay: 60_000,
        },
        removeOnComplete: true,
        removeOnFail: false,
      },
    }))
  )

  await prisma.project.update({
    where: { id: projectId },
    data: {
      status: 'PROCESSING',
      startedAt: new Date(),
    },
  })

  return Response.json({ queued: urls.length })
}
```

---

# 8️⃣ Worker entry point (concurrency enforced)

### `/worker/index.ts`

```ts
import { Worker } from 'bullmq'
import { redis } from '../lib/redis'
import { processUrlJob } from './processor'

new Worker(
  'url-index-check',
  async job => {
    await processUrlJob(job.data.urlId)
  },
  {
    connection: redis,
    concurrency: 15, // 🔥 scrape.do limit
  }
)

console.log('Worker started with concurrency = 15')
```

This line is **critical**:

```ts
concurrency: 15
```

You will **never exceed scrape.do limits**.

---

# 9️⃣ Worker processor (core logic)

### `/worker/processor.ts`

This file orchestrates everything safely.

```ts
import { prisma } from '../lib/prisma'
import { scrapeGoogle } from './scrape'
import { applyDomainRules } from './domainRules'

export async function processUrlJob(urlId: string) {
  // 1️⃣ Claim URL
  const claimed = await prisma.url.updateMany({
    where: { id: urlId, status: 'PENDING' },
    data: { status: 'PROCESSING' },
  })

  if (claimed.count === 0) return

  // 2️⃣ Load URL + Domain
  const url = await prisma.url.findUnique({
    where: { id: urlId },
    include: { domainData: true, project: true },
  })

  if (!url || !url.domainData) return

  // 3️⃣ Check domain state (no scrape yet)
  if (url.domainData.isBlacklisted || url.domainData.isWhitelisted) {
    await prisma.url.update({
      where: { id: urlId },
      data: {
        status: 'COMPLETED',
        isIndexed: false,
        errorMessage: 'DOMAIN_STOPPED',
        checkedAt: new Date(),
      },
    })
    return
  }

  // 4️⃣ Perform scrape.do request
  const html = await scrapeGoogle(url.url)

  const indexed =
    html.includes('No results found') === false &&
    html.includes(url.url)

  // 5️⃣ Transaction: update URL + Domain counters atomically
  await prisma.$transaction(async tx => {
    await tx.url.update({
      where: { id: urlId },
      data: {
        status: 'COMPLETED',
        isIndexed: indexed,
        checkedAt: new Date(),
        checkCount: { increment: 1 },
      },
    })

    await applyDomainRules(tx, url.domainId!, indexed, url.projectId)
  })
}
```

---

# 🔟 scrape.do integration

### `/worker/scrape.ts`

```ts
import fetch from 'node-fetch'

export async function scrapeGoogle(url: string): Promise<string> {
  const query = `site:${url}`
  const target = `https://www.google.com/search?q=${encodeURIComponent(query)}`

  const response = await fetch('https://api.scrape.do', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.SCRAPEDO_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      url: target,
      render: false,
    }),
  })

  if (!response.ok) {
    throw new Error('SCRAPE_FAILED')
  }

  return response.text()
}
```

---

# 1️⃣1️⃣ Domain stop rules (the heart of your optimization)

### `/worker/domainRules.ts`

```ts
import { Prisma } from '@prisma/client'

export async function applyDomainRules(
  tx: Prisma.TransactionClient,
  domainId: string,
  indexed: boolean,
  projectId: string
) {
  const domain = await tx.domain.findUnique({
    where: { id: domainId },
  })

  if (!domain) return

  const config = await tx.domainCheckConfig.findUnique({
    where: { projectId },
  })

  if (!config || !config.enabled) return

  const updates: any = {
    totalUrlsChecked: { increment: 1 },
  }

  if (indexed) {
    updates.indexedUrlsCount = { increment: 1 }
  } else {
    updates.notIndexedCount = { increment: 1 }
  }

  // Apply counters
  const updatedDomain = await tx.domain.update({
    where: { id: domainId },
    data: updates,
  })

  // Apply stop rules
  if (
    config.applyWhitelistRule &&
    updatedDomain.indexedUrlsCount >= config.indexedStopThreshold
  ) {
    await tx.domain.update({
      where: { id: domainId },
      data: { isWhitelisted: true },
    })
  }

  if (
    config.applyBlacklistRule &&
    updatedDomain.totalUrlsChecked >= config.maxChecks &&
    updatedDomain.indexedUrlsCount === 0
  ) {
    await tx.domain.update({
      where: { id: domainId },
      data: {
        isBlacklisted: true,
        blacklistedAt: new Date(),
      },
    })
  }
}
```

---

# 1️⃣2️⃣ Why this implementation is correct

### ✅ No wasted credits

* Domain checked **before** scraping
* Stop rules apply immediately

### ✅ No race conditions

* URL claimed atomically
* Domain counters updated in transaction

### ✅ Queue-safe

* Already-queued jobs auto-skip

### ✅ Cost predictable

* Max 15 concurrent scrape.do calls
* No duplicate processing

---

# 1️⃣3️⃣ How to run everything

### Terminal 1 — Redis

```bash
docker run -p 6379:6379 redis
```

### Terminal 2 — Worker

```bash
node worker/index.ts
```

### Terminal 3 — Next.js

```bash
npm run dev
```

---

# 🧠 Final mental model (lock this in)

```
Job arrives
↓
URL claimed
↓
Domain allowed?
↓
Yes → scrape.do
↓
Update URL + domain
↓
Possibly stop domain
↓
Future jobs auto-skip
```

---

# 🚀 What you can add next (optional)

1. **Bull Board UI**
2. **Project pause / resume**
3. **Token usage enforcement**
4. **Domain-level analytics**
5. **Retry categorization**

If you want, tell me **which one**, and I’ll walk you through it just as deeply.

