FROM node:22-alpine AS build
WORKDIR /app
ARG VITE_TRACKING_WORKBENCH_URL=/tracking/
ENV VITE_TRACKING_WORKBENCH_URL=$VITE_TRACKING_WORKBENCH_URL
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM nginx:alpine
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
