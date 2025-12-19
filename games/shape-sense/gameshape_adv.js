/* =========================
    ========== CONSTS =======
    ========================= */
const CANVAS_ID = "output_canvas";
const TIMER_ID = "timer";

const COUNTDOWN_START = 3;
const DETECTION_INTERVAL_MS = 100; // 10 FPS equivalent
const PINCH_THRESHOLD = 0.07; // hand pinch sensitivity (normalized model coords)
const PLACEMENT_DISTANCE = 30; // px

/* =========================
    ========== STATE ========
    ========================= */
const state = {
    gameStarted: false,
    countdown: COUNTDOWN_START,
    countdownRunning: false,

    shapes: [],
    targets: [],
    draggingShape: null,
    dragOffset: { x: 0, y: 0 },
    score: 0,
    attempts: 0,
    
    // Distance tracking
    totalDistance: 0,
    shapeDistances: {}, // tracks distance per shape
    currentShapeStartPos: null,
    lastDragPos: null,

    // Precision tracking
    successfulPinches: 0, // pinch & place without dropping
    currentPinchSuccess: true, // tracks if current pinch is successful

    // timer
    startTime: null,
    timerIntervalId: null,

    // hand tracking
    videoElement: null,
    handDetector: null,
    lastHandPos: null,
    isPinching: false,
    handPointer: null,
    lastDetectionTime: 0,
    detectionInterval: DETECTION_INTERVAL_MS,

    // loop
    rafId: null,
};


let isMuted = false;
let finalTime = 0;

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
// shape names & image paths - NOW 8 SHAPES
const SHAPE_NAMES = ["circle", "square", "star", "triangle", "love", "moon", "semicircle", "octagon"];
const SHAPE_IMAGE_PATHS = SHAPE_NAMES.map(n => `/assets/images/shape_${n}.png`);

// board images - UPDATED LAYOUT
const leftBoardImg = new Image();
leftBoardImg.src = "/assets/images/board150x300.png";
const centerBoardImg = new Image();
centerBoardImg.src = "/assets/images/board300x300.png";
const rightBoardImg = new Image();
rightBoardImg.src = "/assets/images/board150x300.png";
const topBoardImg = new Image();
topBoardImg.src = "/assets/images/board150x300horizontal.png";
const bottomBoardImg = new Image();
bottomBoardImg.src = "/assets/images/board150x300horizontal.png";
const coverImg = new Image();
coverImg.src = "/assets/images/shape_back1.jpg";

// hand images
const handImg = new Image();
handImg.src = "/assets/images/rhand_shape.png";
const pinchImg = new Image();
pinchImg.src = "/assets/images/rpinch_shape.png";

const medalImg = new Image();
medalImg.src = "/assets/images/medal.png";

// sound assets
const dingSound = new Audio("/assets/sounds/dingeffect.wav");
const countdownSound = new Audio("/assets/sounds/countdown.wav");
const endApplause = new Audio("/assets/sounds/endapplause.wav");
endApplause.volume = 0.7;

const bgMusic = new Audio("/assets/sounds/02Backmusic20s.mp3");
bgMusic.loop = true;
bgMusic.volume = 0.6;

// container for loaded shape Image objects
const shapeImages = {};

/* =========================
    ======= Layout Boxes ====
    ========================= */
// UPDATED LAYOUT: CENTER (300x300), LEFT/RIGHT (150x300 vertical), TOP/BOTTOM (300x150 horizontal)
const centerBox = { x: 230, y: 150, width: 500, height: 250 };
const leftBox = { x: 30, y: 150, width: 150, height: 250 };
const rightBox = { x: 780, y: 150, width: 150, height: 250 };
const topBox = { x: 280, y: 20, width: 400, height: 120 };
const bottomBox = { x: 280, y: 410, width: 400, height: 120 };

/* =========================
    ======= Initialization ==
    ========================= */

