(function(){
var $=function(i){return document.getElementById(i)};
var S={lists:[{id:'l1',name:'Playlist 1',q:[],cur:-1}],active:'l1'};
try{var s=JSON.parse(localStorage.getItem('occra_v1')||'null');if(s&&s.lists&&s.lists.length)S=s}catch(e){}
S.lists.forEach(function(l){l.name=l.name.replace(/^Danh sách /,'Playlist ');l.q.forEach(function(it){if(it.title&&it.title.indexOf('Đang tải')===0)it.title='Loading title…'})});
var shuffle=false,repeat=false,player=null,ready=false,dragFrom=-1,results=null;
function save(){try{localStorage.setItem('occra_v1',JSON.stringify(S))}catch(e){}}
function L(){return S.lists.filter(function(l){return l.id===S.active})[0]||S.lists[0]}
function fmt(t){t=Math.floor(t||0);return Math.floor(t/60)+':'+('0'+t%60).slice(-2)}
function msg(t){$('msg').textContent=t;if(t)setTimeout(function(){if($('msg').textContent===t)$('msg').textContent=''},4000)}
function fill(el,p){el.style.setProperty('--p',p+'%')}
function parseId(s){var m=s.match(/(?:v=|youtu\.be\/|embed\/|shorts\/|live\/)([\w-]{11})/);if(m)return m[1];return /^[\w-]{11}$/.test(s)?s:null}
function api(path,params){
  if(API.indexOf('YOUR-WORKER')>-1){msg('Set API in config.js to your Worker URL first');return Promise.reject()}
  var qs=Object.keys(params).filter(function(k){return params[k]}).map(function(k){return k+'='+encodeURIComponent(params[k])}).join('&');
  return fetch(API+'/'+path+'?'+qs).then(function(r){return r.json()}).then(function(d){
    if(d.error){var em=(d.error.message||'').replace(/<[^>]+>/g,'');
      if(/playlist/i.test(em)&&/not be found|cannot be found/i.test(em))msg('This playlist is private or does not exist. For private playlists, use Import from YouTube.');
      else msg('API error: '+em.slice(0,80));
      throw 0}return d}).catch(function(e){if(e)msg('Cannot reach the server');throw 0});
}

/* ---- Google sign-in: the user's own YouTube playlists (token stays in memory, goes only to Google) ---- */
var gtoken=null,gclient=null;
function signIn(cb){
  if(GOOGLE_CLIENT_ID.indexOf('YOUR-CLIENT-ID')>-1){msg('Set GOOGLE_CLIENT_ID in config.js first');return}
  if(!window.google||!google.accounts){msg('Google sign-in is still loading, try again');return}
  if(gtoken){cb();return}
  gclient=gclient||google.accounts.oauth2.initTokenClient({client_id:GOOGLE_CLIENT_ID,scope:'https://www.googleapis.com/auth/youtube.readonly',
    callback:function(r){if(r.error){msg('Sign-in cancelled');return}gtoken=r.access_token;setTimeout(function(){gtoken=null},(r.expires_in-60)*1000);cb()}});
  gclient.requestAccessToken();
}
function gapi(path,params){
  var qs=Object.keys(params).filter(function(k){return params[k]}).map(function(k){return k+'='+encodeURIComponent(params[k])}).join('&');
  return fetch('https://www.googleapis.com/youtube/v3/'+path+'?'+qs,{headers:{Authorization:'Bearer '+gtoken}}).then(function(r){return r.json()}).then(function(d){
    if(d.error){if(d.error.code===401)gtoken=null;msg('YouTube error: '+(d.error.message||'').replace(/<[^>]+>/g,'').slice(0,160));throw 0}return d});
}
function showMine(){
  msg('Loading your playlists…');
  Promise.all([gapi('playlists',{part:'snippet,contentDetails',mine:'true',maxResults:50}),gapi('channels',{part:'contentDetails',mine:'true'}).catch(function(){return{items:[]}})]).then(function(a){
    var out=[],ch=a[1].items&&a[1].items[0],likes=ch&&ch.contentDetails.relatedPlaylists.likes;
    if(likes)out.push({pl:likes,title:'Liked videos',by:'Your likes'});
    (a[0].items||[]).forEach(function(p){out.push({pl:p.id,title:p.snippet.title,by:p.contentDetails.itemCount+' videos',thumb:(p.snippet.thumbnails&&p.snippet.thumbnails.default||{}).url})});
    out.hdr='Your YouTube playlists';results=out;msg(out.length?'Click a playlist to import it':'No playlists found');render();
  }).catch(function(){});
}
function importMine(it,tok,acc){
  acc=acc||[];msg('Importing "'+it.title.slice(0,30)+'"…');
  gapi('playlistItems',{part:'snippet',maxResults:50,playlistId:it.pl,pageToken:tok}).then(function(d){
    d.items.forEach(function(x){var sn=x.snippet;if(!sn.resourceId||/^(Private|Deleted) video$/.test(sn.title))return;
      acc.push({id:sn.resourceId.videoId,title:sn.title,by:(sn.videoOwnerChannelTitle||'').replace(' - Topic','')})});
    if(d.nextPageToken&&acc.length<300)importMine(it,d.nextPageToken,acc);
    else{
      var id='l'+Date.now();S.lists.push({id:id,name:it.title,q:[],cur:-1});S.active=id;results=null;if(ready)player.stopVideo();
      addItems(acc);msg('Imported '+acc.length+' tracks into "'+it.title.slice(0,30)+'"');
    }
  }).catch(function(){});
}

/* ---- adding ---- */
function addItems(arr){
  var l=L(),first=l.q.length;
  arr.forEach(function(x){l.q.push(x)});
  if(l.cur<0&&ready&&arr.length)play(first);
  save();render();
}
function addIds(ids){
  var items=ids.map(function(id){
    var it={id:id,title:'Loading title…',by:''};
    fetch('https://noembed.com/json?url='+encodeURIComponent('https://www.youtube.com/watch?v='+id)).then(function(r){return r.json()})
      .then(function(d){it.title=d.title||('Video '+id);it.by=d.author_name||'';save();render()}).catch(function(){it.title='Video '+id;render()});
    return it});
  addItems(items);
}
function importPlaylist(pid,tok,acc){
  acc=acc||[];msg('Importing playlist…');
  api('playlist',{id:pid,pageToken:tok}).then(function(d){
    d.items.forEach(function(x){acc.push(x)});
    if(d.next&&acc.length<300)importPlaylist(pid,d.next,acc);
    else{addItems(acc);msg('Added '+acc.length+' tracks from playlist')}
  }).catch(function(){});
}
function search(qs){
  msg('Searching…');
  api('search',{q:qs}).then(function(d){results=d.items;msg('');render()}).catch(function(){});
}
function submit(){
  var v=$('url').value.trim();if(!v)return;
  var lm=v.match(/[?&]list=([\w-]+)/);
  if(lm&&!/^RD/.test(lm[1])){importPlaylist(lm[1]);$('url').value='';return}
  var toks=v.split(/[\s,]+/).filter(Boolean),ids=toks.map(parseId);
  if(ids.every(Boolean)){results=null;addIds(ids);$('url').value='';return}
  results=null;search(v);
}

/* ---- render ---- */
function render(){
  var l=L();
  if(document.activeElement!==$('plname'))$('plname').value=l.name;
  renderDD();
  var ul=$('list');ul.innerHTML='';
  var src=results||l.q;
  $('hd').textContent=results?(results.hdr||'Search results'):'Queue · '+l.q.length+(l.q.length===1?' track':' tracks');
  $('back').style.display=results?'inline':'none';
  if(!src.length){
    var h=document.createElement('div');h.className='hint';
    if(results)h.textContent='No results';
    else{
      var hp=document.createElement('div');hp.className='hh';hp.textContent='This playlist is empty';h.appendChild(hp);
      [['Search or paste a link',function(){$('url').focus()}],['Import from YouTube',function(){$('mine').click()}],['How to use Occra',openHelp]].forEach(function(a){
        var b=document.createElement('button');b.className='hb';b.textContent=a[0];b.onclick=a[1];h.appendChild(b)});
    }
    ul.appendChild(h);
  }
  src.forEach(function(it,i){
    var li=document.createElement('li'),isCur=!results&&i===l.cur;if(isCur)li.className='cur';
    var im=document.createElement('img');var tsrc=it.pl?it.thumb:'https://i.ytimg.com/vi/'+it.id+'/default.jpg';if(tsrc)im.src=tsrc;im.alt='';
    var tx=document.createElement('span');tx.className='tx';
    var t=document.createElement('span');t.className='t';t.textContent=it.title;
    var by=document.createElement('span');by.className='by';by.textContent=it.by||'';
    tx.append(t,by);
    if(results){
      var b=document.createElement('button');b.textContent=it.pl?'↓':'+';b.className='ib';b.style.cssText='width:30px;height:30px;flex:none';
      li.append(im,tx,b);
      li.onclick=function(){if(it.pl){importMine(it);return}addItems([{id:it.id,title:it.title,by:it.by}]);msg('Added: '+it.title.slice(0,40))};
    }else{
      var g=document.createElement('span');g.className='grip';g.textContent='⠿';
      var n=document.createElement('span');n.className='n';n.textContent=isCur?'▶':i+1;
      var a=document.createElement('span');a.className='acts';
      [['▲',function(){move(i,i-1)}],['▼',function(){move(i,i+1)}],['✕',function(){del(i)}]].forEach(function(b){
        var x=document.createElement('button');x.textContent=b[0];x.onclick=function(e){e.stopPropagation();b[1]()};a.appendChild(x)});
      li.append(g,n,im,tx,a);li.draggable=true;
      li.onclick=function(){play(i)};
      li.ondragstart=function(e){dragFrom=i;li.classList.add('drag');e.dataTransfer.effectAllowed='move';try{e.dataTransfer.setData('text/plain',''+i)}catch(x){}};
      li.ondragend=function(){dragFrom=-1;render()};
      li.ondragover=function(e){e.preventDefault();li.classList.add('over')};
      li.ondragleave=function(){li.classList.remove('over')};
      li.ondrop=function(e){e.preventDefault();if(dragFrom>-1)move(dragFrom,i)};
    }
    ul.appendChild(li);
  });
  var c=ul.querySelector('.cur');if(c)c.scrollIntoView({block:'nearest',behavior:'smooth'});
  var it=l.q[l.cur];
  $('title').textContent=it?it.title:'—';
  $('sub').textContent=it?(it.by||'YouTube'):'Nothing playing';
  $('empty').style.display=it?'none':'grid';
}
function move(a,b){var l=L();if(b<0||b>=l.q.length||a===b)return;var ci=l.q[l.cur],x=l.q.splice(a,1)[0];l.q.splice(b,0,x);l.cur=ci?l.q.indexOf(ci):-1;save();render()}
function del(i){
  var l=L(),was=i===l.cur;l.q.splice(i,1);
  if(was){l.cur=-1;if(l.q.length)play(Math.min(i,l.q.length-1));else if(ready)player.stopVideo()}
  else if(i<l.cur)l.cur--;
  save();render();
}

/* ---- player ---- */
window.onYouTubeIframeAPIReady=function(){
  player=new YT.Player('yt',{width:'100%',height:'100%',playerVars:{playsinline:1,rel:0,modestbranding:1,controls:0,disablekb:1,cc_load_policy:0,iv_load_policy:3},
    events:{onReady:function(){ready=true;player.setVolume($('vol').value);var l=L();if(l.cur>=0&&l.q[l.cur])player.cueVideoById(l.q[l.cur].id);render()},
      onStateChange:onState,onError:function(){msg('This video can\'t be played, skipped');next(true)}}});
};
var tag=document.createElement('script');tag.src='https://www.youtube.com/iframe_api';document.head.appendChild(tag);
function play(i){var l=L();if(i<0||i>=l.q.length)return;l.cur=i;save();render();if(ready)player.loadVideoById(l.q[i].id)}
var msSet=false;
function mediaSession(it){
  if(!('mediaSession' in navigator))return;
  navigator.mediaSession.metadata=new MediaMetadata({title:it.title,artist:it.by||'YouTube',album:'Occra',artwork:[{src:'https://i.ytimg.com/vi/'+it.id+'/hqdefault.jpg',sizes:'480x360',type:'image/jpeg'}]});
  if(msSet)return;msSet=true;
  [['play',function(){player.playVideo()}],['pause',function(){player.pauseVideo()}],['nexttrack',next],['previoustrack',prev]].forEach(function(h){try{navigator.mediaSession.setActionHandler(h[0],h[1])}catch(e){}});
}
function next(){
  var l=L(),n;if(!l.q.length)return;
  if(shuffle&&l.q.length>1){do{n=Math.floor(Math.random()*l.q.length)}while(n===l.cur)}
  else{n=l.cur+1;if(n>=l.q.length){if(repeat)n=0;else return}}
  play(n);
}
function prev(){var l=L();if(player&&player.getCurrentTime()>3){player.seekTo(0);return}play(l.cur>0?l.cur-1:(repeat?l.q.length-1:0))}
function onState(e){
  var l=L(),it=l.q[l.cur];
  $('pp').textContent=e.data===1?'⏸':'▶';
  if(e.data===1&&it)mediaSession(it);
  if(e.data===1){try{player.unloadModule('captions');player.unloadModule('cc')}catch(x){}}
  if(e.data===1&&it){var d=player.getVideoData();
    if(d.title&&(!it.by||it.title.indexOf('Loading')===0||it.title.indexOf('Video ')===0)){it.title=d.title;it.by=d.author||it.by;save();render()}}
  if(e.data===0){if(repeat&&l.q.length===1){player.seekTo(0);player.playVideo()}else next()}
}
setInterval(function(){
  if(!ready||!player.getDuration)return;
  var d=player.getDuration(),c=player.getCurrentTime(),sk=$('seek');
  if(d&&!sk.dataset.drag){sk.value=c/d*1000;fill(sk,c/d*100)}
  $('cur').textContent=fmt(c);$('dur').textContent=fmt(d);
},500);

/* ---- styled dialog (replaces the browser's prompt/confirm) ---- */
function dialog(o){
  return new Promise(function(res){
    var m=$('modal'),inp=$('mInput'),ok=$('mOk'),cancel=$('mCancel');
    $('mTitle').textContent=o.title;$('mText').textContent=o.text||'';$('mText').style.display=o.text?'':'none';
    inp.style.display=o.input?'':'none';inp.value=o.value||'';inp.placeholder=o.placeholder||'';
    ok.textContent=o.ok||'OK';ok.className='mo'+(o.danger?' danger':'');
    m.hidden=false;if(o.input){inp.focus();inp.select()}else ok.focus();
    function done(v){m.hidden=true;m.onkeydown=m.onclick=ok.onclick=cancel.onclick=null;res(v)}
    function accept(){if(o.input){var v=inp.value.trim();if(!v){inp.focus();return}done(v)}else done(true)}
    ok.onclick=accept;
    cancel.onclick=function(){done(o.input?null:false)};
    m.onclick=function(e){if(e.target===m)cancel.onclick()};
    m.onkeydown=function(e){if(e.key==='Escape'){e.preventDefault();cancel.onclick()}else if(e.key==='Enter'&&e.target.tagName!=='BUTTON'){e.preventDefault();accept()}};
  });
}

/* ---- playlist dropdown (custom, styled) ---- */
function renderDD(){
  var l=L(),m=$('ddm');$('ddt').textContent=l.name;m.innerHTML='';
  S.lists.forEach(function(x){
    var it=document.createElement('div');it.className='ddi'+(x.id===l.id?' on':'');it.setAttribute('role','option');it.tabIndex=-1;
    var d=document.createElement('i'),n=document.createElement('span'),c=document.createElement('span');
    n.className='ddn';n.textContent=x.name;c.className='ddc';c.textContent=x.q.length;
    it.append(d,n,c);it.onclick=function(){pick(x.id)};m.appendChild(it);
  });
}
function openDD(){$('ddm').hidden=false;$('ddb').setAttribute('aria-expanded','true');$('ddb').classList.add('open');var on=$('ddm').querySelector('.on');if(on)on.scrollIntoView({block:'nearest'})}
function closeDD(){$('ddm').hidden=true;$('ddb').setAttribute('aria-expanded','false');$('ddb').classList.remove('open')}
function pick(id){
  closeDD();if(id===S.active)return;
  S.active=id;results=null;var l=L();save();render();
  if(ready){if(l.cur>=0&&l.q[l.cur])player.cueVideoById(l.q[l.cur].id);else player.stopVideo()}
}

/* ---- help guide ---- */
var HELP=[
{t:'Add a song',x:'Type a song name in the box on the right, or paste a YouTube link, then press Add. Search results appear in the list below, so click one to add it to your playlist.',i:`<svg viewBox="0 0 400 190"><rect class="a" x="30" y="22" width="270" height="34" rx="10"/><text x="44" y="43">lofi hip hop, or paste a link…</text><rect class="o" x="310" y="22" width="60" height="34" rx="10"/><text class="d" x="340" y="43" text-anchor="middle">Add</text>
<rect class="a" x="30" y="76" width="340" height="44" rx="10"/><rect class="o" x="30" y="86" width="3" height="24" rx="1.5"/><rect class="l" x="46" y="84" width="40" height="28" rx="5"/><text class="t" x="98" y="97" style="font-size:12px;font-weight:700">Song title</text><text class="s" x="98" y="110">Artist</text><text class="s" x="350" y="102" text-anchor="end">▶</text>
<rect class="a" x="30" y="128" width="340" height="44" rx="10" style="opacity:.6"/><rect class="l" x="46" y="136" width="40" height="28" rx="5"/><text x="98" y="149" style="font-size:12px">Another song</text><text class="s" x="98" y="162">Artist</text></svg>`},
{t:'Import a public playlist',x:'Paste a YouTube playlist link (the one containing list=) into the same box. Occra imports up to 300 tracks into your current playlist. This works for public and unlisted playlists.',i:`<svg viewBox="0 0 400 190"><rect class="a" x="30" y="22" width="270" height="34" rx="10"/><text x="44" y="43" style="font-size:10.5px">youtube.com/playlist?list=PLxxxxxxxx</text><rect class="o" x="310" y="22" width="60" height="34" rx="10"/><text class="d" x="340" y="43" text-anchor="middle">Add</text>
<path class="so" d="M200 62v14m-5-5l5 5 5-5"/>
<rect class="a" x="30" y="86" width="340" height="14" rx="6"/><rect class="a" x="30" y="106" width="340" height="14" rx="6" style="opacity:.8"/><rect class="a" x="30" y="126" width="340" height="14" rx="6" style="opacity:.6"/><rect class="a" x="30" y="146" width="340" height="14" rx="6" style="opacity:.4"/>
<text class="s" x="370" y="176" text-anchor="end">public &amp; unlisted · up to 300 tracks</text></svg>`},
{t:'Import private playlists & Liked videos',x:'Click Import from YouTube at the top right and sign in with Google. Your playlists show up in the list, so click one to bring it into a new Occra playlist.',i:`<svg viewBox="0 0 400 190"><text x="30" y="40" style="font-size:11px">Sign in with Google</text><text class="s" x="30" y="55">then pick a playlist →</text><rect class="o" x="210" y="22" width="160" height="34" rx="10"/><text class="d" x="290" y="43" text-anchor="middle">Import from YouTube</text>
<rect class="a" x="30" y="74" width="340" height="30" rx="9"/><text class="t" x="44" y="93" style="font-size:12px;font-weight:700">Liked videos</text><rect class="l" x="334" y="80" width="24" height="18" rx="6"/><text x="346" y="93" text-anchor="middle" style="fill:var(--w)">↓</text>
<rect class="a" x="30" y="110" width="340" height="30" rx="9"/><text x="44" y="129" style="font-size:12px">Road trip · 42 videos</text><rect class="so" x="334" y="116" width="24" height="18" rx="6"/><text x="346" y="129" text-anchor="middle" style="fill:var(--o)">↓</text>
<rect class="a" x="30" y="146" width="340" height="30" rx="9" style="opacity:.7"/><text x="44" y="165" style="font-size:12px">Study mix · 120 videos</text><rect class="l" x="334" y="152" width="24" height="18" rx="6"/><text x="346" y="165" text-anchor="middle" style="fill:var(--w)">↓</text></svg>`,note:true},
{t:'Organize your playlists',x:'Drag tracks to reorder them, or use the ▲ ▼ buttons. Click the playlist name to rename it, and use the menu to switch between playlists or create new ones.',i:`<svg viewBox="0 0 400 190"><rect class="a" x="30" y="16" width="200" height="30" rx="9"/><text x="44" y="35" style="fill:var(--w);font-size:12px">Playlist 1</text><text x="214" y="35" style="font-size:12px">▾</text><rect class="a" x="240" y="16" width="30" height="30" rx="9"/><text x="255" y="36" text-anchor="middle" style="font-size:14px">+</text>
<rect class="a" x="30" y="62" width="340" height="32" rx="9"/><path class="dots" d="M42 70v16m6-16v16"/><text x="64" y="82" style="font-size:12px">Track one</text>
<rect class="a" x="38" y="98" width="340" height="32" rx="9" style="fill:var(--bg)"/><rect x="38" y="98" width="340" height="32" rx="9" class="sd"/><path class="dots" d="M50 106v16m6-16v16"/><text class="t" x="72" y="118" style="font-size:12px">Track two (dragging)</text>
<rect class="a" x="30" y="134" width="340" height="32" rx="9"/><path class="dots" d="M42 142v16m6-16v16"/><text x="64" y="154" style="font-size:12px">Track three</text><text x="310" y="154" style="font-size:11px">▲</text><text x="328" y="154" style="font-size:11px">▼</text><text x="346" y="154" style="font-size:11px">✕</text></svg>`},
{t:'Video mode & shortcuts',x:'Video mode hides the playlist and gives the video the whole screen. Press V to toggle it, Space to play or pause, Esc to leave video mode, and ? to open this guide.',i:`<svg viewBox="0 0 400 190"><rect class="a" x="22" y="24" width="248" height="140" rx="9"/><path class="m" d="M132 78l32 16-32 16z"/><rect class="l" x="22" y="172" width="248" height="3" rx="1.5"/><rect class="o" x="22" y="172" width="90" height="3" rx="1.5"/>
<path class="l" d="M284 24v152" stroke="var(--ln)" stroke-width="1"/><circle class="o" cx="338" cy="70" r="17"/><path d="M333 62l12 8-12 8z" style="fill:#0b0b0c"/><circle class="a" cx="300" cy="70" r="9"/><circle class="a" cx="376" cy="70" r="9"/><rect class="l" x="298" y="102" width="82" height="3" rx="1.5"/><rect class="w" x="298" y="102" width="56" height="3" rx="1.5"/>
<rect class="a" x="298" y="126" width="22" height="22" rx="6"/><text class="t" x="309" y="141" text-anchor="middle" style="font-weight:700">V</text><rect class="a" x="326" y="126" width="38" height="22" rx="6"/><text class="t" x="345" y="141" text-anchor="middle" style="font-size:10px">Space</text><rect class="a" x="298" y="154" width="30" height="22" rx="6"/><text class="t" x="313" y="169" text-anchor="middle" style="font-size:10px">Esc</text></svg>`}
],hi=0;
function renderHelp(){
  var p=HELP[hi],last=hi===HELP.length-1;
  $('hIll').innerHTML=p.i;$('hTitle').textContent=p.t;$('hText').textContent=p.x;
  var n=$('hNote');n.innerHTML='';
  if(p.note){
    n.appendChild(document.createTextNode("Can't sign in? Contact the developer"));
    var ct=(typeof CONTACT!=='undefined'&&CONTACT&&CONTACT.indexOf('YOUR-EMAIL')<0)?CONTACT:'';
    if(ct){n.appendChild(document.createTextNode(': '));var a=document.createElement('a');a.href=ct.indexOf('@')>-1&&ct.indexOf('://')<0?'mailto:'+ct:ct;a.textContent=ct;a.target='_blank';a.rel='noopener';n.appendChild(a)}
    else n.appendChild(document.createTextNode('.'));
  }
  var d=$('hDots');d.innerHTML='';HELP.forEach(function(x,i){var e=document.createElement('i');if(i===hi)e.className='on';d.appendChild(e)});
  $('hPrev').disabled=hi===0;$('hNext').disabled=last;$('hDone').hidden=!last;
}
function openHelp(){hi=0;renderHelp();$('help').hidden=false;$('hNext').focus()}
function closeHelp(){$('help').hidden=true;try{localStorage.setItem('occra_help','1')}catch(e){}}
function helpGo(d){var n=hi+d;if(n<0||n>=HELP.length)return;hi=n;renderHelp()}

/* ---- UI ---- */
var vmode=false;
try{vmode=localStorage.getItem('occra_vmode')==='1'}catch(e){}
function setMode(v){
  vmode=v;document.body.classList.toggle('vmode',v);
  $('vm').querySelector('span').textContent=v?'Show playlist':'Video mode';
  try{localStorage.setItem('occra_vmode',v?'1':'0')}catch(e){}
}

$('go').onclick=submit;
$('vm').onclick=function(){setMode(!vmode)};
$('hb').onclick=openHelp;$('hClose').onclick=closeHelp;$('hDone').onclick=closeHelp;
$('hPrev').onclick=function(){helpGo(-1)};$('hNext').onclick=function(){helpGo(1)};
$('help').onclick=function(e){if(e.target===$('help'))closeHelp()};
$('mine').onclick=function(){signIn(showMine)};
$('url').onkeydown=function(e){if(e.key==='Enter')submit()};
$('back').onclick=function(){results=null;render()};
$('pp').onclick=function(){if(!ready)return;var l=L();if(l.cur<0&&l.q.length){play(0);return}player.getPlayerState()===1?player.pauseVideo():player.playVideo()};
$('next').onclick=next;$('prev').onclick=prev;
$('shuf').onclick=function(){shuffle=!shuffle;this.classList.toggle('on',shuffle)};
$('rep').onclick=function(){repeat=!repeat;this.classList.toggle('on',repeat)};
var vol=$('vol');fill(vol,80);
vol.oninput=function(){fill(vol,this.value);ready&&player.setVolume(this.value)};
var sk=$('seek');
sk.onmousedown=sk.ontouchstart=function(){this.dataset.drag=1};
sk.oninput=function(){fill(sk,this.value/10)};
sk.onchange=function(){delete this.dataset.drag;if(ready)player.seekTo(player.getDuration()*this.value/1000,true)};
$('ddb').onclick=function(){$('ddm').hidden?openDD():closeDD()};
document.addEventListener('click',function(e){if(!$('dd').contains(e.target))closeDD()});
$('dd').onkeydown=function(e){
  var items=[].slice.call($('ddm').children);
  if(e.key==='Escape'){closeDD();$('ddb').focus()}
  else if(e.key==='ArrowDown'||e.key==='ArrowUp'){
    e.preventDefault();if($('ddm').hidden)openDD();
    var i=items.indexOf(document.activeElement);
    i=e.key==='ArrowDown'?Math.min(items.length-1,i+1):Math.max(0,i<0?items.length-1:i-1);
    if(items[i])items[i].focus();
  }else if(e.key==='Enter'&&document.activeElement.classList.contains('ddi')){e.preventDefault();document.activeElement.click()}
};
$('nl').onclick=function(){
  dialog({title:'New playlist',input:true,placeholder:'Playlist name',ok:'Create'}).then(function(n){
    if(!n)return;var id='l'+Date.now();S.lists.push({id:id,name:n,q:[],cur:-1});S.active=id;results=null;save();render();if(ready)player.stopVideo();
  });
};
$('rn').onclick=function(){var e=$('plname');e.focus();e.select()};
$('plname').onkeydown=function(e){if(e.key==='Enter')this.blur();if(e.key==='Escape'){this.value=L().name;this.blur()}};
$('plname').onblur=function(){var n=this.value.trim();if(n)L().name=n;this.value=L().name;save();render()};
$('dl').onclick=function(){
  if(S.lists.length<2){msg('You need at least one playlist');return}
  var cur=L(),n=cur.q.length;
  dialog({title:'Delete playlist?',text:'"'+cur.name+'"'+(n?' and its '+n+(n===1?' track':' tracks'):'')+' will be removed from this browser.',ok:'Delete',danger:true}).then(function(yes){
    if(!yes)return;
    S.lists=S.lists.filter(function(x){return x.id!==cur.id});S.active=S.lists[0].id;results=null;save();render();
    var l=L();if(ready){if(l.cur>=0&&l.q[l.cur])player.cueVideoById(l.q[l.cur].id);else player.stopVideo()}
  });
};
document.addEventListener('keydown',function(e){
  if(!$('help').hidden){if(e.key==='ArrowRight'){e.preventDefault();helpGo(1)}else if(e.key==='ArrowLeft'){e.preventDefault();helpGo(-1)}else if(e.key==='Escape'){e.preventDefault();closeHelp()}return}
  if(!$('modal').hidden||e.target.tagName==='INPUT'||e.target.closest('#dd'))return;if(e.code==='Space'){e.preventDefault();$('pp').click()}
  else if(e.key==='v'||e.key==='V'){setMode(!vmode)}
  else if(e.key==='Escape'&&vmode){setMode(false)}
  else if(e.key==='?'){openHelp()}});
setMode(vmode);
render();
try{if(!localStorage.getItem('occra_help'))setTimeout(openHelp,700)}catch(e){}
})();