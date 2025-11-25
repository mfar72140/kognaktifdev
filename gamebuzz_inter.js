// ============================================
// GLOBAL VARIABLES
// ============================================

let videoElement, hands, camera;
let ctx, canvas;
let beeImg, LhandImg, rhandImg, bgImg;
let ball = { x: 0, y: 0, r: 30, vx: 0, vy: 0 };
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
let previousHandType = "Left"; // default

// Path Deviation using Distance
let startPos = null; // starting hand position for path deviation
let deviationRatios = []; // store ratio per frame for current path
let pathDeviations = []; // store avg deviation % per bee

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

    // Load images
    beeImg = new Image();
    beeImg.src = "images/bee2.png";

    LhandImg = new Image();
    LhandImg.src = "images/Lhand.png";

    rhandImg = new Image();
    rhandImg.src = "images/rhand.png";

    bgImg = new Image();
    bgImg.src = "images/backgr1.jpg";

    // Load sound
    touchSound = new Audio("sounds/touch.wav");
    endGameSound = new Audio("sounds/endgame1.wav");
    countdownSound = new Audio("sounds/countdown.wav");

    // Background Music
    bgMusic = new Audio("sounds/01Backmusic20s.mp3");
    bgMusic.loop = true;  // keep looping
    bgMusic.volume = 0.6; // softer than effects

    const muteBtn = document.getElementById("muteBtn");
    if (muteBtn)  {
        muteBtn.addEventListener("click", () => {
            isMuted = !isMuted;

            if (isMuted) {
                bgMusic.muted = true;
                muteBtn.textContent = "🔇";
            } else {
                bgMusic.muted = false;
                muteBtn.textContent = "🔊";
            }
        });
    }

    // Buttons
    document.getElementById("startBtnOverlay").addEventListener("click", () => {
        document.getElementById("startBtnOverlay").style.display = "none";
        document.getElementById("gameTitle").style.display = "none";
        startCountdown();
    });

    // MediaPipe Hands setup
    hands = new Hands({
        locateFile: (file) =>
            `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
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

    requestAnimationFrame(gameLoop);
};


// ============================================
// Countdown
// ============================================

function startCountdown() {
    // Reset state
    score = 0;
    countdownValue = 3;
    countdownRunning = false; // don’t start until camera is ready
    gameRunning = false;
    HoneySplashes = [];
    if (respawnTimeout) clearTimeout(respawnTimeout);
    respawnTimeout = null;

    document.getElementById("score").innerText = "Score: 0";
    document.getElementById("startBtnOverlay").disabled = true;
    document.getElementById("gameTitle").style.display = "none";

    // Show Loading Overlay
    const loadingOverlay = document.getElementById("loadingOverlay");
    loadingOverlay.style.display = "flex";
    loadingOverlay.innerText = "📷 Loading... Starting Camera";

    // Camera ON
    camera = new Camera(videoElement, {
        onFrame: async () => {
            await hands.send({ image: videoElement });
        },
        width: 640,
        height: 480,
    });
    camera.start();


    // Wait until camera is ready
    const waitForCamera = setInterval(() => {
        if (cameraReady) {
            clearInterval(waitForCamera);
            console.log("🎥 Camera feed detected, starting countdown...");

            // Hide Loading Overlay once camera ready
            loadingOverlay.style.display = "none";
            console.log("🎥 Camera feed detected, starting countdown...");

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

    // ✅ Play background music here
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

const HAND_MOVE_THRESHOLD = 10; // pixels: minimum movement to start tracking


// ============================================
// Spawn Bee (spawn just outside screen edge and steer inward)
// ============================================
function spawnBall() {
    // remember last zone to avoid immediate respawn on same side
    if (typeof spawnBall.lastZone === "undefined") spawnBall.lastZone = -1;

    // pick a zone (0 = left, 1 = right, 2 = top, 3 = bottom)
    let zone;
    let attempts = 0;
    do {
        zone = Math.floor(Math.random() * 4);
        attempts++;
        // allow same zone rarely (in case of repeated attempts)
    } while (zone === spawnBall.lastZone && attempts < 6);

    spawnBall.lastZone = zone;

    const off = 80; // how far off-screen to place the bee
    const margin = 40; // keep spawn within vertical/horizontal margins
    // place just outside the chosen boundary
    if (zone === 0) {
        // LEFT: x just left of canvas
        ball.x = -off - Math.random() * 40;
        ball.y = Math.random() * (canvas.height - margin * 2) + margin;
    } else if (zone === 1) {
        // RIGHT: x just right of canvas
        ball.x = canvas.width + off + Math.random() * 40;
        ball.y = Math.random() * (canvas.height - margin * 2) + margin;
    } else if (zone === 2) {
        // TOP: y just above canvas
        ball.x = Math.random() * (canvas.width - margin * 2) + margin;
        ball.y = -off - Math.random() * 40;
    } else {
        // BOTTOM: y just below canvas
        ball.x = Math.random() * (canvas.width - margin * 2) + margin;
        ball.y = canvas.height + off + Math.random() * 40;
    }

    // aim roughly toward screen center with some randomness
    const targetX = canvas.width / 2 + (Math.random() - 0.5) * canvas.width * 0.3;
    const targetY = canvas.height / 2 + (Math.random() - 0.5) * canvas.height * 0.3;
    const angle = Math.atan2(targetY - ball.y, targetX - ball.x);
    const speed = Math.random() * 1.6 + 0.8; // moderate inward speed
    ball.vx = Math.cos(angle) * speed;
    ball.vy = Math.sin(angle) * speed;

    // Record spawn time for reaction calculation
    ballSpawnTime = Date.now();

    // Reset deviation tracking for this new bee
    startPos = null;       // will initialize on first hand movement toward new bee
    totalDeviation = 0;
    sampleCount = 0;

    // prevent huge distance jumps by resetting last hand pos
    lastX = null;
    lastY = null;
}

 // ============================================
 // Bee Movement: wandering steering
 // ============================================

 function updateBallMovement() {
    // small random steering occasionally
    if (Math.random() < 0.04) {
        let angle = Math.atan2(ball.vy, ball.vx);
        angle += (Math.random() - 0.5) * Math.PI * 0.6; // random turn
        let speed = Math.hypot(ball.vx, ball.vy);
        speed += (Math.random() - 0.5) * 0.6;
        speed = Math.max(0.6, Math.min(3.2, speed));
        ball.vx = Math.cos(angle) * speed;
        ball.vy = Math.sin(angle) * speed;
    }

    // steer away from edges gently
    const margin = 50;
    const steerStrength = 0.45;
    if (ball.x < margin) ball.vx += steerStrength;
    if (ball.x > canvas.width - margin) ball.vx -= steerStrength;
    if (ball.y < margin) ball.vy += steerStrength;
    if (ball.y > canvas.height - margin) ball.vy -= steerStrength;

    // limit speed
    const maxSpeed = 3;
    let sp = Math.hypot(ball.vx, ball.vy);
    if (sp > maxSpeed) {
        ball.vx = (ball.vx / sp) * maxSpeed;
        ball.vy = (ball.vy / sp) * maxSpeed;
    }

    // update position
    ball.x += ball.vx;
    ball.y += ball.vy;

    // keep inside bounds (bounce minimally)
    if (ball.x < ball.r) {
        ball.x = ball.r;
        ball.vx = Math.abs(ball.vx) * 0.8;
    }
    if (ball.x > canvas.width - ball.r) {
        ball.x = canvas.width - ball.r;
        ball.vx = -Math.abs(ball.vx) * 0.8;
    }
    if (ball.y < ball.r) {
        ball.y = ball.r;
        ball.vy = Math.abs(ball.vy) * 0.8;
    }
    if (ball.y > canvas.height - ball.r) {
        ball.y = canvas.height - ball.r;
        ball.vy = -Math.abs(ball.vy) * 0.8;
    }
 }


// ============================================
// Main Game Loop
// ============================================

function gameLoop() {
    if (countdownRunning) {
        drawCountdown(countdownValue);
    } 
    else if (gameRunning && latestResults) {
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

    // Update bee movement before drawing
    updateBallMovement();

    // Animate bee flap
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
            const handType = results.multiHandedness?.[i]?.label || "Unknown"; // NEW
            const palmIndices = [0, 1, 5, 9, 13, 17];
            let sumX = 0, sumY = 0;

            palmIndices.forEach((j) => {
                sumX += canvas.width - landmarks[j].x * canvas.width;
                sumY += landmarks[j].y * canvas.height;
            });

            arrowX = sumX / palmIndices.length;
            arrowY = sumY / palmIndices.length;

            // Smooth hand position slightly
            if (previousArrowX !== null) {
                arrowX = arrowX * 0.3 + previousArrowX * 0.7;
            }

            // Prevent sudden flip when hand jumps
            let currentHandType = handType;
            if (previousArrowX !== null) {
                const dx = Math.abs(arrowX - previousArrowX);
                if (dx > 250) {
                    currentHandType = previousHandType; // keep previous hand type
                }
            }

            // Draw hand
            if (currentHandType === "Right" && rhandImg) {
                drawHand(arrowX, arrowY, rhandImg);
            } else {
                drawHand(arrowX, arrowY, LhandImg);
            }

            // Update previous for next frame
            previousArrowX = arrowX;
            previousHandType = currentHandType;


        // ✅ Initialize startPos when movement starts
        if (!startPos) {
            const dx = arrowX - ball.x;
            const dy = arrowY - ball.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist > HAND_MOVE_THRESHOLD) {
                startPos = { x: arrowX, y: arrowY };
                lastX = arrowX;
                lastY = arrowY;
                deviationRatios = []; // reset for new path
            }
        }

        // ✅ Track total hand movement distance (ignore small jitter)
        if (lastX !== null && lastY !== null) {
            let dxMove = arrowX - lastX;
            let dyMove = arrowY - lastY;
            let moveDist = Math.sqrt(dxMove * dxMove + dyMove * dyMove);

            if (moveDist > HAND_MOVE_THRESHOLD) {
                totalDistance += moveDist;
                lastX = arrowX;
                lastY = arrowY;
            }
        }

        // ✅ Update Path Deviation per frame
        if (startPos) {
            const pathLength = Math.hypot(ball.x - startPos.x, ball.y - startPos.y);
            if (pathLength > 0) {
                const perpDist = getPerpendicularDistance(
                    arrowX, arrowY, startPos.x, startPos.y, ball.x, ball.y
                );
                const ratio = perpDist / pathLength; // 0 = perfect straight
                deviationRatios.push(ratio);
            }
        }

        drawHand(arrowX, arrowY);
        handleGameLogic(arrowX, arrowY);

        // Honey splashes
        for (let i = HoneySplashes.length - 1; i >= 0; i--) {
            HoneySplashes[i].update();
            HoneySplashes[i].draw(ctx);
            if (HoneySplashes[i].isFinished()) {
                HoneySplashes.splice(i, 1);
            }
        }
    }}}


// ============================================
// Handle Game Logic
// ============================================

function handleGameLogic(arrowX, arrowY) {

        // Collision check
        const dx = arrowX - ball.x;
        const dy = arrowY - ball.y;
        if (Math.sqrt(dx * dx + dy * dy) < ball.r + 10) {
            let reaction = Date.now() - ballSpawnTime; 
            reactionTimes.push(reaction);  // ⏱ save reaction time  
        
            // ✅ Compute avg deviation for this bee
            if (deviationRatios.length > 0) {
                const avgRatio = deviationRatios.reduce((a, b) => a + b, 0) / deviationRatios.length;
                pathDeviations.push(avgRatio * 100); // store as %
            }

            score++;
            document.getElementById("score").innerText = "Score: " + score;

            handBounceActive = true; // trigger hand bounce


            if (touchSound) {
                touchSound.currentTime = 0;
                touchSound.play();
            }

            HoneySplashes.push(new HoneySplash(ball.x, ball.y));

            // Reset for next bee
            startPos = null;
            deviationRatios = [];
            lastX = null;
            lastY = null;

            // Hide current bee off-screen (so it doesn't get hit during respawn delay)
            ball.x = -200;
            ball.y = -200;
            ball.vx = 0;
            ball.vy = 0;


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
    // 🧱 Safety: skip drawing if image not ready
    if (!img || !img.complete || img.naturalWidth === 0) return;

    const baseSize = 90;
    const size = baseSize * handScale; // scaled size

    ctx.drawImage(img, x - size / 2, y - size / 2, size, size);

    // ✨ Bounce animation
    if (handBounceActive) {
        handScale += (1.6 - handScale) * 0.25; // grow towards 1.6x
        if (handScale >= 1.55) {
            handBounceActive = false;
        }
    } else {
        handScale += (1 - handScale) * 0.2; // return to normal
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
 // document.getElementById("timer").innerText = "Final Time: " + elapsed + "s";

    // 🎯 Calculate average reaction time
    let avgReaction = 0;
    if (reactionTimes.length > 0) {
        avgReaction = (
            reactionTimes.reduce((a, b) => a + b, 0) / reactionTimes.length / 1000
        ).toFixed(2); // keep 2 decimal places
    }

 // ✅ Normalize distance = total movement / score
    let normDistance = score > 0 ? totalDistance / score : totalDistance;

    console.log("Total Distance:", totalDistance, "Normalized:", normDistance);

    // Calculate Movement Stability based on distance deviation
    let movementStability = 0;
    if (pathDeviations.length > 0) {
        // pathDeviations currently stores deviation %, lower = more stable
        const avgDeviation = pathDeviations.reduce((a, b) => a + b, 0) / pathDeviations.length;

        // Invert: higher value = higher stability
        movementStability = (100 - avgDeviation).toFixed(2);
    }


    // ✅ Stop background music here
    if (bgMusic) {
        bgMusic.pause();
        bgMusic.currentTime = 0;
    }
    
    if (endGameSound) {
        endGameSound.currentTime = 0;
        endGameSound.play();
    }

    // 🎇 Start fireworks
    startFireworks();

    // Animate fireworks first, then show text
    let fireworksDuration = 2500; // 2.5 seconds
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

async function saveGameResult(score, timeTaken, avgReaction, normDistance, movementStability, consistency) {
    console.log("Saving result...", score, timeTaken, avgReaction, normDistance, movementStability, consistency);

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
        console.error("No user logged in:", userError);
        return;
    }

    console.log("User found:", user);

    // Insert using email only (since player_id is int8 and not compatible with UUID)
    const { error: insertError } = await supabase
        .from("buzztap_results")
        .insert([{
            player_email: user.email,
            score: score,
            time_taken: timeTaken,
            avg_reaction_time: avgReaction,
            norm_totaldistance: normDistance,
            av_devpath: parseFloat(movementStability), // Save path deviation %
            consistency: consistency,
            level: "INTERMEDIATE",
            // leave player_id empty
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

    ctx.fillStyle = "rgba(0,0,0,0.1)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = "white";
    ctx.font = "55px poppins";
    ctx.textAlign = "center";
    ctx.fillText("🎉 Congratulations! 🎉", canvas.width / 2, canvas.height / 2 - 120);

    ctx.font = "20px poppins";
    ctx.fillText(`Final Score: ${score}`, canvas.width / 2, canvas.height / 2 - 60);
    ctx.fillText(`Time: ${elapsed}s`, canvas.width / 2, canvas.height / 2 - 30);
    ctx.fillText(`Avg Reaction: ${avgReaction}s`, canvas.width / 2, canvas.height / 2);
    ctx.fillText(`Normalized Distance: ${normDistance.toFixed(2)}`, canvas.width / 2, canvas.height / 2 + 30);
    ctx.fillText(`Movement Stability: ${movementStability}%`, canvas.width / 2, canvas.height / 2 + 60);


    // ✅ Reset Path Deviation variables for next game
    startPos = null;
    totalDeviation = 0;
    sampleCount = 0;
    pathDeviations = [];

    document.getElementById("playAgainBtn").style.display = "block";
    document.getElementById("nextBtn").style.display = "block";


// ============================================
// Calculate Consistency
// ============================================

    async function calculateConsistency(newTimeTaken) {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return 0;

        // Get last 4 games (we’ll add this new one = 5 total)
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

        if (times.length < 5) {
            console.log("Not enough games for consistency");
            return 0; // need minimum 5 games
        }

        // Coefficient of variation: std / mean
        let mean = times.reduce((a, b) => a + b, 0) / times.length;
        let variance = times.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / times.length;
        let std = Math.sqrt(variance);

        let consistency = 1 - (std / mean); 
        return Math.max(0, Math.min(1, consistency)).toFixed(3); // clamp 0–1
    }


    // ✅ Save score + time + reaction + distance + path + consistency
    calculateConsistency(elapsed).then(consistency => {
        saveGameResult(score, elapsed, avgReaction, normDistance, movementStability, consistency);
    });

    reactionTimes = [];
    totalDistance = 0;
    lastX = null;
    lastY = null;

    document.getElementById("playAgainBtn").onclick = () => {
        document.getElementById("playAgainBtn").style.display = "none";
        document.getElementById("nextBtn").style.display = "none";
        window.location.href = "gamebuzzplay.html";
    };

    document.getElementById("nextBtn").onclick = () => {
        window.location.href = "gamebuzzcover.html";
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

// Auto open popup on page load
window.addEventListener("load", showPopup);


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

// --- End of gamebuzz_inter.js ---
 
