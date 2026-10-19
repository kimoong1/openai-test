// Optional portable build. The normal app needs neither this step nor packages.
import { readFile, writeFile } from 'node:fs/promises';
const read = name => readFile(new URL(name,import.meta.url),'utf8');
const [html,css,renderer,state,app,icon] = await Promise.all(['index.html','style.css','renderer.js','state.js','app.js','favicon.svg'].map(read));
const stateNames=['DEFAULTS','SCENES','PALETTES','DURATION','normalizePreset','serializePreset','encodePreset','decodePreset','outputSize'];
const source = `const {MotionRenderer}=(()=>{\n${renderer.replace(/^export /gm,'')}\nreturn {MotionRenderer};})();\nconst {${stateNames.join(',')}}=(()=>{\n${state.replace(/^export /gm,'')}\nreturn {${stateNames.join(',')}};})();\n${app.replace(/^import .*;\r?\n/gm,'')}`;
const result=html.replace('<link rel="stylesheet" href="./style.css">',`<style>\n${css}\n</style>`)
  .replace('href="./favicon.svg"',`href="data:image/svg+xml,${encodeURIComponent(icon.trim())}"`)
  .replace('<script type="module" src="./app.js"></script>',`<script type="module">\n${source.replace(/<\/script/gi,'<\\/script')}\n</script>`);
await writeFile(new URL('FLUX.html',import.meta.url),result);
console.log('FLUX.html created: a portable, self-contained motion studio.');
