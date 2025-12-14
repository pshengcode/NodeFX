// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import { compileGraph } from './shaderCompiler';
import { Node, Edge } from 'reactflow';
import { NodeData } from '../types';

// Mock texture generation to avoid canvas dependency issues in test environment if needed
// But jsdom should handle basic canvas.
// We'll just mock the functions if they are imported.
vi.mock('./textureGen', () => ({
    generateGradientTexture: () => ({ data: new Uint8ClampedArray(4), width: 1, height: 1 }),
    generateCurveTexture: () => ({ data: new Uint8ClampedArray(4), width: 1, height: 1 })
}));

describe('shaderCompiler', () => {
    it('compiles a single node graph', () => {
        const nodes: Node<NodeData>[] = [
            {
                id: 'node1',
                type: 'customShader',
                position: { x: 0, y: 0 },
                data: {
                    label: 'Test Node',
                    glsl: 'void run(vec2 uv, out vec4 res) { res = vec4(1.0); }',
                    inputs: [],
                    outputs: [{ id: 'res', name: 'Res', type: 'vec4' }],
                    outputType: 'vec4',
                    uniforms: {}
                }
            }
        ];
        const edges: Edge[] = [];

        const result = compileGraph(nodes, edges, 'node1');
        expect(result.error).toBeUndefined();
        expect(result.passes).toHaveLength(1);
        expect(result.passes[0].fragmentShader).toContain('void main()');
    });

    it('compiles two connected nodes', () => {
        const nodes: Node<NodeData>[] = [
            {
                id: 'source',
                type: 'customShader',
                position: { x: 0, y: 0 },
                data: {
                    label: 'Source',
                    glsl: 'void run(vec2 uv, out float val) { val = 1.0; }',
                    inputs: [],
                    outputs: [{ id: 'val', name: 'Val', type: 'float' }],
                    outputType: 'float',
                    uniforms: {}
                }
            },
            {
                id: 'target',
                type: 'customShader',
                position: { x: 100, y: 0 },
                data: {
                    label: 'Target',
                    glsl: 'void run(vec2 uv, float inVal, out vec4 res) { res = vec4(inVal); }',
                    inputs: [{ id: 'inVal', name: 'In', type: 'float' }],
                    outputs: [{ id: 'res', name: 'Res', type: 'vec4' }],
                    outputType: 'vec4',
                    uniforms: {}
                }
            }
        ];
        const edges: Edge[] = [
            { id: 'e1', source: 'source', target: 'target', targetHandle: 'inVal' }
        ];

        const result = compileGraph(nodes, edges, 'target');
        expect(result.error).toBeUndefined();
        expect(result.passes).toHaveLength(1);
        // Check if source function is called
        expect(result.passes[0].fragmentShader).toContain('node_source_run');
    });

    it('handles cycle detection gracefully', () => {
        // Create a simple cycle: A -> B -> A
        const nodes: Node<NodeData>[] = [
            {
                id: 'A',
                type: 'customShader',
                position: { x: 0, y: 0 },
                data: {
                    label: 'A',
                    glsl: 'void run(vec2 uv, float inB, out float outA) { outA = inB; }',
                    inputs: [{ id: 'inB', name: 'inB', type: 'float' }],
                    outputs: [{ id: 'outA', name: 'outA', type: 'float' }],
                    outputType: 'float',
                    uniforms: {}
                }
            },
            {
                id: 'B',
                type: 'customShader',
                position: { x: 100, y: 0 },
                data: {
                    label: 'B',
                    glsl: 'void run(vec2 uv, float inA, out float outB) { outB = inA; }',
                    inputs: [{ id: 'inA', name: 'inA', type: 'float' }],
                    outputs: [{ id: 'outB', name: 'outB', type: 'float' }],
                    outputType: 'float',
                    uniforms: {}
                }
            }
        ];
        const edges: Edge[] = [
            { id: 'e1', source: 'A', target: 'B', targetHandle: 'inA' },
            { id: 'e2', source: 'B', target: 'A', targetHandle: 'inB' }
        ];

        // Should not throw stack overflow
        const result = compileGraph(nodes, edges, 'B');
        // It might return an error or break the cycle. The implementation catches errors.
        // The implementation logs a warning and breaks the edge.
        expect(result.passes).toBeDefined();
    });

    it('handles type casting correctly', () => {
        const nodes: Node<NodeData>[] = [
            {
                id: 'n1',
                type: 'customShader',
                position: { x: 0, y: 0 },
                data: {
                    label: 'Float Node',
                    glsl: 'void run(vec2 uv, out float val) { val = 1.0; }',
                    inputs: [],
                    outputs: [{ id: 'val', name: 'Val', type: 'float' }],
                    outputType: 'float',
                    uniforms: {}
                }
            },
            {
                id: 'n2',
                type: 'customShader',
                position: { x: 100, y: 0 },
                data: {
                    label: 'Vec4 Node',
                    glsl: 'void run(vec2 uv, vec4 inVal, out vec4 res) { res = inVal; }',
                    inputs: [{ id: 'inVal', name: 'In', type: 'vec4' }],
                    outputs: [{ id: 'res', name: 'Res', type: 'vec4' }],
                    outputType: 'vec4',
                    uniforms: {}
                }
            }
        ];
        const edges: Edge[] = [
            { id: 'e1', source: 'n1', target: 'n2', targetHandle: 'inVal', sourceHandle: 'val' }
        ];

        const result = compileGraph(nodes, edges, 'n2');
        expect(result.error).toBeUndefined();
        const code = result.passes[0].fragmentShader;
        // Expect casting logic: vec4(vec3(float), 1.0)
        expect(code).toMatch(/vec4\(vec3\(.*?\), 1\.0\)/);
    });

    it('compiles graph with GraphInput and GraphOutput', () => {
        const nodes: Node<NodeData>[] = [
            {
                id: 'input',
                type: 'graphInput',
                position: { x: 0, y: 0 },
                data: {
                    label: 'Input',
                    glsl: '',
                    inputs: [{ id: 'in1', name: 'In1', type: 'float' }], // GraphInput "inputs" are actually its outputs to the graph
                    outputs: [{ id: 'in1', name: 'In1', type: 'float' }], // Logic mirrors this
                    outputType: 'float',
                    uniforms: {}
                }
            },
            {
                id: 'process',
                type: 'customShader',
                position: { x: 100, y: 0 },
                data: {
                    label: 'Process',
                    glsl: 'void run(vec2 uv, float val, out float res) { res = val * 2.0; }',
                    inputs: [{ id: 'val', name: 'Val', type: 'float' }],
                    outputs: [{ id: 'res', name: 'Res', type: 'float' }],
                    outputType: 'float',
                    uniforms: {}
                }
            },
            {
                id: 'output',
                type: 'graphOutput',
                position: { x: 200, y: 0 },
                data: {
                    label: 'Output',
                    glsl: '',
                    inputs: [{ id: 'res', name: 'Res', type: 'float' }],
                    outputs: [],
                    outputType: 'vec4',
                    uniforms: {}
                }
            }
        ];
        const edges: Edge[] = [
            { id: 'e1', source: 'input', target: 'process', sourceHandle: 'in1', targetHandle: 'val' },
            { id: 'e2', source: 'process', target: 'output', sourceHandle: 'res', targetHandle: 'res' }
        ];

        const result = compileGraph(nodes, edges, 'output');
        expect(result.error).toBeUndefined();
        const code = result.passes[0].fragmentShader;
        
        // Check for uniform generation for GraphInput
        expect(code).toContain('uniform float u_input_in1;');
        // Check for main function calling structure
        expect(code).toContain('node_input_run');
        expect(code).toContain('node_process_run');
        expect(code).toContain('node_output_run');
    });

    it('renders the correct output when a multi-output node feeds a sampler2D input', () => {
        const nodes: Node<NodeData>[] = [
            {
                id: 'bevel',
                type: 'customShader',
                position: { x: 0, y: 0 },
                data: {
                    label: 'Bevel (Mock)',
                    glsl: 'void run(vec2 uv, out vec4 result, out vec4 normalOut) { result = vec4(1.0, 0.0, 0.0, 1.0); normalOut = vec4(0.0, 1.0, 0.0, 1.0); }',
                    inputs: [],
                    outputs: [
                        { id: 'result', name: 'Result', type: 'vec4' },
                        { id: 'normalOut', name: 'Normal', type: 'vec4' }
                    ],
                    outputType: 'vec4',
                    uniforms: {}
                }
            },
            {
                id: 'disp',
                type: 'customShader',
                position: { x: 100, y: 0 },
                data: {
                    label: 'Dispersion (Mock)',
                    glsl: 'void run(vec2 uv, sampler2D normalMap, out vec4 outCol) { outCol = texture(normalMap, uv); }',
                    inputs: [{ id: 'normalMap', name: 'Normal Map', type: 'sampler2D' }],
                    outputs: [{ id: 'outCol', name: 'Out', type: 'vec4' }],
                    outputType: 'vec4',
                    uniforms: {}
                }
            }
        ];

        const edges: Edge[] = [
            { id: 'e1', source: 'bevel', target: 'disp', sourceHandle: 'normalOut', targetHandle: 'normalMap' }
        ];

        const result = compileGraph(nodes, edges, 'disp');
        expect(result.error).toBeUndefined();

        // Should create a dependency pass for bevel's normalOut output.
        const bevelPass = result.passes.find(p => p.id === 'bevel::normalOut');
        expect(bevelPass).toBeDefined();
        expect(bevelPass!.fragmentShader).toContain('fragColor = out_bevel_normalOut');

        const dispPass = result.passes.find(p => p.id === 'disp');
        expect(dispPass).toBeDefined();
        expect(dispPass!.fragmentShader).toContain('uniform sampler2D u_pass_bevel_normalOut_tex');
    });
});
