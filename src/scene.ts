import Phaser from 'phaser';
import { ASSETS } from './assets';
import { ArcadeAudio } from './audio';
import { CHARACTER_AUDIO_CUES, VOICE_GLOBAL_GAP, LECTURE_STONE_AUDIO } from './character-audio';
import { essentialVoice, type VoiceEvent } from './voice';
import { BALANCE } from './balance';
import { COMMON, PEOPLE, enemy, weapon, weaponBaseDamage, weaponCooldown, bossMaxHp, mobMaxHp, upgradeInterval, playerDashStats, shouldDropHealthPack, collectHealthPack, stats, damageAmount, newRun, rng, defeatBoss, applyUpgrade, upgradeChoices, takeLevel, isFinalStage, arenaSize, bossesForStage, type EnemyId, type PersonId, type WeaponId, type RunState, type UpgradeDefinition } from './core';

const W=BALANCE.worldWidth,H=BALANCE.worldHeight,MAX_ENEMIES=BALANCE.enemyLimit,MAX_SHOTS=BALANCE.projectileLimit;
const STAGE_NAMES:Record<PersonId,string>={zhangxuefeng:'汽水考场',xujiayin:'楼盘广场',mabaoguo:'闪身擂台',kunkun:'节拍球场',lebang:'皇冠球场',xiangchanana:'茶香乐园',laoda:'篮球竞技场',jiangjieshi:'讲解广场'};
const distance=(x:number,y:number,x2:number,y2:number)=>Math.hypot(x-x2,y-y2);
type Mob={uid:number;summonerUid?:number;active:boolean;s:Phaser.Physics.Arcade.Image;id:EnemyId;hp:number;maxHp:number;radius:number;boss:boolean;elite:boolean;timer:number;cycle:number;slow:number;stun:number;interruptAt:number;knockbackAt:number;shield:number;dash:number;dx:number;dy:number;life:number;hits:number;variant:boolean;rushTimer:number;rampageLeft:number;rampageTimer:number;dodge:number;dodgeCooldown:number;dodgeDx:number;dodgeDy:number;lastHitAt:number;voiceRandomTimer:number;nearDeathAnnounced:boolean;stoneTimer:number};
type Shot={active:boolean;s:Phaser.GameObjects.Image;x:number;y:number;vx:number;vy:number;age:number;ttl:number;weapon?:WeaponId;damage:number;radius:number;pierce:number;bounces:number;hits:Map<number,number>;returning:boolean;basketball:boolean};
type Drop={active:boolean;s:Phaser.GameObjects.Image;value:number};
type HealthPack={active:boolean;s:Phaser.GameObjects.Image};
type Hazard={kind:'circle'|'line'|'fan'|'ring'|'charge'|'helicopter'|'wall'|'whip'|'acid'|'ice'|'pulse';x:number;y:number;x2:number;y2:number;radius:number;warn:number;life:number;damage:number;owner?:Mob;weapon?:WeaponId;fired:boolean;tick:number};
export interface GameHooks {
  ready:()=>void; hud:(run:RunState,boss?:Mob)=>void; upgrade:(options:UpgradeDefinition[])=>void;
  end:(run:RunState)=>void; seen:(id:EnemyId)=>void; bossDefeated:(id:PersonId)=>void; toast:(message:string)=>void;
}

