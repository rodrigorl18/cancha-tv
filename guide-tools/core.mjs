export const text = value => String(value ?? '').replace(/<[^>]*>/g,' ').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;|&apos;/g,"'").replace(/&nbsp;/g,' ').replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(Number(n))).replace(/\s+/g,' ').trim();
export function normalizeProgrammes(items) {
  const seen=new Set();
  return items.filter(p=>p.title&&Number.isFinite(Date.parse(p.start))&&Number.isFinite(Date.parse(p.stop))&&Date.parse(p.stop)>Date.parse(p.start))
    .sort((a,b)=>Date.parse(a.start)-Date.parse(b.start)).filter(p=>{const key=p.start+'|'+p.stop+'|'+p.title;if(seen.has(key))return false;seen.add(key);return true;});
}
export function nowNext(items,now=Date.now()) {
  const valid=normalizeProgrammes(items);
  const current=valid.find(p=>Date.parse(p.start)<=now&&now<Date.parse(p.stop))||null;
  const next=valid.find(p=>Date.parse(p.start)>=(current?Date.parse(current.stop):now))||null;
  return {now:current,next};
}
export function xmlChannels(xml) {
  return [...xml.matchAll(/<channel\b([^>]*)>([\s\S]*?)<\/channel>/g)].map(m=>({...Object.fromEntries([...m[1].matchAll(/([\w-]+)="([^"]*)"/g)].map(a=>[a[1],text(a[2])])),name:text(m[2])}));
}
export function tvguideProgrammes(data,id) {
  const entry=data?.data?.items?.find(x=>String(x.channel?.sourceId)===String(id));
  return normalizeProgrammes((entry?.programSchedules||[]).map(p=>({title:text(p.title),subtitle:'',start:new Date(p.startTime*1000).toISOString(),stop:new Date(p.endTime*1000).toISOString(),detailUrl:p.programDetails||null})));
}
export function plutoProgrammes(data) {
  return normalizeProgrammes((data.timelines||[]).map(p=>({title:text(p.title),subtitle:text(p.episode?.name).slice(0,120),start:p.start,stop:p.stop})));
}
export function miProgrammes(html,date) {
  const listing=html.split(/id=["']listings["']/)[1];
  if(!listing)return [];
  const result=[];let days=0,previous=-1;
  for(const match of listing.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/g)){
    const body=match[1], raw=text(body.match(/<span[^>]*class=["'][^"']*\btime\b[^"']*["'][^>]*>([\s\S]*?)<\/span>/)?.[1]);
    const time=raw.match(/(\d{1,2}):(\d{2})\s*(am|pm)?/i);if(!time)continue;
    let hour=Number(time[1]);if(time[3])hour=hour%12+(time[3].toLowerCase()==='pm'?12:0);
    const minute=hour*60+Number(time[2]);if(minute<previous)days++;previous=minute;
    const start=new Date(Date.parse(date+'T00:00:00Z')+(days*1440+minute)*60000).toISOString();
    const title=text(body.match(/<h2[^>]*>([\s\S]*?)<\/h2>/)?.[1]);if(title)result.push({title,subtitle:text(body.match(/<span[^>]*class=["'][^"']*sub-title[^"']*["'][^>]*>([\s\S]*?)<\/span>/)?.[1]).slice(0,120),start});
  }
  return result;
}
export function closeMiProgrammes(items) {
  const sorted=[...new Map(items.map(p=>[p.start,p])).values()].sort((a,b)=>Date.parse(a.start)-Date.parse(b.start));
  return normalizeProgrammes(sorted.slice(0,-1).map((p,i)=>({...p,stop:sorted[i+1].start})));
}
export function parseNba(html,date) {
  const match=html.match(/<script[^>]*id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/);
  if(!match)throw Error('NBA: datos de agenda ausentes');
  const page=JSON.parse(match[1]).props?.pageProps;
  if(page?.selectedDate!==date)throw Error('NBA: la fecha devuelta no coincide');
  const country=page.headers?.countryCode||'no indicada';
  const cards=(page.gameCardFeed?.modules||[]).flatMap(m=>m.cards||[]).filter(c=>c.cardType==='game').map(c=>c.cardData);
  return [...new Map(cards.map(g=>{
    const broadcasters=[];
    for(const [group,items] of Object.entries(g.broadcasters||{})){
      if(/Radio/i.test(group)||!Array.isArray(items))continue;
      for(const b of items){const name=text(b.broadcasterDisplayName);if(name&&!broadcasters.some(x=>x.name===name))broadcasters.push({name,scope:group,territory:/subscription/i.test(group)?'Según disponibilidad del servicio':/intl/i.test(group)?'Internacional; fuente localizada en '+country:'EE. UU. / Canadá; no confirma Venezuela'});}
    }
    const url=g.shareUrl&&g.shareUrl.startsWith('https://www.nba.com/game/')?g.shareUrl:'https://www.nba.com/games?date='+date;
    return [g.gameId,{id:'nba-'+g.gameId,league:'nba',title:text(g.awayTeam?.teamName)+' vs. '+text(g.homeTeam?.teamName),start:g.gameTimeUtc,sourceUrl:url,sourceCountry:country,broadcasters,status:text(g.gameStatusText),date}];
  })).values()];
}
export function parseMlb(data,date) {
  return (data.dates||[]).flatMap(d=>d.games||[]).map(g=>({id:'mlb-'+g.gamePk,league:'mlb',date,title:g.teams.away.team.name+' vs. '+g.teams.home.team.name,start:g.gameDate,sourceUrl:'https://www.mlb.com/gameday/'+g.gamePk,status:g.status?.detailedState||'',sourceCountry:'US',broadcasters:[...new Map((g.broadcasts||[]).filter(b=>b.type==='TV').map(b=>[b.name,{name:b.name,territory:'Feed de MLB; territorio del emisor por confirmar para Venezuela',scope:b.isNational?'national-tv':'regional-tv',language:b.language}])).values()]}));
}
export function parseEspnVenezuela(html,url) {
  const section=html.split(/<h2[^>]*id=["']VENEZUELA["'][^>]*>/i)[1]?.split(/<h2\b/i)[0];
  if(!section)throw Error('ESPN: sección Venezuela ausente');
  const published=html.match(/property=["']article:published_time["'][^>]*content=["']([^"']+)/)?.[1]||html.match(/content=["']([^"']+)["'][^>]*property=["']article:published_time/)?.[1];
  const year=Number(url.match(/\/press-releases\/(\d{4})\//)?.[1]);
  const month=Number(url.match(/\/press-releases\/\d{4}\/(\d{2})\//)?.[1]);
  if(!year||!month)throw Error('ESPN: fecha de publicación desconocida');
  const anchor=published?Date.parse(published):Date.UTC(year,month-1,15);
  const lines=section.replace(/<br\s*\/?\s*>|<\/p>|<\/h2>|<p\b[^>]*>/gi,'\n').split('\n').map(text).filter(Boolean);
  const events=[];let dayDate;
  for(const line of lines){
    const day=line.match(/^(?:Lunes|Martes|Mi[eé]rcoles|Jueves|Viernes|S[aá]bado|Domingo)\s+(\d{1,2})$/i);
    if(day){const options=[-1,0,1].map(n=>new Date(Date.UTC(year,month-1+n,Number(day[1]),12))).filter(d=>Math.abs(d-anchor)<12*86400000);dayDate=options.sort((a,b)=>Math.abs(a-anchor)-Math.abs(b-anchor))[0]?.toISOString().slice(0,10);continue;}
    const row=line.match(/^(\d{2}:\d{2})\s+(.+)$/);if(!row||!dayDate)continue;
    const parts=row[2].split(/\s+\/\s+/);if(parts.length<2)continue;
    const title=parts.pop(),carrier=parts.join(' / ');
    const league=/\bNBA\b/i.test(title)?'nba':/\bMLB\b/i.test(title)?'mlb':/\bNFL\b/i.test(title)?'nfl':/\bF1\b/i.test(title)?'f1':/Tenis|Tennis/i.test(title)?'tenis':/Knockout|Boxing|LFA|MMA|UFC/i.test(title)?'combate':/Premier|LaLiga|Serie A|Bundesliga|Ligue 1|Champions|LPF|Liga MX|Messi Cup|EFL|FIPFA/i.test(title)?'futbol':'otros';
    const start=new Date(dayDate+'T'+row[1]+':00-04:00').toISOString();
    const digitalOnly=/ESPN\s+en\s+Disney/i.test(carrier);
    const channelIds=digitalOnly?[]:[...carrier.matchAll(/\bESPN\s*([2-7])?\b/gi)].map(m=>'ESPN'+(m[1]||'')+'LatinAmerica.us');
    events.push({id:'espn-'+Date.parse(start)+'-'+title.toLowerCase().replace(/[^a-z0-9]+/g,'-').slice(0,80),league,date:dayDate,title,start,sourceUrl:url,sourceCountry:'VE',broadcastsVerifiedFor:'VE',broadcasters:[{name:carrier,territory:'Venezuela',scope:'country-confirmed',channelIds:[...new Set(channelIds)],digitalOnly}],notice:'Programación oficial sujeta a cambios; el plan y la señal deben coincidir.'});
  }
  return events;
}
