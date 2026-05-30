// ═══════════════════════════════════════════════════════════════
// FICHIER : app.js  (logique de jeu — Chroniques de l'Étrange)
// ═══════════════════════════════════════════════════════════════
// Ce script dépend de :
//   - three.js (r73)  : moteur 3D WebGL
//   - cannon.js       : moteur physique
//   - teal.js         : utilitaires DOM/événements (projet teal)
//   - dice.js         : moteur de dés 3D (projet teal, modifié)
// ═══════════════════════════════════════════════════════════════

"use strict";
// ══ LOGIQUE DE JEU ══
const ELEMENTS={
  eau:  {label:'Eau',  kanji:'水',values:[1,6],genere:'bois', domine:'feu',   generePar:'metal',dominePar:'terre'},
  bois: {label:'Bois', kanji:'木',values:[4,9],genere:'feu',  domine:'terre', generePar:'eau',  dominePar:'metal'},
  feu:  {label:'Feu',  kanji:'火',values:[2,7],genere:'terre',domine:'metal', generePar:'bois', dominePar:'eau'},
  terre:{label:'Terre',kanji:'土',values:[0,5],genere:'metal',domine:'eau',   generePar:'feu',  dominePar:'bois'},
  metal:{label:'Métal',kanji:'金',values:[3,8],genere:'eau',  domine:'bois',  generePar:'terre',dominePar:'feu'},
};
const V2E={0:'terre',1:'eau',2:'feu',3:'metal',4:'bois',5:'terre',6:'eau',7:'feu',8:'metal',9:'bois'};
const V2YIN={0:true,1:false,2:true,3:false,4:true,5:false,6:true,7:false,8:true,9:false};

// Positions fixes % sur le SVG 400x400 (centre de chaque nœud, roue fixe)
const ELEM_PCT={
  feu:  {x:50,   y:18},
  terre:{x:85.3, y:40.8},
  metal:{x:72.5, y:79.5},
  eau:  {x:27.5, y:79.5},
  bois: {x:14.8, y:40.8},
};
// Offset yin (pair) vers le bas-droite du nœud, yang vers le haut-gauche
const YIN_OFFSET ={feu:{dx:-50,dy:-50},terre:{dx:-50,dy:-50},metal:{dx:-50,dy:-50},eau:{dx:-50,dy:-50},bois:{dx:-50,dy:-50}};
const YANG_OFFSET={feu:{dx:10,dy:-100},terre:{dx:10,dy:-100},metal:{dx:10,dy:-100},eau:{dx:10,dy:-100},bois:{dx:10,dy:-100}};

let gameState=null, diceBox=null, currentMode=null;
let guideQueue=[], currentGuideIdx=0;
let testState=null, selectedTestElement=null;
let testSnapshot=null; // snapshot avant test pour annulation
let tjSelectedDice=[], heiSelectedDice=[];
let isNewGame=false;
let rollLocked=false;

// ══ SECTION : Initialisation et chargement ══
// ── Init ──
window.addEventListener('load',()=>{
  // Forcer false par défaut, checkRandomOrg le mettra à true si accessible
  if($t && $t.dice) $t.dice.use_true_random=false;
  checkRandomOrg();
  const saved=localStorage.getItem('cde_game');
  if(saved){try{gameState=JSON.parse(saved);}catch(e){gameState=null;}}
  if(gameState) document.getElementById('resume-btn-container').style.display='block';
  document.getElementById('new-player-name').addEventListener('keydown',e=>{if(e.key==='Enter')addPlayer();});
});

function checkRandomOrg(){
  const xhr=new XMLHttpRequest();
  xhr.open('GET','https://www.random.org/integers/?num=1&min=0&max=9&col=1&base=10&format=plain&rnd=new',true);
  xhr.timeout=3000;
  xhr.onload=()=>{if(xhr.status===200){$t.dice.use_true_random=true;showToast('Générateur aléatoire en ligne ✓',2000);}};
  xhr.onerror=xhr.ontimeout=()=>{$t.dice.use_true_random=false;};
  try{xhr.send();}catch(e){$t.dice.use_true_random=false;}
}

// ══ SECTION : Snapshot état (pour annulation de test) ══
// ── Snapshot pour annulation ──
function makeSnapshot(){
  return JSON.parse(JSON.stringify({
    players: gameState.players,
    tinjin: gameState.tinjin,
    loksyu: gameState.loksyu,
  }));
}
function restoreSnapshot(snap){
  gameState.players = snap.players;
  gameState.tinjin = snap.tinjin;
  gameState.loksyu = snap.loksyu;
}

let setupPlayers=[];
function addPlayer(){
  const nameEl=document.getElementById('new-player-name');
  const elem=document.getElementById('new-player-element').value;
  const genre=document.getElementById('new-player-genre').value;
  const name=nameEl.value.trim();
  if(!name){nameEl.focus();return;}
  if(setupPlayers.length>=10){showToast('Maximum 10 joueurs');return;}
  if(setupPlayers.find(p=>p.name.toLowerCase()===name.toLowerCase())){showToast('Nom déjà utilisé');return;}
  setupPlayers.push({id:Date.now()+Math.random(),name,element:elem,genre});
  nameEl.value='';nameEl.focus();renderSetupPlayers();
}
function removeSetupPlayer(i){setupPlayers.splice(i,1);renderSetupPlayers();}
function renderSetupPlayers(){
  const list=document.getElementById('players-list');list.innerHTML='';
  setupPlayers.forEach((p,i)=>{
    const div=document.createElement('div');div.className='player-item';
    div.innerHTML=`<div><div style="font-size:1rem">${p.name}</div>
      <div style="font-size:.8rem;color:var(--text-dim)">${ELEMENTS[p.element].label} ${ELEMENTS[p.element].kanji} · ${p.genre==='f'?'Joueuse':'Joueur'}</div></div>
      <button class="btn btn-danger" onclick="removeSetupPlayer(${i})">✕</button>`;
    list.appendChild(div);
  });
  document.getElementById('players-warning').style.display=setupPlayers.length===0?'block':'none';
}
function startGame(){
  if(setupPlayers.length===0){document.getElementById('players-warning').style.display='block';return;}
  const mjName=document.getElementById('mj-name').value.trim()||'Meneur';
  const mjGenre=document.getElementById('mj-genre').value;
  gameState={
    mj:{name:mjName,genre:mjGenre},
    players:setupPlayers.map(p=>({id:p.id,name:p.name,element:p.element,genre:p.genre,fastes:0,nefastes:0})),
    tinjin:setupPlayers.length+1,
    loksyu:[],phase:'playing',selectedPlayerId:null,
  };
  isNewGame=true;saveGame();launchGameScreen();
}
function resumeGame(){if(gameState){isNewGame=false;launchGameScreen();}}
function launchGameScreen(){
  document.getElementById('screen-setup').classList.remove('active');
  document.getElementById('screen-game').classList.add('active');
  requestAnimationFrame(()=>{
    initDiceBox();
    renderGame();
    if(isNewGame) setTimeout(()=>openModal('modal-rituel-init'),600);
  });
}
function saveGame(){if(gameState)localStorage.setItem('cde_game',JSON.stringify(gameState));}

