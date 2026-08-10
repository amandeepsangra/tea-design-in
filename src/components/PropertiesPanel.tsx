import React, { useEffect, useState } from 'react';
import * as fabric from 'fabric';
import {
  AlignHorizontalJustifyStart, AlignHorizontalJustifyCenter, AlignHorizontalJustifyEnd,
  AlignVerticalJustifyStart, AlignVerticalJustifyCenter, AlignVerticalJustifyEnd,
  AlignHorizontalDistributeCenter, AlignVerticalDistributeCenter,
} from 'lucide-react';

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
  <div className="text-[9px] font-bold text-[var(--text-6)] uppercase tracking-widest py-1 border-b border-[var(--bg-4)] mb-2">{label}</div>
);

const PropRow = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="flex justify-between items-center py-1">
    <span className="text-[11px] text-[var(--text-4)]">{label}</span>
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

  // Shadow / Glow — both are the same underlying fabric `shadow` primitive (fabric only
  // supports one shadow per object), so they're presented as mutually-exclusive modes
  // rather than two independent toggles that would silently overwrite each other.
  const [effectMode, setEffectMode] = useState<'none' | 'shadow' | 'glow'>('none');
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
          // Zero offset reads as a glow; anything else reads as a drop shadow. (A drop
          // shadow deliberately set to 0,0 offset would also read as "glow" here — a
          // harmless label ambiguity since the two are the same primitive anyway.)
          setEffectMode(!s.offsetX && !s.offsetY ? 'glow' : 'shadow');
          setShadowColor(s.color || '#000000');
          setShadowBlur(s.blur || 10);
          setShadowOffsetX(s.offsetX || 5);
          setShadowOffsetY(s.offsetY || 5);
        } else {
          setEffectMode('none');
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
    if (effectMode === 'glow') { (s as any).offsetX = 0; (s as any).offsetY = 0; }
    activeObj.set('shadow', s);
    canvas.requestRenderAll();
  };

  const applyEffect = (mode: 'none' | 'shadow' | 'glow') => {
    if (!canvas || !activeObj) return;
    setEffectMode(mode);
    if (mode === 'none') {
      activeObj.set('shadow', null);
    } else if (mode === 'shadow') {
      activeObj.set('shadow', new fabric.Shadow({ color: shadowColor, blur: shadowBlur, offsetX: shadowOffsetX, offsetY: shadowOffsetY }));
    } else {
      // A glow is just a shadow with no offset — bigger blur reads better as a glow.
      activeObj.set('shadow', new fabric.Shadow({ color: shadowColor, blur: Math.max(shadowBlur, 15), offsetX: 0, offsetY: 0 }));
    }
    canvas.requestRenderAll();
  };

  const updateCanvasBg = (color: string) => {
    if (!canvas) return;
    setCanvasBg(color);
    canvas.backgroundColor = color;
    canvas.requestRenderAll();
  };

  // ─── Align & Distribute (multi-select) ───
  // Runs against each object's absolute bounding box rather than the ActiveSelection's
  // own (group-relative) coordinates — simpler and avoids the selection's internal
  // offset math entirely. The selection is torn down, objects repositioned in absolute
  // canvas space, then regrouped so the result still reads as one selection afterward.
  const isMultiSelect = !!activeObj && getObjType(activeObj) === 'activeselection' && (activeObj as any)._objects?.length > 1;

  const withMultiSelection = (fn: (objs: fabric.Object[], bounds: { left: number; top: number; right: number; bottom: number; width: number; height: number }) => void) => {
    if (!canvas) return;
    const objs = [...canvas.getActiveObjects()];
    if (objs.length < 2) return;
    canvas.discardActiveObject();

    let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
    objs.forEach(o => {
      o.setCoords();
      const r = o.getBoundingRect();
      left = Math.min(left, r.left); top = Math.min(top, r.top);
      right = Math.max(right, r.left + r.width); bottom = Math.max(bottom, r.top + r.height);
    });
    fn(objs, { left, top, right, bottom, width: right - left, height: bottom - top });

    objs.forEach(o => o.setCoords());
    canvas.setActiveObject(new fabric.ActiveSelection(objs, { canvas }));
    canvas.requestRenderAll();
  };

  const alignLeft = () => withMultiSelection((objs, b) => objs.forEach(o => {
    const r = o.getBoundingRect(); o.set('left', (o.left || 0) + (b.left - r.left));
  }));
  const alignHCenter = () => withMultiSelection((objs, b) => objs.forEach(o => {
    const r = o.getBoundingRect(); o.set('left', (o.left || 0) + (b.left + b.width / 2 - (r.left + r.width / 2)));
  }));
  const alignRight = () => withMultiSelection((objs, b) => objs.forEach(o => {
    const r = o.getBoundingRect(); o.set('left', (o.left || 0) + (b.right - (r.left + r.width)));
  }));
  const alignTop = () => withMultiSelection((objs, b) => objs.forEach(o => {
    const r = o.getBoundingRect(); o.set('top', (o.top || 0) + (b.top - r.top));
  }));
  const alignVCenter = () => withMultiSelection((objs, b) => objs.forEach(o => {
    const r = o.getBoundingRect(); o.set('top', (o.top || 0) + (b.top + b.height / 2 - (r.top + r.height / 2)));
  }));
  const alignBottom = () => withMultiSelection((objs, b) => objs.forEach(o => {
    const r = o.getBoundingRect(); o.set('top', (o.top || 0) + (b.bottom - (r.top + r.height)));
  }));
  const distributeHorizontal = () => withMultiSelection((objs, b) => {
    if (objs.length < 3) return;
    const items = objs.map(o => ({ o, r: o.getBoundingRect() })).sort((a, c) => a.r.left - c.r.left);
    const totalWidth = items.reduce((s, x) => s + x.r.width, 0);
    const gap = (b.width - totalWidth) / (items.length - 1);
    let cursor = b.left;
    items.forEach(({ o, r }) => { o.set('left', (o.left || 0) + (cursor - r.left)); cursor += r.width + gap; });
  });
  const distributeVertical = () => withMultiSelection((objs, b) => {
    if (objs.length < 3) return;
    const items = objs.map(o => ({ o, r: o.getBoundingRect() })).sort((a, c) => a.r.top - c.r.top);
    const totalHeight = items.reduce((s, x) => s + x.r.height, 0);
    const gap = (b.height - totalHeight) / (items.length - 1);
    let cursor = b.top;
    items.forEach(({ o, r }) => { o.set('top', (o.top || 0) + (cursor - r.top)); cursor += r.height + gap; });
  });

  const alignBtnCls = "p-1.5 rounded border border-[var(--bg-7)] bg-[var(--bg-1)] text-[var(--text-3)] hover:text-white hover:border-[var(--color-accent)] cursor-pointer transition-colors";

  const colorCls = "w-7 h-7 rounded border border-[var(--bg-7)] cursor-pointer bg-transparent";
  const inputCls = "bg-[var(--bg-1)] border border-[var(--bg-7)] rounded px-2 py-0.5 text-[11px] text-white outline-none focus:border-[var(--color-accent)] w-16 text-center";

  return (
    <div className="h-1/2 border-b border-[var(--bg-1)] flex flex-col bg-[var(--bg-3)]">
      {/* Header */}
      <div className="h-7 bg-[var(--bg-3)] border-b border-[var(--bg-1)] flex items-center px-2 shrink-0">
        <div className="flex items-center gap-1.5">
          <div className="w-1 h-3.5 rounded-full bg-[var(--color-accent)]" />
          <span className="text-[9px] font-bold uppercase tracking-widest text-[var(--text-6)]">
            {activeObj ? `${getObjType(activeObj).replace('i-', '').replace('fabric','').toUpperCase()}` : 'Properties'}
          </span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-0 text-sm">
        {!activeObj ? (
          <div>
            <div className="text-center my-5 flex flex-col items-center gap-2">
              <div className="w-12 h-12 rounded-xl bg-[var(--bg-1)] border border-[var(--bg-4)] flex items-center justify-center">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--bg-8)" strokeWidth="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 9h6v6H9z"/></svg>
              </div>
              <span className="text-[10px] text-[var(--bg-9)]">Select a layer to edit</span>
            </div>
            <SectionLabel label="Canvas" />
            <PropRow label="Background">
              <input type="color" value={canvasBg} onChange={e => updateCanvasBg(e.target.value)} className={colorCls} />
            </PropRow>
          </div>
        ) : (
          <>
            {/* Align & Distribute (only meaningful for a multi-object selection) */}
            {isMultiSelect && <>
              <SectionLabel label="Align & Distribute" />
              <div className="grid grid-cols-6 gap-1 pb-2">
                <button title="Align Left" onClick={alignLeft} className={alignBtnCls}><AlignHorizontalJustifyStart size={13} /></button>
                <button title="Align Center Horizontal" onClick={alignHCenter} className={alignBtnCls}><AlignHorizontalJustifyCenter size={13} /></button>
                <button title="Align Right" onClick={alignRight} className={alignBtnCls}><AlignHorizontalJustifyEnd size={13} /></button>
                <button title="Align Top" onClick={alignTop} className={alignBtnCls}><AlignVerticalJustifyStart size={13} /></button>
                <button title="Align Center Vertical" onClick={alignVCenter} className={alignBtnCls}><AlignVerticalJustifyCenter size={13} /></button>
                <button title="Align Bottom" onClick={alignBottom} className={alignBtnCls}><AlignVerticalJustifyEnd size={13} /></button>
                <button title="Distribute Horizontally (3+ objects)" onClick={distributeHorizontal} className={alignBtnCls}><AlignHorizontalDistributeCenter size={13} /></button>
                <button title="Distribute Vertically (3+ objects)" onClick={distributeVertical} className={alignBtnCls}><AlignVerticalDistributeCenter size={13} /></button>
              </div>
            </>}

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

            {/* Shadow / Glow — one shared "Effect" primitive, see applyEffect() note above */}
            <SectionLabel label="Effect" />
            <div className="flex gap-1 pb-2">
              {(['none', 'shadow', 'glow'] as const).map(m => (
                <button key={m} onClick={() => applyEffect(m)}
                  className={`flex-1 px-1.5 py-1 rounded border text-[10px] capitalize cursor-pointer transition-colors ${effectMode === m ? 'bg-[var(--color-accent)] border-[var(--color-accent)] text-white' : 'bg-[var(--bg-1)] border-[var(--bg-7)] text-[var(--text-3)] hover:text-white'}`}>
                  {m === 'none' ? 'None' : m === 'shadow' ? 'Drop Shadow' : 'Outer Glow'}
                </button>
              ))}
            </div>
            {effectMode !== 'none' && <>
              <PropRow label="Color">
                <input type="color" value={shadowColor} onChange={e => { setShadowColor(e.target.value); updateShadow('color', e.target.value); }} className={colorCls} />
              </PropRow>
              <PropRow label="Blur">
                <div className="flex items-center gap-1">
                  <input type="range" min="0" max="60" value={shadowBlur}
                    onChange={e => { const v = Number(e.target.value); setShadowBlur(v); updateShadow('blur', v); }}
                    className="w-20 accent-[var(--color-accent)]" />
                  <span className="text-[10px] text-[var(--text-6)] w-6">{shadowBlur}</span>
                </div>
              </PropRow>
              {effectMode === 'shadow' && <>
                <PropRow label="Offset X">
                  <input type="number" value={shadowOffsetX}
                    onChange={e => { const v = Number(e.target.value); setShadowOffsetX(v); updateShadow('offsetX', v); }}
                    className="w-12 bg-[var(--bg-1)] border border-[var(--bg-7)] rounded px-1.5 py-0.5 text-[10px] text-white outline-none text-center" />
                </PropRow>
                <PropRow label="Offset Y">
                  <input type="number" value={shadowOffsetY}
                    onChange={e => { const v = Number(e.target.value); setShadowOffsetY(v); updateShadow('offsetY', v); }}
                    className="w-12 bg-[var(--bg-1)] border border-[var(--bg-7)] rounded px-1.5 py-0.5 text-[10px] text-white outline-none text-center" />
                </PropRow>
              </>}
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
                      className="w-20 accent-[var(--color-accent)]" />
                    <span className="text-[9px] text-[var(--text-6)] w-8 text-right">{Math.round(f.val * 100)}</span>
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
                className="w-full py-2 mt-1 bg-[var(--bg-1)] border border-[var(--bg-7)] rounded text-[11px] text-white hover:border-[var(--color-accent)] transition-all cursor-pointer">
                ✂ Clip to Shape Below
              </button>
              <button
                onClick={() => {
                  if (!canvas) return;
                  const mask = activeObj.clipPath;
                  if (mask) { (mask as fabric.Object).set('visible', true); activeObj.set('clipPath', undefined); canvas.requestRenderAll(); }
                }}
                className="w-full py-1.5 mt-1 text-[11px] text-[var(--text-6)] hover:text-white cursor-pointer text-center transition-colors">
                Release Mask
              </button>
            </>}
          </>
        )}
      </div>
    </div>
  );
}
