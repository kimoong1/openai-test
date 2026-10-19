const TAU = Math.PI * 2;
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const lerp = (a, b, t) => a + (b - a) * t;
const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${clamp(a, 0, 1)})`;

const PALETTES = {
  acid: { a: [211, 255, 98], b: [72, 245, 189], c: [235, 255, 236], d: [29, 97, 83] },
  ember: { a: [255, 173, 78], b: [255, 78, 92], c: [255, 237, 206], d: [111, 37, 43] },
  ice: { a: [143, 222, 255], b: [146, 141, 255], c: [235, 248, 255], d: [41, 66, 126] },
  mono: { a: [239, 243, 232], b: [140, 159, 173], c: [255, 255, 251], d: [69, 81, 90] },
};

function randomGenerator(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let n = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    n = (n + Math.imul(n ^ (n >>> 7), 61 | n)) ^ n;
    return ((n ^ (n >>> 14)) >>> 0) / 4294967296;
  };
}

function canvasElement(canvas, w, h) {
  const element = canvas.ownerDocument.createElement('canvas');
  element.width = w;
  element.height = h;
  return element;
}

function rotate(x, y, z, rx, ry, rz = 0) {
  let c = Math.cos(rx), s = Math.sin(rx);
  let yy = y * c - z * s, zz = y * s + z * c;
  c = Math.cos(ry); s = Math.sin(ry);
  const xx = x * c + zz * s;
  zz = -x * s + zz * c;
  c = Math.cos(rz); s = Math.sin(rz);
  return [xx * c - yy * s, xx * s + yy * c, zz];
}

/**
 * A dependency-free motion artwork renderer. Every frame is a pure function of
 * the supplied time and configuration: seeking, screenshots and video export
 * produce the same artwork as live playback. No previous frame is required.
 */
export class MotionRenderer {
  constructor(canvas) {
    if (!canvas?.getContext) throw new TypeError('MotionRenderer requires a canvas.');
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    if (!this.ctx) throw new Error('A 2D Canvas context is required to render motion artwork.');
    this.dpr = 1;
    this.destroyed = false;
    const random = randomGenerator(870264);
    this.particles = Array.from({ length: 6400 }, (_, i) => ({
      u: random() * TAU,
      v: random() * TAU,
      r: random(),
      size: random(),
      phase: random() * TAU,
      strand: i % 29,
    }));
    this.projected = this.particles.map(particle => ({ x: 0, y: 0, z: 0, s: 0, p: particle, light: 0, color: 0 }));
    this.particleOrder = this.projected.slice();
    this.stars = Array.from({ length: 260 }, () => ({
      x: random(), y: random(), r: random(), phase: random() * TAU,
    }));
    this.noise = canvasElement(canvas, 96, 96);
    const nc = this.noise.getContext('2d');
    const pixels = nc.createImageData(96, 96);
    for (let i = 0; i < pixels.data.length; i += 4) {
      const value = Math.floor(random() * 255);
      pixels.data[i] = value;
      pixels.data[i + 1] = value;
      pixels.data[i + 2] = value;
      pixels.data[i + 3] = 255;
    }
    nc.putImageData(pixels, 0, 0);
    this.noisePattern = this.ctx.createPattern(this.noise, 'repeat');
    this.sprites = [];
    this.spritePalette = '';
  }

  resize(width, height, dpr = 1) {
    if (this.destroyed) return;
    this.dpr = clamp(Number(dpr) || 1, 0.5, 4);
    this.canvas.width = Math.max(1, Math.round(width * this.dpr));
    this.canvas.height = Math.max(1, Math.round(height * this.dpr));
  }

  /**
   * @param {number} timeSeconds Absolute timeline position, in seconds.
   * @param {{scene?: 'vortex'|'kinetic'|'orbit'|'terrain'|'tunnel'|'bloom',
   * palette?: 'acid'|'ember'|'ice'|'mono', intensity?: number, detail?: number,
   * text?: string, pointer?: {x:number,y:number}, reducedMotion?: boolean}} config
   */
  render(timeSeconds, config = {}) {
    if (this.destroyed) return;
    const ctx = this.ctx;
    const actualW = this.canvas.width / this.dpr;
    const actualH = this.canvas.height / this.dpr;
    if (actualW < 1 || actualH < 1) return;
    // All drawing dimensions, including line widths and glow sprites, live in
    // the same virtual space for preview, PNG, and video output.
    const drawingScale = Math.max(actualW, actualH) / 1280;
    const w = actualW / drawingScale;
    const h = actualH / drawingScale;
    if (w < 1 || h < 1) return;
    const paletteName = PALETTES[config.palette] ? config.palette : 'acid';
    const p = PALETTES[paletteName];
    if (this.spritePalette !== paletteName) this.makeSprites(paletteName, p);
    const seconds = Number.isFinite(Number(timeSeconds)) ? Number(timeSeconds) : 0;
    const position = ((seconds % 8) + 8) % 8;
    // An eased outward-and-return journey is continuous at both ends of the
    // eight-second loop, including the first derivative (no wraparound flash).
    const t = config.reducedMotion ? 0 : (1 - Math.cos(TAU * position / 8)) * 4;
    const intensity = clamp(Number.isFinite(config.intensity) ? config.intensity : 0.72, 0, 1);
    const detail = clamp(Number.isFinite(config.detail) ? config.detail : 0.72, 0, 1);
    const pointer = {
      x: clamp(Number(config.pointer?.x) || 0, -1, 1),
      y: clamp(Number(config.pointer?.y) || 0, -1, 1),
    };
    ctx.setTransform(this.dpr * drawingScale, 0, 0, this.dpr * drawingScale, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.fillStyle = '#080b10';
    ctx.fillRect(0, 0, w, h);
    this.background(w, h, t, p, detail);
    ctx.save();
    switch (config.scene) {
      case 'kinetic': this.kinetic(w, h, t, p, intensity, detail, pointer, config.text); break;
      case 'orbit': this.orbit(w, h, t, p, intensity, detail, pointer); break;
      case 'terrain': this.terrain(w, h, t, p, intensity, detail, pointer); break;
      case 'tunnel': this.tunnel(w, h, t, p, intensity, detail, pointer); break;
      case 'bloom': this.bloom(w, h, t, p, intensity, detail, pointer); break;
      default: this.vortex(w, h, t, p, intensity, detail, pointer);
    }
    ctx.restore();
    this.finish(w, h);
  }

  makeSprites(name, p) {
    this.spritePalette = name;
    this.sprites = [p.a, p.b, p.c].map((color) => {
      const sprite = canvasElement(this.canvas, 64, 64);
      const ctx = sprite.getContext('2d');
      const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
      g.addColorStop(0, rgba(p.c, 0.95));
      g.addColorStop(0.07, rgba(color, 0.85));
      g.addColorStop(0.22, rgba(color, 0.28));
      g.addColorStop(0.55, rgba(color, 0.05));
      g.addColorStop(1, rgba(color, 0));
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 64, 64);
      return sprite;
    });
  }

  background(w, h, t, p, detail) {
    const c = this.ctx;
    const haze = c.createRadialGradient(w * 0.51, h * 0.46, 0, w * 0.51, h * 0.46, Math.max(w, h) * 0.55);
    haze.addColorStop(0, rgba(p.d, 0.18));
    haze.addColorStop(0.55, rgba(p.d, 0.035));
    haze.addColorStop(1, 'rgba(8,11,16,0)');
    c.fillStyle = haze;
    c.fillRect(0, 0, w, h);
    const count = Math.floor(90 + detail * 100);
    for (let i = 0; i < count; i++) {
      const s = this.stars[i];
      const x = ((s.x + Math.sin(t * 0.025 + s.phase) * 0.002) * w);
      const y = s.y * h;
      c.fillStyle = rgba(i % 4 ? p.b : p.c, 0.08 + s.r * 0.25);
      const size = s.r > 0.94 ? 1.5 : 0.75;
      c.fillRect(x, y, size, size);
    }
  }

  finish(w, h) {
    const c = this.ctx;
    const v = c.createRadialGradient(w * 0.5, h * 0.5, h * 0.18, w * 0.5, h * 0.5, Math.max(w, h) * 0.66);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(0.65, 'rgba(0,0,0,0.04)');
    v.addColorStop(1, 'rgba(0,0,0,0.55)');
    c.fillStyle = v;
    c.fillRect(0, 0, w, h);
    c.globalAlpha = 0.026;
    c.fillStyle = this.noisePattern;
    c.fillRect(0, 0, w, h);
    c.globalAlpha = 1;
  }

  vortex(w, h, t, p, intensity, detail, pointer) {
    const c = this.ctx;
    const cx = w * 0.53 + pointer.x * w * 0.018;
    const cy = h * 0.49 + pointer.y * h * 0.018;
    const scale = Math.min(w * 0.215, h * 0.185);
    const rx = 0.65 + Math.sin(t * 0.16) * 0.11 + pointer.y * 0.17;
    const ry = -0.18 + Math.sin(t * 0.12) * 0.28 + pointer.x * 0.17;
    const rz = -0.32 + Math.sin(t * 0.09) * 0.09;
    const sx = Math.sin(rx), cxr = Math.cos(rx), sy = Math.sin(ry), cyr = Math.cos(ry), sz = Math.sin(rz), cz = Math.cos(rz);
    const matrix = [cyr * cz, sx * sy * cz - cxr * sz, cxr * sy * cz + sx * sz,
      cyr * sz, sx * sy * sz + cxr * cz, cxr * sy * sz - sx * cz,
      -sy, sx * cyr, cxr * cyr];
    const projected = [0, 0, 0, 0];
    const project = (u, v, lift = 0) => {
      const radius = 1.43 + (0.53 + Math.sin(u * 3 + t * 0.18) * 0.045) * Math.cos(v);
      const x = radius * Math.cos(u), y = radius * Math.sin(u), z = Math.sin(v) * 0.53 + lift;
      const xx = x * matrix[0] + y * matrix[1] + z * matrix[2];
      const yy = x * matrix[3] + y * matrix[4] + z * matrix[5];
      const zz = x * matrix[6] + y * matrix[7] + z * matrix[8];
      const perspective = 5.8 / (5.8 + zz);
      projected[0] = cx + xx * scale * perspective;
      projected[1] = cy + yy * scale * perspective;
      projected[2] = zz;
      projected[3] = perspective;
      return projected;
    };
    const aura = c.createRadialGradient(cx, cy, scale * 0.4, cx, cy, scale * 2.35);
    aura.addColorStop(0, rgba(p.b, 0));
    aura.addColorStop(0.53, rgba(p.b, 0.045 + intensity * 0.035));
    aura.addColorStop(0.8, rgba(p.a, 0.018));
    aura.addColorStop(1, rgba(p.a, 0));
    c.fillStyle = aura;
    c.fillRect(0, 0, w, h);

    // Continuous windings make the cloud read as a woven surface, not a sprite cloud.
    const ribbons = Math.floor(13 + detail * 12);
    for (let j = 0; j < ribbons; j++) {
      c.beginPath();
      const phase = j / ribbons * TAU;
      for (let k = 0; k <= 210; k++) {
        const u = k / 210 * TAU;
        const v = u * 3 + phase + t * (0.11 + intensity * 0.13);
        const q = project(u, v);
        k ? c.lineTo(q[0], q[1]) : c.moveTo(q[0], q[1]);
      }
      c.lineWidth = j % 5 === 0 ? 1.4 : 0.8;
      c.strokeStyle = rgba(j % 3 ? p.b : p.a, j % 5 === 0 ? 0.44 : 0.19);
      c.stroke();
    }

    const points = this.particleOrder;
    const count = Math.floor(2700 + detail * 3700);
    points.length = count;
    for (let i = 0; i < count; i++) {
      const particle = this.particles[i];
      const u = particle.u + t * (0.035 + intensity * 0.045);
      // A broad distribution is pinched into fine helical bands at the lit edge.
      const v = particle.v + Math.sin(u * 3 + particle.phase) * 0.11 + t * 0.17;
      const q = project(u, v, (particle.r - 0.5) * 0.045);
      const light = (Math.cos(v - 0.8) + 1) * 0.5;
      const point = this.projected[i];
      point.x = q[0]; point.y = q[1]; point.z = q[2]; point.s = q[3]; point.light = light;
      point.color = Math.sin(u * 1.5 + v) > 0.36 ? 0 : 1;
      points[i] = point;
    }
    points.sort((a, b) => b.z - a.z);
    const particleColors = [p.a, p.b, p.c].map(color => Array.from({ length: 16 }, (_, i) => rgba(color, i / 15)));
    for (let i = 0; i < points.length; i++) {
      const q = points[i];
      const front = clamp((1.9 - q.z) / 3.8, 0, 1);
      const opacity = 0.4 + front * 0.38 + q.light * 0.2;
      const radius = (1.2 + q.p.size * 2.2) * q.s * (0.8 + intensity * 0.4);
      const colorIndex = q.light > 0.45 && q.p.size > 0.35 ? 2 : q.color;
      c.fillStyle = particleColors[colorIndex][Math.min(15, Math.floor(opacity * 15))];
      c.fillRect(q.x - radius / 2, q.y - radius / 2, radius, radius);
      if (q.p.size > 0.94 && q.light > 0.25) {
        const size = (20 + q.p.r * 20) * q.s;
        c.globalAlpha = 0.38 + front * 0.45;
        c.drawImage(this.sprites[q.color], q.x - size / 2, q.y - size / 2, size, size);
      }
    }
    c.globalAlpha = 1;

    // Sparse satellites and a quiet equatorial reference add scale.
    c.save();
    c.translate(cx, cy);
    c.rotate(-0.27);
    c.strokeStyle = rgba(p.b, 0.14);
    c.lineWidth = 0.7;
    c.beginPath(); c.ellipse(0, 0, scale * 2.4, scale * 0.66, 0, 0.12, Math.PI * 0.92); c.stroke();
    c.restore();
    for (let i = 0; i < 8; i++) {
      const angle = t * 0.06 + i * 2.39996;
      const q = project(angle, i * 0.8, Math.sin(i * 4) * 0.8);
      const size = 7;
      c.strokeStyle = rgba(p.c, 0.24);
      c.lineWidth = 0.6;
      c.beginPath(); c.moveTo(q[0] - size, q[1]); c.lineTo(q[0] + size, q[1]); c.moveTo(q[0], q[1] - size); c.lineTo(q[0], q[1] + size); c.stroke();
    }
  }

  kinetic(w, h, t, p, intensity, detail, pointer, text) {
    const c = this.ctx;
    const raw = String(text || 'MAKE IT MOVE').replace(/[\u0000-\u001f]/g, ' ').trim().toUpperCase().slice(0, 42) || 'MAKE IT MOVE';
    let lines = raw.split(/\s+/);
    if (lines.length > 3) {
      const half = Math.ceil(lines.length / 2);
      lines = [lines.slice(0, half).join(' '), lines.slice(half).join(' ')];
    }
    if (lines.length === 3 && raw.length < 15) lines = [lines[0], lines.slice(1).join(' ')];
    let size = h * (lines.length === 1 ? 0.42 : lines.length === 2 ? 0.285 : 0.215);
    const family = '"Arial Black", "Segoe UI", Arial, sans-serif';
    c.font = `900 ${size}px ${family}`;
    const widest = Math.max(...lines.map(line => c.measureText(line).width));
    if (widest > w * 0.84) size *= w * 0.84 / widest;
    const lineHeight = size * 0.92;
    const blockHeight = lineHeight * lines.length;
    const centerX = w * 0.5 + pointer.x * w * 0.014;
    const baseline = h * 0.5 - blockHeight / 2 + size * 0.78;

    // A huge fine outline frames the type while the diagonal rules imply velocity.
    c.save();
    c.translate(w / 2, h / 2);
    c.rotate(-0.12 + Math.sin(t * 0.16) * 0.025);
    for (let i = -5; i < 6; i++) {
      const y = i * h * 0.18 + Math.sin(t * 0.35) * h * 0.02;
      c.strokeStyle = rgba(p.b, i === 0 ? 0.12 : 0.045);
      c.lineWidth = 0.6;
      c.beginPath(); c.moveTo(-w, y); c.lineTo(w, y); c.stroke();
    }
    c.strokeStyle = rgba(p.a, 0.14);
    c.lineWidth = 1;
    c.strokeRect(-w * 0.37, -h * 0.34, w * 0.74, h * 0.68);
    c.restore();

    c.font = `900 ${size}px ${family}`;
    c.textAlign = 'center';
    c.textBaseline = 'alphabetic';
    const motion = (0.2 + intensity * 0.8);
    for (let row = 0; row < lines.length; row++) {
      const y = baseline + row * lineHeight;
      const drift = Math.sin(t * 0.67 + row * 1.2) * size * 0.025 * motion;
      const x = centerX + drift;
      // Thin, dimensional echoes remain continuous beneath the cut strips.
      for (let layer = 5; layer > 0; layer--) {
        c.lineWidth = 0.6;
        c.strokeStyle = rgba(p.b, 0.035 + (6 - layer) * 0.018);
        c.strokeText(lines[row], x - layer * size * 0.018, y + layer * size * 0.018);
      }
      const slices = 12 + Math.floor(detail * 6);
      for (let slice = 0; slice < slices; slice++) {
        const stripTop = y - size * 0.85 + slice / slices * size;
        const stripHeight = size / slices + 1;
        const phase = t * 0.9 + row * 1.8 + slice * 0.54;
        const offset = Math.pow(Math.sin(phase), 3) * size * 0.035 * motion;
        c.save();
        c.beginPath(); c.rect(0, stripTop, w, stripHeight); c.clip();
        c.fillStyle = slice === 4 || slice === 5 ? rgba(p.a, 1) : rgba(p.c, 0.96);
        c.fillText(lines[row], x + offset, y);
        if (slice === 4 || slice === 5) {
          c.fillStyle = rgba(p.b, 0.22);
          c.fillText(lines[row], x + offset + size * 0.035, y);
        }
        c.restore();
      }
    }

    // A bespoke star acts as a counterweight to the rectangular type.
    const starX = w * 0.84, starY = h * 0.22;
    const r = Math.min(w, h) * 0.045;
    c.save(); c.translate(starX, starY); c.rotate(t * 0.18);
    c.fillStyle = rgba(p.a, 0.95); c.beginPath();
    for (let i = 0; i < 24; i++) {
      const angle = i / 24 * TAU;
      const rad = i % 2 ? r * 0.25 : r;
      i ? c.lineTo(Math.cos(angle) * rad, Math.sin(angle) * rad) : c.moveTo(Math.cos(angle) * rad, Math.sin(angle) * rad);
    }
    c.closePath(); c.fill(); c.restore();
    c.fillStyle = rgba(p.b, 0.5);
    const bars = 22;
    for (let i = 0; i < bars; i++) {
      const bh = (4 + (Math.sin(i * 1.79 + t * 0.6) + 1) * 8) * h / 720;
      c.fillRect(w * 0.12 + i * 4 * w / 1200, h * 0.83 - bh, w / 1200 * 1.5, bh);
    }
  }

  orbit(w, h, t, p, intensity, detail, pointer) {
    const c = this.ctx;
    const cx = w * 0.5 + pointer.x * w * 0.025;
    const cy = h * 0.5 + pointer.y * h * 0.025;
    const unit = Math.min(w * 0.205, h * 0.32);
    const globe = unit * 0.58;
    const haze = c.createRadialGradient(cx, cy, globe * 0.6, cx, cy, unit * 2.45);
    haze.addColorStop(0, rgba(p.b, 0.09));
    haze.addColorStop(0.35, rgba(p.b, 0.045));
    haze.addColorStop(1, rgba(p.b, 0));
    c.fillStyle = haze; c.fillRect(0, 0, w, h);
    const project = (angle, orbit, radiusOffset = 0) => {
      const r = 1.65 + orbit * 0.145 + radiusOffset;
      const q = rotate(Math.cos(angle) * r, Math.sin(angle) * r, 0,
        0.34 + orbit * 0.42 + pointer.y * 0.12,
        -0.46 + orbit * 0.27 + Math.sin(t * 0.1) * 0.11,
        -0.42 + orbit * 0.24 + pointer.x * 0.12);
      const f = 5.5 / (5.5 + q[2]);
      return [cx + q[0] * unit * f, cy + q[1] * unit * f, q[2], f];
    };
    const orbits = 5;
    const drawPaths = (front) => {
      for (let j = 0; j < orbits; j++) {
        c.strokeStyle = rgba(j % 2 ? p.a : p.b, front ? 0.16 : 0.075);
        c.lineWidth = 0.65;
        c.beginPath();
        let drawing = false;
        for (let k = 0; k <= 240; k++) {
          const q = project(k / 240 * TAU, j);
          if ((q[2] <= 0) === front) {
            drawing ? c.lineTo(q[0], q[1]) : c.moveTo(q[0], q[1]);
            drawing = true;
          } else drawing = false;
        }
        c.stroke();
      }
      const satellites = 9 + Math.floor(detail * 8);
      for (let i = 0; i < satellites; i++) {
        const orbit = i % orbits;
        const speed = (0.1 + (i % 4) * 0.017) * (0.6 + intensity * 0.8);
        const head = t * speed + i * 2.39996;
        const length = 0.56 + (i % 3) * 0.21;
        const steps = 35 + Math.floor(detail * 22);
        const color = orbit % 2 ? p.a : p.b;
        for (let k = 0; k < steps; k++) {
          const a = head - length * (1 - k / steps);
          const q0 = project(a, orbit, (i % 3 - 1) * 0.018);
          const q1 = project(a + length / steps, orbit, (i % 3 - 1) * 0.018);
          if ((q0[2] <= 0) !== front) continue;
          const fade = (k + 1) / steps;
          c.strokeStyle = rgba(color, fade * fade * (front ? 0.84 : 0.24));
          c.lineWidth = (0.45 + fade * 1.45) * q0[3];
          c.beginPath(); c.moveTo(q0[0], q0[1]); c.lineTo(q1[0], q1[1]); c.stroke();
        }
        const q = project(head, orbit, (i % 3 - 1) * 0.018);
        if ((q[2] <= 0) === front) {
          const size = (front ? 26 : 13) * q[3];
          c.globalAlpha = front ? 0.95 : 0.3;
          c.drawImage(this.sprites[orbit % 2 ? 0 : 1], q[0] - size / 2, q[1] - size / 2, size, size);
          c.globalAlpha = 1;
          c.fillStyle = rgba(p.c, front ? 0.95 : 0.3);
          c.beginPath(); c.arc(q[0], q[1], front ? 1.25 : 0.7, 0, TAU); c.fill();
        }
      }
    };
    drawPaths(false);

    const aura = c.createRadialGradient(cx, cy, globe * 0.8, cx, cy, globe * 1.3);
    aura.addColorStop(0, rgba(p.b, 0));
    aura.addColorStop(0.68, rgba(p.b, 0.08));
    aura.addColorStop(0.83, rgba(p.b, 0.1));
    aura.addColorStop(1, rgba(p.b, 0));
    c.fillStyle = aura; c.beginPath(); c.arc(cx, cy, globe * 1.3, 0, TAU); c.fill();
    const body = c.createRadialGradient(cx - globe * 0.4, cy - globe * 0.45, 0, cx, cy, globe);
    body.addColorStop(0, '#162628'); body.addColorStop(0.6, '#0d181d'); body.addColorStop(1, '#080d13');
    c.fillStyle = body; c.beginPath(); c.arc(cx, cy, globe, 0, TAU); c.fill();
    c.save(); c.beginPath(); c.arc(cx, cy, globe, 0, TAU); c.clip();
    c.strokeStyle = rgba(p.b, 0.15); c.lineWidth = 0.65;
    for (let i = -4; i <= 4; i++) {
      const f = i / 5;
      const r = Math.sqrt(1 - f * f) * globe;
      c.beginPath(); c.ellipse(cx, cy + f * globe, r, r * 0.18, -0.18, 0, TAU); c.stroke();
    }
    for (let i = 0; i < 8; i++) {
      const width = Math.abs(Math.cos(i / 8 * Math.PI + t * 0.06)) * globe;
      c.beginPath(); c.ellipse(cx, cy, Math.max(width, 0.1), globe, -0.18, 0, TAU); c.stroke();
    }
    c.restore();
    c.strokeStyle = rgba(p.b, 0.45); c.lineWidth = 0.85;
    c.beginPath(); c.arc(cx, cy, globe, Math.PI * 0.92, Math.PI * 1.86); c.stroke();
    drawPaths(true);

    // Astronomical registration marks sit well outside the illuminated object.
    c.strokeStyle = rgba(p.c, 0.15); c.lineWidth = 0.6;
    for (let i = 0; i < 4; i++) {
      const x = cx + (i % 2 ? 1 : -1) * unit * 2.25;
      const y = cy + (i > 1 ? 1 : -1) * unit * 0.94;
      c.beginPath(); c.moveTo(x - 5, y); c.lineTo(x + 5, y); c.moveTo(x, y - 5); c.lineTo(x, y + 5); c.stroke();
    }
  }

  terrain(w, h, t, p, intensity, detail, pointer) {
    const c = this.ctx;
    const horizon = h * 0.24 + pointer.y * h * 0.016;
    const glow = c.createRadialGradient(w * 0.54, horizon + h * 0.03, 0, w * 0.54, horizon + h * 0.03, h * 0.45);
    glow.addColorStop(0, rgba(p.b, 0.16));
    glow.addColorStop(0.4, rgba(p.b, 0.045));
    glow.addColorStop(1, rgba(p.b, 0));
    c.fillStyle = glow; c.fillRect(0, 0, w, h);
    const cols = 96 + Math.floor(detail * 36);
    const rows = 54 + Math.floor(detail * 32);
    const amplitude = 0.65 + intensity * 0.75;
    const terrainHeight = (x, z) => {
      const ridge = Math.exp(-((x - Math.sin(t * 0.16) * 0.5) ** 2 / 4.3 + (z - 3.7) ** 2 / 8.4)) * 1.62;
      const wave = Math.sin(x * 1.1 + z * 0.82 + t * 0.28) * 0.36;
      const fine = Math.sin(Math.hypot(x * 0.85, z - 3.8) * 3.1 - t * 0.48) * 0.14;
      return (ridge + wave + fine) * amplitude;
    };
    const project = (x, z) => {
      const perspective = 1 / (0.7 + z * 0.16);
      return [w * 0.5 + (x + pointer.x * 0.25) * w * 0.087 * perspective,
        horizon + (8 - z) * h * 0.077 * perspective - terrainHeight(x, z) * h * 0.095 * perspective];
    };

    // The horizon's elliptical contour is deliberately incomplete, like a plotting instrument.
    c.strokeStyle = rgba(p.a, 0.14); c.lineWidth = 0.75;
    c.beginPath(); c.ellipse(w * 0.5, horizon + h * 0.005, w * 0.28, h * 0.052, -0.04, Math.PI * 1.03, Math.PI * 1.98); c.stroke();
    const grid = [];
    for (let row = 0; row < rows; row++) {
      const z = 8 - row / (rows - 1) * 8;
      const depth = row / (rows - 1);
      const points = [];
      for (let col = 0; col <= cols; col++) points.push(project(-7.8 + col / cols * 15.6, z));
      grid.push(points);
      c.beginPath();
      for (let col = 0; col <= cols; col++) col ? c.lineTo(...points[col]) : c.moveTo(...points[col]);
      c.strokeStyle = rgba(row % 7 === 0 ? p.a : p.b, (0.12 + depth * 0.5) * (row % 7 === 0 ? 1.25 : 1));
      c.lineWidth = row % 7 === 0 ? 1.15 : 0.68;
      c.stroke();
    }
    c.lineWidth = 0.55;
    for (let col = 0; col <= cols; col += 4) {
      c.beginPath();
      for (let row = 0; row < rows; row++) row ? c.lineTo(...grid[row][col]) : c.moveTo(...grid[row][col]);
      c.strokeStyle = rgba(p.b, col % 16 === 0 ? 0.22 : 0.075);
      c.stroke();
    }

    const nodes = 38 + Math.floor(detail * 50);
    for (let i = 0; i < nodes; i++) {
      const particle = this.particles[i];
      const x = (particle.r - 0.5) * 13;
      const z = 0.8 + ((particle.u / TAU * 6.4 + t * 0.025) % 6.4);
      const q = project(x, z);
      const size = particle.size > 0.7 ? 15 : 7;
      c.globalAlpha = 0.3 + particle.size * 0.45;
      c.drawImage(this.sprites[i % 2], q[0] - size / 2, q[1] - size / 2, size, size);
      c.globalAlpha = 1;
      c.fillStyle = rgba(p.c, 0.75);
      c.fillRect(q[0] - 0.6, q[1] - 0.6, 1.2, 1.2);
    }
    const mist = c.createLinearGradient(0, horizon - 30, 0, horizon + h * 0.2);
    mist.addColorStop(0, 'rgba(8,11,16,0.75)'); mist.addColorStop(1, 'rgba(8,11,16,0)');
    c.fillStyle = mist; c.fillRect(0, 0, w, horizon + h * 0.2);
  }

  tunnel(w, h, t, p, intensity, detail, pointer) {
    const c = this.ctx;
    const cx = w * 0.5 + pointer.x * w * 0.045;
    const cy = h * 0.5 + pointer.y * h * 0.045;
    const radius = Math.max(w * 0.58, h * 0.86);
    const vertices = [[-0.74, -1], [0.74, -1], [1, -0.74], [1, 0.74], [0.74, 1], [-0.74, 1], [-1, 0.74], [-1, -0.74]];
    const depthCount = 27 + Math.floor(detail * 15);
    const phase = ((t * (0.24 + intensity * 0.35)) % 1 + 1) % 1;
    const rotation = Math.sin(t * 0.115) * 0.14 + pointer.x * 0.045;
    const project = (point, depth) => {
      const scale = 0.15 / (depth + 0.07);
      const angle = rotation + depth * (0.8 + Math.sin(t * 0.09) * 0.25);
      const cr = Math.cos(angle), sr = Math.sin(angle);
      const x = point[0] * cr - point[1] * sr;
      const y = point[0] * sr + point[1] * cr;
      return [cx + x * radius * scale, cy + y * radius * scale * 0.78];
    };
    const core = c.createRadialGradient(cx, cy, 0, cx, cy, Math.min(w, h) * 0.55);
    core.addColorStop(0, rgba(p.b, 0.16)); core.addColorStop(0.23, rgba(p.b, 0.075)); core.addColorStop(1, rgba(p.b, 0));
    c.fillStyle = core; c.fillRect(0, 0, w, h);

    // Long rails tie the portals together; each line is an actual perspective trajectory.
    for (let i = 0; i < vertices.length; i++) {
      c.beginPath();
      for (let k = 0; k <= 100; k++) {
        const depth = 1 - k / 100;
        const q = project(vertices[i], depth);
        k ? c.lineTo(q[0], q[1]) : c.moveTo(q[0], q[1]);
      }
      c.strokeStyle = rgba(i % 2 ? p.a : p.b, 0.18);
      c.lineWidth = 0.7; c.stroke();
    }

    for (let i = depthCount; i >= 0; i--) {
      const depth = (i + 1 - phase) / depthCount;
      const front = 1 - depth;
      const opacity = clamp((0.12 + front * 0.56) * Math.min(1, depth * 20), 0, 1);
      const points = vertices.map(point => project(point, depth));
      c.beginPath();
      points.forEach((point, index) => index ? c.lineTo(...point) : c.moveTo(...point));
      c.closePath();
      c.lineWidth = i % 5 === 0 ? 1.8 : 0.75;
      c.strokeStyle = rgba(i % 5 === 0 ? p.a : p.b, opacity * (i % 5 === 0 ? 1 : 0.55));
      c.stroke();
      if (i % 5 === 0) {
        c.lineWidth = 6 + front * 4;
        c.strokeStyle = rgba(p.b, opacity * 0.035); c.stroke();
      }
      // Carefully placed bright joints, rather than full-frame glow, retain crisp edges.
      if (i % 3 === 0) {
        for (let j = 0; j < points.length; j += 2) {
          const a = points[j], b = points[(j + 1) % points.length];
          c.strokeStyle = rgba(p.c, opacity * 0.85); c.lineWidth = 1.3;
          c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(lerp(a[0], b[0], 0.12), lerp(a[1], b[1], 0.12)); c.stroke();
          if (depth > 0.12 && depth < 0.68) {
            const size = 10;
            c.globalAlpha = opacity * 0.55;
            c.drawImage(this.sprites[j % 3], a[0] - size / 2, a[1] - size / 2, size, size);
            c.globalAlpha = 1;
          }
        }
      }
    }

    // Fine longitudinal ticks travel slowly through the architecture.
    const marks = 60 + Math.floor(detail * 70);
    for (let i = 0; i < marks; i++) {
      const particle = this.particles[i];
      const edge = i % 8;
      const a = vertices[edge], b = vertices[(edge + 1) % 8];
      const point = [lerp(a[0], b[0], particle.r), lerp(a[1], b[1], particle.r)];
      const depth = 0.1 + ((particle.u / TAU + t * 0.035) % 1) * 0.85;
      const q = project(point, depth), q2 = project(point, depth + 0.006);
      c.strokeStyle = rgba(i % 3 ? p.b : p.a, (1 - depth) * 0.45);
      c.lineWidth = 0.85;
      c.beginPath(); c.moveTo(...q); c.lineTo(...q2); c.stroke();
    }
    c.strokeStyle = rgba(p.c, 0.4); c.lineWidth = 0.75;
    c.beginPath(); c.moveTo(cx - 4, cy); c.lineTo(cx + 4, cy); c.moveTo(cx, cy - 4); c.lineTo(cx, cy + 4); c.stroke();
  }

  bloom(w, h, t, p, intensity, detail, pointer) {
    const c = this.ctx;
    const cx = w * 0.5 + pointer.x * w * 0.025;
    const cy = h * 0.5 + pointer.y * h * 0.025;
    const radius = Math.min(w * 0.32, h * 0.38);
    const breath = 1 + Math.sin(t * 0.42) * 0.035 * intensity;
    const glow = c.createRadialGradient(cx, cy, 0, cx, cy, radius * 1.55);
    glow.addColorStop(0, rgba(p.b, 0.11)); glow.addColorStop(0.55, rgba(p.a, 0.035)); glow.addColorStop(1, rgba(p.a, 0));
    c.fillStyle = glow; c.fillRect(0, 0, w, h);

    c.save(); c.translate(cx, cy);
    c.rotate(-Math.PI * 0.5 + t * 0.035);
    const petalCount = 11;
    const layers = 3 + Math.round(detail);
    for (let layer = 0; layer < layers; layer++) {
      const layerScale = (1 - layer * 0.16) * breath;
      const layerRotation = layer * 0.31 + Math.sin(t * 0.21 + layer) * 0.09 * intensity;
      for (let j = 0; j < petalCount; j++) {
        const angle = j / petalCount * TAU + layerRotation;
        const wave = Math.sin(t * 0.35 + j * 0.55 + layer * 1.3);
        const length = radius * layerScale * (0.94 + wave * 0.055 * intensity);
        const width = length * (0.27 + layer * 0.018);
        const root = radius * (0.07 + layer * 0.012);
        const fold = Math.sin(t * 0.28 + j * 0.7) * width * 0.23 * intensity;
        c.save(); c.rotate(angle);
        // Each leaf has a broad translucent face and a tightly folded reflective rim.
        const gradient = c.createLinearGradient(root, -width, length, width * 0.5);
        gradient.addColorStop(0, rgba(p.b, 0.015));
        gradient.addColorStop(0.3, rgba(j % 2 ? p.b : p.a, 0.08));
        gradient.addColorStop(0.58, rgba(p.b, 0.19 + layer * 0.015));
        gradient.addColorStop(0.85, rgba(p.a, 0.07));
        gradient.addColorStop(1, rgba(p.c, 0.22));
        c.beginPath();
        c.moveTo(root, 0);
        c.bezierCurveTo(length * 0.32, -width * 0.36, length * 0.68, -width + fold, length, 0);
        c.bezierCurveTo(length * 0.79, width * 0.66, length * 0.35, width * 0.75, root, 0);
        c.closePath();
        c.globalCompositeOperation = 'screen';
        c.fillStyle = gradient; c.fill();
        c.strokeStyle = rgba(j % 2 ? p.b : p.a, 0.32 + layer * 0.045); c.lineWidth = 0.85; c.stroke();
        c.beginPath(); c.moveTo(root, 0);
        c.bezierCurveTo(length * 0.36, width * 0.12, length * 0.74, -width * 0.3 + fold, length, 0);
        c.strokeStyle = rgba(p.c, 0.4); c.lineWidth = 0.55; c.stroke();
        const veins = 4 + Math.floor(detail * 3);
        for (let k = 1; k < veins; k++) {
          const v = k / veins;
          c.beginPath(); c.moveTo(root, 0);
          c.bezierCurveTo(length * 0.3, -width * 0.2 * v, length * 0.7, (-width + fold) * v, length, 0);
          c.strokeStyle = rgba(p.b, 0.035 + v * 0.045); c.lineWidth = 0.45; c.stroke();
        }
        c.restore();
      }
    }
    c.restore();
    c.globalCompositeOperation = 'source-over';

    // A delicate orbital rosette surrounds the glass form without competing with it.
    c.strokeStyle = rgba(p.b, 0.2); c.lineWidth = 0.65; c.beginPath();
    for (let k = 0; k <= 400; k++) {
      const angle = k / 400 * TAU;
      const r = radius * (1.08 + Math.cos(angle * 11 + t * 0.11) * 0.016);
      const x = cx + Math.cos(angle) * r, y = cy + Math.sin(angle) * r;
      k ? c.lineTo(x, y) : c.moveTo(x, y);
    }
    c.closePath(); c.stroke();
    const coreR = radius * 0.105;
    const core = c.createRadialGradient(cx - coreR * 0.35, cy - coreR * 0.4, 0, cx, cy, coreR);
    core.addColorStop(0, rgba(p.c, 0.95)); core.addColorStop(0.13, rgba(p.a, 0.7));
    core.addColorStop(0.45, rgba(p.b, 0.24)); core.addColorStop(0.9, '#101c20'); core.addColorStop(1, rgba(p.b, 0.4));
    c.fillStyle = core; c.beginPath(); c.arc(cx, cy, coreR, 0, TAU); c.fill();
    c.strokeStyle = rgba(p.c, 0.45); c.lineWidth = 0.6;
    c.beginPath(); c.arc(cx, cy, coreR * 1.16, 0, TAU); c.stroke();
    for (let i = 0; i < 35 + detail * 25; i++) {
      const particle = this.particles[i];
      const angle = particle.u + t * 0.026;
      const r = radius * (1.15 + particle.r * 0.42);
      const x = cx + Math.cos(angle) * r, y = cy + Math.sin(angle) * r;
      c.fillStyle = rgba(i % 2 ? p.b : p.a, 0.15 + particle.size * 0.4);
      c.fillRect(x, y, particle.size > 0.8 ? 1.5 : 0.7, particle.size > 0.8 ? 1.5 : 0.7);
    }
  }

  destroy() {
    this.destroyed = true;
    this.sprites = [];
    this.particles = [];
    this.projected = [];
    this.particleOrder = [];
    this.stars = [];
    this.noisePattern = null;
    this.noise = null;
  }
}
