import type { AdminWorkflowPorts } from "./adminWorkflows";
export type AdminBusinessId = string | number;
export interface AdminBusinessUser {
  id?: AdminBusinessId | null;
  username?: string | null;
  displayName?: string | null;
  clientCode?: string | null;
  accountRole?: string;
  bindingRole?: string;
  role?: string;
}
export interface AdminPlatformCustomer {
  customerId: AdminBusinessId;
  customerUsername?: string | null;
  customerDisplayName?: string | null;
  clientCode?: string | null;
  partyRole?: string | null;
  customerStatus?: string;
  businessUserId?: AdminBusinessId | null;
  businessUsername?: string | null;
  businessDisplayName?: string | null;
  agentUserId?: AdminBusinessId | null;
  agentUsername?: string | null;
  agentDisplayName?: string | null;
  agentStatus?: string;
  shipmentCount?: number;
}
export interface AdminPlatformInfo {
  items?: AdminPlatformCustomer[];
  total?: number;
  customerCount?: number;
  assignedCustomerCount?: number;
  unassignedCustomerCount?: number;
}
export interface AdminTicket {
  shipmentId?: AdminBusinessId;
  referenceNo?: string;
  referenceType?: string;
  carrier?: string;
  trackingStatus?: string;
  clientNo?: string;
  clientNameCode?: string;
  clientCode?: string;
  clientName?: string;
  customerDisplayName?: string;
  responsibleAgentDisplayName?: string;
  businessDisplayName?: string;
  responsibleAgentUsername?: string;
  businessUsername?: string;
  boundCustomers?: AdminBusinessUser[];
  participants?: AdminBusinessUser[];
  boundUsers?: AdminBusinessUser[];
  lastTrackedAt?: string | null;
  updatedAt?: string | null;
}
export interface AdminHandover {
  requestId: AdminBusinessId;
  status?: string;
  reason?: string;
  customerCount?: number;
  shipmentCount?: number;
  customers?: AdminBusinessUser[];
  sourceBusinessUser?: AdminBusinessUser;
  targetBusinessUser?: AdminBusinessUser;
  sourceBusinessUserId?: AdminBusinessId | null;
  targetBusinessUserId?: AdminBusinessId | null;
  sourceBusinessUserName?: string | null;
  targetBusinessUserName?: string | null;
  requestedBy?: AdminBusinessUser;
  requestedByUserName?: string | null;
  reviewedBy?: AdminBusinessUser | null;
  reviewComment?: string | null;
  requestedAt?: string | null;
  reviewedAt?: string | null;
  updatedAt?: string | null;
}
export interface AdminBusinessListPorts extends AdminWorkflowPorts {
  services: {
    fetchPlatformInfo: (options: { page: number; size: number }) => Promise<AdminPlatformInfo>;
    fetchCustomerHandovers: (options: {
      page: number;
      size: number;
      status: string;
    }) => Promise<{ items?: AdminHandover[]; total?: number }>;
    fetchAvailableBusinessShipments: (options: {
      page: number;
      pageSize: number;
    }) => Promise<{ items?: unknown[]; total?: number; page?: number; pageSize?: number }>;
    deletePlatformCustomer: (id: AdminBusinessId) => Promise<unknown>;
  };
  confirmDelete: (customer: Readonly<AdminPlatformCustomer>) => Promise<boolean>;
  afterCustomerDeleted: (isCurrent: () => boolean) => Promise<void>;
  copy: AdminBusinessCopy;
}
export type AdminBusinessWorkflow = ReturnType<
  typeof import("../features/admin/useAdminBusinessLists.js").useAdminBusinessLists
>;
export type AdminBusinessCopy = ReturnType<
  typeof import("../features/admin/adminBusinessCopy.js").createAdminBusinessCopy
>;
export type AdminBusinessPresentation = ReturnType<
  typeof import("../features/admin/adminBusinessPresentation.js").createAdminBusinessPresentation
>;
