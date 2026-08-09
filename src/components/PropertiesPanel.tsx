import React, { useEffect, useState } from 'react';
import * as fabric from 'fabric';

interface PropertiesPanelProps {
  canvas: fabric.Canvas | null;
}

const getObjType = (obj: fabric.Object | null): string => {
  if (!obj) return '';
  const t = (obj as any).type || obj.constructor?.name || '';
  return t.toLowerCase();
};

const isImage = (obj: fabric.Object | null) => {
  const t = getObjType(obj);
  return t === 'image' || t === 'fabricimage';
};

const SectionLabel = ({ label }: { label: string }) => (
  <div className="text-[9px] font-bold text-[#555] uppercase tracking-widest py-1 border-b border-[#1e1e1e] mb-2">{label}</div>
);

const PropRow = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="flex justify-between items-center py-1">
    <span className="text-[11px] text-[#777]">{label}</span>
    <div className="flex items-center">{children}</div>
  </div>
);

export function PropertiesPanel({ canvas }: PropertiesPanelProps) {
  const [activeObj, setActiveObj] = useState<fabric.Object | null>(null);

  // Stroke
  const [stroke, setStroke] = useState('#000000');
  const [strokeWidth, setStrokeWidth] = useState(0);

  // Canvas bg
  const [canvasBg, setCanvasBg] = useState('#ffffff');

  // Shadow
  const [hasShadow, setHasShadow] = useState(false);
  const [shadowColor, setShadowColor] = useState('#000000');
  const [shadowBlur, setShadowBlur] = useState(10);
  const [shadowOffsetX, setShadowOffsetX] = useState(5);
  const [shadowOffsetY, setShadowOffsetY] = useState(5);

  // Image Adjustments
  const [brightness, setBrightness] = useState(0);
  const [contrast, setContrast] = useState(0);
  const [saturation, setSaturation] = useState(0);
  const [blur, setBlur] = useState(0);

  useEffect(() => {
    if (!canvas) return;

    const updateProps = () => {
      const obj = canvas.getActiveObject();
      setActiveObj(obj || null);

      if (obj) {
        setStroke(obj.stroke && typeof obj.stroke === 'string' ? obj.stroke : '#000000');
        setStrokeWidth(obj.strokeWidth || 0);

        if (obj.shadow) {
          const s = obj.shadow as fabric.Shadow;
          setHasShadow(true);
          setShadowColor(s.color || '#000000');
          setShadowBlur(s.blur || 10);
          setShadowOffsetX(s.offsetX || 5);
          setShadowOffsetY(s.offsetY || 5);
        } else {
          setHasShadow(false);
        }

        // Read existing filters for image
        if (isImage(obj)) {
          const img = obj as fabric.Image;
          const filters = img.filters || [];
          const getF = (type: string, prop: string) => {
            const f = filters.find((f: any) => f && f.type === type) as any;
            return f ? f[prop] : 0;
          };
          setBrightness(getF('Brightness', 'brightness'));
          setContrast(getF('Contrast', 'contrast'));
          setSaturation(getF('Saturation', 'saturation'));
          setBlur(getF('Blur', 'blur'));
        }
      } else {
        if (canvas.backgroundColor && typeof canvas.backgroundColor === 'string') {
          setCanvasBg(canvas.backgroundColor);
        } else {
          setCanvasBg('#ffffff');
        }
      }
    };

    updateProps();
    canvas.on('selection:created', updateProps);
    canvas.on('selection:updated', updateProps);
    canvas.on('selection:cleared', updateProps);
    canvas.on('object:modified', updateProps);

    return () => {
      canvas.off('selection:created', updateProps);
      canvas.off('selection:updated', updateProps);
      canvas.off('selection:cleared', updateProps);
      canvas.off('object:modified', updateProps);
    };
  }, [canvas]);

  const set = (key: string, value: any) => {
    if (!canvas || !activeObj) return;
    activeObj.set(key as any, value);
    canvas.requestRenderAll();
  };

  const applyFilter = (filterType: string, prop: string, value: number) => {
    if (!canvas || !activeObj) return;
    const img = activeObj as fabric.Image;
    if (!img.filters) img.filters = [];
    const idx = img.filters.findIndex((f: any) => f && f.type === filterType);
    const FilterClass = (fabric.filters as any)[filterType];
    if (idx >= 0) {
      (img.filters[idx] as any)[prop] = value;
    } else {
      img.filters.push(new FilterClass({ [prop]: value }));
    }
    img.applyFilters();
    canvas.requestRenderAll();
  };

  const updateShadow = (field: string, value: any) => {
    if (!canvas || !activeObj) return;
    let s = activeObj.shadow as fabric.Shadow;
    if (!s) s = new fabric.Shadow({ color: shadowColor, blur: shadowBlur, offsetX: shadowOffsetX, offsetY: shadowOffsetY });
    (s as any)[field] = value;
    activeObj.set('shadow', s);
    canvas.requestRenderAll();
  };

  const toggleShadow = (enable: boolean) => {
    if (!canvas || !activeObj) return;
    setHasShadow(enable);
    if (enable) activeObj.set('shadow', new fabric.Shadow({ color: shadowColor, blur: shadowBlur, offsetX: shadowOffsetX, offsetY: shadowOffsetY }));
    else activeObj.set('shadow', null);
    canvas.requestRenderAll();
  };

  const updateCanvasBg = (color: string) => {
    if (!canvas) return;
    setCanvasBg(color);
    canvas.backgroundColor = color;
    canvas.requestRenderAll();
  };

  const colorCls = "w-7 h-7 rounded border border-[#2a2a2a] cursor-pointer bg-transparent";
  const inputCls = "bg-[#111] border border-[#2a2a2a] rounded px-2 py-0.5 text-[11px] text-white outline-none focus:border-[#0096ff] w-16 text-center";

  return (
    <div className="h-1/2 border-b border-[#111] flex flex-col bg-[#1c1c1c]">
      {/* Header */}
      <div className="h-7 bg-[#181818] border-b border-[#111] flex items-center px-2 shrink-0">
        <div className="flex items-center gap-1.5">
          <div className="w-1 h-3.5 rounded-full bg-[#0096ff]" />
          <span className="text-[9px] font-bold uppercase tracking-widest text-[#555]">
            {activeObj ? `${getObjType(activeObj).replace('i-', '').replace('fabric','').toUpperCase()}` : 'Properties'}
          </span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-0 text-sm">
        {!activeObj ? (
          <div>
            <div className="text-center my-5 flex flex-col items-center gap-2">
              <div className="w-12 h-12 rounded-xl bg-[#111] border border-[#1e1e1e] flex items-center justify-center">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#333" strokeWidth="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 9h6v6H9z"/></svg>
              </div>
              <span className="text-[10px] text-[#444]">Select a layer to edit</span>
            </div>
            <SectionLabel label="Canvas" />
            <PropRow label="Background">
              <input type="color" value={canvasBg} onChange={e => updateCanvasBg(e.target.value)} className={colorCls} />
            </PropRow>
          </div>
        ) : (
          <>
            {/* Stroke */}
            <SectionLabel label="Stroke" />
            <PropRow label="Color">
              <input type="color" value={stroke} onChange={e => { setStroke(e.target.value); set('stroke', e.target.value); }} className={colorCls} />
            </PropRow>
            <PropRow label="Width">
              <input type="number" min="0" value={strokeWidth}
                onChange={e => { const v = Number(e.target.value); setStrokeWidth(v); set('strokeWidth', v); }}
                className={inputCls} />
            </PropRow>

            {/* Shadow */}
            <SectionLabel label="Drop Shadow" />
            <PropRow label="Enable">
              <label className="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" checked={hasShadow} onChange={e => toggleShadow(e.target.checked)} className="sr-only peer" />
                <div className="w-8 h-4 bg-[#333] rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-[#0096ff]" />
              </label>
            </PropRow>
            {hasShadow && <>
              <PropRow label="Color">
                <input type="color" value={shadowColor} onChange={e => { setShadowColor(e.target.value); updateShadow('color', e.target.value); }} className={colorCls} />
              </PropRow>
              <PropRow label="Blur">
                <div className="flex items-center gap-1">
                  <input type="range" min="0" max="60" value={shadowBlur}
                    onChange={e => { const v = Number(e.target.value); setShadowBlur(v); updateShadow('blur', v); }}
                    className="w-20 accent-[#0096ff]" />
                  <span className="text-[10px] text-[#555] w-6">{shadowBlur}</span>
                </div>
              </PropRow>
              <PropRow label="Offset X">
                <input type="number" value={shadowOffsetX}
                  onChange={e => { const v = Number(e.target.value); setShadowOffsetX(v); updateShadow('offsetX', v); }}
                  className="w-12 bg-[#111] border border-[#2a2a2a] rounded px-1.5 py-0.5 text-[10px] text-white outline-none text-center" />
              </PropRow>
              <PropRow label="Offset Y">
                <input type="number" value={shadowOffsetY}
                  onChange={e => { const v = Number(e.target.value); setShadowOffsetY(v); updateShadow('offsetY', v); }}
                  className="w-12 bg-[#111] border border-[#2a2a2a] rounded px-1.5 py-0.5 text-[10px] text-white outline-none text-center" />
              </PropRow>
            </>}

            {/* Image Adjustments */}
            {isImage(activeObj) && <>
              <SectionLabel label="Image Adjustments" />
              {[
                { label: 'Brightness', type: 'Brightness', prop: 'brightness', val: brightness, set: setBrightness, min: -1, max: 1 },
                { label: 'Contrast',   type: 'Contrast',   prop: 'contrast',   val: contrast,   set: setContrast,   min: -1, max: 1 },
                { label: 'Saturation', type: 'Saturation', prop: 'saturation', val: saturation, set: setSaturation, min: -1, max: 1 },
                { label: 'Blur',       type: 'Blur',       prop: 'blur',       val: blur,       set: setBlur,       min: 0,  max: 1 },
              ].map(f => (
                <PropRow key={f.label} label={f.label}>
                  <div className="flex items-center gap-1">
                    <input type="range" min={f.min} max={f.max} step="0.05" value={f.val}
                      onChange={e => { const v = Number(e.target.value); f.set(v); applyFilter(f.type, f.prop, v); }}
                      className="w-20 accent-[#0096ff]" />
                    <span className="text-[9px] text-[#555] w-8 text-right">{Math.round(f.val * 100)}</span>
                  </div>
                </PropRow>
              ))}

              <SectionLabel label="Clipping Mask" />
              <button
                onClick={() => {
                  if (!canvas) return;
                  const objs = canvas.getObjects();
                  const idx = objs.indexOf(activeObj);
                  if (idx > 0) {
                    const shape = objs[idx - 1];
                    shape.set('absolutePositioned', true);
                    activeObj.set('clipPath', shape);
                    shape.set('visible', false);
                    canvas.requestRenderAll();
                  } else alert('Place a shape layer directly below this image.');
                }}
                className="w-full py-2 mt-1 bg-[#111] border border-[#2a2a2a] rounded text-[11px] text-white hover:border-[#0096ff] transition-all cursor-pointer">
                ✂ Clip to Shape Below
              </button>
              <button
                onClick={() => {
                  if (!canvas) return;
                  const mask = activeObj.clipPath;
                  if (mask) { (mask as fabric.Object).set('visible', true); activeObj.set('clipPath', undefined); canvas.requestRenderAll(); }
                }}
                className="w-full py-1.5 mt-1 text-[11px] text-[#555] hover:text-white cursor-pointer text-center transition-colors">
                Release Mask
              </button>
            </>}
          </>
        )}
      </div>
    </div>
  );
}
