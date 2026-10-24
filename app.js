/**
 * Ótica Gadelhas — Pupilômetro Remoto (protótipo).
 * Nenhuma foto é enviada a servidor por este código. O runtime do MediaPipe
 * é carregado da CDN e o modelo de landmarks do Google, quando disponível.
 * As medidas são estimativas NÃO validadas para fabricação de óculos.
 */
const $ = (id) => document.getElementById(id);
const SECTIONS = {intro:$('introSection'),camera:$('cameraSection'),editor:$('editorSection'),result:$('resultSection')};
const source = document.createElement('canvas');
const photo = $('photoCanvas');
const ctx = photo.getContext('2d');
const sourceCtx = source.getContext('2d', {willReadFrequently: true});
const loupe = $('loupeCanvas');
const loupeCtx = loupe.getContext('2d');
const KEYS = ['cardA','cardB','eyeA','eyeB'];
const CARD_WIDTH_MM = 85.60;
const MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';
const MP_VERSION = '0.10.22';
let stream = null;
let model = null;
let modelPromise = null;
let activeMarker = 'cardA';
let markers = {cardA:null,cardB:null,eyeA:null,eyeB:null};
let detection = 'manual';
let lastMeasurement = null;
let cameraFront = true;
let toastHandle = null;

function showToast(msg){
  clearTimeout(toastHandle); const e=$('alertBox'); e.textContent=msg; e.classList.remove('hidden');
  toastHandle=setTimeout(()=>e.classList.add('hidden'),4800);
}
function showSection(name){
  Object.entries(SECTIONS).forEach(([key,node])=>node.classList.toggle('hidden',name!==key));
  const steps={intro:1,camera:2,editor:2,result:3};
  const n=steps[name];
  for(let k=1;k<=3;k++){
    const el=$('step'+k);el.classList.toggle('active',k===n);el.classList.toggle('done',k<n);
  }
  (name==='intro' ? $('inicio') : SECTIONS[name]).scrollIntoView({behavior:'smooth',block:'start'});
}
function photoMode(){return document.querySelector('input[name="photoMode"]:checked').value;}
function canUseImage(){return $('consent').checked;}
function syncConsent(){
  const okay=canUseImage(); $('startCamera').disabled=!okay;
  $('fileInput').disabled=!okay; $('uploadLabel').setAttribute('aria-disabled',String(!okay));
}
$('consent').addEventListener('change',syncConsent);
$('uploadLabel').addEventListener('click',(e)=>{
  if(!canUseImage()){e.preventDefault();showToast('Marque o consentimento para continuar.');}
});

async function startCamera(){
  if(!canUseImage())return;
  if(!navigator.mediaDevices?.getUserMedia){
    showToast('Este navegador não permite câmera. Escolha uma foto da galeria.');return;
  }
  try{
    await stopCamera();
    // O usuário pode pedir outra pessoa para capturar, logo preferimos a câmera traseira.
    cameraFront = photoMode()==='selfie';
    const facingMode = cameraFront ? 'user':'environment';
    try{
      stream=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:{ideal:facingMode},width:{ideal:1920},height:{ideal:1080}}});
    }catch(_){stream=await navigator.mediaDevices.getUserMedia({audio:false,video:true});}
    const video=$('cameraVideo');
    video.srcObject=stream;
    video.style.transform=cameraFront?'scaleX(-1)':'none';
    await video.play();
    showSection('camera');
  }catch(err){
    console.warn('Câmera indisponível:',err);
    showToast('Não foi possível abrir a câmera. Verifique a permissão e o HTTPS ou envie uma foto da galeria.');
  }
}
async function stopCamera(){
  if(stream){stream.getTracks().forEach(track=>track.stop());stream=null;}
  $('cameraVideo').srcObject=null;
}
$('startCamera').addEventListener('click',startCamera);
$('stopCamera').addEventListener('click',async()=>{await stopCamera();showSection('intro');});
$('takePhoto').addEventListener('click', async()=>{
  const video=$('cameraVideo');
  if(!video.videoWidth||!video.videoHeight){showToast('A câmera ainda está iniciando.');return;}
  setPhotoSize(video.videoWidth,video.videoHeight);
  sourceCtx.save();
  if(cameraFront){sourceCtx.translate(source.width,0);sourceCtx.scale(-1,1);}
  sourceCtx.drawImage(video,0,0,source.width,source.height);
  sourceCtx.restore();
  await stopCamera();
  prepareEditor();
});
function setPhotoSize(width,height){
  const maxDim=1920;
  const scale=Math.min(1,maxDim/Math.max(width,height));
  source.width=Math.round(width*scale);source.height=Math.round(height*scale);
  photo.width=source.width;photo.height=source.height;
}
$('fileInput').addEventListener('change',(event)=>{
  const file=event.target.files?.[0];
  if(!file || !canUseImage())return;
  if(file.size>24*1024*1024){showToast('Arquivo muito grande. Use uma imagem de até 24 MB.');return;}
  const url=URL.createObjectURL(file);
  const img=new Image();
  img.onload=()=>{
    setPhotoSize(img.naturalWidth,img.naturalHeight);
    sourceCtx.drawImage(img,0,0,source.width,source.height);
    URL.revokeObjectURL(url);
    prepareEditor();
    event.target.value='';
  };
  img.onerror=()=>{
    URL.revokeObjectURL(url);
    showToast('Não foi possível ler esta imagem. Tente JPG ou PNG.');
  };
  img.src=url;
});

