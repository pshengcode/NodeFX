
import React, { useRef, useEffect, useImperativeHandle, forwardRef, useState } from 'react';
import { CompilationResult } from '../types';
import { AlertCircle, Grid, Maximize, RotateCcw, Code, X, Copy, Check } from 'lucide-react';
import { webglSystem } from '../utils/webglSystem';
import { assetManager } from '../utils/assetManager';
import { useTranslation } from 'react-i18next';

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
  const { t } = useTranslation();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [channelMode, setChannelMode] = useState<ChannelMode>(0);
  const [tiling, setTiling] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [lastMousePos, setLastMousePos] = useState({ x: 0, y: 0 });
  const [isDarkBg, setIsDarkBg] = useState(true);
  const animationFrameRef = useRef<number>(0);
  const [lastError, setLastError] = useState<string | null>(null);
  const [showCode, setShowCode] = useState(false);
  const [copied, setCopied] = useState(false);

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
                 },
                 tiling,
                 zoom,
                 pan
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
  }, [data, paused, width, height, channelMode, onNodeError, lastError, tiling, zoom, pan]);

  const handleCopyCode = () => {
      if (!data) return;
      const code = data.passes.map(p => `// Pass: ${p.outputTo}\n${p.fragmentShader}`).join('\n\n');
      navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    if (canvasRef.current) {
        const link = document.createElement('a');
        link.download = `render.png`;
        link.href = canvasRef.current.toDataURL('image/png');
        link.click();
    }
  };

  useEffect(() => {
      const container = containerRef.current;
      if (!container) return;

      const handleWheel = (e: WheelEvent) => {
          e.preventDefault();
          e.stopPropagation();
          const delta = e.deltaY > 0 ? 0.9 : 1.1;
          setZoom(z => Math.min(Math.max(z * delta, 0.1), 10));
      };

      container.addEventListener('wheel', handleWheel, { passive: false });
      return () => container.removeEventListener('wheel', handleWheel);
  }, []);

  const handleMouseDown = (e: React.MouseEvent) => {
      if (e.button === 0 || e.button === 1) { // Left or Middle click
          setIsDragging(true);
          setLastMousePos({ x: e.clientX, y: e.clientY });
          e.preventDefault();
      }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
      if (isDragging) {
          const dx = e.clientX - lastMousePos.x;
          const dy = e.clientY - lastMousePos.y;
          setPan(p => ({ x: p.x + dx, y: p.y + dy }));
          setLastMousePos({ x: e.clientX, y: e.clientY });
      }
  };

  const handleMouseUp = () => {
      setIsDragging(false);
  };

  const resetView = () => {
      setZoom(1);
      setPan({ x: 0, y: 0 });
  };

  return (
    <div 
        ref={containerRef}
        className={`relative group overflow-hidden ${className} ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`} 
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
    >
      {data?.error && (
          <div className="absolute inset-0 bg-red-900/80 flex items-center justify-center p-4 z-20 pointer-events-none">
              <div className="text-red-200 font-mono text-sm whitespace-pre-wrap">{data.error}</div>
          </div>
      )}

      {/* 2D Canvas that receives the copied frame */}
      <div className="w-full h-full flex items-center justify-center overflow-hidden bg-zinc-950 relative">
          {/* Checkerboard Background */}
          <div 
            className={`absolute inset-0 pointer-events-none ${isDarkBg ? 'opacity-20' : 'opacity-80'}`}
            style={{
                backgroundImage: `
                    linear-gradient(45deg, #808080 25%, transparent 25%), 
                    linear-gradient(-45deg, #808080 25%, transparent 25%), 
                    linear-gradient(45deg, transparent 75%, #808080 75%), 
                    linear-gradient(-45deg, transparent 75%, #808080 75%)
                `,
                backgroundSize: '20px 20px',
                backgroundPosition: '0 0, 0 10px, 10px -10px, -10px 0px',
                backgroundColor: isDarkBg ? '#18181b' : '#ffffff'
            }}
          />
          
          <canvas 
            ref={canvasRef} 
            className="w-full h-full block relative z-10 pointer-events-none"
          />
      </div>

      {/* OVERLAY CONTROLS */}
      <div className="absolute top-2 right-2 flex flex-col gap-1 z-20 opacity-0 group-hover:opacity-100 transition-opacity items-end">
          {/* Channel Selector */}
          <div className="flex bg-zinc-800/90 rounded border border-zinc-700 p-0.5 backdrop-blur-sm shadow-lg">
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

          {/* Tools */}
          <div className="flex bg-zinc-800/90 rounded border border-zinc-700 p-0.5 backdrop-blur-sm shadow-lg gap-0.5">
             <button 
                onClick={() => setTiling(!tiling)}
                className={`p-1 rounded ${tiling ? 'bg-blue-600 text-white' : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700'}`}
                title={t("Toggle Tiling (3x3)")}
             >
                 <Grid size={12} />
             </button>
             <button 
                onClick={() => setIsDarkBg(!isDarkBg)}
                className={`p-1 rounded ${!isDarkBg ? 'bg-zinc-200 text-black' : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700'}`}
                title={t("Toggle Background Color")}
             >
                 <div className="w-3 h-3 border border-current bg-gradient-to-br from-gray-400 to-transparent" />
             </button>
             <div className="w-px bg-zinc-700 mx-0.5" />
             <button 
                onClick={resetView}
                className="p-1 rounded text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700"
                title={t("Reset View")}
             >
                 <RotateCcw size={12} />
             </button>
             <div className="w-px bg-zinc-700 mx-0.5" />
             <button 
                onClick={() => setShowCode(true)}
                className="p-1 rounded text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700"
                title={t("View Compiled GLSL")}
             >
                 <Code size={12} />
             </button>
          </div>
      </div>

      <button onClick={handleDownload} className="absolute bottom-4 right-4 bg-zinc-800 hover:bg-zinc-700 text-white px-3 py-1 rounded text-xs opacity-0 group-hover:opacity-100 transition-opacity border border-zinc-600 z-20 shadow-lg">
        {t("Save Image")}
      </button>

      {/* Code View Modal */}
      {showCode && data && (
        <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-8" onMouseDown={(e) => e.stopPropagation()}>
            <div className="bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl w-full max-w-4xl h-[80vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                <div className="flex items-center justify-between p-4 border-b border-zinc-800 bg-zinc-900/50">
                    <h3 className="text-zinc-100 font-medium flex items-center gap-2">
                        <Code size={16} className="text-blue-400"/>
                        {t("Compiled GLSL")}
                    </h3>
                    <div className="flex items-center gap-2">
                         <button 
                            onClick={handleCopyCode}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded text-xs transition-colors border border-zinc-700"
                        >
                            {copied ? <Check size={14} className="text-green-400"/> : <Copy size={14}/>}
                            {copied ? t("Copied") : t("Copy")}
                        </button>
                        <button 
                            onClick={() => setShowCode(false)}
                            className="p-1.5 hover:bg-zinc-800 rounded text-zinc-400 hover:text-zinc-200 transition-colors"
                        >
                            <X size={18} />
                        </button>
                    </div>
                </div>
                
                <div className="flex-1 overflow-auto p-4 bg-zinc-950 font-mono text-xs text-zinc-300">
                    {data.passes.map((pass, i) => (
                        <div key={pass.id} className="mb-8 last:mb-0">
                            {data.passes.length > 1 && (
                                <div className="text-zinc-500 mb-2 font-bold uppercase tracking-wider text-[10px]">
                                    Pass {i + 1}: {pass.outputTo}
                                </div>
                            )}
                            
                            <div className="mb-4">
                                <div className="text-zinc-600 mb-1 text-[10px] uppercase">Fragment Shader</div>
                                <pre className="whitespace-pre-wrap break-all bg-zinc-900/50 p-4 rounded border border-zinc-800/50 selection:bg-blue-500/30">
                                    {pass.fragmentShader}
                                </pre>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
      )}
    </div>
  );
});

ShaderPreview.displayName = 'ShaderPreview';
export default ShaderPreview;
