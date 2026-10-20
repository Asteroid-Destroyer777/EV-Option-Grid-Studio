import * as T from '../../vendor/three/three.module.js';
import {createSkylineLayout} from './skyline-layout.js';

function facadeTexture(lights=false) {
  const canvas=document.createElement('canvas');canvas.width=128;canvas.height=256;
  const ctx=canvas.getContext('2d');
  ctx.fillStyle=lights?'#000000':'#42647b';ctx.fillRect(0,0,128,256);
  for(let row=0;row<32;row++) for(let col=0;col<8;col++) {
    const lit=(row*17+col*13)%11<3;
    ctx.fillStyle=lights?(lit?'#ffc982':'#000000'):(lit?'#b9d6db':(row+col)%3?'#204052':'#7090a2');
    ctx.fillRect(col*16+3,row*8+2,10,4);
  }
  const texture=new T.CanvasTexture(canvas);texture.colorSpace=T.SRGBColorSpace;return texture;
}

export function addSkyline(root,layout) {
  const towers=createSkylineLayout(layout),group=new T.Group();group.name='Additional skyline / radial skyscrapers';
  const box=new T.BoxGeometry(1,1,1),facade=facadeTexture(),lights=facadeTexture(true);
  const material=new T.MeshStandardMaterial({map:facade,emissiveMap:lights,emissive:0xffffff,emissiveIntensity:.65,roughness:.3,metalness:.4});
  const bodies=new T.InstancedMesh(box,material,towers.length*3);
  const roofs=new T.InstancedMesh(box,new T.MeshStandardMaterial({color:'#c4d4db',roughness:.4,metalness:.6}),towers.length);
  const spires=towers.filter(t=>t.spire),antennas=new T.InstancedMesh(new T.CylinderGeometry(.5,.5,1,5),new T.MeshStandardMaterial({color:'#c3e8f4',metalness:.7,roughness:.3}),spires.length);
  const dummy=new T.Object3D(),up=new T.Vector3(0,1,0),normal=new T.Vector3();
  const palette=['#c0dbeb','#7ab4d5','#a9c5cb'];
  function place(mesh,index,t,height,width,depth,lift) {
    normal.fromArray(t.normal);dummy.quaternion.setFromUnitVectors(up,normal);dummy.rotateY(t.angle);
    dummy.position.copy(normal).multiplyScalar(t.radius+lift);dummy.scale.set(width,height,depth);dummy.updateMatrix();mesh.setMatrixAt(index,dummy.matrix);
  }
  towers.forEach((t,i)=>{
    const levels=[[.52,1,0],[.31,.8,.52],[.17,.57,.83]];
    levels.forEach(([height,width,bottom],level)=>{
      place(bodies,i*3+level,t,t.height*height,t.width*width,t.depth*width,t.height*(bottom+height/2));
      bodies.setColorAt(i*3+level,new T.Color(palette[t.style]));
    });
    place(roofs,i,t,.003,t.width*.6,t.depth*.6,t.height+.0015);
  });
  spires.forEach((t,i)=>place(antennas,i,t,.035,.0011,.0011,t.height+.020));
  for(const mesh of [bodies,roofs,antennas]){mesh.castShadow=true;mesh.receiveShadow=true;group.add(mesh);}
  root.add(group);
  return towers.length;
}
