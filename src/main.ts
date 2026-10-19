import Phaser from 'phaser';
import './style.css';
import { BALANCE } from './balance';
import { ArenaScene } from './scene';
import { icon, portrait } from './assets';
import { PEOPLE, COMMON, PASSIVES, WEAPONS, enemy, weapon, stats, readSave, writeSave, recordRun, unlockBoss, defaultSave, upgradeChoices, healingUpgradesAllowed, isFinalStage, totalStages, totalBossEncounters, rng, clockText, type RunState, type WeaponId, type UpgradeDefinition, type EnemyId } from './core';

const ui=document.getElementById('ui')!,toastNode=document.getElementById('toast')!;
const scene=new ArenaScene();
let save=(()=>{try{return readSave(localStorage);}catch{return defaultSave();}})(),starter:WeaponId='keyboard',view:'menu'|'game'|'result'='menu';
let modal='',ready=false,options:UpgradeDefinition[]=[],toastTimer=0,lastEquipment='',sessionUnlocks:WeaponId[]=[];
let storageWarning=false;
function persist(){let ok=false;try{ok=writeSave(save,localStorage);}catch{}if(!ok&&!storageWarning){storageWarning=true;toast('浏览器无法保存记录，本次仍可正常游玩。');}}
function toast(message:string){toastNode.textContent=message;toastNode.classList.add('show');window.clearTimeout(toastTimer);toastTimer=window.setTimeout(()=>toastNode.classList.remove('show'),3800);}
const badge=(text:string)=>`<span class="tag">${text}</span>`;
function home(){
  view='menu';modal='';lastEquipment='';
  document.body.dataset.view='menu';
  ui.innerHTML=`<div class="home"><header class="masthead"><a class="brand" href="#" data-action="home"><span class="brand-mark">梗</span> GENG KING <small>梗王幸存者</small></a><div class="edition">VOL. 01 <span>本地街机 · 单人</span></div></header>
    <div class="home-main"><section class="hero-copy"><div class="eyebrow"><span class="live-dot"></span> 大头登场 / 全员整活</div><h1><span>梗王</span><span class="title-outline">幸存者<span class="title-star">✦</span></span></h1><p class="hero-description">今天的广场，多少有点离谱。<br>一把键盘起手，靠走位和梗武器活到最后。</p><div class="chips">${badge('自动攻击')}${badge('随机三选一')}${badge(`${BALANCE.stageCount} 关 Boss`)}</div>
    <div class="start-box"><label for="starter">本局起手 <span>${save.unlocked.length}/8 已解锁</span></label><div class="start-row"><select id="starter">${save.unlocked.map(id=>`<option value="${id}" ${starter===id?'selected':''}>${weapon(id).name}</option>`).join('')}</select><button class="button primary" data-action="start" ${ready?'':'disabled'}>${ready?'开整！<span>↗</span>':'素材载入 <span id="load-progress">0%</span>'}</button></div><small>击败 Boss，解锁下局的专属起始武器。</small></div>
    <nav class="menu-actions"><button data-action="codex">图鉴 <span>↗</span></button><button data-action="records">战绩 <span>↗</span></button><button data-action="settings">设置 <span>↗</span></button></nav></section>
    <section class="hero-art" aria-label="八位人物登场"><div class="orbit orbit-one"></div><div class="orbit orbit-two"></div><span class="scribble scribble-top">高手很多<br>瓜也很大</span><div class="hero-sticker sticker-zhang">${portrait('zhang-sunglasses','head')}<span>张雪峰</span></div><div class="hero-sticker sticker-laoda">${portrait('laoda-smile','head')}<span>牢大</span></div><div class="hero-sticker sticker-kun">${portrait('kunkun-cartoon','head')}<span>坤坤</span></div><div class="hero-sticker sticker-lebang">${portrait('lebang-face','head')}<span>乐邦</span></div><div class="floating-item item-soda">${icon('sprite-soda')}</div><div class="floating-item item-ball">${icon('rhythm-basketball')}</div><div class="speech">梗力全开！</div><span class="art-spark spark-one">✦</span><span class="art-spark spark-two">✳</span><span class="art-caption">还有许家印、马保国、香茶娜娜、讲解师等你 →</span></section></div>
    <footer class="home-footer"><span><kbd>WASD</kbd> 移动 <kbd>空格</kbd> 闪避 <kbd>ESC</kbd> 暂停</span><span>原创合成音 · 表情包拼贴 · 无永久属性加成</span></footer></div><div id="overlay"></div>`;
}
function start(){if(!ready)return;view='game';modal='';sessionUnlocks=[];lastEquipment='';
  document.body.dataset.view='game';window.clearTimeout(toastTimer);toastNode.classList.remove('show');
  ui.innerHTML=`<div class="hud"><div class="hud-top"><div class="vitals"><div class="health-heading"><strong>吃瓜路人</strong><span id="hp-text"></span></div><div class="health-track"><i id="hp-fill"></i></div><div class="xp-row"><span id="level-text">LV. 1</span><div class="xp-track"><i id="xp-fill"></i></div></div></div><div class="stage-info"><span id="stage-text">01 / ${String(BALANCE.stageCount).padStart(2,'0')}</span><strong id="time-text">00:00</strong><small id="stage-hint">Boss 抽选中</small></div><div class="hud-actions"><button data-action="mute" aria-label="切换静音" id="mute-button">${save.settings.volume>0?'♫':'♩'}</button><button data-action="fullscreen" aria-label="全屏">⛶</button><button data-action="pause" aria-label="暂停">Ⅱ</button></div></div><div id="boss-bar" class="boss-bar" hidden><div><strong id="boss-name"></strong><span id="boss-hp"></span></div><div class="boss-track"><i id="boss-fill"></i></div><small id="boss-counter"></small></div><div id="final-roster" class="final-roster" hidden aria-label="终局 Boss 状态"></div><div class="hud-bottom"><div id="equipment" class="equipment"></div><div class="run-caption"><span id="kills-text">0 击杀</span><span id="dash-text">空格 · 闪避</span></div></div></div><div id="overlay"></div>`;
  scene.audio.volume=save.settings.volume;scene.shake=save.settings.shake;scene.start(starter);
}
function updateHud(run:RunState,boss?:{id:EnemyId;active:boolean;hp:number;maxHp:number;shield:number;variant:boolean;dodge:number}){
  if(view!=='game')return;const s=stats(run),final=isFinalStage(run),byId=(id:string)=>document.getElementById(id)!;
  byId('hp-text').textContent=`${Math.max(0,Math.ceil(run.hp))} / ${s.maxHp}`;byId('hp-fill').style.width=`${Math.max(0,run.hp/s.maxHp*100)}%`;
  byId('xp-fill').style.width=`${Math.min(100,run.xp/run.xpNext*100)}%`;byId('level-text').textContent=`LV. ${run.level}${run.bossActive?' · Boss 战暂停升级':run.xp>=run.xpNext&&scene.upgradeRemaining>0?` · ${Math.ceil(scene.upgradeRemaining)}秒后升级`:''}`;
  byId('time-text').textContent=clockText(run.time);byId('stage-text').textContent=`${String(run.stage+1).padStart(2,'0')} / ${String(totalStages(run)).padStart(2,'0')}`;
  byId('stage-hint').textContent=final?`八王齐聚 · 剩余 ${scene.activeBosses.length}/${PEOPLE.length} 位 Boss`:run.bossActive?'Boss 战 · 注意红色预警':`${clockText(Math.max(0,BALANCE.stageSeconds-run.stageTime))} 后 · ${enemy(run.bosses[run.stage]).name}`;
  byId('kills-text').textContent=`${run.kills} 击杀 · ${run.counters} 次克制`;
  byId('dash-text').textContent=scene.dashInvincible?'闪避无敌':scene.dashRemaining>0?`闪避冷却 ${scene.dashRemaining.toFixed(1)}s`:'空格 · 闪避就绪';
  const bar=byId('boss-bar');bar.hidden=!boss?.active||final;
  const roster=byId('final-roster');roster.hidden=!final;
  if(final){const active=scene.activeBosses;roster.innerHTML=PEOPLE.map(p=>{
    const current=active.find(m=>m.id===p.id),status=current?(current.dodge>0?'闪避无敌':current.variant?'二阶段':'战斗中'):'已退场';
    return `<div class="final-boss ${current?'':'defeated'}"><div><strong>${p.name}</strong><small>${status}</small></div><div class="boss-track"><i style="width:${current?Math.max(0,current.hp/current.maxHp*100):0}%"></i></div></div>`;
  }).join('');}
  if(boss?.active){byId('boss-name').textContent=`${enemy(boss.id).name}${boss.variant?(boss.id==='xiangchanana'?' · 横冲直撞':' · 狂暴'):''}${boss.dodge>0?' · 闪避无敌':''}${boss.shield>0?' · 护盾':''}`;byId('boss-hp').textContent=`${Math.max(0,Math.ceil(boss.hp))} / ${Math.ceil(boss.maxHp)}`;byId('boss-fill').style.width=`${Math.max(0,boss.hp/boss.maxHp*100)}%`;byId('boss-counter').textContent=boss.dodge>0?'闪避中 · 暂时无法造成伤害，等待蓝色光圈消退':`克制：${enemy(boss.id).counter.map(w=>weapon(w).name).join(' / ')} · 所有武器均可造成伤害`;}
  const signature=JSON.stringify([run.weapons,run.passives]);if(signature!==lastEquipment){lastEquipment=signature;byId('equipment').innerHTML=`<div class="equipment-row"><span class="slot-label">武器</span>${Object.entries(run.weapons).map(([id,lv])=>`<div class="item-slot" title="${weapon(id as WeaponId).name} Lv.${lv}">${icon(id)}<b>${lv}</b></div>`).join('')}${'<div class="item-slot empty">＋</div>'.repeat(4-Object.keys(run.weapons).length)}</div><div class="equipment-row"><span class="slot-label">被动</span>${Object.entries(run.passives).map(([id,lv])=>`<div class="passive-slot" title="${PASSIVES.find(p=>p.id===id)!.name}">${PASSIVES.find(p=>p.id===id)!.symbol}<b>${lv}</b></div>`).join('')}${'<div class="passive-slot empty">·</div>'.repeat(4-Object.keys(run.passives).length)}</div>`;}
}
function openModal(kind:string){modal=kind;const root=document.getElementById('overlay')!;root.innerHTML=`<div class="scrim"><section class="panel ${kind==='codex'?'wide':''}" role="dialog" aria-modal="true" aria-label="${kind==='codex'?'图鉴':kind==='settings'?'设置':kind==='records'?'战绩':'暂停'}">${modalContent(kind)}</section></div>`;root.querySelector<HTMLButtonElement>('button')?.focus();}
function closeModal(){document.getElementById('overlay')!.innerHTML='';modal='';if(view==='game'&&scene.pauseReason==='pause')scene.setPaused(false);}
function modalContent(kind:string){
  const close=`<button class="close" data-action="close" aria-label="关闭">×</button>`;
  if(kind==='codex')return `${close}<div class="eyebrow">MEME FILES / 角色档案</div><h2>广场上都有谁？</h2><p class="panel-intro">匹配武器造成 1.75 倍伤害。大头造型与攻击均为游戏演出。</p><div class="codex-grid">${PEOPLE.map(p=>`<article class="codex-card"><div class="codex-photo" style="--tint:${p.color}">${portrait(p.image!,'codex-head')}</div><div><div class="card-heading"><h3>${p.name}</h3><small>${save.seen.includes(p.id)?'已遭遇':'未遭遇'}</small></div><p>${p.description}</p><div class="counter-chips">${p.counter.map(w=>`<span>${icon(w)}${weapon(w).name}</span>`).join('')}</div></div></article>`).join('')}</div><div class="common-roster">${COMMON.map(e=>`<span title="${e.description}"><i style="background:${e.color}"></i>${e.name}<small>${weapon(e.counter[0]).name}</small></span>`).join('')}</div><p class="fineprint">前 ${BALANCE.regularStageCount} 关从全部 ${PEOPLE.length} 位人物中无重复随机抽选 Boss。第 ${BALANCE.stageCount} 关在扩大的梗王广场迎战全部 ${PEOPLE.length} 位 Boss，同时登场、全部击败才通关。</p>`;
  if(kind==='settings')return `${close}<div class="eyebrow">MAKE IT YOURS</div><h2>调到你的节奏</h2><div class="setting-row"><label for="volume">音效音量 <output id="volume-label">${Math.round(save.settings.volume*100)}%</output></label><input id="volume" type="range" min="0" max="1" step="0.05" value="${save.settings.volume}"></div><label class="setting-check"><span>受击画面震动<small>关掉后镜头保持稳定</small></span><input id="shake" type="checkbox" ${save.settings.shake?'checked':''}></label><button class="button outline full" data-action="fullscreen">切换全屏 ⛶</button><p class="fineprint">声音在点击开局后启用。设置保存在当前浏览器。</p>`;
  if(kind==='records')return `${close}<div class="eyebrow">YOUR RUNS / 最近 20 局</div><h2>这局整得怎么样？</h2>${save.records.length?`<div class="records-list">${save.records.map(r=>`<div class="record"><strong class="${r.won?'victory':''}">${r.won?'梗王诞生':'下次一定'}</strong><span>${clockText(r.seconds)}<small>LV.${r.level}</small></span><span>${r.kills} 击杀<small>${r.bosses}/${r.totalBosses??4} Boss</small></span><time>${new Date(r.date).toLocaleDateString('zh-CN')}</time></div>`).join('')}</div>`:'<div class="empty-state"><span>↗</span><h3>第一局，等你来整。</h3><p>结算后会在这里留下记录。</p></div>'}`;
  return `<div class="eyebrow">TAKE A BREATH</div><h2>${scene.pauseReason==='blur'?'回来再继续':'歇一口气'}</h2><p class="panel-intro">计时、弹幕与伤害已暂停。</p><button class="button primary full" data-action="resume">继续游戏 <span>↗</span></button><button class="button outline full" data-action="settings">设置</button><button class="button text-button full" data-action="abandon">结束本局，回到广场</button><p class="fineprint">WASD / 方向键移动 · 空格闪避 · Esc 继续</p>`;
}
function showUpgrade(next:UpgradeDefinition[]){
  options=next;modal='upgrade';const run=scene.run!;
  document.getElementById('overlay')!.innerHTML=`<div class="scrim upgrade-scrim"><section class="upgrade-panel" role="dialog" aria-modal="true" aria-label="选择升级"><div class="eyebrow">LEVEL UP / LV. ${run.level}</div><h2>这次，整点什么？</h2><p>${healingUpgradesAllowed(run)?'选择一项强化，继续吃瓜。':'后期挑战 · 本关不再提供回血类升级。'}<span>武器 ${Object.keys(run.weapons).length}/4 · 被动 ${Object.keys(run.passives).length}/4</span></p><div class="upgrade-grid" data-count="${next.length}">${next.map((o,i)=>{
    const category=o.kind==='evolve'?'融合进化':o.kind==='weapon'?(run.weapons[o.id as WeaponId]?'强化武器':'新武器'):o.kind==='passive'?'被动强化':o.kind==='skip'?'等级成长':'补给';
    const art=o.kind==='weapon'||o.kind==='evolve'?icon(o.id):`<span>${o.kind==='heal'?'♥':o.kind==='skip'?'↗':PASSIVES.find(p=>p.id===o.id)!.symbol}</span>`;
    const level=o.kind==='heal'?'即时恢复':o.kind==='skip'?'等级已提升':`Lv. ${o.nextLevel} <span>${'●'.repeat(o.nextLevel)}${'○'.repeat((o.kind==='passive'?3:o.kind==='evolve'?1:5)-o.nextLevel)}</span>`;
    return `<button class="upgrade-card ${o.kind==='evolve'?'evolution':''}" data-action="choose" data-index="${i}"><div class="choice-meta"><span>${category}</span><kbd>${i+1}</kbd></div><div class="choice-art">${art}</div><h3>${o.name}</h3><div class="level-dots">${level}</div><p>${o.description}</p><span class="pick-text">${o.kind==='skip'?'继续':'就它了'} <span>↗</span></span></button>`;
  }).join('')}</div><button class="reroll" data-action="reroll" ${run.rerolls===0?'disabled':''}>↻ 换一批 <span>剩余 ${run.rerolls} 次</span></button></section></div>`;
}
function choose(index:number){const choice=options[index];if(!choice||modal!=='upgrade')return;if(scene.choose(choice)&&scene.pauseReason!=='upgrade'){document.getElementById('overlay')!.innerHTML='';modal='';updateHud(scene.run!,scene.boss);}}
function result(run:RunState){
  recordRun(save,run);persist();view='result';modal='';
  document.body.dataset.view='result';
  const ranking=Object.entries(run.weaponDamage).sort((a,b)=>(b[1]||0)-(a[1]||0)),max=Math.max(1,...ranking.map(p=>p[1]||0));
  ui.innerHTML=`<div class="result-scrim"><section class="result-panel"><div class="eyebrow">${run.won?'YOU ARE THE GENG KING':'NEXT TIME, DEFINITELY'}</div><h1>${run.won?'梗王诞生！':'下次一定。'}</h1><p>${run.won?`七关通关！终局 ${PEOPLE.length} 位 Boss 全部退场，广场属于你。`:`倒在了第 ${run.stage+1} / ${totalStages(run)} 关。再来一局，换个构筑试试。`}</p><div class="result-stats"><div><strong>${clockText(run.time)}</strong><span>生存时间</span></div><div><strong>${run.kills}</strong><span>击杀</span></div><div><strong>${run.counters}</strong><span>克制命中</span></div><div><strong>${run.defeated.length}<small>/${totalBossEncounters(run)}</small></strong><span>Boss 退场</span></div></div><div class="damage-list">${ranking.map(([id,dmg])=>`<div>${icon(id)}<span>${weapon(id as WeaponId).name}</span><div class="damage-track"><i style="width:${(dmg||0)/max*100}%;background:${weapon(id as WeaponId).color}"></i></div><b>${Math.round(dmg||0).toLocaleString()}</b></div>`).join('')}</div>${sessionUnlocks.length?`<div class="unlocks">起始武器解锁：${sessionUnlocks.map(w=>weapon(w).name).join('、')}</div>`:''}<div class="result-actions"><button class="button primary" data-action="start">再整一局 ↗</button><button class="button outline" data-action="home">回到广场</button></div><p class="fineprint">这局的等级与属性将在重开时重置。</p></section></div><div id="overlay"></div>`;
}
function pause(reason='pause'){if(view==='game'&&scene.playing&&!scene.paused){scene.setPaused(true,reason);modal='pause';openModal('pause');}}
function resume(){if(view==='game'&&['pause','blur'].includes(scene.pauseReason)){document.getElementById('overlay')!.innerHTML='';modal='';scene.setPaused(false);}}
async function fullscreen(){try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}catch{toast('当前浏览器暂不允许全屏，可以使用 F11。');}}
ui.addEventListener('click',event=>{
  const button=(event.target as HTMLElement).closest<HTMLElement>('[data-action]');if(!button)return;event.preventDefault();const action=button.dataset.action;
  if(action==='start')start();
  else if(action==='home'){scene.stop();home();}
  else if(action==='choose')choose(Number(button.dataset.index));
  else if(action==='reroll')scene.reroll();
  else if(action==='pause')pause();
  else if(action==='resume')resume();
  else if(action==='abandon'){if(scene.run){recordRun(save,scene.run);persist();}scene.stop();home();}
  else if(action==='close'){if(view==='game'){if(scene.pauseReason==='blur'){resume();return;}if(scene.pauseReason==='pause'){openModal('pause');return;}}closeModal();}
  else if(action==='fullscreen')void fullscreen();
  else if(action==='mute'){save.settings.volume=save.settings.volume>0?0:0.3;scene.audio.volume=save.settings.volume;button.textContent=save.settings.volume>0?'♫':'♩';persist();}
  else if(['codex','records','settings'].includes(action!)){if(view==='game'&&!scene.paused)scene.setPaused(true,'pause');openModal(action!);}
});
ui.addEventListener('change',event=>{const input=event.target as HTMLInputElement;if(input.id==='starter')starter=input.value as WeaponId;if(input.id==='shake'){save.settings.shake=input.checked;scene.shake=input.checked;persist();}});
ui.addEventListener('input',event=>{const input=event.target as HTMLInputElement;if(input.id==='volume'){save.settings.volume=Number(input.value);scene.audio.volume=save.settings.volume;document.getElementById('volume-label')!.textContent=`${Math.round(save.settings.volume*100)}%`;scene.audio.unlock();scene.audio.play('shot');persist();}});
ui.addEventListener('error',event=>{const failed=event.target;if(failed instanceof HTMLImageElement||failed instanceof SVGImageElement){const replacement=document.createElement('span');replacement.className='fallback-icon '+(failed instanceof HTMLImageElement?failed.className:'');replacement.textContent='✦';replacement.setAttribute('aria-label',failed instanceof HTMLImageElement?failed.alt:'图片暂不可用');failed.replaceWith(replacement);}},true);
window.addEventListener('keydown',event=>{
  if(modal==='upgrade'&&['1','2','3'].includes(event.key)){event.preventDefault();choose(Number(event.key)-1);}
  if(event.key==='Escape'){if(modal==='upgrade')return;if(view==='game'){if(scene.paused)resume();else pause();}else if(modal)closeModal();}
});
window.addEventListener('blur',()=>pause('blur'));document.addEventListener('visibilitychange',()=>{if(document.hidden)pause('blur');});
scene.hooks={ready:()=>{ready=true;home();},hud:updateHud,upgrade:showUpgrade,end:result,toast,
  seen:id=>{if(!save.seen.includes(id)){save.seen.push(id);persist();}},
  bossDefeated:id=>{const fresh=unlockBoss(save,id);sessionUnlocks.push(...fresh);persist();toast(`${enemy(id).name}退场！${fresh.length?'已解锁：'+fresh.map(w=>weapon(w).name).join('、'):scene.run?.won?'广场已通关！':'进入下一阶段'}`);}
};
home();
const game=new Phaser.Game({type:Phaser.AUTO,parent:'game',backgroundColor:'#f0eddf',render:{antialias:true,pixelArt:false},scale:{mode:Phaser.Scale.RESIZE,width:window.innerWidth,height:window.innerHeight},physics:{default:'arcade',arcade:{gravity:{x:0,y:0},customUpdate:true,fixedStep:false}},scene:[scene],audio:{noAudio:true}});

