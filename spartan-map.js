/* spartan-map.js — Peta kerawanan api interaktif (gaya SPARTAN BMKG)
   Pasang: tambahkan  <script src="spartan-map.js"></script>  tepat sebelum </body> pada file HTML Anda.
   Memakai data Open-Meteo yang sama + indeks FWI Kanada (FFMC, DMC, DC, ISI, BUI, FWI) + laju rambat jerami (Rothermel). */
(()=>{
'use strict';
const CDN='https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/', N=13, SPIN=14, CH=45;
const COL=['#4e9a51','#e2c534','#ec8a2b','#d3322a'], KLS=['Rendah','Sedang','Tinggi','Ekstrem'];
/* Ambang FFMC & DC mengikuti klasifikasi BMKG; lainnya indikatif (ubah di sini bila perlu) */
const LY={
  ISI:{n:'ISI',t:'Kemudahan penyebaran api',k:'isi',th:[3,6,10],d:1},
  FWI:{n:'FWI',t:'Intensitas api',k:'fwi',th:[5,15,30],d:1},
  FFMC:{n:'FFMC',t:'Kemudahan terbakar (bahan ringan)',k:'ffmc',th:[72.5,77.5,82.5],d:0},
  BUI:{n:'BUI',t:'Ketersediaan bahan bakar',k:'bui',th:[30,60,100],d:0},
  DC:{n:'DC',t:'Kekeringan lapisan dalam',k:'dc',th:[140,260,350],d:0},
  R:{n:'Rambat jerami',t:'Laju rambat jerami, Rothermel (m/mnt)',k:'R',th:[1,3,6],d:1}
};
let map=null, grp=null, G=null;

/* ---------- Kanada FWI (Van Wagner & Pickett 1985), pembacaan jam 12 siang ---------- */
const E=Math.exp, Lg=Math.log, Pw=Math.pow;
function ffmcF(T,H,W,ro,Fo){
  let mo=147.2*(101-Fo)/(59.5+Fo);
  if(ro>0.5){const rf=ro-0.5;let mr=mo+42.5*rf*E(-100/(251-mo))*(1-E(-6.93/rf));if(mo>150)mr+=0.0015*Pw(mo-150,2)*Math.sqrt(rf);mo=Math.min(mr,250)}
  const Ed=0.942*Pw(H,0.679)+11*E((H-100)/10)+0.18*(21.1-T)*(1-E(-0.115*H));let m;
  if(mo>Ed){const ko=0.424*(1-Pw(H/100,1.7))+0.0694*Math.sqrt(W)*(1-Pw(H/100,8));m=Ed+(mo-Ed)*Pw(10,-ko*0.581*E(0.0365*T))}
  else{const Ew=0.618*Pw(H,0.753)+10*E((H-100)/10)+0.18*(21.1-T)*(1-E(-0.115*H));
    if(mo<Ew){const k1=0.424*(1-Pw((100-H)/100,1.7))+0.0694*Math.sqrt(W)*(1-Pw((100-H)/100,8));m=Ew-(Ew-mo)*Pw(10,-k1*0.581*E(0.0365*T))}else m=mo}
  return 59.5*(250-m)/(147.2+m);
}
function dmcF(T,H,ro,Po){
  T=Math.max(T,-1.1);const k=1.894*(T+1.1)*(100-H)*9e-6; /* faktor panjang hari Le=9 (ekuator) */
  if(ro>1.5){const re=0.92*ro-1.27,Mo=20+E(5.6348-Po/43.43),b=Po<=33?100/(0.5+0.3*Po):Po<=65?14-1.3*Lg(Po):6.2*Lg(Po)-17.2,
    Mr=Mo+1000*re/(48.77+b*re);Po=Math.max(244.72-43.43*Lg(Mr-20),0)}
  return Po+100*k;
}
function dcF(T,ro,Do){
  const V=Math.max(0.36*(Math.max(T,-2.8)+2.8)+1.4,0); /* Lf=1.4 (ekuator) */
  if(ro>2.8){const Qr=800*E(-Do/400)+3.937*(0.83*ro-1.27);Do=Math.max(400*Lg(800/Qr),0)}
  return Do+0.5*V;
}
const isiF=(F,W)=>{const m=147.2*(101-F)/(59.5+F);return 0.208*E(0.05039*W)*91.9*E(-0.1386*m)*(1+Pw(m,5.31)/4.93e7)};
const buiF=(P,D)=>{const s=P+0.4*D;if(s<=0)return 0;return Math.max(0,P<=0.4*D?0.8*P*D/s:P-(1-0.8*D/s)*(0.92+Pw(0.0114*P,1.7)))};
const fwiF=(R,U)=>{const fD=U<=80?0.626*Pw(U,0.809)+2:1000/(25+108.64*E(-0.023*U)),B=0.1*R*fD;return B>1?E(2.72*Pw(0.434*Lg(B),0.647)):B};

function series(h){
  let F=85,P=25,D=250,last=null;
  for(let d=0;d<=SPIN;d++){
    const i=d*24+12,T=h.temperature_2m[i],H=h.relative_humidity_2m[i],W=h.wind_speed_10m[i];
    if(T==null||H==null||W==null){if(d===SPIN)return null;continue}
    let r=0;for(let k=Math.max(0,i-23);k<=i;k++)r+=h.precipitation[k]||0;
    F=ffmcF(T,Math.min(H,100),W,r,F);P=dmcF(T,H,r,P);D=dcF(T,r,D);
    last={T,H,W,rain:r,wd:h.wind_direction_10m[i]};
  }
  const isi=isiF(F,last.W),bui=buiF(P,D);
  return{...last,ffmc:F,dmc:P,dc:D,isi,bui,fwi:fwiF(isi,bui),R:NaN};
}

/* ---------- Tampilan ---------- */
const css=`
#spMap{height:420px;border:1px solid var(--ln);border-radius:10px;margin-top:14px;isolation:isolate;position:relative;z-index:0;background:var(--bg)}
.leaflet-container{font:inherit}
.leaflet-popup-content-wrapper,.leaflet-popup-tip{background:var(--card);color:var(--ink)}
.leaflet-popup-content{margin:12px 14px}
.leaflet-popup-content td{padding:2px 0;border:0;font-size:.8rem}
button.sp{padding:8px 10px;font-size:.85rem;width:100%;margin-top:4px}
#spLeg{display:flex;flex-wrap:wrap;gap:6px 14px;margin-top:12px;font-size:.8rem;color:var(--mut)}
#spLeg i{display:inline-block;width:12px;height:12px;border-radius:3px;margin-right:5px;vertical-align:-1px}
#spMsg{margin-top:12px;font-size:.9rem;color:var(--mut);min-height:1.3em}
@media(prefers-color-scheme:dark){:root:not([data-theme="light"]) .leaflet-tile-pane{filter:invert(1) hue-rotate(180deg) brightness(.85) contrast(.9)}}`;
document.head.appendChild(Object.assign(document.createElement('style'),{textContent:css}));

const sec=document.createElement('section');
sec.innerHTML=`<h2>Peta Kerawanan Api (gaya SPARTAN)</h2>
<div class="g">
  <label class="full">Lapisan peta<select id="mLayer">${Object.entries(LY).map(([k,v])=>`<option value="${k}">${v.n} — ${v.t}</option>`).join('')}</select></label>
  <label class="full">Jarak titik data<select id="mSpan"><option value="0.1" selected>Rapat: ≈ 11 km/titik (area ≈ 130 km)</option><option value="0.25">Sedang: ≈ 28 km/titik (area ≈ 330 km)</option><option value="0.5">Luas: ≈ 55 km/titik (area ≈ 670 km)</option></select></label>
</div>
<div class="row"><button class="o" id="mLoc" type="button">Gunakan Lokasi Saya</button><button id="mGo" type="button">Perbarui Peta</button></div>
<div id="spMsg">Mencari posisi Anda…</div>
<div id="spMap"></div><div id="spLeg"></div>
<p class="cap">Data: Open-Meteo (model satelit/reanalisis), pembacaan jam 12 siang setempat, hujan 24 jam, spin-up ${SPIN} hari dari FFMC 85 / DMC 25 / DC 250. Karena itu DMC, DC, BUI, dan FWI hanya perkiraan dan tidak identik dengan SPARTAN BMKG yang dikalibrasi lokal. Ambang FFMC dan DC mengikuti klasifikasi BMKG, ambang lainnya indikatif. Resolusi asli data Open-Meteo sekitar 10–28 km (model global untuk tanggal terbaru, ERA5 untuk tanggal lama), jadi peta berwarna ini adalah interpolasi halus antar titik data, bukan detail asli per desa. Area berelevasi ≤ 0 m (laut) tidak diwarnai.</p>`;
const first=document.querySelector('main > section');first.parentNode.insertBefore(sec,first);
const sm=t=>{$('spMsg').textContent=t};

function loadLeaflet(){
  if(window.L)return Promise.resolve();
  return new Promise((ok,no)=>{
    document.head.appendChild(Object.assign(document.createElement('link'),{rel:'stylesheet',href:CDN+'leaflet.min.css'}));
    document.head.appendChild(Object.assign(document.createElement('script'),{src:CDN+'leaflet.min.js',onload:ok,onerror:()=>no(new Error('Leaflet gagal dimuat (offline?)'))}));
  });
}

async function loadGrid(){
  const lat=num('lat'),lon=num('lon'),dt=$('dt').value,step=+$('mSpan').value,half=step*(N-1)/2;
  if(!dt||!fin(lat)||!fin(lon)||Math.abs(lat)>85||Math.abs(lon)>180){sm('Cek koordinat dan waktu.');return}
  const day=dt.slice(0,10),old=(Date.now()-new Date(day+'T00:00'))/864e5>5;
  const base=old?'https://archive-api.open-meteo.com/v1/archive':'https://api.open-meteo.com/v1/forecast';
  const s0=new Date(day+'T00:00:00Z');s0.setUTCDate(s0.getUTCDate()-SPIN);
  const cells=[];
  for(let r=0;r<N;r++)for(let c=0;c<N;c++)cells.push({lat:lat+half-r*step,lon:lon-half+c*step});
  const mk=p=>`${base}?latitude=${p.map(c=>c.lat.toFixed(3)).join()}&longitude=${p.map(c=>c.lon.toFixed(3)).join()}&start_date=${s0.toISOString().slice(0,10)}&end_date=${day}&hourly=temperature_2m,relative_humidity_2m,wind_speed_10m,wind_direction_10m,precipitation&wind_speed_unit=kmh&timezone=auto`;
  $('mGo').disabled=true;sm('Mengunduh data satelit untuk '+cells.length+' titik…');
  try{
    await loadLeaflet();
    const urls=[];for(let i=0;i<cells.length;i+=CH)urls.push(mk(cells.slice(i,i+CH)));
    const res=await Promise.all(urls.map(u=>fetch(u).then(r=>r.json())));
    const arr=[];
    res.forEach(j=>{if(j.error)throw new Error(j.reason||'Ditolak server cuaca');arr.push(...(Array.isArray(j)?j:[j]))});
    cells.forEach((c,i)=>{c.d=arr[i]&&arr[i].hourly?series(arr[i].hourly):null;c.el=arr[i]&&arr[i].elevation!=null?arr[i].elevation:NaN;c.b=[[c.lat-step/2,c.lon-step/2],[c.lat+step/2,c.lon+step/2]]});
    G={cells,lat,lon,half,step,day};
    if(!map){
      map=L.map('spMap',{zoomSnap:.25,zoomDelta:.5}).setView([lat,lon],8);
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:18,attribution:'© OpenStreetMap'}).addTo(map);
      grp=L.layerGroup().addTo(map);
      map.on('click',e=>{
        if(!G)return;
        const c=Math.round((e.latlng.lng-(G.lon-G.half))/G.step),r=Math.round((G.lat+G.half-e.latlng.lat)/G.step);
        if(c<0||r<0||c>=N||r>=N||!G.cells[r*N+c].d)return;
        G.pk={lat:e.latlng.lat,lon:e.latlng.lng};
        L.popup().setLatLng(e.latlng).setContent(popup(r*N+c)).openOn(map);
      });
    }
    map.invalidateSize();map.fitBounds([[lat-half-step/2,lon-half-step/2],[lat+half+step/2,lon+half+step/2]],{padding:[6,6]});
    paint();
    sm(`Peta ${f(lat,3)}, ${f(lon,3)} · ${day} (jam 12 setempat), ${cells.filter(c=>c.d).length}/${cells.length} titik valid. Ketuk peta untuk detail.`);
  }catch(e){sm('Gagal: '+e.message)}
  finally{$('mGo').disabled=false}
}

