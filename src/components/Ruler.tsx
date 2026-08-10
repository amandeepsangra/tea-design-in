import { useEffect, useRef } from 'react';

interface RulerProps {
  orientation: 'horizontal' | 'vertical';
  length: number;   // document length along this axis, in unscaled document px
  zoom: number;
  thickness?: number;
}

// Draws itself with a real 2D canvas rather than one DOM node per tick — cheap even for
// a 4000px-wide document, and trivial to keep crisp across zoom/DPR changes.
export function Ruler({ orientation, length, zoom, thickness = 18 }: RulerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isH = orientation === 'horizontal';
  const pxLength = Math.max(1, Math.round(length * zoom));

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const draw = () => {
      const dpr = window.devicePixelRatio || 1;
      const w = isH ? pxLength : thickness;
      const h = isH ? thickness : pxLength;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.scale(dpr, dpr);

      // Canvas 2D doesn't understand CSS custom properties (var(--x)) — resolve the
      // current theme's actual color values first, so the ruler still re-themes when
      // the toggle flips light/dark even though it's drawn with the Canvas API. Re-run
      // via the 'tea-theme-change' listener below (App.tsx dispatches it on toggle).
      const rootStyle = getComputedStyle(document.documentElement);
      const bgColor = rootStyle.getPropertyValue('--bg-3').trim() || '#1a1a1a';
      const tickColor = rootStyle.getPropertyValue('--text-7').trim() || '#3a3a3a';
      const labelColor = rootStyle.getPropertyValue('--text-3').trim() || '#888888';

      ctx.fillStyle = bgColor;
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = tickColor;
      ctx.fillStyle = labelColor;
      ctx.font = '9px monospace';
      ctx.lineWidth = 1;

      // Pick a "nice" (1/2/5 * 10^n) major-tick step so labels stay legibly spaced on
      // screen regardless of zoom level.
      const minPxGap = 60;
      const rawStep = minPxGap / zoom;
      const magnitude = Math.pow(10, Math.floor(Math.log10(Math.max(rawStep, 1e-6))));
      const step = [1, 2, 5, 10].map(m => m * magnitude).find(c => c >= rawStep) || magnitude * 10;
      const minorStep = step / 5;

      // Minor ticks
      ctx.beginPath();
      for (let v = 0; v <= length + 0.001; v += minorStep) {
        const pos = Math.round(v * zoom) + 0.5;
        const tickLen = thickness * 0.3;
        if (isH) { ctx.moveTo(pos, thickness - tickLen); ctx.lineTo(pos, thickness); }
        else { ctx.moveTo(thickness - tickLen, pos); ctx.lineTo(thickness, pos); }
      }
      ctx.stroke();

      // Major ticks + labels
      ctx.beginPath();
      for (let v = 0; v <= length + 0.001; v += step) {
        const pos = Math.round(v * zoom) + 0.5;
        const tickLen = thickness * 0.65;
        if (isH) { ctx.moveTo(pos, thickness - tickLen); ctx.lineTo(pos, thickness); }
        else { ctx.moveTo(thickness - tickLen, pos); ctx.lineTo(thickness, pos); }
        const label = Math.round(v).toString();
        if (isH) {
          ctx.fillText(label, pos + 2, 9);
        } else {
          ctx.save();
          ctx.translate(10, pos - 2);
          ctx.rotate(-Math.PI / 2);
          ctx.fillText(label, 0, 0);
          ctx.restore();
        }
      }
      ctx.stroke();
    };

    draw();
    window.addEventListener('tea-theme-change', draw);
    return () => window.removeEventListener('tea-theme-change', draw);
  }, [length, zoom, isH, thickness, pxLength]);

  return <canvas ref={canvasRef} className="block" />;
}