// ══ SECTION : Fonctions de rendu interface ══
// ── Rendu ──
function renderGame(){renderTinJi();renderLoksyu();renderPlayersSidebar();renderSelectedPlayer();updateStatusBar();}
function renderTinJi(){document.getElementById('tinjin-val').textContent=gameState.tinjin;}

function renderLoksyu(selectable,selectedIds,onClickFn){
  const grid=document.getElementById('loksyu-grid');grid.innerHTML='';
  document.getElementById('loksyu-count').textContent=`(${gameState.loksyu.length})`;
  gameState.loksyu.forEach(die=>{
    const div=document.createElement('div');
    div.className=`loksyu-die die-${die.value}`;div.textContent=die.value;
    div.title=`${ELEMENTS[V2E[die.value]].label} — ${V2YIN[die.value]?'Yin':'Yang'}`;
    if(selectable){
      div.classList.add('selectable');
      if(selectedIds&&selectedIds.includes(die.id))div.classList.add('selected-die');
      if(onClickFn)div.onclick=()=>onClickFn(die);
    }
    grid.appendChild(div);
  });
}
function renderPlayersSidebar(){
  const sb=document.getElementById('players-sidebar');sb.innerHTML='';
  gameState.players.forEach(p=>{
    const div=document.createElement('div');
    div.className='player-card'+(p.id===gameState.selectedPlayerId?' active':'');
    div.onclick=()=>selectPlayer(p.id);
    div.innerHTML=`<div class="player-card-name">${p.name}</div>
      <div class="player-card-element">${ELEMENTS[p.element].label} ${ELEMENTS[p.element].kanji}</div>
      <div class="player-card-stocks">
        <span class="stock-badge stock-faste">✦ ${p.fastes}</span>
        <span class="stock-badge stock-nefaste">✕ ${p.nefastes}</span>
      </div>`;
    sb.appendChild(div);
  });
}
function renderSelectedPlayer(){
  const disp=document.getElementById('selected-player-display');
  if(!gameState.selectedPlayerId){disp.style.display='none';return;}
  const p=getPlayer(gameState.selectedPlayerId);if(!p){disp.style.display='none';return;}
  disp.style.display='block';
  document.getElementById('sel-player-role-title').textContent=p.genre==='f'?'Joueuse active':'Joueur actif';
  document.getElementById('sel-player-name').textContent=p.name;
  document.getElementById('sel-player-elem').textContent=ELEMENTS[p.element].label+' '+ELEMENTS[p.element].kanji;
  document.getElementById('sel-faste').textContent=p.fastes;
  document.getElementById('sel-nefaste').textContent=p.nefastes;
}
function updateStatusBar(){
  const phases={'playing':'Partie en cours','test':'Test en cours','rituel':'Rituel','reset-loksyu':'Réinit. Loksyu','init-loksyu':'Initialisation'};
  document.getElementById('status-phase').textContent=phases[gameState.phase]||gameState.phase;
  const p=gameState.selectedPlayerId?getPlayer(gameState.selectedPlayerId):null;
  document.getElementById('status-info').textContent=p
    ?`${p.genre==='f'?'Joueuse':'Joueur'} actif·ve : ${p.name}`
    :'Sélectionnez un joueur / une joueuse';
}
function selectPlayer(id){
  gameState.selectedPlayerId=(gameState.selectedPlayerId===id)?null:id;
  saveGame();renderPlayersSidebar();renderSelectedPlayer();updateStatusBar();
}
function getPlayer(id){return gameState.players.find(p=>String(p.id)===String(id));}
function changePlayerStock(type,delta){
  if(!gameState.selectedPlayerId)return;
  const p=getPlayer(gameState.selectedPlayerId);if(!p)return;
  if(type==='faste')p.fastes=Math.max(0,p.fastes+delta);
  if(type==='nefaste')p.nefastes=Math.max(0,p.nefastes+delta);
  saveGame();renderPlayersSidebar();renderSelectedPlayer();
}
function changeTinJi(delta){gameState.tinjin=Math.max(0,gameState.tinjin+delta);saveGame();renderTinJi();}

// ══ SECTION : Roue Ng Hang ══
// ── Roue des éléments (fixe, pas de rotation) ──
function selectWheelElement(elem){
  // Mettre l'élément en surbrillance
  document.querySelectorAll('.element-node').forEach(n=>n.classList.toggle('selected',n.id==='node-'+elem));

  if(currentMode==='test'){
    selectedTestElement=elem;
    const badge=document.getElementById('elem-selected-badge');
    badge.textContent=`✦ ${ELEMENTS[elem].label} ${ELEMENTS[elem].kanji} sélectionné`;
    badge.classList.add('visible');
    document.getElementById('elem-instruction').style.display='none';
    if(!rollLocked){
      document.getElementById('btn-throw').style.display='inline-block';
      document.getElementById('drag-hint').style.display='block';
      activateDiceCanvas(true);
    }
  }
}

