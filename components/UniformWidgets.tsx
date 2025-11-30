import React, { useRef, useEffect, useState } from 'react';
import { Upload, X, Settings, MousePointer2, Scan, ChevronUp, ChevronDown } from 'lucide-react';
import { WidgetConfig } from '../types';
import { generateGradientTexture } from '../utils/textureGen';
import { useTranslation } from 'react-i18next';

// --- WIDGETS ---

export const SmartNumberInput: React.FC<{ value: number, onChange: (v: number) => void, step?: number, className?: string }> = ({ value, onChange, step = 0.01, className }) => {
    // Guard against NaN
    const safeValue = typeof value === 'number' && !isNaN(value) ? value : 0;
    
    const [isEditing, setIsEditing] = useState(false);
    const [tempValue, setTempValue] = useState("");

    // Derived state for display
    const displayValue = isEditing ? tempValue : safeValue.toString();

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value;
        setTempValue(val);
        
        if (val === '' || val === '-') return;
        
        const num = parseFloat(val);
        if (!isNaN(num)) {
            onChange(num);
        }
    };

    const updateValue = (delta: number) => {
        const current = parseFloat(displayValue) || 0;
        const next = Math.round((current + delta) * 1000) / 1000;
        onChange(next);
        if (isEditing) {
            setTempValue(next.toString());
        }
    };

    return (
        <div className={`relative group flex items-center ${className} !pr-0 overflow-hidden`}>
            <input 
                type="number" 
                step={step}
                className="w-full h-full bg-transparent border-none outline-none p-0 pl-1 pr-4 appearance-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none -moz-appearance-textfield text-inherit font-inherit"
                value={displayValue}
                onChange={handleChange}
                onFocus={() => { setIsEditing(true); setTempValue(safeValue.toString()); }}
                onBlur={() => { setIsEditing(false); }}
            />
            <div className="flex flex-col opacity-0 group-hover:opacity-100 transition-opacity absolute right-0 top-0 bottom-0 w-3 bg-zinc-800 border-l border-zinc-700 z-10">
                <button 
                    onClick={(e) => { e.stopPropagation(); updateValue(step); }} 
                    className="flex-1 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 flex items-center justify-center"
                    tabIndex={-1}
                >
                    <ChevronUp size={8} />
                </button>
                <button 
                    onClick={(e) => { e.stopPropagation(); updateValue(-step); }} 
                    className="flex-1 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 flex items-center justify-center"
                    tabIndex={-1}
                >
                    <ChevronDown size={8} />
                </button>
            </div>
        </div>
    );
};

export const SliderWidget = ({ value, onChange, min = 0, max = 1, step = 0.001 }: any) => {
    const safeValue = typeof value === 'number' && !isNaN(value) ? value : 0;
    const containerRef = useRef<HTMLDivElement>(null);

    const range = max - min;
    const toPercent = (v: number) => {
        const pct = ((v - min) / range) * 100;
        return Math.max(0, Math.min(100, pct));
    };

    const handleMouseDown = (e: React.MouseEvent) => {
        e.preventDefault();
        // We don't need startX for delta, we calculate absolute position
        
        const update = (clientX: number) => {
            if (!containerRef.current) return;
            const rect = containerRef.current.getBoundingClientRect();
            const rawPct = (clientX - rect.left) / rect.width;
            let newVal = min + rawPct * range;

            // Snap to step
            if (step > 0) {
                newVal = Math.round(newVal / step) * step;
            }
            
            // Clamp
            newVal = Math.max(min, Math.min(max, newVal));
            
            // Round to avoid float precision issues
            // Determine precision based on step (rough heuristic)
            const precision = step < 1 ? step.toString().split('.')[1]?.length || 3 : 0;
            const factor = Math.pow(10, precision);
            newVal = Math.round(newVal * factor) / factor;

            onChange(newVal);
        };

        // Initial update on click
        update(e.clientX);

        const onMove = (ev: MouseEvent) => {
            update(ev.clientX);
        };

        const onUp = () => {
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
        };

        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
    };

    return (
        <div className="flex items-center gap-2 h-5 w-full">
            <div 
                ref={containerRef}
                className="nodrag relative flex-1 h-4 flex items-center cursor-pointer group select-none"
                onMouseDown={handleMouseDown}
            >
                {/* Track */}
                <div className="absolute left-0 right-0 h-1.5 bg-zinc-700 rounded-full overflow-hidden">
                     {/* Fill */}
                     <div 
                        className="h-full bg-blue-500" 
                        style={{ width: `${toPercent(safeValue)}%` }}
                     />
                </div>

                {/* Handle */}
                <div 
                    className="absolute w-3 h-3 bg-zinc-300 rounded-full shadow border border-zinc-900 group-hover:scale-110 transition-transform"
                    style={{ left: `calc(${toPercent(safeValue)}% - 6px)` }}
                />
            </div>
            
            <SmartNumberInput 
                className="nodrag w-16 h-full bg-zinc-800 text-[10px] px-2 rounded border border-zinc-700 text-right outline-none focus-within:border-blue-500 font-mono leading-normal"
                value={Math.round(safeValue * 10000) / 10000}
                onChange={onChange}
                step={step}
            />
        </div>
    );
};

