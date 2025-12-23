import Redis from 'ioredis';

const REDIS_HOST = Bun.env.REDIS_HOST;
const REDIS_PORT = Bun.env.REDIS_PORT;

if (!REDIS_HOST || !REDIS_PORT) {
    console.error("CRITICAL ERROR: Missing environment variables in .env");
    process.exit(1);
}

export const redis = new Redis({
    host: REDIS_HOST,
    port: parseInt(REDIS_PORT),
    retryStrategy: (times) => {
        if (times >= 5){
            return null;
        } 

        return Math.min(times * 50, 2000); // time for the redis to recover 
    }
});

console.log(`Dashboard API connected to Redis at ${REDIS_HOST}:${REDIS_PORT}`);