// ══ SECTION : Moteur dés 3D (interface avec dice.js) ══
// ── Dice Box ──
function initDiceBox(){
  const container=document.getElementById('dice-container');
  // On prend les dimensions du conteneur parent (center-content) pour la physique
  const centerContent=document.getElementById('center-content')||container.parentElement;
  const W=(centerContent.clientWidth||window.innerWidth-420);
  const H=(centerContent.clientHeight||window.innerHeight-50);
  if(!W||!H){setTimeout(initDiceBox,150);return;}
  try{
    diceBox=new $t.dice.dice_box(container,{w:W/2,h:H/2});
    diceBox.animate_selector=false;
    if(diceBox.renderer) diceBox.renderer.setClearColor(0x000000,0);
    const canvas=container.querySelector('canvas');
    if(canvas){
      canvas.style.background='transparent';
      canvas.style.position='absolute';
      canvas.style.inset='0';
      canvas.style.width='100%';
      canvas.style.height='100%';
    }
    container.style.background='transparent';
    container.style.position='relative';
    // Option C : bind_mouse sur center-content (toute la zone centrale)
    // Un clic court (<seuil teal) = ignoré => la roue SVG reçoit ses clics normalement
    // Un drag = lancer de dés
    diceBox.bind_mouse(centerContent, getNotation,
      function(vectors,notation,roll){ setDiceRolling(true); roll(); },
      onDiceRollComplete);

    // Bloquer la propagation vers center-content depuis les contrôles UI
    // (slider, boutons) pour éviter qu'ils déclenchent bind_mouse
    const uiOverlay = document.getElementById('dice-ui-overlay');
    if(uiOverlay){
      ['mousedown','touchstart'].forEach(evName=>{
        uiOverlay.addEventListener(evName, e=>e.stopPropagation(), {passive:false});
      });
    }
    // Stopper aussi sur les modals si ouverts
    const guidePanel = document.getElementById('guide-panel');
    if(guidePanel){
      ['mousedown','touchstart'].forEach(evName=>{
        guidePanel.addEventListener(evName, e=>e.stopPropagation(), {passive:false});
      });
    }
  }catch(e){
    console.error('Dice box init error:',e);
    showToast('Erreur moteur dés: '+e.message);
  }
}
function getNotation(){
  // Bloquer le drag si on ne doit pas lancer
  if(currentMode==='test'){
    if(rollLocked) return {set:[],constant:0,result:[],error:false}; // déjà lancé
    if(!selectedTestElement) return {set:[],constant:0,result:[],error:false}; // pas d'élément
    const count=parseInt(document.getElementById('dice-slider').value)||5;
    return $t.dice.parse_notation(count+'d10');
  }
  if(currentMode==='rituel'||currentMode==='reset-loksyu'||currentMode==='loksyu-init'){
    return $t.dice.parse_notation('1d10');
  }
  // Hors mode lancer : retourner set vide => bind_mouse ne lance rien
  return {set:[],constant:0,result:[],error:false};
}
function updateDiceCount(val){document.getElementById('dice-count-val').textContent=val;}

function triggerThrow(){
  if(!diceBox){showToast('Moteur de dés non initialisé');return;}
  if(diceBox.rolling||rollLocked)return;
  setDiceRolling(true); // monte z-index pendant l'animation
  diceBox.start_throw(getNotation,
    function(vectors,notation,roll){ setDiceRolling(true); roll(); },
    onDiceRollComplete);
}

function activateDiceCanvas(on){
  // Option C : le canvas n'intercepte jamais les événements (bind_mouse sur center-content)
  // Cette fonction garde juste l'état visuel (utile pour clearDiceAfter)
  // Rien à faire sur pointer-events
  _diceCanvasActive = on;
}
var _diceCanvasActive = false;
// Monte le z-index de dice-fullscreen uniquement pendant l'animation de lancer
function setDiceRolling(rolling){
  const fs=document.getElementById('dice-fullscreen');
  if(rolling)fs.classList.add('rolling');else fs.classList.remove('rolling');
}

function clearDiceAfter(ms){
  setTimeout(()=>{
    if(diceBox)diceBox.clear();
    activateDiceCanvas(false);
    setDiceRolling(false);
  },ms);
}

function onDiceRollComplete(notation,result){
  setDiceRolling(false); // rebaisser z-index dès que les dés sont posés
  if(currentMode==='loksyu-init'||currentMode==='rituel'||currentMode==='reset-loksyu'){
    activateDiceCanvas(false);
    clearDiceAfter(2500);
    handleLoksyuRoll(result[0]);
  }else if(currentMode==='test'){
    clearDiceAfter(2000);
    handleTestRoll(result);
  }
}

// ══ SECTION : Modes guidés (rituel, init Loksyu, reset) ══
// ── Modes guidés ──
function startResetLoksyu(){
  closeModal('modal-reset-loksyu');
  gameState.loksyu=[];currentMode='reset-loksyu';gameState.phase='reset-loksyu';
  guideQueue=shuffleArray([...gameState.players]);currentGuideIdx=0;
  renderLoksyu();startGuideStep();saveGame();
}
function startRituel(){
  closeModal('modal-rituel');closeModal('modal-rituel-init');
  currentMode='rituel';gameState.phase='rituel';
  guideQueue=shuffleArray([...gameState.players]);currentGuideIdx=0;
  startGuideStep();updateStatusBar();
}
function startGuideStep(){
  if(currentGuideIdx>=guideQueue.length){endGuide();return;}
  if(diceBox)diceBox.clear();
  const player=guideQueue[currentGuideIdx];
  document.getElementById('guide-player-name').textContent=player.name;
  document.getElementById('guide-panel').classList.add('visible');
  document.getElementById('btn-throw').style.display='inline-block';
  document.getElementById('drag-hint').style.display='block';
  activateDiceCanvas(true);
  document.getElementById('status-info').textContent=`Tour de ${player.name} — Lancez un dé`;
}
function endGuide(){
  document.getElementById('guide-panel').classList.remove('visible');
  currentMode='playing';gameState.phase='playing';
  guideQueue=[];currentGuideIdx=0;
  document.getElementById('btn-throw').style.display='none';
  document.getElementById('drag-hint').style.display='none';
  activateDiceCanvas(false);
  if(diceBox)diceBox.clear();
  saveGame();renderGame();showToast('Phase terminée !');
}
function skipGuideStep(){
  if(diceBox)diceBox.clear();
  const val=Math.floor(Math.random()*10);
  addToLoksyu(val);currentGuideIdx++;renderLoksyu();saveGame();
  if(currentGuideIdx>=guideQueue.length)endGuide();else startGuideStep();
}
function handleLoksyuRoll(value){
  addToLoksyu(value);currentGuideIdx++;renderLoksyu();saveGame();
  // Attendre 2.5s (le temps que les dés s'effacent) avant joueur suivant
  setTimeout(()=>{
    if(currentGuideIdx>=guideQueue.length)endGuide();else startGuideStep();
  },2600);
}
function addToLoksyu(value){gameState.loksyu.push({value,id:Date.now()+Math.random()});}

