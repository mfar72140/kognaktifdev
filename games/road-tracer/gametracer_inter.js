/* =========================
    ========== CONSTS =======
    ========================= */
const CANVAS_ID = "output_canvas";
const TIMER_ID = "timer";

const COUNTDOWN_START = 3;
const DETECTION_INTERVAL_MS = 100; // 10 FPS equivalent
const PINCH_THRESHOLD = 0.05; // pinch sensitivity
const TARGET_SCORE = 3; // Win condition (3 successful runs)

// Delta time settings
const TARGET_FPS = 60;
const DELTA_TIME_SCALE = 0.6;

// Road boundaries (will be set after image loads)
let ROAD_TOP = 0;
let ROAD_BOTTOM = 0;
let ROAD_HEIGHT = 0;

/* =========================
    ========== STATE ========
    ========================= */
const state = {
    gameStarted: false,
    countdown: COUNTDOWN_START,
    countdownRunning: false,

    car: null,
    carInitialX: 0,
    carInitialY: 0,
    
    isPinching: false,
    carControlled: false,
    
    score: 0,
    runsCompleted: 0,
    
    // Distance tracking
    totalDistance: 0,
    lastCarPos: null,

    // NEW: Tracking metrics
    attempts: 0,
    boundryHits: 0,
    successfulPinches: 0, // NEW: Count pinches that reach finish line

    // timer
    startTime: null,
    timerIntervalId: null,

    // hand tracking
    videoElement: null,
    handDetector: null,
    lastHandPos: null,
    handPointer: null,
    lastDetectionTime: 0,
    detectionInterval: DETECTION_INTERVAL_MS,

    // loop
    rafId: null,
    showWinOverlay: false,
    
    // delta time
    lastFrameTime: 0,
    deltaTime: 0,

    // car state
    carOutsideRoad: false,
    reachedEnd: false,
    showGoodText: false,
    goodTextTime: 0,

    // background switch
    useGameBackground: false,
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
const backgroundCoverImg = new Image();
backgroundCoverImg.src = "/assets/images/roadbackgcover.png";

const backgroundGameImg = new Image();
backgroundGameImg.src = "/assets/images/roadbackg2.png";

const roadImg = new Image();
roadImg.src = "/assets/images/road2.png";

const roadMaskImg = new Image();
roadMaskImg.src = "/assets/images/road2mask.png";

const roadConeImg = new Image();
roadConeImg.src = "/assets/images/roadcone.png";

const carImg = new Image();
carImg.src = "/assets/images/car.png";

const handImg = new Image();
handImg.src = "/assets/images/rhand_shape.png";

const pinchImg = new Image();
pinchImg.src = "/assets/images/rpinch_shape.png";

const goArrowImg = new Image();
goArrowImg.src = "/assets/images/go_arrow.png";

const stopImg = new Image();
stopImg.src = "/assets/images/stop.png";

const policeImg = new Image();
policeImg.src = "/assets/images/police.png";

const medalImg = new Image();
medalImg.src = "/assets/images/medal.png";

// sound assets
const dingSound = new Audio("/assets/sounds/dingeffect.wav");
const countdownSound = new Audio("/assets/sounds/countdown2.wav");
const boundarySound = new Audio('/assets/sounds/touch2.mp3');
const endApplause = new Audio("/assets/sounds/endapplause.wav");
endApplause.volume = 0.7;

const bgMusic = new Audio("/assets/sounds/04Backmusic28s.mp3");
bgMusic.loop = true;
bgMusic.volume = 0.9;

/* =========================
    ======= Initialization ==
    ========================= */

function preloadAssets() {
    const promises = [];
    const images = [
        backgroundCoverImg, backgroundGameImg, roadImg, roadMaskImg, roadConeImg, carImg,
        handImg, pinchImg, goArrowImg, stopImg, policeImg, medalImg
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
    
    if (backgroundCoverImg.complete) {
        ctx.drawImage(backgroundCoverImg, 0, 0, canvas.width, canvas.height);
    }

    ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
}

/* =========================
    ==== GAME SETUP ====
    ========================= */

function initGame() {
    state.score = 0;
    state.runsCompleted = 0;
    updateScore();

    state.totalDistance = 0;
    state.lastCarPos = null;

    // Reset tracking metrics
    state.attempts = 0;
    state.boundryHits = 0;
    state.successfulPinches = 0;

    state.lastFrameTime = 0;
    state.deltaTime = 0;
    state.useGameBackground = true;

    // Calculate road boundaries (centered vertically, full width)
    const roadHeight = canvas.height * 0.75; // Road takes 80% of canvas height 
    ROAD_TOP = (canvas.height - roadHeight) / 2;
    ROAD_BOTTOM = ROAD_TOP + roadHeight;
    ROAD_HEIGHT = roadHeight;

    // Initialize car at left side, centered on road
    const carSize = 80;
    state.carInitialX = 150;
    state.carInitialY = canvas.height / 2 - 120;

    state.car = {
        x: state.carInitialX,
        y: state.carInitialY,
        width: carSize,
        height: carSize,
        controlled: false,
        glowColor: null,
    };

    state.carOutsideRoad = false;
    state.reachedEnd = false;
    state.showGoodText = false;
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
            numHands: 1,
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
        if (backgroundCoverImg.complete) {
            ctx.drawImage(backgroundCoverImg, 0, 0, canvas.width, canvas.height);
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
            try { countdownSound.currentTime = 6; countdownSound.play(); } catch (e) { }
        }

        state.countdown--;
    }, 1000);
}

