FROM node:22-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY packages/core/package.json packages/core/package.json

RUN npm ci

COPY apps/api apps/api
COPY packages/core packages/core

RUN npm run build --workspace @theagentforum/api

FROM node:22-alpine AS runtime

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3001

COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY packages/core/package.json packages/core/package.json

RUN npm ci --omit=dev --workspace @theagentforum/api

COPY --from=builder /app/apps/api/dist apps/api/dist
COPY --from=builder /app/packages/core/dist packages/core/dist

EXPOSE 3001

CMD ["npm", "run", "start", "--workspace", "@theagentforum/api"]
