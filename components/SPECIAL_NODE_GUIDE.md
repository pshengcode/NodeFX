# 特殊节点开发指南 (Special Node Development Guide)

本文档旨在指导开发者如何创建“特殊节点”（Special Nodes）。

## 什么是特殊节点？

在本项目中，“特殊节点”是指那些拥有复杂内部状态（如 Canvas 绘图、WebGL 模拟、粒子系统等）的节点。与普通节点（仅处理输入输出）不同，特殊节点需要：

1.  **维护本地状态**：为了高性能交互（如 60fps 的绘图或参数调整），节点必须维护自己的 React State 或 Ref。
2.  **支持持久化**：本地状态必须最终同步到 React Flow 的 `node.data.settings` 中，以便保存项目。
3.  **支持撤销/重做 (Undo/Redo)**：当用户触发撤销操作时，React Flow 会恢复旧的 `node.data`，节点必须能够监听到这一变化并更新自己的本地状态。

## 核心工具：`useNodeSettings`

为了简化上述逻辑，我们提供了一个通用的 Hook：`useNodeSettings`。

位置：`hooks/useNodeSync.ts`

### 功能
*   **自动初始化**：从 `data.settings` 加载初始值，并自动合并默认值。
*   **双向同步**：
    *   **Downstream (本地 -> 全局)**：当本地状态改变时，自动防抖（默认 500ms）同步到 `node.data.settings`。
    *   **Upstream (全局 -> 本地)**：当 `node.data.settings` 发生变化（如 Undo 操作）时，自动更新本地状态。
*   **回声消除 (Echo Prevention)**：智能识别更新来源，防止 Undo 操作触发不必要的写回操作，确保历史记录干净。
*   **性能优化**：内部使用 `useMemo` 缓存默认配置，避免不必要的重渲染。

## 实现步骤

### 1. 引入 Hook

```typescript
import { useNodeSettings } from '../hooks/useNodeSync';
import { NodeProps } from 'reactflow';
import { NodeData } from '../types';
```

### 2. 定义默认配置

定义一个包含所有可持久化参数的默认对象。

```typescript
const DEFAULT_SETTINGS = {
    color: '#ffffff',
    size: 10,
    isEnabled: true,
    mode: 'simple'
};
```

### 3. 在组件中使用 Hook

```typescript
const MySpecialNode = ({ id, data }: NodeProps<NodeData>) => {
    
    // 使用 Hook 管理状态
    // settings: 当前的完整配置对象
    // updateSettings: 用于更新配置的函数（支持部分更新）
    const [settings, updateSettings] = useNodeSettings(id, data, DEFAULT_SETTINGS);

    // 解构出具体的值，方便在 UI 中使用
    const { color, size, isEnabled, mode } = settings;

    // ... 渲染逻辑
};
```

### 4. 更新状态

使用 `updateSettings` 来更新状态。它会自动合并新值，并处理防抖同步。

```typescript
// 简单更新
<input 
    value={color} 
    onChange={(e) => updateSettings({ color: e.target.value })} 
/>

// 基于旧值的更新
<button onClick={() => updateSettings(prev => ({ size: prev.size + 1 }))}>
    Increase Size
</button>
```

## 完整代码模板

```typescript
import React, { memo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { NodeData } from '../types';
import { useNodeSettings } from '../hooks/useNodeSync';

// 1. 定义默认值
const DEFAULT_SETTINGS = {
    intensity: 1.0,
    color: '#ff0000',
    active: true
};

const MySpecialNode = memo(({ id, data, selected }: NodeProps<NodeData>) => {
    
    // 2. 初始化 Hook
    const [settings, updateSettings] = useNodeSettings(id, data, DEFAULT_SETTINGS);
    
    // 3. 解构状态
    const { intensity, color, active } = settings;

    // 4. 辅助更新函数（可选，为了代码更整洁）
    const setIntensity = (v: number) => updateSettings({ intensity: v });
    const toggleActive = () => updateSettings(prev => ({ active: !prev.active }));

    return (
        <div className="custom-node-container">
            <div className="node-header">My Special Node</div>
            
            <div className="node-content">
                <label>Intensity: {intensity}</label>
                <input 
                    type="range" 
                    min="0" max="10" 
                    value={intensity} 
                    onChange={(e) => setIntensity(parseFloat(e.target.value))} 
                />
                
                <button onClick={toggleActive}>
                    {active ? 'Stop' : 'Start'}
                </button>
            </div>

            <Handle type="source" position={Position.Right} />
            <Handle type="target" position={Position.Left} />
        </div>
    );
});

export default MySpecialNode;
```

