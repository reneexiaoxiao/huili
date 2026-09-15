import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath, URL } from 'node:url';
export default defineConfig({ plugins: [tailwindcss()], resolve: { alias: {
  '@': fileURLToPath(new URL('./client/src', import.meta.url)),
  '@shared': fileURLToPath(new URL('./shared', import.meta.url)),
} }, server: { port: 8136, strictPort: true }, build: { outDir: 'dist' } });
