FROM node:22-alpine AS build
WORKDIR /app
ARG VITE_TRACKING_WORKBENCH_URL=/workspace/tracking/overview
ENV VITE_TRACKING_WORKBENCH_URL=$VITE_TRACKING_WORKBENCH_URL
ARG VITE_TRACKING_ADAPTER_MODE=LOCAL_QUEUE
ENV VITE_TRACKING_ADAPTER_MODE=$VITE_TRACKING_ADAPTER_MODE
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM nginx:alpine
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
# Public files copied by Vite can retain a restrictive source umask. Nginx workers
# must be able to read all published assets regardless of checkout/archive modes.
RUN chmod -R a+rX /usr/share/nginx/html
