import test from 'node:test';
import assert from 'node:assert/strict';
import { VoiceGate } from '../src/voice';
import { ArcadeAudio } from '../src/audio';
import { readFileSync, existsSync } from 'node:fs';

function fakeContext(){
  type Source={onended?:()=>void;buffer?:AudioBuffer;loop?:boolean;startArgs?:number[];stopped?:boolean;start:(...args:number[])=>void;stop:()=>void;connect:()=>void;disconnect:()=>void};
  const sources:Source[]=[];
  const context={state:'running',currentTime:0,destination:{},decodeAudioData:async()=>({duration:4} as AudioBuffer),createBufferSource:()=>{const source:Source={connect:()=>{},disconnect:()=>{},start:(...args)=>{source.startArgs=args;sources.push(source);},stop:()=>{source.stopped=true;}};return source;},createGain:()=>({gain:{value:0},connect:()=>{},disconnect:()=>{}})};
  return {context:{...context,resume:async()=>{}} as unknown as AudioContext,sources};
}

test('配音按角色和事件节流，共享同类怪冷却，快速移动可抢占受击配音',()=>{
  const gate=new VoiceGate();assert.ok(gate.canPlay('laoda','hit',0,6));gate.mark('laoda','hit',0);
  assert.equal(gate.canPlay('laoda','hit',5.99,6),false);assert.ok(gate.canPlay('laoda','hit',6,6));
  assert.equal(gate.canPlay('kunkun','hit',1,6),false);assert.ok(gate.canPlay('kunkun','hit',1.5,6));
  assert.ok(gate.canPlay('laoda','rapidMove',0.2,8,true));gate.mark('laoda','rapidMove',0.2);
  assert.equal(gate.canPlay('laoda','rapidMove',8.19,8,true),false);assert.ok(gate.canPlay('laoda','rapidMove',8.2,8,true));
  assert.equal(gate.canPlay('laoda','hit',NaN,6),false);gate.reset();assert.ok(gate.canPlay('laoda','hit',0,6));
});

test('缺音频与静音不发请求，暂停/重开取消解码中的旧配音，加载失败可回退',async()=>{
  const audio=new ArcadeAudio({laoda:{hit:{url:'test.wav',cooldownSeconds:6}}});
  let release:(value:AudioBuffer)=>void=()=>{},requests=0,starts=0;
  const context={state:'running',destination:{},decodeAudioData:()=>new Promise<AudioBuffer>(resolve=>{release=resolve;}),createBufferSource:()=>({connect:()=>{},disconnect:()=>{},start:()=>{starts++;},stop:()=>{}}),createGain:()=>({gain:{value:0},connect:()=>{},disconnect:()=>{}})};
  audio.context=context as unknown as AudioContext;audio.setPaused(false);
  const originalFetch=globalThis.fetch;
  globalThis.fetch=async()=>{requests++;return new Response(new Uint8Array([0]));};
  try{
    assert.equal(await audio.cue('kunkun','hit',0),false);assert.equal(requests,0);
    audio.volume=0;assert.equal(await audio.cue('laoda','hit',0),false);assert.equal(requests,0);
    audio.volume=0.3;const pending=audio.cue('laoda','hit',0);
    await new Promise(resolve=>setImmediate(resolve));audio.setPaused(true);release({} as AudioBuffer);
    assert.equal(await pending,false);assert.equal(starts,0);
    audio.resetVoices();audio.setPaused(false);assert.ok(await audio.cue('laoda','hit',0));assert.equal(starts,1);
    audio.setPaused(true);assert.equal(await audio.cue('laoda','hit',100),false);
    const broken=new ArcadeAudio({laoda:{hit:{url:'missing.wav',cooldownSeconds:6}}});broken.context=audio.context;broken.setPaused(false);
    globalThis.fetch=async()=>new Response('',{status:404});assert.equal(await broken.cue('laoda','hit',0),false);assert.deepEqual(broken.failedCues,['missing.wav']);
  }finally{globalThis.fetch=originalFetch;}
});

