import type { Ref } from "vue";
import type { WorkspaceUser } from "./workspace";

export interface AdminEmployee extends WorkspaceUser {
  partyRole?: string;
  lastLoginAt?: string | null;
}

export interface AdminEmployeeForm {
  username: string;
  displayName: string;
  password: string;
  passwordConfirm: string;
  role: string;
  partyRole: string;
  status: string;
}

export interface AdminEmployeePayload {
  username?: string;
  displayName: string;
  password?: string | null;
  role: string;
  partyRole: string;
  status: string;
}

export interface AdminFeedback {
  clear: () => void;
  success: (text: string) => void;
  error: (text: string, options?: { popup?: boolean }) => void | Promise<void>;
  handled: (error: unknown) => void;
}

export interface AdminWorkflowPorts {
  currentUser: Readonly<Ref<WorkspaceUser | null>>;
  isHostBusy: () => boolean;
  t: (key: string, params?: Record<string, string | number>) => string;
  translate: (text: string) => string;
  feedback: AdminFeedback;
}

export interface AdminAccountPorts extends AdminWorkflowPorts {
  services: {
    fetchEmployees: (options: {
      page: number;
      size: number;
    }) => Promise<{ items?: AdminEmployee[]; total?: number }>;
    createEmployee: (payload: AdminEmployeePayload) => Promise<AdminEmployee>;
    updateEmployee: (id: string | number, payload: AdminEmployeePayload) => Promise<AdminEmployee>;
    deleteEmployee: (id: string | number) => Promise<unknown>;
    resetEmployeePassword: (id: string | number) => Promise<{ temporaryPassword?: string }>;
  };
  confirmDelete: (employee: Readonly<AdminEmployee>) => Promise<boolean>;
  writeClipboard: (text: string) => Promise<void>;
  onUserUpdated: (user: AdminEmployee) => void;
}

export interface AdminLlmSettings {
  enabled?: boolean;
  baseUrl?: string;
  model?: string;
  provider?: string;
  apiKeyConfigured?: boolean;
  apiKeyPreview?: string;
}

export interface AdminLlmForm {
  enabled: boolean;
  baseUrl: string;
  model: string;
  apiKey: string;
  clearApiKey: boolean;
}

export interface AdminLlmPayload extends Omit<AdminLlmForm, "apiKey"> {
  apiKey?: string;
}

export interface AdminLlmPorts extends AdminWorkflowPorts {
  services: {
    fetchLlmSettings: () => Promise<AdminLlmSettings>;
    updateLlmSettings: (payload: AdminLlmPayload) => Promise<AdminLlmSettings>;
  };
}

export interface AdminDevice {
  id: string | number;
  userId?: string | number;
  username: string;
  displayName?: string | null;
  deviceId?: string | null;
  deviceName?: string | null;
  macAddress?: string | null;
  ipAddress?: string | null;
  online: boolean;
  loggedInAt?: string | null;
  lastSeenAt?: string | null;
}

export interface AdminDevicePorts extends AdminWorkflowPorts {
  services: {
    fetchDevices: (options: {
      page: number;
      size: number;
    }) => Promise<{ items?: AdminDevice[]; total?: number }>;
    kickDevice: (id: string | number) => Promise<unknown>;
    deleteDevice: (id: string | number) => Promise<unknown>;
  };
  confirmDelete: (device: Readonly<AdminDevice>) => Promise<boolean>;
}

export interface AdminAnnouncement {
  id: string | number;
  title: string;
  contentMarkdown: string;
  imageUrl?: string | null;
  illustrationRef?: string | null;
  audience?: string;
  visibility?: string;
  displayDate: string;
  status: string;
  updatedAt?: string | null;
  publishedAt?: string | null;
  createdAt?: string | null;
}

export interface AdminAnnouncementForm {
  title: string;
  contentMarkdown: string;
  imageUrl: string;
  illustrationRef: string;
  audience: string;
  displayDate: string;
}

// Updating content intentionally omits status: the backend retains publication state.
export interface AdminAnnouncementPayload extends Omit<
  AdminAnnouncementForm,
  "imageUrl" | "illustrationRef"
> {
  imageUrl: string | null;
  illustrationRef: string | null;
}

export interface AdminAnnouncementPorts extends AdminWorkflowPorts {
  services: {
    fetchAnnouncements: (options: {
      page: number;
      size: number;
    }) => Promise<{ items?: AdminAnnouncement[]; total?: number }>;
    createAnnouncement: (payload: AdminAnnouncementPayload) => Promise<AdminAnnouncement>;
    updateAnnouncement: (
      id: string | number,
      payload: AdminAnnouncementPayload
    ) => Promise<AdminAnnouncement>;
    publishAnnouncement: (id: string | number) => Promise<unknown>;
    disableAnnouncement: (id: string | number) => Promise<unknown>;
    deleteAnnouncement: (id: string | number) => Promise<unknown>;
    uploadImage: (
      file: File
    ) => Promise<{ url?: string; storagePath?: string; originalName?: string }>;
  };
  copy: () => Record<
    | "required"
    | "invalidImage"
    | "created"
    | "updated"
    | "publishedSuccess"
    | "disabledSuccess"
    | "deletedSuccess"
    | "uploadSuccess"
    | "uploadFailed",
    string
  >;
  today: () => string;
  safeUrl: (value: string) => string;
  confirmDelete: (record: Readonly<AdminAnnouncement>) => Promise<boolean>;
  editor: {
    opened: () => void;
    cleared: () => void;
    insertImage: (url: string, alt: string) => void;
  };
}

export type AdminAnnouncementWorkflow = ReturnType<
  typeof import("../features/admin/useAdminAnnouncements.js").useAdminAnnouncements
>;
export type AnnouncementPresentation = ReturnType<
  typeof import("../features/admin/announcementPresentation.js").createAnnouncementPresentation
>;
export type AnnouncementCopy =
  (typeof import("../features/admin/announcementCopy.js").ANNOUNCEMENT_COPY)["en-US"];

export interface AnnouncementEditorPorts {
  workflow: AdminAnnouncementWorkflow;
  presentation: AnnouncementPresentation;
  copy: () => AnnouncementCopy;
  getDocument: () => Document;
  prompt: (message: string, defaultValue: string) => string | null;
}

export type AdminAccountWorkflow = ReturnType<
  typeof import("../features/admin/useAdminAccounts.js").useAdminAccounts
>;

export type AdminLlmWorkflow = ReturnType<
  typeof import("../features/admin/useAdminLlmSettings.js").useAdminLlmSettings
>;
export interface AdminSystemMonitoring {
  deviceLimit?: number;
  serverTime?: string | null;
  runtime?: { totalRequests?: number; failedRequests?: number };
}
