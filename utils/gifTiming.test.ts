// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { computeGifTimingPlan, quantizeGifDelayMs } from './gifTiming';

describe('gifTiming', () => {
    it('quantizes delay to 10ms increments with minimum 10ms', () => {
        expect(quantizeGifDelayMs(33.333)).toBe(30);
        expect(quantizeGifDelayMs(40)).toBe(40);
        expect(quantizeGifDelayMs(4)).toBe(10);
    });

    it('computes a plan close to requested duration for 30fps', () => {
        const plan = computeGifTimingPlan(2, 30);
        expect(plan.delayMs % 10).toBe(0);
        expect(plan.frameCount).toBe(67);
        expect(plan.totalDurationMs).toBe(2010);
    });

    it('handles typical 24fps', () => {
        const plan = computeGifTimingPlan(5, 24);
        // 1000/24 ~= 41.67ms -> rounds to 40ms
        expect(plan.delayMs).toBe(40);
        expect(plan.totalDurationMs).toBeGreaterThanOrEqual(4800);
        expect(plan.totalDurationMs).toBeLessThanOrEqual(5200);
    });

    it('clamps invalid inputs to safe values', () => {
        const plan = computeGifTimingPlan(-1, 0);
        expect(plan.delayMs).toBe(1000);
        expect(plan.frameCount).toBe(1);
        expect(plan.totalDurationMs).toBe(1000);
    });
});
