import type { AdminWorkflowPorts } from "./adminWorkflows";

export interface AdminWorkspaceFile {
  id: string | number;
  originalFileName?: string;
  expired?: boolean;
  ownerDisplayName?: string;
  userId?: string | number | null;
  source?: string;
  sizeBytes?: number;
  uploadedAt?: string | null;
  expiresAt?: string | null;
}

export interface AdminShipmentFile {
  id?: string | number;
  publicId?: string;
  originalFileName?: string;
  fileName?: string;
  status?: string;
  deletedAt?: string | null;
  shipmentPublicId?: string | number | null;
  shipmentId?: string | number | null;
  shipmentReference?: string | AdminFileReference;
  reference?: string | AdminFileReference;
  referenceNo?: string;
  referenceType?: string;
  shipment?: {
    publicId?: string | number | null;
    primaryReference?: string | AdminFileReference;
    referenceType?: string;
    referenceNo?: string;
  };
  uploaderDisplayName?: string;
  ownerDisplayName?: string;
  uploadedBy?: string;
  uploaderRole?: string;
  uploaderRoleSnapshot?: string;
  uploaderUserId?: string | number | null;
  userId?: string | number | null;
  uploader?: { displayName?: string; role?: string; id?: string | number | null };
  documentCategory?: string;
  category?: string;
  contentType?: string;
  visibility?: string;
  sizeBytes?: number;
  uploadedAt?: string | null;
  createdAt?: string | null;
}

export interface AdminFileReference {
  referenceType?: string;
  type?: string;
  referenceNo?: string;
  normalizedReferenceNo?: string;
  number?: string;
}

export interface AdminFilePresentationPorts {
  t: AdminWorkflowPorts["t"];
  roleText: (role: string) => string;
  formatDate: (value?: string | null) => string;
}
export type AdminFilePresentation = ReturnType<
  typeof import("../features/admin/adminFilePresentation.js").createAdminFilePresentation
>;

export interface AdminFilePage<T> {
  items?: T[];
  total?: number;
}

export interface AdminFileServices {
  fetchWorkspaceFiles: (options: {
    page: number;
    size: number;
    includeExpired: boolean;
  }) => Promise<AdminFilePage<AdminWorkspaceFile>>;
  fetchShipmentFiles: (options: {
    page: number;
    size: number;
    includeDeleted: boolean;
  }) => Promise<AdminFilePage<AdminShipmentFile>>;
  downloadWorkspaceFile: (id: string | number, name: string) => Promise<void>;
  downloadShipmentFile: (id: string | number, name: string) => Promise<void>;
  deleteShipmentFile: (id: string | number) => Promise<unknown>;
}

export interface AdminFilePorts extends AdminWorkflowPorts {
  services: AdminFileServices;
  confirmDelete: (file: Readonly<AdminShipmentFile>) => Promise<boolean>;
  onDeleted: (id: string | number) => void;
}

export interface AdminFilePreviewPorts {
  currentUser: AdminWorkflowPorts["currentUser"];
  fetchBlob: (id: string | number) => Promise<Blob>;
  createObjectUrl: (blob: Blob) => string;
  revokeObjectUrl: (url: string) => void;
  t: AdminWorkflowPorts["t"];
  handled: (error: unknown) => void;
}

export type AdminFilePreviewKind = "" | "pdf" | "image" | "text" | "fallback";
export interface AdminFilePreviewState {
  open: boolean;
  kind: AdminFilePreviewKind;
  name: string;
  url: string;
  text: string;
  message: string;
  isError: boolean;
}
export type AdminFilePreview = ReturnType<
  typeof import("../features/admin/useAdminFilePreview.js").useAdminFilePreview
>;