// Preload all images and return a Promise
function preloadAssets() {
    const promises = [];

    // shapes
    SHAPE_IMAGE_PATHS.forEach((path, i) => {
     promises.push(new Promise((resolve) => {
        const img = new Image();
        img.src = path;
        img.onload = () => {
            shapeImages[SHAPE_NAMES[i]] = img;
            resolve();
        };
        img.onerror = () => {
            console.warn("Failed loading", path);
            resolve(); // still resolve so game can continue (show missing)
        };
     }));
    });

    // boards & hands & cover: resolve when loaded (or fail)
    [leftBoardImg, centerBoardImg, rightBoardImg, topBoardImg, bottomBoardImg, coverImg, handImg, pinchImg].forEach(img => {
     promises.push(new Promise((resolve) => {
        if (img.complete) return resolve();
        img.onload = () => resolve();
        img.onerror = () => resolve();
     }));
    });

    return Promise.all(promises);
}

// Draw initial cover once assets loaded
function drawCover() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // overlay to darken
    ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
}

/* =========================
    ==== GRID & CREATION ====
    ========================= */

function generateGridPositions(box, itemSize, count, layout) {
    const gap = 20;
    const positions = [];
    
    if (layout === "center") {
        // CENTER: 2 rows x 4 columns
        const cols = 4;
        const rows = 2;
        const totalWidth = cols * itemSize + (cols - 1) * gap;
        const totalHeight = rows * itemSize + (rows - 1) * gap;
        const startX = box.x + (box.width - totalWidth) / 2 + itemSize / 2;
        const startY = box.y + (box.height - totalHeight) / 2 + itemSize / 2;

        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                positions.push({ 
                    x: startX + c * (itemSize + gap), 
                    y: startY + r * (itemSize + gap) 
                });
            }
        }
    } 
    else if (layout === "vertical") {
        // LEFT/RIGHT: 2 rows x 1 column (vertical)
        const totalHeight = count * itemSize + (count - 1) * gap;
        const startX = box.x + box.width / 2;
        const startY = box.y + (box.height - totalHeight) / 2 + itemSize / 2;
        
        for (let i = 0; i < count; i++) {
            positions.push({ 
                x: startX, 
                y: startY + i * (itemSize + gap) 
            });
        }
    }
    else if (layout === "horizontal") {
        // TOP/BOTTOM: 1 row x 2 columns (horizontal)
        const totalWidth = count * itemSize + (count - 1) * gap;
        const startX = box.x + (box.width - totalWidth) / 2 + itemSize / 2;
        const startY = box.y + box.height / 2;
        
        for (let i = 0; i < count; i++) {
            positions.push({ 
                x: startX + i * (itemSize + gap), 
                y: startY 
            });
        }
    }

    // shuffle positions
    for (let i = positions.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [positions[i], positions[j]] = [positions[j], positions[i]];
    }
    
    return positions;
}

function createShapesAndTargets() {
    const size = 90; // Reduced from 100 to 90
    
    // Shuffle all 8 shape names
    const shuffledNames = [...SHAPE_NAMES].sort(() => Math.random() - 0.5);
    
    // Distribute shapes: 2 left, 2 right, 2 top, 2 bottom
    const leftShapeNames = shuffledNames.slice(0, 2);
    const rightShapeNames = shuffledNames.slice(2, 4);
    const topShapeNames = shuffledNames.slice(4, 6);
    const bottomShapeNames = shuffledNames.slice(6, 8);
    
    // Generate positions for each board
    const leftPositions = generateGridPositions(leftBox, size, 2, "vertical");
    const rightPositions = generateGridPositions(rightBox, size, 2, "vertical");
    const topPositions = generateGridPositions(topBox, size, 2, "horizontal");
    const bottomPositions = generateGridPositions(bottomBox, size, 2, "horizontal");
    
    // Create targets on side/top/bottom boards
    state.targets = [
        ...leftPositions.map((pos, i) => ({
            name: leftShapeNames[i],
            x: pos.x,
            y: pos.y,
            size,
        })),
        ...rightPositions.map((pos, i) => ({
            name: rightShapeNames[i],
            x: pos.x,
            y: pos.y,
            size,
        })),
        ...topPositions.map((pos, i) => ({
            name: topShapeNames[i],
            x: pos.x,
            y: pos.y,
            size,
        })),
        ...bottomPositions.map((pos, i) => ({
            name: bottomShapeNames[i],
            x: pos.x,
            y: pos.y,
            size,
        }))
    ];

    // All 8 shapes start in CENTER board (2x4 grid)
    const centerPositions = generateGridPositions(centerBox, size, 8, "center");
    state.shapes = centerPositions.map((pos, i) => ({
        name: SHAPE_NAMES[i],
        x: pos.x,
        y: pos.y,
        originalX: pos.x,
        originalY: pos.y,
        size,
        img: shapeImages[SHAPE_NAMES[i]],
        placed: false,
        glowTime: 0,
        baseY: pos.y,
        offset: Math.random() * 100,
        floatSpeed: 0.002 + Math.random() * 0.0015,
        floatRange: 5 + Math.random() * 5,
    }));
}


