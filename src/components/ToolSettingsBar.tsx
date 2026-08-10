import { useEffect, useRef, useState } from 'react';
import * as fabric from 'fabric';
import { FlipHorizontal2, FlipVertical2, AlignLeft, AlignCenter, AlignRight, AlignJustify } from 'lucide-react';
import { FillPicker } from './FillPicker';

type ToolType = 'select' | 'hand' | 'crop' | 'text' | 'rect' | 'circle' | 'line' | 'triangle' | 'star' | 'polygon' | 'image' | 'eyedropper';

interface ToolSettingsBarProps {
  activeTool: ToolType | string;
  canvas: fabric.Canvas | null;
  // Called to switch the active tool back to 'select' once a crop is applied/cancelled.
  onToolChange?: (tool: string) => void;
  marqueeShape?: 'rect' | 'ellipse';
}

const CROP_ASPECTS: Record<string, number | null> = { Free: null, '1:1': 1, '16:9': 16 / 9, '4:3': 4 / 3, '3:2': 3 / 2 };

interface CropSession {
  img: fabric.Image;
  rect: fabric.Rect;
  original: { cropX: number; cropY: number; width: number; height: number; left: number; top: number; scaleX: number; scaleY: number };
}

const btnCls = (active = false) =>
  `px-2 py-1 rounded border text-[11px] cursor-pointer transition-colors ${active
    ? 'bg-[var(--color-accent)] border-[var(--color-accent)] text-white'
    : 'bg-[var(--color-panel)] border-[var(--color-panel-border)] text-[var(--text-3)] hover:text-white hover:border-[var(--text-6)]'}`;

