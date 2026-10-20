export function chargingPower(tags={}) {
  const explicit=Object.entries(tags).filter(([k])=>k.endsWith(':output')).map(([,v])=>/^\s*\d+(\.\d+)?\s*kW\s*$/i.test(v)?parseFloat(v):0).filter(v=>v>0);
  if(explicit.length)return {kw:Math.max(...explicit),powerHasTag:true,powerAssumption:null};
  const socketDC=Object.entries(tags).some(([k,v])=>/^socket:(chademo|type2_combo|ccs|tesla_supercharger)(:|$)/i.test(k)&&!['0','no',''].includes(String(v)));
  const namedDC=/supercharger/i.test([tags.brand,tags.name,tags.network].join(' '));
  if(socketDC||namedDC)return {kw:50,powerHasTag:false,powerAssumption:'50 кВт — сценарная нижняя оценка DC по разъёму/классу, мощность не подтверждена'};
  return {kw:null,powerHasTag:false,powerAssumption:null};
}