/* =========================
    ====== CAMERA & MODEL ===
    ========================= */

async function setupCameraAndModel() {
    try {
     if (!loadingOverlay) console.warn("No #loadingOverlay element found.");
     loadingOverlay.style.display = "flex";

     // create or reuse video element
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
        // fallback: if metadata is available immediately
        if (state.videoElement.readyState >= 2) resolve();
     });

     // load Mediapipe FilesetResolver & HandLandmarker
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
     // gradient background for countdown
     const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
     gradient.addColorStop(0, "#FFD580");
     gradient.addColorStop(0.5, "#FFB347");
     gradient.addColorStop(1, "#FFCC33");
     ctx.fillStyle = gradient;
     ctx.fillRect(0, 0, canvas.width, canvas.height);

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
            } catch (e) { /* autoplay restrictions may block play */ }

            state.gameStarted = true;
            startTimer();
            initGame();
            gameLoop(); // start loop
        }, 1000);
     } else {
        // optionally play tick sound
        try { countdownSound.currentTime = 2; countdownSound.play(); } catch (e) {}
     }

     state.countdown--;
    }, 1000);
}

/* =========================
    ====== GAME CONTROLLER ===
    ========================= */

function initGame() {
    
    state.score = 0;
    updateScore();

    state.attempts = 0;
    
    // Reset distance tracking
    state.totalDistance = 0;
    state.shapeDistances = {};
    state.currentShapeStartPos = null;
    state.lastDragPos = null;
    
    // Reset precision tracking
    state.successfulPinches = 0;
    state.currentPinchSuccess = true;
    
    state.shapes = [];
    state.targets = [];
    createShapesAndTargets();
    
    // Initialize distance tracking for each shape
    SHAPE_NAMES.forEach(name => {
     state.shapeDistances[name] = 0;
    });
}

