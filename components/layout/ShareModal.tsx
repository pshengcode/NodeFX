import React from 'react';
import { Share2, PlusCircle, RefreshCw } from 'lucide-react';
import { useProject } from '../../context/ProjectContext';
import { useTranslation } from 'react-i18next';

export const ShareModal: React.FC = () => {
    const { t } = useTranslation();
    const { pendingShareData, handleShareAction } = useProject();

    if (!pendingShareData) return null;

    return (
        <div className="fixed inset-0 z-[300] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl max-w-md w-full p-6 animate-in fade-in zoom-in-95 duration-200">
                <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center text-blue-400">
                        <Share2 size={20} />
                    </div>
                    <div>
                        <h3 className="text-lg font-bold text-zinc-100">{t("Shared Project Detected")}</h3>
                        <p className="text-xs text-zinc-400">{t("You have unsaved local work. How would you like to proceed?")}</p>
                    </div>
                </div>
                
                <div className="flex flex-col gap-2">
                    <button 
                        onClick={() => handleShareAction('merge')}
                        className="flex items-center justify-between px-4 py-3 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-lg transition-all group text-left"
                    >
                        <div>
                            <div className="text-sm font-medium text-zinc-200 group-hover:text-white">{t("Merge into Current Project")}</div>
                            <div className="text-[10px] text-zinc-500">{t("Add shared nodes to your current canvas (Recommended)")}</div>
                        </div>
                        <PlusCircle size={16} className="text-zinc-500 group-hover:text-blue-400"/>
                    </button>

                    <button 
                        onClick={() => handleShareAction('overwrite')}
                        className="flex items-center justify-between px-4 py-3 bg-zinc-800 hover:bg-red-900/20 border border-zinc-700 hover:border-red-800/50 rounded-lg transition-all group text-left"
                    >
                        <div>
                            <div className="text-sm font-medium text-zinc-200 group-hover:text-red-200">{t("Overwrite Local Project")}</div>
                            <div className="text-[10px] text-zinc-500 group-hover:text-red-400/70">{t("Discard local changes and load shared project")}</div>
                        </div>
                        <RefreshCw size={16} className="text-zinc-500 group-hover:text-red-400"/>
                    </button>

                    <button 
                        onClick={() => handleShareAction('cancel')}
                        className="mt-2 px-4 py-2 text-xs font-medium text-zinc-400 hover:text-zinc-200 transition-colors text-center"
                    >
                        {t("Cancel (Ignore Share Link)")}
                    </button>
                </div>
            </div>
        </div>
    );
};