/* =========================
    ====== MASK DETECTION ===
    ========================= */

function getPixelColor(x, y) {
    if (!roadMaskImg.complete) return null;
    
    // Create hidden canvas for mask
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = canvas.width;
    tempCanvas.height = canvas.height;
    const tempCtx = tempCanvas.getContext('2d');
    
    // Calculate road dimensions maintaining aspect ratio (increased by 40%)
    const roadAspectRatio = roadMaskImg.width / roadMaskImg.height;
    const roadWidth = ROAD_HEIGHT * roadAspectRatio * 1.4; 
    const roadHeight = ROAD_HEIGHT * 1.3;
    const roadX = (canvas.width - roadWidth) / 2;
    const roadY = ROAD_TOP - (roadHeight - ROAD_HEIGHT) / 2;
    
    // Draw mask image at same position and size as road
    tempCtx.drawImage(roadMaskImg, roadX, roadY, roadWidth, roadHeight);
    
    // Get pixel data
    const pixel = tempCtx.getImageData(x, y, 1, 1).data;
    
    return {
        r: pixel[0],
        g: pixel[1],
        b: pixel[2]
    };
}

function checkCarPosition() {
    if (!state.car || !roadMaskImg.complete) return;
    
    const carCenterX = Math.floor(state.car.x);
    const carCenterY = Math.floor(state.car.y);
    
    const pixelColor = getPixelColor(carCenterX, carCenterY);
    if (!pixelColor) return;
    
    // Check if pixel is black (outside road - boundary)
    if (pixelColor.r < 30 && pixelColor.g < 30 && pixelColor.b < 50) {
        if (!state.carOutsideRoad) {
            state.carOutsideRoad = true;
            state.boundryHits++;
            console.log(`Boundary hit! Total: ${state.boundryHits}`);
            
            try {
                boundarySound.currentTime = 0;
                boundarySound.play();
            } catch (e) {
                console.warn("Could not play boundary sound:", e);
            }
            
            // Reset to initial position
            setTimeout(() => {
                resetCarToStart();
            }, 300);
        }
        state.car.glowColor = "rgba(255, 0, 0, 0.8)"; // Red flash
    }
    // Check if pixel is red (finish line)
    else if (pixelColor.r > 200 && pixelColor.g < 50 && pixelColor.b < 50 && !state.reachedEnd) {
        state.reachedEnd = true;
        state.showGoodText = true;
        state.goodTextTime = Date.now();
        state.runsCompleted++;
        state.score++;
        updateScore();

        state.successfulPinches++;
        console.log(`Success! Total successful pinches: ${state.successfulPinches}`);

        try { dingSound.currentTime = 0; dingSound.play(); } catch (e) { }

        // Reset car after delay
        setTimeout(() => {
            resetCarToStart();
            state.reachedEnd = false;
            checkWinCondition();
        }, 1000);
    }
    // Check if pixel is white (on road - safe)
    else if (pixelColor.r > 200 && pixelColor.g > 200 && pixelColor.b > 200) {
        state.carOutsideRoad = false;
        
        // Calculate distance from road edges for glow effect
        const distFromTop = carCenterY - ROAD_TOP;
        const distFromBottom = ROAD_BOTTOM - carCenterY;
        const minDist = Math.min(distFromTop, distFromBottom);
        const edgeThreshold = ROAD_HEIGHT * 0.15; // 15% from edge = yellow
        
        if (minDist < edgeThreshold) {
            state.car.glowColor = "rgba(255, 255, 0, 0.4)"; // Yellow
        } else {
            state.car.glowColor = "rgba(0, 255, 0, 0.4)"; // Green
        }
    }
}

