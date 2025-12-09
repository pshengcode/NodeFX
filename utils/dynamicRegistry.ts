
export type DynamicTextureSource = HTMLCanvasElement | { width: number, height: number, data: Float32Array };

export const dynamicRegistry = new Map<string, DynamicTextureSource>();

export const registerDynamicTexture = (id: string, source: DynamicTextureSource) => {
    dynamicRegistry.set(id, source);
};

export const unregisterDynamicTexture = (id: string) => {
    dynamicRegistry.delete(id);
};

export const getDynamicTexture = (id: string) => {
    return dynamicRegistry.get(id);
};
