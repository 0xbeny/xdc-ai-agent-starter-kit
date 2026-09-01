# syntax=docker/dockerfile:1.7
FROM node:22-bookworm-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH CI=true NEXT_TELEMETRY_DISABLED=1
RUN corepack enable && corepack prepare pnpm@10.18.2 --activate

FROM base AS build
WORKDIR /repo
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc ./
COPY packages/config ./packages/config
COPY apps/dashboard ./apps/dashboard
RUN pnpm install --frozen-lockfile --filter @xdc-ai/dashboard...
RUN pnpm --filter @xdc-ai/dashboard build

FROM base AS runtime
WORKDIR /repo
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0
COPY --from=build /repo /repo
USER node
EXPOSE 3000
WORKDIR /repo/apps/dashboard
CMD ["pnpm", "start"]
