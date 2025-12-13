import React, { useState } from 'react';
import { 
    MousePointer2, Undo, Redo, Settings, RefreshCw, FolderOpen, Save, Share2 
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useProject } from '../../context/ProjectContext';

export const Toolbar: React.FC = () => {
    const { t, i18n } = useTranslation();
    const { 
        undo, redo, canUndo, canRedo, 
        resolution, setResolution, 
        resetCanvas, loadProject, saveProject, copyShareLink,
        nodes, edges, previewNodeId,
        projectFileInputRef
    } = useProject();

    const [showResDropdown, setShowResDropdown] = useState(false);

    return (
        <div className="absolute top-0 left-0 right-0 h-14 bg-zinc-900/90 backdrop-blur-sm border-b border-zinc-800 z-10 flex items-center px-6 justify-between pointer-events-none">
             <div className="pointer-events-auto flex items-center gap-4">
                 <div className="text-[10px] text-zinc-500 flex gap-4">
                     <span className="flex items-center gap-1"><MousePointer2 size={10}/> {t('Left Drag to Select')}</span>
                     <span className="flex items-center gap-1"><span className="border border-zinc-700 px-1 rounded">{t('Middle Mouse')}</span> {t('to Pan')}</span>
                     <span className="flex items-center gap-1"><span className="border border-zinc-700 px-1 rounded">{t('Wheel')}</span> {t('to Zoom')}</span>
                 </div>
             </div>
            
            <div className="pointer-events-auto flex gap-3 items-center">
                
                {/* Undo / Redo */}
                <div className="flex items-center gap-1 mr-2">
                    <button 
                        onClick={undo} 
                        disabled={!canUndo}
                        className={`p-1.5 rounded-full border border-zinc-700 transition-colors ${canUndo ? 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300' : 'bg-zinc-900 text-zinc-600 cursor-not-allowed'}`}
                        title={t("Undo (Ctrl+Z)")}
                    >
                        <Undo size={14} />
                    </button>
                    <button 
                        onClick={redo} 
                        disabled={!canRedo}
                        className={`p-1.5 rounded-full border border-zinc-700 transition-colors ${canRedo ? 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300' : 'bg-zinc-900 text-zinc-600 cursor-not-allowed'}`}
                        title={t("Redo (Ctrl+Y)")}
                    >
                        <Redo size={14} />
                    </button>
                </div>

                {/* Resolution Control with Presets */}
                <div className="relative mr-4">
                    <div className="flex items-center gap-1 bg-zinc-800 rounded-lg px-2 py-1 border border-zinc-700">
                        <button 
                            onClick={() => setShowResDropdown(!showResDropdown)}
                            className="p-1 -ml-1 hover:bg-zinc-700 rounded text-zinc-400 hover:text-zinc-200 transition-colors"
                            title={t("Resolution Presets")}
                        >
                            <Settings size={14} />
                        </button>
                        <div className="w-px h-4 bg-zinc-700 mx-1"></div>
                        <input 
                            type="number"
                            className="w-10 bg-transparent text-xs text-zinc-200 outline-none text-center border-b border-zinc-600 focus:border-blue-500 appearance-none"
                            value={resolution.w}
                            onChange={e => setResolution({ ...resolution, w: parseInt(e.target.value) || 0 })}
                        />
                        <span className="text-zinc-500 text-xs">x</span>
                        <input 
                            type="number"
                            className="w-10 bg-transparent text-xs text-zinc-200 outline-none text-center border-b border-zinc-600 focus:border-blue-500 appearance-none"
                            value={resolution.h}
                            onChange={e => setResolution({ ...resolution, h: parseInt(e.target.value) || 0 })}
                        />
                    </div>

                    {/* Dropdown */}
                    {showResDropdown && (
                        <>
                            <div className="fixed inset-0 z-30" onClick={() => setShowResDropdown(false)}></div>
                            <div className="absolute top-full left-0 mt-2 w-32 bg-zinc-900 border border-zinc-700 rounded-lg shadow-xl overflow-hidden z-40 flex flex-col py-1 animate-in fade-in zoom-in-95 duration-100">
                                <div className="px-3 py-1.5 text-[10px] font-bold text-zinc-500 uppercase tracking-wider border-b border-zinc-800/50 mb-1">{t("Presets")}</div>
                                {[64, 128, 256, 512, 1024, 2048].map(size => (
                                    <button
                                        key={size}
                                        onClick={() => {
                                            setResolution({ w: size, h: size });
                                            setShowResDropdown(false);
                                        }}
                                        className="px-3 py-1.5 text-xs text-left text-zinc-300 hover:bg-zinc-800 hover:text-white transition-colors flex items-center justify-between group w-full"
                                    >
                                        <span>{size} × {size}</span>
                                        {resolution.w === size && resolution.h === size && (
                                            <div className="w-1.5 h-1.5 rounded-full bg-blue-500"></div>
                                        )}
                                    </button>
                                ))}
                            </div>
                        </>
                    )}
                </div>

                <button 
                    onClick={() => i18n.changeLanguage(i18n.language === 'en' ? 'zh' : 'en')}
                    className="flex items-center justify-center w-16 h-8 text-xs font-bold bg-zinc-800 hover:bg-zinc-700 rounded border border-zinc-700 transition-colors"
                    title={i18n.language === 'en' ? "Switch to Chinese" : "Switch to English"}
                >
                    <span className={i18n.language === 'en' ? 'text-white' : 'text-zinc-500'}>EN</span>
                    <span className="mx-1 text-zinc-600">/</span>
                    <span className={i18n.language === 'zh' ? 'text-white' : 'text-zinc-500'}>ZH</span>
                </button>

                <button onClick={resetCanvas} className="flex items-center gap-2 px-4 py-1.5 text-xs font-medium bg-zinc-800 hover:bg-red-900/50 text-zinc-300 hover:text-red-200 rounded-full border border-zinc-700 hover:border-red-800/50 transition-colors" title={t("Reset")}>
                    <RefreshCw size={14}/> {t("Reset")}
                </button>
                <input type="file" ref={projectFileInputRef} onChange={loadProject} className="hidden" accept=".nodefxs,.json" />
                <button onClick={() => projectFileInputRef.current?.click()} className="flex items-center gap-2 px-4 py-1.5 text-xs font-medium bg-zinc-800 hover:bg-zinc-700 rounded-full border border-zinc-700 transition-colors">
                    <FolderOpen size={14}/> {t("Load")}
                </button>
                <button onClick={saveProject} className="flex items-center gap-2 px-4 py-1.5 text-xs font-medium bg-zinc-800 hover:bg-zinc-700 rounded-full border border-zinc-700 transition-colors">
                    <Save size={14}/> {t("Save")}
                </button>
                <button 
                    onClick={async () => {
                        const res = await copyShareLink(nodes, edges, previewNodeId);
                        if (!res) return;
                        if (res.copied) {
                            alert(t("Share link copied to clipboard!"));
                            return;
                        }
                        // Fallback for non-secure origins / blocked clipboard permissions.
                        window.prompt(t("Share"), res.url);
                    }} 
                    className="flex items-center gap-2 px-4 py-1.5 text-xs font-medium bg-blue-600 hover:bg-blue-500 text-white rounded-full shadow-lg shadow-blue-900/20 transition-colors"
                >
                    <Share2 size={14}/> {t("Share")}
                </button>
            </div>
        </div>
    );
};
