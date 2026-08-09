import React, { useEffect, useState } from 'react';
import * as fabric from 'fabric';
import { Layers, Trash2, Eye, EyeOff, Type, Image as ImageIcon, Square, Circle, ChevronDown, Scissors } from 'lucide-react';

// Google Fonts list (popular ones for design work)
const GOOGLE_FONTS = [
  'Inter', 'Roboto', 'Open Sans', 'Lato', 'Montserrat', 'Poppins', 'Raleway', 'Oswald',
  'Playfair Display', 'Merriweather', 'Ubuntu', 'Nunito', 'Source Sans Pro',
  'PT Sans', 'Rubik', 'Work Sans', 'Quicksand', 'Josefin Sans', 'Bebas Neue',
  'Pacifico', 'Dancing Script', 'Lobster', 'Comfortaa', 'Righteous', 'Permanent Marker',
  'Anton', 'Alfa Slab One', 'Abril Fatface', 'Cinzel', 'Cormorant Garamond',
  'IM Fell English', 'Libre Baskerville', 'Arvo', 'Bitter', 'Rokkitt',
  'Arial', 'Times New Roman', 'Georgia', 'Courier New', 'Verdana', 'Impact',
];

// Load Google Font dynamically
const loadFont = (fontName: string) => {
  if (['Arial','Times New Roman','Georgia','Courier New','Verdana','Impact'].includes(fontName)) return;
  const id = `gfont-${fontName.replace(/\s+/g,'-')}`;
  if (!document.getElementById(id)) {
    const link = document.createElement('link');
    link.id = id;
    link.rel = 'stylesheet';
    link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(fontName)}:wght@400;700&display=swap`;
    document.head.appendChild(link);
  }
};

const BLEND_MODES = ['source-over','multiply','screen','overlay','darken','lighten','color-dodge','color-burn','hard-light','soft-light','difference','exclusion'];

interface LayersPanelProps {
  canvas: fabric.Canvas | null;
  onAddLayer: (type: 'text' | 'rect' | 'circle' | 'image') => void;
}

export function LayersPanel({ canvas, onAddLayer }: LayersPanelProps) {
  const [objects, setObjects] = useState<fabric.Object[]>([]);
  const [activeObj, setActiveObj] = useState<fabric.Object | null>(null);
  const [bgRemoving, setBgRemoving] = useState(false);

  // Layer-level opacity and blend mode (Photoshop-style)
  const [layerOpacity, setLayerOpacity] = useState(100);
  const [layerBlend, setLayerBlend] = useState('source-over');

  // Text properties (shown when text layer selected)
  const [fontFamily, setFontFamily] = useState('Inter');
  const [fontSize, setFontSize] = useState(40);
  const [fontColor, setFontColor] = useState('#000000');
  const [fontBold, setFontBold] = useState(false);
  const [fontItalic, setFontItalic] = useState(false);
  const [fontUnderline, setFontUnderline] = useState(false);
  const [textAlign, setTextAlign] = useState('left');
  const [lineHeight, setLineHeight] = useState(1.16);
  const [charSpacing, setCharSpacing] = useState(0);
  const [showFontList, setShowFontList] = useState(false);

  useEffect(() => {
    if (!canvas) { setObjects([]); setActiveObj(null); return; }

    const updateLayers = () => {
      setObjects([...canvas.getObjects()].reverse());
      const sel = canvas.getActiveObjects();
      const obj = sel.length === 1 ? sel[0] : null;
      setActiveObj(obj || null);

      if (obj) {
        setLayerOpacity(Math.round((obj.opacity ?? 1) * 100));
        setLayerBlend((obj as any).globalCompositeOperation || 'source-over');

        const type = ((obj as any).type || '').toLowerCase();
        if (type.includes('text')) {
          const t = obj as fabric.IText;
          setFontFamily(t.fontFamily || 'Inter');
          setFontSize(t.fontSize || 40);
          setFontColor(typeof t.fill === 'string' ? t.fill : '#000000');
          setFontBold(t.fontWeight === 'bold');
          setFontItalic(t.fontStyle === 'italic');
          setFontUnderline(!!(t as any).underline);
          setTextAlign(t.textAlign || 'left');
          setLineHeight(t.lineHeight || 1.16);
          setCharSpacing((t as any).charSpacing || 0);
        }
      }
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

  const set = (key: string, value: any) => {
    if (!canvas || !activeObj) return;
    activeObj.set(key as any, value);
    canvas.requestRenderAll();
  };

  const handleSelect = (obj: fabric.Object) => {
    canvas?.setActiveObject(obj);
    canvas?.requestRenderAll();
  };

  const handleDelete = (e: React.MouseEvent, obj: fabric.Object) => {
    e.stopPropagation();
    if (canvas) {
      if (canvas.getActiveObjects().includes(obj)) canvas.discardActiveObject();
      canvas.remove(obj);
      canvas.requestRenderAll();
    }
  };

  const toggleVisibility = (e: React.MouseEvent, obj: fabric.Object) => {
    e.stopPropagation();
    if (canvas) {
      obj.set('visible', !obj.visible);
      canvas.requestRenderAll();
      setObjects([...canvas.getObjects()].reverse());
    }
  };

  const moveUp = (e: React.MouseEvent, obj: fabric.Object) => {
    e.stopPropagation();
    if (!canvas) return;
    const objs = canvas.getObjects();
    const idx = objs.indexOf(obj);
    if (idx < objs.length - 1) {
      objs[idx] = objs[idx + 1]; objs[idx + 1] = obj;
      canvas.requestRenderAll();
      setObjects([...objs].reverse());
    }
  };

  const moveDown = (e: React.MouseEvent, obj: fabric.Object) => {
    e.stopPropagation();
    if (!canvas) return;
    const objs = canvas.getObjects();
    const idx = objs.indexOf(obj);
    if (idx > 0) {
      objs[idx] = objs[idx - 1]; objs[idx - 1] = obj;
      canvas.requestRenderAll();
      setObjects([...objs].reverse());
    }
  };

  const removeBackground = async () => {
    if (!canvas || !activeObj || (activeObj as any).type !== 'image') return;
    setBgRemoving(true);
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
        // Copy transform from old object
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
        setBgRemoving(false);
      };
      newImg.src = url;
    } catch (err) {
      console.error('BG removal failed', err);
      setBgRemoving(false);
      alert('Background removal failed. Please try again.');
    }
  };

  const getIcon = (obj: fabric.Object) => {
    const t = ((obj as any).type || '').toLowerCase();
    if (t.includes('text')) return <Type size={12} />;
    if (t === 'image') return <ImageIcon size={12} />;
    if (t === 'rect') return <Square size={12} />;
    if (t === 'circle') return <Circle size={12} />;
    return <Layers size={12} />;
  };

  const getName = (obj: fabric.Object) => {
    if ((obj as any).name) return (obj as any).name;
    const t = ((obj as any).type || '').toLowerCase();
    if (t.includes('text')) {
      const txt = (obj as any).text || 'Text';
      return txt.length > 18 ? txt.substring(0, 18) + '…' : txt;
    }
    return t || 'Object';
  };

  const isText = activeObj && ((activeObj as any).type || '').toLowerCase().includes('text');
  const isImage = activeObj && ((activeObj as any).type || '').toLowerCase() === 'image';

  const inputCls = "bg-[#111] border border-[#2a2a2a] rounded px-1.5 py-0.5 text-[11px] text-white outline-none focus:border-[#0096ff] text-center";
  const btnCls = (active: boolean) => `px-2 py-0.5 rounded border text-[11px] cursor-pointer transition-colors ${active ? 'bg-[#0096ff] border-[#0096ff] text-white' : 'bg-[#111] border-[#2a2a2a] text-[#888] hover:text-white'}`;

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-[#1e1e1e]">

      {/* ─── LAYERS Header ─── */}
      <div className="bg-[#1c1c1c] border-b border-[#111] px-2 py-1.5 shrink-0">
        <div className="flex items-center justify-between mb-1.5">
          <div className="flex items-center gap-1 text-[10px] font-bold text-[#666] uppercase tracking-widest">
            <Layers size={11} />
            <span>Layers</span>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={() => onAddLayer('text')} className="w-5 h-5 flex items-center justify-center rounded bg-[#111] border border-[#2a2a2a] text-[#666] hover:text-white hover:border-[#0096ff] cursor-pointer transition-colors" title="New Text"><Type size={10}/></button>
            <button onClick={() => onAddLayer('rect')} className="w-5 h-5 flex items-center justify-center rounded bg-[#111] border border-[#2a2a2a] text-[#666] hover:text-white hover:border-[#0096ff] cursor-pointer transition-colors" title="New Shape"><Square size={10}/></button>
            <button onClick={() => onAddLayer('image')} className="w-5 h-5 flex items-center justify-center rounded bg-[#111] border border-[#2a2a2a] text-[#666] hover:text-white hover:border-[#0096ff] cursor-pointer transition-colors" title="Import Image"><ImageIcon size={10}/></button>
          </div>
        </div>

        {/* Photoshop-style Opacity + Blend at TOP of layers */}
        {activeObj && (
          <div className="space-y-1">
            <div className="flex gap-1.5 items-center">
              <select
                value={layerBlend}
                onChange={e => { setLayerBlend(e.target.value); set('globalCompositeOperation', e.target.value); }}
                className="flex-1 bg-[#111] border border-[#2a2a2a] rounded px-1.5 py-0.5 text-[10px] text-white outline-none cursor-pointer focus:border-[#0096ff] capitalize"
              >
                {BLEND_MODES.map(m => <option key={m} value={m}>{m.replace(/-/g,' ').replace(/\b\w/g, c => c.toUpperCase())}</option>)}
              </select>
              <div className="flex items-center gap-1">
                <span className="text-[9px] text-[#555]">%</span>
                <input type="number" min="0" max="100" value={layerOpacity}
                  onChange={e => { const v = Math.max(0, Math.min(100, Number(e.target.value))); setLayerOpacity(v); set('opacity', v / 100); }}
                  className="w-10 bg-[#111] border border-[#2a2a2a] rounded px-1 py-0.5 text-[10px] text-white outline-none text-center focus:border-[#0096ff]" />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ─── TEXT PROPERTIES (when text selected) ─── */}
      {isText && activeObj && (
        <div className="bg-[#191919] border-b border-[#111] px-2 py-2 shrink-0 space-y-2">
          <div className="text-[9px] font-bold text-[#555] uppercase tracking-widest mb-1">Typography</div>

          {/* Font Family Picker */}
          <div className="relative">
            <button
              onClick={() => setShowFontList(!showFontList)}
              className="w-full flex items-center justify-between bg-[#111] border border-[#2a2a2a] rounded px-2 py-1 text-[11px] text-white cursor-pointer hover:border-[#0096ff] transition-colors"
              style={{ fontFamily }}
            >
              <span>{fontFamily}</span>
              <ChevronDown size={10} className="text-[#666]" />
            </button>
            {showFontList && (
              <div className="absolute top-full left-0 right-0 z-50 bg-[#1a1a1a] border border-[#333] rounded-b shadow-xl max-h-48 overflow-y-auto">
                {GOOGLE_FONTS.map(f => (
                  <button key={f} onClick={() => {
                    loadFont(f);
                    setFontFamily(f);
                    set('fontFamily', f);
                    setShowFontList(false);
                  }}
                    className="w-full text-left px-3 py-1.5 text-[11px] hover:bg-[#0096ff]/20 hover:text-white text-[#aaa] cursor-pointer transition-colors"
                    style={{ fontFamily: f }}
                  >{f}</button>
                ))}
              </div>
            )}
          </div>

          {/* Font Size + Color */}
          <div className="flex items-center gap-1.5">
            <input type="number" min="6" max="500" value={fontSize}
              onChange={e => { const v = Number(e.target.value); setFontSize(v); set('fontSize', v); }}
              className={`w-14 ${inputCls}`} title="Font Size" />
            <span className="text-[10px] text-[#555]">px</span>
            <div className="flex-1" />
            <label className="text-[9px] text-[#555]">Color</label>
            <input type="color" value={fontColor}
              onChange={e => { setFontColor(e.target.value); set('fill', e.target.value); }}
              className="w-6 h-6 rounded border border-[#2a2a2a] cursor-pointer bg-transparent" />
          </div>

          {/* Bold / Italic / Underline / Alignment */}
          <div className="flex items-center gap-1 flex-wrap">
            <button className={btnCls(fontBold)} onClick={() => { const v = !fontBold; setFontBold(v); set('fontWeight', v ? 'bold' : 'normal'); }}>B</button>
            <button className={`${btnCls(fontItalic)} italic`} onClick={() => { const v = !fontItalic; setFontItalic(v); set('fontStyle', v ? 'italic' : 'normal'); }}>I</button>
            <button className={`${btnCls(fontUnderline)} underline`} onClick={() => { const v = !fontUnderline; setFontUnderline(v); set('underline', v); }}>U</button>
            <div className="w-px h-4 bg-[#2a2a2a] mx-0.5" />
            {['left','center','right','justify'].map(a => (
              <button key={a} className={btnCls(textAlign === a)} title={a}
                onClick={() => { setTextAlign(a); set('textAlign', a); }}>
                {a === 'left' ? '≡' : a === 'center' ? '≣' : a === 'right' ? '⇒' : '⟺'}
              </button>
            ))}
          </div>

          {/* Line Height + Char Spacing */}
          <div className="flex gap-1.5 items-center">
            <span className="text-[9px] text-[#555]">LH</span>
            <input type="number" step="0.1" min="0.5" max="5" value={lineHeight}
              onChange={e => { const v = Number(e.target.value); setLineHeight(v); set('lineHeight', v); }}
              className={`w-12 ${inputCls}`} />
            <span className="text-[9px] text-[#555] ml-1">Spacing</span>
            <input type="number" step="10" value={charSpacing}
              onChange={e => { const v = Number(e.target.value); setCharSpacing(v); set('charSpacing', v); }}
              className={`w-14 ${inputCls}`} />
          </div>
        </div>
      )}

      {/* ─── IMAGE TOOLS (when image selected) ─── */}
      {isImage && activeObj && (
        <div className="bg-[#191919] border-b border-[#111] px-2 py-2 shrink-0">
          <div className="text-[9px] font-bold text-[#555] uppercase tracking-widest mb-1.5">Image</div>
          <button
            onClick={removeBackground}
            disabled={bgRemoving}
            className={`w-full py-2 rounded border text-[11px] flex items-center justify-center gap-2 cursor-pointer transition-all ${bgRemoving ? 'opacity-50 cursor-wait bg-[#111] border-[#333] text-[#888]' : 'bg-gradient-to-r from-[#0096ff]/20 to-[#7b2ff7]/20 border-[#0096ff]/50 text-white hover:from-[#0096ff]/30 hover:to-[#7b2ff7]/30'}`}
          >
            <Scissors size={12} />
            {bgRemoving ? 'Removing Background...' : 'Remove Background (AI)'}
          </button>
          <p className="text-[9px] text-[#444] mt-1 text-center">Runs locally · No internet needed</p>
        </div>
      )}

      {/* ─── LAYER LIST ─── */}
      <div className="flex-1 overflow-y-auto p-1.5 space-y-0.5">
        {objects.length > 0 ? objects.map((obj, i) => {
          const isSel = activeObj === obj;
          return (
            <div
              key={i}
              onClick={() => handleSelect(obj)}
              className={`flex items-center gap-1.5 px-1.5 py-1 rounded cursor-pointer transition-all ${isSel ? 'bg-[#0096ff]/15 border border-[#0096ff]/40' : 'hover:bg-[#252525] border border-transparent'}`}
            >
              <button onClick={e => toggleVisibility(e, obj)} className={`shrink-0 ${obj.visible !== false ? 'text-[#555] hover:text-white' : 'text-[#333]'} cursor-pointer`}>
                {obj.visible !== false ? <Eye size={12} /> : <EyeOff size={12} />}
              </button>

              <div className={`w-5 h-5 rounded flex items-center justify-center shrink-0 ${isSel ? 'bg-[#0096ff]/30 text-[#0096ff]' : 'bg-[#111] text-[#555]'}`}>
                {getIcon(obj)}
              </div>

              <span className={`truncate flex-1 text-[11px] ${isSel ? 'text-white' : 'text-[#888]'}`}>{getName(obj)}</span>

              {isSel && (
                <div className="flex items-center gap-0.5 shrink-0">
                  <button onClick={e => moveUp(e, obj)} className="text-[#555] hover:text-white p-0.5 cursor-pointer text-[10px]">↑</button>
                  <button onClick={e => moveDown(e, obj)} className="text-[#555] hover:text-white p-0.5 cursor-pointer text-[10px]">↓</button>
                  <button onClick={e => handleDelete(e, obj)} className="text-[#c42b1c] hover:text-red-400 p-0.5 ml-0.5 cursor-pointer">
                    <Trash2 size={10} />
                  </button>
                </div>
              )}
            </div>
          );
        }) : (
          <div className="text-[11px] text-[#333] text-center mt-8">No layers yet</div>
        )}
      </div>
    </div>
  );
}
