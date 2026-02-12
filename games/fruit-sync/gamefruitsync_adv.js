/* =========================
    ========== CONSTS =======
    ========================= */
const CANVAS_ID = "output_canvas";
const TIMER_ID = "timer";

const COUNTDOWN_START = 3;
const DETECTION_INTERVAL_MS = 100; // 10 FPS equivalent
const GRASP_THRESHOLD = 0.05; // grasp sensitivity
const TARGET_SCORE = 3; // Win condition (3 rounds completed)
const MATCHES_PER_ROUND = 3; // 3 successful matches = 1 round

// Card positions
const CARD_WIDTH = 106; // Reduced by 20% from 132
const CARD_HEIGHT = 141; // Reduced by 20% from 176
const CARD_SPACING = 38; // Reduced by 20% from 48

/* =========================
    ========== STATE ========
    ========================= */
const state = {
    gameStarted: false,
    countdown: COUNTDOWN_START,
    countdownRunning: false,

    score: 0,
    roundsCompleted: 0,
    currentRoundMatches: 0,
    
    // Hand tracking
    leftHand: null,
    rightHand: null,
    leftGrasping: false,
    rightGrasping: false,
    
    // Distance tracking
    totalDistance: 0,
    leftHandDistance: 0,
    rightHandDistance: 0,
    lastLeftHandPos: null,
    lastRightHandPos: null,

    // Grab tracking
    leftHandGrabCount: 0,
    rightHandGrabCount: 0,
    lastLeftGraspState: false,
    lastRightGraspState: false,

    // Cards
    cards: [],
    leftTouchingCard: null,
    rightTouchingCard: null,
    leftSelectedCard: null,
    rightSelectedCard: null,
    matchInProgress: false,
    currentMatchType: null,

    // timer
    startTime: null,
    timerIntervalId: null,
    finalElapsed: 0,

    // hand tracking
    videoElement: null,
    handDetector: null,
    lastDetectionTime: 0,
    detectionInterval: DETECTION_INTERVAL_MS,

    // loop
    rafId: null,
    showWinOverlay: false,
    
    lastFrameTime: 0,
    deltaTime: 0,
};

let isMuted = false;

/* =========================
    ====== DOM & UI ELTS ====
    ========================= */
const canvas = document.getElementById(CANVAS_ID);
const ctx = canvas.getContext("2d");

const titleEl = document.getElementById("gameTitle");
const startBtn = document.getElementById("startBtnOverlay");
const playAgainBtn = document.getElementById("playAgainBtn");
const nextBtn = document.getElementById("nextBtn");
const loadingOverlay = document.getElementById("loadingOverlay");
const timerDisplay = document.getElementById(TIMER_ID);
const muteBtn = document.getElementById("muteBtn");
const scoreDisplay = document.getElementById("score");

if (muteBtn) {
    muteBtn.addEventListener("click", () => {
        isMuted = !isMuted;
        bgMusic.muted = isMuted;
        muteBtn.textContent = isMuted ? "🔇" : "🔊";
    });
}

/* =========================
    ======== Assets =========
    ========================= */
const coverImg = new Image();
coverImg.src = "/assets/images/fruitbackcover.png"; // Cover image before game starts

const backgroundImg = new Image();
backgroundImg.src = "/assets/images/fruitback1.png"; // Game background

const cardAImg = new Image();
cardAImg.src = "/assets/images/card_a.png";

const cardIImg = new Image();
cardIImg.src = "/assets/images/card_e.png";

const cardBImg = new Image();
cardBImg.src = "/assets/images/card_b.png";

const cardDImg = new Image();
cardDImg.src = "/assets/images/card_d.png";

const cardHImg = new Image();
cardHImg.src = "/assets/images/card_h.png";

const leftHandImg = new Image();
leftHandImg.src = "/assets/images/lhand_shape.png";

const rightHandImg = new Image();
rightHandImg.src = "/assets/images/rhand_shape.png";

