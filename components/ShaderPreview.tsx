
import React, { useRef, useEffect, useImperativeHandle, forwardRef, useState } from 'react';
import { CompilationResult } from '../types';
import { AlertCircle } from 'lucide-react';
import { webglSystem } from '../utils/webglSystem';
import { assetManager } from '../utils/assetManager';

interface Props {
  data: CompilationResult | null;
  className?: string;
  paused?: boolean;
  width?: number;
  height?: number;
  onNodeError?: (nodeId: string, error: string | null) => void;
}

type ChannelMode = 0 | 1 | 2 | 3 | 4; // RGBA, R, G, B, A

const ShaderPreview = forwardRef<HTMLCanvasElement, Props>(({ data, className, paused, width, height, onNodeError }, ref) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [channelMode, setChannelMode] = useState<ChannelMode>(0);
  const animationFrameRef = useRef<number>(0);
  const [lastError, setLastError] = useState<string | null>(null);

  // Expose canvas ref
  useImperativeHandle(ref, () => canvasRef.current as HTMLCanvasElement);

  // Preload Assets
  useEffect(() => {
    if (data && !data.error) {
        data.passes.forEach(pass => {
            Object.values(pass.uniforms).forEach(async (u: any) => {
                if (u.type === 'sampler2D' && typeof u.value === 'string' && u.value.startsWith('asset://')) {
                    await assetManager.ensure(u.value);
                }
            });
        });
    }
  }, [data]);

  useEffect(() => {
      const render = () => {
          if (!paused && canvasRef.current && data && !data.error) {
             const w = width || canvasRef.current.clientWidth || 512;
             const h = height || canvasRef.current.clientHeight || 512;
             
             let hasRenderError = false;

             // Delegate rendering to the global system
             webglSystem.render(
                 data, 
                 canvasRef.current, 
                 w, 
                 h, 
                 channelMode,
                 (passId, err) => {
                     // Error Callback
                     hasRenderError = true;
                     if (err !== lastError) {
                         setLastError(err);
                         if (onNodeError) onNodeError(passId, err);
                     }
                 }
             );
             
             // LOOP FIX: Only clear the error if the current frame rendered SUCCESSFULLY.
             // Previously this cleared error solely based on valid compiled data, which caused
             // a loop if the runtime WebGL error persisted.
             if (!hasRenderError && lastError && !data.error) {
                 setLastError(null);
                 if (onNodeError) onNodeError("CLEAR_ALL", null);
             }
          }
          animationFrameRef.current = requestAnimationFrame(render);
      };
      
      render();
      return () => cancelAnimationFrame(animationFrameRef.current);
  }, [data, paused, width, height, channelMode, onNodeError, lastError]);

  const handleDownload = () => {
    if (canvasRef.current) {
        const link = document.createElement('a');
        link.download = `render.png`;
        link.href = canvasRef.current.toDataURL('image/png');
        link.click();
    }
  };

  return (
    <div className={`relative group ${className}`}>
      {data?.error && (
          <div className="absolute inset-0 bg-red-900/80 flex items-center justify-center p-4 z-20 pointer-events-none">
              <div className="text-red-200 font-mono text-sm whitespace-pre-wrap">{data.error}</div>
          </div>
      )}

      {/* 2D Canvas that receives the copied frame */}
      <canvas 
        ref={canvasRef} 
        className="w-full h-full object-contain bg-[url('https://www.transparenttextures.com/patterns/dark-matter.png')] bg-zinc-950" 
      />

      {/* OVERLAY CONTROLS */}
      <div className="absolute top-2 right-2 flex gap-1 z-20 opacity-0 group-hover:opacity-100 transition-opacity">
          <div className="flex bg-zinc-800/90 rounded border border-zinc-700 p-0.5 backdrop-blur-sm">
             {[0,1,2,3,4].map(m => (
                 <button 
                    key={m}
                    onClick={() => setChannelMode(m as ChannelMode)} 
                    className={`px-1.5 py-0.5 text-[9px] rounded ${channelMode === m ? 'bg-zinc-600 text-white font-bold' : 'text-zinc-400 hover:text-zinc-200'}`}
                 >
                    {['RGB','R','G','B','A'][m]}
                 </button>
             ))}
          </div>
      </div>

      <button onClick={handleDownload} className="absolute bottom-4 right-4 bg-zinc-800 hover:bg-zinc-700 text-white px-3 py-1 rounded text-xs opacity-0 group-hover:opacity-100 transition-opacity border border-zinc-600 z-20">
        Save Image
      </button>
    </div>
  );
});

ShaderPreview.displayName = 'ShaderPreview';
export default ShaderPreview;
