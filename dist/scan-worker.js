// Finds champion icons in a champ select screenshot by comparing tiny color
// thumbnails against Riot Data Dragon icons. Runs off the main thread.
const WORK_HEIGHT=720;           // screenshots are normalized to this height
const COARSE=6, FINE=12;         // thumbnail grid sizes
const CROPS=[0,0.08,0.16];       // in-game icons are often slightly zoomed in
const COARSE_KEEP=0.7, ACCEPT=0.8, MARGIN=0.18;
let refs=null;

// Cells well inside the inscribed circle, so round and square icons (and their frames) both match.
const mask=g=>{const cells=[];for(let y=0;y<g;y++)for(let x=0;x<g;x++)if(Math.hypot(x+.5-g/2,y+.5-g/2)<=g*0.42)cells.push([x,y]);return cells;};
const MASK={[COARSE]:mask(COARSE),[FINE]:mask(FINE)};

function integral(rgba,w,h){const W=w+1,I=[0,1,2].map(()=>new Float64Array(W*(h+1)));
 for(let y=0;y<h;y++){const r=[0,0,0];for(let x=0;x<w;x++){const p=(y*w+x)*4;for(let c=0;c<3;c++){r[c]+=rgba[p+c];I[c][(y+1)*W+x+1]=I[c][y*W+x+1]+r[c];}}}
 return {I,W};}
// Zero-mean, unit-length vector of mean cell colors for the square at (x,y) of size s.
function vector(ii,x,y,s,g,out){const {I,W}=ii,cell=s/g,cells=MASK[g];let k=0,sum=0;
 for(const [cx,cy] of cells){const x0=Math.round(x+cx*cell),x1=Math.max(x0+1,Math.round(x+(cx+1)*cell)),y0=Math.round(y+cy*cell),y1=Math.max(y0+1,Math.round(y+(cy+1)*cell)),a=(x1-x0)*(y1-y0);
  for(let c=0;c<3;c++){const v=(I[c][y1*W+x1]-I[c][y0*W+x1]-I[c][y1*W+x0]+I[c][y0*W+x0])/a;out[k++]=v;sum+=v;}}
 const mean=sum/k;let norm=0;for(let i=0;i<k;i++){out[i]-=mean;norm+=out[i]*out[i];}
 norm=Math.sqrt(norm);if(norm<1e-6)return 0;for(let i=0;i<k;i++)out[i]/=norm;return Math.sqrt(norm*norm/k);}
const dot=(a,b,off,n)=>{let s=0;for(let i=0;i<n;i++)s+=a[i]*b[off+i];return s;};

async function pixels(source,height){const bmp=source instanceof ImageBitmap?source:await createImageBitmap(source);const scale=height/bmp.height;
 const w=Math.max(1,Math.round(bmp.width*scale)),h=Math.round(bmp.height*scale);const cv=new OffscreenCanvas(w,h);const ctx=cv.getContext('2d',{willReadFrequently:true});
 ctx.drawImage(bmp,0,0,w,h);return {rgba:ctx.getImageData(0,0,w,h).data,w,h};}

async function loadRefs(champions,base){
 const nC=MASK[COARSE].length*3,nF=MASK[FINE].length*3;const coarse=new Float32Array(champions.length*nC),fine=new Float32Array(champions.length*CROPS.length*nF);const ok=new Uint8Array(champions.length);const tmp=new Float64Array(nF);
 await Promise.all(champions.map(async(c,i)=>{try{const r=await fetch(base+c.file);if(!r.ok)return;const {rgba,w,h}=await pixels(await r.blob(),120);const ii=integral(rgba,w,h);
  CROPS.forEach((crop,j)=>{const m=crop*w,s=w-2*m;vector(ii,m,m,s,FINE,tmp);fine.set(tmp.subarray(0,nF),(i*CROPS.length+j)*nF);if(j===1){vector(ii,m,m,s,COARSE,tmp);coarse.set(tmp.subarray(0,nC),i*nC);}});ok[i]=1;}catch{}}));
 return {champions,coarse,fine,ok,nC,nF};}

