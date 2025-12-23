import { Elysia } from 'elysia';
import { PrismaClient } from '@prisma/client';
import { jwt } from '@elysiajs/jwt';

const db = new PrismaClient();

const app = new Elysia() 
    .get('/', () => 'RateGuard Dashboard API is alive');

    // USER Registration 