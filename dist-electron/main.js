import { BrowserWindow as e, app as t, ipcMain as n } from "electron";
import r from "node:path";
import { fileURLToPath as i } from "node:url";
//#region electron/main.ts
var a = r.dirname(i(import.meta.url));
process.env.APP_ROOT = r.join(a, "..");
var o = process.env.VITE_DEV_SERVER_URL, s = r.join(process.env.APP_ROOT, "dist-electron"), c = r.join(process.env.APP_ROOT, "dist");
process.env.VITE_PUBLIC = o ? r.join(process.env.APP_ROOT, "public") : c;
var l;
function u() {
	l = new e({
		icon: r.join(process.env.VITE_PUBLIC, "logo.png"),
		webPreferences: { preload: r.join(a, "preload.mjs") },
		width: 1400,
		height: 900,
		minWidth: 900,
		minHeight: 600,
		frame: !1,
		titleBarStyle: "hidden",
		autoHideMenuBar: !0,
		title: "Tea Design In",
		backgroundColor: "#1a1a1a"
	}), n.on("window:minimize", () => l?.minimize()), n.on("window:maximize", () => {
		l?.isMaximized() ? l.unmaximize() : l?.maximize();
	}), n.on("window:close", () => l?.close()), n.handle("window:isMaximized", () => l?.isMaximized()), l.webContents.on("did-finish-load", () => {
		l?.webContents.send("main-process-message", (/* @__PURE__ */ new Date()).toLocaleString());
	}), o ? l.loadURL(o) : l.loadFile(r.join(c, "index.html"));
}
t.on("window-all-closed", () => {
	process.platform !== "darwin" && (t.quit(), l = null);
}), t.on("activate", () => {
	e.getAllWindows().length === 0 && u();
}), t.whenReady().then(u);
//#endregion
export { s as MAIN_DIST, c as RENDERER_DIST, o as VITE_DEV_SERVER_URL };
