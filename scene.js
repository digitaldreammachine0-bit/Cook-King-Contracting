import {
  WebGLRenderer, Scene, PerspectiveCamera, Group, Clock,
  HemisphereLight, DirectionalLight, PMREMGenerator
} from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import {
  BUILDERS, loadHammerModel, loadBoxModels, loadWrenchModel, loadBottleModel
} from './models.js';

const canvas = document.getElementById('bg-canvas');
const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const DRIFT = REDUCED ? 0.15 : 1;

function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

/* Deterministic PRNG (mulberry32) so the layout is identical on every load.
   Math.random() would reshuffle the hero on every refresh. */
function seeded(seed) {
  let t = seed >>> 0;
  return function () {
    t = (t + 0x6D2B79F5) >>> 0;
    let x = Math.imul(t ^ (t >>> 15), 1 | t);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

let renderer = null;
try {
  renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
} catch (err) {
  console.warn('[cookking] WebGL unavailable. Staying on the fallback page.', err);
}

if (renderer !== null) boot(renderer);

function boot(renderer) {
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setClearAlpha(0);

  // Metal with no environment renders near-black, which is fatal on a black page.
  const pmrem = new PMREMGenerator(renderer);
  const envMap = pmrem.fromScene(new RoomEnvironment()).texture;
  pmrem.dispose();

  const scenes = [];

  function makeStage(elementId, fov, camZ) {
    const el = document.getElementById(elementId);
    if (el === null) return null;

    const scene = new Scene();
    scene.environment = envMap;

    const camera = new PerspectiveCamera(fov, 1, 0.1, 100);
    camera.position.set(0, 0, camZ);

    scene.add(new HemisphereLight(0xffffff, 0x1a2634, 1.4));
    const key = new DirectionalLight(0xffffff, 2.2);
    key.position.set(3, 5, 4);
    scene.add(key);

    const tiltGroup = new Group();
    scene.add(tiltGroup);

    const stage = { el, scene, camera, tiltGroup, spinners: [], update: null };
    scenes.push(stage);
    return stage;
  }

  /* ---------------- hero ---------------- */
  const hero = makeStage('hero-3d', 45, 7);
  /* Small and many, not big and few. At the earlier scale the objects clipped
     every edge and fought the headline instead of sitting behind it.
     The hero fills the whole screen now, so the counts went up and the scale
     came down. Fewer, larger objects read as clutter at this height. */
  const HERO_COUNT = window.innerWidth >= 620 ? 22 : 12;
  const rnd = seeded(1337);

  /* Which object goes in which slot. Shuffled so the four shapes do not repeat
     in a visible left-to-right pattern. */
  const order = [];
  for (let i = 0; i < HERO_COUNT; i++) order.push(i % BUILDERS.length);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    const tmp = order[i]; order[i] = order[j]; order[j] = tmp;
  }

  for (let i = 0; i < HERO_COUNT; i++) {
    const obj = BUILDERS[order[i]]();
    obj.position.z = (rnd() - 0.5) * 5 - 0.5;
    obj.scale.setScalar(0.20 + rnd() * 0.26);
    obj.rotation.set(rnd() * 6.283, rnd() * 6.283, rnd() * 6.283);
    hero.tiltGroup.add(obj);

    /* Normalised placement, -0.5 .. 0.5. The real x and y are derived from
       the visible frame on every draw. A fixed world-unit spread bunches
       everything into the middle of a wide desktop hero and shoves it off
       the edges of a narrow phone one.

       x is stratified: one object per horizontal slot, jittered inside it.
       Pure random clumps badly at this sample size and leaves bald patches
       at one end of the hero. */
    let nx = ((i + 0.5) / HERO_COUNT - 0.5) + (rnd() - 0.5) * (0.8 / HERO_COUNT);
    let ny = rnd() - 0.5;

    /* Keep-out ellipse around the middle.

       The hero used to be a short band, so a random spread sat safely below the
       text. Now the hero is the whole screen and that same spread drops objects
       straight onto the logo. Anything landing inside the ellipse is thrown back
       out past its edge by a random amount, so the mark and the button stay
       clear without the leftovers forming a visible ring around them. */
    /* Sized off the object centre, not its outline, so it runs wider than the
       logo itself. A long wrench parked just past the edge still swings its
       ends back over the mark otherwise. */
    const KX = 0.44, KY = 0.36;
    if (Math.hypot(nx / KX, ny / KY) < 1) {
      const ang = Math.atan2(ny, nx);
      const r = 1.05 + rnd() * 0.60;
      nx = Math.max(-0.5, Math.min(0.5, KX * r * Math.cos(ang)));
      ny = Math.max(-0.5, Math.min(0.5, KY * r * Math.sin(ang)));
    }

    hero.spinners.push({
      obj,
      nx,
      ny,
      rx: (rnd() - 0.5) * 0.50,
      ry: (rnd() - 0.5) * 0.50,
      rz: (rnd() - 0.5) * 0.35,
      bob: 0.10 + rnd() * 0.16,
      phase: rnd() * 6.283,
      baseY: 0,
    });
  }

  /* Bring in the real models once they have downloaded, and drop each clone
     exactly where its stand-in already was. The draw loop reads s.obj every
     frame, so reassigning it here is enough. Clones share one geometry and one
     texture, so the extra copies cost almost nothing.

     Where a model ships several variants they are dealt out in turn. That
     breaks up the repetition without downloading anything more. */
  function swapIn(kind, models) {
    if (models === null) return;
    const list = Array.isArray(models) ? models : [models];
    if (list.length === 0) return;

    let n = 0;
    for (const s of hero.spinners) {
      if (s.obj.userData.kind !== kind) continue;
      const real = list[n++ % list.length].clone();
      real.position.copy(s.obj.position);
      real.rotation.copy(s.obj.rotation);
      real.scale.copy(s.obj.scale);
      hero.tiltGroup.remove(s.obj);
      hero.tiltGroup.add(real);
      s.obj = real;
    }
  }

  loadHammerModel().then((m) => swapIn('hammer', m));
  loadBoxModels().then((m) => swapIn('box', m));
  loadWrenchModel().then((m) => swapIn('wrench', m));
  loadBottleModel().then((m) => swapIn('bottle', m));

  /* ---------------- tilt input ---------------- */
  const tilt = { x: 0, y: 0, tx: 0, ty: 0 };
  const MAX_X = 0.26;
  const MAX_Y = 0.34;

  /* Tilt is phone-only, by choice. There is deliberately no mouse handler:
     objects chasing the cursor on desktop was tried and rejected. Desktop gets
     the ambient drift and nothing else. */
  if (!REDUCED) {
    const onOrient = (e) => {
      if (e.gamma === null || e.gamma === undefined) return;
      tilt.ty = clamp(e.gamma / 45, -1, 1) * MAX_Y;
      const beta = (e.beta === null || e.beta === undefined) ? 45 : e.beta;
      tilt.tx = clamp((beta - 45) / 45, -1, 1) * MAX_X;
    };

    const DOE = window.DeviceOrientationEvent;
    if (DOE && typeof DOE.requestPermission === 'function') {
      // iOS 13+: the request must come from inside a real user gesture.
      const ask = () => {
        document.removeEventListener('touchend', ask);
        document.removeEventListener('click', ask);
        DOE.requestPermission()
          .then((res) => {
            if (res === 'granted') window.addEventListener('deviceorientation', onOrient, { passive: true });
          })
          .catch(() => { /* declined or unavailable. Drift keeps running. */ });
      };
      document.addEventListener('touchend', ask);
      document.addEventListener('click', ask);
    } else if (DOE) {
      window.addEventListener('deviceorientation', onOrient, { passive: true });
    }
  }

  /* ---------------- loop ---------------- */
  const clock = new Clock();
  let elapsed = 0;
  let rafId = 0;

  function resizeToDisplay() {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    const pr = renderer.getPixelRatio();
    if (canvas.width !== Math.floor(w * pr) || canvas.height !== Math.floor(h * pr)) {
      renderer.setSize(w, h, false);
    }
  }

  function frame() {
    rafId = requestAnimationFrame(frame);

    // Clamped so a long background tab or a stalled frame cannot jump the scene.
    const dt = Math.min(clock.getDelta(), 0.05);
    elapsed += dt;

    resizeToDisplay();
    canvas.style.transform = 'translateY(' + window.scrollY + 'px)';

    tilt.x += (tilt.tx - tilt.x) * 0.06;
    tilt.y += (tilt.ty - tilt.y) * 0.06;

    const W = canvas.clientWidth;
    const H = canvas.clientHeight;

    renderer.setScissorTest(false);
    renderer.clear();
    renderer.setScissorTest(true);

    for (const st of scenes) {
      const r = st.el.getBoundingClientRect();
      if (r.bottom < 0 || r.top > H || r.right < 0 || r.left > W) continue;
      if (r.width < 2 || r.height < 2) continue;

      // How much world space this rectangle actually shows at z = 0.
      const visH = 2 * st.camera.position.z * Math.tan((st.camera.fov * Math.PI / 180) / 2);
      const visW = visH * (r.width / r.height);

      for (const s of st.spinners) {
        s.obj.rotation.x += s.rx * dt * DRIFT;
        s.obj.rotation.y += s.ry * dt * DRIFT;
        s.obj.rotation.z += s.rz * dt * DRIFT;
        if (s.nx !== undefined) {
          s.obj.position.x = s.nx * visW * 0.94;
          s.baseY = s.ny * visH * 0.80;
        }
        s.obj.position.y = s.baseY + Math.sin(elapsed * 0.6 + s.phase) * s.bob * DRIFT;
      }
      if (st.update !== null) st.update(dt, elapsed);

      st.tiltGroup.rotation.x = tilt.x;
      st.tiltGroup.rotation.y = tilt.y;

      st.camera.aspect = r.width / r.height;
      st.camera.updateProjectionMatrix();

      renderer.setViewport(r.left, H - r.bottom, r.width, r.height);
      renderer.setScissor(r.left, H - r.bottom, r.width, r.height);
      renderer.render(st.scene, st.camera);
    }
  }

  /* ---------------- lifecycle ---------------- */
  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
    document.documentElement.classList.remove('webgl-on');
    console.warn('[cookking] WebGL context lost. Reverted to the fallback page.');
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
    } else if (rafId === 0 && document.documentElement.classList.contains('webgl-on')) {
      clock.getDelta();   // throw away the hidden gap
      rafId = requestAnimationFrame(frame);
    }
  });

  // Exposed for verification steps only.
  window.__cookking = { scenes, renderer, makeStage };

  document.documentElement.classList.add('webgl-on');
  rafId = requestAnimationFrame(frame);
}
