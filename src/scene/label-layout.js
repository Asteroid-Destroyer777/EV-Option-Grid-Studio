export const overlaps = (a,b,gap=5) => a.left < b.right+gap && a.right > b.left-gap && a.top < b.bottom+gap && a.bottom > b.top-gap;
// Coordinates are anchors at the bottom centre, matching the label transform.
export function placeLabel(x,y,width,height,viewport,occupied=[],blockers=[]) {
  const offsets=[[0,0],[0,-36],[0,36],[-76,0],[76,0],[-76,-40],[76,-40],[-76,40],[76,40],[0,-80],[0,80],[-140,0],[140,0],[0,-120],[0,120]];
  for(const [dx,dy] of offsets) {
    const px=x+dx,py=y+dy,rect={left:px-width/2,right:px+width/2,top:py-height,bottom:py};
    if(rect.left<8||rect.right>viewport.w-8||rect.top<8||rect.bottom>viewport.h-8)continue;
    if([...occupied,...blockers].some(r=>overlaps(rect,r)))continue;
    return {x:px,y:py,rect};
  }
  return null;
}
