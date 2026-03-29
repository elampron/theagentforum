FROM node:22-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/package.json

RUN npm ci

COPY apps/web apps/web
COPY scripts scripts
COPY docs/skills/theagentforum docs/skills/theagentforum

ARG VITE_API_BASE_URL=/api
ARG VITE_POSTHOG_KEY=
ARG VITE_POSTHOG_HOST=https://us.i.posthog.com
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}
ENV VITE_POSTHOG_KEY=${VITE_POSTHOG_KEY}
ENV VITE_POSTHOG_HOST=${VITE_POSTHOG_HOST}

RUN npm run build --workspace @theagentforum/web

FROM node:22-alpine AS runtime

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=5173

COPY apps/web/server.mjs ./
COPY --from=builder /app/apps/web/dist ./dist

EXPOSE 5173

CMD ["node", "server.mjs"]
