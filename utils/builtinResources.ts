
export interface BuiltinResource {
    id: string;
    label: string;
    type: 'texture' | 'mesh';
    url: string; // Can be a remote URL or a base64 string
    thumbnail?: string;
}

// 1. Static Definitions (Removed)

// 2. Dynamic Local Textures (from assets/textures folder)
// Vite's import.meta.glob will find all images in that folder and return their URLs
const localModules = import.meta.glob('../assets/textures/*.{png,jpg,jpeg,webp,svg}', { eager: true, as: 'url' });

const LOCAL_TEXTURES: BuiltinResource[] = Object.entries(localModules).map(([path, url]) => {
    // path is like "../assets/textures/my_image.png"
    const filename = path.split('/').pop() || '';
    const name = filename.split('.')[0]; // "my_image"
    
    // Format label: "my_image" -> "My Image"
    const label = name
        .split(/[_-]/)
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');

    return {
        id: `builtin://texture/${name}`,
        label: label,
        type: 'texture',
        url: url as string
    };
});

export const BUILTIN_TEXTURES: BuiltinResource[] = [
    ...LOCAL_TEXTURES
];

export const getBuiltinResource = (id: string): BuiltinResource | undefined => {
    return BUILTIN_TEXTURES.find(r => r.id === id);
};
