import type { ComponentPublicInstance, Ref } from "vue";
import type { CustomerRecord, ShipmentRecord } from "./businessRecords";
import type { TableSelectionHandle } from "./workspace";
import type {
  BoundUser,
  DisplayDate,
  PresentationShipment,
  WorkspacePresentation
} from "./workspacePresentation";
import type { useCustomerOperations } from "../modules/workspace/useCustomerOperations.js";
import type { useShipmentOperations } from "../modules/workspace/useShipmentOperations.js";
import type { useCustomerShipmentAccess } from "../modules/customers/useCustomerShipmentAccess.js";
import type { useShipmentCustomerBindings } from "../modules/shipments/useShipmentCustomerBindings.js";
import type { useTablePageTransition } from "../features/tables/useTablePageTransition.js";

/** These depend only on workflow producers, never on a page factory (no ReturnType cycle). */
export type CustomerOperationsPort = ReturnType<typeof useCustomerOperations>;
export type ShipmentOperationsPort = ReturnType<typeof useShipmentOperations>;
export type BusinessId = CustomerRecord["id"];
export type ReadableRef<T> = Readonly<Ref<T>>;
export type PageViewPort = Ref<string>;
export type DateValue = DisplayDate;
export type TagTone = "success" | "primary" | "warning" | "info" | "danger";
export type CommandResult = void | boolean | Promise<void | boolean>;
export type TableTransitionPort = Pick<
  ReturnType<typeof useTablePageTransition>,
  "tablePageTransitioning"
>;

/** Vue function refs also receive component public instances and null on unmount. */
export type TableRefTarget<Row = CustomerRecord | ShipmentRecord> =
  Element | ComponentPublicInstance | TableSelectionHandle<Row> | null;
export type FileInputRefTarget = Element | ComponentPublicInstance | null;

export type ShipmentPresentationRecord = ShipmentRecord &
  PresentationShipment & {
    bookingNumber?: string;
    manualSupplementRequired?: boolean;
    clientNo?: string;
    clientNameCode?: string;
    clientName?: string;
  };

export type BoundUserPresentation = Omit<BoundUser, "name"> & {
  name: string | number;
};

export type CommonFormattersPort = Pick<
  WorkspacePresentation,
  | "formatDateTime"
  | "formatDate"
  | "partyRoleLabel"
  | "statusLabel"
  | "referenceTypeLabel"
  | "customerFilterOptionLabel"
>;

export interface CustomerFormattersPort extends Pick<
  CommonFormattersPort,
  "formatDateTime" | "formatDate" | "partyRoleLabel" | "statusLabel" | "referenceTypeLabel"
> {
  customerInitial: (customer: CustomerRecord) => string;
  boundRoleSummary: (shipment: ShipmentPresentationRecord | null | undefined) => string;
  needsManualSupplement: (shipment: ShipmentPresentationRecord | null | undefined) => boolean;
}

export interface ShipmentFormattersPort extends Pick<
  CommonFormattersPort,
  "formatDateTime" | "customerFilterOptionLabel" | "referenceTypeLabel" | "partyRoleLabel"
> {
  shipmentClientLabel: (shipment: ShipmentPresentationRecord | null | undefined) => string;
  shipmentBoundUsers: (
    shipment: ShipmentPresentationRecord | null | undefined
  ) => BoundUserPresentation[];
  boundUserLabel: (user: BoundUserPresentation) => string;
  hasRefreshIssue: (shipment: ShipmentPresentationRecord | null | undefined) => boolean;
  refreshOutcomeTooltip: (shipment: ShipmentPresentationRecord | null | undefined) => string;
  shipmentBusinessStateTagType: (
    shipment: ShipmentPresentationRecord | null | undefined
  ) => TagTone;
  shipmentBusinessStateLabel: (shipment: ShipmentPresentationRecord | null | undefined) => string;
  selectedCustomerOptionLabel: (id: BusinessId | null | undefined) => string;
  getCustomerName: (id: BusinessId) => string;
  getCustomerUsername: (id: BusinessId) => string;
  isCustomerBoundToSelectedShipment: (id: BusinessId) => boolean;
}

export type AgentFormattersPort = Pick<CommonFormattersPort, "statusLabel">;
export type HandoverFormattersPort = Pick<
  CommonFormattersPort,
  "customerFilterOptionLabel" | "formatDateTime" | "statusLabel"
>;

export type BusinessSection =
  "overview" | "customers" | "shipments" | "agents" | "handover" | "batch-tracking";
