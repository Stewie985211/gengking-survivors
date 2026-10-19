import test from 'node:test';
import assert from 'node:assert/strict';
import { newRun, rng, bossOrder, damageAmount, stats, shouldDropHealthPack, collectHealthPack, legalUpgrades, upgradeChoices, applyUpgrade, defeatBoss, defaultSave, unlockBoss, recordRun, readSave, writeSave, SAVE_KEY, experienceForLevel, takeLevel, upgradeInterval, healingUpgradesAllowed, mobMaxHp, weaponBaseDamage, weaponCooldown, bossMaxHp, playerDashStats, enemy, PEOPLE, COMMON, WEAPONS, isFinalStage, totalStages, totalBossEncounters, bossesForStage, arenaSize, type WeaponId, type PersonId } from '../src/core';

const near=(actual:number,expected:number)=>assert.ok(Math.abs(actual-expected)<1e-9,`${actual} ≠ ${expected}`);

test('六关从八位Boss随机抽取不重复，每个位置覆盖全部人物且种子可重现',()=>{
  const positions=Array.from({length:6},()=>new Set<PersonId>()),orders=new Set<string>(),omitted=new Set<PersonId>();
  const candidates=PEOPLE.map(p=>p.id as PersonId),sortedCandidates=[...candidates].sort();
  for(let seed=0;seed<300;seed++){
    const order=bossOrder(rng(seed));assert.equal(order.length,6);assert.equal(new Set(order).size,6);
    order.forEach((id,i)=>{assert.ok(candidates.includes(id));positions[i].add(id);});
    const missing=candidates.filter(id=>!order.includes(id));assert.equal(missing.length,candidates.length-6);missing.forEach(id=>omitted.add(id));
    orders.add(order.join(','));assert.deepEqual(order,bossOrder(rng(seed)));assert.deepEqual(newRun('keyboard',seed).bosses,order);
  }
  positions.forEach(p=>assert.deepEqual([...p].sort(),sortedCandidates));assert.deepEqual([...omitted].sort(),sortedCandidates);assert.ok(orders.size>100);
});
test('香茶娜娜阶段素材、拖鞋克制、解锁与图鉴存档完整接入',()=>{
  assert.equal(PEOPLE.length,8);const nana=enemy('xiangchanana');
  assert.equal(nana.name,'香茶娜娜');assert.equal(nana.image,'xiangchanana-phase1');assert.equal(nana.phase2Image,'xiangchanana-phase2');
  const run=newRun();assert.equal(damageAmount(20,'slipper',nana.id,run).damage,35);assert.equal(damageAmount(20,'keyboard',nana.id,run).damage,20);
  const save=defaultSave();assert.deepEqual(unlockBoss(save,'xiangchanana'),['slipper']);assert.deepEqual(unlockBoss(save,'xiangchanana'),[]);save.seen=['xiangchanana'];
  const storage={getItem:()=>JSON.stringify(save),setItem:()=>{}};assert.deepEqual(readSave(storage),save);
});
test('讲解师与讲解石的素材、克制、图鉴和六关抽选接入',()=>{
  const boss=enemy('jiangjieshi'),stone=enemy('lecture-stone');assert.equal(boss.name,'讲解师');assert.equal(boss.image,'jiangjieshi');assert.equal(stone.image,'lecture-stone');assert.equal(stone.speed,0);
  const run=newRun();assert.equal(damageAmount(20,'keyboard',boss.id,run).damage,35);assert.equal(damageAmount(20,'keyboard',stone.id,run).damage,35);
  for(const w of WEAPONS)assert.ok(damageAmount(20,w.id,stone.id,run).damage>0);
  assert.ok(Array.from({length:50},(_,seed)=>newRun('keyboard',seed).bosses).some(order=>order.includes('jiangjieshi')));
  const save=defaultSave();save.seen=['jiangjieshi','lecture-stone'];assert.deepEqual(unlockBoss(save,'jiangjieshi'),[]);
  assert.deepEqual(readSave({getItem:()=>JSON.stringify(save),setItem:()=>{}}).seen,save.seen);
});

