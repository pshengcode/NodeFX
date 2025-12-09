
import React, { useRef, useState, useEffect, useCallback, memo } from 'react';
import { Handle, Position, NodeProps, useReactFlow, useStore } from 'reactflow';
import { NodeData, CompilationResult } from '../types';
import { Play, Pause, Settings, RotateCcw, Download, Wind, MousePointer2, History, Square, Magnet, Trash2, X, Maximize2, Minimize2, RotateCw, Eye, EyeOff, ArrowRight } from 'lucide-react';
import { registerDynamicTexture, unregisterDynamicTexture } from '../utils/dynamicRegistry';
import { useTranslation } from 'react-i18next';
import { compileGraph } from '../utils/shaderCompiler';
import ShaderPreview from './ShaderPreview';
import { useOptimizedNodes } from '../hooks/useOptimizedNodes';

const edgesSelector = (state: any) => state.edges;

// Deep compare for selector
const deepEqual = (a: any, b: any) => JSON.stringify(a) === JSON.stringify(b);

interface ForceField {
    id: string;
    x: number;
    y: number;
    force: number; // Positive = Repel, Negative = Attract
    spin: number;  // Positive = CW, Negative = CCW
    windForce: number;
    windAngle: number;
    pulse: number; // Frequency
    turbulence: number; // Strength
    radius: number;
}

// --- SHADERS ---

const BASE_VERT = `#version 300 es
in vec2 position;
out vec2 vUv;
void main() {
    vUv = position * 0.5 + 0.5;
    gl_Position = vec4(position, 0.0, 1.0);
}`;

const TURBULENCE_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uTarget;
uniform sampler2D uObstacles;
uniform float aspectRatio;
uniform float strength;
uniform float time;
uniform vec2 point;
uniform float radius;
out vec4 fragColor;

float hash(vec2 p) {
    return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}

float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

void main() {
    float obs = texture(uObstacles, vUv).x;
    if (obs > 0.5) {
        fragColor = vec4(0.0);
        return;
    }
    vec2 p = vUv - point;
    p.x *= aspectRatio;
    float len = length(p);
    
    float falloff = max(0.0, 1.0 - len / radius);
    
    float n1 = noise(vUv * 20.0 + vec2(time * 0.5, 0.0));
    float n2 = noise(vUv * 20.0 + vec2(0.0, time * 0.5) + 100.0);
    
    vec2 turb = (vec2(n1, n2) - 0.5) * 2.0;
    
    vec3 base = texture(uTarget, vUv).xyz;
    fragColor = vec4(base.xy + turb * strength * falloff, base.z, 1.0);
}`;

const WIND_SPLAT_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uTarget;
uniform sampler2D uObstacles;
uniform float aspectRatio;
uniform float strength;
uniform vec2 point;
uniform float radius;
uniform vec2 dir;
out vec4 fragColor;
void main() {
    float obs = texture(uObstacles, vUv).x;
    if (obs > 0.5) {
        fragColor = vec4(0.0);
        return;
    }
    vec2 p = vUv - point;
    p.x *= aspectRatio;
    float len = length(p);
    
    float falloff = max(0.0, 1.0 - len / radius);
    vec2 velocity = dir * strength * falloff;
    
    vec3 base = texture(uTarget, vUv).xyz;
    fragColor = vec4(base.xy + velocity, base.z, 1.0);
}`;

const EMISSION_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uTarget;
uniform sampler2D uEmission;
uniform sampler2D uObstacles;
uniform float strength;
out vec4 fragColor;
void main() {
    float obs = texture(uObstacles, vUv).x;
    if (obs > 0.5) {
        fragColor = vec4(0.0);
        return;
    }
    vec4 base = texture(uTarget, vUv);
    vec4 emit = texture(uEmission, vUv);
    fragColor = base + emit * strength;
}`;

const EMISSION_VEL_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uTarget;
uniform sampler2D uEmission;
uniform sampler2D uObstacles;
uniform vec2 velocity;
uniform float strength;
out vec4 fragColor;
void main() {
    float obs = texture(uObstacles, vUv).x;
    if (obs > 0.5) {
        fragColor = vec4(0.0);
        return;
    }
    vec2 base = texture(uTarget, vUv).xy;
    float emit = texture(uEmission, vUv).r; 
    fragColor = vec4(base + velocity * emit * strength, 0.0, 1.0);
}`;

const OBSTACLE_TEX_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uTexture;
out vec4 fragColor;
void main() {
    float val = texture(uTexture, vUv).r;
    if (val > 0.1) {
        fragColor = vec4(1.0, 0.0, 0.0, 1.0);
    } else {
        discard;
    }
}`;

const OBSTACLE_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
uniform float aspectRatio;
uniform vec2 point;
uniform float radius;
uniform float isEraser; 
out vec4 fragColor;
void main() {
    vec2 p = vUv - point;
    p.x *= aspectRatio;
    if (length(p) < radius) {
        fragColor = vec4(1.0 - isEraser, 0.0, 0.0, 1.0);
    } else {
        discard;
    }
}`;

const RADIAL_SPLAT_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uTarget;
uniform sampler2D uObstacles;
uniform float aspectRatio;
uniform float strength;
uniform vec2 point;
uniform float radius;
out vec4 fragColor;
void main() {
    float obs = texture(uObstacles, vUv).x;
    if (obs > 0.5) {
        fragColor = vec4(0.0);
        return;
    }
    vec2 p = vUv - point;
    p.x *= aspectRatio;
    float len = length(p);
    vec2 dir = (len > 1e-5) ? p / len : vec2(0.0);
    
    // Linear Falloff: 1.0 at center, 0.0 at radius
    float falloff = max(0.0, 1.0 - len / radius);
    float splat = falloff * strength;
    
    vec3 base = texture(uTarget, vUv).xyz;
    fragColor = vec4(base.xy + dir * splat, base.z, 1.0);
}`;

const MULTI_RADIAL_SPLAT_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uTarget;
uniform sampler2D uObstacles;
uniform float aspectRatio;
uniform float strength;
uniform vec2 points[64];
uniform int count;
uniform float radius;
out vec4 fragColor;
void main() {
    float obs = texture(uObstacles, vUv).x;
    if (obs > 0.5) {
        fragColor = vec4(0.0);
        return;
    }
    vec2 velAccum = vec2(0.0);
    for(int i=0; i<count; i++) {
        vec2 p = vUv - points[i];
        p.x *= aspectRatio;
        float len = length(p);
        vec2 dir = (len > 1e-5) ? p / len : vec2(0.0);
        
        float falloff = max(0.0, 1.0 - len / radius);
        velAccum += dir * falloff * strength;
    }
    vec3 base = texture(uTarget, vUv).xyz;
    fragColor = vec4(base.xy + velAccum, base.z, 1.0);
}`;

const VORTEX_SPLAT_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uTarget;
uniform sampler2D uObstacles;
uniform float aspectRatio;
uniform float strength;
uniform vec2 point;
uniform float radius;
out vec4 fragColor;
void main() {
    float obs = texture(uObstacles, vUv).x;
    if (obs > 0.5) {
        fragColor = vec4(0.0);
        return;
    }
    vec2 p = vUv - point;
    p.x *= aspectRatio;
    float len = length(p);
    vec2 dir = (len > 1e-5) ? p / len : vec2(0.0);
    vec2 rotDir = vec2(-dir.y, dir.x);
    
    float falloff = max(0.0, 1.0 - len / radius);
    float splat = falloff * strength;
    
    vec3 base = texture(uTarget, vUv).xyz;
    fragColor = vec4(base.xy + rotDir * splat, base.z, 1.0);
}`;

const MULTI_VORTEX_SPLAT_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uTarget;
uniform sampler2D uObstacles;
uniform float aspectRatio;
uniform float strength;
uniform vec2 points[64];
uniform int count;
uniform float radius;
out vec4 fragColor;
void main() {
    float obs = texture(uObstacles, vUv).x;
    if (obs > 0.5) {
        fragColor = vec4(0.0);
        return;
    }
    vec2 velAccum = vec2(0.0);
    for(int i=0; i<count; i++) {
        vec2 p = vUv - points[i];
        p.x *= aspectRatio;
        float len = length(p);
        vec2 dir = (len > 1e-5) ? p / len : vec2(0.0);
        vec2 rotDir = vec2(-dir.y, dir.x);
        
        float falloff = max(0.0, 1.0 - len / radius);
        velAccum += rotDir * falloff * strength;
    }
    vec3 base = texture(uTarget, vUv).xyz;
    fragColor = vec4(base.xy + velAccum, base.z, 1.0);
}`;

