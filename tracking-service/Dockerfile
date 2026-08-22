FROM mcr.microsoft.com/playwright:v1.61.1-noble

WORKDIR /app

COPY package.json package-lock.json ./
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
RUN npm ci --omit=dev

COPY . .

RUN chown -R pwuser:pwuser /app

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    PLAYWRIGHT_HEADLESS=true \
    PLAYWRIGHT_BROWSER_CHANNEL=chromium

USER pwuser

EXPOSE 3000

CMD ["node", "server.mjs"]
