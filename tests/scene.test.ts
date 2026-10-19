import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import * as core from '../src/core';
import * as voice from '../src/voice';
import { BALANCE } from '../src/balance';

// Execute the real combat methods with a small image adapter. No browser, DOM or GPU.
const compiled=ts.transpileModule(readFileSync(new URL('../src/scene.ts',import.meta.url),'utf8'),{
  compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,esModuleInterop:true},
}).outputText;
const exported:Record<string,any>={};
runInNewContext(compiled,{
  exports:exported,require:(id:string)=>{
    if(id==='phaser')return {Scene:class {},Math:{Clamp:(v:number,min:number,max:number)=>Math.min(max,Math.max(min,v))},Display:{Color:{HexStringToColor:()=>({color:0})}}};
    if(id==='./core')return core;
    if(id==='./balance')return {BALANCE};
    if(id==='./voice')return voice;
    if(['./assets','./audio','./character-audio','./voice'].includes(id))return {};
    throw new Error(`Unexpected scene dependency ${id}`);
  },
});

function imageAdapter(){
  const sprite={
    x:0,y:0,visible:false,active:false,rotation:0,texture:{key:''},frame:{realWidth:256},displayWidth:57,displayHeight:57,text:'',destroyed:false,
    body:undefined as any,
    setTexture(key:string){this.texture.key=key;return this;},
    setPosition(x:number,y:number){this.x=x;this.y=y;return this;},
    setVisible(value:boolean){this.visible=value;return this;},
    setActive(value:boolean){this.active=value;return this;},
    setAlpha(){return this;},setAngle(){return this;},setDisplaySize(w:number,h:number){this.displayWidth=w;this.displayHeight=h;return this;},setDepth(){return this;},clearTint(){return this;},
    setVelocity(x:number,y=x){this.body.velocity.x=x;this.body.velocity.y=y;return this;},setCollideWorldBounds(){return this;},setFlip(){return this;},setFlipX(){return this;},
    enableBody(_reset:boolean,x:number,y:number){this.x=x;this.y=y;this.active=true;this.visible=true;return this;},
    disableBody(){this.active=false;this.visible=false;return this;},
    setOrigin(){return this;},setRotation(){return this;},setScale(){return this;},setText(text:string){this.text=text;return this;},destroy(){this.destroyed=true;},
  };
  sprite.body={velocity:{x:0,y:0,length(){return Math.hypot(this.x,this.y);}},blocked:{},setCircle:()=>{},reset:(x:number,y:number)=>{sprite.x=x;sprite.y=y;}};
  return sprite;
}
function graphicsAdapter(){
  const state={destroyed:false,calls:[] as unknown[][]};
  const proxy:any=new Proxy(state,{get(target,key){
    if(key in target)return target[key as keyof typeof target];
    return (...args:unknown[])=>{if(key==='destroy')target.destroyed=true;target.calls.push([key,...args]);return proxy;};
  }});
  return proxy;
}
function arenaFor(wid:core.WeaponId,level=1){
  const arena=Object.create(exported.ArenaScene.prototype),player=imageAdapter();player.setPosition(500,500);
  const audio={play:()=>{},cue:async()=>false,cancelVoices(){this.globalCancellations++;},cancelBossVoices(id:string){this.canceledBosses.push(id);},
    globalCancellations:0,canceledBosses:[] as string[],setStoneLoop:()=>{},setPaused:()=>{},unlock:()=>{},resetVoices:()=>{},playedCues:{}};
  const world={bounds:[] as number[],setBounds(...args:number[]){this.bounds=args;}},camera={bounds:[] as number[],setBounds(...args:number[]){this.bounds=args;},centerOn:()=>{},startFollow:()=>{}};
  Object.assign(arena,{
    run:core.newRun(wid),player,shots:[],mobs:[],cooldown:{},grid:new Map(),uid:0,playing:true,paused:false,
    textures:{exists:()=>true},add:{image:imageAdapter,text:imageAdapter,graphics:graphicsAdapter},audio,rng:()=>.5,
    physics:{world,add:{image:imageAdapter},pause:()=>{},resume:()=>{}},cameras:{main:camera},mapObjects:[],
    input:{keyboard:{disableGlobalCapture:()=>{},enableGlobalCapture:()=>{},resetKeys:()=>{}}},
    hooks:{seen:()=>{},toast:()=>{},hud:()=>{},bossDefeated:()=>{},end:()=>{arena.ends++;}},ends:0,
    hitLabelTimer:999,combatLog:{},abilityLog:{},bursts:[],labels:[],drops:[],healthPacks:[],hazards:[],missingAssets:[],fx:graphicsAdapter(),
  });
  arena.run.weapons={[wid]:level};
  for(let i=0;i<2;i++)arena.mobs.push({
    uid:i+1,active:true,id:'crowd',s:{x:700,y:500},hp:1000,maxHp:1000,radius:17,
    boss:false,elite:false,dodge:0,shield:0,
  });
  arena.rebuildGrid();return arena;
}