const hex=h=>[1,3,5].map(i=>parseInt(h.slice(i,i+2),16));
function interp(v,x,y){
  x=Math.min(N-1,Math.max(0,x));y=Math.min(N-1,Math.max(0,y));
  const x0=Math.min(N-2,Math.floor(x)),y0=Math.min(N-2,Math.floor(y)),fx=x-x0,fy=y-y0;
  let s=0,w=0;
  [[0,0,(1-fx)*(1-fy)],[1,0,fx*(1-fy)],[0,1,(1-fx)*fy],[1,1,fx*fy]].forEach(([dx,dy,k])=>{
    const a=v[(y0+dy)*N+x0+dx];if(fin(a)&&k>0){s+=a*k;w+=k}
  });
  return w>1e-6?s/w:NaN;
}
/* Lapisan warna halus: interpolasi bilinear antar titik data, digambar ke kanvas lalu ditempel sebagai gambar di peta */
function drawField(ly){
  const S=360,cv=document.createElement('canvas');cv.width=cv.height=S;
  const ctx=cv.getContext('2d'),img=ctx.createImageData(S,S),v=G.cells.map(c=>c.d?c.d[ly.k]:NaN),rgb=COL.map(hex),el=G.cells.map(c=>c.el),mask=el.some(z=>z>0.5);
  for(let py=0;py<S;py++)for(let px=0;px<S;px++){
    const gx=(px+.5)/S*N-.5,gy=(py+.5)/S*N-.5,k=cls(interp(v,gx,gy),ly.th),o=(py*S+px)*4;
    if(k<0)continue;
    if(mask){const z=interp(el,gx,gy);if(fin(z)&&z<=0.5)continue}  /* laut tidak diwarnai */
    const fade=Math.min(1,Math.min(px,py,S-1-px,S-1-py)/(S/N));    /* tepi area memudar halus */
    img.data[o]=rgb[k][0];img.data[o+1]=rgb[k][1];img.data[o+2]=rgb[k][2];img.data[o+3]=Math.round(165*fade);
  }
  ctx.putImageData(img,0,0);
  const e=G.half+G.step/2;
  L.imageOverlay(cv.toDataURL(),[[G.lat-e,G.lon-e],[G.lat+e,G.lon+e]],{interactive:false}).addTo(grp);
}
const cls=(v,th)=>fin(v)?th.filter(t=>v>t).length:-1;