const leftGrabImg = new Image();
leftGrabImg.src = "/assets/images/lgrab.png";

const rightGrabImg = new Image();
rightGrabImg.src = "/assets/images/rgrab.png";

const medalImg = new Image();
medalImg.src = "/assets/images/medal.png";

// sound assets
const matchSound = new Audio("/assets/sounds/dingeffect.wav");
const countdownSound = new Audio("/assets/sounds/countdown.wav");
const endApplause = new Audio("/assets/sounds/endapplause.wav");
endApplause.volume = 0.7;

const bgMusic = new Audio("/assets/sounds/05Backmusic59s.mp3");
bgMusic.loop = true;
bgMusic.volume = 0.9;

/* =========================
    ======= Initialization ==
    ========================= */

function preloadAssets() {
    const promises = [];
    const images = [
        coverImg, backgroundImg, cardAImg, cardIImg, cardBImg, cardDImg, cardHImg,
        leftHandImg, rightHandImg, leftGrabImg, rightGrabImg, medalImg
    ];

    images.forEach(img => {
        promises.push(new Promise((resolve) => {
            if (img.complete) return resolve();
            img.onload = () => resolve();
            img.onerror = () => resolve();
        }));
    });

    return Promise.all(promises);
}

function drawCover() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    if (coverImg.complete) {
        ctx.drawImage(coverImg, 0, 0, canvas.width, canvas.height);
    }

    ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
}

/* =========================
    ==== GAME SETUP ====
    ========================= */

function initGame() {
    state.score = 0;
    state.roundsCompleted = 0;
    state.currentRoundMatches = 0;
    state.currentMatchType = null;
    updateScore();

    state.totalDistance = 0;
    state.leftHandDistance = 0;
    state.rightHandDistance = 0;
    state.lastLeftHandPos = null;
    state.lastRightHandPos = null;

    state.leftHandGrabCount = 0;
    state.rightHandGrabCount = 0;
    state.lastLeftGraspState = false;
    state.lastRightGraspState = false;

    state.lastFrameTime = 0;
    state.deltaTime = 0;

    initializeCards();
}

function initializeCards() {
    const cardTypes = ['A', 'A', 'I', 'I', 'H', 'H', 'B', 'D'];
    
    // Shuffle card types
    for (let i = cardTypes.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [cardTypes[i], cardTypes[j]] = [cardTypes[j], cardTypes[i]];
    }

    // Uniform card positions: 4 at top & 4 at bottom
    const padding = 60;
    const centerX = canvas.width / 2;
    const topY = padding + 20;
    const bottomY = canvas.height - padding - CARD_HEIGHT - 20;

    // Add 10% spacing between cards
    const spacingMultiplier = 1.5;
    const adjustedSpacing = CARD_SPACING * spacingMultiplier;

    // Top row: 4 cards
    const topCardStartX = centerX - (CARD_WIDTH * 2 + adjustedSpacing * 1.5);
    const topPositions = [
        { x: topCardStartX, y: topY },
        { x: topCardStartX + CARD_WIDTH + adjustedSpacing, y: topY },
        { x: topCardStartX + (CARD_WIDTH + adjustedSpacing) * 2, y: topY },
        { x: topCardStartX + (CARD_WIDTH + adjustedSpacing) * 3, y: topY }
    ];
 
    // Bottom row: 4 cards
    const bottomCardStartX = centerX - (CARD_WIDTH * 2 + adjustedSpacing * 1.5);
    const bottomPositions = [
        { x: bottomCardStartX, y: bottomY },
        { x: bottomCardStartX + CARD_WIDTH + adjustedSpacing, y: bottomY },
        { x: bottomCardStartX + (CARD_WIDTH + adjustedSpacing) * 2, y: bottomY },
        { x: bottomCardStartX + (CARD_WIDTH + adjustedSpacing) * 3, y: bottomY }
    ];

    const positions = [...topPositions, ...bottomPositions];

    state.cards = [];

    for (let i = 0; i < 8; i++) {
        state.cards.push({
            x: positions[i].x,
            y: positions[i].y,
            width: CARD_WIDTH,
            height: CARD_HEIGHT,
            type: cardTypes[i],
            pulseScale: 1,
            matched: false,
            floatOffset: Math.random() * Math.PI * 2,
            floatSpeed: 1 + Math.random() * 0.5,
            glowIntensity: 0
        });
    }
}

