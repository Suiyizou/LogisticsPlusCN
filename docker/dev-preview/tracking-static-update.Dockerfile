# Offline workspace UI and static-response security update over the existing preview image.
# Node dependencies, carrier integrations, backend and database remain in the base image.
ARG PREVIEW_TRACKING_BASE=cargo-ui-preview-tracking:local
FROM ${PREVIEW_TRACKING_BASE}
COPY --chmod=0644 public/app.js public/styles.css public/workspace-bridge.mjs public/index.html public/tracking-refinement.css public/tracking-milestones.css public/tracking-milestones.mjs public/workspace-navigation.css public/workspace-navigation.mjs /app/public/
# Tracking documents permit only same-origin workspace embedding.
COPY --chmod=0644 lib/static-assets.mjs lib/http-utils.mjs /app/lib/
COPY public/carriers/ /app/public/carriers/
# Repair permissions even when the base image contains an older static overlay.
# Directory traversal is required by the non-root server that serves these files.
USER root
RUN find /app/public/carriers -type d -exec chmod 0755 {} + \
    && find /app/public/carriers -type f -exec chmod 0644 {} +
USER pwuser
