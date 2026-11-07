// The customer workspace owns CRUD; the administrator menu is another entry to it.
export function customerDirectoryEntry(modules) {
  const module = modules.find(
    (item) =>
      item.id === "customers" &&
      item.enabled !== false &&
      (item.surface || "business") === "business" &&
      item.roles.includes("ADMIN")
  );
  const page = module?.pages.find((item) => item.path === "" && !item.selection);
  return page ? { name: page.name, path: `/customers/${module.mount}` } : null;
}

export function consolidateCustomerNavigation(groups, role, modules) {
  const destination = role === "ADMIN" ? customerDirectoryEntry(modules) : null;
  const platform = modules.find(
    (item) =>
      item.id === "admin-platform" &&
      item.surface === "admin" &&
      item.enabled !== false &&
      item.navigation?.hidden !== true &&
      item.roles.includes("ADMIN")
  );
  const isPlatform = (item) => item.key === "platform" || item.adminKey === "platform";
  if (!destination || !platform || !groups.some(
    (group) => group.key === "admin" && group.items.some(isPlatform)
  )) return groups;

  return groups.map((group) => {
    if (group.key === "business")
      return { ...group, items: group.items.filter((item) => item.key !== "customers") };
    if (group.key !== "admin") return group;
    return {
      ...group,
      items: group.items.map((item) => {
        if (!isPlatform(item)) return item;
        // Use router navigation even when the menu is rendered by the legacy admin shell.
        const { adminKey, ...link } = item;
        return { ...link, to: destination.path, routeName: destination.name };
      })
    };
  }).filter((group) => group.items.length);
}
