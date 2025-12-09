import React, { memo, useCallback, useEffect, useRef, useState } from 'react';
import { Handle, NodeProps, Position, useReactFlow, useStore } from 'reactflow';
import { NodeData, CompilationResult } from '../types';
import { useTranslation } from 'react-i18next';
import { Settings2, Play, Pause, RotateCcw, ChevronDown, ChevronRight, Trash2, Layers, Box, Wind, Activity, Palette, Move, Zap, Camera, ScanEye, Eye, Plus, X, Home } from 'lucide-react';
import { SliderWidget, GradientWidget, CurveEditor, SmartNumberInput, ImageUploadWidget, DraggableNumberWidget } from './UniformWidgets';
import { generateGradientTexture } from '../utils/textureGen';
import { registerDynamicTexture, unregisterDynamicTexture, getDynamicTexture, DynamicTextureSource } from '../utils/dynamicRegistry';
import { assetManager } from '../utils/assetManager';
import { compileGraph } from '../utils/shaderCompiler';
import ShaderPreview from './ShaderPreview';
import { webglSystem } from '../utils/webglSystem';
import { useOptimizedNodes } from '../hooks/useOptimizedNodes';

const edgesSelector = (state: any) => state.edges;
const deepEqual = (a: any, b: any) => JSON.stringify(a) === JSON.stringify(b);

// --- TYPES ---

interface ModuleStaticDef {
    id: string;
    label: string;
    icon: any;
}

interface ModuleData {
    id: string;
    enabled: boolean;
    properties: Record<string, any>;
}

// --- MODULE DEFINITIONS ---

const MODULE_DEFS: ModuleStaticDef[] = [
    { id: 'main', label: 'Main', icon: Settings2 },
    { id: 'emission', label: 'Emission', icon: Zap },
    { id: 'shape', label: 'Shape', icon: Box },
    { id: 'limitVelocity', label: 'Limit Velocity Over Lifetime', icon: Wind },
    { id: 'velocity', label: 'Velocity over Lifetime', icon: Move },
    { id: 'noise', label: 'Noise', icon: Wind },
    { id: 'color', label: 'Color over Lifetime', icon: Palette },
    { id: 'size', label: 'Size over Lifetime', icon: Activity },
    { id: 'rotation', label: 'Rotation over Lifetime', icon: RotateCcw },
    { id: 'renderer', label: 'Renderer', icon: Layers },
];

const DEFAULT_MODULE_DATA: ModuleData[] = [
    {
        id: 'main',
        enabled: true,
        properties: {
            duration: 5.0,
            looping: true,
            startDelay: 0.0,
            startLifetime: { mode: 'Constant', constant: 5.0, constantMin: 1.0, constantMax: 5.0 },
            startSpeed: { mode: 'Constant', constant: 5.0, constantMin: 1.0, constantMax: 5.0 },
            startSize: { mode: 'Constant', constant: 0.2, constantMin: 0.1, constantMax: 0.5 },
            startRotation: { mode: 'Constant', constant: 0.0, constantMin: 0.0, constantMax: 360.0 },
            gravityModifier: { mode: 'Constant', constant: 0.0, constantMin: 0.0, constantMax: 1.0 },
            simulationSpace: 'Local',
            maxParticles: 1000000,
            autoRandomSeed: true,
            seed: 0
        }
    },
    {
        id: 'emission',
        enabled: true,
        properties: {
            rateOverTime: 10.0,
            rateOverDistance: 0.0,
            bursts: []
        }
    },
    {
        id: 'shape',
        enabled: true,
        properties: {
            shapeType: 'Cone',
            angle: 25.0,
            radius: 1.0,
            radiusThickness: 1.0,
            arc: 360.0,
            boxX: 1.0, boxY: 1.0, boxZ: 1.0,
            positionX: 0.0, positionY: 0.0, positionZ: 0.0,
            rotationX: 0.0, rotationY: 0.0, rotationZ: 0.0,
            scaleX: 1.0, scaleY: 1.0, scaleZ: 1.0,
            randomizeDirection: 0.0,
            spherizeDirection: 0.0,
            emissionThreshold: 0.0,
            image: null
        }
    },
    {
        id: 'limitVelocity',
        enabled: false,
        properties: {
            dampen: 0.0, // 0..1
            drag: 0.0    // 0..infinity (Air Resistance)
        }
    },
    {
        id: 'velocity',
        enabled: false,
        properties: {
            linearX: 0.0, linearY: 0.0, linearZ: 0.0,
            space: 'Local',
            orbitalX: 0.0, orbitalY: 0.0, orbitalZ: 0.0,
            offsetX: 0.0, offsetY: 0.0, offsetZ: 0.0,
            radial: 0.0,
            speedModifier: 1.0
        }
    },
    {
        id: 'noise',
        enabled: false,
        properties: {
            strength: 1.0,
            frequency: 0.5,
            scrollSpeed: 0.5,
            damping: true,
            octaves: 1,
            quality: 'Low',
            positionAmount: 1.0,
            rotationAmount: 0.0,
            sizeAmount: 0.0
        }
    },
    {
        id: 'color',
        enabled: true,
        properties: {
            color: { 
                gradientStops: [{ pos: 0, color: '#ffffff' }, { pos: 1, color: '#00ccff' }],
                alphaStops: [{ pos: 0, value: 1 }, { pos: 1, value: 0 }]
            }
        }
    },
    {
        id: 'size',
        enabled: false,
        properties: {
            separateAxes: false,
            size: [{ x: 0, y: 1 }, { x: 1, y: 0 }]
        }
    },
    {
        id: 'rotation',
        enabled: false,
        properties: {
            separateAxes: false,
            angularVelocity: { mode: 'Constant', constant: 45.0, constantMin: 0.0, constantMax: 360.0 }
        }
    },
    {
        id: 'renderer',
        enabled: true,
        properties: {
            renderMode: 'Billboard',
            renderAlignment: 'View',
            material: 'Circle',
            blending: 'Additive',
            texture: null,
            lengthScale: 2.0,
            speedScale: 0.1,
            cameraScale: 0.0,
            sortingFudge: 0.0,
            minParticleSize: 0.0,
            maxParticleSize: 1.0
        }
    }
];

// --- HELPERS ---
const generateCurveTexture = (points: {x:number, y:number}[], size: number = 128) => {
    const data = new Uint8Array(size * 4);
    // Sort points by x
    // Add default 0,1 if empty
    let sorted = [...points].sort((a, b) => a.x - b.x);
    if (sorted.length === 0) sorted = [{x:0, y:1}, {x:1, y:1}];
    
    // Ensure range covers 0..1
    if (sorted[0].x > 0) sorted.unshift({x:0, y:sorted[0].y});
    if (sorted[sorted.length-1].x < 1) sorted.push({x:1, y:sorted[sorted.length-1].y});

    for(let i=0; i<size; i++) {
        const t = i / (size - 1);
        // Find segment
        let p0 = sorted[0];
        let p1 = sorted[sorted.length-1];
        for(let j=0; j<sorted.length-1; j++) {
            if (t >= sorted[j].x && t <= sorted[j+1].x) {
                p0 = sorted[j];
                p1 = sorted[j+1];
                break;
            }
        }
        
        const range = p1.x - p0.x;
        const localT = range > 0.0001 ? (t - p0.x) / range : 0;
        const val = p0.y + (p1.y - p0.y) * localT;
        
        // Use R channel for Size
        const byteVal = Math.floor(Math.max(0, Math.min(1, val)) * 255);
        data[i*4 + 0] = byteVal; // R
        data[i*4 + 1] = 0;       // G
        data[i*4 + 2] = 0;       // B
        data[i*4 + 3] = 255;     // A
    }
    return data;
};

// Math Helpers
const mat4LookAt = (eye: number[], center: number[], up: number[]) => {
    let x0, x1, x2, y0, y1, y2, z0, z1, z2, len;
    let eyex = eye[0], eyey = eye[1], eyez = eye[2];
    let upx = up[0], upy = up[1], upz = up[2];
    let centerx = center[0], centery = center[1], centerz = center[2];

    if (Math.abs(eyex - centerx) < 0.000001 &&
        Math.abs(eyey - centery) < 0.000001 &&
        Math.abs(eyez - centerz) < 0.000001) {
        return [
            1, 0, 0, 0,
            0, 1, 0, 0,
            0, 0, 1, 0,
            0, 0, 0, 1
        ];
    }

    z0 = eyex - centerx;
    z1 = eyey - centery;
    z2 = eyez - centerz;

    len = 1 / Math.hypot(z0, z1, z2);
    z0 *= len;
    z1 *= len;
    z2 *= len;

    x0 = upy * z2 - upz * z1;
    x1 = upz * z0 - upx * z2;
    x2 = upx * z1 - upy * z0;
    len = Math.hypot(x0, x1, x2);
    if (!len) {
        x0 = 0; x1 = 0; x2 = 0;
    } else {
        len = 1 / len;
        x0 *= len;
        x1 *= len;
        x2 *= len;
    }

    y0 = z1 * x2 - z2 * x1;
    y1 = z2 * x0 - z0 * x2;
    y2 = z0 * x1 - z1 * x0;

    len = Math.hypot(y0, y1, y2);
    if (!len) {
        y0 = 0; y1 = 0; y2 = 0;
    } else {
        len = 1 / len;
        y0 *= len;
        y1 *= len;
        y2 *= len;
    }

    return [
        x0, y0, z0, 0,
        x1, y1, z1, 0,
        x2, y2, z2, 0,
        -(x0 * eyex + x1 * eyey + x2 * eyez),
        -(y0 * eyex + y1 * eyey + y2 * eyez),
        -(z0 * eyex + z1 * eyey + z2 * eyez),
        1
    ];
};


// --- SHADERS ---

const VERT = `#version 300 es
in vec2 position;
out vec2 vUv;
void main() {
    vUv = position * 0.5 + 0.5;
    gl_Position = vec4(position, 0.0, 1.0);
}`;

// Simple physics update shader
const UPDATE_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;

uniform sampler2D uPos;
uniform sampler2D uVel; // xyz: velocity, w: unused
uniform sampler2D uData; // x: age, y: life, z: size, w: seed
uniform sampler2D uCol; // New: Color FBO (Unit 3)
uniform sampler2D uShapeTex; // New: Image Texture for Emission (Unit 4)
uniform sampler2D uRot; // New: Rotation FBO (Unit 5) - xyz: euler angles

uniform float uTime;
uniform float uGlobalTime; // New: Continuous time for noise
uniform float uRandomSeed; // New: Random Seed from System Loop
uniform float uLoopStartEmitted; // New: Emitted count at start of loop
uniform float uDt;
// Gravity
uniform int uGravityMode;
uniform float uGravityConst;
uniform float uGravityMin;
uniform float uGravityMax;
uniform vec3 uGravityDir;

uniform float uDrag;
uniform float uDampen; // New: Dampen velocity
uniform float uEmissionRate;

// Main
uniform float uStartLifetimeMin;
uniform float uStartLifetimeMax;
uniform float uStartSpeedMin;
uniform float uStartSpeedMax;
uniform float uStartRotationMin;
uniform float uStartRotationMax;
uniform float uStartSizeMin;
uniform float uStartSizeMax;
uniform int uLooping;
uniform float uMaxParticles; // New: Max Particles Count
uniform int uSimulationSpace; // 0: Local, 1: World

// Emission
uniform float uEmittedCount; // How many particles have been emitted so far (0..Max)

uniform int uShapeType; // 0:Sphere, 1:Cone, 2:Box, 3:Circle, 4:Edge, 5:Image
uniform float uRadius;
uniform float uAngle;
uniform vec3 uBoxSize;
uniform vec3 uEmitterPos;
uniform vec3 uEmitterRot; // New: Emitter Rotation (Euler Degrees)
uniform float uArc;
uniform float uRadiusThickness;
uniform float uLength;
uniform float uRandomizeDir; // New
uniform float uSpherizeDir; // New
uniform float uEmissionThreshold; // New
uniform int uShapeTexEnabled; // New

// Velocity
uniform vec3 uLinearVel;
uniform vec3 uOrbitalVel;
uniform vec3 uOffsetVel;
uniform float uRadialVel;

// Rotation
uniform vec3 uAngularVelMin;
uniform vec3 uAngularVelMax;
uniform int uRotationSeparateAxes;

// Noise
uniform float uNoiseStrength;
uniform float uNoiseFreq;
uniform float uNoiseScrollSpeed;
uniform int uNoiseOctaves;
uniform float uNoiseRotationAmount; // New: Affect rotation
uniform float uNoisePositionAmount; // New: Affect position (velocity)
uniform float uNoiseSizeAmount; // New: Affect size

layout(location = 0) out vec4 oPos;
layout(location = 1) out vec4 oVel;
layout(location = 2) out vec4 oData;
layout(location = 3) out vec4 oCol; // New
layout(location = 4) out vec4 oRot; // New

// Hash function
float hash(float n) { return fract(sin(n) * 43758.5453123); }
vec3 hash3(float n) { return fract(sin(vec3(n, n+1.0, n+2.0)) * 43758.5453123); }

// Simple 3D Noise
float noise(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(hash(dot(i, vec3(1, 57, 113))),
                       hash(dot(i + vec3(1, 0, 0), vec3(1, 57, 113))), f.x),
                   mix(hash(dot(i + vec3(0, 1, 0), vec3(1, 57, 113))),
                       hash(dot(i + vec3(1, 1, 0), vec3(1, 57, 113))), f.x), f.y),
               mix(mix(hash(dot(i + vec3(0, 0, 1), vec3(1, 57, 113))),
                       hash(dot(i + vec3(1, 0, 1), vec3(1, 57, 113))), f.x),
                   mix(hash(dot(i + vec3(0, 1, 1), vec3(1, 57, 113))),
                       hash(dot(i + vec3(1, 1, 1), vec3(1, 57, 113))), f.x), f.y), f.z);
}

// Rotation Matrix from Euler Angles (Degrees)
mat3 getRotationMatrix(vec3 rot) {
    vec3 rad = radians(rot);
    float cx = cos(rad.x), sx = sin(rad.x);
    float cy = cos(rad.y), sy = sin(rad.y);
    float cz = cos(rad.z), sz = sin(rad.z);
    
    // Standard Rotation Matrices (Column Major)
    // Rx
    mat3 rx = mat3(
        1.0, 0.0, 0.0,
        0.0, cx, sx,
        0.0, -sx, cx
    );
    
    // Ry
    mat3 ry = mat3(
        cy, 0.0, -sy,
        0.0, 1.0, 0.0,
        sy, 0.0, cy
    );
    
    // Rz
    mat3 rz = mat3(
        cz, sz, 0.0,
        -sz, cz, 0.0,
        0.0, 0.0, 1.0
    );
    
    // Order: Z * Y * X
    return rz * ry * rx;
}

