import { Elysia } from 'elysia';
import { jwt } from '@elysiajs/jwt';
import { db } from './db'
import { redis } from './redis'


export const JWT_SECRET_KEY = Bun.env.JWT_SECRET_KEY;

if(!JWT_SECRET_KEY){
    console.error("CRITICAL ERROR: Missing environment variables.");
    process.exit(1);
}

export const authRoutes = new Elysia()
    .use(jwt({
            name: "jwt",
            secret: JWT_SECRET_KEY
        })
    )

    // ================ REGISTER =======================
    // post http reqeust to create a new user 
    .post('/register', async ({ body, set }) => {
        const { email, password } = body as any;

        if (!email || !password) {
            set.status = 400;
            return { error: "Missing email or password"};
        }

        try {
            // first we check if the user exists in the redis cache 
            const cached_user = await redis.get(`user:${email}`);
            if(cached_user) {
                console.log(`CACHE HIT: ${email} found in cache`);
                set.status = 409;
                return {error: "User already exists"};
            }

            // if not found in redis cache then we search in the database on email as email is unique 
            const existing_user = await db.user.findUnique({ where: { email }});
            if(existing_user) {
                set.status = 409;
                await redis.set(`user:${email}`, JSON.stringify(existing_user), 'EX', 3600);

                return { error: "User already exists" };
            }

            // now we create the user 
            const hashedPassword = await Bun.password.hash(password);

            const newUser = await db.user.create({
                data: {
                    email,
                    password: hashedPassword
                }
            });

            await redis.set(`user:${email}`, JSON.stringify(newUser), 'EX', 3600);

            return { status: "created", userId: newUser.id }

        }
        catch(e) {
            console.error("Registration error: ", e);
            set.status = 500;
            return { error: "Registration failed" };
        }
    })

    // ======================== LOGIN ============================
    // login into the existing account and return the jwt token 
    .post('/login', async({ body, jwt, set }) => {
        const { email, password } = body as any;

        if (!email || !password) {
            set.status = 400;
            return { error: "Missing email or password" };
        }

        let user;

        try {
            // check if the user is in the cache 
            const cached_user = await redis.get(`user:${email}`);

            if(cached_user) {
                user = JSON.parse(cached_user);
            }
            else {
                user = await db.user.findUnique({ where: { email }});
                // now add the user to the cache 
                if(user) {
                    await redis.set(`user:${email}`, JSON.stringify(user), 'EX', 3600);
                }
            }
            // if user not found either in the db then return error  
            if (!user) {
                set.status = 401;
                return { error: "Invalid credentials" };
            }

            const isMatch = await Bun.password.verify(password, user.password);
            // if the password doesnt match then return error 
            if(!isMatch) {
                set.status = 401;
                return { error: "Invalid credentials" };
            }

            // now issue the token 
            const token = await jwt.sign({ id: user.id, email: user.email});

            return { status: "success", token };
        }
        catch(e) {
            console.error("Error occured during login: ", e);
            set.status = 500;
            return { error: "Login failed" };
        }
    })