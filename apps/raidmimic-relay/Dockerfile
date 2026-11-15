# Raid Mimic party relay. Build context is THIS folder (Railway: root directory apps/raidmimic-relay, Dockerfile
# path Dockerfile). It shares nothing with the Wolf Pack bot's Dockerfile at the repo root.
FROM node:22-alpine

ENV NODE_ENV=production
WORKDIR /app

# Dependencies first so a code-only change reuses the cached layer. The lockfile is committed on purpose (the root
# .gitignore ignores lockfiles; this folder has an exception): `ws` is pinned exactly.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY index.js lib.js ./

# Nothing is written to disk: parties and history live in memory only.
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s CMD wget -qO- "http://127.0.0.1:${PORT:-8080}/health" || exit 1

CMD ["node", "index.js"]
