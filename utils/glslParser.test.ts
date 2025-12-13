// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { stripComments, extractShaderIO, extractAllSignatures } from './glslParser';

describe('glslParser', () => {
    describe('stripComments', () => {
        it('removes line comments', () => {
            const code = `
                float a = 1.0; // This is a comment
                float b = 2.0;
            `;
            const expected = `
                float a = 1.0; 
                float b = 2.0;
            `;
            expect(stripComments(code).trim()).toBe(expected.trim());
        });

        it('removes block comments', () => {
            const code = `
                /* Block comment 
                   spanning multiple lines */
                void main() {}
            `;
            expect(stripComments(code)).not.toContain('Block comment');
            expect(stripComments(code)).toContain('void main');
        });

        it('preserves metadata directives in line comments', () => {
            const code = `
                //Item[Vec4,2]
                void run(vec2 uv, out vec4 result) { result = vec4(1.0); }
                // normal comment should be stripped
            `;
            const out = stripComments(code);
            expect(out).toContain('//Item[Vec4,2]');
            expect(out).not.toContain('normal comment');
        });
    });

    describe('extractShaderIO', () => {
        it('extracts simple inputs', () => {
            const code = `void run(float a, vec3 b) { }`;
            const io = extractShaderIO(code);
            expect(io.inputs).toHaveLength(2);
            expect(io.inputs[0]).toEqual({ id: 'a', name: 'a', type: 'float' });
            expect(io.inputs[1]).toEqual({ id: 'b', name: 'b', type: 'vec3' });
        });

        it('extracts outputs with out qualifier', () => {
            const code = `void run(float input1, out vec4 result) { }`;
            const io = extractShaderIO(code);
            expect(io.inputs).toHaveLength(1);
            expect(io.outputs).toHaveLength(1);
            expect(io.outputs[0]).toEqual({ id: 'result', name: 'result', type: 'vec4' });
        });

        it('ignores uv argument', () => {
            const code = `void run(vec2 uv, float time) { }`;
            const io = extractShaderIO(code);
            expect(io.inputs).toHaveLength(1);
            expect(io.inputs[0].id).toBe('time');
        });

        it('handles inout and const qualifiers', () => {
            const code = `void run(const in float a, inout vec3 b) { }`;
            const io = extractShaderIO(code);
            expect(io.inputs).toHaveLength(1);
            expect(io.inputs[0].id).toBe('a');
            expect(io.outputs).toHaveLength(1);
            expect(io.outputs[0].id).toBe('b');
        });

        it('handles precision qualifiers', () => {
            const code = `void run(highp float a, out mediump vec2 b) { }`;
            const io = extractShaderIO(code);
            expect(io.inputs[0].type).toBe('float');
            expect(io.outputs[0].type).toBe('vec2');
        });
    });

    describe('extractAllSignatures', () => {
        it('detects overloads', () => {
            const code = `
                void run(float a) {}
                void run(vec3 a) {}
            `;
            const sigs = extractAllSignatures(code);
            expect(sigs).toHaveLength(2);
            expect(sigs[0].inputs[0].type).toBe('float');
            expect(sigs[1].inputs[0].type).toBe('vec3');
        });

        it('ignores helper functions', () => {
            const code = `
                float helper(float x) { return x; }
                void run(float a) {}
            `;
            const sigs = extractAllSignatures(code);
            expect(sigs).toHaveLength(1);
            expect(sigs[0].inputs[0].id).toBe('a');
        });

        it('reads label/order from //Item[name,order] directives', () => {
            const code = `
                //Item[Float,1]
                void run(vec2 uv, vec4 a, out float result) { result = a.x; }

                //Item[Vec4]
                void run(vec2 uv, vec4 a, out vec4 result) { result = a; }
            `;

            const sigs = extractAllSignatures(code);
            expect(sigs).toHaveLength(2);
            expect(sigs[0].label).toBe('Float');
            expect(sigs[0].order).toBe(1);
            expect(sigs[1].label).toBe('Vec4');
            expect(sigs[1].order).toBe(0);
        });
    });
});
