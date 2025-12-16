// === IMPORTAÇÕES DO FIREBASE ===
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, collection, addDoc, query, orderBy, limit, getDocs } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// === CONFIGURAÇÃO DO FIREBASE ===
const firebaseConfig = {
  apiKey: "AIzaSyDTwh9_w928xj02B4ao-xTGqCemvI8yDQA",
  authDomain: "coraline-game.firebaseapp.com",
  projectId: "coraline-game",
  storageBucket: "coraline-game.firebasestorage.app",
  messagingSenderId: "52348643168",
  appId: "1:52348643168:web:6e916b991aa772dc136005",
  measurementId: "G-BDHXSMSNKM"
};

// Inicializa o Banco de Dados
let db;
try {
    const app = initializeApp(firebaseConfig);
    db = getFirestore(app);
    console.log("Conectado ao Outro Mundo (Firebase)!");
} catch (e) {
    console.error("Erro ao conectar:", e);
}

// === ELEMENTOS DOM ===
const bird = document.getElementById('bird');
const gameContainer = document.getElementById('game-container');
const scoreElement = document.getElementById('score');
const timeElement = document.getElementById('time');
const startScreen = document.getElementById('start-screen');
const gameOverScreen = document.getElementById('game-over-screen');
const rankingScreen = document.getElementById('ranking-screen');
const rankingList = document.getElementById('ranking-list');
const finalScoreElement = document.getElementById('final-score');
const bestScoreElement = document.getElementById('best-score');
const tunnelBg = document.getElementById('tunnel-bg');
const restartBtn = document.getElementById('restart-btn');
const saveBtn = document.getElementById('save-btn');
const rankBtn = document.getElementById('rank-btn');
const playerNameInput = document.getElementById('player-name');
const keyCountElement = document.getElementById('key-count');
const itemsContainer = document.getElementById('items-container');
const startMsg = document.getElementById('start-msg'); 

// === ÁUDIOS ===
const bgMusic = document.getElementById('bg-music');
const jumpSound = document.getElementById('jump-sound');
const meowSound = document.getElementById('meow-sound');
const keySound = document.getElementById('key-sound');
const shieldBreakSound = document.getElementById('shield-break-sound');

if (bgMusic) bgMusic.volume = 0.4;
if (jumpSound) jumpSound.volume = 0.6;

// === ESTADO DO JOGO ===
let isMobile = window.innerWidth < 768;
let birdY = window.innerHeight / 2;
let birdX = window.innerWidth * 0.2; 
let velocity = 0;
let rotation = 0;

// Variáveis Físicas
let gravity, jumpStrength, gameSpeed;

let score = 0;
let time = 0;
let gameRunning = false;
let gamePaused = false; 
let pipes = [];
let keys = [];
let bgPosition = 0;
let keysCollected = 0;
let hasExtraLife = false;
let isImmune = false;
let gameLoopId, pipeGeneratorId, timeIntervalId;

if (bestScoreElement) bestScoreElement.textContent = localStorage.getItem('coralineBestScore') || 0;

// === FÍSICA RESPONSIVA ===
function updatePhysics() {
    isMobile = window.innerWidth < 768;
    
    if (startMsg) {
        startMsg.textContent = isMobile ? "Toque para escapar!" : "Pressione ESPAÇO ou Clique para escapar!";
    }

    gravity = isMobile ? 0.35 : 0.45;
    jumpStrength = isMobile ? -7.0 : -8; // Ajuste para mobile
    
    const baseSpeed = window.innerWidth * 0.0045; 
    gameSpeed = Math.max(3, Math.min(baseSpeed * (isMobile ? 1.4 : 1.2), 8));
    
    birdX = window.innerWidth * 0.2; 
}
updatePhysics();

window.addEventListener('resize', () => {
    updatePhysics();
    if(birdY > window.innerHeight) birdY = window.innerHeight - 50;
    
    if(!gameRunning) {
        pipes.forEach(p => { p.topElement.remove(); p.bottomElement.remove(); });
        pipes = [];
    }
});

// === PAUSE AUTOMÁTICO ===
document.addEventListener("visibilitychange", () => {
    if (document.hidden && gameRunning) {
        gamePaused = true;
        if (bgMusic) bgMusic.pause();
        clearInterval(pipeGeneratorId);
        clearInterval(timeIntervalId);
        cancelAnimationFrame(gameLoopId);
    } else if (!document.hidden && gameRunning && gamePaused) {
        gamePaused = false;
        if (bgMusic) bgMusic.play().catch(()=>{});
        loop();
        pipeGeneratorId = setInterval(generatePipes, isMobile ? 1800 : 1500);
        timeIntervalId = setInterval(() => { if(gameRunning) { time++; timeElement.textContent = `⏳ ${time}s`; }}, 1000);
    }
});