// ══ SECTION : Lancer de test ══
// ── Test ──
function openTestPanel(){
  if(!gameState.selectedPlayerId){showToast('Sélectionnez un joueur ou une joueuse avant de lancer un test');return;}
  currentMode='test';gameState.phase='test';
  selectedTestElement=null;rollLocked=false;
  // Snapshot de l'état avant le test
  testSnapshot=makeSnapshot();
  document.getElementById('elem-instruction').style.display='block';
  document.getElementById('elem-selected-badge').classList.remove('visible');
  document.getElementById('dice-count-row').style.display='flex';
  document.getElementById('btn-cancel-test').style.display='inline-block';
  document.getElementById('btn-throw').style.display='none';
  document.getElementById('drag-hint').style.display='none';
  document.getElementById('results-float').classList.remove('visible');
  document.getElementById('post-test-float').style.display='none';
  clearWheelResults();
  if(diceBox)diceBox.clear();
  updateStatusBar();
}

function cancelTest(){
  // Restaurer l'état snapshot
  if(testSnapshot){restoreSnapshot(testSnapshot);testSnapshot=null;}
  rollLocked=false;testState=null;selectedTestElement=null;
  currentMode='playing';gameState.phase='playing';
  // Réinitialiser l'UI
  document.getElementById('elem-instruction').style.display='none';
  document.getElementById('elem-selected-badge').classList.remove('visible');
  document.getElementById('dice-count-row').style.display='none';
  document.getElementById('btn-throw').style.display='none';
  document.getElementById('drag-hint').style.display='none';
  document.getElementById('btn-cancel-test').style.display='none';
  document.getElementById('results-float').classList.remove('visible');
  document.getElementById('post-test-float').style.display='none';
  document.querySelectorAll('.element-node').forEach(n=>n.classList.remove('selected'));
  const ww=document.getElementById('ng-hang-svg')?.closest('.wheel-wrapper');
  if(ww)ww.classList.remove('wheel-locked');
  clearWheelResults();
  if(diceBox)diceBox.clear();
  activateDiceCanvas(false);
  saveGame();renderGame();
  showToast('Test annulé — état restauré');
}

function handleTestRoll(result){
  if(!selectedTestElement){showToast('Sélectionnez un élément sur la roue !');return;}
  const player=getPlayer(gameState.selectedPlayerId);if(!player)return;
  rollLocked=true;
  document.getElementById('btn-throw').style.display='none';
  document.getElementById('btn-cancel-test').style.display='inline-block';
  document.getElementById('drag-hint').style.display='none';
  activateDiceCanvas(false);
  // Verrouiller la roue après le lancer
  const ww=document.getElementById('ng-hang-svg')?.closest('.wheel-wrapper');
  if(ww)ww.classList.add('wheel-locked');
  const elem=selectedTestElement,ED=ELEMENTS[elem];
  const dist={succes:[],faste:[],nefaste:[],loksyu:[],tinjin:[]};
  result.forEach(val=>{
    const ve=V2E[val];
    if(ve===elem)dist.succes.push(val);
    else if(ve===ED.genere){dist.faste.push(val);player.fastes++;}
    else if(ve===ED.generePar){dist.nefaste.push(val);player.nefastes++;}
    else if(ve===ED.domine){dist.loksyu.push(val);addToLoksyu(val);}
    else if(ve===ED.dominePar){dist.tinjin.push(val);gameState.tinjin++;}
  });
  testState={elem,distribution:dist,player};
  saveGame();renderGame();
  renderTestResults(dist,elem);
  showWheelResults(dist,elem);
  showPostTestActions(dist,player,elem);
}

function renderTestResults(dist,elem){
  document.getElementById('results-float').classList.add('visible');
  const rows=document.getElementById('results-rows');rows.innerHTML='';
  const ED=ELEMENTS[elem];
  const cats=[
    {key:'succes', label:`Succès (${ED.label})`,        color:'var(--gold)'},
    {key:'faste',  label:`Fastes → ${ELEMENTS[ED.genere].label}`,     color:'#6ada60'},
    {key:'nefaste',label:`Néfastes ← ${ELEMENTS[ED.generePar].label}`,color:'#e07060'},
    {key:'loksyu', label:`Loksyu ↓ ${ELEMENTS[ED.domine].label}`,    color:'#7ab4e8'},
    {key:'tinjin', label:`Tin Ji ↑ ${ELEMENTS[ED.dominePar].label}`,  color:'var(--gold)'},
  ];
  cats.forEach(cat=>{
    const row=document.createElement('div');row.className='result-row';row.dataset.cat=cat.key;
    const chips=dist[cat.key].map(v=>dieChip(v)).join('');
    row.innerHTML=`<span class="result-label" style="color:${cat.color}">${cat.label}</span>
      <span class="result-chips">${chips}</span>
      <span class="result-count" style="color:${cat.color}">${dist[cat.key].length}</span>`;
    rows.appendChild(row);
  });
}

function dieChip(v){
  if(v==='★') return `<span style="font-size:.9rem;color:var(--gold)">★</span>`;
  return `<span class="loksyu-die die-${v}" style="width:22px;height:22px;font-size:.8rem;border-radius:3px;display:inline-flex;align-items:center;justify-content:center;">${v}</span>`;
}
// Chip diamant pour la roue
function dieChipDiamond(v){
  return `<div class="wheel-die-chip die-${v}"><span>${v}</span></div>`;
}

