const generations=new WeakMap();
// Leaflet caches dimensions. A responsive grid can briefly report zero width;
// fitting bounds then would create an infinite/NaN zoom and poison map state.
export function fitMapBounds(map,bounds,options={},schedule=globalThis.requestAnimationFrame) {
  const generation=(generations.get(map)||0)+1;generations.set(map,generation);
  let attempts=0;
  const fit=()=>{
    if(generations.get(map)!==generation)return;
    map.invalidateSize?.({pan:false,animate:false});
    const size=map.getSize?.();
    if(size&&(size.x<=80||size.y<=80)){
      if(attempts++<60&&schedule)schedule(fit);
      return;
    }
    map.fitBounds(bounds,options);
  };
  fit();
}
