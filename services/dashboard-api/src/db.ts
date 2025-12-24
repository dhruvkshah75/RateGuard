import { PrismaClient } from '@prisma/client';

export const db = new PrismaClient({
    datasourceUrl: Bun.env.DATABASE_URL,
});
