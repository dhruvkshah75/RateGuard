import { Elysia } from 'elysia';
import { PrismaClient } from '@prisma/client';

const db = new PrismaClient();

const app = new Elysia() 