let programmeGuide=null;
const guideTime=ms=>new Date(ms).toLocaleTimeString('es-VE',{timeZone:'America/Caracas',hour:'2-digit',minute:'2-digit',hour12:false});
const guideDate=ms=>new Date(ms).toLocaleString('es-VE',{timeZone:'America/Caracas',weekday:'short',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit',hour12:false});
const programmeTitle=p=>p? p.title+(p.subtitle&&p.subtitle!==p.title?' · '+p.subtitle:''):'';
function guideWindow(channel){
  const feed=channel.id===selected?.id?channel.feeds[currentFeed]:channel.feeds[0];
  const entry=programmeGuide?.byFeed?.[feed?.id];
  if(!entry||Date.now()-entry.checkedAtMs>36*3600000)return null;
  const now=Date.now(),current=entry.items.find(p=>p.startMs<=now&&now<p.stopMs),next=entry.items.find(p=>p.startMs>=(current?.stopMs||now));
  return {entry,now:current,next};
}
function decorateGuide(){
  if(!data)return;
  for(const row of document.querySelectorAll('.channel-card')){
    const c=data.channels.find(c=>c.id===row.dataset.id);if(!c)continue;
    let block=row.querySelector('.row-programme');if(!block){block=document.createElement('div');block.className='row-programme';row.insertBefore(block,row.querySelector('.card-footer'));}
    const w=guideWindow(c);
    block.innerHTML=w?.now?`<strong><i>AHORA</i> ${escapeHtml(programmeTitle(w.now))}</strong><small>${guideTime(w.now.startMs)} — ${guideTime(w.now.stopMs)} · ${escapeHtml(w.entry.edition)}</small><span><i>DESPUÉS</i> ${escapeHtml(w.next?guideTime(w.next.startMs)+' · '+programmeTitle(w.next):'Sin información')}</span>`:'<strong class="no-programme">Sin guía para esta señal</strong><small>Consulta Partidos / dónde ver</small>';
  }
  renderProgramme();
}
function renderProgramme(){
  const box=$('programme-preview');if(!box||!selected)return;const w=guideWindow(selected);
  if(!w?.now){box.innerHTML='<span class="eyebrow">PROGRAMACIÓN</span><h3>Sin guía para esta señal</h3><p>Prueba otra edición en Señal o consulta la agenda de partidos.</p>';return;}
  const p=w.now,progress=Math.min(100,Math.max(0,100*(Date.now()-p.startMs)/(p.stopMs-p.startMs)));
  box.innerHTML=`<span class="eyebrow">AHORA · ${guideTime(p.startMs)} — ${guideTime(p.stopMs)}</span><h3>${escapeHtml(programmeTitle(p))}</h3><progress max="100" value="${progress}" aria-label="Progreso del programa"></progress><p><b>Después ${w.next?guideTime(w.next.startMs):''}</b> · ${escapeHtml(w.next?programmeTitle(w.next):'Sin información')}</p><small>${escapeHtml(w.entry.source)} · ${escapeHtml(w.entry.edition)} · consulta ${guideTime(w.entry.checkedAtMs)} (Venezuela)</small>`;
}
function safeGuideLink(url,label){try{if(new URL(url).protocol==='https:')return `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" class="quiet">${escapeHtml(label)} ↗</a>`;}catch{}return '';}
function channelOptions(ids){return [...new Set(ids||[])].map(id=>data?.channels.find(c=>c.id===id)).filter(Boolean).map(c=>`<button class="quiet" data-guide-channel="${escapeHtml(c.id)}">Probar ${escapeHtml(c.name)}</button>`).join('');}
function showGames(league=['all','favorites'].includes(sport)?'nba':sport){
  if(!programmeGuide){toast('Cargando programación. Intenta de nuevo en unos segundos.');return;}
  modal('<h2>Partidos / dónde ver</h2><p>Horarios de Venezuela. Revisa la edición, el territorio y el acceso de cada emisor.</p><div class="game-filters" id="game-filters"></div><div id="game-results"></div>','AGENDA DEPORTIVA');
  const choices=[{id:'all',name:'Todos'},...programmeGuide.rights];
  $('game-filters').innerHTML=choices.map(r=>`<button class="chip${r.id===league?' active':''}" data-game-league="${escapeHtml(r.id)}">${escapeHtml(r.name)}</button>`).join('');
  $('game-filters').onclick=e=>{const b=e.target.closest('[data-game-league]');if(b)showGames(b.dataset.gameLeague);};
  const events=programmeGuide.events.filter(e=>league==='all'||e.league===league);
  $('game-results').innerHTML=`<p class="guide-stamp">Datos consultados ${escapeHtml(guideDate(programmeGuide.updatedAtMs))}. La agenda puede cambiar.</p>`+(events.length?events.map(e=>`<article class="game-card"><small>${escapeHtml(guideDate(e.startMs))} · ${escapeHtml(e.league.toUpperCase())}${e.refreshFailed?' · Consulta pendiente':''}</small><h3>${escapeHtml(e.title)}</h3>${e.broadcasters.map(b=>`<p><b>${escapeHtml(b.name)}</b><br><span>${escapeHtml(b.territory)}</span>${b.digitalOnly?'<br>Emisión digital; sin canal lineal confirmado.':''}</p>`).join('')||'<p>Emisor por confirmar</p>'}<p class="game-territory">${e.broadcastsVerifiedFor==='VE'?'Programación publicada para Venezuela':'La fuente está localizada en '+escapeHtml(e.sourceCountry)+'. Revisa la disponibilidad en Venezuela.'}</p><div class="game-actions">${safeGuideLink(e.broadcastSourceUrl||e.sourceUrl,'Fuente oficial')}${channelOptions(e.broadcasters.flatMap(b=>b.channelIds||[]))}</div></article>`).join(''):'<p>No hay partidos publicados en las fuentes consultadas para estas fechas.</p>')+
  '<h3 class="providers-heading">Emisores y servicios</h3>'+programmeGuide.rights.filter(r=>league==='all'||r.id===league).flatMap(r=>r.providers.map(p=>`<article class="game-card provider-card"><small>${escapeHtml(r.name)} / ${escapeHtml(p.territory)}</small><h3>${escapeHtml(p.name)}</h3><p>${escapeHtml(p.coverage)}</p><p><b>Acceso:</b> ${escapeHtml(p.access)}</p><div class="game-actions">${safeGuideLink(p.url,'Servicio oficial')}${channelOptions(p.channelIds)}</div></article>`)).join('');
}
document.addEventListener('click',e=>{if(e.target.closest('[data-open-games]')){showGames();return;}const b=e.target.closest('[data-guide-channel]');if(b){closeModal();selectChannel(b.dataset.guideChannel,true);}});
async function refreshProgrammeGuide(){try{const r=await fetch(new URL('guide.json',document.baseURI),{cache:'no-cache'});if(!r.ok)throw Error();const g=await r.json();if(g.schemaVersion!==1||!g.byFeed||!Array.isArray(g.events))throw Error();programmeGuide=g;decorateGuide();}catch{if(!programmeGuide)$('programme-preview').textContent='No se pudo cargar la guía. Los canales siguen disponibles.';}}
refreshProgrammeGuide();setInterval(refreshProgrammeGuide,15*60000);setInterval(decorateGuide,60000);