/* =========================
    ====== CAR LOGIC ========
    ========================= */

function updateCar() {
    if (!state.car) return;
    
    // Check car position against mask
    checkCarPosition();
}

function resetCarToStart() {
    if (state.car) {
        state.car.x = state.carInitialX;
        state.car.y = state.carInitialY;
        state.car.controlled = false;
        state.carOutsideRoad = false;
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
        if (results.landmarks && results.landmarks.length > 0) {
            const hand = results.landmarks[0];
            
            const wrist = hand[0];
            const handCenter = { x: wrist.x, y: wrist.y };

            // Smooth hand position
            if (state.lastHandPos) {
                handCenter.x = (handCenter.x * 0.7) + (state.lastHandPos.x * 0.3);
                handCenter.y = (handCenter.y * 0.7) + (state.lastHandPos.y * 0.3);
            }
            state.lastHandPos = handCenter;

            const canvasX = (1 - handCenter.x) * canvas.width;
            const canvasY = handCenter.y * canvas.height;
            state.handPointer = { x: canvasX, y: canvasY };

            // Pinch detection (thumb tip to index tip)
            const thumbTip = hand[4];
            const indexTip = hand[8];
            const pinchDist = Math.hypot(thumbTip.x - indexTip.x, thumbTip.y - indexTip.y);

            const wasPinching = state.isPinching;
            state.isPinching = pinchDist < PINCH_THRESHOLD;

            // Pinch started
            if (state.isPinching && !wasPinching) {
                handlePinchStart(canvasX, canvasY);
            }

            // Pinch released
            if (!state.isPinching && wasPinching) {
                handlePinchRelease();
            }

            // Update car position while pinching
            if (state.isPinching && state.car && state.car.controlled) {
                const newX = canvasX;
                const newY = canvasY;

                // Track distance
                if (state.lastCarPos) {
                    const dx = newX - state.lastCarPos.x;
                    const dy = newY - state.lastCarPos.y;
                    const distance = Math.sqrt(dx * dx + dy * dy);
                    state.totalDistance += distance;
                }

                state.car.x = newX;
                state.car.y = newY;
                state.lastCarPos = { x: newX, y: newY };
            }
        } else {
            // Lost hand tracking
            state.handPointer = null;
            state.isPinching = false;
            if (state.car && state.car.controlled) {
                handlePinchRelease();
            }
        }
    } catch (err) {
        console.warn("Hand detection failed:", err);
    }
}

function handlePinchStart(x, y) {
    if (!state.car || state.reachedEnd) return;

    // Check if pinch is near car
    const dx = x - state.car.x;
    const dy = y - state.car.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < 60) { // Within 60px of car
        state.car.controlled = true;
        state.lastCarPos = { x: state.car.x, y: state.car.y };
        
        state.attempts++;
        console.log(`Car pinched! Total attempts: ${state.attempts}`);
    }
}

function handlePinchRelease() {
    if (state.car) {
        state.car.controlled = false;
        state.lastCarPos = null;
        
        // Car stays at current position - no reset
    }
}

/* =========================
    ======= RENDERING =======
    ========================= */

