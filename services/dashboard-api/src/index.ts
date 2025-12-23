import { Elysia, t } from 'elysia';
import { jwt } from '@elysiajs/jwt';
import { db } from './db';
import { authRoutes } from './auth';
import { redis } from './redis';

const JWT_SECRET_KEY = Bun.env.JWT_SECRET_KEY;
const PORT = Bun.env.PORT;

const MAX_KEYS_FREE = Bun.env.MAX_KEYS_FREE;
const MAX_KEYS_PRO = Bun.env.MAX_KEYS_PRO;

if (!PORT || !JWT_SECRET_KEY || !MAX_KEYS_FREE || !MAX_KEYS_PRO) {
    console.error("CRITICAL ERROR: Missing env variables in .env");
    process.exit(1);
}

const app = new Elysia() 
    // now we add the dependency 
    .use(jwt({ name: "jwt",  secret: JWT_SECRET_KEY }))
    // mount the auth routes 
    .use(authRoutes)

    // the user needs to be logged in to create a api key DEPENDENCY 
    .group('/api', (app) => app
        // this runs before every route in the group 
        // It checks the token and injects 'userId' into the route context
        .derive(async ({ jwt, headers, set }) => {
            const auth = headers['authorization'];

            if (!auth || !auth.startsWith('Bearer ')) {
                set.status = 401;
                throw new Error("Unauthorized: Missing Token");
            }

            // verify the token signature 
            const token = auth.split(' ')[1];
            const profile = await jwt.verify(token);

            if(!profile){
                set.status = 401;
                throw new Error("Unauthorized: Invalid token"); 
            }

            // success
            return { userId: profile.id };
        })


        // ========== Generate API-keys ===================
        .post('/key', async ({ userId, body, set }) => {
            const { name } = body as { name?: string };

            try {
                // Prevent spamming the button. Max 5 attempts per minute
                const spamKey = `ratelimit:keygen:${userId}`;
                const attempts = await redis.incr(spamKey);

                if (attempts === 1) {
                    // expire the counter after 1 minute
                    await redis.expire(spamKey, 60);  
                }

                if (attempts > 5) {
                    set.status = 429;
                    return { error: "You are generating keys too fast. Please wait." };
                }

                // Enforce SaaS Plans (e.g., Free Tier = Max 3 Keys)
                const user = await db.user.findUnique({
                    where: { id: userId as string },
                    include: { _count: { select: {apiKeys: true } } }
                });

                if (!user) {
                    set.status = 404;
                    return { error: "User not found "};
                }

                const limit = user.plan === 'PRO' ? parseInt(MAX_KEYS_PRO) : parseInt(MAX_KEYS_FREE);

                if (user._count.apiKeys >= limit) {
                    set.status = 403;
                    return {
                        error: `Plan limit reached (${limit} api-keys)`
                    };
                }

                const secureKey = `sk_${crypto.randomUUID().replace(/-/g, '')}`;

                const newKey = await db.apiKey.create({
                    data: {
                        userId: userId as string,
                        key: secureKey,
                        name: name || "My_API_key",  // name given to the api key for tags 
                        limit: 10,  // the limit => the api key allows 10 requests in a window of 60s 
                        window: 60
                    }
                });

                // redis caching for the proxy 
                await redis.set(`apikey:${secureKey}`, JSON.stringify({
                    userId: newKey.userId,
                    limit: newKey.limit,
                    window: newKey.window,
                    isActive: newKey.isActive
                }));


                return { status: "success", apiKey: newKey };
            }
            catch (e) {
                console.error("Key Generation Error:", e);
                set.status = 500;
                return { error: "Failed to create key" };
            }
        })

        // ======== dashboard route for the user data when the user logs in ========
        .post('/dashboard', async ({userId, set}) => {
            try {
                // Check Redis Cache
                const cached = await redis.get(`dashboard:${userId}`);
                if (cached) {
                    console.log(`Cache HIT: ${userId}`);
                    return JSON.parse(cached);
                }
                console.log(`Cache MISS: ${userId}`);
                // Query DB (Include SaaS fields)
                const user = await db.user.findUnique({
                    where: { id: userId as string },
                    select: {
                        id: true,
                        email: true,
                        plan: true,       // Returns FREE or PRO
                        customerId: true, // For Stripe for payment 
                        apiKeys: {
                            orderBy: { createdAt: 'desc' }, // Newest first
                            select: {
                                id: true, key: true, name: true,  limit: true, isActive: true, createdAt: true
                            }
                        }
                    }
                });

                if (!user) {
                    set.status = 404;
                    return { error: "User not found" };
                }
                // Save to Redis Short expiry for freshness for 3 minutes 
                await redis.set(`dashboard:${userId}`, JSON.stringify(user), 'EX', 180);

                return user;

            } catch (e) {
                console.error("Dashboard Error:", e);
                set.status = 500;
                return { error: "Failed to load dashboard" };
            }
        }) 
    )
    .listen(parseInt(PORT));

console.log(`Dashboard API running at ${app.server?.hostname}:${app.server?.port}`);


