import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as fabric from 'fabric';
import { MousePointer2, Crop, Image as ImageIcon, Type, Square, Circle, X, Plus, ZoomIn, ZoomOut, PanelRight, Minus, Triangle, Star, Pentagon, Hand, Pipette, SquareDashed, CircleDashed, Layers, Undo2, Redo2, Paintbrush, Eraser, ArrowUpDown, Ruler as RulerIcon, Grid3x3, Sun, Moon } from 'lucide-react';
import './index.css';
import { DropdownMenu } from './components/DropdownMenu';
import { APP_VERSION } from './version';
import { ToolSettingsBar } from './components/ToolSettingsBar';
import { LayersPanel } from './components/LayersPanel';
import { PropertiesPanel } from './components/PropertiesPanel';
import { MockupWorkspace } from './components/MockupWorkspace';
import { Ruler } from './components/Ruler';

interface DocumentInfo {
  id: string;
  name: string;
  width: number;
  height: number;
  background?: 'White' | 'Transparent' | 'Black';
  mockups?: { id: string; url: string }[];
  activeMockupId?: string | null;
}

type ToolType = 'select' | 'marquee' | 'hand' | 'crop' | 'text' | 'rect' | 'circle' | 'line' | 'triangle' | 'star' | 'polygon' | 'image' | 'eyedropper' | 'brush' | 'eraser';

const MAX_HISTORY = 50;
const AUTOSAVE_KEY = 'tea-autosave-v1';
const AUTOSAVE_DEBOUNCE_MS = 1500;

interface AutosaveEntry {
  id: string;
  name: string;
  width: number;
  height: number;
  background?: 'White' | 'Transparent' | 'Black';
  canvasData: any;
  savedAt: number;
}