const overlap=(a,b)=>Math.max(0,Math.min(a.x+a.s,b.x+b.s)-Math.max(a.x,b.x))*Math.max(0,Math.min(a.y+a.s,b.y+b.s)-Math.max(a.y,b.y));
const iou=(a,b)=>{const o=overlap(a,b);return o/(a.s*a.s+b.s*b.s-o);};
function nms(list,limit=0.25,sameOnly=false){const keep=[];for(const d of list.sort((a,b)=>b.score-a.score))if(keep.every(k=>(sameOnly&&k.i!==d.i)||iou(k,d)<limit))keep.push(d);return keep;}
// Real icons come in groups: a column of allies or a row of bench champions, same size, closely spaced.
const linked=(a,b)=>Math.abs(a.s/b.s-1)<0.2&&((Math.abs(a.x-b.x)<a.s*0.5&&Math.abs(a.y-b.y)<a.s*4.5)||(Math.abs(a.y-b.y)<a.s*0.5&&Math.abs(a.x-b.x)<a.s*3.5));
function groups(list){const out=[],left=new Set(list);
 for(const d of list){if(!left.has(d))continue;const g=[d];left.delete(d);for(let k=0;k<g.length;k++)for(const o of [...left])if(linked(g[k],o)){g.push(o);left.delete(o);}out.push(g);}
 return out.filter(g=>g.length>1);}
const span=(g,key)=>Math.max(...g.map(d=>d[key]))-Math.min(...g.map(d=>d[key]));

function detect(img){const {rgba,w,h}=img,ii=integral(rgba,w,h),{champions,coarse,fine,ok,nC,nF}=refs,n=champions.length,v=new Float64Array(nF);
 const fineScore=(i,x,y,s)=>{let b=-1;for(let j=0;j<CROPS.length;j++)b=Math.max(b,dot(v,fine,(i*CROPS.length+j)*nF,nF));return b;};
 let cands=[];
 for(let s=24;s<=96;s=Math.round(s*1.12)){const step=Math.max(2,Math.round(s/6));
  for(let y=0;y+s<=h;y+=step)for(let x=0;x+s<=w;x+=step){if(vector(ii,x,y,s,COARSE,v)<10)continue;const top=[-1,-1,-1],idx=[-1,-1,-1];
   for(let i=0;i<n;i++){if(!ok[i])continue;const d=dot(v,coarse,i*nC,nC);if(d>top[2]){let k=2;while(k>0&&d>top[k-1]){top[k]=top[k-1];idx[k]=idx[k-1];k--;}top[k]=d;idx[k]=i;}}
   if(top[0]>COARSE_KEEP)cands.push({x,y,s,score:top[0],i:idx[0],picks:idx.filter(i=>i>=0),step});}}
 // Merge neighbouring windows only when they agree on the champion, so adjacent icons survive.
 cands=nms(cands,0.3,true).slice(0,400);
 const found=[];
 for(const c of cands){let top={score:-1};
  for(const k of [0.9,1,1.1]){const s=c.s*k;for(let dy=-c.step;dy<=c.step;dy+=Math.max(1,c.step/3))for(let dx=-c.step;dx<=c.step;dx+=Math.max(1,c.step/3)){const x=c.x+dx-(s-c.s)/2,y=c.y+dy-(s-c.s)/2;if(x<0||y<0||x+s>w||y+s>h)continue;
   if(vector(ii,x,y,s,FINE,v)<10)continue;for(const i of c.picks){const d=fineScore(i);if(d>top.score)top={score:d,i,x,y,s};}}}
  if(top.score<ACCEPT)continue;vector(ii,top.x,top.y,top.s,FINE,v);let second=-1;
  for(let i=0;i<n;i++)if(ok[i]&&i!==top.i)second=Math.max(second,fineScore(i));
  if(top.score-second>=MARGIN)found.push(top);}
 // One box per location, one location per champion, and only icons that line up with another icon.
 const kept=[];for(const d of found.sort((a,b)=>b.score-a.score))if(kept.every(k=>overlap(k,d)<0.2*Math.min(k.s,d.s)**2))kept.push(d);
 const seen=new Set(),unique=kept.filter(d=>!seen.has(d.i)&&seen.add(d.i));
 // The ally list is the biggest vertical group (leftmost on ties); every other group is bench.
 const all=groups(unique),cols=all.filter(g=>span(g,'y')>span(g,'x')).sort((a,b)=>b.length-a.length||Math.min(...a.map(d=>d.x))-Math.min(...b.map(d=>d.x)));
 return all.flatMap(g=>g.map(d=>({slug:champions[d.i].slug,score:d.score,kind:g===cols[0]?'ally':'bench',x:d.x/w,y:d.y/h,s:d.s/h,w,h})));}

self.onmessage=async({data})=>{try{
 if(!refs)refs=await loadRefs(data.champions,data.base);
 if(!refs.ok.some(Boolean))throw new Error('Could not download champion icons from Riot. Check your connection.');
 self.postMessage({ok:true,found:detect(await pixels(data.image,WORK_HEIGHT))});
}catch(e){self.postMessage({ok:false,error:e.message||String(e)});}};