test('真实键盘攻击在1～5级命中一只怪即回收，不穿透重叠的第二只怪，池复用可再次命中',()=>{
  for(let level=1;level<=5;level++){
    const arena=arenaFor('keyboard',level);arena.attack(.01);
    const shots=arena.shots.filter((s:any)=>s.active);assert.equal(shots.length,1+Math.floor(level/2));
    const shot=shots[0];assert.equal(shot.pierce,0);
    for(const other of shots.slice(1))arena.releaseShot(other);
    // Follow actual projectile motion into the collision grid.
    for(let frame=0;frame<40&&shot.active;frame++)arena.updateShots(1/60);
    assert.ok(arena.mobs[0].hp<1000);assert.equal(arena.mobs[1].hp,1000);
    assert.equal(shot.active,false);assert.equal(shot.s.visible,false);assert.equal(shot.s.active,false);
    const afterHit=arena.mobs[0].hp;arena.updateShots(.1);assert.equal(arena.mobs[0].hp,afterHit);
    arena.attack(1);assert.equal(arena.shots[0],shot);assert.ok(shot.active&&shot.s.visible&&shot.s.active);
    assert.equal(shot.hits.size,0);
    for(const other of arena.shots.slice(1))if(other.active)arena.releaseShot(other);
    shot.x=700;shot.y=500;arena.updateShots(0);
    assert.ok(arena.mobs[0].hp<afterHit);assert.equal(arena.mobs[1].hp,1000);assert.equal(shot.s.visible,false);
  }
});

test('键盘接触闪避无敌目标时不扣血或消失，无敌结束后的有效命中才消失',()=>{
  const arena=arenaFor('keyboard',5);arena.mobs[0].dodge=1;arena.mobs[1].active=false;arena.rebuildGrid();arena.attack(.01);
  const shot=arena.shots[0];for(const other of arena.shots.slice(1))arena.releaseShot(other);
  shot.x=700;shot.y=500;arena.updateShots(0);
  assert.equal(arena.mobs[0].hp,1000);assert.ok(shot.active&&shot.s.visible);
  arena.mobs[0].dodge=0;arena.updateShots(0);assert.ok(arena.mobs[0].hp<1000);assert.equal(shot.active,false);
});

test('键盘命中修改不影响钥匙穿透多只目标',()=>{
  const arena=arenaFor('keys');arena.attack(.01);const shot=arena.shots[0];shot.x=700;shot.y=500;arena.updateShots(0);
  assert.ok(arena.mobs.every((m:any)=>m.hp<1000));assert.ok(shot.active&&shot.s.visible);
});

function reachFinale(){
  const arena=arenaFor('keyboard');arena.mobs=[];arena.configureArena();
  for(let stage=0;stage<6;stage++){
    assert.equal(arena.run.stage,stage);arena.summonBoss();assert.equal(arena.activeBosses.length,1);
    arena.hit(arena.boss,'keyboard',1e9);
  }
  return arena;
}