function drawScene() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (!state.gameStarted || state.showWinOverlay) return;

    // Background
    const bgImg = state.useGameBackground ? backgroundGameImg : backgroundCoverImg;
    if (bgImg.complete) {
        ctx.drawImage(bgImg, 0, 0, canvas.width, canvas.height);
    }

    // Draw road (centered, maintain aspect ratio)
    if (roadImg.complete) {
        const roadAspectRatio = roadImg.width / roadImg.height;
        const roadWidth = ROAD_HEIGHT * roadAspectRatio * 1.4; // Increased by 40%
        const roadHeight = ROAD_HEIGHT * 1.3; // Increased by 30%
        const roadX = (canvas.width - roadWidth) / 2;
        const roadY = ROAD_TOP - (roadHeight - ROAD_HEIGHT) / 2; // Center vertically
        ctx.drawImage(roadImg, roadX, roadY, roadWidth, roadHeight);
    }


    // Draw road cone at center
    if (roadConeImg.complete) {
        const coneSize = 80;
        const coneX = canvas.width / 2 - coneSize / 2;
        const coneY = canvas.height / 2 - coneSize / 2;
        ctx.drawImage(roadConeImg, 20, coneY + 120, coneSize, coneSize);
    }

    // Draw icons
    const iconSize = 80;
    
    // Left side: Police + Go arrow
    if (policeImg.complete) {
        ctx.drawImage(policeImg, 20, canvas.height / 2 - 200, iconSize, iconSize);
    }
    
    // Left side: arrow (reduced by 20%)
    const go_arrowSize = iconSize * 0.8;
    if (goArrowImg.complete) {
        ctx.drawImage(goArrowImg, 30, canvas.height / 2 - 115, go_arrowSize, go_arrowSize);
    }

    // Right side: Stop (reduced by 20%)
    const stopSize = iconSize * 0.8;
    if (stopImg.complete) {
        ctx.drawImage(stopImg, 190, canvas.height / 2, stopSize, stopSize);
    }

    // Draw car with glow
    if (state.car && carImg.complete) {
        // Draw glow
        if (state.car.glowColor && state.car.controlled) {
            ctx.shadowBlur = 30;
            ctx.shadowColor = state.car.glowColor;
        } else if (!state.car.controlled && !state.reachedEnd) {
            // Pulse animation when not controlled
            const pulseAlpha = (Math.sin(Date.now() / 300) + 1) / 2 * 0.5 + 0.5;
            ctx.shadowBlur = 40;
            ctx.shadowColor = `rgba(255, 255, 255, ${pulseAlpha})`;
        }

        ctx.drawImage(carImg, 
            state.car.x - state.car.width / 2, 
            state.car.y - state.car.height / 2, 
            state.car.width, 
            state.car.height);
        
        ctx.shadowBlur = 0;
    }

    // Draw "+1" text
    if (state.showGoodText) {
        const elapsed = Date.now() - state.goodTextTime;
        if (elapsed < 1500) {
            const alpha = 1 - (elapsed / 1500);
            
            // Draw white outline
            ctx.strokeStyle = `rgba(255, 255, 255, ${alpha})`;
            ctx.lineWidth = 5;
            ctx.font = "bold 120px Poppins, sans-serif";
            ctx.textAlign = "center";
            ctx.strokeText("+1", canvas.width / 2, canvas.height / 2 - 50);
            
            // Draw filled text
            ctx.fillStyle = `rgba(255, 215, 0, ${alpha})`;
            ctx.fillText("+1", canvas.width / 2, canvas.height / 2 - 50);
        } else {
            state.showGoodText = false;
        }
    }

    // Draw hand pointer
    if (state.handPointer) {
        const handSize = 90;
        const pinchSize = handSize * 0.8; // Reduce pinch image by 20%
        const imgToUse = state.isPinching ? pinchImg : handImg;
        const currentSize = state.isPinching ? pinchSize : handSize;
        
        if (imgToUse.complete) {
            ctx.drawImage(imgToUse, 
                state.handPointer.x - currentSize / 2, 
                state.handPointer.y - currentSize / 2, 
                currentSize, 
                currentSize);
        }
    }
}

/* =========================
    ====== GAME LOOP ========
    ========================= */

async function gameLoop(currentTime = 0) {
    if (!state.gameStarted) return;

    // Calculate delta time
    if (state.lastFrameTime === 0) {
        state.lastFrameTime = currentTime;
    }
    state.deltaTime = (currentTime - state.lastFrameTime) / 1000;
    state.lastFrameTime = currentTime;

    if (state.deltaTime > 0.1) {
        state.deltaTime = 0.1;
    }

    updateCar();
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
    saveGameResult();
}

function updateScore() {
    scoreDisplay.textContent = `Score: ${state.score}`;
}

