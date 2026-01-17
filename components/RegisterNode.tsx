import React, { memo, useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { Position, NodeProps } from 'reactflow';
import { CompilationResult, NodeData } from '../types';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import { compileGraph } from '../utils/shaderCompiler';
import ShaderPreview from './ShaderPreview';
import { useOptimizedNodes } from '../hooks/useOptimizedNodes';
import { useNodeSettings } from '../hooks/useNodeSync';
import { useProjectDispatch, useProjectEdges } from '../context/ProjectContext';
import { buildUniformOverridesFromNodes } from '../utils/uniformOverrides';
import { registerDynamicTexture, unregisterDynamicTexture } from '../utils/dynamicRegistry';
import { buildRegisterTextureId, sanitizeRegisterName } from '../utils/registerRegistry';
import AltDisconnectHandle from './AltDisconnectHandle';

const RegisterNode = memo(({ id, data }: NodeProps<NodeData>) => {
    const { t } = useTranslation();
    const nodes = useOptimizedNodes();
    const edges = useProjectEdges();
    const { setNodes, setEdges, onNodesDelete, reactFlowInstance, getNodes } = useProjectDispatch();

    const [settings, updateSettings] = useNodeSettings(id, data, { name: '' });
    const { name } = settings;

    const [compiledInput, setCompiledInput] = useState<CompilationResult | null>(null);
    const inputCanvasRef = useRef<HTMLCanvasElement>(null);
    const prevCompileKeyRef = useRef<string>('');
    const registeredIdRef = useRef<string | null>(null);

    const inputEdge = edges.find(e => e.target === id && e.targetHandle === 'image');

    const uniformOverrides = useMemo(
        () => buildUniformOverridesFromNodes(nodes as any),
        [nodes]
    );

    const graphCodeHash = useMemo(() => {
        const structure = {
            nodes: (nodes as any[]).map(n => ({
                id: n.id,
                type: n.type,
                data: {
                    glsl: n.data?.glsl,
                    outputType: n.data?.outputType,
                    inputs: (n.data?.inputs || []).map((i: any) => ({ id: i.id, type: i.type })),
                    outputs: (n.data?.outputs || []).map((o: any) => ({ id: o.id, type: o.type })),
                    isCompound: n.data?.isCompound,
                    scopeId: n.data?.scopeId,
                    isGlobalVar: n.data?.isGlobalVar,
                    globalName: n.data?.globalName,
                    uniforms: Object.fromEntries(
                        Object.entries(n.data?.uniforms || {}).map(([k, u]: any) => [k, { type: u?.type }])
                    )
                }
            })),
            edges: edges.map((e: any) => ({ s: e.source, t: e.target, sh: e.sourceHandle, th: e.targetHandle }))
        };
        return JSON.stringify(structure);
    }, [nodes, edges]);

    useEffect(() => {
        if (!inputEdge) {
            prevCompileKeyRef.current = '';
            setCompiledInput(null);
            return;
        }

        const compileKey = `${inputEdge.source}|${graphCodeHash}`;
        if (compileKey === prevCompileKeyRef.current) return;
        prevCompileKeyRef.current = compileKey;

        const result = compileGraph(nodes as any, edges as any, inputEdge.source);
        setCompiledInput(result);
    }, [inputEdge, nodes, edges, graphCodeHash]);

    useEffect(() => {
        if (!name.trim()) {
            const fallback = `var_${id.slice(-4)}`;
            updateSettings({ name: fallback });
        }
    }, [id, name, updateSettings]);

    useEffect(() => {
        const canvas = inputCanvasRef.current;
        const safeName = sanitizeRegisterName(name);
        const dynamicId = buildRegisterTextureId(name, id);

        if (!canvas || !safeName || !compiledInput) {
            if (registeredIdRef.current) {
                unregisterDynamicTexture(registeredIdRef.current);
                registeredIdRef.current = null;
            }
            return;
        }

        if (registeredIdRef.current && registeredIdRef.current !== dynamicId) {
            unregisterDynamicTexture(registeredIdRef.current);
        }

        registerDynamicTexture(dynamicId, canvas);
        registeredIdRef.current = dynamicId;

        return () => {
            unregisterDynamicTexture(dynamicId);
            if (registeredIdRef.current === dynamicId) {
                registeredIdRef.current = null;
            }
        };
    }, [id, name, compiledInput]);

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
        <div className="bg-zinc-900 border border-zinc-700 rounded-lg shadow-xl overflow-hidden w-72">
            <div className="bg-zinc-800 px-3 py-2 border-b border-zinc-700 flex justify-between items-center">
                <span className="text-zinc-200 font-semibold text-sm">{t('Register')}</span>
                <button onClick={handleDeleteNode} className="p-1 rounded hover:bg-red-900/30 text-zinc-500 hover:text-red-400" title={t('Delete')}>
                    <X size={14} />
                </button>
            </div>

            <div className="p-3 space-y-3">
                <div>
                    <label className="block text-zinc-400 mb-1 text-xs">{t('Variable Name')}</label>
                    <input
                        type="text"
                        value={name}
                        onChange={(e) => updateSettings({ name: e.target.value })}
                        className="nodrag w-full bg-zinc-800 text-white px-2 py-1 rounded border border-zinc-600"
                    />
                </div>

                <div className="text-xs text-zinc-500">
                    {t('Registered As')}: {sanitizeRegisterName(name) || '-'}
                </div>

                <div className="hidden">
                    {compiledInput && (
                        <ShaderPreview
                            ref={inputCanvasRef}
                            data={compiledInput}
                            width={256}
                            height={256}
                            uniformOverrides={uniformOverrides}
                        />
                    )}
                </div>
            </div>

            <AltDisconnectHandle
                nodeId={id}
                handleId="image"
                handleType="target"
                position={Position.Left}
                style={{ top: '50%', background: '#6366f1' }}
            />

        </div>
    );
});

export default RegisterNode;
