FROM node:20-alpine AS base

WORKDIR /app

ENV PNPM_HOME=/pnpm
ENV PATH="${PNPM_HOME}:${PATH}"

RUN apk add --no-cache ffmpeg yt-dlp

RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/backend/package.json packages/backend/package.json

RUN pnpm install --filter @tiktokmp3/backend... --prod --frozen-lockfile

COPY packages/backend packages/backend

WORKDIR /app/packages/backend

ENV NODE_ENV=production
EXPOSE 3000

CMD ["node", "src/server.js"]
