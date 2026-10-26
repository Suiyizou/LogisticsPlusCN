import type { Component } from "vue";

export interface BusinessPageDefinition {
  name: string;
  path: string;
  view?: string;
  selection?: string;
}

export type ModuleSurface = "business" | "admin" | "customer";

export interface ModuleNavigation {
  group?: string;
  order?: number;
  hidden?: boolean;
}

export interface BusinessModuleDefinition {
  id: string;
  mount: string;
  surface?: ModuleSurface;
  navigation?: ModuleNavigation;
  icon?: string;
  labelKey: string;
  agentLabelKey?: string;
  roles: string[];
  enabled?: boolean;
  pages: BusinessPageDefinition[];
}

export type ModuleViewLoader = () => Promise<{ default: Component }>;
export type ModuleViews = Record<string, ModuleViewLoader>;

// Legacy route descriptors may omit a view; new modules must own a loader.
export interface RegisteredBusinessModuleDefinition extends BusinessModuleDefinition {
  pages: (BusinessPageDefinition & { view: string })[];
}

export interface BusinessModuleRegistration {
  module: RegisteredBusinessModuleDefinition;
  views: ModuleViews;
}
