// Free, offline-from-AI screenshot scanning: champion icons are matched in a
// worker against Riot Data Dragon icons, then split into allies (a column) and bench (rows).
let worker=null;

function run(message){
 worker??=new Worker(new URL('./scan-worker.js',import.meta.url));
 return new Promise((resolve,reject)=>{worker.onmessage=({data})=>data.ok?resolve(data.found):reject(new Error(data.error));worker.onerror=e=>{worker=null;reject(new Error(e.message||'Scanner failed to start.'));};worker.postMessage(message);});
}

export async function scanScreenshot(file,data){
 const champions=data.champions.map(c=>({slug:c.slug,file:c.icon_url.split('/').pop()}));
 const image=await createImageBitmap(file);
 const found=await run({champions,base:`https://ddragon.leagueoflegends.com/cdn/${data.riotVersion}/img/champion/`,image});
 const allies=found.filter(d=>d.kind==='ally').sort((a,b)=>a.y-b.y).slice(0,5),bench=found.filter(d=>d.kind==='bench').sort((a,b)=>a.y-b.y||a.x-b.x).slice(0,10);
 return {allies:allies.map(d=>d.slug),bench:bench.map(d=>d.slug),boxes:[...allies,...bench]};
}
