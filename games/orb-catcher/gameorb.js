/* =========================
    ========== CONSTS =======
    ========================= */
const CANVAS_ID = "output_canvas";
const TIMER_ID = "timer";

const COUNTDOWN_START = 3;
const DETECTION_INTERVAL_MS = 100; // 10 FPS equivalent
const GRASP_THRESHOLD = 0.2; // hand grasp sensitivity
const BASKET_SNAP_DISTANCE = 70; // px to snap to basket

const TARGET_SCORE = 10; // Win condition

// Delta time settings
const TARGET_FPS = 60;
const DELTA_TIME_SCALE = 0.6; // Scale factor to slow down movement (adjust 0.1-1.0)

/* =========================
    ========== STATE ========
    ========================= */
const state = {
    gameStarted: false,
    countdown: COUNTDOWN_START,
    countdownRunning: false,

    cloud: null,
    orbs: [],
    baskets: [],
    
    draggingOrb: null,
    dragOffset: { x: 0, y: 0 },
    
    score: 0,
    orbLose: 0,
    
    // Distance tracking
    totalDistance: 0,
    orbDistances: {},
    currentOrbStartPos: null,
    lastDragPos: null,

    // Grasp tracking
    successfulGrasps: 0,
    lostGrasps: 0,

    // timer
    startTime: null,
    timerIntervalId: null,

    // hand tracking
    videoElement: null,
    handDetector: null,
    lastHandPos: null,
    isGrasping: false,
    handPointer: null,
    lastDetectionTime: 0,
    detectionInterval: DETECTION_INTERVAL_MS,

    // loop
    rafId: null,
    showWinOverlay: false,
    
    // delta time
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
const backgroundImg = new Image();
backgroundImg.src = "/assets/images/orbback2.png";

const cloudImg = new Image();
cloudImg.src = "/assets/images/cloudsmile.png";

const orbGreenImg = new Image();
orbGreenImg.src = "/assets/images/orbgreen.png";

const orbPurpleImg = new Image();
orbPurpleImg.src = "/assets/images/orbpurple.png";

const basketGreenImg = new Image();
basketGreenImg.src = "/assets/images/basketgreen.png";

const basketPurpleImg = new Image();
basketPurpleImg.src = "/assets/images/basketpurple.png";

const handImg = new Image();
handImg.src = "/assets/images/rhand_shape.png";

const graspImg = new Image();
graspImg.src = "/assets/images/rgrab.png";

const medalImg = new Image();
medalImg.src = "/assets/images/medal.png";

// sound assets
const dingSound = new Audio("/assets/sounds/dingeffect.wav");
const countdownSound = new Audio("/assets/sounds/countdown2.wav");
const endApplause = new Audio("/assets/sounds/endapplause.wav");
endApplause.volume = 0.7;

const breakSound = new Audio("/assets/sounds/break.mp3");

const bgMusic = new Audio("/assets/sounds/03Backmusic30s.mp3");
bgMusic.loop = true;
bgMusic.volume = 0.9;

/* =========================
    ======= Initialization ==
    ========================= */

function preloadAssets() {
    const promises = [];
    const images = [
        backgroundImg, cloudImg, orbGreenImg, orbPurpleImg,
        basketGreenImg, basketPurpleImg, handImg, graspImg
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
    
    if (backgroundImg.complete) {
        ctx.drawImage(backgroundImg, 0, 0, canvas.width, canvas.height);
    }

    ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
}

/* =========================
    ==== GAME SETUP ====
    ========================= */

function initGame() {
    state.score = 0;
    state.orbLose = 0;
    state.successfulGrasps = 0;
    state.lostGrasps = 0;
    updateScore();

    state.totalDistance = 0;
    state.orbDistances = {};
    state.currentOrbStartPos = null;
    state.lastDragPos = null;

    state.orbs = [];
    state.lastFrameTime = 0;
    state.deltaTime = 0;

    // Initialize cloud
    state.cloud = {
        x: 100,
        y: 50,
        width: 180,
        height: 130,
        speed: 1.0,
        direction: 1, // 1 = right, -1 = left
        canRelease: true,
        releaseTimer: 0
    };

    // Initialize baskets at bottom
    state.baskets = [
        {
            type: "green",
            x: 260,
            y: canvas.height - 70,
            width: 120,
            height: 120,
            img: basketGreenImg
        },
        {
            type: "purple",
            x: canvas.width - 260,
            y: canvas.height - 70,
            width: 120,
            height: 120,
            img: basketPurpleImg
        }
    ];
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
            try { countdownSound.currentTime = 6; countdownSound.play(); } catch (e) { }
        }

        state.countdown--;
    }, 1000);
}