export const RangeWidget = ({ value, onChange, min = 0, max = 1, step = 0.01 }: { value: number[], onChange: (v: number[]) => void, min?: number, max?: number, step?: number }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const safeVal = Array.isArray(value) && value.length >= 2 ? value : [0, 0];
    const [valMin, valMax] = safeVal;

    // Helper: Percent to Value and Value to Percent
    const range = max - min;
    const toPercent = (v: number) => ((v - min) / range) * 100;
    
    // Mouse Interaction
    const handleMouseDown = (e: React.MouseEvent, handle: 'min' | 'max') => {
        // We still need this to prevent selecting other things, but nodrag handles the node movement.
        e.preventDefault(); 
        
        const startX = e.clientX;
        let hasMoved = false;

        const update = (clientX: number) => {
            if (!containerRef.current) return;
            const rect = containerRef.current.getBoundingClientRect();
            const rawPct = (clientX - rect.left) / rect.width;
            let newVal = min + rawPct * range;
            
            // Snap
            if (step > 0) newVal = Math.round(newVal / step) * step;
            newVal = Math.max(min, Math.min(max, newVal));

            const next = [...safeVal];
            if (handle === 'min') {
                next[0] = Math.min(newVal, safeVal[1]); // Clamp to max
            } else {
                next[1] = Math.max(newVal, safeVal[0]); // Clamp to min
            }
            // Round to avoid float errors
            next[0] = Math.round(next[0] * 1000) / 1000;
            next[1] = Math.round(next[1] * 1000) / 1000;
            
            onChange(next);
        };

        const onMove = (ev: MouseEvent) => {
             // 5px drag threshold
             if (!hasMoved && Math.abs(ev.clientX - startX) < 5) return;
             hasMoved = true;
             update(ev.clientX);
        }
        const onUp = () => {
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
        };
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
    };

    return (
        <div className="flex flex-col gap-1 w-full pt-1">
            <div className="relative h-6 flex items-center select-none group">
                <div 
                    ref={containerRef}
                    className="relative flex-1 h-1.5 bg-zinc-700 rounded-full"
                >
                    {/* Fill Bar */}
                    <div 
                        className="absolute top-0 bottom-0 bg-blue-500/50 rounded-full"
                        style={{ 
                            left: `${Math.max(0, toPercent(valMin))}%`, 
                            right: `${100 - Math.min(100, toPercent(valMax))}%` 
                        }}
                    />

                    {/* Handle Min */}
                    <div 
                        className="nodrag absolute top-1/2 -mt-2 -ml-2 w-4 h-4 bg-zinc-300 rounded-full shadow cursor-grab active:cursor-grabbing hover:scale-110 transition-transform border border-zinc-900 z-10"
                        style={{ left: `${toPercent(valMin)}%` }}
                        onMouseDown={(e) => handleMouseDown(e, 'min')}
                    />

                    {/* Handle Max */}
                    <div 
                        className="nodrag absolute top-1/2 -mt-2 -ml-2 w-4 h-4 bg-zinc-300 rounded-full shadow cursor-grab active:cursor-grabbing hover:scale-110 transition-transform border border-zinc-900 z-10"
                        style={{ left: `${toPercent(valMax)}%` }}
                        onMouseDown={(e) => handleMouseDown(e, 'max')}
                    />
                </div>
            </div>
            
            {/* Numeric Inputs */}
            <div className="flex items-center gap-1 justify-between">
                <SmartNumberInput 
                    className="nodrag w-14 h-5 bg-zinc-800 text-[9px] px-1 rounded border border-zinc-700 text-center outline-none focus-within:border-blue-500" 
                    value={valMin} 
                    onChange={val => onChange([val, valMax])} 
                    step={step}
                />
                <span className="text-[9px] text-zinc-600">-</span>
                <SmartNumberInput 
                    className="nodrag w-14 h-5 bg-zinc-800 text-[9px] px-1 rounded border border-zinc-700 text-center outline-none focus-within:border-blue-500" 
                    value={valMax} 
                    onChange={val => onChange([valMin, val])} 
                    step={step}
                />
            </div>
        </div>
    );
};

