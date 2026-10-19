import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULTS,SCENES,PALETTES,normalizePreset,serializePreset,encodePreset,decodePreset,outputSize} from './state.js';
test('presets round-trip Korean text, colors, scene and numeric settings',()=>{
  for(const scene of SCENES)for(const palette of PALETTES){const config={...DEFAULTS,scene,palette,text:'움직여라 ✳ & < >',speed:2};assert.deepEqual(decodePreset(encodePreset(config)),config);assert.deepEqual(normalizePreset(serializePreset(config)),config);}
});
test('untrusted presets clamp numbers, drop unknown keys and reject versions',()=>{
  const config=normalizePreset({scene:'<script>',palette:'hacked',intensity:500,detail:-2,speed:3,text:'A\u0000B'+'x'.repeat(40),aspect:'0:0',pointer:'malicious',__proto__:{bad:true}});
  assert.equal(config.scene,'vortex');assert.equal(config.palette,'acid');assert.equal(config.intensity,1);assert.equal(config.detail,0.2);assert.equal(config.speed,1);assert.equal(config.text.length,24);assert.equal(config.text.slice(0,2),'AB');assert.equal(config.aspect,'16:10');assert.equal(Object.hasOwn(config,'pointer'),false);
  assert.equal(normalizePreset({intensity:NaN,detail:Infinity}).intensity,DEFAULTS.intensity);
  assert.throws(()=>normalizePreset({version:2}));assert.throws(()=>normalizePreset(null));assert.throws(()=>normalizePreset([]));assert.throws(()=>decodePreset('#preset='+'x'.repeat(9000)));assert.equal(decodePreset('#other'),null);
});
test('portrait, square and landscape encode to even video dimensions',()=>{
  assert.deepEqual(outputSize('16:10'),[1280,800]);assert.deepEqual(outputSize('16:9'),[1280,720]);assert.deepEqual(outputSize('1:1'),[1280,1280]);assert.deepEqual(outputSize('9:16'),[720,1280]);assert.throws(()=>outputSize('0:0'));
});
