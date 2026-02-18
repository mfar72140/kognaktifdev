// ============================================
// GLOBAL VARIABLES
// ============================================

let videoElement, hands, camera;
let ctx, canvas;
let beeImg, LhandImg, rhandImg, bgImg, medalImg;
let ball = { x: 0, y: 0, r: 30 };
let score = 0;
let gameRunning = false;
let countdownRunning = false;
let touchSound, endGameSound, countdownSound;
let HoneySplashes = [];
let bgMusic;
let isMuted = false;
let reactionTimes = [];
let ballSpawnTime = null;
let cameraReady = false;
let previousArrowX = null;
let previousHandType = "Left";
let guidePopup, howToPlayBtn, closeGuideBtn;

// Path Deviation using Distance
let startPos = null;
let deviationRatios = [];
let pathDeviations = [];
let totalDeviation = 0; // FIX: define (was used but not declared)
let sampleCount = 0;    // FIX: define (was used but not declared)

// Distance Tracking
let totalDistance = 0;
let lastX = null, lastY = null;

// Hand bounce
let handScale = 1;
let handBounceActive = false;

// Timer variables
let startTime;
let timerInterval;

// Countdown
let countdownValue = 3;
let countdownInterval;

// Hand position
let arrowX = 0;
let arrowY = 0;

// Store latest results
let latestResults = null;

// Bee animation
let flap = 0;
let flapDirection = 1;

// Track respawn timeout
let respawnTimeout = null;


// ============================================
// WINDOW ONLOAD - INIT
// ============================================

window.onload = () => {
  canvas = document.getElementById("output_canvas");
  ctx = canvas.getContext("2d");

  beeImg = new Image();
  beeImg.src = "/assets/images/bee2.png";

  LhandImg = new Image();
  LhandImg.src = "/assets/images/Lhand.png";

  rhandImg = new Image();
  rhandImg.src = "/assets/images/rhand.png";

  bgImg = new Image();
  bgImg.src = "/assets/images/backgr1.jpg";

  medalImg = new Image();
  medalImg.src = "/assets/images/medal.png";

  touchSound = new Audio("/assets/sounds/touch.wav");
  endGameSound = new Audio("/assets/sounds/endapplause.wav");
  countdownSound = new Audio("/assets/sounds/countdown.wav");

  bgMusic = new Audio("/assets/sounds/01Backmusic20s.mp3");
  bgMusic.loop = true;
  bgMusic.volume = 0.6;

  const muteBtn = document.getElementById("muteBtn");
  if (muteBtn)  {
    muteBtn.addEventListener("click", () => {
      isMuted = !isMuted;
      bgMusic.muted = isMuted;
      muteBtn.textContent = isMuted ? "🔇" : "🔊";
    });
  }

  document.getElementById("startBtnOverlay").addEventListener("click", () => {
    document.getElementById("startBtnOverlay").style.display = "none";
    document.getElementById("gameTitle").style.display = "none";
    startCountdown();
  });

  hands = new window.Hands({
    locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
  });
  hands.setOptions({
    maxNumHands: 1,
    modelComplexity: 0,
    minDetectionConfidence: 0.6,
    minTrackingConfidence: 0.6,
  });
  hands.onResults((r) => {
    latestResults = r;
    if (!cameraReady) {
      cameraReady = true;
      console.log("✅ Camera is ready!");
    }
  });

  videoElement = document.createElement("video");
  videoElement.style.display = "none";

  guidePopup = document.getElementById("guidePopup");
  howToPlayBtn = document.getElementById("howToPlayBtn");
  closeGuideBtn = document.getElementById("closeGuideBtn");

  requestAnimationFrame(gameLoop);
};


// ============================================
// Countdown
// ============================================

function startCountdown() {
  score = 0;
  countdownValue = 3;
  countdownRunning = false;
  gameRunning = false;
  HoneySplashes = [];
  if (respawnTimeout) clearTimeout(respawnTimeout);
  respawnTimeout = null;

  // FIX: Reset metrics for fresh run
  reactionTimes = [];
  totalDistance = 0;
  lastX = null;
  lastY = null;
  pathDeviations = [];
  deviationRatios = [];
  startPos = null;

  document.getElementById("score").innerText = "Score: 0";
  document.getElementById("startBtnOverlay").disabled = true;
  document.getElementById("gameTitle").style.display = "none";

  const loadingOverlay = document.getElementById("loadingOverlay");
  loadingOverlay.style.display = "flex";
  loadingOverlay.innerText = "📷 Loading... Starting Camera";

  camera = new window.Camera(videoElement, {
    onFrame: async () => {
      await hands.send({ image: videoElement });
    },
    width: 640,
    height: 480,
  });
  camera.start();

  const waitForCamera = setInterval(() => {
    if (cameraReady) {
      clearInterval(waitForCamera);
      loadingOverlay.style.display = "none";
      if (countdownSound) {
        countdownSound.currentTime = 0;
        countdownSound.play();
      }
      countdownRunning = true;
      countdownInterval = setInterval(() => {
        drawCountdown(countdownValue);
        countdownValue--;
        if (countdownValue < 0) {
          clearInterval(countdownInterval);
          countdownRunning = false;
          startGame();
        }
      }, 1000);
    }
  }, 200);
}

