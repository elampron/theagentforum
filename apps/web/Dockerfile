FROM node:22-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/package.json

RUN npm ci

COPY apps/web apps/web

ARG VITE_API_BASE_URL=http://127.0.0.1:3001
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}

RUN npm run build --workspace @theagentforum/web

FROM node:22-alpine AS runtime

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=5173

COPY apps/web/server.mjs ./
COPY --from=builder /app/apps/web/dist ./dist

EXPOSE 5173

CMD ["node", "server.mjs"]