function stopGameCleanup() {
    state.gameStarted = false;
    stopTimer();
    stopCamera();

    try {
     bgMusic.pause();
     bgMusic.currentTime = 0;
    } catch (e) {}

    try {
     endApplause.currentTime = 0;
     endApplause.play();
    } catch (e) {}
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
        const thumb = hand[4], index = hand[8];

        // use midpoint of thumb/index as pointer
        let handCenter = { x: (index.x + thumb.x) / 2, y: (index.y + thumb.y) / 2 };

        // smoothing
        if (state.lastHandPos) {
            handCenter.x = (handCenter.x + state.lastHandPos.x) / 2;
            handCenter.y = (handCenter.y + state.lastHandPos.y) / 2;
        }
        state.lastHandPos = handCenter;

        // map to canvas coordinates (model x is L->R; we flip horizontally here)
        const canvasX = (1 - handCenter.x) * canvas.width;
        const canvasY = handCenter.y * canvas.height;
        state.handPointer = { x: canvasX, y: canvasY };

        // pinch detection (distance between thumb & index)
        const pinchDist = Math.hypot(thumb.x - index.x, thumb.y - index.y);

        if (pinchDist < PINCH_THRESHOLD && !state.isPinching) {
            state.isPinching = true;
            state.currentPinchSuccess = true; // Start tracking new pinch as successful
            handlePinchStart(canvasX, canvasY);
        } else if (state.isPinching && pinchDist >= PINCH_THRESHOLD) {
            // pinch released
            state.isPinching = false;
            if (state.draggingShape) {
             checkPlacement(state.draggingShape);
             state.draggingShape = null;
             state.lastDragPos = null;
            }
        }

        // dragging update with distance tracking
        if (state.isPinching && state.draggingShape) {
            const newX = canvasX - state.dragOffset.x;
            const newY = canvasY - state.dragOffset.y;
            
            // Calculate distance moved
            if (state.lastDragPos) {
             const dx = newX - state.lastDragPos.x;
             const dy = newY - state.lastDragPos.y;
             const distance = Math.sqrt(dx * dx + dy * dy);
             
             // Add to total distance
             state.totalDistance += distance;
             
             // Add to this shape's distance
             if (state.draggingShape.name) {
                state.shapeDistances[state.draggingShape.name] = 
                    (state.shapeDistances[state.draggingShape.name] || 0) + distance;
             }
            }
            
            state.draggingShape.x = newX;
            state.draggingShape.y = newY;
            state.lastDragPos = { x: newX, y: newY };
        }
     } else {
        // no hand detected - if we were dragging, mark as lost grip
        if (state.isPinching && state.draggingShape) {
            state.currentPinchSuccess = false; // Lost grip
        }
        state.handPointer = null;
        state.isPinching = false;
     }
    } catch (err) {
     // model errors shouldn't kill the loop
     console.warn("Hand detection failed:", err);
    }
}

/* ================
    = Pinch helpers =
    ================ */

function handlePinchStart(x, y) {
    state.draggingShape = null;

    // check from topmost shape to bottom
    for (let i = state.shapes.length - 1; i >= 0; i--) {
     const s = state.shapes[i];
     if (!s.placed && isPointInShape(x, y, s)) {
        state.draggingShape = s;
        state.dragOffset.x = x - s.x;
        state.dragOffset.y = y - s.y;
        
        // Initialize distance tracking for this drag
        state.lastDragPos = { x: s.x, y: s.y };

        // bring dragged shape to top of rendering order
        state.shapes.splice(i, 1);
        state.shapes.push(s);
        break;
     }
    }
}

function updateScore() {
    scoreDisplay.textContent = `Score: ${state.score}`;
}


/* =========================
    ======= PLACEMENT =======
    ========================= */

function checkPlacement(shape) {
    if (!shape || shape.placed) return;
    
    state.attempts++;
     
    const target = state.targets.find(t => t.name === shape.name);
    if (!target) return;

    const dx = target.x - shape.x;
    const dy = target.y - shape.y;
    if (Math.hypot(dx, dy) < PLACEMENT_DISTANCE) {
     shape.x = target.x;
     shape.y = target.y;
     shape.placed = true;
     shape.glowTime = Date.now();

     state.score += 1;
     updateScore();

     // Count as successful pinch if we didn't lose grip
     if (state.currentPinchSuccess) {
        state.successfulPinches++;
     }

     try { dingSound.currentTime = 0; dingSound.play(); } catch (e) {}
    } else {
     // revert - this counts as failed attempt (already incremented attempts)
     shape.x = shape.originalX;
     shape.y = shape.originalY;
     // Don't count as successful pinch
    }
    checkWinCondition();
}

/* =========================
    ======= PRECISION =======
    ========================= */

function calculatePrecision() {
    if (state.attempts === 0) return 0;
    
    const precision = (state.successfulPinches / state.attempts) * 100;
    return Math.round(precision * 100) / 100; // Round to 2 decimal places
}

function checkWinCondition() {
    if (state.shapes.length > 0 && state.shapes.every(s => s.placed)) {

     if (state.rafId) cancelAnimationFrame(state.rafId); // freeze frame

     // ⬅️ WAIT WHILE THE FINAL GAME STATE IS STILL VISIBLE
     setTimeout(() => {

        stopGameCleanup();        
        fadeInWinOverlay();       

        state.showWinOverlay = true;
        drawScene();              
     }, 1000); 
    }
}


