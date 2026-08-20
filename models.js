import {
  BoxGeometry, CylinderGeometry, TorusGeometry, ExtrudeGeometry,
  Shape, Group, Mesh, MeshStandardMaterial,
  Box3, Vector3, TextureLoader, SRGBColorSpace, LoadingManager
} from 'three';

/* ---------------------------------------------------------------
   Shared materials. Created once, reused by every mesh in every
   scene. Two colours are deliberately lighter than the v3 brand
   values because this page is black: #2166b8 and #3a3a3a both
   disappeared against it.
   --------------------------------------------------------------- */
export const MAT = {
  /* Cardboard was 0xc89f6b. Under the key light it washed out to a flat pale
     yellow and stopped reading as cardboard. Warmed and darkened. */
  cardboard: new MeshStandardMaterial({ color: 0xa9764a, roughness: 0.95, metalness: 0.0, flatShading: true }),
  tape:      new MeshStandardMaterial({ color: 0x8a5f39, roughness: 0.80, metalness: 0.0 }),
  steel:     new MeshStandardMaterial({ color: 0xb9c2cc, roughness: 0.25, metalness: 0.90 }),
  plastic:   new MeshStandardMaterial({ color: 0x3d86e0, roughness: 0.20, metalness: 0.05 }),
  wood:      new MeshStandardMaterial({ color: 0x8a6a45, roughness: 0.85, metalness: 0.0 }),
};

/* ---------------------------------------------------------------
   Shared geometry. Built once at module load.
   --------------------------------------------------------------- */
function wrenchShape() {
  // An open-end spanner silhouette. The slot is carved out of the right edge.
  const s = new Shape();
  s.moveTo(-1.05, -0.105);
  s.lineTo( 0.82, -0.105);
  s.lineTo( 0.94, -0.320);
  s.lineTo( 1.26, -0.320);
  s.lineTo( 1.26, -0.100);
  s.lineTo( 1.06, -0.100);
  s.lineTo( 1.06,  0.100);
  s.lineTo( 1.26,  0.100);
  s.lineTo( 1.26,  0.320);
  s.lineTo( 0.94,  0.320);
  s.lineTo( 0.82,  0.105);
  s.lineTo(-1.05,  0.105);
  s.closePath();
  return s;
}

const GEO = {
  box:  new BoxGeometry(1, 1, 1),
  tape: new BoxGeometry(0.22, 0.02, 1.02),

  wrench: new ExtrudeGeometry(wrenchShape(), {
    depth: 0.13, bevelEnabled: true,
    bevelThickness: 0.018, bevelSize: 0.018, bevelSegments: 2, curveSegments: 4,
  }),
  ring: new TorusGeometry(0.26, 0.09, 10, 22),

  bottleBody:     new CylinderGeometry(0.34, 0.38, 0.95, 18),
  bottleShoulder: new CylinderGeometry(0.17, 0.34, 0.22, 18),
  bottleNeck:     new CylinderGeometry(0.13, 0.13, 0.14, 14),
  bottleHead:     new BoxGeometry(0.40, 0.26, 0.24),
  bottleNozzle:   new CylinderGeometry(0.05, 0.05, 0.22, 10),

  hammerHandle: new CylinderGeometry(0.065, 0.085, 1.45, 12),
  hammerHead:   new BoxGeometry(0.52, 0.19, 0.19),
  hammerClaw:   new BoxGeometry(0.20, 0.17, 0.17),
};

/* ---------------------------------------------------------------
   Builders
   --------------------------------------------------------------- */
export function makeBox() {
  const g = new Group();
  /* Tag it so the hero can find these again and swap in the real model. */
  g.userData.kind = 'box';
  g.add(new Mesh(GEO.box, MAT.cardboard));
  const tape = new Mesh(GEO.tape, MAT.tape);
  tape.position.y = 0.505;
  g.add(tape);
  return g;
}

