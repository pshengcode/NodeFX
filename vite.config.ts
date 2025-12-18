/// <reference types="vitest" />
import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(({ mode }) => {
    const isProd = mode === 'production';

    const getVendorChunkName = (id: string): string | null => {
      const index = id.lastIndexOf('node_modules/');
      if (index === -1) return null;
      const rest = id.slice(index + 'node_modules/'.length);
      const parts = rest.split('/');
      if (parts.length === 0) return null;
      const isScoped = parts[0].startsWith('@');
      const pkg = isScoped && parts.length >= 2 ? `${parts[0]}/${parts[1]}` : parts[0];
      return pkg
        .replace(/^@/, '')
        .replace(/[\\/]/g, '_');
    };

    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      build: {
        chunkSizeWarningLimit: 600, // Increase limit as we have code-split large components
        rollupOptions: {
          output: {
            manualChunks(id) {
              if (!id.includes('node_modules/')) return;

              // keep a few high-impact libs stable
              if (id.includes('node_modules/reactflow/')) return 'vendor_reactflow';
              if (id.includes('node_modules/@monaco-editor/')) return 'vendor_monaco';
              if (id.includes('node_modules/monaco-editor/')) return 'vendor_monaco';
              if (id.includes('node_modules/react-dom/')) return 'vendor_react';
              if (id.includes('node_modules/react/')) return 'vendor_react';

              const pkg = getVendorChunkName(id);
              return pkg ? `vendor_${pkg}` : 'vendor';
            },
          },
        },
      },
      plugins: [
        tailwindcss(),
        react(),
      ],
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