/* =========================
    ======= RENDERING =======
    ========================= */

function drawScene() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (!state.gameStarted || state.showWinOverlay) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // background gradient
    const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
    gradient.addColorStop(0, "#FFD580");
    gradient.addColorStop(0.5, "#FFB347");
    gradient.addColorStop(1, "#FFCC33");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // boards - UPDATED LAYOUT (TOP, LEFT, CENTER, RIGHT, BOTTOM)
    if (topBoardImg.complete) ctx.drawImage(topBoardImg, topBox.x, topBox.y, topBox.width, topBox.height);
    if (bottomBoardImg.complete) ctx.drawImage(bottomBoardImg, bottomBox.x, bottomBox.y, bottomBox.width, bottomBox.height);
    if (leftBoardImg.complete) ctx.drawImage(leftBoardImg, leftBox.x, leftBox.y, leftBox.width, leftBox.height);
    if (centerBoardImg.complete) ctx.drawImage(centerBoardImg, centerBox.x, centerBox.y, centerBox.width, centerBox.height);
    if (rightBoardImg.complete) ctx.drawImage(rightBoardImg, rightBox.x, rightBox.y, rightBox.width, rightBox.height);

    // targets
    state.targets.forEach(t => {
     ctx.strokeStyle = "#fff";
     ctx.lineWidth = 2;
     ctx.strokeRect(t.x - t.size / 2, t.y - t.size / 2, t.size, t.size);

     ctx.globalAlpha = 0.2;
     if (shapeImages[t.name]) {
        ctx.drawImage(shapeImages[t.name], t.x - t.size / 2, t.y - t.size / 2, t.size, t.size);
     }
     ctx.globalAlpha = 1;
    });

    // shapes (floating)
    state.shapes.forEach(s => {
     if (!s.placed && s !== state.draggingShape) {
        s.y = s.baseY + Math.sin(Date.now() * s.floatSpeed + s.offset) * s.floatRange;
        s.x = s.originalX + Math.cos(Date.now() * s.floatSpeed + s.offset) * 3;
     }

     // glow effect when placed and recently placed
     if (s.placed && s.glowTime) {
        const elapsed = Date.now() - s.glowTime;
        if (elapsed < 700) {
            const glowAlpha = 1 - elapsed / 700;
            const glowRadius = s.size * 0.7 + 10 * Math.sin(elapsed / 100);
            const g = ctx.createRadialGradient(s.x, s.y, s.size * 0.3, s.x, s.y, glowRadius);
            g.addColorStop(0, `rgba(255,255,0,${0.6 * glowAlpha})`);
            g.addColorStop(1, "rgba(255,255,0,0)");
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.arc(s.x, s.y, glowRadius, 0, Math.PI * 2);
            ctx.fill();
        }
     }

     if (s.img) {
        ctx.drawImage(s.img, s.x - s.size / 2, s.y - s.size / 2, s.size, s.size);
     } else {
        // fallback (simple colored rect)
        ctx.fillStyle = "#888";
        ctx.fillRect(s.x - s.size / 2, s.y - s.size / 2, s.size, s.size);
     }
    });

    // draw hand pointer at the end (so it's on top)
    if (state.handPointer && handImg.complete) {
     const handSize = Math.min(canvas.width, canvas.height) * 0.15;
     const imgToUse = state.isPinching ? pinchImg : handImg;
     ctx.drawImage(imgToUse, state.handPointer.x - handSize / 2, state.handPointer.y - handSize / 2, handSize, handSize);
    }
}

/* =========================
    ====== GAME LOOP ========
    ========================= */

async function gameLoop() {
    if (!state.gameStarted) return;

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
    // store final elapsed time (in seconds)
    state.finalElapsed = Math.floor((Date.now() - state.startTime) / 1000);
    saveGameResult();

}

/* =========================
    ======= CLEANUP =========
    ========================= */