/* =========================
    ====== CLOUD & ORB LOGIC ===
    ========================= */

function updateCloud() {
    if (!state.cloud) return;

    // Move cloud with delta time
    state.cloud.x += state.cloud.speed * state.cloud.direction * state.deltaTime * TARGET_FPS * DELTA_TIME_SCALE;

    // Bounce at edges
    if (state.cloud.x > canvas.width - state.cloud.width / 2) {
        state.cloud.direction = -1;
    } else if (state.cloud.x < state.cloud.width / 2) {
        state.cloud.direction = 1;
    }

    // Release orb logic
    state.cloud.releaseTimer += state.deltaTime * TARGET_FPS;
    
    if (state.cloud.canRelease && state.cloud.releaseTimer > 180) { // ~3 seconds at 60fps
        releaseOrb();
        state.cloud.canRelease = false;
        state.cloud.releaseTimer = 0;
    }

    // Check if we can release again (after last orb is captured or lost)
    if (!state.cloud.canRelease && state.orbs.length === 0) {
        state.cloud.canRelease = true;
    }
}

function releaseOrb() {
    const colors = ["green", "purple"];
    const randomColor = colors[Math.floor(Math.random() * colors.length)];
    
    const orb = {
        id: Date.now(),
        type: randomColor,
        x: state.cloud.x,
        y: state.cloud.y + state.cloud.height / 2,
        width: 55,
        height: 55,
        speed: 0.5, // very slow fall
        img: randomColor === "green" ? orbGreenImg : orbPurpleImg,
        grabbed: false,
        broken: false
    };

    state.orbs.push(orb);
    state.orbDistances[orb.id] = 0;
}

function updateOrbs() {
    state.orbs.forEach((orb, index) => {
        if (orb.broken) return;
        
        // If not grabbed, fall slowly with delta time
        if (!orb.grabbed && orb !== state.draggingOrb) {
            orb.y += orb.speed * state.deltaTime * TARGET_FPS * DELTA_TIME_SCALE;

            // Check if hit bottom
            if (orb.y > canvas.height - 50) {
                orb.broken = true;
                state.orbLose++;
                state.lostGrasps++;
                state.score = Math.max(0, state.score - 1); // Deduct 1 point, minimum 0
                updateScore();


                // Play break sound
                try {
                    breakSound.currentTime = 0;
                    breakSound.play();
                } catch (e) { }
                
                // Remove after break animation
                setTimeout(() => {
                    state.orbs.splice(index, 1);
                }, 500);
            }
        }
    });
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
            
            // Use wrist as base
            const wrist = hand[0];
            const handCenter = { x: wrist.x, y: wrist.y };

            if (state.lastHandPos) {
                handCenter.x = (handCenter.x + state.lastHandPos.x) / 2;
                handCenter.y = (handCenter.y + state.lastHandPos.y) / 2;
            }
            state.lastHandPos = handCenter;

            const canvasX = (1 - handCenter.x) * canvas.width;
            const canvasY = handCenter.y * canvas.height;
            state.handPointer = { x: canvasX, y: canvasY };

            // Grasp detection - check if all fingers are closed
            const thumb = hand[4], index = hand[8], middle = hand[12], ring = hand[16], pinky = hand[20];
            const palm = hand[0];
            
            // Calculate average distance of fingertips to palm
            const distances = [thumb, index, middle, ring, pinky].map(tip => 
                Math.hypot(tip.x - palm.x, tip.y - palm.y)
            );
            const avgDistance = distances.reduce((a, b) => a + b, 0) / distances.length;

            if (avgDistance < GRASP_THRESHOLD && !state.isGrasping) {
                state.isGrasping = true;
                handleGraspStart(canvasX, canvasY);
            } else if (state.isGrasping && avgDistance >= GRASP_THRESHOLD) {
                state.isGrasping = false;
                if (state.draggingOrb) {
                    checkBasketPlacement(state.draggingOrb);
                    state.draggingOrb = null;
                    state.lastDragPos = null;
                }
            }

            // Update dragging position with distance tracking
            if (state.isGrasping && state.draggingOrb) {
                const newX = canvasX;
                const newY = canvasY;

                if (state.lastDragPos) {
                    const dx = newX - state.lastDragPos.x;
                    const dy = newY - state.lastDragPos.y;
                    const distance = Math.sqrt(dx * dx + dy * dy);

                    state.totalDistance += distance;
                    state.orbDistances[state.draggingOrb.id] = 
                        (state.orbDistances[state.draggingOrb.id] || 0) + distance;
                }

                state.draggingOrb.x = newX;
                state.draggingOrb.y = newY;
                state.lastDragPos = { x: newX, y: newY };
            }
        } else {
            // Lost hand tracking
            if (state.isGrasping && state.draggingOrb) {
                // Release orb back to falling
                state.draggingOrb.grabbed = false;
                state.draggingOrb = null;
            }
            state.handPointer = null;
            state.isGrasping = false;
        }
    } catch (err) {
        console.warn("Hand detection failed:", err);
    }
}

