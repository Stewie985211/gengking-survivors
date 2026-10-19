import manifest from '../assets/manifest.json';
const urls=import.meta.glob('/assets/{characters,items,enemies}/*.{png,jpg}',{eager:true,query:'?url',import:'default'}) as Record<string,string>;
export const ASSETS=manifest.assets.filter(a=>a.enabled).map(a=>({...a,url:urls['/'+a.path]}));
export const asset=(id:string)=>ASSETS.find(a=>a.id===id);
export function icon(id:string, className='') {const a=asset(id);return a?`<img class="${className}" src="${a.url}" alt="${a.label}" draggable="false">`:`<span class="fallback-icon ${className}">✦</span>`;}
export function portrait(id:string, className='') {
  const a=asset(id);if(!a)return '<span>?</span>';
  const r=a.sourceRect; if(!r)return icon(id,className);
  const size=a.sourceSize||[id==='mabaoguo'?640:id==='laoda-smile'?1317:1283,id==='mabaoguo'?890:id==='laoda-smile'?1310:1273];
  return `<svg class="${className}" viewBox="${r.join(' ')}" aria-label="${a.label}" role="img" overflow="hidden"><defs><clipPath id="clip-${id}-${className}"><rect x="${r[0]}" y="${r[1]}" width="${r[2]}" height="${r[3]}"/></clipPath></defs><image href="${a.url}" width="${size[0]}" height="${size[1]}" clip-path="url(#clip-${id}-${className})"/></svg>`;
}
