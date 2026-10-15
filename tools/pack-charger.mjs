// Float32 matches THREE.Float32BufferAttribute in the original JSON loader.
import {readFile, writeFile} from 'node:fs/promises';
import {brotliCompressSync} from 'node:zlib';
const root = new URL('../assets/', import.meta.url);
const model = JSON.parse(await readFile(new URL('charger-model.json', root), 'utf8'));
let byteOffset = 0;
const buffers = [], meshes = model.meshes.map(mesh => {
  const result = {name: mesh.name, color: mesh.color};
  for (const field of ['positions','normals']) {
    const values = new Float32Array(mesh[field]);
    const bytes = Buffer.alloc(values.byteLength);
    for (let i = 0; i < values.length; i++) bytes.writeFloatLE(values[i], i * 4);
    result[field] = {byteOffset, length: values.length};
    byteOffset += bytes.length; buffers.push(bytes);
  }
  return result;
});
const binary = Buffer.concat(buffers);
await writeFile(new URL('charger-mesh.bin', root), binary);
await writeFile(new URL('charger-mesh.bin.br', root), brotliCompressSync(binary));
await writeFile(new URL('charger-mesh.json', root), JSON.stringify({format:'float32-le', meshes}));
console.log(`Charger: ${byteOffset} binary bytes, ${meshes.length} meshes; source JSON preserved.`);
