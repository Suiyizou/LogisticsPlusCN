import messages from "./messages.js";

export function customerSurfaceFallback(key) {
  const [namespace, name] = key.split(".");
  return messages["zh-CN"][namespace]?.[name] || key;
}
