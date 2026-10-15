import {defineConfig} from 'vite';
import {cpSync, existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const path = value => fileURLToPath(new URL(value, import.meta.url));

export default defineConfig({
  publicDir: false,
  resolve: {alias: [{find: /^three$/, replacement: path('./vendor/three/three.module.js')}, {find: /^three\/addons\//, replacement: path('./vendor/three/addons/')}]},
  build: {
    assetsDir: 'build-assets', assetsInlineLimit: 0,
    cssCodeSplit: true,
    rollupOptions: {input: {home: path('./index.html'), district: path('./district.html'), polygon: path('./polygon3d.html'), missing: path('./404.html')}},
  },
  worker: {format:'es'},
  plugins: [{name:'preserve-static-data', closeBundle() {
    for (const item of ['data','assets','vendor/leaflet','docs','research','design-options','design-options-v3','preview','previews','robots.txt','sitemap.xml']) {
      if (existsSync(path('./' + item))) cpSync(path('./' + item), path('./dist/' + item), {recursive:true});
    }
  }}],
});
