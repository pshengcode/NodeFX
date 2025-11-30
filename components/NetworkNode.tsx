import React, { useState, useEffect, useCallback, useRef, memo } from 'react';
import { Handle, Position, NodeProps, useReactFlow, useNodes, useEdges } from 'reactflow';
import { NodeData, CompilationResult } from '../types';
import { Wifi, X, AlertCircle, CheckCircle, RefreshCw, Settings2, UploadCloud, Send, ShieldAlert, Download, Hash } from 'lucide-react';
import { compileGraph } from '../utils/shaderCompiler';
import ShaderPreview from './ShaderPreview';
import { SmartNumberInput } from './UniformWidgets';
import { useTranslation } from 'react-i18next';

const NetworkNode = memo(({ id, data, selected }: NodeProps<NodeData>) => {
  const { t } = useTranslation();
  const { setNodes, deleteElements } = useReactFlow();
  const nodes = useNodes<NodeData>();
  const edges = useEdges();

  // Check connection status
  const isConnected = edges.some(e => e.target === id && e.targetHandle === 'in_1');
  
  // Visual Style: Solid if connected, Hollow if unconnected
  const colorStyle = isConnected
    ? `bg-purple-500 border border-zinc-900`
    : `bg-zinc-900 border-2 border-purple-500`;

  // Local State
  const [compiledData, setCompiledData] = useState<CompilationResult | null>(null);
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'uploading' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [errorDetails, setErrorDetails] = useState<string | null>(null);
  const [lastUploadTime, setLastUploadTime] = useState<string>('-');
  const [showConfig, setShowConfig] = useState(false);
  
  // Params
  const [serverUrl, setServerUrl] = useState(data.serverUrl || 'http://127.0.0.1:8080/upload');
  const [debounceMs, setDebounceMs] = useState(1000);
  
  // ID Editing State
  const [localId, setLocalId] = useState(data.customId ?? '');

  // Auto-generate ID if missing (5-digit Hex)
  useEffect(() => {
    if (!data.customId) {
        // Generate random 5-digit hex (00000 to FFFFF)
        const randomId = Math.floor(Math.random() * 0x100000).toString(16).padStart(5, '0').toUpperCase();
        setNodes((nds) => nds.map(n => n.id === id ? { ...n, data: { ...n.data, customId: randomId } } : n));
    }
  }, [id, data.customId, setNodes]);

  // Extract Resolution from passed Data (Propagated from App.tsx)
  const { resolution } = data;
  const renderW = resolution?.w || 512;
  const renderH = resolution?.h || 512;
  const aspectRatio = renderW / renderH;

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  // Environment Check
  const isHttps = typeof window !== 'undefined' && window.location.protocol === 'https:';
  const isLocalTarget = serverUrl.includes('127.0.0.1') || serverUrl.includes('localhost');
  const isHttpTarget = serverUrl.startsWith('http:');
  const potentialBlock = isHttps && isHttpTarget && isLocalTarget;

  // Sync local ID state if data changes externally (e.g. undo/redo)
  useEffect(() => {
    setLocalId(data.customId ?? '');
  }, [data.customId]);

  const commitId = () => {
    if (localId !== data.customId) {
        setNodes((nds) => nds.map(n => n.id === id ? { ...n, data: { ...n.data, customId: localId } } : n));
    }
  };

  // 1. Independent Compilation Logic
  useEffect(() => {
    const inputEdge = edges.find(e => e.target === id && e.targetHandle === 'in_1');
    
    if (inputEdge) {
        const result = compileGraph(nodes, edges, inputEdge.source);
        setCompiledData(result);
    } else {
        setCompiledData(null);
    }
  }, [nodes, edges, id]);

  // 2. Upload Logic
  const uploadImage = useCallback(async () => {
    if (!canvasRef.current) {
        console.warn("[NetworkNode] Canvas reference missing. Cannot upload.");
        return;
    }
    
    setUploadStatus('uploading');
    setErrorMessage(null);
    setErrorDetails(null);

    console.log("[NetworkNode] Starting upload sequence...");

    try {
        // Step 1: Capture Blob (PNG for Alpha Support)
        const blob = await new Promise<Blob | null>(resolve => 
            canvasRef.current?.toBlob(resolve, 'image/png')
        );

        if (!blob) throw new Error("Canvas toBlob failed (Result is null). Possible taint issue.");
        if (blob.size === 0) throw new Error("Captured Blob size is 0 bytes.");

        console.log(`[NetworkNode] Blob Captured: ${blob.size} bytes (${blob.type})`);

        // Step 2: Prepare Payload (Always Raw Body)
        const headers: Record<string, string> = {
            'Content-Type': 'image/png'
        };
        
        // URL Construction
        const separator = serverUrl.includes('?') ? '&' : '?';
        const targetId = data.customId ? data.customId : id;
        const targetUrl = `${serverUrl}${separator}id=${targetId}`;

        console.log(`[NetworkNode] POST -> ${targetUrl}`);
        
        // Step 3: Send
        const response = await fetch(targetUrl, {
            method: 'POST',
            body: blob,
            headers: headers,
            mode: 'cors',
            referrerPolicy: 'no-referrer', 
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        console.log("[NetworkNode] Upload Success");
        setUploadStatus('success');
        setLastUploadTime(new Date().toLocaleTimeString());
        setTimeout(() => setUploadStatus('idle'), 2000);

    } catch (err: any) {
        console.error("[NetworkNode] Upload Failed:", err);
        setUploadStatus('error');
        
        let msg = err.message || "Unknown Error";
        let details = null;
        
        // Smart Error Diagnosis
        if (msg === 'Failed to fetch' || msg.includes('NetworkError')) {
             if (potentialBlock) {
                 msg = "Security Block: Private Network Access";
                 details = "Browsers block HTTPS sites from accessing HTTP Localhost. \n\nSolution: Use ngrok to get an HTTPS URL for your server.";
             } else if (isHttps && isHttpTarget) {
                 msg = "Security Block: Mixed Content";
                 details = "You cannot access insecure HTTP resources from a secure HTTPS page.";
             } else {
                 msg = "Connection Failed";
                 details = "Check if your server is running and CORS headers are set correctly.";
             }
        }
        
        setErrorMessage(msg);
        setErrorDetails(details);
    }
  }, [id, data.customId, serverUrl, potentialBlock, isHttps, isHttpTarget]);

  // 3. Debounce Trigger
  useEffect(() => {
      // NOTE: We check compiledData.passes.length because compiledData is now an object
      if (!compiledData || compiledData.passes.length === 0) return;

      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);

      setUploadStatus('idle');
      setErrorMessage(null);
      setErrorDetails(null);
      
      debounceTimerRef.current = setTimeout(() => {
          uploadImage();
      }, debounceMs);

      return () => {
          if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      }
  }, [compiledData, debounceMs, uploadImage]);

  const updateServerUrl = (url: string) => {
      setServerUrl(url);
      setNodes((nds) => 
        nds.map((n) => n.id === id ? { ...n, data: { ...n.data, serverUrl: url } } : n)
      );
  };

  const handleManualDownload = () => {
      if (canvasRef.current) {
          const link = document.createElement('a');
          link.download = `network-node-${data.customId || id}.png`;
          link.href = canvasRef.current.toDataURL('image/png');
          link.click();
      }
  };

  const handleDelete = (e: React.MouseEvent) => {
      e.stopPropagation();
      deleteElements({ nodes: [{ id }] });
  };

  const borderClass = selected ? 'border-blue-500 ring-1 ring-blue-500' : 'border-zinc-700';
  
  const statusColor = {
      idle: 'text-zinc-500',
      uploading: 'text-yellow-500 animate-pulse',
      success: 'text-green-500',
      error: 'text-red-500'
  }[uploadStatus];

  return (
    <div className={`shadow-xl rounded-lg border bg-zinc-900 w-[260px] transition-all ${borderClass}`}>
      
      {/* Header */}
      <div className="flex items-center justify-between p-2 border-b border-zinc-800 bg-zinc-800/50 rounded-t-lg">
        <div className="flex items-center gap-2">
            <Wifi size={14} className={statusColor} />
            <span className="font-semibold text-sm text-zinc-200">{t('Network Sender')}</span>
        </div>
        <div className="flex gap-1">
             <button onClick={() => setShowConfig(!showConfig)} className={`p-1 rounded hover:bg-zinc-700 ${showConfig ? 'text-blue-400' : 'text-zinc-400'}`} title={t('Configure')}>
                <Settings2 size={14} />
            </button>
             <button onClick={handleDelete} className="p-1 rounded hover:bg-red-900/30 text-zinc-500 hover:text-red-400" title={t('Delete')}>
                <X size={14} />
            </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="relative p-3 bg-zinc-950/30 flex flex-col gap-3">
        
        {/* Input Handle */}
        <div className="absolute top-14 left-0">
             <Handle
                type="target"
                position={Position.Left}
                id="in_1"
                className={`!w-3 !h-3 !left-1 !top-1/2 !-mt-1.5 !transform-none hover:scale-125 transition-all !opacity-100 ${colorStyle}`}
            />
        </div>

        {/* Custom ID Input */}
        <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 text-zinc-500" title={t('Network ID')}>
                <Hash size={12} />
                <span className="text-[10px] font-bold uppercase w-3">ID</span>
            </div>
            <input 
                className="flex-1 bg-zinc-950 border border-zinc-800 rounded px-1.5 py-1 text-xs text-zinc-300 font-mono focus:border-blue-500 outline-none placeholder-zinc-700 transition-colors"
                value={localId}
                onChange={(e) => setLocalId(e.target.value)}
                onBlur={commitId}
                onKeyDown={(e) => { if(e.key === 'Enter') commitId(); }}
                placeholder={data.customId || id}
                title="Custom ID for server requests"
            />
        </div>

        {/* Dynamic Aspect Ratio Container */}
        <div 
            className="w-full bg-black rounded border border-zinc-800 overflow-hidden relative group ml-2 w-[calc(100%-8px)]"
            style={{ aspectRatio: `${aspectRatio}` }}
        >
            {compiledData && compiledData.passes.length > 0 ? (
                <ShaderPreview 
                    ref={canvasRef} 
                    data={compiledData} 
                    width={renderW} 
                    height={renderH}
                    className="w-full h-full"
                />
            ) : (
                <div className="w-full h-full flex flex-col items-center justify-center text-zinc-700 gap-2">
                    <UploadCloud size={24} />
                    <span className="text-[10px]">{t('Connect Input')}</span>
                </div>
            )}
            
            {/* Status Badge */}
            <div className={`absolute top-2 right-2 px-2 py-1 rounded backdrop-blur-md text-[10px] font-bold flex items-center gap-1.5 border shadow-lg ${
                uploadStatus === 'error' ? 'bg-red-900/80 border-red-700 text-red-100' : 
                uploadStatus === 'success' ? 'bg-green-900/80 border-green-700 text-green-100' :
                'bg-zinc-900/80 border-zinc-700 text-zinc-300'
            }`}>
                {uploadStatus === 'uploading' && <RefreshCw size={10} className="animate-spin"/>}
                {uploadStatus === 'success' && <CheckCircle size={10}/>}
                {uploadStatus === 'error' && <AlertCircle size={10}/>}
                <span>{uploadStatus.toUpperCase()}</span>
            </div>
            
            {/* Error Message Overlay */}
            {uploadStatus === 'error' && errorMessage && (
                <div className="absolute inset-0 bg-zinc-950/90 p-3 text-red-200 flex flex-col justify-center items-center text-center z-10 overflow-hidden">
                    <ShieldAlert size={24} className="mb-2 text-red-500"/>
                    <div className="text-xs font-bold mb-1">{errorMessage}</div>
                    {errorDetails && (
                        <div className="text-[9px] text-zinc-400 leading-relaxed whitespace-pre-wrap">{errorDetails}</div>
                    )}
                    <button 
                        onClick={handleManualDownload}
                        className="mt-3 flex items-center gap-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 px-2 py-1 rounded text-[10px] border border-zinc-700"
                    >
                        <Download size={10} /> {t('Download Manually')}
                    </button>
                </div>
            )}
        </div>

        <div className="flex justify-between items-center text-[10px] text-zinc-500 pl-2">
            <span>{t('Last')}: {lastUploadTime}</span>
            <span className="font-mono opacity-50" title={t('Output Size')}>{renderW}x{renderH}</span>
        </div>
      </div>

      {/* Config Panel */}
      {showConfig && (
        <div className="p-3 border-t border-zinc-800 bg-zinc-900/90 space-y-3 animate-in slide-in-from-top-2 duration-200">
             <div className="space-y-1">
                <div className="flex justify-between items-center">
                     <label className="text-[10px] uppercase text-zinc-500 font-bold">{t('Server API URL')}</label>
                     {potentialBlock && (
                         <span className="text-[9px] text-yellow-500 flex items-center gap-1"><ShieldAlert size={10}/> {t('HTTPS mismatch')}</span>
                     )}
                </div>
                <input 
                    className={`w-full bg-zinc-950 border rounded px-2 py-1.5 text-xs text-zinc-300 outline-none transition-colors ${potentialBlock ? 'border-yellow-700 focus:border-yellow-500' : 'border-zinc-700 focus:border-blue-500'}`}
                    value={serverUrl}
                    onChange={(e) => updateServerUrl(e.target.value)}
                    placeholder="http://..."
                />
             </div>

             <div className="flex gap-2 pt-1">
                 <div className="space-y-1 flex-1">
                    <label className="text-[10px] uppercase text-zinc-500 font-bold">{t('Debounce (ms)')}</label>
                    <SmartNumberInput 
                        className="w-full h-6 bg-zinc-950 border border-zinc-700 rounded px-2 text-xs text-zinc-300 focus-within:border-blue-500 outline-none"
                        value={debounceMs}
                        onChange={(v) => setDebounceMs(v)}
                        step={100}
                    />
                 </div>
                 <div className="flex items-end">
                     <button 
                        onClick={() => uploadImage()}
                        className="h-[26px] px-3 bg-blue-600 hover:bg-blue-500 text-white rounded text-xs font-medium flex items-center gap-1 transition-colors active:scale-95"
                        disabled={uploadStatus === 'uploading'}
                        title={t('Force Send Now')}
                     >
                         <Send size={12} /> {t('Test')}
                     </button>
                 </div>
             </div>
        </div>
      )}

    </div>
  );
});

export default NetworkNode;
