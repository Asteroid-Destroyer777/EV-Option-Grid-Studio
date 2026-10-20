import * as T from '../../vendor/three/three.module.js';
import {mergeGeometries} from '../../vendor/three/addons/utils/BufferGeometryUtils.js';

export {cityLayout,cityRoutes} from './city-layout.js';

export function addCities(root,cities){
  const glass=new T.MeshStandardMaterial({color:'#73b8d9',metalness:.65,roughness:.26,emissive:'#1c557a',emissiveIntensity:.35});
  const silver=glass.clone();silver.color.set('#c4dbe5');
  const gold=glass.clone();gold.color.set('#d9ac68');gold.emissive.set('#704821');
  const dark=new T.MeshStandardMaterial({color:'#314957',roughness:.76});
  const line=new T.MeshBasicMaterial({color:'#9ceaff',transparent:true,opacity:.68});
  const box=new T.BoxGeometry(1,1,1),dummy=new T.Object3D(),records=[],groups=[];
  for(const [index,city] of cities.entries()){
    const g=new T.Group();g.name=city.name;g.position.fromArray(city.position);g.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),new T.Vector3(...city.normal));root.add(g);groups.push(g);
    const radius=city.hub?.205:.085;
    const plinth=new T.Mesh(new T.CylinderGeometry(radius,radius*1.08,.016,48),dark);plinth.position.y=.003;plinth.receiveShadow=true;g.add(plinth);
    const ring=new T.Mesh(new T.TorusGeometry(radius,.0018,4,64),line);ring.rotation.x=Math.PI/2;ring.position.y=.014;g.add(ring);
    const count=city.hub?24:7;
    for(let j=0;j<count;j++){
      const a=j*2.399963,dist=city.hub?(j<6?.055:.105+((j%3)/3)*.06):.018+Math.sqrt(j/count)*.05;
      const x=Math.cos(a)*dist,z=Math.sin(a)*dist;
      const height=city.hub?(j===0?.43:j===1?.35:j===2?.38:j===3?.31:.09+((j*7)%13)*.012):.035+((j+index*3)%6)*.009;
      const width=city.hub?(j<4?.045:.025):.016;
      records.push({g,x,z,height,width,j,hub:city.hub});
    }
  }
  // Windows and mullions are batched: no per-building lights or frame updates.
  const windows=[],edges=[];
  for(const b of records){
    let geo=box,mat=b.hub?(b.j===2?gold:b.j%3===0?silver:glass):silver;
    if(b.hub&&b.j===3){
      geo=new T.BoxGeometry(b.width,b.height,b.width,1,18,1);
      const p=geo.attributes.position;
      for(let k=0;k<p.count;k++){const t=(p.getY(k)/b.height+.5),a=t*.9,x=p.getX(k),z=p.getZ(k);p.setXYZ(k,x*Math.cos(a)-z*Math.sin(a),p.getY(k),x*Math.sin(a)+z*Math.cos(a));}geo.computeVertexNormals();
    }
    const building=new T.Group();building.position.set(b.x,.014,b.z);building.rotation.x=b.hub?-.48:0;b.g.add(building);
    const tower=new T.Mesh(geo,mat);tower.position.set(0,b.height/2,0);if(geo===box)tower.scale.set(b.width,b.height,b.width);tower.castShadow=true;tower.receiveShadow=true;building.add(tower);
    if(b.hub&&b.j<3){const spire=new T.Mesh(new T.CylinderGeometry(.0007,.0018,.055,5),silver);spire.position.set(0,b.height+.026,0);spire.castShadow=true;building.add(spire);}
    for(let y=.025;y<b.height;y+=.014){const twist=b.hub&&b.j===3?y/b.height*.9:0;dummy.rotation.set(0,twist,0);dummy.position.set(Math.sin(twist)*b.width*.505,y,Math.cos(twist)*b.width*.505);dummy.scale.set(b.width*.84,.0015,.001);dummy.updateMatrix();b.g.updateMatrix();building.updateMatrix();const matrix=new T.Matrix4().multiplyMatrices(b.g.matrix,building.matrix),m=new T.Matrix4().multiplyMatrices(matrix,dummy.matrix);windows.push(m);}
    dummy.rotation.set(0,0,0);
    for(const sign of b.hub&&b.j===3?[]:[-1,1]){dummy.position.set(sign*b.width*.43,b.height/2,b.width*.506);dummy.scale.set(.001,b.height,.001);dummy.updateMatrix();edges.push(new T.Matrix4().multiplyMatrices(new T.Matrix4().multiplyMatrices(b.g.matrix,building.matrix),dummy.matrix));}
  }
  for(const matrices of [windows,edges]){const mesh=new T.InstancedMesh(box,line,matrices.length);matrices.forEach((m,i)=>mesh.setMatrixAt(i,m));root.add(mesh);}
  // All architecture is static in planet coordinates: batch it once by material.
  root.updateMatrixWorld(true);
  const inverse=new T.Matrix4().copy(root.matrixWorld).invert(),batches=new Map();
  for(const group of groups){group.traverse(o=>{if(!o.isMesh)return;const key=o.material;let batch=batches.get(key);if(!batch){batch={geometries:[],cast:false,receive:false};batches.set(key,batch);}batch.geometries.push(o.geometry.clone().applyMatrix4(new T.Matrix4().multiplyMatrices(inverse,o.matrixWorld)));batch.cast ||= o.castShadow;batch.receive ||= o.receiveShadow;});root.remove(group);}
  for(const [material,batch] of batches){const geometry=mergeGeometries(batch.geometries);batch.geometries.forEach(g=>g.dispose());const mesh=new T.Mesh(geometry,material);mesh.castShadow=batch.cast;mesh.receiveShadow=batch.receive;root.add(mesh);}
  return records.length;
}
