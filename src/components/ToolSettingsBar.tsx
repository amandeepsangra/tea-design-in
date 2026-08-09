import React, { useEffect, useState } from 'react';
import * as fabric from 'fabric';

interface ToolSettingsBarProps {
  activeTool: string;
  canvas: fabric.Canvas | null;
}

export function ToolSettingsBar({ activeTool, canvas }: ToolSettingsBarProps) {
  const [showControls, setShowControls] = useState(true);
  const [fillColor, setFillColor] = useState('#000000');
  const [fontSize, setFontSize] = useState(40);
  const [fontFamily, setFontFamily] = useState('Inter');
  const [fontWeight, setFontWeight] = useState('normal');
  const [fontStyle, setFontStyle] = useState('normal');

  useEffect(() => {
    if (!canvas) return;
    
    const updateControlsState = () => {
      const obj = canvas.getActiveObject();
      if (obj) {
        setShowControls(obj.hasControls);
        if (obj.fill && typeof obj.fill === 'string') setFillColor(obj.fill);
        if (obj.type === 'i-text' || obj.type === 'text') {
          const textObj = obj as fabric.IText;
          setFontSize(textObj.fontSize || 40);
          setFontFamily(textObj.fontFamily || 'Inter');
          setFontWeight(textObj.fontWeight as string || 'normal');
          setFontStyle(textObj.fontStyle || 'normal');
        }
      }
    };

    updateControlsState();
    
    canvas.on('selection:created', updateControlsState);
    canvas.on('selection:updated', updateControlsState);
    canvas.on('selection:cleared', updateControlsState);
    
    return () => {
      canvas.off('selection:created', updateControlsState);
      canvas.off('selection:updated', updateControlsState);
      canvas.off('selection:cleared', updateControlsState);
    }
  }, [activeTool, canvas]);

  const toggleControls = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!canvas) return;
    const newState = e.target.checked;
    setShowControls(newState);
    
    const activeObj = canvas.getActiveObject();
    if (activeObj) {
      activeObj.set({ hasControls: newState, hasBorders: newState });
      canvas.requestRenderAll();
    }
  };

  const updateObjectProperty = (key: string, value: any) => {
    if (!canvas) return;
    const activeObj = canvas.getActiveObject();
    if (activeObj) {
      activeObj.set(key as any, value);
      canvas.requestRenderAll();
    }
  };

  if (activeTool === 'select') {
    return (
      <div className="h-10 bg-[var(--color-surface)] border-b border-[var(--color-panel-border)] flex items-center px-4 shrink-0 text-sm z-10 gap-4">
        <span className="text-gray-400 font-medium">Select Tool:</span>
        <label className="flex items-center gap-2 text-gray-300 cursor-pointer hover:text-white">
          <input 
            type="checkbox" 
            checked={showControls} 
            onChange={toggleControls}
            className="accent-[var(--color-accent)] cursor-pointer"
          />
          Show Transform Controls
        </label>
      </div>
    );
  }
  
  if (activeTool === 'text') {
    return (
      <div className="h-10 bg-[var(--color-surface)] border-b border-[var(--color-panel-border)] flex items-center px-4 shrink-0 text-sm z-10 gap-4">
        <span className="text-gray-400 font-medium">Text Tool:</span>
        <select 
          value={fontFamily} 
          onChange={(e) => { setFontFamily(e.target.value); updateObjectProperty('fontFamily', e.target.value); }}
          className="bg-[var(--color-panel)] border border-[var(--color-panel-border)] rounded px-2 py-1 text-gray-200 outline-none"
        >
          <option value="Inter">Inter</option>
          <option value="Arial">Arial</option>
          <option value="Times New Roman">Times New Roman</option>
          <option value="Courier New">Courier New</option>
        </select>
        <div className="flex items-center gap-2">
          <span className="text-gray-400">Size:</span>
          <input 
            type="number" 
            value={fontSize} 
            onChange={(e) => { const v = Number(e.target.value); setFontSize(v); updateObjectProperty('fontSize', v); }}
            className="w-16 bg-[var(--color-panel)] border border-[var(--color-panel-border)] rounded px-2 py-1 text-gray-200 outline-none"
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-gray-400">Color:</span>
          <input 
            type="color" 
            value={fillColor} 
            onChange={(e) => { setFillColor(e.target.value); updateObjectProperty('fill', e.target.value); }}
            className="w-6 h-6 bg-transparent rounded cursor-pointer border-none p-0"
          />
        </div>
        <button 
          onClick={() => { const w = fontWeight === 'bold' ? 'normal' : 'bold'; setFontWeight(w); updateObjectProperty('fontWeight', w); }}
          className={`px-2 py-1 rounded border font-bold ${fontWeight === 'bold' ? 'bg-[var(--color-accent)] border-[var(--color-accent)] text-white' : 'bg-[var(--color-panel)] border-[var(--color-panel-border)] text-gray-400'}`}
        >B</button>
        <button 
          onClick={() => { const s = fontStyle === 'italic' ? 'normal' : 'italic'; setFontStyle(s); updateObjectProperty('fontStyle', s); }}
          className={`px-2 py-1 rounded border italic ${fontStyle === 'italic' ? 'bg-[var(--color-accent)] border-[var(--color-accent)] text-white' : 'bg-[var(--color-panel)] border-[var(--color-panel-border)] text-gray-400'}`}
        >I</button>
      </div>
    );
  }

  if (activeTool === 'rect' || activeTool === 'circle') {
    return (
      <div className="h-10 bg-[var(--color-surface)] border-b border-[var(--color-panel-border)] flex items-center px-4 shrink-0 text-sm z-10 gap-4">
        <span className="text-gray-400 font-medium">Shape Tool:</span>
        <div className="flex items-center gap-2">
          <span className="text-gray-400">Fill:</span>
          <input 
            type="color" 
            value={fillColor} 
            onChange={(e) => { setFillColor(e.target.value); updateObjectProperty('fill', e.target.value); }}
            className="w-6 h-6 bg-transparent rounded cursor-pointer border-none p-0"
          />
        </div>
      </div>
    );
  }
  
  if (activeTool === 'crop') {
    return (
      <div className="h-10 bg-[var(--color-surface)] border-b border-[var(--color-panel-border)] flex items-center px-4 shrink-0 text-sm z-10 gap-4">
        <span className="text-gray-400 font-medium">Crop Tool:</span>
        <button className="px-3 py-1 bg-[var(--color-panel)] hover:bg-[#333] rounded text-gray-200 cursor-pointer border border-[var(--color-panel-border)] transition-colors">Free</button>
        <button className="px-3 py-1 bg-[var(--color-panel)] hover:bg-[#333] rounded text-gray-200 cursor-pointer border border-[var(--color-panel-border)] transition-colors">1:1</button>
        <button className="px-3 py-1 bg-[var(--color-panel)] hover:bg-[#333] rounded text-gray-200 cursor-pointer border border-[var(--color-panel-border)] transition-colors">16:9</button>
        <div className="flex-1"></div>
        <button className="px-4 py-1 bg-red-500/10 text-red-400 hover:bg-red-500/20 rounded cursor-pointer border border-red-500/30 transition-colors">Cancel</button>
        <button className="px-4 py-1 bg-[var(--color-accent)] text-white hover:bg-[#0088e6] rounded cursor-pointer transition-colors shadow">Apply Crop</button>
      </div>
    );
  }

  return (
    <div className="h-10 bg-[var(--color-surface)] border-b border-[var(--color-panel-border)] flex items-center px-4 shrink-0 text-sm z-10">
      <span className="text-gray-500 italic">No specific settings for {activeTool} tool.</span>
    </div>
  );
}