function popup(i){
  const c=G.cells[i],d=c.d,ly=LY[$('mLayer').value],k=cls(d[ly.k],ly.th);
  const q=(l,v,n)=>`<tr><td>${l}</td><td style="text-align:right;padding-left:14px"><b>${f(v,n)}</b></td></tr>`;
  return `<div style="min-width:180px"><b>${f((G.pk||c).lat,3)}, ${f((G.pk||c).lon,3)}</b><br><span style="font-size:.8rem;color:${k>=0?COL[k]:'inherit'}">${ly.n}: <b>${k>=0?KLS[k]:'–'}</b></span>
  <table style="width:100%;border:0;margin:6px 0">${q('FFMC',d.ffmc,0)}${q('DMC',d.dmc,0)}${q('DC',d.dc,0)}${q('ISI',d.isi,1)}${q('BUI',d.bui,0)}${q('FWI',d.fwi,1)}
  ${q('Suhu (°C)',d.T,1)}${q('RH (%)',d.H,0)}${q('Angin (km/j)',d.W,1)}${q('Hujan 24j (mm)',d.rain,1)}${q('Rambat jerami (m/mnt)',d.R,1)}</table>
  <button class="sp" onclick="spPick(${i})">Analisis titik ini ↑</button></div>`;
}

function paint(){
  if(!G||!map)return;
  const key=$('mLayer').value,ly=LY[key],P=readP(),F=fuel();
  grp.clearLayers();
  G.cells.forEach((c,i)=>{
    if(!c.d)return;
    c.d.R=(P.err||!F.ok)?NaN:ros(c.d.T,c.d.H,c.d.W/3.6,F,{...P,slope:0,aspect:0,wd:c.d.wd}).R;
  });
  drawField(ly);
  L.circleMarker([G.lat,G.lon],{radius:5,color:'#000',weight:2,fillColor:'#fff',fillOpacity:1,interactive:false}).addTo(grp);
  const t=ly.th,rng=['≤ '+t[0],t[0]+' – '+t[1],t[1]+' – '+t[2],'> '+t[2]];
  $('spLeg').innerHTML=`<b style="color:var(--ink)">${ly.t}</b>`+KLS.map((n,i)=>`<span><i style="background:${COL[i]}"></i>${n} (${rng[i]})</span>`).join('');
  if(key==='R'&&(P.err||!F.ok))sm('Lapisan jerami butuh input bahan bakar yang valid.');
}

