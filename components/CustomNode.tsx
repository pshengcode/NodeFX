import React, { useState, useCallback, memo, useMemo, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Handle, Position, NodeProps } from 'reactflow';
import { NodeData, GLSLType, UniformVal, NodeOutput, NodeInput, WidgetMode, WidgetConfig, NodeCategory, NodePass } from '../types';
import { Code, X, Settings2, Eye, AlertTriangle, Settings, Download, Edit2, Plus, Trash2, CheckSquare, Square, EyeOff, Maximize2, Minimize2, Save, LogIn, MoreVertical, Layers, ChevronDown } from 'lucide-react';
import { SliderWidget, ColorWidget, GradientWidget, CurveEditor, PadWidget, RangeWidget, SmartNumberInput, AngleWidget, IntWidget, Vec2Widget, Vec3Widget, Vec4Widget } from './UniformWidgets';
import { TYPE_COLORS } from '../constants';
import CodeEditor from './CodeEditor'; 
import { assetManager } from '../utils/assetManager';
import { BUILTIN_TEXTURES } from '../utils/builtinResources';
import { Upload, Scan, Grid } from 'lucide-react';
import { extractShaderIO, extractAllSignatures } from '../utils/glslParser';
import { useTranslation } from 'react-i18next';
import { useNodeTranslation } from '../hooks/useNodeTranslation';
import { getNodeDefinition } from '../nodes/registry';
import { useProjectDispatch, useProjectEdges } from '../context/ProjectContext';
import ShaderPreview from './ShaderPreview';