export const ColorWidget = ({ value, onChange, alpha = false }: { value: number[], onChange: (v: number[]) => void, alpha?: boolean }) => {
    // Helper to format Hex
    const toHex = (c: number) => Math.round(Math.max(0, Math.min(1, c)) * 255).toString(16).padStart(2, '0');
    const safeValue = Array.isArray(value) ? value : [0,0,0,1];
    const r = safeValue[0] || 0;
    const g = safeValue[1] || 0;
    const b = safeValue[2] || 0;
    const a = safeValue[3] !== undefined ? safeValue[3] : 1.0;

    const hex = `#${toHex(r)}${toHex(g)}${toHex(b)}`;

    const handleColorChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const h = e.target.value;
        const nr = parseInt(h.substring(1, 3), 16) / 255;
        const ng = parseInt(h.substring(3, 5), 16) / 255;
        const nb = parseInt(h.substring(5, 7), 16) / 255;
        if (alpha) onChange([nr, ng, nb, a]);
        else onChange([nr, ng, nb]);
    };

    return (
        <div className="flex flex-col gap-1 w-full">
            {/* Color Bar */}
            <div className="flex items-center gap-2 h-5">
                {alpha && <span className="text-[8px] text-zinc-500 w-4 text-right">C</span>}
                <div className="nodrag relative flex-1 h-full rounded border border-zinc-700 overflow-hidden group">
                     {/* Hidden Color Input for Picker */}
                    <input
                        type="color"
                        value={hex}
                        onChange={handleColorChange}
                        className="absolute -top-2 -left-2 w-[200%] h-[200%] cursor-pointer p-0 m-0 opacity-0"
                    />
                    <div className="w-full h-full pointer-events-none" style={{ backgroundColor: hex }} />
                </div>
                <span className="text-[8px] text-zinc-400 w-8 text-right font-mono">{hex.toUpperCase()}</span>
            </div>

            {/* Alpha Bar */}
            {alpha && (
                <div className="flex items-center gap-2 h-5">
                    <span className="text-[8px] text-zinc-500 w-4 text-right">A</span>
                    <div className="nodrag relative flex-1 h-full rounded border border-zinc-700 overflow-hidden group">
                        {/* Checkerboard Background */}
                        <div className="absolute inset-0 bg-[url('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAYAAACp8Z5+AAAAIklEQVQIW2NkQAKrVq36zwjjgzjwqonyABJIzjg///8EMQAfHBizOxyt8AAAAABJRU5ErkJggg==')] opacity-50" />
                        
                        {/* Gradient Overlay */}
                        <div className="absolute inset-0 pointer-events-none" style={{
                            background: `linear-gradient(to right, rgba(${r*255},${g*255},${b*255},0), rgba(${r*255},${g*255},${b*255},1))`
                        }} />

                        {/* Range Input */}
                        <input 
                            type="range" 
                            min={0} 
                            max={1} 
                            step={0.001}
                            value={a}
                            onChange={(e) => onChange([r, g, b, parseFloat(e.target.value)])}
                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                        />

                        {/* Custom Thumb Indicator (Visual Only) */}
                        <div className="absolute top-0 bottom-0 w-0.5 bg-white border-x border-black/20 shadow-sm pointer-events-none z-20"
                             style={{ left: `${a * 100}%` }}
                        />
                    </div>
                    <SmartNumberInput 
                        className="nodrag w-8 h-full bg-zinc-800 text-[8px] px-1 rounded border border-zinc-700 text-right outline-none focus-within:border-blue-500 font-mono leading-normal"
                        value={a}
                        onChange={(val) => onChange([r, g, b, Math.max(0, Math.min(1, val))])}
                        step={0.01}
                    />
                </div>
            )}
        </div>
    );
};

