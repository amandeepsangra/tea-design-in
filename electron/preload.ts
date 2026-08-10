import { ipcRenderer, contextBridge } from 'electron';

// --------- Expose some API to the Renderer process ---------
contextBridge.exposeInMainWorld('ipcRenderer', {
  on(...args: Parameters<typeof ipcRenderer.on>) {
    const [channel, listener] = args;
    return ipcRenderer.on(channel, (event, ...args) => listener(event, ...args));
  },
  off(...args: Parameters<typeof ipcRenderer.off>) {
    const [channel, ...omit] = args;
    return ipcRenderer.off(channel, ...omit);
  },
  send(...args: Parameters<typeof ipcRenderer.send>) {
    const [channel, ...omit] = args;
    return ipcRenderer.send(channel, ...omit);
  },
  invoke(...args: Parameters<typeof ipcRenderer.invoke>) {
    const [channel, ...omit] = args;
    return ipcRenderer.invoke(channel, ...omit);
  },
});

// --------- Expose Window Controls to Renderer ---------
contextBridge.exposeInMainWorld('electronWindow', {
  minimize: () => ipcRenderer.send('window:minimize'),
  maximize: () => ipcRenderer.send('window:maximize'),
  close: () => ipcRenderer.send('window:close'),
  isMaximized: () => ipcRenderer.invoke('window:isMaximized'),

  // Unsaved-changes guard: main.ts intercepts the OS close request and asks first.
  onBeforeClose: (cb: () => void) => {
    const listener = () => cb();
    ipcRenderer.on('app:before-close', listener);
    return listener;
  },
  offBeforeClose: (listener: (...args: unknown[]) => void) => ipcRenderer.off('app:before-close', listener),
  confirmClose: () => ipcRenderer.send('app:confirm-close'),

  // .tea file-association: main.ts sends { name, content } once it has read the
  // double-clicked/second-instance file off disk.
  onOpenFile: (cb: (payload: { name: string; content: string }) => void) => {
    const listener = (_event: unknown, payload: { name: string; content: string }) => cb(payload);
    ipcRenderer.on('file:open-path', listener);
    return listener;
  },
  offOpenFile: (listener: (...args: unknown[]) => void) => ipcRenderer.off('file:open-path', listener),
});

