// @ts-check
/** @type {import("../../types/moduleRegistry").BusinessModuleRegistration} */
export const __CAMEL__Registration = {
  module: {
    id: "__ID__",
    mount: "__ID__",
    labelKey: "__CAMEL__.title",
    icon: "Document",
    surface: __SURFACE__,
    navigation: __NAVIGATION__,
    roles: [__ROLES__],
    pages: [{ name: "business-__ID__", path: "", view: "__CAMEL__" }]
  },
  views: { __CAMEL__: () => import("./pages/__NAME__Page.vue") }
};