/* =========================
    ====== CAMERA & MODEL ===
    ========================= */

async function setupCameraAndModel() {
    try {
        loadingOverlay.style.display = "flex";

        if (!state.videoElement) {
            state.videoElement = document.createElement("video");
            state.videoElement.autoplay = true;
            state.videoElement.playsInline = true;
            state.videoElement.style.display = "none";
            document.body.appendChild(state.videoElement);
        }

        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        state.videoElement.srcObject = stream;

        await new Promise((resolve) => {
            state.videoElement.onloadeddata = () => resolve();
            if (state.videoElement.readyState >= 2) resolve();
        });

        const vision = await FilesetResolver.forVisionTasks(
            "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
        );

        state.handDetector = await HandLandmarker.createFromOptions(vision, {
            baseOptions: {
                modelAssetPath:
                    "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
                delegate: "GPU",
            },
            numHands: 2,
            runningMode: "VIDEO",
        });

        console.log("🖐️ HandLandmarker initialized.");
    } catch (err) {
        console.error("Camera/model setup failed:", err);
        alert("Could not start camera or model. Check permissions and model path.");
    } finally {
        loadingOverlay.style.display = "none";
    }
}

/* =========================
    ====== COUNTDOWN & START
    ========================= */

function runCountdownAndStart() {
    state.countdown = COUNTDOWN_START;
    state.countdownRunning = true;

    const intervalId = setInterval(() => {
        if (backgroundImg.complete) {
            ctx.drawImage(backgroundImg, 0, 0, canvas.width, canvas.height);
        }

        ctx.fillStyle = "rgba(0,0,0,0.7)";
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.fillStyle = "white";
        ctx.font = "bold 180px Arial";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(state.countdown > 0 ? state.countdown : "GO!", canvas.width / 2, canvas.height / 2);

        if (state.countdown === 0) {
            clearInterval(intervalId);
            setTimeout(() => {
                state.countdownRunning = false;
                try {
                    bgMusic.currentTime = 0;
                    bgMusic.play();
                } catch (e) { }

                state.gameStarted = true;
                startTimer();
                initGame();
                gameLoop();
            }, 1000);
        } else {
            try { countdownSound.currentTime = 2; countdownSound.play(); } catch (e) { }
        }

        state.countdown--;
    }, 1000);
}

/* =========================
    ====== CARD LOGIC =======
    ========================= */

function updateCards() {
    const time = Date.now() / 1000;
    
    state.cards.forEach(card => {
        if (card.matched) return;

        // Floating animation - gentle up and down movement
        card.floatOffset += state.deltaTime * card.floatSpeed;
        
        // Check if touching by either hand
        const isTouchingByLeft = state.leftTouchingCard === card;
        const isTouchingByRight = state.rightTouchingCard === card;
        const isTouching = isTouchingByLeft || isTouchingByRight;
        
        // Pulse animation when touching
        if (isTouching) {
            card.pulseScale = 1 + Math.sin(time * 8) * 0.08;
            card.glowIntensity = Math.min(card.glowIntensity + state.deltaTime * 5, 1);
        } else {
            card.pulseScale = 1;
            card.glowIntensity = Math.max(card.glowIntensity - state.deltaTime * 3, 0);
        }
    });
}

function checkCardTouch(handX, handY) {
    for (let card of state.cards) {
        if (card.matched) continue;
        
        const floatY = Math.sin(card.floatOffset) * 8;
        
        if (handX >= card.x && handX <= card.x + card.width &&
            handY >= card.y + floatY && handY <= card.y + floatY + card.height) {
            return card;
        }
    }
    return null;
}

