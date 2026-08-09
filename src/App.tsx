import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as fabric from 'fabric';
import { MousePointer2, Crop, Image as ImageIcon, Type, Square, Circle, X, Plus, ZoomIn, ZoomOut, PanelRight, Minus, Triangle, Star, Pentagon, Hand, Pipette, SquareDashed, CircleDashed, Menu, Layers, SlidersHorizontal, Undo2, Redo2, Download, Paintbrush, Eraser, ArrowUpDown } from 'lucide-react';
import './index.css';
import { DropdownMenu } from './components/DropdownMenu';
import { ToolSettingsBar } from './components/ToolSettingsBar';
import { LayersPanel } from './components/LayersPanel';
import { PropertiesPanel } from './components/PropertiesPanel';
import { MockupWorkspace } from './components/MockupWorkspace';

interface DocumentInfo {
  id: string;
  name: string;
  width: number;
  height: number;
  mockups?: { id: string; url: string }[];
  activeMockupId?: string | null;
}

type ToolType = 'select' | 'marquee' | 'hand' | 'crop' | 'text' | 'rect' | 'circle' | 'line' | 'triangle' | 'star' | 'polygon' | 'image' | 'eyedropper' | 'brush' | 'eraser';

function App() {
  const [documents, setDocuments] = useState<DocumentInfo[]>([]);
  const [activeDocId, setActiveDocId] = useState<string | null>(null);
  const [showNewDocModal, setShowNewDocModal] = useState(false);
  const [showCanvasSizeModal, setShowCanvasSizeModal] = useState(false);
  const [showColorAdjustModal, setShowColorAdjustModal] = useState(false);
  const [showAIMagicModal, setShowAIMagicModal] = useState(false);
  const [showAIGenFillModal, setShowAIGenFillModal] = useState(false);
  const [appMode, setAppMode] = useState<'main' | 'mockup'>('main');
  const [activeTool, setActiveTool] = useState<ToolType>('select');
  const [activeShapeGroupTool, setActiveShapeGroupTool] = useState<ToolType>('rect');
  const [showShapeMenu, setShowShapeMenu] = useState(false);
  const [showMarqueeMenu, setShowMarqueeMenu] = useState(false);
  const [zoomMap, setZoomMap] = useState<{ [id: string]: number }>({});
  const [showRightPanel, setShowRightPanel] = useState(true);
  const [showMobileRightPanel, setShowMobileRightPanel] = useState(false);
  const [globalLoading, setGlobalLoading] = useState<string | null>(null);

  const [primaryColor, setPrimaryColor] = useState('#000000');
  const [secondaryColor, setSecondaryColor] = useState('#ffffff');

  // We store the actual Fabric instances in a ref map to avoid React state issues with complex objects
  const fabricCanvasesRef = useRef<{ [id: string]: fabric.Canvas }>({});
  const historyRef = useRef<{
    [docId: string]: { undoStack: string[]; redoStack: string[]; isProcessing: boolean }
  }>({});

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
          const canvas = new fabric.Canvas(canvasElement, {
            width: doc.width,
            height: doc.height,
            backgroundColor: '#ffffff',
            selection: true,
            enableRetinaScaling: false,   // prevent canvas from auto-resizing
          });
          
          fabricCanvasesRef.current[doc.id] = canvas;
          historyRef.current[doc.id] = { undoStack: [], redoStack: [], isProcessing: false };
          setZoomMap(prev => ({...prev, [doc.id]: 1}));
          canvas.renderAll();

          // History tracking events
          const saveHistory = () => {
            const history = historyRef.current[doc.id];
            if (history && !history.isProcessing) {
              history.undoStack.push(JSON.stringify(canvas.toJSON()));
              history.redoStack = [];
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
  }, [documents, handleZoom]);

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
      });
    } else {
      history.isProcessing = false;
    }
  }, [activeDocId]);

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
      });
    } else {
      history.isProcessing = false;
    }
  }, [activeDocId]);

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
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeDocId, handleZoom, handleUndo, handleRedo]);

  const handleCreateDocument = (width: number, height: number) => {
    const newDoc: DocumentInfo = {
      id: `doc_${Date.now()}`,
      name: `Untitled-${documents.length + 1}`,
      width,
      height
    };
    setDocuments([...documents, newDoc]);
    setActiveDocId(newDoc.id);
    setShowNewDocModal(false);
  };

  const closeDocument = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const newDocs = documents.filter(d => d.id !== id);
    setDocuments(newDocs);
    if (activeDocId === id) {
      setActiveDocId(newDocs.length > 0 ? newDocs[newDocs.length - 1].id : null);
    }
    // Cleanup fabric instance
    if (fabricCanvasesRef.current[id]) {
      fabricCanvasesRef.current[id].dispose();
      delete fabricCanvasesRef.current[id];
    }
    
    setZoomMap(prev => {
      const newMap = {...prev};
      delete newMap[id];
      return newMap;
    });
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
  };

  const handleOpenProject = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.tea,.te';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (f) => {
          try {
            const data = JSON.parse(f.target?.result as string);
            // Support both old raw json (.te) and new wrapped json (.tea)
            const canvasData = data.canvasData || data;
            const width = data.width || 1920;
            const height = data.height || 1080;

            const newDocId = `doc_${Date.now()}`;
            const newDoc: DocumentInfo = {
              id: newDocId,
              name: file.name.replace('.tea', '').replace('.te', ''),
              width,
              height
            };
            setDocuments(prev => [...prev, newDoc]);
            setActiveDocId(newDoc.id);
            
            // Wait for canvas element to mount
            setTimeout(() => {
              const canvas = fabricCanvasesRef.current[newDocId];
              if (canvas) {
                canvas.loadFromJSON(canvasData).then(() => {
                  canvas.requestRenderAll();
                });
              }
            }, 100);
          } catch (err) {
            console.error('Failed to parse file', err);
            alert('Invalid .tea file format');
          }
        };
        reader.readAsText(file);
      }
    };
    input.click();
  };

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
          notif.style.cssText = 'position:fixed;bottom:30px;left:50%;transform:translateX(-50%);background:#1a1a1a;border:1px solid #333;color:#fff;padding:8px 16px;border-radius:6px;font-size:12px;z-index:9999;font-family:monospace;display:flex;align-items:center;gap:8px';
          notif.innerHTML = `<span style="width:14px;height:14px;background:${hex};border-radius:3px;display:inline-block;border:1px solid #555"></span> Copied: <b>${hex}</b>`;
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

  const handleBlur = () => {
    const canvas = getActiveCanvas();
    if (!canvas) return;
    const activeObj = canvas.getActiveObject();
    if (!activeObj || (activeObj as any).type !== 'image') {
      alert("Please select an image layer first.");
      return;
    }
    const filter = new (fabric as any).Image.filters.Blur({ blur: 0.1 });
    (activeObj as any).filters.push(filter);
    (activeObj as any).applyFilters();
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
    (activeObj as any).filters.push(filter);
    (activeObj as any).applyFilters();
    canvas.requestRenderAll();
  };

  return (
    <div className="h-screen w-screen flex flex-col bg-[var(--color-background)] text-[var(--color-foreground)] overflow-hidden relative">
      {/* ─── Mobile Header ─── */}
      <div className="flex md:hidden h-14 bg-[#161616] border-b border-[#0d0d0d] items-center justify-between px-3 shrink-0 z-50">
        <div className="flex items-center gap-2">
          <img src={`${import.meta.env.BASE_URL}logo.png`} alt="TE" className="h-6 w-6 rounded" />
          <div className="flex flex-col">
            <span className="text-[13px] font-bold text-white tracking-wide">
              {activeDocId ? (documents.find(d => d.id === activeDocId)?.name || 'Untitled') : 'Tea Design'}
            </span>
            {activeDocId && (
              <span className="text-[10px] text-[#777]">
                {documents.find(d => d.id === activeDocId)?.width} × {documents.find(d => d.id === activeDocId)?.height} px
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1">
           <button onClick={handleUndo} className="p-2 text-[#aaa] hover:text-white cursor-pointer"><Undo2 size={20}/></button>
           <button onClick={handleRedo} className="p-2 text-[#aaa] hover:text-white cursor-pointer"><Redo2 size={20}/></button>
           <button onClick={() => setShowMobileRightPanel(!showMobileRightPanel)} className={`p-2 cursor-pointer ${showMobileRightPanel ? 'text-[var(--color-accent)]' : 'text-[#aaa] hover:text-white'}`}><Layers size={20}/></button>
        </div>
      </div>

      {/* ─── Custom Title Bar (Frameless Window) ─── */}
      <div
        className="hidden md:flex h-9 bg-[#161616] border-b border-[#0d0d0d] items-center shrink-0 relative z-50 select-none"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      >
        {/* Left: Logo + App Name + Menus — no-drag zone */}
        <div className="flex items-center h-full" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          {/* Logo */}
          <div className="flex items-center gap-1.5 px-3 h-full border-r border-[#1e1e1e]">
            <img src={`${import.meta.env.BASE_URL}logo.png`} alt="TE" className="h-4 w-4 rounded" />
            <span className="text-[10px] font-bold text-[#555] tracking-widest uppercase">Tea</span>
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
              { label: 'Magic Eraser', onClick: () => { if (activeDocId) setShowAIMagicModal(true); else alert('Open a document first'); } },
              { label: 'Generative Fill', onClick: () => { if (activeDocId) setShowAIGenFillModal(true); else alert('Open a document first'); } }
            ]}
          ].map(m => (
            <DropdownMenu key={m.title} title={m.title} items={m.items} />
          ))}

          {/* Mode Switcher */}
          <div className="ml-4 flex items-center bg-[#111] border border-[#222] rounded p-0.5" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
            <button
              onClick={() => setAppMode('main')}
              className={`px-3 py-1 rounded-sm text-[11px] font-medium transition-colors cursor-pointer ${appMode === 'main' ? 'bg-[#333] text-white shadow' : 'text-[#666] hover:text-[#999]'}`}
            >
              Main Mode
            </button>
            <button
              onClick={() => setAppMode('mockup')}
              className={`px-3 py-1 rounded-sm text-[11px] font-medium transition-colors cursor-pointer ${appMode === 'mockup' ? 'bg-[var(--color-accent)] text-white shadow' : 'text-[#666] hover:text-[#999]'}`}
            >
              Mockup Mode
            </button>
          </div>
        </div>

        {/* Center: Document Title — draggable */}
        <div className="absolute left-1/2 -translate-x-1/2 flex items-center gap-2 pointer-events-none">
          {activeDocId ? (
            <>
              <span className="text-[12px] text-[#777] font-medium">
                {documents.find(d => d.id === activeDocId)?.name || 'Untitled'}
              </span>
              <span className="text-[10px] text-[#3a3a3a] bg-[#1a1a1a] border border-[#252525] rounded px-1.5 py-0.5">
                {documents.find(d => d.id === activeDocId)?.width} × {documents.find(d => d.id === activeDocId)?.height} px
              </span>
            </>
          ) : (
            <span className="text-[11px] text-[#3a3a3a] tracking-[0.2em] uppercase font-medium">Tea Design In</span>
          )}
        </div>

        {/* Right: Zoom + Panel + Window Controls — no-drag */}
        <div className="flex items-center ml-auto h-full" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          {/* Zoom */}
          <div className="flex items-center gap-0.5 px-2">
            <button onClick={() => activeDocId && handleZoom(activeDocId, 1 / 1.1)} disabled={!activeDocId}
              className="text-[#555] hover:text-white disabled:opacity-20 cursor-pointer p-1 rounded hover:bg-[#222] transition-colors" title="Zoom Out">
              <ZoomOut size={13} />
            </button>
            <span className="text-[11px] text-[#666] w-9 text-center cursor-pointer hover:text-white font-mono"
              onClick={() => activeDocId && handleZoom(activeDocId, 'reset')}>
              {Math.round(activeZoom * 100)}%
            </span>
            <button onClick={() => activeDocId && handleZoom(activeDocId, 1.1)} disabled={!activeDocId}
              className="text-[#555] hover:text-white disabled:opacity-20 cursor-pointer p-1 rounded hover:bg-[#222] transition-colors" title="Zoom In">
              <ZoomIn size={13} />
            </button>
          </div>

          {/* Panel Toggle */}
          <button onClick={() => setShowRightPanel(!showRightPanel)}
            className={`w-8 h-full flex items-center justify-center cursor-pointer border-l border-[#1e1e1e] transition-colors ${showRightPanel ? 'text-[#0096ff]' : 'text-[#444] hover:text-[#888]'}`}
            title="Toggle Properties Panel">
            <PanelRight size={14} />
          </button>

          {/* Separator */}
          <div className="w-px h-4 bg-[#1e1e1e] mx-1" />

          {/* Window Controls — Minimize / Maximize / Close */}
          <button
            onClick={() => (window as any).electronWindow?.minimize()}
            className="w-11 h-full flex items-center justify-center text-[#555] hover:text-white hover:bg-[#2a2a2a] cursor-pointer transition-colors border-l border-[#1a1a1a]"
            title="Minimize">
            <svg width="11" height="1" viewBox="0 0 11 1" fill="currentColor"><rect width="11" height="1"/></svg>
          </button>
          <button
            onClick={() => (window as any).electronWindow?.maximize()}
            className="w-11 h-full flex items-center justify-center text-[#555] hover:text-white hover:bg-[#2a2a2a] cursor-pointer transition-colors border-l border-[#1a1a1a]"
            title="Maximize / Restore">
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1"><rect x="0.5" y="0.5" width="9" height="9"/></svg>
          </button>
          <button
            onClick={() => (window as any).electronWindow?.close()}
            className="w-11 h-full flex items-center justify-center text-[#555] hover:text-white hover:bg-[#c42b1c] cursor-pointer transition-colors border-l border-[#1a1a1a]"
            title="Close">
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.2"><path d="M1 1 L9 9 M9 1 L1 9"/></svg>
          </button>
        </div>
      </div>

      {/* Tool Settings Bar */}
      <ToolSettingsBar activeTool={activeTool} canvas={getActiveCanvas()} />

      {/* Tabs Bar */}
      <div className="h-8 bg-[#1e1e1e] flex items-end px-2 border-b border-[var(--color-panel-border)] shrink-0 z-10 relative overflow-x-auto whitespace-nowrap scrollbar-hide">
        {documents.map(doc => (
          <div 
            key={doc.id} 
            onClick={() => setActiveDocId(doc.id)}
            className={`flex items-center justify-between gap-2 px-4 py-1.5 min-w-[120px] max-w-[200px] border-t border-r border-l rounded-t-md cursor-pointer text-xs
              ${activeDocId === doc.id 
                ? 'bg-[#151515] text-white border-[var(--color-panel-border)] border-b-[#151515] -mb-[1px] shadow-[0_-2px_5px_rgba(0,0,0,0.2)]' 
                : 'bg-[#252526] text-gray-400 border-transparent hover:bg-[#2a2a2b]'}
            `}
          >
            <span className="truncate flex-1 font-medium">{doc.name}</span>
            <button onClick={(e) => closeDocument(doc.id, e)} className="hover:bg-[#444] rounded-sm p-0.5"><X size={12}/></button>
          </div>
        ))}
        <button onClick={() => setShowNewDocModal(true)} className="ml-2 mb-1 p-1 hover:bg-[var(--color-surface-hover)] rounded text-gray-400 hover:text-white cursor-pointer" title="New Document">
          <Plus size={16} />
        </button>
      </div>

      <div className="flex flex-1 overflow-hidden relative flex-col-reverse md:flex-row">
        {/* Left Toolbar */}
        <div className="w-full h-14 md:w-12 md:h-auto bg-[#1a1a1a] md:bg-[var(--color-panel)] border-t md:border-t-0 md:border-r border-[#0d0d0d] md:border-[var(--color-panel-border)] flex flex-row md:flex-col items-center py-0 md:py-2 px-2 md:px-0 gap-2 md:gap-1 shrink-0 z-20 overflow-x-auto md:overflow-visible scrollbar-hide relative justify-start md:justify-start">
          {/* Selection & Navigation */}
          <ToolButton icon={<MousePointer2 size={17} />} active={activeTool === 'select'} onClick={() => { setActiveTool('select'); const c = getActiveCanvas(); if(c){ c.selection = true; c.defaultCursor = 'default'; c.hoverCursor = 'move'; c.requestRenderAll(); }}} tooltip="Move Tool (V)" />
          {/* Marquee Group */}
          <div className="relative group">
            <button
              className={`w-9 h-9 flex items-center justify-center rounded cursor-pointer relative ${
                activeTool === 'marquee'
                  ? 'bg-[var(--color-accent)] text-white' 
                  : 'text-[#999] hover:text-white hover:bg-[#333]'
              }`}
              onClick={() => handleToolClick('marquee')}
              onContextMenu={(e) => { e.preventDefault(); setShowMarqueeMenu(!showMarqueeMenu); }}
              title="Marquee Tool (M) (Right-click to expand)"
            >
              <SquareDashed size={17} />
              <div className="absolute bottom-0.5 right-0.5 pointer-events-none opacity-50" style={{ transform: 'rotate(45deg)' }}>
                <div className="w-0 h-0 border-l-[3px] border-l-transparent border-t-[3px] border-t-current border-r-[3px] border-r-transparent" />
              </div>
            </button>

            {showMarqueeMenu && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowMarqueeMenu(false)} onContextMenu={(e) => { e.preventDefault(); setShowMarqueeMenu(false); }} />
                <div className="absolute bottom-full left-0 mb-2 md:left-full md:bottom-auto md:top-0 md:ml-1 md:mb-0 bg-[#1a1a1a] border border-[#333] rounded-md shadow-xl flex flex-col p-1 z-50 min-w-[150px]">
                  {[
                    { id: 'marquee-rect', label: 'Rectangle Select', shortcut: 'M', icon: <SquareDashed size={14} /> },
                    { id: 'marquee-ellipse', label: 'Ellipse Select', shortcut: 'M', icon: <CircleDashed size={14} /> }
                  ].map(m => (
                    <button
                      key={m.id}
                      className={`flex items-center gap-3 px-2 py-1.5 rounded text-xs text-left cursor-pointer transition-colors ${
                        activeTool === 'marquee' ? 'bg-[#333] text-white' : 'text-[#aaa] hover:bg-[#2a2a2a] hover:text-white'
                      }`}
                      onClick={() => {
                        handleToolClick('marquee');
                        setShowMarqueeMenu(false);
                      }}
                    >
                      <div className="flex items-center justify-between w-full">
                        <div className="flex items-center gap-3">
                           {m.icon}
                           <span>{m.label}</span>
                        </div>
                        <span className="text-[10px] text-[#555]">{m.shortcut}</span>
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
          <div className="w-px h-8 md:h-px md:w-8 bg-[#333] md:bg-[var(--color-panel-border)] mx-1 md:mx-0 md:my-0.5 shrink-0" />
          
          {/* Text */}
          <ToolButton icon={<Type size={17} />} active={activeTool === 'text'} onClick={() => handleToolClick('text')} tooltip="Text Tool (T)" />
          <div className="w-px h-8 md:h-px md:w-8 bg-[#333] md:bg-[var(--color-panel-border)] mx-1 md:mx-0 md:my-0.5 shrink-0" />
          
          {/* Shapes Group */}
          <div className="relative group">
            <button
              className={`w-9 h-9 flex items-center justify-center rounded cursor-pointer relative ${
                ['rect','circle','triangle','line','star','polygon'].includes(activeTool) 
                  ? 'bg-[var(--color-accent)] text-white' 
                  : 'text-[#999] hover:text-white hover:bg-[#333]'
              }`}
              onClick={() => handleToolClick(activeShapeGroupTool)}
              onContextMenu={(e) => { e.preventDefault(); setShowShapeMenu(!showShapeMenu); }}
              title="Shape Tools (Right-click to expand)"
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
                <div className="absolute bottom-full left-0 mb-2 md:left-full md:bottom-auto md:top-0 md:ml-1 md:mb-0 bg-[#1a1a1a] border border-[#333] rounded-md shadow-xl flex flex-col p-1 z-50 min-w-[140px]">
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
                        activeShapeGroupTool === shape.id ? 'bg-[#333] text-white' : 'text-[#aaa] hover:bg-[#2a2a2a] hover:text-white'
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
          
          <div className="w-px h-8 md:h-px md:w-8 bg-[#333] md:bg-[var(--color-panel-border)] mx-1 md:mx-0 md:my-0.5 shrink-0" />
          
          {/* Drawing */}
          <ToolButton icon={<Paintbrush size={17} />} active={activeTool === 'brush'} onClick={() => handleToolClick('brush')} tooltip="Brush Tool (B)" />
          <ToolButton icon={<Eraser size={17} />} active={activeTool === 'eraser'} onClick={() => handleToolClick('eraser')} tooltip="Eraser Tool (E)" />

          <div className="w-px h-8 md:h-px md:w-8 bg-[#333] md:bg-[var(--color-panel-border)] mx-1 md:mx-0 md:my-0.5 shrink-0" />
          
          {/* Media */}
          <ToolButton icon={<ImageIcon size={17} />} onClick={() => handleToolClick('image')} tooltip="Import Image" />

          {/* Spacer to push colors to bottom on desktop */}
          <div className="hidden md:block flex-1" />

          {/* Colors */}
          <div className="flex md:flex-col items-center gap-1 mt-0 md:mt-2 px-1">
             <div className="relative w-6 h-6 md:w-7 md:h-7 shrink-0 group">
                <input type="color" value={secondaryColor} onChange={(e) => setSecondaryColor(e.target.value)} className="absolute inset-0 opacity-0 cursor-pointer z-10 w-full h-full" title="Set Background Color" />
                <div className="absolute right-0 bottom-0 w-4 h-4 md:w-5 md:h-5 rounded border border-[#555] shadow-sm z-0 pointer-events-none" style={{ backgroundColor: secondaryColor }} />
                
                <input type="color" value={primaryColor} onChange={(e) => {
                    setPrimaryColor(e.target.value);
                    const canvas = getActiveCanvas();
                    if (canvas && canvas.freeDrawingBrush && activeTool === 'brush') {
                        canvas.freeDrawingBrush.color = e.target.value;
                    }
                }} className="absolute inset-0 opacity-0 cursor-pointer z-20 w-3/4 h-3/4" title="Set Foreground Color" />
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
             }} className="p-0.5 text-[#666] hover:text-white cursor-pointer" title="Swap Colors (X)">
                <ArrowUpDown size={12} />
             </button>
          </div>
        </div>

        {/* Main Canvas Area */}
        <div className="flex-1 bg-[#151515] overflow-auto p-12 relative flex"
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
               backgroundImage: `linear-gradient(45deg, #181818 25%, transparent 25%), linear-gradient(-45deg, #181818 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #181818 75%), linear-gradient(-45deg, transparent 75%, #181818 75%)`,
               backgroundSize: '20px 20px',
               backgroundPosition: '0 0, 0 10px, 10px -10px, -10px 0px'
             }}>
          
          {documents.length === 0 ? (
            <div className="m-auto flex flex-col items-center justify-center text-gray-500 bg-[var(--color-panel)] p-12 rounded-lg shadow-2xl border border-[var(--color-panel-border)] transition-transform duration-500 hover:scale-[1.02]">
              <img src={`${import.meta.env.BASE_URL}logo.png`} alt="TE Logo" className="h-24 w-24 mb-6 drop-shadow-[0_0_15px_rgba(0,168,255,0.3)]" />
              <h1 className="text-2xl text-white font-bold tracking-widest uppercase mb-2">Welcome to Tea Design In</h1>
              <p className="text-gray-400 font-medium tracking-wide mb-8">Start designing beautiful printing templates.</p>
              <div className="flex gap-4">
                <button onClick={() => setShowNewDocModal(true)} className="px-6 py-3 bg-[var(--color-accent)] hover:bg-[#0088e6] text-white rounded text-sm cursor-pointer shadow-[0_0_15px_rgba(0,168,255,0.4)] transition-all font-medium">Create New Project</button>
                <button onClick={handleOpenProject} className="px-6 py-3 bg-transparent border border-[var(--color-panel-border)] hover:border-gray-500 hover:bg-[#333] text-gray-300 rounded text-sm cursor-pointer transition-all font-medium">Open Project...</button>
              </div>
            </div>
          ) : (
            <div className="m-auto relative shadow-2xl ring-1 ring-white/10 transition-transform origin-center" style={{ boxShadow: '0 0 40px rgba(0,0,0,0.8)' }}>
              {documents.map(doc => {
                const currentZoom = zoomMap[doc.id] || 1;
                return (
                  <div 
                    key={doc.id}
                    style={{ 
                      display: activeDocId === doc.id ? 'block' : 'none', 
                      width: doc.width * currentZoom, 
                      height: doc.height * currentZoom 
                    }}
                    className="bg-white"
                  >
                    <canvas id={`canvas-${doc.id}`} />
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right Panel (Layers & Properties or Mockup Preview) */}
        <div className={`${showMobileRightPanel ? 'fixed inset-0 z-50 flex flex-col bg-black/60 pt-14 backdrop-blur-sm' : 'hidden md:flex'} ${!showRightPanel ? 'md:hidden' : ''} md:relative md:inset-auto md:bg-transparent md:pt-0`}>
          <div className="flex-1 flex flex-col overflow-hidden bg-[var(--color-panel)] rounded-t-xl md:rounded-none w-full md:w-64 border-t md:border-t-0 md:border-l border-[var(--color-panel-border)] shadow-2xl md:shadow-none animate-in slide-in-from-bottom md:slide-in-from-right">
            {/* Mobile Header for Right Panel */}
            <div className="flex md:hidden items-center justify-between px-4 py-3 border-b border-[var(--color-panel-border)]">
               <span className="font-semibold text-white">{appMode === 'main' ? 'Layers & Properties' : 'Mockup Workspace'}</span>
               <button onClick={() => setShowMobileRightPanel(false)} className="p-1 text-gray-400 hover:text-white cursor-pointer"><X size={20}/></button>
            </div>
            
            {appMode === 'main' ? (
              <div className="flex-1 overflow-y-auto flex flex-col">
                <PropertiesPanel canvas={getActiveCanvas()} />
                <LayersPanel canvas={getActiveCanvas()} onAddLayer={handleToolClick} />
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto w-full md:w-[450px]">
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
                   canvas.setWidth(newW);
                   canvas.setHeight(newH);
                   
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

      {/* AI Modals */}
      {showAIMagicModal && (
        <MockAIModal title="Magic Eraser (AI)" action="Removing objects..." onClose={() => setShowAIMagicModal(false)} />
      )}
      {showAIGenFillModal && (
        <MockAIModal title="Generative Fill (AI)" action="Generating content..." onClose={() => setShowAIGenFillModal(false)} />
      )}

      {/* ─── Global Loading Overlay ─── */}
      {globalLoading && (
        <div className="absolute inset-0 z-[999] bg-black/70 backdrop-blur-sm flex flex-col items-center justify-center gap-5">
          {/* Animated spinner */}
          <div className="relative w-20 h-20">
            <div className="absolute inset-0 rounded-full border-4 border-[#0096ff]/20" />
            <div className="absolute inset-0 rounded-full border-4 border-t-[#0096ff] border-r-transparent border-b-transparent border-l-transparent animate-spin" />
            <div className="absolute inset-2 rounded-full border-2 border-t-transparent border-r-[#7b2ff7]/60 border-b-transparent border-l-transparent animate-spin" style={{ animationDirection: 'reverse', animationDuration: '0.8s' }} />
            <div className="absolute inset-0 flex items-center justify-center">
              <img src={`${import.meta.env.BASE_URL}logo.png`} className="w-8 h-8 rounded opacity-80" />
            </div>
          </div>
          <div className="text-center">
            <p className="text-white text-sm font-medium">{globalLoading}</p>
            <p className="text-[#555] text-xs mt-1">Please wait...</p>
          </div>
        </div>
      )}
    </div>
  );
}
// Modal Component for New Document
function NewDocumentModal({ onClose, onCreate }: { onClose: () => void, onCreate: (w: number, h: number) => void }) {
  const [width, setWidth] = useState(1920);
  const [height, setHeight] = useState(1080);
  const [resolution, setResolution] = useState(300);
  const [unit, setUnit] = useState('Pixels');
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
      <div className="bg-[#2c2c2c] rounded-xl w-[850px] h-[550px] shadow-[0_0_50px_rgba(0,0,0,0.5)] flex flex-col overflow-hidden border border-[#444] text-gray-200">
        
        {/* Top Header & Tabs */}
        <div className="flex flex-col bg-[#383838] border-b border-[#444]">
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
        <div className="flex flex-1 overflow-hidden bg-[#262626]">
          
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
                      className={`bg-[#333] border rounded-lg p-4 flex flex-col items-center justify-center gap-3 cursor-pointer transition-all hover:bg-[#383838] hover:shadow-md ${isSelected ? 'border-[var(--color-accent)] ring-1 ring-[var(--color-accent)] bg-[#3a3a3a]' : 'border-[#444]'}`}
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
          <div className="w-[280px] bg-[#333] border-l border-[#444] flex flex-col">
            <div className="p-5 overflow-y-auto flex-1 space-y-5">
              <h3 className="font-semibold text-sm uppercase tracking-wider text-white border-b border-[#444] pb-2">Preset Details</h3>
              
              <div className="space-y-4">
                <div className="flex gap-2">
                  <div className="flex-1 space-y-1">
                    <label className="text-xs text-gray-400 font-medium">Width</label>
                    <input type="number" value={width} onChange={e => setWidth(Number(e.target.value))} className="w-full bg-[#222] border border-[#444] rounded px-3 py-1.5 text-white text-sm outline-none focus:border-[var(--color-accent)]" />
                  </div>
                  <div className="flex-1 space-y-1">
                    <label className="text-xs text-gray-400 font-medium">Units</label>
                    <select value={unit} onChange={e => setUnit(e.target.value)} className="w-full bg-[#222] border border-[#444] rounded px-3 py-1.5 text-white text-sm outline-none focus:border-[var(--color-accent)] cursor-pointer">
                      <option>Pixels</option>
                      <option disabled>Inches</option>
                      <option disabled>Centimeters</option>
                    </select>
                  </div>
                </div>

                <div className="flex gap-2 items-end">
                  <div className="flex-1 space-y-1">
                    <label className="text-xs text-gray-400 font-medium">Height</label>
                    <input type="number" value={height} onChange={e => setHeight(Number(e.target.value))} className="w-full bg-[#222] border border-[#444] rounded px-3 py-1.5 text-white text-sm outline-none focus:border-[var(--color-accent)]" />
                  </div>
                  <div className="flex gap-1 mb-0.5">
                    <button onClick={() => { if(width > height) { setWidth(height); setHeight(width); } }} className={`p-1.5 rounded border cursor-pointer ${width <= height ? 'bg-[#555] border-[#666] text-white shadow-inner' : 'bg-[#222] border-[#444] text-gray-400 hover:text-white hover:bg-[#333]'}`} title="Portrait"><Square size={16} /></button>
                    <button onClick={() => { if(height > width) { setWidth(height); setHeight(width); } }} className={`p-1.5 rounded border cursor-pointer ${width > height ? 'bg-[#555] border-[#666] text-white shadow-inner' : 'bg-[#222] border-[#444] text-gray-400 hover:text-white hover:bg-[#333]'}`} title="Landscape"><Square size={16} className="rotate-90" /></button>
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-xs text-gray-400 font-medium">Resolution</label>
                  <div className="flex gap-2">
                    <input type="number" value={resolution} onChange={e => setResolution(Number(e.target.value))} className="w-2/3 bg-[#222] border border-[#444] rounded px-3 py-1.5 text-white text-sm outline-none focus:border-[var(--color-accent)]" />
                    <span className="text-xs text-gray-400 flex items-center">Pixels/Inch</span>
                  </div>
                </div>
                
                <div className="space-y-1">
                  <label className="text-xs text-gray-400 font-medium">Background Contents</label>
                  <select className="w-full bg-[#222] border border-[#444] rounded px-3 py-1.5 text-white text-sm outline-none focus:border-[var(--color-accent)] cursor-pointer">
                    <option>White</option>
                    <option>Transparent</option>
                    <option>Black</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="p-4 border-t border-[#444] flex flex-col gap-2 bg-[#2c2c2c]">
              <button onClick={() => onCreate(width, height)} className="w-full py-2.5 bg-[var(--color-accent)] hover:bg-[#0088e6] text-white rounded font-medium shadow-sm transition-colors cursor-pointer tracking-wide">
                Create
              </button>
              <button onClick={onClose} className="w-full py-2 bg-transparent hover:bg-[#444] text-gray-300 rounded font-medium transition-colors cursor-pointer">
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

  const Sep = () => <div className="w-px h-3 bg-[#222] mx-1.5" />;

  const Item = ({ label, value }: { label: string; value: string | number }) => (
    <div className="flex items-center gap-1">
      <span className="text-[#3a3a3a] text-[10px]">{label}</span>
      <span className="text-[#666] text-[10px] font-mono">{value}</span>
    </div>
  );

  return (
    <div className="h-5 bg-[#111] border-t border-[#0d0d0d] flex items-center px-3 shrink-0 select-none overflow-hidden" style={{ fontSize: '10px' }}>
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
          <span className="text-[#2a2a2a] text-[10px]">No document open</span>
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
      <div className="bg-[#2c2c2c] p-5 rounded-lg w-80 shadow-2xl border border-[#444] text-white">
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
        
        <button onClick={onClose} className="w-full mt-5 py-2 bg-[var(--color-accent)] hover:bg-[#0088e6] text-white rounded text-xs font-medium cursor-pointer">Done</button>
      </div>
    </div>
  );
}

function MockAIModal({ title, action, onClose }: { title: string, action: string, onClose: () => void }) {
  const [stage, setStage] = useState(0);
  
  useEffect(() => {
    const t = setTimeout(() => setStage(1), 2000);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="absolute inset-0 bg-black/60 flex items-center justify-center z-[100] backdrop-blur-sm">
      <div className="bg-[#2c2c2c] p-6 rounded-lg w-80 shadow-2xl border border-[#444] text-white text-center">
        {stage === 0 ? (
          <div className="flex flex-col items-center justify-center gap-4 py-4">
            <div className="w-10 h-10 border-4 border-[#0096ff]/20 border-t-[#0096ff] rounded-full animate-spin" />
            <div>
              <p className="font-semibold text-sm">{title}</p>
              <p className="text-xs text-gray-400 mt-1">{action}</p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center gap-4 py-2">
            <div className="w-12 h-12 rounded-full bg-green-500/20 text-green-500 flex items-center justify-center mb-2">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path></svg>
            </div>
            <p className="font-semibold text-sm">Action Complete!</p>
            <p className="text-xs text-gray-400">Note: True Generative AI features require a server or API key to run locally. This is a mockup of the workflow.</p>
            <button onClick={onClose} className="w-full mt-3 py-2 bg-[var(--color-accent)] hover:bg-[#0088e6] text-white rounded text-xs font-medium cursor-pointer">Close</button>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
