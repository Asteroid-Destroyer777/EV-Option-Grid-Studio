const up={x:0,y:1,z:0};

// Local light/occluder geometry is static. Keep the cached depth map's world
// projection in the same rotating basis, including the shadow camera's roll.
export function syncPlanetShadow(root,light){
  root.updateWorldMatrix(true,true);
  light.shadow.camera.up.copy(up).transformDirection(root.matrixWorld);
  light.shadow.updateMatrices(light);
}
