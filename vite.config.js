import { defineConfig } from "vite";

export default defineConfig({
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
            }
        }
    }
});
