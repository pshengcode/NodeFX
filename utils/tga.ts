import { RawTextureData } from '../types';

const TGA_HEADER_SIZE = 18;

const readPixel = (view: DataView, offset: number, pixelDepth: number, grayscale: boolean) => {
    if (grayscale) {
        const value = view.getUint8(offset);
        return { step: 1, rgba: [value, value, value, 255] as const };
    }

    if (pixelDepth === 16) {
        const packed = view.getUint16(offset, true);
        const blue = Math.round(((packed & 0x1f) / 31) * 255);
        const green = Math.round((((packed >> 5) & 0x1f) / 31) * 255);
        const red = Math.round((((packed >> 10) & 0x1f) / 31) * 255);
        const alpha = (packed & 0x8000) !== 0 ? 255 : 0;
        return { step: 2, rgba: [red, green, blue, alpha] as const };
    }

    if (pixelDepth === 24) {
        const blue = view.getUint8(offset);
        const green = view.getUint8(offset + 1);
        const red = view.getUint8(offset + 2);
        return { step: 3, rgba: [red, green, blue, 255] as const };
    }

    if (pixelDepth === 32) {
        const blue = view.getUint8(offset);
        const green = view.getUint8(offset + 1);
        const red = view.getUint8(offset + 2);
        const alpha = view.getUint8(offset + 3);
        return { step: 4, rgba: [red, green, blue, alpha] as const };
    }

    throw new Error(`Unsupported TGA pixel depth: ${pixelDepth}`);
};

export const parseTga = (buffer: ArrayBuffer, id: string): RawTextureData => {
    if (buffer.byteLength < TGA_HEADER_SIZE) {
        throw new Error('Invalid TGA file: header is truncated');
    }

    const view = new DataView(buffer);
    const idLength = view.getUint8(0);
    const colorMapType = view.getUint8(1);
    const imageType = view.getUint8(2);
    const colorMapLength = view.getUint16(5, true);
    const colorMapDepth = view.getUint8(7);
    const width = view.getUint16(12, true);
    const height = view.getUint16(14, true);
    const pixelDepth = view.getUint8(16);
    const imageDescriptor = view.getUint8(17);

    if (width === 0 || height === 0) {
        throw new Error('Invalid TGA file: width and height must be greater than zero');
    }

    if (colorMapType !== 0) {
        throw new Error('Unsupported TGA file: color-mapped images are not supported');
    }

    const grayscale = imageType === 3 || imageType === 11;
    const rle = imageType === 10 || imageType === 11;
    const supportedImageType = imageType === 2 || imageType === 3 || imageType === 10 || imageType === 11;
    if (!supportedImageType) {
        throw new Error(`Unsupported TGA file: image type ${imageType} is not supported`);
    }

    if (![8, 16, 24, 32].includes(pixelDepth)) {
        throw new Error(`Unsupported TGA file: pixel depth ${pixelDepth} is not supported`);
    }

    if (grayscale && pixelDepth !== 8) {
        throw new Error(`Unsupported TGA grayscale depth: ${pixelDepth}`);
    }

    const colorMapBytes = Math.ceil(colorMapDepth / 8) * colorMapLength;
    let offset = TGA_HEADER_SIZE + idLength + colorMapBytes;
    if (offset > buffer.byteLength) {
        throw new Error('Invalid TGA file: pixel data offset is out of bounds');
    }

    const topToBottom = (imageDescriptor & 0x20) !== 0;
    const rightToLeft = (imageDescriptor & 0x10) !== 0;
    const pixelCount = width * height;
    const data = new Uint8ClampedArray(pixelCount * 4);

    const writePixel = (pixelIndex: number, rgba: readonly [number, number, number, number]) => {
        const srcX = pixelIndex % width;
        const srcY = Math.floor(pixelIndex / width);
        const x = rightToLeft ? (width - 1 - srcX) : srcX;
        const y = topToBottom ? srcY : (height - 1 - srcY);
        const dest = (y * width + x) * 4;
        data[dest] = rgba[0];
        data[dest + 1] = rgba[1];
        data[dest + 2] = rgba[2];
        data[dest + 3] = rgba[3];
    };

    let pixelIndex = 0;
    const readOne = () => {
        const pixel = readPixel(view, offset, pixelDepth, grayscale);
        offset += pixel.step;
        if (offset > buffer.byteLength + 1) {
            throw new Error('Invalid TGA file: pixel data is truncated');
        }
        return pixel.rgba;
    };

    if (!rle) {
        while (pixelIndex < pixelCount) {
            writePixel(pixelIndex, readOne());
            pixelIndex += 1;
        }
    } else {
        while (pixelIndex < pixelCount) {
            if (offset >= buffer.byteLength) {
                throw new Error('Invalid TGA file: RLE packet is truncated');
            }

            const packet = view.getUint8(offset);
            offset += 1;
            const runLength = (packet & 0x7f) + 1;

            if ((packet & 0x80) !== 0) {
                const rgba = readOne();
                for (let i = 0; i < runLength && pixelIndex < pixelCount; i += 1) {
                    writePixel(pixelIndex, rgba);
                    pixelIndex += 1;
                }
            } else {
                for (let i = 0; i < runLength && pixelIndex < pixelCount; i += 1) {
                    writePixel(pixelIndex, readOne());
                    pixelIndex += 1;
                }
            }
        }
    }

    return {
        isRaw: true,
        data,
        width,
        height,
        id,
    };
};