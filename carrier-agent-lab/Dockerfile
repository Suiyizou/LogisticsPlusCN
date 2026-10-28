FROM node:22-bookworm-slim AS build

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
COPY scripts ./scripts
COPY test ./test
RUN npm run build

FROM mcr.microsoft.com/playwright:v1.62.1-noble

ENV NODE_ENV=production \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY public ./public
COPY .pi ./.pi
RUN mkdir -p /app/artifacts && chown pwuser:pwuser /app/artifacts

USER pwuser
EXPOSE 4317
CMD ["npm", "start"]
