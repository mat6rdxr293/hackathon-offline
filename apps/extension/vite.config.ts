import fs from 'node:fs';
import path from 'node:path';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const stripDistPrefix = (value: string): string => value.replace(/^dist\//, '');

const rewriteManifestForDist = (manifestRaw: string): string => {
  const manifest = JSON.parse(manifestRaw) as {
    action?: { default_popup?: string };
    background?: { service_worker?: string; type?: string };
    content_scripts?: Array<{ matches?: string[]; js?: string[]; run_at?: string }>;
    web_accessible_resources?: Array<{ resources?: string[]; matches?: string[] }>;
  };

  if (manifest.action?.default_popup) {
    manifest.action.default_popup = stripDistPrefix(manifest.action.default_popup);
  }

  if (manifest.background?.service_worker) {
    manifest.background.service_worker = stripDistPrefix(manifest.background.service_worker);
  }

  if (manifest.content_scripts?.length) {
    manifest.content_scripts = manifest.content_scripts.map((entry) => ({
      ...entry,
      js: (entry.js ?? []).map(stripDistPrefix),
    }));
  }

  if (manifest.web_accessible_resources?.length) {
    manifest.web_accessible_resources = manifest.web_accessible_resources.map((entry) => ({
      ...entry,
      resources: (entry.resources ?? []).map(stripDistPrefix),
    }));
  }

  return `${JSON.stringify(manifest, null, 2)}\n`;
};

const copyManifestPlugin = () => ({
  name: 'copy-manifest',
  closeBundle() {
    const source = path.resolve(__dirname, 'manifest.json');
    const destination = path.resolve(__dirname, 'dist/manifest.json');
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    const manifestRaw = fs.readFileSync(source, 'utf8');
    fs.writeFileSync(destination, rewriteManifestForDist(manifestRaw), 'utf8');
  },
});

export default defineConfig({
  plugins: [react(), copyManifestPlugin()],
  base: './',
  build: {
    target: 'es2022',
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        panel: path.resolve(__dirname, 'panel.html'),
        popup: path.resolve(__dirname, 'popup.html'),
        background: path.resolve(__dirname, 'src/background/index.ts'),
        content: path.resolve(__dirname, 'src/content/index.ts'),
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: 'assets/[name].js',
        assetFileNames: 'assets/[name][extname]',
      },
    },
  },
});
