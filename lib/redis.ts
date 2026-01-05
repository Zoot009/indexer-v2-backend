import 'dotenv/config'
import IORedis from 'ioredis';

const redisUrl = process.env.REDIS_URL!;

const redis = new IORedis(redisUrl, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  lazyConnect: true,
});

redis.on('error', (err) => {
  console.error('Redis connection error:', err);
});

redis.on('connect', () => {
  console.log('Redis connected successfully');
});

// Attempt to connect
redis.connect().catch((err) => {
  console.error('Failed to connect to Redis:', err);
});

export default redis;