export class ArenaScene extends Phaser.Scene {
  hooks!:GameHooks;
  audio=new ArcadeAudio(CHARACTER_AUDIO_CUES,VOICE_GLOBAL_GAP,LECTURE_STONE_AUDIO);
  run?:RunState;
  playing=false;
  paused=false;
  pauseReason='';
  ready=false;
  shake=true;
  player!:Phaser.Physics.Arcade.Image;
  mobs:Mob[]=[];shots:Shot[]=[];drops:Drop[]=[];hazards:Hazard[]=[];
  healthPacks:HealthPack[]=[];
  boss?:Mob;
  private fx!:Phaser.GameObjects.Graphics;
  private labels:{s:Phaser.GameObjects.Text;ttl:number}[]=[];
  private rng=()=>Math.random();
  private keys!:Record<string,Phaser.Input.Keyboard.Key>;
  private cooldown:Partial<Record<WeaponId,number>>={};
  private spawnTimer=0;private eliteTimer=20;private uid=0;private invulnerable=0;
  private dashTime=0;private dashCooldown=0;private direction={x:1,y:0};
  private dashSpeed:number=BALANCE.playerDashSpeed;private dashDirection={x:1,y:0};private dashDistanceRemaining=0;private dashInvulnerability=0;
  private pendingLevels=0;private lastUpgradeAt=0;private hudTimer=0;private hitLabelTimer=0;
  private grid=new Map<string,Mob[]>();
  private stageLabel!:Phaser.GameObjects.Text;
  private stageDecor!:Phaser.GameObjects.Graphics;
  private mapObjects:Phaser.GameObjects.GameObject[]=[];
  private bursts:{x:number;y:number;age:number;color:number;smoke:boolean}[]=[];
  missingAssets:string[]=[];
  qaImmortal=false;qaAuto=false;qaAutoUpgrade=false;
  qaKeyboardOnly=false;
  abilityLog:Record<string,number>={};
  combatLog:Record<string,number>={};
  constructor(){super('Arena');}
  preload(){
    const progress=document.getElementById('load-progress');
    this.load.on('progress',(p:number)=>{if(progress)progress.textContent=`${Math.round(p*100)}%`;});
    this.load.on('loaderror',(file:{key:string})=>{this.missingAssets.push(file.key);});
    for(const a of ASSETS)if(a.url)this.load.image('raw-'+a.id,a.url);
  }
  create(){
    for(const a of ASSETS){
      const raw='raw-'+a.id;
      if(!this.textures.exists(raw))continue;
      const source=this.textures.get(raw).getSourceImage() as HTMLImageElement;
      const r=a.sourceRect||[0,0,source.width,source.height];
      const size=a.role==='item'?128:256;
      const texture=this.textures.createCanvas(a.id,size,size)!;
      const ctx=texture.context,ratio=Math.min(size/r[2],size/r[3]);
      ctx.drawImage(source,r[0],r[1],r[2],r[3],(size-r[2]*ratio)/2,(size-r[3]*ratio)/2,r[2]*ratio,r[3]*ratio);
      texture.refresh();this.textures.remove(raw);
    }
    this.makeTextures();this.configureArena();
    this.player=this.physics.add.image(W/2,H/2,'player').setDepth(45).setDisplaySize(57,57);
    this.player.body!.setCircle(25,23,23);this.player.setCollideWorldBounds(true).setVisible(false);
    this.cameras.main.setBounds(0,0,W,H);this.cameras.main.centerOn(W/2,H/2);
    this.fx=this.add.graphics().setDepth(40);
    this.keys=this.input.keyboard!.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT,SPACE') as Record<string,Phaser.Input.Keyboard.Key>;
    this.input.keyboard!.addCapture(['UP','DOWN','LEFT','RIGHT','SPACE']);
    this.input.keyboard!.enabled=false;
    this.input.keyboard!.disableGlobalCapture();
    this.scale.on('resize',this.resize,this);this.resize();
    this.ready=true;this.hooks.ready();
  }
  private texture(id:string,draw:(g:Phaser.GameObjects.Graphics)=>void,size=96){if(this.textures.exists(id))return;const g=this.make.graphics({x:0,y:0});draw(g);g.generateTexture(id,size,size);g.destroy();}
  private makeTextures(){
    this.texture('player',g=>{
      g.fillStyle(0x20283f,0.16).fillEllipse(48,82,57,16);
      g.lineStyle(5,0x20283f).fillStyle(0xf5f7fb).fillRoundedRect(25,50,47,31,11).strokeRoundedRect(25,50,47,31,11);
      g.fillStyle(0xf4cd67).fillCircle(48,36,25).strokeCircle(48,36,25);
      g.fillStyle(0x59cf91).fillEllipse(48,19,49,15).strokeEllipse(48,19,49,15);
      g.lineStyle(3,0x20283f).lineBetween(38,12,37,24).lineBetween(49,12,49,25).lineBetween(59,14,61,23);
      g.fillStyle(0x20283f).fillCircle(39,36,3).fillCircle(57,36,3);g.lineBetween(42,46,53,46);
      g.fillStyle(0xe65363).fillCircle(31,44,4).fillCircle(65,44,4);
    });
    for(const def of COMMON){this.texture(def.id,g=>{
      const color=Phaser.Display.Color.HexStringToColor(def.color).color;
      g.fillStyle(0x20283f,0.12).fillEllipse(48,79,65,13);g.lineStyle(4,0x20283f).fillStyle(color);
      if(def.id==='keyboarder')g.fillRoundedRect(10,23,77,46,8).strokeRoundedRect(10,23,77,46,8);
      else if(def.id==='repeater')g.fillRoundedRect(18,14,62,63,10).strokeRoundedRect(18,14,62,63,10);
      else if(def.id==='ghost'){g.fillEllipse(48,40,58,64).strokeEllipse(48,40,58,64);g.fillTriangle(21,51,76,51,72,81).fillTriangle(20,49,40,50,23,82);}
      else g.fillEllipse(48,43,62,62).strokeEllipse(48,43,62,62);
      g.fillStyle(0xf5f7fb).fillCircle(37,37,10).fillCircle(59,37,10);g.fillStyle(0x20283f).fillCircle(39,39,4).fillCircle(57,39,4);
      g.lineStyle(3,0x20283f).lineBetween(39,57,57,57);
      if(def.id==='crowd'){g.fillStyle(0x327c52).fillTriangle(24,66,69,66,46,88).strokeTriangle(24,66,69,66,46,88);g.fillStyle(0xe65363).fillTriangle(31,67,62,67,46,81);}
      if(def.id==='keyboarder')for(let x=24;x<76;x+=13)g.fillStyle(0x20283f).fillRect(x,59,8,5);
      if(def.id==='lemon')g.fillStyle(0x59cf91).fillEllipse(61,10,26,12);
      if(def.id==='repeater')g.lineStyle(3,0x20283f).strokeCircle(48,67,5).lineBetween(41,19,55,19);
    });}
    this.texture('building',g=>{g.lineStyle(5,0x20283f).fillStyle(0xf4cd67).fillRect(15,10,67,76).strokeRect(15,10,67,76);for(let y=22;y<74;y+=19)for(let x=26;x<76;x+=20)g.fillStyle(0x20283f).fillRect(x,y,9,11);});
    this.texture('key-shot',g=>{g.fillStyle(0xf5f7fb).lineStyle(6,0x20283f).fillRoundedRect(16,22,63,52,12).strokeRoundedRect(16,22,63,52,12);g.lineStyle(6,0x74cde8).lineBetween(35,48,58,48);});
    this.texture('red-bullet',g=>{
      g.fillStyle(0xff334f,0.2).fillCircle(48,48,46);
      g.lineStyle(5,0x94162e).fillStyle(0xf02e49).fillCircle(48,48,34).strokeCircle(48,48,34);
      g.fillStyle(0xff8593).fillCircle(45,44,21);g.fillStyle(0xfff4ef).fillCircle(43,42,11);
    });
    this.texture('paper',g=>{g.fillStyle(0xf5f7fb).lineStyle(4,0x20283f).fillRect(22,8,53,77).strokeRect(22,8,53,77);g.lineStyle(3,0xe65363);for(let y=26;y<78;y+=13)g.lineBetween(32,y,64,y);});
    this.texture('ball',g=>{g.fillStyle(0xf49a45).lineStyle(5,0x20283f).fillCircle(48,48,32).strokeCircle(48,48,32);g.lineBetween(17,48,78,48).lineBetween(48,17,48,78);g.strokeEllipse(48,48,30,63);});
    this.texture('tea-shot',g=>{g.lineStyle(5,0x20283f).strokeCircle(76,48,13);g.fillStyle(0xf5f7fb).fillRoundedRect(18,25,54,48,10).strokeRoundedRect(18,25,54,48,10);g.fillStyle(0xc99262).fillEllipse(45,28,50,14);g.lineStyle(4,0xc99262).lineBetween(30,10,35,18).lineBetween(50,6,55,16);});
    this.texture('xp',g=>{g.lineStyle(5,0x20283f).fillStyle(0x59cf91).fillTriangle(48,15,18,48,48,81).fillTriangle(48,15,78,48,48,81).strokeTriangle(48,15,18,48,48,81).strokeTriangle(48,15,78,48,48,81);});
    this.texture('health-pack',g=>{
      g.fillStyle(0x20283f,0.14).fillEllipse(48,81,65,16);g.lineStyle(5,0x20283f).strokeRoundedRect(34,12,28,26,6);
      g.fillStyle(0xf5f7fb).fillRoundedRect(15,28,66,51,10).strokeRoundedRect(15,28,66,51,10);
      g.fillStyle(0xe65363).fillRect(41,37,14,33).fillRect(31,47,34,13);
    });
    this.texture('fallback',g=>{g.fillStyle(0xe65363).lineStyle(5,0x20283f).fillCircle(48,48,35).strokeCircle(48,48,35);g.lineBetween(38,30,38,49).lineBetween(59,30,59,49).lineBetween(36,67,63,67);});
  }
  private drawMap(){
    const W=this.worldWidth,H=this.worldHeight;
    for(const object of this.mapObjects)object.destroy();this.mapObjects=[];
    const g=this.add.graphics().setDepth(-10);g.fillStyle(0xf0eddf).fillRect(0,0,W,H);
    this.mapObjects.push(g);
    g.lineStyle(1,0x20283f,0.08);for(let x=0;x<=W;x+=100)g.lineBetween(x,0,x,H);for(let y=0;y<=H;y+=100)g.lineBetween(0,y,W,y);
    g.lineStyle(18,0x20283f,0.10).strokeRect(40,40,W-80,H-80);g.lineStyle(3,0x20283f,0.18).strokeRect(65,65,W-130,H-130);
    const random=rng(701);for(let i=0;i<80;i++){const x=90+random()*(W-180),y=90+random()*(H-180);g.fillStyle(i%3===0?0x59cf91:0x20283f,0.11);g.fillRoundedRect(x,y,10+random()*20,4,2);}
    g.lineStyle(4,0x20283f,0.13).strokeCircle(W/2,H/2,225).lineBetween(W/2-300,H/2,W/2+300,H/2).lineBetween(W/2,H/2-300,W/2,H/2+300);
    this.mapObjects.push(this.add.text(W/2,H/2-80,'梗  王  广  场',{fontFamily:'Microsoft YaHei',fontSize:'68px',fontStyle:'bold',color:'#20283f'}).setAlpha(0.09).setOrigin(0.5).setDepth(-8));
    this.stageLabel=this.add.text(W/2,H/2+70,'01 / 汽水考场',{fontFamily:'Microsoft YaHei',fontSize:'24px',color:'#20283f'}).setAlpha(0.14).setOrigin(0.5).setDepth(-8);
    this.stageDecor=this.add.graphics().setDepth(-9);
    this.mapObjects.push(this.stageLabel,this.stageDecor);
    for(const [x,y,text] of [[170,220,'吃瓜入口'],[W-170,220,'今天谁是梗王'],[170,H-190,'禁止站桩'],[W-170,H-190,'篮球不落地']] as const){const sign=this.add.text(x,y,text,{fontFamily:'Microsoft YaHei',fontSize:'17px',color:'#20283f',backgroundColor:'#f5f7fb',padding:{x:16,y:10}}).setOrigin(0.5).setRotation((x<W/2?-1:1)*0.05).setDepth(-5);sign.setAlpha(0.6);this.mapObjects.push(sign);}
  }
  private configureArena(){this.physics.world.setBounds(35,35,this.worldWidth-70,this.worldHeight-70);this.cameras.main.setBounds(0,0,this.worldWidth,this.worldHeight);this.drawMap();}
  private resize(){this.cameras.main.setZoom(Math.max(0.68,Math.min(1.25,this.scale.height/800)));}
  private decorateStage(){
    const W=this.worldWidth,H=this.worldHeight;
    if(isFinalStage(this.run!)){
      this.stageLabel.setText('07 / 梗王广场 · 八王齐聚');this.stageDecor.clear().lineStyle(5,0xe65363,0.18).strokeCircle(W/2,H/2,BALANCE.finalBossSpawnRadius);
      for(let i=0;i<PEOPLE.length;i++){const angle=i*Math.PI*2/PEOPLE.length;this.stageDecor.strokeCircle(W/2+Math.cos(angle)*BALANCE.finalBossSpawnRadius,H/2+Math.sin(angle)*BALANCE.finalBossSpawnRadius,70);}return;
    }
    const g=this.stageDecor;g.clear();const id=this.run!.bosses[this.run!.stage],color=Phaser.Display.Color.HexStringToColor(enemy(id).color).color;
    this.stageLabel.setText(`${String(this.run!.stage+1).padStart(2,'0')} / ${STAGE_NAMES[id]}`);
    g.lineStyle(5,color,0.16);
    if(['laoda','kunkun','lebang'].includes(id)){g.strokeRect(W/2-520,H/2-330,1040,660).strokeCircle(W/2,H/2,110).lineBetween(W/2,H/2-330,W/2,H/2+330);g.strokeRect(W/2-520,H/2-110,170,220).strokeRect(W/2+350,H/2-110,170,220);}
    else if(id==='zhangxuefeng'){for(let i=0;i<6;i++){const x=850+(i%3)*240,y=700+Math.floor(i/3)*390;g.strokeRect(x,y,115,155);for(let j=0;j<4;j++)g.lineBetween(x+20,y+35+j*23,x+95,y+35+j*23);}}
    else if(id==='xujiayin'){for(let i=0;i<4;i++){const x=780+i*240;g.strokeRect(x,680,95,190).strokeRect(x,1160,95,190);}}
    else {for(let i=0;i<5;i++){const x=850+i*160;g.lineBetween(x,650,x+35,780).lineBetween(x+35,780,x+75,740).lineBetween(x+75,740,x+95,860);}}
  }
  start(starter:WeaponId,seed=Date.now()){
    this.audio.resetVoices();this.audio.setPaused(false);
    for(const e of this.mobs)this.releaseMob(e);for(const s of this.shots)this.releaseShot(s);for(const d of this.drops){d.active=false;d.s.setVisible(false);}
    for(const pack of this.healthPacks){pack.active=false;pack.s.setVisible(false);}
    this.hazards=[];this.bursts=[];this.fx.clear();for(const l of this.labels)l.s.destroy();this.labels=[];
    this.run=newRun(starter,seed);this.rng=rng(seed+7);this.boss=undefined;this.playing=true;this.paused=false;this.pauseReason='';
    this.configureArena();
    this.cooldown={};this.spawnTimer=0.2;this.eliteTimer=20;this.invulnerable=1;this.dashTime=0;this.dashCooldown=0;this.pendingLevels=0;this.lastUpgradeAt=0;this.hudTimer=0;this.hitLabelTimer=0;this.grid.clear();this.abilityLog={};this.combatLog={};
    this.dashSpeed=playerDashStats(this.run.level).speed;this.dashDirection={x:1,y:0};this.dashDistanceRemaining=0;this.dashInvulnerability=0;
    this.player.enableBody(true,W/2,H/2,true,true).setAlpha(1).setAngle(0);this.direction={x:1,y:0};
    this.cameras.main.startFollow(this.player,true,0.12,0.12);this.input.keyboard!.enabled=true;this.input.keyboard!.enableGlobalCapture();this.input.keyboard!.resetKeys();this.physics.resume();
    this.decorateStage();this.hooks.hud(this.run);this.audio.unlock();
    if(this.missingAssets.length)this.hooks.toast('部分图片未加载，已用备用图形继续游戏。');
  }
  setPaused(value:boolean,reason=''){
    this.paused=value;this.pauseReason=reason;this.audio.setPaused(value);
    if(value){this.physics.pause();this.player.setVelocity(0);this.input.keyboard!.enabled=false;this.input.keyboard!.disableGlobalCapture();this.audio.context?.suspend();}
    else {this.physics.resume();this.input.keyboard!.enabled=true;this.input.keyboard!.enableGlobalCapture();this.input.keyboard!.resetKeys();this.audio.unlock();}
  }
  stop(){this.playing=false;this.clearLectureStones();this.setPaused(true);this.input.keyboard!.enabled=false;this.player.setVisible(false);this.fx.clear();}
  update(_time:number,delta:number){if(!this.playing||this.paused||!this.run)return;this.step(Math.min(delta,50)/1000);}
  step(dt:number){
    if(!this.run||!this.playing||this.paused)return;
    const r=this.run;r.time+=dt;this.audio.update(r.time);if(!r.bossActive){r.stageTime+=dt;r.waveTime+=dt;}
    this.invulnerable=Math.max(0,this.invulnerable-dt);this.dashCooldown=Math.max(0,this.dashCooldown-dt);this.hitLabelTimer-=dt;
    this.movePlayer(dt);this.updateMobs(dt);
    this.physics.world.update(r.time*1000,dt*1000);this.physics.world.postUpdate();
    this.rebuildGrid();this.attack(dt);this.updateShots(dt);if(!this.playing)return;this.updateHazards(dt);this.updateHealthPacks();this.updateDrops(dt);if(this.paused)return;
    if(this.dashTime<=0){for(const m of this.near(this.player.x,this.player.y,95))if(distance(m.s.x,m.s.y,this.player.x,this.player.y)<m.radius+14){this.hurt(this.mobDamage(m)*(m.elite?0.8:1));if(m.id==='building'){const dx=this.player.x-m.s.x,dy=this.player.y-m.s.y,d=Math.max(1,Math.hypot(dx,dy)),push=m.radius+15-d;this.player.body!.reset(this.player.x+dx/d*push,this.player.y+dy/d*push);}}}
    r.hp=Math.min(stats(r).maxHp,r.hp+stats(r).regen*dt);
    this.spawnTimer-=dt;this.eliteTimer-=dt;
    if(this.spawnTimer<=0){this.spawnTimer=r.bossActive?BALANCE.bossSpawnSeconds:Math.max(0.24,0.85-r.stage*0.14-r.stageTime*0.0018);const count=r.bossActive?1:1+Math.floor(r.stageTime/60);if(!r.bossActive||this.mobs.filter(m=>m.active).length<BALANCE.bossCrowdLimit)for(let i=0;i<count;i++)this.spawnCommon();}
    if(!r.bossActive&&this.eliteTimer<=0){this.eliteTimer=32;this.spawn(PEOPLE[Math.floor(this.rng()*PEOPLE.length)].id,false,true);}
    if(!r.bossActive&&r.stageTime>=BALANCE.stageSeconds)this.summonBoss();
    for(const l of this.labels){l.ttl-=dt;l.s.y-=dt*20;l.s.setAlpha(Math.max(0,l.ttl/0.9));}this.labels=this.labels.filter(l=>{if(l.ttl>0)return true;l.s.destroy();return false;});
    for(const b of this.bursts)b.age+=dt;this.bursts=this.bursts.filter(b=>b.age<0.4);
    this.drawEffects();this.hudTimer-=dt;if(this.hudTimer<=0){this.hudTimer=0.1;this.hooks.hud(r,this.boss);}
    if(r.hp<=0)this.finish(false);
  }
  private movePlayer(dt:number){
    const r=this.run!,s=stats(r);
    this.dashInvulnerability=Math.max(0,this.dashInvulnerability-dt);
    let dx=Number(this.keys.D.isDown||this.keys.RIGHT.isDown)-Number(this.keys.A.isDown||this.keys.LEFT.isDown);
    let dy=Number(this.keys.S.isDown||this.keys.DOWN.isDown)-Number(this.keys.W.isDown||this.keys.UP.isDown);
    if(this.qaAuto){const angle=r.time*0.35;const tx=this.worldWidth/2+Math.cos(angle)*360,ty=this.worldHeight/2+Math.sin(angle)*290;const d=Math.max(1,distance(tx,ty,this.player.x,this.player.y));dx=(tx-this.player.x)/d;dy=(ty-this.player.y)/d;}
    const length=Math.hypot(dx,dy);if(length>0){dx/=length;dy/=length;this.direction={x:dx,y:dy};}
    if(Phaser.Input.Keyboard.JustDown(this.keys.SPACE)&&this.dashCooldown<=0){
      const dash=playerDashStats(r.level);this.dashTime=dash.seconds;this.dashCooldown=BALANCE.dashCooldown;
      this.dashSpeed=dash.speed;this.dashDirection={...this.direction};this.dashDistanceRemaining=dash.distance;this.dashInvulnerability=dash.invulnerability;
      this.invulnerable=Math.max(this.invulnerable,dash.invulnerability);this.hudTimer=0;this.audio.play('dash');
    }
    const slow=this.hazards.some(h=>h.kind==='acid'&&h.fired&&distance(h.x,h.y,this.player.x,this.player.y)<h.radius)?0.65:1;
    let speed=s.speed*slow;const dashing=this.dashTime>0;
    if(dashing){
      // Limit the last simulation step to the remaining distance, independent of frame rate.
      const travel=Math.min(this.dashDistanceRemaining,this.dashSpeed*Math.min(dt,this.dashTime));this.dashDistanceRemaining=Math.max(0,this.dashDistanceRemaining-travel);speed=dt>0?travel/dt:0;
      this.dashTime=Math.max(0,this.dashTime-dt);
    }
    this.player.setVelocity((dashing?this.dashDirection.x:dx)*speed,(dashing?this.dashDirection.y:dy)*speed);
    this.player.setAngle(length>0?Math.sin(r.time*18)*4:0).setAlpha(this.invulnerable>0?0.45+Math.sin(r.time*35)*0.25:1);
  }
  private spawnCommon(){const r=this.run!;const accessible=Math.min(5,2+Math.floor(r.stageTime/30)+r.stage);let id=COMMON[Math.floor(this.rng()*accessible)].id;if(id==='repeater'&&(r.bossActive||this.mobs.filter(m=>m.active&&m.id==='repeater').length>=3+r.stage))id='crowd';this.spawn(id);}
  spawn(id:EnemyId,boss=false,elite=false,x?:number,y?:number){
    const W=this.worldWidth,H=this.worldHeight;
    if(this.mobs.filter(m=>m.active).length>=MAX_ENEMIES&&!boss)return undefined;
    const r=this.run!,def=enemy(id),angle=this.rng()*Math.PI*2;
    x??=Phaser.Math.Clamp(this.player.x+Math.cos(angle)*650,65,W-65);y??=Phaser.Math.Clamp(this.player.y+Math.sin(angle)*650,65,H-65);
    let m=this.mobs.find(m=>!m.active);
    if(!m){const sprite=this.physics.add.image(x,y,'fallback');m={s:sprite} as Mob;this.mobs.push(m);}
    const texture=def.image||def.id;const size=id==='lecture-stone'?96:id==='helicopter'?155:boss?134:elite?86:57;
    const hp=boss?bossMaxHp(id as PersonId,r.stage,r.level):mobMaxHp(id,r.stage,r.stageTime,elite);
    Object.assign(m,{uid:++this.uid,summonerUid:undefined,active:true,id,hp,maxHp:hp,radius:id==='lecture-stone'?27:id==='helicopter'?38:boss?31:elite?24:17,boss,elite,timer:id==='lecture-stone'?BALANCE.lectureStoneWarnSeconds:boss?1.8:2+this.rng()*2,cycle:0,slow:0,stun:0,interruptAt:-10,knockbackAt:-10,shield:id==='lebang'?(boss?350:70):0,dash:0,dx:0,dy:0,life:0,hits:0,variant:false,rushTimer:BALANCE.bossRageRushSeconds,rampageLeft:0,rampageTimer:0,dodge:0,dodgeCooldown:5+this.rng()*2,dodgeDx:0,dodgeDy:0,lastHitAt:-Infinity,voiceRandomTimer:12+this.rng()*8,nearDeathAnnounced:false,stoneTimer:0});
    m.s.setTexture(this.textures.exists(texture)?texture:'fallback').enableBody(true,x,y,true,true).setDisplaySize(size,size).setAlpha(1).setAngle(0).setFlip(false,false).clearTint().setDepth(boss?21:12);
    this.resizeMobBody(m,size,m.radius);m.s.setCollideWorldBounds(id!=='helicopter');
    this.hooks.seen(id);return m;
  }
  private resizeMobBody(m:Mob,size:number,radius:number){
    m.radius=radius;m.s.setDisplaySize(size,size);
    const source=m.s.frame.realWidth,bodyRadius=source*radius/size;
    m.s.body!.setCircle(bodyRadius,source/2-bodyRadius,source/2-bodyRadius);
  }
  summonBoss(id?:PersonId){
    const r=this.run!,W=this.worldWidth,H=this.worldHeight;
    if(r.won||this.activeBosses.length)return;
    // Clear the regular wave so the announced low-density Boss fight stays readable.
    for(const m of this.mobs)if(m.active&&!m.elite)this.releaseMob(m);
    for(const s of this.shots)if(s.active&&!s.weapon)this.releaseShot(s);
    this.hazards=this.hazards.filter(h=>h.weapon);
    r.bossActive=true;
    if(isFinalStage(r)){
      for(const [index,person] of bossesForStage(r).entries()){
        if(r.finalDefeated.includes(person))continue;
        const angle=index*Math.PI*2/PEOPLE.length;
        this.spawn(person,true,false,W/2+Math.cos(angle)*BALANCE.finalBossSpawnRadius,H/2+Math.sin(angle)*BALANCE.finalBossSpawnRadius);
      }
      this.boss=this.activeBosses[0];this.hooks.toast('第 7 关 · 八位 Boss 同时登场！全部击败才能成为梗王。');
    }else{
      id??=r.bosses[r.stage];r.bosses[r.stage]=id;
      this.boss=this.spawn(id,true,false,Phaser.Math.Clamp(this.player.x+360,100,W-100),Phaser.Math.Clamp(this.player.y-160,100,H-100));
      this.hooks.toast(`${enemy(id).name}登场！半血后狂暴，注意红色预警。`);
    }
    this.audio.play('boss');this.hooks.hud(r,this.boss);
  }
  private updateMobs(dt:number){
    for(const m of this.mobs){if(!m.active)continue;m.life+=dt;m.timer-=dt;m.slow=Math.max(0,m.slow-dt);m.stun=Math.max(0,m.stun-dt);m.dash=Math.max(0,m.dash-dt);
      m.dodge=Math.max(0,m.dodge-dt);m.dodgeCooldown=Math.max(0,m.dodgeCooldown-dt);
      if(m.id==='lecture-stone'){
        m.s.setVelocity(0).setAngle(0);
        if(m.timer<=0){m.timer=BALANCE.lectureStonePulseSeconds;m.hits++;this.combatLog.stonePulses=(this.combatLog.stonePulses||0)+1;
          this.hazards.push({kind:'pulse',x:m.s.x,y:m.s.y,x2:m.s.x,y2:m.s.y,radius:BALANCE.lectureStoneRadius,warn:0,life:0.32,damage:0,owner:m,fired:true,tick:0});
          if(distance(m.s.x,m.s.y,this.player.x,this.player.y)<=BALANCE.lectureStoneRadius+14)this.hurt(enemy('lecture-stone').damage*(1+this.run!.stage*0.12));
        }continue;
      }
      if(m.boss){
        this.updateBossState(m,dt);
        this.tryBossDodge(m);
        if(m.dodge>0){
          // A dodge owns movement and pauses native attack scheduling, including Nana's combo.
          m.timer+=dt;const blocked=(m.s.body as Phaser.Physics.Arcade.Body).blocked;
          if((blocked.left&&m.dodgeDx<0)||(blocked.right&&m.dodgeDx>0))m.dodgeDx=-m.dodgeDx;
          if((blocked.up&&m.dodgeDy<0)||(blocked.down&&m.dodgeDy>0))m.dodgeDy=-m.dodgeDy;
          m.s.setVelocity(m.dodgeDx*BALANCE.bossDodgeSpeed,m.dodgeDy*BALANCE.bossDodgeSpeed).setAlpha(0.48+Math.sin(m.life*36)*0.18);continue;
        }
      }
      m.s.setAlpha(1);
      const dx=this.player.x-m.s.x,dy=this.player.y-m.s.y,d=Math.max(1,Math.hypot(dx,dy));let speed=enemy(m.id).speed*(1+this.run!.stage*0.06)*(m.slow>0?0.5:1)*(m.boss?BALANCE.bossMoveSpeedScale*(m.variant?BALANCE.bossRageMoveSpeedScale:1):1);
      if(m.id==='keyboarder'&&d<280)speed=d<210?-speed:0;
      if(m.id==='kunkun'){const angle=Math.atan2(dy,dx)+Math.sin(m.life*4)*0.8;m.s.setVelocity(Math.cos(angle)*speed,Math.sin(angle)*speed);}
      else if(m.id==='helicopter'){if(m.life<3.5)m.s.setVelocity(m.dx*220,m.dy*220);else if(m.life<12)m.s.setVelocity(Math.sin(m.life*0.8)*20,Math.cos(m.life*0.8)*12);else m.s.setVelocity(m.dx*220,m.dy*220-60);if(m.life>15){this.releaseMob(m);continue;}}
      else m.s.setVelocity(dx/d*speed,dy/d*speed);
      if(m.dash>0){
        const rampaging=m.boss&&m.variant&&m.id==='xiangchanana';
        if(rampaging){
          const blocked=(m.s.body as Phaser.Physics.Arcade.Body).blocked;
          const bounceX=(blocked.left&&m.dx<0)||(blocked.right&&m.dx>0),bounceY=(blocked.up&&m.dy<0)||(blocked.down&&m.dy>0);
          if(bounceX)m.dx=-m.dx;if(bounceY)m.dy=-m.dy;
          if(bounceX||bounceY)this.combatLog.nanaWallBounces=(this.combatLog.nanaWallBounces||0)+1;
        }
        const dashSpeed=rampaging?BALANCE.nanaRampageDashSpeed:m.boss?(m.variant?BALANCE.bossRageDashSpeed:BALANCE.bossDashSpeed):480;
        m.s.setVelocity(m.dx*dashSpeed,m.dy*dashSpeed);
      }
      if(m.stun>0)m.s.setVelocity(0);
      m.s.setAngle(m.boss?Math.sin(m.life*2)*3:Math.sin(m.life*7+m.uid)*5);
      const nanaRampage=m.boss&&m.variant&&m.id==='xiangchanana';
      if(m.timer<=0){
        if(nanaRampage&&(m.rampageLeft>0||m.dash>0||this.pendingCharge(m)))m.timer=0.25;
        else {m.timer=nanaRampage?BALANCE.nanaRampageCycleSeconds:m.boss?(m.variant?BALANCE.bossRageAttackSeconds:BALANCE.bossAttackSeconds):m.elite?5.2:m.id==='helicopter'?1.1:m.id==='repeater'?8:4.5;this.ability(m);}
      }
      if(nanaRampage)this.updateRampage(m,dt);
      if(m.boss&&m.variant&&!nanaRampage){m.rushTimer-=dt;if(m.rushTimer<=0){
        // Let native multi-charge attacks finish before introducing a new trajectory.
        if(m.dash>0||this.hazards.some(h=>h.owner===m&&h.kind==='charge'&&!h.fired)){m.rushTimer=0.5;}
        else {m.rushTimer=BALANCE.bossRageRushSeconds;this.hazards.push({kind:'charge',x:m.s.x,y:m.s.y,x2:this.player.x,y2:this.player.y,radius:28,warn:1.0,life:0.5,damage:this.mobDamage(m),owner:m,fired:false,tick:0});const k=`${m.id}:快速追击`;this.abilityLog[k]=(this.abilityLog[k]||0)+1;}
      }}
    }
  }
  private bossVoice(m:Mob,event:VoiceEvent){
    if(!m.active||!m.boss||!this.run||!this.playing||this.paused)return;
    const run=this.run,uid=m.uid;
    void this.audio.cue(m.id,event,run.time,{encounter:uid,valid:()=>m.active&&m.boss&&m.uid===uid&&this.run===run&&this.playing,expiresAt:essentialVoice(event)?undefined:run.time+1.25});
  }
  private bossDeathVoice(id:PersonId,run:RunState,encounter:number){
    // The sprite can already be pooled; bind the farewell to this run and confirmed defeat.
    void this.audio.cue(id,'death',run.time,{encounter,allowWhilePaused:run.won,valid:()=>this.run===run&&run.defeated.includes(id)&&(run.won?this.pauseReason==='result':this.playing&&!this.paused)});
  }
  private updateBossState(m:Mob,dt:number){
    if(!m.variant&&m.hp<=m.maxHp*0.5){
      m.variant=true;m.rushTimer=0.35;m.timer=Math.min(m.timer,m.id==='xiangchanana'?0.1:BALANCE.bossRageAttackSeconds);m.dodgeCooldown=Math.max(m.dodgeCooldown,2.5);this.rageBarrage(m);
      const texture=enemy(m.id).phase2Image;if(texture&&this.textures.exists(texture))m.s.setTexture(texture);
      if(m.id==='xiangchanana')this.resizeMobBody(m,196,38);
      this.bossVoice(m,'phase2');
      this.hooks.toast(`${enemy(m.id).name}进入二阶段！${m.id==='jiangjieshi'?'讲解石开始出现，优先击碎声波源！':m.id==='xiangchanana'?'横冲直撞，注意每次冲撞的红色路线。':'环形弹幕与快速追击启动。'}`);
    }
    if(m.id==='jiangjieshi'&&m.variant){m.stoneTimer-=dt;if(m.stoneTimer<=0){m.stoneTimer=BALANCE.lectureStoneSpawnMinSeconds+this.rng()*(BALANCE.lectureStoneSpawnMaxSeconds-BALANCE.lectureStoneSpawnMinSeconds);this.releaseLectureStone(m);}}
    if(m.id==='zhangxuefeng'&&m.variant&&!m.nearDeathAnnounced&&m.hp>0&&m.hp<=m.maxHp*BALANCE.bossNearDeathHpRatio){m.nearDeathAnnounced=true;this.bossVoice(m,'nearDeath');}
    if(m.id==='xiangchanana'){m.voiceRandomTimer-=dt;if(m.voiceRandomTimer<=0){m.voiceRandomTimer=26+this.rng()*14;this.bossVoice(m,'random');}}
  }
  private tryBossDodge(m:Mob){
    const W=this.worldWidth,H=this.worldHeight;
    if(!m.boss||m.dodge>0||m.dodgeCooldown>0||m.dash>0||m.stun>0||m.rampageLeft>0||this.pendingCharge(m))return false;
    let threat:Shot|undefined;
    for(const shot of this.shots){
      if(!shot.active||!shot.weapon)continue;
      const dx=m.s.x-shot.x,dy=m.s.y-shot.y,v2=shot.vx*shot.vx+shot.vy*shot.vy;if(v2<1)continue;
      const t=(dx*shot.vx+dy*shot.vy)/v2;
      if(t>=0&&t<=0.4&&Math.hypot(dx-shot.vx*t,dy-shot.vy*t)<m.radius+shot.radius+22){threat=shot;break;}
    }
    if(!threat&&this.run!.time-m.lastHitAt>0.35)return false;
    const tx=threat?.vx??(m.s.x-this.player.x),ty=threat?.vy??(m.s.y-this.player.y),length=Math.max(1,Math.hypot(tx,ty));
    let nx=-ty/length,ny=tx/length;if(Math.hypot(nx,ny)<0.5){nx=1;ny=0;}
    const travel=BALANCE.bossDodgeSpeed*BALANCE.bossDodgeSeconds;
    const score=(sign:number)=>{const x=m.s.x+nx*travel*sign,y=m.s.y+ny*travel*sign;return Math.min(x-80,W-80-x,y-80,H-80-y)+distance(x,y,this.player.x,this.player.y)*0.08;};
    const sign=score(1)>=score(-1)?1:-1;
    m.dodgeDx=nx*sign;m.dodgeDy=ny*sign;m.dodge=BALANCE.bossDodgeSeconds;
    m.dodgeCooldown=m.variant?BALANCE.bossRageDodgeCooldownSeconds:BALANCE.bossDodgeCooldownSeconds;
    this.combatLog.bossDodges=(this.combatLog.bossDodges||0)+1;const key=`${m.id}:闪身`;this.abilityLog[key]=(this.abilityLog[key]||0)+1;
    this.float(m.s.x,m.s.y-65,'闪身 · 无敌','#238FB3');this.bossVoice(m,'dodge');return true;
  }
  private pendingCharge(m:Mob){return this.hazards.some(h=>h.owner===m&&h.kind==='charge'&&!h.fired);}
  private lectureStones(){return this.mobs.filter(m=>m.active&&m.id==='lecture-stone');}
  private clearLectureStones(){for(const m of this.lectureStones())this.releaseMob(m);this.audio.setStoneLoop(false);}
  private releaseLectureStone(owner:Mob){
    const W=this.worldWidth,H=this.worldHeight;
    if(!owner.active||!owner.boss||!owner.variant||owner.id!=='jiangjieshi'||this.lectureStones().length>=BALANCE.lectureStoneLimit)return;
    const angle=this.rng()*Math.PI*2,range=230+this.rng()*130;
    let x=Phaser.Math.Clamp(this.player.x+Math.cos(angle)*range,95,W-95),y=Phaser.Math.Clamp(this.player.y+Math.sin(angle)*range,95,H-95);
    // Keep a visible escape gap at the arena edge and avoid stacking sound sources.
    for(let attempt=0;attempt<12&&(distance(x,y,this.player.x,this.player.y)<BALANCE.lectureStoneRadius+40||this.lectureStones().some(m=>distance(x,y,m.s.x,m.s.y)<125));attempt++){
      const a=angle+(attempt+1)*Math.PI/6;x=Phaser.Math.Clamp(this.player.x+Math.cos(a)*range,95,W-95);y=Phaser.Math.Clamp(this.player.y+Math.sin(a)*range,95,H-95);
    }
    const stone=this.spawn('lecture-stone',false,false,x,y);if(!stone)return;stone.summonerUid=owner.uid;
    this.audio.setStoneLoop(true);this.float(x,y-60,'讲解石 · 可击碎','#666D87');
    this.combatLog.stonesSummoned=(this.combatLog.stonesSummoned||0)+1;
  }
  private updateRampage(m:Mob,dt:number){
    m.rampageTimer=Math.max(0,m.rampageTimer-dt);
    if(m.dash>0)m.rampageTimer=BALANCE.nanaRampageGapSeconds;
    if(m.rampageLeft>0&&m.rampageTimer<=0&&m.dash<=0&&m.stun<=0&&!this.pendingCharge(m)){
      const dx=this.player.x-m.s.x,dy=this.player.y-m.s.y,d=Math.hypot(dx,dy);
      const nx=d>1?dx/d:(m.dx||1),ny=d>1?dy/d:m.dy;
      const length=BALANCE.nanaRampageDashSpeed*BALANCE.nanaRampageDashSeconds;
      this.hazards.push({kind:'charge',x:m.s.x,y:m.s.y,x2:m.s.x+nx*length,y2:m.s.y+ny*length,radius:34,warn:BALANCE.nanaRampageWarnSeconds,life:BALANCE.nanaRampageDashSeconds,damage:this.mobDamage(m),owner:m,fired:false,tick:0});
      m.rampageLeft--;m.rampageTimer=BALANCE.nanaRampageGapSeconds;
      this.combatLog.nanaChargesQueued=(this.combatLog.nanaChargesQueued||0)+1;
    }
    // Hold the locked launch point still so each warning matches its charge path.
    if(this.pendingCharge(m))m.s.setVelocity(0);
    if(m.dash>0)m.s.setFlipX(m.dx<0);
  }
  private rageBarrage(m:Mob){
    this.hazards.push({kind:'ring',x:m.s.x,y:m.s.y,x2:m.s.x,y2:m.s.y,radius:90,warn:1.1,life:0.3,damage:this.mobDamage(m),owner:m,fired:false,tick:0});
    const k=`${m.id}:二阶段环形弹幕`;this.abilityLog[k]=(this.abilityLog[k]||0)+1;
  }
  private mobDamage(m:Mob){return enemy(m.id).damage*(m.boss?BALANCE.bossDamageScale*(m.variant?BALANCE.bossRageDamageScale:1):1);}
  private bossShotTexture(m:Mob){return !m.boss?'red-bullet':m.id==='zhangxuefeng'?'paper':m.id==='xiangchanana'?'tea-shot':'ball';}
  private ability(m:Mob){
    if(!m.active||this.paused)return;
    const x=m.s.x,y=m.s.y,px=this.player.x,py=this.player.y,cycle=m.cycle++;
    const log=(name:string)=>{const k=`${m.id}:${name}`;this.abilityLog[k]=(this.abilityLog[k]||0)+1;};
    const warning=(kind:Hazard['kind'],radius=90,warn=1,life=0.45,x1=x,y1=y,x2=px,y2=py)=>this.hazards.push({kind,x:x1,y:y1,x2,y2,radius:kind==='circle'&&m.boss&&m.variant?radius*1.15:radius,warn,life,damage:this.mobDamage(m),owner:m,fired:false,tick:0});
    if(m.id==='crowd'||m.id==='building'||m.id==='lecture-stone')return;
    if(m.id==='keyboarder'){this.enemyFan(x,y,px,py,1,false,190,'red-bullet');log('按键');return;}
    if(m.id==='lemon'){warning('acid',60,0,3.2);log('酸液');return;}
    if(m.id==='repeater'){for(let i=0;i<2;i++)this.spawn('crowd',false,false,x+this.rng()*70-35,y+this.rng()*70-35);log('复读召唤');return;}
    if(m.id==='ghost'){warning('charge',22,0.85,0.6);log('冲刺');return;}
    if(m.id==='helicopter'){this.enemyFan(x,y,px,py,3,false,250,'red-bullet');log('扫射');return;}
    if(!m.boss){warning(['mabaoguo','lebang','xiangchanana'].includes(m.id)?'charge':'fan',60,1,0.65);log('精英攻击');return;}
    switch(m.id){
      case 'zhangxuefeng': if(cycle%3===2){warning('wall',60,1.1,5,px-125,py+90,px+125,py+90);log('志愿表墙');}else{warning('fan',80,0.9,0.3);log('试卷弹幕');}break;
      case 'xujiayin': if(cycle%2===0){m.shield=300;warning('wall',70,1.1,5,x-110,y+110,x+110,y+110);log('楼盘护盾');}else{warning('line',45,1.1,0.55,x-400,y-100,x+400,y+100);log('塔吊横扫');}break;
      case 'mabaoguo': if(cycle%3===0){warning('charge',30,1.3,0.6);log('蓄力冲拳');}else if(cycle%3===1){for(let i=0;i<3;i++)warning('charge',26,1+i*0.7,0.5,x,y,px+(i-1)*100,py+(1-i)*80);log('三段突进');}else{const a=Math.atan2(py-y,px-x);for(let i=-2;i<=2;i++)warning('whip',21,1.1+Math.abs(i)*0.14,0.5,x,y,x+Math.cos(a+i*0.35)*520,y+Math.sin(a+i*0.35)*520);log('闪电五连鞭');}break;
      case 'kunkun': for(let i=0;i<3;i++)warning('fan',80,1+i*0.25,0.3);log('节拍扇形');break;
      case 'lebang': if(cycle%3===0){warning('charge',38,1,0.7);log('持球冲锋');}else{warning('circle',cycle%3===1?105:170,1.15,0.55,px,py);log(cycle%3===1?'追身盖帽':'扣篮冲击波');}break;
      case 'xiangchanana': if(m.variant){m.rampageLeft=BALANCE.nanaRampageCharges;m.rampageTimer=0;log('横冲直撞');}else if(cycle%2===0){warning('fan',80,1,0.3);log('茶香弹幕');}else{warning('circle',125,1.1,0.55,px,py);log('泼茶');}break;
      case 'laoda': if(cycle%4===0){warning('fan',80,0.9,0.3);log('投篮');}else if(cycle%4===1){warning('charge',32,1,0.6);log('突进');}else if(cycle%4===2){warning('circle',150,1.15,0.6,px,py);log('扣篮');}else{warning('helicopter',45,1.5,0.5,px-400,py-160,px+400,py-160);log('牢大直升机');}break;
      case 'jiangjieshi': warning('fan',80,0.95,0.3);log('讲解弹幕');break;
    }
    if(m.variant&&cycle%2===1)this.rageBarrage(m);
  }
  private enemyFan(x:number,y:number,tx:number,ty:number,count:number,basketball:boolean,speed=220,texture='red-bullet',damage=10+this.run!.stage*2){
    const angle=Math.atan2(ty-y,tx-x);
    for(let i=0;i<count;i++){const a=angle+(i-(count-1)/2)*0.2;this.addShot(x,y,Math.cos(a)*speed,Math.sin(a)*speed,texture,undefined,damage,4,8,0,0,basketball);}
  }
  private nearest(x:number,y:number,exclude=-1){let best:Mob|undefined,d=Infinity;for(const m of this.mobs){if(!m.active||m.uid===exclude)continue;const dd=distance(x,y,m.s.x,m.s.y);if(dd<d){d=dd;best=m;}}return best;}
  private attack(dt:number){
    const r=this.run!,s=stats(r),nearStone=this.lectureStones().filter(m=>distance(this.player.x,this.player.y,m.s.x,m.s.y)<BALANCE.lectureStoneRadius+120).sort((a,b)=>distance(this.player.x,this.player.y,a.s.x,a.s.y)-distance(this.player.x,this.player.y,b.s.x,b.s.y))[0],target=nearStone||(this.boss?.active&&distance(this.player.x,this.player.y,this.boss.s.x,this.boss.s.y)<620&&Math.floor(r.time*2)%2===0?this.boss:this.nearest(this.player.x,this.player.y));
    for(const [key,level] of Object.entries(r.weapons)){
      const wid=key as WeaponId,lv=level!;this.cooldown[wid]=(this.cooldown[wid]||0)-dt;if(this.cooldown[wid]!>0||!target)continue;
      this.cooldown[wid]=weaponCooldown(wid,lv,r);const damage=weaponBaseDamage(wid,lv);
      const angle=Math.atan2(target.s.y-this.player.y,target.s.x-this.player.x),x=this.player.x,y=this.player.y;
      if(wid==='ice-soda-storm'){this.areaDamage(x,y,155*s.area,wid,damage,1.1);this.hazards.push({kind:'pulse',x,y,x2:x,y2:y,radius:155*s.area,warn:0,life:0.28,damage:0,weapon:wid,fired:true,tick:0});continue;}
      const count=wid==='keyboard'?1+Math.floor(lv/2):wid==='sprite-soda'?3+Math.floor(lv/2):wid==='keys'&&lv>=4?2:1;
      for(let i=0;i<count;i++){
        const a=angle+(i-(count-1)/2)*(wid==='sprite-soda'?0.16:0.08),speed=wid==='icecream'?330:wid==='sprite-soda'?440:wid==='slipper'||wid==='crown-basketball'?410:540;
        const texture=wid==='keyboard'?'key-shot':wid==='hoop'?'ball':wid;
        this.addShot(x,y,Math.cos(a)*speed,Math.sin(a)*speed,texture,wid,damage,wid==='icecream'?0.7:wid==='sprite-soda'?0.6:wid==='slipper'||wid==='crown-basketball'?2:1.8,(wid.includes('basketball')||wid==='hoop'?13:10)*s.area,wid==='keys'?6:wid==='slipper'||wid==='crown-basketball'?20:0,wid==='hoop'||wid==='rhythm-basketball'?2+Math.floor(lv/2):0,false);
      }
      this.audio.play('shot');
    }
  }
  private addShot(x:number,y:number,vx:number,vy:number,texture:string,wid:WeaponId|undefined,damage:number,ttl:number,radius:number,pierce:number,bounces:number,basketball:boolean){
    if(this.shots.filter(s=>s.active).length>=MAX_SHOTS)return;
    let s=this.shots.find(s=>!s.active);if(!s){s={s:this.add.image(x,y,'fallback'),hits:new Map()} as Shot;this.shots.push(s);}
    Object.assign(s,{active:true,x,y,vx,vy,age:0,ttl,weapon:wid,damage,radius,pierce,bounces,returning:false,basketball});s.hits.clear();
    s.s.setTexture(this.textures.exists(texture)?texture:'fallback').setPosition(x,y).setVisible(true).setActive(true).setAlpha(1).setAngle(0).setDisplaySize(wid==='slipper'||wid==='crown-basketball'?38:wid?28:basketball?25:23, wid==='slipper'||wid==='crown-basketball'?38:wid?28:basketball?25:23).setDepth(wid?25:35);
    return s;
  }
  private updateShots(dt:number){
    const W=this.worldWidth,H=this.worldHeight;
    for(const s of this.shots){if(!s.active)continue;s.age+=dt;
      if(s.age>s.ttl){if(s.weapon==='icecream')this.iceZone(s.x,s.y,s.damage);this.releaseShot(s);continue;}
      if((s.weapon==='slipper'||s.weapon==='crown-basketball')&&s.age>0.72){s.returning=true;const dx=this.player.x-s.x,dy=this.player.y-s.y,d=Math.max(1,Math.hypot(dx,dy));s.vx=dx/d*460;s.vy=dy/d*460;if(d<18){this.releaseShot(s);continue;}}
      s.x+=s.vx*dt;s.y+=s.vy*dt;
      if(s.x<35||s.x>W-35||s.y<35||s.y>H-35){if(s.bounces>0){if(s.x<35||s.x>W-35)s.vx*=-1;if(s.y<35||s.y>H-35)s.vy*=-1;s.bounces--;s.x=Phaser.Math.Clamp(s.x,36,W-36);s.y=Phaser.Math.Clamp(s.y,36,H-36);}else{this.releaseShot(s);continue;}}
      s.s.setPosition(s.x,s.y);if(s.weapon&&s.weapon!=='keyboard')s.s.rotation+=dt*7;
      if(!s.weapon){
        const d=distance(s.x,s.y,this.player.x,this.player.y);
        if(s.basketball&&this.run!.weapons.hoop&&d<58*stats(this.run!).area){s.weapon='hoop';s.damage=weaponBaseDamage('hoop',this.run!.weapons.hoop);s.vx*=-1.2;s.vy*=-1.2;s.pierce=1;s.ttl=s.age+2;s.s.setTint(0x59cf91);this.combatLog.reflections=(this.combatLog.reflections||0)+1;this.float(this.player.x,this.player.y-40,'反射','#59CF91');continue;}
        if(d<s.radius+14){this.hurt(s.damage);this.releaseShot(s);}continue;
      }
      for(const m of this.near(s.x,s.y,s.radius+50)){
        const phase=s.returning?2:1;if(m.dodge>0||s.hits.get(m.uid)===phase||distance(s.x,s.y,m.s.x,m.s.y)>s.radius+m.radius)continue;
        s.hits.set(m.uid,phase);this.hit(m,s.weapon,s.damage);
        if(s.weapon==='keyboard'){this.releaseShot(s);break;}
        if(s.weapon==='crown-basketball'&&phase===2){m.shield=Math.max(0,m.shield-180);this.combatLog.crownReturns=(this.combatLog.crownReturns||0)+1;}
        if(s.weapon==='rhythm-basketball'){m.hits++;if(m.hits%3===0){this.combatLog.rhythmWaves=(this.combatLog.rhythmWaves||0)+1;this.areaDamage(s.x,s.y,100*stats(this.run!).area,s.weapon,s.damage*0.8,0);this.hazards.push({kind:'pulse',x:s.x,y:s.y,x2:s.x,y2:s.y,radius:100,warn:0,life:0.25,damage:0,weapon:s.weapon,fired:true,tick:0});}}
        if(s.weapon==='icecream'){this.iceZone(s.x,s.y,s.damage);this.releaseShot(s);break;}
        if(s.bounces>0){this.combatLog.bounces=(this.combatLog.bounces||0)+1;s.bounces--;const next=this.nearest(s.x,s.y,m.uid);if(next){const d=Math.max(1,distance(s.x,s.y,next.s.x,next.s.y));s.vx=(next.s.x-s.x)/d*440;s.vy=(next.s.y-s.y)/d*440;}else{s.vx*=-1;s.vy*=-1;}break;}
        if(s.pierce--<=0){this.releaseShot(s);break;}
      }
    }
  }
  private iceZone(x:number,y:number,damage:number){this.combatLog.icePools=(this.combatLog.icePools||0)+1;this.hazards.push({kind:'ice',x,y,x2:x,y2:y,radius:78*stats(this.run!).area,warn:0,life:2.5,damage:damage*0.4,weapon:'icecream',fired:true,tick:0});}
  private updateHazards(dt:number){
    const W=this.worldWidth,H=this.worldHeight;
    for(const h of this.hazards){
      if(h.owner&&!h.owner.active){h.life=0;continue;}
      if(!h.fired){if(h.kind==='ring'&&h.owner){h.x=h.owner.s.x;h.y=h.owner.s.y;}h.warn-=dt;if(h.warn>0)continue;h.fired=true;
        if(h.kind==='fan'){const m=h.owner!;const count=m.boss?(m.variant?BALANCE.bossRageFanShots:BALANCE.bossFanShots):7;const speed=(m.id==='kunkun'?250:210)*(m.boss?BALANCE.bossProjectileSpeedScale:1);this.enemyFan(m.s.x,m.s.y,h.x2,h.y2,count,['laoda','kunkun'].includes(m.id),speed,this.bossShotTexture(m),m.boss?this.mobDamage(m):10+this.run!.stage*2);this.bossVoice(m,'barrage');}
        if(h.kind==='ring'){const m=h.owner!,basketball=['laoda','kunkun','lebang'].includes(m.id),angle=Math.atan2(this.player.y-m.s.y,this.player.x-m.s.x)+Math.PI/BALANCE.bossRageRingShots;
          const speed=230*BALANCE.bossProjectileSpeedScale;
          for(let i=0;i<BALANCE.bossRageRingShots;i++){const a=angle+i*Math.PI*2/BALANCE.bossRageRingShots;this.addShot(m.s.x,m.s.y,Math.cos(a)*speed,Math.sin(a)*speed,this.bossShotTexture(m),undefined,this.mobDamage(m),4,8,0,0,basketball);}
          this.combatLog.ringBullets=(this.combatLog.ringBullets||0)+BALANCE.bossRageRingShots;
          this.bossVoice(m,'barrage');
        }
        if(h.kind==='charge'){const m=h.owner!;const d=Math.max(1,distance(m.s.x,m.s.y,h.x2,h.y2));m.dx=(h.x2-m.s.x)/d;m.dy=(h.y2-m.s.y)/d;m.dash=h.life;if(m.boss){this.bossVoice(m,'rapidMove');this.combatLog.bossRapidMoves=(this.combatLog.bossRapidMoves||0)+1;}}
        if(h.kind==='helicopter'){const plane=this.spawn('helicopter',false,false,Phaser.Math.Clamp(h.x,80,W-80),Phaser.Math.Clamp(h.y,80,H-80));if(plane){plane.summonerUid=h.owner?.uid;const d=Math.max(1,distance(h.x,h.y,h.x2,h.y2));plane.dx=(h.x2-h.x)/d;plane.dy=(h.y2-h.y)/d;plane.s.setFlipX(plane.dx>0);}}
        if(h.kind==='wall')for(let i=0;i<5;i++){const building=this.spawn('building',false,false,h.x+(h.x2-h.x)*i/4,h.y+(h.y2-h.y)*i/4);if(building)building.summonerUid=h.owner?.uid;}
      }
      h.life-=dt;h.tick-=dt;
      if(h.kind==='ice'){if(h.tick<=0){h.tick=0.35;this.areaDamage(h.x,h.y,h.radius,'icecream',h.damage,0.65);}continue;}
      if(h.kind==='circle'||h.kind==='acid'){if(distance(h.x,h.y,this.player.x,this.player.y)<h.radius+12)this.hurt(h.damage*(h.kind==='acid'?0.5:1));}
      if(h.kind==='line'||h.kind==='whip'){if(this.lineDistance(this.player.x,this.player.y,h.x,h.y,h.x2,h.y2)<h.radius+12)this.hurt(h.damage);}
    }
    this.hazards=this.hazards.filter(h=>h.life>0||!h.fired);
  }
  private lineDistance(px:number,py:number,x:number,y:number,x2:number,y2:number){const vx=x2-x,vy=y2-y,d=vx*vx+vy*vy;const t=d===0?0:Phaser.Math.Clamp(((px-x)*vx+(py-y)*vy)/d,0,1);return distance(px,py,x+vx*t,y+vy*t);}
  private rebuildGrid(){this.grid.clear();for(const m of this.mobs){if(!m.active)continue;const key=`${Math.floor(m.s.x/128)},${Math.floor(m.s.y/128)}`;const list=this.grid.get(key);if(list)list.push(m);else this.grid.set(key,[m]);}}
  private near(x:number,y:number,radius:number){const found:Mob[]=[];for(let cx=Math.floor((x-radius)/128);cx<=Math.floor((x+radius)/128);cx++)for(let cy=Math.floor((y-radius)/128);cy<=Math.floor((y+radius)/128);cy++)for(const m of this.grid.get(`${cx},${cy}`)||[])if(m.active)found.push(m);return found;}
  private areaDamage(x:number,y:number,radius:number,wid:WeaponId,damage:number,slow:number){for(const m of this.near(x,y,radius+50))if(distance(x,y,m.s.x,m.s.y)<radius+m.radius&&m.dodge<=0){this.hit(m,wid,damage);m.slow=Math.max(m.slow,slow);}}
  hit(m:Mob,wid:WeaponId,base:number){
    const W=this.worldWidth,H=this.worldHeight;
    if(!m.active||m.dodge>0)return;
    const critical=this.rng()<stats(this.run!).crit,{damage,counter}=damageAmount(base,wid,m.id,this.run!,critical,m.shield);
    const dealt=Math.min(m.hp,damage);m.hp-=damage;m.shield=Math.max(0,m.shield-(wid==='keys'?damage*1.8:damage));
    const r=this.run!;r.weaponDamage[wid]=(r.weaponDamage[wid]||0)+dealt;if(counter)r.counters++;
    if(wid==='icecream'||wid==='ice-soda-storm')m.slow=Math.max(m.slow,0.8);
    if(m.id!=='lecture-stone'&&(wid==='sprite-soda'||wid==='ice-soda-storm')&&(!m.boss||r.time-m.knockbackAt>=0.2)){m.knockbackAt=r.time;const d=Math.max(1,distance(this.player.x,this.player.y,m.s.x,m.s.y));const push=m.boss?3:13;m.s.setPosition(Phaser.Math.Clamp(m.s.x+(m.s.x-this.player.x)/d*push,40,W-40),Phaser.Math.Clamp(m.s.y+(m.s.y-this.player.y)/d*push,40,H-40));(m.s.body as Phaser.Physics.Arcade.Body).reset(m.s.x,m.s.y);}
    if(wid==='slipper'&&r.time-m.interruptAt>2.5){const pending=this.hazards.filter(h=>h.owner===m&&!h.fired&&h.kind==='charge');if(pending.length){this.combatLog.interrupts=(this.combatLog.interrupts||0)+1;this.hazards=this.hazards.filter(h=>!pending.includes(h));m.stun=0.55;m.interruptAt=r.time;this.float(m.s.x,m.s.y-40,'打断！','#E65363');}}
    if(this.hitLabelTimer<=0){this.hitLabelTimer=0.12;this.float(m.s.x,m.s.y-25,counter?'克制 ×1.75':critical?'暴击！':`${Math.round(damage)}`,counter?'#28794F':critical?'#E65363':'#20283F');}
    this.audio.play('hit');if(dealt>0){m.lastHitAt=r.time;this.bossVoice(m,'hit');}if(m.hp<=0)this.kill(m);
  }
  private kill(m:Mob){
    if(!m.active)return;
    const r=this.run!;r.kills++;this.drop(m.s.x,m.s.y,m.elite?30+r.stage*10:enemy(m.id).xp);
    if(shouldDropHealthPack(m,this.rng))this.dropHealthPack(m.s.x,m.s.y);
    if(m.id==='helicopter')this.combatLog.helicoptersDestroyed=(this.combatLog.helicoptersDestroyed||0)+1;
    if(m.id==='lecture-stone')this.combatLog.stonesDestroyed=(this.combatLog.stonesDestroyed||0)+1;
    if(this.bursts.length<12)this.bursts.push({x:m.s.x,y:m.s.y,age:0,color:Phaser.Display.Color.HexStringToColor(enemy(m.id).color).color,smoke:m.id==='helicopter'});
    this.float(m.s.x,m.s.y-25,m.boss?'退场！':'啪！',m.boss?'#E65363':'#20283F');this.releaseMob(m);
    if(m.boss){
      const finalBattle=isFinalStage(r),id=m.id as PersonId,encounter=m.uid;
      if(finalBattle)this.audio.cancelBossVoices(id);else this.audio.cancelVoices();
      if(!defeatBoss(r,id))return;
      this.boss=this.activeBosses[0];this.hooks.bossDefeated(id);
      if(finalBattle&&!r.won){
        // A partial finale kill must leave the other seven bosses' battle intact.
        for(const extra of this.mobs)if(extra.active&&extra.summonerUid===m.uid)this.releaseMob(extra);
        this.hooks.toast(`${enemy(id).name}退场 · 终局剩余 ${PEOPLE.length-r.finalDefeated.length} 位 Boss`);
        this.hooks.hud(r,this.boss);this.bossDeathVoice(id,r,encounter);return;
      }
      for(const extra of this.mobs)if(extra.active&&['building','helicopter','lecture-stone'].includes(extra.id))this.releaseMob(extra);
      for(const s of this.shots)if(s.active&&!s.weapon)this.releaseShot(s);
      this.hazards=this.hazards.filter(h=>h.weapon);this.invulnerable=1.5;
      if(r.won){this.finish(true);this.bossDeathVoice(id,r,encounter);return;}
      if(isFinalStage(r)){
        for(const extra of this.mobs)if(extra.active)this.releaseMob(extra);
        for(const shot of this.shots)if(shot.active)this.releaseShot(shot);
        this.hazards=[];this.configureArena();
        this.player.body!.reset(this.worldWidth/2,this.worldHeight/2);this.player.setVelocity(0);
        this.cameras.main.centerOn(this.worldWidth/2,this.worldHeight/2);this.decorateStage();this.summonBoss();
      }else {this.decorateStage();this.hooks.toast(`进入第 ${r.stage+1} 阶段 · 恢复 35 生命`);}
      this.bossDeathVoice(id,r,encounter);
    }
  }
  hurt(amount:number){if(this.invulnerable>0||this.dashTime>0||this.qaImmortal||this.paused||!this.playing)return;this.run!.hp-=amount;this.invulnerable=BALANCE.contactInvulnerability;this.audio.play('hurt');if(this.shake)this.cameras.main.shake(90,0.0025);}
  private dropHealthPack(x:number,y:number){
    let pack=this.healthPacks.find(p=>!p.active);
    if(!pack){if(this.healthPacks.length>=BALANCE.healthPackLimit)return;pack={active:false,s:this.add.image(x,y,'health-pack')};this.healthPacks.push(pack);}
    pack.active=true;pack.s.setTexture('health-pack').setPosition(x,y).setVisible(true).setAlpha(1).setAngle(0).setDisplaySize(38,38).setDepth(8);
    this.combatLog.healthPacksDropped=(this.combatLog.healthPacksDropped||0)+1;
  }
  private updateHealthPacks(){
    const r=this.run!;if(!this.playing||this.paused||r.hp<=0)return;
    for(const pack of this.healthPacks){
      if(!pack.active)continue;
      if(distance(this.player.x,this.player.y,pack.s.x,pack.s.y)>=BALANCE.healthPackPickupRadius)continue;
      const healed=collectHealthPack(r);if(healed<=0)continue;
      pack.active=false;pack.s.setVisible(false);this.hudTimer=0;
      this.combatLog.healthPacksPicked=(this.combatLog.healthPacksPicked||0)+1;this.combatLog.healthPackHealing=(this.combatLog.healthPackHealing||0)+healed;
      this.float(this.player.x,this.player.y-45,`回血 +${Math.round(healed)}`,'#28794F');
    }
  }
  private drop(x:number,y:number,value:number){
    const close=this.drops.find(d=>d.active&&distance(x,y,d.s.x,d.s.y)<65);if(close){close.value+=value;close.s.setScale(Math.min(0.35,0.16+Math.log2(close.value)*0.013));return;}
    let d=this.drops.find(d=>!d.active);if(!d){if(this.drops.length>=160){const target=this.drops.find(d=>d.active)!;target.value+=value;return;}d={s:this.add.image(x,y,'xp'),active:false,value:0};this.drops.push(d);}
    d.active=true;d.value=value;d.s.setPosition(x,y).setVisible(true).setDisplaySize(18,18).setDepth(5);
  }
  private updateDrops(dt:number){
    const r=this.run!,magnet=stats(r).magnet;
    for(const d of this.drops){if(!d.active)continue;const x=this.player.x-d.s.x,y=this.player.y-d.s.y,dist=Math.max(1,Math.hypot(x,y));
      if(dist<magnet+20){d.s.x+=x/dist*420*dt;d.s.y+=y/dist*420*dt;}
      if(dist<23){r.xp+=d.value;d.active=false;d.s.setVisible(false);}
    }
    if(r.bossActive||!this.playing||r.hp<=0||this.audio.deathVoiceBusy)return;
    if(this.pendingLevels===0&&takeLevel(r,this.lastUpgradeAt))this.pendingLevels=1;
    if(this.pendingLevels>0&&!this.paused){if(this.qaAutoUpgrade){const options=upgradeChoices(r,this.rng);const chosen=options.find(o=>o.kind==='weapon'&&o.id==='keyboard')||options.find(o=>o.kind==='passive'&&['power','haste','vitality','regen'].includes(o.id))||(this.qaKeyboardOnly?(options.find(o=>o.kind==='passive'||o.kind==='heal'||o.kind==='skip')||options[0]):options[0]);if(applyUpgrade(r,chosen)){this.pendingLevels--;this.lastUpgradeAt=r.waveTime;}}
      else {this.setPaused(true,'upgrade');this.audio.unlock();this.audio.play('level');this.hooks.upgrade(upgradeChoices(r,this.rng));}}
  }
  choose(option:UpgradeDefinition){if(!this.run||this.run.bossActive||this.pauseReason!=='upgrade'||!applyUpgrade(this.run,option))return false;this.pendingLevels=Math.max(0,this.pendingLevels-1);this.lastUpgradeAt=this.run.waveTime;this.setPaused(false);return true;}
  reroll(){if(this.run&&this.run.rerolls>0&&this.pauseReason==='upgrade'){this.run.rerolls--;this.hooks.upgrade(upgradeChoices(this.run,this.rng));}}
  private releaseMob(m:Mob){m.active=false;m.s.disableBody(true,true);this.hazards=this.hazards.filter(h=>h.owner!==m);if(m.id==='lecture-stone')this.audio.setStoneLoop(this.playing&&this.lectureStones().length>0);}
  private releaseShot(s:Shot){s.active=false;s.s.setVisible(false).setActive(false).clearTint();}
  private float(x:number,y:number,text:string,color:string){if(this.labels.length>24)return;const label=this.add.text(x,y,text,{fontFamily:'Microsoft YaHei',fontSize:'17px',fontStyle:'bold',color,stroke:'#F5F7FB',strokeThickness:3}).setOrigin(0.5).setDepth(60);this.labels.push({s:label,ttl:0.9});}
  private drawEffects(){
    const g=this.fx;g.clear();
    for(const b of this.bursts){const t=b.age/0.4;for(let i=0;i<6;i++){const angle=i*Math.PI/3,radius=12+t*38;g.fillStyle(b.smoke?0xf5f7fb:b.color,1-t);const x=b.x+Math.cos(angle)*radius,y=b.y+Math.sin(angle)*radius;if(b.smoke)g.fillCircle(x,y,14*(1-t));else g.fillRect(x,y,5,5);}g.lineStyle(2,b.color,1-t).strokeCircle(b.x,b.y,10+t*30);}
    if(this.run!.weapons.hoop)g.lineStyle(4,0xf49a45,0.9).strokeEllipse(this.player.x,this.player.y,98*stats(this.run!).area,66*stats(this.run!).area);
    if(this.dashInvulnerability>0)g.lineStyle(4,0x238fb3,0.85).strokeCircle(this.player.x,this.player.y,32);
    if(this.dashTime>0){const trail=Math.min(100,this.dashSpeed*0.1);g.lineStyle(12,0x74cde8,0.35).lineBetween(this.player.x-this.dashDirection.x*trail,this.player.y-this.dashDirection.y*trail,this.player.x,this.player.y);}
    for(const m of this.mobs)if(m.active&&m.dodge>0){g.lineStyle(5,0x238fb3,0.85).strokeCircle(m.s.x,m.s.y,m.radius+18);g.lineStyle(14,0x74cde8,0.3).lineBetween(m.s.x-m.dodgeDx*65,m.s.y-m.dodgeDy*65,m.s.x,m.s.y);}
    for(const m of this.lectureStones()){
      const ready=m.life>=BALANCE.lectureStoneWarnSeconds,progress=1-Math.min(1,m.timer/(ready?BALANCE.lectureStonePulseSeconds:BALANCE.lectureStoneWarnSeconds));
      g.fillStyle(0x8a91a5,0.055).fillCircle(m.s.x,m.s.y,BALANCE.lectureStoneRadius);g.lineStyle(2,0x8a91a5,0.65).strokeCircle(m.s.x,m.s.y,BALANCE.lectureStoneRadius);
      g.lineStyle(3,ready?0xe65363:0x8a91a5,0.35+progress*0.5).strokeCircle(m.s.x,m.s.y,30+progress*(BALANCE.lectureStoneRadius-30));
    }
    for(const m of this.mobs){if(!m.active||(!m.boss&&!m.elite&&m.id!=='lecture-stone'))continue;const width=m.boss?84:49,barY=m.s.y+m.s.displayHeight/2-(m.boss?3:1);g.fillStyle(0x20283f).fillRoundedRect(m.s.x-width/2,barY,width,6,3);g.fillStyle(m.shield>0?0xf4cd67:0xe65363).fillRoundedRect(m.s.x-width/2+1,barY+1,(width-2)*Math.max(0,m.hp/m.maxHp),4,2);if(m.shield>0)g.lineStyle(3,0xf4cd67,0.7).strokeCircle(m.s.x,m.s.y,m.radius+10);}
    for(const h of this.hazards){
      const friendly=!!h.weapon,color=friendly?0x74cde8:0xe65363,alpha=h.fired?0.24:0.14+Math.sin(this.run!.time*12)*0.05;
      if(['circle','acid','ice','pulse','fan','ring'].includes(h.kind)){
        g.fillStyle(color,alpha).fillCircle(h.x,h.y,h.radius);g.lineStyle(h.fired?3:4,color,h.fired?0.65:0.95).strokeCircle(h.x,h.y,h.radius);
        if(!h.fired){g.lineStyle(2,color,0.7).lineBetween(h.x-12,h.y-12,h.x+12,h.y+12).lineBetween(h.x-12,h.y+12,h.x+12,h.y-12);}
      }else{
        g.lineStyle(h.radius*2,color,alpha).lineBetween(h.x,h.y,h.x2,h.y2);g.lineStyle(h.fired?4:3,color,0.95).lineBetween(h.x,h.y,h.x2,h.y2);g.fillStyle(color,0.9).fillCircle(h.x2,h.y2,7);
      }
    }
    // Player outline remains above the busiest effects and danger telegraphs.
    g.lineStyle(2,0x20283f,0.6).strokeCircle(this.player.x,this.player.y,19);
  }
  private finish(won:boolean){if(!this.playing)return;this.run!.won=won;this.playing=false;this.clearLectureStones();this.setPaused(true,'result');this.input.keyboard!.enabled=false;this.audio.unlock();this.audio.play(won?'win':'hurt');this.hooks.end(this.run!);}
  snapshot(){return {ready:this.ready,playing:this.playing,paused:this.paused,reason:this.pauseReason,run:this.run?JSON.parse(JSON.stringify(this.run)):null,arena:{width:this.worldWidth,height:this.worldHeight},bosses:this.activeBosses.map(m=>({id:m.id,hp:m.hp,maxHp:m.maxHp,phase:m.variant?2:1,dodging:m.dodge>0})),enemies:this.mobs.filter(m=>m.active).length,shots:this.shots.filter(s=>s.active).length,drops:this.drops.filter(d=>d.active).length,enemyTypes:[...new Set(this.mobs.filter(m=>m.active).map(m=>m.id))],boss:this.boss?.active?{id:this.boss.id,hp:this.boss.hp,maxHp:this.boss.maxHp,shield:this.boss.shield,phase:this.boss.variant?2:1,speed:this.boss.s.body!.velocity.length(),rapid:this.boss.dash>0,dodging:this.boss.dodge>0,dodgeRemaining:this.boss.dodge,dodgeCooldown:this.boss.dodgeCooldown}:null,position:{x:this.player?.x,y:this.player?.y},missingAssets:this.missingAssets,abilities:this.abilityLog,combat:this.combatLog,voices:this.audio.playedCues,hazards:this.hazards.length};}
  get activeBosses(){return this.mobs.filter(m=>m.active&&m.boss);}
  get worldWidth(){return arenaSize(this.run).width;}
  get worldHeight(){return arenaSize(this.run).height;}
  get dashRemaining(){return this.dashCooldown;}
  get dashInvincible(){return this.dashInvulnerability>0;}
  get playerDash(){return {active:this.dashTime>0,remaining:this.dashTime,cooldown:this.dashCooldown,speed:this.dashSpeed,direction:{...this.dashDirection},distanceRemaining:this.dashDistanceRemaining,invulnerability:this.dashInvulnerability};}
  get upgradeRemaining(){return this.run?Math.max(0,upgradeInterval(this.run)-(this.run.waveTime-this.lastUpgradeAt)):0;}
  qaAdvance(seconds:number){for(let i=0;i<Math.ceil(seconds*60);i++){if(this.paused||!this.playing)break;this.step(1/60);}return this.snapshot();}
  qaStress(){const W=this.worldWidth,H=this.worldHeight;for(const m of this.mobs)this.releaseMob(m);for(const s of this.shots)this.releaseShot(s);this.hazards=[];this.run!.weapons={};this.spawnTimer=999;this.eliteTimer=999;for(let i=0;i<250;i++)this.spawn('crowd',false,false,W/2+(i%25-12)*40,H/2+(Math.floor(i/25)-5)*45);for(let i=0;i<400;i++){const a=i/400*Math.PI*2;this.addShot(W/2+Math.cos(a)*480,H/2+Math.sin(a)*480,-Math.sin(a)*80,Math.cos(a)*80,'paper',i<200?'keyboard':undefined,0,600,4,100000,0,false);}return this.snapshot();}
}
