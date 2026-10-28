import { chartToken } from "../../features/overview/chartTheme.js";
import { localDateKey } from "../../features/shared/businessDates.js";

const palette = {
  blue: "--color-primary",
  amber: "--color-accent",
  green: "--color-success",
  purple: "--color-warning",
  cyan: "--color-quiet"
};
const array = (value) =>
  Array.isArray(value) ? value.filter((item) => item && typeof item === "object") : [];
function count(value, fallback = 0) {
  if (value === null || value === undefined || value === "" || typeof value === "boolean")
    return fallback;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : fallback;
}
function meaningfulUpdate(item) {
  if (!item.updatedAt) return false;
  if (!item.createdAt) return true;
  const difference = new Date(item.updatedAt).getTime() - new Date(item.createdAt).getTime();
  return Number.isFinite(difference) && difference > 1000;
}
// Server statistics remain authoritative; fallback covers cached visible records only.
// Dates and numbers are sanitized here before reaching Intl/ECharts.
export function buildOverviewModel({
  stats = null,
  snapshot = {},
  t,
  locale = "zh-CN",
  now = new Date()
}) {
  const shipments = array(snapshot.shipments),
    customers = array(snapshot.customers),
    agents = array(snapshot.agents);
  const todayKey = localDateKey(now);
  const today = (value) => Boolean(todayKey) && localDateKey(value) === todayKey;
  const relatedCount = (item, direct, sources, timestamp) => {
    const rows = sources.map((key) => item[key]).find(Array.isArray) || [];
    return count(direct, rows.filter((row) => row && today(timestamp(row))).length);
  };
  const definitions = [
    [
      "created",
      "blue",
      "CirclePlusFilled",
      "todayNewBusiness",
      "todayNewBusinessHint",
      "newShipments",
      shipments.filter((item) => today(item.createdAt)).length
    ],
    [
      "updated",
      "amber",
      "RefreshRight",
      "todayUpdatedBusiness",
      "todayUpdatedBusinessHint",
      "updatedShipments",
      shipments.filter((item) => meaningfulUpdate(item) && today(item.updatedAt)).length
    ],
    [
      "files",
      "green",
      "FolderOpened",
      "todayFiles",
      "todayFilesHint",
      "followUpFiles",
      shipments.reduce(
        (sum, item) =>
          sum +
          relatedCount(
            item,
            item.todayFileCount,
            ["files"],
            (row) => row.uploadedAt || row.createdAt
          ),
        0
      )
    ],
    [
      "messages",
      "purple",
      "ChatDotRound",
      "todayMessages",
      "todayMessagesHint",
      "messages",
      shipments.reduce(
        (sum, item) =>
          sum +
          relatedCount(
            item,
            item.todayMessageCount ?? item.todayCommentCount,
            ["messages", "comments"],
            (row) => row.createdAt
          ),
        0
      )
    ],
    [
      "logins",
      "cyan",
      "UserFilled",
      "todayCustomerLogins",
      "todayCustomerLoginsHint",
      "customerLogins",
      customers.filter((item) => today(item.lastLoginAt || item.lastLogin)).length
    ]
  ];
  const kpis = definitions.map(([key, tone, icon, label, hint, field, fallback]) => ({
    key,
    tone,
    icon,
    label: t(`customers.${label}`),
    hint: t(`customers.${hint}`),
    value: count(stats?.[field], fallback)
  }));
  let formatter;
  try {
    formatter = new Intl.DateTimeFormat(locale, { month: "numeric", day: "numeric" });
  } catch {
    formatter = new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric" });
  }
  let trend;
  if (Array.isArray(stats?.dailyTrend)) {
    trend = array(stats.dailyTrend)
      .filter((day) => {
        const key = String(day.date || "");
        return /^\d{4}-\d{2}-\d{2}$/.test(key) && localDateKey(`${key}T00:00:00`) === key;
      })
      .map((day) => ({
        key: day.date,
        label: formatter.format(new Date(`${day.date}T00:00:00`)),
        created: count(day.created),
        updated: count(day.updated)
      }))
      .sort((a, b) => a.key.localeCompare(b.key));
  } else {
    trend = Array.from({ length: 7 }, (_, index) => {
      const date = new Date(now);
      date.setHours(0, 0, 0, 0);
      date.setDate(date.getDate() - 6 + index);
      const key = localDateKey(date);
      return {
        key,
        label: formatter.format(date),
        created: shipments.filter((item) => localDateKey(item.createdAt) === key).length,
        updated: shipments.filter(
          (item) => meaningfulUpdate(item) && localDateKey(item.updatedAt) === key
        ).length
      };
    });
  }
  const statusCounts = new Map();
  const unknown = t("customers.overviewUnknownStatus");
  if (Array.isArray(stats?.shipmentStatusDistribution)) {
    for (const item of array(stats.shipmentStatusDistribution)) {
      const raw = String(item.name || item.status || "").trim();
      const name = !raw || raw === "UNKNOWN" ? unknown : raw;
      statusCounts.set(name, (statusCounts.get(name) || 0) + count(item.value ?? item.count));
    }
  } else {
    for (const item of shipments) {
      const name = String(item.trackingStatus || "").trim() || unknown;
      statusCounts.set(name, (statusCounts.get(name) || 0) + 1);
    }
  }
  const resources = [
    ["directoryTitle", "customerTotal", customers.length],
    ["tabShipmentManagement", "shipmentTotal", count(snapshot.shipmentTotal, shipments.length)],
    [
      "overseaAgentManagement",
      "activeAgentCount",
      agents.filter((item) => item.status === "ACTIVE").length
    ],
    [
      "activeCustomers",
      "activeCustomerCount",
      customers.filter((item) => item.status === "ACTIVE").length
    ]
  ].map(([key, field, fallback]) => ({
    name: t(`customers.${key}`),
    value: count(stats?.[field], fallback)
  }));
  return {
    kpis,
    trend,
    resources,
    today: kpis.map((item) => ({
      name: item.label,
      value: item.value,
      itemStyle: { color: chartToken(palette[item.tone]) }
    })),
    status: Array.from(statusCounts, ([name, value]) => ({ name, value })).sort(
      (a, b) => b.value - a.value
    )
  };
}