const SPLAT_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uTarget;
uniform sampler2D uObstacles;
uniform float aspectRatio;
uniform vec3 color;
uniform vec2 point;
uniform float radius;
out vec4 fragColor;
void main() {
    float obs = texture(uObstacles, vUv).x;
    if (obs > 0.5) {
        fragColor = vec4(0.0);
        return;
    }
    vec2 p = vUv - point.xy;
    p.x *= aspectRatio;
    vec3 splat = exp(-dot(p, p) / radius) * color;
    vec3 base = texture(uTarget, vUv).xyz;
    fragColor = vec4(base + splat, 1.0);
}`;

const MULTI_SPLAT_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uTarget;
uniform sampler2D uObstacles;
uniform float aspectRatio;
uniform vec3 color;
uniform vec2 points[64];
uniform int count;
uniform float radius;
out vec4 fragColor;
void main() {
    float obs = texture(uObstacles, vUv).x;
    if (obs > 0.5) {
        fragColor = vec4(0.0);
        return;
    }
    vec3 splatAccum = vec3(0.0);
    for(int i=0; i<count; i++) {
        vec2 p = vUv - points[i];
        p.x *= aspectRatio;
        splatAccum += exp(-dot(p, p) / radius) * color;
    }
    vec3 base = texture(uTarget, vUv).xyz;
    fragColor = vec4(base + splatAccum, 1.0);
}`;

const SINK_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uTarget;
uniform float aspectRatio;
uniform vec2 point;
uniform float radius;
uniform float strength;
out vec4 fragColor;
void main() {
    vec2 p = vUv - point;
    p.x *= aspectRatio;
    float len = length(p);
    float falloff = max(0.0, 1.0 - len / radius);
    float factor = clamp(1.0 - strength * falloff, 0.0, 1.0);
    vec4 base = texture(uTarget, vUv);
    fragColor = base * factor;
}`;

const ADVECTION_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uVelocity;
uniform sampler2D uSource;
uniform sampler2D uObstacles;
uniform vec2 texelSize;
uniform float dt;
uniform float dissipation;
out vec4 fragColor;
void main() {
    float obs = texture(uObstacles, vUv).x;
    if (obs > 0.5) {
        fragColor = vec4(0.0);
        return;
    }
    vec2 coord = vUv - dt * texture(uVelocity, vUv).xy * texelSize;
    vec4 result = texture(uSource, coord);
    float decay = 1.0 + dissipation * dt;
    fragColor = result / decay;
}`;

const DIVERGENCE_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uVelocity;
uniform sampler2D uObstacles;
uniform vec2 texelSize;
out vec4 fragColor;
void main() {
    float L = texture(uVelocity, vUv - vec2(texelSize.x, 0.0)).x;
    float R = texture(uVelocity, vUv + vec2(texelSize.x, 0.0)).x;
    float T = texture(uVelocity, vUv + vec2(0.0, texelSize.y)).y;
    float B = texture(uVelocity, vUv - vec2(0.0, texelSize.y)).y;
    
    // Simple boundary: if neighbor is obstacle, velocity is 0 (handled by advection/masking)
    
    float div = 0.5 * (R - L + T - B);
    fragColor = vec4(div, 0.0, 0.0, 1.0);
}`;

const PRESSURE_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uPressure;
uniform sampler2D uDivergence;
uniform sampler2D uObstacles;
uniform vec2 texelSize;
out vec4 fragColor;
void main() {
    float pC = texture(uPressure, vUv).x;
    
    float oL = texture(uObstacles, vUv - vec2(texelSize.x, 0.0)).x;
    float oR = texture(uObstacles, vUv + vec2(texelSize.x, 0.0)).x;
    float oT = texture(uObstacles, vUv + vec2(0.0, texelSize.y)).x;
    float oB = texture(uObstacles, vUv - vec2(0.0, texelSize.y)).x;

    float pL = (oL > 0.5) ? pC : texture(uPressure, vUv - vec2(texelSize.x, 0.0)).x;
    float pR = (oR > 0.5) ? pC : texture(uPressure, vUv + vec2(texelSize.x, 0.0)).x;
    float pT = (oT > 0.5) ? pC : texture(uPressure, vUv + vec2(0.0, texelSize.y)).x;
    float pB = (oB > 0.5) ? pC : texture(uPressure, vUv - vec2(0.0, texelSize.y)).x;

    float div = texture(uDivergence, vUv).x;
    float pressure = (pL + pR + pT + pB - div) * 0.25;
    
    if (texture(uObstacles, vUv).x > 0.5) {
        pressure = 0.0;
    }

    fragColor = vec4(pressure, 0.0, 0.0, 1.0);
}`;

const GRADIENT_SUBTRACT_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uPressure;
uniform sampler2D uVelocity;
uniform sampler2D uObstacles;
uniform vec2 texelSize;
out vec4 fragColor;
void main() {
    float obs = texture(uObstacles, vUv).x;
    if (obs > 0.5) {
        fragColor = vec4(0.0);
        return;
    }

    float pC = texture(uPressure, vUv).x;
    float oL = texture(uObstacles, vUv - vec2(texelSize.x, 0.0)).x;
    float oR = texture(uObstacles, vUv + vec2(texelSize.x, 0.0)).x;
    float oT = texture(uObstacles, vUv + vec2(0.0, texelSize.y)).x;
    float oB = texture(uObstacles, vUv - vec2(0.0, texelSize.y)).x;

    float pL = (oL > 0.5) ? pC : texture(uPressure, vUv - vec2(texelSize.x, 0.0)).x;
    float pR = (oR > 0.5) ? pC : texture(uPressure, vUv + vec2(texelSize.x, 0.0)).x;
    float pT = (oT > 0.5) ? pC : texture(uPressure, vUv + vec2(0.0, texelSize.y)).x;
    float pB = (oB > 0.5) ? pC : texture(uPressure, vUv - vec2(0.0, texelSize.y)).x;

    vec2 velocity = texture(uVelocity, vUv).xy;
    velocity.xy -= vec2(pR - pL, pT - pB); // * 0.5? No, standard is just diff for unit stride
    fragColor = vec4(velocity, 0.0, 1.0);
}`;

const DISPLAY_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uTexture;
uniform sampler2D uVelocity;
uniform sampler2D uObstacles;
uniform float uMode; // 0.0 = Density, 1.0 = Velocity
uniform float uShowObstacles;
out vec4 fragColor;
void main() {
    float obs = texture(uObstacles, vUv).x;
    if (uShowObstacles > 0.5 && obs > 0.5) {
        fragColor = vec4(1.0, 1.0, 0.0, 1.0); // Yellow
        return;
    }

    if (uMode > 0.5) {
        vec2 vel = texture(uVelocity, vUv).xy;
        // Map -1..1 to 0..1 for visualization
        fragColor = vec4(vel * 0.5 + 0.5, 0.5, 1.0);
    } else {
        vec3 c = texture(uTexture, vUv).rgb;
        // Add a bit of blue tint for water-like look if desired, or keep B&W smoke
        fragColor = vec4(c, 1.0);
    }
}`;

