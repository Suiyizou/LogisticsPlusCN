// @ts-check

/** @param {import("../types/moduleRegistry").BusinessModuleDefinition[]} modules */
export function validateModules(modules) {
  const ids = new Set(),
    names = new Set(),
    paths = new Set();
  for (const module of modules) {
    if (!module.id || ids.has(module.id))
      throw Error(`Duplicate or missing module ID: ${module.id}`);
    ids.add(module.id);
    if (module.surface !== undefined && !["business", "admin", "customer"].includes(module.surface))
      throw Error(`Invalid module surface: ${module.id}`);
    if (
      module.navigation !== undefined &&
      (!module.navigation ||
        typeof module.navigation !== "object" ||
        Array.isArray(module.navigation) ||
        (module.navigation.group !== undefined &&
          !/^[a-z][a-z0-9-]*$/.test(module.navigation.group)) ||
        (module.navigation.order !== undefined && !Number.isFinite(module.navigation.order)) ||
        (module.navigation.hidden !== undefined && typeof module.navigation.hidden !== "boolean"))
    )
      throw Error(`Invalid module navigation: ${module.id}`);
    if (module.enabled === false) continue;
    if (!/^[a-z][a-z0-9-]*$/.test(module.mount || ""))
      throw Error(`Invalid module mount: ${module.id}`);
    if (
      !Array.isArray(module.roles) ||
      !module.roles.length ||
      module.roles.some((role) => typeof role !== "string" || !role.trim()) ||
      !module.labelKey ||
      !Array.isArray(module.pages) ||
      !module.pages.length
    )
      throw Error(`Incomplete module contract: ${module.id}`);
    if (!module.pages.some((page) => page.path === "" && !page.selection))
      throw Error(`Missing module entry page: ${module.id}`);
    for (const page of module.pages) {
      const path = `${module.surface || "business"}/${module.mount}/${page.path}`;
      if (!page.name || names.has(page.name))
        throw Error(`Duplicate or missing route name: ${page.name}`);
      if (
        typeof page.path !== "string" ||
        page.path.startsWith("/") ||
        page.path.includes("..") ||
        paths.has(path)
      )
        throw Error(`Invalid or duplicate module path: ${path}`);
      if (page.selection && !page.path.split("/").includes(`:${page.selection}`))
        throw Error(`Missing selection parameter: ${page.name}`);
      names.add(page.name);
      paths.add(path);
    }
  }
  return modules;
}

/**
 * Snapshot metadata separately from executable loaders. Disabled registrations
 * reserve their contracts too, so enabling a module cannot introduce a collision.
 * @param {import("../types/moduleRegistry").BusinessModuleRegistration[]} registrations
 */
export function createBusinessModuleCatalog(registrations) {
  validateModules(registrations.map(({ module }) => ({ ...module, enabled: true })));
  const modules = registrations.map(({ module }) => ({
    ...module,
    roles: [...module.roles],
    ...(module.navigation ? { navigation: { ...module.navigation } } : {}),
    pages: module.pages.map((page) => ({ ...page }))
  }));
  /** @type {import("../types/moduleRegistry").ModuleViews} */
  const views = {};
  for (const registration of registrations) {
    const { module, views: loaders } = registration;
    if (!loaders || typeof loaders !== "object" || Array.isArray(loaders))
      throw Error(`Missing module loaders: ${module.id}`);
    for (const [key, loader] of Object.entries(loaders)) {
      if (!key || typeof loader !== "function")
        throw Error(`Invalid module loader: ${module.id}/${key}`);
      if (Object.hasOwn(views, key)) throw Error(`Duplicate module view: ${key}`);
      Object.defineProperty(views, key, { value: loader, enumerable: true });
    }
    for (const page of module.pages) {
      if (!page.view || !Object.prototype.propertyIsEnumerable.call(loaders, page.view))
        throw Error(`Missing module view: ${module.id}/${page.name}`);
    }
  }
  return { modules, views };
}

/**
 * Host pages keep a separate boundary; module loaders cannot replace auth/layout.
 * @param {import("../types/moduleRegistry").ModuleViews} hostViews
 * @param {import("../types/moduleRegistry").ModuleViews} moduleViews
 */
export function composeApplicationViews(hostViews, moduleViews) {
  for (const [key, loader] of Object.entries(hostViews)) {
    if (!key || typeof loader !== "function") throw Error(`Invalid application view: ${key}`);
    if (Object.hasOwn(moduleViews, key))
      throw Error(`Module view conflicts with application view: ${key}`);
  }
  return { ...hostViews, ...moduleViews };
}

/** One placement policy for all hosts. Roles never grant access outside their surface.
 * @param {import("../types/moduleRegistry").BusinessModuleDefinition[]} modules
 * @param {import("../types/moduleRegistry").ModuleSurface} surface
 * @param {string} role
 */
export function modulesForSurface(modules, surface, role) {
  return modules
    .filter(
      (module) =>
        module.enabled !== false &&
        (module.surface || "business") === surface &&
        module.navigation?.hidden !== true &&
        module.roles.includes(role)
    )
    .sort((a, b) => (a.navigation?.order || 0) - (b.navigation?.order || 0));
}

export const createModuleCatalog = createBusinessModuleCatalog;
