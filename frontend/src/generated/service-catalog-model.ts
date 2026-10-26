import type { components } from "./platform-api";
export const fields = [
  {
    name: "code",
    type: "string",
    required: true,
    maxLength: 64
  },
  {
    name: "name",
    type: "string",
    required: true,
    maxLength: 160
  },
  {
    name: "description",
    type: "text",
    required: false,
    maxLength: 4000
  },
  {
    name: "enabled",
    type: "boolean",
    required: true
  }
] as const;
export const defaults = {
  code: "",
  name: "",
  description: null,
  enabled: true
} satisfies components["schemas"]["ServiceCatalogWrite"];