function checkMatch() {
    if (state.leftSelectedCard && state.rightSelectedCard) {
        if (state.leftSelectedCard.type === state.rightSelectedCard.type &&
            state.leftSelectedCard !== state.rightSelectedCard) {
            
            // Successful match!
            state.matchInProgress = true;
            state.leftSelectedCard.matched = true;
            state.rightSelectedCard.matched = true;
            
            state.currentMatchType = state.leftSelectedCard.type;
            state.currentRoundMatches++;
            updateScore();
            
            try { matchSound.currentTime = 0; matchSound.play(); } catch (e) { }
            
            setTimeout(() => {
                state.leftSelectedCard = null;
                state.rightSelectedCard = null;
                state.matchInProgress = false;
                
                // Check if round is complete (3 matches = 1 round)
                if (state.currentRoundMatches >= MATCHES_PER_ROUND) {
                    // Round completed
                    state.roundsCompleted++;
                    state.score = state.roundsCompleted;
                    state.currentRoundMatches = 0; // Reset for next round
                    state.currentMatchType = null;
                    updateScore();
                    
                    if (state.roundsCompleted >= TARGET_SCORE) {
                        // Game won (3 rounds completed)
                        endGame();
                    } else {
                        // Start next round - reinitialize cards
                        initializeCards();
                    }
                }
            }, 1000); // 1 second delay before reset
        } else {
            // Wrong match, reset selections
            state.leftSelectedCard = null;
            state.rightSelectedCard = null;
        }
    }
}

/* =========================
    ====== HAND INPUT =======
    ========================= */

async function updateHandDetection() {
    if (!state.handDetector || !state.gameStarted || !state.videoElement) return;

    const now = performance.now();
    if (now - state.lastDetectionTime < state.detectionInterval) return;
    state.lastDetectionTime = now;

    try {
        const results = await state.handDetector.detectForVideo(state.videoElement, now);
        
        state.leftHand = null;
        state.rightHand = null;

        if (results.landmarks && results.landmarks.length > 0) {
            results.landmarks.forEach((hand, index) => {
                const handedness = results.handedness[index][0].categoryName;
                
                const wrist = hand[0];
                const canvasX = (1 - wrist.x) * canvas.width;
                const canvasY = wrist.y * canvas.height;

                // Detect grasp (thumb to index finger)
                const thumbTip = hand[4];
                const indexTip = hand[8];
                const graspDist = Math.hypot(thumbTip.x - indexTip.x, thumbTip.y - indexTip.y);
                const isGrasping = graspDist < GRASP_THRESHOLD;

                const handData = { x: canvasX, y: canvasY, grasping: isGrasping };

                if (handedness === "Left") {
                    state.leftHand = handData;
                    
                    // Track distance
                    if (state.lastLeftHandPos) {
                        const dx = canvasX - state.lastLeftHandPos.x;
                        const dy = canvasY - state.lastLeftHandPos.y;
                        const distance = Math.sqrt(dx * dx + dy * dy);
                        state.leftHandDistance += distance;
                        state.totalDistance += distance;
                    }
                    state.lastLeftHandPos = { x: canvasX, y: canvasY };

                    // Count grab attempts (transition from not grasping to grasping)
                    if (isGrasping && !state.lastLeftGraspState) {
                        const card = checkCardTouch(canvasX, canvasY);
                        if (card && !card.matched) {
                            state.leftHandGrabCount++;
                            state.leftSelectedCard = card;
                        }
                    } else if (!isGrasping) {
                        state.leftSelectedCard = null;
                    }
                    state.lastLeftGraspState = isGrasping;
                    state.leftGrasping = isGrasping;

                } else if (handedness === "Right") {
                    state.rightHand = handData;
                    
                    // Track distance
                    if (state.lastRightHandPos) {
                        const dx = canvasX - state.lastRightHandPos.x;
                        const dy = canvasY - state.lastRightHandPos.y;
                        const distance = Math.sqrt(dx * dx + dy * dy);
                        state.rightHandDistance += distance;
                        state.totalDistance += distance;
                    }
                    state.lastRightHandPos = { x: canvasX, y: canvasY };

                    // Count grab attempts (transition from not grasping to grasping)
                    if (isGrasping && !state.lastRightGraspState) {
                        const card = checkCardTouch(canvasX, canvasY);
                        if (card && !card.matched) {
                            state.rightHandGrabCount++;
                            state.rightSelectedCard = card;
                        }
                    } else if (!isGrasping) {
                        state.rightSelectedCard = null;
                    }
                    state.lastRightGraspState = isGrasping;
                    state.rightGrasping = isGrasping;
                }
            });

            // Check for match when both hands grasping simultaneously
            if (state.leftGrasping && state.rightGrasping && !state.matchInProgress) {
                checkMatch();
            }
        }

        // Update touching cards for pulse effect (both hands)
        state.leftTouchingCard = null;
        state.rightTouchingCard = null;
        
        if (state.leftHand) {
            state.leftTouchingCard = checkCardTouch(state.leftHand.x, state.leftHand.y);
        }
        if (state.rightHand) {
            state.rightTouchingCard = checkCardTouch(state.rightHand.x, state.rightHand.y);
        }

    } catch (err) {
        console.warn("Hand detection failed:", err);
    }
}