function handleGraspStart(x, y) {
    state.draggingOrb = null;

    for (let i = state.orbs.length - 1; i >= 0; i--) {
        const orb = state.orbs[i];
        if (!orb.broken && !orb.grabbed && isPointInOrb(x, y, orb)) {
            state.draggingOrb = orb;
            orb.grabbed = true;
            state.lastDragPos = { x: orb.x, y: orb.y };
            break;
        }
    }
}

function isPointInOrb(mx, my, orb) {
    return mx > orb.x - orb.width / 2 && 
                 mx < orb.x + orb.width / 2 && 
                 my > orb.y - orb.height / 2 && 
                 my < orb.y + orb.height / 2;
}

function checkBasketPlacement(orb) {
    if (!orb) return;

    const matchingBasket = state.baskets.find(b => b.type === orb.type);
    if (!matchingBasket) return;

    const dx = matchingBasket.x - orb.x;
    const dy = matchingBasket.y - orb.y;

    if (Math.hypot(dx, dy) < BASKET_SNAP_DISTANCE) {
        // Success!
        state.score++;
        state.successfulGrasps++;
        updateScore();

        // Remove orb
        const index = state.orbs.indexOf(orb);
        if (index > -1) state.orbs.splice(index, 1);

        // Play sound
        try { dingSound.currentTime = 0; dingSound.play(); } catch (e) { }

        // Effect
        drawBasketEffect(matchingBasket);

        checkWinCondition();
    } else {
        // Release back to falling
        orb.grabbed = false;
    }
}

