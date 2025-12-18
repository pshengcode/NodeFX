import React, { useEffect, useRef, useState, useCallback, memo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { webglSystem } from '../utils/webglSystem';
import { CompilationResult } from '../types';
import GIF from 'gif.js';
import { useTranslation } from 'react-i18next';
import { useNodeSettings } from '../hooks/useNodeSync';
import { useOptimizedNodes } from '../hooks/useOptimizedNodes';
import { computeGifTimingPlan, GifTimingPlan, quantizeGifDelayMs } from '../utils/gifTiming';
import { useProjectDispatch, useProjectEdges } from '../context/ProjectContext';

const PASS_THROUGH_VERT = `#version 300 es
in vec2 position;
out vec2 vUv;
void main() {
    vUv = position * 0.5 + 0.5;
    gl_Position = vec4(position, 0.0, 1.0);
}`;

const BakeNode = memo(({ data, id }: NodeProps) => {
    const { t } = useTranslation();
    const { setNodes, setEdges } = useProjectDispatch();
    
    // Use custom selectors instead of useNodes/useEdges to avoid re-renders on drag
    const nodes = useOptimizedNodes();
    const edges = useProjectEdges();

    const handleDisconnect = useCallback((e: React.MouseEvent, handleId: string, type: 'source' | 'target') => {
        if (e.altKey) {
            e.stopPropagation();
            e.preventDefault();
            setEdges((edges) => edges.filter((edge) => {
                if (type === 'target') return !(edge.target === id && edge.targetHandle === handleId);
                else return !(edge.source === id && edge.sourceHandle === handleId);
            }));
        }
    }, [id, setEdges]);

    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [recording, setRecording] = useState(false);
    const [progress, setProgress] = useState(0);
    
    // Settings with Persistence
    const [settings, updateSettings] = useNodeSettings(id, data, {
        width: 512,
        height: 512,
        fps: 30,
        duration: 2,
        columns: 3,
        rows: 3,
        mode: 'video'
    });

    const { width, height, fps, duration, columns, rows, mode } = settings;

    const setWidth = (v: any) => updateSettings({ width: v });
    const setHeight = (v: any) => updateSettings({ height: v });
    const setFps = (v: any) => updateSettings({ fps: v });
    const setDuration = (v: any) => updateSettings({ duration: v });
    const setColumns = (v: any) => updateSettings({ columns: v });
    const setRows = (v: any) => updateSettings({ rows: v });
    const setMode = (v: any) => updateSettings({ mode: v });


    // Internal State
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const chunksRef = useRef<Blob[]>([]);
    const spriteCanvasRef = useRef<HTMLCanvasElement | null>(null);
    const gifRef = useRef<GIF | null>(null);
    const frameCountRef = useRef(0);
    const startTimeRef = useRef(0);
    const rafRef = useRef<number>();
    const stopTimeoutRef = useRef<number | null>(null);
    const gifTimingRef = useRef<GifTimingPlan | null>(null);
    const nextGifFrameAtRef = useRef<number>(0);
    const lastGifCaptureAtRef = useRef<number>(0);
    const gifStopAtRef = useRef<number>(0);
    const nextSpriteFrameAtRef = useRef<number>(0);

    // Input Texture ID
    const inputEdge = edges.find(e => e.target === id && e.targetHandle === 'image');
    const inputTexture = inputEdge ? inputEdge.source : null;

    // Render Loop
    const renderFrame = useCallback(() => {
        if (!canvasRef.current || !inputTexture) return;

        // Use raw ID for FBO lookup (do not replace hyphens)
        const fboUrl = `fbo://${inputTexture}`;
        
        const frag = `#version 300 es
precision mediump float;
uniform sampler2D u_tex;
in vec2 vUv;
out vec4 fragColor;
void main() {
    fragColor = texture(u_tex, vUv);
}`;

        // Construct a dummy compilation result to render the input texture
        const compResult: CompilationResult = {
            passes: [{
                id: `bake_${id}`,
                vertexShader: PASS_THROUGH_VERT,
                fragmentShader: frag,
                uniforms: {
                    u_tex: { type: 'sampler2D', value: fboUrl }
                },
                inputTextureUniforms: {},
                outputTo: null // Screen
            }],
            error: null
        };

        // Prevent cleanup to avoid deleting the source FBO
        // Also, ensure we are not passing undefined for optional params if we want to reach preventCleanup
        webglSystem.render(
            compResult, 
            canvasRef.current, 
            width, 
            height, 
            0, 
            undefined, 
            false, 
            1.0, 
            {x:0,y:0}, 
            undefined, 
            true // preventCleanup
        );

        if (recording) {
            // Video duration should be based on real elapsed time.
            // Counting requestAnimationFrame ticks causes early stop on high refresh-rate screens.
            if (mode === 'video') {
                const durationMs = Math.max(0, Number(duration) * 1000);
                const elapsedMs = Date.now() - startTimeRef.current;

                if (durationMs > 0) {
                    setProgress(Math.min(100, (elapsedMs / durationMs) * 100));
                    if (elapsedMs >= durationMs) {
                        stopRecording();
                        return;
                    }
                }
            } else if (mode === 'gif') {
                const gif = gifRef.current;
                const timing = gifTimingRef.current;
                if (!gif || !timing) return;

                const now = Date.now();
                const stopAt = gifStopAtRef.current;
                const durationMs = Math.max(0, stopAt - startTimeRef.current);

                // Only attempt capture on our target schedule.
                if (now >= nextGifFrameAtRef.current) {
                    const isFirst = frameCountRef.current === 0;
                    const rawDelayMs = isFirst ? timing.delayMs : Math.max(0, now - lastGifCaptureAtRef.current);
                    const delayMs = quantizeGifDelayMs(rawDelayMs);

                    gif.addFrame(canvasRef.current, { delay: delayMs, copy: true });
                    frameCountRef.current++;
                    lastGifCaptureAtRef.current = now;
                    nextGifFrameAtRef.current = now + timing.delayMs;
                }

                if (durationMs > 0) {
                    const elapsedMs = now - startTimeRef.current;
                    setProgress(Math.min(100, (elapsedMs / durationMs) * 100));
                }

                // Stop based on real elapsed time so playback duration matches the requested duration
                // even if actual capture FPS is lower than requested.
                if (now >= stopAt && frameCountRef.current > 0) {
                    stopRecording();
                    return;
                }
            } else {
                // Sprite: capture on an FPS schedule so the sheet represents time progression
                const totalFrames = columns * rows;
                const currentFrame = frameCountRef.current;

                if (currentFrame >= totalFrames) {
                    stopRecording();
                    return;
                }

                const now = Date.now();
                const safeFps = Math.max(1, Number(fps) || 1);
                const intervalMs = 1000 / safeFps;

                if (now >= nextSpriteFrameAtRef.current) {
                    if (spriteCanvasRef.current) {
                        const ctx = spriteCanvasRef.current.getContext('2d');
                        if (ctx) {
                            const col = currentFrame % columns;
                            const row = Math.floor(currentFrame / columns);
                            ctx.drawImage(canvasRef.current, col * width, row * height, width, height);
                        }
                    }

                    frameCountRef.current++;
                    nextSpriteFrameAtRef.current = now + intervalMs;
                }

                setProgress(Math.min(100, (frameCountRef.current / totalFrames) * 100));
            }
        }

        rafRef.current = requestAnimationFrame(renderFrame);
    }, [inputTexture, width, height, recording, mode, duration, fps, columns, rows, id]);

    useEffect(() => {
        rafRef.current = requestAnimationFrame(renderFrame);
        return () => {
            if (rafRef.current) cancelAnimationFrame(rafRef.current);
        };
    }, [renderFrame]);

    const startRecording = () => {
        if (!canvasRef.current) return;
        
        setRecording(true);
        setProgress(0);
        frameCountRef.current = 0;
        startTimeRef.current = Date.now();
        gifTimingRef.current = null;

        if (mode === 'video') {
            const stream = canvasRef.current.captureStream(fps);

            // WebM is compressed. To maximize quality, request a very high bitrate.
            // Note: Some browsers/devices may reject extreme bitrates; we fall back safely.
            // Estimate bitrate from pixels/sec * target bits-per-pixel.
            const targetBpp = 1.0; // "max quality" preset (larger files, heavier encode)
            const pixelsPerSecond = Math.max(1, Number(width) * Number(height) * Math.max(1, Number(fps)));
            const estimatedBitsPerSecond = Math.round(pixelsPerSecond * targetBpp);
            const maxVideoBitsPerSecond = 200_000_000; // 200 Mbps cap
            const videoBitsPerSecond = Math.max(10_000_000, Math.min(maxVideoBitsPerSecond, estimatedBitsPerSecond));

            const preferredMimeTypes = [
                'video/webm;codecs=vp9',
                'video/webm;codecs=vp8',
                'video/webm'
            ];
            const mimeType = preferredMimeTypes.find(t => MediaRecorder.isTypeSupported(t)) ?? 'video/webm';

            let recorder: MediaRecorder;
            try {
                recorder = new MediaRecorder(stream, {
                    mimeType,
                    videoBitsPerSecond,
                    bitsPerSecond: videoBitsPerSecond
                });
            } catch {
                // Fallback: try a more conservative bitrate, then browser defaults.
                try {
                    const conservativeBitsPerSecond = Math.max(8_000_000, Math.min(50_000_000, videoBitsPerSecond));
                    recorder = new MediaRecorder(stream, {
                        mimeType,
                        videoBitsPerSecond: conservativeBitsPerSecond,
                        bitsPerSecond: conservativeBitsPerSecond
                    });
                } catch {
                    recorder = new MediaRecorder(stream, { mimeType });
                }
            }
            
            chunksRef.current = [];
            recorder.ondataavailable = (e) => {
                if (e.data.size > 0) chunksRef.current.push(e.data);
            };
            recorder.onstop = saveVideo;
            recorder.start();
            mediaRecorderRef.current = recorder;

            // Stop after the requested duration (best-effort). Also cleared in stopRecording().
            if (stopTimeoutRef.current !== null) {
                window.clearTimeout(stopTimeoutRef.current);
                stopTimeoutRef.current = null;
            }
            const durationMs = Math.max(0, Number(duration) * 1000);
            if (durationMs > 0) {
                stopTimeoutRef.current = window.setTimeout(() => {
                    stopRecording();
                }, durationMs);
            }
        } else if (mode === 'sprite') {
            const sc = document.createElement('canvas');
            sc.width = width * columns;
            sc.height = height * rows;
            spriteCanvasRef.current = sc;

            nextSpriteFrameAtRef.current = startTimeRef.current;
        } else if (mode === 'gif') {
            gifTimingRef.current = computeGifTimingPlan(Number(duration), Number(fps));
            nextGifFrameAtRef.current = startTimeRef.current;
            lastGifCaptureAtRef.current = startTimeRef.current;
            gifStopAtRef.current = startTimeRef.current + Math.max(0, Number(duration) * 1000);
            const gif = new GIF({
                workers: 2,
                quality: 10,
                width: width,
                height: height,
                workerScript: '/gif.worker.js'
            });
            gif.on('finished', (blob: Blob) => {
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `bake_${Date.now()}.gif`;
                a.click();
                setRecording(false); // Ensure UI updates
                setProgress(0);
                gifTimingRef.current = null;
            });
            gifRef.current = gif;
        }
    };

    const stopRecording = () => {
        if (stopTimeoutRef.current !== null) {
            window.clearTimeout(stopTimeoutRef.current);
            stopTimeoutRef.current = null;
        }

        // Don't setRecording(false) immediately for GIF, wait for render
        if (mode !== 'gif') {
            setRecording(false);
        }

        if (mode === 'video' && mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
            mediaRecorderRef.current.stop();
        } else if (mode === 'sprite') {
            saveSprite();
        } else if (mode === 'gif' && gifRef.current) {
            gifRef.current.render();
        }
    };

    const saveVideo = () => {
        const blob = new Blob(chunksRef.current, { type: 'video/webm' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `bake_${Date.now()}.webm`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const saveSprite = () => {
        if (!spriteCanvasRef.current) return;
        const url = spriteCanvasRef.current.toDataURL('image/png');
        const a = document.createElement('a');
        a.href = url;
        a.download = `sprite_${Date.now()}.png`;
        a.click();
    };

    return (
        <div className="bg-zinc-900 border border-zinc-700 rounded-lg shadow-xl overflow-hidden w-80">
            <div className="bg-zinc-800 px-3 py-2 border-b border-zinc-700 flex justify-between items-center">
                <span className="text-zinc-200 font-semibold text-sm">{t("Bake / Export")}</span>
            </div>

            <div className="p-3 space-y-3">
                {/* Preview */}
                <div className="relative aspect-square bg-black rounded border border-zinc-700 overflow-hidden">
                    <canvas 
                        ref={canvasRef} 
                        width={width} 
                        height={height} 
                        className="w-full h-full object-contain"
                    />
                    {!inputTexture && (
                        <div className="absolute inset-0 flex items-center justify-center text-zinc-500 text-xs">
                            {t("No Input")}
                        </div>
                    )}
                </div>

                {/* Controls */}
                <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                        <label className="block text-zinc-400 mb-1">{t("Width")}</label>
                        <input 
                            type="number" 
                            value={width} 
                            onChange={e => setWidth(Number(e.target.value))}
                            className="nodrag w-full bg-zinc-800 text-white px-2 py-1 rounded border border-zinc-600"
                        />
                    </div>
                    <div>
                        <label className="block text-zinc-400 mb-1">{t("Height")}</label>
                        <input 
                            type="number" 
                            value={height} 
                            onChange={e => setHeight(Number(e.target.value))}
                            className="nodrag w-full bg-zinc-800 text-white px-2 py-1 rounded border border-zinc-600"
                        />
                    </div>
                    <div>
                        <label className="block text-zinc-400 mb-1">{t("FPS")}</label>
                        <input 
                            type="number" 
                            value={fps} 
                            onChange={e => setFps(Number(e.target.value))}
                            className="nodrag w-full bg-zinc-800 text-white px-2 py-1 rounded border border-zinc-600"
                        />
                    </div>
                    {mode !== 'sprite' && (
                        <div>
                            <label className="block text-zinc-400 mb-1">{t("Duration (s)")}</label>
                            <input 
                                type="number" 
                                value={duration} 
                                onChange={e => setDuration(Number(e.target.value))}
                                className="nodrag w-full bg-zinc-800 text-white px-2 py-1 rounded border border-zinc-600"
                            />
                        </div>
                    )}
                </div>

                {/* Mode Selection */}
                <div>
                    <label className="block text-zinc-400 mb-1 text-xs">{t("Mode")}</label>
                    <select 
                        value={mode} 
                        onChange={e => setMode(e.target.value as any)}
                        className="nodrag w-full bg-zinc-800 text-white px-2 py-1 rounded border border-zinc-600 text-xs"
                    >
                        <option value="video">{t("Video (WebM)")}</option>
                        <option value="sprite">{t("Sprite Sheet (Grid)")}</option>
                        <option value="gif">{t("GIF Animation")}</option>
                    </select>
                </div>

                {mode === 'sprite' && (
                    <div className="grid grid-cols-2 gap-2">
                        <div>
                            <label className="block text-zinc-400 mb-1 text-xs">{t("Columns")}</label>
                            <input 
                                type="number" 
                                value={columns} 
                                onChange={e => setColumns(Number(e.target.value))}
                                className="nodrag w-full bg-zinc-800 text-white px-2 py-1 rounded border border-zinc-600 text-xs"
                            />
                        </div>
                        <div>
                            <label className="block text-zinc-400 mb-1 text-xs">{t("Rows")}</label>
                            <input 
                                type="number" 
                                value={rows} 
                                onChange={e => setRows(Number(e.target.value))}
                                className="nodrag w-full bg-zinc-800 text-white px-2 py-1 rounded border border-zinc-600 text-xs"
                            />
                        </div>
                    </div>
                )}

                {/* Action Button */}
                <button
                    onClick={recording ? stopRecording : startRecording}
                    disabled={!inputTexture}
                    className={`nodrag w-full py-2 rounded text-sm font-medium transition-colors ${
                        recording 
                            ? 'bg-red-600 hover:bg-red-700 text-white' 
                            : 'bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50 disabled:cursor-not-allowed'
                    }`}
                >
                    {recording ? `${t("Stop")} (${Math.round(progress)}%)` : t("Start Bake")}
                </button>
            </div>

            <Handle 
                type="target" 
                position={Position.Left} 
                id="image" 
                style={{ top: '20%', background: '#6366f1' }} 
            />
        </div>
    );
});

export default BakeNode;
