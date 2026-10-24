/* =====================================================================
   Lampada Lunare Levitante · luna-moon3d.js (modulo ES)
   Caricato da luna-landing.js con import() quando la sezione 3D è a 400 px dal viewport.
   Three.js arriva con un secondo import() dall'URL in data-three-url (asset del tema, niente CDN).
   Luna con texture colore e rilievo, alone, base nelle proporzioni reali, levitazione, trascinamento
   con inerzia, accensione sincronizzata con la hero tramite l'evento 'luna:light'.
   ===================================================================== */

// Proporzioni reali: luna Ø 85 mm (raggio 1 nella scena), base 108 × 108 × 22 mm
const MM = 1 / 42.5;
const BASE_SIDE = 108 * MM;
const BASE_HEIGHT = 22 * MM;
const BASE_CORNER = 14 * MM;
const BASE_BEVEL = 2.4 * MM;
const LEVITATION_GAP = 0.34;

const BUMP_SCALE = 0.035; // tarato a occhio: crateri leggibili da spenta, morbidi da accesa
const EMISSIVE_STRENGTH = 0.9;
const HALO_SCALE = 3.2;
const HALO_OPACITY = 0.65;
const WARM_LIGHT = 1.1; // point light calda sulla base, moltiplicata per power
const KEY_LIGHT = 1.7; // luce fredda: piena da spenta, attenuata da accesa (la luna si illumina da dentro)
const KEY_WHEN_ON = 0.22;
const POWER_MS = 900;
const COLOUR_MS = 600;
const INERTIA = 0.92;
const MAX_TILT = (25 * Math.PI) / 180;

const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

function roundedSquare(THREE, size, radius) {
  const s = size / 2;
  const r = Math.min(radius, s);
  const shape = new THREE.Shape();
  shape.moveTo(-s + r, -s);
  shape.lineTo(s - r, -s);
  shape.quadraticCurveTo(s, -s, s, -s + r);
  shape.lineTo(s, s - r);
  shape.quadraticCurveTo(s, s, s - r, s);
  shape.lineTo(-s + r, s);
  shape.quadraticCurveTo(-s, s, -s, s - r);
  shape.lineTo(-s, -s + r);
  shape.quadraticCurveTo(-s, -s, -s + r, -s);
  return shape;
}

