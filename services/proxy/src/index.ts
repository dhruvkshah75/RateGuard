import { Elysia } from 'elysia';
import Redis from 'ioredis';
import { PrismaClient } from './generated/client';
import { checkRateLimit } from './limiter';

const prisma = new PrismaClient();

const PORT = Bun.env.PORT;
const REDIS_HOST = Bun.env.REDIS_HOST;
const REDIS_PORT = Bun.env.REDIS_PORT;

if (!PORT || !REDIS_HOST || !REDIS_PORT) {  // check needed to ensure that the env var have a datatype
    console.error("CRITICAL ERROR: Missing environment variables.");
    console.error("Please ensure .env contains: PORT, REDIS_HOST, REDIS_PORT");
    process.exit(1); // Kill the app immediately
}

const redis = new Redis({
    host: REDIS_HOST,
    port: parseInt(REDIS_PORT),
    retryStrategy: (times) => {
        if(times >= 5) {
            console.error('Redis is dead. We gave up after 5 tries');
            return null;
        }
        return Math.min(times * 50, 2000);  // redis gets more time to recover 
    } 
});


const app = new Elysia()
    .get('/', () => 'RateGuard Proxy is Running')  // this refers to the get http response 
    .get('/ping', async () => {
        if (redis.status === 'ready'){
            return 'pong';
        }
        else {
            return new Response('Redis connection failed', {status: 500})
        }
    })

    .derive(async ({ headers, set }) => {
        const apiKey = headers['x-api-key'];

        if (!apiKey) {
            set.status = 401;  // unauthorized 
            return { error: "Missing API Key" };
        }

        let keyData = await redis.get(`apikey:${apiKey}`);

        if (!keyData) {
            console.log("Cache Miss! Checking Database...");
            // 1. Check Postgres via Prisma
            const dbKey = await prisma.apiKey.findUnique({
                where: { key: apiKey },
                include: { user: true }
            });

            if (!dbKey) {
                // not in cache and not in cache 
                set.status = 401;
                return { error: "Invalid API Key" };
            }

            // 2. Format the config to match what the Proxy expects
            const config = {
                limit: dbKey.user.plan === 'PRO' ? 1000 : 10,
                window: 60,
                isActive: dbKey.isActive
            };

            // "Heal" the cache (Save it back to Redis)
            await redis.set(`apikey:${apiKey}`, JSON.stringify(config), 'EX', 3600);
            keyData = JSON.stringify(config);
        }   

        const config = JSON.parse(keyData);

        // Use the sliding window rate limiter
        const limitResult = await checkRateLimit(
            redis,
            apiKey,
            config.limit,
            config.window
        );

        // SET PROFESSIONAL HEADERS
        set.headers['x-ratelimit-limit'] = config.limit.toString();
        set.headers['x-ratelimit-remaining'] = limitResult.remaining.toString();
        set.headers['x-ratelimit-reset'] = config.window.toString();

        // ENFORCEMENT
        if (limitResult.isBlocked) {
            set.status = 429;
            return { error: "Rate limit exceeded. Upgrade your plan for more capacity." };
        }

        return { keyConfig: config };
    })


    .all('/*', async ({ path, request }) => {
        // We forward all valid requests to JSONPlaceholder (Mock API)
        const TARGET_URL = `https://jsonplaceholder.typicode.com${path}`;
        
        console.log(`[Proxy] Forwarding request to: ${TARGET_URL}`);

        try {
            const response = await fetch(TARGET_URL, {
                method: request.method,
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            // Return the data directly from the target
            return await response.json();
        } 
        catch (e) {
            return { error: "Destination API unreachable" };
        }
    })

    .listen(parseInt(PORT));

    // The path: http://localhost:8080/ => this will return the RateGuard proxy is running 
    // The path: http://localhost:8080/ping => this will tell whether the server is up or not 

console.log(`Elysia is running at ${app.server?.hostname}:${app.server?.port}`);