/* =========================
    ======= RENDERING =======
    ========================= */

function drawScene() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (!state.gameStarted || state.showWinOverlay) return;

    // Background
    if (backgroundImg.complete) {
        ctx.drawImage(backgroundImg, 0, 0, canvas.width, canvas.height);
    }

    // Draw cards
    state.cards.forEach(card => {
        if (card.matched) {
            // Fade out effect
            ctx.globalAlpha = 0.3;
        }

        const cardImg = card.type === 'A' ? cardAImg : 
                        (card.type === 'I' ? cardIImg : 
                        (card.type === 'H' ? cardHImg :
                        (card.type === 'B' ? cardBImg : cardDImg)));
        
        const scale = card.pulseScale;
        const floatY = Math.sin(card.floatOffset) * 8;
        
        const w = card.width * scale;
        const h = card.height * scale;
        const x = card.x + (card.width - w) / 2;
        const y = card.y + floatY + (card.height - h) / 2;

        // Shadow effect
        ctx.shadowColor = "rgba(0, 0, 0, 0.5)";
        ctx.shadowBlur = 20;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 10;

        // Glow effect when touching or selected
        if (card === state.leftTouchingCard || card === state.rightTouchingCard || 
            card === state.leftSelectedCard || card === state.rightSelectedCard) {
            const glowAmount = card.glowIntensity * 40;
            ctx.shadowBlur = 20 + glowAmount;
            ctx.shadowColor = `rgba(255, 215, 0, ${card.glowIntensity * 0.8})`;
        }

        if (cardImg.complete) {
            ctx.drawImage(cardImg, x, y, w, h);
        }

        // Reset shadow
        ctx.shadowBlur = 0;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;
        ctx.globalAlpha = 1;
    });

    // Draw hand pointers
    const handSize = 90;
    
    if (state.leftHand) {
        const img = state.leftGrasping ? leftGrabImg : leftHandImg;
        if (img.complete) {
            ctx.drawImage(img, 
                state.leftHand.x - handSize / 2, 
                state.leftHand.y - handSize / 2, 
                handSize, handSize);
        }
    }

    if (state.rightHand) {
        const img = state.rightGrasping ? rightGrabImg : rightHandImg;
        if (img.complete) {
            ctx.drawImage(img, 
                state.rightHand.x - handSize / 2, 
                state.rightHand.y - handSize / 2, 
                handSize, handSize);
        }
    }
}