test('普通配音有全局间隔和独立冷却，同帧并发只启动一段',async()=>{
  const originalFetch=globalThis.fetch;globalThis.fetch=async()=>new Response(new Uint8Array([0]));
  try{
    const {context,sources}=fakeContext();const audio=new ArcadeAudio({kunkun:{hit:{url:'hit.mp3',cooldownSeconds:6},barrage:{url:'barrage.mp3',cooldownSeconds:12}}});audio.context=context;audio.setPaused(false);
    const attempts=await Promise.all(Array.from({length:100},()=>audio.cue('kunkun','hit',0)));assert.equal(attempts.filter(Boolean).length,1);assert.equal(sources.length,1);
    sources[0].onended!();assert.equal(await audio.cue('kunkun','barrage',2.99),false);assert.ok(await audio.cue('kunkun','barrage',3));sources[1].onended!();
    assert.equal(await audio.cue('kunkun','barrage',14.99),false);assert.ok(await audio.cue('kunkun','barrage',15));sources[2].onended!();
    assert.equal(await audio.cue('kunkun','hit',NaN),false);assert.ok(await audio.cue('kunkun','hit',18));assert.equal(audio.playedCues['kunkun:hit'],2);
  }finally{globalThis.fetch=originalFetch;}
});
test('同场Boss退场只取消该人物配音，其他Boss播放和排队继续',async()=>{
  const originalFetch=globalThis.fetch;globalThis.fetch=async()=>new Response(new Uint8Array([0]));
  try{
    const {context,sources}=fakeContext();const cue={url:'phase.mp3',cooldownSeconds:9999};
    const audio=new ArcadeAudio({laoda:{phase2:cue,death:{url:'out.mp3',cooldownSeconds:9999}},kunkun:{phase2:cue},zhangxuefeng:{phase2:cue}});audio.context=context;audio.setPaused(false);
    assert.ok(await audio.cue('kunkun','phase2',0));assert.ok(await audio.cue('laoda','phase2',1));assert.ok(await audio.cue('zhangxuefeng','phase2',1.1));
    audio.cancelBossVoices('laoda');assert.equal(sources[0].stopped,undefined);sources[0].onended!();
    assert.equal(audio.playedCues['laoda:phase2'],undefined);assert.equal(audio.playedCues['zhangxuefeng:phase2'],1);
    audio.cancelBossVoices('zhangxuefeng');assert.equal(sources[1].stopped,true);
    assert.ok(await audio.cue('laoda','death',2));assert.equal(audio.playedCues['laoda:death'],1);
  }finally{globalThis.fetch=originalFetch;}
});
test('同人物在终局再次登场可以重播阶段与退场配音，同一只Boss仍只触发一次',()=>{
  const gate=new VoiceGate(3);
  for(const event of ['phase2','nearDeath','death'] as const){
    gate.mark('laoda',event,10,1);assert.equal(gate.canPlay('laoda',event,20,9999,true,1),false);
    assert.ok(gate.canPlay('laoda',event,20,9999,true,2));gate.mark('laoda',event,20,2);
    assert.equal(gate.canPlay('laoda',event,21,9999,true,2),false);
  }
  gate.mark('laoda','barrage',30,1);assert.equal(gate.canPlay('laoda','barrage',31,12,false,2),false);
});

test('单个Boss退场期间的异步解码被取消，不误删同角色后来申请的配音',async()=>{
  const originalFetch=globalThis.fetch;globalThis.fetch=async()=>new Response(new Uint8Array([0]));
  try{
    const {context,sources}=fakeContext();let release:(value:AudioBuffer)=>void=()=>{};
    context.decodeAudioData=()=>new Promise<AudioBuffer>(resolve=>{release=resolve;});
    const audio=new ArcadeAudio({laoda:{phase2:{url:'phase.mp3',cooldownSeconds:9999}}});audio.context=context;audio.setPaused(false);
    const old=audio.cue('laoda','phase2',0);await new Promise(resolve=>setImmediate(resolve));audio.cancelBossVoices('laoda');
    const next=audio.cue('laoda','phase2',1);release({duration:4} as AudioBuffer);
    assert.equal(await old,false);assert.ok(await next);assert.equal(sources.length,1);assert.equal(audio.playedCues['laoda:phase2'],1);
  }finally{globalThis.fetch=originalFetch;}
});

