import { describe, expect, it } from 'vitest';
import { parseTga } from './tga';

const buildHeader = (options: { imageType: number; width: number; height: number; pixelDepth: number; descriptor?: number }) => {
    const header = new Uint8Array(18);
    header[2] = options.imageType;
    header[12] = options.width & 0xff;
    header[13] = (options.width >> 8) & 0xff;
    header[14] = options.height & 0xff;
    header[15] = (options.height >> 8) & 0xff;
    header[16] = options.pixelDepth;
    header[17] = options.descriptor ?? 0x20;
    return header;
};

describe('parseTga', () => {
    it('parses uncompressed 24-bit TGA into top-left RGBA pixels', () => {
        const header = buildHeader({ imageType: 2, width: 2, height: 2, pixelDepth: 24, descriptor: 0x20 });
        const pixels = new Uint8Array([
            0, 0, 255,
            0, 255, 0,
            255, 0, 0,
            255, 255, 255,
        ]);
        const buffer = new Uint8Array(header.length + pixels.length);
        buffer.set(header, 0);
        buffer.set(pixels, header.length);

        const parsed = parseTga(buffer.buffer, 'sample');
        expect(parsed.width).toBe(2);
        expect(parsed.height).toBe(2);
        expect(Array.from(parsed.data)).toEqual([
            255, 0, 0, 255,
            0, 255, 0, 255,
            0, 0, 255, 255,
            255, 255, 255, 255,
        ]);
    });

    it('parses RLE 32-bit TGA packets', () => {
        const header = buildHeader({ imageType: 10, width: 3, height: 1, pixelDepth: 32, descriptor: 0x20 | 0x08 });
        const packets = new Uint8Array([
            0x81,
            10, 20, 30, 255,
            0x00,
            40, 50, 60, 255,
        ]);
        const buffer = new Uint8Array(header.length + packets.length);
        buffer.set(header, 0);
        buffer.set(packets, header.length);

        const parsed = parseTga(buffer.buffer, 'rle');
        expect(Array.from(parsed.data)).toEqual([
            30, 20, 10, 255,
            30, 20, 10, 255,
            60, 50, 40, 255,
        ]);
    });
});