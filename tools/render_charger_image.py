import bpy,sys,math
from mathutils import Vector
out=sys.argv[sys.argv.index('--')+1]
for o in list(bpy.context.scene.objects):
 if any(k in o.name.lower() for k in ['навес','солнеч','размет','асфальт','площадк','опор','земл','мачта','камера_','островок','бордюр','надпись_ev']):bpy.data.objects.remove(o,do_unlink=True)
s=bpy.context.scene;s.render.engine='CYCLES';s.cycles.samples=96;s.cycles.use_denoising=True;s.render.resolution_x=720;s.render.resolution_y=1200;s.render.resolution_percentage=100;s.render.film_transparent=True
for o in list(s.objects):
 if o.type in ['CAMERA','LIGHT']:bpy.data.objects.remove(o,do_unlink=True)
cdata=bpy.data.cameras.new('Product_Camera');cam=bpy.data.objects.new('Product_Camera',cdata);s.collection.objects.link(cam);s.camera=cam;cam.location=(1.8,-6,2.5);target=Vector((0,0,1.05));cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler();cdata.type='ORTHO';cdata.ortho_scale=2.65
for name,loc,power,size in [('Key',(-3,-4,6),700,4),('Fill',(4,-1,3),450,3),('Rim',(1,4,5),900,3)]:
 ld=bpy.data.lights.new(name,'AREA');ld.energy=power;ld.shape='DISK';ld.size=size;obj=bpy.data.objects.new(name,ld);s.collection.objects.link(obj);obj.location=loc;obj.rotation_euler=(target-obj.location).to_track_quat('-Z','Y').to_euler()
s.world=bpy.data.worlds.new('Product_World');s.world.use_nodes=True;bg=next(n for n in s.world.node_tree.nodes if n.type=='BACKGROUND');bg.inputs[0].default_value=(.15,.19,.24,1);bg.inputs[1].default_value=.35;s.view_settings.view_transform='AgX';s.render.image_settings.file_format='PNG';s.render.filepath=out;bpy.ops.render.render(write_still=True)