function drawCountdown(value) {
  ctx.fillStyle = "rgba(0,0,0,0.6)";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bgImg, 0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "white";
  ctx.font = "700 180px Arial";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(value > 0 ? value : "GO!", canvas.width / 2, canvas.height / 2);
}


// ============================================
// Start Game
// ============================================

function startGame() {
  gameRunning = true;

  // FIX: Ensure fresh distance tracking
  totalDistance = 0;
  lastX = null;
  lastY = null;

  if (bgMusic) {
    bgMusic.currentTime = 0;
    bgMusic.play();
  }

  clearInterval(timerInterval);
  startTime = Date.now();
  document.getElementById("timer").innerText = "Time: 0s";
  timerInterval = setInterval(() => {
    let elapsed = Math.floor((Date.now() - startTime) / 1000);
    document.getElementById("timer").innerText = "Time: " + elapsed + "s";
  }, 1000);

  spawnBall();
}

const HAND_MOVE_THRESHOLD = 10;


// ============================================
// Spawn Bee
// ============================================

function spawnBall() {
  ball.x = Math.random() * (canvas.width - 80) + 40;
  ball.y = Math.random() * (canvas.height - 80) + 40;
  ballSpawnTime = Date.now();

  startPos = null;
  totalDeviation = 0;
  sampleCount = 0;
  lastX = null;
  lastY = null;
}


// ============================================
// Main Game Loop
// ============================================

function gameLoop() {
  if (countdownRunning) {
    drawCountdown(countdownValue);
  } else if (gameRunning && latestResults) {
    drawScene(latestResults);
  }
  requestAnimationFrame(gameLoop);
}


// ============================================
// Draw Scene
// ============================================

function drawScene(results) {
  ctx.fillStyle = "white";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bgImg, 0, 0, canvas.width, canvas.height);

  flap += flapDirection * 0.8;
  if (flap > 10 || flap < -10) flapDirection *= -1;

  ctx.drawImage(
    beeImg,
    ball.x - ball.r,
    ball.y - ball.r + flap,
    ball.r * 2,
    ball.r * 2
  );

  if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
    for (let i = 0; i < results.multiHandLandmarks.length; i++) {
      const landmarks = results.multiHandLandmarks[i];
      const handType = results.multiHandedness?.[i]?.label || "Unknown";
      const palmIndices = [0, 1, 5, 9, 13, 17];
      let sumX = 0, sumY = 0;

      palmIndices.forEach((j) => {
        sumX += canvas.width - landmarks[j].x * canvas.width;
        sumY += landmarks[j].y * canvas.height;
      });

      arrowX = sumX / palmIndices.length;
      arrowY = sumY / palmIndices.length;

      if (previousArrowX !== null) {
        arrowX = arrowX * 0.3 + previousArrowX * 0.7;
      }

      let currentHandType = handType;
      if (previousArrowX !== null) {
        const dx = Math.abs(arrowX - previousArrowX);
        if (dx > 250) currentHandType = previousHandType;
      }

      if (currentHandType === "Right" && rhandImg) {
        drawHand(arrowX, arrowY, rhandImg);
      } else {
        drawHand(arrowX, arrowY, LhandImg);
      }

      previousArrowX = arrowX;
      previousHandType = currentHandType;

      // FIX: Initialize lastX/lastY immediately (not gated by startPos)
      if (lastX === null || lastY === null) {
        lastX = arrowX;
        lastY = arrowY;
      }

      // Initialize path start when meaningful movement starts
      if (!startPos) {
        const dxStart = arrowX - ball.x;
        const dyStart = arrowY - ball.y;
        const dist = Math.sqrt(dxStart * dxStart + dyStart * dyStart);
        if (dist > HAND_MOVE_THRESHOLD) {
          startPos = { x: arrowX, y: arrowY };
          deviationRatios = [];
        }
      }

      // FIX: Always accumulate meaningful movement
      let dxMove = arrowX - lastX;
      let dyMove = arrowY - lastY;
      let moveDist = Math.sqrt(dxMove * dxMove + dyMove * dyMove);
      if (moveDist > HAND_MOVE_THRESHOLD) {
        totalDistance += moveDist;
        lastX = arrowX;
        lastY = arrowY;
      }

      if (startPos) {
        const pathLength = Math.hypot(ball.x - startPos.x, ball.y - startPos.y);
        if (pathLength > 0) {
          const perpDist = getPerpendicularDistance(
            arrowX, arrowY, startPos.x, startPos.y, ball.x, ball.y
          );
            const ratio = perpDist / pathLength;
            deviationRatios.push(ratio);
        }
      }

      drawHand(arrowX, arrowY);
      handleGameLogic(arrowX, arrowY);

      for (let p = HoneySplashes.length - 1; p >= 0; p--) {
        HoneySplashes[p].update();
        HoneySplashes[p].draw(ctx);
        if (HoneySplashes[p].isFinished()) {
          HoneySplashes.splice(p, 1);
        }
      }
    }
  }
}


