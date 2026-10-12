export const unique = list => [...new Set(list)];
export const mean = list => list.length ? list.reduce((a,b)=>a+b,0)/list.length : 0;
export function shrunk(wr,n,baseline=50,prior=200){return (Number(wr)*n+baseline*prior)/(n+prior);}
export function teamAnalysis(team){
  const has=role=>team.some(c=>c.roles.includes(role));
  const coverage=[['Frontline',has('Tank')],['Sustained damage',has('Marksman')||team.filter(c=>c.roles.includes('Fighter')).length>=2],['Magic damage',has('Mage')],['Utility',has('Support')]];
  const pairs=[];
  for(let i=0;i<team.length;i++)for(let j=i+1;j<team.length;j++){
    const observations=[];
    for(const [a,b] of [[team[i],team[j]],[team[j],team[i]]]){
      const row=[...(a.tables?.['Best Teammates']||[]),...(a.tables?.['Worst Teammates']||[])].find(r=>r.name===b.name);
      if(row&&row.delta!==null){const n=Math.round((a.games||0)*row.pick/100);observations.push({lift:row.delta*n/(n+300),wr:row.wr,n});}
    }
    if(observations.length)pairs.push({names:[team[i].name,team[j].name],lift:mean(observations.map(x=>x.lift)),wr:mean(observations.map(x=>x.wr)),n:Math.max(...observations.map(x=>x.n))});
  }
  const average=mean(team.map(c=>c.wr));
  const roleBonus=coverage.filter(x=>x[1]).length*.65;
  const pairBonus=pairs.reduce((s,p)=>s+p.lift,0)/Math.max(1,team.length*(team.length-1)/2);
  return {average,coverage,pairs:pairs.sort((a,b)=>b.lift-a.lift),score:average+roleBonus+pairBonus,roleBonus,pairBonus};
}
export function compositions(pool,locked=[],mode='synergy'){
  const distinct=[...new Map(pool.map(c=>[c.slug,c])).values()];
  if(distinct.length<5||distinct.length>15)return [];
  const keep=distinct.filter(c=>locked.includes(c.slug));if(keep.length>5)return [];
  const free=distinct.filter(c=>!locked.includes(c.slug));const result=[];
  function walk(start,chosen){if(chosen.length+keep.length===5){const team=[...keep,...chosen];const analysis=teamAnalysis(team);result.push({team,...analysis});return;}for(let i=start;i<free.length;i++)walk(i+1,[...chosen,free[i]]);}
  walk(0,[]);return result.sort((a,b)=>mode==='winrate'?b.average-a.average:b.score-a.score).slice(0,5);
}
export function rankAugments(champion,offered,owned=[],enemies=[],allies=[]){
  const rows=champion.augments||[];
  return unique(offered).filter(id=>!owned.includes(id)).map(id=>{
    const a=rows.find(r=>r.id===id);
    if(!a||a.withheld||a.games<100)return {id,available:false,score:-Infinity,reasons:['Insufficient champion-specific data (minimum 100 games).']};
    let score=shrunk(a.win_rate,a.games,champion.wr);const reasons=[`${a.games.toLocaleString()} games on ${champion.name}; adjusted toward the champion baseline to reduce small-sample bias.`];
    const ownedNames=owned.map(id=>rows.find(x=>x.id===id)?.name).filter(Boolean);
    const combos=[...(champion.tables?.['Popular Combos']||[]),...(champion.tables?.['Best Combos']||[])].filter(c=>c.names.includes(a.name)&&c.names.some(n=>ownedNames.includes(n)));
    const seen=new Set();const lifts=[];
    for(const c of combos){const key=[...c.names].sort().join('|');if(seen.has(key))continue;seen.add(key);const n=Math.round(c.pick*(champion.games||0)/100);if(n<50)continue;lifts.push((c.wr-Number(a.win_rate))*n/(n+500));reasons.push(`With ${c.names.find(n=>n!==a.name)}: ${c.wr.toFixed(2)}% observed combo win rate (~${n} games).`);}
    if(lifts.length)score+=Math.max(-3,Math.min(3,mean(lifts)))*.5;
    if(a.name==='Giant Slayer'&&enemies.filter(c=>c.roles.includes('Tank')||c.roles.includes('Fighter')).length>=2){score+=.6;reasons.push('Context estimate: multiple enemy tanks/fighters make anti-health damage more relevant (+0.6 score).');}
    if(a.name==="Windspeaker's Blessing"&&champion.roles.includes('Support')&&allies.some(c=>c.roles.includes('Marksman'))){score+=.4;reasons.push('Context estimate: supporting an allied marksman can improve the value of ally buffs (+0.4 score).');}
    return {id,available:true,score,wr:Number(a.win_rate),games:a.games,reasons,rarity:a.rarity};
  }).sort((a,b)=>b.score-a.score);
}
export function recommendItems(champion,owned=[],enemies=[],catalog=[]){
  const names=owned.map(id=>catalog.find(a=>a.augment_id===id)?.name||'');
  const tankCount=enemies.filter(c=>c.roles.includes('Tank')).length;
  const magicCount=enemies.filter(c=>c.roles.includes('Mage')).length;
  const attackCount=enemies.filter(c=>c.roles.includes('Marksman')).length;
  const raw=[...(champion.tables?.['Most Common Items']||[]),...(champion.tables?.['Best Items']||[])];
  const items=[...new Map(raw.map(r=>[r.name,r])).values()].filter(r=>r.pick>=1&&Number.isFinite(r.wr)).filter(r=>!(/Golden Spatula|Ultra Hydra/i.test(r.name))||names.some(n=>/Urf|Ultra Hydra/.test(n))).map(r=>{
    const n=Math.round(r.pick*(champion.games||0)/100);let score=shrunk(r.wr,n,champion.wr)+Math.log1p(r.pick)*1.5;
    const reasons=['Champion item statistics, weighted for popularity and sample size.'];
    if(tankCount>=2&&/Lord Dominik|Mortal Reminder|Void Staff|Cryptbloom|Blade of The Ruined King|Liandry|Terminus|Black Cleaver/i.test(r.name)){score+=4;reasons.push('Context estimate: prioritize penetration or anti-health damage against multiple tanks.');}
    if(magicCount>=3&&/Wit's End|Maw of Malmortius|Spirit Visage|Force of Nature|Kaenic/i.test(r.name)){score+=4;reasons.push('Context estimate: magic resistance against a mage-heavy enemy team.');}
    if(names.some(n=>n.startsWith('Upgrade ')&&r.name.toLowerCase().includes(n.slice(8).toLowerCase()))){score+=6;reasons.push('Matches an item-upgrade augment you selected.');}
    return {...r,score,n,reasons};
  }).sort((a,b)=>b.score-a.score);
  // Avoid incompatible armor/magic penetration families in the same suggested set.
  const groups=[/Lord Dominik|Mortal Reminder|Serylda|Terminus/i,/Void Staff|Cryptbloom|Terminus/i];const used=new Set();
  const selected=items.filter(item=>{const hit=groups.map((r,i)=>r.test(item.name)?i:-1).filter(i=>i>=0);if(hit.some(i=>used.has(i)))return false;hit.forEach(i=>used.add(i));return true;}).slice(0,5);
  const boots=(champion.tables?.Boots||[]).filter(r=>r.icon&&r.pick>=1).map(r=>({...r,score:r.pick+(magicCount>=3&&/Mercury/.test(r.name)?100:0)+(attackCount>=3&&/Steelcaps/.test(r.name)?100:0)})).sort((a,b)=>b.score-a.score)[0];
  return {items:selected,boots};
}
