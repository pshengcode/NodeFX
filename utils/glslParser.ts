
import { GLSLType, NodeInput, NodeOutput } from '../types';

import { GLSL_TYPE_STRINGS } from './glslTypeUtils';

// GLSL Types we care about for ports
const VALID_TYPES = new Set<string>(GLSL_TYPE_STRINGS as readonly string[]);

interface Token {
    type: 'keyword' | 'identifier' | 'symbol' | 'number' | 'preprocessor';
    value: string;
    line: number;
}

/**
 * Strips block and line comments from GLSL code.
 * This is crucial before performing any regex or parsing logic.
 */
export const stripComments = (code: string): string => {
    if (!code) return '';
    let out = '';
    let i = 0;
    const len = code.length;
    
    while (i < len) {
        const char = code[i];
        const next = code[i + 1];

        if (char === '/' && next === '/') {
            // Check if it is a metadata directive (kept for overload/UI helpers)
            // Supported forms:
            // - //[Item(Name, 0)]  (legacy)
            // - //Item[Name,0]     (requested)
            if (code[i + 2] === '[' || code.startsWith('Item[', i + 2)) {
                // Preserve this line!
                // We copy the first two slashes and continue
                out += '//';
                i += 2;
                // The rest of the line will be handled by the loop normally
            } else {
                // Line comment: skip until newline
                i += 2;
                while (i < len && code[i] !== '\n') i++;
                // Newline will be handled by the next iteration if present
            }
        } else if (char === '/' && next === '*') {
            // Block comment: skip until */
            i += 2;
            while (i < len && !(code[i] === '*' && code[i+1] === '/')) {
                if (code[i] === '\n') out += '\n'; // Preserve newlines
                i++;
            }
            i += 2; // Skip */
        } else {
            out += char;
            i++;
        }
    }
    return out;
};

/**
 * Simple Tokenizer for GLSL function signatures.
 * Handles parentheses, commas, and basic identifiers.
 */
const tokenize = (code: string): Token[] => {
    const tokens: Token[] = [];
    let i = 0;
    let line = 1;
    const len = code.length;

    const isSpace = (c: string) => /\s/.test(c);
    const isAlpha = (c: string) => /[a-zA-Z_]/.test(c);
    const isAlphaNum = (c: string) => /[a-zA-Z0-9_]/.test(c);

    while (i < len) {
        const char = code[i];

        if (char === '\n') {
            line++;
            i++;
            continue;
        }

        if (isSpace(char)) {
            i++;
            continue;
        }

        // Preprocessor (skip line)
        if (char === '#') {
            let val = '';
            while (i < len && code[i] !== '\n') {
                val += code[i];
                i++;
            }
            tokens.push({ type: 'preprocessor', value: val, line });
            continue;
        }

        // Metadata Directive (kept as a single token)
        // - //[...]
        // - //Item[...]
        if (char === '/' && code[i+1] === '/' && (code[i+2] === '[' || code.startsWith('Item[', i + 2))) {
            let val = '';
            while (i < len && code[i] !== '\n') {
                val += code[i];
                i++;
            }
            // Treat as preprocessor token for compatibility with extractAllSignatures logic
            tokens.push({ type: 'preprocessor', value: val, line });
            continue;
        }

        // Identifiers & Keywords
        if (isAlpha(char)) {
            let val = '';
            while (i < len && isAlphaNum(code[i])) {
                val += code[i];
                i++;
            }
            tokens.push({ type: 'identifier', value: val, line }); // We verify keyword later
            continue;
        }

        // Symbols
        if (/[(),;{}[\]]/.test(char)) {
            tokens.push({ type: 'symbol', value: char, line });
            i++;
            continue;
        }

        // Skip numbers/operators/unknowns for now as we just strictly look for signatures
        i++;
    }

    return tokens;
};

export interface PassDependency {
    uniformName: string;  // e.g. "u_pass_seed", "u_pass_step_256"
    passId: string;       // e.g. "seed", "step_256"
    type: 'specific' | 'prev' | 'first';  // Type of reference
}

export interface ParsedSignature {
    inputs: NodeInput[];
    outputs: NodeOutput[];
    isOverloaded: boolean;
    valid: boolean;
    label?: string;
    order?: number;
    originalIndex?: number;
    passDependencies?: PassDependency[];  // Pass dependencies detected from parameters
}

