/** Business records actually consumed by the modular customer and shipment templates. */
export interface CustomerRecord {
  id: string | number;
  username: string;
  displayName?: string;
  clientCode?: string;
  partyRole?: string;
  status?: string;
  responsibleAgentDisplayName?: string;
  overseaAgentDisplayName?: string;
  shipmentCount?: number;
  remark?: string;
  contactEmail?: string | null;
  createdAt?: string | null;
}

export interface AgentRecord {
  id: string | number;
  username?: string;
  displayName?: string;
  status?: string;
}

export interface ShipmentRecord {
  shipmentId: string;
  referenceNo?: string;
  referenceType?: string;
  carrier?: string;
  trackingStatus?: string;
  publicationStatus?: string;
  assignedAt?: string | null;
  updatedAt?: string | null;
}

export interface ShipmentBusinessFieldRow {
  shipmentId: string;
  referenceNo: string;
  carrier: string;
  forwarderJobNumber: string;
  clientPoNumber: string;
  clientNameCode: string;
}

export interface CustomerCredentialRow {
  rowNumber?: number;
  username: string;
  displayName?: string;
  customerCode?: string;
  clientCode?: string;
  password?: string;
  status: string;
  message?: string;
}

export interface CustomerImportIssue {
  code: string;
  value?: string;
  max?: number;
}

export type CustomerImportPreview = Omit<
  ReturnType<typeof import("../services/customerExcelImport.js").validateCustomerImportRows>,
  "globalErrors"
> & { globalErrors: CustomerImportIssue[] };

/** Blank progress has no timer/circuit metadata until a server task arrives. */
export type BatchProgress = {
  total: number;
  done: number;
  succeeded: number;
  partial: number;
  manual: number;
  failed: number;
  pending: number;
  status: string;
  startedAt?: string | null;
  finishedAt?: string | null;
  elapsedMs?: number;
  elapsedObservedAt?: number;
  ignoredDuplicateCount?: number;
  stopReason?: string;
  stopMessage?: string;
  circuitFailureCount?: number;
  circuitFailureThreshold?: number;
  circuitErrorCode?: string;
  nextAttemptAt?: string | null;
};