// === FUNÇÕES PRINCIPAIS ===
function startGame() {
    if (gameRunning) return;

    document.querySelectorAll('.pipe').forEach(el => el.remove());
    document.querySelectorAll('.key-item').forEach(el => el.remove());
    gameContainer.classList.remove('shake-effect');
    bird.classList.remove('bird-dead', 'has-shield', 'immune');

    gameRunning = true;
    gamePaused = false;
    velocity = 0; 
    rotation = 0;
    birdY = window.innerHeight / 2; 
    bird.style.transform = `translate3d(${birdX}px, ${birdY}px, 0) rotate(0deg)`;
    
    score = 0;
    time = 0;
    keysCollected = 0;
    hasExtraLife = false;
    isImmune = false;
    pipes = [];
    keys = [];
    updateKeyUI();

    scoreElement.textContent = score;
    timeElement.textContent = `⏳ 0s`;
    
    startScreen.classList.remove('active');
    gameOverScreen.classList.remove('active');
    if(rankingScreen) rankingScreen.classList.remove('active');

    if(saveBtn) {
        saveBtn.disabled = false;
        saveBtn.innerText = "Salvar no Ranking";
    }
    
    // CORREÇÃO DE ÁUDIO NA PARTIDA
    if (bgMusic) { 
        bgMusic.currentTime = 0; 
        bgMusic.play().catch((e) => console.log("Áudio aguardando interação:", e));
    }

    jump(); 
    loop();
    
    clearInterval(pipeGeneratorId);
    pipeGeneratorId = setInterval(generatePipes, isMobile ? 1800 : 1500);

    clearInterval(timeIntervalId);
    timeIntervalId = setInterval(() => { if(gameRunning && !gamePaused) { time++; timeElement.textContent = `⏳ ${time}s`; }}, 1000);
}

// === GAME LOOP ===
function loop() {
    if (!gameRunning || gamePaused) return;

    velocity += gravity;
    if (velocity > 12) velocity = 12; 
    birdY += velocity;

    let targetRotation = velocity < 0 ? -25 : Math.min(velocity * 4, 90);
    rotation += (targetRotation - rotation) * 0.15;

    bird.style.transform = `translate3d(${birdX}px, ${birdY}px, 0) rotate(${rotation}deg)`;

    if (birdY >= window.innerHeight - 10 || birdY <= 0) endGame();

    bgPosition -= gameSpeed * 0.5;
    if (tunnelBg) tunnelBg.style.backgroundPositionX = `${bgPosition}px`;

    movePipes();
    moveKeys();

    gameLoopId = requestAnimationFrame(loop);
}

// === GERADORES ===
function generatePipes() {
    if (!gameRunning || gamePaused) return;

    const minGap = 160;
    let gap = window.innerHeight * 0.28; 
    if (gap < minGap) gap = minGap;

    const minPipeHeight = window.innerHeight * 0.1; 
    const maxPipeHeight = window.innerHeight - gap - minPipeHeight;
    const topHeight = Math.floor(Math.random() * (maxPipeHeight - minPipeHeight + 1)) + minPipeHeight;
    
    const pipeWidth = window.innerWidth * 0.14; 

    const topPipe = document.createElement('div');
    topPipe.className = 'pipe top-pipe';
    topPipe.style.height = `${topHeight}px`;
    
    const bottomPipe = document.createElement('div');
    bottomPipe.className = 'pipe bottom-pipe';
    bottomPipe.style.height = `${window.innerHeight - topHeight - gap}px`;
    
    if (Math.random() < 0.3) {
        const cat = document.createElement('div');
        cat.className = 'cat-npc cat-sitting';
        bottomPipe.appendChild(cat);
        if (meowSound && Math.random() < 0.4) { meowSound.currentTime = 0; meowSound.play().catch(()=>{}); }
    }

    gameContainer.appendChild(topPipe);
    gameContainer.appendChild(bottomPipe);

    if (!hasExtraLife && keysCollected < 3 && Math.random() < 0.3) {
        spawnKey(window.innerWidth + 50, topHeight + (gap/2));
    }

    const collisionWidth = isMobile ? (window.innerWidth * 0.14) : 80; 

    pipes.push({ 
        x: window.innerWidth, 
        width: collisionWidth, 
        topHeight: topHeight, 
        gap: gap, 
        topElement: topPipe, 
        bottomElement: bottomPipe, 
        passed: false 
    });
}