test('人物精英按30%概率掉血包，普通怪、召唤物和Boss不触发额外随机数',()=>{
  const elite={elite:true,boss:false};assert.ok(shouldDropHealthPack(elite,()=>0));assert.ok(shouldDropHealthPack(elite,()=>.299999));assert.equal(shouldDropHealthPack(elite,()=>.3),false);assert.equal(shouldDropHealthPack(elite,()=>.99),false);
  let rolls=0;const roll=()=>{rolls++;return 0;};
  for(const flags of [{elite:false,boss:false},{elite:false,boss:true},{elite:true,boss:true}])assert.equal(shouldDropHealthPack(flags,roll),false);
  assert.equal(rolls,0);assert.ok(shouldDropHealthPack(elite,roll));assert.equal(rolls,1);
});

test('血包恢复25生命并遵守生命上限，满血或阵亡不消耗，经验与升级不改变',()=>{
  const run=newRun();run.hp=60;run.xp=13;const before={xp:run.xp,level:run.level,waveTime:run.waveTime};
  assert.equal(collectHealthPack(run),25);assert.equal(run.hp,85);assert.equal(collectHealthPack(run),15);assert.equal(run.hp,100);assert.equal(collectHealthPack(run),0);
  run.passives.vitality=3;run.hp=170;assert.equal(collectHealthPack(run),5);assert.equal(run.hp,175);assert.equal(collectHealthPack(run),0);
  run.hp=0;assert.equal(collectHealthPack(run),0);assert.equal(run.hp,0);run.hp=-5;assert.equal(collectHealthPack(run),0);assert.equal(run.hp,-5);
  run.hp=50;run.won=true;assert.equal(collectHealthPack(run),0);assert.equal(run.hp,50);
  assert.deepEqual({xp:run.xp,level:run.level,waveTime:run.waveTime},before);
});

