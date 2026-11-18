// Jednoplikowy podgląd (bez service workera) — do obejrzenia aplikacji bez instalacji.
import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

export default defineConfig({
  base: './',
  plugins: [preact(), viteSingleFile()],
  define: {
    'import.meta.env.VITE_PREVIEW': '"1"',
    'import.meta.env.VITE_NO_SW': '"1"',
  },
  build: { outDir: 'dist-preview', assetsInlineLimit: 100_000_000 },
});
