import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {compositions,teamAnalysis,rankAugments,recommendItems,shrunk} from '../dist/engine.js';
const data=JSON.parse(readFileSync(new URL('../dist/data.json',import.meta.url),'utf8'));
const get=name=>data.champions.find(c=>c.slug===name);
test('snapshot has complete numeric data and correctly parsed two-augment combinations',()=>{
 assert.equal(data.champions.length,173);assert.equal(data.errors.length,0);
 for(const c of data.champions){assert.ok(c.wr>0&&c.wr<100);assert.ok(c.games>0);assert.ok(c.augments.length>0);for(const row of [...c.tables['Popular Combos'],...c.tables['Best Combos']]){assert.equal(row.names.length,2);assert.ok(row.wr>=0&&row.wr<=100);assert.ok(row.pick>=0&&row.pick<=100);}}
});
test('win-rate search finds the exact best mean, respects locks, and excludes duplicate picks',()=>{
 const pool=['jinx','ahri','sona','leona','sett','gwen','lillia','alistar'].map(get);
 const locked=['leona'];const result=compositions(pool,locked,'winrate');
 const expected=[get('leona'),...pool.filter(c=>c.slug!=='leona').sort((a,b)=>b.wr-a.wr).slice(0,4)];
 assert.deepEqual(result[0].team.map(c=>c.slug).sort(),expected.map(c=>c.slug).sort());
 for(const r of result){assert.equal(r.team.length,5);assert.ok(r.team.some(c=>c.slug==='leona'));assert.equal(new Set(r.team.map(c=>c.slug)).size,5);}
 assert.deepEqual(compositions([pool[0],pool[0],pool[1]],[]),[]);
});
test('all five locked picks remain unchanged even with better bench win rates',()=>{
 const pool=['jinx','ahri','sona','leona','sett','gwen','lillia'].map(get);
 const result=compositions(pool,pool.slice(0,5).map(c=>c.slug));assert.equal(result.length,1);assert.deepEqual(result[0].team,pool.slice(0,5));
});
test('maximum pool size search completes and returns five ranked combinations',()=>{
 const result=compositions(data.champions.slice(0,15));assert.equal(result.length,5);assert.ok(result[0].score>=result[4].score);
});
test('small samples shrink more strongly; observed win rates are not replaced',()=>{
 assert.ok(shrunk(70,100,50)<shrunk(70,1000,50));
 const c=get('jinx'),a=c.augments.find(x=>x.games>=100&&!x.withheld);
 const r=rankAugments(c,[a.id])[0];assert.equal(r.wr,Number(a.win_rate));assert.equal(r.games,a.games);
});
test('unavailable, withheld and owned augment choices cannot become top ranked picks',()=>{
 const c={...get('jinx'),augments:[{id:1,games:99,win_rate:100},{id:2,games:1000,win_rate:60,withheld:true},{id:3,games:1000,win_rate:55,name:'Valid'}]};
 let r=rankAugments(c,[1,2,3,3,999]);assert.equal(r.length,4);assert.equal(r[0].id,3);assert.equal(r.filter(x=>x.available).length,1);
 r=rankAugments(c,[1,3],[3]);assert.equal(r.length,1);assert.equal(r[0].available,false);
});
test('owned augment combo changes rank score while preserving observed win rate',()=>{
 const c={...get('jinx'),augments:[{id:1,name:'A',games:1000,win_rate:'55'},{id:2,name:'B',games:1000,win_rate:'55'}],tables:{'Popular Combos':[{names:['A','B'],pick:5,wr:65}], 'Best Combos':[]}};
 const baseline=rankAugments(c,[1])[0],paired=rankAugments(c,[1],[2])[0];assert.ok(paired.score>baseline.score);assert.equal(paired.wr,baseline.wr);
});
test('builds are unique and do not propose incompatible penetration alternatives together',()=>{
 for(const c of data.champions){const {items}=recommendItems(c,[],['alistar','leona','ornn'].map(get),data.augments);assert.equal(new Set(items.map(x=>x.name)).size,items.length);assert.ok(items.filter(x=>/Lord Dominik|Mortal Reminder|Serylda|Terminus/.test(x.name)).length<=1);assert.ok(!items.some(x=>/Golden Spatula|Ultra Hydra/.test(x.name)));}
});
test('empty teams have finite explainable scores and no fabricated pair samples',()=>{const a=teamAnalysis([]);assert.equal(a.score,0);assert.deepEqual(a.pairs,[]);});