/** Alone: gradiente radiale disegnato su canvas. */
function haloTexture(THREE) {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const context = canvas.getContext('2d');
  const gradient = context.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.32, 'rgba(255,255,255,.55)');
  gradient.addColorStop(0.62, 'rgba(255,255,255,.14)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** Venatura leggera per la base in ABS effetto legno chiaro. */
function woodTexture(THREE) {
  const width = 512;
  const height = 128;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  context.fillStyle = '#e3b882';
  context.fillRect(0, 0, width, height);
  let seed = 85108;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let line = 0; line < 70; line++) {
    const y = random() * height;
    const amplitude = 1 + random() * 3;
    const frequency = 0.004 + random() * 0.01;
    context.strokeStyle = random() < 0.5 ? 'rgba(150, 96, 46, 0.14)' : 'rgba(255, 232, 196, 0.14)';
    context.lineWidth = 0.6 + random() * 1.6;
    context.beginPath();
    for (let x = 0; x <= width; x += 8) {
      const offset = Math.sin(x * frequency + line) * amplitude;
      if (x === 0) context.moveTo(x, y + offset);
      else context.lineTo(x, y + offset);
    }
    context.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(0.45, 1.6);
  return texture;
}

/**
 * Monta la luna 3D nel palco. Restituisce { destroy } dopo il primo frame disegnato.
 * options: threeUrl, textures { colour, bump }, power, colour, autoRotate, reducedMotion, mobile
 */
export async function mount(stage, options) {
  const THREE = await import(new URL(options.threeUrl, document.baseURI).href);
  const canvas = stage.querySelector('[data-luna-moon3d-canvas]');
  const hint = stage.querySelector('[data-luna-moon3d-hint]');
  const reduced = Boolean(options.reducedMotion);
  const mobile = Boolean(options.mobile);
  const disposables = [];
  const cleanups = [];
  const listen = (target, type, handler, settings) => {
    target.addEventListener(type, handler, settings);
    cleanups.push(() => target.removeEventListener(type, handler, settings));
  };

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  // Libera subito la GPU; un canvas nuovo al posto di quello col contesto perso permette di rimontare (editor del tema)
  const release = () => {
    renderer.dispose();
    renderer.forceContextLoss();
    canvas.replaceWith(canvas.cloneNode(false));
  };
  try {
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, mobile ? 1.5 : 2));
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
    camera.position.set(0, 1.0, 8.3);
    camera.lookAt(0, -0.16, 0); // la scena sale un po': sotto la base resta spazio per il suggerimento

    // Texture della Luna (Solar System Scope, CC BY 4.0): 2k su desktop, 1k su mobile
    const loader = new THREE.TextureLoader();
    const [colourMap, bumpMap] = await Promise.all([
      loader.loadAsync(options.textures.colour),
      loader.loadAsync(options.textures.bump),
    ]);
    colourMap.colorSpace = THREE.SRGBColorSpace;
    colourMap.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    disposables.push(colourMap, bumpMap);

    const colourNow = new THREE.Color(options.colour || '#FFD9A3');
    const colourFrom = colourNow.clone();
    const colourTo = colourNow.clone();
    let colourStart = null;
    let power = clamp(Number(options.power) || 0, 0, 1);
    let powerFrom = power;
    let powerTo = power;
    let powerStart = null;

    // Luna: rilievo per vederla da spenta, emissione dalla texture per i crateri meno luminosi da accesa
    const segments = mobile ? 96 : 128;
    const moonGeometry = new THREE.SphereGeometry(1, segments, Math.round(segments / 2));
    const moonMaterial = new THREE.MeshStandardMaterial({
      map: colourMap,
      bumpMap,
      bumpScale: BUMP_SCALE,
      roughness: 0.95,
      metalness: 0,
      emissive: colourNow.clone(),
      emissiveMap: colourMap,
      emissiveIntensity: power * EMISSIVE_STRENGTH,
    });
    const moon = new THREE.Mesh(moonGeometry, moonMaterial);
    moon.rotation.y = -0.6;
    disposables.push(moonGeometry, moonMaterial);

    const glow = haloTexture(THREE);
    const haloMaterial = new THREE.SpriteMaterial({
      map: glow,
      color: colourNow.clone(),
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false,
      opacity: power * HALO_OPACITY,
    });
    const halo = new THREE.Sprite(haloMaterial);
    halo.scale.set(HALO_SCALE, HALO_SCALE, 1);
    disposables.push(glow, haloMaterial);

    const warmLight = new THREE.PointLight(colourNow.clone(), power * WARM_LIGHT, 5, 1.4);
    warmLight.position.set(0, -1.02, 0.2);

    const levitating = new THREE.Group();
    levitating.add(moon, halo, warmLight);
    const moonY = 0.62;
    levitating.position.y = moonY;

    // Base: quadrato con gli angoli arrotondati, estruso con smusso (solo il core di Three.js)
    const baseGeometry = new THREE.ExtrudeGeometry(roundedSquare(THREE, BASE_SIDE - 2 * BASE_BEVEL, BASE_CORNER), {
      depth: BASE_HEIGHT - 2 * BASE_BEVEL,
      bevelEnabled: true,
      bevelThickness: BASE_BEVEL,
      bevelSize: BASE_BEVEL,
      bevelSegments: 4,
      curveSegments: 18,
    });
    baseGeometry.rotateX(-Math.PI / 2);
    baseGeometry.center();
    const wood = woodTexture(THREE);
    const baseMaterial = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: wood,
      roughness: 0.58,
      metalness: 0,
      // un minimo di luce propria: i lati in ombra restano legno chiaro, come nelle foto
      emissive: 0x2c1b0d,
    });
    const base = new THREE.Mesh(baseGeometry, baseMaterial);
    base.position.y = moonY - 1 - LEVITATION_GAP - BASE_HEIGHT / 2;
    base.rotation.y = -0.42;
    disposables.push(baseGeometry, baseMaterial, wood);

    // Spenta: luce fredda dall'alto a sinistra e ambiente .15, per leggere il rilievo
    const ambient = new THREE.AmbientLight(0xffffff, 0.15);
    const key = new THREE.DirectionalLight(0xc4d2ff, KEY_LIGHT);
    key.position.set(-3.2, 3.4, 2.6);
    scene.add(levitating, base, ambient, key);

    // Dimensioni
    function resize() {
      const rect = stage.getBoundingClientRect();
      const width = Math.max(1, Math.round(rect.width));
      const height = Math.max(1, Math.round(rect.height));
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    }

    // Stato della luce: accensione in 900 ms, colore in 600 ms (subito con il movimento ridotto)
    function setLight(targetPower, targetColour) {
      const now = performance.now();
      const nextPower = clamp(Number(targetPower) || 0, 0, 1);
      if (nextPower !== powerTo) {
        powerFrom = power;
        powerTo = nextPower;
        powerStart = reduced ? null : now;
        if (reduced) power = nextPower;
      }
      if (targetColour) {
        const next = new THREE.Color(targetColour);
        if (!next.equals(colourTo)) {
          colourFrom.copy(colourNow);
          colourTo.copy(next);
          colourStart = reduced ? null : now;
          if (reduced) colourNow.copy(next);
        }
      }
      stage.setAttribute('data-luna-power', String(powerTo));
      stage.setAttribute('data-luna-colour', '#' + colourTo.getHexString());
      requestRender();
    }

    function applyLight() {
      moonMaterial.emissive.copy(colourNow);
      moonMaterial.emissiveIntensity = power * EMISSIVE_STRENGTH;
      haloMaterial.color.copy(colourNow);
      haloMaterial.opacity = power * HALO_OPACITY;
      warmLight.color.copy(colourNow);
      warmLight.intensity = power * WARM_LIGHT;
      key.intensity = KEY_LIGHT * (1 - (1 - KEY_WHEN_ON) * power);
    }

    // Trascinamento: orizzontale libero, verticale ±25°, inerzia 0.92; un tocco sulla luna la accende e la spegne
    let dragging = false;
    let pointerId = null;
    let lastX = 0;
    let lastY = 0;
    let startX = 0;
    let startY = 0;
    let startTime = 0;
    let velocityY = 0;
    let velocityX = 0;
    let tilt = 0;
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();

    function hideHint() {
      if (hint) hint.classList.add('is-hidden');
    }

    listen(canvas, 'pointerdown', (event) => {
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      dragging = true;
      pointerId = event.pointerId;
      lastX = startX = event.clientX;
      lastY = startY = event.clientY;
      startTime = performance.now();
      velocityX = velocityY = 0;
      canvas.classList.add('is-dragging');
      try {
        canvas.setPointerCapture(event.pointerId);
      } catch (error) {
        /* il puntatore può essere già stato rilasciato */
      }
      requestRender();
    });
    listen(canvas, 'pointermove', (event) => {
      if (!dragging || event.pointerId !== pointerId) return;
      const dx = event.clientX - lastX;
      const dy = event.clientY - lastY;
      lastX = event.clientX;
      lastY = event.clientY;
      velocityY = dx * 0.009;
      velocityX = dy * 0.007;
      moon.rotation.y += velocityY;
      tilt = clamp(tilt + velocityX, -MAX_TILT, MAX_TILT);
      if (Math.abs(event.clientX - startX) + Math.abs(event.clientY - startY) > 6) hideHint();
      requestRender();
    });
    const endDrag = (event) => {
      if (!dragging || event.pointerId !== pointerId) return;
      dragging = false;
      canvas.classList.remove('is-dragging');
      stage.setAttribute('data-luna-rotation', moon.rotation.y.toFixed(3));
      const moved = Math.abs(event.clientX - startX) + Math.abs(event.clientY - startY);
      if (event.type === 'pointerup' && moved < 6 && performance.now() - startTime < 350) {
        const rect = canvas.getBoundingClientRect();
        pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
        raycaster.setFromCamera(pointer, camera);
        if (raycaster.intersectObject(moon, false).length && window.Luna) {
          window.Luna.setLight({ power: powerTo > 0 ? 0 : 1, color: '#' + colourTo.getHexString(), source: 'moon3d-canvas' });
        }
      }
    };
    listen(canvas, 'pointerup', endDrag);
    // pointercancel: il browser ha preso il gesto per scorrere la pagina (touch-action: pan-y)
    listen(canvas, 'pointercancel', endDrag);

    // Sincronia con la hero e con l'interruttore della sezione
    listen(document, 'luna:light', (event) => {
      const detail = event.detail || {};
      setLight(detail.power, detail.color);
    });

    // Loop: solo con la sezione visibile e la scheda in primo piano
    let frame = 0;
    let visible = false;
    let last = performance.now();
    let rendering = false;
    let lost = false; // contesto WebGL perso: resta l'immagine di ripiego e il loop non riparte

    function tick(time) {
      frame = 0;
      const dt = Math.min(0.05, (time - last) / 1000);
      last = time;

      if (powerStart !== null) {
        const t = clamp((time - powerStart) / POWER_MS, 0, 1);
        power = powerFrom + (powerTo - powerFrom) * easeOutCubic(t);
        if (t >= 1) powerStart = null;
      }
      if (colourStart !== null) {
        const t = clamp((time - colourStart) / COLOUR_MS, 0, 1);
        colourNow.lerpColors(colourFrom, colourTo, easeOutCubic(t));
        if (t >= 1) colourStart = null;
      }
      applyLight();

      if (!dragging) {
        const decay = Math.pow(INERTIA, dt * 60);
        moon.rotation.y += velocityY * dt * 60;
        tilt = clamp(tilt + velocityX * dt * 60, -MAX_TILT, MAX_TILT);
        velocityY *= decay;
        velocityX *= decay;
        if (options.autoRotate && !reduced) moon.rotation.y += dt * 0.12;
      }
      moon.rotation.x = tilt;
      if (!reduced) levitating.position.y = moonY + Math.sin((time / 1000) * 1.05) * 0.06;

      renderer.render(scene, camera);
      if (rendering) frame = requestAnimationFrame(tick);
    }

    function update() {
      const shouldRun = visible && !document.hidden && !lost;
      if (shouldRun && !rendering) {
        rendering = true;
        last = performance.now();
        frame = requestAnimationFrame(tick);
      } else if (!shouldRun && rendering) {
        rendering = false;
        if (frame) cancelAnimationFrame(frame);
        frame = 0;
      }
    }

    // Con il loop fermo basta un frame per mostrare un cambio (per esempio la luce dalla hero)
    function requestRender() {
      if (!rendering && !frame && !lost) frame = requestAnimationFrame(tick);
    }

    const resizeObserver = new ResizeObserver(() => {
      resize();
      requestRender();
    });
    resizeObserver.observe(stage);
    cleanups.push(() => resizeObserver.disconnect());

    const visibility = new IntersectionObserver((entries) => {
      visible = entries[entries.length - 1].isIntersecting;
      update();
    });
    visibility.observe(stage);
    cleanups.push(() => visibility.disconnect());
    listen(document, 'visibilitychange', update);

    listen(canvas, 'webglcontextlost', (event) => {
      event.preventDefault();
      lost = true;
      rendering = false;
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      stage.classList.remove('is-3d');
      stage.classList.add('is-fallback');
    });

    resize();
    applyLight();
    renderer.render(scene, camera);
    stage.setAttribute('data-luna-renderer', renderer.capabilities.isWebGL2 ? 'webgl2' : 'webgl');
    stage.setAttribute('data-luna-power', String(powerTo));
    stage.setAttribute('data-luna-colour', '#' + colourTo.getHexString());
    stage.setAttribute('data-luna-rotation', moon.rotation.y.toFixed(3));

    return {
      destroy() {
        rendering = false;
        if (frame) cancelAnimationFrame(frame);
        cleanups.forEach((cleanup) => cleanup());
        disposables.forEach((item) => item.dispose());
        release();
        ['data-luna-renderer', 'data-luna-power', 'data-luna-colour', 'data-luna-rotation'].forEach((name) =>
          stage.removeAttribute(name)
        );
      },
    };
  } catch (error) {
    cleanups.forEach((cleanup) => cleanup());
    disposables.forEach((item) => item.dispose());
    release();
    throw error;
  }
}
