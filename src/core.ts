import { BALANCE } from './balance';

export type PersonId = 'zhangxuefeng' | 'laoda' | 'kunkun' | 'lebang' | 'xujiayin' | 'mabaoguo' | 'xiangchanana' | 'jiangjieshi';
export type EnemyId = PersonId | 'crowd' | 'keyboarder' | 'lemon' | 'repeater' | 'ghost' | 'helicopter' | 'building' | 'lecture-stone';
export type WeaponId = 'keyboard' | 'sprite-soda' | 'icecream' | 'keys' | 'slipper' | 'hoop' | 'rhythm-basketball' | 'crown-basketball' | 'ice-soda-storm';
export type PassiveId = 'power' | 'haste' | 'area' | 'speed' | 'magnet' | 'vitality' | 'crit' | 'regen';
export interface WeaponDefinition { id: WeaponId; name: string; color: string; description: string; damage: number; cooldown: number; weak: EnemyId[] }
export interface EnemyDefinition { id: EnemyId; name: string; color: string; hp: number; speed: number; damage: number; xp: number; image?: string; phase2Image?: string; counter: WeaponId[]; description: string }
export interface UpgradeDefinition { kind: 'weapon' | 'passive' | 'heal' | 'evolve' | 'skip'; id: string; name: string; description: string; nextLevel: number }
export interface RunState {
  seed: number; time: number; waveTime: number; stage: number; stageTime: number; bosses: PersonId[]; bossActive: boolean;
  hp: number; level: number; xp: number; xpNext: number; weapons: Partial<Record<WeaponId, number>>;
  passives: Partial<Record<PassiveId, number>>; kills: number; counters: number; rerolls: number;
  weaponDamage: Partial<Record<WeaponId, number>>; defeated: PersonId[]; finalDefeated: PersonId[]; won: boolean;
}
export interface RecordEntry { date: string; won: boolean; seconds: number; kills: number; level: number; bosses: number; totalBosses?: number; damage: number }
export interface SaveData { version: 1; unlocked: WeaponId[]; seen: EnemyId[]; records: RecordEntry[]; settings: { volume: number; shake: boolean } }