test('阶段配音抢占普通配音，濒死排队且保护长配音，失效Boss取消排队',async()=>{
  const originalFetch=globalThis.fetch;globalThis.fetch=async()=>new Response(new Uint8Array([0]));
  try{
    const {context,sources}=fakeContext();const audio=new ArcadeAudio({zhangxuefeng:{hit:{url:'hit.mp3',cooldownSeconds:6},phase2:{url:'phase.mp3',cooldownSeconds:9999},nearDeath:{url:'death.mp3',cooldownSeconds:9999},dodge:{url:'dodge.mp3',cooldownSeconds:10}}});audio.context=context;audio.setPaused(false);
    assert.ok(await audio.cue('zhangxuefeng','hit',0));assert.ok(await audio.cue('zhangxuefeng','phase2',0.1));assert.equal(sources.length,2);
    assert.ok(await audio.cue('zhangxuefeng','nearDeath',0.2));assert.equal(sources.length,2);
    assert.equal(await audio.cue('zhangxuefeng','dodge',4),false);audio.update(4);sources[1].onended!();assert.equal(sources.length,3);assert.equal(audio.playedCues['zhangxuefeng:nearDeath'],1);
    sources[2].onended!();assert.equal(await audio.cue('zhangxuefeng','nearDeath',20),false);
    audio.resetVoices();assert.ok(await audio.cue('zhangxuefeng','phase2',0));let living=true;
    assert.ok(await audio.cue('zhangxuefeng','nearDeath',1,{valid:()=>living}));living=false;audio.update(4);sources[3].onended!();assert.equal(sources.length,4);
  }finally{globalThis.fetch=originalFetch;}
});

test('暂停、静音和Boss退场清除重要排队；过期普通事件不会迟播',async()=>{
  const originalFetch=globalThis.fetch;globalThis.fetch=async()=>new Response(new Uint8Array([0]));
  try{
    for(const cancel of ['pause','mute','end'] as const){
      const {context,sources}=fakeContext();const audio=new ArcadeAudio({zhangxuefeng:{phase2:{url:'phase.mp3',cooldownSeconds:9999},nearDeath:{url:'death.mp3',cooldownSeconds:9999}}});audio.context=context;audio.setPaused(false);
      assert.ok(await audio.cue('zhangxuefeng','phase2',0));assert.ok(await audio.cue('zhangxuefeng','nearDeath',1));
      if(cancel==='pause')audio.setPaused(true);else if(cancel==='mute')audio.volume=0;else audio.cancelVoices();
      sources[0].onended!();assert.equal(sources.length,1);assert.equal(audio.playedCues['zhangxuefeng:nearDeath'],undefined);
    }
    const {context,sources}=fakeContext();const audio=new ArcadeAudio({kunkun:{hit:{url:'hit.mp3',cooldownSeconds:6}}});audio.context=context;audio.setPaused(false);audio.update(10);
    assert.equal(await audio.cue('kunkun','hit',1,{expiresAt:2}),false);assert.equal(sources.length,0);
  }finally{globalThis.fetch=originalFetch;}
});

