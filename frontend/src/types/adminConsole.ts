import type { AdminWorkflowPorts, AdminSystemMonitoring } from "./adminWorkflows";
import type { WorkspaceUser } from "./workspace";
import type { AdminOverviewData, AdminAuditRecord } from "./adminOverviewTypes";
export interface AdminLoginResponse {
  user: WorkspaceUser;
  token?: string;
  expiresAt?: string;
}
export interface AdminConsolePorts extends AdminWorkflowPorts {
  services: {
    login: (username: string, password: string) => Promise<AdminLoginResponse>;
    fetchMe: () => Promise<WorkspaceUser>;
    fetchOverview: () => Promise<AdminOverviewData>;
    fetchMonitoring: () => Promise<AdminSystemMonitoring>;
    fetchAudit: (options: {
      page: number;
      size: number;
    }) => Promise<{ items?: AdminAuditRecord[]; total?: number }>;
  };
  commitLogin: (response: AdminLoginResponse) => void;
  clearSession: () => void;
  updateUser: (user: WorkspaceUser | null) => void;
  loggedOut: () => void;
  refreshOther: () => Promise<unknown>[];
  copy: () => { refreshed: string; partialFailure: string; loginSuccess: string; notAdmin: string };
}
export type AdminConsoleWorkflow = ReturnType<
  typeof import("../features/admin/useAdminConsole.js").useAdminConsole
>;
