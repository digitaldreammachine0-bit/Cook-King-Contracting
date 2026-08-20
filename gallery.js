import {
  Group, Mesh, PlaneGeometry, MeshBasicMaterial, TextureLoader, SRGBColorSpace
} from 'three';

const PHOTOS = [
  'Images/after1.jpg',
  'Images/before1.jpg',
  'Images/after2.jpg',
  'Images/before2.jpg',
  'Images/after3.jpg',
  'Images/before3.jpg',
];

const RADIUS = 3.1;

/* 0 = every panel faces the camera dead-on, which reads as a flat row.
   1 = every panel faces straight out from the ring, which hides the outer ones.
   The blend keeps the arc legible as depth. */
const PANEL_TURN = 0.55;

export function attachGallery(stage) {
  const ring = new Group();
  stage.tiltGroup.add(ring);

  const loader = new TextureLoader();
  const geo = new PlaneGeometry(2.4, 1.6);
  const step = (Math.PI * 2) / PHOTOS.length;
  const panels = [];

  PHOTOS.forEach((src, i) => {
    const tex = loader.load(src);
    tex.colorSpace = SRGBColorSpace;

    // Each panel needs its own material because opacity is per-panel.
    const mesh = new Mesh(geo, new MeshBasicMaterial({ map: tex, transparent: true }));
    mesh.userData.angle = i * step;
    mesh.userData.phase = i * 1.1;
    ring.add(mesh);
    panels.push(mesh);
  });

  let angle = 0;
  let target = 0;
  let velocity = 0;
  let dragging = false;
  let axis = null;
  let lastX = 0;
  let startX = 0;
  let startY = 0;

  const el = stage.el;
  const snap = (v) => Math.round(v / step) * step;

  el.addEventListener('pointerdown', (e) => {
    dragging = true;
    axis = null;
    lastX = startX = e.clientX;
    startY = e.clientY;
    velocity = 0;
    // Throws NotFoundError if the pointer is not active. Not worth failing over.
    try { el.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    el.classList.add('dragging');
  });

  el.addEventListener('pointermove', (e) => {
    if (!dragging) return;

    if (axis === null) {
      const dx = Math.abs(e.clientX - startX);
      const dy = Math.abs(e.clientY - startY);
      if (dx + dy < 6) return;              // too small to call yet
      axis = dx > dy ? 'x' : 'y';
      if (axis === 'y') {                   // let the page scroll instead
        dragging = false;
        el.classList.remove('dragging');
        return;
      }
    }

    const d = (e.clientX - lastX) / 160;
    target -= d;
    velocity = -d;
    lastX = e.clientX;
  });

  const endDrag = () => {
    if (!dragging) return;
    dragging = false;
    el.classList.remove('dragging');
    target = snap(target + velocity * 8);   // coast, then land on a panel
    velocity = 0;
  };

  el.addEventListener('pointerup', endDrag);
  el.addEventListener('pointercancel', endDrag);

  const prev = document.querySelector('.gallery-prev');
  const next = document.querySelector('.gallery-next');
  if (prev !== null) prev.addEventListener('click', () => { target = snap(target) - step; });
  if (next !== null) next.addEventListener('click', () => { target = snap(target) + step; });

  stage.update = (dt, t) => {
    angle += (target - angle) * Math.min(1, dt * 6);
    ring.rotation.y = angle;

    for (const p of panels) {
      const a = p.userData.angle;

      p.position.set(
        Math.sin(a) * RADIUS,
        Math.sin(t * 0.8 + p.userData.phase) * 0.07,
        Math.cos(a) * RADIUS
      );

      /* World facing = local rotation + ring rotation. Solving for the local
         value that produces the blended world facing gives this. */
      p.rotation.y = PANEL_TURN * (a + angle) - angle;

      // Fade panels as they swing round the back.
      const world = a + angle;
      const facing = Math.cos(Math.atan2(Math.sin(world), Math.cos(world)));
      p.material.opacity = 0.20 + 0.80 * Math.max(0, facing);
    }
  };
}
