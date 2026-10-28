# Offline static-only update after the full preview image has already been built.
# Does not change Node dependencies, server code, browser runtime or database.
ARG PREVIEW_TRACKING_BASE=cargo-ui-preview-tracking:local
FROM ${PREVIEW_TRACKING_BASE}
COPY --chmod=0644 public/app.js public/index.html public/tracking-refinement.css /app/public/
