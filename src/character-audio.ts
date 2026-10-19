import manifest from '../assets/audio/manifest.json';
import { PEOPLE, type PersonId } from './core';
import { VOICE_EVENTS, type VoiceCue, type VoiceCues, type VoiceEvent } from './voice';

const urls=import.meta.glob('/assets/audio/*.{mp3,wav,ogg,m4a}',{eager:true,query:'?url',import:'default'}) as Record<string,string>;
type Binding={file:string;cooldownSeconds?:number;volume?:number};
type CharacterBindings=Partial<Record<VoiceEvent,Binding>>;
const characters=manifest.characters as Partial<Record<PersonId,CharacterBindings>>;
const shared=manifest.shared as CharacterBindings;
export const CHARACTER_AUDIO_CUES:VoiceCues={};
export const VOICE_GLOBAL_GAP=manifest.defaults.globalGapSeconds;
export const AUDIO_CUE_ISSUES:string[]=[];
const stoneBinding=manifest.loops.lectureStone;
export const LECTURE_STONE_AUDIO={url:urls[`/assets/audio/${stoneBinding.file}`],volume:stoneBinding.volume};
if(!LECTURE_STONE_AUDIO.url)AUDIO_CUE_ISSUES.push(`lectureStone:${stoneBinding.file}`);
for(const person of PEOPLE){
  const id=person.id as PersonId,bindings={...shared,...characters[id]};
  for(const event of VOICE_EVENTS){
    const binding=bindings[event];if(!binding)continue;
    const url=urls[`/assets/audio/${binding.file}`];if(!url){AUDIO_CUE_ISSUES.push(`${id}:${event}:${binding.file}`);continue;}
    const cue:VoiceCue={url,cooldownSeconds:binding.cooldownSeconds??manifest.defaults.cooldownSeconds,volume:binding.volume??manifest.defaults.volume};
    CHARACTER_AUDIO_CUES[id]??={};CHARACTER_AUDIO_CUES[id]![event]=cue;
  }
}