test('克制为1.75，非克制仍有伤害，暴击与护盾组合，钥匙破盾',()=>{
  const run=newRun();assert.equal(damageAmount(20,'sprite-soda','zhangxuefeng',run).damage,35);assert.equal(damageAmount(20,'keyboard','zhangxuefeng',run).damage,20);assert.equal(damageAmount(20,'sprite-soda','zhangxuefeng',run,true).damage,70);assert.equal(damageAmount(20,'keyboard','xujiayin',run,false,100).damage,11);assert.equal(damageAmount(20,'keys','xujiayin',run,false,100).damage,31.5);run.passives.power=3;assert.equal(stats(run).damage,1.54);
});
test('保留经验门槛，普通战斗至少20秒升级一次且不能连续弹卡',()=>{
  const run=newRun();assert.equal(run.xpNext,16);run.xp=1000;run.waveTime=19.99;
  assert.equal(takeLevel(run,0),false);assert.equal(run.level,1);assert.equal(run.xp,1000);
  run.waveTime=20;assert.equal(takeLevel(run,0),true);assert.equal(run.level,2);assert.equal(run.xp,984);assert.equal(run.xpNext,23);
  assert.equal(takeLevel(run,20),false);run.waveTime=39.99;assert.equal(takeLevel(run,20),false);
  run.waveTime=40;assert.equal(takeLevel(run,20),true);assert.equal(run.level,3);assert.equal(run.xp,961);
  run.xp=0;run.waveTime=300;assert.equal(takeLevel(run,40),false);assert.equal(run.level,3);
  run.xp=run.xpNext;assert.equal(takeLevel(run,40),true);assert.equal(run.level,4);assert.equal(run.xp,0);
  for(let level=2;level<=50;level++)assert.ok(experienceForLevel(level)>experienceForLevel(level-1));
});
test('Boss战禁止升级和消耗经验，退场后接续普通战斗剩余冷却',()=>{
  const run=newRun();run.waveTime=15;run.time=15;run.xp=1000;run.bossActive=true;
  run.time+=120;assert.equal(takeLevel(run,0),false);assert.equal(run.level,1);assert.equal(run.xp,1000);
  run.bossActive=false;assert.equal(takeLevel(run,0),false);
  run.waveTime=19.99;assert.equal(takeLevel(run,0),false);
  run.waveTime=20;run.bossActive=true;assert.equal(takeLevel(run,0),false);assert.equal(run.xp,1000);
  run.bossActive=false;assert.equal(takeLevel(run,0),true);assert.equal(run.level,2);assert.equal(run.xp,984);
  run.waveTime=100;run.won=true;assert.equal(takeLevel(run,20),false);
});
test('六关升级间隔逐步延长，跨关继续保留经验与已走过的普通战斗时间',()=>{
  const intervals=[20,20,26,32,38,44];
  intervals.forEach((seconds,stage)=>{
    const run=newRun();run.stage=stage;run.xp=1000;assert.equal(upgradeInterval(run),seconds);
    run.waveTime=100+seconds-.01;assert.equal(takeLevel(run,100),false);assert.equal(run.xp,1000);
    run.waveTime=100+seconds;run.bossActive=true;assert.equal(takeLevel(run,100),false);
    run.bossActive=false;assert.ok(takeLevel(run,100));assert.equal(run.xp,984);assert.equal(takeLevel(run,run.waveTime),false);
  });
  const run=newRun();run.stage=3;run.xp=1000;run.waveTime=130;
  assert.equal(takeLevel(run,100),false);run.stage=4;assert.equal(takeLevel(run,100),false);
  run.waveTime=138;assert.ok(takeLevel(run,100));assert.equal(run.xp,984);
});
test('同武器重复获取同时增强伤害和射速，保留五级上限且卡片显示两项变化',()=>{
  const run=newRun();const option=legalUpgrades(run).find(o=>o.id==='keyboard'&&o.kind==='weapon')!;
  assert.match(option.description,/20\s*→\s*30/);assert.match(option.description,/0\.55[^→]*→\s*0\.48/);
  assert.ok(applyUpgrade(run,option));assert.equal(run.weapons.keyboard,2);
  assert.equal(damageAmount(weaponBaseDamage('keyboard',2),'keyboard','zhangxuefeng',run).damage,30);
  assert.equal(weaponBaseDamage('keyboard',5),60);near(weaponCooldown('keyboard',1,run),0.55);near(weaponCooldown('keyboard',2,run),0.4824561403508772);near(weaponCooldown('keyboard',5,run),0.3525641025641026);
  for(const w of WEAPONS){
    assert.equal(weaponBaseDamage(w.id,1),w.damage);near(weaponBaseDamage(w.id,2)/w.damage,1.5);
    for(let level=2;level<=5;level++){assert.ok(weaponBaseDamage(w.id,level)>weaponBaseDamage(w.id,level-1));assert.ok(weaponCooldown(w.id,level,run)<weaponCooldown(w.id,level-1,run));}
  }
  run.weapons.keyboard=5;assert.ok(!legalUpgrades(run).some(o=>o.id==='keyboard'));
});
test('角色等级持续增加伤害和射速，并与武器等级及被动共同生效',()=>{
  const run=newRun();assert.equal(stats(run).damage,1);assert.equal(stats(run).haste,1);
  run.level=11;near(stats(run).damage,1.2);near(stats(run).haste,1.1);
  near(damageAmount(weaponBaseDamage('keyboard',5),'keyboard','zhangxuefeng',run).damage,72);
  near(weaponCooldown('keyboard',1,run),0.5);
  run.passives={power:2,haste:2};near(stats(run).damage,1.632);near(stats(run).haste,1.43);
  near(damageAmount(weaponBaseDamage('keyboard',5),'keyboard','zhangxuefeng',run).damage,97.92);
  near(weaponCooldown('keyboard',5,run),0.2465483234714004);
  const damage=damageAmount(weaponBaseDamage('keyboard',5),'keyboard','zhangxuefeng',run).damage,cooldown=weaponCooldown('keyboard',5,run);
  run.level=12;assert.ok(damageAmount(weaponBaseDamage('keyboard',5),'keyboard','zhangxuefeng',run).damage>damage);assert.ok(weaponCooldown('keyboard',5,run)<cooldown);
});
test('玩家闪避随角色等级增加速度和距离，全程无敌且持续时间不变',()=>{
  const first=playerDashStats(1);near(first.speed,680);near(first.seconds,0.18);near(first.distance,122.4);near(first.invulnerability,0.3);
  const tenth=playerDashStats(11);near(tenth.speed,884);near(tenth.distance,159.12);
  const twentieth=playerDashStats(21);near(twentieth.speed,1088);near(twentieth.distance,195.84);
  for(let level=2;level<=100;level++){
    const current=playerDashStats(level),previous=playerDashStats(level-1);
    assert.ok(current.speed>previous.speed);assert.ok(current.distance>previous.distance);
    near(current.seconds,first.seconds);assert.ok(current.invulnerability>=current.seconds);
  }
  for(const invalid of [0,-5,NaN,Infinity])assert.deepEqual(playerDashStats(invalid),first);
});
test('同一Boss血量随六关进度和登场玩家等级提高，负参数按第一关一级处理',()=>{
  near(bossMaxHp('zhangxuefeng',0,1),10336);near(bossMaxHp('zhangxuefeng',5,1),47788.8);
  near(bossMaxHp('zhangxuefeng',0,21),17571.2);near(bossMaxHp('zhangxuefeng',5,21),81240.96);
  near(bossMaxHp('zhangxuefeng',-3,0),10336);
  for(const person of PEOPLE){const id=person.id as PersonId;
    for(let stage=0;stage<6;stage++){
      const low=bossMaxHp(id,stage,1),high=bossMaxHp(id,stage,21);assert.ok(low>0);assert.ok(high>low);
      if(stage>0)assert.ok(high>bossMaxHp(id,stage-1,21));
    }
  }
});
test('普通怪、精英与召唤物血量逐关增加，波次后段更耐打且出生血量可锁定',()=>{
  near(mobMaxHp('crowd',0,0),40.25);near(mobMaxHp('crowd',5,0),251.5625);
  for(const id of [...COMMON.map(m=>m.id),'helicopter','building','lecture-stone'] as const){
    for(let stage=0;stage<6;stage++){
      const start=mobMaxHp(id,stage,0),end=mobMaxHp(id,stage,120);
      assert.ok(end>start);if(stage>0)assert.ok(start>mobMaxHp(id,stage-1,120));
      assert.equal(mobMaxHp(id,stage,900),end);
    }
  }
  for(const person of PEOPLE)for(let stage=1;stage<6;stage++)assert.ok(mobMaxHp(person.id,stage,0,true)>mobMaxHp(person.id,stage-1,120,true));
  assert.equal(mobMaxHp('crowd',-1,-30),mobMaxHp('crowd',0,0));
});
test('满槽时只强化已有装备；满级与融合材料不会回到候选池',()=>{
  const run=newRun();run.weapons={keyboard:5,keys:2,hoop:4,slipper:5};run.passives={power:3,haste:2,area:3,speed:3};const choices=legalUpgrades(run);assert.deepEqual(choices.map(o=>o.id).sort(),['haste','hoop','keys']);for(let i=0;i<20;i++)assert.equal(new Set(upgradeChoices(run,rng(i)).map(o=>o.id)).size,3);
  run.weapons={'ice-soda-storm':1};assert.ok(!legalUpgrades(run).some(o=>['sprite-soda','icecream','ice-soda-storm'].includes(o.id)));
});
test('候选不足补三种不同回血，不会卡住；过期或非法升级不生效',()=>{
  const run=newRun();run.weapons={keyboard:5,keys:5,hoop:5,slipper:5};run.passives={power:3,haste:3,area:3,speed:3};const choices=upgradeChoices(run,rng(12));assert.equal(choices.length,3);assert.equal(new Set(choices.map(o=>o.id)).size,3);assert.ok(choices.every(o=>o.kind==='heal'));run.hp=50;assert.ok(applyUpgrade(run,choices[0]));assert.equal(run.hp,75);assert.equal(applyUpgrade(run,{kind:'weapon',id:'keyboard',nextLevel:6,name:'bad',description:''}),false);
});
test('第5、6关移除全部回血候选，已有回血被动保留，缓存卡片不能绕过限制',()=>{
  const run=newRun();run.stage=3;run.hp=40;
  const cached=legalUpgrades(run).filter(o=>o.id==='regen'||o.id==='vitality');assert.equal(cached.length,2);
  assert.ok(healingUpgradesAllowed(run));assert.ok(applyUpgrade(run,cached[0]));run.hp=40;
  for(const stage of [4,5]){
    run.stage=stage;assert.equal(healingUpgradesAllowed(run),false);
    for(let seed=0;seed<100;seed++)assert.ok(upgradeChoices(run,rng(seed)).every(o=>o.kind!=='heal'&&o.id!=='regen'&&o.id!=='vitality'));
    for(const option of cached)assert.equal(applyUpgrade(run,option),false);
    assert.equal(applyUpgrade(run,{kind:'heal',id:'heal-full',name:'old',description:'',nextLevel:45}),false);assert.equal(run.hp,40);
    assert.equal(stats(run).maxHp,125);assert.equal(collectHealthPack(run),25);run.hp=40;
  }
  run.passives.regen=2;assert.equal(stats(run).regen,1.4);
});
test('后期候选不足只给可用强化，全满时继续且不回血，不可跳过已有强化',()=>{
  const run=newRun();run.stage=4;run.hp=30;run.weapons={keyboard:5,keys:5,hoop:5,slipper:5};run.passives={power:3,haste:3,vitality:1,regen:1};
  const skip=upgradeChoices(run,rng(1));assert.equal(skip.length,1);assert.equal(skip[0].kind,'skip');
  assert.ok(applyUpgrade(run,skip[0]));assert.equal(run.hp,30);assert.deepEqual(run.passives,{power:3,haste:3,vitality:1,regen:1});
  run.passives.power=2;let choices=upgradeChoices(run,rng(1));assert.equal(choices.length,1);assert.equal(choices[0].id,'power');assert.equal(applyUpgrade(run,skip[0]),false);
  run.weapons.keys=4;choices=upgradeChoices(run,rng(2));assert.equal(choices.length,2);assert.ok(choices.every(o=>o.kind!=='heal'));
  run.weapons={'sprite-soda':5,icecream:5,keys:5,slipper:5};assert.ok(upgradeChoices(run,rng(3)).some(o=>o.kind==='evolve'));
});
test('融合保证出现并消耗两个五级武器，腾出一槽',()=>{
  const run=newRun();run.weapons={keyboard:4,'sprite-soda':5,icecream:5,keys:5};for(let seed=0;seed<100;seed++)assert.ok(upgradeChoices(run,rng(seed)).some(o=>o.kind==='evolve'));
  const option=upgradeChoices(run,rng(1))[0];assert.ok(applyUpgrade(run,option));assert.deepEqual(run.weapons,{keyboard:4,keys:5,'ice-soda-storm':1});assert.equal(Object.keys(run.weapons).length,3);assert.equal(applyUpgrade(run,option),false);
});
test('前六关按原顺序推进，第七关八Boss全部击败才胜利，重复退场不计数',()=>{
  const run=newRun('hoop',17);assert.equal(defeatBoss(run,'zhangxuefeng'),false);
  assert.equal(run.bosses.length,6);assert.equal(totalStages(run),7);assert.equal(totalBossEncounters(run),14);
  for(let stage=0;stage<6;stage++){assert.equal(run.stage,stage);assert.deepEqual(bossesForStage(run),[run.bosses[stage]]);assert.deepEqual(arenaSize(run),{width:2400,height:2000});run.bossActive=true;run.stageTime=120;const wrong=PEOPLE.find(p=>p.id!==run.bosses[stage])!.id as PersonId;assert.equal(defeatBoss(run,wrong),false);assert.ok(defeatBoss(run,run.bosses[stage]));assert.equal(run.won,false);assert.equal(run.defeated.length,stage+1);assert.equal(run.stageTime,0);}
  assert.ok(isFinalStage(run));assert.deepEqual(arenaSize(run),{width:3600,height:3000});assert.deepEqual(bossesForStage(run),PEOPLE.map(p=>p.id));
  assert.equal(defeatBoss(run,PEOPLE[0].id as PersonId),false);run.bossActive=true;run.hp=40;run.xp=1000;run.waveTime=1000;
  for(const [index,person] of [...PEOPLE].reverse().entries()){
    assert.equal(takeLevel(run,0),false);assert.ok(defeatBoss(run,person.id as PersonId));
    assert.equal(run.stage,6);assert.equal(run.finalDefeated.length,index+1);assert.equal(run.won,index===7);assert.equal(run.bossActive,index!==7);
    assert.equal(run.hp,index<7?40:75);assert.equal(defeatBoss(run,person.id as PersonId),false);
  }
  assert.equal(run.defeated.length,14);
  run.weapons.hoop=5;run.passives.vitality=3;const clean=newRun('hoop',17);assert.deepEqual(clean.weapons,{hoop:1});assert.deepEqual(clean.passives,{});assert.equal(clean.hp,100);assert.equal(clean.rerolls,3);assert.equal(clean.time,0);
  assert.deepEqual(clean.finalDefeated,[]);assert.deepEqual(arenaSize(clean),{width:2400,height:2000});
});
test('Boss解锁、战绩与设置跨读写保留；坏存档和拒绝存储可回退',()=>{
  const map=new Map<string,string>(),storage={getItem:(k:string)=>map.get(k)||null,setItem:(k:string,v:string)=>{map.set(k,v);}};
  const save=defaultSave();assert.deepEqual(unlockBoss(save,'zhangxuefeng'),['sprite-soda','icecream']);assert.deepEqual(unlockBoss(save,'zhangxuefeng'),[]);unlockBoss(save,'laoda');save.seen=['laoda'];save.settings={volume:0,shake:false};const run=newRun();run.kills=20;run.time=80;run.weaponDamage.keyboard=900;recordRun(save,run);assert.ok(writeSave(save,storage));assert.deepEqual(readSave(storage),save);
  map.set(SAVE_KEY,'{"version":1,"unlocked":["fake","hoop","hoop"],"records":[{}],"settings":{"volume":8}}');const sane=readSave(storage);assert.deepEqual(sane.unlocked,['keyboard','hoop']);assert.equal(sane.records.length,0);assert.equal(sane.settings.volume,1);
  map.set(SAVE_KEY,'{broken');assert.deepEqual(readSave(storage),defaultSave());const blocked={getItem:()=>{throw Error('denied');},setItem:()=>{throw Error('denied');}};assert.deepEqual(readSave(blocked),defaultSave());assert.equal(writeSave(save,blocked),false);
});
test('首局升级池包含八种武器；只有起始选择受解锁影响',()=>{const run=newRun();const pool=legalUpgrades(run);const ids=pool.filter(o=>o.kind==='weapon').map(o=>o.id as WeaponId);assert.equal(ids.length,8);assert.ok(ids.includes('crown-basketball'));});
test('新战绩记录14次Boss战，旧四关与六关记录兼容且设置和解锁不丢失',()=>{
  const save=defaultSave(),run=newRun();run.defeated=[...run.bosses,...PEOPLE.map(p=>p.id as PersonId)];run.won=true;recordRun(save,run);
  assert.equal(save.records[0].bosses,14);assert.equal(save.records[0].totalBosses,14);
  const legacy={date:'2026-10-11T00:00:00.000Z',won:true,seconds:800,kills:1000,level:22,bosses:4,damage:40000};
  save.records.push(legacy,{...legacy,bosses:6,totalBosses:6});save.unlocked.push('hoop');save.settings.volume=.5;
  const loaded=readSave({getItem:()=>JSON.stringify(save),setItem:()=>{}});
  assert.equal(loaded.records[0].totalBosses,14);assert.equal(loaded.records[1].totalBosses,4);assert.equal(loaded.records[1].won,true);assert.equal(loaded.records[2].totalBosses,6);
  assert.deepEqual(loaded.unlocked,save.unlocked);assert.deepEqual(loaded.settings,save.settings);
});
