import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as fabric from 'fabric';
import { MousePointer2, Crop, Image as ImageIcon, Type, Layers, Square, Circle, X, Plus, ZoomIn, ZoomOut, PanelRight } from 'lucide-react';
import './index.css';
import { DropdownMenu } from './components/DropdownMenu';
import { ToolSettingsBar } from './components/ToolSettingsBar';
import { LayersPanel } from './components/LayersPanel';

interface DocumentInfo {
  id: string;
  name: string;
  width: number;
  height: number;
}

type ToolType = 'select' | 'crop' | 'text' | 'rect' | 'circle' | 'image';

function App() {
  const [documents, setDocuments] = useState<DocumentInfo[]>([]);
  const [activeDocId, setActiveDocId] = useState<string | null>(null);
  const [showNewDocModal, setShowNewDocModal] = useState(true);
  const [activeTool, setActiveTool] = useState<ToolType>('select');
  const [zoomMap, setZoomMap] = useState<{ [id: string]: number }>({});
  const [showRightPanel, setShowRightPanel] = useState(true);

  // We store the actual Fabric instances in a ref map to avoid React state issues with complex objects
  const fabricCanvasesRef = useRef<{ [id: string]: fabric.Canvas }>({});

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
          });
          
          fabricCanvasesRef.current[doc.id] = canvas;
          setZoomMap(prev => ({...prev, [doc.id]: 1}));
          canvas.renderAll();

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
        if (e.key === 'c' || e.key === 'C') {
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
  }, [activeDocId, handleZoom]);

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

  const getActiveCanvas = () => {
    if (activeDocId) return fabricCanvasesRef.current[activeDocId];
    return null;
  };

  const handleSaveProject = () => {
    const canvas = getActiveCanvas();
    const doc = documents.find(d => d.id === activeDocId);
    if (!canvas || !doc) return;
    const json = JSON.stringify(canvas.toJSON());
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${doc.name}.te`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleExport = (format: 'png' | 'jpeg') => {
    const canvas = getActiveCanvas();
    const doc = documents.find(d => d.id === activeDocId);
    if (!canvas || !doc) return;
    const oldZoom = canvas.getZoom();
    canvas.setZoom(1);
    const dataURL = canvas.toDataURL({
      format: format,
      quality: 1
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
    
    const zoom = activeDocId ? (zoomMap[activeDocId] || 1) : 1;

    if (tool === 'rect') {
      const rect = new fabric.Rect({
        left: canvas.width ? (canvas.width / 2) / zoom - 75 : 100,
        top: canvas.height ? (canvas.height / 2) / zoom - 50 : 100,
        fill: '#3b82f6',
        width: 150,
        height: 100,
      });
      canvas.add(rect);
      canvas.setActiveObject(rect);
      setActiveTool('select');
    } else if (tool === 'circle') {
      const circle = new fabric.Circle({
        left: canvas.width ? (canvas.width / 2) / zoom - 75 : 150,
        top: canvas.height ? (canvas.height / 2) / zoom - 75 : 150,
        fill: '#ef4444',
        radius: 75,
      });
      canvas.add(circle);
      canvas.setActiveObject(circle);
      setActiveTool('select');
    } else if (tool === 'text') {
      const text = new fabric.IText('Double click to edit', {
        left: canvas.width ? (canvas.width / 2) / zoom - 150 : 50,
        top: canvas.height ? (canvas.height / 2) / zoom - 20 : 50,
        fontFamily: 'Inter',
        fill: '#000000',
        fontSize: 40,
      });
      canvas.add(text);
      canvas.setActiveObject(text);
      setActiveTool('select');
    } else if (tool === 'image') {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.onchange = (e) => {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (file) {
          const reader = new FileReader();
          reader.onload = (f) => {
            const data = f.target?.result as string;
            const imgElement = new Image();
            imgElement.onload = () => {
               const ImgClass = (fabric as any).Image || (fabric as any).FabricImage;
               const fImg = new ImgClass(imgElement);
               const canvasWidth = canvas.width || 800;
               if (fImg.width && fImg.width > canvasWidth) {
                 fImg.scaleToWidth(canvasWidth * 0.8);
               }
               canvas.add(fImg);
               canvas.centerObject(fImg);
               canvas.setActiveObject(fImg);
               canvas.requestRenderAll();
               setActiveTool('select');
            };
            imgElement.src = data;
          };
          reader.readAsDataURL(file);
        } else {
          setActiveTool('select');
        }
      };
      input.click();
    }
  };

  const activeZoom = activeDocId ? (zoomMap[activeDocId] || 1) : 1;

  return (
    <div className="h-screen w-screen flex flex-col bg-[var(--color-background)] text-[var(--color-foreground)] overflow-hidden relative">
      {/* Top Menu Bar */}
      <div className="h-10 bg-[var(--color-panel)] border-b border-[var(--color-panel-border)] flex items-center justify-between px-4 shrink-0 text-sm relative z-50 shadow-md">
        <div className="flex gap-4 items-center">
          <div className="flex items-center gap-2 mr-4">
            <img src="/logo.png" alt="TE Logo" className="h-6 w-6 rounded" />
            <div className="font-bold text-white tracking-widest text-xs uppercase">TEA DESIGN IN</div>
          </div>
          <DropdownMenu title="File" items={[
            { label: 'New...', shortcut: 'Ctrl+N', onClick: () => setShowNewDocModal(true) },
            { divider: true, label: '', onClick: () => {} },
            { label: 'Save Project', shortcut: 'Ctrl+S', onClick: () => handleSaveProject() },
            { label: 'Export PNG', onClick: () => handleExport('png') },
            { label: 'Export JPG', onClick: () => handleExport('jpeg') }
          ]} />
          
          <DropdownMenu title="Edit" items={[
            { label: 'Undo', shortcut: 'Ctrl+Z', onClick: () => alert('Coming soon') },
            { label: 'Redo', shortcut: 'Ctrl+Y', onClick: () => alert('Coming soon') }
          ]} />
          
          <DropdownMenu title="Image" items={[
            { label: 'Canvas Size...', onClick: () => alert('Coming soon') }
          ]} />
          
          <DropdownMenu title="Layer" items={[
            { label: 'New Layer', onClick: () => alert('Coming soon') }
          ]} />
        </div>
        
        {/* Zoom Controls & Panel Toggle */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-[#1a1a1a] rounded px-2 py-1 border border-[#333]">
          <button 
            onClick={() => activeDocId && handleZoom(activeDocId, 1 / 1.1)}
            disabled={!activeDocId}
            className="text-gray-400 hover:text-white disabled:opacity-50 cursor-pointer"
            title="Zoom Out (Ctrl + -)"
          >
            <ZoomOut size={16} />
          </button>
          <span 
            className="text-xs text-gray-300 w-12 text-center cursor-pointer hover:text-white"
            onClick={() => activeDocId && handleZoom(activeDocId, 'reset')}
            title="Reset Zoom (Ctrl + 0)"
          >
            {Math.round(activeZoom * 100)}%
          </span>
          <button 
            onClick={() => activeDocId && handleZoom(activeDocId, 1.1)}
            disabled={!activeDocId}
            className="text-gray-400 hover:text-white disabled:opacity-50 cursor-pointer"
            title="Zoom In (Ctrl + +)"
          >
            <ZoomIn size={16} />
          </button>
          </div>
          <button 
            onClick={() => setShowRightPanel(!showRightPanel)}
            className={`w-7 h-7 flex items-center justify-center rounded cursor-pointer transition-colors ${showRightPanel ? 'bg-[#333] text-[var(--color-accent)]' : 'text-gray-400 hover:text-white hover:bg-[#333]'}`}
            title="Toggle Right Panel"
          >
            <PanelRight size={16} />
          </button>
        </div>
      </div>

      {/* Tool Settings Bar */}
      <ToolSettingsBar activeTool={activeTool} canvas={getActiveCanvas()} />

      {/* Tabs Bar */}
      <div className="h-8 bg-[#1e1e1e] flex items-end px-2 border-b border-[var(--color-panel-border)] shrink-0 z-10 relative">
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

      <div className="flex flex-1 overflow-hidden relative">
        {/* Left Toolbar */}
        <div className="w-12 bg-[var(--color-panel)] border-r border-[var(--color-panel-border)] flex flex-col items-center py-2 gap-2 shrink-0 z-10">
          <ToolButton icon={<MousePointer2 size={18} />} active={activeTool === 'select'} onClick={() => setActiveTool('select')} tooltip="Move Tool (V)" />
          <ToolButton icon={<Crop size={18} />} active={activeTool === 'crop'} onClick={() => handleToolClick('crop')} tooltip="Crop Tool (C)" />
          <ToolButton icon={<Type size={18} />} active={activeTool === 'text'} onClick={() => handleToolClick('text')} tooltip="Text Tool (T)" />
          <ToolButton icon={<Square size={18} />} active={activeTool === 'rect'} onClick={() => handleToolClick('rect')} tooltip="Rectangle Tool (U)" />
          <ToolButton icon={<Circle size={18} />} active={activeTool === 'circle'} onClick={() => handleToolClick('circle')} tooltip="Ellipse Tool (O)" />
          <div className="h-[1px] w-8 bg-[var(--color-panel-border)] my-1"></div>
          <ToolButton icon={<ImageIcon size={18} />} onClick={() => handleToolClick('image')} tooltip="Import Image" />
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
                     const canvasWidth = canvas.width || 800;
                     if (fImg.width && fImg.width > canvasWidth) {
                       fImg.scaleToWidth(canvasWidth * 0.8);
                     }
                     canvas.add(fImg);
                     canvas.centerObject(fImg);
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
            <div className="m-auto flex flex-col items-center justify-center text-gray-500 bg-[var(--color-panel)] p-8 rounded-lg shadow-xl border border-[var(--color-panel-border)]">
              <img src="/logo.png" alt="TE Logo" className="h-16 w-16 mb-4 opacity-50 grayscale" />
              <p className="text-gray-400 font-medium tracking-wide">No document opened.</p>
              <button onClick={() => setShowNewDocModal(true)} className="mt-4 px-6 py-2 bg-[var(--color-accent)] hover:bg-[#0088e6] text-white rounded text-sm cursor-pointer shadow-lg transition-colors font-medium">Create New Document</button>
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

        {/* Right Panel (Layers & Properties) */}
        {showRightPanel && (
        <div className="w-64 bg-[var(--color-panel)] border-l border-[var(--color-panel-border)] flex flex-col shrink-0 z-10">
          {/* Properties Panel */}
          <div className="h-1/2 border-b border-[var(--color-panel-border)] flex flex-col">
             <div className="h-8 bg-[var(--color-surface)] border-b border-[var(--color-panel-border)] flex items-center px-3 text-xs font-semibold uppercase tracking-wider text-gray-400">
               Properties
             </div>
             <div className="flex-1 p-3 overflow-y-auto text-sm text-gray-400 flex flex-col gap-2">
               {activeDocId ? (
                 <div className="flex justify-between items-center bg-[var(--color-surface)] p-2 rounded border border-[var(--color-panel-border)]">
                    <span className="text-xs">Canvas Size</span>
                    <span className="text-white bg-[#1a1a1a] px-2 py-0.5 rounded border border-[#333] text-[10px] tracking-wider">
                      {documents.find(d => d.id === activeDocId)?.width} × {documents.find(d => d.id === activeDocId)?.height}
                    </span>
                 </div>
               ) : (
                 <div className="text-center mt-4 text-xs opacity-50">No active document</div>
               )}
             </div>
          </div>

          {/* Layers Panel */}
          <LayersPanel canvas={getActiveCanvas()} />
        </div>
        )}
      </div>

      {/* New Document Modal */}
      {showNewDocModal && (
        <NewDocumentModal 
          onClose={() => setShowNewDocModal(documents.length > 0 ? false : false)} 
          onCreate={handleCreateDocument} 
        />
      )}
    </div>
  );
}

// Modal Component for New Document
function NewDocumentModal({ onClose, onCreate }: { onClose: () => void, onCreate: (w: number, h: number) => void }) {
  const [width, setWidth] = useState(1920);
  const [height, setHeight] = useState(1080);
  const [resolution, setResolution] = useState(300);

  return (
    <div className="absolute inset-0 bg-black/60 flex items-center justify-center z-50 backdrop-blur-sm">
      <div className="bg-[var(--color-panel)] border border-[var(--color-panel-border)] rounded-lg w-[400px] shadow-2xl flex flex-col">
        <div className="flex justify-between items-center p-4 border-b border-[var(--color-panel-border)] bg-[var(--color-surface)] rounded-t-lg">
          <h2 className="font-semibold text-base text-white tracking-wide">New Document</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white cursor-pointer"><X size={18} /></button>
        </div>
        <div className="p-6 space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs text-gray-400 uppercase tracking-wider font-medium">Width (px)</label>
              <input 
                type="number" 
                value={width}
                onChange={(e) => setWidth(Number(e.target.value))}
                className="w-full bg-[#1a1a1a] border border-[#333] rounded px-3 py-2.5 text-white outline-none focus:border-[var(--color-accent)] transition-colors text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-gray-400 uppercase tracking-wider font-medium">Height (px)</label>
              <input 
                type="number" 
                value={height}
                onChange={(e) => setHeight(Number(e.target.value))}
                className="w-full bg-[#1a1a1a] border border-[#333] rounded px-3 py-2.5 text-white outline-none focus:border-[var(--color-accent)] transition-colors text-sm"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs text-gray-400 uppercase tracking-wider font-medium">Resolution (DPI)</label>
            <input 
              type="number" 
              value={resolution}
              onChange={(e) => setResolution(Number(e.target.value))}
              className="w-full bg-[#1a1a1a] border border-[#333] rounded px-3 py-2.5 text-white outline-none focus:border-[var(--color-accent)] transition-colors text-sm"
            />
            <p className="text-[10px] text-gray-500 mt-1">For print quality calculations (e.g. 300 DPI for high quality prints).</p>
          </div>
        </div>
        <div className="p-4 border-t border-[var(--color-panel-border)] flex justify-end gap-3 bg-[var(--color-surface)] rounded-b-lg">
          <button onClick={onClose} className="px-4 py-2 rounded text-sm text-gray-300 hover:text-white hover:bg-[#333] transition-colors cursor-pointer">
            Cancel
          </button>
          <button 
            onClick={() => onCreate(width, height)}
            className="px-6 py-2 rounded text-sm text-white bg-[var(--color-accent)] hover:bg-[#0088e6] transition-colors font-medium shadow cursor-pointer"
          >
            Create
          </button>
        </div>
      </div>
    </div>
  );
}

// Simple ToolButton Component
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

export default App;