function updateResultRow(cat,dist,elem){
  const ED=ELEMENTS[elem];
  const catColors={succes:'var(--gold)',faste:'#6ada60',nefaste:'#e07060',loksyu:'#7ab4e8',tinjin:'var(--gold)'};
  const catLabels={
    succes:`Succès (${ED.label})`,
    faste:`Fastes → ${ELEMENTS[ED.genere].label}`,
    nefaste:`Néfastes ← ${ELEMENTS[ED.generePar].label}`,
    loksyu:`Loksyu ↓ ${ELEMENTS[ED.domine].label}`,
    tinjin:`Tin Ji ↑ ${ELEMENTS[ED.dominePar].label}`,
  };
  const row=document.querySelector(`.result-row[data-cat="${cat}"]`);if(!row)return;
  const color=catColors[cat];
  const chips=dist[cat].map(v=>dieChip(v)).join('');
  row.innerHTML=`<span class="result-label" style="color:${color}">${catLabels[cat]}</span>
    <span class="result-chips">${chips}</span>
    <span class="result-count" style="color:${color}">${dist[cat].length}</span>`;
}

function showWheelResults(dist,testElem){
  clearWheelResults();
  const container=document.getElementById('wheel-chips-inner');
  const W=container.offsetWidth,H=container.offsetHeight;
  const ED=ELEMENTS[testElem];
  const catElem={succes:testElem,faste:ED.genere,nefaste:ED.generePar,loksyu:ED.domine,tinjin:ED.dominePar};
  const catLabel={succes:'Succès',faste:'Fastes',nefaste:'Néf.',loksyu:'Loksyu',tinjin:'Tin Ji'};
  Object.keys(catElem).forEach(cat=>{
    if(!dist[cat]||dist[cat].length===0)return;
    const elem=catElem[cat],pos=ELEM_PCT[elem];
    const lbl=document.getElementById('rl-'+elem);
    if(lbl){lbl.textContent=catLabel[cat]+': '+dist[cat].length;lbl.setAttribute('opacity','1');}
    dist[cat].forEach((val,i)=>{
      if(val==='★'){
        // Marqueur ★ : afficher comme yang de l'élément courant (pas de couleur de dé)
        const chip=document.createElement('div');
        chip.className='wheel-die-chip';
        chip.style.background='rgba(200,168,74,0.3)';
        chip.style.border='1px solid var(--gold)';
        chip.innerHTML='<span style="color:var(--gold);font-size:.65rem;">★</span>';
        const pos2=ELEM_PCT[elem];
        const off2=YANG_OFFSET[elem];
        const existingCount=Array.from(container.children).filter(c=>c.style.left===
          (pos2.x/100*W+off2.dx+0*24)+'px').length;
        const col2=i%3,row3=Math.floor(i/3);
        chip.style.left=(pos2.x/100*W+off2.dx+col2*24)+'px';
        chip.style.top=(pos2.y/100*H+off2.dy+row3*24)+'px';
        container.appendChild(chip);
        return;
      }
      const isYin=V2YIN[val];
      const offset=isYin?YIN_OFFSET[elem]:YANG_OFFSET[elem];
      const col=i%3,row2=Math.floor(i/3);
      const chip=document.createElement('div');
      chip.className=`wheel-die-chip die-${val}`;
      chip.innerHTML=`<span>${val}</span>`;
      chip.title=`${ELEMENTS[elem].label} ${isYin?'Yin':'Yang'}`;
      chip.style.left=(pos.x/100*W+offset.dx+col*24)+'px';
      chip.style.top=(pos.y/100*H+offset.dy+row2*24)+'px';
      container.appendChild(chip);
    });
  });
}

function clearWheelResults(){
  document.getElementById('wheel-chips-inner').innerHTML='';
  document.querySelectorAll('.elem-rlabel').forEach(el=>{el.setAttribute('opacity','0');el.textContent='';});
}

// ══ SECTION : Actions post-lancer ══
// ── Actions post-test ──
function showPostTestActions(dist,player,elem){
  const panel=document.getElementById('post-test-float');
  panel.style.display='block';panel.innerHTML='';
  const ED=ELEMENTS[elem];

  // MJ Tin Ji
  addPostTitle(panel,'MJ — Tin Ji ('+gameState.tinjin+' pts)');
  const tjOk=gameState.tinjin>0;
  panel.appendChild(makePostBtn('+ Fastes au joueur',()=>postTestTinJi('faste',player),!tjOk));
  panel.appendChild(makePostBtn('+ Néfastes au joueur',()=>postTestTinJi('nefaste',player),!tjOk));
  panel.appendChild(makePostBtn('Retirer du Loksyu',()=>openTinJiModal(),!tjOk));

  // Prendre dans le Loksyu
  addPostTitle(panel,'Prendre dans le Loksyu');
  const lsSucces=gameState.loksyu.filter(d=>V2E[d.value]===elem);
  const lsFastes=gameState.loksyu.filter(d=>V2E[d.value]===ED.genere);
  panel.appendChild(makePostBtn(
    `→ Succès (${ELEMENTS[elem].label}) — ${lsSucces.length} dispo`,
    ()=>openLoksyuPickModal(elem,'succes',player,lsSucces),
    lsSucces.length===0
  ));
  panel.appendChild(makePostBtn(
    `→ Fastes (${ELEMENTS[ED.genere].label}) — ${lsFastes.length} dispo`,
    ()=>openLoksyuPickModal(ED.genere,'faste',player,lsFastes),
    lsFastes.length===0
  ));

  // Fastes / Néfastes
  addPostTitle(panel,'Fastes / Néfastes');
  panel.appendChild(makePostBtn(`Fastes pour effets (${player.fastes})`,()=>spendFastes(player,'effet'),player.fastes===0));
  panel.appendChild(makePostBtn(`Fastes → annuler néfastes`,()=>spendFastes(player,'annuler'),player.fastes===0||player.nefastes===0));
  panel.appendChild(makePostBtn(`Néfastes → annuler fastes`,()=>spendNefastes(player,'annuler'),player.nefastes===0||player.fastes===0));
  panel.appendChild(makePostBtn(`Néfastes pour effets négatifs (${player.nefastes})`,()=>spendNefastes(player,'effet'),player.nefastes===0));

  // Terminer / Annuler
  addPostTitle(panel,'');
  const endBtn=document.createElement('button');
  endBtn.className='post-btn post-btn-end';endBtn.textContent='✓ Terminer ce test';
  endBtn.onclick=finishTest;panel.appendChild(endBtn);
}

