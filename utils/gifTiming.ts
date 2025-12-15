export type GifTimingPlan = {
    /** Delay passed to gif.js addFrame({delay}) in milliseconds. */
    delayMs: number;
    /** Number of frames to generate. */
    frameCount: number;
    /** Total GIF playback duration implied by delayMs * frameCount. */
    totalDurationMs: number;
};

const GIF_DELAY_QUANTUM_MS = 10;

export function quantizeGifDelayMs(requestedDelayMs: number): number {
    const ms = Number.isFinite(requestedDelayMs) ? requestedDelayMs : 0;
    const units = Math.max(1, Math.round(ms / GIF_DELAY_QUANTUM_MS));
    return units * GIF_DELAY_QUANTUM_MS;
}

export function computeGifTimingPlan(durationSeconds: number, fps: number): GifTimingPlan {
    const durationMs = Math.max(0, Number(durationSeconds) * 1000);
    const safeFps = Math.max(1, Number.isFinite(fps) ? fps : 1);

    const requestedDelayMs = 1000 / safeFps;
    const delayMs = quantizeGifDelayMs(requestedDelayMs);

    const frameCount = Math.max(1, Math.round(durationMs / delayMs));
    return {
        delayMs,
        frameCount,
        totalDurationMs: frameCount * delayMs
    };
}
