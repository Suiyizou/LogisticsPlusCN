import type { CustomerRecord, ShipmentRecord } from "./businessRecords";

export type RecordId = string | number;
export type DisplayDate = string | number | Date | null | undefined;
export type WorkspaceTagType = "success" | "warning" | "info" | "danger";

export interface PresentationCustomer extends Partial<CustomerRecord> {
  name?: string;
  clientName?: string;
  relationshipRole?: string;
  role?: string;
}

export interface BoundUser extends PresentationCustomer {
  name: string;
  role: string;
}

export type BoundUserLabelInput = Omit<Partial<BoundUser>, "name"> & { name?: string | number };

export interface PresentationShipment extends Partial<ShipmentRecord> {
  businessState?: string;
  hasValidTracking?: boolean;
  sourceChannel?: string;
  lastTrackedAt?: string | null;
  lastRefreshResult?: string;
  lastRefreshErrorCode?: string;
  lastRefreshError?: string;
  lastRefreshAttempts?: number;
  lastRefreshProxyAttempts?: number;
  lastRefreshAt?: string | null;
  boundRoles?: string[];
  boundUsers?: PresentationCustomer[];
  participants?: PresentationCustomer[];
  boundCustomers?: (PresentationCustomer | string)[];
}

export interface PresentationDirectory {
  customers: PresentationCustomer[];
  assignableCustomers: PresentationCustomer[];
  shipmentCustomerMap?: Record<string, RecordId[]>;
}

export interface WorkspacePresentationInputs {
  t: (key: string, values?: Record<string, string | number>) => string;
  getLocale: () => string;
  readDirectory: () => PresentationDirectory;
  getBoundCustomerIds: () => RecordId[];
}

export interface WorkspacePresentation {
  formatDateTime: (value: DisplayDate) => string;
  formatDate: (value: DisplayDate) => string;
  customerFilterOptionLabel: (customer: PresentationCustomer | null | undefined) => string;
  selectedCustomerOptionLabel: (id: RecordId | null | undefined) => string;
  partyRoleLabel: (role: string | null | undefined) => string;
  boundUserLabel: (user: BoundUserLabelInput | null | undefined) => string;
  shipmentBusinessStateLabel: (shipment: PresentationShipment | null | undefined) => string;
  shipmentBusinessStateTagType: (
    shipment: PresentationShipment | null | undefined
  ) => WorkspaceTagType;
  refreshOutcomeTooltip: (shipment: PresentationShipment | null | undefined) => string;
  getCustomerName: (id: RecordId) => string;
  getCustomerUsername: (id: RecordId) => string;
  isCustomerBoundToSelectedShipment: (id: RecordId) => boolean;
  primaryBoundCustomerName: (shipment: PresentationShipment | null | undefined) => string;
  shipmentBoundUsers: (shipment: PresentationShipment | null | undefined) => BoundUser[];
  boundRoleSummary: (shipment: PresentationShipment | null | undefined) => string;
  customerInitial: (customer: PresentationCustomer | null | undefined) => string;
  statusLabel: (status: string | null | undefined) => string;
  referenceTypeLabel: (type: string | null | undefined) => string;
}
