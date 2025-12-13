
import { RawTextureData } from '../types';

// Helper to generate a stable hash ID for caching
const generateId = (prefix: string, width: number, config: any): string => {
  return `${prefix}_${width}_${JSON.stringify(config)}`;
};

export const generateGradientTexture = (
  stops: Array<{ pos: number; color: string }>, 
  width: number = 512,
  alphaStops?: Array<{ pos: number; value: number }>
): RawTextureData => {
  const height = 1;
  const data = new Uint8ClampedArray(width * height * 4);
  
  // Create a temporary canvas to use the browser's native gradient interpolation
  let ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null = null;

  if (typeof OffscreenCanvas !== 'undefined') {
      const canvas = new OffscreenCanvas(width, height);
      ctx = canvas.getContext('2d') as OffscreenCanvasRenderingContext2D;
  } else if (typeof document !== 'undefined') {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      ctx = canvas.getContext('2d', { willReadFrequently: true });
  }
  
  if (!ctx) {
    return { isRaw: true, data, width, height, id: 'error' };
  }

  // 1. Draw Color Gradient (RGB)
  const gradC = ctx.createLinearGradient(0, 0, width, 0);
  const safeStops = stops.length > 0 ? stops : [{pos:0, color:'#000'}, {pos:1, color:'#fff'}];
  
  safeStops.forEach(s => {
      // Ensure color is full opacity for this pass if we have separate alpha controls
      // But if no alphaStops are provided, we rely on the hex string's alpha
      let color = s.color;
      if (alphaStops && alphaStops.length > 0) {
          // If separate alpha exists, force full opacity for the color pass
          if (color.startsWith('#') && color.length > 7) {
              color = color.substring(0, 7); // Strip alpha from hex
          }
      }
      gradC.addColorStop(Math.max(0, Math.min(1, s.pos)), color);
  });
  
  ctx.fillStyle = gradC;
  ctx.fillRect(0, 0, width, height);

  const imgData = ctx.getImageData(0, 0, width, height);
  const px = imgData.data;

  // 2. Apply Alpha Gradient (if exists)
  if (alphaStops && alphaStops.length > 0) {
      const sortedAlpha = [...alphaStops].sort((a,b) => a.pos - b.pos);
      
      const getAlpha = (t: number) => {
          if (sortedAlpha.length === 0) return 1;
          if (t <= sortedAlpha[0].pos) return sortedAlpha[0].value;
          if (t >= sortedAlpha[sortedAlpha.length-1].pos) return sortedAlpha[sortedAlpha.length-1].value;
          
          for(let i=0; i<sortedAlpha.length-1; i++) {
              if (t >= sortedAlpha[i].pos && t <= sortedAlpha[i+1].pos) {
                  const range = sortedAlpha[i+1].pos - sortedAlpha[i].pos;
                  const mix = (t - sortedAlpha[i].pos) / range;
                  return sortedAlpha[i].value + (sortedAlpha[i+1].value - sortedAlpha[i].value) * mix;
              }
          }
          return 1;
      };

      for(let i=0; i<width; i++) {
          const t = i / (width - 1);
          const alphaVal = getAlpha(t);
          px[i*4 + 3] = Math.round(alphaVal * 255);
      }
  }

  data.set(px);

  return {
    isRaw: true,
    data,
    width,
    height,
    id: generateId('grad', width, { stops, alphaStops }),
    wrapClamp: true
  };
};

export const generateCurveTexture = (
  points: Array<{ x: number; y: number }>, 
  width: number = 512,
  pointsR?: Array<{ x: number; y: number }>,
  pointsG?: Array<{ x: number; y: number }>,
  pointsB?: Array<{ x: number; y: number }>,
  pointsA?: Array<{ x: number; y: number }>
): RawTextureData => {
  const height = 1;
  const data = new Uint8ClampedArray(width * height * 4);
  
  // Helper for curve interpolation
  const getValue = (pts: Array<{ x: number; y: number }>, t: number) => {
      if (!pts || pts.length === 0) return t; // Default to identity if missing
      
      // Sort if needed (though we expect them sorted from UI)
      // We assume sorted for performance in this tight loop, or we sort once outside.
      // Let's do a simple linear scan as N is small.
      
      // Handle boundaries
      if (t <= pts[0].x) return pts[0].y;
      if (t >= pts[pts.length-1].x) return pts[pts.length-1].y;
      
      // Find segment
      for (let i = 0; i < pts.length - 1; i++) {
          if (t >= pts[i].x && t < pts[i+1].x) {
              const p0 = pts[i];
              const p1 = pts[i+1];
              const range = p1.x - p0.x;
              if (range === 0) return p0.y;
              const ratio = (t - p0.x) / range;
              return p0.y + (p1.y - p0.y) * ratio;
          }
      }
      return pts[pts.length-1].y;
  };

  // Prepare points (sort and clamp)
  const prepare = (pts?: Array<{ x: number; y: number }>) => {
      if (!pts) return null;
      const sorted = [...pts].sort((a, b) => a.x - b.x);
      if (sorted.length === 0) return null;
      if (sorted[0].x > 0) sorted.unshift({ x: 0, y: sorted[0].y });
      if (sorted[sorted.length - 1].x < 1) sorted.push({ x: 1, y: sorted[sorted.length - 1].y });
      return sorted;
  };

  const masterPts = prepare(points);
  const rPts = prepare(pointsR);
  const gPts = prepare(pointsG);
  const bPts = prepare(pointsB);
  const aPts = prepare(pointsA);

  for (let i = 0; i < width; i++) {
      const t = i / (width - 1);
      
      // 1. Apply Master Curve
      const tm = masterPts ? getValue(masterPts, t) : t;
      
      // 2. Apply Channel Curves (or identity if not present)
      // If channel curve is missing, it maps tm -> tm (identity)
      const r = rPts ? getValue(rPts, tm) : tm;
      const g = gPts ? getValue(gPts, tm) : tm;
      const b = bPts ? getValue(bPts, tm) : tm;
        // Alpha curve is independent from master/RGB by default.
        // If not provided, keep identity mapping (a -> a) for back-compat.
        const a = aPts ? getValue(aPts, t) : t;
      
      const idx = i * 4;
      data[idx] = Math.round(Math.max(0, Math.min(1, r)) * 255);
      data[idx + 1] = Math.round(Math.max(0, Math.min(1, g)) * 255);
      data[idx + 2] = Math.round(Math.max(0, Math.min(1, b)) * 255);
        data[idx + 3] = Math.round(Math.max(0, Math.min(1, a)) * 255);
  }

  return {
    isRaw: true,
    data,
    width,
    height,
    id: generateId('curve', width, { points, pointsR, pointsG, pointsB }),
    wrapClamp: true
  };
};