window.spPick=()=>{
  const c=G.pk;
  $('lat').value=c.lat.toFixed(4);$('lon').value=c.lon.toFixed(4);$('loc_name').value='Mencari lokasi...';
  map.closePopup();window.scrollTo({top:0,behavior:'smooth'});go();
};
/* Posisi pengguna otomatis: isi Lintang/Bujur, ambil data titik, lalu muat peta */
function locate(){
  if(!navigator.geolocation){sm('Perangkat tidak mendeteksi lokasi, memakai koordinat bawaan.');loadGrid();return}
  sm('Mencari posisi Anda…');
  navigator.geolocation.getCurrentPosition(p=>{
    $('lat').value=p.coords.latitude.toFixed(4);$('lon').value=p.coords.longitude.toFixed(4);$('loc_name').value='Mencari lokasi...';
    H=null;ENV=null;sel=-1;calc();
    go();loadGrid();
  },()=>{sm('Izin lokasi ditolak/gagal, memakai koordinat bawaan.');loadGrid()},{enableHighAccuracy:true,timeout:15000,maximumAge:60000});
}
$('mGo').onclick=loadGrid;
$('mLoc').onclick=locate;
$('gps').onclick=locate;
$('mLayer').addEventListener('change',paint);
document.addEventListener('input',e=>{
  if(G&&$('mLayer').value==='R'&&e.target.closest&&e.target.closest('main')&&!/^m(Layer|Span)$/.test(e.target.id))setTimeout(paint,0);
});
locate();
})();