function refreshPostTestActions(){
  if(!testState)return;
  showPostTestActions(testState.distribution,testState.player,testState.elem);
}
function addPostTitle(parent,text){
  const t=document.createElement('div');t.className='post-title';t.textContent=text;parent.appendChild(t);
}
function makePostBtn(label,fn,disabled){
  const b=document.createElement('button');
  b.className='post-btn'+(disabled?' post-btn-disabled':'');
  b.textContent=label;
  if(disabled)b.disabled=true;else b.onclick=fn;
  return b;
}

function finishTest(){
  rollLocked=false;testSnapshot=null;
  currentMode='playing';gameState.phase='playing';testState=null;selectedTestElement=null;
  document.getElementById('elem-instruction').style.display='none';
  document.getElementById('elem-selected-badge').classList.remove('visible');
  document.getElementById('dice-count-row').style.display='none';
  document.getElementById('btn-throw').style.display='none';
  document.getElementById('btn-cancel-test').style.display='none';
  document.getElementById('drag-hint').style.display='none';
  document.getElementById('results-float').classList.remove('visible');
  document.getElementById('post-test-float').style.display='none';
  document.querySelectorAll('.element-node').forEach(n=>n.classList.remove('selected'));
  document.getElementById('ng-hang-svg').closest('.wheel-wrapper')?.classList.remove('wheel-locked');
  const ww=document.getElementById('ng-hang-svg')?.closest('.wheel-wrapper');
  if(ww)ww.classList.remove('wheel-locked');
  clearWheelResults();
  if(diceBox)diceBox.clear();
  activateDiceCanvas(false);
  saveGame();renderGame();
}

function spendFastes(player,action){
  const qty=promptNumber('Fastes à utiliser (dispo: '+player.fastes+')',1,player.fastes);if(qty===null)return;
  if(action==='annuler'){
    const s=Math.min(qty,player.nefastes);
    player.fastes=Math.max(0,player.fastes-s);
    player.nefastes=Math.max(0,player.nefastes-s);
    // Retirer s fastes et s néfastes depuis la fin des listes
    if(testState){
      testState.distribution.faste.splice(-s,s);
      testState.distribution.nefaste.splice(-s,s);
      updateResultRow('faste',testState.distribution,testState.elem);
      updateResultRow('nefaste',testState.distribution,testState.elem);
      showWheelResults(testState.distribution,testState.elem);
    }
    showToast(s+' faste(s) et néfaste(s) annulés');
  }else{
    const n=Math.min(qty,player.fastes);
    player.fastes=Math.max(0,player.fastes-n);
    // Retirer n fastes depuis la fin
    if(testState){
      testState.distribution.faste.splice(-n,n);
      updateResultRow('faste',testState.distribution,testState.elem);
      showWheelResults(testState.distribution,testState.elem);
    }
    showToast(n+' faste(s) utilisé(s) pour des effets');
  }
  saveGame();renderGame();refreshPostTestActions();
}
function spendNefastes(player,action){
  const qty=promptNumber('Néfastes à utiliser (dispo: '+player.nefastes+')',1,player.nefastes);if(qty===null)return;
  if(action==='annuler'){
    const s=Math.min(qty,player.fastes);
    player.fastes=Math.max(0,player.fastes-s);
    player.nefastes=Math.max(0,player.nefastes-s);
    // Retirer s fastes et s néfastes depuis la fin
    if(testState){
      testState.distribution.faste.splice(-s,s);
      testState.distribution.nefaste.splice(-s,s);
      updateResultRow('faste',testState.distribution,testState.elem);
      updateResultRow('nefaste',testState.distribution,testState.elem);
      showWheelResults(testState.distribution,testState.elem);
    }
    showToast(s+' faste(s) et néfaste(s) annulés');
  }else{
    const n=Math.min(qty,player.nefastes);
    player.nefastes=Math.max(0,player.nefastes-n);
    // Retirer n néfastes depuis la fin
    if(testState){
      testState.distribution.nefaste.splice(-n,n);
      updateResultRow('nefaste',testState.distribution,testState.elem);
      showWheelResults(testState.distribution,testState.elem);
    }
    showToast(n+' néfaste(s) utilisé(s)');
  }
  saveGame();renderGame();refreshPostTestActions();
}
function postTestTinJi(type,player){
  const qty=promptNumber('Points Tin Ji (dispo: '+gameState.tinjin+')',1,gameState.tinjin);if(qty===null)return;
  gameState.tinjin-=qty;
  if(type==='faste'){
    player.fastes+=qty;
    if(testState){
      // Ajouter des marqueurs yang de l'élément généré pour affichage roue
      const genElem=ELEMENTS[testState.elem].genere;
      const yangValForElem={'eau':1,'bois':9,'feu':7,'terre':5,'metal':3};
      const yangVal=yangValForElem[genElem];
      for(let i=0;i<qty;i++)testState.distribution.faste.push(yangVal!==undefined?yangVal:'★');
    }
  }else{
    player.nefastes+=qty;
    if(testState){
      const genParElem=ELEMENTS[testState.elem].generePar;
      const yangValForElem={'eau':1,'bois':9,'feu':7,'terre':5,'metal':3};
      const yangVal=yangValForElem[genParElem];
      for(let i=0;i<qty;i++)testState.distribution.nefaste.push(yangVal!==undefined?yangVal:'★');
    }
  }
  showToast(qty+' Tin Ji → '+qty+' '+type+'(s) pour '+player.name);
  saveGame();renderGame();
  if(testState){
    updateResultRow(type==='faste'?'faste':'nefaste',testState.distribution,testState.elem);
    showWheelResults(testState.distribution,testState.elem);
    refreshPostTestActions();
  }
}
function promptNumber(msg,min,max){
  if(max<=0){showToast('Aucun disponible');return null;}
  const v=window.prompt(msg+' ['+min+'-'+max+']');if(v===null)return null;
  const n=parseInt(v);
  if(isNaN(n)||n<min||n>max){showToast('Valeur invalide ('+min+'-'+max+')');return null;}
  return n;
}

