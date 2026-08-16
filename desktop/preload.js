const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("lowkey", {
  getSettings: () => ipcRenderer.invoke("get-settings"),
  openMenu: () => ipcRenderer.invoke("open-menu"),
  quit: () => ipcRenderer.invoke("quit"),
  onSettings: (cb) => ipcRenderer.on("settings", (_e, s) => cb(s))
});
