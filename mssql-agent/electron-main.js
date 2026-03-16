const path = require("path");
const fs = require("fs");
const { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage } = require("electron");
const { AgentCore } = require("./agent-core");

let mainWindow = null;
let tray = null;
let agent = null;
let lastStatus = null;
const recentLogs = [];

function svgDataUrl() {
  const svg = `
  <svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">
    <g transform="rotate(-8 64 64)">
      <rect x="18" y="16" width="92" height="92" rx="18" fill="#303238"/>
      <rect x="42" y="40" width="44" height="44" rx="10" fill="#121826"/>
    </g>
  </svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function appIcon() {
  const candidatePaths = [
    path.join(__dirname, "assets", "tray-icon.png"),
    path.join(process.resourcesPath || "", "app.asar", "assets", "tray-icon.png"),
    path.join(process.resourcesPath || "", "assets", "tray-icon.png"),
  ].filter(Boolean);

  for (const iconPath of candidatePaths) {
    try {
      if (fs.existsSync(iconPath)) {
        const icon = nativeImage.createFromPath(iconPath);
        if (!icon.isEmpty()) return icon;
      }
    } catch {}
  }

  return nativeImage.createFromDataURL(svgDataUrl());
}

function pushLog(entry) {
  recentLogs.push({
    at: new Date().toISOString(),
    level: entry.level,
    message: entry.message,
    extra: entry.extra ?? null,
  });
  if (recentLogs.length > 100) recentLogs.shift();
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("agent-log", recentLogs[recentLogs.length - 1]);
  }
}

function broadcastStatus(status) {
  lastStatus = status;
  if (tray) {
    const line = status?.state ? `Durum: ${status.state}` : "Durum: bilinmiyor";
    tray.setToolTip(`Otobsr MSSQL Agent\n${line}`);
  }
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("agent-status", status);
  }
}

async function startAgent() {
  agent = new AgentCore({
    appDir: process.env.PORTABLE_EXECUTABLE_DIR || path.dirname(process.execPath),
  });
  agent.on("status", broadcastStatus);
  agent.on("log", pushLog);
  await agent.start();
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 720,
    height: 520,
    minWidth: 640,
    minHeight: 460,
    backgroundColor: "#121826",
    title: "Otobsr MSSQL Agent",
    icon: appIcon(),
    webPreferences: {
      preload: path.join(__dirname, "electron-preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, "electron-index.html"));
  mainWindow.on("minimize", (event) => {
    event.preventDefault();
    mainWindow.hide();
  });
  mainWindow.on("close", (event) => {
    if (!app.isQuiting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });
  mainWindow.webContents.on("did-finish-load", () => {
    if (lastStatus) mainWindow.webContents.send("agent-status", lastStatus);
    for (const log of recentLogs) mainWindow.webContents.send("agent-log", log);
  });
}

function createTray() {
  tray = new Tray(appIcon().resize({ width: 16, height: 16, quality: "best" }));
  const menu = Menu.buildFromTemplate([
    { label: "Goster", click: () => mainWindow.show() },
    { type: "separator" },
    {
      label: "Kapat",
      click: () => {
        app.isQuiting = true;
        if (agent) agent.stop();
        app.quit();
      },
    },
  ]);
  tray.setContextMenu(menu);
  tray.setToolTip("Otobsr MSSQL Agent");
  tray.on("double-click", () => mainWindow.show());
}

ipcMain.handle("agent:get-status", () => lastStatus);
ipcMain.handle("agent:get-logs", () => recentLogs);
ipcMain.handle("agent:show", () => {
  if (mainWindow) mainWindow.show();
});
ipcMain.handle("agent:hide", () => {
  if (mainWindow) mainWindow.hide();
});
ipcMain.handle("agent:quit", () => {
  app.isQuiting = true;
  if (agent) agent.stop();
  app.quit();
});

app.whenReady().then(async () => {
  createWindow();
  createTray();
  try {
    await startAgent();
  } catch (error) {
    pushLog({ level: "error", message: "fatal", extra: String(error && error.stack ? error.stack : error) });
    broadcastStatus({
      state: "fatal",
      lastError: String(error && error.stack ? error.stack : error),
      updatedAt: new Date().toISOString(),
    });
    mainWindow.show();
  }
});

app.on("window-all-closed", (event) => {
  event.preventDefault();
});