/* =========================
    ====== GAME LOOP ========
    ========================= */

async function gameLoop(currentTime = 0) {
    if (!state.gameStarted) return;

    if (state.lastFrameTime === 0) {
        state.lastFrameTime = currentTime;
    }
    state.deltaTime = (currentTime - state.lastFrameTime) / 1000;
    state.lastFrameTime = currentTime;

    if (state.deltaTime > 0.1) {
        state.deltaTime = 0.1;
    }

    updateCards();
    await updateHandDetection();
    drawScene();

    state.rafId = requestAnimationFrame(gameLoop);
}

/* =========================
    ======== TIMERS =========
    ========================= */

function startTimer() {
    state.startTime = Date.now();
    timerDisplay && (timerDisplay.textContent = `Time: 0s`);
    if (state.timerIntervalId) clearInterval(state.timerIntervalId);

    state.timerIntervalId = setInterval(() => {
        const elapsed = Math.floor((Date.now() - state.startTime) / 1000);
        timerDisplay && (timerDisplay.textContent = `Time: ${elapsed}s`);
    }, 1000);
}

function stopTimer() {
    if (state.timerIntervalId) {
        clearInterval(state.timerIntervalId);
        state.timerIntervalId = null;
    }
    state.finalElapsed = Math.floor((Date.now() - state.startTime) / 1000);
}

function updateScore() {
    scoreDisplay.textContent = `Score: ${state.score}/${TARGET_SCORE}`;
}

function endGame() {
    if (state.rafId) cancelAnimationFrame(state.rafId);

    setTimeout(() => {
        stopGameCleanup();
        saveGameResult();
        fadeInWinOverlay();
        state.showWinOverlay = true;
    }, 500);
}

/* =========================
    ======= CLEANUP =========
    ========================= */

function stopGameCleanup() {
    state.gameStarted = false;
    stopTimer();
    stopCamera();

    try {
        bgMusic.pause();
        bgMusic.currentTime = 0;
    } catch (e) { }

    try {
        endApplause.currentTime = 0;
        endApplause.play();
    } catch (e) { }
}

function stopCamera() {
    try {
        if (state.videoElement && state.videoElement.srcObject) {
            const tracks = state.videoElement.srcObject.getTracks();
            tracks.forEach(track => track.stop());
            state.videoElement.srcObject = null;
        }
        if (state.videoElement) {
            state.videoElement.remove();
            state.videoElement = null;
        }
    } catch (e) {
        console.warn("Error stopping camera:", e);
    }
}

/* =========================
    ======= WIN OVERLAY =====
    ========================= */