export const PadWidget = ({ value, onChange, minX = 0, maxX = 1, minY = 0, maxY = 1 }: { value: number[], onChange: (v: number[]) => void, minX?: number, maxX?: number, minY?: number, maxY?: number }) => {
    const containerRef = useRef<HTMLDivElement>(null);

    const rangeX = maxX - minX;
    const rangeY = maxY - minY;

    const update = (clientX: number, clientY: number, rect: DOMRect) => {
        const pctX = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
        const pctY = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));
        
        const valX = minX + pctX * rangeX;
        const valY = minY + (1.0 - pctY) * rangeY;

        onChange([parseFloat(valX.toFixed(2)), parseFloat(valY.toFixed(2))]);
    };

    const handleMouseDown = (e: React.MouseEvent) => {
        e.preventDefault(); 
        if (!containerRef.current) return;
        const rect = containerRef.current.getBoundingClientRect();
        update(e.clientX, e.clientY, rect);

        const onMove = (ev: MouseEvent) => update(ev.clientX, ev.clientY, rect);
        const onUp = () => {
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
        };
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
    };

    const v = Array.isArray(value) && value.length >= 2 ? value : [0, 0];
    
    // Calculate visual position
    const posX = (v[0] - minX) / (rangeX || 1);
    const posY = (v[1] - minY) / (rangeY || 1);
    
    const clampedX = Math.max(0, Math.min(1, posX));
    const clampedY = Math.max(0, Math.min(1, posY));

    return (
        <div className="flex gap-2 w-full pt-1">
            <div 
                ref={containerRef}
                className="nodrag relative w-12 h-12 bg-zinc-900 border border-zinc-700 rounded cursor-crosshair shrink-0"
                onMouseDown={handleMouseDown}
            >
                <div className="absolute top-0 bottom-0 left-1/2 w-px bg-zinc-800 pointer-events-none"></div>
                <div className="absolute left-0 right-0 top-1/2 h-px bg-zinc-800 pointer-events-none"></div>
                <div 
                    className="absolute w-2 h-2 bg-blue-500 rounded-full border border-white/30 -ml-1 -mt-1 pointer-events-none shadow-sm transition-transform"
                    style={{ left: `${clampedX * 100}%`, top: `${(1.0 - clampedY) * 100}%` }}
                />
            </div>
            <div className="flex flex-col gap-1 flex-1 min-w-0 justify-center">
                 <div className="flex items-center gap-1">
                    <span className="text-[8px] text-zinc-500 w-2">X</span>
                    <SmartNumberInput 
                        step={0.01} 
                        className="nodrag w-full h-5 bg-zinc-800 text-[9px] px-1 rounded border border-zinc-700" 
                        value={v[0]} 
                        onChange={(val) => onChange([val, v[1]])} 
                    />
                 </div>
                 <div className="flex items-center gap-1">
                    <span className="text-[8px] text-zinc-500 w-2">Y</span>
                    <SmartNumberInput 
                        step={0.01} 
                        className="nodrag w-full h-5 bg-zinc-800 text-[9px] px-1 rounded border border-zinc-700" 
                        value={v[1]} 
                        onChange={(val) => onChange([v[0], val])} 
                    />
                 </div>
            </div>
        </div>
    );
};

// --- ROBUST CLOSURE-STATE DRAGGING WIDGETS ---