// ============================================
// Handle Game Logic
// ============================================

function handleGameLogic(arrowX, arrowY) {
  const dx = arrowX - ball.x;
  const dy = arrowY - ball.y;
  if (Math.sqrt(dx * dx + dy * dy) < ball.r + 10) {
    let reaction = Date.now() - ballSpawnTime;
    reactionTimes.push(reaction);

    if (deviationRatios.length > 0) {
      const avgRatio = deviationRatios.reduce((a, b) => a + b, 0) / deviationRatios.length;
      pathDeviations.push(avgRatio * 100);
    }

    score++;
    document.getElementById("score").innerText = "Score: " + score;
    handBounceActive = true;

    if (touchSound) {
      touchSound.currentTime = 0;
      touchSound.play();
    }

    HoneySplashes.push(new HoneySplash(ball.x, ball.y));

    startPos = null;
    deviationRatios = [];
    lastX = null;
    lastY = null;

    ball.x = -100;
    ball.y = -100;

    if (score >= 20) {
      endGame();
    } else {
      if (respawnTimeout) clearTimeout(respawnTimeout);
      respawnTimeout = setTimeout(spawnBall, 700);
    }
  }
}


// ============================================
// Draw Hand
// ============================================

function drawHand(x, y, img) {
  if (!img || !img.complete || img.naturalWidth === 0) return;
  const baseSize = 90;
  const size = baseSize * handScale;
  ctx.drawImage(img, x - size / 2, y - size / 2, size, size);

  if (handBounceActive) {
    handScale += (1.6 - handScale) * 0.25;
    if (handScale >= 1.55) handBounceActive = false;
  } else {
    handScale += (1 - handScale) * 0.2;
  }
}


// ============================================
// End Game
// ============================================

function endGame() {
  gameRunning = false;
  if (camera) camera.stop();
  document.getElementById("startBtnOverlay").disabled = false;

  clearInterval(timerInterval);
  if (respawnTimeout) clearTimeout(respawnTimeout);
  respawnTimeout = null;

  let elapsed = Math.floor((Date.now() - startTime) / 1000);

  let avgReaction = 0;
  if (reactionTimes.length > 0) {
    avgReaction = (
      reactionTimes.reduce((a, b) => a + b, 0) / reactionTimes.length / 1000
    ).toFixed(2);
  }

  let normDistance = score > 0 ? totalDistance / score : totalDistance;

  let movementStability = 0;
  if (pathDeviations.length > 0) {
    const avgDeviation = pathDeviations.reduce((a, b) => a + b, 0) / pathDeviations.length;
    movementStability = (100 - avgDeviation).toFixed(2);
  }

  if (bgMusic) {
    bgMusic.pause();
    bgMusic.currentTime = 0;
  }
  if (endGameSound) {
    endGameSound.currentTime = 0;
    endGameSound.play();
  }

  fireworksRunning = true;
  startFireworks();

  let fireworksDuration = 2500;
  let startTimeFireworks = Date.now();

  function fireworksAnimation() {
    if (!fireworksRunning) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawFireworks(ctx);
    if (Date.now() - startTimeFireworks < fireworksDuration) {
      requestAnimationFrame(fireworksAnimation);
    } else {
      stopFireworks();
      showEndText(elapsed, avgReaction, normDistance, movementStability);
    }
  }
  fireworksAnimation();
}


// ============================================
// Save Game Result to Supabase
// ============================================

