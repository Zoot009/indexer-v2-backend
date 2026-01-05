import 'dotenv/config'
import { Pool } from 'pg'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../generated/prisma/client';

const globalForPrisma = global as unknown as {
    prisma: PrismaClient
    pool: Pool
}

const connectionString = process.env.DIRECT_URL || process.env.DATABASE_URL;

// Configure connection pool with proper limits
// Max = 20 connections for backend workers (allows headroom for frontend)
// idleTimeoutMillis = close idle connections after 30 seconds
// connectionTimeoutMillis = fail fast if can't get connection in 10 seconds
const pool = globalForPrisma.pool || new Pool({
  connectionString,
  max: 20, // Maximum number of clients in the pool
  min: 2,  // Minimum number of clients to keep alive
  idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
  connectionTimeoutMillis: 10000, // Fail if can't connect within 10 seconds
})

// Log pool errors
pool.on('error', (err) => {
  console.error('Unexpected error on idle database client', err)
})

const adapter = new PrismaPg(pool)

const prisma = globalForPrisma.prisma || new PrismaClient({
  adapter,
  log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
})

// Store pool globally in dev to prevent multiple instances
if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma
  globalForPrisma.pool = pool
}

// Graceful shutdown handler
export async function disconnectPrisma() {
  await prisma.$disconnect()
  await pool.end()
  console.log('✅ Database connections closed')
}

export default prisma