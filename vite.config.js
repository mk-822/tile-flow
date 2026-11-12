import { readFile } from 'node:fs/promises';
import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    license: { fileName: 'third-party-licenses.md' }
  },
  plugins: [{
    name: 'tile-flow-license',
    apply: 'build',
    async generateBundle() {
      const source = await readFile(new URL('./LICENSE', import.meta.url), 'utf8');
      this.emitFile({ type: 'asset', fileName: 'LICENSE.txt', source });
    }
  }]
});