## 图像输入与输出规范 (Image I/O Specification)

特殊节点通常需要处理图像输入（从上游节点接收）和输出（生成图像供下游使用）。请遵循以下规范。

### 1. 处理输入 (Inputs)

如果你的节点需要接收图像输入（例如作为遮罩或发射源）：

1.  **查找连接**：在 `useEffect` 中查找连接到特定 Handle 的 Edge。
2.  **编译图表（仅当源码结构变化时）**：使用 `compileGraph` 获取上游节点的渲染数据。
3.  **实时更新 Uniform（不触发重编译）**：将“精确 uniform 名称”的 `uniformOverrides` 传给 `<ShaderPreview>`，让上游参数（run 入参的值 / 未连线时走 uniform）变化能实时反映到输入纹理。
4.  **隐藏渲染**：使用 `<ShaderPreview>` 将上游数据渲染到隐藏 Canvas。
5.  **读取数据**：在你的主渲染循环中读取这个隐藏 Canvas 的内容。

> 说明：本项目把“图编译”分成两层：
> - `compileGraph(...)`：把节点图拼成 GLSL 源码 + uniform 表（CPU 侧）。
> - `webglSystem.render(...)`：只有当 shader code 字符串变化时才会真正 compile/link WebGL program；uniform 值变化应只更新 `gl.uniform*`。
>
> 因此，**上游参数值变化不应该触发 `compileGraph`**（否则 slider 会很“重”），但必须通过 `uniformOverrides` 让渲染拿到最新值。

```typescript
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from 'reactflow';
import { compileGraph } from '../utils/shaderCompiler';
import { buildUniformOverridesFromNodes } from '../utils/uniformOverrides';
import { useOptimizedNodes } from '../hooks/useOptimizedNodes';

// 1) 状态定义
const [compiledInput, setCompiledInput] = useState<CompilationResult | null>(null);
const inputCanvasRef = useRef<HTMLCanvasElement>(null);

// 2) 订阅 edges（结构变化），订阅 nodes（data 变化但不因拖拽 position 变化而重渲）
const nodes = useOptimizedNodes();
const edges = useStore((s: any) => s.edges, (a: any[], b: any[]) => JSON.stringify(a) === JSON.stringify(b));

// 3) uniformOverrides：用于实时更新上游参数值（不触发重编译）
const uniformOverrides = useMemo(
    () => buildUniformOverridesFromNodes(nodes as any),
    [nodes]
);

// 4) graphCodeHash：只包含会影响 shader SOURCE 的结构信息（排除 uniform.value）
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
                ),
            }
        })),
        edges: edges.map((e: any) => ({ s: e.source, t: e.target, sh: e.sourceHandle, th: e.targetHandle })),
    };
    return JSON.stringify(structure);
}, [nodes, edges]);

const prevCompileKeyRef = useRef<string>('');

// 5) 监听连接并编译：只在源码结构变化时 compileGraph
useEffect(() => {
    const inputEdge = edges.find(e => e.target === id && e.targetHandle === 'input_image');
    if (!inputEdge) {
        prevCompileKeyRef.current = '';
        setCompiledInput(null);
        return;
    }

    const compileKey = `${inputEdge.source}|${graphCodeHash}`;
    if (compileKey === prevCompileKeyRef.current) return;
    prevCompileKeyRef.current = compileKey;

    const result = compileGraph(nodes as any, edges, inputEdge.source);
    setCompiledInput(result);
}, [id, nodes, edges, graphCodeHash]);

// 6) JSX 中渲染隐藏 Preview（关键：传 uniformOverrides）
// <div className="hidden">
//   {compiledInput && (
//     <ShaderPreview
//       ref={inputCanvasRef}
//       data={compiledInput}
//       width={width}
//       height={height}
//       uniformOverrides={uniformOverrides}
//     />
//   )}
// </div>

// 7) 主循环使用
// ctx.drawImage(inputCanvasRef.current, 0, 0);
```