async function saveGameResult(score, timeTaken, avgReaction, normDistance, movementStability, consistency, totalDistance) {
  console.log("Saving result...", score, timeTaken, avgReaction, normDistance, movementStability, consistency, totalDistance);

  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    console.error("No user logged in:", userError);
    return;
  }

  const { error: insertError } = await supabase
    .from("buzztap_results")
    .insert([{
      player_email: user.email,
      score: score,
      time_taken: timeTaken,
      avg_reaction_time: parseFloat(avgReaction),
      norm_totaldistance: parseFloat(normDistance.toFixed(2)),
      totaldistance: parseFloat(totalDistance),
      av_devpath: parseFloat(movementStability),
      consistency: parseFloat(consistency),
      level: "BEGINNER"
    }]);

  if (insertError) {
    console.error("Insert error:", insertError);
  } else {
    console.log("Result saved successfully!");
  }
}


// ============================================
// Show End Text
// ============================================

function showEndText(elapsed, avgReaction, normDistance, movementStability) {
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
  ctx.fillText(`Your Time: ${elapsed}s`, canvas.width / 2, statsY + 40);

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

  startPos = null;
  totalDeviation = 0;
  sampleCount = 0;
  pathDeviations = [];

  document.getElementById("playAgainBtn").style.display = "block";
  document.getElementById("nextBtn").style.display = "block";

  async function calculateConsistency(newTimeTaken) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return 0;

    const { data, error } = await supabase
      .from("buzztap_results")
      .select("time_taken")
      .eq("player_email", user.email)
      .order("created_at", { ascending: false })
      .limit(4);

    if (error) {
      console.error("Fetch error:", error);
      return 0;
    }

    let times = data.map(r => r.time_taken);
    times.push(newTimeTaken);

    if (times.length < 5) return 0;

    let mean = times.reduce((a, b) => a + b, 0) / times.length;
    let variance = times.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / times.length;
    let std = Math.sqrt(variance);
    let consistency = 1 - (std / mean);
    return Math.max(0, Math.min(1, consistency)).toFixed(3);
  }

calculateConsistency(elapsed).then(consistency => {

    // Save first
    saveGameResult(
        score,
        elapsed,
        avgReaction,
        normDistance,
        movementStability,
        consistency,
        totalDistance // ← correct non-zero value
    );

    // Reset AFTER saving
    reactionTimes = [];
    totalDistance = 0;
    lastX = null;
    lastY = null;
});


  document.getElementById("playAgainBtn").onclick = () => {
    document.getElementById("playAgainBtn").style.display = "none";
    document.getElementById("nextBtn").style.display = "none";
    window.location.href = "/games/buzz-tap/play";
  };

  document.getElementById("nextBtn").onclick = () => {
    window.location.href = "/games/buzz-tap/cover";
  };
}


// ============================================
// HONEY SPLASH EFFECT
// ============================================

class HoneySplash {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.particles = [];
    for (let i = 0; i < 8; i++) {
      this.particles.push({
        x: x,
        y: y,
        angle: Math.random() * Math.PI * 2,
        speed: Math.random() * 3 + 2,
        size: Math.random() * 8 + 6,
        alpha: 1.0,
      });
    }
  }
  update() {
    this.particles.forEach((p) => {
      p.x += Math.cos(p.angle) * p.speed;
      p.y += Math.sin(p.angle) * p.speed;
      p.alpha -= 0.04;
    });
    this.particles = this.particles.filter((p) => p.alpha > 0);
  }
  draw(ctx) {
    this.particles.forEach((p) => {
      ctx.fillStyle = `rgba(255, 204, 0, ${p.alpha})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size / 2, 0, Math.PI * 2);
      ctx.fill();
    });
  }
  isFinished() {
    return this.particles.length === 0;
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
window.addEventListener("load", showPopup);


// =================================================
// Fireworks Functions
// =================================================

function startFireworks() {
  fireworksRunning = true;
}

function stopFireworks() {
  fireworksRunning = false;
}

function drawFireworks() {
  // Placeholder fireworks drawing - add your implementation here
}

// =================================================
// Helper: perpendicular distance from point to line
// =================================================

function getPerpendicularDistance(px, py, x1, y1, x2, y2) {
  const A = px - x1;
  const B = py - y1;
  const C = x2 - x1;
  const D = y2 - y1;

  const dot = A * C + B * D;
  const len_sq = C * C + D * D;
  const param = len_sq !== 0 ? dot / len_sq : -1;

  let xx, yy;
  if (param < 0) {
    xx = x1;
    yy = y1;
  } else if (param > 1) {
    xx = x2;
    yy = y2;
  } else {
    xx = x1 + param * C;
    yy = y1 + param * D;
  }

  const dx = px - xx;
  const dy = py - yy;
  return Math.sqrt(dx * dx + dy * dy);
}

// --- End of gamebuzz.js ---