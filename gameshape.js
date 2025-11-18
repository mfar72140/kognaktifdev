

/* =========================
   ========== CONSTS =======
   ========================= */
const CANVAS_ID = "output_canvas";
const TIMER_ID = "timer";

const COUNTDOWN_START = 3;
const DETECTION_INTERVAL_MS = 100; // 10 FPS equivalent
const PINCH_THRESHOLD = 0.07; // hand pinch sensitivity (normalized model coords)
const PLACEMENT_DISTANCE = 40; // px

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


/* =========================
   ====== DOM & UI ELTS ====
   ========================= */
const canvas = document.getElementById(CANVAS_ID);
const ctx = canvas.getContext("2d");

const titleEl = document.getElementById("gameTitle");
const startBtn = document.getElementById("startBtnOverlay");
const playAgainBtn = document.getElementById("playAgainBtn");
const exitBtn = document.getElementById("exitBtn");
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
// shape names & image paths
const SHAPE_NAMES = ["circle", "square", "star", "triangle"];
const SHAPE_IMAGE_PATHS = SHAPE_NAMES.map(n => `images/shape_${n}.png`);

// board & cover images
const leftBoardImg = new Image();
leftBoardImg.src = "images/board1.png";
const rightBoardImg = new Image();
rightBoardImg.src = "images/board1.png";
const coverImg = new Image();
coverImg.src = "images/shape_back1.jpg";

// hand images
const handImg = new Image();
handImg.src = "images/rhand_shape.png";
const pinchImg = new Image();
pinchImg.src = "images/rpinch_shape.png";

// sound assets
const dingSound = new Audio("sounds/dingeffect.wav");
const countdownSound = new Audio("sounds/countdown.wav");
const endApplause = new Audio("sounds/endapplause.wav");
endApplause.volume = 0.7;

const bgMusic = new Audio("sounds/02Backmusic20s.mp3");
bgMusic.loop = true;
bgMusic.volume = 0.6;

// container for loaded shape Image objects
const shapeImages = {};

/* =========================
   ======= Layout Boxes ====
   ========================= */
const leftBox = { x: 60, y: 120, width: 400, height: 350 };
const rightBox = { x: 500, y: 120, width: 400, height: 350 };

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
  [leftBoardImg, rightBoardImg, coverImg, handImg, pinchImg].forEach(img => {
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

function generateGridPositions(box, itemSize, count) {
  const gap = 40;
  const cols = Math.ceil(Math.sqrt(count));
  const rows = Math.ceil(count / cols);
  const totalWidth = cols * itemSize + (cols - 1) * gap;
  const totalHeight = rows * itemSize + (rows - 1) * gap;
  const startX = box.x + (box.width - totalWidth) / 2 + itemSize / 2;
  const startY = box.y + (box.height - totalHeight) / 2 + itemSize / 2;

  const positions = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (positions.length >= count) break;
      positions.push({ x: startX + c * (itemSize + gap), y: startY + r * (itemSize + gap) });
    }
  }

  // shuffle
  for (let i = positions.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [positions[i], positions[j]] = [positions[j], positions[i]];
  }
  return positions;
}

function createShapesAndTargets() {
  const size = 110;
  const targetPositions = generateGridPositions(leftBox, size, SHAPE_NAMES.length);
  state.targets = targetPositions.map((pos, i) => ({
    name: SHAPE_NAMES[i],
    x: pos.x,
    y: pos.y,
    size,
  }));

  const shapePositions = generateGridPositions(rightBox, size, SHAPE_NAMES.length);
  state.shapes = shapePositions.map((pos, i) => ({
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
  
  state.shapes = [];
  state.targets = [];
  createShapesAndTargets();
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
        handlePinchStart(canvasX, canvasY);
      } else if (state.isPinching && pinchDist >= PINCH_THRESHOLD) {
        // pinch released
        state.isPinching = false;
        if (state.draggingShape) {
          checkPlacement(state.draggingShape);
          state.draggingShape = null;
        }
      }

      // dragging update
      if (state.isPinching && state.draggingShape) {
        state.draggingShape.x = canvasX - state.dragOffset.x;
        state.draggingShape.y = canvasY - state.dragOffset.y;
      }
    } else {
      // no hand detected
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

    try { dingSound.currentTime = 0; dingSound.play(); } catch (e) {}
  } else {
    // revert
    shape.x = shape.originalX;
    shape.y = shape.originalY;
  }
  checkWinCondition();
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

  // boards
  if (leftBoardImg.complete) ctx.drawImage(leftBoardImg, leftBox.x, leftBox.y, leftBox.width, leftBox.height);
  if (rightBoardImg.complete) ctx.drawImage(rightBoardImg, rightBox.x, rightBox.y, rightBox.width, rightBox.height);

  // targets
  state.targets.forEach(t => {
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 3;
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

  function drawOverlay(now) {
    const elapsed = now - startTime;
    opacity = Math.min(elapsed / fadeDuration, 1);

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = `rgba(0,0,0,${0.5 * opacity})`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = `rgba(255,255,255,${opacity})`;
    ctx.font = "70px Poppins";
    ctx.textAlign = "center";
    ctx.fillText("🎉 Well done! 🎉", canvas.width / 2, canvas.height / 2 - 80);

    ctx.font = "35px Poppins";
    ctx.fillText("You’ve completed the game!", canvas.width / 2, canvas.height / 2 - 10);

    ctx.font = "20px Poppins";
    ctx.fillText(`Time: ${finalTime}s`, canvas.width / 2, canvas.height / 2 + 30);

    ctx.font = "20px Poppins";
    ctx.fillText(`Attempts: ${state.attempts}`, canvas.width / 2, canvas.height / 2 + 70);


    if (opacity < 1) {
      requestAnimationFrame(drawOverlay);
    } else {
      playAgainBtn.style.display = "block";
      exitBtn.style.display = "block";
    }
  }

  requestAnimationFrame(drawOverlay);
}

/* =========================
   ======= EVENTS ==========
   ========================= */

startBtn.addEventListener("click", async () => {
  // hide UI overlays
  startBtn.style.display = "none";
  titleEl.style.display = "none";
  playAgainBtn.style.display = "none";
  exitBtn.style.display = "none";

  // preload images then draw cover
  await preloadAssets();
  drawCover();

  // setup camera + model, then run countdown
  await setupCameraAndModel();
  runCountdownAndStart();
});

playAgainBtn.addEventListener("click", () => {
  window.location.href = "gameshapeplay.html";
});
exitBtn.addEventListener("click", () => {
  window.location.href = "dashgames.html";
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

async function saveGameResult(finalTime) {
  console.log("Saving result...", finalTime);

  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    console.error("No user logged in:", userError);
    return;
  }

  console.log("User found:", user);

  // Insert using email only (since player_id is int8 and not compatible with UUID)
  const { error: insertError } = await supabase
    .from("shapesense_results")
    .insert([{
      player_email: user.email,
      //score: score,
      time_taken: finalTime,
      //avg_reaction_time: avgReaction,
      //norm_totaldistance: normDistance,
      //av_devpath: parseFloat(movementStability), // Save path deviation %
      //consistency: consistency
      // leave player_id empty
    }]);

  if (insertError) {
    console.error("Insert error:", insertError);
  } else {
    console.log("Result saved successfully!");
  }
}