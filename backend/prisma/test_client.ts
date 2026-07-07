import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

console.log('DATABASE_URL from process.env:', process.env.DATABASE_URL);
try {
  const prisma = new PrismaClient();
  console.log('Prisma Client instantiated successfully!');
} catch (e) {
  console.error('Instantiation failed:', e);
}
