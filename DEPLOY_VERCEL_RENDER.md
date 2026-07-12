# OCOP Cloud Demo Deployment: Vercel + Render

This document prepares the OCOP platform for a public demo deployment. It is not a production infrastructure runbook.

## Architecture

- Frontend: Next.js on Vercel.
- Backend: NestJS on Render using Docker.
- Database: Neon PostgreSQL.
- Redis: Upstash Redis.
- Storage: Cloudflare R2 or another S3-compatible service through the MinIO client.

## Frontend: Vercel

Create a Vercel project:

1. Import the repository into Vercel.
2. Set root directory to `frontend`.
3. Framework preset: `Next.js`.
4. Build command: `npm run build`.
5. Install command: `npm install`.
6. Output settings: Vercel default.

Required environment variables:

```env
NEXT_PUBLIC_API_URL=https://api-demo-domain.com
NEXT_PUBLIC_DEMO_MODE=true
DEMO_MODE=true
```

Notes:

- `NEXT_PUBLIC_API_URL` must point to the public Render backend URL.
- The frontend no longer uses a localhost fallback for production builds.
- `NEXT_PUBLIC_DEMO_MODE=true` displays the `Demo Environment` badge in the dashboard.

## Backend: Render

Create a Render Web Service:

1. Runtime: `Docker`.
2. Root directory: `backend`.
3. Dockerfile path: `backend/Dockerfile`.
4. Health check path: `/health/live`.
5. Instance type: Free or Starter for demo.

Start command:

```bash
npm run start:prod
```

The Dockerfile starts the compiled NestJS app with:

```bash
node dist/src/main
```

Required environment variables:

```env
NODE_ENV=production
DEMO_MODE=true
PORT=3000
CORS_ORIGIN=https://your-vercel-domain.vercel.app
ALLOWED_ORIGINS=https://your-vercel-domain.vercel.app

DATABASE_URL=postgresql://USER:PASSWORD@HOST/DB?sslmode=require

REDIS_URL=rediss://default:PASSWORD@HOST:PORT
REDIS_HOST=
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_DB=0

JWT_SECRET=replace-with-strong-random-secret
JWT_EXPIRES_IN=1d
JWT_REFRESH_SECRET=replace-with-strong-random-refresh-secret
JWT_REFRESH_EXPIRES_IN=7d

MINIO_ENDPOINT=account-id.r2.cloudflarestorage.com
MINIO_PORT=443
MINIO_USE_SSL=true
MINIO_ACCESS_KEY=replace-with-r2-access-key
MINIO_SECRET_KEY=replace-with-r2-secret-key
MINIO_BUCKET=ocop-demo
MINIO_BUCKET_NAME=ocop-demo

POLYGON_RPC_URL=
POLYGON_PRIVATE_KEY=
POLYGON_CHAIN_ID=80002
CONTRACT_ADDRESS=
```

Health endpoint:

```http
GET /health/live
```

Expected response when demo mode is enabled:

```json
{
  "status": "ok",
  "environment": "demo"
}
```

## Database: Neon PostgreSQL

Create a Neon project and database, then copy the connection string into Render as `DATABASE_URL`.

Run deployment migration and demo seed from the `backend` directory:

```bash
npx prisma migrate deploy
npm run seed:demo
```

Recommended order:

1. Deploy Render service with all env vars configured.
2. Run `npx prisma migrate deploy`.
3. Run `npm run seed:demo`.
4. Verify login with enterprise demo accounts.

## Redis: Upstash

Create an Upstash Redis database and use the TLS URL:

```env
REDIS_URL=rediss://default:PASSWORD@HOST:PORT
```

The backend supports `rediss://` and configures TLS automatically for BullMQ and internal Redis usage.

## Storage: Cloudflare R2

Create an R2 bucket and S3 API credentials.

Set:

```env
MINIO_ENDPOINT=account-id.r2.cloudflarestorage.com
MINIO_PORT=443
MINIO_USE_SSL=true
MINIO_ACCESS_KEY=replace-with-r2-access-key
MINIO_SECRET_KEY=replace-with-r2-secret-key
MINIO_BUCKET=ocop-demo
MINIO_BUCKET_NAME=ocop-demo
```

## Domain Configuration

After Vercel and Render URLs are known:

1. Set Render `CORS_ORIGIN` and `ALLOWED_ORIGINS` to the Vercel URL.
2. Set Vercel `NEXT_PUBLIC_API_URL` to the Render backend URL.
3. Redeploy both services after changing environment variables.

For a custom domain:

1. Add the frontend custom domain in Vercel.
2. Add the backend custom domain in Render if needed.
3. Update `CORS_ORIGIN`, `ALLOWED_ORIGINS`, and `NEXT_PUBLIC_API_URL`.

## Verification

Run locally before deployment:

```bash
cd backend
npm run build
npx prisma validate

cd ../frontend
npm run build
```

Verify cloud deployment:

- `GET https://<render-service>.onrender.com/health/live`
- Login on Vercel with `admin.enterprise@demo.com / demo123`
- Dashboard loads without CORS errors.
- Products, inventory, certificates, supply chain, procurement, events and notifications show demo data.

## Troubleshooting

- Frontend build fails with missing API URL: set `NEXT_PUBLIC_API_URL` or `BACKEND_URL` in Vercel.
- Browser shows CORS error: update Render `CORS_ORIGIN` and `ALLOWED_ORIGINS` to the exact Vercel domain.
- Render health check fails: verify `PORT=3000` and `/health/live`.
- Prisma migration fails: verify Neon `DATABASE_URL` includes SSL and the database is reachable.
- Redis queue fails: use `REDIS_URL` with `rediss://` from Upstash.
- File upload fails: verify R2 endpoint, bucket, access key and secret key.
- Blockchain fails in demo: set `DEMO_MODE=true` to use mock blockchain verification.