function checkWinCondition() {
    if (state.score >= TARGET_SCORE) {
        if (state.rafId) cancelAnimationFrame(state.rafId);

        setTimeout(() => {
            stopGameCleanup();
            fadeInWinOverlay();
            state.showWinOverlay = true;
        }, 500);
    }
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
        
        if (backgroundCoverImg.complete) {
            ctx.drawImage(backgroundCoverImg, 0, 0, canvas.width, canvas.height);
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
        accentGradient.addColorStop(0, "#9333EA");
        accentGradient.addColorStop(0.5, "#C084FC");
        accentGradient.addColorStop(1, "#9333EA");
        ctx.fillStyle = accentGradient;
        ctx.fillRect(cardX, cardY, cardWidth, 6);

        if (medalImg && medalImg.complete) {
            const medalSize = 130;
            ctx.shadowColor = "#FCD34D";
            ctx.shadowBlur = 30;
            ctx.drawImage(medalImg, canvas.width / 2 - medalSize / 2, cardY + 50, medalSize, medalSize);
            ctx.shadowBlur = 0;
        }

        ctx.shadowColor = "rgba(0, 0, 0, 0.5)";
        ctx.shadowBlur = 10;
        ctx.fillStyle = "#FCD34D";
        ctx.font = "bold 40px Poppins, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("Congrats!", canvas.width / 2, cardY + 210);
        ctx.shadowBlur = 0;

        ctx.fillStyle = "#94A3B8";
        ctx.font = "22px Poppins, sans-serif";
        ctx.fillText("You did a great job in the practice", canvas.width / 2, cardY + 250);

        const statsY = cardY + 280;
        const statsWidth = cardWidth - 80;
        const statsX = cardX + 40;
        
        ctx.fillStyle = "rgba(145, 58, 58, 0.05)";
        roundedRect(ctx, statsX, statsY, statsWidth, 70, 16);
        ctx.fill();
        
        ctx.strokeStyle = "rgba(252, 211, 77, 0.4)";
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
            .from("roadtracer_results")
            .select("time_taken")
            .eq("player_email", userEmail)
            .eq("level", "INTERMEDIATE")
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
    === NEW CALCULATIONS ====
    ========================= */

function calculatePinchAccuracy() {
    // pinch accuracy (%) = (Success pinch until finish line / (total pinch attempts - number hit boundary)) * 100
    const validAttempts = state.attempts - state.boundryHits;
    if (validAttempts === 0) return 0;
    const accuracy = (state.successfulPinches / validAttempts) * 100;
    return Math.round(accuracy * 100) / 100; // Round to 2 decimal places
}

function calculateTraceStability() {
    // trace stability (%) = (1 – normalized(boundryhitrate)) * 100
    // boundryhitrate = the number car hit boundary / total time taken
    const finalTime = state.finalElapsed ?? 1; // Avoid division by zero
    const boundaryHitRate = state.boundryHits / finalTime;
    
    // Normalize: assume 1 hit per second as maximum (normalized = 1)
    // Adjust this threshold based on your game's difficulty
    const maxExpectedRate = 1.0;
    const normalizedRate = Math.min(boundaryHitRate / maxExpectedRate, 1);
    
    const stability = (1 - normalizedRate) * 100;
    return Math.max(0, Math.round(stability * 100) / 100); // Ensure non-negative, round to 2 decimals
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
    const score = state.score ?? 0;
    const totalDistance = Math.round(state.totalDistance);
    const attempts = state.attempts;
    const boundryHits = state.boundryHits;

    const consistency = await calculateConsistency(user.email);
    const pinchAccuracy = calculatePinchAccuracy();
    const traceStability = calculateTraceStability();

    console.log("Calculated consistency:", consistency);
    console.log("Calculated pinch accuracy:", pinchAccuracy);
    console.log("Calculated trace stability:", traceStability);

    const { error: insertError } = await supabase
        .from("roadtracer_results")
        .insert([{
            player_email: user.email,
            score: score,
            level: "INTERMEDIATE",
            time_taken: finalTime,
            totaldistance: totalDistance,
            consistency: consistency,
            attempts: attempts,
            boundryhits: boundryHits,
            pinchaccuracy: pinchAccuracy,
            tracestability: traceStability
        }])
        .select();

    if (insertError) {
        console.error("Insert error:", insertError);
    } else {
        console.log("Result saved successfully!");
        console.log(`Total distance: ${totalDistance}px`);
        console.log(`Attempts: ${attempts}`);
        console.log(`Successful pinches: ${state.successfulPinches}`);
        console.log(`Boundary hits: ${boundryHits}`);
        console.log(`Consistency: ${consistency}`);
        console.log(`Pinch accuracy: ${pinchAccuracy}%`);
        console.log(`Trace stability: ${traceStability}%`);
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
    window.location.href = "/games/road-tracer/play";
});

nextBtn.addEventListener("click", () => {
    window.location.href = "/games/road-tracer/cover";
});

/* =========================
    ======= STARTUP =========
    ========================= */

if (backgroundCoverImg.complete) {
    drawCover();
} else {
    backgroundCoverImg.onload = () => drawCover();
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