// ══ SECTION : Sélection dés dans le Loksyu ══
// ── Loksyu pick ──
let loksyuPickCtx=null;
function openLoksyuPickModal(elem,type,player,available){
  if(available.length===0){showToast('Aucun dé disponible');return;}
  loksyuPickCtx={elem,type,player,available,selected:[]};
  const modal=document.createElement('div');modal.className='modal-overlay open';modal.id='modal-lp';
  modal.innerHTML=`<div class="modal">
    <div class="modal-title">Prendre dans le Loksyu → ${type==='succes'?'Succès':'Fastes'}</div>
    <div class="modal-body">
      <p style="font-size:.9rem;color:var(--text-dim);margin-bottom:.8rem">Sélectionnez les dés (${ELEMENTS[elem].label})</p>
      <div id="lp-grid" class="loksyu-grid" style="gap:8px"></div>
    </div>
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="document.getElementById('modal-lp').remove()">Annuler</button>
      <button class="btn btn-primary" onclick="confirmLoksyuPick()">Confirmer</button>
    </div>
  </div>`;
  document.body.appendChild(modal);
  const grid=document.getElementById('lp-grid');
  available.forEach(die=>{
    const div=document.createElement('div');
    div.className=`loksyu-die die-${die.value} selectable`;div.textContent=die.value;
    div.onclick=()=>{
      div.classList.toggle('selected-die');
      const idx=loksyuPickCtx.selected.indexOf(die.id);
      if(idx>=0)loksyuPickCtx.selected.splice(idx,1);else loksyuPickCtx.selected.push(die.id);
    };
    grid.appendChild(div);
  });
  modal.addEventListener('click',e=>{if(e.target===modal)modal.remove();});
}
function confirmLoksyuPick(){
  if(!loksyuPickCtx||loksyuPickCtx.selected.length===0){document.getElementById('modal-lp')?.remove();return;}
  const count=loksyuPickCtx.selected.length;
  const player=loksyuPickCtx.player,type=loksyuPickCtx.type;
  const pickedDice=gameState.loksyu.filter(d=>loksyuPickCtx.selected.includes(d.id));
  gameState.loksyu=gameState.loksyu.filter(d=>!loksyuPickCtx.selected.includes(d.id));
  if(type==='faste'){
    player.fastes+=count;
    if(testState)pickedDice.forEach(d=>testState.distribution.faste.push(d.value));
    showToast('+'+count+' faste(s) pour '+player.name);
  }else{
    if(testState)pickedDice.forEach(d=>testState.distribution.succes.push(d.value));
    showToast('+'+count+' succès');
  }
  document.getElementById('modal-lp')?.remove();
  saveGame();renderGame();
  if(testState){
    updateResultRow(type==='faste'?'faste':'succes',testState.distribution,testState.elem);
    showWheelResults(testState.distribution,testState.elem);
    refreshPostTestActions();
  }
}

// ══ SECTION : Modal Tin Ji ══
// ── Tin Ji modal général ──
function openTinJiModal(){
  tjSelectedDice=[];
  document.getElementById('tj-available').textContent=gameState.tinjin;
  document.getElementById('tj-points').value=1;document.getElementById('tj-points').max=gameState.tinjin;
  document.getElementById('tj-action').value='effects';
  document.getElementById('tj-loksyu-group').style.display='none';
  document.getElementById('tj-points-group').style.display='block';
  openModal('modal-tinjin');
}
function onTjActionChange(){
  const v=document.getElementById('tj-action').value;
  document.getElementById('tj-loksyu-group').style.display=v==='loksyu'?'block':'none';
  document.getElementById('tj-points-group').style.display=v==='loksyu'?'none':'block';
  if(v==='loksyu')renderTjLoksyuSelect();
}
function renderTjLoksyuSelect(){
  const grid=document.getElementById('tj-loksyu-select');grid.innerHTML='';tjSelectedDice=[];updateTjCost();
  gameState.loksyu.forEach(die=>{
    const div=document.createElement('div');div.className=`loksyu-die die-${die.value} selectable`;div.textContent=die.value;
    div.title=ELEMENTS[V2E[die.value]].label;
    div.onclick=()=>{
      const idx=tjSelectedDice.indexOf(die.id);
      if(idx>=0){tjSelectedDice.splice(idx,1);div.classList.remove('selected-die');}
      else{tjSelectedDice.push(die.id);div.classList.add('selected-die');}
      updateTjCost();
    };
    grid.appendChild(div);
  });
}
function updateTjCost(){
  let cost=0;
  tjSelectedDice.forEach(id=>{
    const die=gameState.loksyu.find(d=>d.id===id);if(!die)return;
    const sameElem=gameState.loksyu.filter(d=>V2E[d.value]===V2E[die.value]);
    cost+=sameElem.length>=2?2:4;
  });
  document.getElementById('tj-cost-display').textContent='Coût : '+cost+' pts (dispo : '+gameState.tinjin+')';
}
function applyTinJi(){
  const action=document.getElementById('tj-action').value;
  const player=getPlayer(gameState.selectedPlayerId);
  if(action==='loksyu'){
    let cost=0;const toRemove=[];
    tjSelectedDice.forEach(id=>{
      const die=gameState.loksyu.find(d=>d.id===id);if(!die)return;
      const sameElem=gameState.loksyu.filter(d=>V2E[d.value]===V2E[die.value]);
      cost+=sameElem.length>=2?2:4;toRemove.push(id);
    });
    if(cost>gameState.tinjin){showToast('Pas assez de Tin Ji');return;}
    gameState.tinjin-=cost;
    gameState.loksyu=gameState.loksyu.filter(d=>!toRemove.includes(d.id));
    showToast(toRemove.length+' dé(s) retirés ('+cost+' pts)');
  }else{
    const pts=parseInt(document.getElementById('tj-points').value)||0;
    if(pts<=0||pts>gameState.tinjin){showToast('Valeur invalide');return;}
    gameState.tinjin-=pts;
    if(action==='faste'&&player){player.fastes+=pts;showToast('+'+pts+' faste(s) pour '+player.name);}
    else if(action==='nefaste'&&player){player.nefastes+=pts;showToast('+'+pts+' néfaste(s) pour '+player.name);}
    else showToast(pts+' pts Tin Ji dépensés');
  }
  closeModal('modal-tinjin');saveGame();renderGame();
  if(testState){showWheelResults(testState.distribution,testState.elem);refreshPostTestActions();}
}

