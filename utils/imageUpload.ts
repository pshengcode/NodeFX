import { RawTextureData } from '../types';
import { parseTga } from './tga';

const TGA_EXTENSIONS = ['.tga', '.icb', '.vda', '.vst'];

const isTgaFile = (file: File) => {
    const lowerName = file.name.toLowerCase();
    return TGA_EXTENSIONS.some(ext => lowerName.endsWith(ext)) || file.type === 'image/x-tga' || file.type === 'image/tga';
};

const readFileAsDataUrl = (file: File) => new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => {
        if (typeof event.target?.result === 'string') {
            resolve(event.target.result);
            return;
        }
        reject(new Error('Failed to read image file as data URL'));
    };
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read image file'));
    reader.readAsDataURL(file);
});

export const rawTextureToDataUrl = (texture: RawTextureData): string | null => {
    if (typeof document === 'undefined') return null;

    const canvas = document.createElement('canvas');
    canvas.width = texture.width;
    canvas.height = texture.height;
    const context = canvas.getContext('2d');
    if (!context) return null;

    const imageData = new ImageData(texture.data, texture.width, texture.height);
    context.putImageData(imageData, 0, 0);
    return canvas.toDataURL('image/png');
};

export const resolveImagePreviewUrl = async (value: string | RawTextureData | undefined | null): Promise<string | null> => {
    if (!value) return null;
    if (typeof value === 'string') return value;
    return rawTextureToDataUrl(value);
};

export const loadImageAssetFromFile = async (file: File, rawTextureId: string): Promise<{ assetData: string | RawTextureData; previewUrl: string | null }> => {
    if (isTgaFile(file)) {
        const buffer = await file.arrayBuffer();
        const texture = parseTga(buffer, rawTextureId);
        return {
            assetData: texture,
            previewUrl: rawTextureToDataUrl(texture),
        };
    }

    const dataUrl = await readFileAsDataUrl(file);
    return {
        assetData: dataUrl,
        previewUrl: dataUrl,
    };
};