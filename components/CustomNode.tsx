import React, { useState, useCallback, memo, useMemo, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Handle, Position, NodeProps, useReactFlow, useEdges, useStore } from 'reactflow';
import { NodeData, GLSLType, UniformVal, NodeOutput, NodeInput, WidgetMode, WidgetConfig, NodeCategory } from '../types';
import { Code, X, Settings2, Eye, AlertTriangle, ChevronDown, Settings, Download, Edit2, Plus, Trash2, CheckSquare, Square, EyeOff, Maximize2, Minimize2, Save, LogIn, MoreVertical } from 'lucide-react';
import { SliderWidget, ColorWidget, GradientWidget, CurveEditor, PadWidget, RangeWidget, SmartNumberInput } from './UniformWidgets';
import { TYPE_COLORS } from '../constants';
import CodeEditor from './CodeEditor'; 
import { assetManager } from '../utils/assetManager';
import { Upload, Scan } from 'lucide-react';
import { extractShaderIO } from '../utils/glslParser';
import { useTranslation } from 'react-i18next';
import { useNodeTranslation } from '../hooks/useNodeTranslation';
import { getNodeDefinition } from '../nodes/registry';
import { useProject } from '../context/ProjectContext';

// --- NODE EDITOR MODAL ---
const NodeEditorModal = ({ data, onSave, onClose }: { data: NodeData, onSave: (newData: Partial<NodeData>) => void, onClose: () => void }) => {
    const { t } = useTranslation();
    const [localData, setLocalData] = useState(data);
    const [activeTab, setActiveTab] = useState<'general' | 'io' | 'locales'>('general');
    
    // Locales State
    const [selectedLang, setSelectedLang] = useState<string | null>(null);
    const [newLangCode, setNewLangCode] = useState('');
    const [editingVisibility, setEditingVisibility] = useState<number | null>(null);

    const updateVisibleIf = (inputIndex: number, enabled: boolean, targetUniform?: string, mode?: 'equals' | 'notEquals', value?: number) => {
        const inp = localData.inputs[inputIndex];
        const currentUniform = localData.uniforms[inp.id] || { type: inp.type, value: 0 };
        
        const newUniforms = { ...localData.uniforms };
        const currentConfig = currentUniform.widgetConfig || {};

        if (!enabled) {
            const newConfig = { ...currentConfig };
            delete newConfig.visibleIf;
            newUniforms[inp.id] = { ...currentUniform, widgetConfig: newConfig };
        } else {
            if (!targetUniform) return;
            
            const condition = mode === 'notEquals' 
                ? { notValue: value, value: undefined } 
                : { value: value, notValue: undefined };

            // Clean undefineds
            if (condition.value === undefined) delete condition.value;
            if (condition.notValue === undefined) delete condition.notValue;

            newUniforms[inp.id] = {
                ...currentUniform,
                widgetConfig: {
                    ...currentConfig,
                    visibleIf: {
                        uniform: targetUniform,
                        ...condition
                    }
                }
            };
        }
        setLocalData({ ...localData, uniforms: newUniforms });
    };

    // Extract all translatable keys
    const translatableKeys = useMemo(() => {
        const keys = new Set<string>();
        if (localData.label) keys.add(localData.label);
        localData.inputs.forEach(i => keys.add(i.name));
        localData.outputs.forEach(o => keys.add(o.name));
        return Array.from(keys);
    }, [localData.label, localData.inputs, localData.outputs]);

    // Initialize selectedLang if locales exist
    useEffect(() => {
        if (!selectedLang && localData.locales && Object.keys(localData.locales).length > 0) {
            setSelectedLang(Object.keys(localData.locales)[0]);
        }
    }, []);

    const handleSave = () => {
        onSave(localData);
        onClose();
    };

    const updateInputName = (idx: number, name: string) => {
        const newInputs = [...localData.inputs];
        newInputs[idx] = { ...newInputs[idx], name };
        setLocalData({ ...localData, inputs: newInputs });
    };

    const updateOutputName = (idx: number, name: string) => {
        const newOutputs = [...localData.outputs];
        newOutputs[idx] = { ...newOutputs[idx], name };
        setLocalData({ ...localData, outputs: newOutputs });
    };

    const handleAddLang = () => {
        if (!newLangCode) return;
        const code = newLangCode.trim();
        if (!code) return;
        
        setLocalData(prev => ({
            ...prev,
            locales: {
                ...prev.locales,
                [code]: prev.locales?.[code] || {}
            }
        }));
        setSelectedLang(code);
        setNewLangCode('');
    };

    const handleRemoveLang = (lang: string) => {
        if (!confirm(t("Delete locale '{{lang}}'?", { lang }))) return;
        const next = { ...localData.locales };
        delete next[lang];
        setLocalData({ ...localData, locales: next });
        if (selectedLang === lang) setSelectedLang(null);
    };

    const handleUpdateTranslation = (lang: string, key: string, value: string) => {
        setLocalData(prev => ({
            ...prev,
            locales: {
                ...prev.locales,
                [lang]: {
                    ...prev.locales?.[lang],
                    [key]: value
                }
            }
        }));
    };

    return createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-8" onClick={onClose}>
            <div className="w-full max-w-2xl bg-zinc-900 border border-zinc-700 rounded-lg shadow-2xl flex flex-col overflow-hidden max-h-[80vh]" onClick={e => e.stopPropagation()}>
                <div className="h-12 border-b border-zinc-800 flex items-center justify-between px-4 bg-zinc-950 select-none">
                    <div className="flex items-center gap-2">
                        <Settings2 size={18} className="text-blue-400" />
                        <span className="font-bold text-zinc-200">{t("Edit Node Metadata")}</span>
                    </div>
                    <button onClick={onClose} className="p-1 hover:bg-zinc-800 text-zinc-400 hover:text-white rounded"><X size={18} /></button>
                </div>
                
                <div className="flex border-b border-zinc-800 bg-zinc-900">
                    {(['general', 'io', 'locales'] as const).map(tab => (
                        <button 
                            key={tab}
                            onClick={() => setActiveTab(tab)}
                            className={`px-4 py-2 text-xs font-bold uppercase tracking-wide border-b-2 transition-colors ${activeTab === tab ? 'border-blue-500 text-blue-400 bg-zinc-800/50' : 'border-transparent text-zinc-500 hover:text-zinc-300'}`}
                        >
                            {tab === 'io' ? t('Inputs / Outputs') : t(tab.charAt(0).toUpperCase() + tab.slice(1))}
                        </button>
                    ))}
                </div>

                <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                    {activeTab === 'general' && (
                        <div className="flex flex-col gap-4">
                            <div className="flex flex-col gap-1">
                                <label className="text-xs font-bold text-zinc-500 uppercase">{t("Label")}</label>
                                <input 
                                    className="bg-zinc-950 border border-zinc-700 rounded p-2 text-sm text-zinc-200 outline-none focus:border-blue-500"
                                    value={localData.label}
                                    onChange={e => setLocalData({ ...localData, label: e.target.value })}
                                />
                            </div>
                            <div className="flex flex-col gap-1">
                                <label className="text-xs font-bold text-zinc-500 uppercase">{t("Category")}</label>
                                <select 
                                    className="bg-zinc-950 border border-zinc-700 rounded p-2 text-sm text-zinc-200 outline-none focus:border-blue-500"
                                    value={localData.category || 'Custom'}
                                    onChange={e => setLocalData({ ...localData, category: e.target.value as NodeCategory })}
                                >
                                    {['Source', 'Filter', 'Math', 'Custom', 'Network', 'Output'].map(c => (
                                        <option key={c} value={c}>{t(c)}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="flex flex-col gap-1">
                                <label className="text-xs font-bold text-zinc-500 uppercase">{t("Description")}</label>
                                <textarea 
                                    className="bg-zinc-950 border border-zinc-700 rounded p-2 text-sm text-zinc-200 outline-none focus:border-blue-500 min-h-[100px]"
                                    value={localData.description || ''}
                                    onChange={e => setLocalData({ ...localData, description: e.target.value })}
                                />
                            </div>
                        </div>
                    )}

                    {activeTab === 'io' && (
                        <div className="flex flex-col gap-6">
                            <div className="flex flex-col gap-2">
                                <h3 className="text-xs font-bold text-zinc-500 uppercase border-b border-zinc-800 pb-1">{t("Inputs")}</h3>
                                {localData.inputs.map((inp, idx) => {
                                    const uniform = localData.uniforms[inp.id];
                                    const visibleIf = uniform?.widgetConfig?.visibleIf;
                                    const isEditing = editingVisibility === idx;

                                    return (
                                        <div key={idx} className="flex flex-col gap-1 bg-zinc-900/30 p-1 rounded border border-transparent hover:border-zinc-800 transition-colors">
                                            <div className="flex items-center gap-2">
                                                <span className="text-[10px] font-mono text-zinc-500 w-8">{inp.type}</span>
                                                <input 
                                                    className="flex-1 bg-zinc-950 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-200 outline-none focus:border-blue-500"
                                                    value={inp.name}
                                                    onChange={e => updateInputName(idx, e.target.value)}
                                                />
                                                <span className="text-[10px] font-mono text-zinc-600">{inp.id}</span>
                                                <button 
                                                    onClick={() => setEditingVisibility(isEditing ? null : idx)}
                                                    className={`p-1 rounded hover:bg-zinc-800 transition-colors ${visibleIf ? 'text-blue-400 bg-blue-900/20' : 'text-zinc-600 hover:text-zinc-400'}`}
                                                    title={t("Conditional Visibility")}
                                                >
                                                    <Eye size={14} />
                                                </button>
                                            </div>
                                            
                                            {isEditing && (
                                                <div className="ml-8 p-2 bg-zinc-950 border border-zinc-800 rounded flex flex-col gap-2 animate-in slide-in-from-top-1">
                                                    <div className="flex items-center gap-2">
                                                        <input 
                                                            type="checkbox" 
                                                            checked={!!visibleIf}
                                                            onChange={(e) => {
                                                                if (e.target.checked) {
                                                                    const other = localData.inputs.find(i => i.id !== inp.id);
                                                                    if (other) updateVisibleIf(idx, true, other.id, 'equals', 1);
                                                                } else {
                                                                    updateVisibleIf(idx, false);
                                                                }
                                                            }}
                                                            className="rounded border-zinc-700 bg-zinc-900 text-blue-600 focus:ring-0 focus:ring-offset-0 w-3 h-3"
                                                        />
                                                        <span className="text-[10px] font-bold text-zinc-400 uppercase">{t("Conditional Visibility")}</span>
                                                    </div>
                                                    
                                                    {visibleIf && (
                                                        <div className="grid grid-cols-[auto_1fr] gap-2 items-center pl-5">
                                                            <span className="text-[10px] text-zinc-500 uppercase text-right">{t("Depends On")}</span>
                                                            <select 
                                                                className="bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-200 outline-none focus:border-blue-500"
                                                                value={visibleIf.uniform}
                                                                onChange={(e) => updateVisibleIf(idx, true, e.target.value, visibleIf.notValue !== undefined ? 'notEquals' : 'equals', visibleIf.notValue ?? visibleIf.value)}
                                                            >
                                                                {localData.inputs.filter(i => i.id !== inp.id).map(i => (
                                                                    <option key={i.id} value={i.id}>{i.name} ({i.id})</option>
                                                                ))}
                                                            </select>

                                                            <span className="text-[10px] text-zinc-500 uppercase text-right">{t("Condition")}</span>
                                                            <div className="flex gap-2">
                                                                <select 
                                                                    className="bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-200 outline-none focus:border-blue-500"
                                                                    value={visibleIf.notValue !== undefined ? 'notEquals' : 'equals'}
                                                                    onChange={(e) => updateVisibleIf(idx, true, visibleIf.uniform, e.target.value as any, visibleIf.notValue ?? visibleIf.value)}
                                                                >
                                                                    <option value="equals">{t("Equals (=)")}</option>
                                                                    <option value="notEquals">{t("Not Equals (!=)")}</option>
                                                                </select>
                                                                <input 
                                                                    type="number"
                                                                    className="w-20 bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-200 outline-none focus:border-blue-500"
                                                                    value={visibleIf.notValue ?? visibleIf.value ?? 0}
                                                                    onChange={(e) => updateVisibleIf(idx, true, visibleIf.uniform, visibleIf.notValue !== undefined ? 'notEquals' : 'equals', parseFloat(e.target.value))}
                                                                />
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                                {localData.inputs.length === 0 && <span className="text-xs text-zinc-600 italic">{t("No inputs")}</span>}
                            </div>

                            <div className="flex flex-col gap-2">
                                <h3 className="text-xs font-bold text-zinc-500 uppercase border-b border-zinc-800 pb-1">{t("Outputs")}</h3>
                                {localData.outputs.map((out, idx) => (
                                    <div key={idx} className="flex items-center gap-2">
                                        <span className="text-[10px] font-mono text-zinc-500 w-8">{out.type}</span>
                                        <input 
                                            className="flex-1 bg-zinc-950 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-200 outline-none focus:border-blue-500"
                                            value={out.name}
                                            onChange={e => updateOutputName(idx, e.target.value)}
                                        />
                                        <span className="text-[10px] font-mono text-zinc-600">{out.id}</span>
                                    </div>
                                ))}
                                {localData.outputs.length === 0 && <span className="text-xs text-zinc-600 italic">{t("No outputs")}</span>}
                            </div>
                        </div>
                    )}

                    {activeTab === 'locales' && (
                        <div className="flex flex-col gap-4 h-full">
                            {/* Language Management Header */}
                            <div className="flex items-center gap-2 p-2 bg-zinc-950 rounded border border-zinc-800">
                                <div className="flex items-center gap-2 flex-1">
                                    <span className="text-xs font-bold text-zinc-500 uppercase">{t("Language")}:</span>
                                    <select 
                                        className="bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-200 outline-none focus:border-blue-500 min-w-[100px]"
                                        value={selectedLang || ''}
                                        onChange={e => setSelectedLang(e.target.value)}
                                    >
                                        <option value="" disabled>{t("Select...")}</option>
                                        {Object.keys(localData.locales || {}).map(lang => (
                                            <option key={lang} value={lang}>{lang}</option>
                                        ))}
                                    </select>
                                    {selectedLang && (
                                        <button onClick={() => handleRemoveLang(selectedLang)} className="p-1 hover:bg-red-900/50 text-zinc-500 hover:text-red-400 rounded" title={t("Delete Language")}>
                                            <Trash2 size={14} />
                                        </button>
                                    )}
                                </div>
                                <div className="w-px h-4 bg-zinc-800 mx-2"></div>
                                <div className="flex items-center gap-2">
                                    <input 
                                        placeholder={t("New (e.g. zh, ja)")} 
                                        className="w-24 bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-200 outline-none focus:border-blue-500"
                                        value={newLangCode}
                                        onChange={e => setNewLangCode(e.target.value)}
                                        onKeyDown={e => e.key === 'Enter' && handleAddLang()}
                                    />
                                    <button onClick={handleAddLang} className="p-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded border border-zinc-700">
                                        <Plus size={14} />
                                    </button>
                                </div>
                            </div>

                            {/* Translation Editor */}
                            <div className="flex-1 border border-zinc-800 rounded bg-zinc-950/50 overflow-y-auto custom-scrollbar p-2">
                                {!selectedLang ? (
                                    <div className="flex flex-col items-center justify-center h-full text-zinc-500 gap-2">
                                        <span className="text-sm">{t("Select or add a language to start translating")}</span>
                                    </div>
                                ) : (
                                    <div className="flex flex-col gap-2">
                                        <div className="grid grid-cols-2 gap-4 px-2 py-1 border-b border-zinc-800 text-[10px] font-bold text-zinc-500 uppercase">
                                            <div>{t("Original Text")}</div>
                                            <div>{t("Translation")} ({selectedLang})</div>
                                        </div>
                                        {translatableKeys.map((key, idx) => (
                                            <div key={idx} className="grid grid-cols-2 gap-4 items-center px-2 py-1 hover:bg-zinc-900/50 rounded">
                                                <div className="text-xs text-zinc-400 truncate" title={key}>{key}</div>
                                                <input 
                                                    className="bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-200 outline-none focus:border-blue-500 placeholder-zinc-700"
                                                    placeholder={key}
                                                    value={localData.locales?.[selectedLang]?.[key] || ''}
                                                    onChange={e => handleUpdateTranslation(selectedLang, key, e.target.value)}
                                                />
                                            </div>
                                        ))}
                                        {translatableKeys.length === 0 && (
                                            <div className="text-center text-zinc-600 text-xs py-4">{t("No translatable text found")}</div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>

                <div className="p-4 border-t border-zinc-800 bg-zinc-950 flex justify-end gap-2">
                    <button onClick={onClose} className="px-4 py-2 rounded text-xs font-bold text-zinc-400 hover:bg-zinc-800 transition-colors">{t("Cancel")}</button>
                    <button onClick={handleSave} className="px-4 py-2 rounded bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition-colors flex items-center gap-2">
                        <Save size={14} /> {t("Save Changes")}
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
};

// --- UPDATED IMAGE WIDGET ---
export const ImageUploadWidget = ({ value, onChange }: any) => {
    const { t } = useTranslation();
    const [dimensions, setDimensions] = useState<{w: number, h: number} | null>(null);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);

    // Load preview if value is an Asset ID
    useEffect(() => {
        if (typeof value === 'string') {
            if (value.startsWith('asset://')) {
                assetManager.get(value).then(res => {
                    if (typeof res === 'string') setPreviewUrl(res);
                });
            } else {
                setPreviewUrl(value);
            }
        }
    }, [value]);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = async (event) => {
                if(event.target?.result) {
                    const dataUrl = event.target.result as string;
                    // Save to Asset Manager
                    const id = assetManager.createId('upload');
                    await assetManager.save(id, dataUrl);
                    
                    // Propagate ID to Node Data
                    onChange(id);
                    setPreviewUrl(dataUrl);
                }
            };
            reader.readAsDataURL(file);
        }
    };

    const applySize = (e: React.MouseEvent) => {
        e.stopPropagation();
        if(dimensions) {
             const event = new CustomEvent('GLSL_SET_CANVAS_SIZE', { 
                detail: { w: dimensions.w, h: dimensions.h } 
             });
             window.dispatchEvent(event);
        }
    };
    
    return (
        <div className="flex flex-col gap-1 w-full">
            {previewUrl && (
                <div className="relative w-full h-16 bg-black/50 rounded overflow-hidden border border-zinc-700 group flex items-center justify-center">
                    <img 
                        src={previewUrl} 
                        className="max-w-full max-h-full object-contain" 
                        alt="Texture" 
                        onLoad={(e) => setDimensions({w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight})}
                    />
                    {dimensions && (
                        <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity">
                             <button 
                                onClick={applySize}
                                className="bg-black/60 hover:bg-blue-600 text-white p-1 rounded border border-white/20 shadow-sm backdrop-blur-sm flex items-center gap-1 text-[8px]"
                                title={t("Set Canvas to {{w}}x{{h}}", { w: dimensions.w, h: dimensions.h })}
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
                    <span className="text-[9px] text-zinc-400">{t("Load Image")}</span>
                </span>
                <input type="file" className="nodrag hidden" accept="image/*" onChange={handleFileChange} />
            </label>
        </div>
    );
};

// --- SUPPORTED WIDGETS MAP ---
const SUPPORTED_WIDGETS: Partial<Record<GLSLType, WidgetMode[]>> = {
    float: ['default', 'slider', 'number', 'toggle', 'enum', 'hidden'],
    int: ['default', 'slider', 'number', 'toggle', 'enum', 'hidden'],
    vec2: ['default', 'pad', 'range', 'hidden'],
    vec3: ['default', 'color', 'hidden'],
    vec4: ['default', 'color', 'hidden'],
    sampler2D: ['default', 'image', 'gradient', 'curve', 'hidden']
};

// --- UNIFORM CONTROL WRAPPER ---
const UniformControlWrapper = ({ 
    input, 
    uniform, 
    allUniforms,
    onUpdateValue, 
    onUpdateConfig,
    isConnected,
    typeColor,
    t
}: { 
    input: NodeInput; 
    uniform: UniformVal; 
    allUniforms: Record<string, UniformVal>;
    onUpdateValue: (val: any) => void;
    onUpdateConfig: (widget: WidgetMode, config?: WidgetConfig) => void;
    isConnected: boolean;
    typeColor: string;
    t: (s: string) => string;
}) => {
    const [showMenu, setShowMenu] = useState(false);
    const mode = uniform.widget || 'default';
    const config = uniform.widgetConfig || {};
    
    // Check visibility condition
    if (config.visibleIf) {
        const targetUniform = allUniforms[config.visibleIf.uniform];
        if (targetUniform) {
            // If value is defined, check for equality
            if (config.visibleIf.value !== undefined && targetUniform.value !== config.visibleIf.value) {
                return null;
            }
            // If notValue is defined, check for inequality
            if (config.visibleIf.notValue !== undefined && targetUniform.value === config.visibleIf.notValue) {
                return null;
            }
        }
    }

    const setMode = (m: WidgetMode) => {
        let newConfig = { ...config };
        if (m === 'enum' && (!config.enumOptions || config.enumOptions.length === 0)) {
            newConfig.enumOptions = [
                { label: 'Option A', value: 0 },
                { label: 'Option B', value: 1 }
            ];
        }
        onUpdateConfig(m, newConfig);
        setShowMenu(false);
    };

    const updateConfig = (key: keyof WidgetConfig, val: any) => {
        onUpdateConfig(mode, { ...config, [key]: val });
    }

    const renderWidget = () => {
        if (mode === 'hidden') return null;
        const { type } = input;
        
        if (type === 'sampler2D') {
            if (mode === 'gradient') return <GradientWidget config={config} onChangeValue={onUpdateValue} onConfigChange={(c) => onUpdateConfig(mode, c)} />;
            if (mode === 'curve') return <CurveEditor config={config} onChangeValue={onUpdateValue} onConfigChange={(c) => onUpdateConfig(mode, c)} />;
            return <ImageUploadWidget value={uniform.value} onChange={onUpdateValue} />;
        }

        if (type === 'vec3') {
            if (mode === 'color') return <ColorWidget value={uniform.value} onChange={onUpdateValue} alpha={false} />;
            const v = Array.isArray(uniform.value) ? uniform.value : [0,0,0];
            return (
                <div className="flex gap-1">
                    {[0,1,2].map(i => (
                        <SmartNumberInput 
                            key={i} 
                            step={0.1} 
                            className="nodrag w-full h-5 bg-zinc-800 text-[9px] px-1 rounded border border-zinc-700" 
                            value={v[i]} 
                            onChange={val => { const n=[...v]; n[i]=val; onUpdateValue(n); }} 
                        />
                    ))}
                </div>
            );
        }

        if (type === 'vec4') {
             if (mode === 'color') return <ColorWidget value={uniform.value} onChange={onUpdateValue} alpha={true} />;
             const v = Array.isArray(uniform.value) ? uniform.value : [0,0,0,0];
             return (
                 <div className="grid grid-cols-2 gap-1">
                     {['x','y','z','w'].map((l, i) => (
                         <div key={l} className="relative">
                             <span className="absolute left-1 top-1/2 -translate-y-1/2 text-[8px] text-zinc-500 font-bold uppercase">{l}</span>
                             <SmartNumberInput 
                                step={0.1} 
                                className="nodrag w-full h-5 bg-zinc-800 text-[9px] pl-3 pr-1 rounded border border-zinc-700" 
                                value={v[i]} 
                                onChange={val => { const n=[...v]; n[i]=val; onUpdateValue(n); }} 
                             />
                         </div>
                     ))}
                 </div>
             );
        }

        if (type === 'float' || type === 'int') {
            if (mode === 'toggle') {
                const isChecked = Math.abs(Number(uniform.value)) >= 0.5;
                return (
                    <button 
                        className={`nodrag flex items-center gap-2 w-full px-2 py-1 rounded border transition-colors ${isChecked ? 'bg-blue-900/30 border-blue-500/50' : 'bg-zinc-900 border-zinc-700'}`}
                        onClick={() => onUpdateValue(isChecked ? 0 : 1)}
                    >
                         {isChecked ? <CheckSquare size={12} className="text-blue-400"/> : <Square size={12} className="text-zinc-600"/>}
                         <span className={`text-[10px] ${isChecked ? 'text-blue-200' : 'text-zinc-500'}`}>{isChecked ? 'On (1)' : 'Off (0)'}</span>
                    </button>
                );
            }
            if (mode === 'enum') {
                const options = config.enumOptions || [];
                return (
                    <select 
                        className="nodrag w-full bg-zinc-800 text-[10px] px-1 py-1 rounded border border-zinc-700 outline-none focus:border-blue-500"
                        value={uniform.value}
                        onChange={(e) => onUpdateValue(parseFloat(e.target.value))}
                    >
                        {options.map((opt, i) => (
                            <option key={i} value={opt.value}>{opt.label}</option>
                        ))}
                    </select>
                );
            }
            if (mode === 'number') {
                 return <SmartNumberInput step={type==='int'?1:0.01} className="nodrag w-full h-5 bg-zinc-800 text-[10px] px-1 rounded border border-zinc-700"
                    value={uniform.value} onChange={onUpdateValue} />;
            }
            const min = config.min !== undefined ? config.min : 0;
            const max = config.max !== undefined ? config.max : 1;
            const step = config.step !== undefined ? config.step : (type === 'int' ? 1 : 0.01);
            return <SliderWidget value={uniform.value} onChange={onUpdateValue} min={min} max={max} step={step} />;
        }
        
        if (type === 'vec2') {
             if (mode === 'pad') {
                 const minX = config.minX !== undefined ? config.minX : 0;
                 const maxX = config.maxX !== undefined ? config.maxX : 1;
                 const minY = config.minY !== undefined ? config.minY : 0;
                 const maxY = config.maxY !== undefined ? config.maxY : 1;
                 return <PadWidget value={uniform.value} onChange={onUpdateValue} minX={minX} maxX={maxX} minY={minY} maxY={maxY} />;
             }
             if (mode === 'range') {
                 const min = config.min !== undefined ? config.min : 0;
                 const max = config.max !== undefined ? config.max : 100;
                 const step = config.step !== undefined ? config.step : 0.1;
                 return <RangeWidget value={uniform.value} onChange={onUpdateValue} min={min} max={max} step={step} />;
             }
             const v = Array.isArray(uniform.value) ? uniform.value : [0,0];
             return (
                <div className="flex gap-1">
                    <SmartNumberInput step={0.1} className="nodrag w-full h-5 bg-zinc-800 text-[10px] px-1 rounded border border-zinc-700" value={v[0]} onChange={val => onUpdateValue([val, v[1]])} />
                    <SmartNumberInput step={0.1} className="nodrag w-full h-5 bg-zinc-800 text-[10px] px-1 rounded border border-zinc-700" value={v[1]} onChange={val => onUpdateValue([v[0], val])} />
                </div>
             );
        }
        return <div className="text-[9px] text-red-500">{t("Unknown Type")}</div>;
    };

    const supportedModes = SUPPORTED_WIDGETS[input.type];
    const hasSettings = (supportedModes && supportedModes.length > 1) || 
                        (input.type === 'float' || input.type === 'int') ||
                        (input.type === 'vec2' && (mode === 'range' || mode === 'pad')); 

    return (
        <div className="flex flex-col w-full group/param relative">
             <div className="flex items-center justify-between min-h-[16px]">
                <div className="flex items-center gap-2">
                    <span className="text-xs font-medium transition-colors" style={{ color: isConnected ? typeColor : '#a1a1aa' }}>
                        {t(input.name)}
                    </span>
                    {hasSettings && !isConnected && (
                        <div className="relative">
                             <button 
                                onClick={(e) => { e.stopPropagation(); setShowMenu(!showMenu); }}
                                className={`p-0.5 hover:text-zinc-200 transition-all ${showMenu ? 'text-blue-400 opacity-100' : `opacity-0 group-hover/param:opacity-100 ${mode === 'hidden' ? 'text-blue-400' : 'text-zinc-600'}`}`}
                             >
                                 <Settings size={10} />
                             </button>
                             {showMenu && (
                                 <>
                                    <div className="fixed inset-0 z-40" onClick={() => setShowMenu(false)} />
                                    <div className="nodrag absolute top-full left-0 mt-1 bg-zinc-900 border border-zinc-700 rounded shadow-xl z-50 flex flex-col p-1 min-w-[160px] animate-in fade-in zoom-in-95 duration-100 max-h-[300px] overflow-y-auto custom-scrollbar" onMouseDown={e => e.stopPropagation()}>
                                        {supportedModes && supportedModes.length > 1 && (
                                            <div className="flex flex-col mb-2">
                                                <span className="text-[8px] font-bold text-zinc-500 uppercase px-2 py-1">{t("Widget Type")}</span>
                                                {supportedModes.map(m => (
                                                    <button 
                                                        key={m}
                                                        onClick={() => setMode(m)}
                                                        className={`text-[10px] px-2 py-1 text-left rounded hover:bg-zinc-800 flex items-center justify-between ${mode === m ? 'text-blue-400 font-bold bg-zinc-800' : 'text-zinc-300'}`}
                                                    >
                                                        <span>{t(m.charAt(0).toUpperCase() + m.slice(1))}</span>
                                                        {m === 'hidden' && <EyeOff size={10} className="text-zinc-500"/>}
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                        {/* Remaining Settings (Sliders, Enums) logic is identical to previous version, condensed here */}
                                        {((mode === 'slider' || mode === 'default') && (input.type === 'float' || input.type === 'int')) || (mode === 'range' && input.type === 'vec2') ? (
                                            <div className="flex flex-col border-t border-zinc-800 pt-2 gap-1.5 px-1 pb-1">
                                                <div className="flex items-center justify-between gap-2"><label className="text-[9px] text-zinc-400">{t("Min")}</label><SmartNumberInput className="w-14 h-5 bg-zinc-950 border border-zinc-700 rounded px-1 text-[9px] text-right" value={config.min ?? 0} onChange={(val) => updateConfig('min', val)} step={input.type === 'int' ? 1 : 0.1} /></div>
                                                <div className="flex items-center justify-between gap-2"><label className="text-[9px] text-zinc-400">{t("Max")}</label><SmartNumberInput className="w-14 h-5 bg-zinc-950 border border-zinc-700 rounded px-1 text-[9px] text-right" value={config.max ?? (mode === 'range' ? 100 : 1)} onChange={(val) => updateConfig('max', val)} step={input.type === 'int' ? 1 : 0.1} /></div>
                                                <div className="flex items-center justify-between gap-2"><label className="text-[9px] text-zinc-400">{t("Step")}</label><SmartNumberInput className="w-14 h-5 bg-zinc-950 border border-zinc-700 rounded px-1 text-[9px] text-right" value={config.step ?? (input.type === 'int' ? 1 : 0.01)} onChange={(val) => updateConfig('step', val)} step={0.001} /></div>
                                            </div>
                                        ) : null}

                                        {mode === 'pad' && input.type === 'vec2' ? (
                                            <div className="flex flex-col border-t border-zinc-800 pt-2 gap-1.5 px-1 pb-1">
                                                <div className="flex items-center justify-between gap-2"><label className="text-[9px] text-zinc-400">{t("Min X")}</label><SmartNumberInput className="w-14 h-5 bg-zinc-950 border border-zinc-700 rounded px-1 text-[9px] text-right" value={config.minX ?? 0} onChange={(val) => updateConfig('minX', val)} step={0.1} /></div>
                                                <div className="flex items-center justify-between gap-2"><label className="text-[9px] text-zinc-400">{t("Max X")}</label><SmartNumberInput className="w-14 h-5 bg-zinc-950 border border-zinc-700 rounded px-1 text-[9px] text-right" value={config.maxX ?? 1} onChange={(val) => updateConfig('maxX', val)} step={0.1} /></div>
                                                <div className="flex items-center justify-between gap-2"><label className="text-[9px] text-zinc-400">{t("Min Y")}</label><SmartNumberInput className="w-14 h-5 bg-zinc-950 border border-zinc-700 rounded px-1 text-[9px] text-right" value={config.minY ?? 0} onChange={(val) => updateConfig('minY', val)} step={0.1} /></div>
                                                <div className="flex items-center justify-between gap-2"><label className="text-[9px] text-zinc-400">{t("Max Y")}</label><SmartNumberInput className="w-14 h-5 bg-zinc-950 border border-zinc-700 rounded px-1 text-[9px] text-right" value={config.maxY ?? 1} onChange={(val) => updateConfig('maxY', val)} step={0.1} /></div>
                                            </div>
                                        ) : null}
                                    </div>
                                 </>
                             )}
                        </div>
                    )}
                </div>
                {isConnected && <span className="text-[9px] text-zinc-600 bg-zinc-900 border border-zinc-800 px-1 rounded">{t("LINKED")}</span>}
             </div>
             {mode !== 'hidden' && (
                 <div className={`mt-1 ${isConnected ? 'opacity-30 pointer-events-none grayscale' : ''}`}>
                    {renderWidget()}
                 </div>
             )}
        </div>
    );
};

// ... CustomNode implementation (Wrapper) ...
const CustomNode = memo(({ id, data, selected }: NodeProps<NodeData>) => {
  const { setNodes, deleteElements, setEdges, getNodes, getEdges } = useReactFlow();
  const { enterGroup, addToLibrary } = useProject();
  const edges = useEdges(); 
  const { t: tGlobal } = useTranslation();
  
  const nodeDef = useMemo(() => data.definitionId ? getNodeDefinition(data.definitionId) : undefined, [data.definitionId]);
  const t = useNodeTranslation(nodeDef, data.locales);
  
  const [showCode, setShowCode] = useState(false);
  const [isFloatingCode, setIsFloatingCode] = useState(false);
  const [localCode, setLocalCode] = useState(data.glsl);
  const [isEditingLabel, setIsEditingLabel] = useState(false);
  const [tempLabel, setTempLabel] = useState(data.label);
  
  const [showEditor, setShowEditor] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number } | null>(null);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setContextMenu({ x: e.clientX, y: e.clientY });
  }, []);

  // Close context menu on click elsewhere
  useEffect(() => {
      const closeMenu = () => setContextMenu(null);
      window.addEventListener('click', closeMenu);
      return () => window.removeEventListener('click', closeMenu);
  }, []);

  // Helper to check visibility
  const isInputVisible = useCallback((inputId: string) => {
      const uniform = data.uniforms[inputId];
      if (!uniform || !uniform.widgetConfig || !uniform.widgetConfig.visibleIf) return true;
      
      const config = uniform.widgetConfig;
      const targetUniform = data.uniforms[config.visibleIf.uniform];
      
      if (targetUniform) {
          if (config.visibleIf.value !== undefined && targetUniform.value !== config.visibleIf.value) {
              return false;
          }
          if (config.visibleIf.notValue !== undefined && targetUniform.value === config.visibleIf.notValue) {
              return false;
          }
      }
      return true;
  }, [data.uniforms]);

  const updateNodeData = useCallback((update: Partial<NodeData> | ((curr: NodeData) => Partial<NodeData>)) => {
    setNodes((nds) =>
      nds.map((node) => {
        if (node.id === id) {
          const newData = typeof update === 'function' ? update(node.data) : update;
          return { ...node, data: { ...node.data, ...newData } };
        }
        return node;
      })
    );
  }, [id, setNodes]);

  const handleDeleteNode = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    deleteElements({ nodes: [{ id }] });
  }, [id, deleteElements]);

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

  const handleLabelSubmit = () => {
    setIsEditingLabel(false);
    if (tempLabel.trim()) updateNodeData({ label: tempLabel });
    else setTempLabel(data.label);
  };

  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
      e.stopPropagation();
      setIsEditingLabel(true); 
      setTempLabel(data.label);
  }, [data.label]);

  const handleDownloadNode = useCallback(() => {
      const allNodes = getNodes();
      const allEdges = getEdges();

      const internalNodes = data.isCompound 
          ? allNodes.filter(n => n.data.scopeId === id) 
          : [];
      
      // Filter edges that are connected to internal nodes
      const internalEdges = data.isCompound
          ? allEdges.filter(e => internalNodes.some(n => n.id === e.source || n.id === e.target))
          : [];

      const nodeDef = {
          id: data.definitionId || 'CUSTOM',
          label: data.label,
          category: data.category || 'Custom',
          data: {
              glsl: data.glsl,
              inputs: data.inputs,
              outputs: data.outputs,
              uniforms: data.uniforms,
              outputType: data.outputType,
              locales: data.locales,
              isCompound: data.isCompound,
              internalNodes: data.isCompound ? internalNodes : undefined,
              internalEdges: data.isCompound ? internalEdges : undefined
          }
      };
      
      const blob = new Blob([JSON.stringify(nodeDef, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${data.label.replace(/\s+/g, '_')}.json`;
      link.click();
      URL.revokeObjectURL(url);
  }, [data, id, getNodes, getEdges]);

  const handleSaveToLibrary = useCallback(() => {
      const allNodes = getNodes();
      const allEdges = getEdges();

      const internalNodes = data.isCompound 
          ? allNodes.filter(n => n.data.scopeId === id) 
          : [];
      
      const internalEdges = data.isCompound
          ? allEdges.filter(e => internalNodes.some(n => n.id === e.source || n.id === e.target))
          : [];

      const nodeDataToSave: NodeData = {
          ...data,
          internalNodes: data.isCompound ? internalNodes : undefined,
          internalEdges: data.isCompound ? internalEdges : undefined
      };
      
      addToLibrary(nodeDataToSave);
  }, [data, id, getNodes, getEdges, addToLibrary]);

  const handleCodeCompile = useCallback(() => {
      const code = localCode;
      const nextUniforms = { ...data.uniforms };
      
      // USE ROBUST PARSER instead of regex
      const { inputs: newInputs, outputs: newOutputs, isOverloaded, valid } = extractShaderIO(code);

      if (!valid) {
          // Fallback or Error state? For now, we just keep old inputs if parsing fails completely
          // But if it's valid but empty, that's allowed.
          // console.warn("Could not find valid 'void run(...)' signature.");
      } else {
          // Initialize new uniforms if needed
          newInputs.forEach(inp => {
              if (nextUniforms[inp.id] === undefined) {
                  nextUniforms[inp.id] = { type: inp.type, value: getDefaultValue(inp.type) };
              } else if (nextUniforms[inp.id].type !== inp.type) {
                  nextUniforms[inp.id] = { type: inp.type, value: getDefaultValue(inp.type) };
              }
          });

          // Remove unused uniforms
          const inputIds = new Set(newInputs.map(i => i.id));
          Object.keys(nextUniforms).forEach(key => {
              if (!inputIds.has(key)) delete nextUniforms[key];
          });

          const updates: Partial<NodeData> = { 
              glsl: code,
              inputs: newInputs,
              outputs: newOutputs,
              uniforms: nextUniforms,
              autoType: isOverloaded 
          };
          
          // Update outputType if we have outputs detected
          if (newOutputs.length > 0) {
              updates.outputType = newOutputs[0].type;
          }
          
          updateNodeData(updates);
      }
  }, [localCode, data.uniforms, updateNodeData]);

  const getDefaultValue = (type: GLSLType) => {
      if (type === 'vec2') return [0,0];
      if (type === 'vec3') return [1,1,1];
      if (type === 'vec4') return [1,1,1,1];
      if (type === 'sampler2D') return null;
      return 0;
  };

  const borderClass = data.executionError 
    ? 'border-red-500 ring-1 ring-red-500/50 shadow-[0_0_15px_rgba(239,68,68,0.3)]' 
    : selected ? 'border-yellow-500 ring-1 ring-yellow-500/50' : 'border-zinc-700';
  const displayOutputs = data.outputs || [];

  // Custom Style for Compound Nodes
  const headerBgClass = data.isCompound 
      ? 'bg-cyan-950/90 border-cyan-800' 
      : (data.preview ? 'bg-zinc-800 border-green-500/50' : 'bg-zinc-800/80 border-zinc-700');
  
  const nodeBgClass = data.isCompound
      ? 'bg-zinc-900/95 border-cyan-600/50 shadow-[0_0_15px_rgba(8,145,178,0.2)]'
      : 'bg-zinc-900';

  return (
    <>
        <div className={`shadow-xl rounded-lg border transition-all duration-200 min-w-[280px] ${nodeBgClass} ${borderClass}`}>
        {data.executionError && (
            <div className="bg-red-900/80 text-red-100 text-[10px] px-2 py-1 rounded-t-lg border-b border-red-700 flex items-start gap-1">
                <AlertTriangle size={12} className="shrink-0 mt-0.5" />
                <span className="break-all">{data.executionError}</span>
            </div>
        )}
        <div className={`flex items-center justify-between p-2 border-b ${data.executionError ? 'rounded-none' : 'rounded-t-lg'} ${headerBgClass}`} onContextMenu={handleContextMenu}>
            <div className="flex items-center gap-2 flex-1 min-w-0 ml-3">
                {isEditingLabel ? (
                    <input autoFocus value={tempLabel} onChange={(e) => setTempLabel(e.target.value)} onBlur={handleLabelSubmit} onKeyDown={(e) => { if(e.key === 'Enter') handleLabelSubmit(); }} className="nodrag bg-zinc-950 text-white text-sm px-1 py-0.5 rounded border border-blue-500 outline-none w-full max-w-[140px]" />
                ) : (
                    <div className={`font-semibold text-sm truncate max-w-[140px] cursor-text select-none group/label flex items-center gap-1 ${data.preview ? 'text-green-400' : 'text-zinc-100'}`} onDoubleClick={handleDoubleClick}>
                        {t(data.label)} 
                        {data.isCompound ? (
                            <span className="text-[9px] bg-cyan-950 text-cyan-300 px-1 rounded border border-cyan-700/50">{tGlobal("GROUP")}</span>
                        ) : (
                            <Edit2 size={8} className="opacity-0 group-hover/label:opacity-50" />
                        )}
                    </div>
                )}
                <button className={`preview-trigger p-1 rounded hover:bg-zinc-700 transition-colors ml-1 ${data.preview ? 'bg-zinc-900 ring-1 ring-green-500/50' : 'hover:bg-zinc-700'}`}><Eye size={14} className={data.preview ? "text-green-500 animate-pulse" : "text-zinc-600 hover:text-zinc-300"} /></button>
            </div>
            <div className="flex items-center gap-1 shrink-0">
                {data.isCompound && (
                    <button onClick={() => enterGroup(id)} className="p-1 rounded hover:bg-cyan-900/50 text-cyan-500 hover:text-cyan-300 transition-colors mr-1" title={tGlobal("Enter Group")}>
                        <LogIn size={14} />
                    </button>
                )}
                <button onClick={handleContextMenu} className="p-1 rounded hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200"><MoreVertical size={14} /></button>
                <button onClick={() => setShowCode(!showCode)} className={`p-1 rounded hover:bg-zinc-700 ${showCode ? 'text-blue-400' : 'text-zinc-400'}`}><Code size={14} /></button>
                <button onClick={handleDeleteNode} className="p-1 rounded hover:bg-red-900/30 text-zinc-500 hover:text-red-400 transition-colors ml-1"><X size={14} /></button>
            </div>
        </div>
        <div className="flex relative">
            <div className="flex-1 flex flex-col py-2 gap-2 min-w-[50%] border-r border-zinc-800/50">
                {data.inputs.map((input) => {
                    if (!isInputVisible(input.id)) return null;
                    const isConnected = edges.some(e => e.target === id && e.targetHandle === input.id);
                    const typeColor = TYPE_COLORS[input.type] || '#a1a1aa';
                    return (
                        <div key={input.id} className="relative pl-6 pr-3 group">
                            <Handle type="target" position={Position.Left} id={input.id} className="!w-3 !h-3 !left-1 !top-1.5 !transform-none hover:scale-125 transition-all" style={{ backgroundColor: isConnected ? typeColor : '#18181b', borderColor: typeColor, borderWidth: 2 }} onClick={(e) => handleDisconnect(e, input.id, 'target')}/>
                            <div className="flex flex-col gap-1">
                                {data.uniforms[input.id] ? (
                                    <UniformControlWrapper input={input} uniform={data.uniforms[input.id]} allUniforms={data.uniforms} isConnected={isConnected} typeColor={typeColor} t={t}
                                        onUpdateValue={(val) => updateNodeData((curr) => { const next = { ...curr.uniforms }; next[input.id] = { ...next[input.id], value: val }; return { uniforms: next }; })}
                                        onUpdateConfig={(widget, config) => updateNodeData((curr) => { const next = { ...curr.uniforms }; next[input.id] = { ...next[input.id], widget, widgetConfig: config || next[input.id].widgetConfig }; return { uniforms: next }; })}
                                    />
                                ) : (
                                    <div className="flex items-center justify-between min-h-[16px]"><span className="text-xs font-medium" style={{ color: isConnected ? typeColor : '#a1a1aa' }}>{t(input.name)}</span>{isConnected && <span className="text-[9px] text-zinc-600 bg-zinc-900 border border-zinc-800 px-1 rounded">{tGlobal("LINKED")}</span>}</div>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
            <div className="flex flex-col py-2 gap-1 shrink-0 items-end min-w-min">
                {displayOutputs.map((output) => {
                    const isConnected = edges.some(e => e.source === id && e.sourceHandle === output.id);
                    const typeColor = TYPE_COLORS[output.type] || '#a1a1aa';
                    return (
                        <div key={output.id} className="relative flex items-center h-5 pl-2 pr-5 group justify-end">
                            <span className="text-[10px] font-medium text-zinc-400 mr-1">{t(output.name)}</span>
                            <Handle type="source" position={Position.Right} id={output.id} className="!w-3 !h-3 !right-1 !top-1/2 !-mt-1.5 !transform-none hover:scale-125 transition-all" style={{ backgroundColor: isConnected ? typeColor : '#18181b', borderColor: typeColor, borderWidth: 2 }} onClick={(e) => handleDisconnect(e, output.id, 'source')}/>
                        </div>
                    );
                })}
            </div>
        </div>
        {showCode && !isFloatingCode && (
            <div className="p-2 border-t border-zinc-800 bg-zinc-950 flex flex-col gap-2 animate-in slide-in-from-top-2">
                <div className="flex items-center justify-between text-zinc-500 px-1"><span className="text-[10px] uppercase font-bold tracking-wider">{tGlobal("GLSL Source")}</span><button onClick={() => setIsFloatingCode(true)} className="p-1 hover:text-blue-400 hover:bg-zinc-800 rounded"><Maximize2 size={12}/></button></div>
                <div className="nodrag">
                    <CodeEditor value={localCode} onChange={(val) => setLocalCode(val || '')} onSave={handleCodeCompile} onBlur={handleCodeCompile} height="250px" lineNumbers="off" readOnly={data.isCompound}/>
                </div>
                <div className="text-[9px] text-zinc-600 flex justify-between px-1"><span>{tGlobal("Ctrl+S to save")}</span><span>{tGlobal("Standard GLSL syntax")}</span></div>
            </div>
        )}
        </div>
        {showCode && isFloatingCode && createPortal(
            <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-8" onClick={() => setIsFloatingCode(false)}>
                <div className="w-full max-w-5xl h-[85vh] bg-zinc-950 border border-zinc-700 rounded-lg shadow-2xl flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
                    <div className="h-10 border-b border-zinc-800 flex items-center justify-between px-3 bg-zinc-900 select-none">
                        <div className="flex items-center gap-2"><div className="p-1 bg-blue-600/20 rounded text-blue-400"><Code size={16} /></div><span className="font-bold text-zinc-200 text-xs">{tGlobal("Editing:")} {data.label}</span></div>
                        <div className="flex items-center gap-2">
                             <button onClick={handleCodeCompile} className="flex items-center gap-1 px-2.5 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded text-[10px] font-bold uppercase tracking-wide"><Save size={12} /> {tGlobal("Compile")}</button>
                            <button onClick={() => setIsFloatingCode(false)} className="p-1 hover:bg-zinc-800 text-zinc-400 hover:text-white rounded"><Minimize2 size={16} /></button>
                        </div>
                    </div>
                    <div className="flex-1 p-0 overflow-hidden relative nodrag"><CodeEditor value={localCode} onChange={(val) => setLocalCode(val || '')} onSave={handleCodeCompile} onBlur={() => {}} height="100%" lineNumbers="on"/></div>
                </div>
            </div>,
            document.body
        )}
        {contextMenu && createPortal(
            <div 
                className="fixed z-[100] bg-zinc-900 border border-zinc-700 rounded shadow-xl py-1 min-w-[160px] animate-in fade-in zoom-in-95 duration-100"
                style={{ left: contextMenu.x, top: contextMenu.y }}
                onClick={e => e.stopPropagation()}
            >
                <button onClick={() => { setShowEditor(true); setContextMenu(null); }} className="w-full text-left px-3 py-2 text-xs text-zinc-200 hover:bg-zinc-800 flex items-center gap-2">
                    <Settings2 size={14} /> {tGlobal("Edit Node")}
                </button>
                <button onClick={() => { handleSaveToLibrary(); setContextMenu(null); }} className="w-full text-left px-3 py-2 text-xs text-zinc-200 hover:bg-zinc-800 flex items-center gap-2">
                    <Save size={14} /> {tGlobal("Save to Library")}
                </button>
                <button onClick={() => { handleDownloadNode(); setContextMenu(null); }} className="w-full text-left px-3 py-2 text-xs text-zinc-200 hover:bg-zinc-800 flex items-center gap-2">
                    <Download size={14} /> {tGlobal("Download JSON")}
                </button>
                <div className="h-px bg-zinc-800 my-1" />
                <button onClick={(e) => { handleDeleteNode(e); setContextMenu(null); }} className="w-full text-left px-3 py-2 text-xs text-red-400 hover:bg-zinc-800 flex items-center gap-2">
                    <Trash2 size={14} /> {tGlobal("Delete")}
                </button>
            </div>,
            document.body
        )}

        {showEditor && (
            <NodeEditorModal 
                data={data} 
                onSave={updateNodeData} 
                onClose={() => setShowEditor(false)} 
            />
        )}
    </>
  );
});

export default CustomNode;
