import { Elysia } from 'elysia';
import { jwt } from '@elysiajs/jwt';
import { db } from './db';
import { authRoutes } from './auth';
import { redis } from './redis';

const JWT_SECRET_KEY = Bun.env.JWT_SECRET_KEY;

if (!JWT_SECRET_KEY) {
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
            const auth = headers['authentication'];
            
            if (!auth || !auth.startsWith('Bearer ')) {
                set.status = 401;
                throw new Error("Unauthorized: Missing Token");
            }
        })

    )
