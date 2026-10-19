import { VoiceGate, essentialVoice, type VoiceCue, type VoiceCues, type VoiceEvent } from './voice';
import type { EnemyId } from './core';

interface CueOptions { valid?:()=>boolean;expiresAt?:number;allowWhilePaused?:boolean;encounter?:number }
interface QueuedVoice { id:EnemyId;event:VoiceEvent;cue:VoiceCue;buffer:AudioBuffer;generation:number;bossGeneration:number;options:CueOptions }

export class ArcadeAudio {
  context?: AudioContext;
  private _volume=0.3;
  private last=0;
  private voicePaused=true;
  private generation=0;
  private bossGenerations=new Map<EnemyId,number>();
  private gate:VoiceGate;
  private voiceTime=0;
  private queue:QueuedVoice[]=[];
  private pending=new Map<string,{generation:number;bossGeneration:number}>();
  private buffers=new Map<string,Promise<AudioBuffer|undefined>>();
  private activeVoice?:{source:AudioBufferSourceNode;gain:GainNode;id:EnemyId;event:VoiceEvent;clipVolume:number};
  private stoneLoop?:{offset:number;loading:boolean};
  private stoneSource?:{source:AudioBufferSourceNode;gain:GainNode;startedAt:number;offset:number};
  playedCues:Record<string,number>={};
  playedEvents:{id:EnemyId;event:VoiceEvent;time:number;audioTime:number;duration:number}[]=[];
  failedCues:string[]=[];
  constructor(private cues:VoiceCues={},globalGapSeconds=3,private stoneCue?:{url:string;volume:number}){this.gate=new VoiceGate(globalGapSeconds);}
  get volume(){return this._volume;}
  get deathVoiceBusy(){return this.activeVoice?.event==='death'||this.queue.some(job=>job.event==='death')||[...this.pending.keys()].some(key=>key.endsWith(':death'));}
  set volume(value:number){this._volume=Number.isFinite(value)?Math.max(0,Math.min(1,value)):0;if(this.activeVoice)this.activeVoice.gain.gain.value=this._volume*this.activeVoice.clipVolume;if(this.stoneSource)this.stoneSource.gain.gain.value=this._volume*(this.stoneCue?.volume??0.65);if(this._volume===0){this.cancelVoices();this.pauseStoneLoop();}else void this.syncStoneLoop();}
  unlock() {try{this.context??=new AudioContext();void this.context.resume().then(()=>this.syncStoneLoop()).catch(()=>{});this.preload();}catch{}}
  preload(){if(this.context){for(const character of Object.values(this.cues))for(const cue of Object.values(character||{}))if(cue)void this.loadCue(cue.url);if(this.stoneCue)void this.loadCue(this.stoneCue.url);}}
  setPaused(value:boolean){this.voicePaused=value;if(value){this.cancelVoices();this.pauseStoneLoop();}else void this.syncStoneLoop();}
  get stoneLoopState(){return {wanted:!!this.stoneLoop,playing:!!this.stoneSource,loading:this.stoneLoop?.loading??false,offset:this.stoneLoop?.offset??0};}
  setStoneLoop(active:boolean){
    if(!active){this.pauseStoneLoop();this.stoneLoop=undefined;return;}
    this.stoneLoop??={offset:0,loading:false};void this.syncStoneLoop();
  }
  private pauseStoneLoop(){
    const playing=this.stoneSource;this.stoneSource=undefined;if(!playing)return;
    const duration=playing.source.buffer?.duration??0;
    if(this.stoneLoop&&duration>0)this.stoneLoop.offset=(playing.offset+Math.max(0,this.context!.currentTime-playing.startedAt))%duration;
    try{playing.source.stop();}catch{}playing.source.disconnect();playing.gain.disconnect();
  }
  private async syncStoneLoop(){
    const job=this.stoneLoop,context=this.context;
    if(!job||!this.stoneCue||!context||this.voicePaused||this.volume<=0||context.state!=='running'||this.stoneSource||job.loading)return;
    job.loading=true;
    try{
      const buffer=await this.loadCue(this.stoneCue.url);
      // Object identity cancels an old decode when all stones die or a new run starts.
      if(!buffer||buffer.duration<=0||this.stoneLoop!==job||this.voicePaused||this.volume<=0||context.state!=='running'||this.stoneSource)return;
      const source=context.createBufferSource(),gain=context.createGain(),offset=job.offset%buffer.duration;
      source.buffer=buffer;source.loop=true;gain.gain.value=this.volume*this.stoneCue.volume;source.connect(gain);gain.connect(context.destination);
      this.stoneSource={source,gain,startedAt:context.currentTime,offset};source.start(0,offset);
    }catch{this.pauseStoneLoop();if(!this.failedCues.includes(this.stoneCue.url))this.failedCues.push(this.stoneCue.url);}finally{job.loading=false;}
  }
  cancelVoices(){this.generation++;this.pending.clear();this.queue=[];this.stopVoice();}
  cancelBossVoices(id:EnemyId){
    this.bossGenerations.set(id,(this.bossGenerations.get(id)||0)+1);
    this.queue=this.queue.filter(job=>job.id!==id);
    for(const key of this.pending.keys())if(key.startsWith(id+':'))this.pending.delete(key);
    if(this.activeVoice?.id===id)this.stopVoice();
    this.flushQueue();
  }
  resetVoices(){this.setStoneLoop(false);this.cancelVoices();this.gate.reset();this.voiceTime=0;this.playedCues={};this.playedEvents=[];}
  update(time:number){this.voiceTime=time;this.flushQueue();}
  private stopVoice(){const voice=this.activeVoice;this.activeVoice=undefined;if(voice){try{voice.source.stop();}catch{}voice.source.disconnect();voice.gain.disconnect();}}
  private loadCue(url:string){
    let promise=this.buffers.get(url);
    if(!promise){promise=(async()=>{try{const response=await fetch(url);if(!response.ok)throw Error('audio unavailable');return await this.context!.decodeAudioData(await response.arrayBuffer());}catch{if(!this.failedCues.includes(url))this.failedCues.push(url);return undefined;}})();this.buffers.set(url,promise);}
    return promise;
  }
  private validVoice(job:QueuedVoice){return job.generation===this.generation&&job.bossGeneration===(this.bossGenerations.get(job.id)||0)&&(!this.voicePaused||(job.event==='death'&&job.options.allowWhilePaused===true))&&this.volume>0&&this.context?.state==='running'&&(job.options.valid?.()??true)&&(job.options.expiresAt===undefined||this.voiceTime<=job.options.expiresAt);}
  private canInterrupt(event:VoiceEvent){return !!this.activeVoice&&!essentialVoice(this.activeVoice.event)&&(essentialVoice(event)||event==='dodge'||event==='rapidMove');}
  private startVoice(job:QueuedVoice){
    if(!this.validVoice(job)||!this.gate.canPlay(job.id,job.event,this.voiceTime,job.cue.cooldownSeconds,essentialVoice(job.event),job.options.encounter))return false;
    if(this.activeVoice&&!this.canInterrupt(job.event))return false;
    this.stopVoice();const source=this.context!.createBufferSource(),gain=this.context!.createGain();
    const clipVolume=Math.max(0,Math.min(1,job.cue.volume??1));source.buffer=job.buffer;gain.gain.value=this.volume*clipVolume;
    source.connect(gain);gain.connect(this.context!.destination);this.activeVoice={source,gain,id:job.id,event:job.event,clipVolume};
    source.onended=()=>{if(this.activeVoice?.source===source)this.activeVoice=undefined;source.disconnect();gain.disconnect();this.flushQueue();};
    source.start();this.gate.mark(job.id,job.event,this.voiceTime,job.options.encounter);const key=`${job.id}:${job.event}`;this.playedCues[key]=(this.playedCues[key]||0)+1;
    this.playedEvents.push({id:job.id,event:job.event,time:this.voiceTime,audioTime:this.context!.currentTime,duration:job.buffer.duration});if(this.playedEvents.length>200)this.playedEvents.shift();return true;
  }
  private flushQueue(){
    this.queue=this.queue.filter(job=>this.validVoice(job));if(this.activeVoice||!this.queue.length)return;
    const next=this.queue.shift()!;this.startVoice(next);
  }
  async cue(id:EnemyId,event:VoiceEvent,time:number,options:CueOptions={}):Promise<boolean>{
    if(!Number.isFinite(time)||time<0)return false;
    this.voiceTime=Math.max(this.voiceTime,time);
    const cue=this.cues[id]?.[event],key=`${id}:${event}`;
    const critical=essentialVoice(event),resultDeath=event==='death'&&options.allowWhilePaused===true;
    if(!cue||!this.context||(!resultDeath&&(this.context.state!=='running'||this.voicePaused))||this.volume<=0||this.pending.has(key)||
      this.queue.some(job=>job.id===id&&job.event===event)||!(options.valid?.()??true)||
      (this.activeVoice&&!critical&&!this.canInterrupt(event))||!this.gate.canPlay(id,event,time,cue.cooldownSeconds,critical,options.encounter))return false;
    const generation=this.generation,bossGeneration=this.bossGenerations.get(id)||0,pendingJob={generation,bossGeneration};this.pending.set(key,pendingJob);
    try{
      // Victory pauses simulation and suspends audio first; only its death cue may resume here.
      if(resultDeath)await this.context.resume();
      const buffer=await this.loadCue(cue.url);
      if(!buffer)return false;
      const job={id,event,cue,buffer,generation,bossGeneration,options};if(!this.validVoice(job))return false;
      if(critical&&this.activeVoice&&essentialVoice(this.activeVoice.event)){this.queue.push(job);return true;}
      return this.startVoice(job);
    }catch{if(!this.failedCues.includes(cue.url))this.failedCues.push(cue.url);return false;}
    finally{if(this.pending.get(key)===pendingJob)this.pending.delete(key);}
  }
  play(kind:'shot'|'hit'|'hurt'|'level'|'boss'|'win'|'dash') {
    if(!this.context||this.volume<=0||this.context.state!=='running')return;
    const now=this.context.currentTime;
    if((kind==='hit'||kind==='shot')&&now-this.last<0.07)return;
    this.last=now;
    const osc=this.context.createOscillator(),gain=this.context.createGain();
    const frequencies={shot:370,hit:150,hurt:90,level:660,boss:120,win:880,dash:420};
    osc.type=kind==='hurt'||kind==='boss'?'sawtooth':'square';
    osc.frequency.setValueAtTime(frequencies[kind],now);osc.frequency.exponentialRampToValueAtTime(kind==='level'||kind==='win'?1320:60,now+0.16);
    gain.gain.setValueAtTime(this.volume*0.05,now);gain.gain.exponentialRampToValueAtTime(0.0001,now+0.19);
    osc.connect(gain);gain.connect(this.context.destination);osc.start(now);osc.stop(now+0.2);
  }
}
