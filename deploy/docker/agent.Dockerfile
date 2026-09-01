# syntax=docker/dockerfile:1.7
FROM node:22-bookworm-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH CI=true
RUN corepack enable && corepack prepare pnpm@10.18.2 --activate

FROM base AS build
WORKDIR /repo
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc ./
COPY packages ./packages
COPY apps/agent ./apps/agent
COPY apps/cli ./apps/cli
COPY templates ./templates
COPY scripts ./scripts
RUN pnpm install --frozen-lockfile --filter @xdc-ai/agent... --filter @xdc-ai/cli...
RUN pnpm --filter @xdc-ai/agent build

FROM base AS runtime
WORKDIR /repo
ENV NODE_ENV=production PORT=4111 HOST=0.0.0.0 AGENT_WORKSPACE=/agent/workspace AGENT_DATA_DIR=/agent/data
COPY --from=build /repo /repo
RUN mkdir -p /agent/workspace /agent/data && chown -R node:node /agent
USER node
VOLUME ["/agent/workspace", "/agent/data"]
EXPOSE 4111
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://localhost:4111/kit/status',{headers:{'x-kit-token':process.env.KIT_API_TOKEN||''}}).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
WORKDIR /repo/apps/agent
CMD ["node", ".mastra/output/index.mjs"]
