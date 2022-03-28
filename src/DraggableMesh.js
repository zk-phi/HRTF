import * as THREE from "three";

export const initDraggable = (renderer, camera, controls) => {
  let draggableObjects = [];
  let draggedObject = null;

  const plane = new THREE.Plane();
  const raycaster = new THREE.Raycaster();

  const mouse = new THREE.Vector2();
  const updateRaycaster = (e) => {
    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = - ((e.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);
  };

  const intersection = new THREE.Vector3();
  renderer.domElement.addEventListener('mousemove', (e) => {
    e.preventDefault();
    if (draggedObject) {
      updateRaycaster(e);
      raycaster.ray.intersectPlane(plane, intersection);
      draggedObject.onDrag(intersection);
    }
  }, false);

  renderer.domElement.addEventListener('mousedown', (e) => {
    e.preventDefault();
    updateRaycaster(e);
    const intersects = raycaster.intersectObjects(draggableObjects);
    if (intersects.length > 0) {
      if (controls) {
        controls.forEach((control) => control.enabled = false);
      }
      draggedObject = intersects[0].object;
      draggedObject.onDragStart();
      camera.getWorldDirection(plane.normal);
      plane.constant -= plane.distanceToPoint(draggedObject.position);
    }
  }, false);

  renderer.domElement.addEventListener('mouseup', (e) => {
    e.preventDefault();
    if (controls) {
      controls.forEach((control) => control.enabled = true);
    }
    if (draggedObject) {
      draggedObject.onDragEnd();
      draggedObject = null;
    }
  }, false);

  class DraggableMesh extends THREE.Mesh {
    constructor(...props) {
      super(...props);
      draggableObjects.push(this);
    }
    removeFromParent() {
      draggableObjects = draggableObjects.filter((obj) => obj !== this);
      super.removeFromParent();
    }
    onDragStart() {
    }
    onDragEnd() {
    }
    onDrag() {
    }
  }

  return { DraggableMesh };
};