export interface CustomerActionsPort {
  selectCustomerFromList: (customer: CustomerRecord) => CommandResult;
  navigateTo: (section: BusinessSection) => CommandResult;
  openShipmentDetail: (shipment: ShipmentRecord) => CommandResult;
  openShipmentSupplement: (shipment: ShipmentRecord) => CommandResult;
}
export interface ShipmentActionsPort {
  trackShipmentInWorkspace: (shipment: ShipmentRecord) => CommandResult;
  editShipment: (shipment: ShipmentRecord) => CommandResult;
  navigateTo: (section: BusinessSection) => CommandResult;
  openTrackingWorkspace: (shipment?: ShipmentRecord | null) => CommandResult;
}

/** Preserve workflow-owned scalar refs; narrow the untyped service-backed collections and row commands. */
type CustomerShipmentAccess = ReturnType<typeof useCustomerShipmentAccess>;
export type CustomerBindingsPort = Omit<
  CustomerShipmentAccess,
  | "selectedCandidateShipmentIds"
  | "draftShipments"
  | "unboundAvailableShipments"
  | "bindShipment"
  | "quickBindShipment"
  | "batchBindSelectedShipments"
  | "unbindShipment"
  | "toggleCandidateShipment"
  | "togglePublication"
  | "publishAllDraftShipments"
> & {
  selectedCandidateShipmentIds: Ref<string[]>;
  draftShipments: ReadableRef<ShipmentPresentationRecord[]>;
  unboundAvailableShipments: ReadableRef<ShipmentPresentationRecord[]>;
  bindShipment: () => CommandResult;
  quickBindShipment: (shipment: ShipmentRecord) => CommandResult;
  batchBindSelectedShipments: () => CommandResult;
  unbindShipment: (shipment: ShipmentRecord) => CommandResult;
  toggleCandidateShipment: (id: string, checked: boolean) => void;
  togglePublication: (shipment: ShipmentRecord) => CommandResult;
  publishAllDraftShipments: () => CommandResult;
};

type ShipmentCustomerBindings = ReturnType<typeof useShipmentCustomerBindings>;
export type ShipmentBindingsPort = Omit<
  ShipmentCustomerBindings,
  | "selectedCustomerIds"
  | "boundCustomersForSelectedShipment"
  | "batchBindCustomers"
  | "unbindCustomerFromShipment"
> & {
  selectedCustomerIds: Ref<BusinessId[]>;
  boundCustomersForSelectedShipment: ReadableRef<BusinessId[]>;
  batchBindCustomers: () => Promise<boolean>;
  unbindCustomerFromShipment: (id: BusinessId) => Promise<boolean>;
};

export interface CustomerShipmentOperationsPort {
  entry: Pick<ShipmentOperationsPort["entry"], "entryBusy" | "openShipmentCreateDialog">;
  list: Pick<
    ShipmentOperationsPort["list"],
    | "loadingAvailableShipments"
    | "shipmentPage"
    | "shipmentPageSize"
    | "shipmentTotal"
    | "changeShipmentPage"
    | "loadAvailableShipments"
  >;
}

export interface CustomerModulePorts {
  operations: CustomerOperationsPort;
  shipmentOperations: CustomerShipmentOperationsPort;
  bindings: CustomerBindingsPort;
  view: PageViewPort;
  permissions: { isManager: ReadableRef<boolean> };
  ui: TableTransitionPort;
  actions: CustomerActionsPort;
  formatters: CustomerFormattersPort;
}
export interface ShipmentModulePorts {
  operations: ShipmentOperationsPort;
  directory: Pick<
    CustomerOperationsPort["workspace"]["directory"],
    "customers" | "assignableCustomers"
  >;
  view: PageViewPort;
  permissions: { isManager: ReadableRef<boolean>; isOverseaAgent: ReadableRef<boolean> };
  bindings: ShipmentBindingsPort;
  ui: TableTransitionPort;
  actions: ShipmentActionsPort;
  formatters: ShipmentFormattersPort;
}
export interface AgentModulePorts {
  operations: CustomerOperationsPort;
  formatters: AgentFormattersPort;
  ui: TableTransitionPort;
}
export interface HandoverModulePorts {
  operations: CustomerOperationsPort;
  permissions: {
    canRequestBusinessHandover: ReadableRef<boolean>;
    isOverseaAgent: ReadableRef<boolean>;
  };
  formatters: HandoverFormattersPort;
}
