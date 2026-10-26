/* ═══════════════════════════════════════════════════════════════════
   WD PARTICLE ENGINE
   A small WebGL particle system that samples the WD mark's alpha
   channel and reconstructs it from thousands of GPU points.
   Depends on: three.js
═══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function smoothstep(min, max, value) {
    var x = clamp((value - min) / (max - min), 0, 1);
    return x * x * (3 - 2 * x);
  }

  function mulberry32(seed) {
    return function random() {
      seed |= 0;
      seed = (seed + 0x6D2B79F5) | 0;
      var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  var vertexShader = [
    'attribute float aSize;',
    'attribute float aSeed;',
    'attribute float aAlpha;',
    'attribute vec3 aColor;',
    'uniform float uTime;',
    'uniform float uPixelRatio;',
    'uniform float uSizeMul;',
    'uniform float uOpacity;',
    'uniform float uReveal;',
    'uniform float uWavePos;',
    'uniform float uWaveWidth;',
    'uniform float uWaveStrength;',
    'varying vec3 vColor;',
    'varying float vAlpha;',
    'void main() {',
    '  vec3 pos = position;',
    '  float twinkle = 0.70 + 0.30 * sin(uTime * (1.15 + aSeed * 2.2) + aSeed * 31.4159);',
    '  float wave = exp(-pow((pos.x - uWavePos) / uWaveWidth, 2.0)) * uWaveStrength;',
    '  float appear = smoothstep(aSeed * 0.93, aSeed * 0.93 + 0.07, uReveal);',
    '  float depth = clamp(0.82 - pos.z * 0.0009, 0.58, 1.14);',
    '  vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);',
    '  gl_Position = projectionMatrix * mvPosition;',
    '  gl_PointSize = aSize * uSizeMul * uPixelRatio * twinkle * depth * (1.0 + wave * 2.0);',
    '  vColor = aColor + vec3(0.22, 0.46, 0.9) * wave * 0.7;',
    '  vAlpha = aAlpha * uOpacity * (0.68 + 0.32 * twinkle) * (1.0 + wave * 0.85) * appear;',
    '}'
  ].join('\n');

  var fragmentShader = [
    'uniform vec3 uTint;',
    'uniform float uCore;',
    'varying vec3 vColor;',
    'varying float vAlpha;',
    'void main() {',
    '  vec2 centered = gl_PointCoord - vec2(0.5);',
    '  float d = length(centered);',
    '  if (d > 0.5) discard;',
    '  float halo = smoothstep(0.5, 0.055, d);',
    '  float core = smoothstep(0.16, 0.0, d);',
    '  float alpha = (halo * 0.55 + core * 0.95) * vAlpha;',
    '  vec3 color = vColor * uTint * (halo * 0.8 + core * 0.35) + vec3(0.70, 0.90, 1.0) * core * uCore;',
    '  gl_FragColor = vec4(color, alpha);',
    '}'
  ].join('\n');

  var trailVertexShader = [
    'attribute vec3 aTrailColor;',
    'varying vec3 vTrailColor;',
    'void main() {',
    '  vTrailColor = aTrailColor;',
    '  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);',
    '}'
  ].join('\n');

  var trailFragmentShader = [
    'varying vec3 vTrailColor;',
    'void main() {',
    '  gl_FragColor = vec4(vTrailColor, 1.0);',
    '}'
  ].join('\n');

  function WDParticleLogo(canvas, options) {
    this.canvas = canvas;
    this.config = Object.assign({
      src: 'assets/wd-logo@3x.png',
      count: 6500,
      widthRatio: 0.92,
      heightRatio: 0.8,
      maxWidth: 600,
      dprCap: 1.8,
      seed: 2026,
      startFormed: true,
      active: true,
      interactive: true,
      sizeScale: 1,
      intensity: 1,
      onReady: null
    }, options || {});

    this.random = mulberry32(this.config.seed);
    this.supported = false;
    this.ready = false;
    this.running = this.config.active;
    this.inView = true;
    this.reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.time = 0;
    this.lastFrame = 0;
    this.count = 0;
    this.mode = 'idle';
    this.formed = false;
    this.formStart = 0;
    this.logoWidth = 1;
    this.logoHeight = 1;
    this.logoAspect = 1.55;
    this.offset = { x: 0, y: 0, scale: 1 };
    this.pointer = { x: 0, y: 0, over: false, inside: false };
    this.waveState = { pos: -99999, strength: 0 };
    this.waveTweens = [];
    this.rect = { left: 0, top: 0, width: 1, height: 1 };
    this.qualityChecked = false;
    this.qualityStart = 0;
    this.qualityFrames = 0;

    try {
      this.renderer = new THREE.WebGLRenderer({
        canvas: canvas,
        alpha: true,
        antialias: false,
        powerPreference: 'high-performance',
        premultipliedAlpha: false
      });
      this.renderer.setClearColor(0x000000, 0);
      this.renderer.outputEncoding = THREE.sRGBEncoding;
      this.supported = true;
    } catch (error) {
      this.supported = false;
      return;
    }

    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 1200);
    this.camera.position.z = 500;
    this.group = new THREE.Group();
    this.scene.add(this.group);

    this._onResize = this._onResize.bind(this);
    this._tick = this._tick.bind(this);
    this._contextLost = this._contextLost.bind(this);

    this.canvas.addEventListener('webglcontextlost', this._contextLost, false);
    window.addEventListener('resize', this._onResize, { passive: true });
    if (window.ResizeObserver) {
      this.resizeObserver = new ResizeObserver(this._onResize);
      this.resizeObserver.observe(this.canvas);
    }

    this._resize();
    this.readyPromise = this._load();
    this._raf = requestAnimationFrame(this._tick);
  }

  WDParticleLogo.prototype._contextLost = function (event) {
    event.preventDefault();
    this.running = false;
  };

  WDParticleLogo.prototype._load = function () {
    var self = this;

    return new Promise(function (resolve, reject) {
      var image = new Image();
      image.decoding = 'async';
      image.onload = function () {
        try {
          self._buildFromImage(image);
          resolve(self.count);
        } catch (error) {
          reject(error);
        }
      };
      image.onerror = function () {
        reject(new Error('Unable to load logo texture: ' + self.config.src));
      };
      image.src = self.config.src;
    });
  };

  WDParticleLogo.prototype._buildFromImage = function (image) {
    var naturalWidth = image.naturalWidth || image.width;
    var naturalHeight = image.naturalHeight || image.height;
    var offscreen = document.createElement('canvas');
    offscreen.width = naturalWidth;
    offscreen.height = naturalHeight;
    var context = offscreen.getContext('2d', { willReadFrequently: true });
    context.drawImage(image, 0, 0);

    var data = context.getImageData(0, 0, naturalWidth, naturalHeight).data;
    var alpha = new Uint8Array(naturalWidth * naturalHeight);
    var minX = naturalWidth;
    var minY = naturalHeight;
    var maxX = 0;
    var maxY = 0;

    for (var y = 0; y < naturalHeight; y += 1) {
      var row = y * naturalWidth;
      for (var x = 0; x < naturalWidth; x += 1) {
        var index = row + x;
        var value = data[index * 4 + 3];
        alpha[index] = value;
        if (value > 18) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }

    if (maxX <= minX || maxY <= minY) {
      throw new Error('The logo image contains no visible pixels.');
    }

    var bounds = {
      x: minX,
      y: minY,
      width: maxX - minX + 1,
      height: maxY - minY + 1
    };

    this.imageAlpha = alpha;
    this.imageWidth = naturalWidth;
    this.imageHeight = naturalHeight;
    this.bounds = bounds;
    this.logoAspect = bounds.width / bounds.height;

    // Sample the visible ink. A 2px stride keeps the initial extraction cheap
    // while still representing the contour and inner counters of the mark.
    var stride = bounds.width > 480 ? 2 : 1;
    var candidates = [];
    var centerX = bounds.x + bounds.width / 2;
    var centerY = bounds.y + bounds.height / 2;

    for (var py = bounds.y; py < bounds.y + bounds.height; py += stride) {
      for (var px = bounds.x; px < bounds.x + bounds.width; px += stride) {
        var pixelIndex = py * naturalWidth + px;
        var rgbIndex = pixelIndex * 4;
        var luminance = (data[rgbIndex] + data[rgbIndex + 1] + data[rgbIndex + 2]) / 3;
        if (alpha[pixelIndex] > 42 && luminance > 180) {
          candidates.push({
            x: (px - centerX) / bounds.width,
            y: (centerY - py) / bounds.height,
            depth: this.random() * 2 - 1
          });
        }
      }
    }

    if (!candidates.length) {
      throw new Error('No ink pixels were found in the logo image.');
    }

    var requested = this._particleBudget();
    this.count = requested;
    var count = this.count;
    var positions = new Float32Array(count * 3);
    var targets = new Float32Array(count * 3);
    var velocities = new Float32Array(count * 3);
    var sizes = new Float32Array(count);
    var seeds = new Float32Array(count);
    var alphas = new Float32Array(count);
    var colors = new Float32Array(count * 3);
    var delays = new Float32Array(count);
    var normalized = new Float32Array(count * 2);
    var depths = new Float32Array(count);

    var palette = [
      [0.88, 0.95, 1.0],
      [0.97, 0.99, 1.0],
      [0.76, 0.88, 1.0],
      [0.64, 0.8, 1.0],
      [1.0, 1.0, 1.0]
    ];

    for (var i = 0; i < count; i += 1) {
      var candidate = candidates[Math.floor(this.random() * candidates.length)];
      var jitterX = (this.random() - 0.5) * (2.0 / bounds.width);
      var jitterY = (this.random() - 0.5) * (2.0 / bounds.height);
      var nx = candidate.x + jitterX;
      var ny = candidate.y + jitterY;

      normalized[i * 2] = nx;
      normalized[i * 2 + 1] = ny;
      depths[i] = candidate.depth;

      var color = palette[Math.floor(Math.pow(this.random(), 1.9) * palette.length)];
      colors[i * 3] = color[0];
      colors[i * 3 + 1] = color[1];
      colors[i * 3 + 2] = color[2];

      sizes[i] = (1.9 + Math.pow(this.random(), 0.68) * 2.9) * this.config.sizeScale;
      seeds[i] = this.random();
      alphas[i] = 0.65 + this.random() * 0.33;
      delays[i] = this.random();

      positions[i * 3] = 0;
      positions[i * 3 + 1] = 0;
      positions[i * 3 + 2] = 0;
    }

    this.normalized = normalized;
    this.depths = depths;
    this.targets = targets;
    this.velocities = velocities;
    this.positions = positions;
    this.delays = delays;
    this.sizes = sizes;

    var geometry = new THREE.BufferGeometry();
    this.positionAttribute = new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage);
    var colorAttribute = new THREE.BufferAttribute(colors, 3);
    var sizeAttribute = new THREE.BufferAttribute(sizes, 1);
    var seedAttribute = new THREE.BufferAttribute(seeds, 1);
    var alphaAttribute = new THREE.BufferAttribute(alphas, 1);
    geometry.setAttribute('position', this.positionAttribute);
    geometry.setAttribute('aColor', colorAttribute);
    geometry.setAttribute('aSize', sizeAttribute);
    geometry.setAttribute('aSeed', seedAttribute);
    geometry.setAttribute('aAlpha', alphaAttribute);
    this.geometry = geometry;

    this.uniforms = {
      uTime: { value: 0 },
      uPixelRatio: { value: Math.min(window.devicePixelRatio || 1, this.config.dprCap) },
      uSizeMul: { value: 1 },
      uOpacity: { value: this.config.intensity },
      uReveal: { value: this.config.startFormed ? 1 : 0 },
      uWavePos: { value: -99999 },
      uWaveWidth: { value: 70 },
      uWaveStrength: { value: 0 }
    };

    var material = new THREE.ShaderMaterial({
      uniforms: Object.assign({}, this.uniforms, {
        uTint: { value: new THREE.Color(0.94, 0.98, 1.0) },
        uCore: { value: 1.0 * this.config.intensity }
      }),
      vertexShader: vertexShader,
      fragmentShader: fragmentShader,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });

    var glowMaterial = new THREE.ShaderMaterial({
      uniforms: Object.assign({}, this.uniforms, {
        uSizeMul: { value: 3.2 },
        uOpacity: { value: 0.17 * this.config.intensity },
        uTint: { value: new THREE.Color(0.25, 0.55, 1.0) },
        uCore: { value: 0.1 }
      }),
      vertexShader: vertexShader,
      fragmentShader: fragmentShader,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });

    var auraMaterial = new THREE.ShaderMaterial({
      uniforms: Object.assign({}, this.uniforms, {
        uSizeMul: { value: 8.0 },
        uOpacity: { value: 0.045 * this.config.intensity },
        uTint: { value: new THREE.Color(0.14, 0.4, 1.0) },
        uCore: { value: 0.02 }
      }),
      vertexShader: vertexShader,
      fragmentShader: fragmentShader,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });

    this.material = material;
    this.glowMaterial = glowMaterial;
    this.auraMaterial = auraMaterial;
    this.points = new THREE.Points(geometry, material);
    this.points.frustumCulled = false;
    this.glow = new THREE.Points(geometry, glowMaterial);
    this.glow.frustumCulled = false;
    this.aura = new THREE.Points(geometry, auraMaterial);
    this.aura.frustumCulled = false;
    this.aura.renderOrder = -2;
    this.glow.renderOrder = -1;
    this.points.renderOrder = 1;
    this.group.add(this.aura);
    this.group.add(this.glow);
    this.group.add(this.points);

    this._buildTrails(count);
    this._resize();
    this._snapToTargets();

    this.ready = true;

    if (this.config.startFormed) {
      this.mode = 'formed';
      this.formed = true;
    } else {
      this.startChaos();
    }

    this._render();

    if (typeof this.config.onReady === 'function') {
      this.config.onReady(this.count, this);
    }
  };

  WDParticleLogo.prototype._particleBudget = function () {
    var width = window.innerWidth || 1200;
    var mobile = width < 700;
    var requested = mobile ? Math.round(this.config.count * 0.55) : this.config.count;
    if (this.reduced) requested = Math.round(requested * 0.45);

    if (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4) {
      requested = Math.round(requested * 0.82);
    }
    return Math.max(1400, requested);
  };

  WDParticleLogo.prototype._buildTrails = function (count) {
    var points = new Float32Array(count * 2 * 3);
    var colors = new Float32Array(count * 2 * 3);
    var geometry = new THREE.BufferGeometry();
    this.trailPositionAttribute = new THREE.BufferAttribute(points, 3).setUsage(THREE.DynamicDrawUsage);
    this.trailColorAttribute = new THREE.BufferAttribute(colors, 3).setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute('position', this.trailPositionAttribute);
    geometry.setAttribute('aTrailColor', this.trailColorAttribute);
    this.trailPositions = points;
    this.trailColors = colors;

    var material = new THREE.ShaderMaterial({
      vertexShader: trailVertexShader,
      fragmentShader: trailFragmentShader,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });

    this.trails = new THREE.LineSegments(geometry, material);
    this.trails.frustumCulled = false;
    this.trails.renderOrder = 0;
    this.group.add(this.trails);
  };

  WDParticleLogo.prototype._snapToTargets = function () {
    if (!this.targets || !this.positions) return;
    for (var i = 0; i < this.count; i += 1) {
      this.positions[i * 3] = this.targets[i * 3];
      this.positions[i * 3 + 1] = this.targets[i * 3 + 1];
      this.positions[i * 3 + 2] = this.targets[i * 3 + 2];
      this.velocities[i * 3] = 0;
      this.velocities[i * 3 + 1] = 0;
      this.velocities[i * 3 + 2] = 0;
    }
    if (this.positionAttribute) this.positionAttribute.needsUpdate = true;
  };

  WDParticleLogo.prototype._resize = function () {
    if (!this.supported) return;
    var width = Math.max(1, this.canvas.clientWidth || this.canvas.parentElement.clientWidth || 1);
    var height = Math.max(1, this.canvas.clientHeight || this.canvas.parentElement.clientHeight || 1);
    var dpr = Math.min(window.devicePixelRatio || 1, this.config.dprCap);

    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(width, height, false);
    this.camera.left = -width / 2;
    this.camera.right = width / 2;
    this.camera.top = height / 2;
    this.camera.bottom = -height / 2;
    this.camera.updateProjectionMatrix();

    this.size = { width: width, height: height };
    this.logoWidth = Math.min(
      width * this.config.widthRatio,
      height * this.config.heightRatio * this.logoAspect,
      this.config.maxWidth
    );
    this.logoHeight = this.logoWidth / this.logoAspect;

    if (this.uniforms) {
      this.uniforms.uPixelRatio.value = dpr;
      this.uniforms.uWaveWidth.value = Math.max(36, this.logoWidth * 0.1);
    }

    this._recomputeTargets();

    if (this.ready) {
      // Keep a dimension change from producing a stretched logo.
      var wasFormed = this.formed || this.mode === 'formed';
      if (wasFormed) this._snapToTargets();
      this._updateTrails();
      this._render();
    }
  };

  WDParticleLogo.prototype._recomputeTargets = function () {
    if (!this.targets || !this.normalized) return;
    for (var i = 0; i < this.count; i += 1) {
      this.targets[i * 3] = this.normalized[i * 2] * this.logoWidth;
      this.targets[i * 3 + 1] = this.normalized[i * 2 + 1] * this.logoHeight;
      this.targets[i * 3 + 2] = this.depths[i] * Math.min(120, this.logoWidth * 0.115);
    }
  };

  WDParticleLogo.prototype._onResize = function () {
    var self = this;
    if (this.resizeQueued) return;
    this.resizeQueued = true;
    requestAnimationFrame(function () {
      self.resizeQueued = false;
      self._resize();
      self.rect = self.canvas.getBoundingClientRect();
    });
  };

  WDParticleLogo.prototype.startChaos = function () {
    if (!this.ready) return;
    var spreadX = Math.min(this.logoWidth * 0.34, this.size.width * 0.28);
    var spreadY = Math.min(this.logoHeight * 0.34, this.size.height * 0.25);

    for (var i = 0; i < this.count; i += 1) {
      var tx = this.targets[i * 3];
      var ty = this.targets[i * 3 + 1];
      var tz = this.targets[i * 3 + 2];
      var angle = this.random() * Math.PI * 2;
      var radius = Math.sqrt(this.random());

      // A soft local cloud around every destination. The mark is suggested,
      // never assembled, until the eased gathering begins.
      this.positions[i * 3] = tx + Math.cos(angle) * radius * spreadX
        + (this.random() - 0.5) * 14;
      this.positions[i * 3 + 1] = ty + Math.sin(angle) * radius * spreadY
        + (this.random() - 0.5) * 14;
      this.positions[i * 3 + 2] = tz + (this.random() - 0.5) * 120;
      this.velocities[i * 3] = 0;
      this.velocities[i * 3 + 1] = 0;
      this.velocities[i * 3 + 2] = 0;
    }
    this.mode = 'chaos';
    this.formed = false;
    this.positionAttribute.needsUpdate = true;
  };

  WDParticleLogo.prototype.formLogo = function () {
    if (!this.ready) return;
    this.mode = 'forming';
    this.formed = false;
    this.formStart = this.time;

    var count = this.count;
    this.flightFromX = new Float32Array(count);
    this.flightFromY = new Float32Array(count);
    this.flightFromZ = new Float32Array(count);
    this.flightControlX = new Float32Array(count);
    this.flightControlY = new Float32Array(count);
    this.flightControlZ = new Float32Array(count);
    this.flightDuration = new Float32Array(count);

    for (var i = 0; i < count; i += 1) {
      var ix = i * 3;
      var sx = this.positions[ix];
      var sy = this.positions[ix + 1];
      var sz = this.positions[ix + 2];
      var tx = this.targets[ix];
      var ty = this.targets[ix + 1];
      var tz = this.targets[ix + 2];
      var dx = tx - sx;
      var dy = ty - sy;
      var length = Math.sqrt(dx * dx + dy * dy) || 1;

      // A subtle, seeded bow makes the path feel like a gliding bird while
      // remaining close to the shortest route from the nearest edge.
      var curve = (this.random() - 0.5) * Math.min(52, length * 0.12);
      var normalX = -dy / length;
      var normalY = dx / length;

      this.flightFromX[i] = sx;
      this.flightFromY[i] = sy;
      this.flightFromZ[i] = sz;
      this.flightControlX[i] = sx + dx * 0.52 + normalX * curve;
      this.flightControlY[i] = sy + dy * 0.52 + normalY * curve;
      this.flightControlZ[i] = (sz + tz) * 0.5 + (this.random() - 0.5) * 18;
      this.flightDuration[i] = 1.32 + this.random() * 0.18;

      this.velocities[ix] = 0;
      this.velocities[ix + 1] = 0;
      this.velocities[ix + 2] = 0;
    }
  };

  WDParticleLogo.prototype._updateFormationPath = function (step, elapsed) {
    var allDone = true;

    for (var i = 0; i < this.count; i += 1) {
      var ix = i * 3;
      var duration = this.flightDuration[i];
      var t = clamp(elapsed / duration, 0, 1);
      if (t < 1) allDone = false;

      // Smooth departure and a long, soft landing.
      var eased = t < 0.5
        ? 4 * t * t * t
        : 1 - Math.pow(-2 * t + 2, 3) / 2;
      var inverse = 1 - eased;

      var px = this.positions[ix];
      var py = this.positions[ix + 1];
      var pz = this.positions[ix + 2];
      var nx = inverse * inverse * this.flightFromX[i]
        + 2 * inverse * eased * this.flightControlX[i]
        + eased * eased * this.targets[ix];
      var ny = inverse * inverse * this.flightFromY[i]
        + 2 * inverse * eased * this.flightControlY[i]
        + eased * eased * this.targets[ix + 1];
      var nz = inverse * inverse * this.flightFromZ[i]
        + 2 * inverse * eased * this.flightControlZ[i]
        + eased * eased * this.targets[ix + 2];

      this.positions[ix] = nx;
      this.positions[ix + 1] = ny;
      this.positions[ix + 2] = nz;

      if (t < 1) {
        this.velocities[ix] = clamp((nx - px) / step, -36, 36);
        this.velocities[ix + 1] = clamp((ny - py) / step, -36, 36);
        this.velocities[ix + 2] = clamp((nz - pz) / step, -8, 8);
      } else {
        this.velocities[ix] = 0;
        this.velocities[ix + 1] = 0;
        this.velocities[ix + 2] = 0;
      }
    }

    if (allDone) {
      this.formed = true;
      this.mode = 'formed';
    }
  };

  WDParticleLogo.prototype.snapFormed = function () {
    if (!this.ready) return;
    this.mode = 'formed';
    this.formed = true;
    this._snapToTargets();
  };

  WDParticleLogo.prototype.setReveal = function (value) {
    if (!this.uniforms) return;
    this.uniforms.uReveal.value = value;
  };

  WDParticleLogo.prototype.setActive = function (active) {
    this.running = Boolean(active);
    if (this.running) {
      this.lastFrame = performance.now();
      this.rect = this.canvas.getBoundingClientRect();
    }
  };

  WDParticleLogo.prototype.setInView = function (inView) {
    this.inView = Boolean(inView);
  };

  WDParticleLogo.prototype.setPointer = function (clientX, clientY) {
    if (!this.ready || !this.config.interactive) return;
    var rect = this.canvas.getBoundingClientRect();
    this.rect = rect;
    var width = rect.width || 1;
    var height = rect.height || 1;
    var localX = (clientX - rect.left - width / 2 - this.offset.x) / this.offset.scale;
    var localY = -(clientY - rect.top - height / 2 - this.offset.y) / this.offset.scale;
    var u = localX / this.logoWidth + 0.5;
    var v = localY / this.logoHeight + 0.5;

    this.pointer.inside = u >= 0 && u <= 1 && v >= 0 && v <= 1;
    this.pointer.over = this.pointer.inside && this._isNearInk(u, v);
    this.pointer.x = localX;
    this.pointer.y = localY;
  };

  WDParticleLogo.prototype.clearPointer = function () {
    this.pointer.over = false;
    this.pointer.inside = false;
  };

  WDParticleLogo.prototype._isNearInk = function (u, v) {
    if (!this.imageAlpha || !this.bounds) return false;
    var x = this.bounds.x + u * this.bounds.width;
    var y = this.bounds.y + (1 - v) * this.bounds.height;
    var px = Math.round(x);
    var py = Math.round(y);
    // A forgiving hit target: check the cursor itself and a small halo around it.
    var radius = 5;
    for (var oy = -radius; oy <= radius; oy += radius) {
      for (var ox = -radius; ox <= radius; ox += radius) {
        var sx = px + ox;
        var sy = py + oy;
        if (sx < 0 || sy < 0 || sx >= this.imageWidth || sy >= this.imageHeight) continue;
        if (this.imageAlpha[sy * this.imageWidth + sx] > 22) return true;
      }
    }
    return false;
  };

  WDParticleLogo.prototype.energyWave = function () {
    if (!this.ready || !window.gsap) return;
    for (var i = 0; i < this.waveTweens.length; i += 1) this.waveTweens[i].kill();
    this.waveTweens.length = 0;
    this.waveState.pos = -this.logoWidth * 0.72;
    this.waveState.strength = 1;
    this.waveTweens.push(window.gsap.to(this.waveState, {
      pos: this.logoWidth * 0.72,
      duration: 1.55,
      ease: 'power2.inOut'
    }));
    this.waveTweens.push(window.gsap.to(this.waveState, {
      strength: 0,
      duration: 0.7,
      delay: 0.9,
      ease: 'power2.out'
    }));
  };

  WDParticleLogo.prototype.burst = function () {
    if (!this.ready) return;
    var originX = this.pointer.over ? this.pointer.x : 0;
    var originY = this.pointer.over ? this.pointer.y : 0;
    var radius = Math.max(120, this.logoWidth * 0.35);
    for (var i = 0; i < this.count; i += 1) {
      var dx = this.positions[i * 3] - originX;
      var dy = this.positions[i * 3 + 1] - originY;
      var distance = Math.sqrt(dx * dx + dy * dy) || 1;
      if (distance < radius) {
        var force = (1 - distance / radius) * 1.8;
        this.velocities[i * 3] += (dx / distance) * force;
        this.velocities[i * 3 + 1] += (dy / distance) * force;
        this.velocities[i * 3 + 2] += (this.random() - 0.5) * 0.2;
      }
    }
  };

  WDParticleLogo.prototype._updateParticles = function (dt) {
    var step = clamp(dt * 60, 0.2, 2.2);
    var elapsed = this.time - this.formStart;

    if (this.mode === 'forming') {
      this._updateFormationPath(step, elapsed);
      this.positionAttribute.needsUpdate = true;
      this._updateTrails();
      return;
    }

    var speedLimit = 17;
    var radius = Math.max(84, this.logoWidth * 0.225);
    var pointerActive = this.pointer.over && this.mode !== 'chaos';
    var damping = Math.pow(0.874, step);
    var stiffness = 0.041;

    for (var i = 0; i < this.count; i += 1) {
      var ix = i * 3;
      var px = this.positions[ix];
      var py = this.positions[ix + 1];
      var pz = this.positions[ix + 2];
      var vx = this.velocities[ix];
      var vy = this.velocities[ix + 1];
      var vz = this.velocities[ix + 2];

      var tx = this.targets[ix];
      var ty = this.targets[ix + 1];
      var tz = this.targets[ix + 2];
      var seed = this.delays[i];
      var shimmer = this.reduced ? 0 : 0.9;

      if (this.mode === 'chaos') {
        vx *= Math.pow(0.9, step);
        vy *= Math.pow(0.9, step);
      } else {
        tx += Math.sin(this.time * 0.9 + seed * 9.3) * shimmer * 0.8;
        ty += Math.cos(this.time * 1.08 + seed * 7.7) * shimmer * 0.8;

        var ax = (tx - px) * stiffness;
        var ay = (ty - py) * stiffness;

        if (pointerActive) {
          var dx = px - this.pointer.x;
          var dy = py - this.pointer.y;
          var distSq = dx * dx + dy * dy;
          if (distSq < radius * radius) {
            var distance = Math.sqrt(distSq) || 1;
            var force = Math.pow(1 - distance / radius, 2.0) * 1.9;
            ax += (dx / distance) * force;
            ay += (dy / distance) * force;
            ax += (-dy / distance) * force * 0.58;
            ay += (dx / distance) * force * 0.58;
          }
        }

        vx = (vx + ax * step) * damping;
        vy = (vy + ay * step) * damping;
        vz += (tz - pz) * 0.018 * step;
        vz *= Math.pow(0.94, step);
      }

      var speed = Math.sqrt(vx * vx + vy * vy);
      if (speed > speedLimit) {
        vx = (vx / speed) * speedLimit;
        vy = (vy / speed) * speedLimit;
      }

      px += vx * step;
      py += vy * step;
      pz += vz * step;

      this.positions[ix] = px;
      this.positions[ix + 1] = py;
      this.positions[ix + 2] = pz;
      this.velocities[ix] = vx;
      this.velocities[ix + 1] = vy;
      this.velocities[ix + 2] = vz;
    }

    this.positionAttribute.needsUpdate = true;
    this._updateTrails();
  };

  WDParticleLogo.prototype._updateTrails = function () {
    if (!this.trailPositions) return;
    var positions = this.trailPositions;
    var colors = this.trailColors;
    var trail = 5.4;
    for (var i = 0; i < this.count; i += 1) {
      var ix = i * 3;
      var px = this.positions[ix];
      var py = this.positions[ix + 1];
      var pz = this.positions[ix + 2];
      var vx = this.velocities[ix];
      var vy = this.velocities[ix + 1];
      var speed = Math.sqrt(vx * vx + vy * vy);
      var intensity = clamp(speed / 7.5, 0, 0.85);
      var j = i * 6;
      positions[j] = px;
      positions[j + 1] = py;
      positions[j + 2] = pz;
      positions[j + 3] = px - vx * trail;
      positions[j + 4] = py - vy * trail;
      positions[j + 5] = pz - 2;
      var strength = intensity * intensity;
      colors[j] = 0.2 * strength;
      colors[j + 1] = 0.48 * strength;
      colors[j + 2] = 1.0 * strength;
      colors[j + 3] = 0.03 * strength;
      colors[j + 4] = 0.09 * strength;
      colors[j + 5] = 0.23 * strength;
    }
    this.trailPositionAttribute.needsUpdate = true;
    this.trailColorAttribute.needsUpdate = true;
  };

  WDParticleLogo.prototype._reduceQuality = function () {
    if (!this.renderer) return;
    var reducedDpr = Math.min(window.devicePixelRatio || 1, 1.25);
    this.renderer.setPixelRatio(reducedDpr);
    this.renderer.setSize(this.size.width, this.size.height, false);
    if (this.uniforms) this.uniforms.uPixelRatio.value = reducedDpr;
    this.qualityReduced = true;
  };

  WDParticleLogo.prototype._render = function () {
    if (!this.supported || !this.ready) return;
    this.group.position.set(this.offset.x, this.offset.y, 0);
    this.group.scale.setScalar(this.offset.scale);
    this.renderer.render(this.scene, this.camera);
  };

  WDParticleLogo.prototype._tick = function (now) {
    this._raf = requestAnimationFrame(this._tick);
    if (!this.ready || !this.running || !this.inView) {
      this.lastFrame = now;
      return;
    }
    if (document.hidden) return;
    var dt = this.lastFrame ? Math.min((now - this.lastFrame) / 1000, 0.04) : 0.016;
    this.lastFrame = now;
    this.time += dt;

    // One lightweight, one-time quality adjustment for slower GPUs.
    if (!this.qualityChecked && this.mode === 'formed') {
      if (!this.qualityStart) this.qualityStart = now;
      this.qualityFrames += 1;
      if (now - this.qualityStart > 2600) {
        var measuredFps = this.qualityFrames / ((now - this.qualityStart) / 1000);
        this.qualityChecked = true;
        if (measuredFps < 45) this._reduceQuality();
      }
    }

    this._updateParticles(dt);

    if (this.uniforms) {
      this.uniforms.uTime.value = this.reduced ? 0 : this.time;
      this.uniforms.uWavePos.value = this.waveState.pos;
      this.uniforms.uWaveStrength.value = this.waveState.strength;
    }

    this._render();
  };

  WDParticleLogo.prototype.getStatus = function () {
    return {
      ready: this.ready,
      count: this.count,
      mode: this.mode,
      formed: this.formed,
      supported: this.supported
    };
  };

  WDParticleLogo.prototype.destroy = function () {
    cancelAnimationFrame(this._raf);
    window.removeEventListener('resize', this._onResize);
    this.canvas.removeEventListener('webglcontextlost', this._contextLost);
    if (this.resizeObserver) this.resizeObserver.disconnect();
    if (this.geometry) this.geometry.dispose();
    if (this.material) this.material.dispose();
    if (this.glowMaterial) this.glowMaterial.dispose();
    if (this.auraMaterial) this.auraMaterial.dispose();
    if (this.trails) {
      this.trails.geometry.dispose();
      this.trails.material.dispose();
    }
    if (this.renderer) this.renderer.dispose();
  };

  window.WDParticleLogo = WDParticleLogo;
}());