export function makeWrench() {
  const outer = new Group();
  const inner = new Group();

  inner.add(new Mesh(GEO.wrench, MAT.steel));

  const ring = new Mesh(GEO.ring, MAT.steel);
  // ExtrudeGeometry runs z = 0 .. depth, so its z centre is depth / 2.
  ring.position.set(-1.12, 0, 0.065);
  inner.add(ring);

  // Silhouette spans x -1.47 .. 1.26, so its centre is at -0.105. Shift it back
  // to the origin, and pull z back by half the extrude depth.
  inner.position.set(0.105, 0, -0.065);

  outer.add(inner);
  return outer;
}

export function makeBottle() {
  const g = new Group();

  const body = new Mesh(GEO.bottleBody, MAT.plastic);
  body.position.y = -0.15;
  g.add(body);

  const shoulder = new Mesh(GEO.bottleShoulder, MAT.plastic);
  shoulder.position.y = 0.435;
  g.add(shoulder);

  const neck = new Mesh(GEO.bottleNeck, MAT.steel);
  neck.position.y = 0.615;
  g.add(neck);

  const head = new Mesh(GEO.bottleHead, MAT.steel);
  head.position.set(0.02, 0.78, 0);
  g.add(head);

  const nozzle = new Mesh(GEO.bottleNozzle, MAT.steel);
  nozzle.rotation.z = Math.PI / 2;
  nozzle.position.set(0.28, 0.82, 0);
  g.add(nozzle);

  return g;
}

export function makeHammer() {
  const g = new Group();
  /* Tag it so the hero can find these again and swap in the real model. */
  g.userData.kind = 'hammer';

  const handle = new Mesh(GEO.hammerHandle, MAT.wood);
  handle.position.y = -0.15;
  g.add(handle);

  const head = new Mesh(GEO.hammerHead, MAT.steel);
  head.position.y = 0.63;
  g.add(head);

  const claw = new Mesh(GEO.hammerClaw, MAT.steel);
  claw.position.set(-0.31, 0.68, 0);
  claw.rotation.z = 0.5;
  g.add(claw);

  return g;
}

export const BUILDERS = [makeBox, makeWrench, makeBottle, makeHammer];

/* ---------------------------------------------------------------
   Supplied models.

   Every other shape here is built from primitives and costs nothing
   to download. These two are real 3D files the owner provided, and
   they are heavy enough that the page must not wait on them. So the
   page draws the simple shapes immediately and quietly replaces them
   once the real ones land. If a download fails, the simple shape just
   stays. Nothing breaks and nothing shifts.
   --------------------------------------------------------------- */

/* An exported model arrives in whatever position, size and orientation its
   authoring tool used. This stands it up, centres it on the origin and scales
   it to a known length, so the hero can spin and bob it with the same code it
   uses for the primitive shapes.

   Two groups on purpose. The inner one carries the centring and the shrink.
   The outer one keeps a clean origin for the animation to drive. */
function normalise(root, targetLength, kind, standUp) {
  if (standUp) root.rotation.x = -Math.PI / 2;
  root.updateMatrixWorld(true);

  const bounds = new Box3().setFromObject(root);
  const size = bounds.getSize(new Vector3());
  const mid = bounds.getCenter(new Vector3());
  const longest = Math.max(size.x, size.y, size.z) || 1;
  const k = targetLength / longest;

  const inner = new Group();
  inner.add(root);
  inner.scale.setScalar(k);
  inner.position.set(-mid.x * k, -mid.y * k, -mid.z * k);

  const outer = new Group();
  outer.add(inner);
  outer.userData.kind = kind;
  return outer;
}

function texture(url, srgb) {
  const t = new TextureLoader().load(url);
  if (srgb) t.colorSpace = SRGBColorSpace;
  return t;
}

/* ---- hammer: one OBJ, about 840 KB, plus a 200 KB texture ---- */
const HAMMER_DIR = 'assets/10293_Hammer_v1_L3.123c51dba3aa-a225-4b4a-ac53-c4f5dbcb0c37/';

