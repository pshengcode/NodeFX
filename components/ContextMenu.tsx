import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Search } from 'lucide-react';
import { ShaderNodeDefinition } from '../types';
import { useNodeTranslation } from '../hooks/useNodeTranslation';
import { useTranslation } from 'react-i18next';

const getCategoryColor = (category: string) => {
    switch (category) {
        case 'Input': return 'bg-blue-500';
        case 'Generator': return 'bg-emerald-500';
        case 'Math': return 'bg-orange-500';
        case 'Vector': return 'bg-indigo-500';
        case 'Color': return 'bg-pink-500';
        case 'Filter': return 'bg-purple-500';
        case 'Effect': return 'bg-violet-500';
        case 'Utility': return 'bg-zinc-400';
        case 'Network': return 'bg-cyan-500';
        case 'Custom': return 'bg-yellow-500';
        case 'User': return 'bg-red-500';
        default: return 'bg-zinc-500';
    }
};

const ContextMenuItem: React.FC<{ node: ShaderNodeDefinition, onClick: () => void }> = ({ node, onClick }) => {
    const translate = useNodeTranslation(node);
    return (
        <button
            onClick={onClick}
            className="w-full flex items-center gap-2 px-2 py-1 hover:bg-zinc-800 rounded text-left group transition-colors"
        >
             <div className="flex items-center justify-center w-5 h-5 rounded bg-zinc-800/50 border border-zinc-700/50 shrink-0">
                <div className={`w-1.5 h-1.5 rounded-full ${getCategoryColor(node.category)}`}></div>
             </div>
             <div className="flex flex-col overflow-hidden">
                <span className="text-xs text-zinc-300 truncate font-medium">{translate(node.label)}</span>
            </div>
        </button>
    );
};

interface Props {
  x: number;
  y: number;
  onClose: () => void;
  onAddNode: (def: ShaderNodeDefinition) => void;
  registry: ShaderNodeDefinition[];
}

const ContextMenu: React.FC<Props> = ({ x, y, onClose, onAddNode, registry }) => {
  const { t, i18n } = useTranslation();
  const [search, setSearch] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
      inputRef.current?.focus();
  }, []);

  const filteredNodes = useMemo(() => {
    const term = search.toLowerCase();
    if (!term) return registry;

    const lang = i18n.language;
    const getTranslatedLabel = (node: ShaderNodeDefinition) => {
        const text = node.label;
        if (node.locales) {
            if (node.locales[lang]?.[text]) return node.locales[lang][text];
            const shortLang = lang.split('-')[0];
            if (node.locales[shortLang]?.[text]) return node.locales[shortLang][text];
        }
        return i18n.exists(text) ? t(text) : text;
    };

    return [...registry].sort((a, b) => {
        const aName = a.label.toLowerCase();
        const bName = b.label.toLowerCase();
        const aTrans = getTranslatedLabel(a).toLowerCase();
        const bTrans = getTranslatedLabel(b).toLowerCase();
        
        // Check exact match (Original or Translated)
        const aExact = (aName === term || aTrans === term) ? 1 : 0;
        const bExact = (bName === term || bTrans === term) ? 1 : 0;
        if (aExact !== bExact) return bExact - aExact;

        // Check startsWith (Original or Translated)
        const aStart = (aName.startsWith(term) || aTrans.startsWith(term)) ? 1 : 0;
        const bStart = (bName.startsWith(term) || bTrans.startsWith(term)) ? 1 : 0;
        if (aStart !== bStart) return bStart - aStart;

        // Check includes (Original or Translated)
        const aHas = (aName.includes(term) || aTrans.includes(term)) ? 1 : 0;
        const bHas = (bName.includes(term) || bTrans.includes(term)) ? 1 : 0;
        if (aHas !== bHas) return bHas - aHas;

        return 0;
    }).filter(n => {
        const trans = getTranslatedLabel(n).toLowerCase();
        return n.label.toLowerCase().includes(term) || 
               trans.includes(term) ||
               n.category.toLowerCase().includes(term);
    });
  }, [search, registry, i18n.language, t]);

  return (
    <div 
        className="fixed z-50 w-56 bg-zinc-900 border border-zinc-700 rounded-lg shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-100"
        style={{ top: y, left: x }}
        onClick={(e) => e.stopPropagation()}
    >
        {/* Search Header */}
        <div className="p-2 border-b border-zinc-800 flex items-center gap-2">
            <Search size={14} className="text-zinc-500" />
            <input 
                ref={inputRef}
                className="bg-transparent border-none outline-none text-xs text-zinc-200 w-full placeholder-zinc-600"
                placeholder={t('Search nodes...')}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => {
                    if (e.key === 'Enter' && filteredNodes.length > 0) {
                        onAddNode(filteredNodes[0]);
                        onClose();
                    }
                    if (e.key === 'Escape') onClose();
                }}
            />
        </div>

        {/* List */}
        <div className="max-h-64 overflow-y-auto p-1 custom-scrollbar">
            {filteredNodes.length === 0 ? (
                <div className="p-3 text-center text-[10px] text-zinc-600">{t('No nodes found')}</div>
            ) : (
                filteredNodes.map(node => (
                    <ContextMenuItem 
                        key={node.id} 
                        node={node} 
                        onClick={() => {
                            onAddNode(node);
                            onClose();
                        }} 
                    />
                ))
            )}
        </div>
    </div>
  );
};

export default ContextMenu;
