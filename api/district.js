import {rankDistrict} from '../src/district/ranking.js';
import {loadArea} from '../src/district/source.js';
import {calculateDistrict} from '../src/district/model.js';
export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='POST')return res.status(405).json({error:'Используйте POST.'});
  try{const data=typeof req.body==='string'?JSON.parse(req.body):req.body;
    if(JSON.stringify(data).length>10000000)throw new Error('Запрос слишком большой.');
    res.status(200).json(data.action==='load'?await loadArea(data.bounds):data.action==='rank'?rankDistrict(data.input,data.options):calculateDistrict(data.input));
  }catch(e){res.status(400).json({error:e.message});}
}