function prepareEditor(){
  markers={cardA:null,cardB:null,eyeA:null,eyeB:null};
  detection='manual';lastMeasurement=null;
  activeMarker='cardA';
  $('modelStatus').textContent='Tentando localizar as pupilas...';
  $('modelStatus').classList.remove('warn');
  showSection('editor');
  drawPhoto();syncMarkerButtons();
  detectEyeCenters();
}

async function initModel(){
  if(model)return model;
  if(modelPromise)return modelPromise;
  modelPromise=(async()=>{
    const {FaceLandmarker,FilesetResolver}=await import(`https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VERSION}/vision_bundle.mjs`);
    const vision=await FilesetResolver.forVisionTasks(`https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VERSION}/wasm`);
    model=await FaceLandmarker.createFromOptions(vision,{
      baseOptions:{modelAssetPath:MODEL_URL,delegate:'CPU'},
      runningMode:'IMAGE',numFaces:1,
      minFaceDetectionConfidence:0.45,
      minFacePresenceConfidence:0.45
    });
    return model;
  })();
  try{return await modelPromise;}catch(err){modelPromise=null;throw err;}
}

async function detectEyeCenters(){
  const snap=source.toDataURL('image/jpeg',0.3); // Usado apenas para descartar resultados de foto anterior.
  try{
    const landmarker=await initModel();
    if(source.toDataURL('image/jpeg',0.3)!==snap)return;
    const result=landmarker.detect(source);
    const face=result.faceLandmarks?.[0];
    if(!face || face.length<478)throw new Error('Pupilas não reconhecidas nesta imagem.');
    // Centro de cada íris de acordo com o mapeamento oficial do MediaPipe.
    const iris1=face[468];const iris2=face[473];
    const a={x:iris1.x*source.width,y:iris1.y*source.height};
    const b={x:iris2.x*source.width,y:iris2.y*source.height};
    if(!validPoint(a)||!validPoint(b))throw new Error('Pontos das pupilas fora da foto.');
    if(distance(a,b)<28)throw new Error('Rosto muito pequeno para uma estimativa.');
    // Mantemos a ordenação visual simples: pupila 1 à esquerda da foto.
    [markers.eyeA,markers.eyeB]=a.x<=b.x?[a,b]:[b,a];
    detection='automatica';
    $('modelStatus').textContent='✓ Centros das pupilas detectados. Confira os dois pontos verdes e marque as pontas do cartão.';
    $('modelStatus').classList.remove('warn');
    drawPhoto();syncMarkerButtons();
  }catch(err){
    console.warn('Detecção automática indisponível:',err);
    $('modelStatus').textContent='Detecção automática não disponível nesta foto. Você pode marcar os dois centros das pupilas manualmente.';
    $('modelStatus').classList.add('warn');
    syncMarkerButtons();
  }
}
function validPoint(p){return Number.isFinite(p.x)&&Number.isFinite(p.y)&&p.x>=0&&p.x<=source.width&&p.y>=0&&p.y<=source.height;}
function distance(a,b){return Math.hypot(a.x-b.x,a.y-b.y);}
function setActiveMarker(key){activeMarker=key;syncMarkerButtons();drawPhoto();}
function syncMarkerButtons(){
  document.querySelectorAll('.marker-button').forEach(button=>{
    const key=button.dataset.marker;
    button.setAttribute('aria-pressed',String(key===activeMarker));
    const s=$('status-'+key);
    s.textContent=markers[key]?'✓ Marcado':'Pendente';
    s.style.color=markers[key]?'#087b65':'';
  });
  $('calculate').disabled=!KEYS.every(k=>markers[k]);
  drawLoupe();
}
document.querySelectorAll('.marker-button').forEach(button=>button.addEventListener('click',()=>setActiveMarker(button.dataset.marker)));
photo.addEventListener('pointerdown',(e)=>{
  if(!source.width)return;
  e.preventDefault();
  const rect=photo.getBoundingClientRect();
  const x=(e.clientX-rect.left)*photo.width/rect.width;
  const y=(e.clientY-rect.top)*photo.height/rect.height;
  markers[activeMarker]={x:Math.max(0,Math.min(source.width,x)),y:Math.max(0,Math.min(source.height,y))};
  if(activeMarker==='eyeA'||activeMarker==='eyeB')detection='conferida/manual';
  drawPhoto();syncMarkerButtons();
  const next=KEYS.find(k=>!markers[k]);
  if(next)setActiveMarker(next);
});
document.querySelectorAll('.nudge').forEach(button=>button.addEventListener('click',()=>{
  if(!markers[activeMarker]){showToast('Primeiro coloque o ponto na foto.');return;}
  markers[activeMarker].x=Math.max(0,Math.min(source.width,markers[activeMarker].x+Number(button.dataset.dx)));
  markers[activeMarker].y=Math.max(0,Math.min(source.height,markers[activeMarker].y+Number(button.dataset.dy)));
  if(activeMarker==='eyeA'||activeMarker==='eyeB')detection='conferida/manual';
  drawPhoto();drawLoupe();
}));
$('clearMarker').addEventListener('click',()=>{
  markers[activeMarker]=null;
  if(activeMarker==='eyeA'||activeMarker==='eyeB')detection='conferida/manual';
  drawPhoto();syncMarkerButtons();
});