// Local QA surface is opt-in; regular players never receive these controls.
if(new URLSearchParams(location.search).get('qa')==='1'){
  Object.assign(window,{__gengQA:{
    start:(id:WeaponId='keyboard',seed=17)=>{if(!scene.ready)return scene.snapshot();starter=id;start();scene.start(id,seed);return scene.snapshot();},
    snapshot:()=>scene.snapshot(),advance:(seconds:number)=>scene.qaAdvance(seconds),
    assist:(immortal:boolean,auto:boolean,upgrades:boolean,keyboardOnly=false)=>{scene.qaImmortal=immortal;scene.qaAuto=auto;scene.qaAutoUpgrade=upgrades;scene.qaKeyboardOnly=keyboardOnly;},
    boss:(id:PersonId)=>scene.summonBoss(id),
    helicopter:()=>scene.spawn('helicopter',false,false,scene.player.x+180,scene.player.y-60),
    hitBoss:(wid:WeaponId,amount:number)=>{if(scene.boss)scene.hit(scene.boss,wid,amount);},
    hurt:(amount:number)=>{scene.qaImmortal=false;(scene as unknown as {invulnerable:number}).invulnerable=0;scene.hurt(amount);},
    upgrade:()=>{if(!scene.run||scene.run.bossActive)return;scene.setPaused(true,'upgrade');(scene as unknown as {pendingLevels:number}).pendingLevels=1;showUpgrade(upgradeChoices(scene.run!,rng(Date.now())));},
    equip:(weapons:RunState['weapons'],passives:RunState['passives']={})=>{scene.run!.weapons=weapons;scene.run!.passives=passives;scene.run!.hp=stats(scene.run!).maxHp;updateHud(scene.run!,scene.boss);},
    stress:()=>scene.qaStress(),save:()=>JSON.parse(JSON.stringify(save)),game,
  }});
}
import type {PersonId} from './core';