export const WEAPONS: WeaponDefinition[] = [
  { id:'keyboard', name:'键盘连射', color:'#74CDE8', description:'自动锁定最近目标，快速发射按键，命中后消失。克制讲解师、讲解石和复读机；升级增加连发、伤害与射速。', damage:20, cooldown:0.55, weak:['repeater','jiangjieshi','lecture-stone'] },
  { id:'sprite-soda', name:'雪碧喷射', color:'#59CF91', description:'扇形汽水弹，持续击退。克制张雪峰、柠檬精。', damage:15, cooldown:0.8, weak:['zhangxuefeng','lemon'] },
  { id:'icecream', name:'巧乐兹冰棍', color:'#74CDE8', description:'投掷冰棍，落地产生持续伤害与减速冰区。', damage:24, cooldown:1.7, weak:['zhangxuefeng','crowd'] },
  { id:'keys', name:'交房钥匙串', color:'#F4CD67', description:'穿透钥匙；对楼盘与建筑护盾造成额外破坏。', damage:34, cooldown:0.9, weak:['xujiayin','keyboarder','building'] },
  { id:'slipper', name:'偷袭拖鞋', color:'#E65363', description:'回旋拖鞋，克制马保国、香茶娜娜；命中可打断蓄力，每次打断有保护间隔。', damage:32, cooldown:1.3, weak:['mabaoguo','xiangchanana','ghost'] },
  { id:'hoop', name:'篮筐反弹器', color:'#F49A45', description:'反弹篮球。身边的篮筐能反射来袭的篮球。', damage:27, cooldown:1.0, weak:['laoda','helicopter'] },
  { id:'rhythm-basketball', name:'节拍篮球', color:'#E996C3', description:'弹跳篮球，每三次命中爆发一圈音浪。', damage:25, cooldown:0.85, weak:['kunkun'] },
  { id:'crown-basketball', name:'皇冠回旋球', color:'#F4CD67', description:'穿透往返；同一发两次命中，削弱目标护盾。', damage:35, cooldown:1.45, weak:['lebang'] },
  { id:'ice-soda-storm', name:'冰汽水风暴', color:'#59CF91', description:'融合武器：身边持续冰汽水风暴，大范围减速与击退。', damage:40, cooldown:0.35, weak:['zhangxuefeng','lemon','crowd'] },
];
export const PASSIVES: {id:PassiveId; name:string; description:string; symbol:string}[] = [
  {id:'power',name:'梗力全开',description:'每级伤害 +18%',symbol:'✦'},
  {id:'haste',name:'手速拉满',description:'每级攻击速度 +15%',symbol:'»'},
  {id:'area',name:'场面扩大',description:'每级攻击范围 +18%',symbol:'◎'},
  {id:'speed',name:'脚底抹油',description:'每级移动速度 +10%',symbol:'↗'},
  {id:'magnet',name:'吃瓜磁铁',description:'每级拾取范围 +55%',symbol:'⊕'},
  {id:'vitality',name:'厚脸皮',description:'每级最大生命 +25，并恢复 25 生命',symbol:'♥'},
  {id:'crit',name:'会心一梗',description:'每级暴击率 +8%，暴击造成双倍伤害',symbol:'!'},
  {id:'regen',name:'歇口气',description:'每级每秒恢复 0.7 生命',symbol:'+'},
];
export const PEOPLE: EnemyDefinition[] = [
  {id:'zhangxuefeng',name:'张雪峰',image:'zhang-sunglasses',phase2Image:'zhang-heart',color:'#59CF91',hp:1900,speed:54,damage:18,xp:150,counter:['sprite-soda','icecream'],description:'试卷扇形弹幕、志愿表墙。红心形态加快攻势。用汽水击退，用冰棍减速。'},
  {id:'xujiayin',name:'许家印',image:'xujiayin-fan',color:'#F4CD67',hp:2400,speed:42,damage:22,xp:180,counter:['keys'],description:'搭建楼盘护盾，塔吊横扫。钥匙能穿透并额外破坏护盾与路障。'},
  {id:'mabaoguo',name:'马保国',image:'mabaoguo',color:'#E65363',hp:2100,speed:65,damage:22,xp:180,counter:['slipper'],description:'蓄力冲拳、三段突进、闪电五连鞭。拖鞋命中可打断蓄力。'},
  {id:'kunkun',name:'坤坤',image:'kunkun-portrait',phase2Image:'kunkun-cartoon',color:'#E996C3',hp:2300,speed:68,damage:20,xp:180,counter:['rhythm-basketball'],description:'运球变向、节拍篮球弹幕。节拍篮球第三次命中触发音浪。'},
  {id:'lebang',name:'乐邦',image:'lebang-face',phase2Image:'lebang-sunflower',color:'#F4CD67',hp:2600,speed:56,damage:24,xp:180,counter:['crown-basketball'],description:'持球冲锋、追身盖帽、扣篮冲击波。半血变为向日葵，追加环形弹幕。皇冠回旋球往返两次命中削弱护盾。'},
  {id:'xiangchanana',name:'香茶娜娜',image:'xiangchanana-phase1',phase2Image:'xiangchanana-phase2',color:'#C99262',hp:2700,speed:70,damage:24,xp:180,counter:['slipper'],description:'一阶段茶香弹幕、泼茶预警。半血切换造型，二阶段四连冲撞、撞墙折返，并释放环形弹幕。拖鞋克制并可打断冲撞蓄力。'},
  {id:'laoda',name:'牢大',image:'laoda-smile',phase2Image:'laoda-shush',color:'#F49A45',hp:3700,speed:60,damage:24,xp:200,counter:['hoop'],description:'投篮、突进扣篮，召唤牢大直升机。篮筐反射篮球，也能克制低空飞机。'},
  {id:'jiangjieshi',name:'讲解师',image:'jiangjieshi',color:'#8A91A5',hp:2800,speed:58,damage:22,xp:190,counter:['keyboard'],description:'一阶段追击与扇形弹幕。半血后随机释放可击碎的讲解石；石头持续播放讲解，周期性造成范围声波伤害，优先击碎它们。键盘克制。'},
];
export const COMMON: EnemyDefinition[] = [
  {id:'crowd',name:'吃瓜群众',color:'#59CF91',hp:35,speed:72,damage:9,xp:3,counter:['icecream'],description:'成群追击，用巧乐兹减速。'},
  {id:'keyboarder',name:'键盘侠',color:'#74CDE8',hp:50,speed:48,damage:10,xp:5,counter:['keys'],description:'保持距离，发射红色弹幕。钥匙克制。'},
  {id:'lemon',name:'柠檬精',color:'#F4CD67',hp:58,speed:58,damage:10,xp:5,counter:['sprite-soda'],description:'留下短时酸液。汽水克制。'},
  {id:'repeater',name:'复读机',color:'#E996C3',hp:80,speed:40,damage:12,xp:7,counter:['keyboard'],description:'不断召唤吃瓜群众。键盘克制。'},
  {id:'ghost',name:'催更幽灵',color:'#B3A3DF',hp:45,speed:65,damage:12,xp:5,counter:['slipper'],description:'预警后直线冲刺。拖鞋克制。'},
];
export const ENEMIES: EnemyDefinition[] = [...PEOPLE, ...COMMON,
  {id:'helicopter',name:'牢大直升机',image:'laoda-helicopter',color:'#F49A45',hp:400,speed:50,damage:15,xp:40,counter:['hoop'],description:'航线预警后低空扫射。所有武器可击毁，篮筐有克制加成。'},
  {id:'building',name:'楼盘路障',color:'#F4CD67',hp:100,speed:0,damage:6,xp:4,counter:['keys'],description:'临时路障，钥匙额外破坏。'},
  {id:'lecture-stone',name:'讲解石',image:'lecture-stone',color:'#8A91A5',hp:240,speed:0,damage:12,xp:12,counter:['keyboard'],description:'讲解师二阶段的固定声波源。范围圈内周期性受伤；可被所有武器击碎，键盘克制。最后一块被击碎后停止讲解音频。'},
];
export const weapon = (id:WeaponId) => WEAPONS.find(w=>w.id===id)!;
export const weaponBaseDamage = (id:WeaponId,level:number) => weapon(id).damage*(1+BALANCE.weaponLevelDamageGrowth*(Math.max(1,level)-1));
export const weaponCooldown = (id:WeaponId,level:number,run:RunState) => weapon(id).cooldown/((1+BALANCE.weaponLevelFireRateGrowth*(Math.max(1,level)-1))*stats(run).haste);
export const enemy = (id:EnemyId) => ENEMIES.find(e=>e.id===id)!;
export const bossMaxHp = (id:PersonId,stage:number,playerLevel:number) => enemy(id).hp*BALANCE.bossHpScale*(BALANCE.bossStageHpBase+BALANCE.bossStageHpGrowth*Math.max(0,stage)+BALANCE.bossLateStageHpQuadratic*Math.max(0,stage-1)**2)*(1+BALANCE.bossPlayerLevelHpGrowth*(Math.max(1,playerLevel)-1));
export function mobMaxHp(id:EnemyId,stage:number,stageTime:number,elite=false) {
  const progress=Math.max(0,stage),wave=Math.min(BALANCE.stageSeconds,Math.max(0,stageTime));
  const growth=1+BALANCE.enemyStageHpGrowth*progress+BALANCE.enemyStageHpQuadratic*progress**2+wave/300;
  return enemy(id).hp*growth*(elite?0.14*BALANCE.eliteHpScale:BALANCE.enemyHpScale);
}
export const upgradeInterval = (run:RunState) => BALANCE.upgradeMinSeconds+BALANCE.upgradeLateStageSeconds*Math.max(0,run.stage-1);
export const healingUpgradesAllowed = (run:RunState) => run.stage+1<BALANCE.healingUpgradeStopStage;
export function playerDashStats(level:number) {
  const levels=Math.max(0,(Number.isFinite(level)?level:1)-1);
  const speed=BALANCE.playerDashSpeed*(1+BALANCE.playerDashLevelSpeedGrowth*levels),seconds=BALANCE.dashSeconds;
  return {speed,seconds,distance:speed*seconds,invulnerability:Math.max(seconds,BALANCE.playerDashInvulnerability)};
}
export function rng(seed:number) { let a=seed>>>0; return () => { a+=0x6D2B79F5; let t=Math.imul(a^(a>>>15),1|a); t^=t+Math.imul(t^(t>>>7),61|t); return ((t^(t>>>14))>>>0)/4294967296; }; }
export function shuffle<T>(items:T[], random:()=>number) { const a=[...items]; for(let i=a.length-1;i>0;i--){const j=Math.floor(random()*(i+1)); [a[i],a[j]]=[a[j],a[i]];} return a; }
export function bossOrder(random:()=>number):PersonId[] {
  return shuffle(PEOPLE.map(p=>p.id as PersonId),random).slice(0,BALANCE.regularStageCount);
}
export const isFinalStage = (run:RunState) => run.stage===run.bosses.length;
export const totalStages = (run:RunState) => run.bosses.length+1;
export const totalBossEncounters = (run:RunState) => run.bosses.length+PEOPLE.length;
export const bossesForStage = (run:RunState):PersonId[] => isFinalStage(run)?PEOPLE.map(p=>p.id as PersonId):[run.bosses[run.stage]];
export const arenaSize = (run?:RunState) => run&&isFinalStage(run)?{width:BALANCE.finalWorldWidth,height:BALANCE.finalWorldHeight}:{width:BALANCE.worldWidth,height:BALANCE.worldHeight};
export function experienceForLevel(level:number) {
  const n=Math.max(0,level-1);
  return Math.floor(BALANCE.firstUpgradeXp+BALANCE.upgradeXpLinear*n+BALANCE.upgradeXpQuadratic*n*n);
}
// Only regular-wave combat advances this clock; Boss fights bank XP without upgrades.
export function takeLevel(run:RunState,lastUpgradeAt:number) {
  if(run.bossActive||run.won||run.xp<run.xpNext||run.waveTime-lastUpgradeAt<upgradeInterval(run))return false;
  run.xp-=run.xpNext;run.level++;run.xpNext=experienceForLevel(run.level);return true;
}
export function newRun(starter:WeaponId='keyboard', seed=Date.now()):RunState {
  return {seed,time:0,waveTime:0,stage:0,stageTime:0,bosses:bossOrder(rng(seed)),bossActive:false,hp:100,level:1,xp:0,xpNext:experienceForLevel(1),weapons:{[starter]:1},passives:{},kills:0,counters:0,rerolls:3,weaponDamage:{},defeated:[],finalDefeated:[],won:false};
}
export function stats(run:RunState) {
  const p=run.passives,levels=Math.max(0,run.level-1);
  return { maxHp:100+25*(p.vitality||0), damage:(1+0.18*(p.power||0))*(1+BALANCE.playerLevelDamageGrowth*levels), haste:(1+0.15*(p.haste||0))*(1+BALANCE.playerLevelFireRateGrowth*levels), area:1+0.18*(p.area||0), speed:BALANCE.playerSpeed*(1+0.10*(p.speed||0)), magnet:70*(1+0.55*(p.magnet||0)), crit:0.05+0.08*(p.crit||0), regen:0.7*(p.regen||0) };
}
export function shouldDropHealthPack(mob:{elite:boolean;boss:boolean},random:()=>number) {
  return mob.elite&&!mob.boss&&random()<BALANCE.eliteHealthPackChance;
}
export function collectHealthPack(run:RunState) {
  if(run.hp<=0||run.won)return 0;
  const healed=Math.max(0,Math.min(BALANCE.healthPackHealing,stats(run).maxHp-run.hp));
  run.hp+=healed;return healed;
}
export function damageAmount(base:number, wid:WeaponId, eid:EnemyId, run:RunState, critical=false, shield=0) {
  const counter=weapon(wid).weak.includes(eid);
  const shieldFactor=shield>0?(wid==='keys'?0.9:0.55):1;
  return {damage:base*BALANCE.weaponDamageScale*stats(run).damage*(counter?1.75:1)*(critical?2:1)*shieldFactor,counter};
}
export function legalUpgrades(run:RunState):UpgradeDefinition[] {
  const choices:UpgradeDefinition[]=[];
  if(run.weapons['sprite-soda']===5 && run.weapons.icecream===5 && !run.weapons['ice-soda-storm']) choices.push({kind:'evolve',id:'ice-soda-storm',name:'冰汽水风暴',description:'融合五级汽水与冰棍，腾出一槽，获得持续范围风暴。',nextLevel:1});
  for(const w of WEAPONS.filter(w=>w.id!=='ice-soda-storm')){
    if(run.weapons['ice-soda-storm'] && ['sprite-soda','icecream'].includes(w.id))continue;
    const lv=run.weapons[w.id]||0;
    if(lv<5&&(lv>0||Object.keys(run.weapons).length<4)) {
      const damageAt=(level:number)=>Math.round(weaponBaseDamage(w.id,level)*BALANCE.weaponDamageScale*stats(run).damage*10)/10;
      choices.push({kind:'weapon',id:w.id,name:w.name,description:w.description+(lv>0?` 单次伤害 ${damageAt(lv)} → ${damageAt(lv+1)}（不含克制与暴击）；攻击间隔 ${weaponCooldown(w.id,lv,run).toFixed(2)}s → ${weaponCooldown(w.id,lv+1,run).toFixed(2)}s。`:''),nextLevel:lv+1});
    }
  }
  for(const p of PASSIVES){
    if(!healingUpgradesAllowed(run)&&(p.id==='regen'||p.id==='vitality'))continue;
    const lv=run.passives[p.id]||0; if(lv<3&&(lv>0||Object.keys(run.passives).length<4)) choices.push({kind:'passive',id:p.id,name:p.name,description:p.description,nextLevel:lv+1});
  }
  return choices;
}
export function upgradeChoices(run:RunState, random:()=>number):UpgradeDefinition[] {
  const pool=legalUpgrades(run), evolution=pool.find(p=>p.kind==='evolve');
  const selected=shuffle(pool.filter(p=>p!==evolution),random).slice(0,evolution?2:3);
  if(evolution) selected.unshift(evolution);
  // Late rounds may offer fewer cards. A capped build can still resume without healing.
  if(!healingUpgradesAllowed(run))return selected.length?selected:[{kind:'skip',id:'continue',name:'继续战斗',description:'装备已无可选强化，保留本次等级带来的伤害与射速成长，继续战斗。',nextLevel:0}];
  const heals=[{id:'heal-small',name:'来口冰水',description:'恢复 25 生命',amount:25},{id:'heal-medium',name:'加餐时间',description:'恢复 35 生命',amount:35},{id:'heal-full',name:'满血复活？',description:'恢复 45 生命',amount:45}];
  while(selected.length<3){const h=heals[selected.length];selected.push({kind:'heal',id:h.id,name:h.name,description:h.description,nextLevel:h.amount});}
  return selected;
}
export function applyUpgrade(run:RunState, option:UpgradeDefinition) {
  if(option.kind==='skip')return option.id==='continue'&&option.nextLevel===0&&!healingUpgradesAllowed(run)&&legalUpgrades(run).length===0;
  if(option.kind==='heal'){
    if(!healingUpgradesAllowed(run))return false;
    run.hp=Math.min(stats(run).maxHp,run.hp+option.nextLevel);return true;
  }
  const legal=legalUpgrades(run).find(x=>x.kind===option.kind&&x.id===option.id&&x.nextLevel===option.nextLevel);
  if(!legal)return false;
  if(option.kind==='evolve'){delete run.weapons['sprite-soda'];delete run.weapons.icecream;run.weapons['ice-soda-storm']=1;}
  else if(option.kind==='weapon') run.weapons[option.id as WeaponId]=option.nextLevel;
  else {run.passives[option.id as PassiveId]=option.nextLevel; if(option.id==='vitality')run.hp+=25;}
  return true;
}
export function defeatBoss(run:RunState, id:PersonId) {
  if(run.won||!run.bossActive)return false;
  if(isFinalStage(run)){
    if(!PEOPLE.some(p=>p.id===id)||run.finalDefeated.includes(id))return false;
    run.finalDefeated.push(id);run.defeated.push(id);
    if(run.finalDefeated.length===PEOPLE.length){run.bossActive=false;run.won=true;run.hp=Math.min(stats(run).maxHp,run.hp+35);}
    return true;
  }
  if(run.bosses[run.stage]!==id)return false;
  run.defeated.push(id);run.bossActive=false;run.hp=Math.min(stats(run).maxHp,run.hp+35);
  run.stage++;run.stageTime=0;return true;
}
export const SAVE_KEY='gengking-survivors-v1';
export const defaultSave=():SaveData=>({version:1,unlocked:['keyboard'],seen:[],records:[],settings:{volume:0.3,shake:true}});
type StorageLike={getItem:(key:string)=>string|null;setItem:(key:string,value:string)=>void};
export function readSave(storage:StorageLike):SaveData {
  const fallback=defaultSave();
  try {
    const s=JSON.parse(storage.getItem(SAVE_KEY)||'null'); if(!s||s.version!==1)return fallback;
    if(Array.isArray(s.unlocked))fallback.unlocked=[...new Set<WeaponId>(['keyboard',...s.unlocked.filter((id:WeaponId)=>WEAPONS.some(w=>w.id===id&&id!=='ice-soda-storm'))])];
    if(Array.isArray(s.seen))fallback.seen=s.seen.filter((id:EnemyId)=>ENEMIES.some(e=>e.id===id));
    if(Array.isArray(s.records))fallback.records=s.records.filter((r:RecordEntry)=>r&&typeof r.date==='string'&&typeof r.won==='boolean'&&['seconds','kills','level','bosses','damage'].every(k=>Number.isFinite((r as unknown as Record<string,number>)[k])&&(r as unknown as Record<string,number>)[k]>=0)).slice(0,20).map((r:RecordEntry)=>({...r,totalBosses:Number.isInteger(r.totalBosses)&&r.totalBosses!>0&&r.totalBosses!>=r.bosses?r.totalBosses:Math.max(4,Math.ceil(r.bosses))}));
    if(s.settings){if(Number.isFinite(s.settings.volume))fallback.settings.volume=Math.min(1,Math.max(0,s.settings.volume));if(typeof s.settings.shake==='boolean')fallback.settings.shake=s.settings.shake;}
  } catch { /* Corrupt or blocked storage never prevents play. */ }
  return fallback;
}
export function writeSave(save:SaveData, storage:StorageLike) { try{storage.setItem(SAVE_KEY,JSON.stringify(save));return true;}catch{return false;} }
export function unlockBoss(save:SaveData, id:PersonId):WeaponId[] {
  const unlocked=enemy(id).counter.filter(w=>!save.unlocked.includes(w));save.unlocked.push(...unlocked);return unlocked;
}
export function recordRun(save:SaveData, run:RunState) {save.records.unshift({date:new Date().toISOString(),won:run.won,seconds:Math.floor(run.time),kills:run.kills,level:run.level,bosses:run.defeated.length,totalBosses:totalBossEncounters(run),damage:Math.round(Object.values(run.weaponDamage).reduce((a,b)=>a+(b||0),0))});save.records=save.records.slice(0,20);}
export const clockText=(s:number)=>`${Math.floor(s/60).toString().padStart(2,'0')}:${Math.floor(s%60).toString().padStart(2,'0')}`;