function drawPhoto(){
  if(!source.width)return;
  ctx.clearRect(0,0,photo.width,photo.height);
  ctx.drawImage(source,0,0);
  const size=Math.max(3,Math.min(photo.width,photo.height)/220);
  ctx.lineWidth=size*1.7;ctx.lineCap='round';ctx.lineJoin='round';
  const c1=markers.cardA,c2=markers.cardB;
  const e1=markers.eyeA,e2=markers.eyeB;
  if(c1&&c2){ctx.strokeStyle='#ffd38e';ctx.beginPath();ctx.moveTo(c1.x,c1.y);ctx.lineTo(c2.x,c2.y);ctx.stroke();}
  if(e1&&e2){
    ctx.strokeStyle='#11dfb9';ctx.setLineDash([size*3,size*2]);ctx.beginPath();ctx.moveTo(e1.x,e1.y);ctx.lineTo(e2.x,e2.y);ctx.stroke();ctx.setLineDash([]);
  }
  KEYS.forEach((k,index)=>{
    const p=markers[k];if(!p)return;
    const color=k.startsWith('card')?'#ffc66c':'#00ddbf';
    ctx.beginPath();ctx.fillStyle='#032c2bc9';ctx.arc(p.x,p.y,size*4.1,0,Math.PI*2);ctx.fill();
    ctx.strokeStyle=color;ctx.lineWidth=size*1.2;ctx.stroke();
    ctx.beginPath();ctx.arc(p.x,p.y,size*.8,0,Math.PI*2);ctx.fillStyle=color;ctx.fill();
    ctx.lineWidth=size*.8;
    if(k===activeMarker){ctx.beginPath();ctx.strokeStyle='#fff';ctx.arc(p.x,p.y,size*6.1,0,Math.PI*2);ctx.stroke();}
    const txt=k.startsWith('card')?(k==='cardA'?'C1':'C2'):(k==='eyeA'?'P1':'P2');
    ctx.font=`bold ${Math.max(13,size*4)}px Arial`;
    ctx.textBaseline='middle';
    ctx.fillStyle='#002c2b';
    ctx.fillText(txt,p.x+size*6+1,p.y+1);
    ctx.fillStyle=color;
    ctx.fillText(txt,p.x+size*6,p.y);
  });
}
function drawLoupe(){
  loupeCtx.clearRect(0,0,loupe.width,loupe.height);
  loupeCtx.fillStyle='#daeae4';loupeCtx.fillRect(0,0,loupe.width,loupe.height);
  const p=markers[activeMarker];
  if(!p||!source.width){
    loupeCtx.fillStyle='#53706c';loupeCtx.font='12px Arial';loupeCtx.textAlign='center';
    loupeCtx.fillText('Selecione um ponto',loupe.width/2,57);return;
  }
  const sx=32,sy=21;
  loupeCtx.imageSmoothingEnabled=false;
  loupeCtx.drawImage(source,p.x-sx,p.y-sy,sx*2,sy*2,0,0,loupe.width,loupe.height);
  loupeCtx.imageSmoothingEnabled=true;
  const cx=loupe.width/2,cy=loupe.height/2;
  loupeCtx.strokeStyle='#fff';loupeCtx.lineWidth=3;
  loupeCtx.beginPath();loupeCtx.moveTo(cx-14,cy);loupeCtx.lineTo(cx+14,cy);loupeCtx.moveTo(cx,cy-14);loupeCtx.lineTo(cx,cy+14);loupeCtx.stroke();
  loupeCtx.strokeStyle='#009e8a';loupeCtx.lineWidth=1.5;loupeCtx.strokeRect(cx-4,cy-4,8,8);
}