function movePipes() {
    pipes.forEach((pipeObj, index) => {
        pipeObj.x -= gameSpeed;
        pipeObj.topElement.style.transform = `translate3d(${pipeObj.x}px, 0, 0)`;
        pipeObj.bottomElement.style.transform = `translate3d(${pipeObj.x}px, 0, 0)`;

        if (checkMathCollision(pipeObj)) {
            if (isImmune) { } else if (hasExtraLife) { useExtraLife(); } else { endGame(); }
        }
        
        if (pipeObj.x + pipeObj.width < birdX && !pipeObj.passed) {
            score++;
            scoreElement.textContent = score;
            pipeObj.passed = true;
            if (score % 5 === 0) gameSpeed += 0.2;
        }

        if (pipeObj.x < -200) {
            pipeObj.topElement.remove();
            pipeObj.bottomElement.remove();
            pipes.splice(index, 1);
        }
    });
}

function checkMathCollision(pipeObj) {
    const vmin = Math.min(window.innerWidth, window.innerHeight);
    const birdSize = vmin * 0.06; 
    const hitPadding = birdSize * 0.3; 
    
    const bLeft = birdX + hitPadding;
    const bRight = birdX + birdSize - hitPadding;
    const bTop = birdY + hitPadding;
    const bBottom = birdY + birdSize - hitPadding;
    
    const pLeft = pipeObj.x;
    const pRight = pipeObj.x + pipeObj.width;
    
    if (bRight > pLeft && bLeft < pRight) {
        if (bTop < pipeObj.topHeight || bBottom > (pipeObj.topHeight + pipeObj.gap)) return true;
    }
    return false;
}

// === ITENS ===
function spawnKey(x, y) {
    const key = document.createElement('div');
    key.className = 'key-item';
    key.style.transform = `translate3d(${x}px, ${y}px, 0)`;
    itemsContainer.appendChild(key);
    keys.push({ x: x, y: y, element: key });
}
function moveKeys() {
    keys.forEach((k, i) => {
        k.x -= gameSpeed;
        k.element.style.transform = `translate3d(${k.x}px, ${k.y}px, 0)`;
        if (Math.abs(k.x - birdX) < 40 && Math.abs(k.y - birdY) < 40) collectKey(i);
        else if (k.x < -50) { k.element.remove(); keys.splice(i, 1); }
    });
}
function collectKey(index) {
    if (keys[index]) {
        keys[index].element.remove();
        keys.splice(index, 1);
        if (keySound) { keySound.currentTime = 0; keySound.play().catch(()=>{}); }
        if (!hasExtraLife) { keysCollected++; if (keysCollected >= 3) activateExtraLife(); updateKeyUI(); }
    }
}
function activateExtraLife() { hasExtraLife = true; keysCollected = 3; bird.classList.add('has-shield'); }
function useExtraLife() {
    hasExtraLife = false; keysCollected = 0; updateKeyUI(); bird.classList.remove('has-shield');
    if (shieldBreakSound) shieldBreakSound.play().catch(()=>{});
    isImmune = true; bird.classList.add('immune'); gameContainer.classList.add('shake-effect');
    setTimeout(() => gameContainer.classList.remove('shake-effect'), 500);
    setTimeout(() => { isImmune = false; bird.classList.remove('immune'); }, 1500);
}
function updateKeyUI() {
    if (keyCountElement) {
        keyCountElement.textContent = keysCollected;
        keyCountElement.parentElement.style.color = hasExtraLife ? '#b0ff26' : '#ffd700';
    }
}

// === FIM DE JOGO ===
function endGame() {
    gameRunning = false;
    clearInterval(pipeGeneratorId);
    clearInterval(timeIntervalId);
    cancelAnimationFrame(gameLoopId);
    if (bgMusic) bgMusic.pause();
    
    finalScoreElement.textContent = score;
    let currentBest = localStorage.getItem('coralineBestScore') || 0;
    if (score > parseInt(currentBest)) {
        localStorage.setItem('coralineBestScore', score);
        currentBest = score;
    }
    if (bestScoreElement) bestScoreElement.textContent = currentBest;

    const savedName = localStorage.getItem('coralinePlayerName');
    if (savedName && playerNameInput) {
        playerNameInput.value = savedName;
    }
    
    bird.classList.add('bird-dead');
    bird.style.transform = `translate3d(${birdX}px, ${window.innerHeight-50}px, 0) rotate(90deg)`;
    gameContainer.classList.add('shake-effect');
    setTimeout(() => gameOverScreen.classList.add('active'), 500);
}

