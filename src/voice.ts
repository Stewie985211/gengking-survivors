import type { EnemyId } from './core';

export const VOICE_EVENTS=['hit','rapidMove','phase2','nearDeath','random','barrage','dodge','death'] as const;
export type VoiceEvent=typeof VOICE_EVENTS[number];
export const essentialVoice=(event:VoiceEvent)=>event==='phase2'||event==='nearDeath'||event==='death';
export interface VoiceCue { url:string;cooldownSeconds:number;volume?:number }
export type VoiceCues=Partial<Record<EnemyId,Partial<Record<VoiceEvent,VoiceCue>>>>;

// Cooldowns use simulation time; pausing the game never advances this gate.
export class VoiceGate {
  private last=new Map<string,number>();
  private lastAny=-Infinity;
  constructor(private globalGapSeconds=1.5){}
  private key(id:EnemyId,event:VoiceEvent,encounter?:number){return `${id}:${event}${essentialVoice(event)&&encounter!==undefined?`:${encounter}`:''}`;}
  canPlay(id:EnemyId,event:VoiceEvent,time:number,cooldown:number,priorityOverride=false,encounter?:number) {
    return Number.isFinite(time)&&time>=0&&time>=(this.last.get(this.key(id,event,encounter))??-Infinity)+Math.max(0,cooldown)&&
      (priorityOverride||time>=this.lastAny+this.globalGapSeconds);
  }
  mark(id:EnemyId,event:VoiceEvent,time:number,encounter?:number){this.last.set(this.key(id,event,encounter),time);this.lastAny=time;}
  reset(){this.last.clear();this.lastAny=-Infinity;}
}