/* The primitive hammer runs about 1.6 world units end to end. Matching it
   means the swap does not change how big the object reads on screen. */
const HAMMER_LENGTH = 1.6;

let hammerPromise = null;

export function loadHammerModel() {
  if (hammerPromise !== null) return hammerPromise;

  hammerPromise = import('three/addons/loaders/OBJLoader.js')
    .then(({ OBJLoader }) => new Promise((resolve, reject) => {
      new OBJLoader().load(HAMMER_DIR + '10293_Hammer_v1_iterations-2.obj', resolve, undefined, reject);
    }))
    .then((root) => {
      const skin = new MeshStandardMaterial({
        map: texture(HAMMER_DIR + '10293_Hammer_v1_diffuse.jpg', true),
        roughness: 0.55,
        metalness: 0.22,
      });
      root.traverse((node) => { if (node.isMesh) node.material = skin; });
      /* Exported from 3ds Max, so it lies on its side. Stand it up. */
      return normalise(root, HAMMER_LENGTH, 'hammer', true);
    })
    .catch((err) => {
      console.warn('Hammer model did not load. Keeping the built-in one.', err);
      return null;
    });

  return hammerPromise;
}

/* ---- moving boxes: three FBX variants, about 21 KB each ----

   The supplied textures were three 2048 x 2048 TGA files, 36 MB in total. TGA
   does not display in a browser and that weight would sink the page on a phone,
   so they were converted once into the web folder next to them: base colour at
   1024 as a 128 KB jpg, normal at 512 as a 19 KB jpg. The originals are left
   untouched. The roughness and metallic maps were dropped, because cardboard is
   matte and two numbers below say the same thing for free. */
const BOX_DIR = 'assets/MovingBox_Files/';
const BOX_FILES = [
  'Unreal_Export/SM_MovingBox_01.fbx',
  'Unreal_Export/SM_MovingBox_02.fbx',
  'Unreal_Export/SM_MovingBox_03.fbx',
];

/* The primitive box is a 1 x 1 x 1 cube. */
const BOX_LENGTH = 1.0;

let boxPromise = null;

export function loadBoxModels() {
  if (boxPromise !== null) return boxPromise;

  boxPromise = import('three/addons/loaders/FBXLoader.js')
    .then(({ FBXLoader }) => {
      const skin = new MeshStandardMaterial({
        map: texture(BOX_DIR + 'web/movingbox_basecolor.jpg', true),
        normalMap: texture(BOX_DIR + 'web/movingbox_normal.jpg', false),
        roughness: 0.92,
        metalness: 0.0,
      });

      /* The FBX files name a texture from the pack they were cut from, and that
         file is not in the folder the owner supplied. Left alone the loader
         chases it and logs a 404 on every page load. The material above replaces
         whatever the file asked for anyway, so send any texture request to a
         single transparent pixel and let it go quietly. Only the .fbx requests
         are allowed through untouched. */
      const BLANK = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
      const quiet = new LoadingManager();
      quiet.setURLModifier((url) => (/\.fbx(\?|$)/i.test(url) ? url : BLANK));

      const loader = new FBXLoader(quiet);
      return Promise.all(BOX_FILES.map((file) => new Promise((resolve) => {
        loader.load(BOX_DIR + file, (root) => {
          root.traverse((node) => { if (node.isMesh) node.material = skin; });
          resolve(normalise(root, BOX_LENGTH, 'box', false));
        }, undefined, (err) => {
          console.warn('Box variant did not load: ' + file, err);
          resolve(null);
        });
      })));
    })
    .then((list) => {
      const good = list.filter((m) => m !== null);
      return good.length > 0 ? good : null;
    })
    .catch((err) => {
      console.warn('Box models did not load. Keeping the built-in one.', err);
      return null;
    });

  return boxPromise;
}
