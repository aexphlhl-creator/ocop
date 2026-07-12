# OCOP Demo Deployment Guide

This guide is for a temporary client demo environment. It is not a production deployment.

## Target URLs

- Frontend: `https://<vercel-project>.vercel.app`
- Backend API: `https://<render-backend-service>.onrender.com`
- Backend health: `https://<render-backend-service>.onrender.com/health/live`
- API root: `https://<render-backend-service>.onrender.com/`

Fill the final URLs after Vercel and Render are created.

## Demo Accounts

Seeded demo accounts:

| Role | Email | Password |
| --- | --- | --- |
| Admin | `admin@demo.com` | `admin123` |
| Seller | `seller@demo.com` | `seller123` |
| Customer | `customer@demo.com` | `customer123` |

Existing seed accounts are still available:

| Role | Email | Password |
| --- | --- | --- |
| Admin | `admin@ocop.gov.vn` | `admin123` |
| Seller | `seller1@ocop.gov.vn` | `seller123` |
| Seller | `seller2@ocop.gov.vn` | `seller123` |

## Backend on Render

Create a Render Web Service:

- Runtime: Docker
- Root directory: `backend`
- Dockerfile path: `backend/Dockerfile`
- Health check path: `/health/live`
- Instance: Free

Required environment variables are listed in `backend/.env.demo`.

Recommended values:

```env
NODE_ENV=production
DEMO_MODE=true
PORT=3000
DATABASE_URL=<neon-pooled-or-direct-postgres-url>
REDIS_URL=<upstash-rediss-url>
JWT_SECRET=<strong-random-secret>
JWT_REFRESH_SECRET=<strong-random-secret>
CORS_ORIGIN=https://<vercel-project>.vercel.app
ALLOWED_ORIGINS=https://<vercel-project>.vercel.app
MINIO_ENDPOINT=<cloudflare-r2-account-id>.r2.cloudflarestorage.com
MINIO_PORT=443
MINIO_USE_SSL=true
MINIO_ACCESS_KEY=<r2-access-key-id>
MINIO_SECRET_KEY=<r2-secret-access-key>
MINIO_BUCKET=ocop-demo
POLYGON_RPC_URL=<polygon-amoy-rpc-url-optional-when-demo-mode-true>
POLYGON_PRIVATE_KEY=<backend-wallet-private-key-optional-when-demo-mode-true>
POLYGON_CHAIN_ID=80002
CONTRACT_ADDRESS=<traceability-registry-address>
```

Do not expose `POLYGON_PRIVATE_KEY`, JWT secrets, or storage secrets in client-side config.

When `DEMO_MODE=true`, the backend suppresses real blockchain transaction submission, writes mock blockchain verification results, and suppresses real email sending while keeping in-app notifications active. Set `DEMO_MODE=false` or remove it for production.

## Database on Neon

Create a Neon Free PostgreSQL database and set `DATABASE_URL` in Render.

Run migrations and seed:

```bash
cd backend
npx prisma migrate deploy
npx prisma db seed
npm run seed:demo
```

The base seed includes provinces, wards, roles, demo users, businesses, OCOP products, news, supply chain stages, and certificate types. The enterprise demo seed adds a client-ready dataset with enterprise users, 5 OCOP businesses, 20 products, warehouses, FIFO inventory batches, complete supply chain journeys, certificates, procurement records, events, campaigns, and notifications.

## Redis on Upstash

Use Upstash Free Redis if the queue is enabled for the demo.

Set:

```env
REDIS_URL=rediss://default:<password>@<host>:<port>
```

The backend also supports `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`, and `REDIS_DB`, but `REDIS_URL` is preferred for Upstash because it carries TLS through `rediss://`.

## Storage on Cloudflare R2

Use a Cloudflare R2 bucket with S3-compatible credentials.

Set the MinIO-compatible variables:

```env
MINIO_ENDPOINT=<account-id>.r2.cloudflarestorage.com
MINIO_PORT=443
MINIO_USE_SSL=true
MINIO_ACCESS_KEY=<r2-access-key-id>
MINIO_SECRET_KEY=<r2-secret-access-key>
MINIO_BUCKET=ocop-demo
MINIO_BUCKET_NAME=ocop-demo
```

## Frontend on Vercel

Create a Vercel project:

- Framework: Next.js
- Root directory: `frontend`
- Build command: `npm run build`
- Output: Vercel default

Required environment variables are listed in `frontend/.env.demo`.

```env
NEXT_PUBLIC_API_URL=https://<render-backend-service>.onrender.com
BACKEND_URL=https://<render-backend-service>.onrender.com
NEXT_PUBLIC_DEMO_MODE=true
DEMO_MODE=true
```

Redeploy frontend after the Render backend URL is known.

## Verification Checklist

Backend:

- `GET /health/live` returns live status.
- `GET /health` returns database and Redis connectivity.
- Login works for `admin@demo.com`.
- JWT access token can call dashboard APIs.
- Prisma migrations are deployed to Neon.
- Seed data is visible.
- Redis queue connects through Upstash.
- Certificate upload stores files in R2-compatible storage.

Frontend:

- Homepage loads from Vercel.
- Login works.
- Dashboard loads KPIs.
- Products page loads seeded products.
- Inventory page loads warehouses and movements.
- Supply Chain timeline and traceability pages load.
- Procurement purchase orders and goods receipt pages load.
- Events and notification campaign pages load.
- Browser console has no CORS errors.

Demo feature list:

- Authentication: login, logout, refresh token.
- Dashboard KPI.
- Product browsing and management.
- Inventory overview and stock movement.
- Supply chain timeline and QR traceability.
- Certificate management and storage.
- Procurement purchase orders and goods receipt.
- Events and notification campaigns.
- Blockchain dashboard if Polygon Amoy RPC, wallet, and contract are configured.

## Demo Limitations

- Free Render services can cold-start after inactivity.
- Free Neon/Upstash/R2 limits apply.
- This environment has no HA, advanced monitoring, or production backup policy.
- Blockchain writes require Amoy testnet funds in the backend wallet.
- This is for client demo only, not production traffic.

## Local Verification Completed

- Backend `npm run build`: passed.
- Frontend `npm run build`: passed.
- Prisma `npx prisma validate`: passed.
- Dockerfile was corrected for Render healthcheck and Nest build output path.
- Docker image build was attempted locally. Docker produced an `ocop-backend-demo` image during verification, but the local build command timed out in the tool before full logs could be captured.