test('退场配音在清理阶段配音后独占播放，结束后解除升级等待',async()=>{
  const originalFetch=globalThis.fetch;globalThis.fetch=async()=>new Response(new Uint8Array([0]));
  try{
    const {context,sources}=fakeContext();const audio=new ArcadeAudio({laoda:{phase2:{url:'say.mp3',cooldownSeconds:9999},death:{url:'out.mp3',cooldownSeconds:9999}},kunkun:{hit:{url:'hit.mp3',cooldownSeconds:6}}});audio.context=context;audio.setPaused(false);
    assert.ok(await audio.cue('laoda','phase2',0));audio.cancelVoices();
    const pending=audio.cue('laoda','death',.1,{valid:()=>true});assert.ok(audio.deathVoiceBusy);assert.ok(await pending);
    assert.equal(sources.length,2);assert.ok(audio.deathVoiceBusy);
    assert.equal(await audio.cue('laoda','death',.2),false);assert.equal(await audio.cue('kunkun','hit',10),false);
    sources[1].onended!();assert.equal(audio.deathVoiceBusy,false);assert.ok(await audio.cue('kunkun','hit',11));
  }finally{globalThis.fetch=originalFetch;}
});

test('胜利暂停仅允许退场配音恢复音频，其他事件仍禁止播放',async()=>{
  const originalFetch=globalThis.fetch;globalThis.fetch=async()=>new Response(new Uint8Array([0]));
  try{
    const {context,sources}=fakeContext();const mutable=context as unknown as {state:string;resume:()=>Promise<void>};let resumes=0;
    mutable.state='suspended';mutable.resume=async()=>{resumes++;mutable.state='running';};
    const audio=new ArcadeAudio({laoda:{phase2:{url:'say.mp3',cooldownSeconds:9999},death:{url:'out.mp3',cooldownSeconds:9999},barrage:{url:'man.mp3',cooldownSeconds:12}}});audio.context=context;
    assert.equal(await audio.cue('laoda','phase2',1,{allowWhilePaused:true}),false);
    assert.equal(await audio.cue('laoda','death',1),false);
    assert.ok(await audio.cue('laoda','death',1,{allowWhilePaused:true,valid:()=>true}));assert.equal(resumes,1);assert.equal(sources.length,1);
    assert.equal(await audio.cue('laoda','barrage',20,{allowWhilePaused:true}),false);
    audio.setPaused(true);assert.equal(audio.deathVoiceBusy,false);
  }finally{globalThis.fetch=originalFetch;}
});

test('结算退场配音恢复音频期间重开、静音或暂停，都不会迟播',async()=>{
  const originalFetch=globalThis.fetch;globalThis.fetch=async()=>new Response(new Uint8Array([0]));
  try{
    for(const cancel of ['restart','mute','pause','invalid'] as const){
      const {context,sources}=fakeContext();let resume:()=>void=()=>{},valid=true;
      context.resume=()=>new Promise<void>(resolve=>{resume=resolve;});
      const audio=new ArcadeAudio({laoda:{death:{url:'out.mp3',cooldownSeconds:9999}}});audio.context=context;
      const pending=audio.cue('laoda','death',10,{allowWhilePaused:true,valid:()=>valid});assert.ok(audio.deathVoiceBusy);
      if(cancel==='restart')audio.resetVoices();else if(cancel==='mute')audio.volume=0;else if(cancel==='pause')audio.setPaused(true);else valid=false;
      resume();assert.equal(await pending,false);assert.equal(sources.length,0);assert.equal(audio.deathVoiceBusy,false);
    }
  }finally{globalThis.fetch=originalFetch;}
});

