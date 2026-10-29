import fs from 'node:fs/promises';
import {nowNext,xmlChannels,tvguideProgrammes,plutoProgrammes,miProgrammes,closeMiProgrammes,parseNba,parseMlb,parseEspnVenezuela,text} from './core.mjs';
const root=new URL('../',import.meta.url);
const catalog=JSON.parse(await fs.readFile(new URL('catalog.json',root),'utf8'));
const config=JSON.parse(await fs.readFile(new URL('guide-sources.json',root),'utf8'));
const stamp=new Date().toISOString(),date=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Caracas'}).format(new Date());
const dates=[0,1].map(n=>new Date(Date.parse(date+'T12:00:00Z')+n*86400000).toISOString().slice(0,10));
let old;try{old=JSON.parse(await fs.readFile(new URL('guide.json',root),'utf8'));}catch{}
const guide={schemaVersion:1,updatedAt:stamp,timezone:'America/Caracas',dates,byFeed:{},events:[],rights:config.rights,sourceChecks:[],notice:'Programación publicada por terceros. Se empareja por señal/edición; no certifica el contenido del video ni convierte suscripciones en acceso gratuito.'};
async function request(url,type='json',limit=3_000_000){
  const r=await fetch(url,{signal:AbortSignal.timeout(15000)});if(!r.ok){await r.body?.cancel();throw Error('HTTP '+r.status);}
  const body=await r.text();if(body.length>limit)throw Error('Respuesta demasiado grande');return type==='json'?JSON.parse(body):body;
}
async function job(name,task){try{await task();guide.sourceChecks.push({name,status:'ok',checkedAt:stamp});}catch(e){guide.sourceChecks.push({name,status:'failed',checkedAt:stamp,error:e.message});console.log(name+': '+e.message);}}
const feeds=catalog.channels.flatMap(c=>c.feeds.map(f=>({...f,channelId:c.id})));
await job('TV Guide / mapeo IPTV-org',async()=>{
  const mappings=xmlChannels(await request('https://raw.githubusercontent.com/iptv-org/epg/master/sites/tvguide.com/tvguide.com.channels.xml','text'));
  const matches=feeds.map(f=>{let m=mappings.find(m=>m.xmltv_id===f.id);if(!m&&/@(?:HD|SD|FHD|UHD)$/.test(f.id))m=mappings.find(m=>m.xmltv_id?.split('@')[0]===f.id.split('@')[0]&&/@(?:HD|SD|FHD|UHD)$/.test(m.xmltv_id));return {feed:f,mapping:m};}).filter(x=>x.mapping);
  const pages=[];
  for(let segment=0;segment<6;segment++)await job('TV Guide · tramo '+segment,async()=>{pages.push(await request('https://backend.tvguide.com/tvschedules/tvguide/9100001138/web?start='+(Math.floor(Date.now()/3600000)*3600+segment*14400)+'&duration=240'));});
  const details=new Map();
  for(const {feed,mapping} of matches){
    const items=pages.flatMap(p=>tvguideProgrammes(p,mapping.site_id));
    if(!items.length)continue;
    const current=nowNext(items);
    for(const p of [current.now,current.next].filter(Boolean)){
      if(p.detailUrl?.startsWith('https://backend.tvguide.com/tvschedules/tvguide/programdetails/')){
        if(!details.has(p.detailUrl)){try{details.set(p.detailUrl,await request(p.detailUrl));}catch{details.set(p.detailUrl,null);}}
        const detail=details.get(p.detailUrl)?.data?.item;
        if(detail)p.subtitle=text(detail.episodeTitle||detail.subTitle||'').slice(0,120);
      }
    }
    guide.byFeed[feed.id]={channelId:feed.channelId,source:'TV Guide / IPTV-org',sourceUrl:'https://www.tvguide.com/',edition:mapping.xmltv_id,checkedAt:stamp,items:items.map(({detailUrl,...p})=>p)};
  }
});
for(const mapping of config.miTv){
  if(!feeds.some(f=>f.id===mapping.feedId))continue;
  await job('mi.tv '+mapping.feedId,async()=>{
    const rows=[];for(const day of dates)rows.push(...miProgrammes(await request('https://mi.tv/'+mapping.country+'/async/channel/'+mapping.slug+'/'+day+'/0','text'),day));
    const items=closeMiProgrammes(rows);if(!items.length)throw Error('Sin programación');
    const feed=feeds.find(f=>f.id===mapping.feedId);guide.byFeed[feed.id]={channelId:feed.channelId,source:'mi.tv / configuración IPTV-org',sourceUrl:'https://mi.tv/'+mapping.country+'/canales/'+mapping.slug,edition:mapping.country.toUpperCase(),checkedAt:stamp,items};
  });
}
const plutocache=new Map();
for(const feed of feeds){
  const id=feed.url.match(/\bplu-([a-f0-9]{24})\.m3u8/i)?.[1];if(!id)continue;
  await job('Pluto TV '+feed.id,async()=>{
    if(!plutocache.has(id)){const url='https://api.pluto.tv/v2/channels/'+id+'?start='+encodeURIComponent(dates[0]+'T00:00:00Z')+'&stop='+encodeURIComponent(dates[1]+'T23:59:59Z');plutocache.set(id,plutoProgrammes(await request(url)));}
    const items=plutocache.get(id);if(!items.length)throw Error('Sin programación');
    guide.byFeed[feed.id]={channelId:feed.channelId,source:'Pluto TV',sourceUrl:'https://pluto.tv/',edition:'Pluto '+id,checkedAt:stamp,items};
  });
}
for(const day of dates){
  await job('NBA '+day,async()=>{guide.events.push(...parseNba(await request('https://www.nba.com/games?date='+day,'text'),day));});
  await job('MLB '+day,async()=>{guide.events.push(...parseMlb(await request('https://statsapi.mlb.com/api/v1/schedule?sportId=1&date='+day+'&hydrate=broadcasts,team'),day));});
}
await job('ESPN · programación oficial Venezuela',async()=>{
  const index=await request('https://latinamerica.espnpressroom.com/category/programacion/','text');
  const urls=[...new Set([...index.matchAll(/href=["'](https:\/\/latinamerica\.espnpressroom\.com\/press-releases\/\d{4}\/\d{2}\/programacion-destacada[^"']+)["']/g)].map(x=>x[1]))].slice(0,2);
  if(!urls.length)throw Error('No se encontraron publicaciones de programación');
  for(const url of urls){
    const events=parseEspnVenezuela(await request(url,'text'),url).filter(e=>dates.includes(e.date));
    for(const event of events){
      const words=event.title.toLowerCase().split(/[^a-z0-9áéíóúñ]+/).filter(w=>w.length>3&&!['game','world','series','confirmar','equipos'].includes(w));
      const match=guide.events.find(g=>/^(?:nba|mlb)-/.test(g.id)&&g.league===event.league&&g.date===event.date&&Math.abs(Date.parse(g.start)-Date.parse(event.start))<7200000&&words.filter(w=>g.title.toLowerCase().includes(w)).length>=(event.league==='mlb'&&guide.events.filter(x=>x.league==='mlb'&&x.date===event.date&&x.id.startsWith('mlb-')).length===1?1:2));
      if(match){match.broadcasters.push(...event.broadcasters);match.broadcastsVerifiedFor='VE';match.broadcastSourceUrl=url;}
      else guide.events.push(event);
    }
  }
});
// Never give failed refreshes a fresh timestamp. Existing schedules remain bounded.
for(const [key,value] of Object.entries(old?.byFeed||{}))if(!guide.byFeed[key]&&value.items.some(p=>Date.parse(p.stop)>Date.now()))guide.byFeed[key]={...value,refreshFailed:true};
for(const league of ['nba','mlb'])for(const day of dates)if(!guide.sourceChecks.find(c=>c.name===league.toUpperCase()+' '+day&&c.status==='ok'))guide.events.push(...(old?.events||[]).filter(e=>e.league===league&&e.date===day).map(e=>({...e,refreshFailed:true})));
guide.events=[...new Map(guide.events.map(e=>[e.id,e])).values()].sort((a,b)=>Date.parse(a.start)-Date.parse(b.start));
guide.updatedAtMs=Date.parse(stamp);
for(const entry of Object.values(guide.byFeed)){entry.checkedAtMs=Date.parse(entry.checkedAt);for(const p of entry.items){p.startMs=Date.parse(p.start);p.stopMs=Date.parse(p.stop);}}
for(const event of guide.events){event.startMs=Date.parse(event.start);event.broadcasters=[...new Map(event.broadcasters.map(b=>[b.name+'|'+b.territory,b])).values()];}
guide.coverage={feeds:Object.keys(guide.byFeed).length,channels:new Set(Object.values(guide.byFeed).map(x=>x.channelId)).size,totalChannels:catalog.channels.length,programmes:Object.values(guide.byFeed).reduce((n,c)=>n+c.items.length,0),events:guide.events.length};
await fs.writeFile(new URL('guide.json',root),JSON.stringify(guide));
console.log(JSON.stringify({date,coverage:guide.coverage,sources:guide.sourceChecks.length,failed:guide.sourceChecks.filter(s=>s.status==='failed')},null,2));
