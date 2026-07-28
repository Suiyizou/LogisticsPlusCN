import { requestJson } from "./apiClient";

const configuredBase = import.meta.env.VITE_API_BASE_URL;

function normalizeItems(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.content)) return payload.content;
  return [];
}

export async function fetchTodayAnnouncements() {
  const payload = await requestJson(
    "/announcements/today",
    { method: "GET" },
    configuredBase
  );
  return normalizeItems(payload);
}

export async function markAnnouncementRead(id) {
  if (id === null || id === undefined || id === "") return null;
  return requestJson(
    `/announcements/${encodeURIComponent(id)}/read`,
    { method: "POST" },
    configuredBase
  );
}

