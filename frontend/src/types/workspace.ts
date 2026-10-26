import type { Ref } from "vue";

/** Only the table operations used by workflows; no dependency on a UI component instance. */
export interface TableSelectionHandle<Row> {
  clearSelection: () => void;
  toggleRowSelection?: (row: Row, selected: boolean) => void;
}

export interface WorkspaceUser {
  id: string | number;
  username: string;
  role: string;
  displayName?: string;
  status?: string;
}

export interface WorkspaceContext {
  user: Readonly<Ref<Readonly<WorkspaceUser> | null>>;
  announcementCount: Readonly<Ref<number>>;
  logout: () => void | Promise<unknown>;
  updateUser: (user: WorkspaceUser) => void | Promise<unknown>;
  openAnnouncements: () => void | Promise<unknown>;
}
