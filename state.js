/** Pure, validated preset format. No executable code or remote assets in presets. */
export const SCENES = ['vortex', 'kinetic', 'orbit', 'terrain', 'tunnel', 'bloom'];
export const PALETTES = ['acid', 'ember', 'ice', 'mono'];
export const ASPECTS = ['16:10', '16:9', '1:1', '9:16'];
export const DURATION = 8;
export const DEFAULTS = Object.freeze({scene:'vortex', palette:'acid', intensity:0.65, detail:0.75, text:'MAKE WAVES', aspect:'16:10', speed:1});
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
export function normalizePreset(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('올바른 FLUX 프리셋 파일이 아닙니다.');
  if (value.version !== undefined && value.version !== 1) throw new TypeError('지원하지 않는 프리셋 버전입니다.');
  const source = value.config && typeof value.config === 'object' ? value.config : value;
  const numeric = (name, min, max) => typeof source[name] === 'number' && Number.isFinite(source[name]) ? clamp(source[name],min,max) : DEFAULTS[name];
  return {
    scene:SCENES.includes(source.scene) ? source.scene : DEFAULTS.scene,
    palette:PALETTES.includes(source.palette) ? source.palette : DEFAULTS.palette,
    intensity:numeric('intensity',0,1), detail:numeric('detail',0.2,1),
    text:typeof source.text === 'string' ? Array.from(source.text.replace(/[\u0000-\u001f\u007f]/g,'')).slice(0,24).join('') : DEFAULTS.text,
    aspect:ASPECTS.includes(source.aspect) ? source.aspect : DEFAULTS.aspect,
    speed:[0.5,1,1.5,2].includes(source.speed) ? source.speed : DEFAULTS.speed
  };
}
export function serializePreset(config) { return {app:'FLUX', version:1, config:normalizePreset(config)}; }
export function encodePreset(config) { return '#preset=' + encodeURIComponent(JSON.stringify(serializePreset(config))); }
export function decodePreset(hash) {
  if (!hash || !hash.startsWith('#preset=')) return null;
  if (hash.length > 8192) throw new RangeError('프리셋 링크가 너무 깁니다.');
  return normalizePreset(JSON.parse(decodeURIComponent(hash.slice(8))));
}
export function outputSize(aspect, longEdge = 1280) {
  if (!ASPECTS.includes(aspect)) throw new TypeError('지원하지 않는 화면 비율입니다.');
  const [w,h]=aspect.split(':').map(Number);
  // Even dimensions are compatible with browser video codecs.
  return w>=h ? [longEdge,Math.round(longEdge*h/w/2)*2] : [Math.round(longEdge*w/h/2)*2,longEdge];
}