// ══ SECTION : Flash-back ══
// ── Flash-back ──
function openFlashbackModal(){
  const sel=document.getElementById('fb-player');sel.innerHTML='';
  gameState.players.forEach(p=>{
    const o=document.createElement('option');o.value=String(p.id);
    o.textContent=p.name+' ('+ELEMENTS[p.element].label+')';sel.appendChild(o);
  });
  updateFlashbackInfo();openModal('modal-flashback');
}
function updateFlashbackInfo(){
  const id=document.getElementById('fb-player').value;
  const p=gameState.players.find(pl=>String(pl.id)===id);if(!p)return;
  const vals=ELEMENTS[p.element].values;
  const hasYin=gameState.loksyu.some(d=>d.value===vals[0]);
  const hasYang=gameState.loksyu.some(d=>d.value===vals[1]);
  const yi=`<span class="fb-check ${hasYin?'fb-ok':'fb-ko'}">${hasYin?'✓':'✗'}</span>`;
  const ya=`<span class="fb-check ${hasYang?'fb-ok':'fb-ko'}">${hasYang?'✓':'✗'}</span>`;
  document.getElementById('fb-info').innerHTML=
    'Élément : <strong>'+ELEMENTS[p.element].label+' '+ELEMENTS[p.element].kanji+'</strong><br>'+
    yi+' Dé Yin ('+vals[0]+') — '+(hasYin?'disponible':'absent')+'<br>'+
    ya+' Dé Yang ('+vals[1]+') — '+(hasYang?'disponible':'absent');
  document.getElementById('fb-confirm').disabled=!(hasYin&&hasYang);
  document.getElementById('fb-confirm').style.opacity=(hasYin&&hasYang)?'1':'0.4';
}
function doFlashback(){
  const id=document.getElementById('fb-player').value;
  const p=gameState.players.find(pl=>String(pl.id)===id);if(!p)return;
  const vals=ELEMENTS[p.element].values;let rY=false,rG=false;
  gameState.loksyu=gameState.loksyu.filter(d=>{
    if(!rY&&d.value===vals[0]){rY=true;return false;}
    if(!rG&&d.value===vals[1]){rG=true;return false;}
    return true;
  });
  closeModal('modal-flashback');showToast('Flash-back de '+p.name+' !');saveGame();renderGame();
}

// ══ SECTION : Gain énergie Hei ══
// ── Énergie Hei ──
function openEnergyModal(){
  heiSelectedDice=[];
  const sel=document.getElementById('hei-player');sel.innerHTML='';
  gameState.players.forEach(p=>{
    const o=document.createElement('option');o.value=String(p.id);o.textContent=p.name;sel.appendChild(o);
  });
  const yangGrid=document.getElementById('hei-yang-grid');
  const yinGrid=document.getElementById('hei-yin-grid');
  yangGrid.innerHTML='';yinGrid.innerHTML='';
  gameState.loksyu.forEach(die=>{
    const isYin=V2YIN[die.value];
    const div=document.createElement('div');div.className=`loksyu-die die-${die.value} selectable`;div.textContent=die.value;
    div.title=ELEMENTS[V2E[die.value]].label+' '+(isYin?'Yin':'Yang');
    div.onclick=()=>{
      div.classList.toggle('selected-die');
      const idx=heiSelectedDice.indexOf(die.id);
      if(idx>=0)heiSelectedDice.splice(idx,1);else heiSelectedDice.push(die.id);
    };
    (isYin?yinGrid:yangGrid).appendChild(div);
  });
  if(!yangGrid.children.length)yangGrid.innerHTML='<span style="color:var(--text-dim);font-size:.9rem">Aucun</span>';
  if(!yinGrid.children.length)yinGrid.innerHTML='<span style="color:var(--text-dim);font-size:.9rem">Aucun</span>';
  openModal('modal-energy');
}
function doGainEnergy(){
  if(heiSelectedDice.length===0){closeModal('modal-energy');return;}
  gameState.loksyu=gameState.loksyu.filter(d=>!heiSelectedDice.includes(d.id));
  showToast(heiSelectedDice.length+' dé(s) retirés du Loksyu');
  closeModal('modal-energy');saveGame();renderGame();
}

// ══ SECTION : Fin de partie ══
// ── Fin de partie ──
function confirmEndGame(){openModal('modal-end-game');}
function endGame(){
  localStorage.removeItem('cde_game');
  gameState=null;setupPlayers=[];currentMode=null;testState=null;testSnapshot=null;
  selectedTestElement=null;rollLocked=false;
  if(diceBox){try{diceBox.clear();}catch(e){}diceBox=null;}
  document.getElementById('screen-game').classList.remove('active');
  document.getElementById('screen-setup').classList.add('active');
  closeModal('modal-end-game');
  document.getElementById('resume-btn-container').style.display='none';
  document.getElementById('players-list').innerHTML='';
  document.getElementById('mj-name').value='Meneur';
  setupPlayers=[];renderSetupPlayers();
  showToast('Partie terminée');
}

// ══ SECTION : Utilitaires ══
// ── Utilitaires ──
function openModal(id){document.getElementById(id).classList.add('open');}
function closeModal(id){document.getElementById(id).classList.remove('open');}
function openResetLoksyuModal(){openModal('modal-reset-loksyu');}
function openRituelModal(){openModal('modal-rituel');}
function showToast(msg,dur=3000){
  const t=document.getElementById('toast');
  t.textContent=msg;t.classList.add('show');
  setTimeout(()=>t.classList.remove('show'),dur);
}
function shuffleArray(arr){
  for(let i=arr.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[arr[i],arr[j]]=[arr[j],arr[i]];}
  return arr;
}
document.querySelectorAll('.modal-overlay').forEach(o=>{
  o.addEventListener('click',e=>{if(e.target===o)o.classList.remove('open');});
});