function measure(){
  if(!KEYS.every(k=>markers[k]))throw new Error('É necessário marcar os quatro pontos.');
  const pixelCard=distance(markers.cardA,markers.cardB);
  const pixelEye=distance(markers.eyeA,markers.eyeB);
  if(pixelCard<40)throw new Error('A borda do cartão está pequena. Use uma foto mais próxima ou com mais resolução.');
  if(pixelEye<25)throw new Error('O rosto está muito pequeno nesta foto.');
  if(pixelCard>source.width*0.96)throw new Error('Confira os dois pontos do cartão.');
  const pd=(pixelEye/pixelCard)*CARD_WIDTH_MM;
  if(!Number.isFinite(pd)||pd<20||pd>115)throw new Error('Resultado fora de uma faixa plausível. Revise os pontos do cartão e das pupilas.');
  const roll=Math.atan2(Math.abs(markers.eyeB.y-markers.eyeA.y),Math.abs(markers.eyeB.x-markers.eyeA.x))*180/Math.PI;
  const cardAngle=Math.atan2(Math.abs(markers.cardB.y-markers.cardA.y),Math.abs(markers.cardB.x-markers.cardA.x))*180/Math.PI;
  const eyeMidY=(markers.eyeA.y+markers.eyeB.y)/2;
  const cardMidY=(markers.cardA.y+markers.cardB.y)/2;
  const warnings=[];
  if(photoMode()==='selfie')warnings.push('Selfie: a convergência para perto altera a distância entre pupilas. Não use como DP de longe.');
  if(roll>7)warnings.push('A linha entre as pupilas está inclinada. Refaça a foto com a cabeça reta.');
  if(cardAngle>12)warnings.push('A borda do cartão está inclinada. Mantenha o cartão horizontal.');
  if(Math.abs(cardMidY-eyeMidY)>pixelEye*1.25)warnings.push('O cartão parece distante dos olhos na imagem; aproxime-o da testa.');
  if(pd<45||pd>85)warnings.push('O valor ficou fora da faixa usual de muitos adultos; confira a referência e os pontos.');
  if(pixelCard<90||pixelEye<65)warnings.push('A imagem apresenta poucos pixels para os pontos; prefira maior resolução.');
  warnings.push('A diferença de profundidade entre cartão e olhos e a perspectiva podem introduzir erro, mesmo com os pontos corretos.');
  return {pd,pixelCard,pixelEye,roll,cardAngle,warnings,mode:photoMode(),detection,clientName:$('clientName').value.trim(),date:new Date()};
}
$('calculate').addEventListener('click',()=>{
  try{
    lastMeasurement=measure();
    $('pdValue').textContent=lastMeasurement.pd.toFixed(1).replace('.',',');
    $('modeDescription').textContent=lastMeasurement.mode==='selfie'?'Estimativa em condição de perto (selfie)':'Estimativa com foto assistida (longe)';
    $('resultMode').textContent=lastMeasurement.mode==='selfie'?'Selfie / perto':'Foto assistida / longe';
    $('resultDetection').textContent=lastMeasurement.detection==='automatica'?'Detectadas automaticamente':'Revisadas / marcadas manualmente';
    $('resultDate').textContent=lastMeasurement.date.toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'});
    $('qualityBox').innerHTML='';
    const title=document.createElement('strong');title.textContent='Atenção — conferência necessária';$('qualityBox').append(title);
    const intro=document.createElement('p');intro.textContent='Não use esta estimativa isoladamente para produzir lentes. Verifique os pontos e as condições da foto.';$('qualityBox').append(intro);
    const ul=document.createElement('ul');
    lastMeasurement.warnings.forEach(w=>{const li=document.createElement('li');li.textContent=w;ul.append(li);});
    $('qualityBox').append(ul);
    showSection('result');
  }catch(err){showToast(err.message);}
});
function reportText(){
  if(!lastMeasurement)return '';
  const r=lastMeasurement;
  return [
    'ÓTICA GADELHAS — RESULTADO PRELIMINAR',
    r.clientName?'Cliente: '+r.clientName:null,
    'DP binocular estimada: '+r.pd.toFixed(1).replace('.',',')+' mm',
    'Tipo: '+(r.mode==='selfie'?'selfie/perto':'foto assistida/longe'),
    'Pupilas: '+(r.detection==='automatica'?'localização automática':'revisão/marcação manual'),
    'Referência: cartão padrão de 85,60 mm',
    'Data: '+r.date.toLocaleString('pt-BR'),
    '',
    'IMPORTANTE: medida experimental não validada; precisa ser conferida pela ótica antes da fabricação de lentes. Não inclui DP monocular ou altura de montagem.'
  ].filter(x=>x!==null).join('\n');
}
async function getReportFile(){
  const blob=await new Promise(resolve=>photo.toBlob(resolve,'image/png'));
  if(!blob)throw new Error('Não foi possível gerar a imagem marcada.');
  return new File([blob], 'otica-gadelhas-medicao.png',{type:'image/png'});
}
async function shareReport(){
  if(!lastMeasurement)return;
  const text=reportText();
  try{
    if(navigator.share){
      let data={title:'Estimativa de DP — Ótica Gadelhas',text};
      try{
        const f=await getReportFile();
        if(navigator.canShare?.({files:[f]}))data={...data,files:[f]};
      }catch(e){console.warn('Imagem indisponível para compartilhamento:',e);}
      await navigator.share(data);return;
    }
    await copyReport();showToast('Resultado copiado. Cole na conversa com a ótica.');
  }catch(err){if(err?.name!=='AbortError')showToast('Não foi possível compartilhar. Tente copiar o resultado.');}
}
async function copyReport(){
  const text=reportText();
  try{await navigator.clipboard.writeText(text);}catch(_){
    const temp=document.createElement('textarea');temp.value=text;temp.style.position='fixed';temp.style.opacity='0';document.body.append(temp);temp.select();document.execCommand('copy');temp.remove();
  }
}
$('shareResult').addEventListener('click',shareReport);
$('copyResult').addEventListener('click',async()=>{await copyReport();showToast('Resultado copiado.');});
$('waResult').addEventListener('click',()=>{
  const url='https://api.whatsapp.com/send?text='+encodeURIComponent(reportText());
  const win=window.open(url,'_blank','noopener,noreferrer');
  if(!win)window.location.href=url;
});
$('downloadPhoto').addEventListener('click',()=>{
  if(!lastMeasurement)return;
  photo.toBlob(blob=>{
    if(!blob)return showToast('Não foi possível gerar a imagem.');
    const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='otica-gadelhas-medicao.png';a.click();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
  },'image/png');
});
$('backToEditor').addEventListener('click',()=>{showSection('editor');drawPhoto();syncMarkerButtons();});
$('tryAgain').addEventListener('click',()=>{source.width=0;photo.width=0;showSection('intro');});
window.addEventListener('pagehide',stopCamera);
syncConsent();
