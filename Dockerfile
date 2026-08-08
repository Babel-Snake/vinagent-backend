# syntax=docker/dockerfile:1

ARG NODE_VERSION=24.18.0

FROM node:${NODE_VERSION}-bookworm-slim AS dependencies
WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund \
    && npm cache clean --force

FROM node:${NODE_VERSION}-bookworm-slim AS runtime
WORKDIR /app

ENV NODE_ENV=production \
    PORT=3000 \
    ATTACHMENT_STORAGE_ROOT=/app/data/attachments

RUN mkdir -p /app/data/attachments \
    && chown -R node:node /app

COPY --from=dependencies --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node package.json package-lock.json .sequelizerc ./
COPY --chown=node:node src ./src

USER node
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 3000) + '/health/ready').then((response) => process.exit(response.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "src/server.js"]