void main() {
    vec4 pos = texture(uPos, vUv);
    vec4 vel = texture(uVel, vUv);
    vec4 data = texture(uData, vUv);
    vec4 col = texture(uCol, vUv); // Read old color
    vec3 rot = texture(uRot, vUv).xyz; // Read old rotation

    float age = data.x;
    float life = data.y;
    float id = data.w;
    float lastEmissionID = pos.w; // Stored last emission ID

    age += uDt;

    // Ring Buffer Logic
    float totalEmitted = uEmittedCount;
    float maxP = uMaxParticles;
    float currentLoop = floor(totalEmitted / maxP);
    float head = mod(totalEmitted, maxP);
    
    float myTargetID = currentLoop * maxP + id;
    if (id >= head) myTargetID -= maxP;
    
    // Check if we need to respawn due to new emission command
    bool newEmission = myTargetID > lastEmissionID;
    
    // Reset/Emit
    bool isAlive = life > 0.0;
    
    // Only emit if the slot is free (dead or expired)
    // This prevents overwriting living particles when limit is reached
    if (newEmission && (life <= 0.0 || age > life)) {
        // Force Respawn
        isAlive = false; // Treat as dead to trigger spawn logic
        lastEmissionID = myTargetID; // Update stored ID
    }

    if (newEmission || isAlive) {
        if (!isAlive || age > life) {
             // Spawn / Respawn
             if (newEmission) { 
                // Improved Random Seed Generation
                // Use relative emission index for deterministic seeding across loops
                // We use ceil(uLoopStartEmitted) to align to the first integer index of the new loop
                float relativeID = myTargetID - ceil(uLoopStartEmitted);
                
                vec3 s1 = hash3(relativeID);
                vec3 s2 = hash3(uRandomSeed); 
                vec3 seed = fract(s1 + s2);
                
                // Shape Logic
                vec3 localPos = vec3(0.0);
                vec3 localVel = vec3(0.0);
                
                // Reset Color to White default
                col = vec4(1.0);

                // Calculate Random Start Values
                float startLifetime = mix(uStartLifetimeMin, uStartLifetimeMax, hash(seed.x + 12.34));
                float startSpeed = mix(uStartSpeedMin, uStartSpeedMax, hash(seed.y + 56.78));
                float startRotation = mix(uStartRotationMin, uStartRotationMax, hash(seed.z + 90.12));
                float startSize = mix(uStartSizeMin, uStartSizeMax, hash(seed.x + seed.y + 34.56));
                
                // Gravity Modifier
                float gMod = uGravityConst;
                if (uGravityMode == 1) {
                    gMod = mix(uGravityMin, uGravityMax, hash(seed.z + 11.22));
                }
                vel.w = gMod;
                
                // Store Size in data.z
                data.z = startSize;

                if (uShapeType == 0) { // Sphere
                    vec3 randDir = normalize(seed - 0.5);
                    float dist = uRadius * mix(1.0, hash(seed.x + 0.1), uRadiusThickness);
                    localPos = randDir * dist;
                    localVel = randDir * startSpeed;
                } else if (uShapeType == 2) { // Box
                    localPos = (seed - 0.5) * uBoxSize;
                    localVel = vec3(0.0, 1.0, 0.0) * startSpeed;
                } else if (uShapeType == 3) { // Circle
                    float angle = (seed.x * uArc / 360.0) * 6.28318;
                    float r = uRadius * mix(1.0, hash(seed.y), uRadiusThickness);
                    localPos = vec3(cos(angle) * r, 0.0, sin(angle) * r);
                    localVel = normalize(localPos) * startSpeed;
                } else if (uShapeType == 4) { // Edge
                    localPos = vec3((seed.x - 0.5) * uLength, 0.0, 0.0);
                    localVel = vec3(0.0, 1.0, 0.0) * startSpeed;
                } else if (uShapeType == 5) { // Image
                    // Emit from XY plane based on texture
                    vec2 uv = seed.xy;
                    bool valid = false;
                    
                    if (uShapeTexEnabled == 1) {
                         // Rejection Sampling: Try multiple times to find a valid emission point
                         // This ensures the emission rate remains constant even if the mask is small
                         for(int i=0; i<20; i++) {
                             // Generate a new random UV for each attempt
                             vec2 probeUV = fract(seed.xy + vec2(float(i)*0.1234, float(i)*0.5678));
                             
                             vec4 probeCol = texture(uShapeTex, probeUV);
                             float gray = dot(probeCol.rgb, vec3(0.299, 0.587, 0.114));
                             
                             if (gray >= uEmissionThreshold) {
                                 uv = probeUV;
                                 col = probeCol;
                                 valid = true;
                                 break;
                             }
                         }
                         
                         // If we failed to find a valid spot after N tries, kill the particle
                         if (!valid) {
                             startLifetime = -1.0;
                         }
                    } else {
                        valid = true;
                    }
                    
                    float w = uBoxSize.x;
                    float h = uBoxSize.y;
                    // Flip Y position to match texture visual if needed
                    // Usually screen Y is Up. Texture UV (0,0) is Bottom-Left in GL.
                    // If image is drawn top-down, we need 1-y.
                    localPos = vec3((uv.x - 0.5) * w, (uv.y - 0.5) * h, 0.0);
                    localVel = vec3(0.0, 0.0, 1.0) * startSpeed; // Emit forward Z
                } else { // Cone (1)
                    float angleRange = radians(uAngle);
                    float theta = (seed.x * uArc / 360.0) * 6.28318;
                    float r = uRadius * mix(1.0, hash(seed.y), uRadiusThickness);
                    vec3 basePos = vec3(cos(theta) * r, 0.0, sin(theta) * r);
                    localPos = basePos;
                    vec3 up = vec3(0.0, 1.0, 0.0);
                    vec3 outward = normalize(basePos);
                    vec3 dir = normalize(up + outward * tan(angleRange));
                    localVel = dir * startSpeed;
                }
                
                // Randomize Direction
                if (uRandomizeDir > 0.0) {
                    vec3 rand = normalize(hash3(seed.y + 10.0) - 0.5);
                    localVel = mix(localVel, rand * startSpeed, uRandomizeDir);
                }
                
                // Spherize Direction
                if (uSpherizeDir > 0.0) {
                    vec3 sphDir = normalize(localPos);
                    localVel = mix(localVel, sphDir * startSpeed, uSpherizeDir);
                }
                
                // Apply Emitter Rotation/Position based on Simulation Space
                if (uSimulationSpace == 1) { // World
                    mat3 rotMat = getRotationMatrix(uEmitterRot);
                    pos.xyz = rotMat * localPos + uEmitterPos;
                    vel.xyz = rotMat * localVel;
                } else { // Local
                    pos.xyz = localPos;
                    vel.xyz = localVel;
                }
                
                // Initial Rotation
                // Start Rotation is usually Z-axis for 2D particles, but we can support 3D if needed.
                // For now, map startRotation to Z.
                rot = vec3(0.0, 0.0, startRotation);

                age = 0.0;
                life = startLifetime; 
             } else {
                 // Die
                 life = -1.0;
             }
        } else {
             // Physics Update (Alive)
             vel.xyz += uGravityDir * vel.w * uDt;
             vel.xyz += uLinearVel * uDt; // Linear Velocity module
             
             // Orbital & Radial
             vec3 center = uEmitterPos + uOffsetVel;
             vec3 diff = pos.xyz - center;
             
             // Orbital (Angular Velocity)
             if (length(uOrbitalVel) > 0.0) {
                 // Apply rotation directly to position to avoid spiraling
                 // This treats uOrbitalVel as Angular Velocity (Degrees/sec)
                 mat3 rotMat = getRotationMatrix(uOrbitalVel * uDt);
                 pos.xyz = center + rotMat * diff;
                 // Recalculate diff for Radial
                 diff = pos.xyz - center;
             }
             
             // Radial
             if (uRadialVel != 0.0 && length(diff) > 0.001) {
                 vel.xyz += normalize(diff) * uRadialVel * uDt;
             }
             
             // Limit Velocity (Drag & Dampen)
             if (uDrag > 0.0) {
                 vel.xyz *= max(0.0, 1.0 - uDrag * uDt);
             }
             if (uDampen > 0.0) {
                 vel.xyz *= (1.0 - uDampen * uDt);
             }
             
             if (uNoiseStrength > 0.0) {
                 float time = uGlobalTime * uNoiseScrollSpeed;
                 vec3 nPos = pos.xyz * uNoiseFreq + vec3(time);
                 
                 vec3 noiseVal = vec3(
                     noise(nPos) - 0.5,
                     noise(nPos + 10.0) - 0.5,
                     noise(nPos + 20.0) - 0.5
                 );
                 
                 if (uNoiseOctaves > 1) {
                     vec3 nPos2 = nPos * 2.0 + 100.0;
                     noiseVal += vec3(
                         noise(nPos2) - 0.5,
                         noise(nPos2 + 10.0) - 0.5,
                         noise(nPos2 + 20.0) - 0.5
                     ) * 0.5;
                 }
                 
                 // Apply to Velocity (Position Amount controls this influence)
                 if (uNoisePositionAmount > 0.0) {
                    vel.xyz += noiseVal * uNoiseStrength * uNoisePositionAmount * uDt * 10.0;
                 }
                 
                 // Apply to Rotation (Angular Velocity)
                 if (uNoiseRotationAmount > 0.0) {
                     // Use noise for 3D rotation
                     vec3 noiseRot = vec3(
                         noise(nPos + 30.0) - 0.5,
                         noise(nPos + 40.0) - 0.5,
                         noise(nPos + 50.0) - 0.5
                     );
                     rot += noiseRot * uNoiseStrength * uNoiseRotationAmount * uDt * 600.0;
                 }

                 // Apply to Size
                 if (uNoiseSizeAmount > 0.0) {
                     data.z += (noise(nPos + 60.0) - 0.5) * uNoiseStrength * uNoiseSizeAmount * uDt;
                     data.z = max(0.0, data.z);
                 }
             }

             pos.xyz += vel.xyz * uDt;
             
             // Rotation Update
             vec3 seedRot = hash3(id + 77.77);
             vec3 angVel = mix(uAngularVelMin, uAngularVelMax, seedRot);
             rot += angVel * uDt;
             // vel.w used for gravity now
        }
    } else {
        life = -1.0; // Stay dead
        age = 0.0;
        pos.xyz = vec3(0.0); // Hide
    }

    oPos = vec4(pos.xyz, lastEmissionID); // Store lastEmissionID in w
    oVel = vel;
    oData = vec4(age, life, data.z, id);
    oCol = col;
    oRot = vec4(rot, 0.0);
}`;

const RENDER_VERT = `#version 300 es
layout(location = 0) in vec2 aUv; // Instance UV (particle ID mapped to texture UV)
layout(location = 1) in vec2 aQuad; // -1..1 quad vertices

uniform sampler2D uPos;
uniform sampler2D uVel;
uniform sampler2D uData;
uniform sampler2D uCol;
uniform sampler2D uRot; // New: Rotation

uniform mat4 uView;
uniform mat4 uProjection;
uniform float uSizeScale;
uniform int uSizeCurveEnabled;
uniform int uSimulationSpace; // 0: Local, 1: World

// New: Uniform Array for Curve
uniform vec2 uSizeCurvePoints[16]; 
uniform int uSizeCurvePointCount;

// New: Render Mode Uniforms
uniform int uRenderMode; // 0: Billboard, 1: Stretched, 2: Horizontal, 3: Vertical
uniform int uRenderAlignment; // 0: View, 1: World, 2: Local
uniform vec3 uEmitterRot; // Emitter Rotation for Local Alignment
uniform float uLengthScale;
uniform float uSpeedScale;
uniform float uMinParticleSize; // New
uniform float uMaxParticleSize; // New

// Orbital Params for Alignment Calculation
uniform vec3 uOrbitalVel;
uniform vec3 uEmitterPos;
uniform vec3 uOffsetVel;

out vec2 vTexCoord;
out float vLife;
out float vId;
out vec4 vColor;

// Helper to sample curve from points
float sampleCurve(float t) {
    if (uSizeCurvePointCount < 2) return 1.0;
    
    // Find segment
    // Points are assumed sorted by X
    for (int i = 0; i < 15; i++) {
        if (i >= uSizeCurvePointCount - 1) break;
        
        vec2 p0 = uSizeCurvePoints[i];
        vec2 p1 = uSizeCurvePoints[i+1];
        
        if (t >= p0.x && t <= p1.x) {
            float range = p1.x - p0.x;
            float localT = range > 0.0001 ? (t - p0.x) / range : 0.0;
            return mix(p0.y, p1.y, localT);
        }
    }
    // Clamping
    if (t < uSizeCurvePoints[0].x) return uSizeCurvePoints[0].y;
    return uSizeCurvePoints[uSizeCurvePointCount-1].y;
}

mat3 getRotationMatrix(vec3 angles) {
    vec3 rad = radians(angles);
    float cx = cos(rad.x), sx = sin(rad.x);
    float cy = cos(rad.y), sy = sin(rad.y);
    float cz = cos(rad.z), sz = sin(rad.z);
    
    // ZYX Order - Standard
    // Rx: [1 0 0; 0 c -s; 0 s c] -> Col: 1,0,0; 0,c,s; 0,-s,c
    // Ry: [c 0 s; 0 1 0; -s 0 c] -> Col: c,0,-s; 0,1,0; s,0,c
    // Rz: [c -s 0; s c 0; 0 0 1] -> Col: c,s,0; -s,c,0; 0,0,1
    
    mat3 rx = mat3(1.0, 0.0, 0.0, 0.0, cx, sx, 0.0, -sx, cx);
    mat3 ry = mat3(cy, 0.0, -sy, 0.0, 1.0, 0.0, sy, 0.0, cy);
    mat3 rz = mat3(cz, sz, 0.0, -sz, cz, 0.0, 0.0, 0.0, 1.0);
    
    return rz * ry * rx;
}

void main() {
    vec4 pos = texture(uPos, aUv);
    vec4 vel = texture(uVel, aUv);
    vec4 data = texture(uData, aUv);
    vec4 col = texture(uCol, aUv);
    vec3 rot = texture(uRot, aUv).xyz;
    
    vLife = 1.0 - (data.x / data.y); // Normalized Life 1->0
    vId = data.w;
    vTexCoord = aQuad * 0.5 + 0.5;
    vColor = col;

    vec3 center = pos.xyz;
    
    // Apply Simulation Space Transform
    if (uSimulationSpace == 0) { // Local
        mat3 emitterR = getRotationMatrix(uEmitterRot);
        center = emitterR * center + uEmitterPos;
    }

    // Size over life
    float curveSize = 1.0;
    if (uSizeCurveEnabled > 0 && uSizeCurvePointCount > 0) { 
        curveSize = sampleCurve(1.0 - vLife);
    }
    
    float size = data.z * curveSize; 
    
    // Clamp Size
    size = clamp(size, uMinParticleSize, uMaxParticleSize);
    
    if (data.y <= 0.0) size = 0.0;
    
    vec3 vertexPos;

    // Calculate Effective Velocity for Alignment (Base + Orbital)
    vec3 effectiveVel = vel.xyz;
    if (length(uOrbitalVel) > 0.0) {
        vec3 centerPos = uEmitterPos + uOffsetVel;
        // If Local, center is just offsetVel (relative to 0,0,0)
        if (uSimulationSpace == 0) centerPos = uOffsetVel;
        
        vec3 diff = pos.xyz - centerPos;
        vec3 angVel = radians(uOrbitalVel);
        effectiveVel += cross(angVel, diff);
    }
    
    // If Local, rotate velocity to World for alignment
    if (uSimulationSpace == 0) {
        mat3 emitterR = getRotationMatrix(uEmitterRot);
        effectiveVel = emitterR * effectiveVel;
    }

    if (uRenderMode == 1) { // Stretched Billboard
        vec3 velVec = effectiveVel;
        float speed = length(velVec);
        
        if (speed < 0.001) {
             // Fallback to View Aligned Billboard with Rotation
             mat3 R = getRotationMatrix(rot);
             vec3 localPos = R * vec3(aQuad, 0.0) * size;
             vec3 right = vec3(uView[0][0], uView[1][0], uView[2][0]);
             vec3 up = vec3(uView[0][1], uView[1][1], uView[2][1]);
             vec3 forward = vec3(uView[0][2], uView[1][2], uView[2][2]);
             vertexPos = center + (right * localPos.x + up * localPos.y + forward * localPos.z);
        } else {
            vec3 axisY = normalize(velVec); // Up is Velocity
            vec3 axisX = normalize(cross(axisY, vec3(uView[0][2], uView[1][2], uView[2][2]))); // Right is perpendicular to Velocity and Camera View
            
            // Fallback if parallel
            if (length(cross(axisY, vec3(uView[0][2], uView[1][2], uView[2][2]))) < 0.001) {
                axisX = vec3(uView[0][0], uView[1][0], uView[2][0]);
            }

            float stretch = uLengthScale + speed * uSpeedScale;
            
            vertexPos = center + (axisX * aQuad.x * size) + (axisY * aQuad.y * size * stretch);
        }
    } else {
        vec3 baseRight, baseUp, baseForward;
        
        if (uRenderMode == 2) { // Horizontal Billboard (XZ)
             baseRight = vec3(1.0, 0.0, 0.0);
             baseUp = vec3(0.0, 0.0, 1.0);
             baseForward = vec3(0.0, -1.0, 0.0);
        } else if (uRenderMode == 3) { // Vertical Billboard (XY)
             baseRight = vec3(1.0, 0.0, 0.0);
             baseUp = vec3(0.0, 1.0, 0.0);
             baseForward = vec3(0.0, 0.0, 1.0);
        } else { // Billboard (0) - Check Alignment
            if (uRenderAlignment == 1) { // World (XY)
                 baseRight = vec3(1.0, 0.0, 0.0);
                 baseUp = vec3(0.0, 1.0, 0.0);
                 baseForward = vec3(0.0, 0.0, 1.0);
            } else if (uRenderAlignment == 2) { // Local
                 mat3 emitterR = getRotationMatrix(uEmitterRot);
                 baseRight = emitterR * vec3(1.0, 0.0, 0.0);
                 baseUp = emitterR * vec3(0.0, 1.0, 0.0);
                 baseForward = emitterR * vec3(0.0, 0.0, 1.0);
            } else { // View (Default)
                 baseRight = vec3(uView[0][0], uView[1][0], uView[2][0]);
                 baseUp = vec3(uView[0][1], uView[1][1], uView[2][1]);
                 baseForward = vec3(uView[0][2], uView[1][2], uView[2][2]);
            }
        }

        // Apply Particle Rotation
        mat3 R = getRotationMatrix(rot);
        vec3 localPos = R * vec3(aQuad, 0.0) * size;
        
        // Transform Local Pos to Base Basis
        vertexPos = center + (baseRight * localPos.x + baseUp * localPos.y + baseForward * localPos.z);
    }

    gl_Position = uProjection * uView * vec4(vertexPos, 1.0);
}`;

const RENDER_FRAG = `#version 300 es
precision highp float;
in vec2 vTexCoord;
in float vLife;
in float vId;
in vec4 vColor; // New

uniform sampler2D uGradient; // Color over life
uniform sampler2D uParticleTexture; // New
uniform int uMaterialType; // 0: Circle, 1: Soft Circle, 2: Square, 3: Custom

out vec4 fragColor;