export function ToolSettingsBar({ activeTool, canvas, onToolChange, marqueeShape = 'rect' }: ToolSettingsBarProps) {
  const [fillColor, setFillColor] = useState('#3b82f6');
  const [strokeColor, setStrokeColor] = useState('#000000');
  const [strokeWidth, setStrokeWidth] = useState(0);
  const [cornerRadius, setCornerRadius] = useState(0);

  // Text
  const [fontSize, setFontSize] = useState(40);
  const [fontBold, setFontBold] = useState(false);
  const [fontItalic, setFontItalic] = useState(false);
  const [textAlign, setTextAlign] = useState('left');

  // Line
  const [lineCap, setLineCap] = useState<'butt' | 'round' | 'square'>('round');
  const [lineWidth, setLineWidth] = useState(3);
  const [lineColor, setLineColor] = useState('#000000');

  // Select tool - show transform props
  const [objX, setObjX] = useState(0);
  const [objY, setObjY] = useState(0);
  const [objW, setObjW] = useState(0);
  const [objH, setObjH] = useState(0);
  const [objAngle, setObjAngle] = useState(0);


  useEffect(() => {
    if (!canvas) return;
    const update = () => {
      const obj = canvas.getActiveObject();
      if (!obj) return;
      if (obj.fill && typeof obj.fill === 'string') setFillColor(obj.fill);
      if (obj.stroke && typeof obj.stroke === 'string') setStrokeColor(obj.stroke);
      setStrokeWidth(obj.strokeWidth || 0);
      setObjX(Math.round((obj as any).left || 0));
      setObjY(Math.round((obj as any).top || 0));
      setObjW(Math.round(obj.getScaledWidth()));
      setObjH(Math.round(obj.getScaledHeight()));
      setObjAngle(Math.round(obj.angle || 0));
      if ((obj as any).rx !== undefined) setCornerRadius((obj as any).rx || 0);
      const type = ((obj as any).type || '').toLowerCase();
      if (type.includes('text')) {
        const t = obj as fabric.IText;
        setFontSize(t.fontSize || 40);
        setFontBold(t.fontWeight === 'bold');
        setFontItalic(t.fontStyle === 'italic');
        setTextAlign(t.textAlign || 'left');
      }
      if (type === 'line') {
        setLineColor(typeof obj.stroke === 'string' ? obj.stroke : '#000000');
        setLineWidth(obj.strokeWidth || 3);
        setLineCap(((obj as any).strokeLineCap || 'round') as any);
      }
    };
    update();
    canvas.on('selection:created', update);
    canvas.on('selection:updated', update);
    canvas.on('selection:cleared', update);
    canvas.on('object:modified', update);
    return () => {
      canvas.off('selection:created', update);
      canvas.off('selection:updated', update);
      canvas.off('selection:cleared', update);
      canvas.off('object:modified', update);
    };
  }, [canvas, activeTool]);

  // ─── CROP tool (per-image, non-destructive) ───
  // A crop session temporarily expands the selected image back to its full natural
  // pixels (so previously-cropped-away content can be re-selected, Photoshop-style),
  // and overlays a draggable/resizable fabric.Rect the user positions as the new
  // crop window. Apply writes the window back as the image's native cropX/cropY/
  // width/height (the original pixel data is never touched); Cancel restores exactly
  // what was there before. Only axis-aligned (angle 0) images are supported — the
  // screen<->natural-pixel math below assumes no rotation.
  const [cropAspect, setCropAspect] = useState<keyof typeof CROP_ASPECTS>('Free');
  const [cropHasSession, setCropHasSession] = useState(false);
  const [cropUnsupported, setCropUnsupported] = useState(false);
  const cropSessionRef = useRef<CropSession | null>(null);
  const cropAspectRef = useRef<number | null>(null);
  const suppressAutoStartRef = useRef(false);
  useEffect(() => { cropAspectRef.current = CROP_ASPECTS[cropAspect]; }, [cropAspect]);

  const clampCropRect = (rect: fabric.Rect, bounds: { left: number; top: number; width: number; height: number }) => {
    // Corner-handle drags scale the rect rather than resizing it — normalize that back
    // into plain width/height so all the downstream math stays in simple pixel units.
    if (rect.scaleX !== 1 || rect.scaleY !== 1) {
      rect.set({ width: (rect.width || 0) * (rect.scaleX || 1), height: (rect.height || 0) * (rect.scaleY || 1), scaleX: 1, scaleY: 1 });
    }
    let left = rect.left || 0, top = rect.top || 0;
    let width = rect.width || 0, height = rect.height || 0;
    const ratio = cropAspectRef.current;
    if (ratio) height = width / ratio;
    width = Math.max(10, Math.min(width, bounds.width));
    height = Math.max(10, Math.min(height, bounds.height));
    if (ratio) {
      if (width / height > ratio) width = height * ratio; else height = width / ratio;
    }
    left = Math.max(bounds.left, Math.min(left, bounds.left + bounds.width - width));
    top = Math.max(bounds.top, Math.min(top, bounds.top + bounds.height - height));
    rect.set({ left, top, width, height });
    rect.setCoords();
  };

  const startCropSession = (img: fabric.Image, cv: fabric.Canvas) => {
    if (cropSessionRef.current) return;
    if (Math.round(img.angle || 0) % 360 !== 0) {
      setCropUnsupported(true);
      return;
    }
    setCropUnsupported(false);

    const scaleX = img.scaleX || 1;
    const scaleY = img.scaleY || 1;
    const original = {
      cropX: img.cropX || 0, cropY: img.cropY || 0,
      width: img.width || 0, height: img.height || 0,
      left: img.left || 0, top: img.top || 0,
      scaleX, scaleY,
    };

    const imgEl = img.getElement() as HTMLImageElement | undefined;
    const naturalWidth = imgEl?.naturalWidth || original.width;
    const naturalHeight = imgEl?.naturalHeight || original.height;

    const visibleLeft = original.left;
    const visibleTop = original.top;
    const visibleWidth = original.width * scaleX;
    const visibleHeight = original.height * scaleY;

    // Reveal the full natural image, keeping the previously-visible window in place.
    img.set({
      cropX: 0, cropY: 0,
      width: naturalWidth, height: naturalHeight,
      left: visibleLeft - original.cropX * scaleX,
      top: visibleTop - original.cropY * scaleY,
      selectable: false, evented: false,
    });
    img.setCoords();

    const rect = new fabric.Rect({
      left: visibleLeft, top: visibleTop, width: visibleWidth, height: visibleHeight,
      fill: 'rgba(0,150,255,0.08)', stroke: '#0096ff', strokeWidth: 1, strokeDashArray: [6, 4],
      cornerColor: '#0096ff', cornerStyle: 'circle', transparentCorners: false,
      hasRotatingPoint: false, lockRotation: true,
    } as any);
    cv.add(rect);
    suppressAutoStartRef.current = true;
    cv.setActiveObject(rect);
    suppressAutoStartRef.current = false;
    cv.requestRenderAll();

    const bounds = { left: img.left || 0, top: img.top || 0, width: naturalWidth * scaleX, height: naturalHeight * scaleY };
    const onRectChange = () => { clampCropRect(rect, bounds); cv.requestRenderAll(); };
    rect.on('moving', onRectChange);
    rect.on('scaling', onRectChange);

    cropSessionRef.current = { img, rect, original };
    setCropHasSession(true);
  };

  const endCropSession = (cv: fabric.Canvas | null, apply: boolean) => {
    const session = cropSessionRef.current;
    if (!session || !cv) { cropSessionRef.current = null; setCropHasSession(false); return; }
    const { img, rect, original } = session;

    cv.remove(rect);

    if (apply) {
      const { scaleX, scaleY } = original;
      const cropX = Math.max(0, ((rect.left || 0) - (img.left || 0)) / scaleX);
      const cropY = Math.max(0, ((rect.top || 0) - (img.top || 0)) / scaleY);
      const width = Math.max(1, (rect.width || 0) / scaleX);
      const height = Math.max(1, (rect.height || 0) / scaleY);
      img.set({
        cropX, cropY, width, height,
        left: rect.left, top: rect.top,
        scaleX, scaleY,
        selectable: true, evented: true,
      });
    } else {
      img.set({ ...original, selectable: true, evented: true });
    }
    img.setCoords();

    suppressAutoStartRef.current = true;
    cv.setActiveObject(img);
    suppressAutoStartRef.current = false;
    cv.requestRenderAll();

    cropSessionRef.current = null;
    setCropHasSession(false);
  };

  // Auto-start a crop session for whichever image is selected while the crop tool is
  // active; tearing it down (as a cancel) whenever the user leaves crop mode any other
  // way than the explicit Apply/Cancel buttons below.
  useEffect(() => {
    if (activeTool !== 'crop' || !canvas) return;
    const trySelectImage = () => {
      if (cropSessionRef.current || suppressAutoStartRef.current) return;
      const obj = canvas.getActiveObject();
      if (obj && ((obj as any).type === 'image')) startCropSession(obj as fabric.Image, canvas);
      else setCropUnsupported(false);
    };
    trySelectImage();
    canvas.on('selection:created', trySelectImage);
    canvas.on('selection:updated', trySelectImage);
    return () => {
      canvas.off('selection:created', trySelectImage);
      canvas.off('selection:updated', trySelectImage);
      if (cropSessionRef.current) endCropSession(canvas, false);
      setCropUnsupported(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTool, canvas]);

  const applyCropAspect = (key: keyof typeof CROP_ASPECTS) => {
    setCropAspect(key);
    const session = cropSessionRef.current;
    if (!session || !canvas) return;
    const ratio = CROP_ASPECTS[key];
    const { rect, img, original } = session;
    const bounds = { left: img.left || 0, top: img.top || 0, width: (img.width || 0) * original.scaleX, height: (img.height || 0) * original.scaleY };
    if (ratio) {
      const cx = (rect.left || 0) + (rect.width || 0) / 2;
      const cy = (rect.top || 0) + (rect.height || 0) / 2;
      let newW = rect.width || 0;
      let newH = newW / ratio;
      if (newH > bounds.height) { newH = bounds.height; newW = newH * ratio; }
      if (newW > bounds.width) { newW = bounds.width; newH = newW / ratio; }
      rect.set({ width: newW, height: newH, left: cx - newW / 2, top: cy - newH / 2, scaleX: 1, scaleY: 1 });
      clampCropRect(rect, bounds);
    }
    canvas.requestRenderAll();
  };

  const handleCropApply = () => { endCropSession(canvas, true); onToolChange?.('select'); };
  const handleCropCancel = () => { endCropSession(canvas, false); onToolChange?.('select'); };

  const set = (key: string, val: any) => {
    if (!canvas) return;
    const obj = canvas.getActiveObject();
    if (!obj) return;
    obj.set(key as any, val);
    canvas.requestRenderAll();
  };

  const setPos = (key: 'left' | 'top', val: number) => {
    if (!canvas) return;
    const obj = canvas.getActiveObject();
    if (!obj) return;
    obj.set(key, val);
    obj.setCoords();
    canvas.requestRenderAll();
  };

  const flipH = () => { if (!canvas) return; const obj = canvas.getActiveObject(); if (!obj) return; obj.set('flipX', !obj.flipX); canvas.requestRenderAll(); };
  const flipV = () => { if (!canvas) return; const obj = canvas.getActiveObject(); if (!obj) return; obj.set('flipY', !obj.flipY); canvas.requestRenderAll(); };

  const barCls = "h-10 bg-[var(--color-surface)] border-b border-[var(--color-panel-border)] flex items-center px-3 shrink-0 text-sm z-10 gap-3 overflow-x-auto scrollbar-hide";
  const Div = () => <div className="w-px h-4 bg-[var(--color-panel-border)] shrink-0" />;
  const Label = ({ t }: { t: string }) => <span className="text-[var(--text-5)] text-[10px] shrink-0">{t}</span>;
  const colorPicker = (val: string, onChange: (v: string) => void) => (
    <input type="color" value={val} onChange={e => onChange(e.target.value)}
      className="w-6 h-6 rounded border border-[var(--bg-7)] cursor-pointer bg-transparent shrink-0" />
  );
  const numInput = (val: number, onChange: (v: number) => void, w = 'w-12', min?: number, max?: number) => (
    <input type="number" value={val} min={min} max={max}
      onChange={e => onChange(Number(e.target.value))}
      className={`${w} bg-[var(--color-panel)] border border-[var(--color-panel-border)] rounded px-1.5 py-0.5 text-[11px] text-gray-200 outline-none text-center focus:border-[var(--color-accent)] shrink-0`} />
  );

  // ─── SELECT tool ───
  if (activeTool === 'select') {
    const hasObj = canvas?.getActiveObject();
    return (
      <div className={barCls}>
        <Label t="X:" /> {numInput(objX, v => { setObjX(v); setPos('left', v); })}
        <Label t="Y:" /> {numInput(objY, v => { setObjY(v); setPos('top', v); })}
        <Div />
        <Label t="W:" /> {numInput(objW, v => { if (!canvas) return; const obj = canvas.getActiveObject(); if (obj) { obj.scaleToWidth(v); canvas.requestRenderAll(); setObjW(v); } })}
        <Label t="H:" /> {numInput(objH, v => { if (!canvas) return; const obj = canvas.getActiveObject(); if (obj) { obj.scaleToHeight(v); canvas.requestRenderAll(); setObjH(v); } })}
        <Div />
        <Label t="°" /> {numInput(objAngle, v => { setObjAngle(v); set('angle', v); }, 'w-12')}
        <Div />
        {hasObj && <>
          <button onClick={flipH} className={btnCls()} title="Flip Horizontal" aria-label="Flip Horizontal"><FlipHorizontal2 size={13} /></button>
          <button onClick={flipV} className={btnCls()} title="Flip Vertical" aria-label="Flip Vertical"><FlipVertical2 size={13} /></button>
        </>}
      </div>
    );
  }

  // ─── TEXT tool ───
  if (activeTool === 'text') {
    return (
      <div className={barCls}>
        <Label t="Size:" />
        {numInput(fontSize, v => { setFontSize(v); set('fontSize', v); }, 'w-14', 6, 500)}
        <Div />
        <FillPicker value={fillColor} onChange={v => { setFillColor(v); set('fill', v); }} onGradientChange={g => set('fill', g)} />
        <Div />
        <button className={btnCls(fontBold)} onClick={() => { const v = !fontBold; setFontBold(v); set('fontWeight', v ? 'bold' : 'normal'); }}>B</button>
        <button className={`${btnCls(fontItalic)} italic`} onClick={() => { const v = !fontItalic; setFontItalic(v); set('fontStyle', v ? 'italic' : 'normal'); }}>I</button>
        <Div />
        {([
          ['left', <AlignLeft key="icon" size={13} />],
          ['center', <AlignCenter key="icon" size={13} />],
          ['right', <AlignRight key="icon" size={13} />],
          ['justify', <AlignJustify key="icon" size={13} />],
        ] as const).map(([a, icon]) => (
          <button key={a} className={btnCls(textAlign === a)} title={a}
            onClick={() => { setTextAlign(a); set('textAlign', a); }}>
            {icon}
          </button>
        ))}
        <Div />
        <Label t="Stroke:" />
        {colorPicker(strokeColor, v => { setStrokeColor(v); set('stroke', v); })}
        {numInput(strokeWidth, v => { setStrokeWidth(v); set('strokeWidth', v); }, 'w-10', 0)}
      </div>
    );
  }

  // ─── RECT tool ───
  if (activeTool === 'rect') {
    return (
      <div className={barCls}>
        <Label t="Fill:" /> <FillPicker value={fillColor} onChange={v => { setFillColor(v); set('fill', v); }} onGradientChange={g => set('fill', g)} />
        <Div />
        <Label t="Stroke:" /> {colorPicker(strokeColor, v => { setStrokeColor(v); set('stroke', v); })}
        {numInput(strokeWidth, v => { setStrokeWidth(v); set('strokeWidth', v); }, 'w-10', 0)}
        <Div />
        <Label t="Radius:" />
        {numInput(cornerRadius, v => { setCornerRadius(v); set('rx', v); set('ry', v); }, 'w-12', 0, 200)}
      </div>
    );
  }

  // ─── CIRCLE / TRIANGLE / STAR / POLYGON ───
  if (['circle','triangle','star','polygon'].includes(activeTool)) {
    return (
      <div className={barCls}>
        <Label t="Fill:" /> <FillPicker value={fillColor} onChange={v => { setFillColor(v); set('fill', v); }} onGradientChange={g => set('fill', g)} />
        <Div />
        <Label t="Stroke:" /> {colorPicker(strokeColor, v => { setStrokeColor(v); set('stroke', v); })}
        {numInput(strokeWidth, v => { setStrokeWidth(v); set('strokeWidth', v); }, 'w-10', 0)}
      </div>
    );
  }

  // ─── LINE tool ───
  if (activeTool === 'line') {
    return (
      <div className={barCls}>
        <Label t="Color:" /> {colorPicker(lineColor, v => { setLineColor(v); set('stroke', v); })}
        <Div />
        <Label t="Width:" />
        {numInput(lineWidth, v => { setLineWidth(v); set('strokeWidth', v); }, 'w-12', 1, 100)}
        <Div />
        <Label t="Cap:" />
        {(['butt','round','square'] as const).map(cap => (
          <button key={cap} className={btnCls(lineCap === cap)}
            onClick={() => { setLineCap(cap); set('strokeLineCap', cap); }}>
            {cap}
          </button>
        ))}
        <Div />
        <Label t="Dash:" />
        <button className={btnCls(false)} onClick={() => set('strokeDashArray', [10,5])}>- -</button>
        <button className={btnCls(false)} onClick={() => set('strokeDashArray', [2,6])}>· ·</button>
        <button className={btnCls(false)} onClick={() => set('strokeDashArray', null)}>─</button>
      </div>
    );
  }

  // ─── CROP ───
  if (activeTool === 'crop') {
    if (!cropHasSession) {
      return (
        <div className={barCls}>
          <span className="text-[var(--text-5)] text-[10px] italic">
            {cropUnsupported ? 'Crop isn’t supported on rotated images yet — reset rotation first.' : 'Select an image to crop'}
          </span>
        </div>
      );
    }
    return (
      <div className={barCls}>
        <span className="text-[var(--text-5)] text-[10px]">Aspect:</span>
        {(Object.keys(CROP_ASPECTS) as (keyof typeof CROP_ASPECTS)[]).map(key => (
          <button key={key} className={btnCls(cropAspect === key)} onClick={() => applyCropAspect(key)}>{key}</button>
        ))}
        <div className="flex-1" />
        <button onClick={handleCropCancel} className="px-3 py-1 text-[11px] bg-red-500/10 text-red-400 hover:bg-red-500/20 rounded border border-red-500/20 cursor-pointer">Cancel</button>
        <button onClick={handleCropApply} className="px-3 py-1 text-[11px] bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent-hover)] rounded cursor-pointer">Apply</button>
      </div>
    );
  }

  // ─── HAND ───
  if (activeTool === 'hand') {
    return (
      <div className={barCls}>
        <span className="text-[var(--text-5)] text-[10px] italic">Hand Tool — Click & drag to pan canvas</span>
      </div>
    );
  }

  // ─── EYEDROPPER ───
  if (activeTool === 'eyedropper') {
    return (
      <div className={barCls}>
        <span className="text-[var(--color-accent)] text-[10px]">● Click anywhere on canvas to pick color</span>
      </div>
    );
  }

  // ─── MARQUEE ───
  if (activeTool === 'marquee') {
    return (
      <div className={barCls}>
        <span className="text-[var(--text-5)] text-[10px] italic">
          {marqueeShape === 'ellipse'
            ? 'Ellipse Marquee Tool — Click & drag to select objects inside the ellipse'
            : 'Rectangular Marquee Tool — Click & drag to select multiple objects'}
        </span>
      </div>
    );
  }

  // ─── BRUSH ───
  if (activeTool === 'brush') {
    return (
      <div className={barCls}>
        <Label t="Brush Size:" />
        {numInput(canvas?.freeDrawingBrush?.width || 5, v => {
           if (canvas && canvas.freeDrawingBrush) {
             canvas.freeDrawingBrush.width = v;
             canvas.requestRenderAll();
           }
        }, 'w-12', 1, 100)}
        <Div />
        <span className="text-[var(--text-5)] text-[10px] italic">Color is controlled from the bottom left toolbar</span>
      </div>
    );
  }

  // ─── ERASER ───
  if (activeTool === 'eraser') {
    return (
      <div className={barCls}>
        <Label t="Eraser Size:" />
        {numInput(canvas?.freeDrawingBrush?.width || 20, v => {
           if (canvas && canvas.freeDrawingBrush) {
             canvas.freeDrawingBrush.width = v;
             canvas.requestRenderAll();
           }
        }, 'w-12', 1, 200)}
      </div>
    );
  }

  return (
    <div className={barCls}>
      <span className="text-[var(--text-6)] italic text-[11px]">Select a tool to see settings</span>
    </div>
  );
}
