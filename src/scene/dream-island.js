// Architectural illustration of the west entrance; original OSM footprint/collision stays intact.
// Visual reference: https://dreamisland.ru/about . This is not an as-built survey model.
import * as THREE from 'three';
import {Assembly} from './assembly.js';
import {geo} from '../data/geo.js';
export function isDreamIsland(name){return typeof name==='string'&&/остров мечты/i.test(name);}
export function buildDreamIsland(parent,labels,onFocus){
 const building=geo.data.buildings.find(b=>isDreamIsland(b[4]));if(!building)return;
 const ring=building[3],shape=new THREE.Shape();for(let i=0;i<ring.length;i+=2)i?shape.lineTo(ring[i],-ring[i+1]):shape.moveTo(ring[i],-ring[i+1]);shape.closePath();
 const root=new THREE.Group();root.name='dream-island-architectural-model';root.userData={source:'OpenStreetMap footprint; facade illustrated from dreamisland.ru',surveyed:false};parent.add(root);
 const mats={stone:new THREE.MeshStandardMaterial({color:'#d4cfc5',roughness:.85}),trim:new THREE.MeshStandardMaterial({color:'#eee6d7',roughness:.7}),roof:new THREE.MeshStandardMaterial({color:'#4c5267',metalness:.45,roughness:.5}),glass:new THREE.MeshStandardMaterial({color:'#42566f',metalness:.65,roughness:.18}),dark:new THREE.MeshStandardMaterial({color:'#1d2636',roughness:.8}),light:new THREE.MeshStandardMaterial({color:'#ecd8a2',emissive:'#b78a4d',emissiveIntensity:.45,roughness:.5})};
 const hall=new THREE.Mesh(new THREE.ExtrudeGeometry(shape,{depth:19,bevelEnabled:false,steps:1}),mats.stone);hall.rotation.x=-Math.PI/2;root.add(hall);
 const facade=new THREE.Group();facade.position.set(1628,0,1586);facade.rotation.y=-Math.PI/2;root.add(facade);const a=new Assembly();
 a.box('stone',0,13,-5,202,26,12);a.box('trim',0,2,2,208,4,19);a.box('trim',0,26,0,207,1.4,17);a.box('trim',0,20,1.2,202,.7,15);
 // Central gate and portico, tall square towers, corner turrets and steep slate roofs.
 a.box('stone',0,18,4,44,36,24);a.box('trim',0,3,17,53,5,13);a.box('trim',0,35.5,4,47,1.4,27);
 for(const x of [-21,21]){a.box('stone',x,23,8,10,46,18);a.box('trim',x,43,8,12,1.2,20);a.box('trim',x,35,8,11,.9,19);}
 for(const x of [-84,-48,48,84]){const h=Math.abs(x)>60?32:40;a.box('stone',x,h/2,1,16,h,20);a.box('trim',x,h,1,18,1.2,22);a.box('trim',x,h-9,1,17,.8,21);for(const dx of [-8,8])for(const dz of [-9,9]){a.cyl('stone',x+dx,h/2,1+dz,2.7,h,12);a.cyl('trim',x+dx,h-.6,1+dz,3.2,1.2,12);}}
 for(let x=-96;x<=96;x+=8){if(Math.abs(x)<25)continue;a.box('dark',x,10,1.15,3.9,11,.2);a.box('glass',x,11,1.32,3.4,10,.16);a.box('trim',x-2.4,12,2,.5,19,1);a.box('trim',x,5.8,2,4.7,.6,1.1);}
 for(let x=-19;x<=19;x+=4){a.box('glass',x,19,16.05,2.6,19,.25);a.box('trim',x,19,16.25,.22,19,.4);}a.box('dark',0,5,16.3,14,10,.2);
 a.box('light',0,31,16.5,17,1.2,.4);for(let x=-100;x<=100;x+=10)a.box('trim',x,27,0,2.4,2.3,15);
 for(let i=0;i<5;i++)a.box('trim',0,.14+i*.24,24-i*2,57-i*2,.25,2.3);
 facade.add(a.build(role=>mats[role]));
 const cone=(x,z,y,r,h,segments=4,rot=Math.PI/4)=>{const m=new THREE.Mesh(new THREE.ConeGeometry(r,h,segments),mats.roof);m.position.set(x,y+h/2,z);m.rotation.y=rot;facade.add(m);};
 for(const x of [-21,21]){cone(x,8,46,9,17);cone(x,8,62,1.1,8,8,0);}
 for(const x of [-84,-48,48,84]){const h=Math.abs(x)>60?32:40;cone(x,1,h,13,16);for(const dx of [-8,8])for(const dz of [-9,9])cone(x+dx,1+dz,h,3.7,9,12,0);}
 // Roof lanterns on the actual hall, rather than invented separate buildings.
 for(const [x,z,r]of [[1830,1505,34],[1990,1460,31]]){const dome=new THREE.Mesh(new THREE.SphereGeometry(r,24,12,0,Math.PI*2,0,Math.PI/2),mats.glass);dome.scale.y=.45;dome.position.set(x,20,z);root.add(dome);}
 const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=160;const ctx=canvas.getContext('2d');ctx.fillStyle='#ddd8cf';ctx.fillRect(0,0,1024,160);ctx.fillStyle='#344563';ctx.font='600 70px Onest, sans-serif';ctx.textAlign='center';ctx.fillText('ОСТРОВ МЕЧТЫ',512,105);const sign=new THREE.Mesh(new THREE.PlaneGeometry(36,5.6),new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(canvas)}));sign.position.set(0,30,16.6);facade.add(sign);
 labels?.add('dream-island-facade',{html:'<span>Остров мечты</span><small>Архитектурная иллюстрация фасада</small>',cls:'lm dream-landmark',pos:new THREE.Vector3(1605,50,1586),min:20,max:2100,layers:['city','demand','investment','future']});
 const button=document.createElement('button');button.type='button';button.className='landmark-focus';button.textContent='Остров мечты · посмотреть фасад';button.onclick=()=>onFocus?.({x:1570,z:1586});document.querySelector('#rail')?.append(button);return root;
}
