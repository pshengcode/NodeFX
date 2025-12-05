
export const dynamicRegistry = new Map<string, HTMLCanvasElement>();

export const registerDynamicTexture = (id: string, canvas: HTMLCanvasElement) => {
    dynamicRegistry.set(id, canvas);
};

export const unregisterDynamicTexture = (id: string) => {
    dynamicRegistry.delete(id);
};

export const getDynamicTexture = (id: string) => {
    return dynamicRegistry.get(id);
};
