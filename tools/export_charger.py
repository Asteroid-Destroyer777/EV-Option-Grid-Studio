import bpy,json,sys,math
from pathlib import Path
from mathutils import Vector
out=Path(sys.argv[sys.argv.index('--')+1]);groups={};excluded=[];kept=[]
for o in bpy.context.scene.objects:
 if o.type not in {'MESH','CURVE','FONT'}:continue
 if any(k in o.name.lower() for k in ['навес','солнеч','размет','асфальт','площадк','опор','земл']):excluded.append(o.name);continue
 kept.append(o.name)
 deps=bpy.context.evaluated_depsgraph_get();ob=o.evaluated_get(deps);m=ob.to_mesh();m.calc_loop_triangles()
 for tri in m.loop_triangles:
  mat=m.materials[tri.material_index] if m.materials else None
  col=list(mat.diffuse_color[:3]) if mat else [.8,.8,.8]
  if mat and mat.use_nodes:
   bs=next((n for n in mat.node_tree.nodes if n.type=='BSDF_PRINCIPLED'),None)
   if bs:col=list(bs.inputs['Base Color'].default_value[:3])
  key=mat.name if mat else 'default';g=groups.setdefault(key,{'name':key,'color':col,'positions':[],'normals':[]})
  for idx in tri.vertices:
   v=o.matrix_world @ m.vertices[idx].co;n=o.matrix_world.to_3x3() @ m.vertices[idx].normal
   g['positions'] += [round(v.x,5),round(v.z,5),round(-v.y,5)]
   g['normals'] += [round(n.x,5),round(n.z,5),round(-n.y,5)]
 ob.to_mesh_clear()
out.write_text(json.dumps({'source':'эзс.blend (user supplied)','excluded':excluded,'kept':kept,'meshes':list(groups.values())},ensure_ascii=False,separators=(',',':')))
print('EXPORTED',len(kept),'objects',len(groups),'materials',out.stat().st_size,'bytes');print('KEPT',kept);print('EXCLUDED',excluded)
