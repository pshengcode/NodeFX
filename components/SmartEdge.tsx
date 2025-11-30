
import React from 'react';
import { BaseEdge, EdgeProps, getBezierPath, useStore } from 'reactflow';
import { NodeData } from '../types';
import { TYPE_COLORS } from '../constants';

const SmartEdge: React.FC<EdgeProps> = ({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style = {},
  markerEnd,
  source,
  target,
  sourceHandleId,
  targetHandleId,
}) => {
  // Use useStore to subscribe to node changes so edge colors update automatically
  const sourceNode = useStore((s) => s.nodeInternals.get(source));
  const targetNode = useStore((s) => s.nodeInternals.get(target));

  const [edgePath] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  // Default color if lookup fails
  let startColor = '#71717a'; // zinc-500
  let endColor = '#71717a';

  if (sourceNode && targetNode) {
    const sData = sourceNode.data as NodeData;
    const tData = targetNode.data as NodeData;

    // 1. Determine Source Type
    let sourceType = sData.outputType;
    
    // Special handling for GraphInputNode (Proxy)
    if (sourceNode.type === 'graphInput') {
        // For GraphInput, the "inputs" of the parent become the "outputs" (sources) inside the graph
        if (sourceHandleId && sData.inputs) {
            const inputDef = sData.inputs.find(i => i.id === sourceHandleId);
            if (inputDef) sourceType = inputDef.type;
        }
    } else {
        // Standard Node
        if (sourceHandleId && sData.outputs) {
            const outputDef = sData.outputs.find((o) => o.id === sourceHandleId);
            if (outputDef) sourceType = outputDef.type;
        }
    }

    // 2. Determine Target Type
    let targetType = 'float'; // Default fallback
    
    // Special handling for GraphOutputNode (Proxy)
    if (targetNode.type === 'graphOutput') {
        // For GraphOutput, the "outputs" of the parent become the "inputs" (targets) inside the graph
        if (targetHandleId && tData.outputs) {
            const outputDef = tData.outputs.find(o => o.id === targetHandleId);
            if (outputDef) targetType = outputDef.type;
        }
    } else {
        // Standard Node
        if (tData.inputs && tData.inputs.length > 0) {
            targetType = tData.inputs[0].type;
        }
        
        if (targetHandleId && tData.inputs) {
            const inputDef = tData.inputs.find((i) => i.id === targetHandleId);
            if (inputDef) targetType = inputDef.type;
        }
    }

    // 3. Map to Colors
    if (TYPE_COLORS[sourceType]) startColor = TYPE_COLORS[sourceType];
    if (TYPE_COLORS[targetType]) endColor = TYPE_COLORS[targetType];
  }

  // If colors are the same, render a solid line
  if (startColor === endColor) {
    return (
      <BaseEdge
        path={edgePath}
        markerEnd={markerEnd}
        style={{
          ...style,
          strokeWidth: 2,
          stroke: startColor,
        }}
      />
    );
  }

  // If colors are different, render a Gradient
  const gradientId = `edge-gradient-${id}`;

  return (
    <>
      <defs>
        <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor={startColor} />
          <stop offset="100%" stopColor={endColor} />
        </linearGradient>
      </defs>
      <BaseEdge
        path={edgePath}
        markerEnd={markerEnd}
        style={{
          ...style,
          strokeWidth: 2,
          stroke: `url(#${gradientId})`,
        }}
      />
    </>
  );
};

export default React.memo(SmartEdge);
