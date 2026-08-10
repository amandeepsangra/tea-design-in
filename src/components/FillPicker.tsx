import { useState } from 'react';
import * as fabric from 'fabric';

interface FillPickerProps {
  value: string;                                   // current solid color, used for the swatch + as a gradient stop seed
  onChange: (color: string) => void;                // solid color selected
  onGradientChange: (gradient: fabric.Gradient<any>) => void; // gradient selected/edited
  className?: string;
}

const buildGradient = (type: 'linear' | 'radial', colorA: string, colorB: string, angleDeg: number) => {
  const rad = (angleDeg * Math.PI) / 180;
  const coords = type === 'linear'
    ? { x1: 0.5 - 0.5 * Math.cos(rad), y1: 0.5 - 0.5 * Math.sin(rad), x2: 0.5 + 0.5 * Math.cos(rad), y2: 0.5 + 0.5 * Math.sin(rad) }
    : { x1: 0.5, y1: 0.5, x2: 0.5, y2: 0.5, r1: 0, r2: 0.5 };
  return new fabric.Gradient({
    type,
    gradientUnits: 'percentage',
    coords: coords as any,
    colorStops: [{ offset: 0, color: colorA }, { offset: 1, color: colorB }],
  });
};

// Compact fill picker: Solid / Linear Gradient / Radial Gradient. Written directly to a
// fabric object's `fill` (a fabric.Gradient instance for the two gradient modes).
export function FillPicker({ value, onChange, onGradientChange, className }: FillPickerProps) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<'solid' | 'linear' | 'radial'>('solid');
  const [colorA, setColorA] = useState(value || '#3b82f6');
  const [colorB, setColorB] = useState('#7b2ff7');
  const [angle, setAngle] = useState(90);

  const applyGradient = (type: 'linear' | 'radial', a: string, b: string, ang: number) => {
    onGradientChange(buildGradient(type, a, b, ang));
  };

  const selectMode = (m: 'solid' | 'linear' | 'radial') => {
    setMode(m);
    if (m === 'solid') onChange(colorA);
    else applyGradient(m, colorA, colorB, angle);
  };

  const swatchBg = mode === 'solid' ? value : `linear-gradient(90deg, ${colorA}, ${colorB})`;

  return (
    <div className={`relative shrink-0 ${className || ''}`}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        title="Fill"
        className="w-6 h-6 rounded border border-[var(--bg-7)] cursor-pointer"
        style={{ background: swatchBg }}
      />
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute top-full left-0 mt-1 z-50 bg-[var(--bg-3)] border border-[var(--bg-8)] rounded-md shadow-xl p-2 w-48 space-y-2">
            <div className="flex gap-1">
              {(['solid', 'linear', 'radial'] as const).map(m => (
                <button
                  key={m}
                  type="button"
                  onClick={() => selectMode(m)}
                  className={`flex-1 px-1.5 py-1 rounded text-[10px] capitalize cursor-pointer transition-colors ${mode === m ? 'bg-[var(--color-accent)] text-white' : 'bg-[var(--bg-1)] text-[var(--text-3)] hover:text-white'}`}
                >{m}</button>
              ))}
            </div>

            {mode === 'solid' ? (
              <input
                type="color" value={value}
                onChange={e => { setColorA(e.target.value); onChange(e.target.value); }}
                className="w-full h-8 rounded cursor-pointer bg-transparent"
              />
            ) : (
              <>
                <div className="flex gap-2 items-center">
                  <input type="color" value={colorA}
                    onChange={e => { setColorA(e.target.value); applyGradient(mode, e.target.value, colorB, angle); }}
                    className="w-9 h-8 rounded cursor-pointer bg-transparent" title="Start color" aria-label="Start color" />
                  <input type="color" value={colorB}
                    onChange={e => { setColorB(e.target.value); applyGradient(mode, colorA, e.target.value, angle); }}
                    className="w-9 h-8 rounded cursor-pointer bg-transparent" title="End color" aria-label="End color" />
                </div>
                {mode === 'linear' && (
                  <div className="flex items-center gap-1.5">
                    <span className="text-[9px] text-[var(--text-5)]">Angle</span>
                    <input type="range" min={0} max={360} value={angle}
                      onChange={e => { const v = Number(e.target.value); setAngle(v); applyGradient(mode, colorA, colorB, v); }}
                      className="flex-1 accent-[var(--color-accent)]" />
                    <span className="text-[9px] text-[var(--text-6)] w-7 text-right">{angle}°</span>
                  </div>
                )}
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
