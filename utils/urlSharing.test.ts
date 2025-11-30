// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { loadFlowFromUrl } from '../hooks/useUrlSharing';
import LZString from 'lz-string';

describe('URL Sharing', () => {
    // Mock window and navigator
    const originalWindow = global.window;
    const originalNavigator = global.navigator;

    beforeEach(() => {
        // @ts-ignore
        global.window = {
            location: {
                hash: '',
                origin: 'http://localhost',
                pathname: '/',
                href: 'http://localhost/',
                assign: vi.fn(),
                replace: vi.fn(),
                reload: vi.fn(),
            }
        };
        // @ts-ignore
        global.navigator = {
            clipboard: {
                writeText: vi.fn()
            }
        };
    });

    afterEach(() => {
        global.window = originalWindow;
        global.navigator = originalNavigator;
    });

    it('returns null if hash is empty', () => {
        window.location.hash = '';
        expect(loadFlowFromUrl()).toBeNull();
    });

    it('returns null if hash does not start with #data=', () => {
        window.location.hash = '#somethingelse';
        expect(loadFlowFromUrl()).toBeNull();
    });

    it('correctly decompresses valid flow data', () => {
        const flowData = {
            nodes: [{ id: '1', type: 'custom' }],
            edges: [],
            previewNodeId: '1'
        };
        const json = JSON.stringify(flowData);
        const compressed = LZString.compressToEncodedURIComponent(json);
        window.location.hash = `#data=${compressed}`;

        const result = loadFlowFromUrl();
        expect(result).toEqual(flowData);
    });

    it('returns null for invalid compressed data', () => {
        window.location.hash = '#data=invalid_compressed_string';
        expect(loadFlowFromUrl()).toBeNull();
    });
});