// === RANKING ===
if(saveBtn) {
    saveBtn.addEventListener('click', async () => {
        const name = playerNameInput.value.trim().toUpperCase();
        if (!name || name.length < 2) {
            alert("Digite um nome válido!");
            return;
        }

        localStorage.setItem('coralinePlayerName', name);
        saveBtn.innerText = "Salvando...";
        saveBtn.disabled = true;

        try {
            await addDoc(collection(db, "ranking"), {
                name: name,
                score: score,
                date: new Date()
            });
            alert("Alma registrada no ranking!");
            showRanking(); 
        } catch (e) {
            console.error("Erro ao salvar:", e);
            alert("Erro de conexão (Netlify/Firebase).");
            saveBtn.disabled = false;
            saveBtn.innerText = "Salvar no Ranking";
        }
    });
}

async function showRanking() {
    gameOverScreen.classList.remove('active');
    startScreen.classList.remove('active');
    rankingScreen.classList.add('active');

    rankingList.innerHTML = "<li>Conjurando ranking...</li>";

    try {
        // Aumentado para 100 para permitir rolagem e ver mais jogadores
        const q = query(collection(db, "ranking"), orderBy("score", "desc"), limit(100));
        const querySnapshot = await getDocs(q);

        rankingList.innerHTML = "";
        let position = 1;
        const nomesVistos = new Set();

        querySnapshot.forEach((doc) => {
            const data = doc.data();
            
            if (!nomesVistos.has(data.name)) {
                const li = document.createElement("li");
                li.innerHTML = `<span>#${position} ${data.name}</span> <span>${data.score} pts</span>`;
                rankingList.appendChild(li);
                
                nomesVistos.add(data.name);
                position++;
            }
        });

        if (position === 1) rankingList.innerHTML = "<li>Nenhuma alma coletada ainda...</li>";

    } catch (e) {
        console.error("Erro ranking:", e);
        rankingList.innerHTML = "<li>Erro de conexão.</li>";
    }
}

if(rankBtn) {
    rankBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        showRanking();
    });
}

window.closeRanking = function() {
    rankingScreen.classList.remove('active');
    startScreen.classList.add('active');
};

// === INPUTS & SCROLL CORRIGIDO ===
function jump() {
    if (!gameRunning) return;
    velocity = jumpStrength;
    if (jumpSound) { jumpSound.currentTime = 0; jumpSound.play().catch(()=>{}); }
}

function actionInput(e) {
    // FIX: Permite scroll no ranking list e uso de inputs
    if (e.target.tagName === 'BUTTON' || 
        e.target.tagName === 'INPUT' || 
        e.target.closest('button') || 
        e.target.closest('#ranking-list')) { 
        return; 
    }

    if (e.type === 'touchstart' && e.cancelable) e.preventDefault(); 
    
    if (rankingScreen.classList.contains('active')) return;
    if (gameOverScreen.classList.contains('active')) return;

    if (!gameRunning && startScreen.classList.contains('active')) startGame();
    else if (gameRunning) jump();
}

window.addEventListener('touchstart', actionInput, { passive: false });
window.addEventListener('keydown', (e) => { if (e.code === 'Space') actionInput(e); });
window.addEventListener('mousedown', actionInput);

if (restartBtn) {
    restartBtn.addEventListener('click', startGame);
    restartBtn.addEventListener('touchstart', (e) => { e.stopPropagation(); startGame(); });
}

// === FIX: DESTRAVAR ÁUDIO (Auto-Unlock) ===
function unlockAudio() {
    const sounds = [bgMusic, jumpSound, meowSound, keySound, shieldBreakSound];
    sounds.forEach(sound => {
        if(sound) {
            sound.volume = sound === bgMusic ? 0.4 : 0; 
            sound.play().then(() => {
                if(sound !== bgMusic) {
                    sound.pause();
                    sound.currentTime = 0;
                    sound.volume = 0.6;
                }
            }).catch(() => {});
        }
    });
    // Remove listeners após a primeira interação
    document.removeEventListener('touchstart', unlockAudio);
    document.removeEventListener('click', unlockAudio);
    document.removeEventListener('keydown', unlockAudio);
}
// Adiciona os ouvintes para destravar na primeira ação
document.addEventListener('touchstart', unlockAudio, { once: true });
document.addEventListener('click', unlockAudio, { once: true });
document.addEventListener('keydown', unlockAudio, { once: true });