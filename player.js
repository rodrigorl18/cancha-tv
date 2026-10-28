/* Direct HLS playback. No external application, relay, or codec conversion. */
(function(root){
  'use strict';
  class CanchaPlayer {
    constructor(video,options={}){
      this.video=video;this.Hls=options.Hls;this.hooks=options;this.secure=options.secure??root.location?.protocol==='https:';this.timeoutMs=options.timeoutMs??14000;
      this.generation=0;this.attempt=0;this.hls=null;this.timer=null;this.active=false;this.gestureWaiting=false;this.diagnostics=[];this.current=null;
      video.addEventListener('playing',()=>{if(!this.active)return;clearTimeout(this.timer);this.gestureWaiting=false;this.hooks.onPlaying?.(this.current);});
      video.addEventListener('error',()=>{if(this.active&&this.current?.engine==='native'&&video.error)this.fail('native-media-'+video.error.code);});
      video.addEventListener('waiting',()=>{if(this.active&&!this.gestureWaiting)this.armTimeout();});
      video.addEventListener('timeupdate',()=>{if(this.active&&video.readyState>=3&&!video.paused)clearTimeout(this.timer);});
    }
    engines(){
      const result=[];
      // Some Android/Chromium browsers return "maybe" for HLS and then fail.
      // hls.js' documented default is MSE first, native only as a fallback.
      if(this.Hls?.isSupported())result.push('hls');
      if(this.video.canPlayType('application/vnd.apple.mpegurl'))result.push('native');
      return result;
    }
    clean(){
      this.active=false;clearTimeout(this.timer);this.timer=null;
      if(this.hls){const h=this.hls;this.hls=null;h.destroy();}
      this.video.pause();this.video.removeAttribute('src');this.video.load();this.gestureWaiting=false;
    }
    stop(){this.generation++;this.clean();this.current=null;}
    play(feeds,{startIndex=0}={}){
      this.stop();this.diagnostics=[];this.queue=[];
      const engines=this.engines();
      // Try up to two original channel feeds, with at most two engines per feed.
      // Never silently substitute a different channel or leave an infinite retry loop.
      const ordered=[...feeds.slice(startIndex),...feeds.slice(0,startIndex)];
      let count=0;
      for(const feed of ordered){
        if(!/^https?:\/\//i.test(feed.url))continue;
        if(this.secure&&!/^https:/i.test(feed.url)){this.diagnostics.push({code:'http-on-https',signal:feed.name});continue;}
        if(count++>=2)break;
        const index=feeds.indexOf(feed);
        for(const engine of engines)this.queue.push({feed,index,engine});
      }
      this.attempt=0;
      if(!this.queue.length){this.hooks.onFailure?.({code:engines.length?'no-https-signal':'no-supported-engine',diagnostics:this.diagnostics});return;}
      this.next();
    }
    next(){
      this.clean();
      const next=this.queue[this.attempt++];
      if(!next){this.hooks.onFailure?.({code:'attempts-exhausted',diagnostics:this.diagnostics});return;}
      this.current=next;this.active=true;this.recovered=false;
      const generation=this.generation,attempt=this.attempt;
      const valid=()=>this.active&&generation===this.generation&&attempt===this.attempt;
      this.hooks.onAttempt?.({...next,attempt,total:this.queue.length});
      this.hooks.onLevels?.([]);this.armTimeout();
      if(next.engine==='native'){
        this.video.src=next.feed.url;this.startVideo(valid);return;
      }
      try{
        const H=this.Hls;
        const h=this.hls=new H({enableWorker:true,startLevel:0,capLevelToPlayerSize:true,maxBufferLength:15,backBufferLength:5,maxBufferSize:25*1000*1000,manifestLoadingTimeOut:8000,levelLoadingTimeOut:8000,fragLoadingTimeOut:10000,manifestLoadingMaxRetry:0,levelLoadingMaxRetry:1,fragLoadingMaxRetry:1});
        h.on(H.Events.MANIFEST_PARSED,()=>{if(!valid())return;this.hooks.onLevels?.(h.levels);this.startVideo(valid);});
        h.on(H.Events.ERROR,(_event,error)=>{
          if(!valid()||!error.fatal)return;
          if(error.type===H.ErrorTypes?.MEDIA_ERROR&&!this.recovered){this.recovered=true;this.diagnostics.push({code:'media-recovery',engine:'hls',signal:next.feed.name});h.recoverMediaError();this.armTimeout();return;}
          this.fail('hls-'+(error.details||error.type||'fatal'));
        });
        h.attachMedia(this.video);h.loadSource(next.feed.url);
      }catch(error){if(valid())this.fail('hls-init-'+error.name);}
    }
    armTimeout(){
      clearTimeout(this.timer);const generation=this.generation,attempt=this.attempt;
      this.timer=setTimeout(()=>{if(this.active&&generation===this.generation&&attempt===this.attempt)this.fail('startup-or-stall-timeout');},this.timeoutMs);
    }
    async startVideo(valid){
      try{await this.video.play();}
      catch(error){
        if(!valid())return;
        if(error.name==='NotAllowedError'){
          clearTimeout(this.timer);this.gestureWaiting=true;this.hooks.onGesture?.();
        }else if(error.name!=='AbortError')this.fail('play-'+error.name);
      }
    }
    resume(){
      if(!this.active)return;
      const generation=this.generation,attempt=this.attempt;this.gestureWaiting=false;this.armTimeout();
      this.startVideo(()=>this.active&&generation===this.generation&&attempt===this.attempt);
    }
    fail(code){
      if(!this.active)return;
      this.diagnostics.push({code,engine:this.current.engine,signal:this.current.feed.name});
      this.next();
    }
    setQuality(level){if(this.hls)this.hls.currentLevel=level;}
  }
  root.CanchaPlayer=CanchaPlayer;
  if(typeof module!=='undefined'&&module.exports)module.exports=CanchaPlayer;
})(typeof window!=='undefined'?window:globalThis);
