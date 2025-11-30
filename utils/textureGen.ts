
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
          px[i*4 + 3] = Math.floor(alphaVal * 255);
      }
  }

  data.set(px);

  return {
    isRaw: true,
    data,
    width,
    height,
    id: generateId('grad', width, { stops, alphaStops })
  };
};

export const generateCurveTexture = (points: Array<{ x: number; y: number }>, width: number = 512): RawTextureData => {
  const height = 1;
  const data = new Uint8ClampedArray(width * height * 4);
  
  const sorted = [...points].sort((a, b) => a.x - b.x);
  
  if (sorted.length === 0) {
     return { isRaw: true, data, width, height, id: generateId('curve', width, points) };
  }

  // Clamp start/end
  const fullPoints = [...sorted];
  if (fullPoints[0].x > 0) fullPoints.unshift({ x: 0, y: fullPoints[0].y });
  if (fullPoints[fullPoints.length - 1].x < 1) fullPoints.push({ x: 1, y: fullPoints[fullPoints.length - 1].y });

  let pIndex = 0;
  
  for (let i = 0; i < width; i++) {
      const t = i / (width - 1);
      
      // Find segment
      while (pIndex < fullPoints.length - 1 && fullPoints[pIndex + 1].x < t) {
          pIndex++;
      }
      
      const p0 = fullPoints[pIndex];
      const p1 = fullPoints[pIndex + 1] || p0;
      
      let val = p0.y;
      if (p1.x > p0.x) {
          const range = p1.x - p0.x;
          const dist = t - p0.x;
          const ratio = dist / range;
          // Linear interpolation
          val = p0.y + (p1.y - p0.y) * ratio;
      }
      
      val = Math.max(0, Math.min(1, val));
      const byteVal = Math.floor(val * 255);
      
      const idx = i * 4;
      data[idx] = byteVal;     // R
      data[idx + 1] = byteVal; // G
      data[idx + 2] = byteVal; // B
      data[idx + 3] = 255;     // A
  }

  return {
    isRaw: true,
    data,
    width,
    height,
    id: generateId('curve', width, points)
  };
};
