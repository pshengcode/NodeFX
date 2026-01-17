import React, { memo, useEffect, useMemo, useCallback } from 'react';
import { Position, NodeProps } from 'reactflow';
import { NodeData } from '../types';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import { useOptimizedNodes } from '../hooks/useOptimizedNodes';
import { useNodeSettings } from '../hooks/useNodeSync';
import { useProjectDispatch } from '../context/ProjectContext';
import { buildRegisterTextureId, sanitizeRegisterName } from '../utils/registerRegistry';
import AltDisconnectHandle from './AltDisconnectHandle';

const GetNode = memo(({ id, data }: NodeProps<NodeData>) => {
    const { t } = useTranslation();
    const nodes = useOptimizedNodes();
    const { setNodes, setEdges, onNodesDelete, reactFlowInstance, getNodes } = useProjectDispatch();

    const [settings, updateSettings] = useNodeSettings(id, data, { selected: '' });
    const { selected } = settings;

    const registerOptions = useMemo(() => {
        const entries = nodes
            .filter(n => n.type === 'registerNode')
            .map(n => {
                const rawName = n.data?.settings?.name || '';
                const safeName = sanitizeRegisterName(rawName);
                const fallbackName = `var_${n.id.slice(-4)}`;
                return {
                    id: n.id,
                    name: safeName || fallbackName,
                };
            });

        const unique = Array.from(new Map(entries.map(e => [e.name, e])).values());
        return unique;
    }, [nodes]);

    useEffect(() => {
        if (registerOptions.length === 0) {
            updateSettings({ selected: '' });
            return;
        }
        if (!registerOptions.find(o => o.name === selected)) {
            updateSettings({ selected: registerOptions[0].name });
        }
    }, [registerOptions, selected, updateSettings]);

    useEffect(() => {
        const dynamicId = selected ? buildRegisterTextureId(selected, id) : null;
        setNodes((nds) => nds.map((node) => {
            if (node.id !== id) return node;
            const uniforms = node.data.uniforms || {};
            const nextUniforms = {
                ...uniforms,
                tex: { ...(uniforms.tex || { type: 'sampler2D', value: null }), value: dynamicId }
            };
            return {
                ...node,
                data: {
                    ...node.data,
                    uniforms: nextUniforms
                }
            };
        }));
    }, [id, selected, setNodes]);

    const handleDeleteNode = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
        if (reactFlowInstance && typeof (reactFlowInstance as any).deleteElements === 'function') {
            (reactFlowInstance as any).deleteElements({ nodes: [{ id }] });
            return;
        }

        const node = getNodes().find(n => n.id === id);
        if (node) onNodesDelete([node]);
        setEdges((eds) => eds.filter((edge) => edge.source !== id && edge.target !== id));
        setNodes((nds) => nds.filter((n) => n.id !== id));
    }, [getNodes, id, onNodesDelete, reactFlowInstance, setEdges, setNodes]);

    return (
        <div className="bg-zinc-900 border border-zinc-700 rounded-lg shadow-xl overflow-hidden w-64">
            <div className="bg-zinc-800 px-3 py-2 border-b border-zinc-700 flex justify-between items-center">
                <span className="text-zinc-200 font-semibold text-sm">{t('Get')}</span>
                <button onClick={handleDeleteNode} className="p-1 rounded hover:bg-red-900/30 text-zinc-500 hover:text-red-400" title={t('Delete')}>
                    <X size={14} />
                </button>
            </div>

            <div className="p-3 space-y-3">
                <div>
                    <label className="block text-zinc-400 mb-1 text-xs">{t('Select Variable')}</label>
                    <select
                        value={selected}
                        onChange={(e) => updateSettings({ selected: e.target.value })}
                        className="nodrag w-full bg-zinc-800 text-white px-2 py-1 rounded border border-zinc-600 text-xs"
                    >
                        {registerOptions.length === 0 && (
                            <option value="">{t('No Registered Variables')}</option>
                        )}
                        {registerOptions.map(option => (
                            <option key={option.name} value={option.name}>{option.name}</option>
                        ))}
                    </select>
                </div>
            </div>

            <AltDisconnectHandle
                nodeId={id}
                handleId="result"
                handleType="source"
                position={Position.Right}
                style={{ top: '50%', background: '#ec4899' }}
            />
        </div>
    );
});

export default GetNode;
