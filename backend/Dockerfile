# --- Stage 1: Builder ---
FROM node:22-alpine AS builder

WORKDIR /usr/src/app

# Install dependencies needed for node-gyp (e.g. bcrypt, argon2)
RUN apk add --no-cache python3 make g++ 
RUN npm install -g npm@11

COPY package*.json ./
COPY prisma ./prisma/
RUN npm ci

COPY . .
RUN npx prisma generate
RUN npm run build

# --- Stage 2: Production ---
FROM node:22-alpine AS production

# Install tini, curl, and postgresql16-client for database backups and restores
RUN apk add --no-cache tini curl postgresql16-client
RUN npm install -g npm@11

WORKDIR /usr/src/app

COPY package*.json ./
COPY prisma ./prisma/
COPY prisma.config.ts ./

# Install only production dependencies
RUN npm ci --omit=dev && npm cache clean --force
RUN npx prisma generate

# Copy built assets from builder
COPY --from=builder /usr/src/app/dist ./dist

# Copy administrative and backup automation scripts
COPY scripts ./scripts

# Copy entrypoint script and grant execution permissions
COPY entrypoint.sh ./entrypoint.sh
RUN chmod +x ./entrypoint.sh

# Create backups volume directory with node user ownership for PVC mounts
RUN mkdir -p /backups && chown -R node:node /backups /usr/src/app

# Use non-root user
USER node

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

# Healthcheck
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:3000/health/live || exit 1

# ★ SỬA: entrypoint giờ chạy qua tini -> script -> node
ENTRYPOINT ["/sbin/tini", "--", "./entrypoint.sh"]
CMD ["node", "dist/src/main"]