test('多块讲解石共用循环轨，暂停和静音保留进度，打碎或重开彻底停止',async()=>{
  const originalFetch=globalThis.fetch;globalThis.fetch=async()=>new Response(new Uint8Array([0]));
  const tick=()=>new Promise(resolve=>setImmediate(resolve));
  try{
    const {context,sources}=fakeContext(),clock=context as unknown as {currentTime:number};const audio=new ArcadeAudio({},3,{url:'stone.mp3',volume:.65});audio.context=context;audio.setPaused(false);
    audio.setStoneLoop(true);audio.setStoneLoop(true);await tick();assert.equal(sources.length,1);assert.ok(sources[0].loop);assert.ok(audio.stoneLoopState.playing);
    clock.currentTime=1.25;audio.setPaused(true);assert.ok(sources[0].stopped);assert.equal(audio.stoneLoopState.offset,1.25);assert.equal(audio.stoneLoopState.playing,false);
    audio.setPaused(false);await tick();assert.equal(sources.length,2);assert.deepEqual(sources[1].startArgs,[0,1.25]);
    clock.currentTime=2;audio.volume=0;assert.ok(sources[1].stopped);assert.equal(audio.stoneLoopState.offset,2);
    audio.volume=.3;await tick();assert.equal(sources.length,3);assert.deepEqual(sources[2].startArgs,[0,2]);
    audio.cancelVoices();assert.ok(audio.stoneLoopState.playing);audio.setStoneLoop(false);assert.ok(sources[2].stopped);assert.equal(audio.stoneLoopState.wanted,false);
    audio.setStoneLoop(true);await tick();assert.deepEqual(sources[3].startArgs,[0,0]);audio.resetVoices();assert.ok(sources[3].stopped);assert.equal(audio.stoneLoopState.wanted,false);
  }finally{globalThis.fetch=originalFetch;}
});

test('讲解石在异步解码前被毁或重开时不迟播；新石头只创建一条音轨',async()=>{
  const originalFetch=globalThis.fetch;globalThis.fetch=async()=>new Response(new Uint8Array([0]));
  const tick=()=>new Promise(resolve=>setImmediate(resolve));
  try{
    for(const mode of ['destroy','restart','replace','pause','mute'] as const){
      const {context,sources}=fakeContext();let release:(value:AudioBuffer)=>void=()=>{};
      context.decodeAudioData=()=>new Promise(resolve=>{release=resolve;});
      const audio=new ArcadeAudio({},3,{url:'stone.mp3',volume:.65});audio.context=context;audio.setPaused(false);audio.setStoneLoop(true);await tick();
      if(mode==='destroy')audio.setStoneLoop(false);else if(mode==='restart')audio.resetVoices();else if(mode==='replace'){audio.setStoneLoop(false);audio.setStoneLoop(true);}else if(mode==='pause')audio.setPaused(true);else audio.volume=0;
      release({duration:4} as AudioBuffer);await tick();assert.equal(sources.length,mode==='replace'?1:0);
      if(mode==='pause'){audio.setPaused(false);await tick();assert.equal(sources.length,1);}
      if(mode==='mute'){audio.volume=.3;await tick();assert.equal(sources.length,1);}
    }
  }finally{globalThis.fetch=originalFetch;}
});

test('十一段Boss配音和讲解石循环音轨绑定完整，共享闪身覆盖八Boss，原件存在',()=>{
  const manifest=JSON.parse(readFileSync(new URL('../assets/audio/manifest.json',import.meta.url),'utf8'));
  assert.equal(manifest.scope,'boss-only');assert.equal(manifest.defaults.globalGapSeconds,3);assert.equal(manifest.shared.dodge.file,'boss-dodge.mp3');
  const expected={zhangxuefeng:{phase2:'zhang-phase2.mp3',nearDeath:'zhang-near-death.mp3'},xiangchanana:{random:'nana-random.mp3',phase2:'nana-phase2.mp3'},lebang:{barrage:'lebang-barrage.mp3'},kunkun:{hit:'kunkun-hit.mp3',barrage:'kunkun-barrage.mp3'},laoda:{barrage:'laoda-barrage.mp3',phase2:'laoda-phase2.mp3',death:'laoda-death.mp3'}};
  assert.equal(Object.keys(manifest.characters).length,8);
  assert.equal(manifest.loops.lectureStone.file,'lecture-stone-loop.mp3');assert.ok(existsSync(new URL('../assets/audio/'+manifest.loops.lectureStone.file,import.meta.url)));
  for(const [id,events] of Object.entries(expected))for(const [event,file] of Object.entries(events)){assert.equal(manifest.characters[id][event].file,file);assert.ok(existsSync(new URL('../assets/audio/'+file,import.meta.url)));}
  assert.ok(existsSync(new URL('../assets/audio/'+manifest.shared.dodge.file,import.meta.url)));
});
