import React, { memo, useState, useEffect } from 'react';
import { Handle, Position, NodeProps, useReactFlow } from 'reactflow';
import { NodeData, GLSLType } from '../types';
import { TYPE_COLORS } from '../constants';
import { ArrowRight, ArrowLeft, Plus, Trash2 } from 'lucide-react';

const handleStyle = { width: 10, height: 10 };

const EditableLabel = ({ value, onChange, align = 'left' }: { value: string, onChange: (val: string) => void, align?: 'left' | 'right' }) => {
    const [localValue, setLocalValue] = useState(value);
    
    useEffect(() => { setLocalValue(value); }, [value]);

    const commit = () => {
        if (localValue !== value && localValue.trim() !== "") onChange(localValue);
        else setLocalValue(value); // Revert if empty or unchanged
    };

    return (
        <input 
            className={`text-xs text-zinc-300 bg-transparent border border-transparent hover:border-zinc-700 focus:border-blue-500 outline-none rounded px-1 w-24 transition-colors ${align === 'right' ? 'text-right mr-2' : 'text-left ml-2'}`}
            value={localValue}
            onChange={(e) => setLocalValue(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => { if (e.key === 'Enter') { commit(); (e.target as HTMLInputElement).blur(); } }}
            onMouseDown={(e) => e.stopPropagation()} // Prevent node drag
        />
    );
};

export const GraphInputNode = memo(({ id, data }: NodeProps<NodeData>) => {
  const { setNodes, setEdges } = useReactFlow();

  const handleNameChange = (inputId: string, newName: string) => {
      setNodes(nds => nds.map(n => {
          if (n.id === data.scopeId || n.id === id) {
              const newInputs = (n.data.inputs || []).map(i => i.id === inputId ? { ...i, name: newName } : i);
              return { ...n, data: { ...n.data, inputs: newInputs } };
          }
          return n;
      }));
  };

  const handleDelete = (inputId: string) => {
      setNodes(nds => nds.map(n => {
          if (n.id === data.scopeId || n.id === id) {
              const newInputs = (n.data.inputs || []).filter(i => i.id !== inputId);
              return { ...n, data: { ...n.data, inputs: newInputs } };
          }
          return n;
      }));
      
      setEdges(edges => edges.filter(e => {
          // Internal: Proxy Node is Source
          if (e.source === id && e.sourceHandle === inputId) return false;
          // External: Group Node is Target
          if (data.scopeId && e.target === data.scopeId && e.targetHandle === inputId) return false;
          return true;
      }));
  };

  const handleDisconnect = (e: React.MouseEvent, handleId: string) => {
      if (e.altKey) {
          e.stopPropagation();
          e.preventDefault();
          setEdges((edges) => edges.filter((edge) => !(edge.source === id && edge.sourceHandle === handleId)));
      }
  };

  return (
    <div className="bg-zinc-900 border-2 border-emerald-600/50 rounded-lg shadow-xl min-w-[150px]">
      <div className="bg-emerald-950/80 px-3 py-2 rounded-t-lg border-b border-emerald-800 flex items-center justify-between">
        <span className="text-sm font-bold text-emerald-100">Graph Inputs</span>
        <ArrowRight size={14} className="text-emerald-400" />
      </div>
      <div className="p-2 flex flex-col gap-2">
        {data.inputs.map((input) => (
          <div key={input.id} className="relative flex items-center justify-end h-6 pr-2 group">
            <button 
                onClick={() => handleDelete(input.id)}
                className="absolute left-0 p-1 text-zinc-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                title="Delete Input"
            >
                <Trash2 size={12} />
            </button>
            <EditableLabel value={input.name} onChange={(val) => handleNameChange(input.id, val)} align="right" />
            <span className="text-[9px] text-zinc-500 uppercase mr-2">{input.type}</span>
            <Handle
              type="source"
              position={Position.Right}
              id={input.id}
              onClick={(e) => handleDisconnect(e, input.id)}
              style={{ 
                ...handleStyle, 
                backgroundColor: TYPE_COLORS[input.type] || '#777' 
              }}
            />
          </div>
        ))}
        {data.inputs.length === 0 && (
            <div className="text-[10px] text-zinc-500 italic text-center py-2">
                Connect inner nodes here to create inputs
            </div>
        )}
        <div className="relative flex items-center justify-end h-6 pr-2 border-t border-zinc-800 mt-1 pt-1">
            <span className="text-[10px] text-zinc-500 italic mr-2">New Input</span>
            <Handle
              type="source"
              position={Position.Right}
              id="__create_input__"
              style={{ 
                ...handleStyle, 
                backgroundColor: '#444',
                borderStyle: 'dashed'
              }}
            />
        </div>
      </div>
    </div>
  );
});

export const GraphOutputNode = memo(({ id, data }: NodeProps<NodeData>) => {
  const { setNodes, setEdges } = useReactFlow();

  const handleNameChange = (outputId: string, newName: string) => {
      setNodes(nds => nds.map(n => {
          if (n.id === data.scopeId || n.id === id) {
              const newOutputs = (n.data.outputs || []).map(o => o.id === outputId ? { ...o, name: newName } : o);
              return { ...n, data: { ...n.data, outputs: newOutputs } };
          }
          return n;
      }));
  };

  const handleDelete = (outputId: string) => {
      setNodes(nds => nds.map(n => {
          if (n.id === data.scopeId || n.id === id) {
              const newOutputs = (n.data.outputs || []).filter(o => o.id !== outputId);
              return { ...n, data: { ...n.data, outputs: newOutputs } };
          }
          return n;
      }));

      setEdges(edges => edges.filter(e => {
          // Internal: Proxy Node is Target
          if (e.target === id && e.targetHandle === outputId) return false;
          // External: Group Node is Source
          if (data.scopeId && e.source === data.scopeId && e.sourceHandle === outputId) return false;
          return true;
      }));
  };

  const handleDisconnect = (e: React.MouseEvent, handleId: string) => {
      if (e.altKey) {
          e.stopPropagation();
          e.preventDefault();
          setEdges((edges) => edges.filter((edge) => !(edge.target === id && edge.targetHandle === handleId)));
      }
  };

  return (
    <div className="bg-zinc-900 border-2 border-amber-600/50 rounded-lg shadow-xl min-w-[150px]">
      <div className="bg-amber-950/80 px-3 py-2 rounded-t-lg border-b border-amber-800 flex items-center justify-between">
        <ArrowLeft size={14} className="text-amber-400" />
        <span className="text-sm font-bold text-amber-100">Graph Outputs</span>
      </div>
      <div className="p-2 flex flex-col gap-2">
        {data.outputs.map((output) => (
          <div key={output.id} className="relative flex items-center h-6 pl-2 group">
            <Handle
              type="target"
              position={Position.Left}
              id={output.id}
              onClick={(e) => handleDisconnect(e, output.id)}
              style={{ 
                ...handleStyle, 
                backgroundColor: TYPE_COLORS[output.type] || '#777' 
              }}
            />
            <span className="text-[9px] text-zinc-500 uppercase ml-2 mr-2">{output.type}</span>
            <EditableLabel value={output.name} onChange={(val) => handleNameChange(output.id, val)} align="left" />
            <button 
                onClick={() => handleDelete(output.id)}
                className="absolute right-0 p-1 text-zinc-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                title="Delete Output"
            >
                <Trash2 size={12} />
            </button>
          </div>
        ))}
         {data.outputs.length === 0 && (
            <div className="text-[10px] text-zinc-500 italic text-center py-2">
                Connect inner nodes here to create outputs
            </div>
        )}
        <div className="relative flex items-center h-6 pl-2 border-t border-zinc-800 mt-1 pt-1">
            <Handle
              type="target"
              position={Position.Left}
              id="__create_output__"
              style={{ 
                ...handleStyle, 
                backgroundColor: '#444',
                borderStyle: 'dashed'
              }}
            />
            <span className="text-[10px] text-zinc-500 italic ml-2">New Output</span>
        </div>
      </div>
    </div>
  );
});

