import type { Ref, ComputedRef } from "vue";
import type { CustomerRecord } from "./businessRecords";

export type FeatureTranslator = (key: string, values?: Record<string, string | number>) => string;
export interface ManualRouteNode {
  key: string;
  locationType: string;
  city: string;
  countryCode: string;
  facilityCode: string;
  event: string;
  estimatedTime: string;
  actualTime: string;
  timezone: string;
  required: boolean;
  optional: boolean;
}
export interface ManualRoutingLeg {
  key: string;
  mode: string;
  vesselName: string;
  service: string;
  voyage: string;
  loadPort: string;
  loadCountryCode: string;
  dischargePort: string;
  dischargeCountryCode: string;
  estimatedDeparture: string;
  actualDeparture: string;
  estimatedArrival: string;
  actualArrival: string;
  masterBill: string;
}
export interface ManualContainer {
  key: string;
  number: string;
  type: string;
  transportMode: string;
  trafficTerm: string;
  currentLocation: string;
  latestEvent: string;
  latestEventTime: string;
}
export interface ManualContainerType {
  key: string;
  type: string;
  quantity: number;
}
export type ManualShipmentForm = Omit<
  ReturnType<
    typeof import("../features/shipments/manualShipmentEntryModel.js").createManualShipmentEntryModel
  >["shipmentCreateForm"],
  "routingLegs" | "containers" | "routeNodes" | "containerTypes"
> & {
  routingLegs: ManualRoutingLeg[];
  containers: ManualContainer[];
  routeNodes: ManualRouteNode[];
  containerTypes: ManualContainerType[];
};
interface ShipmentEntryCommon {
  entryBusy: boolean;
  assignableCustomers: CustomerRecord[];
  customerFilterOptionLabel: (customer: CustomerRecord) => string;
  selectedCustomerOptionLabel: (value: unknown) => string;
}
export interface ManualShipmentCreateWorkflow extends ShipmentEntryCommon {
  shipmentCreateDialogOpen: boolean;
  creatingShipment: boolean;
  shipmentCreateCustomerId: string | number;
  shipmentCreatePublishToCustomer: boolean;
  shipmentCreateForm: ManualShipmentForm;
  manualServiceOptions: { value: string; labelKey: string }[];
  manualRouteNodeLabel: (locationType: string) => string;
  closeShipmentCreateDialog: () => void;
  createShipment: () => Promise<unknown>;
  addManualTransshipment: () => void;
  removeManualRouteNode: (index: number) => void;
  addManualContainerType: () => void;
  addManualRoutingLeg: () => void;
  addManualContainer: () => void;
  removeManualListItem: (
    field: "containerTypes" | "routingLegs" | "containers",
    index: number
  ) => void;
}
export interface ShipmentImportPreviewRow {
  rowNumber: number;
  importKey: string;
  carrier: string;
  referenceType: string;
  referenceNo: string;
  errors: string[];
  warnings: string[];
}
export interface ShipmentImportProgress {
  total: number;
  done: number;
  succeeded: number;
  failed: number;
  skipped: number;
}
export interface ShipmentImportResult {
  importKey: string;
  carrier: string;
  referenceType: string;
  referenceNo: string;
  status: string;
  message: string;
}
export interface ManualShipmentImportWorkflow extends ShipmentEntryCommon {
  shipmentExcelImportDialogOpen: boolean;
  shipmentExcelImporting: boolean;
  shipmentExcelImportParsing: boolean;
  shipmentExcelImportDropzoneActive: boolean;
  shipmentExcelImportFileName: string;
  shipmentExcelCustomerId: string | number;
  shipmentExcelPublishToCustomer: boolean;
  canStartShipmentExcelImport: boolean;
  shipmentExcelImportPreview: {
    total: number;
    valid: number;
    invalid: number;
    warningCount: number;
    globalErrors: string[];
    rows: ShipmentImportPreviewRow[];
  };
  shipmentExcelImportProgress: ShipmentImportProgress;
  shipmentExcelImportResults: ShipmentImportResult[];
  closeShipmentExcelImport: () => void;
  downloadShipmentExcelTemplate: () => Promise<void>;
  downloadShipmentExcelImportResults: () => Promise<void>;
  handleShipmentExcelImportWorkbook: (event: Event) => Promise<void>;
  handleShipmentExcelImportDrop: (event: DragEvent) => Promise<void>;
  startShipmentExcelImport: () => Promise<unknown>;
  shipmentExcelRowClassName: (context: {
    row: ShipmentImportPreviewRow;
    rowIndex: number;
  }) => string;
}
export interface PersonalProfileWorkflow {
  personalProfileOpen: Ref<boolean>;
  personalProfileForm: { displayName: string };
  personalProfileError: Ref<string>;
  personalProfileSaving: Ref<boolean>;
  personalPasswordForm: { currentPassword: string; newPassword: string; confirmPassword: string };
  personalPasswordError: Ref<string>;
  personalPasswordSuccess: Ref<string>;
  personalPasswordSaving: Ref<boolean>;
  busy: ComputedRef<boolean>;
  beforeClose: (done: () => void) => void;
  closePersonalProfile: () => boolean;
  savePersonalProfile: () => Promise<boolean>;
  savePersonalPassword: () => Promise<boolean>;
}
export interface OverviewTrendDatum {
  label: string;
  created: number;
  updated: number;
}
export interface OverviewChartDatum {
  name: string;
  value: number;
  itemStyle?: { color: string };
}
