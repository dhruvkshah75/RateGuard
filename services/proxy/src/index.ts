import { Elysia } from 'elysia';
import Redis from 'ioredis';

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
    .listen(parseInt(PORT));

    // The path: http://localhost:8080/ => this will return the RateGuard proxy is running 
    // The path: http://localhost:8080/ping => this will tell whether the server is up or not 

console.log(`Elysia is running at ${app.server?.hostname}:${app.server?.port}`);