/**
 * Robustly extracts inputs and outputs from `void run(...)` functions.
 * Handles 'out', 'inout', and 'in' qualifiers correctly.
 */
export const extractShaderIO = (rawCode: string): ParsedSignature => {
    const signatures = extractAllSignatures(rawCode);
    
    // Detect pass dependencies from entire GLSL code (not just from function signatures)
    // Search for u_pass_*, u_prevPass, u_firstPass, u_previousFrame usage
    const passDependencies: PassDependency[] = [];
    const codeForDependencyScan = stripComments(rawCode);
    
    // Pattern 1: u_pass_<passId> - find all occurrences
    const passPattern = /\bu_pass_([a-zA-Z0-9_]+)\b/g;
    let match;
    const foundPasses = new Set<string>();
    while ((match = passPattern.exec(codeForDependencyScan)) !== null) {
        const passId = match[1];
        const uniformName = `u_pass_${passId}`;
        if (!foundPasses.has(uniformName)) {
            foundPasses.add(uniformName);
            passDependencies.push({
                uniformName: uniformName,
                passId: passId,
                type: 'specific'
            });
        }
    }
    
    // Pattern 2: u_firstPass
    if (/\bu_firstPass\b/.test(codeForDependencyScan)) {
        passDependencies.push({
            uniformName: 'u_firstPass',
            passId: '__first__',
            type: 'first'
        });
    }
    
    // Pattern 3: u_prevPass
    if (/\bu_prevPass\b/.test(codeForDependencyScan)) {
        passDependencies.push({
            uniformName: 'u_prevPass',
            passId: '__prev__',
            type: 'prev'
        });
    }
    
    if (signatures.length === 0) {
        return {
            inputs: [],
            outputs: [],
            isOverloaded: false,
            valid: false,
            passDependencies
        };
    }

    // Find the default signature (lowest order)
    // If no orders are specified, use the first one (index 0)
    // If orders are specified, sort by order, then by index
    const sorted = [...signatures].sort((a, b) => {
        // Spec: missing order defaults to 0; ties follow code order.
        const orderA = a.order ?? 0;
        const orderB = b.order ?? 0;
        if (orderA !== orderB) return orderA - orderB;
        return (a.originalIndex || 0) - (b.originalIndex || 0);
    });

    const bestSig = sorted[0];

    // Filter out pass dependency parameters and internal uniforms from inputs
    // These should not appear in the UI as external inputs
    const passDepNames = new Set(passDependencies.map(dep => dep.uniformName));
    
    // Also filter out internal uniforms used by the system
    const internalUniforms = new Set([
        'u_previousFrame',  // Ping-Pong buffer
    ]);
    
    const filteredInputs = bestSig.inputs.filter(input => {
        // Remove pass dependencies and internal uniforms from UI inputs
        return !passDepNames.has(input.id) && !internalUniforms.has(input.id);
    });

    return {
        inputs: filteredInputs,
        outputs: bestSig.outputs,
        isOverloaded: signatures.length > 1,
        valid: true,
        label: bestSig.label,
        order: bestSig.order,
        originalIndex: bestSig.originalIndex,
        passDependencies: passDependencies  // Use pass dependencies detected from entire code
    };
};

/**
 * Extracts ALL void run(...) signatures from the code.
 * Useful for overload resolution.
 */
