import { Redis } from 'ioredis';

export interface LimitResult {
    isBlocked: boolean;
    remaining: number;
    currentCount: number;
}

export const checkRateLimit = async (
    redis: Redis,
    apiKey: string,
    limit: number,
    windowSeconds: number
): Promise<LimitResult> => {

    const now = Date.now();
    const windowMs = windowSeconds * 1000;
    const userKey = `usage:${apiKey}`;
    const clearBefore = now - windowMs;

    // we use a redis pipeline for speed and atomicity 
    const pipeline = redis.multi();

    // Remove all timestamps older than the current window
    pipeline.zremrangebyscore(userKey, 0, clearBefore);

    // Add the current request timestamp (using UUID or now as member)
    const requestId = `${now}-${Math.random()}`; 
    pipeline.zadd(userKey, now, requestId);

    // Count how many timestamps are left in the set
    pipeline.zcard(userKey);
    
    // Set expiry so the key cleans itself up if the user stops hitting the API
    pipeline.expire(userKey, windowSeconds + 1);

    const results = await pipeline.exec();
    
    // results[2] contains the output of ZCARD (the count)
    // Results structure: [[err, res], [err, res], [err, count]]
    const currentCount = (results?.[2]?.[1] as number) || 0;
    const remaining = Math.max(0, limit - currentCount);

    return {
        isBlocked: currentCount > limit,
        remaining,
        currentCount
    };
};