export const GradientWidget = ({ config, onChangeValue, onConfigChange }: { 
    config: WidgetConfig, 
    onChangeValue: (dataUrl: string | null) => void,
    onConfigChange: (cfg: WidgetConfig) => void 
}) => {
    const { t } = useTranslation();
    const containerRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);

    // Ensure we have stops. 
    const colorStops = config.gradientStops || [{ pos: 0, color: '#000000' }, { pos: 1, color: '#ffffff' }];
    const alphaStops = config.alphaStops || [{ pos: 0, value: 1 }, { pos: 1, value: 1 }];

    // Selection State
    const [selected, setSelected] = useState<{ type: 'color'|'alpha', index: number } | null>(null);

    // Helper to broadcast updates
    const update = (newColorStops: typeof colorStops, newAlphaStops: typeof alphaStops) => {
        onConfigChange({ 
            ...config, 
            gradientStops: newColorStops,
            alphaStops: newAlphaStops
        });
    };

    // Render Preview Canvas
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        
        const w = canvas.width;
        const h = canvas.height;

        // 1. Clear
        ctx.clearRect(0, 0, w, h);

        // 2. Checkerboard BG
        const size = 4;
        for(let y=0; y<h; y+=size) {
            for(let x=0; x<w; x+=size) {
                if ((x/size + y/size) % 2 === 0) {
                    ctx.fillStyle = '#333';
                } else {
                    ctx.fillStyle = '#444';
                }
                ctx.fillRect(x, y, size, size);
            }
        }

        // 3. Draw
        const raw = generateGradientTexture(colorStops, w, alphaStops);
        const idata = new ImageData(raw.data as any, w, 1);
        
        createImageBitmap(idata).then(bmp => {
            ctx.drawImage(bmp, 0, 0, w, h);
            bmp.close();
        });

    }, [colorStops, alphaStops]);

    // Initial clear
    useEffect(() => {
        const t = setTimeout(() => { if (onChangeValue) onChangeValue(null); }, 50);
        return () => clearTimeout(t);
    }, []);

    const onMouseDown = (e: React.MouseEvent) => {
        if (!containerRef.current) return;

        const rect = containerRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const normX = Math.max(0, Math.min(1, x / rect.width));

        // Define Hit Zones
        const trackHeight = 20;
        const isAlphaZone = y < trackHeight;
        const isColorZone = y > rect.height - trackHeight;

        // Hit Testing Handles
        // We use a larger threshold for easier grabbing
        const hitThreshold = 14; 

        // Check Alpha Handles (Top)
        let hitAlphaIdx = alphaStops.findIndex(s => Math.abs((s.pos * rect.width) - x) < hitThreshold);
        // Only select if we clicked in or near top, OR strictly on a top handle
        if (hitAlphaIdx !== -1 && y > trackHeight + 10) hitAlphaIdx = -1; 

        // Check Color Handles (Bottom)
        let hitColorIdx = colorStops.findIndex(s => Math.abs((s.pos * rect.width) - x) < hitThreshold);
        if (hitColorIdx !== -1 && y < rect.height - (trackHeight + 10)) hitColorIdx = -1;

        // Logic:
        // 1. If Handle Clicked -> STOP Propagation, Drag Handle
        // 2. If Empty Track Clicked -> STOP Propagation, Add Handle
        // 3. If Middle (Preview) Clicked -> ALLOW Propagation, Drag Node

        const hitHandle = hitAlphaIdx !== -1 || hitColorIdx !== -1;
        const hitTrack = isAlphaZone || isColorZone;

        if (!hitHandle && !hitTrack) {
            // Middle Click -> Deselect and allow node drag
            setSelected(null);
            return;
        }

        // We are interacting with widget
        e.preventDefault();

        let sessionColor = [...colorStops];
        let sessionAlpha = [...alphaStops];
        let activeType: 'color'|'alpha'|null = null;
        let activeIdx = -1;

        if (hitAlphaIdx !== -1) {
            activeType = 'alpha';
            activeIdx = hitAlphaIdx;
            setSelected({ type: 'alpha', index: activeIdx });
        } else if (hitColorIdx !== -1) {
            activeType = 'color';
            activeIdx = hitColorIdx;
            setSelected({ type: 'color', index: activeIdx });
        } else {
            // Add New Stop
            if (isAlphaZone) {
                sessionAlpha.push({ pos: normX, value: 1.0 });
                activeType = 'alpha';
                activeIdx = sessionAlpha.length - 1;
                setSelected({ type: 'alpha', index: activeIdx });
                update(sessionColor, sessionAlpha);
            } else if (isColorZone) {
                sessionColor.push({ pos: normX, color: '#ffffff' });
                activeType = 'color';
                activeIdx = sessionColor.length - 1;
                setSelected({ type: 'color', index: activeIdx });
                update(sessionColor, sessionAlpha);
            }
        }
        
        const startX = e.clientX;
        let hasMoved = false;

        const onMove = (ev: MouseEvent) => {
            if (activeIdx === -1 || !activeType) return;
            
            // Drag Threshold
            if (!hasMoved && Math.abs(ev.clientX - startX) < 5) return;
            hasMoved = true;

            const moveRect = containerRef.current?.getBoundingClientRect();
            if (!moveRect) return;
            
            let newPos = (ev.clientX - moveRect.left) / moveRect.width;
            newPos = Math.max(0, Math.min(1, newPos));

            if (activeType === 'color') {
                if (sessionColor[activeIdx]) {
                    sessionColor[activeIdx] = { ...sessionColor[activeIdx], pos: newPos };
                    update([...sessionColor], sessionAlpha);
                }
            } else {
                 if (sessionAlpha[activeIdx]) {
                    sessionAlpha[activeIdx] = { ...sessionAlpha[activeIdx], pos: newPos };
                    update(sessionColor, [...sessionAlpha]);
                }
            }
        };

        const onUp = () => {
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
        };
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
    };

    const deleteSelected = (e?: React.MouseEvent) => {
        if (e) e.stopPropagation();
        if (!selected) return;
        if (selected.type === 'color') {
            if (colorStops.length <= 1) return; 
            const next = colorStops.filter((_, i) => i !== selected.index);
            update(next, alphaStops);
            setSelected(null);
        } else {
            if (alphaStops.length <= 1) return;
            const next = alphaStops.filter((_, i) => i !== selected.index);
            update(colorStops, next);
            setSelected(null);
        }
    };

    return (
        <div className="flex flex-col gap-2 w-full pt-1 pb-2">
            
            {/* Main Editor Area */}
            <div 
                ref={containerRef}
                className="nodrag relative h-14 w-full cursor-crosshair select-none group"
                onMouseDown={onMouseDown}
            >
                {/* Top Track (Alpha) - Has NODRAG to prevent Node Dragging */}
                <div className="absolute top-0 left-0 right-0 h-5 z-10 nodrag">
                    {alphaStops.map((s, i) => (
                        <div 
                            key={`a-${i}`}
                            className={`absolute top-0 w-4 h-4 -ml-2 cursor-grab active:cursor-grabbing flex items-center justify-center
                                ${selected?.type === 'alpha' && selected.index === i ? 'z-50' : 'z-20'}
                            `}
                            style={{ left: `${s.pos * 100}%` }}
                            onDoubleClick={deleteSelected}
                        >
                            {/* Visual: Pentagon Pointing Down */}
                            <div className={`w-3 h-3 border border-zinc-900 shadow-sm transform rotate-45 mb-1.5
                                ${selected?.type === 'alpha' && selected.index === i ? 'ring-2 ring-blue-500 scale-110' : 'hover:scale-110'}
                            `} 
                            style={{ 
                                backgroundColor: `rgb(${Math.round(s.value*255)},${Math.round(s.value*255)},${Math.round(s.value*255)})` 
                            }} 
                            />
                        </div>
                    ))}
                </div>

                {/* Middle Preview (Dead Zone for Widget, Live Zone for Node Drag) */}
                {/* IMPORTANT: This does NOT have 'nodrag', so users can drag the node by grabbing this area */}
                <div className="absolute top-4 bottom-4 left-0 right-0 border border-zinc-700 rounded-sm overflow-hidden cursor-default">
                    <canvas ref={canvasRef} width={256} height={24} className="w-full h-full block" />
                </div>

                {/* Bottom Track (Color) - Has NODRAG to prevent Node Dragging */}
                <div className="absolute bottom-0 left-0 right-0 h-5 z-10 nodrag">
                     {colorStops.map((s, i) => (
                        <div 
                            key={`c-${i}`}
                            className={`absolute bottom-0 w-4 h-4 -ml-2 cursor-grab active:cursor-grabbing flex items-center justify-center
                                ${selected?.type === 'color' && selected.index === i ? 'z-50' : 'z-20'}
                            `}
                            style={{ left: `${s.pos * 100}%` }}
                            onDoubleClick={deleteSelected}
                        >
                            {/* Visual: Pentagon Pointing Up */}
                            <div className={`w-3 h-3 border border-zinc-900 shadow-sm transform rotate-45 mt-1.5
                                ${selected?.type === 'color' && selected.index === i ? 'ring-2 ring-blue-500 scale-110' : 'hover:scale-110'}
                            `} 
                            style={{ backgroundColor: s.color.substring(0, 7) }} 
                            />
                        </div>
                    ))}
                </div>
            </div>

            {/* Selected Node Controls */}
            {selected && (
                <div className="nodrag flex items-center gap-2 bg-zinc-900 p-1.5 rounded border border-zinc-800 animate-in slide-in-from-top-1 w-full overflow-hidden">
                    <span className="text-[9px] text-zinc-500 font-bold uppercase w-8 inline-block text-center flex-shrink-0">
                        {selected.type === 'color' ? t('RGB') : t('Alpha')}
                    </span>
                    
                    {/* Value Control */}
                    <div className="flex-1 min-w-0 overflow-hidden">
                        {selected.type === 'color' ? (
                            (() => {
                                const stop = colorStops[selected.index];
                                if (!stop) return null;
                                return (
                                    <div className="flex gap-1 items-center h-5 w-full">
                                        <div className="flex-1 min-w-0">
                                            <ColorWidget 
                                                value={(function() {
                                                    // Parse hex to RGB array
                                                    const hex = stop.color;
                                                    const r = parseInt(hex.slice(1, 3), 16) / 255;
                                                    const g = parseInt(hex.slice(3, 5), 16) / 255;
                                                    const b = parseInt(hex.slice(5, 7), 16) / 255;
                                                    return [r,g,b];
                                                })()} 
                                                onChange={(v) => {
                                                    const hex = `#${Math.round(v[0]*255).toString(16).padStart(2,'0')}${Math.round(v[1]*255).toString(16).padStart(2,'0')}${Math.round(v[2]*255).toString(16).padStart(2,'0')}`;
                                                    const next = [...colorStops];
                                                    if (next[selected.index]) {
                                                        next[selected.index] = { ...next[selected.index], color: hex };
                                                        update(next, alphaStops);
                                                    }
                                                }} 
                                                alpha={false} 
                                            />
                                        </div>
                                        <div className="w-6 flex-shrink-0" />
                                    </div>
                                );
                            })()
                        ) : (
                            (() => {
                                const stop = alphaStops[selected.index];
                                if (!stop) return null;
                                return (
                                    <div className="flex gap-1 items-center h-5 w-full">
                                        <div className="flex-1 min-w-0 flex items-center relative">
                                            <input 
                                                type="range" min={0} max={1} step={0.001}
                                                className="nodrag absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10 m-0 p-0"
                                                value={stop.value}
                                                onChange={(e) => {
                                                    const next = [...alphaStops];
                                                    if (next[selected.index]) {
                                                        next[selected.index] = { ...next[selected.index], value: parseFloat(e.target.value) };
                                                        update(colorStops, next);
                                                    }
                                                }}
                                            />
                                            <div className="w-full h-1.5 bg-zinc-700 rounded-lg overflow-hidden">
                                                <div className="h-full bg-zinc-400" style={{ width: `${stop.value * 100}%` }} />
                                            </div>
                                        </div>
                                        <span className="text-[9px] text-zinc-400 w-6 text-right flex-shrink-0 truncate font-mono">{stop.value.toFixed(2)}</span>
                                    </div>
                                );
                            })()
                        )}
                    </div>

                    {/* Delete Button */}
                    <button 
                        onClick={deleteSelected}
                        className="p-1 hover:bg-red-900/50 text-zinc-500 hover:text-red-400 rounded"
                        title={t('Delete Stop')}
                    >
                        <X size={12} />
                    </button>
                </div>
            )}
            
            {!selected && (
                <div className="text-[9px] text-zinc-600 text-center italic pt-1">
                    Double-click point to delete
                </div>
            )}
        </div>
    );
};

