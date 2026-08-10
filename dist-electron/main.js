import { BrowserWindow, app, ipcMain } from "electron";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
//#region electron/main.ts
var __dirname = path.dirname(fileURLToPath(import.meta.url));
process.env.APP_ROOT = path.join(__dirname, "..");
var VITE_DEV_SERVER_URL = process.env["VITE_DEV_SERVER_URL"];
var MAIN_DIST = path.join(process.env.APP_ROOT, "dist-electron");
var RENDERER_DIST = path.join(process.env.APP_ROOT, "dist");
process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL ? path.join(process.env.APP_ROOT, "public") : RENDERER_DIST;
var win;
var forceClose = false;
var pendingFilePath = null;
var launchArgvChecked = false;
function extractTeaPathFromArgv(argv) {
	return argv.find((a) => /\.tea$/i.test(a) || /\.te$/i.test(a)) || null;
}
function openTeaFile(filePath) {
	if (win && win.webContents && !win.webContents.isLoadingMainFrame()) sendTeaFileToRenderer(filePath);
	else pendingFilePath = filePath;
}
function sendTeaFileToRenderer(filePath) {
	fs.readFile(filePath, "utf-8", (err, content) => {
		if (err) {
			console.error("Failed to read .tea file:", err);
			return;
		}
		win?.webContents.send("file:open-path", {
			name: path.basename(filePath),
			content
		});
	});
}
app.on("open-file", (event, filePath) => {
	event.preventDefault();
	openTeaFile(filePath);
});
if (!app.requestSingleInstanceLock()) app.quit();
else app.on("second-instance", (_event, argv) => {
	if (win) {
		if (win.isMinimized()) win.restore();
		win.focus();
	}
	const filePath = extractTeaPathFromArgv(argv);
	if (filePath) openTeaFile(filePath);
});
function createWindow() {
	win = new BrowserWindow({
		icon: path.join(process.env.VITE_PUBLIC, "logo.png"),
		webPreferences: { preload: path.join(__dirname, "preload.mjs") },
		width: 1400,
		height: 900,
		minWidth: 900,
		minHeight: 600,
		frame: false,
		titleBarStyle: "hidden",
		autoHideMenuBar: true,
		title: "Tea Design In",
		backgroundColor: "#1a1a1a"
	});
	ipcMain.on("window:minimize", () => win?.minimize());
	ipcMain.on("window:maximize", () => {
		if (win?.isMaximized()) win.unmaximize();
		else win?.maximize();
	});
	ipcMain.on("window:close", () => win?.close());
	ipcMain.handle("window:isMaximized", () => win?.isMaximized());
	win.on("close", (e) => {
		if (forceClose) return;
		e.preventDefault();
		win?.webContents.send("app:before-close");
	});
	ipcMain.on("app:confirm-close", () => {
		forceClose = true;
		win?.close();
	});
	win.webContents.on("did-finish-load", () => {
		win?.webContents.send("main-process-message", (/* @__PURE__ */ new Date()).toLocaleString());
		let launchFilePath = pendingFilePath;
		pendingFilePath = null;
		if (!launchFilePath && !launchArgvChecked) launchFilePath = extractTeaPathFromArgv(process.argv);
		launchArgvChecked = true;
		if (launchFilePath) sendTeaFileToRenderer(launchFilePath);
	});
	if (VITE_DEV_SERVER_URL) win.loadURL(VITE_DEV_SERVER_URL);
	else win.loadFile(path.join(RENDERER_DIST, "index.html"));
}
app.on("window-all-closed", () => {
	if (process.platform !== "darwin") {
		app.quit();
		win = null;
	}
});
app.on("activate", () => {
	if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
app.whenReady().then(createWindow);
//#endregion
export { MAIN_DIST, RENDERER_DIST, VITE_DEV_SERVER_URL };
