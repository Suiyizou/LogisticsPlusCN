import { businessModules, validateModules } from "./registry.js";
import { createPublicServiceRoutes } from "../public/routes.js";

// Canonicalize legacy inline-import links before mounting the cargo-list page.
export function canonicalSmartImportLocation(to) {
  if (to.path !== "/planner/cargos" || to.query.import !== "smart") return;
  const query = { ...to.query };
  delete query.import;
  return { path: "/smart-import/excel", query, hash: to.hash, replace: true };
}

// Components are supplied by the composition root, so the registry can be tested without a browser.
export function createApplicationRoutes(
  views,
  modules = businessModules,
  { businessPath = "/customers" } = {}
) {
  if (
    !/^\/[a-z][a-z0-9-]*$/.test(businessPath) ||
    [
      "/admin",
      "/customer-workspace",
      "/workbenches",
      "/operations",
      "/home",
      "/planner",
      "/containers",
      "/algorithm",
      "/excel",
      "/smart-import"
    ].includes(businessPath)
  )
    throw Error(`Invalid business workspace path: ${businessPath}`);
  validateModules(modules);
  for (const name of [
    "planner",
    "operations",
    "workbenches",
    "admin",
    "business",
    "legacyBusiness"
  ])
    if (!views[name]) throw Error(`Missing application view: ${name}`);
  const businessPages = modules
    .filter((module) => module.enabled !== false && (module.surface || "business") === "business")
    .flatMap((module) =>
      module.pages.map((page) => {
        if (page.view && !views[page.view]) throw Error(`Missing module view: ${page.view}`);
        return {
          path: [module.mount, page.path].filter(Boolean).join("/"),
          name: page.name,
          ...(page.name === "business-shipment-tasks"
            ? { alias: "/workspace/tracking/tasks" }
            : {}),
          component: views[page.view || "legacyBusiness"],
          meta: {
            surface: "operations",
            workspace: "business",
            moduleId: module.id,
            section: module.id,
            roles: page.name === "business-shipment-tasks" ? ["ADMIN", "BUSINESS"] : module.roles,
            titleKey:
              page.name === "business-shipment-tasks"
                ? "customers.trackingTaskList"
                : module.labelKey,
            selection: page.selection || ""
          }
        };
      })
    );
  const surfacePages = (surface) =>
    modules
      .filter((module) => module.enabled !== false && module.surface === surface)
      .flatMap((module) =>
        module.pages.map((page) => {
          if (!page.view || !views[page.view]) throw Error(`Missing module view: ${page.view}`);
          return {
            path: [module.mount, page.path].filter(Boolean).join("/"),
            name: page.name,
            component: views[page.view],
            meta: {
              surface,
              workspace: surface,
              moduleId: module.id,
              moduleView: page.view,
              roles: module.roles,
              titleKey: module.labelKey
            }
          };
        })
      );
  const customerPages = surfacePages("customer");
  if (customerPages.length && !views.customer) throw Error("Missing customer surface host");
  const routes = [
    ...createPublicServiceRoutes(),
    { path: "/", name: "landing", component: views.planner, meta: { surface: "public" } },
    ...(customerPages.length
      ? [
          {
            path: "/customer-workspace",
            name: "customer-workspace",
            component: views.customer,
            redirect: { name: customerPages[0].name },
            meta: { surface: "customer", roles: ["CUSTOMER"] },
            children: customerPages
          }
        ]
      : []),
    {
      path: "/operations",
      component: views.operations,
      redirect: "/workbenches",
      meta: { surface: "operations" },
      children: [
        ...[
          ["/home", "home"],
          ["/planner/config", "planner-config"],
          ["/planner/cargos", "planner-cargos"],
          ["/planner/results", "planner-results"],
          ["/smart-import/excel", "planner-import-excel"],
          ["/smart-import/image", "planner-import-image"],
          ["/smart-import/text", "planner-import-text"],
          ["/containers", "containers"],
          ["/algorithm", "algorithm"]
        ].map(([path, name]) => ({
          path,
          name,
          component: views.planner,
          ...(name === "planner-cargos" ? { beforeEnter: canonicalSmartImportLocation } : {}),
          meta: { surface: "planner" }
        })),
        { path: "/planner", redirect: "/planner/cargos" },
        ...["/excel", "/smart-import"].map((path) => ({
          path,
          redirect: (to) => ({
            path: "/smart-import/excel",
            query: { ...to.query },
            hash: to.hash
          })
        })),
        ...["overview", "query"].map((view) => ({
          path: `/workspace/tracking/${view}`,
          name: `tracking-${view}`,
          component: { render: () => null },
          meta: { workspace: "tracking", trackingView: view }
        })),
        { path: "/workbenches", name: "workbenches", component: views.workbenches },
        {
          path: "/admin",
          name: "admin",
          component: views.admin,
          meta: { roles: ["ADMIN"] },
          children: surfacePages("admin")
        },
        {
          path: businessPath,
          ...(businessPath === "/customers" ? {} : { alias: "/customers" }),
          name: "customers",
          component: views.business,
          meta: { workspace: "business", roles: ["ADMIN", "BUSINESS", "OVERSEA_AGENT"] },
          children: businessPages
        }
      ]
    },
    { path: "/:pathMatch(.*)*", redirect: "/workbenches" }
  ];
  // Check the actual assembled tree, including host pages and parent layouts.
  // Vue Router otherwise silently replaces an existing route with the same name.
  const names = new Set();
  function validateRouteNames(records) {
    for (const record of records) {
      if (record.name) {
        if (names.has(record.name)) throw Error(`Duplicate application route name: ${record.name}`);
        names.add(record.name);
      }
      if (record.children) validateRouteNames(record.children);
    }
  }
  validateRouteNames(routes);
  return routes;
}
