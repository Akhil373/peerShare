import { defineConfig } from "vite";

export default defineConfig({
    server: {
        allowedHosts: ['.ngrok-free.dev']
    },
    build: {
        rollupOptions: {
            input: {
                main: 'index.html',
                sw: 'src/sw.js'
            },
            output: {
                entryFileNames: (assetInfo) => {
                    return assetInfo.name === 'sw' ? 'sw.js' : 'assets/[name]-[hash].js';
                }
            },
        }
    }
});
