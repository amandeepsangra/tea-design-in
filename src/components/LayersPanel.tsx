import React, { useEffect, useState } from 'react';
import * as fabric from 'fabric';
import { Layers, Trash2, Eye, EyeOff, Type, Image as ImageIcon, Square, Circle } from 'lucide-react';

interface LayersPanelProps {
  canvas: fabric.Canvas | null;
}

export function LayersPanel({ canvas }: LayersPanelProps) {
  const [objects, setObjects] = useState<fabric.Object[]>([]);
  const [activeObj, setActiveObj] = useState<fabric.Object | null>(null);

  useEffect(() => {
    if (!canvas) {
      setObjects([]);
      setActiveObj(null);
      return;
    }

    const updateLayers = () => {
      // Fabric getObjects() returns objects from bottom to top. 
      // In UI we want top to bottom, so we reverse it.
      setObjects([...canvas.getObjects()].reverse());
      
      const activeObjects = canvas.getActiveObjects();
      setActiveObj(activeObjects.length === 1 ? activeObjects[0] : null);
    };

    updateLayers();

    canvas.on('object:added', updateLayers);
    canvas.on('object:removed', updateLayers);
    canvas.on('object:modified', updateLayers);
    canvas.on('selection:created', updateLayers);
    canvas.on('selection:updated', updateLayers);
    canvas.on('selection:cleared', updateLayers);

    return () => {
      canvas.off('object:added', updateLayers);
      canvas.off('object:removed', updateLayers);
      canvas.off('object:modified', updateLayers);
      canvas.off('selection:created', updateLayers);
      canvas.off('selection:updated', updateLayers);
      canvas.off('selection:cleared', updateLayers);
    };
  }, [canvas]);

  const handleSelect = (obj: fabric.Object) => {
    if (canvas) {
      canvas.setActiveObject(obj);
      canvas.requestRenderAll();
    }
  };

  const handleDelete = (e: React.MouseEvent, obj: fabric.Object) => {
    e.stopPropagation();
    if (canvas) {
      const activeObjects = canvas.getActiveObjects();
      if (activeObjects.includes(obj)) canvas.discardActiveObject();
      canvas.remove(obj);
      canvas.requestRenderAll();
    }
  };

  const toggleVisibility = (e: React.MouseEvent, obj: fabric.Object) => {
    e.stopPropagation();
    if (canvas) {
      obj.set('visible', !obj.visible);
      canvas.requestRenderAll();
      // force re-render of panel
      setObjects([...canvas.getObjects()].reverse());
    }
  };
  
  const moveUp = (e: React.MouseEvent, obj: fabric.Object) => {
    e.stopPropagation();
    if (canvas) {
       // get current index
       const objects = canvas.getObjects();
       const idx = objects.indexOf(obj);
       if (idx < objects.length - 1) {
         // Swap elements in the array
         objects[idx] = objects[idx + 1];
         objects[idx + 1] = obj;
         canvas.requestRenderAll();
         setObjects([...objects].reverse());
       }
    }
  }
  
  const moveDown = (e: React.MouseEvent, obj: fabric.Object) => {
    e.stopPropagation();
    if (canvas) {
       const objects = canvas.getObjects();
       const idx = objects.indexOf(obj);
       if (idx > 0) {
         objects[idx] = objects[idx - 1];
         objects[idx - 1] = obj;
         canvas.requestRenderAll();
         setObjects([...objects].reverse());
       }
    }
  }

  const getIcon = (obj: fabric.Object) => {
    if (obj.type === 'i-text' || obj.type === 'text') return <Type size={14} />;
    if (obj.type === 'image') return <ImageIcon size={14} />;
    if (obj.type === 'rect') return <Square size={14} />;
    if (obj.type === 'circle') return <Circle size={14} />;
    return <Layers size={14} />;
  };

  const getName = (obj: fabric.Object) => {
    if (obj.name) return obj.name;
    if (obj.type === 'i-text' || obj.type === 'text') {
       const text = (obj as any).text || 'Text';
       return text.length > 15 ? text.substring(0, 15) + '...' : text;
    }
    return obj.type || 'Object';
  };

  return (
    <div className="flex-1 flex flex-col">
      <div className="h-8 bg-[var(--color-surface)] border-b border-[var(--color-panel-border)] flex items-center justify-between px-3 text-xs font-semibold uppercase tracking-wider text-gray-400">
        <span>Layers</span>
        <Layers size={14} />
      </div>
      <div className="flex-1 p-2 overflow-y-auto space-y-1 bg-[#1a1a1a]/50">
        {objects.length > 0 ? objects.map((obj, i) => {
          const isSelected = activeObj === obj;
          return (
            <div 
              key={i} // in a real app, objects should have unique IDs
              onClick={() => handleSelect(obj)}
              className={`border rounded p-1.5 text-sm flex items-center gap-2 cursor-pointer shadow-sm transition-colors ${isSelected ? 'bg-[var(--color-accent)]/20 border-[var(--color-accent)]' : 'bg-[var(--color-panel)] border-[var(--color-panel-border)] hover:bg-[#333]'}`}
            >
              <button onClick={(e) => toggleVisibility(e, obj)} className="text-gray-400 hover:text-white shrink-0">
                {obj.visible !== false ? <Eye size={14} /> : <EyeOff size={14} />}
              </button>
              
              <div className="w-6 h-6 bg-[var(--color-surface)] rounded-sm shrink-0 flex items-center justify-center text-gray-400">
                {getIcon(obj)}
              </div>
              
              <span className={`truncate flex-1 text-xs ${isSelected ? 'text-white font-medium' : 'text-gray-300'}`}>
                {getName(obj)}
              </span>
              
              {isSelected && (
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={(e) => moveUp(e, obj)} className="text-gray-400 hover:text-white p-0.5" title="Move Up">↑</button>
                  <button onClick={(e) => moveDown(e, obj)} className="text-gray-400 hover:text-white p-0.5" title="Move Down">↓</button>
                  <button onClick={(e) => handleDelete(e, obj)} className="text-red-400 hover:text-red-500 ml-1" title="Delete">
                    <Trash2 size={12} />
                  </button>
                </div>
              )}
            </div>
          )
        }) : (
          <div className="text-gray-500 text-xs text-center mt-4 opacity-50">No layers</div>
        )}
      </div>
    </div>
  );
}
