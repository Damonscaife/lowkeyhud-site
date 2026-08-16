const { app, BrowserWindow, Menu, ipcMain, screen } = require("electron");
const path = require("path");
const fs = require("fs");

const SETTINGS_FILE = path.join(app.getPath("userData"), "settings.json");
const DEFAULTS = {
  x: null,
  y: null,
  opacity: 0.92,
  clickThrough: false,
  showTime: true,
  showRoast: true,
  focusMinutes: 25,
  launchAtLogin: false
};

let settings = { ...DEFAULTS };
try {
  settings = { ...settings, ...JSON.parse(fs.readFileSync(SETTINGS_FILE, "utf8")) };
} catch (_) { /* first run */ }

function saveSettings() {
  try { fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2)); } catch (_) {}
}

let win = null;

function applySettings() {
  if (!win) return;
  win.setOpacity(settings.opacity);
  win.setIgnoreMouseEvents(settings.clickThrough, { forward: true });
  win.webContents.send("settings", settings);
}

function resetPosition() {
  const wa = screen.getPrimaryDisplay().workAreaSize;
  settings.x = wa.width - 340 - 24;
  settings.y = wa.height - 210 - 24;
  saveSettings();
  if (win) win.setPosition(settings.x, settings.y);
}

function showMenu() {
  if (!win) return;
  const menu = Menu.buildFromTemplate([
    {
      label: "Show time",
      type: "checkbox",
      checked: settings.showTime,
      click: (mi) => { settings.showTime = mi.checked; saveSettings(); applySettings(); }
    },
    {
      label: "Show roast",
      type: "checkbox",
      checked: settings.showRoast,
      click: (mi) => { settings.showRoast = mi.checked; saveSettings(); applySettings(); }
    },
    {
      label: "Click-through (let clicks pass through)",
      type: "checkbox",
      checked: settings.clickThrough,
      click: (mi) => { settings.clickThrough = mi.checked; saveSettings(); applySettings(); }
    },
    {
      label: "Opacity",
      submenu: [0.5, 0.7, 0.85, 0.92, 1].map((o) => ({
        label: Math.round(o * 100) + "%",
        type: "checkbox",
        checked: Math.abs(settings.opacity - o) < 0.01,
        click: () => { settings.opacity = o; saveSettings(); applySettings(); }
      }))
    },
    {
      label: "Focus length",
      submenu: [15, 25, 45, 60].map((m) => ({
        label: m + " min",
        type: "checkbox",
        checked: settings.focusMinutes === m,
        click: () => { settings.focusMinutes = m; saveSettings(); applySettings(); }
      }))
    },
    {
      label: "Launch at login",
      type: "checkbox",
      checked: settings.launchAtLogin,
      click: (mi) => {
        settings.launchAtLogin = mi.checked;
        app.setLoginItemSettings({ openAtLogin: mi.checked });
        saveSettings();
      }
    },
    { type: "separator" },
    { label: "Reset position", click: resetPosition },
    { label: "Quit lowkeyhud", click: () => app.quit() }
  ]);
  menu.popup({ window: win });
}

function createWindow() {
  const wa = screen.getPrimaryDisplay().workAreaSize;
  const w = 340, h = 210;
  const x = Number.isFinite(settings.x) ? settings.x : wa.width - w - 24;
  const y = Number.isFinite(settings.y) ? settings.y : wa.height - h - 24;

  win = new BrowserWindow({
    width: w,
    height: h,
    x,
    y,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    movable: true,
    skipTaskbar: true,
    hasShadow: false,
    fullscreenable: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  win.setAlwaysOnTop(true, "screen-saver");
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.loadFile(path.join(__dirname, "renderer", "index.html"));

  win.on("move", () => {
    const [px, py] = win.getPosition();
    settings.x = px;
    settings.y = py;
    saveSettings();
  });

  win.on("closed", () => { win = null; });

  applySettings();
}

app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

ipcMain.handle("get-settings", () => settings);
ipcMain.handle("open-menu", () => showMenu());
ipcMain.handle("quit", () => app.quit());
