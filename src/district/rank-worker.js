import {validateInput} from './model.js';
import {generateCandidates,summarizeCandidate,finalizeRanking} from './ranking.js';
self.onmessage=e=>{try{const {input,options}=e.data;validateInput(input);const points=generateCandidates(input.area),rows=[];points.forEach((p,i)=>{rows.push(summarizeCandidate(input,p,options));self.postMessage({progress:(i+1)/points.length});});self.postMessage({result:finalizeRanking(input,rows,options)});}catch(error){self.postMessage({error:error.message});}};