function stopCamera() {
    try {
     if (state.videoElement && state.videoElement.srcObject) {
        const tracks = state.videoElement.srcObject.getTracks();
        tracks.forEach(track => track.stop());
        state.videoElement.srcObject = null;
     }
     // remove video element if created by us
     if (state.videoElement) {
        state.videoElement.remove();
        state.videoElement = null;
     }
    } catch (e) {
     console.warn("Error stopping camera:", e);
    }
}

/* =========================
    ======= UTILITIES =======
    ========================= */

function isPointInShape(mx, my, s) {
    return mx > s.x - s.size / 2 && mx < s.x + s.size / 2 && my > s.y - s.size / 2 && my < s.y + s.size / 2;
}

function fadeInWinOverlay() {
    let opacity = 0;
    const fadeDuration = 3000;
    const startTime = performance.now();

    // format time
    const finalTime = state.finalElapsed ?? 0;  // seconds only
    const precision = calculatePrecision();

    function drawOverlay(now) {
     const elapsed = now - startTime;
     opacity = Math.min(elapsed / fadeDuration, 1);

     ctx.clearRect(0, 0, canvas.width, canvas.height);
     
    // Dark overlay with blur effect
    ctx.fillStyle = "rgba(0, 0, 0, 0.2)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Card dimensions
    const cardWidth = 520;
    const cardHeight = 450;
    const cardX = (canvas.width - cardWidth) / 2;
    const cardY = (canvas.height - cardHeight) / 2;
    const cornerRadius = 24;
    
    // Card shadow (multiple layers for depth)
    ctx.fillStyle = "rgba(0, 0, 0, 0.4)";
    roundedRect(ctx, cardX + 8, cardY + 8, cardWidth, cardHeight, cornerRadius);
    ctx.fill();
    
    // Card background with gradient
    const gradient = ctx.createLinearGradient(cardX, cardY, cardX + cardWidth, cardY + cardHeight);
    gradient.addColorStop(0, "#1E293B");
    gradient.addColorStop(1, "#0F172A");
    ctx.fillStyle = gradient;
    roundedRect(ctx, cardX, cardY, cardWidth, cardHeight, cornerRadius);
    ctx.fill();
    
    // Accent line at top
    const accentGradient = ctx.createLinearGradient(cardX, cardY, cardX + cardWidth, cardY);
    accentGradient.addColorStop(0, "#9333EA");
    accentGradient.addColorStop(0.5, "#C084FC");
    accentGradient.addColorStop(1, "#9333EA");
    ctx.fillStyle = accentGradient;
    ctx.fillRect(cardX, cardY, cardWidth, 6);

    // Medal icon with glow effect
    if (medalImg && medalImg.complete) {
      const medalSize = 130;
      ctx.shadowColor = "#FCD34D";
      ctx.shadowBlur = 30;
      ctx.drawImage(medalImg, canvas.width / 2 - medalSize / 2, cardY + 50, medalSize, medalSize);
      ctx.shadowBlur = 0;
    }

    // Title with shadow
    ctx.shadowColor = "rgba(0, 0, 0, 0.5)";
    ctx.shadowBlur = 10;
    ctx.fillStyle = "#FCD34D";
    ctx.font = "bold 40px Poppins, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Congrats!", canvas.width / 2, cardY + 210);
    ctx.shadowBlur = 0;

    // Subtitle
    ctx.fillStyle = "#94A3B8";
    ctx.font = "22px Poppins, sans-serif";
    ctx.fillText("You did a great job in the practice", canvas.width / 2, cardY + 250);

    // Stats container
    const statsY = cardY + 280;
    const statsWidth = cardWidth - 80;
    const statsX = cardX + 40;
    
    ctx.fillStyle = "rgba(145, 58, 58, 0.05)";
    roundedRect(ctx, statsX, statsY, statsWidth, 70, 16);
    ctx.fill();
    
    // Stats border
    ctx.strokeStyle = "rgba(252, 211, 77, 0.4)";
    ctx.lineWidth = 2;
    roundedRect(ctx, statsX, statsY, statsWidth, 70, 16);
    ctx.stroke();

    // Time stat (centered)
    ctx.textAlign = "center";
    ctx.fillStyle = "#94A3B8";
    ctx.font = "24px Poppins, sans-serif";
    ctx.fillText(`Your Time: ${finalTime}s`, canvas.width / 2, statsY + 40);

  // Helper function for rounded rectangles
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
     

     if (opacity < 1) {
        requestAnimationFrame(drawOverlay);
     } else {
        playAgainBtn.style.display = "block";
        nextBtn.style.display = "block";
     }
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
            .from("shapesense_results")
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
        
        // Coefficient of variation (lower is more consistent)
        const cv = mean > 0 ? (stdDev / mean) * 100 : 0;
        
        // Convert to consistency score (0-100, higher is better)
        const consistencyScore = Math.max(0, Math.min(100, 100 - cv));

        return Math.round(consistencyScore * 100) / 100;
    } catch (err) {
        console.error("Consistency calculation error:", err);
        return null;
    }
}

