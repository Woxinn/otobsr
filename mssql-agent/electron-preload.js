const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("agentApi", {
  getStatus: () => ipcRenderer.invoke("agent:get-status"),
  getLogs: () => ipcRenderer.invoke("agent:get-logs"),
  show: () => ipcRenderer.invoke("agent:show"),
  hide: () => ipcRenderer.invoke("agent:hide"),
  quit: () => ipcRenderer.invoke("agent:quit"),
  onStatus: (cb) => ipcRenderer.on("agent-status", (_event, payload) => cb(payload)),
  onLog: (cb) => ipcRenderer.on("agent-log", (_event, payload) => cb(payload)),
});
