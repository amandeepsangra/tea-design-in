import { useEffect, useState } from 'react';
import * as fabric from 'fabric';
import { FlipHorizontal2, FlipVertical2, AlignLeft, AlignCenter, AlignRight, AlignJustify } from 'lucide-react';

type ToolType = 'select' | 'hand' | 'crop' | 'text' | 'rect' | 'circle' | 'line' | 'triangle' | 'star' | 'polygon' | 'image' | 'eyedropper';

interface ToolSettingsBarProps {
  activeTool: ToolType | string;
  canvas: fabric.Canvas | null;
}

const btnCls = (active = false) =>
  `px-2 py-1 rounded border text-[11px] cursor-pointer transition-colors ${active
    ? 'bg-[var(--color-accent)] border-[var(--color-accent)] text-white'
    : 'bg-[var(--color-panel)] border-[var(--color-panel-border)] text-[#888] hover:text-white hover:border-[#555]'}`;

export function ToolSettingsBar({ activeTool, canvas }: ToolSettingsBarProps) {
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

  const barCls = "h-10 bg-[var(--color-surface)] border-b border-[var(--color-panel-border)] flex items-center px-3 shrink-0 text-sm z-10 gap-3 overflow-x-auto";
  const Div = () => <div className="w-px h-4 bg-[var(--color-panel-border)] shrink-0" />;
  const Label = ({ t }: { t: string }) => <span className="text-[#666] text-[10px] shrink-0">{t}</span>;
  const colorPicker = (val: string, onChange: (v: string) => void) => (
    <input type="color" value={val} onChange={e => onChange(e.target.value)}
      className="w-6 h-6 rounded border border-[#2a2a2a] cursor-pointer bg-transparent shrink-0" />
  );
  const numInput = (val: number, onChange: (v: number) => void, w = 'w-12', min?: number, max?: number) => (
    <input type="number" value={val} min={min} max={max}
      onChange={e => onChange(Number(e.target.value))}
      className={`${w} bg-[var(--color-panel)] border border-[var(--color-panel-border)] rounded px-1.5 py-0.5 text-[11px] text-gray-200 outline-none text-center focus:border-[#0096ff] shrink-0`} />
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
          <button onClick={flipH} className={btnCls()} title="Flip Horizontal"><FlipHorizontal2 size={13} /></button>
          <button onClick={flipV} className={btnCls()} title="Flip Vertical"><FlipVertical2 size={13} /></button>
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
        {colorPicker(fillColor, v => { setFillColor(v); set('fill', v); })}
        <Div />
        <button className={btnCls(fontBold)} onClick={() => { const v = !fontBold; setFontBold(v); set('fontWeight', v ? 'bold' : 'normal'); }}>B</button>
        <button className={`${btnCls(fontItalic)} italic`} onClick={() => { const v = !fontItalic; setFontItalic(v); set('fontStyle', v ? 'italic' : 'normal'); }}>I</button>
        <Div />
        {['left','center','right','justify'].map((a, i) => (
          <button key={a} className={btnCls(textAlign === a)} title={a}
            onClick={() => { setTextAlign(a); set('textAlign', a); }}>
            {[<AlignLeft size={13}/>, <AlignCenter size={13}/>, <AlignRight size={13}/>, <AlignJustify size={13}/>][i]}
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
        <Label t="Fill:" /> {colorPicker(fillColor, v => { setFillColor(v); set('fill', v); })}
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
        <Label t="Fill:" /> {colorPicker(fillColor, v => { setFillColor(v); set('fill', v); })}
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
    return (
      <div className={barCls}>
        <span className="text-[#666] text-[10px]">Aspect:</span>
        <button className={btnCls()}>Free</button>
        <button className={btnCls()}>1:1</button>
        <button className={btnCls()}>16:9</button>
        <button className={btnCls()}>4:3</button>
        <button className={btnCls()}>3:2</button>
        <div className="flex-1" />
        <button className="px-3 py-1 text-[11px] bg-red-500/10 text-red-400 hover:bg-red-500/20 rounded border border-red-500/20 cursor-pointer">Cancel</button>
        <button className="px-3 py-1 text-[11px] bg-[var(--color-accent)] text-white hover:bg-[#0088e6] rounded cursor-pointer">Apply</button>
      </div>
    );
  }

  // ─── HAND ───
  if (activeTool === 'hand') {
    return (
      <div className={barCls}>
        <span className="text-[#666] text-[10px] italic">Hand Tool — Click & drag to pan canvas</span>
      </div>
    );
  }

  // ─── EYEDROPPER ───
  if (activeTool === 'eyedropper') {
    return (
      <div className={barCls}>
        <span className="text-[#0096ff] text-[10px]">● Click anywhere on canvas to pick color</span>
      </div>
    );
  }

  // ─── MARQUEE ───
  if (activeTool === 'marquee') {
    return (
      <div className={barCls}>
        <span className="text-[#666] text-[10px] italic">Rectangular Marquee Tool — Click & drag to select multiple objects</span>
      </div>
    );
  }

  return (
    <div className={barCls}>
      <span className="text-[#555] italic text-[11px]">Select a tool to see settings</span>
    </div>
  );
}