// --- NODE EDITOR MODAL ---
const NodeEditorModal = ({ data, onSave, onClose }: { data: NodeData, onSave: (newData: Partial<NodeData>) => void, onClose: () => void }) => {
    const { t } = useTranslation();
    const [localData, setLocalData] = useState(data);
    const [activeTab, setActiveTab] = useState<'general' | 'io' | 'locales'>('general');
    
    // Locales State
    const [selectedLang, setSelectedLang] = useState<string | null>(null);
    const [newLangCode, setNewLangCode] = useState('');
    const [editingVisibility, setEditingVisibility] = useState<number | null>(null);

    const updateVisibleIf = (inputIndex: number, enabled: boolean, targetUniform?: string, mode?: 'equals' | 'notEquals', value?: number | number[]) => {
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
                                    {['Input', 'Generator', 'Math', 'Vector', 'Color', 'Filter', 'Effect', 'Utility', 'Output', 'Network', 'Custom', 'User'].map(c => (
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
                                                                    type="text"
                                                                    className="w-20 bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-200 outline-none focus:border-blue-500"
                                                                    value={(() => {
                                                                        const val = visibleIf.notValue ?? visibleIf.value ?? 0;
                                                                        return Array.isArray(val) ? val.join(', ') : val;
                                                                    })()}
                                                                    onChange={(e) => {
                                                                        const str = e.target.value;
                                                                        let val: number | number[];
                                                                        if (str.includes(',')) {
                                                                            val = str.split(',').map(s => parseFloat(s.trim())).filter(n => !isNaN(n));
                                                                        } else {
                                                                            val = parseFloat(str);
                                                                            if (isNaN(val)) val = 0;
                                                                        }
                                                                        updateVisibleIf(idx, true, visibleIf.uniform, visibleIf.notValue !== undefined ? 'notEquals' : 'equals', val);
                                                                    }}
                                                                    title={t("Enter a value or comma-separated values (e.g. 1, 2)")}
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
    const [showBuiltin, setShowBuiltin] = useState(false);

    // Load preview if value is an Asset ID
    useEffect(() => {
        if (typeof value === 'string') {
            if (value.startsWith('asset://') || value.startsWith('builtin://')) {
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
        <div className="flex flex-col gap-1 w-full relative">
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
            <div className="flex gap-1">
                <label className="nodrag flex-1 flex items-center justify-center h-5 px-2 bg-zinc-800 border border-zinc-700 border-dashed rounded cursor-pointer hover:border-zinc-500 hover:bg-zinc-700 transition-colors">
                    <span className="flex items-center gap-1">
                        <Upload size={10} className="text-zinc-400" />
                        <span className="text-[9px] text-zinc-400">{t("Load Image")}</span>
                    </span>
                    <input type="file" className="nodrag hidden" accept="image/*" onChange={handleFileChange} />
                </label>
                <button 
                    onClick={() => setShowBuiltin(!showBuiltin)}
                    className={`nodrag px-2 h-5 rounded border transition-colors flex items-center justify-center ${showBuiltin ? 'bg-blue-900/50 border-blue-500 text-blue-400' : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:bg-zinc-700'}`}
                    title={t("Built-in Resources")}
                >
                    <Grid size={10} />
                </button>
            </div>

            {showBuiltin && (
                <div className="absolute top-full left-0 right-0 mt-1 z-50 bg-zinc-900 border border-zinc-700 rounded shadow-xl p-2 animate-in fade-in zoom-in-95 duration-100">
                    <div className="text-[9px] font-bold text-zinc-500 uppercase mb-2 px-1">{t("Built-in Textures")}</div>
                    <div className="grid grid-cols-3 gap-1 max-h-[150px] overflow-y-auto custom-scrollbar">
                        {BUILTIN_TEXTURES.map(res => (
                            <button
                                key={res.id}
                                onClick={() => {
                                    onChange(res.id);
                                    setShowBuiltin(false);
                                }}
                                className="aspect-square bg-black/50 rounded border border-zinc-800 hover:border-blue-500 overflow-hidden relative group"
                                title={res.label}
                            >
                                <img src={res.url} className="w-full h-full object-cover" alt={res.label} />
                                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                                    <span className="text-[8px] text-white text-center px-1 leading-tight">{res.label}</span>
                                </div>
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

// --- SUPPORTED WIDGETS MAP ---
const SUPPORTED_WIDGETS: Partial<Record<GLSLType, WidgetMode[]>> = {
    float: ['default', 'slider', 'number', 'angle', 'toggle', 'enum', 'hidden'],
    int: ['default', 'slider', 'number', 'toggle', 'enum', 'hidden'],
    uint: ['default', 'slider', 'number', 'hidden'],
    bool: ['default', 'toggle', 'hidden'],
    vec2: ['default', 'pad', 'range', 'hidden'],
    vec3: ['default', 'color', 'hidden'],
    vec4: ['default', 'color', 'hidden'],
    uvec2: ['default', 'hidden'],
    uvec3: ['default', 'hidden'],
    uvec4: ['default', 'hidden'],
    mat2: ['default', 'hidden'],
    mat3: ['default', 'hidden'],
    mat4: ['default', 'hidden'],
    sampler2D: ['default', 'image', 'gradient', 'curve', 'hidden'],
    samplerCube: ['default', 'image', 'hidden'],
    'int[]': ['expanded', 'index', 'hidden'],
    'uint[]': ['expanded', 'index', 'hidden'],
    'bool[]': ['expanded', 'index', 'hidden'],
    'float[]': ['expanded', 'index', 'hidden'],
    'vec2[]': ['expanded', 'index', 'bezier_grid', 'hidden'],
    'vec3[]': ['expanded', 'index', 'hidden'],
    'vec4[]': ['expanded', 'index', 'hidden']
};

// --- UNIFORM CONTROL WRAPPER ---
const UniformControlWrapper = ({ 
    input, 
    uniform, 
    allUniforms,
    onUpdateValue, 
    onUpdateConfig,
    isConnected,
    connectedTargetHandles,
    typeColor,
    t,
    compiledData,
    definitionId
}: { 
    input: NodeInput; 
    uniform: UniformVal; 
    allUniforms: Record<string, UniformVal>;
    onUpdateValue: (val: any) => void;
    onUpdateConfig: (widget: WidgetMode, config?: WidgetConfig) => void;
    isConnected: boolean;
    connectedTargetHandles?: Set<string>;
    typeColor: string;
    t: (s: string) => string;
    compiledData?: any;
    definitionId?: string;
}) => {
    const [activeMenu, setActiveMenu] = useState<null | 'main' | 'index' | 'element'>(null);
    const mode = uniform.widget || ((input.type === 'float[]' || input.type === 'int[]' || input.type === 'uint[]' || input.type === 'bool[]' || input.type === 'vec2[]' || input.type === 'vec3[]' || input.type === 'vec4[]') ? 'expanded' : 'default');
    const config = uniform.widgetConfig || {};
    const menuRef = useRef<HTMLDivElement>(null);
    const mainButtonRef = useRef<HTMLButtonElement>(null);
    const indexButtonRef = useRef<HTMLButtonElement>(null);
    const elementButtonRef = useRef<HTMLButtonElement>(null);

    const showMenu = activeMenu === 'main';
    const showIndexEditorMenu = activeMenu === 'index';
    const showElementEditorMenu = activeMenu === 'element';

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (
                menuRef.current && 
                !menuRef.current.contains(event.target as Node) &&
                !(
                    mainButtonRef.current?.contains(event.target as Node) ||
                    indexButtonRef.current?.contains(event.target as Node) ||
                    elementButtonRef.current?.contains(event.target as Node)
                )
            ) {
                setActiveMenu(null);
            }
        };

        if (activeMenu) {
            document.addEventListener('mousedown', handleClickOutside, true);
        }
        return () => {
            document.removeEventListener('mousedown', handleClickOutside, true);
        };
    }, [activeMenu]);
    
    // Check visibility condition - Logic handled by parent component (isInputVisible)


    const setMode = (m: WidgetMode) => {
        let newConfig = { ...config };
        if (m === 'enum' && (!config.enumOptions || config.enumOptions.length === 0)) {
            newConfig.enumOptions = [
                { label: 'Option A', value: 0 },
                { label: 'Option B', value: 1 }
            ];
        }
        onUpdateConfig(m, newConfig);
        // setShowMenu(false); // Keep menu open to allow further configuration
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
            if (mode === 'color') return <ColorWidget value={uniform.value as number[]} onChange={onUpdateValue} alpha={false} />;
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
             if (mode === 'color') return <ColorWidget value={uniform.value as number[]} onChange={onUpdateValue} alpha={true} />;
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

        if (type === 'float' || type === 'int' || type === 'uint') {
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
            if (type === 'float' && mode === 'angle') {
                const min = config.min !== undefined ? config.min : -180;
                const max = config.max !== undefined ? config.max : 180;
                const step = config.step !== undefined ? config.step : 1;
                return <AngleWidget value={uniform.value} onChange={v => onUpdateValue(v)} min={min} max={max} step={step} />;
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
                            <option key={i} value={opt.value}>{t(opt.label)}</option>
                        ))}
                    </select>
                );
            }
            if (mode === 'number') {
                 return <SmartNumberInput step={type==='float'?0.01:1} className="nodrag w-full h-5 bg-zinc-800 text-[10px] px-1 rounded border border-zinc-700"
                    value={uniform.value} onChange={v => {
                        if(type==='uint') v = Math.max(0, Math.round(v));
                        else if(type==='int') v = Math.round(v);
                        onUpdateValue(v);
                    }} />;
            }
            const min = config.min !== undefined ? config.min : 0;
            const max = config.max !== undefined ? config.max : 1;
            const step = config.step !== undefined ? config.step : (type === 'float' ? 0.01 : 1);
            return <SliderWidget value={uniform.value} onChange={v => {
                        if(type==='uint') v = Math.max(0, Math.round(v));
                        else if(type==='int') v = Math.round(v);

                        // Auto-expand bounds when value exceeds them (useful for drag-to-adjust on number field).
                        const nextMin = Math.min(min, v);
                        const nextMax = Math.max(max, v);
                        if (nextMin !== min || nextMax !== max) {
                            onUpdateConfig(mode, { ...config, min: nextMin, max: nextMax });
                        }

                        onUpdateValue(v);
            }} min={min} max={max} step={step} />;
        }
        
        if (type === 'vec2') {
             if (mode === 'pad') {
                 const minX = config.minX !== undefined ? config.minX : 0;
                 const maxX = config.maxX !== undefined ? config.maxX : 1;
                 const minY = config.minY !== undefined ? config.minY : 0;
                 const maxY = config.maxY !== undefined ? config.maxY : 1;
                 return <PadWidget value={uniform.value as number[]} onChange={onUpdateValue} minX={minX} maxX={maxX} minY={minY} maxY={maxY} />;
             }
             if (mode === 'range') {
                 const min = config.min !== undefined ? config.min : 0;
                 const max = config.max !== undefined ? config.max : 100;
                 const step = config.step !== undefined ? config.step : 0.1;
                 return <RangeWidget value={uniform.value as number[]} onChange={onUpdateValue} min={min} max={max} step={step} />;
             }
             const v = Array.isArray(uniform.value) ? uniform.value : [0,0];
             return (
                <div className="flex gap-1">
                    <SmartNumberInput step={0.1} className="nodrag w-full h-5 bg-zinc-800 text-[10px] px-1 rounded border border-zinc-700" value={v[0]} onChange={val => onUpdateValue([val, v[1]])} />
                    <SmartNumberInput step={0.1} className="nodrag w-full h-5 bg-zinc-800 text-[10px] px-1 rounded border border-zinc-700" value={v[1]} onChange={val => onUpdateValue([v[0], val])} />
                </div>
             );
        }

        if (type === 'uvec2') {
             const v = Array.isArray(uniform.value) ? uniform.value : [0,0];
             return (
                <div className="flex gap-1">
                    {[0,1].map(i => (
                        <SmartNumberInput 
                            key={i} 
                            step={1} 
                            className="nodrag w-full h-5 bg-zinc-800 text-[10px] px-1 rounded border border-zinc-700" 
                            value={v[i]} 
                            onChange={val => { const n=[...v]; n[i]=Math.max(0, Math.round(val)); onUpdateValue(n); }} 
                        />
                    ))}
                </div>
             );
        }

        if (type === 'uvec3') {
             const v = Array.isArray(uniform.value) ? uniform.value : [0,0,0];
             return (
                <div className="flex gap-1">
                    {[0,1,2].map(i => (
                        <SmartNumberInput 
                            key={i} 
                            step={1} 
                            className="nodrag w-full h-5 bg-zinc-800 text-[10px] px-1 rounded border border-zinc-700" 
                            value={v[i]} 
                            onChange={val => { const n=[...v]; n[i]=Math.max(0, Math.round(val)); onUpdateValue(n); }} 
                        />
                    ))}
                </div>
             );
        }

        if (type === 'uvec4') {
             const v = Array.isArray(uniform.value) ? uniform.value : [0,0,0,0];
             return (
                 <div className="grid grid-cols-2 gap-1">
                     {['x','y','z','w'].map((l, i) => (
                         <div key={l} className="relative">
                             <span className="absolute left-1 top-1/2 -translate-y-1/2 text-[8px] text-zinc-500 font-bold uppercase">{l}</span>
                             <SmartNumberInput 
                                step={1} 
                                className="nodrag w-full h-5 bg-zinc-800 text-[9px] pl-3 pr-1 rounded border border-zinc-700" 
                                value={v[i]} 
                                onChange={val => { const n=[...v]; n[i]=Math.max(0, Math.round(val)); onUpdateValue(n); }} 
                             />
                         </div>
                     ))}
                 </div>
             );
        }

        if (type === 'bool') {
            const isChecked = Boolean(uniform.value);
            return (
                <button 
                    className={`nodrag flex items-center gap-2 w-full px-2 py-1 rounded border transition-colors ${isChecked ? 'bg-blue-900/30 border-blue-500/50' : 'bg-zinc-900 border-zinc-700'}`}
                    onClick={() => onUpdateValue(!isChecked)}
                >
                        {isChecked ? <CheckSquare size={12} className="text-blue-400"/> : <Square size={12} className="text-zinc-600"/>}
                        <span className={`text-[10px] ${isChecked ? 'text-blue-200' : 'text-zinc-500'}`}>{isChecked ? 'True' : 'False'}</span>
                </button>
            );
        }

        if (type === 'mat2') {
            const v = Array.isArray(uniform.value) ? uniform.value : [1,0,0,1];
            return (
                <div className="grid grid-cols-2 gap-1">
                    {[0,1,2,3].map(i => (
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

        if (type === 'mat3') {
            const v = Array.isArray(uniform.value) ? uniform.value : [1,0,0, 0,1,0, 0,0,1];
            return (
                <div className="grid grid-cols-3 gap-1">
                    {[0,1,2,3,4,5,6,7,8].map(i => (
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

        if (type === 'mat4') {
            const v = Array.isArray(uniform.value) ? uniform.value : [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1];
            return (
                <div className="grid grid-cols-4 gap-1">
                    {[0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15].map(i => (
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

        if (type === 'samplerCube') {
             return <ImageUploadWidget value={uniform.value} onChange={onUpdateValue} />;
        }

        if (type === 'float[]' || type === 'int[]' || type === 'uint[]' || type === 'bool[]' || type === 'vec2[]' || type === 'vec3[]' || type === 'vec4[]') {
            if (mode === 'index') {
                const raw = Array.isArray(uniform.value) ? (uniform.value as unknown[]) : [];
                const isScalarArray = type === 'float[]' || type === 'int[]' || type === 'uint[]' || type === 'bool[]';
                const isFloatArray = type === 'float[]';
                const isIntArray = type === 'int[]';
                const isUintArray = type === 'uint[]';
                const isBoolArray = type === 'bool[]';

                const valuesScalar = isScalarArray
                    ? (raw.map(v => {
                        const n = Number(v);
                        return Number.isFinite(n) ? n : 0;
                    }) as number[])
                    : [];
                const valuesVec = !isScalarArray
                    ? (raw.filter(v => Array.isArray(v)) as number[][])
                    : [];
                const length = isScalarArray ? valuesScalar.length : valuesVec.length;

                // UI-configurable length
                const clampLen = (n: number) => {
                    if (!Number.isFinite(n)) return 1;
                    const rounded = Math.round(n);
                    return Math.max(1, rounded);
                };
                const desiredLengthRaw = typeof config.arrayLength === 'number' && Number.isFinite(config.arrayLength)
                    ? config.arrayLength
                    : length;
                const desiredLength = clampLen(desiredLengthRaw);

                const vecSize = isScalarArray ? 1 : type === 'vec2[]' ? 2 : type === 'vec3[]' ? 3 : 4;

                const indexWidget = config.arrayIndexWidget || 'number';
                const elementStep = typeof config.arrayElementStep === 'number' && Number.isFinite(config.arrayElementStep)
                    ? config.arrayElementStep
                    : (isScalarArray ? (isFloatArray ? 0.01 : 1) : 0.1);

                const rangeMin = typeof config.arrayElementMin === 'number' && Number.isFinite(config.arrayElementMin)
                    ? config.arrayElementMin
                    : 0;
                const rangeMax = typeof config.arrayElementMax === 'number' && Number.isFinite(config.arrayElementMax)
                    ? config.arrayElementMax
                    : 100;
                const rangeStep = typeof config.arrayElementRangeStep === 'number' && Number.isFinite(config.arrayElementRangeStep)
                    ? config.arrayElementRangeStep
                    : 0.1;

                const scalarMin = typeof config.arrayElementMin === 'number' && Number.isFinite(config.arrayElementMin)
                    ? config.arrayElementMin
                    : 0;
                const scalarMax = typeof config.arrayElementMax === 'number' && Number.isFinite(config.arrayElementMax)
                    ? config.arrayElementMax
                    : (isFloatArray ? 1 : 10);
                const scalarStep = typeof config.arrayElementRangeStep === 'number' && Number.isFinite(config.arrayElementRangeStep)
                    ? config.arrayElementRangeStep
                    : (isFloatArray ? 0.01 : 1);

                const padMinX = typeof config.arrayElementMinX === 'number' && Number.isFinite(config.arrayElementMinX)
                    ? config.arrayElementMinX
                    : 0;
                const padMaxX = typeof config.arrayElementMaxX === 'number' && Number.isFinite(config.arrayElementMaxX)
                    ? config.arrayElementMaxX
                    : 1;
                const padMinY = typeof config.arrayElementMinY === 'number' && Number.isFinite(config.arrayElementMinY)
                    ? config.arrayElementMinY
                    : 0;
                const padMaxY = typeof config.arrayElementMaxY === 'number' && Number.isFinite(config.arrayElementMaxY)
                    ? config.arrayElementMaxY
                    : 1;

                const currentIndexRaw = typeof config.arrayIndex === 'number' && Number.isFinite(config.arrayIndex)
                    ? Math.round(config.arrayIndex)
                    : 0;

                const clampIndex = (n: number) => {
                    if (!Number.isFinite(n)) return 0;
                    const rounded = Math.round(n);
                    if (desiredLength <= 0) return 0;
                    return Math.max(0, Math.min(desiredLength - 1, rounded));
                };

                const currentIndex = clampIndex(currentIndexRaw);

                const resizeArrayTo = (nextLen: number) => {
                    const targetLen = clampLen(nextLen);
                    if (targetLen === length) {
                        updateConfig('arrayLength', targetLen);
                        // Ensure index stays in range if config was stale
                        updateConfig('arrayIndex', clampIndex(currentIndexRaw));
                        return;
                    }

                    if (isScalarArray) {
                        const next = Array.from({ length: targetLen }, (_, i) => {
                            const n = Number(valuesScalar[i]);
                            return Number.isFinite(n) ? n : 0;
                        });
                        onUpdateValue(next);
                    } else {
                        const next = Array.from({ length: targetLen }, (_, i) => {
                            const src = Array.isArray(valuesVec[i]) ? valuesVec[i] : [];
                            return Array.from({ length: vecSize }, (_, j) => {
                                const n = Number((src as any)[j]);
                                return Number.isFinite(n) ? n : 0;
                            });
                        });
                        onUpdateValue(next);
                    }

                    const nextIndex = targetLen <= 0 ? 0 : Math.min(targetLen - 1, clampIndex(currentIndexRaw));
                    onUpdateConfig(mode, { ...config, arrayLength: targetLen, arrayIndex: nextIndex });
                };

                const currentVec = (() => {
                    if (length <= 0) return Array.from({ length: vecSize }, () => 0);
                    if (isScalarArray) {
                        const n = Number(valuesScalar[currentIndex]);
                        return [Number.isFinite(n) ? n : 0];
                    }
                    const current = Array.isArray(valuesVec[currentIndex]) ? valuesVec[currentIndex] : [];
                    return Array.from({ length: vecSize }, (_, i) => {
                        const n = Number((current as any)[i]);
                        return Number.isFinite(n) ? n : 0;
                    });
                })();

                const updateAtIndex = (nextVec: number[]) => {
                    if (length <= 0) return;
                    if (isScalarArray) {
                        const next = [...valuesScalar];
                        const n = Number(nextVec[0]);
                        const clean = Number.isFinite(n) ? n : 0;
                        if (isBoolArray) next[currentIndex] = Math.abs(clean) >= 0.5 ? 1 : 0;
                        else if (isUintArray) next[currentIndex] = Math.max(0, Math.round(clean));
                        else if (isIntArray) next[currentIndex] = Math.round(clean);
                        else next[currentIndex] = clean;
                        onUpdateValue(next);
                        return;
                    }
                    const next = [...valuesVec];
                    next[currentIndex] = Array.from({ length: vecSize }, (_, i) => {
                        const n = Number(nextVec[i]);
                        return Number.isFinite(n) ? n : 0;
                    });
                    onUpdateValue(next);
                };

                const elementWidgetRaw = config.arrayElementWidget || 'default';
                const elementWidget = (() => {
                    if (type === 'float[]') {
                        return (elementWidgetRaw === 'default' || elementWidgetRaw === 'slider' || elementWidgetRaw === 'number' || elementWidgetRaw === 'angle' || elementWidgetRaw === 'toggle' || elementWidgetRaw === 'enum')
                            ? elementWidgetRaw
                            : 'default';
                    }
                    if (type === 'int[]') {
                        return (elementWidgetRaw === 'default' || elementWidgetRaw === 'slider' || elementWidgetRaw === 'number' || elementWidgetRaw === 'toggle' || elementWidgetRaw === 'enum')
                            ? elementWidgetRaw
                            : 'default';
                    }
                    if (type === 'uint[]') {
                        return (elementWidgetRaw === 'default' || elementWidgetRaw === 'slider' || elementWidgetRaw === 'number')
                            ? elementWidgetRaw
                            : 'default';
                    }
                    if (type === 'bool[]') {
                        return 'toggle';
                    }
                    if (type === 'vec2[]') {
                        return (elementWidgetRaw === 'pad' || elementWidgetRaw === 'range' || elementWidgetRaw === 'default') ? elementWidgetRaw : 'default';
                    }
                    // vec3[] / vec4[]: support default/color
                    return (elementWidgetRaw === 'color' || elementWidgetRaw === 'default') ? elementWidgetRaw : 'default';
                })();

                const setArrayElementWidget = (m: WidgetConfig['arrayElementWidget']) => {
                    const nextConfig: WidgetConfig = { ...config, arrayElementWidget: m };
                    if (m === 'enum' && (!config.enumOptions || config.enumOptions.length === 0)) {
                        nextConfig.enumOptions = [
                            { label: 'Option A', value: 0 },
                            { label: 'Option B', value: 1 }
                        ];
                    }
                    onUpdateConfig(mode, nextConfig);
                };

                return (
                    <div className="flex gap-1 items-center w-full">
                        {!isConnected && (
                            <div className="flex items-center gap-1 flex-shrink-0">
                                <span className="text-[8px] text-zinc-500 font-bold uppercase">{t('Len')}</span>
                                <IntWidget
                                    className="nodrag w-12 h-5 bg-zinc-800 text-[9px] px-1 rounded border border-zinc-700 text-center"
                                    value={desiredLength}
                                    min={1}
                                    onChange={(val) => resizeArrayTo(val)}
                                />
                            </div>
                        )}
                        <div className="flex items-center gap-1 flex-shrink-0">
                            <span className="text-[8px] text-zinc-500 font-bold uppercase">{t('Index')}</span>
                            {!isConnected && (
                                <div className="relative">
                                    <button
                                        ref={indexButtonRef}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setActiveMenu(prev => (prev === 'index' ? null : 'index'));
                                        }}
                                        className="p-0.5 text-zinc-600 hover:text-zinc-200 transition-all"
                                        title={t('Index Editor')}
                                    >
                                        <Settings size={10} />
                                    </button>
                                    {showIndexEditorMenu && (
                                        <div ref={menuRef} className="nodrag absolute top-full left-0 mt-1 bg-zinc-900 border border-zinc-700 rounded shadow-xl z-50 flex flex-col p-1 min-w-[160px] animate-in fade-in zoom-in-95 duration-100 max-h-[300px] overflow-y-auto custom-scrollbar" onMouseDown={e => e.stopPropagation()}>
                                            <span className="text-[8px] font-bold text-zinc-500 uppercase px-2 py-1">{t('Index Editor')}</span>
                                            {(['number', 'slider'] as const).map(m => (
                                                <button
                                                    key={m}
                                                    onClick={() => {
                                                        updateConfig('arrayIndexWidget', m);
                                                        setActiveMenu(null);
                                                    }}
                                                    className={`text-[10px] px-2 py-1 text-left rounded hover:bg-zinc-800 flex items-center justify-between ${(config.arrayIndexWidget || 'number') === m ? 'text-blue-400 font-bold bg-zinc-800' : 'text-zinc-300'}`}
                                                >
                                                    <span>{t(m.charAt(0).toUpperCase() + m.slice(1))}</span>
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}
                            {indexWidget === 'slider' ? (
                                <div className="w-36">
                                    <SliderWidget
                                        value={desiredLength > 0 ? currentIndex : 0}
                                        onChange={(val: number) => updateConfig('arrayIndex', clampIndex(val))}
                                        min={0}
                                        max={Math.max(0, desiredLength - 1)}
                                        step={1}
                                    />
                                </div>
                            ) : (
                                <IntWidget
                                    className="nodrag w-12 h-5 bg-zinc-800 text-[9px] px-1 rounded border border-zinc-700 text-center"
                                    value={desiredLength > 0 ? currentIndex : 0}
                                    min={0}
                                    max={desiredLength > 0 ? desiredLength - 1 : 0}
                                    onChange={(val) => updateConfig('arrayIndex', clampIndex(val))}
                                />
                            )}
                        </div>

                        <div className="flex-1 min-w-0 flex items-center gap-1">
                            {!isConnected && (
                                <div className="relative flex-shrink-0">
                                    <button
                                        ref={elementButtonRef}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setActiveMenu(prev => (prev === 'element' ? null : 'element'));
                                        }}
                                        className="p-0.5 text-zinc-600 hover:text-zinc-200 transition-all"
                                        title={t('Element Editor')}
                                    >
                                        <Settings size={10} />
                                    </button>
                                    {showElementEditorMenu && (
                                        <div ref={menuRef} className="nodrag absolute top-full left-0 mt-1 bg-zinc-900 border border-zinc-700 rounded shadow-xl z-50 flex flex-col p-1 min-w-[160px] animate-in fade-in zoom-in-95 duration-100 max-h-[300px] overflow-y-auto custom-scrollbar" onMouseDown={e => e.stopPropagation()}>
                                            <span className="text-[8px] font-bold text-zinc-500 uppercase px-2 py-1">{t('Element Editor')}</span>
                                            {(type === 'float[]'
                                                ? (['default', 'slider', 'number', 'angle', 'toggle', 'enum'] as const)
                                                : type === 'int[]'
                                                    ? (['default', 'slider', 'number', 'toggle', 'enum'] as const)
                                                    : type === 'uint[]'
                                                        ? (['default', 'slider', 'number'] as const)
                                                        : type === 'bool[]'
                                                            ? (['default', 'toggle'] as const)
                                                            : type === 'vec2[]'
                                                                ? (['default', 'pad', 'range'] as const)
                                                                : (['default', 'color'] as const)
                                            ).map(m => (
                                                <button
                                                    key={m}
                                                    onClick={() => {
                                                        setArrayElementWidget(m);
                                                    }}
                                                    className={`text-[10px] px-2 py-1 text-left rounded hover:bg-zinc-800 flex items-center justify-between ${(config.arrayElementWidget || 'default') === m ? 'text-blue-400 font-bold bg-zinc-800' : 'text-zinc-300'}`}
                                                >
                                                    <span>{t(m.charAt(0).toUpperCase() + m.slice(1))}</span>
                                                </button>
                                            ))}

                                            {(((type === 'float[]' || type === 'int[]' || type === 'uint[]') && (config.arrayElementWidget || 'default') === 'number') || ((config.arrayElementWidget || 'default') === 'default' && !(type === 'float[]' || type === 'int[]' || type === 'uint[]' || type === 'bool[]'))) ? (
                                                <div className="flex flex-col gap-1.5 pt-1 px-2 pb-1">
                                                    <div className="flex items-center justify-between gap-2">
                                                        <label className="text-[9px] text-zinc-400">{t('Step')}</label>
                                                        <SmartNumberInput
                                                            className="w-14 h-5 bg-zinc-950 border border-zinc-700 rounded px-1 text-[9px] text-right"
                                                            value={config.arrayElementStep ?? ((type === 'float[]') ? 0.01 : (type === 'int[]' || type === 'uint[]') ? 1 : 0.1)}
                                                            onChange={(val) => updateConfig('arrayElementStep', val)}
                                                            step={0.001}
                                                        />
                                                    </div>
                                                </div>
                                            ) : null}

                                            {(type === 'float[]' || type === 'int[]' || type === 'uint[]') && ((config.arrayElementWidget || 'default') === 'default' || (config.arrayElementWidget || 'default') === 'slider' || (config.arrayElementWidget || 'default') === 'angle') && (
                                                <div className="flex flex-col gap-1.5 pt-1 px-2 pb-1">
                                                    <div className="flex items-center justify-between gap-2">
                                                        <label className="text-[9px] text-zinc-400">{t('Min')}</label>
                                                        <SmartNumberInput
                                                            className="w-14 h-5 bg-zinc-950 border border-zinc-700 rounded px-1 text-[9px] text-right"
                                                            value={config.arrayElementMin ?? 0}
                                                            onChange={(val) => updateConfig('arrayElementMin', val)}
                                                            step={0.1}
                                                        />
                                                    </div>
                                                    <div className="flex items-center justify-between gap-2">
                                                        <label className="text-[9px] text-zinc-400">{t('Max')}</label>
                                                        <SmartNumberInput
                                                            className="w-14 h-5 bg-zinc-950 border border-zinc-700 rounded px-1 text-[9px] text-right"
                                                            value={config.arrayElementMax ?? (type === 'float[]' ? 1 : 10)}
                                                            onChange={(val) => updateConfig('arrayElementMax', val)}
                                                            step={0.1}
                                                        />
                                                    </div>
                                                    <div className="flex items-center justify-between gap-2">
                                                        <label className="text-[9px] text-zinc-400">{t('Step')}</label>
                                                        <SmartNumberInput
                                                            className="w-14 h-5 bg-zinc-950 border border-zinc-700 rounded px-1 text-[9px] text-right"
                                                            value={config.arrayElementRangeStep ?? (type === 'float[]' ? 0.01 : 1)}
                                                            onChange={(val) => updateConfig('arrayElementRangeStep', val)}
                                                            step={0.001}
                                                        />
                                                    </div>
                                                </div>
                                            )}

                                            {(type === 'float[]' || type === 'int[]') && (config.arrayElementWidget || 'default') === 'enum' && (
                                                <div className="flex flex-col pt-1 px-2 pb-1 gap-1.5">
                                                    <span className="text-[8px] font-bold text-zinc-500 uppercase">{t('Options')}</span>
                                                    {(config.enumOptions || []).map((opt, i) => (
                                                        <div key={i} className="flex items-center gap-1">
                                                            <input
                                                                className="flex-1 bg-zinc-950 border border-zinc-700 rounded px-1 py-0.5 text-[9px] text-zinc-300 outline-none focus:border-blue-500"
                                                                value={opt.label}
                                                                onChange={(e) => {
                                                                    const newOpts = [...(config.enumOptions || [])];
                                                                    newOpts[i] = { ...newOpts[i], label: e.target.value };
                                                                    updateConfig('enumOptions', newOpts);
                                                                }}
                                                                placeholder="Label"
                                                            />
                                                            <SmartNumberInput
                                                                className="w-10 h-5 bg-zinc-950 border border-zinc-700 rounded px-1 text-[9px] text-right"
                                                                value={opt.value}
                                                                onChange={(val) => {
                                                                    const newOpts = [...(config.enumOptions || [])];
                                                                    newOpts[i] = { ...newOpts[i], value: val };
                                                                    updateConfig('enumOptions', newOpts);
                                                                }}
                                                                step={type === 'int[]' ? 1 : 0.01}
                                                            />
                                                            <button
                                                                className="px-1 h-5 text-zinc-500 hover:text-zinc-200"
                                                                onClick={() => {
                                                                    const newOpts = [...(config.enumOptions || [])];
                                                                    newOpts.splice(i, 1);
                                                                    updateConfig('enumOptions', newOpts);
                                                                }}
                                                                title={t('Remove')}
                                                            >
                                                                <Trash2 size={10} />
                                                            </button>
                                                        </div>
                                                    ))}
                                                    <button
                                                        className="text-[9px] px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-left"
                                                        onClick={() => {
                                                            const next = [...(config.enumOptions || [])];
                                                            next.push({ label: `Option ${String.fromCharCode(65 + next.length)}`, value: next.length });
                                                            updateConfig('enumOptions', next);
                                                        }}
                                                    >
                                                        {t('Add Option')}
                                                    </button>
                                                </div>
                                            )}

                                            {type === 'vec2[]' && (config.arrayElementWidget || 'default') === 'range' && (
                                                <div className="flex flex-col gap-1.5 pt-1 px-2 pb-1">
                                                    <div className="flex items-center justify-between gap-2">
                                                        <label className="text-[9px] text-zinc-400">{t('Min')}</label>
                                                        <SmartNumberInput
                                                            className="w-14 h-5 bg-zinc-950 border border-zinc-700 rounded px-1 text-[9px] text-right"
                                                            value={config.arrayElementMin ?? 0}
                                                            onChange={(val) => updateConfig('arrayElementMin', val)}
                                                            step={0.1}
                                                        />
                                                    </div>
                                                    <div className="flex items-center justify-between gap-2">
                                                        <label className="text-[9px] text-zinc-400">{t('Max')}</label>
                                                        <SmartNumberInput
                                                            className="w-14 h-5 bg-zinc-950 border border-zinc-700 rounded px-1 text-[9px] text-right"
                                                            value={config.arrayElementMax ?? 100}
                                                            onChange={(val) => updateConfig('arrayElementMax', val)}
                                                            step={0.1}
                                                        />
                                                    </div>
                                                    <div className="flex items-center justify-between gap-2">
                                                        <label className="text-[9px] text-zinc-400">{t('Step')}</label>
                                                        <SmartNumberInput
                                                            className="w-14 h-5 bg-zinc-950 border border-zinc-700 rounded px-1 text-[9px] text-right"
                                                            value={config.arrayElementRangeStep ?? 0.1}
                                                            onChange={(val) => updateConfig('arrayElementRangeStep', val)}
                                                            step={0.001}
                                                        />
                                                    </div>
                                                </div>
                                            )}

                                            {type === 'vec2[]' && (config.arrayElementWidget || 'default') === 'pad' && (
                                                <div className="flex flex-col gap-1.5 pt-1 px-2 pb-1">
                                                    <div className="flex items-center justify-between gap-2">
                                                        <label className="text-[9px] text-zinc-400">{t('Min X')}</label>
                                                        <SmartNumberInput
                                                            className="w-14 h-5 bg-zinc-950 border border-zinc-700 rounded px-1 text-[9px] text-right"
                                                            value={config.arrayElementMinX ?? 0}
                                                            onChange={(val) => updateConfig('arrayElementMinX', val)}
                                                            step={0.1}
                                                        />
                                                    </div>
                                                    <div className="flex items-center justify-between gap-2">
                                                        <label className="text-[9px] text-zinc-400">{t('Max X')}</label>
                                                        <SmartNumberInput
                                                            className="w-14 h-5 bg-zinc-950 border border-zinc-700 rounded px-1 text-[9px] text-right"
                                                            value={config.arrayElementMaxX ?? 1}
                                                            onChange={(val) => updateConfig('arrayElementMaxX', val)}
                                                            step={0.1}
                                                        />
                                                    </div>
                                                    <div className="flex items-center justify-between gap-2">
                                                        <label className="text-[9px] text-zinc-400">{t('Min Y')}</label>
                                                        <SmartNumberInput
                                                            className="w-14 h-5 bg-zinc-950 border border-zinc-700 rounded px-1 text-[9px] text-right"
                                                            value={config.arrayElementMinY ?? 0}
                                                            onChange={(val) => updateConfig('arrayElementMinY', val)}
                                                            step={0.1}
                                                        />
                                                    </div>
                                                    <div className="flex items-center justify-between gap-2">
                                                        <label className="text-[9px] text-zinc-400">{t('Max Y')}</label>
                                                        <SmartNumberInput
                                                            className="w-14 h-5 bg-zinc-950 border border-zinc-700 rounded px-1 text-[9px] text-right"
                                                            value={config.arrayElementMaxY ?? 1}
                                                            onChange={(val) => updateConfig('arrayElementMaxY', val)}
                                                            step={0.1}
                                                        />
                                                    </div>
                                                </div>
                                            )}

                                        </div>
                                    )}
                                </div>
                            )}

                            <div className="flex-1 min-w-0">
                                {desiredLength <= 0 ? (
                                    <div className="text-[9px] text-zinc-500 italic">{t('Empty array')}</div>
                                ) : isScalarArray ? (
                                    elementWidget === 'toggle' ? (
                                        (() => {
                                            const isChecked = Math.abs(Number(currentVec[0] ?? 0)) >= 0.5;
                                            return (
                                                <button 
                                                    className={`nodrag flex items-center gap-2 w-full px-2 py-1 rounded border transition-colors ${isChecked ? 'bg-blue-900/30 border-blue-500/50' : 'bg-zinc-900 border-zinc-700'}`}
                                                    onClick={() => updateAtIndex([isChecked ? 0 : 1])}
                                                >
                                                    {isChecked ? <CheckSquare size={12} className="text-blue-400"/> : <Square size={12} className="text-zinc-600"/>}
                                                    <span className={`text-[10px] ${isChecked ? 'text-blue-200' : 'text-zinc-500'}`}>{isChecked ? 'On (1)' : 'Off (0)'}</span>
                                                </button>
                                            );
                                        })()
                                    ) : elementWidget === 'enum' ? (
                                        <select
                                            className="nodrag w-full bg-zinc-800 text-[10px] px-1 py-1 rounded border border-zinc-700 outline-none focus:border-blue-500"
                                            value={currentVec[0] ?? 0}
                                            onChange={(e) => updateAtIndex([parseFloat(e.target.value)])}
                                        >
                                            {(config.enumOptions || []).map((opt, i) => (
                                                <option key={i} value={opt.value}>{t(opt.label)}</option>
                                            ))}
                                        </select>
                                    ) : elementWidget === 'number' ? (
                                        <SmartNumberInput
                                            className="nodrag w-full h-5 bg-zinc-800 text-[9px] px-1 rounded border border-zinc-700"
                                            value={currentVec[0] ?? 0}
                                            onChange={(val) => updateAtIndex([val])}
                                            step={elementStep}
                                        />
                                    ) : elementWidget === 'angle' ? (
                                        <AngleWidget
                                            value={currentVec[0] ?? 0}
                                            onChange={(v) => updateAtIndex([Number(v)])}
                                            min={scalarMin}
                                            max={scalarMax}
                                            step={scalarStep}
                                        />
                                    ) : (
                                        <SliderWidget
                                            value={currentVec[0] ?? 0}
                                            onChange={(v) => {
                                                const nextMinRaw = Math.min(scalarMin, v);
                                                const nextMin = isUintArray ? Math.max(0, nextMinRaw) : nextMinRaw;
                                                const nextMax = Math.max(scalarMax, v);
                                                if (nextMin !== scalarMin || nextMax !== scalarMax) {
                                                    onUpdateConfig(mode, { ...config, arrayElementMin: nextMin, arrayElementMax: nextMax });
                                                }
                                                updateAtIndex([v]);
                                            }}
                                            min={scalarMin}
                                            max={scalarMax}
                                            step={scalarStep}
                                        />
                                    )
                                ) : type === 'vec2[]' && elementWidget === 'pad' ? (
                                    <PadWidget
                                        value={currentVec}
                                        onChange={(v) => updateAtIndex([v[0] ?? 0, v[1] ?? 0])}
                                        minX={padMinX}
                                        maxX={padMaxX}
                                        minY={padMinY}
                                        maxY={padMaxY}
                                    />
                                ) : type === 'vec2[]' && elementWidget === 'range' ? (
                                    <RangeWidget
                                        value={currentVec}
                                        onChange={(v) => updateAtIndex([v[0] ?? 0, v[1] ?? 0])}
                                        min={rangeMin}
                                        max={rangeMax}
                                        step={rangeStep}
                                    />
                                ) : (type === 'vec3[]' || type === 'vec4[]') && elementWidget === 'color' ? (
                                    <ColorWidget
                                        value={currentVec}
                                        onChange={(v) => updateAtIndex(v)}
                                        alpha={type === 'vec4[]'}
                                    />
                                ) : type === 'vec3[]' ? (
                                    <Vec3Widget value={currentVec} step={elementStep} className="flex gap-1" onChange={(v) => updateAtIndex(v)} />
                                ) : type === 'vec4[]' ? (
                                    <Vec4Widget value={currentVec} step={elementStep} className="w-full" onChange={(v) => updateAtIndex(v)} />
                                ) : (
                                    <Vec2Widget value={currentVec} step={elementStep} className="flex gap-1" onChange={(v) => updateAtIndex(v)} />
                                )}
                            </div>
                        </div>
                    </div>
                );
            }

            if (mode === 'expanded' || mode === 'default') {
                const raw = Array.isArray(uniform.value) ? (uniform.value as unknown[]) : [];
                const isScalarArray = type === 'float[]' || type === 'int[]' || type === 'uint[]' || type === 'bool[]';
                const isFloatArray = type === 'float[]';
                const isIntArray = type === 'int[]';
                const isUintArray = type === 'uint[]';
                const isBoolArray = type === 'bool[]';

                const valuesScalar = isScalarArray
                    ? (raw.map(v => {
                        const n = Number(v);
                        return Number.isFinite(n) ? n : 0;
                    }) as number[])
                    : [];
                const valuesVec = !isScalarArray
                    ? (raw.filter(v => Array.isArray(v)) as number[][])
                    : [];
                const length = isScalarArray ? valuesScalar.length : valuesVec.length;

                const clampLen = (n: number) => {
                    if (!Number.isFinite(n)) return 1;
                    const rounded = Math.round(n);
                    return Math.max(1, rounded);
                };

                const desiredLengthRaw = typeof config.arrayLength === 'number' && Number.isFinite(config.arrayLength)
                    ? config.arrayLength
                    : length;
                const desiredLength = clampLen(desiredLengthRaw);

                const vecSize = isScalarArray ? 1 : type === 'vec2[]' ? 2 : type === 'vec3[]' ? 3 : 4;

                const elementStep = typeof config.arrayElementStep === 'number' && Number.isFinite(config.arrayElementStep)
                    ? config.arrayElementStep
                    : (isScalarArray ? (isFloatArray ? 0.01 : 1) : 0.1);

                const rangeMin = typeof config.arrayElementMin === 'number' && Number.isFinite(config.arrayElementMin)
                    ? config.arrayElementMin
                    : 0;
                const rangeMax = typeof config.arrayElementMax === 'number' && Number.isFinite(config.arrayElementMax)
                    ? config.arrayElementMax
                    : 100;
                const rangeStep = typeof config.arrayElementRangeStep === 'number' && Number.isFinite(config.arrayElementRangeStep)
                    ? config.arrayElementRangeStep
                    : 0.1;

                const scalarMin = typeof config.arrayElementMin === 'number' && Number.isFinite(config.arrayElementMin)
                    ? config.arrayElementMin
                    : 0;
                const scalarMax = typeof config.arrayElementMax === 'number' && Number.isFinite(config.arrayElementMax)
                    ? config.arrayElementMax
                    : (isFloatArray ? 1 : 10);
                const scalarStep = typeof config.arrayElementRangeStep === 'number' && Number.isFinite(config.arrayElementRangeStep)
                    ? config.arrayElementRangeStep
                    : (isFloatArray ? 0.01 : 1);

                const padMinX = typeof config.arrayElementMinX === 'number' && Number.isFinite(config.arrayElementMinX)
                    ? config.arrayElementMinX
                    : 0;
                const padMaxX = typeof config.arrayElementMaxX === 'number' && Number.isFinite(config.arrayElementMaxX)
                    ? config.arrayElementMaxX
                    : 1;
                const padMinY = typeof config.arrayElementMinY === 'number' && Number.isFinite(config.arrayElementMinY)
                    ? config.arrayElementMinY
                    : 0;
                const padMaxY = typeof config.arrayElementMaxY === 'number' && Number.isFinite(config.arrayElementMaxY)
                    ? config.arrayElementMaxY
                    : 1;

                const resizeArrayTo = (nextLen: number) => {
                    const targetLen = clampLen(nextLen);
                    if (targetLen === length) {
                        onUpdateConfig(mode, { ...config, arrayLength: targetLen });
                        return;
                    }
                    if (isScalarArray) {
                        const next = Array.from({ length: targetLen }, (_, i) => {
                            const n = Number(valuesScalar[i]);
                            return Number.isFinite(n) ? n : 0;
                        });
                        onUpdateValue(next);
                    } else {
                        const next = Array.from({ length: targetLen }, (_, i) => {
                            const src = Array.isArray(valuesVec[i]) ? valuesVec[i] : [];
                            return Array.from({ length: vecSize }, (_, j) => {
                                const n = Number((src as any)[j]);
                                return Number.isFinite(n) ? n : 0;
                            });
                        });
                        onUpdateValue(next);
                    }
                    onUpdateConfig(mode, { ...config, arrayLength: targetLen });
                };

                const elementWidgetRaw = config.arrayElementWidget || 'default';
                const elementWidget = (() => {
                    if (type === 'float[]') {
                        return (elementWidgetRaw === 'default' || elementWidgetRaw === 'slider' || elementWidgetRaw === 'number' || elementWidgetRaw === 'angle' || elementWidgetRaw === 'toggle' || elementWidgetRaw === 'enum')
                            ? elementWidgetRaw
                            : 'default';
                    }
                    if (type === 'int[]') {
                        return (elementWidgetRaw === 'default' || elementWidgetRaw === 'slider' || elementWidgetRaw === 'number' || elementWidgetRaw === 'toggle' || elementWidgetRaw === 'enum')
                            ? elementWidgetRaw
                            : 'default';
                    }
                    if (type === 'uint[]') {
                        return (elementWidgetRaw === 'default' || elementWidgetRaw === 'slider' || elementWidgetRaw === 'number')
                            ? elementWidgetRaw
                            : 'default';
                    }
                    if (type === 'bool[]') {
                        return 'toggle';
                    }
                    if (type === 'vec2[]') {
                        return (elementWidgetRaw === 'pad' || elementWidgetRaw === 'range' || elementWidgetRaw === 'default') ? elementWidgetRaw : 'default';
                    }
                    return (elementWidgetRaw === 'color' || elementWidgetRaw === 'default') ? elementWidgetRaw : 'default';
                })();

                const setArrayElementWidget = (m: WidgetConfig['arrayElementWidget']) => {
                    const nextConfig: WidgetConfig = { ...config, arrayElementWidget: m };
                    if (m === 'enum' && (!config.enumOptions || config.enumOptions.length === 0)) {
                        nextConfig.enumOptions = [
                            { label: 'Option A', value: 0 },
                            { label: 'Option B', value: 1 }
                        ];
                    }
                    onUpdateConfig(mode, nextConfig);
                };

                const getVecAt = (idx: number) => {
                    if (desiredLength <= 0) return Array.from({ length: vecSize }, () => 0);
                    const i = Math.max(0, Math.min(desiredLength - 1, Math.round(idx)));
                    if (isScalarArray) {
                        const n = Number(valuesScalar[i]);
                        return [Number.isFinite(n) ? n : 0];
                    }
                    const current = Array.isArray(valuesVec[i]) ? valuesVec[i] : [];
                    return Array.from({ length: vecSize }, (_, j) => {
                        const n = Number((current as any)[j]);
                        return Number.isFinite(n) ? n : 0;
                    });
                };

                const updateAt = (idx: number, nextVec: number[]) => {
                    if (desiredLength <= 0) return;
                    const i = Math.max(0, Math.min(desiredLength - 1, Math.round(idx)));
                    if (isScalarArray) {
                        const next = [...valuesScalar];
                        const n = Number(nextVec[0]);
                        const clean = Number.isFinite(n) ? n : 0;
                        if (isBoolArray) next[i] = Math.abs(clean) >= 0.5 ? 1 : 0;
                        else if (isUintArray) next[i] = Math.max(0, Math.round(clean));
                        else if (isIntArray) next[i] = Math.round(clean);
                        else next[i] = clean;
                        onUpdateValue(next);
                        return;
                    }
                    const next = [...valuesVec];
                    next[i] = Array.from({ length: vecSize }, (_, j) => {
                        const n = Number(nextVec[j]);
                        return Number.isFinite(n) ? n : 0;
                    });
                    onUpdateValue(next);
                };

                const renderElementEditor = (idx: number) => {
                    const currentVec = getVecAt(idx);
                    const elementHandleId = `${input.id}__${idx}`;
                    const elementConnected = Boolean(connectedTargetHandles?.has(elementHandleId));

                    return (
                        <div key={elementHandleId} className="relative flex items-center gap-2 pl-5">
                            <Handle
                                type="target"
                                position={Position.Left}
                                id={elementHandleId}
                                className="!w-5 !h-5 !-left-0.5 !top-1/2 !-mt-2 !transform-none !bg-transparent !border-0 after:content-[''] after:absolute after:top-1/2 after:left-1/2 after:-translate-x-1/2 after:-translate-y-1/2 after:w-2.5 after:h-2.5 after:rounded-full after:border-2 after:transition-transform hover:after:scale-125 after:bg-[var(--handle-bg)] after:border-[var(--handle-color)]"
                                style={{ '--handle-bg': elementConnected ? typeColor : '#18181b', '--handle-color': typeColor } as React.CSSProperties}
                            />
                            <div className="w-7 text-[9px] text-zinc-500 font-mono flex-shrink-0">[{idx}]</div>
                            <div className={`flex-1 min-w-0 ${elementConnected ? 'opacity-30 pointer-events-none grayscale' : ''}`}
                            >
                                {desiredLength <= 0 ? (
                                    <div className="text-[9px] text-zinc-500 italic">{t('Empty array')}</div>
                                ) : isScalarArray ? (
                                    elementWidget === 'toggle' ? (
                                        (() => {
                                            const isChecked = Math.abs(Number(currentVec[0] ?? 0)) >= 0.5;
                                            return (
                                                <button
                                                    className={`nodrag flex items-center gap-2 w-full px-2 py-1 rounded border transition-colors ${isChecked ? 'bg-blue-900/30 border-blue-500/50' : 'bg-zinc-900 border-zinc-700'}`}
                                                    onClick={() => updateAt(idx, [isChecked ? 0 : 1])}
                                                >
                                                    {isChecked ? <CheckSquare size={12} className="text-blue-400"/> : <Square size={12} className="text-zinc-600"/>}
                                                    <span className={`text-[10px] ${isChecked ? 'text-blue-200' : 'text-zinc-500'}`}>{isChecked ? 'On (1)' : 'Off (0)'}</span>
                                                </button>
                                            );
                                        })()
                                    ) : elementWidget === 'enum' ? (
                                        <select
                                            className="nodrag w-full bg-zinc-800 text-[10px] px-1 py-1 rounded border border-zinc-700 outline-none focus:border-blue-500"
                                            value={currentVec[0] ?? 0}
                                            onChange={(e) => updateAt(idx, [parseFloat(e.target.value)])}
                                        >
                                            {(config.enumOptions || []).map((opt, i) => (
                                                <option key={i} value={opt.value}>{t(opt.label)}</option>
                                            ))}
                                        </select>
                                    ) : elementWidget === 'number' ? (
                                        <SmartNumberInput
                                            className="nodrag w-full h-5 bg-zinc-800 text-[9px] px-1 rounded border border-zinc-700"
                                            value={currentVec[0] ?? 0}
                                            onChange={(val) => updateAt(idx, [val])}
                                            step={elementStep}
                                        />
                                    ) : elementWidget === 'angle' ? (
                                        <AngleWidget
                                            value={currentVec[0] ?? 0}
                                            onChange={(v) => updateAt(idx, [Number(v)])}
                                            min={scalarMin}
                                            max={scalarMax}
                                            step={scalarStep}
                                        />
                                    ) : (
                                        <SliderWidget
                                            value={currentVec[0] ?? 0}
                                            onChange={(v) => {
                                                const nextMinRaw = Math.min(scalarMin, v);
                                                const nextMin = isUintArray ? Math.max(0, nextMinRaw) : nextMinRaw;
                                                const nextMax = Math.max(scalarMax, v);
                                                if (nextMin !== scalarMin || nextMax !== scalarMax) {
                                                    onUpdateConfig(mode, { ...config, arrayElementMin: nextMin, arrayElementMax: nextMax });
                                                }
                                                updateAt(idx, [v]);
                                            }}
                                            min={scalarMin}
                                            max={scalarMax}
                                            step={scalarStep}
                                        />
                                    )
                                ) : type === 'vec2[]' && elementWidget === 'pad' ? (
                                    <PadWidget
                                        value={currentVec}
                                        onChange={(v) => updateAt(idx, [v[0] ?? 0, v[1] ?? 0])}
                                        minX={padMinX}
                                        maxX={padMaxX}
                                        minY={padMinY}
                                        maxY={padMaxY}
                                    />
                                ) : type === 'vec2[]' && elementWidget === 'range' ? (
                                    <RangeWidget
                                        value={currentVec}
                                        onChange={(v) => updateAt(idx, [v[0] ?? 0, v[1] ?? 0])}
                                        min={rangeMin}
                                        max={rangeMax}
                                        step={rangeStep}
                                    />
                                ) : (type === 'vec3[]' || type === 'vec4[]') && elementWidget === 'color' ? (
                                    <ColorWidget
                                        value={currentVec}
                                        onChange={(v) => updateAt(idx, v)}
                                        alpha={type === 'vec4[]'}
                                    />
                                ) : type === 'vec3[]' ? (
                                    <Vec3Widget value={currentVec} step={elementStep} className="flex gap-1" onChange={(v) => updateAt(idx, v)} />
                                ) : type === 'vec4[]' ? (
                                    <Vec4Widget value={currentVec} step={elementStep} className="w-full" onChange={(v) => updateAt(idx, v)} />
                                ) : (
                                    <Vec2Widget value={currentVec} step={elementStep} className="flex gap-1" onChange={(v) => updateAt(idx, v)} />
                                )}
                            </div>
                            {elementConnected && (
                                <span className="ml-1 text-[9px] text-zinc-600 bg-zinc-900 border border-zinc-800 px-1 rounded flex-shrink-0">{t('LINKED')}</span>
                            )}
                        </div>
                    );
                };

                return (
                    <div className="flex flex-col gap-1 w-full">
                        {!isConnected && (
                            <div className="flex items-center gap-2">
                                <div className="flex items-center gap-1 flex-shrink-0">
                                    <span className="text-[8px] text-zinc-500 font-bold uppercase">{t('Len')}</span>
                                    <IntWidget
                                        className="nodrag w-12 h-5 bg-zinc-800 text-[9px] px-1 rounded border border-zinc-700 text-center"
                                        value={desiredLength}
                                        min={1}
                                        onChange={(val) => resizeArrayTo(val)}
                                    />
                                </div>
                                <div className="relative flex-shrink-0">
                                    <button
                                        ref={elementButtonRef}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setActiveMenu(prev => (prev === 'element' ? null : 'element'));
                                        }}
                                        className="p-0.5 text-zinc-600 hover:text-zinc-200 transition-all"
                                        title={t('Element Editor')}
                                    >
                                        <Settings size={10} />
                                    </button>
                                    {showElementEditorMenu && (
                                        <div ref={menuRef} className="nodrag absolute top-full left-0 mt-1 bg-zinc-900 border border-zinc-700 rounded shadow-xl z-50 flex flex-col p-1 min-w-[160px] animate-in fade-in zoom-in-95 duration-100 max-h-[300px] overflow-y-auto custom-scrollbar" onMouseDown={e => e.stopPropagation()}>
                                            <span className="text-[8px] font-bold text-zinc-500 uppercase px-2 py-1">{t('Element Editor')}</span>
                                            {(type === 'float[]'
                                                ? (['default', 'slider', 'number', 'angle', 'toggle', 'enum'] as const)
                                                : type === 'int[]'
                                                    ? (['default', 'slider', 'number', 'toggle', 'enum'] as const)
                                                    : type === 'uint[]'
                                                        ? (['default', 'slider', 'number'] as const)
                                                        : type === 'bool[]'
                                                            ? (['default', 'toggle'] as const)
                                                            : type === 'vec2[]'
                                                                ? (['default', 'pad', 'range'] as const)
                                                                : (['default', 'color'] as const)
                                            ).map(m => (
                                                <button
                                                    key={m}
                                                    onClick={() => {
                                                        setArrayElementWidget(m);
                                                    }}
                                                    className={`text-[10px] px-2 py-1 text-left rounded hover:bg-zinc-800 flex items-center justify-between ${(config.arrayElementWidget || 'default') === m ? 'text-blue-400 font-bold bg-zinc-800' : 'text-zinc-300'}`}
                                                >
                                                    <span>{t(m.charAt(0).toUpperCase() + m.slice(1))}</span>
                                                </button>
                                            ))}

                                            {(((type === 'float[]' || type === 'int[]' || type === 'uint[]') && (config.arrayElementWidget || 'default') === 'number') || ((config.arrayElementWidget || 'default') === 'default' && !(type === 'float[]' || type === 'int[]' || type === 'uint[]' || type === 'bool[]'))) ? (
                                                <div className="flex flex-col gap-1.5 pt-1 px-2 pb-1">
                                                    <div className="flex items-center justify-between gap-2">
                                                        <label className="text-[9px] text-zinc-400">{t('Step')}</label>
                                                        <SmartNumberInput
                                                            className="w-14 h-5 bg-zinc-950 border border-zinc-700 rounded px-1 text-[9px] text-right"
                                                            value={config.arrayElementStep ?? ((type === 'float[]') ? 0.01 : (type === 'int[]' || type === 'uint[]') ? 1 : 0.1)}
                                                            onChange={(val) => updateConfig('arrayElementStep', val)}
                                                            step={0.001}
                                                        />
                                                    </div>
                                                </div>
                                            ) : null}

                                            {(type === 'float[]' || type === 'int[]' || type === 'uint[]') && ((config.arrayElementWidget || 'default') === 'default' || (config.arrayElementWidget || 'default') === 'slider' || (config.arrayElementWidget || 'default') === 'angle') && (
                                                <div className="flex flex-col gap-1.5 pt-1 px-2 pb-1">
                                                    <div className="flex items-center justify-between gap-2">
                                                        <label className="text-[9px] text-zinc-400">{t('Min')}</label>
                                                        <SmartNumberInput
                                                            className="w-14 h-5 bg-zinc-950 border border-zinc-700 rounded px-1 text-[9px] text-right"
                                                            value={config.arrayElementMin ?? 0}
                                                            onChange={(val) => updateConfig('arrayElementMin', val)}
                                                            step={0.1}
                                                        />
                                                    </div>
                                                    <div className="flex items-center justify-between gap-2">
                                                        <label className="text-[9px] text-zinc-400">{t('Max')}</label>
                                                        <SmartNumberInput
                                                            className="w-14 h-5 bg-zinc-950 border border-zinc-700 rounded px-1 text-[9px] text-right"
                                                            value={config.arrayElementMax ?? (type === 'float[]' ? 1 : 10)}
                                                            onChange={(val) => updateConfig('arrayElementMax', val)}
                                                            step={0.1}
                                                        />
                                                    </div>
                                                    <div className="flex items-center justify-between gap-2">
                                                        <label className="text-[9px] text-zinc-400">{t('Step')}</label>
                                                        <SmartNumberInput
                                                            className="w-14 h-5 bg-zinc-950 border border-zinc-700 rounded px-1 text-[9px] text-right"
                                                            value={config.arrayElementRangeStep ?? (type === 'float[]' ? 0.01 : 1)}
                                                            onChange={(val) => updateConfig('arrayElementRangeStep', val)}
                                                            step={0.001}
                                                        />
                                                    </div>
                                                </div>
                                            )}

                                            {(type === 'float[]' || type === 'int[]') && (config.arrayElementWidget || 'default') === 'enum' && (
                                                <div className="flex flex-col pt-1 px-2 pb-1 gap-1.5">
                                                    <span className="text-[8px] font-bold text-zinc-500 uppercase">{t('Options')}</span>
                                                    {(config.enumOptions || []).map((opt, i) => (
                                                        <div key={i} className="flex items-center gap-1">
                                                            <input
                                                                className="flex-1 bg-zinc-950 border border-zinc-700 rounded px-1 py-0.5 text-[9px] text-zinc-300 outline-none focus:border-blue-500"
                                                                value={opt.label}
                                                                onChange={(e) => {
                                                                    const newOpts = [...(config.enumOptions || [])];
                                                                    newOpts[i] = { ...newOpts[i], label: e.target.value };
                                                                    updateConfig('enumOptions', newOpts);
                                                                }}
                                                                placeholder="Label"
                                                            />
                                                            <SmartNumberInput
                                                                className="w-10 h-5 bg-zinc-950 border border-zinc-700 rounded px-1 text-[9px] text-right"
                                                                value={opt.value}
                                                                onChange={(val) => {
                                                                    const newOpts = [...(config.enumOptions || [])];
                                                                    newOpts[i] = { ...newOpts[i], value: val };
                                                                    updateConfig('enumOptions', newOpts);
                                                                }}
                                                                step={type === 'int[]' ? 1 : 0.01}
                                                            />
                                                            <button
                                                                className="px-1 h-5 text-zinc-500 hover:text-zinc-200"
                                                                onClick={() => {
                                                                    const newOpts = [...(config.enumOptions || [])];
                                                                    newOpts.splice(i, 1);
                                                                    updateConfig('enumOptions', newOpts);
                                                                }}
                                                                title={t('Remove')}
                                                            >
                                                                <Trash2 size={10} />
                                                            </button>
                                                        </div>
                                                    ))}
                                                    <button
                                                        className="text-[9px] px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-left"
                                                        onClick={() => {
                                                            const next = [...(config.enumOptions || [])];
                                                            next.push({ label: `Option ${String.fromCharCode(65 + next.length)}`, value: next.length });
                                                            updateConfig('enumOptions', next);
                                                        }}
                                                    >
                                                        {t('Add Option')}
                                                    </button>
                                                </div>
                                            )}

                                            {type === 'vec2[]' && (config.arrayElementWidget || 'default') === 'range' && (
                                                <div className="flex flex-col gap-1.5 pt-1 px-2 pb-1">
                                                    <div className="flex items-center justify-between gap-2">
                                                        <label className="text-[9px] text-zinc-400">{t('Min')}</label>
                                                        <SmartNumberInput
                                                            className="w-14 h-5 bg-zinc-950 border border-zinc-700 rounded px-1 text-[9px] text-right"
                                                            value={config.arrayElementMin ?? 0}
                                                            onChange={(val) => updateConfig('arrayElementMin', val)}
                                                            step={0.1}
                                                        />
                                                    </div>
                                                    <div className="flex items-center justify-between gap-2">
                                                        <label className="text-[9px] text-zinc-400">{t('Max')}</label>
                                                        <SmartNumberInput
                                                            className="w-14 h-5 bg-zinc-950 border border-zinc-700 rounded px-1 text-[9px] text-right"
                                                            value={config.arrayElementMax ?? 100}
                                                            onChange={(val) => updateConfig('arrayElementMax', val)}
                                                            step={0.1}
                                                        />
                                                    </div>
                                                    <div className="flex items-center justify-between gap-2">
                                                        <label className="text-[9px] text-zinc-400">{t('Step')}</label>
                                                        <SmartNumberInput
                                                            className="w-14 h-5 bg-zinc-950 border border-zinc-700 rounded px-1 text-[9px] text-right"
                                                            value={config.arrayElementRangeStep ?? 0.1}
                                                            onChange={(val) => updateConfig('arrayElementRangeStep', val)}
                                                            step={0.001}
                                                        />
                                                    </div>
                                                </div>
                                            )}

                                            {type === 'vec2[]' && (config.arrayElementWidget || 'default') === 'pad' && (
                                                <div className="flex flex-col gap-1.5 pt-1 px-2 pb-1">
                                                    <div className="flex items-center justify-between gap-2">
                                                        <label className="text-[9px] text-zinc-400">{t('Min X')}</label>
                                                        <SmartNumberInput
                                                            className="w-14 h-5 bg-zinc-950 border border-zinc-700 rounded px-1 text-[9px] text-right"
                                                            value={config.arrayElementMinX ?? 0}
                                                            onChange={(val) => updateConfig('arrayElementMinX', val)}
                                                            step={0.1}
                                                        />
                                                    </div>
                                                    <div className="flex items-center justify-between gap-2">
                                                        <label className="text-[9px] text-zinc-400">{t('Max X')}</label>
                                                        <SmartNumberInput
                                                            className="w-14 h-5 bg-zinc-950 border border-zinc-700 rounded px-1 text-[9px] text-right"
                                                            value={config.arrayElementMaxX ?? 1}
                                                            onChange={(val) => updateConfig('arrayElementMaxX', val)}
                                                            step={0.1}
                                                        />
                                                    </div>
                                                    <div className="flex items-center justify-between gap-2">
                                                        <label className="text-[9px] text-zinc-400">{t('Min Y')}</label>
                                                        <SmartNumberInput
                                                            className="w-14 h-5 bg-zinc-950 border border-zinc-700 rounded px-1 text-[9px] text-right"
                                                            value={config.arrayElementMinY ?? 0}
                                                            onChange={(val) => updateConfig('arrayElementMinY', val)}
                                                            step={0.1}
                                                        />
                                                    </div>
                                                    <div className="flex items-center justify-between gap-2">
                                                        <label className="text-[9px] text-zinc-400">{t('Max Y')}</label>
                                                        <SmartNumberInput
                                                            className="w-14 h-5 bg-zinc-950 border border-zinc-700 rounded px-1 text-[9px] text-right"
                                                            value={config.arrayElementMaxY ?? 1}
                                                            onChange={(val) => updateConfig('arrayElementMaxY', val)}
                                                            step={0.1}
                                                        />
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        <div className="flex flex-col gap-1">
                            {Array.from({ length: desiredLength }, (_, i) => renderElementEditor(i))}
                        </div>
                    </div>
                );
            }

            if (type === 'vec2[]' && mode === 'bezier_grid') {
                return (
                    <div className="w-full aspect-square relative border border-zinc-800 rounded overflow-hidden bg-black">
                         <ShaderPreview 
                            data={compiledData}
                            className="w-full h-full"
                            uniforms={allUniforms}
                            onUpdateUniform={(k, v) => { if(k === input.id) onUpdateValue(v); }}
                            activeUniformId={input.id}
                            definitionId={definitionId}
                        />
                    </div>
                );
            }
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
                                          ref={mainButtonRef}
                                          onClick={(e) => { e.stopPropagation(); setActiveMenu(prev => (prev === 'main' ? null : 'main')); }}
                                className={`p-0.5 hover:text-zinc-200 transition-all ${showMenu ? 'text-blue-400 opacity-100' : `opacity-0 group-hover/param:opacity-100 ${mode === 'hidden' ? 'text-blue-400' : 'text-zinc-600'}`}`}
                             >
                                 <Settings size={10} />
                             </button>
                             {showMenu && (
                                    <div ref={menuRef} className="nodrag absolute top-full left-0 mt-1 bg-zinc-900 border border-zinc-700 rounded shadow-xl z-50 flex flex-col p-1 min-w-[160px] animate-in fade-in zoom-in-95 duration-100 max-h-[300px] overflow-y-auto custom-scrollbar" onMouseDown={e => e.stopPropagation()}>
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

                                        {/* Array index-mode sub-editor settings are now inline next to the editors. */}
                                        {/* Remaining Settings (Sliders, Enums) logic is identical to previous version, condensed here */}
                                        {((mode === 'slider' || mode === 'default' || mode === 'angle') && (input.type === 'float' || input.type === 'int')) || (mode === 'range' && input.type === 'vec2') ? (
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

                                        {mode === 'enum' && (
                                            <div className="flex flex-col border-t border-zinc-800 pt-2 gap-1.5 px-1 pb-1">
                                                <span className="text-[8px] font-bold text-zinc-500 uppercase px-1">{t("Options")}</span>
                                                {(config.enumOptions || []).map((opt, i) => (
                                                    <div key={i} className="flex items-center gap-1">
                                                        <input 
                                                            className="flex-1 bg-zinc-950 border border-zinc-700 rounded px-1 py-0.5 text-[9px] text-zinc-300 outline-none focus:border-blue-500"
                                                            value={opt.label}
                                                            onChange={(e) => {
                                                                const newOpts = [...(config.enumOptions || [])];
                                                                newOpts[i] = { ...newOpts[i], label: e.target.value };
                                                                updateConfig('enumOptions', newOpts);
                                                            }}
                                                            placeholder="Label"
                                                        />
                                                        <SmartNumberInput 
                                                            className="w-8 h-5 bg-zinc-950 border border-zinc-700 rounded px-1 text-[9px] text-right"
                                                            value={opt.value}
                                                            onChange={(val) => {
                                                                const newOpts = [...(config.enumOptions || [])];
                                                                newOpts[i] = { ...newOpts[i], value: val };
                                                                updateConfig('enumOptions', newOpts);
                                                            }}
                                                            step={1}
                                                        />
                                                        <button 
                                                            onClick={() => {
                                                                const newOpts = (config.enumOptions || []).filter((_, idx) => idx !== i);
                                                                updateConfig('enumOptions', newOpts);
                                                            }}
                                                            className="p-0.5 hover:bg-red-900/50 text-zinc-500 hover:text-red-400 rounded"
                                                        >
                                                            <X size={10} />
                                                        </button>
                                                    </div>
                                                ))}
                                                <button 
                                                    onClick={() => {
                                                        const newOpts = [...(config.enumOptions || []), { label: 'New Option', value: (config.enumOptions?.length || 0) }];
                                                        updateConfig('enumOptions', newOpts);
                                                    }}
                                                    className="mt-1 flex items-center justify-center gap-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 text-[9px] py-1 rounded border border-zinc-700 transition-colors"
                                                >
                                                    <Plus size={10} /> {t("Add Option")}
                                                </button>
                                            </div>
                                        )}
                                    </div>
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
const CustomNodeComponent = ({ id, data, selected }: NodeProps<NodeData>) => {
        const {
                setNodes,
                setEdges,
                getNodes,
                getEdges,
                onNodesDelete,
                reactFlowInstance,
                enterGroup,
                addToLibrary,
                compiledData,
        } = useProjectDispatch();
    const edges = useProjectEdges();
  const { t: tGlobal } = useTranslation();

    const connectedHandles = useMemo(() => {
            const targetHandles = new Set<string>();
            const sourceHandles = new Set<string>();

            for (const edge of edges) {
                    if (edge.target === id && edge.targetHandle) targetHandles.add(edge.targetHandle);
                    if (edge.source === id && edge.sourceHandle) sourceHandles.add(edge.sourceHandle);
            }

            return { targetHandles, sourceHandles };
    }, [edges, id]);
  
  const nodeDef = useMemo(() => data.definitionId ? getNodeDefinition(data.definitionId) : undefined, [data.definitionId]);
  const t = useNodeTranslation(nodeDef, data.locales);
  
  const [showCode, setShowCode] = useState(false);
  const [isFloatingCode, setIsFloatingCode] = useState(false);
  const [localCode, setLocalCode] = useState(data.glsl);
  const [activePassId, setActivePassId] = useState<string>('main');
  const [isEditingLabel, setIsEditingLabel] = useState(false);
  const [tempLabel, setTempLabel] = useState(data.label);
  
  const [showEditor, setShowEditor] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number } | null>(null);
  
  // Sync localCode when active pass changes or data updates
  useEffect(() => {
      if (data.passes && data.passes.length > 0) {
          const pass = data.passes.find(p => p.id === activePassId);
          if (pass) {
              if (pass.glsl !== localCode) setLocalCode(pass.glsl);
          } else {
              // Fallback to first pass if active is invalid
              if (data.passes[0].glsl !== localCode) {
                  setLocalCode(data.passes[0].glsl);
                  setActivePassId(data.passes[0].id);
              }
          }
      } else {
          // Legacy/Single pass mode
          if (data.glsl !== localCode && !showCode) { // Only sync from data if not editing (rough heuristic)
             // Actually, we should be careful here. 
             // If we just opened the node, localCode is init from data.glsl.
             // If data.glsl changes from outside (e.g. undo/redo), we want to update localCode.
             setLocalCode(data.glsl);
          }
      }
  }, [activePassId, data.passes, data.glsl, showCode]);

  const signatures = useMemo(() => {
      const glslCode = data.glsl || (data.passes && data.passes.length > 0 ? data.passes[0].glsl : '');
      return extractAllSignatures(glslCode || '');
  }, [data.glsl, data.passes]);
    const [showOverloads, setShowOverloads] = useState(false);

  const getDefaultValue = (type: GLSLType) => {
      if (type === 'vec2') return [0,0];
      if (type === 'vec3') return [1,1,1];
      if (type === 'vec4') return [1,1,1,1];
      if (type === 'sampler2D') return null;
      return 0;
  };

  const sortedSignatures = useMemo(() => {
      return signatures
          .map((sig, idx) => ({
              sig,
              idx,
              order: sig.order ?? 0,
              originalIndex: sig.originalIndex ?? idx,
          }))
          .sort((a, b) => {
              if (a.order !== b.order) return a.order - b.order;
              return a.originalIndex - b.originalIndex;
          });
  }, [signatures]);

  const currentSignatureIndex = useMemo(() => {
      if (signatures.length <= 1) return 0;

      for (let i = 0; i < signatures.length; i++) {
          const sig = signatures[i];
          if (sig.inputs.length !== data.inputs.length) continue;
          const inputsMatch = sig.inputs.every((inp, idx) =>
              inp.id === data.inputs[idx].id && inp.type === data.inputs[idx].type
          );
          if (inputsMatch) return i;
      }

      // Default overload should be the first item in sorted order.
      return sortedSignatures[0]?.idx ?? 0;
  }, [signatures, data.inputs, sortedSignatures]);

  const currentSignatureLabel = useMemo(() => {
      const entry = sortedSignatures.find(s => s.idx === currentSignatureIndex);
      const sig = entry?.sig;
      return sig?.label || null;
  }, [sortedSignatures, currentSignatureIndex]);

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

  const handleUpdateUniform = useCallback((key: string, value: any) => {
      updateNodeData((curr) => {
          const next = { ...curr.uniforms };
          if (next[key]) {
              next[key] = { ...next[key], value };
              return { uniforms: next };
          }
          return {};
      });
  }, [updateNodeData]);

  const handleSelectSignature = useCallback((index: number) => {
      if (index < 0 || index >= signatures.length || index === currentSignatureIndex) return;
      
      const sig = signatures[index];

      const mergedInputs = sig.inputs.map(inp => {
          const prev = data.inputs.find(p => p.id === inp.id);
          return { ...inp, name: prev?.name ?? inp.name ?? inp.id };
      });

      const mergedOutputs = sig.outputs.map(out => {
          const prev = (data.outputs || []).find(p => p.id === out.id);
          return { ...out, name: prev?.name ?? out.name ?? out.id };
      });
      
      const nextUniforms = { ...data.uniforms };

      const defUniforms: Record<string, UniformVal> | undefined = (nodeDef as any)?.data?.uniforms;
      
      // Initialize new uniforms
      mergedInputs.forEach(inp => {
          const existing = nextUniforms[inp.id];
          if (!existing || existing.type !== inp.type) {
              const template = defUniforms?.[inp.id];
              const templateValue = template && (template as any).value !== undefined ? (template as any).value : undefined;
              nextUniforms[inp.id] = {
                  ...(template ? JSON.parse(JSON.stringify(template)) : {}),
                  type: inp.type,
                  value: templateValue !== undefined ? templateValue : getDefaultValue(inp.type)
              };
          }
      });

      // Cleanup old uniforms
      const inputIds = new Set(mergedInputs.map(i => i.id));
      const preserveUnusedUniforms = !!(nodeDef && (nodeDef as any).data?.autoType === true);
      if (!preserveUnusedUniforms) {
          Object.keys(nextUniforms).forEach(key => {
              if (!inputIds.has(key) && key !== 'value') delete nextUniforms[key];
          });
      }

      updateNodeData({
          inputs: mergedInputs,
          outputs: mergedOutputs,
          outputType: mergedOutputs.length > 0 ? mergedOutputs[0].type : 'float',
          uniforms: nextUniforms
      });
  }, [signatures, currentSignatureIndex, data.uniforms, updateNodeData, nodeDef]);


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

  // Close overload popup on outside click
  useEffect(() => {
      const close = () => setShowOverloads(false);
      window.addEventListener('click', close);
      return () => window.removeEventListener('click', close);
  }, []);

  // Helper to check visibility
  const isInputVisible = useCallback((inputId: string) => {
      const uniform = data.uniforms[inputId];
      if (!uniform || !uniform.widgetConfig || !uniform.widgetConfig.visibleIf) return true;
      
      const config = uniform.widgetConfig;
      const targetUniform = data.uniforms[config.visibleIf.uniform];
      
      if (targetUniform) {
          if (config.visibleIf.value !== undefined) {
              if (Array.isArray(config.visibleIf.value)) {
                  if (!config.visibleIf.value.includes(targetUniform.value)) return false;
              } else if (targetUniform.value !== config.visibleIf.value) {
                  return false;
              }
          }
          if (config.visibleIf.notValue !== undefined) {
               if (Array.isArray(config.visibleIf.notValue)) {
                  if (config.visibleIf.notValue.includes(targetUniform.value)) return false;
               } else if (targetUniform.value === config.visibleIf.notValue) {
                  return false;
               }
          }
      }
      return true;
  }, [data.uniforms]);

  const handleDeleteNode = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
        // Prefer ReactFlow instance API (keeps built-in delete semantics)
        if (reactFlowInstance && typeof (reactFlowInstance as any).deleteElements === 'function') {
                (reactFlowInstance as any).deleteElements({ nodes: [{ id }] });
                return;
        }

        // Fallback: manual removal
        const node = getNodes().find(n => n.id === id);
        if (node) onNodesDelete([node]);
        setEdges((eds) => eds.filter((edge) => edge.source !== id && edge.target !== id));
        setNodes((nds) => nds.filter((n) => n.id !== id));
    }, [id, reactFlowInstance, getNodes, onNodesDelete, setEdges, setNodes]);

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
      const isMultiPass = !!(data.passes && data.passes.length > 0);

      const allNodes = getNodes();
      const allEdges = getEdges();

      const internalNodes = data.isCompound
          ? allNodes.filter(n => n.data.scopeId === id)
          : [];

      const internalEdges = data.isCompound
          ? allEdges.filter(e => internalNodes.some(n => n.id === e.source || n.id === e.target))
          : [];

      const nodeDef = {
          id: data.definitionId || 'CUSTOM',
          label: data.label,
          description: data.description,
          category: data.category || 'Custom',
          locales: data.locales,
          data: {
              ...(isMultiPass ? {} : { glsl: data.glsl }),
              ...(isMultiPass ? { passes: data.passes } : {}),
              inputs: data.inputs,
              outputs: data.outputs,
              uniforms: data.uniforms,
              outputType: data.outputType,
              isCompound: data.isCompound,
              internalNodes: data.isCompound ? (internalNodes as any) : undefined,
              internalEdges: data.isCompound ? internalEdges : undefined
          }
      };

      const blob = new Blob([JSON.stringify(nodeDef, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${data.label.replace(/\s+/g, '_')}.nodefx`;
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
          internalNodes: data.isCompound ? internalNodes as any : undefined,
          internalEdges: data.isCompound ? internalEdges : undefined
      };
      
      addToLibrary(nodeDataToSave);
  }, [data, id, getNodes, getEdges, addToLibrary]);

  const handleCodeCompile = useCallback(() => {
      if (data.isCompound) return; // Prevent compiling manual edits for compound nodes

      const code = localCode;
      let nextPasses = data.passes ? [...data.passes] : [];

      // Update the active pass if we have passes
      if (nextPasses.length > 0) {
          const idx = nextPasses.findIndex(p => p.id === activePassId);
          if (idx !== -1) {
              nextPasses[idx] = { ...nextPasses[idx], glsl: code };
          }
      }

      // NEW LOGIC: Parse each pass individually to collect ALL inputs
      let allInputs: NodeInput[] = [];
      let allOutputs: NodeOutput[] = [];
      let isAnyOverloaded = false;
      let anyValid = false;

      const passesToProcess = nextPasses.length > 0 ? nextPasses : [{ glsl: code, id: 'main' }];

      passesToProcess.forEach(pass => {
          const { inputs, outputs, isOverloaded, valid } = extractShaderIO(pass.glsl);
          if (valid) {
              anyValid = true;
              // Merge inputs
              inputs.forEach(inp => {
                  const existing = allInputs.find(i => i.id === inp.id);
                  if (!existing) {
                      allInputs.push(inp);
                  } else {
                      // If type mismatch, we might have a problem. For now, first one wins.
                  }
              });
          }
          if (isOverloaded) isAnyOverloaded = true;
      });

      // The LAST pass defines the node's output signature
      if (nextPasses.length > 0) {
          const lastPass = nextPasses[nextPasses.length - 1];
          const { outputs } = extractShaderIO(lastPass.glsl);
          if (outputs.length > 0) allOutputs = outputs;
      } else {
          const { outputs } = extractShaderIO(code);
          allOutputs = outputs;
      }

      if (!anyValid && nextPasses.length === 0) {
          // Fallback or Error state? For now, we just keep old inputs if parsing fails completely
          // But if it's valid but empty, that's allowed.
          // console.warn("Could not find valid 'void run(...)' signature.");
      } else {
          // Preserve existing display names (important for localization keys)
          const mergedInputs = allInputs.map(inp => {
              const prev = data.inputs.find(p => p.id === inp.id);
              return { ...inp, name: prev?.name ?? inp.name ?? inp.id };
          });

          const mergedOutputs = allOutputs.map(out => {
              const prev = (data.outputs || []).find(p => p.id === out.id);
              return { ...out, name: prev?.name ?? out.name ?? out.id };
          });

          const nextUniforms = { ...data.uniforms };

          // Initialize new uniforms if needed
          mergedInputs.forEach(inp => {
              if (nextUniforms[inp.id] === undefined) {
                  nextUniforms[inp.id] = { type: inp.type, value: getDefaultValue(inp.type) };
              } else if (nextUniforms[inp.id].type !== inp.type) {
                  nextUniforms[inp.id] = { type: inp.type, value: getDefaultValue(inp.type) };
              }
          });

          // Remove unused uniforms
          const inputIds = new Set(mergedInputs.map(i => i.id));
          Object.keys(nextUniforms).forEach(key => {
              if (!inputIds.has(key)) delete nextUniforms[key];
          });

          const updates: Partial<NodeData> = { 
              glsl: nextPasses.length > 0 ? nextPasses[nextPasses.length - 1].glsl : code,
              passes: nextPasses.length > 0 ? nextPasses : undefined,
              inputs: mergedInputs,
              outputs: mergedOutputs,
              uniforms: nextUniforms,
              autoType: isAnyOverloaded 
          };
          
          // Update outputType if we have outputs detected
          if (mergedOutputs.length > 0) {
              updates.outputType = mergedOutputs[0].type;
          }
          
          updateNodeData(updates);
      }
  }, [localCode, data.uniforms, updateNodeData, data.inputs, data.outputs, data.passes, activePassId]);

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
      : 'bg-zinc-900/85';

  // Check if we have an active Bezier Grid widget
  const hasBezierGrid = useMemo(() => {
      if (!data.uniforms) return false;
      return Object.values(data.uniforms).some(u => u && u.widget === 'bezier_grid');
  }, [data.uniforms]);

    return (
    <>
        <div className={`relative shadow-xl rounded-lg border transition-all duration-200 min-w-[280px] ${nodeBgClass} ${borderClass}`}>
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

        {signatures.length > 1 && (
            <div className="px-2 pt-1" onClick={e => e.stopPropagation()}>
                <div className="relative w-full">
                    <button
                        type="button"
                        onClick={(e) => {
                            e.stopPropagation();
                            setShowOverloads(v => !v);
                        }}
                        className={`nodrag w-full flex items-center justify-between gap-2 px-2 py-0.5 rounded border text-[10px] transition-colors ${showOverloads ? 'bg-blue-900/20 border-blue-500/30 text-blue-300' : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200'}`}
                        title={tGlobal('Overloads')}
                    >
                        <span className="flex items-center gap-1.5 min-w-0">
                            <Layers size={12} className="shrink-0" />
                            <span className="font-semibold truncate">{currentSignatureLabel ?? tGlobal('Overloads')}</span>
                        </span>
                        <ChevronDown size={12} className={`shrink-0 ${showOverloads ? 'text-blue-300' : 'text-zinc-500'}`} />
                    </button>

                    {showOverloads && (
                        <div className="absolute top-full left-0 mt-1 z-50" onClick={e => e.stopPropagation()}>
                            <div className="bg-zinc-900 border border-zinc-700 rounded shadow-xl p-1 min-w-[260px] max-w-[400px] animate-in fade-in zoom-in-95 duration-100 origin-top-left">
                                <div className="flex flex-col gap-1 max-h-[300px] overflow-y-auto custom-scrollbar">
                                    {sortedSignatures.map(({ sig, idx }, listIdx) => {
                                        const isCurrent = idx === currentSignatureIndex;
                                        const hasLabel = typeof sig.label === 'string' && sig.label.length > 0;
                                        return (
                                            <button
                                                key={`${idx}_${listIdx}`}
                                                onClick={() => {
                                                    setShowOverloads(false);
                                                    handleSelectSignature(idx);
                                                }}
                                                className={`w-full text-left px-2 py-1.5 rounded text-[10px] font-mono border transition-colors ${isCurrent ? 'bg-blue-900/20 border-blue-500/30 cursor-default' : 'bg-zinc-950 border-zinc-800 hover:bg-zinc-800 hover:border-zinc-600 cursor-pointer'}`}
                                                disabled={isCurrent}
                                            >
                                                {hasLabel ? (
                                                    <div className="flex items-center gap-2">
                                                        <span className={`font-bold ${isCurrent ? 'text-blue-400' : 'text-zinc-200'}`}>{sig.label}</span>
                                                        <span className="text-[9px] text-zinc-600">{`(${sig.order ?? 0})`}</span>
                                                    </div>
                                                ) : (
                                                    <div className="flex flex-wrap items-center gap-x-1 gap-y-0.5 leading-tight">
                                                        <span className={`font-bold mr-1 ${isCurrent ? 'text-blue-400' : 'text-zinc-600'}`}>#{listIdx + 1}</span>
                                                        <span className="text-zinc-500">run(</span>
                                                        {sig.inputs.map((i, iIdx) => (
                                                            <span key={i.id} className="flex items-center">
                                                                <span className="text-purple-400">{i.type}</span>
                                                                <span className="text-zinc-300 ml-1">{i.name}</span>
                                                                {iIdx < sig.inputs.length - 1 && <span className="text-zinc-600 ml-0.5">,</span>}
                                                            </span>
                                                        ))}
                                                        {sig.outputs.length > 0 && sig.inputs.length > 0 && <span className="text-zinc-600 ml-0.5">,</span>}
                                                        {sig.outputs.map((o, oIdx) => (
                                                            <span key={o.id} className="flex items-center">
                                                                <span className="text-orange-400">out {o.type}</span>
                                                                <span className="text-zinc-300 ml-1">{o.name}</span>
                                                                {oIdx < sig.outputs.length - 1 && <span className="text-zinc-600 ml-0.5">,</span>}
                                                            </span>
                                                        ))}
                                                        <span className="text-zinc-500">)</span>
                                                    </div>
                                                )}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        )}

        <div className="flex relative">
            <div className="flex-1 flex flex-col py-2 gap-2 min-w-[50%] border-r border-zinc-800/50">
                {/* RENDER UNIFORMS FOR GLOBAL VARS */}
                {data.isGlobalVar && data.uniforms['value'] && (
                    <div className="relative pl-6 pr-3 group">
                        <div className="flex flex-col gap-1">
                            <UniformControlWrapper 
                                input={{ id: 'value', name: data.label, type: data.outputType }} 
                                uniform={data.uniforms['value']} 
                                allUniforms={data.uniforms} 
                                isConnected={false} 
                                connectedTargetHandles={connectedHandles.targetHandles}
                                typeColor={TYPE_COLORS[data.outputType] || '#a1a1aa'} 
                                t={t}
                                onUpdateValue={(val) => updateNodeData((curr) => { const next = { ...curr.uniforms }; next['value'] = { ...next['value'], value: val }; return { uniforms: next }; })}
                                onUpdateConfig={(widget, config) => updateNodeData((curr) => { const next = { ...curr.uniforms }; next['value'] = { ...next['value'], widget, widgetConfig: config || next['value'].widgetConfig }; return { uniforms: next }; })}
                                compiledData={compiledData}
                                definitionId={data.definitionId}
                            />
                        </div>
                    </div>
                )}

                {data.inputs.map((input) => {
                    if (!isInputVisible(input.id)) return null;
                    const isConnected = connectedHandles.targetHandles.has(input.id);
                    const typeColor = TYPE_COLORS[input.type] || '#a1a1aa';
                    return (
                        <div key={input.id} className="relative pl-6 pr-3 group">
                            <Handle 
                                type="target" 
                                position={Position.Left} 
                                id={input.id} 
                                className="!w-6 !h-6 !-left-0.5 !top-0 !transform-none !bg-transparent !border-0 after:content-[''] after:absolute after:top-1/2 after:left-1/2 after:-translate-x-1/2 after:-translate-y-1/2 after:w-3 after:h-3 after:rounded-full after:border-2 after:transition-transform hover:after:scale-125 after:bg-[var(--handle-bg)] after:border-[var(--handle-color)]" 
                                style={{ '--handle-bg': isConnected ? typeColor : '#18181b', '--handle-color': typeColor } as React.CSSProperties} 
                                onClick={(e) => handleDisconnect(e, input.id, 'target')}
                            />
                            <div className="flex flex-col gap-1">
                                {data.uniforms[input.id] ? (
                                    <UniformControlWrapper input={input} uniform={data.uniforms[input.id]} allUniforms={data.uniforms} isConnected={isConnected} typeColor={typeColor} t={t}
                                        connectedTargetHandles={connectedHandles.targetHandles}
                                        onUpdateValue={(val) => updateNodeData((curr) => { const next = { ...curr.uniforms }; next[input.id] = { ...next[input.id], value: val }; return { uniforms: next }; })}
                                        onUpdateConfig={(widget, config) => updateNodeData((curr) => { const next = { ...curr.uniforms }; next[input.id] = { ...next[input.id], widget, widgetConfig: config || next[input.id].widgetConfig }; return { uniforms: next }; })}
                                        compiledData={compiledData}
                                        definitionId={data.definitionId}
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
                    const isConnected = connectedHandles.sourceHandles.has(output.id);
                    const typeColor = TYPE_COLORS[output.type] || '#a1a1aa';
                    return (
                        <div key={output.id} className="relative flex items-center h-5 pl-2 pr-5 group justify-end">
                            <span className="text-[10px] font-medium text-zinc-400 mr-1">{t(output.name)}</span>
                            <Handle 
                                type="source" 
                                position={Position.Right} 
                                id={output.id} 
                                className="!w-6 !h-6 !-right-0.5 !top-1/2 !-mt-3 !transform-none !bg-transparent !border-0 after:content-[''] after:absolute after:top-1/2 after:left-1/2 after:-translate-x-1/2 after:-translate-y-1/2 after:w-3 after:h-3 after:rounded-full after:border-2 after:transition-transform hover:after:scale-125 after:bg-[var(--handle-bg)] after:border-[var(--handle-color)]" 
                                style={{ '--handle-bg': isConnected ? typeColor : '#18181b', '--handle-color': typeColor } as React.CSSProperties} 
                                onClick={(e) => handleDisconnect(e, output.id, 'source')}
                            />
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
                             {!data.isCompound && (
                                <button onClick={handleCodeCompile} className="flex items-center gap-1 px-2.5 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded text-[10px] font-bold uppercase tracking-wide"><Save size={12} /> {tGlobal("Compile")}</button>
                             )}
                            <button onClick={() => setIsFloatingCode(false)} className="p-1 hover:bg-zinc-800 text-zinc-400 hover:text-white rounded"><Minimize2 size={16} /></button>
                        </div>
                    </div>
                    
                    {/* Pass Tabs */}
                    <div className="flex items-center gap-1 px-2 border-b border-zinc-800 bg-zinc-900 overflow-x-auto">
                        {(data.passes || [{ id: 'main', name: 'Main', glsl: data.glsl }]).map((pass, idx) => (
                            <div key={pass.id} className={`flex items-center gap-1 px-3 py-1.5 text-xs cursor-pointer border-b-2 transition-colors ${activePassId === pass.id ? 'border-blue-500 text-white bg-zinc-800' : 'border-transparent text-zinc-400 hover:text-zinc-200'}`}
                                onClick={() => {
                                    handleCodeCompile();
                                    setActivePassId(pass.id);
                                }}
                            >
                                <span>{pass.name || `Pass ${idx + 1}`}</span>
                                {data.passes && data.passes.length > 1 && (
                                    <button onClick={(e) => {
                                        e.stopPropagation();
                                        const nextPasses = data.passes!.filter(p => p.id !== pass.id);
                                        updateNodeData({ passes: nextPasses });
                                        if (activePassId === pass.id) setActivePassId(nextPasses[0].id);
                                    }} className="hover:text-red-400"><X size={10}/></button>
                                )}
                            </div>
                        ))}
                        <button onClick={() => {
                             handleCodeCompile();
                             const newPassId = `pass_${Date.now()}`;
                             const newPass: NodePass = {
                                 id: newPassId,
                                 name: `Pass ${(data.passes?.length || 0) + 1}`,
                                 glsl: 'void run(vec2 uv, out vec4 color) {\n    color = vec4(0.0, 0.0, 0.0, 1.0);\n}',
                                 target: 'self'
                             };
                             const nextPasses = data.passes ? [...data.passes, newPass] : [
                                 { id: 'main', name: 'Main', glsl: data.glsl, target: 'output' },
                                 newPass
                             ];
                             updateNodeData({ passes: nextPasses });
                             setActivePassId(newPassId);
                        }} className="p-1 hover:bg-zinc-800 text-zinc-400 hover:text-white rounded"><Plus size={14}/></button>
                    </div>

                    <div className="flex-1 p-0 overflow-hidden relative nodrag"><CodeEditor value={localCode} onChange={(val) => setLocalCode(val || '')} onSave={handleCodeCompile} onBlur={() => {}} height="100%" lineNumbers="on" readOnly={data.isCompound}/></div>
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
};

// ReactFlow updates position on every drag frame (xPos/yPos). The node DOM is moved by ReactFlow,
// so the node component doesn't need to re-render just to move. Keep renders to actual data/UI changes.
const areNodePropsEqual = (prev: NodeProps<NodeData>, next: NodeProps<NodeData>) => {
        return prev.id === next.id && prev.selected === next.selected && prev.data === next.data;
};

export default memo(CustomNodeComponent, areNodePropsEqual);