export const CurveEditor = ({ config, onChangeValue, onConfigChange }: { 
    config: WidgetConfig, 
    onChangeValue: (dataUrl: string | null) => void,
    onConfigChange: (cfg: WidgetConfig) => void 
}) => {
    const points = config.curvePoints || [{ x: 0, y: 0 }, { x: 1, y: 1 }];
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [hoverIndex, setHoverIndex] = useState<number>(-1);

    const update = (newPoints: typeof points) => {
        onConfigChange({ ...config, curvePoints: newPoints });
    };

    useEffect(() => {
        const t = setTimeout(() => {
            if (onChangeValue) onChangeValue(null);
        }, 50);
        return () => clearTimeout(t);
    }, []);

    // Calculate mouse position normalized 0-1
    const getPos = (e: React.MouseEvent | MouseEvent, rect: DOMRect) => ({
        x: Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)),
        y: 1.0 - Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height))
    });

    const onMouseDown = (e: React.MouseEvent) => {
        if (!containerRef.current) return;
        const rect = containerRef.current.getBoundingClientRect();
        const { x, y } = getPos(e, rect);
        
        const hitThresholdX = 15 / rect.width;
        const hitThresholdY = 15 / rect.height;
        
        const existingIndex = points.findIndex(p => 
            Math.abs(p.x - x) < hitThresholdX && Math.abs(p.y - y) < hitThresholdY
        );

        e.preventDefault();
        
        let sessionPoints = [...points];
        let activeIndex = -1;

        // Right Click / Alt Click = Delete
        if (existingIndex !== -1 && (e.button === 2 || e.altKey)) {
             if (sessionPoints.length > 2) {
                 sessionPoints.splice(existingIndex, 1);
                 update(sessionPoints);
                 setHoverIndex(-1);
             }
             return;
        }

        if (existingIndex !== -1) {
            activeIndex = existingIndex;
        } else {
            // Add new point
            sessionPoints.push({ x, y });
            activeIndex = sessionPoints.length - 1;
            update(sessionPoints);
        }

        const startX = e.clientX;
        const startY = e.clientY;
        let hasMoved = false;

        const onMove = (moveE: MouseEvent) => {
            if (activeIndex === -1) return;
            
            // Drag Threshold
            if (!hasMoved && Math.hypot(moveE.clientX - startX, moveE.clientY - startY) < 5) return;
            hasMoved = true;

            const moveRect = containerRef.current?.getBoundingClientRect();
            if (!moveRect) return;
            
            const p = getPos(moveE, moveRect);
            sessionPoints[activeIndex] = { x: p.x, y: p.y };
            update([...sessionPoints]);
        };

        const onUp = () => {
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
        };

        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
    };

    const onDoubleClick = (e: React.MouseEvent) => {
        if (!containerRef.current) return;
        const rect = containerRef.current.getBoundingClientRect();
        const { x, y } = getPos(e, rect);
        
        const hitThresholdX = 15 / rect.width;
        const hitThresholdY = 15 / rect.height;
        
        const existingIndex = points.findIndex(p => 
            Math.abs(p.x - x) < hitThresholdX && Math.abs(p.y - y) < hitThresholdY
        );

        if (existingIndex !== -1 && points.length > 2) {
            const newPoints = points.filter((_, i) => i !== existingIndex);
            update(newPoints);
            setHoverIndex(-1);
        }
    };

    const onMouseMove = (e: React.MouseEvent) => {
         if (!containerRef.current) return;
         const rect = containerRef.current.getBoundingClientRect();
         const { x, y } = getPos(e, rect);
         const hitThresholdX = 15 / rect.width;
         const hitThresholdY = 15 / rect.height;
         
         const idx = points.findIndex(p => 
            Math.abs(p.x - x) < hitThresholdX && Math.abs(p.y - y) < hitThresholdY
         );
         setHoverIndex(idx);
    };

    // Visual Render Loop
    useEffect(() => {
        const cvs = canvasRef.current;
        if (!cvs) return;
        const ctx = cvs.getContext('2d');
        if (!ctx) return;

        const w = cvs.width;
        const h = cvs.height;

        ctx.clearRect(0, 0, w, h);
        
        // Grid
        ctx.strokeStyle = '#333';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, h/2); ctx.lineTo(w, h/2);
        ctx.moveTo(w/2, 0); ctx.lineTo(w/2, h);
        ctx.stroke();

        // Draw Curve
        const sorted = [...points].sort((a, b) => a.x - b.x);
        
        ctx.strokeStyle = '#3b82f6';
        ctx.lineWidth = 2;
        ctx.beginPath();
        
        if (sorted.length > 0) {
            ctx.moveTo(0, h - sorted[0].y * h);
            sorted.forEach(p => {
                ctx.lineTo(p.x * w, h - p.y * h);
            });
            const last = sorted[sorted.length - 1];
            ctx.lineTo(w, h - last.y * h);
        }
        ctx.stroke();

        // Draw Points
        points.forEach((p, i) => {
            const isHover = i === hoverIndex;
            const r = isHover ? 6 : 4;
            
            ctx.fillStyle = isHover ? '#60a5fa' : '#fff';
            ctx.beginPath();
            ctx.arc(p.x * w, h - p.y * h, r, 0, Math.PI * 2);
            ctx.fill();
            
            ctx.strokeStyle = isHover ? '#fff' : '#000';
            ctx.lineWidth = isHover ? 2 : 1;
            ctx.stroke();
        });

    }, [points, hoverIndex]);

    return (
        <div 
            ref={containerRef}
            className="nodrag w-full h-24 bg-zinc-900 border border-zinc-700 rounded cursor-crosshair relative group select-none"
            onMouseDown={onMouseDown}
            onMouseMove={onMouseMove}
            onDoubleClick={onDoubleClick}
            onMouseLeave={() => setHoverIndex(-1)}
            onContextMenu={(e) => { e.preventDefault(); }}
        >
             <canvas ref={canvasRef} width={250} height={100} className="w-full h-full block pointer-events-none" />
             <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 text-[8px] bg-black/50 px-1 rounded pointer-events-none text-zinc-400 border border-zinc-800">
                 Double-click to Del
             </div>
        </div>
    );
};

