# OCOP Cloud Demo Deployment Checklist

This checklist prepares the private GitHub repository for a temporary client demo environment.

Repository: `https://github.com/aexphlhl-crypto/ocop-enterprise-platform`

Target URLs after deployment:

- Frontend: `https://<vercel-project>.vercel.app`
- Backend live health: `https://<render-service>.onrender.com/health/live`

Demo mode:

```env
DEMO_MODE=true
```

## 1. Deployment Architecture

| Layer | Service | Notes |
| --- | --- | --- |
| Frontend | Vercel | Next.js app in `frontend/` |
| Backend | Render Web Service | NestJS app using `backend/Dockerfile` |
| Database | Neon PostgreSQL | Run Prisma migrations before seeding |
| Redis | Upstash Redis | Use TLS `rediss://` URL |
| Storage | Cloudflare R2 or S3-compatible storage | Configure through MinIO-compatible env names |

## 2. Preflight Checks

Run locally before deploying:

```bash
cd backend
npm run build
npx prisma validate
```

```bash
cd frontend
npm run build
```

Confirmed during checklist preparation:

- `backend/Dockerfile` uses a production multi-stage Node 22 Alpine build.
- Backend listens on dynamic `PORT`.
- Backend exposes `GET /health/live`.
- Prisma schema validates successfully.
- Frontend API client requires `NEXT_PUBLIC_API_URL` and has no production localhost fallback.

## 3. Neon PostgreSQL

1. Create a Neon project.
2. Create a database for the demo environment.
3. Copy the pooled or direct PostgreSQL connection string.
4. Use this value as `DATABASE_URL` in Render and local migration commands.

Recommended migration command from local machine or CI:

```bash
cd backend
DATABASE_URL="<neon-postgres-url>" npx prisma migrate deploy
```

Seed enterprise demo data after migrations:

```bash
cd backend
DATABASE_URL="<neon-postgres-url>" npm run seed:demo
```

Note: `npm run seed:demo` uses `ts-node`, so run it from a local/CI environment with dev dependencies installed, or from a dedicated one-off job that installs full dependencies.

## 4. Upstash Redis

1. Create an Upstash Redis database.
2. Enable TLS.
3. Copy the Redis URL.
4. Use the `rediss://` URL as `REDIS_URL` in Render.

Backend supports either `REDIS_URL` or host/port/password fields. For Upstash, prefer `REDIS_URL`.

## 5. Cloudflare R2 Storage

The backend validates MinIO-compatible storage variables even in demo mode.

1. Create an R2 bucket.
2. Create R2 API credentials.
3. Use the S3-compatible endpoint as `MINIO_ENDPOINT`.
4. Set `MINIO_USE_SSL=true`.
5. Set `MINIO_BUCKET` to the bucket name.

Do not expose R2 secrets to Vercel.

## 6. Render Backend Web Service

1. Go to Render.
2. Create `New Web Service`.
3. Connect the private GitHub repository.
4. Select repository: `ocop-enterprise-platform`.
5. Runtime: Docker.
6. Root directory: `backend`.
7. Dockerfile path: `Dockerfile`.
8. Instance type: Free for demo.
9. Add environment variables from the backend table below.
10. Deploy.

Backend health check:

```text
https://<render-service>.onrender.com/health/live
```

Expected response:

```json
{
  "status": "ok",
  "environment": "demo"
}
```

## 7. Vercel Frontend Project

1. Go to Vercel.
2. Import the private GitHub repository.
3. Set Root Directory to `frontend`.
4. Framework preset: Next.js.
5. Build command: `npm run build`.
6. Output settings: Vercel default.
7. Add environment variables from the frontend table below.
8. Deploy.

Frontend URL:

```text
https://<vercel-project>.vercel.app
```

## 8. Backend Environment Variables

Set these in Render. Use real values only in Render, never in Git.

```env
NODE_ENV=production
DEMO_MODE=true
PORT=3000

DATABASE_URL=<neon-postgres-url>

REDIS_URL=<upstash-rediss-url>
REDIS_HOST=
REDIS_PORT=
REDIS_PASSWORD=
REDIS_DB=

JWT_SECRET=<strong-random-secret>
JWT_EXPIRES_IN=1d
JWT_REFRESH_SECRET=<strong-random-refresh-secret>
JWT_REFRESH_EXPIRES_IN=7d

CORS_ORIGIN=https://<vercel-project>.vercel.app
ALLOWED_ORIGINS=https://<vercel-project>.vercel.app

MINIO_ENDPOINT=<r2-s3-compatible-endpoint-host>
MINIO_PORT=443
MINIO_USE_SSL=true
MINIO_ACCESS_KEY=<r2-access-key-id>
MINIO_SECRET_KEY=<r2-secret-access-key>
MINIO_BUCKET=<r2-bucket-name>
MINIO_BUCKET_NAME=<r2-bucket-name>

POLYGON_RPC_URL=
POLYGON_PRIVATE_KEY=
POLYGON_CHAIN_ID=80002
CONTRACT_ADDRESS=

SMTP_HOST=
SMTP_PORT=
SMTP_USER=
SMTP_PASS=
```