### 2. 处理输出 (Outputs)

如果你的节点生成图像：

1.  **注册动态纹理**：使用 `registerDynamicTexture` 将你的主 Canvas 注册到全局注册表。
2.  **暴露 Uniform**：更新 `node.data.uniforms`，让下游节点知道去哪里读取这个纹理。

```typescript
useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // A. 注册纹理
    const dynamicId = `dynamic://${id}`;
    registerDynamicTexture(dynamicId, canvas);

    // B. 通知下游节点 (更新自身的 Uniform 定义)
    // 注意：这里不需要防抖，因为通常只在初始化时执行一次
    setNodes((nds) => nds.map((node) => {
        if (node.id === id) {
            if (node.data.uniforms?.image?.value === dynamicId) return node;
            return {
                ...node,
                data: {
                    ...node.data,
                    uniforms: {
                        ...node.data.uniforms,
                        // 定义一个名为 'image' 的 sampler2D 输出
                        image: { type: 'sampler2D', value: dynamicId }
                    }
                }
            };
        }
        return node;
    }));

    // C. 清理
    return () => {
        unregisterDynamicTexture(dynamicId);
    };
}, [id, setNodes]);
```

## 常用 Hook 与 交互模式 (Common Hooks & Interaction Patterns)

为了保持特殊节点的高性能和一致的交互体验，请使用以下标准模式。

### 1. 高性能数据访问

普通节点可能直接使用 `useNodes` 和 `useEdges`，但这会导致特殊节点（通常包含 Canvas）在画布拖动时频繁重渲染，造成严重的性能问题。

**推荐做法：**

```typescript
import { useStore } from 'reactflow';
import { useOptimizedNodes } from '../hooks/useOptimizedNodes';

// 定义选择器和比较函数（在组件外部）
const edgesSelector = (state: any) => state.edges;
const deepEqual = (a: any, b: any) => JSON.stringify(a) === JSON.stringify(b);

const MySpecialNode = memo(({ id, data }: NodeProps<NodeData>) => {
    // 1. 获取节点列表 (优化版，避免拖拽重渲染)
    const nodes = useOptimizedNodes();
    
    // 2. 获取边列表 (使用 selector + deepEqual)
    const edges = useStore(edgesSelector, deepEqual);
    
    // ...
});
```

### 2. 标准交互逻辑

特殊节点应支持统一的快捷操作。

**Alt + Click 断开连接**

允许用户按住 Alt 键点击 Handle 来快速断开连接。

```typescript
const { setEdges } = useReactFlow();

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

// 使用
// <Handle onClick={(e) => handleDisconnect(e, 'handle_id', 'source')} ... />
```

## 高级话题

### 动态纹理 (Dynamic Textures)
如果你的节点生成纹理（如 `FluidSimulationNode` 或 `PaintNode`），你需要将其注册到系统中，以便其他节点可以使用它。

```typescript
import { registerDynamicTexture, unregisterDynamicTexture } from '../utils/dynamicRegistry';

useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas) {
        const textureId = `dynamic://${id}`;
        registerDynamicTexture(textureId, canvas);
        
        return () => {
            unregisterDynamicTexture(textureId);
        };
    }
}, [id]);
```

### 性能优化
*   **防抖 (Debounce)**: `useNodeSettings` 默认有 500ms 的防抖。这意味着当你快速拖动滑块时，React Flow 的数据模型（以及 Undo 栈）不会每毫秒都更新，而是在停止操作 500ms 后更新一次。这对于性能至关重要。
*   **useOptimizedNodes**: 如果你的节点需要访问其他节点的信息，请使用 `useOptimizedNodes` 替代 `useNodes`，以避免在拖拽画布时发生不必要的重渲染。

## 最佳实践

1.  **始终使用 `updateSettings`**：不要尝试手动调用 `setNodes` 来更新设置，除非你有非常特殊的理由。`updateSettings` 处理了防抖和同步逻辑。
2.  **不要在组件内维护重复状态**：尽量直接使用 `settings` 中的值。如果你必须使用额外的 `useState`（例如为了极高性能的动画循环），请确保你理解数据流向。
3.  **默认值稳定性**：`useNodeSettings` 会自动处理默认值的引用稳定性，你不需要在组件外定义 `DEFAULT_SETTINGS`，直接在组件内定义对象字面量也是安全的。

## 常见问题

**Q: 为什么我的 Undo 不工作？**
A: 确保你没有在组件内部使用额外的 `useState` 来存储这些设置，而是完全依赖 `useNodeSettings` 返回的 `settings`。如果你必须使用 `useState`（例如为了极高性能的动画循环），请确保在 `useEffect` 中监听 `data.settings` 的变化并同步回你的本地 state。

**Q: 我可以手动调用 setNodes 吗？**
A: 可以，但尽量避免。`useNodeSettings` 已经为你处理了大部分同步逻辑。手动调用容易导致死循环或覆盖掉防抖逻辑。

## 性能优化与 Hook 选择指南 (Performance & Hooks)

为了保证应用在大量节点场景下的流畅性（特别是拖动节点时的 60fps 体验），在开发新节点时请严格遵守以下 Hook 使用规范。

### ❌ 严禁使用 (Don't Use)

1.  **`useProject()` 中的 `nodes` 状态**
    *   **原因**: `nodes` 数组包含所有节点的位置信息 (`position`)。当用户拖动任何节点时，该数组在每一帧都会更新。
    *   **后果**: 如果你的节点组件直接依赖 `nodes`，它将在拖动过程中每秒重渲染 60 次，导致严重的性能卡顿（"不跟手"）。
    *   **错误示例**:
        ```typescript
        const { nodes } = useProject(); // ❌ 拖动时会无限重渲染
        const myParent = nodes.find(n => n.id === parentId);
        ```

2.  **`useNodes()` (React Flow)**
    *   **原因**: 同上，直接订阅整个节点列表会导致对位置变化敏感。

### ✅ 推荐使用 (Recommended)

1.  **`useOptimizedNodes()`**
    *   **用途**: 当你需要访问**其他节点**的数据（如查找父节点、读取连接节点的类型）时。
    *   **原理**: 该 Hook 内部实现了深度比较，**自动过滤掉了位置 (`position`) 的变化**。只有当节点的结构（ID, Type）或业务数据 (`data`) 发生变化时，才会触发更新。
    *   **位置**: `hooks/useOptimizedNodes.ts`
    *   **正确示例**:
        ```typescript
        import { useOptimizedNodes } from '../hooks/useOptimizedNodes';
        
        const MyNode = () => {
            const nodes = useOptimizedNodes(); // ✅ 拖动时不会触发重渲染
            // ...
        };
        ```

2.  **`useNodeSettings()`**
    *   **用途**: 管理节点自身的 UI 状态（如颜色选择器、复选框、滑块值）。
    *   **原理**: 维护本地 React State 实现高频交互（0延迟），并使用防抖（Debounce）机制异步同步到全局 Store，避免阻塞主线程。

3.  **`useStore()` + Selector (React Flow)**
    *   **用途**: 当你需要极其精细地订阅某个特定状态时。
    *   **示例**:
        ```typescript
        const zoom = useStore(s => s.transform[2]); // 仅在缩放变化时更新
        ```

### ⚠️ 开发注意事项

1.  **拖动测试**: 开发完新节点后，务必进行拖动测试。打开开发者工具的 "Highlight updates"，拖动节点，确保**只有被拖动的节点**在更新，其他节点应当保持静止（不重渲染）。
2.  **连接逻辑**: 如果需要在连线时执行逻辑（如动态创建端口），请确保逻辑放在 `useGraphActions` 或 `onConnect` 回调中，而不要写在组件的渲染周期里。