export const extractAllSignatures = (rawCode: string): ParsedSignature[] => {
    if (!rawCode) return [];
    const cleanCode = stripComments(rawCode);
    const tokens = tokenize(cleanCode);
    const signatures: ParsedSignature[] = [];

    // Scan tokens for patterns: void -> run -> (
    for (let i = 0; i < tokens.length - 2; i++) {
        if (
            tokens[i].value === 'void' && 
            tokens[i+1].value === 'run' && 
            tokens[i+2].value === '('
        ) {
            // Look backwards for #[Item(...)] preprocessor directive
            let label: string | undefined;
            let order: number | undefined;
            
            // Scan backwards from 'void' (index i)
            // Skip whitespace/newlines is handled by tokenizer, but we need to check previous tokens
            let j = i - 1;
            while (j >= 0) {
                const t = tokens[j];
                if (t.type === 'preprocessor') {
                    // Check if it matches #[Item(...)] or //[Item(...)]
                    
                    // Match #[Item(Identifier, Order)] or //[Item(Identifier, Order)]
                    const legacy = t.value.match(new RegExp("^(?:#|//)\\[Item\\s*\\(\\s*([a-zA-Z0-9_]+)\\s*(?:,\\s*(\\d+))?\\s*\\)\\]"));
                    const requested = t.value.match(new RegExp("^(?:#|//)Item\\s*\\[\\s*([a-zA-Z0-9_]+)\\s*(?:,\\s*(\\d+))?\\s*\\]"));
                    const match = requested || legacy;
                    if (match) {
                        label = match[1];
                        order = match[2] ? parseInt(match[2], 10) : 0;
                    }
                    break; // Found the nearest preprocessor, stop looking
                }
                j--;
            }

            const inputs: NodeInput[] = [];
            const outputs: NodeOutput[] = [];
            
            let k = i + 3; // Start inside parenthesis
            let currentArg: string[] = [];
            
            // Iterate arguments until ')'
            while (k < tokens.length && tokens[k].value !== ')') {
                const t = tokens[k];
                
                if (t.value === ',') {
                    parseArgument(currentArg, inputs, outputs);
                    currentArg = [];
                } else {
                    currentArg.push(t.value);
                }
                k++;
            }
            // Parse last argument
            if (currentArg.length > 0) {
                parseArgument(currentArg, inputs, outputs);
            }

            signatures.push({
                inputs,
                outputs,
                isOverloaded: false, // Individual sig is not overloaded
                valid: true,
                label,
                order,
                originalIndex: signatures.length
            });
        }
    }

    return signatures;
};

const parseArgument = (parts: string[], inputs: NodeInput[], outputs: NodeOutput[]) => {
    if (parts.length < 2) return; // Need at least Type + Name

    let name = parts[parts.length - 1];
    let isArray = false;

    // Handle Array Syntax: type[] name  -> parts like: [type, [, ], name]
    // Tokenizer splits '[' and ']' into separate tokens, so we detect brackets before the identifier.
    // Example: `vec2[] offsets` => ['vec2', '[', ']', 'offsets']
    const openBracketIdx = parts.indexOf('[');
    const closeBracketIdx = parts.indexOf(']');
    if (
        openBracketIdx >= 0 &&
        closeBracketIdx > openBracketIdx &&
        openBracketIdx < parts.length - 1 &&
        closeBracketIdx < parts.length - 1
    ) {
        // If brackets appear before the final identifier, treat as array.
        // (Other array forms like `type name[16]` are handled below.)
        isArray = true;
    }

    // Handle Array Syntax: type name[size] -> parts: [type, name, [, size, ]]
    // Or if numbers skipped: [type, name, [, ]]
    if (name === ']') {
        // It's an array!
        // Find the name before the '['
        let j = parts.length - 2;
        while (j >= 0 && parts[j] !== '[') j--; // Skip size/content
        if (j > 0) {
            name = parts[j - 1]; // Name is before '['
            isArray = true;
        }
    }

    // UV is system reserved, ignore
    if (name === 'uv') return;

    let typeStr = '';
    let isOut = false;

    // Scan modifiers
    // Pattern: [const] [in|out|inout] [precision] [type] [name]
    // We work backwards. Name is last. Type is second to last usually.
    
    // Simple heuristics: check if 'out' or 'inout' is present in the parts
    if (parts.includes('out') || parts.includes('inout')) {
        isOut = true;
    }

    // Find the type. It's usually the element before the name, skipping precision if rare cases.
    // But simpler: Find the token that matches a GLSLType
    const foundType = parts.find(p => VALID_TYPES.has(p));
    
    if (foundType) {
        typeStr = foundType;
    } else {
        // Fallback: try second to last
        // If array, we might need to look further back, but foundType usually works
        typeStr = parts[parts.length - 2];
    }

    if (isArray && typeStr && !typeStr.endsWith('[]')) {
        typeStr += '[]';
    }

    if (!VALID_TYPES.has(typeStr)) return; // Invalid type, ignore

    const def = { 
        id: name, 
        name: name, 
        type: typeStr as GLSLType 
    };

    if (isOut) {
        outputs.push(def);
    } else {
        inputs.push(def);
    }
};
