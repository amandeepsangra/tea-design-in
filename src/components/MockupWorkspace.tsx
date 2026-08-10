import React, { useState, useEffect, useRef } from 'react';
import { Package, Download, Image as ImageIcon, Upload, Plus, Trash2 } from 'lucide-react';


interface MockupWorkspaceProps {
  canvas: any;
  mockups: MockupData[];
  activeMockupId: string | null;
  onChange: (mockups: MockupData[], activeMockupId: string | null) => void;
}

interface MockupData {
  id: string;
  url: string;
}

const MAX_MOCKUPS = 8;

export function MockupWorkspace({ canvas, mockups, activeMockupId, onChange }: MockupWorkspaceProps) {
  const [livePreviewData, setLivePreviewData] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sync canvas to live preview data URL
  const updatePreview = () => {
    if (!canvas) return;
    try {
      const dataUrl = canvas.toDataURL({ format: 'png', multiplier: 1 });
      setLivePreviewData(dataUrl);
    } catch (e) {
      console.error('Error generating preview', e);
    }
  };

  useEffect(() => {
    if (!canvas) return;
    updatePreview();
    canvas.on('object:modified', updatePreview);
    canvas.on('mouse:up', updatePreview);
    return () => {
      canvas.off('object:modified', updatePreview);
      canvas.off('mouse:up', updatePreview);
    };
  }, [canvas]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    let newMockups = [...mockups];
    let newActiveId = activeMockupId;

    files.forEach((file) => {
      if (newMockups.length >= MAX_MOCKUPS) return;
      const reader = new FileReader();
      reader.onload = (f) => {
        const url = f.target?.result as string;
        const newMockup = { id: `m_${Date.now()}_${Math.random()}`, url };
        newMockups = [...newMockups, newMockup];
        if (newMockups.length === 1) newActiveId = newMockup.id;
        
        onChange(newMockups, newActiveId);
      };
      reader.readAsDataURL(file);
    });

    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeMockup = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const newMockups = mockups.filter(m => m.id !== id);
    let newActiveId = activeMockupId;
    if (activeMockupId === id) {
      newActiveId = newMockups.length > 0 ? newMockups[0].id : null;
    }
    onChange(newMockups, newActiveId);
  };

  const activeMockup = mockups.find(m => m.id === activeMockupId);
  const activeIndex = activeMockup ? mockups.findIndex(m => m.id === activeMockupId) : -1;
  const emptySlots = Math.max(0, MAX_MOCKUPS - mockups.length);

  const goToPrev = () => {
    if (activeIndex > 0) onChange(mockups, mockups[activeIndex - 1].id);
  };
  const goToNext = () => {
    if (activeIndex < mockups.length - 1) onChange(mockups, mockups[activeIndex + 1].id);
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-[var(--bg-3)] overflow-hidden relative border-l border-[var(--bg-5)]">
      {/* Hidden Global File Input */}
      <input 
        type="file" 
        accept="image/*" 
        multiple 
        className="hidden" 
        ref={fileInputRef} 
        onChange={handleFileUpload} 
      />

      {/* Header */}
      <div className="h-10 border-b border-[var(--bg-5)] bg-[var(--bg-3)] flex items-center px-4 shrink-0 justify-between">
        <span className="text-sm font-medium text-white flex items-center gap-2">
          <Package size={14} className="text-[var(--color-accent)]" />
          Live Mockup Studio ({mockups.length}/{MAX_MOCKUPS})
        </span>
        {mockups.length > 0 && (
          <button className="flex items-center gap-1.5 bg-[var(--color-accent)] text-white px-3 py-1 rounded text-[11px] font-medium hover:bg-blue-600 transition-colors cursor-pointer shadow">
            <Download size={12} />
            Export All
          </button>
        )}
      </div>

      {/* Main Focused Preview Area */}
      <div className="flex-1 flex items-center justify-center p-4 relative overflow-hidden bg-[var(--bg-1)]">
        {!activeMockup ? (
          <div className="flex flex-col items-center text-center">
            <div className="w-16 h-16 bg-[var(--bg-5)] border border-[var(--bg-8)] rounded-full flex items-center justify-center mb-4">
              <ImageIcon size={24} className="text-[var(--text-6)]" />
            </div>
            <h3 className="text-white font-medium mb-2">No Mockups Linked</h3>
            <p className="text-[var(--text-3)] text-xs mb-6 max-w-[250px]">
              Upload up to 8 transparent mockup templates to preview your design.
            </p>
            <button 
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-2 bg-[var(--bg-7)] hover:bg-[var(--bg-8)] border border-[var(--bg-9)] text-white px-4 py-2 rounded text-sm transition-colors cursor-pointer"
            >
              <Upload size={16} />
              Upload Templates
            </button>
          </div>
        ) : (
          <div className="w-full h-full flex items-center justify-center relative rounded-lg border border-[var(--bg-8)] overflow-hidden bg-[var(--bg-2)] shadow-inner group">
            <div className="absolute top-2 left-2 bg-black/60 px-2 py-1 rounded text-[10px] text-[var(--color-accent)] border border-[var(--color-accent)]/30 z-20 backdrop-blur">
              SYNC ACTIVE
            </div>
            
            {/* The base mockup image */}
            <img 
              src={activeMockup.url} 
              alt="Mockup Base" 
              className="absolute max-w-[90%] max-h-[90%] object-contain z-10 pointer-events-none"
            />
            
            {/* The design overlay */}
            {livePreviewData && (
              <img 
                src={livePreviewData} 
                alt="Live Design" 
                className="absolute max-w-[90%] max-h-[90%] object-contain mix-blend-multiply opacity-90 z-10"
                style={{ pointerEvents: 'none' }}
              />
            )}

            {/* Slider Navigation Controls */}
            {activeIndex > 0 && (
              <button 
                onClick={goToPrev}
                className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-12 flex items-center justify-center bg-black/40 hover:bg-black/80 text-white rounded-r-md opacity-0 group-hover:opacity-100 transition-opacity z-20 cursor-pointer"
              >
                <span className="text-xl leading-none">‹</span>
              </button>
            )}
            {activeIndex < mockups.length - 1 && (
              <button 
                onClick={goToNext}
                className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-12 flex items-center justify-center bg-black/40 hover:bg-black/80 text-white rounded-l-md opacity-0 group-hover:opacity-100 transition-opacity z-20 cursor-pointer"
              >
                <span className="text-xl leading-none">›</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Bottom Gallery Strip */}
      <div className="h-28 border-t border-[var(--bg-5)] bg-[var(--bg-3)] p-2 flex gap-2 overflow-x-auto items-center shrink-0">
        {mockups.map((mockup, index) => (
          <div 
            key={mockup.id} 
            onClick={() => onChange(mockups, mockup.id)}
            className={`w-20 h-20 shrink-0 rounded bg-[var(--bg-1)] border-2 cursor-pointer relative group overflow-hidden ${
              activeMockupId === mockup.id ? 'border-[var(--color-accent)]' : 'border-[var(--bg-8)] hover:border-[var(--text-6)]'
            }`}
          >
            {/* Small composited thumbnail */}
            <div className="absolute inset-1 flex items-center justify-center">
               <img src={mockup.url} className="absolute max-w-full max-h-full object-contain pointer-events-none" />
               {livePreviewData && (
                 <img src={livePreviewData} className="absolute max-w-full max-h-full object-contain mix-blend-multiply opacity-90 pointer-events-none" />
               )}
            </div>
            
            <button 
              onClick={(e) => removeMockup(mockup.id, e)}
              className="absolute top-1 right-1 bg-black/70 hover:bg-[var(--color-danger)] text-white p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity z-30 cursor-pointer"
            >
              <Trash2 size={10} />
            </button>
            <div className="absolute bottom-0 inset-x-0 bg-black/60 text-[9px] text-center text-white py-0.5 pointer-events-none z-20">
              View {index + 1}
            </div>
          </div>
        ))}

        {/* Empty Slots */}
        {Array.from({ length: emptySlots }).map((_, i) => (
          <div 
            key={`empty_${i}`}
            onClick={() => fileInputRef.current?.click()}
            className="w-20 h-20 shrink-0 rounded border-2 border-dashed border-[var(--bg-8)] hover:border-[var(--text-6)] bg-[var(--bg-3)] hover:bg-[var(--bg-5)] cursor-pointer flex flex-col items-center justify-center text-[var(--text-6)] hover:text-[var(--text-3)] transition-colors relative"
          >
            <Plus size={16} className="mb-1" />
            <span className="text-[9px]">Add Mockup</span>
          </div>
        ))}
      </div>
    </div>
  );
}