Because `DEMO_MODE=true`, external blockchain transaction submission is disabled by design.

## 9. Frontend Environment Variables

Set these in Vercel.

```env
NEXT_PUBLIC_API_URL=https://<render-service>.onrender.com
NEXT_PUBLIC_DEMO_MODE=true
```

Do not include secrets in frontend variables.

## 10. CORS Configuration

After Vercel deployment, update Render:

```env
CORS_ORIGIN=https://<vercel-project>.vercel.app
ALLOWED_ORIGINS=https://<vercel-project>.vercel.app
```

If you add a custom domain later, append it as a comma-separated origin:

```env
ALLOWED_ORIGINS=https://<vercel-project>.vercel.app,https://demo.example.com
```

Redeploy Render after changing CORS.

## 11. Database Migration And Seed

Run migration after Neon is created and before customer demo:

```bash
cd backend
DATABASE_URL="<neon-postgres-url>" npx prisma migrate deploy
```

Seed demo data:

```bash
cd backend
DATABASE_URL="<neon-postgres-url>" DEMO_MODE=true npm run seed:demo
```

Verify seed result:

- Admin user exists.
- Seller user exists.
- Customer user exists.
- OCOP products, businesses, warehouses, inventory, certificates, procurement, events, and notifications are visible after login.

## 12. Smoke Test

Backend:

- Open `https://<render-service>.onrender.com/health/live`.
- Confirm `status` is `ok`.
- Confirm `environment` is `demo`.
- Login API returns JWT tokens.
- Dashboard API returns data.

Frontend:

- Open `https://<vercel-project>.vercel.app`.
- Login as demo admin.
- Open dashboard.
- Open products, inventory, supply chain, certificates, procurement, events, notifications.
- Confirm no CORS error in browser console.
- Confirm API calls go to `https://<render-service>.onrender.com`.

## 13. Demo Accounts

Use the accounts generated by `npm run seed:demo`.

Record the final demo account emails and passwords here after seeding:

| Role | Email | Password |
| --- | --- | --- |
| Admin | `<admin-email>` | `<demo-password>` |
| Seller | `<seller-email>` | `<demo-password>` |
| Customer | `<customer-email>` | `<demo-password>` |
| Event Coordinator | `<event-coordinator-email>` | `<demo-password>` |
| Warehouse Manager | `<warehouse-manager-email>` | `<demo-password>` |

## 14. Troubleshooting

Render build fails:

- Confirm Root Directory is `backend`.
- Confirm Dockerfile path is `Dockerfile`.
- Check `DATABASE_URL`, Redis, and storage env variables are set.

`/health/live` fails:

- Check Render logs.
- Confirm the service listens on Render-provided `PORT`.
- Confirm Docker healthcheck points to `/health/live`.

Prisma migration fails:

- Confirm Neon URL is PostgreSQL and reachable.
- Confirm SSL is required if Neon connection string needs it.
- Run `npx prisma validate` locally.

Frontend build fails:

- Confirm `NEXT_PUBLIC_API_URL` is set in Vercel.
- Confirm it does not end with `/api/v1`; use only backend origin.

CORS error:

- Confirm Render `ALLOWED_ORIGINS` exactly matches the Vercel URL.
- Redeploy backend after env changes.

Redis connection fails:

- Use Upstash `rediss://` URL as `REDIS_URL`.
- Do not split host/port/password unless required.

Storage upload fails:

- Confirm R2 endpoint host, bucket, access key, and secret key.
- Confirm `MINIO_USE_SSL=true` and `MINIO_PORT=443`.

## 15. Final Client Demo Gate

Before sharing the demo:

- [ ] Backend deployed on Render.
- [ ] Frontend deployed on Vercel.
- [ ] Neon migration completed.
- [ ] Enterprise demo seed completed.
- [ ] Upstash Redis connected.
- [ ] R2/S3-compatible storage configured.
- [ ] `DEMO_MODE=true` on backend.
- [ ] `NEXT_PUBLIC_DEMO_MODE=true` on frontend.
- [ ] `GET /health/live` returns `status: ok`.
- [ ] Frontend login works.
- [ ] Dashboard loads enterprise demo data.
- [ ] No CORS errors.
- [ ] No secrets committed to Git.
