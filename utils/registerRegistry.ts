export const sanitizeRegisterName = (name: string) => {
    const trimmed = name.trim();
    const collapsed = trimmed.replace(/[^a-zA-Z0-9_]+/g, '_').replace(/^_+|_+$/g, '');
    return collapsed;
};

export const buildRegisterTextureId = (name: string, fallbackId: string) => {
    const safe = sanitizeRegisterName(name);
    const finalName = safe.length > 0 ? safe : fallbackId;
    return `dynamic://register_${finalName}`;
};