export const ImageUploadWidget = ({ value, onChange }: any) => {
    const [dimensions, setDimensions] = useState<{w: number, h: number} | null>(null);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (event) => {
                if(event.target?.result) onChange(event.target.result);
            };
            reader.readAsDataURL(file);
        }
    };

    const applySize = (e: React.MouseEvent) => {
        if(dimensions) {
             const event = new CustomEvent('GLSL_SET_CANVAS_SIZE', { 
                detail: { w: dimensions.w, h: dimensions.h } 
             });
             window.dispatchEvent(event);
        }
    };
    
    return (
        <div className="flex flex-col gap-1 w-full">
            {value && typeof value === 'string' && (
                <div className="relative w-full h-16 bg-black/50 rounded overflow-hidden border border-zinc-700 group flex items-center justify-center">
                    <img 
                        src={value} 
                        className="max-w-full max-h-full object-contain" 
                        alt="Texture" 
                        onLoad={(e) => setDimensions({w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight})}
                    />
                    {dimensions && (
                        <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity">
                             <button 
                                onClick={applySize}
                                className="bg-black/60 hover:bg-blue-600 text-white p-1 rounded border border-white/20 shadow-sm backdrop-blur-sm flex items-center gap-1 text-[8px]"
                                title={`Set Canvas to ${dimensions.w}x${dimensions.h}`}
                             >
                                <Scan size={10} />
                                <span>{dimensions.w}x{dimensions.h}</span>
                             </button>
                        </div>
                    )}
                </div>
            )}
            <label className="nodrag flex items-center justify-center w-full h-5 px-2 bg-zinc-800 border border-zinc-700 border-dashed rounded cursor-pointer hover:border-zinc-500 hover:bg-zinc-700 transition-colors">
                <span className="flex items-center gap-1">
                    <Upload size={10} className="text-zinc-400" />
                    <span className="text-[9px] text-zinc-400">Load Image</span>
                </span>
                <input type="file" className="nodrag hidden" accept="image/*" onChange={handleFileChange} />
            </label>
        </div>
    );
};
