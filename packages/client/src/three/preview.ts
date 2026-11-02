import * as THREE from "three";
import type { Avatar } from "@rzparty/shared";
import { buildAvatar3D, disposeObject } from "./avatar3d.ts";

export interface AvatarPreview {
  update(avatar: Avatar): void;
  destroy(): void;
}

/**
 * Aperçu 3D d'un avatar : il tourne doucement, et on peut le faire pivoter au doigt ou à la souris.
 * Renvoie null si le navigateur ne sait pas afficher la 3D (on garde alors l'aperçu 2D).
 */
export function mountAvatarPreview(host: HTMLElement, avatar: Avatar): AvatarPreview | null {
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  } catch {
    return null;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  host.append(renderer.domElement);
  renderer.domElement.classList.add("preview3d__canvas");

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 20);
  camera.position.set(0, 0.95, 3.1);
  camera.lookAt(0, 0.6, 0);

  scene.add(new THREE.HemisphereLight(0xffffff, 0xbfe3ff, 1.6));
  const sun = new THREE.DirectionalLight(0xffffff, 2.2);
  sun.position.set(2, 3, 2.5);
  scene.add(sun);

  // Socle rond, comme sur l'écran du salon.
  const plinth = new THREE.Mesh(
    new THREE.CylinderGeometry(0.55, 0.6, 0.12, 48),
    new THREE.MeshToonMaterial({ color: 0xffffff }),
  );
  plinth.position.y = -0.06;
  scene.add(plinth);

  const turntable = new THREE.Group();
  scene.add(turntable);
  let model = buildAvatar3D(avatar);
  turntable.add(model);

  // Rotation : un léger balancement face à l'écran, ou un tour complet au glisser.
  // Un tour complet à l'ouverture : on voit tout de suite que c'est de la 3D.
  let angle = -Math.PI * 2;
  let intro = true;
  let dragging = false;
  let lastX = 0;
  let idleSince = performance.now();
  const canvas = renderer.domElement;
  canvas.style.touchAction = "pan-y";
  canvas.addEventListener("pointerdown", (e) => {
    dragging = true;
    intro = false;
    host.classList.add("is-touched");
    lastX = e.clientX;
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    angle += (e.clientX - lastX) * 0.012;
    lastX = e.clientX;
  });
  const stopDrag = () => {
    dragging = false;
    idleSince = performance.now();
  };
  canvas.addEventListener("pointerup", stopDrag);
  canvas.addEventListener("pointercancel", stopDrag);

  const resize = () => {
    const w = host.clientWidth || 240;
    const h = host.clientHeight || 260;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  const observer = new ResizeObserver(resize);
  observer.observe(host);
  resize();

  const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  let last = performance.now();
  let hop = 0;
  renderer.setAnimationLoop((now) => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (intro && !reduceMotion) {
      angle += dt * 2.6;
      if (angle >= 0) {
        angle = 0;
        intro = false;
        idleSince = now;
      }
    } else if (!dragging && now - idleSince > 1500) {
      // Revient doucement de face, puis se balance pour montrer le profil.
      const sway = reduceMotion ? 0 : Math.sin(now / 1400) * 0.55;
      const target = Math.round(angle / (Math.PI * 2)) * Math.PI * 2 + sway;
      angle += (target - angle) * Math.min(1, dt * 2.5);
    }
    turntable.rotation.y = angle;
    // Petit saut quand l'avatar change.
    if (hop > 0) {
      hop = Math.max(0, hop - dt * 3);
      turntable.position.y = Math.sin((1 - hop) * Math.PI) * 0.12;
    }
    renderer.render(scene, camera);
  });

  return {
    update(next) {
      turntable.remove(model);
      disposeObject(model);
      model = buildAvatar3D(next);
      turntable.add(model);
      if (!reduceMotion) {
        hop = 1;
        // Un demi-tour rapide pour montrer le changement sous tous les angles.
        if (!dragging) {
          angle -= Math.PI * 2;
          intro = true;
        }
      }
    },
    destroy() {
      renderer.setAnimationLoop(null);
      observer.disconnect();
      disposeObject(scene);
      renderer.dispose();
      canvas.remove();
    },
  };
}
