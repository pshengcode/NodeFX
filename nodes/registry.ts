
import { ShaderNodeDefinition } from '../types';
import { ShaderNodeDefinitionSchema } from '../utils/schemas';
import { extractShaderIO } from '../utils/glslParser';

// Helper to validate if an object is a valid node definition (for JSON import)
export const validateNodeDefinition = (obj: any): obj is ShaderNodeDefinition => {
    const result = ShaderNodeDefinitionSchema.safeParse(obj);
    if (!result.success) {
        console.warn("Node Validation Failed:", result.error.format());
        return false;
    }
    return true;
}

// Helper to normalize a raw JSON object
export const normalizeNodeDefinition = (json: any): ShaderNodeDefinition => {
    // Deep clone to avoid mutating source
    const obj = JSON.parse(JSON.stringify(json));

    // Handle multi-pass: allow passes[].glsl to be an array of strings
    if (obj.data && Array.isArray(obj.data.passes)) {
        obj.data.passes = obj.data.passes.map((p: any) => {
            if (p && Array.isArray(p.glsl)) {
                return { ...p, glsl: p.glsl.join('\n') };
            }
            return p;
        });
    }
    
    // Handle "glsl": ["line 1", "line 2"]
    if (obj.data && Array.isArray(obj.data.glsl)) {
        obj.data.glsl = obj.data.glsl.join('\n');
    }

    // Auto-detect overloading if not explicitly set (single-pass only)
    if (obj.data && obj.data.glsl && obj.data.autoType === undefined) {
        const { isOverloaded } = extractShaderIO(obj.data.glsl);
        if (isOverloaded) {
            obj.data.autoType = true;
        }
    }

    // If overloaded, default ports should follow the first item in //Item[name,order] sorting.
    // This ensures nodes like Swizzle are created with the default overload, not a hard-coded union.
    if (obj.data && obj.data.glsl && obj.data.autoType === true) {
        const parsed = extractShaderIO(obj.data.glsl);
        if (parsed.valid) {
            obj.data.inputs = parsed.inputs;
            obj.data.outputs = parsed.outputs;
            if (Array.isArray(parsed.outputs) && parsed.outputs.length > 0) {
                obj.data.outputType = parsed.outputs[0].type;
            }
        }
    }

    // Ensure outputs array exists.
    if (!obj.data.outputs) {
        obj.data.outputs = [{ 
            id: 'result', 
            name: 'Result', 
            type: obj.data.outputType || 'vec4' 
        }];
    }

    return obj as ShaderNodeDefinition;
}

// Load all JSON files from the library folder
// Keep eager loading for simplicity - the JSON files are text and compress well
// Alternative: could split into separate chunks per category in the future
const modules = import.meta.glob('./library/*.json', { eager: true });

export const NODE_REGISTRY: ShaderNodeDefinition[] = Object.values(modules).map((mod: any) => {
    // The default export or the module itself is the JSON content
    const json = mod.default || mod;
    
    // Optional: Validate library nodes during load
    const validation = ShaderNodeDefinitionSchema.safeParse(json);
    if (!validation.success) {
        console.error(`Invalid Node Definition in library (${json.id || 'unknown'}):`, validation.error.format());
    }

    return normalizeNodeDefinition(json);
});

// Helper to quickly find a definition
export const getNodeDefinition = (id: string) => NODE_REGISTRY.find(n => n.id === id);