test('真实退场路径在第六关后立即生成八位Boss并扩大地图、相机和物理边界',()=>{
  const arena=reachFinale();
  assert.equal(arena.run.stage,6);assert.equal(arena.run.won,false);assert.equal(arena.run.bossActive,true);assert.equal(arena.ends,0);
  assert.equal(arena.activeBosses.length,8);assert.deepEqual(arena.activeBosses.map((m:any)=>m.id).sort(),core.PEOPLE.map(p=>p.id).sort());
  assert.deepEqual(arena.physics.world.bounds,[35,35,3530,2930]);assert.deepEqual(arena.cameras.main.bounds,[0,0,3600,3000]);
  assert.equal(arena.player.x,1800);assert.equal(arena.player.y,1500);assert.match(arena.stageLabel.text,/07.*八王齐聚/);
  for(const boss of arena.activeBosses){assert.ok(boss.hp>0);assert.equal(boss.hp,boss.maxHp);assert.equal(boss.variant,false);assert.ok(Math.abs(Math.hypot(boss.s.x-1800,boss.s.y-1500)-650)<1e-6);}
  arena.summonBoss();assert.equal(arena.activeBosses.length,8);
});

test('终局击败一位不清除其他Boss、弹幕与召唤物，最后一位才结算，重开恢复普通地图',()=>{
  const arena=reachFinale(),jiang=arena.activeBosses.find((m:any)=>m.id==='jiangjieshi'),laoda=arena.activeBosses.find((m:any)=>m.id==='laoda');
  const stone=arena.spawn('lecture-stone');stone.summonerUid=jiang.uid;
  const plane=arena.spawn('helicopter');plane.summonerUid=laoda.uid;
  arena.hazards=[{owner:jiang,weapon:undefined},{owner:laoda,weapon:undefined}];
  const shot=arena.addShot(1800,1500,100,0,'red-bullet',undefined,10,4,8,0,0,false);
  const cancellations=arena.audio.globalCancellations;arena.run.hp=40;arena.hit(jiang,'keyboard',1e9);
  assert.equal(arena.activeBosses.length,7);assert.equal(arena.run.bossActive,true);assert.equal(arena.run.won,false);assert.equal(arena.run.hp,40);assert.equal(arena.ends,0);
  assert.equal(stone.active,false);assert.equal(plane.active,true);assert.ok(shot.active);assert.equal(arena.hazards.length,1);assert.equal(arena.hazards[0].owner,laoda);
  assert.equal(arena.audio.globalCancellations,cancellations);assert.deepEqual(arena.audio.canceledBosses,['jiangjieshi']);
  for(const boss of [...arena.activeBosses])arena.hit(boss,'keyboard',1e9);
  assert.equal(arena.run.won,true);assert.equal(arena.run.bossActive,false);assert.equal(arena.run.defeated.length,14);assert.equal(arena.run.finalDefeated.length,8);assert.equal(arena.ends,1);assert.equal(arena.paused,true);assert.equal(arena.activeBosses.length,0);
  const map=[...arena.mapObjects];arena.start('keyboard',42);
  assert.ok(map.every((object:any)=>object.destroyed));assert.equal(arena.mapObjects.length,8);
  assert.equal(arena.run.stage,0);assert.equal(arena.run.bosses.length,6);assert.equal(arena.run.finalDefeated.length,0);assert.equal(arena.activeBosses.length,0);
  assert.deepEqual(arena.physics.world.bounds,[35,35,2330,1930]);assert.deepEqual(arena.cameras.main.bounds,[0,0,2400,2000]);
  assert.equal(arena.player.x,1200);assert.equal(arena.player.y,1000);assert.equal(plane.summonerUid,laoda.uid);
});

test('扩大后的区域可以生成怪物、让弹幕飞行和击退目标，普通地图边界仍保持原尺寸',()=>{
  const arena=reachFinale();const mob=arena.spawn('crowd',false,false,3200,2600);
  const shot=arena.addShot(3100,2600,540,0,'key-shot','keyboard',20,2,10,0,0,false);arena.rebuildGrid();arena.updateShots(.1);
  assert.ok(shot.active);arena.hit(mob,'sprite-soda',1);assert.ok(mob.s.x>3200&&mob.s.x<3560);assert.ok(mob.s.y>2600&&mob.s.y<2960);
  arena.run=core.newRun();arena.updateShots(0);assert.equal(shot.active,false);
});
