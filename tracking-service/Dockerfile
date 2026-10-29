FROM node:22-alpine AS assets

WORKDIR /app
COPY package.json package-lock.json ./
# Reuse the pinned dependency graph only to collect browser-side assets. No
# installation hooks or browser downloads run, and node_modules stays in this stage.
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
RUN npm ci --omit=dev --omit=optional --ignore-scripts
COPY public ./public
COPY scripts/prepare-cloud-assets.mjs ./scripts/prepare-cloud-assets.mjs
RUN node scripts/prepare-cloud-assets.mjs /cloud-assets

FROM nginx:alpine

COPY cloud-static.conf /etc/nginx/conf.d/default.conf
COPY --from=assets /cloud-assets/ /usr/share/nginx/html/
RUN chmod -R a+rX /usr/share/nginx/html

EXPOSE 3000
CMD ["nginx", "-g", "daemon off;"]