const GRAVITY_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uVelocity;
uniform float dt;
uniform float gravity;
out vec4 fragColor;
void main() {
    vec2 vel = texture(uVelocity, vUv).xy;
    vel.y -= gravity * dt;
    fragColor = vec4(vel, 0.0, 0.0);
}`;

// --- GPU SOLVER CLASS ---

class GPUFluidSolver {
    gl: WebGL2RenderingContext;
    width: number;
    height: number;
    uniformCache: Map<WebGLProgram, Map<string, WebGLUniformLocation | null>>;
    attribCache: Map<WebGLProgram, number>;
    
    // FBOs (Ping-Pong)
    velocity: { read: WebGLTexture, write: WebGLTexture, fboRead: WebGLFramebuffer, fboWrite: WebGLFramebuffer, swap: () => void };
    density: { read: WebGLTexture, write: WebGLTexture, fboRead: WebGLFramebuffer, fboWrite: WebGLFramebuffer, swap: () => void };
    divergence: { tex: WebGLTexture, fbo: WebGLFramebuffer };
    pressure: { read: WebGLTexture, write: WebGLTexture, fboRead: WebGLFramebuffer, fboWrite: WebGLFramebuffer, swap: () => void };
    obstacles: { read: WebGLTexture, write: WebGLTexture, fboRead: WebGLFramebuffer, fboWrite: WebGLFramebuffer, swap: () => void };
    drawnObstacles: { tex: WebGLTexture, fbo: WebGLFramebuffer };
    
    // Programs
    programs: Record<string, WebGLProgram>;
    quadBuffer: WebGLBuffer;

    constructor(gl: WebGL2RenderingContext, width: number, height: number) {
        this.gl = gl;
        this.width = width;
        this.height = height;
        this.uniformCache = new Map();
        this.attribCache = new Map();

        if (!gl.getExtension('EXT_color_buffer_float')) console.warn("Float texture not supported");
        gl.getExtension('OES_texture_float_linear');

        // Init Resources
        this.velocity = this.createDoubleFBO(width, height);
        this.density = this.createDoubleFBO(width, height);
        this.divergence = this.createFBO(width, height);
        this.pressure = this.createDoubleFBO(width, height);
        this.obstacles = this.createDoubleFBO(width, height);
        this.drawnObstacles = this.createFBO(width, height);
        
        // Clear drawn obstacles initially
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.drawnObstacles.fbo);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        
        this.quadBuffer = gl.createBuffer()!;
        gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, -1,1, 1,-1, 1,1]), gl.STATIC_DRAW);

        this.programs = {
            splat: this.createProgram(BASE_VERT, SPLAT_FRAG),
            multiSplat: this.createProgram(BASE_VERT, MULTI_SPLAT_FRAG),
            radialSplat: this.createProgram(BASE_VERT, RADIAL_SPLAT_FRAG),
            multiRadialSplat: this.createProgram(BASE_VERT, MULTI_RADIAL_SPLAT_FRAG),
            vortexSplat: this.createProgram(BASE_VERT, VORTEX_SPLAT_FRAG),
            multiVortexSplat: this.createProgram(BASE_VERT, MULTI_VORTEX_SPLAT_FRAG),
            sink: this.createProgram(BASE_VERT, SINK_FRAG),
            advection: this.createProgram(BASE_VERT, ADVECTION_FRAG),
            divergence: this.createProgram(BASE_VERT, DIVERGENCE_FRAG),
            pressure: this.createProgram(BASE_VERT, PRESSURE_FRAG),
            gradientSubtract: this.createProgram(BASE_VERT, GRADIENT_SUBTRACT_FRAG),
            display: this.createProgram(BASE_VERT, DISPLAY_FRAG),
            obstacle: this.createProgram(BASE_VERT, OBSTACLE_FRAG),
            obstacleTex: this.createProgram(BASE_VERT, OBSTACLE_TEX_FRAG),
            emission: this.createProgram(BASE_VERT, EMISSION_FRAG),
            emissionVel: this.createProgram(BASE_VERT, EMISSION_VEL_FRAG),
            gravity: this.createProgram(BASE_VERT, GRAVITY_FRAG),
            wind: this.createProgram(BASE_VERT, WIND_SPLAT_FRAG),
            turbulence: this.createProgram(BASE_VERT, TURBULENCE_FRAG),
        };
    }

    createProgram(vsSource: string, fsSource: string) {
        const gl = this.gl;
        const vs = gl.createShader(gl.VERTEX_SHADER)!;
        gl.shaderSource(vs, vsSource);
        gl.compileShader(vs);
        if (!gl.getShaderParameter(vs, gl.COMPILE_STATUS)) console.error(gl.getShaderInfoLog(vs));

        const fs = gl.createShader(gl.FRAGMENT_SHADER)!;
        gl.shaderSource(fs, fsSource);
        gl.compileShader(fs);
        if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) console.error(gl.getShaderInfoLog(fs));

        const p = gl.createProgram()!;
        gl.attachShader(p, vs);
        gl.attachShader(p, fs);
        gl.linkProgram(p);
        return p;
    }

    createFBO(w: number, h: number) {
        const gl = this.gl;
        const tex = gl.createTexture()!;
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

        const fbo = gl.createFramebuffer()!;
        gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
        return { tex, fbo };
    }

    createDoubleFBO(w: number, h: number) {
        const fbo1 = this.createFBO(w, h);
        const fbo2 = this.createFBO(w, h);
        return {
            read: fbo1.tex,
            write: fbo2.tex,
            fboRead: fbo1.fbo,
            fboWrite: fbo2.fbo,
            swap: function() {
                const tempTex = this.read;
                this.read = this.write;
                this.write = tempTex;
                
                const tempFbo = this.fboRead;
                this.fboRead = this.fboWrite;
                this.fboWrite = tempFbo;
            }
        };
    }

    runProgram(prog: WebGLProgram, uniforms: any) {
        const gl = this.gl;
        gl.useProgram(prog);
        gl.disable(gl.BLEND);
        gl.disable(gl.DEPTH_TEST);
        gl.disable(gl.SCISSOR_TEST);
        
        let posLoc = this.attribCache.get(prog);
        if (posLoc === undefined) {
            posLoc = gl.getAttribLocation(prog, "position");
            this.attribCache.set(prog, posLoc);
        }

        gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
        gl.enableVertexAttribArray(posLoc);
        gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

        let texUnit = 0;
        
        // Get or create cache for this program
        let progCache = this.uniformCache.get(prog);
        if (!progCache) {
            progCache = new Map();
            this.uniformCache.set(prog, progCache);
        }

        for (const name in uniforms) {
            const val = uniforms[name];
            let loc = progCache.get(name);
            if (loc === undefined) {
                loc = gl.getUniformLocation(prog, name);
                progCache.set(name, loc);
            }
            
            if (val === null || val === undefined || loc === null) continue;

            if (val instanceof WebGLTexture) {
                gl.activeTexture(gl.TEXTURE0 + texUnit);
                gl.bindTexture(gl.TEXTURE_2D, val);
                gl.uniform1i(loc, texUnit);
                texUnit++;
            } else if (typeof val === 'object' && val !== null && 'type' in val && 'value' in val) {
                switch((val as any).type) {
                    case '1i': gl.uniform1i(loc, (val as any).value); break;
                    case '1f': gl.uniform1f(loc, (val as any).value); break;
                    case '2fv': gl.uniform2fv(loc, (val as any).value); break;
                    case '3fv': gl.uniform3fv(loc, (val as any).value); break;
                    default: console.warn("Unknown uniform type", (val as any).type);
                }
            } else if (typeof val === 'number') {
                gl.uniform1f(loc, val);
            } else if (Array.isArray(val)) {
                if (val.length === 2) gl.uniform2fv(loc, val);
                else if (val.length === 3) gl.uniform3fv(loc, val);
                else gl.uniform1fv(loc, val);
            }
        }
        gl.drawArrays(gl.TRIANGLES, 0, 6);
    }

    step(dt: number, visc: number, diff: number, fade: number, iterations: number, gravity: number) {
        const gl = this.gl;
        const w = this.width;
        const h = this.height;
        const texelSize = [1/w, 1/h];

        gl.viewport(0, 0, w, h);

        // 0. Apply Gravity
        if (Math.abs(gravity) > 0.0001) {
            gl.bindFramebuffer(gl.FRAMEBUFFER, this.velocity.fboWrite);
            this.runProgram(this.programs.gravity, {
                uVelocity: this.velocity.read,
                dt: dt,
                gravity: gravity
            });
            this.velocity.swap();
        }

        // 1. Advection (Velocity)
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.velocity.fboWrite);
        this.runProgram(this.programs.advection, {
            uVelocity: this.velocity.read,
            uSource: this.velocity.read,
            uObstacles: this.obstacles.read,
            dt: dt,
            dissipation: visc, // Using visc as dissipation for velocity
            texelSize
        });
        this.velocity.swap();

        // 2. Advection (Density)
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.density.fboWrite);
        this.runProgram(this.programs.advection, {
            uVelocity: this.velocity.read,
            uSource: this.density.read,
            uObstacles: this.obstacles.read,
            dt: dt,
            dissipation: fade,
            texelSize
        });
        this.density.swap();

        // 3. Divergence
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.divergence.fbo);
        this.runProgram(this.programs.divergence, {
            uVelocity: this.velocity.read,
            uObstacles: this.obstacles.read,
            texelSize
        });

        // 4. Pressure (Jacobi)
        // Clear pressure first? Usually warm start is better (use previous frame pressure)
        for (let i = 0; i < iterations; i++) {
            gl.bindFramebuffer(gl.FRAMEBUFFER, this.pressure.fboWrite);
            this.runProgram(this.programs.pressure, {
                uPressure: this.pressure.read,
                uDivergence: this.divergence.tex,
                uObstacles: this.obstacles.read,
                texelSize
            });
            this.pressure.swap();
        }

        // 5. Gradient Subtract
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.velocity.fboWrite);
        this.runProgram(this.programs.gradientSubtract, {
            uPressure: this.pressure.read,
            uVelocity: this.velocity.read,
            uObstacles: this.obstacles.read,
            texelSize
        });
        this.velocity.swap();
    }

    drawObstacle(x: number, y: number, radius: number, isEraser: boolean) {
        const gl = this.gl;
        gl.viewport(0, 0, this.width, this.height);
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.drawnObstacles.fbo); 
        this.runProgram(this.programs.obstacle, {
            aspectRatio: this.width / this.height,
            point: [x / this.width, 1.0 - y / this.height],
            radius: radius,
            isEraser: isEraser ? 1.0 : 0.0
        });
    }

    updateObstacles(tex: TexImageSource | null) {
        const gl = this.gl;
        gl.viewport(0, 0, this.width, this.height);
        gl.disable(gl.SCISSOR_TEST);
        gl.colorMask(true, true, true, true);
        
        // 1. Bind Main Obstacles FBO and Clear
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.obstacles.fboRead);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);

        // 2. Draw Drawn Obstacles (Walls)
        this.runProgram(this.programs.obstacleTex, {
            uTexture: this.drawnObstacles.tex
        });

        // 3. Draw External Texture (if exists)
        if (tex) {
            const inputTex = gl.createTexture();
            gl.bindTexture(gl.TEXTURE_2D, inputTex);
            gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, tex);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

            this.runProgram(this.programs.obstacleTex, {
                uTexture: inputTex
            });

            gl.deleteTexture(inputTex);
        }
    }

    addEmission(tex: TexImageSource, strength: number, velocity?: [number, number]) {
        const gl = this.gl;
        gl.viewport(0, 0, this.width, this.height);
        
        // Create a temporary texture for the input
        const inputTex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, inputTex);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, tex);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

        // Add to Density
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.density.fboWrite);
        this.runProgram(this.programs.emission, {
            uTarget: this.density.read,
            uEmission: inputTex,
            uObstacles: this.obstacles.read,
            strength: strength
        });
        this.density.swap();

        // Add to Velocity (if provided)
        if (velocity) {
            gl.bindFramebuffer(gl.FRAMEBUFFER, this.velocity.fboWrite);
            this.runProgram(this.programs.emissionVel, {
                uTarget: this.velocity.read,
                uEmission: inputTex,
                uObstacles: this.obstacles.read,
                velocity: velocity,
                strength: 1.0
            });
            this.velocity.swap();
        }

        gl.deleteTexture(inputTex);
    }

    splat(x: number, y: number, dx: number, dy: number, color: number[], radius: number) {
        const gl = this.gl;
        gl.viewport(0, 0, this.width, this.height);
        
        // Splat Velocity
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.velocity.fboWrite);
        this.runProgram(this.programs.splat, {
            uTarget: this.velocity.read,
            uObstacles: this.obstacles.read,
            aspectRatio: this.width / this.height,
            point: [x / this.width, 1.0 - y / this.height],
            color: [dx, -dy, 0.0], // Flip Y for velocity
            radius: radius // Adjust radius
        });
        this.velocity.swap();

        // Splat Density
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.density.fboWrite);
        this.runProgram(this.programs.splat, {
            uTarget: this.density.read,
            uObstacles: this.obstacles.read,
            aspectRatio: this.width / this.height,
            point: [x / this.width, 1.0 - y / this.height],
            color: color,
            radius: radius
        });
        this.density.swap();
    }

    batchSplat(points: {x: number, y: number}[], dx: number, dy: number, color: number[], radius: number) {
        const gl = this.gl;
        gl.viewport(0, 0, this.width, this.height);
        const batchSize = 64;
        
        for (let i = 0; i < points.length; i += batchSize) {
            const chunk = points.slice(i, i + batchSize);
            const flatPoints = [];
            for(let p of chunk) {
                flatPoints.push(p.x / this.width, 1.0 - p.y / this.height);
            }
            
            // Splat Velocity
            gl.bindFramebuffer(gl.FRAMEBUFFER, this.velocity.fboWrite);
            this.runProgram(this.programs.multiSplat, {
                uTarget: this.velocity.read,
                uObstacles: this.obstacles.read,
                aspectRatio: this.width / this.height,
                points: { type: '2fv', value: flatPoints },
                count: { type: '1i', value: chunk.length },
                color: [dx, -dy, 0.0],
                radius: radius
            });
            this.velocity.swap();

            // Splat Density
            gl.bindFramebuffer(gl.FRAMEBUFFER, this.density.fboWrite);
            this.runProgram(this.programs.multiSplat, {
                uTarget: this.density.read,
                uObstacles: this.obstacles.read,
                aspectRatio: this.width / this.height,
                points: { type: '2fv', value: flatPoints },
                count: { type: '1i', value: chunk.length },
                color: color,
                radius: radius
            });
            this.density.swap();
        }
    }

    splatRadial(x: number, y: number, strength: number, radius: number) {
        const gl = this.gl;
        gl.viewport(0, 0, this.width, this.height);
        // Splat Velocity (Radial)
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.velocity.fboWrite);
        this.runProgram(this.programs.radialSplat, {
            uTarget: this.velocity.read,
            uObstacles: this.obstacles.read,
            aspectRatio: this.width / this.height,
            point: [x / this.width, 1.0 - y / this.height],
            strength: strength,
            radius: radius
        });
        this.velocity.swap();
    }

    batchSplatRadial(points: {x: number, y: number}[], strength: number, radius: number) {
        const gl = this.gl;
        gl.viewport(0, 0, this.width, this.height);
        const batchSize = 64;
        
        for (let i = 0; i < points.length; i += batchSize) {
            const chunk = points.slice(i, i + batchSize);
            const flatPoints = [];
            for(let p of chunk) {
                flatPoints.push(p.x / this.width, 1.0 - p.y / this.height);
            }
            
            // Splat Velocity (Radial)
            gl.bindFramebuffer(gl.FRAMEBUFFER, this.velocity.fboWrite);
            this.runProgram(this.programs.multiRadialSplat, {
                uTarget: this.velocity.read,
                uObstacles: this.obstacles.read,
                aspectRatio: this.width / this.height,
                points: { type: '2fv', value: flatPoints },
                count: { type: '1i', value: chunk.length },
                strength: strength,
                radius: radius
            });
            this.velocity.swap();
        }
    }

    splatVortex(x: number, y: number, strength: number, radius: number) {
        const gl = this.gl;
        gl.viewport(0, 0, this.width, this.height);
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.velocity.fboWrite);
        this.runProgram(this.programs.vortexSplat, {
            uTarget: this.velocity.read,
            uObstacles: this.obstacles.read,
            aspectRatio: this.width / this.height,
            point: [x / this.width, 1.0 - y / this.height],
            strength: strength,
            radius: radius
        });
        this.velocity.swap();
    }

    splatWind(x: number, y: number, strength: number, angle: number, radius: number) {
        const gl = this.gl;
        gl.viewport(0, 0, this.width, this.height);
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.velocity.fboWrite);
        
        const rad = angle * Math.PI / 180.0;
        const dir = [Math.cos(rad), Math.sin(rad)];

        this.runProgram(this.programs.wind, {
            uTarget: this.velocity.read,
            uObstacles: this.obstacles.read,
            aspectRatio: this.width / this.height,
            point: [x / this.width, 1.0 - y / this.height],
            strength: strength,
            radius: radius,
            dir: dir
        });
        this.velocity.swap();
    }

    splatTurbulence(x: number, y: number, strength: number, radius: number, time: number) {
        const gl = this.gl;
        gl.viewport(0, 0, this.width, this.height);
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.velocity.fboWrite);
        this.runProgram(this.programs.turbulence, {
            uTarget: this.velocity.read,
            uObstacles: this.obstacles.read,
            aspectRatio: this.width / this.height,
            point: [x / this.width, 1.0 - y / this.height],
            strength: strength,
            radius: radius,
            time: time
        });
        this.velocity.swap();
    }

    batchSplatVortex(points: {x: number, y: number}[], strength: number, radius: number) {
        const gl = this.gl;
        gl.viewport(0, 0, this.width, this.height);
        const batchSize = 64;
        
        for (let i = 0; i < points.length; i += batchSize) {
            const chunk = points.slice(i, i + batchSize);
            const flatPoints = [];
            for(let p of chunk) {
                flatPoints.push(p.x / this.width, 1.0 - p.y / this.height);
            }
            
            gl.bindFramebuffer(gl.FRAMEBUFFER, this.velocity.fboWrite);
            this.runProgram(this.programs.multiVortexSplat, {
                uTarget: this.velocity.read,
                uObstacles: this.obstacles.read,
                aspectRatio: this.width / this.height,
                points: { type: '2fv', value: flatPoints },
                count: { type: '1i', value: chunk.length },
                strength: strength,
                radius: radius
            });
            this.velocity.swap();
        }
    }

    sink(x: number, y: number, densityStrength: number, velocityStrength: number, densityRadius: number, velocityRadius: number) {
        const gl = this.gl;
        gl.viewport(0, 0, this.width, this.height);
        gl.disable(gl.SCISSOR_TEST);
        
        // Sink Density
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.density.fboWrite);
        this.runProgram(this.programs.sink, {
            uTarget: this.density.read,
            aspectRatio: this.width / this.height,
            point: [x / this.width, 1.0 - y / this.height],
            strength: densityStrength,
            radius: densityRadius
        });
        this.density.swap();

        // Sink Velocity (Dampen it to prevent pressure explosion/bounce)
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.velocity.fboWrite);
        this.runProgram(this.programs.sink, {
            uTarget: this.velocity.read,
            aspectRatio: this.width / this.height,
            point: [x / this.width, 1.0 - y / this.height],
            strength: velocityStrength, 
            radius: velocityRadius
        });
        this.velocity.swap();
    }

    render(target: WebGLFramebuffer | null, showObstacles: boolean) {
        const gl = this.gl;
        gl.bindFramebuffer(gl.FRAMEBUFFER, target);
        gl.viewport(0, 0, this.width, this.height);
        this.runProgram(this.programs.display, {
            uTexture: this.density.read,
            uVelocity: this.velocity.read,
            uObstacles: this.obstacles.read,
            uMode: 0.0, // 0 = Density
            uShowObstacles: showObstacles ? 1.0 : 0.0
        });
    }

    reset() {
        const gl = this.gl;
        const clear = (fbo: WebGLFramebuffer) => {
            gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
            gl.clearColor(0, 0, 0, 0);
            gl.clear(gl.COLOR_BUFFER_BIT);
        };
        
        clear(this.velocity.fboRead);
        clear(this.velocity.fboWrite);
        clear(this.density.fboRead);
        clear(this.density.fboWrite);
        clear(this.divergence.fbo);
        clear(this.pressure.fboRead);
        clear(this.pressure.fboWrite);
        clear(this.obstacles.fboRead);
        clear(this.obstacles.fboWrite);
        clear(this.drawnObstacles.fbo);
    }

    getDensityPixels() {
        return this.readData(this.density.read, 0);
    }

    getVelocityPixels() {
        return this.readData(this.velocity.read, 1);
    }

    readData(tex: WebGLTexture, mode: number) {
        const gl = this.gl;
        const fbo = gl.createFramebuffer();
        const targetTex = gl.createTexture();
        
        gl.bindTexture(gl.TEXTURE_2D, targetTex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, this.width, this.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        
        gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, targetTex, 0);
        
        gl.viewport(0, 0, this.width, this.height);
        this.runProgram(this.programs.display, {
            uTexture: mode === 0 ? tex : null,
            uVelocity: mode === 1 ? tex : null,
            uObstacles: this.obstacles.read,
            uMode: mode,
            uShowObstacles: 0.0 // Never show obstacles in saved data
        });
        
        const pixels = new Uint8Array(this.width * this.height * 4);
        gl.readPixels(0, 0, this.width, this.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
        
        gl.deleteFramebuffer(fbo);
        gl.deleteTexture(targetTex);
        
        return pixels;
    }
}

const FluidSimulationNode = memo(({ id, data, selected }: NodeProps<NodeData>) => {
    // console.log('FluidSimulationNode render', id, Date.now());
    const { t } = useTranslation();
    const { setNodes, deleteElements, setEdges } = useReactFlow();
    
    // Use custom selectors instead of useNodes/useEdges to avoid re-renders on drag
    const nodes = useOptimizedNodes();
    const edges = useStore(edgesSelector, deepEqual);
    
    const handleDeleteNode = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
        deleteElements({ nodes: [{ id }] });
    }, [id, deleteElements]);

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
    
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const emissionCanvasRef = useRef<HTMLCanvasElement>(null);
    const obstacleCanvasRef = useRef<HTMLCanvasElement>(null);

    const solverRef = useRef<GPUFluidSolver | null>(null);
    const requestRef = useRef<number>();
    const lastDrawPos = useRef<{x: number, y: number} | null>(null);
    const [isRunning, setIsRunning] = useState(true);
    const [showSettings, setShowSettings] = useState(false);

    const [compiledEmission, setCompiledEmission] = useState<CompilationResult | null>(null);
    const [compiledObstacle, setCompiledObstacle] = useState<CompilationResult | null>(null);
    
    // Settings with Persistence
    const [viscosity, setViscosity] = useState(data.settings?.viscosity ?? 0.002);
    const [fade, setFade] = useState(data.settings?.fade ?? 0.116);
    const [dt, setDt] = useState(data.settings?.dt ?? 0.016);
    const [speed, setSpeed] = useState(data.settings?.speed ?? 0.6);
    const [interactionMode, setInteractionMode] = useState<'drag' | 'smoke' | 'wall' | 'field'>(data.settings?.interactionMode ?? 'drag');
    const [emitters, setEmitters] = useState<{x: number, y: number}[]>(data.settings?.emitters ?? []);
    const [forceFields, setForceFields] = useState<ForceField[]>(() => {
        const saved = data.settings?.forceFields ?? [];
        return saved.map((f: any) => ({
            ...f,
            id: f.id || Math.random().toString(36).substr(2, 9),
            force: f.force ?? (f.type === 'attract' ? -(f.strength ?? 5.0) : (f.strength ?? 5.0)),
            spin: f.spin ?? (f.type === 'rotate' ? (f.strength ?? 5.0) : 0.0),
            windForce: f.windForce ?? 0.0,
            windAngle: f.windAngle ?? 0.0,
            pulse: f.pulse ?? 0.0,
            turbulence: f.turbulence ?? 0.0,
            radius: f.radius ?? (data.settings?.splatRadius ?? 0.1)
        }));
    });
    const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);
    const [draggingFieldId, setDraggingFieldId] = useState<string | null>(null);
    const [showObstacles, setShowObstacles] = useState(data.settings?.showObstacles ?? true);
    const [showFieldIcons, setShowFieldIcons] = useState(data.settings?.showFieldIcons ?? true);
    
    // New Parameters
    const [pressureIterations, setPressureIterations] = useState(data.settings?.pressureIterations ?? 50);
    const [splatRadius, setSplatRadius] = useState(data.settings?.splatRadius ?? 0.014);
    const [splatForce, setSplatForce] = useState(data.settings?.splatForce ?? 5.0);
    const [splatColor, setSplatColor] = useState(data.settings?.splatColor ?? '#ffffff');
    const [densityAmount, setDensityAmount] = useState(data.settings?.densityAmount ?? 0.3);
    const [emissionSpeed, setEmissionSpeed] = useState(data.settings?.emissionSpeed ?? 1.0);
    const [gravity, setGravity] = useState(data.settings?.gravity ?? 0.0);

    // Compile Inputs
    useEffect(() => {
        const emissionEdge = edges.find(e => e.target === id && e.targetHandle === 'input_emission');
        if (emissionEdge) {
            const result = compileGraph(nodes, edges, emissionEdge.source);
            setCompiledEmission(result);
        } else {
            setCompiledEmission(null);
        }

        const obstacleEdge = edges.find(e => e.target === id && e.targetHandle === 'input_obstacle');
        if (obstacleEdge) {
            const result = compileGraph(nodes, edges, obstacleEdge.source);
            setCompiledObstacle(result);
        } else {
            setCompiledObstacle(null);
        }
    }, [nodes, edges, id]);

    // Sync settings to Node Data
    useEffect(() => {
        const settings = {
            viscosity, fade, dt, speed, interactionMode, emitters, forceFields, showObstacles, showFieldIcons,
            pressureIterations, splatRadius, splatForce, splatColor, densityAmount, emissionSpeed, gravity
        };
        
        const timer = setTimeout(() => {
            setNodes(nds => nds.map(n => {
                if (n.id === id) {
                    if (JSON.stringify(n.data.settings) === JSON.stringify(settings)) return n;
                    return { ...n, data: { ...n.data, settings } };
                }
                return n;
            }));
        }, 500);
        return () => clearTimeout(timer);
    }, [viscosity, fade, dt, speed, interactionMode, emitters, forceFields, showObstacles, showFieldIcons, pressureIterations, splatRadius, splatForce, splatColor, densityAmount, emissionSpeed, gravity, id, setNodes]);

    const width = data.resolution?.w || 512;
    const height = data.resolution?.h || 512;

    // Initialize Solver
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        
        // Fix: Enable preserveDrawingBuffer to prevent flickering when used as input texture
        const gl = canvas.getContext('webgl2', { alpha: false, antialias: false, preserveDrawingBuffer: true });
        if (!gl) return;

        solverRef.current = new GPUFluidSolver(gl, width, height);
        
        // Initial Splat
        solverRef.current.splat(width/2, height/2, 0, 10, [1,1,1]);

        // Register Dynamic Texture
        const dynamicId = `dynamic://${id}`;
        registerDynamicTexture(dynamicId, canvas);

        // Update Node Data to use Dynamic Texture
        setNodes((nds) => nds.map((node) => {
            if (node.id === id) {
                // Only update if not already set to avoid infinite loop
                if (node.data.uniforms?.image?.value === dynamicId) return node;
                
                return {
                    ...node,
                    data: {
                        ...node.data,
                        uniforms: {
                            ...node.data.uniforms,
                            image: { type: 'sampler2D', value: dynamicId },
                            flow: { type: 'sampler2D', value: dynamicId }
                        }
                    }
                };
            }
            return node;
        }));

        return () => {
            unregisterDynamicTexture(dynamicId);
        };
    }, [id, setNodes, width, height]);

    // Helper to convert hex to rgb array [0..1]
    const hexToRgb = (hex: string) => {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? [
            parseInt(result[1], 16) / 255,
            parseInt(result[2], 16) / 255,
            parseInt(result[3], 16) / 255
        ] : [1, 1, 1];
    };

    const draw = useCallback((timestamp: number) => {
        const solver = solverRef.current;
        if (!solver) return;

        // Update Obstacles FIRST (so forces use correct obstacle map)
        if (compiledObstacle && obstacleCanvasRef.current) {
            solver.updateObstacles(obstacleCanvasRef.current);
        } else {
            solver.updateObstacles(null);
        }

        const rgb = hexToRgb(splatColor).map(c => c * densityAmount);

        // Process Emitters
        if (emitters.length > 0) {
            // Upward Velocity
            solver.batchSplat(emitters, 0.0, -emissionSpeed, rgb, splatRadius * 0.2);
        }

        // Process Force Fields
        if (forceFields.length > 0) {
            forceFields.forEach(f => {
                const r = f.radius;
                
                // Pulse Modulation
                // Frequency: 0-10 Hz. 
                // If pulse > 0, modulate strength by sine wave.
                // Factor oscillates between 0.0 and 2.0 if full pulse, or just adds variation.
                // Let's make it oscillate between 0.2 and 1.8 to keep some base force.
                let pulseFactor = 1.0;
                if (f.pulse > 0.01) {
                    // timestamp is in ms. f.pulse is arbitrary speed.
                    // sin(time * speed)
                    pulseFactor = 1.0 + Math.sin(timestamp * f.pulse * 0.005) * 0.8;
                }

                const effectiveForce = f.force * pulseFactor;
                const effectiveSpin = f.spin * pulseFactor;
                const effectiveWind = f.windForce * pulseFactor;

                // Radial Force (Push/Pull)
                if (Math.abs(effectiveForce) > 0.01) {
                    solver.splatRadial(f.x, f.y, effectiveForce, r);
                    
                    // Sink effect if attracting (negative force)
                    if (f.force < 0) {
                        // Sink strength proportional to attraction force
                        // Increased density drain to prevent visual pile-up at center
                        const drain = Math.min(Math.abs(effectiveForce) * 0.1, 1.0);
                        
                        // Strong velocity drain (damping) at the center is crucial!
                        // Without this, the inward velocity accumulates infinitely, causing
                        // extreme pressure buildup that "explodes" or pushes fluid away.
                        // We want fluid to flow IN, then lose momentum as it "falls" into the sink.
                        const velDrain = Math.min(Math.abs(effectiveForce) * 0.2 + 0.5, 0.95);
                        
                        // Use small radius for density (visual hole) and slightly larger for velocity (stability)
                        solver.sink(f.x, f.y, drain, velDrain, r * 0.1, r * 0.2);
                    }
                }

                // Rotation Force
                if (Math.abs(effectiveSpin) > 0.01) {
                    solver.splatVortex(f.x, f.y, effectiveSpin, r);
                }

                // Wind Force
                if (Math.abs(effectiveWind) > 0.01) {
                    solver.splatWind(f.x, f.y, effectiveWind, f.windAngle, r);
                }

                // Turbulence
                if (f.turbulence > 0.01) {
                    // Use timestamp for noise animation
                    solver.splatTurbulence(f.x, f.y, f.turbulence, r, timestamp * 0.001);
                }
            });
        }

        // Process Input Textures
        if (compiledEmission && emissionCanvasRef.current) {
            // Add emission from texture
            // Use densityAmount as strength multiplier
            // Add upward velocity (0.0, emissionSpeed)
            solver.addEmission(emissionCanvasRef.current, densityAmount * 0.1, [0.0, emissionSpeed]); 
        }

        solver.step(dt * 50.0 * speed, viscosity, 0, fade, pressureIterations, gravity); // Scale dt for visual speed
        solver.render(null, showObstacles); // Render to screen

        if (isRunning) {
            requestRef.current = requestAnimationFrame(draw);
        }
    }, [isRunning, dt, viscosity, fade, speed, emitters, forceFields, pressureIterations, splatRadius, splatForce, splatColor, showObstacles, densityAmount, gravity, compiledEmission, compiledObstacle]);

    useEffect(() => {
        if (isRunning) {
            requestRef.current = requestAnimationFrame(draw);
        } else {
            if (requestRef.current) cancelAnimationFrame(requestRef.current);
        }
        return () => {
            if (requestRef.current) cancelAnimationFrame(requestRef.current);
        };
    }, [isRunning, draw]);

    // Interaction
    const handleMouseMove = (e: React.MouseEvent) => {
        if (!solverRef.current || !canvasRef.current) return;

        const rect = canvasRef.current.getBoundingClientRect();
        const x = (e.clientX - rect.left) * (width / rect.width);
        const y = (e.clientY - rect.top) * (height / rect.height);
        
        if (draggingFieldId) {
            setForceFields(prev => prev.map(f => f.id === draggingFieldId ? { ...f, x, y } : f));
            return;
        }

        // Only allow drawing/interaction if directly on canvas
        if (e.target !== canvasRef.current) return;

        if (e.buttons === 1) { // Left click drag
             if (interactionMode === 'drag') {
                 const dx = e.movementX;
                 const dy = e.movementY;
                 const rgb = hexToRgb(splatColor).map(c => c * densityAmount);
                 
                 solverRef.current.splat(x, y, dx * splatForce, dy * splatForce, rgb, splatRadius * 0.2);
             } else if (interactionMode === 'smoke') {
                 const dist = lastDrawPos.current ? Math.hypot(x - lastDrawPos.current.x, y - lastDrawPos.current.y) : Infinity;
                 if (dist > 5) {
                     setEmitters(prev => [...prev, {x, y}]);
                     lastDrawPos.current = {x, y};
                     const rgb = hexToRgb(splatColor).map(c => c * densityAmount);
                     
                     solverRef.current.splat(x, y, 0.0, -emissionSpeed, rgb, splatRadius * 0.2);
                 }
             } else if (interactionMode === 'wall') {
                 // Draw obstacle
                 // Use splatRadius for wall thickness? Maybe scale it up a bit
                 solverRef.current.drawObstacle(x, y, splatRadius, false);
             }
        }
    };

    const handleMouseDown = (e: React.MouseEvent) => {
        if (!solverRef.current || !canvasRef.current) return;
        
        const rect = canvasRef.current.getBoundingClientRect();
        const x = (e.clientX - rect.left) * (width / rect.width);
        const y = (e.clientY - rect.top) * (height / rect.height);
        const rgb = hexToRgb(splatColor).map(c => c * densityAmount);

        if (interactionMode === 'smoke') {
            // Add persistent emitter
            setEmitters(prev => [...prev, {x, y}]);
            lastDrawPos.current = {x, y};
            // Immediate feedback
            solverRef.current.splat(x, y, 0.0, -emissionSpeed, rgb, splatRadius * 0.2);
        } else if (interactionMode === 'wall') {
            solverRef.current.drawObstacle(x, y, splatRadius, false);
        } else if (interactionMode === 'field') {
            const newField: ForceField = {
                id: Math.random().toString(36).substr(2, 9),
                x, 
                y, 
                force: splatForce, // Default to repel
                spin: 0.0,         // Default no spin
                windForce: 0.0,
                windAngle: 0.0,
                pulse: 0.0,
                turbulence: 0.0,
                radius: splatRadius
            };
            setForceFields(prev => [...prev, newField]);
            lastDrawPos.current = {x, y};
            
            // Immediate feedback
            solverRef.current.splatRadial(x, y, splatForce, splatRadius);
        } else {
            // Drag mode initial click
            if (e.buttons === 1) {
                const dx = e.movementX;
                const dy = e.movementY;
                solverRef.current.splat(x, y, dx * splatForce, dy * splatForce, rgb, splatRadius * 0.2);
            }
        }
    };

    const handleMouseUp = () => {
        setDraggingFieldId(null);
    };

    const handleReset = () => {
        solverRef.current?.reset();
        setEmitters([]);
        setForceFields([]);
    };

    const borderClass = selected ? 'border-blue-500 ring-1 ring-blue-500' : 'border-zinc-700';

    return (
        <div 
            className={`shadow-xl rounded-lg border bg-zinc-900 w-[300px] transition-all overflow-visible ${borderClass}`}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
        >
            <div className="flex items-center justify-between p-2 border-b border-zinc-800 bg-zinc-800/50 rounded-t-lg">
                <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm text-zinc-200">{t("Fluid Sim (GPU)")}</span>
                </div>
                <div className="flex items-center gap-1">
                    <button onClick={() => setIsRunning(!isRunning)} className="p-1.5 rounded text-zinc-400 hover:text-white">
                        {isRunning ? <Pause size={12}/> : <Play size={12}/>}
                    </button>
                    <button onClick={handleReset} className="p-1.5 rounded text-zinc-400 hover:text-white" title={t("Reset")}>
                        <RotateCcw size={12}/>
                    </button>
                    <button onClick={() => setShowSettings(!showSettings)} className={`p-1.5 rounded ${showSettings ? 'text-blue-400' : 'text-zinc-500'}`}>
                        <Settings size={12}/>
                    </button>
                    <button onClick={handleDeleteNode} className="p-1.5 rounded text-zinc-400 hover:text-red-400 transition-colors ml-1" title={t("Delete")}>
                        <X size={12}/>
                    </button>
                </div>
            </div>

            <div className="relative w-full aspect-square bg-black">
                {/* Inputs - Left Side */}
                <Handle 
                    type="target" 
                    position={Position.Left} 
                    id="input_emission" 
                    className="!w-3 !h-3 !bg-green-500 !border-2 !border-zinc-900 z-20"
                    style={{ top: '40%', left: '-6px', transform: 'translateY(-50%)' }}
                    title={t("Emission Mask (Green)")}
                    onClick={(e) => handleDisconnect(e, 'input_emission', 'target')}
                />
                <Handle 
                    type="target" 
                    position={Position.Left} 
                    id="input_obstacle" 
                    className="!w-3 !h-3 !bg-red-500 !border-2 !border-zinc-900 z-20"
                    style={{ top: '60%', left: '-6px', transform: 'translateY(-50%)' }}
                    title={t("Obstacle Mask (Red)")}
                    onClick={(e) => handleDisconnect(e, 'input_obstacle', 'target')}
                />

                {/* Outputs - Right Side */}
                 <div className="absolute top-1/2 -right-3 -translate-y-1/2 z-20 flex flex-col gap-2">
                    <Handle type="source" position={Position.Right} id="image" className="!w-3 !h-3 !bg-pink-500 !border-2 !border-zinc-900" title={t("Image")} onClick={(e) => handleDisconnect(e, 'image', 'source')}/>
                    <Handle type="source" position={Position.Right} id="flow" className="!w-3 !h-3 !bg-blue-500 !border-2 !border-zinc-900" title={t("Flow Map")} onClick={(e) => handleDisconnect(e, 'flow', 'source')}/>
                </div>

                {/* Hidden Renderers for Inputs */}
                <div className="hidden">
                    {compiledEmission && (
                        <ShaderPreview 
                            ref={emissionCanvasRef}
                            data={compiledEmission} 
                            width={width} 
                            height={height}
                        />
                    )}
                    {compiledObstacle && (
                        <ShaderPreview 
                            ref={obstacleCanvasRef}
                            data={compiledObstacle} 
                            width={width} 
                            height={height}
                        />
                    )}
                </div>

                {/* Force Field Icons Overlay */}
                {showFieldIcons && (
                    <div className="absolute inset-0 pointer-events-none z-10 overflow-hidden">
                        {forceFields.map(f => {
                            const isSelected = selectedFieldId === f.id;
                            // Visual radius approximation: radius * width (Linear Falloff)
                            const visualRadius = f.radius * width;
                            
                            return (
                                <React.Fragment key={f.id}>
                                    {/* Influence Circle (Only when selected or dragging) */}
                                    {(isSelected || draggingFieldId === f.id) && (
                                        <div 
                                            className="absolute rounded-full border border-white/50 bg-white/10 pointer-events-none"
                                            style={{
                                                left: `${(f.x / width) * 100}%`,
                                                top: `${(f.y / height) * 100}%`,
                                                width: `${visualRadius * 2}px`,
                                                height: `${visualRadius * 2}px`,
                                                transform: 'translate(-50%, -50%)'
                                            }}
                                        />
                                    )}
                                    
                                    {/* Icon */}
                                    <button
                                        className={`absolute w-6 h-6 -ml-3 -mt-3 rounded-full flex items-center justify-center pointer-events-auto transition-transform hover:scale-110 nodrag
                                            ${isSelected ? 'ring-2 ring-white scale-110' : 'border border-white/30'}
                                            ${f.force > 0 ? 'bg-red-600/80 text-white' : ''}
                                            ${f.force < 0 ? 'bg-blue-600/80 text-white' : ''}
                                            ${f.force === 0 && f.spin !== 0 ? 'bg-green-600/80 text-white' : ''}
                                            ${f.force === 0 && f.spin === 0 ? 'bg-zinc-600/80 text-white' : ''}
                                        `}
                                        style={{ 
                                            left: `${(f.x / width) * 100}%`, 
                                            top: `${(f.y / height) * 100}%`,
                                            cursor: draggingFieldId === f.id ? 'grabbing' : 'grab'
                                        }}
                                        onMouseDown={(e) => {
                                            e.stopPropagation();
                                            setSelectedFieldId(f.id);
                                            setDraggingFieldId(f.id);
                                            setShowSettings(true);
                                        }}
                                        onDoubleClick={(e) => {
                                            e.stopPropagation();
                                            setForceFields(prev => prev.filter(p => p.id !== f.id));
                                            if (selectedFieldId === f.id) setSelectedFieldId(null);
                                            if (draggingFieldId === f.id) setDraggingFieldId(null);
                                        }}
                                    >
                                        {f.force > 0 && <Maximize2 size={14}/>}
                                        {f.force < 0 && <Minimize2 size={14}/>}
                                        {f.force === 0 && f.spin !== 0 && <RotateCw size={14}/>}
                                        {f.force === 0 && f.spin === 0 && f.windForce === 0 && <Magnet size={14}/>}
                                        {f.windForce > 0 && (
                                            <div className="absolute inset-0 flex items-center justify-center" style={{ transform: `rotate(${f.windAngle}deg)` }}>
                                                <ArrowRight size={14} className={f.force !== 0 || f.spin !== 0 ? "text-yellow-400 opacity-80" : "text-white"} />
                                            </div>
                                        )}
                                    </button>
                                </React.Fragment>
                            );
                        })}
                    </div>
                )}

                <canvas 
                    ref={canvasRef}
                    width={width} height={height}
                    className="w-full h-full cursor-crosshair touch-none nodrag"
                    onMouseDown={handleMouseDown}
                />
            </div>

            {showSettings && (
                <div className="nodrag relative mt-2 w-full bg-zinc-800/50 border-t border-zinc-700 p-3 flex flex-col gap-3 rounded-b-lg">
                    {selectedFieldId ? (
                        <div className="flex flex-col gap-3">
                            <div className="flex items-center justify-between border-b border-zinc-700 pb-2">
                                <span className="text-sm font-semibold text-white">{t("Field Properties")}</span>
                                <button onClick={() => setSelectedFieldId(null)} className="text-zinc-400 hover:text-white"><X size={14}/></button>
                            </div>
                            {(() => {
                                const field = forceFields.find(f => f.id === selectedFieldId);
                                if (!field) return null;
                                return (
                                    <>
                                        <div className="flex flex-col gap-1">
                                            <div className="flex justify-between">
                                                <label className="text-xs text-zinc-400">{t("Force (Neg=Attract, Pos=Repel)")}</label>
                                                <span className="text-xs text-zinc-500">{field.force.toFixed(1)}</span>
                                            </div>
                                            <input type="range" min="-20.0" max="20.0" step="0.1" value={field.force} onChange={e => setForceFields(prev => prev.map(p => p.id === field.id ? {...p, force: parseFloat(e.target.value)} : p))} className="w-full"/>
                                        </div>
                                        <div className="flex flex-col gap-1">
                                            <div className="flex justify-between">
                                                <label className="text-xs text-zinc-400">{t("Rotation (Neg=CCW, Pos=CW)")}</label>
                                                <span className="text-xs text-zinc-500">{field.spin.toFixed(1)}</span>
                                            </div>
                                            <input type="range" min="-20.0" max="20.0" step="0.1" value={field.spin} onChange={e => setForceFields(prev => prev.map(p => p.id === field.id ? {...p, spin: parseFloat(e.target.value)} : p))} className="w-full"/>
                                        </div>
                                        <div className="flex flex-col gap-1">
                                            <div className="flex justify-between">
                                                <label className="text-xs text-zinc-400">{t("Wind Strength")}</label>
                                                <span className="text-xs text-zinc-500">{field.windForce.toFixed(1)}</span>
                                            </div>
                                            <input type="range" min="0.0" max="20.0" step="0.1" value={field.windForce} onChange={e => setForceFields(prev => prev.map(p => p.id === field.id ? {...p, windForce: parseFloat(e.target.value)} : p))} className="w-full"/>
                                        </div>
                                        <div className="flex flex-col gap-1">
                                            <div className="flex justify-between items-center">
                                                <label className="text-xs text-zinc-400">{t("Wind Angle")}</label>
                                                <div className="flex items-center gap-2">
                                                    <div className="bg-zinc-900 rounded-full p-0.5 border border-zinc-700 w-5 h-5 flex items-center justify-center">
                                                        <ArrowRight size={12} className="text-zinc-400 transition-transform" style={{ transform: `rotate(${field.windAngle}deg)` }} />
                                                    </div>
                                                    <span className="text-xs text-zinc-500 w-8 text-right">{field.windAngle.toFixed(0)}°</span>
                                                </div>
                                            </div>
                                            <input type="range" min="0" max="360" step="15" value={field.windAngle} onChange={e => setForceFields(prev => prev.map(p => p.id === field.id ? {...p, windAngle: parseFloat(e.target.value)} : p))} className="w-full"/>
                                        </div>
                                        <div className="flex flex-col gap-1">
                                            <div className="flex justify-between">
                                                <label className="text-xs text-zinc-400">{t("Pulse Frequency")}</label>
                                                <span className="text-xs text-zinc-500">{field.pulse.toFixed(1)}</span>
                                            </div>
                                            <input type="range" min="0.0" max="10.0" step="0.1" value={field.pulse} onChange={e => setForceFields(prev => prev.map(p => p.id === field.id ? {...p, pulse: parseFloat(e.target.value)} : p))} className="w-full"/>
                                        </div>
                                        <div className="flex flex-col gap-1">
                                            <div className="flex justify-between">
                                                <label className="text-xs text-zinc-400">{t("Turbulence")}</label>
                                                <span className="text-xs text-zinc-500">{field.turbulence.toFixed(1)}</span>
                                            </div>
                                            <input type="range" min="0.0" max="5.0" step="0.1" value={field.turbulence} onChange={e => setForceFields(prev => prev.map(p => p.id === field.id ? {...p, turbulence: parseFloat(e.target.value)} : p))} className="w-full"/>
                                        </div>
                                        <div className="flex flex-col gap-1">
                                            <div className="flex justify-between"><label className="text-xs text-zinc-400">{t("Radius")}</label><span className="text-xs text-zinc-500">{field.radius.toFixed(4)}</span></div>
                                            <input type="range" min="0.01" max="0.5" step="0.01" value={field.radius} onChange={e => setForceFields(prev => prev.map(p => p.id === field.id ? {...p, radius: parseFloat(e.target.value)} : p))} className="w-full"/>
                                        </div>
                                        <button 
                                            onClick={() => {
                                                setForceFields(prev => prev.filter(p => p.id !== field.id));
                                                setSelectedFieldId(null);
                                            }}
                                            className="flex items-center justify-center gap-2 bg-red-900/30 hover:bg-red-900/50 text-red-200 p-2 rounded mt-2 text-xs transition-colors"
                                        >
                                            <Trash2 size={12}/> {t("Delete Field")}
                                        </button>
                                    </>
                                );
                            })()}
                        </div>
                    ) : (
                        <>
                    <div className="flex items-center justify-between">
                        <span className="text-xs text-zinc-400">{t("Interaction Mode")}</span>
                        <div className="flex bg-zinc-900 rounded p-0.5">
                            <button 
                                onClick={() => setInteractionMode('drag')}
                                className={`p-1 rounded ${interactionMode === 'drag' ? 'bg-zinc-700 text-white' : 'text-zinc-500'}`}
                                title={t("Drag Fluid")}
                            >
                                <MousePointer2 size={12}/>
                            </button>
                            <button 
                                onClick={() => setInteractionMode('smoke')}
                                className={`p-1 rounded ${interactionMode === 'smoke' ? 'bg-zinc-700 text-white' : 'text-zinc-500'}`}
                                title={t("Emit Smoke (Upward)")}
                            >
                                <Wind size={12}/>
                            </button>
                            <button 
                                onClick={() => setInteractionMode('wall')}
                                className={`p-1 rounded ${interactionMode === 'wall' ? 'bg-zinc-700 text-white' : 'text-zinc-500'}`}
                                title={t("Draw Walls/Obstacles")}
                            >
                                <Square size={12}/>
                            </button>
                            <button 
                                onClick={() => setInteractionMode('field')}
                                className={`p-1 rounded ${interactionMode === 'field' ? 'bg-zinc-700 text-white' : 'text-zinc-500'}`}
                                title={t("Place Force Fields")}
                            >
                                <Magnet size={12}/>
                            </button>
                        </div>
                    </div>

                    <div className="flex items-center justify-between">
                        <label className="text-xs text-zinc-400">{t("Show Field Icons")}</label>
                        <button onClick={() => setShowFieldIcons(!showFieldIcons)} className="text-zinc-400 hover:text-white">
                            {showFieldIcons ? <Eye size={14}/> : <EyeOff size={14}/>}
                        </button>
                    </div>

                    <div className="flex items-center justify-between">
                        <label className="text-xs text-zinc-400">{t("Show Obstacles")}</label>
                        <input type="checkbox" checked={showObstacles} onChange={e => setShowObstacles(e.target.checked)} className="rounded bg-zinc-900 border-zinc-700"/>
                    </div>
                    
                    <div className="flex flex-col gap-1">
                        <div className="flex justify-between">
                            <label className="text-xs text-zinc-400">{t("Simulation Speed")}</label>
                            <span className="text-xs text-zinc-500">{speed.toFixed(1)}</span>
                        </div>
                        <input type="range" min="0" max="5.0" step="0.1" value={speed} onChange={e => setSpeed(parseFloat(e.target.value))} className="w-full"/>
                    </div>
                    <div className="flex flex-col gap-1">
                        <div className="flex justify-between">
                            <label className="text-xs text-zinc-400">{t("Velocity Dissipation")}</label>
                            <span className="text-xs text-zinc-500">{viscosity.toFixed(4)}</span>
                        </div>
                        <input type="range" min="0" max="0.05" step="0.001" value={viscosity} onChange={e => setViscosity(parseFloat(e.target.value))} className="w-full"/>
                    </div>
                    <div className="flex flex-col gap-1">
                        <div className="flex justify-between">
                            <label className="text-xs text-zinc-400">{t("Density Decay (Lifespan)")}</label>
                            <span className="text-xs text-zinc-500">{fade.toFixed(4)}</span>
                        </div>
                        <input type="range" min="0" max="0.2" step="0.001" value={fade} onChange={e => setFade(parseFloat(e.target.value))} className="w-full"/>
                    </div>
                    <div className="flex flex-col gap-1">
                        <div className="flex justify-between">
                            <label className="text-xs text-zinc-400">{t("Base Time Step")}</label>
                            <span className="text-xs text-zinc-500">{dt.toFixed(3)}</span>
                        </div>
                        <input type="range" min="0.001" max="0.1" step="0.001" value={dt} onChange={e => setDt(parseFloat(e.target.value))} className="w-full"/>
                    </div>
                    <div className="flex flex-col gap-1">
                        <div className="flex justify-between">
                            <label className="text-xs text-zinc-400">{t("Gravity (Y-Axis)")}</label>
                            <span className="text-xs text-zinc-500">{gravity.toFixed(1)}</span>
                        </div>
                        <input type="range" min="-2.0" max="2.0" step="0.1" value={gravity} onChange={e => setGravity(parseFloat(e.target.value))} className="w-full"/>
                    </div>

                    <div className="h-px bg-zinc-700 my-1"/>

                    <div className="flex flex-col gap-1">
                        <label className="text-xs text-zinc-400">{t("Brush/Emitter Color")}</label>
                        <input type="color" value={splatColor} onChange={e => setSplatColor(e.target.value)} className="w-full h-6 rounded cursor-pointer"/>
                    </div>
                    <div className="flex flex-col gap-1">
                        <div className="flex justify-between">
                            <label className="text-xs text-zinc-400">{t("Brush/Emitter Size")}</label>
                            <span className="text-xs text-zinc-500">{splatRadius.toFixed(4)}</span>
                        </div>
                        <input type="range" min="0.01" max="0.2" step="0.001" value={splatRadius} onChange={e => setSplatRadius(parseFloat(e.target.value))} className="w-full"/>
                    </div>
                    <div className="flex flex-col gap-1">
                        <div className="flex justify-between">
                            <label className="text-xs text-zinc-400">{t("Emission Density")}</label>
                            <span className="text-xs text-zinc-500">{densityAmount.toFixed(1)}</span>
                        </div>
                        <input type="range" min="0.1" max="5.0" step="0.1" value={densityAmount} onChange={e => setDensityAmount(parseFloat(e.target.value))} className="w-full"/>
                    </div>
                    <div className="flex flex-col gap-1">
                        <div className="flex justify-between">
                            <label className="text-xs text-zinc-400">{t("Emission Speed (Jet)")}</label>
                            <span className="text-xs text-zinc-500">{emissionSpeed.toFixed(1)}</span>
                        </div>
                        <input type="range" min="0.0" max="10.0" step="0.1" value={emissionSpeed} onChange={e => setEmissionSpeed(parseFloat(e.target.value))} className="w-full"/>
                    </div>
                    <div className="flex flex-col gap-1">
                        <div className="flex justify-between">
                            <label className="text-xs text-zinc-400">{t("Force Intensity")}</label>
                            <span className="text-xs text-zinc-500">{splatForce.toFixed(1)}</span>
                        </div>
                        <input type="range" min="1.0" max="20.0" step="0.1" value={splatForce} onChange={e => setSplatForce(parseFloat(e.target.value))} className="w-full"/>
                    </div>
                    <div className="flex flex-col gap-1">
                        <div className="flex justify-between">
                            <label className="text-xs text-zinc-400">{t("Solver Iterations (Quality)")}</label>
                            <span className="text-xs text-zinc-500">{pressureIterations.toFixed(0)}</span>
                        </div>
                        <input type="range" min="5" max="50" step="1" value={pressureIterations} onChange={e => setPressureIterations(parseInt(e.target.value))} className="w-full"/>
                    </div>
                    </>
                    )}
                </div>
            )}
        </div>
    );
}, (prev, next) => {
    // Custom comparison to avoid re-renders on position changes (drag)
    return prev.id === next.id && 
           prev.selected === next.selected && 
           prev.data === next.data;
});

export default FluidSimulationNode;
