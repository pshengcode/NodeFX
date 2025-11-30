
import { describe, it, expect } from 'vitest';
import { ShaderNodeDefinitionSchema } from '../utils/schemas';

// Use import.meta.glob to load all JSON files in the library
const libraryFiles = import.meta.glob('./library/*.json', { eager: true });

describe('Node Library', () => {
    it('validates all node definitions against schema', () => {
        Object.entries(libraryFiles).forEach(([path, content]: [string, any]) => {
            // The content might be the default export or the module itself
            const nodeDef = content.default || content;
            
            const result = ShaderNodeDefinitionSchema.safeParse(nodeDef);
            
            if (!result.success) {
                console.error(`Validation failed for ${path}:`, JSON.stringify(result.error.format(), null, 2));
            }
            
            expect(result.success, `Node definition in ${path} should be valid`).toBe(true);
        });
    });
});
