export interface AdminOverviewDatum {
  code: string;
  value?: number | null;
}
export interface AdminOverviewTrendDatum {
  date?: string | null;
  businessActions?: number | null;
  managementActions?: number | null;
}
export interface AdminOverviewData {
  totalUsers?: number | null;
  internalUserCount?: number | null;
  customerCount?: number | null;
  activeUsers?: number | null;
  onlineDeviceCount?: number | null;
  managementActions30d?: number | null;
  operationsToday?: number | null;
  activityTrend?: AdminOverviewTrendDatum[] | null;
  userComposition?: AdminOverviewDatum[] | null;
  accountStatus?: AdminOverviewDatum[] | null;
  operationTypes?: AdminOverviewDatum[] | null;
}
export interface AdminAuditRecord {
  id: string | number;
  userId?: string | number | null;
  username?: string | null;
  role?: string | null;
  createdAt?: string | null;
  action?: string | null;
  detail?: string | null;
  category?: string | null;
  targetType?: string | null;
  targetId?: string | number | null;
  ipAddress?: string | null;
}
export interface AdminOverviewCopy {
  [key: string]: string | Record<string, string>;
  totalUsers: string;
  totalUsersHint: string;
  activeUsers: string;
  activeUsersHint: string;
  onlineDevices: string;
  onlineDevicesHint: string;
  management30d: string;
  management30dHint: string;
  todayActivity: string;
  todayActivityHint: string;
  activityTrend: string;
  activityTrendHint: string;
  userComposition: string;
  accountStatus: string;
  operationTypes: string;
  operationTypesHint: string;
  businessActions: string;
  managementActions: string;
  businessCategory: string;
  managementCategory: string;
  active: string;
  disabled: string;
  noOperations: string;
  roles: Record<string, string>;
  actions: Record<string, string>;
  targets: Record<string, string>;
}