function drawBasketEffect(basket) {
    // Simple glow effect (drawn in next frame)
    basket.glowTime = Date.now();
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
        }, 1000);
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

    // Draw baskets
    state.baskets.forEach(basket => {
        if (basket.img && basket.img.complete) {
            ctx.drawImage(basket.img, 
                basket.x - basket.width / 2, 
                basket.y - basket.height / 2, 
                basket.width, 
                basket.height);
        }

        // Star burst effect
        if (basket.glowTime) {
            const elapsed = Date.now() - basket.glowTime;
            if (elapsed < 500) {
                const progress = elapsed / 500;
                const alpha = 1 - progress;
                const numStars = 12;
                const radius = 140 * progress;
                
                for (let i = 0; i < numStars; i++) {
                    const angle = (Math.PI * 2 * i) / numStars + progress * Math.PI;
                    const x = basket.x + Math.cos(angle) * radius;
                    const y = basket.y + Math.sin(angle) * radius;
                    const size = 15 * (1 - progress);
                    
                    ctx.fillStyle = `rgba(255, 215, 0, ${alpha})`;
                    ctx.beginPath();
                    ctx.moveTo(x, y - size);
                    for (let j = 0; j < 5; j++) {
                        ctx.lineTo(x + Math.cos((j * 4 * Math.PI) / 5 - Math.PI / 2) * size,
                                   y + Math.sin((j * 4 * Math.PI) / 5 - Math.PI / 2) * size);
                    }
                    ctx.closePath();
                    ctx.fill();
                }
            } else {
                basket.glowTime = null;
            }
        }
    });

    // Draw cloud
    if (state.cloud && cloudImg.complete) {
        ctx.drawImage(cloudImg, 
            state.cloud.x - state.cloud.width / 2, 
            state.cloud.y - state.cloud.height / 2, 
            state.cloud.width, 
            state.cloud.height);
    }

    // Draw orbs
    state.orbs.forEach(orb => {
        if (orb.broken) {
            // Particle explosion effect
            const particles = 10;
            const maxRadius = 60;
            const progress = Math.min((Date.now() - (orb.breakTime || Date.now())) / 500, 1);
            
            for (let i = 0; i < particles; i++) {
                const angle = (Math.PI * 2 * i) / particles;
                const distance = maxRadius * progress;
                const x = orb.x + Math.cos(angle) * distance;
                const y = orb.y + Math.sin(angle) * distance;
                const alpha = 1 - progress;
                
                ctx.fillStyle = orb.type === "green" ? `rgba(0, 255, 0, ${alpha})` : `rgba(138, 43, 226, ${alpha})`;
                ctx.beginPath();
                const radius = Math.max(0, 5 * (1 - progress));
                ctx.arc(x, y, radius, 0, Math.PI * 2);
                ctx.fill();
            }
            
            if (!orb.breakTime) orb.breakTime = Date.now();
        } else if (orb.img && orb.img.complete) {
            // Draw glow effect
            const glowColor = orb.type === "green" ? "rgba(0, 255, 0, 0.5)" : "rgba(138, 43, 226, 0.5)";
            ctx.shadowBlur = 30;
            ctx.shadowColor = glowColor;
            
            ctx.drawImage(orb.img, 
                orb.x - orb.width / 2, 
                orb.y - orb.height / 2, 
                orb.width, 
                orb.height);
            
            // Reset shadow
            ctx.shadowBlur = 0;
        }
    });


    // Draw hand pointer
    if (state.handPointer && handImg.complete) {
        const handSize = Math.min(canvas.width, canvas.height) * 0.2;
        const imgToUse = state.isGrasping ? graspImg : handImg;
        const size = state.isGrasping ? handSize * 0.8 : handSize;
        ctx.drawImage(imgToUse, 
            state.handPointer.x - size / 2, 
            state.handPointer.y - size / 2, 
            size, 
            size);
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
    state.deltaTime = (currentTime - state.lastFrameTime) / 1000; // Convert to seconds
    state.lastFrameTime = currentTime;

    // Cap delta time to prevent huge jumps
    if (state.deltaTime > 0.1) {
        state.deltaTime = 0.1;
    }

    updateCloud();
    updateOrbs();
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
    const totalAttempts = state.successfulGrasps + state.lostGrasps;
    const graspStability = totalAttempts > 0 ? ((state.successfulGrasps / totalAttempts) * 100).toFixed(2) : 0;

    function drawOverlay(now) {
        const elapsed = now - startTime;
        opacity = Math.min(elapsed / fadeDuration, 1);

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        if (backgroundImg.complete) {
            ctx.drawImage(backgroundImg, 0, 0, canvas.width, canvas.height);
        }

        
        // Dark overlay with blur effect
        ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
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
            .from("orbcatcher_results")
            .select("time_taken")
            .eq("player_email", userEmail)
            .eq("level", "BEGINNER")
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
    const orbLose = state.orbLose ?? 0;
    const totalDistance = Math.round(state.totalDistance);
    
    const orbCount = Object.keys(state.orbDistances).length;
    const averageDistance = orbCount > 0 ? Math.round(totalDistance / orbCount) : 0;

    const totalAttempts = state.successfulGrasps + state.lostGrasps;
    const graspStability = totalAttempts > 0 ? 
        parseFloat(((state.successfulGrasps / totalAttempts) * 100).toFixed(2)) : 0;

    const consistency = await calculateConsistency(user.email);
    console.log("Calculated consistency:", consistency);

    const { data: insertData, error: insertError } = await supabase
        .from("orbcatcher_results")
        .insert([{
            player_email: user.email,
            score: score,
            level: "BEGINNER",
            time_taken: finalTime,
            totaldistance: totalDistance,
            av_distance: averageDistance,
            consistency: consistency,
            orblose: orbLose,
            attempts: totalAttempts,
            graspstability: graspStability
        }])
        .select();

    if (insertError) {
        console.error("Insert error:", insertError);
    } else {
        console.log("Result saved successfully!");
        console.log(`Total distance: ${totalDistance}px`);
        console.log(`Average distance: ${averageDistance}px`);
        console.log(`Consistency: ${consistency}`);
        console.log(`Orbs lost: ${orbLose}`);
        console.log(`Attempts: ${totalAttempts}`);
        console.log(`Grasp Stability: ${graspStability}%`);
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
    window.location.href = "/games/orb-catcher/play";
});

nextBtn.addEventListener("click", () => {
    window.location.href = "/games/orb-catcher/cover";
});

/* =========================
    ======= STARTUP =========
    ========================= */

if (backgroundImg.complete) {
    drawCover();
} else {
    backgroundImg.onload = () => drawCover();
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