function App() {
  const [documents, setDocuments] = useState<DocumentInfo[]>([]);
  const [activeDocId, setActiveDocId] = useState<string | null>(null);
  const [showNewDocModal, setShowNewDocModal] = useState(false);
  const [showCanvasSizeModal, setShowCanvasSizeModal] = useState(false);
  const [showColorAdjustModal, setShowColorAdjustModal] = useState(false);
  const [showShortcutsModal, setShowShortcutsModal] = useState(false);
  const [showAboutModal, setShowAboutModal] = useState(false);
  const [appMode, setAppMode] = useState<'main' | 'mockup'>('main');
  const [activeTool, setActiveTool] = useState<ToolType>('select');
  const [activeShapeGroupTool, setActiveShapeGroupTool] = useState<ToolType>('rect');
  const [showShapeMenu, setShowShapeMenu] = useState(false);
  const [showMarqueeMenu, setShowMarqueeMenu] = useState(false);
  const [activeMarqueeShape, setActiveMarqueeShape] = useState<'rect' | 'ellipse'>('rect');
  const [zoomMap, setZoomMap] = useState<{ [id: string]: number }>({});
  const [showRightPanel, setShowRightPanel] = useState(true);
  const [rightPanelWidth, setRightPanelWidth] = useState(() => {
    const stored = Number(localStorage.getItem('tea-right-panel-width'));
    return stored >= 220 && stored <= 640 ? stored : 320;
  });
  const rightPanelResizeRef = useRef(false);
  const [showRulers, setShowRulers] = useState(false);
  const [showGrid, setShowGrid] = useState(false);
  const [gridSize, setGridSize] = useState(20);
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    try {
      const stored = localStorage.getItem('tea-theme');
      if (stored === 'light' || stored === 'dark') return stored;
    } catch { /* ignore */ }
    return window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  });
  const [showMobileRightPanel, setShowMobileRightPanel] = useState(false);
  const [globalLoading, setGlobalLoading] = useState<string | null>(null);
  const [confirmCloseDocId, setConfirmCloseDocId] = useState<string | null>(null);
  const [appCloseConfirm, setAppCloseConfirm] = useState(false);
  const [pendingRestore, setPendingRestore] = useState<AutosaveEntry[] | null>(null);

  const [primaryColor, setPrimaryColor] = useState('#000000');
  const [secondaryColor, setSecondaryColor] = useState('#ffffff');

  // We store the actual Fabric instances in a ref map to avoid React state issues with complex objects
  const fabricCanvasesRef = useRef<{ [id: string]: fabric.Canvas }>({});
  const historyRef = useRef<{
    [docId: string]: { undoStack: string[]; redoStack: string[]; isProcessing: boolean }
  }>({});

  // ─── Data-safety: dirty tracking + autosave (Phase 2) ───
  // dirtyDocsRef is the source of truth checked synchronously from event handlers
  // (beforeunload, Electron close, tab close). dirtyVersion just forces a re-render
  // so the tab-bar "unsaved" dot stays in sync with it.
  const dirtyDocsRef = useRef<Set<string>>(new Set());
  const [dirtyVersion, setDirtyVersion] = useState(0);
  const documentsRef = useRef<DocumentInfo[]>([]);
  useEffect(() => { documentsRef.current = documents; }, [documents]);

  const markDirty = useCallback((id: string) => {
    if (!dirtyDocsRef.current.has(id)) {
      dirtyDocsRef.current.add(id);
      setDirtyVersion(v => v + 1);
    }
  }, []);
  const clearDirty = useCallback((id: string) => {
    if (dirtyDocsRef.current.has(id)) {
      dirtyDocsRef.current.delete(id);
      setDirtyVersion(v => v + 1);
    }
  }, []);

  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleAutosave = useCallback(() => {
    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    autosaveTimerRef.current = setTimeout(() => {
      try {
        const entries: AutosaveEntry[] = documentsRef.current
          .map((d): AutosaveEntry | null => {
            const canvas = fabricCanvasesRef.current[d.id];
            if (!canvas) return null;
            return {
              id: d.id, name: d.name, width: d.width, height: d.height, background: d.background,
              canvasData: canvas.toJSON(), savedAt: Date.now(),
            };
          })
          .filter((e): e is AutosaveEntry => e !== null);
        if (entries.length) localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(entries));
        else localStorage.removeItem(AUTOSAVE_KEY);
      } catch (err) {
        // Best-effort only — e.g. localStorage quota exceeded on very large designs
        console.warn('Autosave failed:', err);
      }
    }, AUTOSAVE_DEBOUNCE_MS);
  }, []);

  const handleZoom = useCallback((id: string, action: number | 'reset') => {
    const canvas = fabricCanvasesRef.current[id];
    const doc = documents.find(d => d.id === id);
    if (!canvas || !doc) return;

    setZoomMap(prev => {
      let currentZoom = prev[id] || 1;
      let newZoom = currentZoom;
      if (action === 'reset') {
        newZoom = 1;
      } else {
        newZoom = currentZoom * action;
      }
      if (newZoom > 10) newZoom = 10;
      if (newZoom < 0.05) newZoom = 0.05;

      canvas.setZoom(newZoom);
      canvas.setDimensions({
        width: doc.width * newZoom,
        height: doc.height * newZoom
      });
      return { ...prev, [id]: newZoom };
    });
  }, [documents]);

  // When a new document is added and its canvas element is rendered, we initialize Fabric
  useEffect(() => {
    documents.forEach(doc => {
      if (!fabricCanvasesRef.current[doc.id]) {
        const canvasElement = document.getElementById(`canvas-${doc.id}`) as HTMLCanvasElement;
        if (canvasElement) {
          const bgColor = doc.background === 'Transparent' ? undefined : doc.background === 'Black' ? '#000000' : '#ffffff';
          const canvas = new fabric.Canvas(canvasElement, {
            width: doc.width,
            height: doc.height,
            backgroundColor: bgColor,
            selection: true,
            enableRetinaScaling: false,   // prevent canvas from auto-resizing
          });
          
          fabricCanvasesRef.current[doc.id] = canvas;
          historyRef.current[doc.id] = { undoStack: [], redoStack: [], isProcessing: false };
          setZoomMap(prev => ({...prev, [doc.id]: 1}));
          canvas.renderAll();

          // History tracking events (stack is capped to avoid unbounded memory growth
          // on long editing sessions — oldest snapshots are dropped past MAX_HISTORY)
          const saveHistory = () => {
            const history = historyRef.current[doc.id];
            if (history && !history.isProcessing) {
              history.undoStack.push(JSON.stringify(canvas.toJSON()));
              if (history.undoStack.length > MAX_HISTORY) history.undoStack.shift();
              history.redoStack = [];
              markDirty(doc.id);
              scheduleAutosave();
            }
          };
          canvas.on('object:added', saveHistory);
          canvas.on('object:modified', saveHistory);
          canvas.on('object:removed', saveHistory);

          // Mouse wheel zoom
          canvas.on('mouse:wheel', function(opt) {
            if (opt.e.ctrlKey || opt.e.metaKey || opt.e.altKey) {
              opt.e.preventDefault();
              opt.e.stopPropagation();
              const delta = opt.e.deltaY;
              const zoomMultiplier = delta > 0 ? 0.9 : 1.1; // zoom out if positive delta, zoom in if negative
              handleZoom(doc.id, zoomMultiplier);
            }
          });
        }
      }
    });
  }, [documents, handleZoom, markDirty, scheduleAutosave]);

  const handleUndo = useCallback(() => {
    if (!activeDocId) return;
    const canvas = fabricCanvasesRef.current[activeDocId];
    const history = historyRef.current[activeDocId];
    if (!canvas || !history || history.undoStack.length === 0) return;

    history.isProcessing = true;
    history.redoStack.push(JSON.stringify(canvas.toJSON()));
    const prevState = history.undoStack.pop();
    if (prevState) {
      canvas.loadFromJSON(JSON.parse(prevState)).then(() => {
        canvas.requestRenderAll();
        history.isProcessing = false;
        markDirty(activeDocId);
        scheduleAutosave();
      });
    } else {
      history.isProcessing = false;
    }
  }, [activeDocId, markDirty, scheduleAutosave]);

  const handleRedo = useCallback(() => {
    if (!activeDocId) return;
    const canvas = fabricCanvasesRef.current[activeDocId];
    const history = historyRef.current[activeDocId];
    if (!canvas || !history || history.redoStack.length === 0) return;

    history.isProcessing = true;
    history.undoStack.push(JSON.stringify(canvas.toJSON()));
    const nextState = history.redoStack.pop();
    if (nextState) {
      canvas.loadFromJSON(JSON.parse(nextState)).then(() => {
        canvas.requestRenderAll();
        history.isProcessing = false;
        markDirty(activeDocId);
        scheduleAutosave();
      });
    } else {
      history.isProcessing = false;
    }
  }, [activeDocId, markDirty, scheduleAutosave]);

  // Global Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = async (e: KeyboardEvent) => {
      if (!activeDocId) return;
      const canvas = fabricCanvasesRef.current[activeDocId];

      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || (e.target as HTMLElement).isContentEditable) return;
        if (canvas) {
          const activeObjects = canvas.getActiveObjects();
          if (activeObjects.length) {
            canvas.discardActiveObject();
            activeObjects.forEach(obj => canvas.remove(obj));
            canvas.requestRenderAll();
          }
        }
      }
      
      if (e.ctrlKey || e.metaKey) {
        if (e.key === 'z' || e.key === 'Z') {
          e.preventDefault();
          if (e.shiftKey) handleRedo();
          else handleUndo();
        } else if (e.key === 'y' || e.key === 'Y') {
          e.preventDefault();
          handleRedo();
        } else if (e.key === 'c' || e.key === 'C') {
          if (canvas) {
            const activeObject = canvas.getActiveObject();
            if (activeObject) {
              const clone = await activeObject.clone();
              (window as any)._clipboard = clone;
            }
          }
        } else if (e.key === 'v' || e.key === 'V') {
          if (canvas && (window as any)._clipboard) {
            const clone = await (window as any)._clipboard.clone();
            canvas.discardActiveObject();
            clone.set({
              left: clone.left + 10,
              top: clone.top + 10,
              evented: true,
            });
            if (clone.type === 'activeSelection') {
              clone.canvas = canvas;
              clone.forEachObject(function(obj: any) { canvas.add(obj); });
              clone.setCoords();
            } else {
              canvas.add(clone);
            }
            (window as any)._clipboard.top += 10;
            (window as any)._clipboard.left += 10;
            canvas.setActiveObject(clone);
            canvas.requestRenderAll();
          }
        } else if (e.key === '=' || e.key === '+') {
          e.preventDefault();
          handleZoom(activeDocId, 1.1);
        } else if (e.key === '-') {
          e.preventDefault();
          handleZoom(activeDocId, 1 / 1.1);
        } else if (e.key === '0') {
          e.preventDefault();
          handleZoom(activeDocId, 'reset');
        }
      } else if (!e.altKey) {
        // Single-letter tool shortcuts — these were already advertised in every tool's
        // tooltip (e.g. "Move Tool (V)") but never actually wired up.
        if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || (e.target as HTMLElement).isContentEditable) return;
        const toolKeys: Record<string, ToolType> = {
          v: 'select', m: 'marquee', h: 'hand', c: 'crop', i: 'eyedropper',
          t: 'text', b: 'brush', e: 'eraser',
        };
        const tool = toolKeys[e.key.toLowerCase()];
        if (tool) {
          e.preventDefault();
          handleToolClick(tool);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
    // handleToolClick intentionally omitted — see comment on its definition below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeDocId, handleZoom, handleUndo, handleRedo]);

  // ─── Right panel resize handle ───
  const rightPanelWidthRef = useRef(rightPanelWidth);
  useEffect(() => { rightPanelWidthRef.current = rightPanelWidth; }, [rightPanelWidth]);

  const startRightPanelResize = (e: React.MouseEvent) => {
    e.preventDefault();
    rightPanelResizeRef.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  };
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!rightPanelResizeRef.current) return;
      const w = Math.max(220, Math.min(640, window.innerWidth - e.clientX));
      setRightPanelWidth(w);
    };
    const onUp = () => {
      if (!rightPanelResizeRef.current) return;
      rightPanelResizeRef.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      try { localStorage.setItem('tea-right-panel-width', String(rightPanelWidthRef.current)); } catch { /* ignore */ }
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, []);

  // ─── Theme: apply + persist + notify anything that can't just read the CSS var
  // (Ruler draws with a raw Canvas2D context, which doesn't resolve var(--x) itself) ───
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    try { localStorage.setItem('tea-theme', theme); } catch { /* ignore */ }
    window.dispatchEvent(new Event('tea-theme-change'));
  }, [theme]);

  // ─── Autosave recovery: on first mount, offer to restore any draft left over
  // from a session that never got an explicit Save (crash, accidental close, etc.) ───
  useEffect(() => {
    try {
      const raw = localStorage.getItem(AUTOSAVE_KEY);
      if (raw) {
        const entries = JSON.parse(raw);
        if (Array.isArray(entries) && entries.length > 0) setPendingRestore(entries);
      }
    } catch (err) {
      console.warn('Failed to read autosave session:', err);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleRestoreSession = () => {
    if (!pendingRestore) return;
    const restoreEntries = pendingRestore;
    const newDocs: DocumentInfo[] = restoreEntries.map(e => ({
      id: e.id, name: e.name, width: e.width, height: e.height, background: e.background,
    }));
    setDocuments(newDocs);
    setActiveDocId(newDocs[0]?.id || null);

    // Wait for canvas elements to mount, then replay each document's saved canvas state
    setTimeout(() => {
      restoreEntries.forEach(entry => {
        const canvas = fabricCanvasesRef.current[entry.id];
        const history = historyRef.current[entry.id];
        if (canvas) {
          if (history) history.isProcessing = true;
          canvas.loadFromJSON(entry.canvasData).then(() => {
            canvas.requestRenderAll();
            if (history) history.isProcessing = false;
            // A restored draft was never explicitly saved by the user — keep it flagged dirty
            markDirty(entry.id);
          });
        }
      });
    }, 100);
    setPendingRestore(null);
  };

  const handleDiscardSession = () => {
    try { localStorage.removeItem(AUTOSAVE_KEY); } catch { /* ignore */ }
    setPendingRestore(null);
  };

  // ─── Warn before losing unsaved work (browser/web build) ───
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (dirtyDocsRef.current.size > 0) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, []);

  // ─── Warn before losing unsaved work (Electron desktop build) ───
  // main.ts intercepts the window's close event and asks us first via 'app:before-close';
  // we either let it through immediately (nothing dirty) or show a confirm modal.
  useEffect(() => {
    const electronWindow = (window as any).electronWindow;
    if (!electronWindow?.onBeforeClose) return;
    const handleBeforeClose = () => {
      if (dirtyDocsRef.current.size > 0) {
        setAppCloseConfirm(true);
      } else {
        electronWindow.confirmClose?.();
      }
    };
    const registeredListener = electronWindow.onBeforeClose(handleBeforeClose);
    return () => electronWindow.offBeforeClose?.(registeredListener);
  }, []);

  // ─── Ellipse Marquee (real elliptical region-select) ───
  // Fabric's built-in `selection: true` drag-box is always rectangular, so "Ellipse
  // Select" used to just be the rectangle in disguise. While marquee+ellipse is active
  // we take over mouse:down/move/up ourselves: draw a temporary ellipse guide, then on
  // release select every object whose center point falls inside it.
  useEffect(() => {
    const canvas = activeDocId ? fabricCanvasesRef.current[activeDocId] : null;
    if (!canvas || activeTool !== 'marquee' || activeMarqueeShape !== 'ellipse') return;

    canvas.selection = false; // don't let the native rectangular marquee also run
    let guide: fabric.Ellipse | null = null;
    let startX = 0, startY = 0;
    let isDrawing = false;

    const onDown = (opt: any) => {
      if (opt.target) return; // clicking an object directly — leave normal selection behavior alone
      const p = canvas.getScenePoint(opt.e);
      startX = p.x; startY = p.y; isDrawing = true;
      guide = new fabric.Ellipse({
        left: startX, top: startY, rx: 0, ry: 0, originX: 'center', originY: 'center',
        fill: 'rgba(0,150,255,0.08)', stroke: '#0096ff', strokeWidth: 1, strokeDashArray: [4, 4],
        selectable: false, evented: false,
      });
      canvas.add(guide);
    };
    const onMove = (opt: any) => {
      if (!isDrawing || !guide) return;
      const p = canvas.getScenePoint(opt.e);
      const rx = Math.abs(p.x - startX) / 2;
      const ry = Math.abs(p.y - startY) / 2;
      guide.set({ left: (p.x + startX) / 2, top: (p.y + startY) / 2, rx, ry });
      guide.setCoords();
      canvas.requestRenderAll();
    };
    const onUp = () => {
      if (!isDrawing) return;
      isDrawing = false;
      if (!guide) return;
      const { left: cx = 0, top: cy = 0, rx = 0, ry = 0 } = guide;
      canvas.remove(guide);
      guide = null;

      if (rx > 2 && ry > 2) {
        // Point-in-ellipse test: ((x-cx)/rx)^2 + ((y-cy)/ry)^2 <= 1
        const hits = canvas.getObjects().filter(o => {
          if (o.visible === false) return false;
          const c = o.getCenterPoint();
          const dx = (c.x - cx) / rx;
          const dy = (c.y - cy) / ry;
          return dx * dx + dy * dy <= 1;
        });
        canvas.discardActiveObject();
        if (hits.length === 1) {
          canvas.setActiveObject(hits[0]);
        } else if (hits.length > 1) {
          canvas.setActiveObject(new fabric.ActiveSelection(hits, { canvas }));
        }
      }
      canvas.requestRenderAll();
    };

    canvas.on('mouse:down', onDown);
    canvas.on('mouse:move', onMove);
    canvas.on('mouse:up', onUp);

    return () => {
      canvas.off('mouse:down', onDown);
      canvas.off('mouse:move', onMove);
      canvas.off('mouse:up', onUp);
      if (guide) canvas.remove(guide);
      canvas.selection = true;
    };
  }, [activeTool, activeMarqueeShape, activeDocId]);

  // ─── Snapping while dragging ───
  // Snap-to-grid only kicks in when the grid overlay is on (it's the visible cue for
  // it); snap-to-object-edges is always on, matching how most design tools behave.
  const SNAP_THRESHOLD = 6; // document px
  useEffect(() => {
    const canvas = activeDocId ? fabricCanvasesRef.current[activeDocId] : null;
    if (!canvas) return;

    const onObjectMoving = (opt: any) => {
      const obj = opt.target;
      if (!obj) return;
      const objW = obj.getScaledWidth();
      const objH = obj.getScaledHeight();
      let left = obj.left || 0;
      let top = obj.top || 0;

      const candidatesX: number[] = [];
      const candidatesY: number[] = [];

      if (showGrid && gridSize > 0) {
        candidatesX.push(Math.round(left / gridSize) * gridSize);
        candidatesX.push(Math.round((left + objW) / gridSize) * gridSize - objW);
        candidatesX.push(Math.round((left + objW / 2) / gridSize) * gridSize - objW / 2);
        candidatesY.push(Math.round(top / gridSize) * gridSize);
        candidatesY.push(Math.round((top + objH) / gridSize) * gridSize - objH);
        candidatesY.push(Math.round((top + objH / 2) / gridSize) * gridSize - objH / 2);
      }

      const objs = canvas.getObjects();
      for (const other of objs) {
        if (other === obj || other.excludeFromExport) continue;
        const r = other.getBoundingRect();
        candidatesX.push(r.left, r.left + r.width / 2, r.left + r.width);
        candidatesY.push(r.top, r.top + r.height / 2, r.top + r.height);
      }

      let bestDx = 0, bestDistX = SNAP_THRESHOLD;
      [left, left + objW / 2, left + objW].forEach(edge => {
        candidatesX.forEach(cx => {
          const dist = Math.abs(edge - cx);
          if (dist < bestDistX) { bestDistX = dist; bestDx = cx - edge; }
        });
      });
      let bestDy = 0, bestDistY = SNAP_THRESHOLD;
      [top, top + objH / 2, top + objH].forEach(edge => {
        candidatesY.forEach(cy => {
          const dist = Math.abs(edge - cy);
          if (dist < bestDistY) { bestDistY = dist; bestDy = cy - edge; }
        });
      });

      if (bestDx !== 0 || bestDy !== 0) {
        obj.set({ left: left + bestDx, top: top + bestDy });
      }
    };

    canvas.on('object:moving', onObjectMoving);
    return () => canvas.off('object:moving', onObjectMoving);
  }, [activeDocId, showGrid, gridSize]);

  const handleCreateDocument = (width: number, height: number, background: 'White' | 'Transparent' | 'Black' = 'White') => {
    const newDoc: DocumentInfo = {
      id: `doc_${Date.now()}`,
      name: `Untitled-${documents.length + 1}`,
      width,
      height,
      background
    };
    setDocuments([...documents, newDoc]);
    setActiveDocId(newDoc.id);
    setShowNewDocModal(false);
  };

  // Actually tears down a document's canvas/state. Bypasses the unsaved-changes check —
  // only call directly once the user has confirmed, or when the doc is already clean.
  const performCloseDocument = useCallback((id: string) => {
    setDocuments(prev => {
      const newDocs = prev.filter(d => d.id !== id);
      setActiveDocId(current => current === id ? (newDocs.length > 0 ? newDocs[newDocs.length - 1].id : null) : current);
      return newDocs;
    });
    // Cleanup fabric instance
    if (fabricCanvasesRef.current[id]) {
      fabricCanvasesRef.current[id].dispose();
      delete fabricCanvasesRef.current[id];
    }
    delete historyRef.current[id];
    clearDirty(id);

    setZoomMap(prev => {
      const newMap = {...prev};
      delete newMap[id];
      return newMap;
    });
    // Rewrite autosave storage without the closed document
    scheduleAutosave();
  }, [clearDirty, scheduleAutosave]);

  const closeDocument = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (dirtyDocsRef.current.has(id)) {
      setConfirmCloseDocId(id);
      return;
    }
    performCloseDocument(id);
  };

  const updateDocumentMockups = (id: string, mockups: { id: string; url: string }[], activeMockupId: string | null) => {
    setDocuments(prev => prev.map(doc => 
      doc.id === id ? { ...doc, mockups, activeMockupId } : doc
    ));
  };

  const getActiveCanvas = () => {
    if (activeDocId) return fabricCanvasesRef.current[activeDocId];
    return null;
  };

  const handleSaveProject = () => {
    const canvas = getActiveCanvas();
    const doc = documents.find(d => d.id === activeDocId);
    if (!canvas || !doc) return;
    
    // Create a thumbnail
    const oldZoom = canvas.getZoom();
    canvas.setZoom(1);
    const thumbnail = canvas.toDataURL({ format: 'jpeg', quality: 0.5, multiplier: 0.2 });
    canvas.setZoom(oldZoom);

    const payload = {
      version: '1.0',
      width: doc.width,
      height: doc.height,
      thumbnail: thumbnail,
      canvasData: canvas.toJSON()
    };
    
    const json = JSON.stringify(payload);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${doc.name}.tea`;
    link.click();
    URL.revokeObjectURL(url);

    clearDirty(doc.id);
  };

  // Parses a .tea/.te file's raw text content and opens it as a new document.
  // Shared by the "Open Project..." file picker AND the Electron file-association
  // handler (double-clicking a .tea file in the OS) so both paths behave identically.
  const loadTeaFile = useCallback((rawContent: string, fileName: string) => {
    try {
      const data = JSON.parse(rawContent);
      // Support both old raw json (.te) and new wrapped json (.tea)
      const canvasData = data.canvasData || data;
      const width = data.width || 1920;
      const height = data.height || 1080;

      const newDocId = `doc_${Date.now()}`;
      const newDoc: DocumentInfo = {
        id: newDocId,
        name: fileName.replace(/\.tea$/i, '').replace(/\.te$/i, ''),
        width,
        height
      };
      setDocuments(prev => [...prev, newDoc]);
      setActiveDocId(newDoc.id);

      // Wait for canvas element to mount
      setTimeout(() => {
        const canvas = fabricCanvasesRef.current[newDocId];
        const history = historyRef.current[newDocId];
        if (canvas) {
          // isProcessing suppresses saveHistory (and therefore markDirty/autosave) while
          // the file loads — a freshly-opened project should start clean, not dirty.
          if (history) history.isProcessing = true;
          canvas.loadFromJSON(canvasData).then(() => {
            canvas.requestRenderAll();
            if (history) history.isProcessing = false;
          });
        }
      }, 100);
    } catch (err) {
      console.error('Failed to parse .tea file', err);
      alert('Invalid .tea file format');
    }
  }, []);

  const handleOpenProject = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.tea,.te';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (f) => loadTeaFile(f.target?.result as string, file.name);
        reader.readAsText(file);
      }
    };
    input.click();
  };

  // ─── Electron file-association: OS "Open with Tea Design In" on a .tea file ───
  // main.ts resolves the double-clicked file's path, reads its contents, and forwards
  // them here — this covers both cold-launch (double-click while app is closed) and
  // an already-running instance (double-click while app is open).
  useEffect(() => {
    const electronWindow = (window as any).electronWindow;
    if (!electronWindow?.onOpenFile) return;
    const handleOpenFile = (payload: { name: string; content: string }) => {
      loadTeaFile(payload.content, payload.name);
    };
    const registeredListener = electronWindow.onOpenFile(handleOpenFile);
    return () => electronWindow.offOpenFile?.(registeredListener);
  }, [loadTeaFile]);

  const handleExport = (format: 'png' | 'jpeg') => {
    const canvas = getActiveCanvas();
    const doc = documents.find(d => d.id === activeDocId);
    if (!canvas || !doc) return;
    const oldZoom = canvas.getZoom();
    canvas.setZoom(1);
    const dataURL = canvas.toDataURL({
      format: format,
      quality: 1,
      multiplier: 1
    });
    canvas.setZoom(oldZoom);
    const link = document.createElement('a');
    link.href = dataURL;
    link.download = `${doc.name}.${format}`;
    link.click();
  };

  // Tool actions
  // Not memoized — recreated every render and read via closure by the keyboard-shortcut
  // effect above (intentionally not in that effect's deps, to avoid re-attaching the
  // window listener on every keystroke-unrelated render). The only staleness risk is
  // `primaryColor`; the brush-color swatch already live-updates the active brush color
  // independently, so a shortcut-triggered switch self-corrects immediately either way.
  const handleToolClick = (tool: ToolType) => {
    setActiveTool(tool);
    const canvas = getActiveCanvas();
    if (!canvas) return;

    const doc = documents.find(d => d.id === activeDocId);
    const docW = doc?.width || 800;
    const docH = doc?.height || 800;
    const cx = (docW / 2);
    const cy = (docH / 2);

    // Reset canvas cursor/mode when switching tools
    canvas.isDrawingMode = false;
    canvas.selection = tool === 'select' || tool === 'marquee';
    canvas.defaultCursor = tool === 'hand' ? 'grab' : tool === 'eyedropper' ? 'crosshair' : tool === 'marquee' ? 'crosshair' : 'default';
    canvas.hoverCursor = tool === 'hand' ? 'grab' : tool === 'marquee' ? 'crosshair' : 'move';

    if (tool === 'rect') {
      const rect = new fabric.Rect({ left: cx - 75, top: cy - 50, fill: '#3b82f6', width: 150, height: 100 });
      canvas.add(rect); canvas.setActiveObject(rect); setActiveTool('select');
    } else if (tool === 'circle') {
      const circle = new fabric.Circle({ left: cx - 75, top: cy - 75, fill: '#ef4444', radius: 75 });
      canvas.add(circle); canvas.setActiveObject(circle); setActiveTool('select');
    } else if (tool === 'triangle') {
      const tri = new fabric.Triangle({ left: cx - 75, top: cy - 65, fill: '#f59e0b', width: 150, height: 130 });
      canvas.add(tri); canvas.setActiveObject(tri); setActiveTool('select');
    } else if (tool === 'line') {
      const line = new fabric.Line([cx - 100, cy, cx + 100, cy], { stroke: '#000000', strokeWidth: 3, fill: '' });
      canvas.add(line); canvas.setActiveObject(line); setActiveTool('select');
    } else if (tool === 'star') {
      const outerR = 80, innerR = 36, numPts = 5;
      const starPts: { x: number; y: number }[] = [];
      for (let i = 0; i < numPts * 2; i++) {
        const r = i % 2 === 0 ? outerR : innerR;
        const angle = (Math.PI / numPts) * i - Math.PI / 2;
        starPts.push({ x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) });
      }
      const star = new fabric.Polygon(starPts, { fill: '#f59e0b', stroke: '', strokeWidth: 0 });
      canvas.add(star); canvas.setActiveObject(star); setActiveTool('select');
    } else if (tool === 'polygon') {
      const sides = 6, r = 80;
      const polyPts = Array.from({ length: sides }, (_, i) => ({
        x: cx + r * Math.cos((2 * Math.PI * i) / sides - Math.PI / 2),
        y: cy + r * Math.sin((2 * Math.PI * i) / sides - Math.PI / 2),
      }));
      const poly = new fabric.Polygon(polyPts, { fill: '#8b5cf6', stroke: '', strokeWidth: 0 });
      canvas.add(poly); canvas.setActiveObject(poly); setActiveTool('select');
    } else if (tool === 'text') {
      const text = new fabric.IText('Double click to edit', {
        left: cx - 150, top: cy - 20, fontFamily: 'Inter', fill: '#000000', fontSize: 40,
      });
      canvas.add(text); canvas.setActiveObject(text); setActiveTool('select');
    } else if (tool === 'image') {
      const input = document.createElement('input');
      input.type = 'file'; input.accept = 'image/*';
      input.onchange = (e) => {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (file) {
          setGlobalLoading('Importing image...');
          const reader = new FileReader();
          reader.onload = (f) => {
            const data = f.target?.result as string;
            const imgElement = new Image();
            imgElement.onload = () => {
              const ImgClass = (fabric as any).Image || (fabric as any).FabricImage;
              const fImg = new ImgClass(imgElement);
              const maxW = docW * 0.8, maxH = docH * 0.8;
              const scale = Math.min(maxW / fImg.width, maxH / fImg.height, 1);
              fImg.scale(scale);
              canvas.add(fImg);
              canvas.centerObject(fImg);
              fImg.setCoords();
              canvas.setActiveObject(fImg);
              canvas.requestRenderAll(); setActiveTool('select'); setGlobalLoading(null);
            };
            imgElement.onerror = () => setGlobalLoading(null);
            imgElement.src = data;
          };
          reader.onerror = () => setGlobalLoading(null);
          reader.readAsDataURL(file);
        } else { setActiveTool('select'); }
      };
      input.click();
    } else if (tool === 'eyedropper') {
      const canvasEl = canvas.getElement();
      canvasEl.style.cursor = 'crosshair';
      const pickColor = (e: MouseEvent) => {
        const rect = canvasEl.getBoundingClientRect();
        const x = Math.round((e.clientX - rect.left) * (canvasEl.width / rect.width));
        const y = Math.round((e.clientY - rect.top) * (canvasEl.height / rect.height));
        const ctx = canvasEl.getContext('2d');
        if (ctx) {
          const px = ctx.getImageData(x, y, 1, 1).data;
          const hex = '#' + [px[0], px[1], px[2]].map(v => v.toString(16).padStart(2, '0')).join('');
          navigator.clipboard.writeText(hex).catch(() => {});
          const notif = document.createElement('div');
          notif.style.cssText = 'position:fixed;bottom:30px;left:50%;transform:translateX(-50%);background:var(--bg-3);border:1px solid var(--bg-8);color:#fff;padding:8px 16px;border-radius:6px;font-size:12px;z-index:9999;font-family:monospace;display:flex;align-items:center;gap:8px';
          notif.innerHTML = `<span style="width:14px;height:14px;background:${hex};border-radius:3px;display:inline-block;border:1px solid var(--text-6)"></span> Copied: <b>${hex}</b>`;
          document.body.appendChild(notif);
          setTimeout(() => notif.remove(), 2500);
        }
        canvasEl.style.cursor = 'default';
        setActiveTool('select');
      };
      canvasEl.addEventListener('click', pickColor, { once: true });
    } else if (tool === 'hand') {
      canvas.selection = false;
      canvas.defaultCursor = 'grab';
      canvas.hoverCursor = 'grab';
      canvas.requestRenderAll();
    } else if (tool === 'marquee') {
      canvas.selection = true;
      canvas.defaultCursor = 'crosshair';
      canvas.hoverCursor = 'crosshair';
      canvas.requestRenderAll();
    } else if (tool === 'brush' || tool === 'eraser') {
      canvas.isDrawingMode = true;
      if (tool === 'eraser' && (fabric as any).EraserBrush) {
         canvas.freeDrawingBrush = new (fabric as any).EraserBrush(canvas);
      } else if (!canvas.freeDrawingBrush || canvas.freeDrawingBrush.constructor.name !== 'PencilBrush') {
         canvas.freeDrawingBrush = new fabric.PencilBrush(canvas);
      }
      if (canvas.freeDrawingBrush) {
        if (tool === 'brush') {
           canvas.freeDrawingBrush.color = primaryColor;
           canvas.freeDrawingBrush.width = 5;
        } else {
           // Fallback to white if no EraserBrush
           if (!(fabric as any).EraserBrush) {
               canvas.freeDrawingBrush.color = '#ffffff';
           }
           canvas.freeDrawingBrush.width = 20;
        }
      }
    }
  };

  const activeZoom = activeDocId ? (zoomMap[activeDocId] || 1) : 1;

  const handleRemoveBackground = async () => {
    const canvas = getActiveCanvas();
    if (!canvas) return;
    const activeObj = canvas.getActiveObject();
    if (!activeObj || (activeObj as any).type !== 'image') {
      alert("Please select an image first to remove its background.");
      return;
    }
    setGlobalLoading('Removing background. This may take a moment...');
    try {
      const { removeBackground } = await import('@imgly/background-removal');
      const imgEl = (activeObj as fabric.Image).getElement() as HTMLImageElement;

      // Convert to blob
      const c = document.createElement('canvas');
      c.width = imgEl.naturalWidth || imgEl.width;
      c.height = imgEl.naturalHeight || imgEl.height;
      c.getContext('2d')?.drawImage(imgEl, 0, 0);
      const blob = await new Promise<Blob>((res) => c.toBlob(b => res(b!), 'image/png'));

      const resultBlob = await removeBackground(blob);
      const url = URL.createObjectURL(resultBlob);

      // Replace image element
      const newImg = new Image();
      newImg.onload = () => {
        const ImgClass = (fabric as any).Image || (fabric as any).FabricImage;
        const newFimg = new ImgClass(newImg);
        newFimg.set({
          left: activeObj.left,
          top: activeObj.top,
          scaleX: activeObj.scaleX,
          scaleY: activeObj.scaleY,
          angle: activeObj.angle,
        });
        canvas.remove(activeObj);
        canvas.add(newFimg);
        canvas.setActiveObject(newFimg);
        canvas.requestRenderAll();
        setGlobalLoading(null);
      };
      newImg.src = url;
    } catch (err) {
      console.error('BG removal failed', err);
      setGlobalLoading(null);
      alert('Background removal failed. Please try again.');
    }
  };

  // Applies a filter, replacing any existing filter of the same type instead of stacking
  // (stacking caused repeated Filter > Blur/Sharpen clicks to compound indefinitely)
  const applyImageFilter = (activeObj: any, filterType: string, filter: any) => {
    if (!activeObj.filters) activeObj.filters = [];
    const idx = activeObj.filters.findIndex((f: any) => f && f.type === filterType);
    if (idx >= 0) activeObj.filters[idx] = filter;
    else activeObj.filters.push(filter);
    activeObj.applyFilters();
  };

  const handleBlur = () => {
    const canvas = getActiveCanvas();
    if (!canvas) return;
    const activeObj = canvas.getActiveObject();
    if (!activeObj || (activeObj as any).type !== 'image') {
      alert("Please select an image layer first.");
      return;
    }
    const filter = new (fabric as any).Image.filters.Blur({ blur: 0.1 });
    applyImageFilter(activeObj, 'Blur', filter);
    canvas.requestRenderAll();
  };

  const handleSharpen = () => {
    const canvas = getActiveCanvas();
    if (!canvas) return;
    const activeObj = canvas.getActiveObject();
    if (!activeObj || (activeObj as any).type !== 'image') {
      alert("Please select an image layer first.");
      return;
    }
    const filter = new (fabric as any).Image.filters.Convolute({
      matrix: [ 0, -1,  0,
               -1,  5, -1,
                0, -1,  0 ]
    });
    applyImageFilter(activeObj, 'Convolute', filter);
    canvas.requestRenderAll();
  };

  return (
    <div className="h-screen w-screen flex flex-col bg-[var(--color-background)] text-[var(--color-foreground)] overflow-hidden relative">
      {/* ─── Mobile Header ─── */}
      <div className="flex md:hidden h-14 bg-[var(--bg-3)] border-b border-[var(--bg-0)] items-center justify-between px-3 shrink-0 z-50">
        <div className="flex items-center gap-2">
          <img src={`${import.meta.env.BASE_URL}logo.png`} alt="TE" className="h-6 w-6 rounded" />
          <div className="flex flex-col">
            <span className="text-[13px] font-bold text-white tracking-wide">
              {activeDocId ? (documents.find(d => d.id === activeDocId)?.name || 'Untitled') : 'Tea Design'}
            </span>
            {activeDocId && (
              <span className="text-[10px] text-[var(--text-4)]">
                {documents.find(d => d.id === activeDocId)?.width} × {documents.find(d => d.id === activeDocId)?.height} px
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1">
           <button onClick={handleUndo} className="p-2 text-[var(--text-1)] hover:text-white cursor-pointer"><Undo2 size={20}/></button>
           <button onClick={handleRedo} className="p-2 text-[var(--text-1)] hover:text-white cursor-pointer"><Redo2 size={20}/></button>
           <button onClick={() => setShowMobileRightPanel(!showMobileRightPanel)} className={`p-2 cursor-pointer ${showMobileRightPanel ? 'text-[var(--color-accent)]' : 'text-[var(--text-1)] hover:text-white'}`}><Layers size={20}/></button>
        </div>
      </div>

      {/* ─── Custom Title Bar (Frameless Window) ─── */}
      <div
        className="hidden md:flex h-9 bg-[var(--bg-3)] border-b border-[var(--bg-0)] items-center shrink-0 relative z-50 select-none"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      >
        {/* Left: Logo + App Name + Menus — no-drag zone */}
        <div className="flex items-center h-full" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          {/* Logo */}
          <div className="flex items-center gap-1.5 px-3 h-full border-r border-[var(--bg-4)]">
            <img src={`${import.meta.env.BASE_URL}logo.png`} alt="TE" className="h-4 w-4 rounded" />
            <span className="text-[10px] font-bold text-[var(--text-6)] tracking-widest uppercase">Tea</span>
          </div>

          {/* Menu items */}
          {[
            { title: 'File', items: [
              { label: 'New...', shortcut: 'Ctrl+N', onClick: () => setShowNewDocModal(true) },
              { label: 'Open Project...', shortcut: 'Ctrl+O', onClick: () => handleOpenProject() },
              { divider: true, label: '', onClick: () => {} },
              { label: 'Save Project', shortcut: 'Ctrl+S', onClick: () => handleSaveProject() },
              { label: 'Export PNG', onClick: () => handleExport('png') },
              { label: 'Export JPG', onClick: () => handleExport('jpeg') }
            ]},
            { title: 'Edit', items: [
              { label: 'Undo', shortcut: 'Ctrl+Z', onClick: handleUndo },
              { label: 'Redo', shortcut: 'Ctrl+Y', onClick: handleRedo }
            ]},
            { title: 'Image', items: [
              { label: 'Canvas Size...', onClick: () => {
                if (activeDocId) setShowCanvasSizeModal(true);
                else alert('Please open a document first.');
              }}
            ]},
            { title: 'Layer', items: [
              { label: 'New Layer', onClick: () => handleToolClick('rect') }
            ]},
            { title: 'Filter', items: [
              { label: 'Blur', onClick: handleBlur },
              { label: 'Sharpen', onClick: handleSharpen },
              { label: 'Color Adjust', onClick: () => { if (activeDocId) setShowColorAdjustModal(true); else alert('Open a document first'); } }
            ]},
            { title: 'AI', items: [
              { label: 'Remove Background', onClick: handleRemoveBackground },
              // Magic Eraser / Generative Fill need a real inpainting API (and a key/account
              // to call it with) that this build doesn't have wired up — rather than fake a
              // success animation, they're honestly disabled until that's in place.
              { label: 'Magic Eraser', onClick: () => {}, disabled: true, badge: 'Soon' },
              { label: 'Generative Fill', onClick: () => {}, disabled: true, badge: 'Soon' }
            ]},
            { title: 'Help', items: [
              { label: 'Keyboard Shortcuts', onClick: () => setShowShortcutsModal(true) },
              { label: 'About Tea Design In', onClick: () => setShowAboutModal(true) }
            ]}
          ].map(m => (
            <DropdownMenu key={m.title} title={m.title} items={m.items} />
          ))}

          {/* Mode Switcher */}
          <div className="ml-4 flex items-center bg-[var(--bg-1)] border border-[var(--bg-5)] rounded p-0.5" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
            <button
              onClick={() => setAppMode('main')}
              className={`px-3 py-1 rounded-sm text-[11px] font-medium transition-colors cursor-pointer ${appMode === 'main' ? 'bg-[var(--bg-8)] text-white shadow' : 'text-[var(--text-5)] hover:text-[var(--text-2)]'}`}
            >
              Main Mode
            </button>
            <button
              onClick={() => setAppMode('mockup')}
              className={`px-3 py-1 rounded-sm text-[11px] font-medium transition-colors cursor-pointer ${appMode === 'mockup' ? 'bg-[var(--color-accent)] text-white shadow' : 'text-[var(--text-5)] hover:text-[var(--text-2)]'}`}
            >
              Mockup Mode
            </button>
          </div>
        </div>

        {/* Center: Document Title — draggable */}
        <div className="absolute left-1/2 -translate-x-1/2 flex items-center gap-2 pointer-events-none">
          {activeDocId ? (
            <>
              <span className="text-[12px] text-[var(--text-4)] font-medium">
                {documents.find(d => d.id === activeDocId)?.name || 'Untitled'}
              </span>
              <span className="text-[10px] text-[var(--text-7)] bg-[var(--bg-3)] border border-[var(--bg-6)] rounded px-1.5 py-0.5">
                {documents.find(d => d.id === activeDocId)?.width} × {documents.find(d => d.id === activeDocId)?.height} px
              </span>
            </>
          ) : (
            <span className="text-[11px] text-[var(--text-7)] tracking-[0.2em] uppercase font-medium">Tea Design In</span>
          )}
        </div>

        {/* Right: Zoom + Panel + Window Controls — no-drag */}
        <div className="flex items-center ml-auto h-full" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          {/* Zoom */}
          <div className="flex items-center gap-0.5 px-2">
            <button onClick={() => activeDocId && handleZoom(activeDocId, 1 / 1.1)} disabled={!activeDocId}
              className="text-[var(--text-6)] hover:text-white disabled:opacity-20 cursor-pointer p-1 rounded hover:bg-[var(--bg-5)] transition-colors" title="Zoom Out" aria-label="Zoom Out">
              <ZoomOut size={13} />
            </button>
            <span className="text-[11px] text-[var(--text-5)] w-9 text-center cursor-pointer hover:text-white font-mono"
              onClick={() => activeDocId && handleZoom(activeDocId, 'reset')}>
              {Math.round(activeZoom * 100)}%
            </span>
            <button onClick={() => activeDocId && handleZoom(activeDocId, 1.1)} disabled={!activeDocId}
              className="text-[var(--text-6)] hover:text-white disabled:opacity-20 cursor-pointer p-1 rounded hover:bg-[var(--bg-5)] transition-colors" title="Zoom In" aria-label="Zoom In">
              <ZoomIn size={13} />
            </button>
          </div>

          {/* Theme Toggle */}
          <button onClick={() => setTheme(t => t === 'dark' ? 'light' : 'dark')}
            className="w-8 h-full flex items-center justify-center cursor-pointer border-l border-[var(--bg-3)] text-[var(--bg-9)] hover:text-[var(--text-3)] transition-colors"
            title={theme === 'dark' ? 'Switch to Light Theme' : 'Switch to Dark Theme'}>
            {theme === 'dark' ? <Moon size={14} /> : <Sun size={14} />}
          </button>

          {/* Rulers Toggle */}
          <button onClick={() => setShowRulers(!showRulers)}
            className={`w-8 h-full flex items-center justify-center cursor-pointer border-l border-[var(--bg-4)] transition-colors ${showRulers ? 'text-[var(--color-accent)]' : 'text-[var(--bg-9)] hover:text-[var(--text-3)]'}`}
            title="Toggle Rulers" aria-label="Toggle Rulers">
            <RulerIcon size={14} />
          </button>

          {/* Grid Toggle (also enables snap-to-grid while dragging) */}
          <button onClick={() => setShowGrid(!showGrid)}
            className={`w-8 h-full flex items-center justify-center cursor-pointer border-l border-[var(--bg-4)] transition-colors ${showGrid ? 'text-[var(--color-accent)]' : 'text-[var(--bg-9)] hover:text-[var(--text-3)]'}`}
            title="Toggle Grid & Snap" aria-label="Toggle Grid & Snap">
            <Grid3x3 size={14} />
          </button>
          {showGrid && (
            <input
              type="number" min={2} max={500} value={gridSize}
              onChange={e => setGridSize(Math.max(2, Number(e.target.value) || 2))}
              title="Grid spacing (px)"
              aria-label="Grid spacing in pixels"
              className="w-10 bg-[var(--bg-1)] border border-[var(--bg-7)] rounded px-1 py-0.5 text-[10px] text-white outline-none text-center focus:border-[var(--color-accent)] mx-1"
            />
          )}

          {/* Panel Toggle */}
          <button onClick={() => setShowRightPanel(!showRightPanel)}
            className={`w-8 h-full flex items-center justify-center cursor-pointer border-l border-[var(--bg-4)] transition-colors ${showRightPanel ? 'text-[var(--color-accent)]' : 'text-[var(--bg-9)] hover:text-[var(--text-3)]'}`}
            title="Toggle Properties Panel" aria-label="Toggle Properties Panel">
            <PanelRight size={14} />
          </button>

          {/* Separator */}
          <div className="w-px h-4 bg-[var(--bg-4)] mx-1" />

          {/* Window Controls — Minimize / Maximize / Close */}
          <button
            onClick={() => (window as any).electronWindow?.minimize()}
            className="w-11 h-full flex items-center justify-center text-[var(--text-6)] hover:text-white hover:bg-[var(--bg-7)] cursor-pointer transition-colors border-l border-[var(--bg-3)]"
            title="Minimize" aria-label="Minimize">
            <svg width="11" height="1" viewBox="0 0 11 1" fill="currentColor"><rect width="11" height="1"/></svg>
          </button>
          <button
            onClick={() => (window as any).electronWindow?.maximize()}
            className="w-11 h-full flex items-center justify-center text-[var(--text-6)] hover:text-white hover:bg-[var(--bg-7)] cursor-pointer transition-colors border-l border-[var(--bg-3)]"
            title="Maximize / Restore" aria-label="Maximize / Restore">
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1"><rect x="0.5" y="0.5" width="9" height="9"/></svg>
          </button>
          <button
            onClick={() => (window as any).electronWindow?.close()}
            className="w-11 h-full flex items-center justify-center text-[var(--text-6)] hover:text-white hover:bg-[var(--color-danger)] cursor-pointer transition-colors border-l border-[var(--bg-3)]"
            title="Close" aria-label="Close">
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.2"><path d="M1 1 L9 9 M9 1 L1 9"/></svg>
          </button>
        </div>
      </div>

      {/* Tool Settings Bar */}
      <ToolSettingsBar activeTool={activeTool} canvas={getActiveCanvas()} onToolChange={(t) => setActiveTool(t as ToolType)} marqueeShape={activeMarqueeShape} />

      {/* Tabs Bar */}
      <div className="h-8 bg-[var(--bg-4)] flex items-end px-2 border-b border-[var(--color-panel-border)] shrink-0 z-10 relative overflow-x-auto whitespace-nowrap scrollbar-hide" data-dirty-version={dirtyVersion}>
        {documents.map(doc => (
          <div
            key={doc.id}
            onClick={() => setActiveDocId(doc.id)}
            className={`flex items-center justify-between gap-2 px-4 py-1.5 min-w-[120px] max-w-[200px] border-t border-r border-l rounded-t-md cursor-pointer text-xs
              ${activeDocId === doc.id
                ? 'bg-[var(--bg-2)] text-white border-[var(--color-panel-border)] border-b-[var(--bg-2)] -mb-[1px] shadow-[0_-2px_5px_rgba(0,0,0,0.2)]'
                : 'bg-[var(--bg-6)] text-gray-400 border-transparent hover:bg-[var(--bg-7)]'}
            `}
          >
            {dirtyDocsRef.current.has(doc.id) && (
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-accent)] shrink-0" title="Unsaved changes" aria-label="Unsaved changes" />
            )}
            <span className="truncate flex-1 font-medium">{doc.name}</span>
            <button onClick={(e) => closeDocument(doc.id, e)} className="hover:bg-[var(--bg-9)] rounded-sm p-0.5"><X size={12}/></button>
          </div>
        ))}
        <button onClick={() => setShowNewDocModal(true)} className="ml-2 mb-1 p-1 hover:bg-[var(--color-surface-hover)] rounded text-gray-400 hover:text-white cursor-pointer" title="New Document" aria-label="New Document">
          <Plus size={16} />
        </button>
      </div>

      <div className="flex flex-1 overflow-hidden relative flex-col-reverse md:flex-row">
        {/* Left Toolbar */}
        <div className="w-full h-14 md:w-12 md:h-auto bg-[var(--bg-3)] md:bg-[var(--color-panel)] border-t md:border-t-0 md:border-r border-[var(--bg-0)] md:border-[var(--color-panel-border)] flex flex-row md:flex-col items-center py-0 md:py-2 px-2 md:px-0 gap-2 md:gap-1 shrink-0 z-20 overflow-x-auto md:overflow-visible scrollbar-hide relative justify-start md:justify-start">
          {/* Selection & Navigation */}
          <ToolButton icon={<MousePointer2 size={17} />} active={activeTool === 'select'} onClick={() => { setActiveTool('select'); const c = getActiveCanvas(); if(c){ c.selection = true; c.defaultCursor = 'default'; c.hoverCursor = 'move'; c.requestRenderAll(); }}} tooltip="Move Tool (V)" />
          {/* Marquee Group */}
          <div className="relative group">
            <button
              className={`w-9 h-9 flex items-center justify-center rounded cursor-pointer relative ${
                activeTool === 'marquee'
                  ? 'bg-[var(--color-accent)] text-white' 
                  : 'text-[var(--text-2)] hover:text-white hover:bg-[var(--bg-8)]'
              }`}
              onClick={() => handleToolClick('marquee')}
              onContextMenu={(e) => { e.preventDefault(); setShowMarqueeMenu(!showMarqueeMenu); }}
              title="Marquee Tool (M) (Right-click to expand)"
              aria-label="Marquee Tool (right-click to expand)"
            >
              {activeMarqueeShape === 'ellipse' ? <CircleDashed size={17} /> : <SquareDashed size={17} />}
              <div className="absolute bottom-0.5 right-0.5 pointer-events-none opacity-50" style={{ transform: 'rotate(45deg)' }}>
                <div className="w-0 h-0 border-l-[3px] border-l-transparent border-t-[3px] border-t-current border-r-[3px] border-r-transparent" />
              </div>
            </button>

            {showMarqueeMenu && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowMarqueeMenu(false)} onContextMenu={(e) => { e.preventDefault(); setShowMarqueeMenu(false); }} />
                <div className="absolute bottom-full left-0 mb-2 md:left-full md:bottom-auto md:top-0 md:ml-1 md:mb-0 bg-[var(--bg-3)] border border-[var(--bg-8)] rounded-md shadow-xl flex flex-col p-1 z-50 min-w-[150px]">
                  {[
                    { id: 'rect' as const, label: 'Rectangle Select', shortcut: 'M', icon: <SquareDashed size={14} /> },
                    { id: 'ellipse' as const, label: 'Ellipse Select', shortcut: 'M', icon: <CircleDashed size={14} /> }
                  ].map(m => (
                    <button
                      key={m.id}
                      className={`flex items-center gap-3 px-2 py-1.5 rounded text-xs text-left cursor-pointer transition-colors ${
                        activeTool === 'marquee' && activeMarqueeShape === m.id ? 'bg-[var(--bg-8)] text-white' : 'text-[var(--text-1)] hover:bg-[var(--bg-7)] hover:text-white'
                      }`}
                      onClick={() => {
                        setActiveMarqueeShape(m.id);
                        handleToolClick('marquee');
                        setShowMarqueeMenu(false);
                      }}
                    >
                      <div className="flex items-center justify-between w-full">
                        <div className="flex items-center gap-3">
                           {m.icon}
                           <span>{m.label}</span>
                        </div>
                        <span className="text-[10px] text-[var(--text-6)]">{m.shortcut}</span>
                      </div>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
          <ToolButton icon={<Hand size={17} />} active={activeTool === 'hand'} onClick={() => handleToolClick('hand')} tooltip="Hand / Pan Tool (H)" />
          <ToolButton icon={<Crop size={17} />} active={activeTool === 'crop'} onClick={() => handleToolClick('crop')} tooltip="Crop Tool (C)" />
          <ToolButton icon={<Pipette size={17} />} active={activeTool === 'eyedropper'} onClick={() => handleToolClick('eyedropper')} tooltip="Eyedropper / Color Picker (I)" />
          <div className="w-px h-8 md:h-px md:w-8 bg-[var(--bg-8)] md:bg-[var(--color-panel-border)] mx-1 md:mx-0 md:my-0.5 shrink-0" />
          
          {/* Text */}
          <ToolButton icon={<Type size={17} />} active={activeTool === 'text'} onClick={() => handleToolClick('text')} tooltip="Text Tool (T)" />
          <div className="w-px h-8 md:h-px md:w-8 bg-[var(--bg-8)] md:bg-[var(--color-panel-border)] mx-1 md:mx-0 md:my-0.5 shrink-0" />
          
          {/* Shapes Group */}
          <div className="relative group">
            <button
              className={`w-9 h-9 flex items-center justify-center rounded cursor-pointer relative ${
                ['rect','circle','triangle','line','star','polygon'].includes(activeTool) 
                  ? 'bg-[var(--color-accent)] text-white' 
                  : 'text-[var(--text-2)] hover:text-white hover:bg-[var(--bg-8)]'
              }`}
              onClick={() => handleToolClick(activeShapeGroupTool)}
              onContextMenu={(e) => { e.preventDefault(); setShowShapeMenu(!showShapeMenu); }}
              title="Shape Tools (Right-click to expand)"
              aria-label="Shape Tools (right-click to expand)"
            >
              {activeShapeGroupTool === 'rect' && <Square size={17} />}
              {activeShapeGroupTool === 'circle' && <Circle size={17} />}
              {activeShapeGroupTool === 'triangle' && <Triangle size={17} />}
              {activeShapeGroupTool === 'line' && <Minus size={17} />}
              {activeShapeGroupTool === 'star' && <Star size={17} />}
              {activeShapeGroupTool === 'polygon' && <Pentagon size={17} />}
              <div className="absolute bottom-0.5 right-0.5 pointer-events-none opacity-50" style={{ transform: 'rotate(45deg)' }}>
                <div className="w-0 h-0 border-l-[3px] border-l-transparent border-t-[3px] border-t-current border-r-[3px] border-r-transparent" />
              </div>
            </button>

            {/* Shape Menu Popover */}
            {showShapeMenu && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowShapeMenu(false)} onContextMenu={(e) => { e.preventDefault(); setShowShapeMenu(false); }} />
                <div className="absolute bottom-full left-0 mb-2 md:left-full md:bottom-auto md:top-0 md:ml-1 md:mb-0 bg-[var(--bg-3)] border border-[var(--bg-8)] rounded-md shadow-xl flex flex-col p-1 z-50 min-w-[140px]">
                  {[
                    { id: 'rect', label: 'Rectangle', icon: <Square size={14} /> },
                    { id: 'circle', label: 'Ellipse', icon: <Circle size={14} /> },
                    { id: 'triangle', label: 'Triangle', icon: <Triangle size={14} /> },
                    { id: 'polygon', label: 'Polygon', icon: <Pentagon size={14} /> },
                    { id: 'line', label: 'Line', icon: <Minus size={14} /> },
                    { id: 'star', label: 'Custom Shape', icon: <Star size={14} /> }
                  ].map(shape => (
                    <button
                      key={shape.id}
                      className={`flex items-center gap-3 px-2 py-1.5 rounded text-xs text-left cursor-pointer transition-colors ${
                        activeShapeGroupTool === shape.id ? 'bg-[var(--bg-8)] text-white' : 'text-[var(--text-1)] hover:bg-[var(--bg-7)] hover:text-white'
                      }`}
                      onClick={() => {
                        setActiveShapeGroupTool(shape.id as ToolType);
                        handleToolClick(shape.id as ToolType);
                        setShowShapeMenu(false);
                      }}
                    >
                      {shape.icon}
                      <span>{shape.label} Tool</span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
          
          <div className="w-px h-8 md:h-px md:w-8 bg-[var(--bg-8)] md:bg-[var(--color-panel-border)] mx-1 md:mx-0 md:my-0.5 shrink-0" />
          
          {/* Drawing */}
          <ToolButton icon={<Paintbrush size={17} />} active={activeTool === 'brush'} onClick={() => handleToolClick('brush')} tooltip="Brush Tool (B)" />
          <ToolButton icon={<Eraser size={17} />} active={activeTool === 'eraser'} onClick={() => handleToolClick('eraser')} tooltip="Eraser Tool (E)" />

          <div className="w-px h-8 md:h-px md:w-8 bg-[var(--bg-8)] md:bg-[var(--color-panel-border)] mx-1 md:mx-0 md:my-0.5 shrink-0" />
          
          {/* Media */}
          <ToolButton icon={<ImageIcon size={17} />} onClick={() => handleToolClick('image')} tooltip="Import Image" />

          {/* Spacer to push colors to bottom on desktop */}
          <div className="hidden md:block flex-1" />

          {/* Colors */}
          <div className="flex md:flex-col items-center gap-1 mt-0 md:mt-2 px-1">
             <div className="relative w-6 h-6 md:w-7 md:h-7 shrink-0 group">
                <input type="color" value={secondaryColor} onChange={(e) => setSecondaryColor(e.target.value)} className="absolute inset-0 opacity-0 cursor-pointer z-10 w-full h-full" title="Set Background Color" aria-label="Set Background Color" />
                <div className="absolute right-0 bottom-0 w-4 h-4 md:w-5 md:h-5 rounded border border-[var(--text-6)] shadow-sm z-0 pointer-events-none" style={{ backgroundColor: secondaryColor }} />
                
                <input type="color" value={primaryColor} onChange={(e) => {
                    setPrimaryColor(e.target.value);
                    const canvas = getActiveCanvas();
                    if (canvas && canvas.freeDrawingBrush && activeTool === 'brush') {
                        canvas.freeDrawingBrush.color = e.target.value;
                    }
                }} className="absolute inset-0 opacity-0 cursor-pointer z-20 w-3/4 h-3/4" title="Set Foreground Color" aria-label="Set Foreground Color" />
                <div className="absolute left-0 top-0 w-4 h-4 md:w-5 md:h-5 rounded border border-[#fff] shadow-sm z-10 pointer-events-none" style={{ backgroundColor: primaryColor }} />
             </div>
             <button onClick={() => {
                const temp = primaryColor;
                setPrimaryColor(secondaryColor);
                setSecondaryColor(temp);
                const canvas = getActiveCanvas();
                if (canvas && canvas.freeDrawingBrush && activeTool === 'brush') {
                    canvas.freeDrawingBrush.color = secondaryColor;
                }
             }} className="p-0.5 text-[var(--text-5)] hover:text-white cursor-pointer" title="Swap Colors (X)" aria-label="Swap Colors (X)">
                <ArrowUpDown size={12} />
             </button>
          </div>
        </div>

        {/* Main Canvas Area */}
        <div className="flex-1 bg-[var(--bg-2)] overflow-auto p-12 relative flex"
             onDragOver={(e) => e.preventDefault()}
             onDrop={(e) => {
               e.preventDefault();
               if (!activeDocId) return;
               const canvas = getActiveCanvas();
               if (!canvas) return;
               const file = e.dataTransfer.files?.[0];
               if (file && file.type.startsWith('image/')) {
                 const reader = new FileReader();
                 reader.onload = (f) => {
                   const data = f.target?.result as string;
                   const imgElement = new Image();
                   imgElement.onload = () => {
                     const ImgClass = (fabric as any).Image || (fabric as any).FabricImage;
                     const fImg = new ImgClass(imgElement);
                     const doc = documents.find(d => d.id === activeDocId);
                     const docWidth = doc?.width || 800;
                     const docHeight = doc?.height || 800;
                     const maxW = docWidth * 0.8;
                     const maxH = docHeight * 0.8;
                     const scaleX = maxW / fImg.width;
                     const scaleY = maxH / fImg.height;
                     const scale = Math.min(scaleX, scaleY, 1);
                     fImg.scale(scale);
                     fImg.set({
                       left: (docWidth / 2 - (fImg.width * scale) / 2),
                       top: (docHeight / 2 - (fImg.height * scale) / 2),
                     });
                     canvas.add(fImg);
                     canvas.setActiveObject(fImg);
                     canvas.requestRenderAll();
                   };
                   imgElement.src = data;
                 };
                 reader.readAsDataURL(file);
               }
             }}
             style={{
               backgroundImage: `linear-gradient(45deg, var(--bg-3) 25%, transparent 25%), linear-gradient(-45deg, var(--bg-3) 25%, transparent 25%), linear-gradient(45deg, transparent 75%, var(--bg-3) 75%), linear-gradient(-45deg, transparent 75%, var(--bg-3) 75%)`,
               backgroundSize: '20px 20px',
               backgroundPosition: '0 0, 0 10px, 10px -10px, -10px 0px'
             }}>
          
          {documents.length === 0 ? (
            <div className="m-auto flex flex-col items-center justify-center text-gray-500 bg-[var(--color-panel)] p-12 rounded-lg shadow-2xl border border-[var(--color-panel-border)] transition-transform duration-500 hover:scale-[1.02]">
              <img src={`${import.meta.env.BASE_URL}logo.png`} alt="TE Logo" className="h-24 w-24 mb-6 drop-shadow-[0_0_15px_rgba(0,168,255,0.3)]" />
              <h1 className="text-2xl text-white font-bold tracking-widest uppercase mb-2">Welcome to Tea Design In</h1>
              <p className="text-gray-400 font-medium tracking-wide mb-8">Start designing beautiful printing templates.</p>
              <div className="flex gap-4">
                <button onClick={() => setShowNewDocModal(true)} className="px-6 py-3 bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] text-white rounded text-sm cursor-pointer shadow-[0_0_15px_rgba(0,168,255,0.4)] transition-all font-medium">Create New Project</button>
                <button onClick={handleOpenProject} className="px-6 py-3 bg-transparent border border-[var(--color-panel-border)] hover:border-gray-500 hover:bg-[var(--bg-8)] text-gray-300 rounded text-sm cursor-pointer transition-all font-medium">Open Project...</button>
              </div>
            </div>
          ) : (
            <div className="m-auto relative shadow-2xl ring-1 ring-white/10 transition-transform origin-center" style={{ boxShadow: '0 0 40px rgba(0,0,0,0.8)' }}>
              {documents.map(doc => {
                const currentZoom = zoomMap[doc.id] || 1;
                return (
                  <div key={doc.id} style={{ display: activeDocId === doc.id ? 'block' : 'none' }}>
                    {/* Ruler track sizes collapse to 0 when rulers are off — the grid always
                        has the same 4 cells so toggling never reshuffles child placement. */}
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: `${showRulers ? 18 : 0}px auto`,
                      gridTemplateRows: `${showRulers ? 18 : 0}px auto`,
                    }}>
                      <div className="bg-[var(--bg-3)] border-r border-b border-[var(--bg-8)] overflow-hidden" />
                      <div className="overflow-hidden">
                        {showRulers && <Ruler orientation="horizontal" length={doc.width} zoom={currentZoom} thickness={18} />}
                      </div>
                      <div className="overflow-hidden">
                        {showRulers && <Ruler orientation="vertical" length={doc.height} zoom={currentZoom} thickness={18} />}
                      </div>
                      <div className="bg-white relative" style={{ width: doc.width * currentZoom, height: doc.height * currentZoom }}>
                        <canvas id={`canvas-${doc.id}`} />
                        {showGrid && (
                          <div
                            className="absolute inset-0 pointer-events-none"
                            style={{
                              backgroundImage: 'linear-gradient(to right, rgba(0,0,0,0.15) 1px, transparent 1px), linear-gradient(to bottom, rgba(0,0,0,0.15) 1px, transparent 1px)',
                              backgroundSize: `${gridSize * currentZoom}px ${gridSize * currentZoom}px`,
                            }}
                          />
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right Panel (Layers & Properties or Mockup Preview) */}
        <div
          className={`${showMobileRightPanel ? 'fixed inset-0 z-50 flex flex-col bg-black/60 pt-14 backdrop-blur-sm' : 'hidden md:flex'} ${!showRightPanel ? 'md:hidden' : ''} md:relative md:inset-auto md:bg-transparent md:pt-0`}
          style={{ '--panel-w': `${rightPanelWidth}px` } as React.CSSProperties}
        >
          {/* Resize handle — desktop only; drag left/right to widen or narrow the panel */}
          {showRightPanel && (
            <div
              onMouseDown={startRightPanelResize}
              title="Drag to resize panel"
              aria-hidden="true"
              className="hidden md:block absolute left-0 top-0 bottom-0 w-1.5 -ml-0.5 cursor-col-resize z-10 hover:bg-[var(--color-accent)]/40 transition-colors"
            />
          )}
          <div className="flex-1 flex flex-col overflow-hidden bg-[var(--color-panel)] rounded-t-xl md:rounded-none w-full md:w-[var(--panel-w)] border-t md:border-t-0 md:border-l border-[var(--color-panel-border)] shadow-2xl md:shadow-none animate-in slide-in-from-bottom md:slide-in-from-right">
            {/* Mobile Header for Right Panel */}
            <div className="flex md:hidden items-center justify-between px-4 py-3 border-b border-[var(--color-panel-border)]">
               <span className="font-semibold text-white">{appMode === 'main' ? 'Layers & Properties' : 'Mockup Workspace'}</span>
               <button onClick={() => setShowMobileRightPanel(false)} className="p-1 text-gray-400 hover:text-white cursor-pointer"><X size={20}/></button>
            </div>
            
            {appMode === 'main' ? (
              <div className="flex-1 overflow-y-auto flex flex-col">
                <PropertiesPanel canvas={getActiveCanvas()} />
                <LayersPanel canvas={getActiveCanvas()} />
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto w-full md:w-[var(--panel-w)]">
                {activeDocId && (
                  <MockupWorkspace 
                    canvas={getActiveCanvas()} 
                    mockups={documents.find(d => d.id === activeDocId)?.mockups || []}
                    activeMockupId={documents.find(d => d.id === activeDocId)?.activeMockupId || null}
                    onChange={(mockups, activeMockupId) => updateDocumentMockups(activeDocId, mockups, activeMockupId)}
                  />
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ─── Status Bar (Photoshop style) ─── */}
      <div className="hidden md:block">
        <StatusBar
          canvas={getActiveCanvas()}
          activeDoc={documents.find(d => d.id === activeDocId) || null}
          zoom={activeZoom}
        />
      </div>

      {/* New Document Modal */}
      {showNewDocModal && (
        <NewDocumentModal 
          onClose={() => setShowNewDocModal(documents.length > 0 ? false : false)} 
          onCreate={handleCreateDocument} 
        />
      )}

      {/* Canvas Size Modal */}
      {showCanvasSizeModal && (
        <CanvasSizeModal 
          onClose={() => setShowCanvasSizeModal(false)}
          onResize={(newW, newH) => {
             if (activeDocId) {
                setDocuments(docs => docs.map(d => d.id === activeDocId ? { ...d, width: newW, height: newH } : d));
                const canvas = fabricCanvasesRef.current[activeDocId];
                if (canvas) {
                   canvas.setDimensions({ width: newW, height: newH });
                   
                   // Update clip path (which acts as the document boundary)
                   if (canvas.clipPath) {
                       const rect = canvas.clipPath as fabric.Rect;
                       rect.set({ width: newW, height: newH, left: newW/2, top: newH/2 });
                       canvas.clipPath = rect;
                   }

                   // Update background rect if it exists
                   const bgRect = canvas.getObjects().find(o => (o as any).id === 'bg-rect');
                   if (bgRect) {
                       bgRect.set({ width: newW, height: newH });
                   }

                   canvas.renderAll();
                }
                setShowCanvasSizeModal(false);
             }
          }}
          initialWidth={documents.find(d => d.id === activeDocId)?.width || 1920}
          initialHeight={documents.find(d => d.id === activeDocId)?.height || 1080}
        />
      )}

      {/* Color Adjust Modal */}
      {showColorAdjustModal && (
        <ColorAdjustModal
          onClose={() => setShowColorAdjustModal(false)}
          canvas={activeDocId ? fabricCanvasesRef.current[activeDocId] : null}
        />
      )}

      {/* Keyboard Shortcuts Modal */}
      {showShortcutsModal && (
        <ShortcutsModal onClose={() => setShowShortcutsModal(false)} />
      )}

      {/* About Modal */}
      {showAboutModal && (
        <AboutModal onClose={() => setShowAboutModal(false)} />
      )}

      {/* Unsaved-changes: tab close confirmation */}
      {confirmCloseDocId && (
        <ConfirmModal
          title="Unsaved Changes"
          message={`"${documents.find(d => d.id === confirmCloseDocId)?.name || 'This document'}" has unsaved changes. Close it anyway?`}
          confirmLabel="Close Anyway"
          onConfirm={() => { performCloseDocument(confirmCloseDocId); setConfirmCloseDocId(null); }}
          onCancel={() => setConfirmCloseDocId(null)}
        />
      )}

      {/* Unsaved-changes: app quit confirmation (Electron) */}
      {appCloseConfirm && (
        <ConfirmModal
          title="Unsaved Changes"
          message={`You have ${dirtyDocsRef.current.size} document(s) with unsaved changes. Quit anyway?`}
          confirmLabel="Quit Anyway"
          onConfirm={() => { setAppCloseConfirm(false); (window as any).electronWindow?.confirmClose?.(); }}
          onCancel={() => setAppCloseConfirm(false)}
        />
      )}

      {/* Autosave recovery prompt */}
      {pendingRestore && (
        <RestoreSessionModal
          entries={pendingRestore}
          onRestore={handleRestoreSession}
          onDiscard={handleDiscardSession}
        />
      )}

      {/* ─── Global Loading Overlay ─── */}
      {globalLoading && (
        <div className="absolute inset-0 z-[999] bg-black/70 backdrop-blur-sm flex flex-col items-center justify-center gap-5">
          {/* Animated spinner */}
          <div className="relative w-20 h-20">
            <div className="absolute inset-0 rounded-full border-4 border-[var(--color-accent)]/20" />
            <div className="absolute inset-0 rounded-full border-4 border-t-[var(--color-accent)] border-r-transparent border-b-transparent border-l-transparent animate-spin" />
            <div className="absolute inset-2 rounded-full border-2 border-t-transparent border-r-[#7b2ff7]/60 border-b-transparent border-l-transparent animate-spin" style={{ animationDirection: 'reverse', animationDuration: '0.8s' }} />
            <div className="absolute inset-0 flex items-center justify-center">
              <img src={`${import.meta.env.BASE_URL}logo.png`} className="w-8 h-8 rounded opacity-80" />
            </div>
          </div>
          <div className="text-center">
            <p className="text-white text-sm font-medium">{globalLoading}</p>
            <p className="text-[var(--text-6)] text-xs mt-1">Please wait...</p>
          </div>
        </div>
      )}
    </div>
  );
}
// Modal Component for New Document
function NewDocumentModal({ onClose, onCreate }: { onClose: () => void, onCreate: (w: number, h: number, background: 'White' | 'Transparent' | 'Black') => void }) {
  const [width, setWidth] = useState(1920);
  const [height, setHeight] = useState(1080);
  const [resolution, setResolution] = useState(300);
  const [unit, setUnit] = useState('Pixels');
  const [background, setBackground] = useState<'White' | 'Transparent' | 'Black'>('White');
  const [activeTab, setActiveTab] = useState('Print');
  
  const presets = {
    'Print': [
      { name: 'A4', w: 2480, h: 3508 },
      { name: 'Letter', w: 2550, h: 3300 },
      { name: 'A5', w: 1748, h: 2480 }
    ],
    'Merch': [
      { name: 'Mug (Square)', w: 1050, h: 1050 },
      { name: 'Mug (Wrap)', w: 2550, h: 1050 },
      { name: 'T-Shirt', w: 2000, h: 2000 }
    ],
    'Web': [
      { name: 'FHD (1080p)', w: 1920, h: 1080 },
      { name: 'Instagram Post', w: 1080, h: 1080 },
      { name: 'Instagram Story', w: 1080, h: 1920 }
    ]
  };

  const currentPresets = presets[activeTab as keyof typeof presets] || presets['Print'];

  return (
    <div className="absolute inset-0 bg-black/70 flex items-center justify-center z-50 backdrop-blur-md">
      <div className="bg-[var(--bg-7)] rounded-xl w-[850px] h-[550px] shadow-[0_0_50px_rgba(0,0,0,0.5)] flex flex-col overflow-hidden border border-[var(--bg-9)] text-gray-200">
        
        {/* Top Header & Tabs */}
        <div className="flex flex-col bg-[var(--bg-8)] border-b border-[var(--bg-9)]">
          <div className="flex justify-between items-center p-4 pb-2">
            <h2 className="font-semibold text-lg text-white">New Document</h2>
            <button onClick={onClose} className="text-gray-400 hover:text-white cursor-pointer"><X size={20} /></button>
          </div>
          <div className="flex px-4 gap-6 text-sm font-medium">
            {Object.keys(presets).map(tab => (
              <button 
                key={tab} 
                onClick={() => setActiveTab(tab)}
                className={`py-2 border-b-2 cursor-pointer transition-colors ${activeTab === tab ? 'border-[var(--color-accent)] text-white' : 'border-transparent text-gray-400 hover:text-gray-200'}`}
              >
                {tab}
              </button>
            ))}
          </div>
        </div>

        {/* Main Content Area */}
        <div className="flex flex-1 overflow-hidden bg-[var(--bg-6)]">
          
          {/* Left Side: Preset Grid */}
          <div className="flex-1 p-6 overflow-y-auto">
             <div className="grid grid-cols-3 gap-4">
                {currentPresets.map(p => {
                  const isSelected = width === p.w && height === p.h;
                  // Dynamic icon aspect ratio for visual cue
                  const aspect = p.w / p.h;
                  const iconWidth = aspect > 1 ? 40 : 40 * aspect;
                  const iconHeight = aspect < 1 ? 40 : 40 / aspect;
                  return (
                    <button 
                      key={p.name}
                      onClick={() => { setWidth(p.w); setHeight(p.h); }}
                      className={`bg-[var(--bg-8)] border rounded-lg p-4 flex flex-col items-center justify-center gap-3 cursor-pointer transition-all hover:bg-[var(--bg-8)] hover:shadow-md ${isSelected ? 'border-[var(--color-accent)] ring-1 ring-[var(--color-accent)] bg-[var(--text-7)]' : 'border-[var(--bg-9)]'}`}
                    >
                      <div className="bg-white/10 border border-white/20 shadow-sm rounded-sm flex items-center justify-center" style={{ width: iconWidth, height: iconHeight }}></div>
                      <div className="flex flex-col items-center">
                        <span className="font-medium text-white text-sm">{p.name}</span>
                        <span className="text-xs text-gray-400">{p.w} x {p.h} px</span>
                      </div>
                    </button>
                  );
                })}
             </div>
          </div>

          {/* Right Side: Preset Details Sidebar */}
          <div className="w-[280px] bg-[var(--bg-8)] border-l border-[var(--bg-9)] flex flex-col">
            <div className="p-5 overflow-y-auto flex-1 space-y-5">
              <h3 className="font-semibold text-sm uppercase tracking-wider text-white border-b border-[var(--bg-9)] pb-2">Preset Details</h3>
              
              <div className="space-y-4">
                <div className="flex gap-2">
                  <div className="flex-1 space-y-1">
                    <label className="text-xs text-gray-400 font-medium">Width</label>
                    <input type="number" value={width} onChange={e => setWidth(Number(e.target.value))} className="w-full bg-[var(--bg-5)] border border-[var(--bg-9)] rounded px-3 py-1.5 text-white text-sm outline-none focus:border-[var(--color-accent)]" />
                  </div>
                  <div className="flex-1 space-y-1">
                    <label className="text-xs text-gray-400 font-medium">Units</label>
                    <select value={unit} onChange={e => setUnit(e.target.value)} className="w-full bg-[var(--bg-5)] border border-[var(--bg-9)] rounded px-3 py-1.5 text-white text-sm outline-none focus:border-[var(--color-accent)] cursor-pointer">
                      <option>Pixels</option>
                      <option disabled>Inches</option>
                      <option disabled>Centimeters</option>
                    </select>
                  </div>
                </div>

                <div className="flex gap-2 items-end">
                  <div className="flex-1 space-y-1">
                    <label className="text-xs text-gray-400 font-medium">Height</label>
                    <input type="number" value={height} onChange={e => setHeight(Number(e.target.value))} className="w-full bg-[var(--bg-5)] border border-[var(--bg-9)] rounded px-3 py-1.5 text-white text-sm outline-none focus:border-[var(--color-accent)]" />
                  </div>
                  <div className="flex gap-1 mb-0.5">
                    {/* Neither button is "active" for a square canvas (width === height) — orientation is meaningless there */}
                    <button onClick={() => { if(width > height) { setWidth(height); setHeight(width); } }} className={`p-1.5 rounded border cursor-pointer ${width < height ? 'bg-[var(--text-6)] border-[var(--text-5)] text-white shadow-inner' : 'bg-[var(--bg-5)] border-[var(--bg-9)] text-gray-400 hover:text-white hover:bg-[var(--bg-8)]'}`} title="Portrait" aria-label="Portrait"><Square size={16} /></button>
                    <button onClick={() => { if(height > width) { setWidth(height); setHeight(width); } }} className={`p-1.5 rounded border cursor-pointer ${width > height ? 'bg-[var(--text-6)] border-[var(--text-5)] text-white shadow-inner' : 'bg-[var(--bg-5)] border-[var(--bg-9)] text-gray-400 hover:text-white hover:bg-[var(--bg-8)]'}`} title="Landscape" aria-label="Landscape"><Square size={16} className="rotate-90" /></button>
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-xs text-gray-400 font-medium">Resolution</label>
                  <div className="flex gap-2">
                    <input type="number" value={resolution} onChange={e => setResolution(Number(e.target.value))} className="w-2/3 bg-[var(--bg-5)] border border-[var(--bg-9)] rounded px-3 py-1.5 text-white text-sm outline-none focus:border-[var(--color-accent)]" />
                    <span className="text-xs text-gray-400 flex items-center">Pixels/Inch</span>
                  </div>
                </div>
                
                <div className="space-y-1">
                  <label className="text-xs text-gray-400 font-medium">Background Contents</label>
                  <select value={background} onChange={e => setBackground(e.target.value as 'White' | 'Transparent' | 'Black')} className="w-full bg-[var(--bg-5)] border border-[var(--bg-9)] rounded px-3 py-1.5 text-white text-sm outline-none focus:border-[var(--color-accent)] cursor-pointer">
                    <option>White</option>
                    <option>Transparent</option>
                    <option>Black</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="p-4 border-t border-[var(--bg-9)] flex flex-col gap-2 bg-[var(--bg-7)]">
              <button onClick={() => onCreate(width, height, background)} className="w-full py-2.5 bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] text-white rounded font-medium shadow-sm transition-colors cursor-pointer tracking-wide">
                Create
              </button>
              <button onClick={onClose} className="w-full py-2 bg-transparent hover:bg-[var(--bg-9)] text-gray-300 rounded font-medium transition-colors cursor-pointer">
                Close
              </button>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}

// Simple ToolButton Componentt
function ToolButton({ icon, active = false, tooltip, onClick }: { icon: React.ReactNode, active?: boolean, tooltip?: string, onClick?: () => void }) {
  return (
    <button
      title={tooltip}
      aria-label={tooltip}
      aria-pressed={active}
      onClick={onClick}
      className={`w-10 h-10 flex items-center justify-center rounded cursor-pointer transition-colors
      ${active ? 'bg-[var(--color-surface-hover)] text-[var(--color-accent)] shadow-[inset_0_2px_4px_rgba(0,0,0,0.2)]' : 'text-gray-400 hover:text-gray-200 hover:bg-[var(--color-surface)]'}`}
    >
      {icon}
    </button>
  );
}

// ─── Status Bar Component ───
function StatusBar({ canvas, activeDoc, zoom }: { 
  canvas: fabric.Canvas | null;
  activeDoc: { name: string; width: number; height: number } | null;
  zoom: number;
}) {
  const [cursor, setCursor] = useState({ x: 0, y: 0 });
  const [selection, setSelection] = useState<{ w: number; h: number; x: number; y: number; type: string } | null>(null);
  const [objCount, setObjCount] = useState(0);

  useEffect(() => {
    if (!canvas) { setSelection(null); setObjCount(0); return; }

    const onMove = (opt: any) => {
      const p = canvas.getScenePoint(opt.e);
      setCursor({ x: Math.round(p.x), y: Math.round(p.y) });
    };

    const onSelect = () => {
      const obj = canvas.getActiveObject();
      const allObjs = canvas.getObjects();
      setObjCount(allObjs.length);
      if (obj) {
        setSelection({
          w: Math.round(obj.getScaledWidth()),
          h: Math.round(obj.getScaledHeight()),
          x: Math.round((obj as any).left || 0),
          y: Math.round((obj as any).top || 0),
          type: (obj as any).type || 'object',
        });
      } else {
        setSelection(null);
      }
    };

    const onClear = () => setSelection(null);
    const onObjChange = () => setObjCount(canvas.getObjects().length);

    canvas.on('mouse:move', onMove);
    canvas.on('selection:created', onSelect);
    canvas.on('selection:updated', onSelect);
    canvas.on('selection:cleared', onClear);
    canvas.on('object:added', onObjChange);
    canvas.on('object:removed', onObjChange);
    canvas.on('object:modified', onSelect);

    setObjCount(canvas.getObjects().length);

    return () => {
      canvas.off('mouse:move', onMove);
      canvas.off('selection:created', onSelect);
      canvas.off('selection:updated', onSelect);
      canvas.off('selection:cleared', onClear);
      canvas.off('object:added', onObjChange);
      canvas.off('object:removed', onObjChange);
      canvas.off('object:modified', onSelect);
    };
  }, [canvas]);

  const Sep = () => <div className="w-px h-3 bg-[var(--bg-5)] mx-1.5" />;

  const Item = ({ label, value }: { label: string; value: string | number }) => (
    <div className="flex items-center gap-1">
      <span className="text-[var(--text-7)] text-[10px]">{label}</span>
      <span className="text-[var(--text-5)] text-[10px] font-mono">{value}</span>
    </div>
  );

  return (
    <div className="h-5 bg-[var(--bg-1)] border-t border-[var(--bg-0)] flex items-center px-3 shrink-0 select-none overflow-hidden" style={{ fontSize: '10px' }}>
      {/* Left: Document info */}
      <div className="flex items-center gap-0">
        {activeDoc ? (
          <>
            <Item label="Doc:" value={activeDoc.name} />
            <Sep />
            <Item label="Size:" value={`${activeDoc.width}×${activeDoc.height}px`} />
            <Sep />
            <Item label="Layers:" value={objCount} />
          </>
        ) : (
          <span className="text-[var(--bg-7)] text-[10px]">No document open</span>
        )}
      </div>

      {/* Center: Cursor position */}
      <div className="flex items-center gap-0 mx-auto">
        <Item label="X:" value={cursor.x} />
        <Sep />
        <Item label="Y:" value={cursor.y} />
      </div>

      {/* Right: Selection or zoom */}
      <div className="flex items-center gap-0 ml-auto">
        {selection ? (
          <>
            <Item label="Type:" value={selection.type.replace('i-','')} />
            <Sep />
            <Item label="X:" value={selection.x} />
            <Sep />
            <Item label="Y:" value={selection.y} />
            <Sep />
            <Item label="W:" value={selection.w} />
            <Sep />
            <Item label="H:" value={selection.h} />
            <Sep />
          </>
        ) : null}
        <Item label="Zoom:" value={`${Math.round(zoom * 100)}%`} />
      </div>
    </div>
  );
}
function CanvasSizeModal({ onClose, onResize, initialWidth, initialHeight }: { onClose: () => void, onResize: (w: number, h: number) => void, initialWidth: number, initialHeight: number }) {
  const [w, setW] = useState(initialWidth);
  const [h, setH] = useState(initialHeight);

  return (
    <div className="absolute inset-0 bg-black/50 flex items-center justify-center z-[100] backdrop-blur-sm">
      <div className="bg-[var(--bg-7)] p-5 rounded-lg w-72 shadow-2xl border border-[var(--bg-9)] text-white">
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-semibold text-sm">Canvas Size</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white cursor-pointer"><X size={16} /></button>
        </div>
        <div className="flex gap-4 mb-4">
          <div className="flex-1">
            <label className="text-xs text-gray-400 block mb-1">Width (px)</label>
            <input type="number" value={w} onChange={e => setW(Number(e.target.value))} className="w-full bg-[var(--bg-1)] border border-[var(--bg-9)] rounded px-2 py-1.5 text-sm" />
          </div>
          <div className="flex-1">
            <label className="text-xs text-gray-400 block mb-1">Height (px)</label>
            <input type="number" value={h} onChange={e => setH(Number(e.target.value))} className="w-full bg-[var(--bg-1)] border border-[var(--bg-9)] rounded px-2 py-1.5 text-sm" />
          </div>
        </div>
        <button onClick={() => onResize(w, h)} className="w-full py-2 bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] text-white rounded text-sm font-medium cursor-pointer">Resize Canvas</button>
      </div>
    </div>
  );
}

function ColorAdjustModal({ onClose, canvas }: { onClose: () => void, canvas: fabric.Canvas | null }) {
  const [brightness, setBrightness] = useState(0);
  const [contrast, setContrast] = useState(0);
  const [saturation, setSaturation] = useState(0);

  const applyFilters = () => {
    if (!canvas) return;
    const obj = canvas.getActiveObject();
    if (!obj || (obj as any).type !== 'image') return;
    
    // Reset filters and apply new ones
    (obj as any).filters = [];
    if (brightness !== 0) (obj as any).filters.push(new (fabric as any).Image.filters.Brightness({ brightness }));
    if (contrast !== 0) (obj as any).filters.push(new (fabric as any).Image.filters.Contrast({ contrast }));
    if (saturation !== 0) (obj as any).filters.push(new (fabric as any).Image.filters.Saturation({ saturation }));
    
    (obj as any).applyFilters();
    canvas.requestRenderAll();
  };

  return (
    <div className="absolute inset-0 bg-black/50 flex items-center justify-center z-[100] backdrop-blur-sm">
      <div className="bg-[var(--bg-7)] p-5 rounded-lg w-80 shadow-2xl border border-[var(--bg-9)] text-white">
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-semibold text-sm">Color Adjust</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white cursor-pointer"><X size={16} /></button>
        </div>
        
        <div className="space-y-4">
          <div>
            <div className="flex justify-between text-xs mb-1"><span>Brightness</span><span>{Math.round(brightness * 100)}</span></div>
            <input type="range" min="-1" max="1" step="0.05" value={brightness} onChange={e => { setBrightness(Number(e.target.value)); applyFilters(); }} className="w-full cursor-pointer" />
          </div>
          <div>
            <div className="flex justify-between text-xs mb-1"><span>Contrast</span><span>{Math.round(contrast * 100)}</span></div>
            <input type="range" min="-1" max="1" step="0.05" value={contrast} onChange={e => { setContrast(Number(e.target.value)); applyFilters(); }} className="w-full cursor-pointer" />
          </div>
          <div>
            <div className="flex justify-between text-xs mb-1"><span>Saturation</span><span>{Math.round(saturation * 100)}</span></div>
            <input type="range" min="-1" max="1" step="0.05" value={saturation} onChange={e => { setSaturation(Number(e.target.value)); applyFilters(); }} className="w-full cursor-pointer" />
          </div>
        </div>
        
        <button onClick={onClose} className="w-full mt-5 py-2 bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] text-white rounded text-xs font-medium cursor-pointer">Done</button>
      </div>
    </div>
  );
}


const SHORTCUT_GROUPS: { title: string; items: [string, string][] }[] = [
  { title: 'Tools', items: [
    ['V', 'Move / Select Tool'], ['M', 'Marquee Tool'], ['H', 'Hand / Pan Tool'],
    ['C', 'Crop Tool'], ['I', 'Eyedropper'], ['T', 'Text Tool'],
    ['B', 'Brush Tool'], ['E', 'Eraser Tool'],
  ]},
  { title: 'Edit', items: [
    ['Ctrl/Cmd + Z', 'Undo'], ['Ctrl/Cmd + Shift + Z', 'Redo'], ['Ctrl/Cmd + Y', 'Redo'],
    ['Ctrl/Cmd + C', 'Copy'], ['Ctrl/Cmd + V', 'Paste'], ['Delete / Backspace', 'Delete selection'],
  ]},
  { title: 'View', items: [
    ['Ctrl/Cmd + "+"', 'Zoom in'], ['Ctrl/Cmd + "-"', 'Zoom out'], ['Ctrl/Cmd + 0', 'Reset zoom'],
    ['Ctrl/Cmd + Scroll', 'Zoom at cursor'],
  ]},
  { title: 'File', items: [
    ['Ctrl/Cmd + N', 'New document'], ['Ctrl/Cmd + O', 'Open project'], ['Ctrl/Cmd + S', 'Save project'],
  ]},
];

function ShortcutsModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="absolute inset-0 bg-black/60 flex items-center justify-center z-[110] backdrop-blur-sm">
      <div className="bg-[var(--bg-3)] rounded-lg w-[420px] max-h-[80vh] overflow-y-auto shadow-2xl border border-[var(--bg-9)] text-white">
        <div className="flex justify-between items-center px-5 py-4 border-b border-[var(--bg-8)] sticky top-0 bg-[var(--bg-3)]">
          <h3 className="font-semibold text-sm">Keyboard Shortcuts</h3>
          <button onClick={onClose} aria-label="Close" className="text-gray-400 hover:text-white cursor-pointer"><X size={16} /></button>
        </div>
        <div className="p-5 space-y-5">
          {SHORTCUT_GROUPS.map(group => (
            <div key={group.title}>
              <div className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-6)] mb-2">{group.title}</div>
              <div className="space-y-1.5">
                {group.items.map(([key, label]) => (
                  <div key={key} className="flex items-center justify-between text-xs">
                    <span className="text-[var(--text-1)]">{label}</span>
                    <kbd className="px-2 py-0.5 rounded bg-[var(--bg-1)] border border-[var(--bg-8)] text-[10px] font-mono text-[var(--text-1)]">{key}</kbd>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function AboutModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="absolute inset-0 bg-black/60 flex items-center justify-center z-[110] backdrop-blur-sm">
      <div className="bg-[var(--bg-3)] rounded-lg w-80 shadow-2xl border border-[var(--bg-9)] text-white text-center p-6">
        <button onClick={onClose} aria-label="Close" className="absolute top-4 right-4 text-gray-400 hover:text-white cursor-pointer"><X size={16} /></button>
        <img src={`${import.meta.env.BASE_URL}logo.png`} alt="Tea Design In" className="h-16 w-16 mx-auto mb-4 rounded" />
        <h3 className="font-bold text-base">Tea Design In</h3>
        <p className="text-[11px] text-[var(--text-4)] mt-1">Version {APP_VERSION}</p>
        <p className="text-[11px] text-[var(--text-5)] mt-4">A modern, desktop-ready design editor built with React, Vite, and Electron.</p>
        <button onClick={onClose} className="w-full mt-5 py-2 bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] text-white rounded text-xs font-medium cursor-pointer">Close</button>
      </div>
    </div>
  );
}

// Generic Yes/No confirmation modal — used for unsaved-changes prompts (tab close, app quit).
function ConfirmModal({ title, message, confirmLabel, onConfirm, onCancel }: {
  title: string; message: string; confirmLabel: string; onConfirm: () => void; onCancel: () => void;
}) {
  return (
    <div className="absolute inset-0 bg-black/60 flex items-center justify-center z-[110] backdrop-blur-sm">
      <div className="bg-[var(--bg-7)] p-5 rounded-lg w-80 shadow-2xl border border-[var(--bg-9)] text-white">
        <h3 className="font-semibold text-sm mb-2">{title}</h3>
        <p className="text-xs text-gray-400 mb-5">{message}</p>
        <div className="flex gap-2">
          <button onClick={onCancel} className="flex-1 py-2 bg-transparent hover:bg-[var(--bg-9)] border border-[var(--bg-9)] text-gray-300 rounded text-xs font-medium cursor-pointer transition-colors">
            Cancel
          </button>
          <button onClick={onConfirm} className="flex-1 py-2 bg-[var(--color-danger)] hover:bg-[var(--color-danger-hover)90] text-white rounded text-xs font-medium cursor-pointer transition-colors">
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// Shown on startup when a leftover autosave draft is found (crash / accidental close / etc.)
function RestoreSessionModal({ entries, onRestore, onDiscard }: {
  entries: AutosaveEntry[]; onRestore: () => void; onDiscard: () => void;
}) {
  const latest = entries.reduce((max, e) => Math.max(max, e.savedAt), 0);
  const when = latest ? new Date(latest).toLocaleString() : 'earlier';
  return (
    <div className="absolute inset-0 bg-black/70 flex items-center justify-center z-[110] backdrop-blur-md">
      <div className="bg-[var(--bg-7)] p-6 rounded-lg w-96 shadow-2xl border border-[var(--bg-9)] text-white">
        <h3 className="font-semibold text-base mb-2">Restore unsaved session?</h3>
        <p className="text-xs text-gray-400 mb-5">
          We found an autosaved draft with {entries.length} document{entries.length > 1 ? 's' : ''} from {when} that
          was never explicitly saved. Would you like to restore it?
        </p>
        <div className="flex gap-2">
          <button onClick={onDiscard} className="flex-1 py-2 bg-transparent hover:bg-[var(--bg-9)] border border-[var(--bg-9)] text-gray-300 rounded text-xs font-medium cursor-pointer transition-colors">
            Discard
          </button>
          <button onClick={onRestore} className="flex-1 py-2 bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] text-white rounded text-xs font-medium cursor-pointer transition-colors">
            Restore
          </button>
        </div>
      </div>
    </div>
  );
}

export default App;
