const { contextBridge } = require("electron");

contextBridge.exposeInMainWorld("cargoPlannerDesktop", {
  platform: process.platform,
  version: process.versions.electron
});