/* =========================
    ======= EVENTS ==========
    ========================= */

startBtn.addEventListener("click", async () => {
    // hide UI overlays
    startBtn.style.display = "none";
    titleEl.style.display = "none";
    playAgainBtn.style.display = "none";
    nextBtn.style.display = "none";

    // preload images then draw cover
    await preloadAssets();
    drawCover();

    // setup camera + model, then run countdown
    await setupCameraAndModel();
    runCountdownAndStart();
});

playAgainBtn.addEventListener("click", () => {
    window.location.href = "/games/shape-sense/gameshapeplay.html";
});
nextBtn.addEventListener("click", () => {
    window.location.href = "/games/shape-sense/gameshapecover.html";
});

/* =========================
    ======= STARTUP =========
    ========================= */

// draw initial cover (attempt — will wait for actual cover load if needed)
if (coverImg.complete) {
    drawCover();
} else {
    coverImg.onload = () => drawCover();
}

// =============================================
// Save Game Result to Supabase
// =============================================
async function saveGameResult() {
    console.log("Saving game result...");

    // Get logged-in user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
     console.error("No user logged in:", userError);
     return;
    }

    console.log("User found:", user.email);

    // Prepare game result
    const finalTime = state.finalElapsed ?? 0;
    const attempts = state.attempts ?? 0;
    const score = state.score ?? 0;
    const totalDistance = Math.round(state.totalDistance);
    
    // Calculate average distance per shape
    const shapeCount = Object.keys(state.shapeDistances).length;
    const averageDistance = shapeCount > 0 ? Math.round(totalDistance / shapeCount) : 0;

    // Calculate precision
    const precision = calculatePrecision();

    // Calculate consistency BEFORE inserting the current game
    const consistency = await calculateConsistency(user.email);
    console.log("Calculated consistency:", consistency);

    // Insert the new record with consistency and precision included
    const { data: insertData, error: insertError } = await supabase
     .from("shapesense_results")
     .insert([{
        player_email: user.email,
        time_taken: finalTime,
        attempts: attempts,
        score: score,
        level: "ADVANCED",
        totaldistance: totalDistance,
        av_distance: averageDistance,
        consistency: consistency,
        precision: precision
     }])
     .select();

    if (insertError) {
     console.error("Insert error:", insertError);
    } else {
     console.log("Result saved successfully!");
     console.log(`Total distance: ${totalDistance}px`);
     console.log(`Average distance per shape: ${averageDistance}px`);
     console.log(`Consistency: ${consistency}`);
     console.log(`Precision: ${precision}%`);
    }
}

// ========================
// HOW TO PLAY POPUP SYSTEM
// ========================

function showPopup() {
    guidePopup.style.display = "flex";
}

function hidePopup() {
    guidePopup.style.display = "none";
}

howToPlayBtn.addEventListener("click", showPopup);
closeGuideBtn.addEventListener("click", hidePopup);

// Auto open popup on page load
window.addEventListener("load", showPopup);