function fadeInWinOverlay() {
    let opacity = 0;
    const fadeDuration = 3000;
    const startTime = performance.now();

    const finalTime = state.finalElapsed ?? 0;

    function drawOverlay(now) {
        const elapsed = now - startTime;
        opacity = Math.min(elapsed / fadeDuration, 1);

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        if (backgroundImg.complete) {
            ctx.drawImage(backgroundImg, 0, 0, canvas.width, canvas.height);
        }

        ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        const cardWidth = 520;
        const cardHeight = 450;
        const cardX = (canvas.width - cardWidth) / 2;
        const cardY = (canvas.height - cardHeight) / 2;
        const cornerRadius = 24;
        
        ctx.fillStyle = "rgba(0, 0, 0, 0.4)";
        roundedRect(ctx, cardX + 8, cardY + 8, cardWidth, cardHeight, cornerRadius);
        ctx.fill();
        
        const gradient = ctx.createLinearGradient(cardX, cardY, cardX + cardWidth, cardY + cardHeight);
        gradient.addColorStop(0, "#1E293B");
        gradient.addColorStop(1, "#0F172A");
        ctx.fillStyle = gradient;
        roundedRect(ctx, cardX, cardY, cardWidth, cardHeight, cornerRadius);
        ctx.fill();
        
        const accentGradient = ctx.createLinearGradient(cardX, cardY, cardX + cardWidth, cardY);
        accentGradient.addColorStop(0, "#FF8C00");
        accentGradient.addColorStop(0.5, "#FFA500");
        accentGradient.addColorStop(1, "#FF8C00");
        ctx.fillStyle = accentGradient;
        ctx.fillRect(cardX, cardY, cardWidth, 6);

        if (medalImg && medalImg.complete) {
            const medalSize = 130;
            ctx.shadowColor = "#FFA500";
            ctx.shadowBlur = 30;
            ctx.drawImage(medalImg, canvas.width / 2 - medalSize / 2, cardY + 50, medalSize, medalSize);
            ctx.shadowBlur = 0;
        }

        ctx.shadowColor = "rgba(0, 0, 0, 0.5)";
        ctx.shadowBlur = 10;
        ctx.fillStyle = "#FFA500";
        ctx.font = "bold 40px Poppins, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("Congrats!", canvas.width / 2, cardY + 210);
        ctx.shadowBlur = 0;

        ctx.fillStyle = "#94A3B8";
        ctx.font = "22px Poppins, sans-serif";
        ctx.fillText("You completed all 3 rounds!", canvas.width / 2, cardY + 250);

        const statsY = cardY + 280;
        const statsWidth = cardWidth - 80;
        const statsX = cardX + 40;
        
        ctx.fillStyle = "rgba(255, 140, 0, 0.1)";
        roundedRect(ctx, statsX, statsY, statsWidth, 70, 16);
        ctx.fill();
        
        ctx.strokeStyle = "rgba(255, 165, 0, 0.4)";
        ctx.lineWidth = 2;
        roundedRect(ctx, statsX, statsY, statsWidth, 70, 16);
        ctx.stroke();

        ctx.textAlign = "center";
        ctx.fillStyle = "#94A3B8";
        ctx.font = "24px Poppins, sans-serif";
        ctx.fillText(`Your Time: ${finalTime}s`, canvas.width / 2, statsY + 40);

        if (opacity < 1) {
            requestAnimationFrame(drawOverlay);
        } else {
            playAgainBtn.style.display = "block";
            nextBtn.style.display = "block";
        }
    }

    function roundedRect(ctx, x, y, width, height, radius) {
        ctx.beginPath();
        ctx.moveTo(x + radius, y);
        ctx.lineTo(x + width - radius, y);
        ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
        ctx.lineTo(x + width, y + height - radius);
        ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
        ctx.lineTo(x + radius, y + height);
        ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
        ctx.lineTo(x, y + radius);
        ctx.quadraticCurveTo(x, y, x + radius, y);
        ctx.closePath();
    }

    requestAnimationFrame(drawOverlay);
}

/* =========================
    ===== CONSISTENCY =======
    ========================= */

function calculateStandardDeviation(values) {
    if (values.length === 0) return 0;
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
    return Math.sqrt(variance);
}

async function calculateConsistency(userEmail) {
    try {
        const { data, error } = await supabase
            .from("fruitsync_results")
            .select("time_taken")
            .eq("player_email", userEmail)
            .eq("level", "ADVANCED")
            .order("created_at", { ascending: false })
            .limit(5);

        if (error) {
            console.error("Error fetching consistency data:", error);
            return null;
        }

        if (!data || data.length < 5) {
            console.log("Not enough games for consistency calculation (need 5)");
            return null;
        }

        const times = data.map(row => row.time_taken);
        const stdDev = calculateStandardDeviation(times);
        const mean = times.reduce((a, b) => a + b, 0) / times.length;
        const cv = mean > 0 ? (stdDev / mean) * 100 : 0;
        const consistencyScore = Math.max(0, Math.min(100, 100 - cv));

        return Math.round(consistencyScore * 100) / 100;
    } catch (err) {
        console.error("Consistency calculation error:", err);
        return null;
    }
}

/* =========================
    ===== GRASP PRECISION ====
    ========================= */

