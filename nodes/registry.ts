
import { ShaderNodeDefinition } from '../types';

// Helper to validate if an object is a valid node definition (for JSON import)
export const validateNodeDefinition = (obj: any): obj is ShaderNodeDefinition => {
    return (
        typeof obj === 'object' &&
        obj !== null &&
        typeof obj.id === 'string' &&
        typeof obj.label === 'string' &&
        typeof obj.category === 'string' &&
        obj.data &&
        typeof obj.data.glsl === 'string'
    );
}

// Helper to normalize a raw JSON object
export const normalizeNodeDefinition = (json: any): ShaderNodeDefinition => {
    // Deep clone to avoid mutating source
    const obj = JSON.parse(JSON.stringify(json));
    
    // Handle "glsl": ["line 1", "line 2"]
    if (obj.data && Array.isArray(obj.data.glsl)) {
        obj.data.glsl = obj.data.glsl.join('\n');
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
const modules = import.meta.glob('./library/*.json', { eager: true });

export const NODE_REGISTRY: ShaderNodeDefinition[] = Object.values(modules).map((mod: any) => {
    // The default export or the module itself is the JSON content
    const json = mod.default || mod;
    return normalizeNodeDefinition(json);
});

// Helper to quickly find a definition
export const getNodeDefinition = (id: string) => NODE_REGISTRY.find(n => n.id === id);