void main() {
    vec4 texColor = vec4(1.0);
    float alphaShape = 1.0;

    if (uMaterialType == 0) { // Circle
        float d = length(vTexCoord - 0.5);
        if (d > 0.5) discard;
        alphaShape = 1.0; // Hard edge (maybe slight AA?)
        // Simple AA
        alphaShape = smoothstep(0.5, 0.48, d);
    } else if (uMaterialType == 1) { // Soft Circle
        float d = length(vTexCoord - 0.5);
        alphaShape = smoothstep(0.5, 0.0, d); // Radial gradient
    } else if (uMaterialType == 2) { // Square
        alphaShape = 1.0;
    } else if (uMaterialType == 3) { // Custom
        texColor = texture(uParticleTexture, vTexCoord);
        alphaShape = texColor.a;
    }

    // Sample color ramp based on 1.0 - life (age)
    vec4 ramp = texture(uGradient, vec2(1.0 - vLife, 0.5));
    
    // Combine with Particle Color (from FBO) and Texture Color
    vec3 finalColor = ramp.rgb * vColor.rgb * texColor.rgb;
    float finalAlpha = ramp.a * vColor.a * alphaShape; 
    
    // Premultiply alpha for One/One blending
    fragColor = vec4(finalColor * finalAlpha, finalAlpha);
}`;


// --- DEBUG GIZMO RENDERER ---

const DEBUG_VERT = `#version 300 es
layout(location = 0) in vec3 aPos;
uniform mat4 uMVP;
void main() {
    gl_Position = uMVP * vec4(aPos, 1.0);
}`;

const DEBUG_FRAG = `#version 300 es
precision highp float;
uniform vec4 uColor;
out vec4 fragColor;
void main() {
    fragColor = uColor;
}`;

class ShapeDebugRenderer {
    gl: WebGL2RenderingContext;
    program: WebGLProgram;
    vao: WebGLVertexArrayObject;
    buffer: WebGLBuffer;
    
    constructor(gl: WebGL2RenderingContext) {
        this.gl = gl;
        
        const vs = gl.createShader(gl.VERTEX_SHADER)!;
        gl.shaderSource(vs, DEBUG_VERT);
        gl.compileShader(vs);
        
        const fs = gl.createShader(gl.FRAGMENT_SHADER)!;
        gl.shaderSource(fs, DEBUG_FRAG);
        gl.compileShader(fs);
        
        this.program = gl.createProgram()!;
        gl.attachShader(this.program, vs);
        gl.attachShader(this.program, fs);
        gl.linkProgram(this.program);
        
        this.vao = gl.createVertexArray()!;
        this.buffer = gl.createBuffer()!;
    }
    
    render(view: number[], proj: number[], settings: any, emitterPos: number[], emitterRot: number[], emitterScale: number[] = [1, 1, 1]) {
        const gl = this.gl;
        gl.useProgram(this.program);
        
        // Construct MVP
        // MVP = Proj * View * Translation * Rotation * Scale
        
        // Helper to multiply mat4 (column major)
        const mul = (a: number[], b: number[]) => {
            const out = new Array(16).fill(0);
            for(let i=0; i<4; i++) {
                for(let j=0; j<4; j++) {
                    let s = 0;
                    for(let k=0; k<4; k++) s += a[k*4+j] * b[i*4+k];
                    out[i*4+j] = s;
                }
            }
            return out;
        };
        
        // Rotation Matrix
        const rad = emitterRot.map(d => d * Math.PI / 180);
        const cx = Math.cos(rad[0]), sx = Math.sin(rad[0]);
        const cy = Math.cos(rad[1]), sy = Math.sin(rad[1]);
        const cz = Math.cos(rad[2]), sz = Math.sin(rad[2]);
        
        // ZYX order
        // Rz * Ry * Rx
        
        const rotX = [1,0,0,0, 0,cx,sx,0, 0,-sx,cx,0, 0,0,0,1]; // Column major
        const rotY = [cy,0,-sy,0, 0,1,0,0, sy,0,cy,0, 0,0,0,1];
        const rotZ = [cz,sz,0,0, -sz,cz,0,0, 0,0,1,0, 0,0,0,1];
        
        const rot = mul(rotZ, mul(rotY, rotX));
        
        // Scale
        const scale = [
            emitterScale[0], 0, 0, 0,
            0, emitterScale[1], 0, 0,
            0, 0, emitterScale[2], 0,
            0, 0, 0, 1
        ];

        // Translation
        const trans = [
            1,0,0,0,
            0,1,0,0,
            0,0,1,0,
            emitterPos[0], emitterPos[1], emitterPos[2], 1
        ];
        
        const model = mul(trans, mul(rot, scale));
        
        const vp = mul(proj, view);
        const mvp = mul(vp, model);
        
        gl.uniformMatrix4fv(gl.getUniformLocation(this.program, 'uMVP'), false, new Float32Array(mvp));
        gl.uniform4f(gl.getUniformLocation(this.program, 'uColor'), 1.0, 1.0, 0.0, 0.5); // Yellow
        
        // Generate Lines based on Shape
        const lines: number[] = [];
        const type = settings.shape.shapeType;
        
        const r = settings.shape.radius !== undefined ? settings.shape.radius : 1.0;
        const arc = settings.shape.arc !== undefined ? settings.shape.arc : 360.0;
        
        if (type === 'Sphere') {
            const segments = 32;
            // XY Circle (Arc handled?) Sphere usually full. Let's keep full for sphere gizmo.
            for(let i=0; i<segments; i++) {
                const t1 = i/segments * Math.PI*2;
                const t2 = (i+1)/segments * Math.PI*2;
                lines.push(Math.cos(t1)*r, Math.sin(t1)*r, 0);
                lines.push(Math.cos(t2)*r, Math.sin(t2)*r, 0);
            }
            // XZ Circle
            for(let i=0; i<segments; i++) {
                const t1 = i/segments * Math.PI*2;
                const t2 = (i+1)/segments * Math.PI*2;
                lines.push(Math.cos(t1)*r, 0, Math.sin(t1)*r);
                lines.push(Math.cos(t2)*r, 0, Math.sin(t2)*r);
            }
            // YZ Circle
            for(let i=0; i<segments; i++) {
                const t1 = i/segments * Math.PI*2;
                const t2 = (i+1)/segments * Math.PI*2;
                lines.push(0, Math.cos(t1)*r, Math.sin(t1)*r);
                lines.push(0, Math.cos(t2)*r, Math.sin(t2)*r);
            }
        } else if (type === 'Box') {
            const x = (settings.shape.boxX !== undefined ? settings.shape.boxX : 1.0) * 0.5;
            const y = (settings.shape.boxY !== undefined ? settings.shape.boxY : 1.0) * 0.5;
            const z = (settings.shape.boxZ !== undefined ? settings.shape.boxZ : 1.0) * 0.5;
            
            // Bottom
            lines.push(-x,-y,-z, x,-y,-z); lines.push(x,-y,-z, x,-y,z);
            lines.push(x,-y,z, -x,-y,z); lines.push(-x,-y,z, -x,-y,-z);
            // Top
            lines.push(-x,y,-z, x,y,-z); lines.push(x,y,-z, x,y,z);
            lines.push(x,y,z, -x,y,z); lines.push(-x,y,z, -x,y,-z);
            // Sides
            lines.push(-x,-y,-z, -x,y,-z); lines.push(x,-y,-z, x,y,-z);
            lines.push(x,-y,z, x,y,z); lines.push(-x,-y,z, -x,y,z);
        } else if (type === 'Cone') {
            const angle = settings.shape.angle !== undefined ? settings.shape.angle : 25.0;
            const h = 2.0; // Visual height guide
            const topR = r + Math.tan(angle * Math.PI / 180) * h;
            
            const segments = 32;
            // Base (XZ Plane)
            for(let i=0; i<segments; i++) {
                const t1 = i/segments * Math.PI*2;
                const t2 = (i+1)/segments * Math.PI*2;
                lines.push(Math.cos(t1)*r, 0, Math.sin(t1)*r);
                lines.push(Math.cos(t2)*r, 0, Math.sin(t2)*r);
            }
            // Top (XZ Plane at Y=h)
            for(let i=0; i<segments; i++) {
                const t1 = i/segments * Math.PI*2;
                const t2 = (i+1)/segments * Math.PI*2;
                lines.push(Math.cos(t1)*topR, h, Math.sin(t1)*topR);
                lines.push(Math.cos(t2)*topR, h, Math.sin(t2)*topR);
            }
            // Sides
            for(let i=0; i<4; i++) {
                const t = i/4 * Math.PI*2;
                lines.push(Math.cos(t)*r, 0, Math.sin(t)*r);
                lines.push(Math.cos(t)*topR, h, Math.sin(t)*topR);
            }
        } else if (type === 'Circle') {
             const segments = 32;
             const arcRad = arc * Math.PI / 180;
             for(let i=0; i<segments; i++) {
                 const t1 = i/segments * arcRad;
                 const t2 = (i+1)/segments * arcRad;
                 // XZ Plane
                 lines.push(Math.cos(t1)*r, 0, Math.sin(t1)*r);
                 lines.push(Math.cos(t2)*r, 0, Math.sin(t2)*r);
             }
             // Lines to center if arc < 360?
             if (arc < 360) {
                 lines.push(0,0,0, r,0,0);
                 lines.push(0,0,0, Math.cos(arcRad)*r, 0, Math.sin(arcRad)*r);
             }
        }
        
        this.drawLines(gl, lines);

        // Render Gizmo (Axis)
        this.renderGizmo(gl, vp, emitterPos, emitterRot, emitterScale);
    }

    drawLines(gl: WebGL2RenderingContext, lines: number[]) {
        if (lines.length === 0) return;
        gl.bindVertexArray(this.vao);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(lines), gl.DYNAMIC_DRAW);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
        gl.drawArrays(gl.LINES, 0, lines.length / 3);
        gl.bindVertexArray(null);
    }

    renderGizmo(gl: WebGL2RenderingContext, vp: number[], pos: number[], rot: number[], scale: number[]) {
        // Draw Axis Gizmo at Emitter Position
        // We need to draw 3 lines: Red (X), Green (Y), Blue (Z)
        // Length 1.5 * max(scale)
        
        const maxScale = Math.max(scale[0], scale[1], scale[2]);
        const len = 2.0 * maxScale;

        // Helper to multiply mat4 (column major)
        const mul = (a: number[], b: number[]) => {
            const out = new Array(16).fill(0);
            for(let i=0; i<4; i++) {
                for(let j=0; j<4; j++) {
                    let s = 0;
                    for(let k=0; k<4; k++) s += a[k*4+j] * b[i*4+k];
                    out[i*4+j] = s;
                }
            }
            return out;
        };

        // Rotation Matrix
        const rad = rot.map(d => d * Math.PI / 180);
        const cx = Math.cos(rad[0]), sx = Math.sin(rad[0]);
        const cy = Math.cos(rad[1]), sy = Math.sin(rad[1]);
        const cz = Math.cos(rad[2]), sz = Math.sin(rad[2]);
        
        const rotX = [1,0,0,0, 0,cx,sx,0, 0,-sx,cx,0, 0,0,0,1];
        const rotY = [cy,0,-sy,0, 0,1,0,0, sy,0,cy,0, 0,0,0,1];
        const rotZ = [cz,sz,0,0, -sz,cz,0,0, 0,0,1,0, 0,0,0,1];
        
        const rotMat = mul(rotZ, mul(rotY, rotX));

        // Translation
        const trans = [
            1,0,0,0,
            0,1,0,0,
            0,0,1,0,
            pos[0], pos[1], pos[2], 1
        ];

        // Model for Gizmo (Rotation + Translation, NO Scale for axis thickness, but Scale for length?)
        // Actually, we want the axis to rotate with the emitter.
        const model = mul(trans, rotMat);
        const mvp = mul(vp, model);

        gl.uniformMatrix4fv(gl.getUniformLocation(this.program, 'uMVP'), false, new Float32Array(mvp));

        // X Axis (Red)
        gl.uniform4f(gl.getUniformLocation(this.program, 'uColor'), 1.0, 0.0, 0.0, 1.0);
        this.drawLines(gl, [0,0,0, len,0,0]);

        // Y Axis (Green)
        gl.uniform4f(gl.getUniformLocation(this.program, 'uColor'), 0.0, 1.0, 0.0, 1.0);
        this.drawLines(gl, [0,0,0, 0,len,0]);

        // Z Axis (Blue)
        gl.uniform4f(gl.getUniformLocation(this.program, 'uColor'), 0.0, 0.0, 1.0, 1.0);
        this.drawLines(gl, [0,0,0, 0,0,len]);
    }
}

// --- SIMPLE CURVE EDITOR ---
const SimpleCurveEditor = ({ points, onChange }: { points: {x:number, y:number}[], onChange: (p: {x:number, y:number}[]) => void }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const [dragging, setDragging] = useState<number | null>(null);

    // Ensure we have at least 2 points
    const safePoints = points && points.length >= 2 ? points : [{x:0, y:0.5}, {x:1, y:0.5}];

    const sorted = [...safePoints].sort((a, b) => a.x - b.x);
    
    const pathD = sorted.map((p, i) => 
        `${i===0?'M':'L'} ${p.x * 100} ${(1-p.y) * 100}`
    ).join(' ');

    const handleMouseDown = (e: React.MouseEvent, index: number) => {
        e.stopPropagation(); // Stop React Flow drag
        e.preventDefault();
        setDragging(index);
    };

    const handleDoubleClick = (e: React.MouseEvent) => {
        if (!containerRef.current) return;
        const rect = containerRef.current.getBoundingClientRect();
        const x = (e.clientX - rect.left) / rect.width;
        const y = 1 - (e.clientY - rect.top) / rect.height;
        onChange([...safePoints, {x, y}].sort((a,b)=>a.x-b.x));
    };
    
    // Use global mouse up/move to handle drag better
    useEffect(() => {
        if (dragging !== null) {
            const onMove = (e: MouseEvent) => {
                if (!containerRef.current) return;
                const rect = containerRef.current.getBoundingClientRect();
                let x = (e.clientX - rect.left) / rect.width;
                let y = 1 - (e.clientY - rect.top) / rect.height;
                x = Math.max(0, Math.min(1, x));
                y = Math.max(0, Math.min(1, y));
                
                const newPoints = [...safePoints];
                newPoints[dragging] = { x, y };
                onChange(newPoints);
            };
            const onUp = () => {
                setDragging(null);
            };
            window.addEventListener('mousemove', onMove);
            window.addEventListener('mouseup', onUp);
            return () => {
                window.removeEventListener('mousemove', onMove);
                window.removeEventListener('mouseup', onUp);
            };
        }
    }, [dragging, safePoints, onChange]);

    return (
        <div className="flex flex-col gap-1">
            <div 
                ref={containerRef}
                className="w-full h-16 bg-zinc-900 rounded border border-zinc-700 relative select-none overflow-hidden group nodrag cursor-crosshair"
                onDoubleClick={handleDoubleClick}
            >
                {/* Background Lines */}
                <div className="absolute top-1/2 left-0 right-0 h-[1px] bg-zinc-800 pointer-events-none" style={{ borderTop: '1px dashed #333' }}></div>
                <div className="absolute top-1/4 left-0 right-0 h-[1px] bg-zinc-800/50 pointer-events-none"></div>
                <div className="absolute top-3/4 left-0 right-0 h-[1px] bg-zinc-800/50 pointer-events-none"></div>

                {/* The Curve Line (Stretched SVG) */}
                <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 100 100" preserveAspectRatio="none">
                    <path d={pathD} fill="none" stroke="#3b82f6" strokeWidth="2" vectorEffect="non-scaling-stroke" />
                </svg>

                {/* The Handles (HTML elements to avoid distortion) */}
                {safePoints.map((p, i) => (
                    <div 
                        key={i}
                        style={{ left: `${p.x * 100}%`, top: `${(1-p.y) * 100}%` }}
                        className={`absolute w-2.5 h-2.5 -ml-[5px] -mt-[5px] rounded-full border-2 border-blue-500 bg-white cursor-pointer hover:scale-125 transition-transform ${dragging===i ? 'scale-125' : ''}`}
                        onMouseDown={(e) => handleMouseDown(e, i)}
                        onDoubleClick={(e) => {
                            e.stopPropagation();
                            // Prevent deleting if only 2 points left
                            if (safePoints.length > 2) {
                                const newPoints = safePoints.filter((_, idx) => idx !== i);
                                onChange(newPoints);
                            }
                        }}
                        title="Double click to delete"
                    />
                ))}
            </div>
            <div className="flex justify-end">
                <button 
                    onClick={(e) => { e.stopPropagation(); onChange([{x:0, y:1}, {x:1, y:0}]); }}
                    className="text-[10px] text-zinc-500 hover:text-zinc-300 underline"
                >
                    Reset
                </button>
            </div>
        </div>
    );
};

// --- GPU SYSTEM CLASS ---

class GPUParticleSystem {
    gl: WebGL2RenderingContext;
    width: number; // Texture size (sqrt of particle count)
    count: number;
    
    // FBOs
    pos: { read: WebGLTexture, write: WebGLTexture, fboRead: WebGLFramebuffer, fboWrite: WebGLFramebuffer, swap: () => void };
    vel: { read: WebGLTexture, write: WebGLTexture, fboRead: WebGLFramebuffer, fboWrite: WebGLFramebuffer, swap: () => void };
    data: { read: WebGLTexture, write: WebGLTexture, fboRead: WebGLFramebuffer, fboWrite: WebGLFramebuffer, swap: () => void };
    col: { read: WebGLTexture, write: WebGLTexture, fboRead: WebGLFramebuffer, fboWrite: WebGLFramebuffer, swap: () => void }; // New: Color FBO
    rot: { read: WebGLTexture, write: WebGLTexture, fboRead: WebGLFramebuffer, fboWrite: WebGLFramebuffer, swap: () => void }; // New: Rotation FBO (3D)
    
    // Resources
    gradientTex: WebGLTexture;
    sizeCurveTex: WebGLTexture;
    shapeTex: WebGLTexture; // New: Image Texture
    particleTex: WebGLTexture; // New: Particle Appearance Texture
    quadBuffer: WebGLBuffer; // Full screen quad for update
    particleBuffer: WebGLBuffer; // Instanced buffer for rendering
    
    // VAOs
    updateVAO: WebGLVertexArrayObject;
    renderVAO: WebGLVertexArrayObject;
    
    // Programs
    updateProgram: WebGLProgram;
    renderProgram: WebGLProgram;
    debugRenderer: ShapeDebugRenderer;

    // Output (HDR)
    outputFBO: WebGLFramebuffer;
    outputTex: WebGLTexture;
    lastWidth: number = 0;
    lastHeight: number = 0;

    constructor(gl: WebGL2RenderingContext, count: number = 1024) {
        this.gl = gl;
        this.count = count;
        
        // Find square texture size
        this.width = Math.ceil(Math.sqrt(count));
        
        if (!gl.getExtension('EXT_color_buffer_float')) console.warn("Float texture not supported");
        if (!gl.getExtension('OES_texture_float_linear')) console.warn("Float texture linear filtering not supported");

        this.debugRenderer = new ShapeDebugRenderer(gl);

        // Output FBO (HDR)
        this.outputTex = gl.createTexture()!;
        this.outputFBO = gl.createFramebuffer()!;
        // Initial size 1x1, will resize in render
        gl.bindTexture(gl.TEXTURE_2D, this.outputTex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, 1, 1, 0, gl.RGBA, gl.FLOAT, null);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.outputFBO);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.outputTex, 0);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);

        // Init Double FBOs
        this.pos = this.createFBO();
        this.vel = this.createFBO();
        this.data = this.createFBO();
        this.col = this.createFBO(); // Init Color FBO
        this.rot = this.createFBO(); // Init Rotation FBO

        // Init Pos (w = -1 for lastEmissionID)
        const initialPos = new Float32Array(this.width * this.width * 4);
        for(let i=0; i<this.width*this.width; i++) {
            initialPos[i*4 + 3] = -1.0; // lastEmissionID
        }
        gl.bindTexture(gl.TEXTURE_2D, this.pos.read);
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, this.width, this.width, gl.RGBA, gl.FLOAT, initialPos);

        // Init Data (Seeds)
        const initialData = new Float32Array(this.width * this.width * 4);
        for(let i=0; i<this.width*this.width; i++) {
            initialData[i*4 + 0] = 0.0; // Age
            initialData[i*4 + 1] = -1.0; // Life (Start dead)
            initialData[i*4 + 2] = 1.0; // Size
            initialData[i*4 + 3] = i; // ID (Sequential)
        }
        
        gl.bindTexture(gl.TEXTURE_2D, this.data.read);
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, this.width, this.width, gl.RGBA, gl.FLOAT, initialData);

        // Init Color (White)
        const initialColor = new Float32Array(this.width * this.width * 4);
        initialColor.fill(1.0);
        gl.bindTexture(gl.TEXTURE_2D, this.col.read);
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, this.width, this.width, gl.RGBA, gl.FLOAT, initialColor);

        // Init Rotation (Zero)
        const initialRot = new Float32Array(this.width * this.width * 4);
        initialRot.fill(0.0);
        gl.bindTexture(gl.TEXTURE_2D, this.rot.read);
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, this.width, this.width, gl.RGBA, gl.FLOAT, initialRot);

        // Buffers
        this.quadBuffer = gl.createBuffer()!;
        gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, -1,1, 1,-1, 1,1]), gl.STATIC_DRAW);

        // Instance UVs
        const uvs = new Float32Array(this.count * 2);
        for(let i=0; i<this.count; i++) {
            const x = (i % this.width) / this.width + (0.5/this.width);
            const y = Math.floor(i / this.width) / this.width + (0.5/this.width);
            uvs[i*2] = x;
            uvs[i*2+1] = y;
        }
        this.particleBuffer = gl.createBuffer()!;
        gl.bindBuffer(gl.ARRAY_BUFFER, this.particleBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, uvs, gl.STATIC_DRAW);

        this.gradientTex = gl.createTexture()!;
        gl.bindTexture(gl.TEXTURE_2D, this.gradientTex);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);

        this.sizeCurveTex = gl.createTexture()!;
        gl.bindTexture(gl.TEXTURE_2D, this.sizeCurveTex);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);

        this.shapeTex = gl.createTexture()!;
        gl.bindTexture(gl.TEXTURE_2D, this.shapeTex);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        // Set a default 1x1 white pixel
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([255,255,255,255]));

        this.particleTex = gl.createTexture()!;
        gl.bindTexture(gl.TEXTURE_2D, this.particleTex);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        // Set a default 1x1 white pixel
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([255,255,255,255]));

        // Programs
        this.updateProgram = this.createProgram(VERT, UPDATE_FRAG);
        this.renderProgram = this.createProgram(RENDER_VERT, RENDER_FRAG);

        // --- SETUP VAOs ---
        
        // 1. Update VAO (Draws Quad)
        this.updateVAO = gl.createVertexArray()!;
        gl.bindVertexArray(this.updateVAO);
        
        const posLoc = gl.getAttribLocation(this.updateProgram, 'position');
        gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
        gl.enableVertexAttribArray(posLoc);
        gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);
        
        gl.bindVertexArray(null);

        // 2. Render VAO (Draws Instanced Particles)
        this.renderVAO = gl.createVertexArray()!;
        gl.bindVertexArray(this.renderVAO);
        
        // Instance UVs (Location 0)
        gl.bindBuffer(gl.ARRAY_BUFFER, this.particleBuffer);
        const uvLoc = 0; // Fixed location in RENDER_VERT
        gl.enableVertexAttribArray(uvLoc);
        gl.vertexAttribPointer(uvLoc, 2, gl.FLOAT, false, 0, 0);
        gl.vertexAttribDivisor(uvLoc, 1); // Per Instance

        // Quad Verts (Location 1)
        gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
        const qLoc = 1; // Fixed location in RENDER_VERT
        gl.enableVertexAttribArray(qLoc);
        gl.vertexAttribPointer(qLoc, 2, gl.FLOAT, false, 0, 0);
        gl.vertexAttribDivisor(qLoc, 0); // Per Vertex

        gl.bindVertexArray(null);
    }

    createProgram(vsSrc: string, fsSrc: string) {
        const gl = this.gl;
        const vs = gl.createShader(gl.VERTEX_SHADER)!;
        gl.shaderSource(vs, vsSrc);
        gl.compileShader(vs);
        if(!gl.getShaderParameter(vs, gl.COMPILE_STATUS)) console.error(gl.getShaderInfoLog(vs));
        
        const fs = gl.createShader(gl.FRAGMENT_SHADER)!;
        gl.shaderSource(fs, fsSrc);
        gl.compileShader(fs);
        if(!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) console.error(gl.getShaderInfoLog(fs));
        
        const p = gl.createProgram()!;
        gl.attachShader(p, vs);
        gl.attachShader(p, fs);
        gl.linkProgram(p);
        return p;
    }

    createFBO() {
        const gl = this.gl;
        const w = this.width;
        
        const createTex = () => {
            const t = gl.createTexture()!;
            gl.bindTexture(gl.TEXTURE_2D, t);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, w, w, 0, gl.RGBA, gl.FLOAT, null);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
            return t;
        };

        const t1 = createTex();
        const t2 = createTex();
        const f1 = gl.createFramebuffer()!;
        const f2 = gl.createFramebuffer()!;
        
        gl.bindFramebuffer(gl.FRAMEBUFFER, f1);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t1, 0);
        
        gl.bindFramebuffer(gl.FRAMEBUFFER, f2);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t2, 0);

        return {
            read: t1, write: t2, fboRead: f1, fboWrite: f2,
            swap: function() {
                let t = this.read; this.read = this.write; this.write = t;
                let f = this.fboRead; this.fboRead = this.fboWrite; this.fboWrite = f;
            }
        };
    }

    updateGradient(stops: any[], alphaStops: any[]) {
        const gl = this.gl;
        const raw = generateGradientTexture(stops, 128, alphaStops);
        gl.bindTexture(gl.TEXTURE_2D, this.gradientTex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 128, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, raw.data);
    }
    
    // updateSizeCurve REMOVED - using Uniforms directly in render loop

    updateShapeTexture(source: HTMLImageElement | HTMLCanvasElement | { width: number, height: number, data: Float32Array } | null) {
        const gl = this.gl;
        gl.bindTexture(gl.TEXTURE_2D, this.shapeTex);
        // gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true); // Don't flip Y generally, control it in shader or per source
        // For Image element, we usually need flip. For Canvas (Dynamic Texture from other nodes), it depends.
        // WebGL to WebGL texture transfer via canvas is usually upside down if not flipped.
        // Let's try flipping Y for now, as most inputs are images or standard canvases.
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true); 
        
        if (source) {
             if ('data' in source && source.data instanceof Float32Array) {
                 gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, source.width, source.height, 0, gl.RGBA, gl.FLOAT, source.data);
             } else {
                 gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source as HTMLImageElement | HTMLCanvasElement);
             }
        } else {
             gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([255,255,255,255]));
        }
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false); // Reset
    }

    updateParticleTexture(source: HTMLImageElement | HTMLCanvasElement | { width: number, height: number, data: Float32Array } | null) {
        const gl = this.gl;
        gl.bindTexture(gl.TEXTURE_2D, this.particleTex);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
        
        if (source) {
             if ('data' in source && source.data instanceof Float32Array) {
                 gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, source.width, source.height, 0, gl.RGBA, gl.FLOAT, source.data);
             } else {
                 gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source as HTMLImageElement | HTMLCanvasElement);
             }
        } else {
             gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([255,255,255,255]));
        }
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    }

    update(dt: number, time: number, globalTime: number, settings: any, randomSeed: number = 0.0, loopStartEmitted: number = 0.0) {
        const gl = this.gl;
        const w = this.width;
        
        gl.viewport(0, 0, w, w);
        gl.useProgram(this.updateProgram);

        // Uniforms
        const u = (name: string, v: any, type: 'f'|'i'|'v3' = 'f') => {
            const loc = gl.getUniformLocation(this.updateProgram, name);
            if (loc) {
                if (type === 'i') gl.uniform1i(loc, v);
                else if (type === 'v3') gl.uniform3fv(loc, v);
                else gl.uniform1f(loc, v);
            }
        };

        u('uTime', time);
        u('uGlobalTime', globalTime);
        u('uRandomSeed', randomSeed);
        u('uLoopStartEmitted', loopStartEmitted);
        u('uDt', dt);
        // Gravity
        const grav = settings.main.gravityModifier;
        let gravMode = 0;
        let gravConst = 0;
        let gravMin = 0;
        let gravMax = 0;
        
        if (typeof grav === 'number') {
            gravConst = grav;
        } else if (grav && typeof grav === 'object') {
            gravMode = grav.mode === 'Random' ? 1 : 0;
            gravConst = grav.constant || 0;
            gravMin = grav.constantMin || 0;
            gravMax = grav.constantMax || 0;
        }

        u('uGravityMode', gravMode, 'i');
        u('uGravityConst', gravConst, 'f');
        u('uGravityMin', gravMin, 'f');
        u('uGravityMax', gravMax, 'f');
        u('uGravityDir', [0, -1, 0], 'v3');
        const getMinMax = (prop: any, def: number) => {
            if (prop === undefined) return [def, def];
            if (typeof prop === 'number') return [prop, prop];
            if (prop.mode === 'Constant') return [prop.constant ?? def, prop.constant ?? def];
            return [prop.constantMin ?? def, prop.constantMax ?? def];
        };

        const [lMin, lMax] = getMinMax(settings.main.startLifetime, 5.0);
        u('uStartLifetimeMin', lMin);
        u('uStartLifetimeMax', lMax);

        const [sMin, sMax] = getMinMax(settings.main.startSpeed, 5.0);
        u('uStartSpeedMin', sMin);
        u('uStartSpeedMax', sMax);

        const [rMin, rMax] = getMinMax(settings.main.startRotation, 0.0);
        u('uStartRotationMin', rMin);
        u('uStartRotationMax', rMax);

        const [szMin, szMax] = getMinMax(settings.main.startSize, 0.2);
        u('uStartSizeMin', szMin);
        u('uStartSizeMax', szMax);
        u('uLooping', settings.main.looping !== false ? 1 : 0, 'i');
        u('uMaxParticles', this.count); // Pass Max Particles
        u('uSimulationSpace', settings.main.simulationSpace === 'World' ? 1 : 0, 'i');

        // Emission
        // Calc emitted count
        // In real app, we accumulate this in JS.
        u('uEmittedCount', settings._emittedCount || 0.0);

        // Force ShapeType to Image (5) if override enabled (Input connected)
        const isInputActive = settings._shapeTexEnabledOverride === 1;
        const shapeTypeIndex = isInputActive ? 5 : ['Sphere','Cone','Box','Circle','Edge','Image'].indexOf(settings.shape.shapeType);
        
        u('uShapeType', shapeTypeIndex, 'i');
        if (settings.shape.shapeType === 'Mesh' && !isInputActive) u('uShapeType', 2, 'i'); // Fallback Mesh to Box for now
        
        u('uRadius', settings.shape.radius !== undefined ? settings.shape.radius : 1.0);
        u('uAngle', settings.shape.angle !== undefined ? settings.shape.angle : 25.0);
        u('uBoxSize', [
            settings.shape.boxX !== undefined ? settings.shape.boxX : 1.0, 
            settings.shape.boxY !== undefined ? settings.shape.boxY : 1.0, 
            settings.shape.boxZ !== undefined ? settings.shape.boxZ : 1.0
        ], 'v3');
        u('uEmitterPos', [
            settings.shape.positionX !== undefined ? settings.shape.positionX : 0.0, 
            settings.shape.positionY !== undefined ? settings.shape.positionY : 0.0, 
            settings.shape.positionZ !== undefined ? settings.shape.positionZ : 0.0
        ], 'v3');
        u('uEmitterRot', [
            settings.shape.rotationX !== undefined ? settings.shape.rotationX : 0.0, 
            settings.shape.rotationY !== undefined ? settings.shape.rotationY : 0.0, 
            settings.shape.rotationZ !== undefined ? settings.shape.rotationZ : 0.0
        ], 'v3');
        u('uArc', settings.shape.arc !== undefined ? settings.shape.arc : 360.0);
        u('uRadiusThickness', settings.shape.radiusThickness !== undefined ? settings.shape.radiusThickness : 1.0);
        u('uLength', settings.shape.length !== undefined ? settings.shape.length : 5.0);
        u('uRandomizeDir', settings.shape.randomizeDirection !== undefined ? settings.shape.randomizeDirection : 0.0);
        u('uSpherizeDir', settings.shape.spherizeDirection !== undefined ? settings.shape.spherizeDirection : 0.0);
        u('uEmissionThreshold', settings.shape.emissionThreshold !== undefined ? settings.shape.emissionThreshold : 0.0);
        u('uShapeTexEnabled', settings._shapeTexEnabledOverride !== undefined ? settings._shapeTexEnabledOverride : ((settings.shape.image && settings.shape.shapeType === 'Image') ? 1 : 0), 'i');
        
        // Velocity
        const velMod = settings.velocity;
        const useVel = velMod && velMod.enabled;
        u('uLinearVel', useVel ? [
            velMod.linearX !== undefined ? velMod.linearX : 0, 
            velMod.linearY !== undefined ? velMod.linearY : 0, 
            velMod.linearZ !== undefined ? velMod.linearZ : 0
        ] : [0,0,0], 'v3');
        
        u('uOrbitalVel', useVel ? [
            velMod.orbitalX !== undefined ? velMod.orbitalX : 0, 
            velMod.orbitalY !== undefined ? velMod.orbitalY : 0, 
            velMod.orbitalZ !== undefined ? velMod.orbitalZ : 0
        ] : [0,0,0], 'v3');
        
        u('uOffsetVel', useVel ? [
            velMod.offsetX !== undefined ? velMod.offsetX : 0, 
            velMod.offsetY !== undefined ? velMod.offsetY : 0, 
            velMod.offsetZ !== undefined ? velMod.offsetZ : 0
        ] : [0,0,0], 'v3');
        
        u('uRadialVel', useVel ? (velMod.radial !== undefined ? velMod.radial : 0) : 0);
        
        // Rotation
        const rotMod = settings.rotation;
        const rotEnabled = rotMod && rotMod.enabled;
        const separateAxes = rotEnabled && rotMod.separateAxes;
        
        u('uRotationSeparateAxes', separateAxes ? 1 : 0, 'i');
        
        let angVelMin = [0,0,0];
        let angVelMax = [0,0,0];
        
        if (rotEnabled) {
            if (separateAxes) {
                const [xMin, xMax] = getMinMax(rotMod.angularVelocityX, 0);
                const [yMin, yMax] = getMinMax(rotMod.angularVelocityY, 0);
                const [zMin, zMax] = getMinMax(rotMod.angularVelocityZ, 45);
                angVelMin = [xMin, yMin, zMin];
                angVelMax = [xMax, yMax, zMax];
            } else {
                const [vMin, vMax] = getMinMax(rotMod.angularVelocity, 45);
                // If single axis, we usually map it to Z (2D rotation)
                angVelMin = [0, 0, vMin];
                angVelMax = [0, 0, vMax];
            }
        }
        
        u('uAngularVelMin', angVelMin, 'v3');
        u('uAngularVelMax', angVelMax, 'v3');
        
        // Limit Velocity
        const limitVelMod = settings.limitVelocity;
        const limitVelEnabled = limitVelMod && limitVelMod.enabled;
        u('uDrag', limitVelEnabled ? (limitVelMod.drag !== undefined ? limitVelMod.drag : 0.0) : 0.0);
        u('uDampen', limitVelEnabled ? (limitVelMod.dampen !== undefined ? limitVelMod.dampen : 0.0) : 0.0);

        // Noise
        const noiseMod = settings.noise;
        const noiseEnabled = noiseMod && noiseMod.enabled;
        u('uNoiseStrength', noiseEnabled ? (noiseMod.strength !== undefined ? noiseMod.strength : 1.0) : 0.0);
        u('uNoiseFreq', noiseMod.frequency !== undefined ? noiseMod.frequency : 0.5);
        u('uNoiseScrollSpeed', noiseMod.scrollSpeed !== undefined ? noiseMod.scrollSpeed : 0.5);
        u('uNoiseOctaves', noiseMod.octaves !== undefined ? noiseMod.octaves : 1, 'i');
        u('uNoisePositionAmount', noiseMod.positionAmount !== undefined ? noiseMod.positionAmount : 1.0);
        u('uNoiseRotationAmount', noiseMod.rotationAmount !== undefined ? noiseMod.rotationAmount : 0.0);
        u('uNoiseSizeAmount', noiseMod.sizeAmount !== undefined ? noiseMod.sizeAmount : 0.0);

        // Bind textures
        gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.pos.read); gl.uniform1i(gl.getUniformLocation(this.updateProgram, 'uPos'), 0);
        gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.vel.read); gl.uniform1i(gl.getUniformLocation(this.updateProgram, 'uVel'), 1);
        gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, this.data.read); gl.uniform1i(gl.getUniformLocation(this.updateProgram, 'uData'), 2);
        gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, this.col.read); gl.uniform1i(gl.getUniformLocation(this.updateProgram, 'uCol'), 3);
        gl.activeTexture(gl.TEXTURE4); gl.bindTexture(gl.TEXTURE_2D, this.shapeTex); gl.uniform1i(gl.getUniformLocation(this.updateProgram, 'uShapeTex'), 4);
        gl.activeTexture(gl.TEXTURE5); gl.bindTexture(gl.TEXTURE_2D, this.rot.read); gl.uniform1i(gl.getUniformLocation(this.updateProgram, 'uRot'), 5);

        // Draw to Write FBOs
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.pos.fboWrite);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, this.vel.write, 0);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT2, gl.TEXTURE_2D, this.data.write, 0);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT3, gl.TEXTURE_2D, this.col.write, 0); // Attach Col FBO
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT4, gl.TEXTURE_2D, this.rot.write, 0); // Attach Rot FBO
        
        gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1, gl.COLOR_ATTACHMENT2, gl.COLOR_ATTACHMENT3, gl.COLOR_ATTACHMENT4]);
        
        // Use VAO
        gl.bindVertexArray(this.updateVAO);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
        gl.bindVertexArray(null);

        // Cleanup
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, null, 0);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT2, gl.TEXTURE_2D, null, 0);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT3, gl.TEXTURE_2D, null, 0);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT4, gl.TEXTURE_2D, null, 0);

        this.pos.swap();
        this.vel.swap();
        this.data.swap();
        this.col.swap();
        this.rot.swap();
    }

    render(view: number[], proj: number[], settings: any, expandedModules: any) {
        const gl = this.gl;
        
        // Resize Output FBO if needed
        if (gl.canvas.width !== this.lastWidth || gl.canvas.height !== this.lastHeight) {
             gl.bindTexture(gl.TEXTURE_2D, this.outputTex);
             gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, gl.canvas.width, gl.canvas.height, 0, gl.RGBA, gl.FLOAT, null);
             this.lastWidth = gl.canvas.width;
             this.lastHeight = gl.canvas.height;
        }

        // Render to HDR FBO
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.outputFBO);
        gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
        
        // Clear to transparent black for compositing
        gl.clearColor(0.0, 0.0, 0.0, 0.0);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        
        // --- Debug Gizmo ---
        if (expandedModules['shape'] && settings.shape && settings.shape.enabled) {
            const emitterPos = [settings.shape.positionX||0, settings.shape.positionY||0, settings.shape.positionZ||0];
            const emitterRot = [settings.shape.rotationX||0, settings.shape.rotationY||0, settings.shape.rotationZ||0];
            const emitterScale = [settings.shape.scaleX!==undefined?settings.shape.scaleX:1, settings.shape.scaleY!==undefined?settings.shape.scaleY:1, settings.shape.scaleZ!==undefined?settings.shape.scaleZ:1];
            this.debugRenderer.render(view, proj, settings, emitterPos, emitterRot, emitterScale);
        }
        
        gl.disable(gl.DEPTH_TEST); 
        gl.enable(gl.BLEND);
        // Blending Mode
        const blending = settings.renderer?.blending || 'Additive';
        
        // Reset Blend Equation to Add by default
        gl.blendEquation(gl.FUNC_ADD);

        if (blending === 'Alpha') {
            // Standard Alpha Blending (Premultiplied)
            gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
        } else if (blending === 'Max') {
            // Max Blending
            gl.blendEquation(gl.MAX);
            gl.blendFunc(gl.ONE, gl.ONE); // Factors don't matter much for MAX but good to set
        } else if (blending === 'Multiply') {
            // Multiply Blending
            // Dst = Dst * Src
            // Standard Multiply: gl.DST_COLOR, gl.ZERO
            // But we have premultiplied alpha...
            // Let's try standard multiply
            gl.blendFunc(gl.DST_COLOR, gl.ZERO);
        } else {
            // Additive (Premultiplied)
            gl.blendFunc(gl.ONE, gl.ONE);
        }

        gl.useProgram(this.renderProgram);

        const u = (name: string, v: any, type: 'f'|'i'|'v3' = 'f') => {
            const loc = gl.getUniformLocation(this.renderProgram, name);
            if (loc) {
                if (v.length === 16) gl.uniformMatrix4fv(loc, false, v);
                else if (type === 'i') gl.uniform1i(loc, v);
                else if (type === 'v3') gl.uniform3fv(loc, v);
                else if (typeof v === 'number') gl.uniform1f(loc, v);
                else gl.uniform1i(loc, v);
            }
        };

        u('uView', view);
        u('uProjection', proj);
        u('uSizeCurveEnabled', (settings.size && settings.size.enabled) ? 1 : 0, 'i');
        u('uSimulationSpace', settings.main.simulationSpace === 'World' ? 1 : 0, 'i');
        u('uShapeTexEnabled', settings._shapeTexEnabledOverride !== undefined ? settings._shapeTexEnabledOverride : ((settings.shape.image && settings.shape.shapeType === 'Image') ? 1 : 0), 'i');
        
        // Material Type
        const matType = settings._materialOverride || settings.renderer.material || 'Circle';
        let matTypeIdx = 0;
        if (matType === 'Soft Circle') matTypeIdx = 1;
        else if (matType === 'Square') matTypeIdx = 2;
        else if (matType === 'Custom') matTypeIdx = 3;
        u('uMaterialType', matTypeIdx, 'i');

        // New Uniforms for Stretched Billboard
        const renderMode = settings.renderer.renderMode || 'Billboard';
        let renderModeIdx = 0;
        if (renderMode === 'Stretched Billboard') renderModeIdx = 1;
        else if (renderMode === 'Horizontal Billboard') renderModeIdx = 2;
        else if (renderMode === 'Vertical Billboard') renderModeIdx = 3;
        
        u('uRenderMode', renderModeIdx, 'i');
        
        // Render Alignment
        const renderAlignment = settings.renderer.renderAlignment || 'View';
        let renderAlignmentIdx = 0;
        if (renderAlignment === 'World') renderAlignmentIdx = 1;
        else if (renderAlignment === 'Local') renderAlignmentIdx = 2;
        u('uRenderAlignment', renderAlignmentIdx, 'i');
        
        // Emitter Rotation for Local Alignment
        u('uEmitterRot', [
            settings.shape.rotationX !== undefined ? settings.shape.rotationX : 0.0, 
            settings.shape.rotationY !== undefined ? settings.shape.rotationY : 0.0, 
            settings.shape.rotationZ !== undefined ? settings.shape.rotationZ : 0.0
        ], 'v3');

        u('uLengthScale', settings.renderer.lengthScale !== undefined ? settings.renderer.lengthScale : 2.0);
        u('uSpeedScale', settings.renderer.speedScale !== undefined ? settings.renderer.speedScale : 0.0);
        u('uMinParticleSize', settings.renderer.minParticleSize !== undefined ? settings.renderer.minParticleSize : 0.0);
        u('uMaxParticleSize', settings.renderer.maxParticleSize !== undefined ? settings.renderer.maxParticleSize : 1.0);

        u('uBoxSize', [
            settings.shape.boxX !== undefined ? settings.shape.boxX : 1.0, 
            settings.shape.boxY !== undefined ? settings.shape.boxY : 1.0, 
            settings.shape.boxZ !== undefined ? settings.shape.boxZ : 1.0
        ], 'v3');

        // Pass Orbital Params for Alignment
        const velMod = settings.velocity;
        const useVel = velMod && velMod.enabled;
        u('uOrbitalVel', useVel ? [
            velMod.orbitalX !== undefined ? velMod.orbitalX : 0, 
            velMod.orbitalY !== undefined ? velMod.orbitalY : 0, 
            velMod.orbitalZ !== undefined ? velMod.orbitalZ : 0
        ] : [0,0,0], 'v3');
        
        u('uOffsetVel', useVel ? [
            velMod.offsetX !== undefined ? velMod.offsetX : 0, 
            velMod.offsetY !== undefined ? velMod.offsetY : 0, 
            velMod.offsetZ !== undefined ? velMod.offsetZ : 0
        ] : [0,0,0], 'v3');

        u('uEmitterPos', [
            settings.shape.positionX !== undefined ? settings.shape.positionX : 0.0, 
            settings.shape.positionY !== undefined ? settings.shape.positionY : 0.0, 
            settings.shape.positionZ !== undefined ? settings.shape.positionZ : 0.0
        ], 'v3');

        // Pass Curve Points as Uniform Array
        if (settings.size && settings.size.size && Array.isArray(settings.size.size)) {
             const pts = settings.size.size;
             // Sort
             const sorted = [...pts].sort((a:any,b:any)=>a.x-b.x);
             // Ensure 2 points min if empty?
             if (sorted.length === 0) { sorted.push({x:0, y:1}); sorted.push({x:1, y:1}); }
             
             // Flatten to Float32Array [x0,y0, x1,y1...]
             const flat = new Float32Array(32); // 16 points * 2
             for(let i=0; i<Math.min(16, sorted.length); i++) {
                 flat[i*2] = sorted[i].x;
                 flat[i*2+1] = sorted[i].y;
             }
             const loc = gl.getUniformLocation(this.renderProgram, 'uSizeCurvePoints');
             if(loc) gl.uniform2fv(loc, flat);
             
             u('uSizeCurvePointCount', Math.min(16, sorted.length), 'i');
        } else {
             u('uSizeCurvePointCount', 0, 'i');
        }

        gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.pos.read); gl.uniform1i(gl.getUniformLocation(this.renderProgram, 'uPos'), 0);
        gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.vel.read); gl.uniform1i(gl.getUniformLocation(this.renderProgram, 'uVel'), 1);
        gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, this.data.read); gl.uniform1i(gl.getUniformLocation(this.renderProgram, 'uData'), 2);
        gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, this.gradientTex); gl.uniform1i(gl.getUniformLocation(this.renderProgram, 'uGradient'), 3);
        // TEXTURE4 (SizeCurve) REMOVED -> Now used for Rotation
        gl.activeTexture(gl.TEXTURE4); gl.bindTexture(gl.TEXTURE_2D, this.rot.read); gl.uniform1i(gl.getUniformLocation(this.renderProgram, 'uRot'), 4);
        gl.activeTexture(gl.TEXTURE5); gl.bindTexture(gl.TEXTURE_2D, this.col.read); gl.uniform1i(gl.getUniformLocation(this.renderProgram, 'uCol'), 5); 
        gl.activeTexture(gl.TEXTURE6); gl.bindTexture(gl.TEXTURE_2D, this.particleTex); gl.uniform1i(gl.getUniformLocation(this.renderProgram, 'uParticleTexture'), 6);

        // Use VAO
        gl.bindVertexArray(this.renderVAO);
        gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, this.count);
        gl.bindVertexArray(null);
        
        gl.disable(gl.BLEND);

        // Blit to Screen (Preview)
        // Note: blitFramebuffer might fail if formats don't match (RGBA32F vs RGBA8) on some implementations
        // Or if multisampling differs.
        // Safe fallback: Draw a fullscreen quad sampling the texture.
        
        // Try Blit first? No, Blit from Float to Byte is often restricted.
        // Let's use a simple draw call to copy texture to screen.
        
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
        gl.disable(gl.BLEND);
        
        // We can reuse updateProgram or create a simple copy program.
        // Actually we have updateVAO which is a quad.
        // Let's make a simple copy shader or reuse something.
        // For now, let's just try to bind the output texture and draw it.
        
        // Quick fix: Just render directly to screen IF we are previewing?
        // But we need the FBO for HDR output.
        // So we MUST copy FBO -> Screen.
        
        // Let's use a simple shader to draw the texture.
        if (!this.copyProgram) {
            const VS = `#version 300 es
            layout(location=0) in vec2 aPos;
            out vec2 vUv;
            void main() {
                vUv = aPos * 0.5 + 0.5;
                gl_Position = vec4(aPos, 0.0, 1.0);
            }`;
            const FS = `#version 300 es
            precision highp float;
            in vec2 vUv;
            uniform sampler2D uTex;
            out vec4 fragColor;
            void main() {
                fragColor = texture(uTex, vUv);
                // Simple Tone Mapping for preview?
                // fragColor.rgb = fragColor.rgb / (fragColor.rgb + vec3(1.0));
                // Gamma correction
                // fragColor.rgb = pow(fragColor.rgb, vec3(1.0/2.2));
            }`;
            this.copyProgram = this.createProgram(VS, FS);
        }
        
        gl.useProgram(this.copyProgram);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.outputTex);
        gl.uniform1i(gl.getUniformLocation(this.copyProgram, 'uTex'), 0);
        
        gl.bindVertexArray(this.updateVAO); // Reusing quad VAO
        gl.drawArrays(gl.TRIANGLES, 0, 6);
        gl.bindVertexArray(null);
    }

    copyProgram: WebGLProgram | null = null;

    getHDRData() {
        const gl = this.gl;
        const w = gl.canvas.width;
        const h = gl.canvas.height;
        const data = new Float32Array(w * h * 4);
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.outputFBO);
        gl.readPixels(0, 0, w, h, gl.RGBA, gl.FLOAT, data);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        return { width: w, height: h, data };
    }

    reset() {
        const gl = this.gl;
        
        // Reset Pos (w = -1 for lastEmissionID)
        const initialPos = new Float32Array(this.width * this.width * 4);
        for(let i=0; i<this.width*this.width; i++) {
            initialPos[i*4 + 3] = -1.0; // lastEmissionID
        }
        // Reset both read/write to be safe
        gl.bindTexture(gl.TEXTURE_2D, this.pos.read);
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, this.width, this.width, gl.RGBA, gl.FLOAT, initialPos);
        gl.bindTexture(gl.TEXTURE_2D, this.pos.write);
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, this.width, this.width, gl.RGBA, gl.FLOAT, initialPos);

        // Reset Data (Seeds)
        const initialData = new Float32Array(this.width * this.width * 4);
        for(let i=0; i<this.width*this.width; i++) {
            initialData[i*4 + 0] = 0.0; // Age
            initialData[i*4 + 1] = -1.0; // Life (Start dead)
            initialData[i*4 + 2] = 1.0; // Size
            initialData[i*4 + 3] = i; // ID (Sequential)
        }
        gl.bindTexture(gl.TEXTURE_2D, this.data.read);
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, this.width, this.width, gl.RGBA, gl.FLOAT, initialData);
        gl.bindTexture(gl.TEXTURE_2D, this.data.write);
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, this.width, this.width, gl.RGBA, gl.FLOAT, initialData);
        
        // Reset Vel (Optional but good)
        const initialVel = new Float32Array(this.width * this.width * 4);
        gl.bindTexture(gl.TEXTURE_2D, this.vel.read);
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, this.width, this.width, gl.RGBA, gl.FLOAT, initialVel);
        gl.bindTexture(gl.TEXTURE_2D, this.vel.write);
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, this.width, this.width, gl.RGBA, gl.FLOAT, initialVel);
    }
}

const ParticleSystemNode = memo(({ id, data, selected }: NodeProps<NodeData>) => {
    const { t } = useTranslation();
    const { setNodes, deleteElements, getNode } = useReactFlow();
    
    // Use custom selectors instead of useNodes/useEdges to avoid re-renders on drag
    const nodes = useOptimizedNodes();
    const edges = useStore(edgesSelector, deepEqual);
    
    // Initialize module data from node data or defaults
    const [modules, setModules] = useState<ModuleData[]>(data.settings?.modules || DEFAULT_MODULE_DATA);
    const [expandedModules, setExpandedModules] = useState<Record<string, boolean>>({'main': true, 'renderer': true});
    const [isRunning, setIsRunning] = useState(true);
    const [isPerspective, setIsPerspective] = useState(data.settings?.camera?.isPerspective ?? true);
    const [showGizmos, setShowGizmos] = useState(false); // Default false to avoid pollution
    
    // Migration: Ensure new properties exist in old nodes
    useEffect(() => {
        setModules(prev => {
            let hasChanges = false;
            const next = prev.map(m => {
                const def = DEFAULT_MODULE_DATA.find(d => d.id === m.id);
                if (!def) return m;
                
                const newProps = { ...m.properties };
                let modChanged = false;
                
                for (const [k, v] of Object.entries(def.properties)) {
                    if (newProps[k] === undefined) {
                        newProps[k] = v;
                        modChanged = true;
                    } else if (k === 'gravityModifier' && typeof newProps[k] === 'number') {
                        newProps[k] = { mode: 'Constant', constant: newProps[k], constantMin: 0.0, constantMax: 1.0 };
                        modChanged = true;
                    } else if (k === 'autoRandomSeed' && newProps[k] === undefined) {
                        newProps[k] = true;
                        modChanged = true;
                    } else if (k === 'seed' && newProps[k] === undefined) {
                        newProps[k] = 0;
                        modChanged = true;
                    }
                }
                
                if (modChanged) {
                    hasChanges = true;
                    return { ...m, properties: newProps };
                }
                return m;
            });
            return hasChanges ? next : prev;
        });
    }, []);

    const canvasRef = useRef<HTMLCanvasElement>(null);
    const systemRef = useRef<GPUParticleSystem | null>(null);
    const requestRef = useRef<number>();
    const emittedCountRef = useRef<number>(0.0);
    const loopStartEmittedRef = useRef<number>(0.0); // Track emitted count at start of loop
    const systemTimeRef = useRef<number>(0.0); // Track system duration
    
    // Initialize random seed from data if available
    const initSeed = (() => {
        const main = data.settings?.modules?.find((m: any) => m.id === 'main');
        if (main && main.properties && main.properties.autoRandomSeed === false) {
            return main.properties.seed || 0;
        }
        return Math.random() * 1000.0;
    })();
    
    const randomSeedRef = useRef<number>(initSeed); // Track random seed for system loops
    const globalTimeRef = useRef<number>(0.0); // Track global continuous time
    const dataRef = useRef(data); 
    const edgesRef = useRef(edges); // Ref for edges
    const expandedModulesRef = useRef(expandedModules); // Ref for loop access
    
    // Shader Compilation for Input
    const [compiledImage, setCompiledImage] = useState<CompilationResult | null>(null);
    const imageInputCanvasRef = useRef<HTMLCanvasElement>(null);

    const [compiledParticleImage, setCompiledParticleImage] = useState<CompilationResult | null>(null);
    const particleImageInputCanvasRef = useRef<HTMLCanvasElement>(null);

    // Watch for Input Connection Changes and Compile
    useEffect(() => {
        const inputEdge = edges.find(e => e.target === id && e.targetHandle === 'image');
        
        if (inputEdge) {
            try {
                // Compile upstream graph
                // We use 'nodes' from useNodes() which is updated on changes
                const result = compileGraph(nodes as import('reactflow').Node<NodeData>[], edges, inputEdge.source);
                setCompiledImage(result);
            } catch (e) {
                console.error("Particle System Input Compile Error:", e);
                setCompiledImage(null);
            }
        } else {
            setCompiledImage(null);
        }
    }, [edges, nodes, id]);

    // Watch for Particle Texture Input
    useEffect(() => {
        const inputEdge = edges.find(e => e.target === id && e.targetHandle === 'particleTexture');
        
        if (inputEdge) {
            try {
                const result = compileGraph(nodes as import('reactflow').Node<NodeData>[], edges, inputEdge.source);
                setCompiledParticleImage(result);
            } catch (e) {
                console.error("Particle System Particle Texture Input Compile Error:", e);
                setCompiledParticleImage(null);
            }
        } else {
            setCompiledParticleImage(null);
        }
    }, [edges, nodes, id]);

    // Update refs
    useEffect(() => { dataRef.current = data; }, [data]);
    useEffect(() => { edgesRef.current = edges; }, [edges]);
    useEffect(() => { expandedModulesRef.current = expandedModules; }, [expandedModules]);

    // Camera State
    const initialCamera = data.settings?.camera;
    const camState = useRef(initialCamera ? { 
        r: initialCamera.r, 
        theta: initialCamera.theta, 
        phi: initialCamera.phi, 
        target: initialCamera.target 
    } : { r: 8.0, theta: 0.0, phi: 1.5, target: [0, 0, 0] });
    const dragRef = useRef({ active: false, x: 0, y: 0, mode: 'orbit' as 'orbit' | 'pan' });
    
    // Track isPerspective for event handlers
    const isPerspectiveRef = useRef(isPerspective);
    useEffect(() => { isPerspectiveRef.current = isPerspective; }, [isPerspective]);

    const saveCameraState = useCallback(() => {
        const cam = { ...camState.current, isPerspective: isPerspectiveRef.current };
        setNodes(nds => nds.map(n => {
            if (n.id === id) {
                return { ...n, data: { ...n.data, settings: { ...n.data.settings, camera: cam } } };
            }
            return n;
        }));
    }, [id, setNodes]);

    const handleMouseDown = (e: React.MouseEvent) => {
        e.stopPropagation(); 
        e.preventDefault();
        // Right click (2) or Middle click (1) for Pan, Left (0) for Orbit
        const mode = (e.button === 2 || e.button === 1) ? 'pan' : 'orbit';
        dragRef.current = { active: true, x: e.clientX, y: e.clientY, mode };
    };
    
    const handleContextMenu = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
    };
    
    const handleMouseMove = (e: React.MouseEvent) => {
        if (!dragRef.current.active) return;
        const dx = e.clientX - dragRef.current.x;
        const dy = e.clientY - dragRef.current.y;
        
        if (dragRef.current.mode === 'orbit') {
            camState.current.theta -= dx * 0.01;
            camState.current.phi -= dy * 0.01;
            // Clamp phi to avoid flipping
            camState.current.phi = Math.max(0.01, Math.min(Math.PI - 0.01, camState.current.phi));
        } else {
            // Pan logic
            const { theta, phi, r } = camState.current;
            const factor = r * 0.002; // Pan speed depends on distance
            
            // Camera Basis vectors
            const sinT = Math.sin(theta);
            const cosT = Math.cos(theta);
            const sinP = Math.sin(phi);
            const cosP = Math.cos(phi);
            
            // Right Vector (Horizontal on screen)
            const Rx = cosT;
            const Rz = -sinT;
            
            // Up Vector (Vertical on screen)
            // Derived from Cross(Right, Forward)
            const Ux = -sinT * cosP;
            const Uy = sinP;
            const Uz = -cosT * cosP;
            
            // Move target
            // -dx moves Left (along -Right), -dy moves Up (along +Up) ? 
            // Usually drag left (dx < 0) moves camera right -> target moves right?
            // Drag moves the WORLD. So dragging left (dx < 0) moves target Left.
            // Drag Up (dy < 0) moves target Up.
            
            const moveX = -dx * factor; 
            const moveY = dy * factor;
            
            camState.current.target[0] += Rx * moveX + Ux * moveY;
            camState.current.target[1] +=              Uy * moveY;
            camState.current.target[2] += Rz * moveX + Uz * moveY;
        }
        
        dragRef.current = { ...dragRef.current, x: e.clientX, y: e.clientY };
    };
    
    const handleMouseUp = () => {
        dragRef.current.active = false;
        saveCameraState();
    };
    
    // Move wheel logic to useEffect for non-passive listener to properly preventDefault/stopPropagation
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        let saveTimeout: any;

        const handleWheel = (e: WheelEvent) => {
            e.preventDefault();
            e.stopPropagation();
            camState.current.r += e.deltaY * 0.01;
            camState.current.r = Math.max(0.1, Math.min(50.0, camState.current.r));
            
            if (saveTimeout) clearTimeout(saveTimeout);
            saveTimeout = setTimeout(() => {
                saveCameraState();
            }, 500);
        };

        canvas.addEventListener('wheel', handleWheel, { passive: false });
        return () => {
            canvas.removeEventListener('wheel', handleWheel);
            if (saveTimeout) clearTimeout(saveTimeout);
        };
    }, [saveCameraState]);

    const modulesRef = useRef(modules);
    useEffect(() => { modulesRef.current = modules; }, [modules]);

    // Helper to extract properties cleanly
    const getSettings = useCallback(() => {
        const s: Record<string, any> = {};
        modulesRef.current.forEach(m => s[m.id] = { ...m.properties, enabled: m.enabled });
        // Inject emitted count
        s._emittedCount = emittedCountRef.current;
        return s;
    }, []); // Stable callback

    const maxParticles = modules.find(m=>m.id==='main')?.properties.maxParticles || 1000000;

    // Reset emission when Reset button clicked
    const handleReset = () => {
        // Reset simulation state only, keep settings
        emittedCountRef.current = 0;
        loopStartEmittedRef.current = 0;
        systemTimeRef.current = 0;
        globalTimeRef.current = 0;
        
        // Reset Random Seed
        const mainProps = modules.find(m => m.id === 'main')?.properties;
        if (mainProps) {
            if (mainProps.autoRandomSeed) {
                randomSeedRef.current = Math.random() * 1000.0;
            } else {
                randomSeedRef.current = mainProps.seed;
            }
        }

        // Reset GPU State
        if (systemRef.current) {
            systemRef.current.reset();
        }
    };

    const handleResetCamera = () => {
        // Find 'shape' module to align camera with emitter
        const shape = modules.find(m => m.id === 'shape')?.properties;
        
        let target = [0, 0, 0];
        let r = 8.0;
        
        if (shape) {
            target = [
                shape.positionX !== undefined ? shape.positionX : 0,
                shape.positionY !== undefined ? shape.positionY : 0,
                shape.positionZ !== undefined ? shape.positionZ : 0
            ];
            
            // Calculate distance to fit the Box Height
            // BoxY is the height of the emitter plane (if Image/Box type)
            const h = shape.boxY !== undefined ? shape.boxY : 1.0;
            // Add slight padding (e.g. 1.0x -> exact fit, or 1.05x for tiny margin)
            // User wants it to "fill", so let's reduce padding to almost 0.
            const fitHeight = h * 1.0;
            
            if (isPerspective) {
                // FOV 45 deg -> tan(22.5) ~= 0.414
                // dist = (h/2) / tan(fov/2)
                r = (fitHeight / 2) / 0.414;
            } else {
                // Orthographic scale logic in loop: s = r * 0.4; visibleHeight = 2*s = 0.8*r
                // r = visibleHeight / 0.8
                // Wait, if s = r * 0.4, visible range is [-s, s], total height 2s = 0.8r
                // So r = h / 0.8
                r = fitHeight / 0.8;
            }
            
            // Ensure min distance
            r = Math.max(r, 0.1);
        }
        
        // Front View: theta = 0, phi = PI/2 (looking down Z? No, looking along Z)
        // With current mat4LookAt:
        // eye = target + spherical(r, theta, phi)
        // theta=0, phi=PI/2 -> eye = target + [0, 0, r] -> Looking at target from +Z. Correct for XY plane.
        
        camState.current = { r, theta: 0.0, phi: Math.PI / 2, target };
    };

    // Initialization & Render Loop
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        
        // Enable preserveDrawingBuffer to allow other nodes to read this canvas as a texture
        const gl = canvas.getContext('webgl2', { preserveDrawingBuffer: true });
        if (!gl) return;

        // Init System
        // Use a much larger buffer if needed, but allow dynamic resize?
        // Resizing is hard with current architecture (Double FBO swap).
        // Let's just init with a large enough capacity or re-init if count changes significantly.
        // For now, let's bump default to support 1M if requested, 
        // but note: allocating 1M particles (4k x 4k texture) is heavy for mobile/low-end.
        // Let's use maxParticles from settings if available on first load?
        // But settings modules are state.
        
        // Let's check current settings for max count
        const maxP = modules.find(m=>m.id==='main')?.properties.maxParticles || 1000000;
        
        // Check if we need to re-init
        if (!systemRef.current || systemRef.current.count !== maxP) {
             // If re-init, we lose state.
             systemRef.current = new GPUParticleSystem(gl, maxP);
             
             // Register Dynamic Texture for output (Particle System Result)
             // Use 'dynamic://' prefix to ensure compatibility with other nodes (like Fluid Node)
             const dynamicId = `dynamic://${id}`;
             registerDynamicTexture(dynamicId, canvas);
             
             // Update node output
             setTimeout(() => {
                  setNodes(nds => nds.map(n => {
                      if (n.id === id) {
                          // Only update if value changed to avoid loop
                          if (n.data.uniforms?.tex?.value === dynamicId) return n;
                          return { 
                              ...n, 
                              data: { 
                                  ...n.data, 
                                  outputType: 'vec4',
                                  uniforms: { 
                                      ...n.data.uniforms, 
                                      tex: { type: 'sampler2D', value: dynamicId } 
                                  } 
                              } 
                          };
                      }
                      return n;
                  }));
             }, 0);
        } else {
             // Ensure texture is registered even if not re-inited
             const dynamicId = `dynamic://${id}`;
             registerDynamicTexture(dynamicId, canvas);
             
             // Ensure output is set in node data (Critical for downstream nodes to see it)
             setTimeout(() => {
                  setNodes(nds => nds.map(n => {
                      if (n.id === id) {
                          if (n.data.uniforms?.tex?.value === dynamicId) return n;
                          return { 
                              ...n, 
                              data: { 
                                  ...n.data, 
                                  outputType: 'vec4',
                                  uniforms: { 
                                      ...n.data.uniforms, 
                                      tex: { type: 'sampler2D', value: dynamicId } 
                                  } 
                              } 
                          };
                      }
                      return n;
                  }));
             }, 0);
        }

        const system = systemRef.current;
        
        let lastTime = performance.now();
        const loop = (time: number) => {
            if (!isRunning) return;

            const dt = Math.min((time - lastTime) / 1000, 0.1);
            lastTime = time;
            
            // Global Time (Continuous)
            globalTimeRef.current += dt;

            // Update Emitted Count
            const settings = getSettings(); // This gets fresh modules state
            
            // Sync Random Seed if Auto is False (Handle UI changes immediately)
            if (!settings.main.autoRandomSeed) {
                randomSeedRef.current = settings.main.seed;
            }

            // Update System Time
            const prevSystemTime = systemTimeRef.current;
            systemTimeRef.current += dt;
            let currentSystemTime = systemTimeRef.current;

            const duration = settings.main.duration !== undefined ? settings.main.duration : 5.0;
            const looping = settings.main.looping !== false; // Default true
            
            // Handle Looping Reset
            if (looping && currentSystemTime > duration) {
                systemTimeRef.current = 0;
                currentSystemTime = 0;
                
                // Capture emitted count for deterministic seeding
                loopStartEmittedRef.current = emittedCountRef.current;

                // Update Random Seed on Loop
                if (settings.main.autoRandomSeed) {
                    randomSeedRef.current = Math.random() * 1000.0;
                } else {
                    randomSeedRef.current = settings.main.seed;
                }
                // Reset emission count for new loop? 
                // Actually, for continuous emission, we just keep increasing count.
                // But if we want to repeat the exact pattern, we might reset.
                // Unity resets time but keeps emitting.
                // Our shader uses uEmittedCount to determine ID.
                // If we reset uEmittedCount, we overwrite old particles.
                // Let's NOT reset emittedCountRef, just time.
            }

            // Time Emission
            let rate = 0.0;
            
            // Check Duration
            let shouldEmit = true;
            if (!looping && currentSystemTime > duration) {
                shouldEmit = false;
            }

            if (shouldEmit && settings.emission && settings.emission.enabled) {
                rate = settings.emission.rateOverTime !== undefined ? settings.emission.rateOverTime : 10.0;
                
                // Bursts Logic
                if (settings.emission.bursts && Array.isArray(settings.emission.bursts)) {
                    const bursts = settings.emission.bursts;
                    for (const burst of bursts) {
                        const bTime = burst.time || 0.0;
                        const bCount = burst.count || 10;
                        
                        let shouldBurst = false;
                        
                        if (looping) {
                            const t1 = prevSystemTime % duration;
                            const t2 = currentSystemTime % duration;
                            
                            if (t2 < t1) {
                                // Wrapped around
                                if (bTime >= t1 || bTime < t2) shouldBurst = true;
                            } else {
                                if (bTime >= t1 && bTime < t2) shouldBurst = true;
                            }
                        } else {
                            // Non-looping
                            if (bTime >= prevSystemTime && bTime < currentSystemTime) {
                                shouldBurst = true;
                            }
                        }
                        
                        if (shouldBurst) {
                            emittedCountRef.current += bCount;
                        }
                    }
                }
            }
            emittedCountRef.current += rate * dt;
            
            // Re-inject updated count
            settings._emittedCount = emittedCountRef.current;
            
            // Update Gradient
            const colorMod = settings.color;
            if (colorMod && colorMod.enabled && colorMod.color) {
                 system.updateGradient(colorMod.color.gradientStops || [], colorMod.color.alphaStops || []);
            }
            
            // Size Curve Texture Update REMOVED
            
            // Update Shape Image
            let shapeImageSource: DynamicTextureSource | HTMLImageElement | null = null;
            let shouldUseInput = false;
            let inputTexEnabled = 0; // Flag to pass to shader
            
            const currentData = dataRef.current;
            const currentEdges = edgesRef.current;

            // 1. Check Input (Try direct data.inputs first, then fallback to Edges lookup)
            const inputImg = currentData.inputs?.find(i => i.id === 'image');
            if (inputImg && inputImg.value) {
                const val = inputImg.value;
                if (typeof val === 'string') {
                    // Try getting texture directly from value (if it is an ID)
                    const tex = getDynamicTexture(val);
                    if (tex) {
                        shapeImageSource = tex;
                        shouldUseInput = true;
                    }
                }
            }
            
            // 2. Check for Compiled Input (Architectural Fix)
            if (!shouldUseInput && imageInputCanvasRef.current) {
                shapeImageSource = imageInputCanvasRef.current;
                shouldUseInput = true;
            }

            // 3. Fallback: Check Edges (Legacy/Direct Texture)
            if (!shouldUseInput) {
                const inputEdge = currentEdges.find(e => e.target === id && e.targetHandle === 'image');
                if (inputEdge) {
                    // Found a connection! Now guess the texture ID from the source node ID.
                    const prefixes = ['dynamic://', 'fluid://', 'particle://', 'image://', 'video://', 'webcam://'];
                    for (const prefix of prefixes) {
                        const tex = getDynamicTexture(`${prefix}${inputEdge.source}`);
                        if (tex) {
                            shapeImageSource = tex;
                            shouldUseInput = true;
                            break;
                        }
                    }
                    
                    // Fallback: Check if upstream node has 'output' or 'image' uniform with a texture value (Asset ID)
                    if (!shouldUseInput) {
                         // We can try to find the upstream node by ID
                         const sourceNode = getNode(inputEdge.source);
                         
                         if (sourceNode) {
                             // Check for uniform value in source node (e.g. Image Loader)
                             let assetId = null;
                             if (sourceNode.data.uniforms?.image?.value) assetId = sourceNode.data.uniforms.image.value;
                             else if (sourceNode.data.uniforms?.tex?.value) assetId = sourceNode.data.uniforms.tex.value;
                             else if (sourceNode.data.uniforms?.output?.value) assetId = sourceNode.data.uniforms.output.value;
                             
                             if (typeof assetId === 'string' && assetId) {
                                 // It might be an asset ID or URL
                                 // Check if we already loaded it to avoid spamming
                                 if ((system as any)._lastInputAssetId !== assetId) {
                                     (system as any)._lastInputAssetId = assetId;
                                     
                                     const loadAsset = async () => {
                                         let src: string | import('../types').RawTextureData | null = assetId;
                                         if (assetId.startsWith('asset://') || assetId.startsWith('builtin://')) {
                                             src = await assetManager.get(assetId);
                                         }
                                         
                                         if (src && typeof src === 'string') {
                                             const img = new Image();
                                             img.crossOrigin = "Anonymous";
                                             img.onload = () => {
                                                 system.updateShapeTexture(img);
                                                 // Mark as using input so we don't overwrite with local image
                                                 (system as any)._usingAssetInput = true; 
                                             };
                                             img.src = src;
                                         }
                                     };
                                     loadAsset();
                                 }
                                 
                                 // If we successfully identified an asset, we consider input active
                                 shouldUseInput = true;
                             }
                         }
                    }
                }
            }

            // Handle Input Source Update

            // Handle Input Source Update
            if (shouldUseInput && shapeImageSource) {
                system.updateShapeTexture(shapeImageSource);
                inputTexEnabled = 1;
                (system as any)._usingAssetInput = false; // Clear asset flag if we have direct dynamic texture
            } else if ((system as any)._usingAssetInput) {
                // If we are using an async loaded asset from input, keep enabled
                inputTexEnabled = 1;
            } else {
                // Existing Image Upload Logic
                if (settings.shape && settings.shape.image && settings.shape.image !== (system as any)._lastImageSrc) {
                    const img = new Image();
                    img.crossOrigin = "Anonymous";
                    img.onload = () => {
                        // Only update if we are NOT using input, or if input was disconnected
                        // Actually, this block runs in 'else', so we are not using input.
                        system.updateShapeTexture(img);
                        (system as any)._lastImageSrc = settings.shape.image;
                    };
                    img.src = settings.shape.image;
                } else if (!settings.shape.image && (system as any)._lastImageSrc) {
                     system.updateShapeTexture(null);
                     (system as any)._lastImageSrc = null;
                }
                
                // Restore uploaded image if input disconnected
                // If we just switched from input=true to input=false, we need to re-upload the local image texture
                if ((system as any)._wasUsingInput && !shouldUseInput && settings.shape.image) {
                     const img = new Image();
                     img.crossOrigin = "Anonymous";
                     img.onload = () => {
                        system.updateShapeTexture(img);
                     };
                     img.src = settings.shape.image;
                }
                
                // Determine enabled state based on settings
                inputTexEnabled = (settings.shape && settings.shape.image && settings.shape.shapeType === 'Image') ? 1 : 0;
            }
            
            (system as any)._wasUsingInput = shouldUseInput;
            
            // Store this flag on settings object to be used in update() and render()
            settings._shapeTexEnabledOverride = inputTexEnabled;

            // --- Particle Texture Logic ---
            let particleImageSource: DynamicTextureSource | HTMLImageElement | null = null;
            let shouldUseParticleInput = false;

            // 1. Check Compiled Input
            if (particleImageInputCanvasRef.current) {
                particleImageSource = particleImageInputCanvasRef.current;
                shouldUseParticleInput = true;
            }

            // 2. Fallback: Check Edges
            if (!shouldUseParticleInput) {
                const inputEdge = currentEdges.find(e => e.target === id && e.targetHandle === 'particleTexture');
                if (inputEdge) {
                    const prefixes = ['dynamic://', 'fluid://', 'particle://', 'image://', 'video://', 'webcam://'];
                    for (const prefix of prefixes) {
                        const tex = getDynamicTexture(`${prefix}${inputEdge.source}`);
                        if (tex) {
                            particleImageSource = tex;
                            shouldUseParticleInput = true;
                            break;
                        }
                    }
                }
            }

            if (shouldUseParticleInput && particleImageSource) {
                system.updateParticleTexture(particleImageSource);
                settings._materialOverride = 'Custom';
                (system as any)._usingParticleInput = true;
            } else {
                // Not using input, check local settings
                if ((system as any)._usingParticleInput) {
                     // Just disconnected
                     (system as any)._usingParticleInput = false;
                     // Force reload local
                     (system as any)._lastParticleImageSrc = null; 
                }

                if (settings.renderer && settings.renderer.texture && settings.renderer.texture !== (system as any)._lastParticleImageSrc) {
                    const img = new Image();
                    img.crossOrigin = "Anonymous";
                    img.onload = () => {
                        if (!(system as any)._usingParticleInput) { // Check again in async callback
                            system.updateParticleTexture(img);
                            (system as any)._lastParticleImageSrc = settings.renderer.texture;
                        }
                    };
                    img.src = settings.renderer.texture;
                } else if ((!settings.renderer || !settings.renderer.texture) && (system as any)._lastParticleImageSrc) {
                     system.updateParticleTexture(null);
                     (system as any)._lastParticleImageSrc = null;
                }
            }

            // Camera Calculation
            const { r, theta, phi, target } = camState.current;
            const eye = [
                target[0] + r * Math.sin(phi) * Math.sin(theta),
                target[1] + r * Math.cos(phi),
                target[2] + r * Math.sin(phi) * Math.cos(theta)
            ];
            const view = mat4LookAt(eye, target, [0, 1, 0]);
            
            const aspect = canvas.width / canvas.height;
            let proj;
            
            if (isPerspective) {
                const fov = 45 * Math.PI / 180;
                const f = 1.0 / Math.tan(fov / 2);
                const nf = 1 / (0.1 - 100);
                proj = [
                    f / aspect, 0, 0, 0,
                    0, f, 0, 0,
                    0, 0, (100 + 0.1) * nf, -1,
                    0, 0, (2 * 100 * 0.1) * nf, 0
                ];
            } else {
                // Orthographic
                const s = r * 0.4; // Scale factor based on distance
                const left = -s * aspect;
                const right = s * aspect;
                const bottom = -s;
                const top = s;
                const near = -100;
                const far = 100;
                const rl = 1 / (right - left);
                const tb = 1 / (top - bottom);
                const fn = 1 / (far - near);
                proj = [
                    2 * rl, 0, 0, 0,
                    0, 2 * tb, 0, 0,
                    0, 0, -2 * fn, 0,
                    -(right + left) * rl, -(top + bottom) * tb, -(far + near) * fn, 1
                ];
            }

            system.update(dt, systemTimeRef.current, globalTimeRef.current, settings, randomSeedRef.current, loopStartEmittedRef.current);
            
            // Only pass expandedModules if showGizmos is true
            // Actually GPUParticleSystem.render uses expandedModules['shape'] to decide.
            // But we want to override it with showGizmos.
            // Let's modify render to accept a boolean or we modify the object passed.
            // Simplest: If showGizmos is false, pass empty object or fake object for 'shape'
            
            const renderModules = showGizmos ? expandedModulesRef.current : {};
            system.render(view, proj, settings, renderModules);

            // Export HDR Data
            const hdrData = system.getHDRData();
            registerDynamicTexture(`dynamic://${id}`, hdrData);

            requestRef.current = requestAnimationFrame(loop);
        };
        
        requestRef.current = requestAnimationFrame(loop);
        
        return () => {
            if (requestRef.current) cancelAnimationFrame(requestRef.current);
            unregisterDynamicTexture(`dynamic://${id}`);
        };
    }, [isRunning, isPerspective, showGizmos, getSettings, id, setNodes, maxParticles]);


    // Sync to Node Data Persistence
    useEffect(() => {
        const timer = setTimeout(() => {
            setNodes(nds => nds.map(n => {
                if (n.id === id) {
                    if (JSON.stringify(n.data.settings?.modules) === JSON.stringify(modules)) return n;
                    return { ...n, data: { ...n.data, settings: { ...n.data.settings, modules } } };
                }
                return n;
            }));
        }, 500);
        return () => clearTimeout(timer);
    }, [modules, id, setNodes]);

    const toggleModule = (modId: string) => {
        setExpandedModules(prev => ({ ...prev, [modId]: !prev[modId] }));
    };

    const toggleModuleEnabled = (modId: string, enabled: boolean) => {
        setModules(prev => prev.map(m => m.id === modId ? { ...m, enabled } : m));
    };

    const updateProperty = (modId: string, prop: string, value: any) => {
        setModules(prev => prev.map(m => m.id === modId ? { 
            ...m, 
            properties: { ...m.properties, [prop]: value } 
        } : m));
    };
    
    // Image Auto-Ratio Hook
    useEffect(() => {
        const shape = modules.find(m => m.id === 'shape')?.properties;
        if (shape && shape.image && shape.shapeType === 'Image') {
             // We can check image dimensions here and update BoxY if needed?
             // But we don't want to loop.
             // Let's just create an image object to check dimensions ONCE when image changes.
        }
    }, [modules]); // This is too frequent.

    // Better: wrap updateProperty to intercept 'image' change
    const updatePropertyWithLogic = (modId: string, prop: string, value: any) => {
         // Special handling for Rotation Separate Axes
         if (modId === 'rotation' && prop === 'separateAxes') {
             setModules(prev => prev.map(m => {
                 if (m.id === 'rotation') {
                     const newProps = { ...m.properties, [prop]: value };
                     if (value === true) {
                         // Switch to Separate Axes
                         // Initialize X, Y, Z if they don't exist, but don't delete angularVelocity
                         if (!newProps.angularVelocityX) newProps.angularVelocityX = { mode: 'Constant', constant: 0.0, constantMin: 0.0, constantMax: 360.0 };
                         if (!newProps.angularVelocityY) newProps.angularVelocityY = { mode: 'Constant', constant: 0.0, constantMin: 0.0, constantMax: 360.0 };
                         if (!newProps.angularVelocityZ) newProps.angularVelocityZ = { mode: 'Constant', constant: 45.0, constantMin: 0.0, constantMax: 360.0 };
                     } else {
                         // Switch to Single Axis
                         // Initialize angularVelocity if it doesn't exist, but don't delete X, Y, Z
                         if (!newProps.angularVelocity) newProps.angularVelocity = { mode: 'Constant', constant: 45.0, constantMin: 0.0, constantMax: 360.0 };
                     }
                     return { ...m, properties: newProps };
                 }
                 return m;
             }));
             return;
         }

         updateProperty(modId, prop, value);
         
         if (modId === 'shape' && prop === 'image' && value) {
             // Load image to check ratio
             const img = new Image();
             img.onload = () => {
                 if (img.width > 0 && img.height > 0) {
                     const ratio = img.height / img.width;
                     // Update BoxY to match BoxX * ratio
                     // We need current BoxX. We can get it from state setter or assume default/current
                     setModules(prev => {
                         const currentShape = prev.find(m => m.id === 'shape');
                         const boxX = currentShape?.properties.boxX || 1.0;
                         return prev.map(m => m.id === 'shape' ? {
                             ...m,
                             properties: { ...m.properties, boxY: boxX * ratio }
                         } : m);
                     });
                 }
             };
             img.src = value;
         }
    };

    const renderPropertyEditor = (modId: string, propKey: string, value: any, label: string) => {
        // Detect type based on key/value and render appropriate widget
        
        // Boolean (Checkbox)
        if (typeof value === 'boolean') {
            return (
                <div key={propKey} className="flex items-center justify-between py-1">
                    <label className="text-[10px] text-zinc-400">{label}</label>
                    <input 
                        type="checkbox" 
                        checked={value} 
                        onChange={e => updatePropertyWithLogic(modId, propKey, e.target.checked)}
                        className="rounded bg-zinc-900 border-zinc-700 text-blue-500 focus:ring-0"
                    />
                </div>
            );
        }

        // Color / Gradient
        if (propKey === 'color' && typeof value === 'object') {
            return (
                <div key={propKey} className="flex flex-col gap-1 py-1">
                    <label className="text-[10px] text-zinc-400">{label}</label>
                    <GradientWidget 
                        config={{ gradientStops: value.gradientStops, alphaStops: value.alphaStops }}
                        onChangeValue={() => {}} // Not used for preview here
                        onConfigChange={(cfg) => updatePropertyWithLogic(modId, propKey, { gradientStops: cfg.gradientStops, alphaStops: cfg.alphaStops })}
                    />
                </div>
            );
        }

        // Curve
        if ((propKey === 'size' || propKey === 'curve') && Array.isArray(value)) {
            return (
                <div key={propKey} className="flex flex-col gap-1 py-1">
                    <label className="text-[10px] text-zinc-400">{label}</label>
                    <SimpleCurveEditor 
                        points={value}
                        onChange={(newPoints) => updatePropertyWithLogic(modId, propKey, newPoints)}
                    />
                </div>
            );
        }

        // Bursts List
        if (propKey === 'bursts' && Array.isArray(value)) {
            return (
                <div key={propKey} className="flex flex-col gap-2 py-1">
                    <div className="flex justify-between items-center">
                        <label className="text-[10px] text-zinc-400">{label}</label>
                        <button 
                            onClick={() => {
                                const newBurst = { time: 0.0, count: 30, cycles: 1, interval: 0.01 };
                                updatePropertyWithLogic(modId, propKey, [...value, newBurst]);
                            }}
                            className="text-[10px] bg-zinc-800 hover:bg-zinc-700 text-zinc-300 px-2 py-0.5 rounded flex items-center gap-1"
                        >
                            <Plus size={10} /> Add
                        </button>
                    </div>
                    <div className="flex flex-col gap-1">
                        {value.map((burst: any, i: number) => (
                            <div key={i} className="flex items-center gap-1 bg-zinc-900/50 p-1 rounded border border-zinc-800">
                                <div className="flex flex-col gap-0.5 flex-1">
                                    <div className="flex items-center gap-1">
                                        <span className="text-[9px] text-zinc-500 w-6">Time</span>
                                        <input 
                                            type="number" 
                                            value={burst.time} 
                                            onChange={e => {
                                                const newBursts = [...value];
                                                newBursts[i] = { ...burst, time: parseFloat(e.target.value) };
                                                updatePropertyWithLogic(modId, propKey, newBursts);
                                            }}
                                            className="bg-zinc-950 border border-zinc-700 rounded px-1 py-0 text-[9px] text-zinc-300 w-12"
                                            step={0.1}
                                        />
                                    </div>
                                    <div className="flex items-center gap-1">
                                        <span className="text-[9px] text-zinc-500 w-6">Count</span>
                                        <input 
                                            type="number" 
                                            value={burst.count} 
                                            onChange={e => {
                                                const newBursts = [...value];
                                                newBursts[i] = { ...burst, count: parseInt(e.target.value) };
                                                updatePropertyWithLogic(modId, propKey, newBursts);
                                            }}
                                            className="bg-zinc-950 border border-zinc-700 rounded px-1 py-0 text-[9px] text-zinc-300 w-12"
                                        />
                                    </div>
                                </div>
                                <button 
                                    onClick={() => {
                                        const newBursts = value.filter((_, idx) => idx !== i);
                                        updatePropertyWithLogic(modId, propKey, newBursts);
                                    }}
                                    className="text-zinc-600 hover:text-red-400 p-1"
                                >
                                    <Trash2 size={12} />
                                </button>
                            </div>
                        ))}
                        {value.length === 0 && <div className="text-[9px] text-zinc-600 italic text-center">No bursts</div>}
                    </div>
                </div>
            );
        }
        
        // Texture / Material / Image
        if (propKey === 'texture' || propKey === 'image') {
            // Visibility check for texture
            if (propKey === 'texture') {
                const currentModule = modules.find(m => m.id === modId);
                if (currentModule?.properties?.material !== 'Custom') return null;
            }

            return (
                <div key={propKey} className="flex flex-col gap-1 py-1">
                    <label className="text-[10px] text-zinc-400">{label}</label>
                    <ImageUploadWidget 
                        value={value} 
                        onChange={(v: string) => updatePropertyWithLogic(modId, propKey, v)} 
                    />
                    {/* Input Indicator */}
                    {data.inputs?.find(i => i.id === 'image') && (
                        <div className="absolute top-1 right-1">
                            <div className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" title={t("Input Active")}></div>
                        </div>
                    )}
                </div>
            );
        }

        // Enums (Select)
        if (propKey === 'simulationSpace' || propKey === 'shapeType' || propKey === 'space' || propKey === 'quality' || propKey === 'renderMode' || propKey === 'material' || propKey === 'renderAlignment' || propKey === 'blending') {
            let options: string[] = [];
            if (propKey === 'simulationSpace') options = ['Local', 'World'];
            if (propKey === 'shapeType') options = ['Sphere', 'Cone', 'Box', 'Mesh', 'Circle', 'Edge', 'Image'];
            if (propKey === 'space') options = ['Local', 'World'];
            if (propKey === 'quality') options = ['Low', 'Medium', 'High'];
            if (propKey === 'renderMode') options = ['Billboard', 'Stretched Billboard', 'Horizontal Billboard', 'Vertical Billboard', 'Mesh'];
            if (propKey === 'material') options = ['Circle', 'Soft Circle', 'Square', 'Custom'];
            if (propKey === 'renderAlignment') options = ['View', 'World', 'Local'];
            if (propKey === 'blending') options = ['Additive', 'Alpha', 'Max', 'Multiply'];

            // Visibility check for Render Alignment
            if (propKey === 'renderAlignment') {
                const currentModule = modules.find(m => m.id === modId);
                if (currentModule?.properties?.renderMode !== 'Billboard') return null;
            }

            return (
                <div key={propKey} className="flex items-center justify-between py-1">
                    <label className="text-[10px] text-zinc-400">{label}</label>
                    <select 
                        value={value} 
                        onChange={e => updatePropertyWithLogic(modId, propKey, e.target.value)}
                        className="bg-zinc-900 border border-zinc-700 rounded px-1 py-0.5 text-[10px] text-zinc-200 outline-none w-24"
                    >
                        {options.map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                </div>
            );
        }

        // MinMax Constant/Random
        if (value && typeof value === 'object' && 'mode' in value) {
            let min: number | undefined = undefined;
            let max: number | undefined = undefined;
            let step = 0.1;

            // Defaults for specific types
            if (propKey.includes('Rotation')) { step = 1; }
            
            // Restrict only strictly positive values
            if (propKey.includes('Lifetime') || propKey.includes('Size') || propKey.includes('Speed')) {
                min = 0;
            }

            const isRandom = value.mode === 'Random';

            return (
                <div key={propKey} className="flex items-center gap-2 py-1 border-l-2 border-zinc-800 pl-2">
                    <label className="text-[10px] text-zinc-400 w-24 shrink-0 truncate" title={label}>{label}</label>
                    
                    <div className="flex-1 flex gap-1 min-w-0">
                        {!isRandom ? (
                             <DraggableNumberWidget 
                                value={value.constant} 
                                onChange={(v: number) => updatePropertyWithLogic(modId, propKey, { ...value, constant: v })} 
                                min={min} max={max} step={step} 
                            />
                        ) : (
                            <>
                                <DraggableNumberWidget 
                                    value={value.constantMin} 
                                    onChange={(v: number) => updatePropertyWithLogic(modId, propKey, { ...value, constantMin: v })} 
                                    min={min} max={max} step={step} 
                                />
                                <DraggableNumberWidget 
                                    value={value.constantMax} 
                                    onChange={(v: number) => updatePropertyWithLogic(modId, propKey, { ...value, constantMax: v })} 
                                    min={min} max={max} step={step} 
                                />
                            </>
                        )}
                    </div>

                    <div className="relative w-4 h-4 shrink-0 group/select">
                        <select 
                            value={value.mode} 
                            onChange={e => updatePropertyWithLogic(modId, propKey, { ...value, mode: e.target.value })}
                            className="absolute inset-0 opacity-0 cursor-pointer z-10"
                            title="Toggle Constant/Random"
                        >
                            <option value="Constant" className="bg-zinc-900 text-zinc-200">Constant</option>
                            <option value="Random" className="bg-zinc-900 text-zinc-200">Random</option>
                        </select>
                        <ChevronDown size={12} className="text-zinc-500 group-hover/select:text-zinc-300 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none" />
                    </div>
                </div>
            );
        }

        // Number (Slider/Input)
        if (typeof value === 'number') {
            // Heuristic for ranges
            let min: number | undefined = undefined;
            let max: number | undefined = undefined;
            let step = 0.1;

            // Restrict strictly positive values
            if (propKey.includes('rate') || propKey === 'maxParticles' || propKey.includes('radius') || propKey.includes('Scale') || propKey === 'duration' || propKey === 'lifetime' || propKey === 'arc') {
                min = 0;
            }

            if (propKey.includes('angle')) { min = 0; max = 360; step = 1; }
            if (propKey === 'arc') { min = 0; max = 360; step = 1; }
            if (propKey === 'emissionThreshold') { min = 0; max = 1; step = 0.01; }
            if (propKey === 'dampen') { min = 0; max = 1; step = 0.01; }
            if (propKey === 'drag') { min = 0; step = 0.01; }
            if (propKey === 'seed') { step = 1; }
            
            // Allow very large max particles (Limit 10M)
            if (propKey === 'maxParticles') max = 10000000; 

            return (
                <div key={propKey} className="flex items-center gap-2 py-1">
                    <label className="text-[10px] text-zinc-400 w-24 shrink-0 truncate" title={label}>{label}</label>
                    <div className="flex-1 min-w-0">
                        <DraggableNumberWidget 
                            value={value} 
                            onChange={(v: number) => updatePropertyWithLogic(modId, propKey, v)} 
                            min={min} max={max} step={step} 
                        />
                    </div>
                </div>
            );
        }

        return null;
    };

    const handleDeleteNode = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
        deleteElements({ nodes: [{ id }] });
    }, [id, deleteElements]);

    const borderClass = selected ? 'border-blue-500 ring-1 ring-blue-500' : 'border-zinc-700';

    const renderMainProperties = (modId: string, properties: any) => {
        return (
            <div className="p-2 bg-zinc-900/10 flex flex-col gap-1 animate-in slide-in-from-top-1">
                {Object.entries(properties).map(([key, val]) => {
                    if (key === 'seed' && properties.autoRandomSeed) return null;
                    return renderPropertyEditor(modId, key, val, t(key.replace(/([A-Z])/g, ' $1').trim()));
                })}
            </div>
        );
    };

    const renderShapeProperties = (modId: string, properties: any) => {
        const type = properties.shapeType;
        
        const renderVector3Row = (label: string, keys: [string, string, string]) => {
            return (
                <div className="flex flex-col gap-1 py-1">
                    <label className="text-[10px] text-zinc-400">{label}</label>
                    <div className="flex gap-1">
                        {keys.map((key, i) => {
                            const val = properties[key];
                            if (val === undefined) return null;
                            
                            let step = 0.1;
                            if (key.includes('rotation')) step = 1;
                            if (key.includes('scale')) step = 0.01;
                            
                            return (
                                <div key={key} className="flex-1 min-w-0 flex items-center gap-1 bg-zinc-900/50 rounded px-1 border border-zinc-800">
                                    <span className={`text-[9px] font-mono ${i===0?'text-red-400':i===1?'text-green-400':'text-blue-400'}`}>
                                        {['X','Y','Z'][i]}
                                    </span>
                                    <div className="flex-1 min-w-0">
                                        <DraggableNumberWidget 
                                            value={val} 
                                            onChange={(v: number) => updatePropertyWithLogic(modId, key, v)}
                                            step={step}
                                        />
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            );
        };

        const commonProps = ['randomizeDirection', 'spherizeDirection'];
        
        // Define Order for Image: ShapeType -> Image -> Box Props
        const typeProps: Record<string, string[]> = {
            'Sphere': ['radius', 'radiusThickness', 'arc'],
            'Cone': ['angle', 'radius', 'radiusThickness', 'arc', 'length'],
            'Box': ['boxX', 'boxY', 'boxZ'],
            'Mesh': ['mesh'], // simplified
            'Circle': ['radius', 'arc'],
            'Edge': ['length'],
            'Image': ['boxX', 'boxY', 'emissionThreshold']
        };
        
        return (
            <div className="p-2 bg-zinc-900/10 flex flex-col gap-1 animate-in slide-in-from-top-1">
                {renderPropertyEditor(modId, 'shapeType', properties.shapeType, t('Shape Type'))}
                
                {type === 'Image' && renderPropertyEditor(modId, 'image', properties.image, t('Image'))}

                {renderVector3Row(t('Position'), ['positionX', 'positionY', 'positionZ'])}
                {renderVector3Row(t('Rotation'), ['rotationX', 'rotationY', 'rotationZ'])}
                {renderVector3Row(t('Scale'), ['scaleX', 'scaleY', 'scaleZ'])}

                {commonProps.map(key => {
                    const val = properties[key];
                    if (val === undefined) return null; // Skip if prop missing
                    return renderPropertyEditor(modId, key, val, t(key.replace(/([A-Z])/g, ' $1').trim()));
                })}

                {(typeProps[type] || []).map(key => {
                    const val = properties[key];
                    if (val === undefined) return null; // Skip if prop missing
                    return renderPropertyEditor(modId, key, val, t(key.replace(/([A-Z])/g, ' $1').trim()));
                })}
            </div>
        );
    };

    return (
        <div className={`shadow-xl rounded-lg border bg-zinc-950 w-[320px] transition-all overflow-visible flex flex-col ${borderClass}`}>
            {/* Header */}
            <div className="flex items-center justify-between p-2 border-b border-zinc-800 bg-zinc-900/50">
                <div className="flex items-center gap-2">
                    <div className="w-4 h-4 rounded bg-orange-500/20 flex items-center justify-center text-orange-500">
                        <Activity size={10} />
                    </div>
                    <span className="font-semibold text-xs text-zinc-200">{data.label || t("Particle System")}</span>
                </div>
                <div className="flex items-center gap-1">
                    <button onClick={() => {
                        const newP = !isPerspective;
                        setIsPerspective(newP);
                        isPerspectiveRef.current = newP;
                        saveCameraState();
                    }} className="p-1 rounded text-zinc-400 hover:text-white font-mono text-[10px] font-bold w-6 h-5 flex items-center justify-center" title={isPerspective ? t("Switch to Orthographic") : t("Switch to Perspective")}>
                        {isPerspective ? "3D" : "2D"}
                    </button>
                    <button onClick={handleResetCamera} className="p-1 rounded text-zinc-400 hover:text-white" title={t("Reset Camera")}>
                        <Camera size={12}/>
                    </button>
                    <button onClick={() => setShowGizmos(!showGizmos)} className={`p-1 rounded hover:text-white ${showGizmos ? 'text-blue-400' : 'text-zinc-400'}`} title={t("Toggle Gizmos")}>
                        <ScanEye size={12}/>
                    </button>
                    <div className="w-[1px] h-3 bg-zinc-700 mx-1"></div>
                    <button onClick={handleReset} className="p-1 rounded text-zinc-400 hover:text-white" title={t("Restart Simulation")}>
                        <RotateCcw size={12}/>
                    </button>
                    <button onClick={handleDeleteNode} className="p-1 rounded text-zinc-400 hover:text-red-400 ml-1">
                        <X size={12}/>
                    </button>
                </div>
            </div>

            {/* Hidden Input Renderer */}
            <div className="hidden">
                {compiledImage && (
                    <ShaderPreview 
                        ref={imageInputCanvasRef}
                        data={compiledImage} 
                        width={data.resolution?.w || 512} 
                        height={data.resolution?.h || 512}
                    />
                )}
                {compiledParticleImage && (
                    <ShaderPreview 
                        ref={particleImageInputCanvasRef}
                        data={compiledParticleImage} 
                        width={data.resolution?.w || 512} 
                        height={data.resolution?.h || 512}
                    />
                )}
            </div>

            {/* PREVIEW CANVAS */}
            <div className="w-full bg-black relative border-b border-zinc-800" style={{ aspectRatio: `${(data.resolution?.w || 512) / (data.resolution?.h || 512)}` }}>
                 <canvas 
                    ref={canvasRef} 
                    width={data.resolution?.w || 512} 
                    height={data.resolution?.h || 512} 
                    className="w-full h-full block cursor-move nodrag"
                    onMouseDown={handleMouseDown}
                    onMouseMove={handleMouseMove}
                    onMouseUp={handleMouseUp}
                    onMouseLeave={handleMouseUp}
                    onContextMenu={handleContextMenu}
                />
            </div>

            {/* Content - Modules List */}
            <div className="flex-1 overflow-y-auto custom-scrollbar max-h-[400px] bg-zinc-950">
                {modules.map((mod) => {
                    const def = MODULE_DEFS.find(d => d.id === mod.id);
                    if (!def) return null;
                    
                    const Icon = def.icon;
                    const isExpanded = expandedModules[mod.id];

                    return (
                        <div key={mod.id} className="border-b border-zinc-800 last:border-0">
                            <div className="flex items-center bg-zinc-900/30 hover:bg-zinc-900/50 transition-colors h-7 px-2 group select-none">
                                <button 
                                    onClick={() => toggleModuleEnabled(mod.id, !mod.enabled)}
                                    className={`mr-2 ${mod.enabled ? 'text-blue-400' : 'text-zinc-600 hover:text-zinc-400'}`}
                                >
                                    <div className={`w-3 h-3 border rounded-sm flex items-center justify-center ${mod.enabled ? 'border-blue-500 bg-blue-500/20' : 'border-zinc-600'}`}>
                                        {mod.enabled && <div className="w-1.5 h-1.5 bg-blue-500 rounded-[1px]" />}
                                    </div>
                                </button>
                                
                                <div className="flex-1 flex items-center gap-2 cursor-pointer" onClick={() => toggleModule(mod.id)}>
                                    <Icon size={12} className={mod.enabled ? 'text-zinc-300' : 'text-zinc-600'} />
                                    <span className={`text-[10px] font-bold uppercase tracking-wide ${mod.enabled ? 'text-zinc-300' : 'text-zinc-600'}`}>{t(def.label)}</span>
                                </div>

                                <button onClick={() => toggleModule(mod.id)} className="text-zinc-500 hover:text-zinc-300">
                                    {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                                </button>
                            </div>

                            {isExpanded && mod.enabled && (
                                mod.id === 'shape' ? renderShapeProperties(mod.id, mod.properties) : 
                                mod.id === 'main' ? renderMainProperties(mod.id, mod.properties) : (
                                <div className="p-2 bg-zinc-900/10 flex flex-col gap-1 animate-in slide-in-from-top-1">
                                    {Object.entries(mod.properties).map(([key, val]) => (
                                        renderPropertyEditor(mod.id, key, val, t(key.replace(/([A-Z])/g, ' $1').trim()))
                                    ))}
                                </div>
                                )
                            )}
                        </div>
                    );
                })}
            </div>

            {/* Connectors */}
            {/* <div className="absolute inset-y-0 left-0 w-0"> ... </div> */}
            
            {/* Image Input Handle - Floating on left side */}
            <Handle 
                type="target" 
                position={Position.Left} 
                id="image" 
                className="!bg-blue-500 !border-zinc-900 !w-3 !h-3 !-ml-1.5 z-50" 
                style={{ top: '30%' }} 
                title={t("Image Input (Overrides Shape Image)")}
            />

            {/* Particle Texture Input Handle */}
            <Handle 
                type="target" 
                position={Position.Left} 
                id="particleTexture" 
                className="!bg-purple-500 !border-zinc-900 !w-3 !h-3 !-ml-1.5 z-50" 
                style={{ top: '45%' }} 
                title={t("Particle Texture Input (Overrides Material)")}
            />

            <div className="absolute inset-y-0 right-0 w-0">
                <Handle type="source" position={Position.Right} id="output" className="!bg-orange-500 !border-zinc-900" style={{ top: '50%' }} />
            </div>
        </div>
    );
}, (prev, next) => {
    return prev.id === next.id && 
           prev.selected === next.selected && 
           prev.data === next.data;
});

export default ParticleSystemNode;
