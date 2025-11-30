
import { GLSLType, NodeInput, NodeOutput } from '../types';

// GLSL Types we care about for ports
const VALID_TYPES = new Set(['float', 'int', 'vec2', 'vec3', 'vec4', 'sampler2D']);

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
    let out = '';
    let i = 0;
    const len = code.length;
    
    while (i < len) {
        const char = code[i];
        const next = code[i + 1];

        if (char === '/' && next === '/') {
            // Line comment: skip until newline
            i += 2;
            while (i < len && code[i] !== '\n') i++;
            // Newline will be handled by the next iteration if present
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
        if (/[(),;{}]/.test(char)) {
            tokens.push({ type: 'symbol', value: char, line });
            i++;
            continue;
        }

        // Skip numbers/operators/unknowns for now as we just strictly look for signatures
        i++;
    }

    return tokens;
};

export interface ParsedSignature {
    inputs: NodeInput[];
    outputs: NodeOutput[];
    isOverloaded: boolean;
    valid: boolean;
}

/**
 * Robustly extracts inputs and outputs from `void run(...)` functions.
 * Handles 'out', 'inout', and 'in' qualifiers correctly.
 */
export const extractShaderIO = (rawCode: string): ParsedSignature => {
    const signatures = extractAllSignatures(rawCode);
    
    if (signatures.length === 0) {
        return {
            inputs: [],
            outputs: [],
            isOverloaded: false,
            valid: false
        };
    }

    // Return the first signature, but mark as overloaded if multiple exist
    return {
        inputs: signatures[0].inputs,
        outputs: signatures[0].outputs,
        isOverloaded: signatures.length > 1,
        valid: true
    };
};

/**
 * Extracts ALL void run(...) signatures from the code.
 * Useful for overload resolution.
 */
export const extractAllSignatures = (rawCode: string): ParsedSignature[] => {
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
                valid: true
            });
        }
    }

    return signatures;
};

const parseArgument = (parts: string[], inputs: NodeInput[], outputs: NodeOutput[]) => {
    if (parts.length < 2) return; // Need at least Type + Name

    const name = parts[parts.length - 1];
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
        typeStr = parts[parts.length - 2];
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
