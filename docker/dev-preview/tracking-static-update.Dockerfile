# Offline static-only update after the full preview image has already been built.
# Does not change Node dependencies, server code, browser runtime or database.
ARG PREVIEW_TRACKING_BASE=cargo-ui-preview-tracking:local
FROM ${PREVIEW_TRACKING_BASE}
COPY --chmod=0644 public/app.js public/index.html public/tracking-refinement.css public/tracking-milestones.css public/tracking-milestones.mjs public/workspace-navigation.css public/workspace-navigation.mjs /app/public/
# Static response MIME metadata only; carrier, backend and server logic stay in the base image.
COPY --chmod=0644 lib/static-assets.mjs /app/lib/static-assets.mjs
COPY public/carriers/ /app/public/carriers/
# Repair permissions even when the base image contains an older static overlay.
# Directory traversal is required by the non-root server that serves these files.
USER root
RUN find /app/public/carriers -type d -exec chmod 0755 {} + \
    && find /app/public/carriers -type f -exec chmod 0644 {} +
USER pwuser