function calculateGraspPrecision() {
    const leftGrabs = state.leftHandGrabCount ?? 0;
    const rightGrabs = state.rightHandGrabCount ?? 0;
    
    const totalGrabs = leftGrabs + rightGrabs;
    
    // Avoid division by zero
    if (totalGrabs === 0) {
        return 0;
    }
    
    const graspPrecision = (18 / totalGrabs) * 100;
    
    // Clamp between 0 and 100
    return Math.max(0, Math.min(100, Math.round(graspPrecision * 100) / 100));
}

/* =========================
    ======= SAVE RESULT =====
    ========================= */

async function saveGameResult() {
    console.log("Saving game result...");

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
        console.error("No user logged in:", userError);
        return;
    }

    console.log("User found:", user.email);

    const finalTime = state.finalElapsed ?? 0;
    const score = state.roundsCompleted ?? 0;
    const totalDistance = Math.round(state.totalDistance);
    const leftHandDistance = Math.round(state.leftHandDistance);
    const rightHandDistance = Math.round(state.rightHandDistance);
    const leftHandGrabCount = state.leftHandGrabCount ?? 0;
    const rightHandGrabCount = state.rightHandGrabCount ?? 0;

    const consistency = await calculateConsistency(user.email);
    const graspPrecision = calculateGraspPrecision();

    console.log("Calculated consistency:", consistency);
    console.log("Calculated grasp precision:", graspPrecision);

    const { error: insertError } = await supabase
        .from("fruitsync_results")
        .insert([{
            player_email: user.email,
            score: score,
            level: "ADVANCED",
            time_taken: finalTime,
            totaldistance: totalDistance,
            r_hand_distance: rightHandDistance,
            l_hand_distance: leftHandDistance,
            l_hand_grab: leftHandGrabCount,
            r_hand_grab: rightHandGrabCount,
            consistency: consistency,
            grasp_precision: graspPrecision
        }])
        .select();

    if (insertError) {
        console.error("Insert error:", insertError);
    } else {
        console.log("Result saved successfully!");
        console.log(`Total distance: ${totalDistance}px`);
        console.log(`Left hand distance: ${leftHandDistance}px`);
        console.log(`Right hand distance: ${rightHandDistance}px`);
        console.log(`Left hand grab attempts: ${leftHandGrabCount}`);
        console.log(`Right hand grab attempts: ${rightHandGrabCount}`);
        console.log(`Consistency: ${consistency}`);
        console.log(`Grasp Precision: ${graspPrecision}`);
    }
}

/* =========================
    ======= EVENTS ==========
    ========================= */

startBtn.addEventListener("click", async () => {
    startBtn.style.display = "none";
    titleEl.style.display = "none";
    playAgainBtn.style.display = "none";
    nextBtn.style.display = "none";

    await preloadAssets();
    drawCover();

    await setupCameraAndModel();
    runCountdownAndStart();
});

playAgainBtn.addEventListener("click", () => {
    window.location.href = "/games/fruit-sync/play";
});

nextBtn.addEventListener("click", () => {
    window.location.href = "/games/fruit-sync/cover";
});

/* =========================
    ======= STARTUP =========
    ========================= */

if (coverImg.complete) {
    drawCover();
} else {
    coverImg.onload = () => drawCover();
}

/* =========================
    ====== POPUP SYSTEM =====
    ========================= */

function showPopup() {
    const guidePopup = document.getElementById("guidePopup");
    if (guidePopup) guidePopup.style.display = "flex";
}

function hidePopup() {
    const guidePopup = document.getElementById("guidePopup");
    if (guidePopup) guidePopup.style.display = "none";
}

const howToPlayBtn = document.getElementById("howToPlayBtn");
const closeGuideBtn = document.getElementById("closeGuideBtn");

if (howToPlayBtn) howToPlayBtn.addEventListener("click", showPopup);
if (closeGuideBtn) closeGuideBtn.addEventListener("click", hidePopup);

window.addEventListener("load", showPopup);