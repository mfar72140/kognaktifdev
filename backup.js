// gamebuzz_adv.js backup

// ============================================
// GLOBAL VARIABLES
// ============================================

let videoElement, hands, camera;
let ctx, canvas;
let beeImg, LhandImg, rhandImg, bgImg, bflyImg;
let ball = { x: 0, y: 0, r: 30, vx: 0, vy: 0 };
let butterfly = { x: 0, y: 0, r: 25, baseY: 0, wiggle: 0, visible: true, respawnTime: null };
let score = 0;
let bflyScore = 0;
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

let startPos = null;
let deviationRatios = [];
let pathDeviations = [];

let totalDistance = 0;
let lastX = null, lastY = null;

let handScale = 1;
let handBounceActive = false;

let startTime;
let timerInterval;

let countdownValue = 3;
let countdownInterval;

let arrowX = 0;
let arrowY = 0;

let latestResults = null;

let flap = 0;
let flapDirection = 1;

let respawnTimeout = null;
let bflyToggleInterval = null;

const HAND_MOVE_THRESHOLD = 10;
const BFLY_TOGGLE_INTERVAL = 4000; // 4 seconds


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

    bflyImg = new Image();
    bflyImg.src = "images/bfly2.png";

    // Load sound
    touchSound = new Audio("sounds/touch.wav");
    endGameSound = new Audio("sounds/endapplause.wav");
    countdownSound = new Audio("sounds/countdown.wav");

    bgMusic = new Audio("sounds/01Backmusic20s.mp3");
    bgMusic.loop = true;
    bgMusic.volume = 0.6;

    const muteBtn = document.getElementById("muteBtn");
    if (muteBtn) {
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

    document.getElementById("startBtnOverlay").addEventListener("click", () => {
        document.getElementById("startBtnOverlay").style.display = "none";
        document.getElementById("gameTitle").style.display = "none";
        startCountdown();
    });

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
    score = 0;
    bflyScore = 0;
    countdownValue = 3;
    countdownRunning = false;
    gameRunning = false;
    HoneySplashes = [];
    if (respawnTimeout) clearTimeout(respawnTimeout);
    respawnTimeout = null;
    if (bflyToggleInterval) clearInterval(bflyToggleInterval);
    bflyToggleInterval = null;

    document.getElementById("score").innerText = "Score: 0";
    document.getElementById("startBtnOverlay").disabled = true;
    document.getElementById("gameTitle").style.display = "none";

    const loadingOverlay = document.getElementById("loadingOverlay");
    loadingOverlay.style.display = "flex";
    loadingOverlay.innerText = "📷 Loading... Starting Camera";

    camera = new Camera(videoElement, {
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
            console.log("🎥 Camera feed detected, starting countdown...");

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
    initButterfly();
    startButterflyToggle();
}


// ============================================
// Initialize Butterfly
// ============================================

function initButterfly() {
    // place butterfly at a safe random position away from edges
    const margin = Math.max(butterfly.r * 2, 60); // ensure not clipped by canvas edges
    butterfly.x = Math.random() * (canvas.width - margin * 2) + margin;
    butterfly.y = Math.random() * (canvas.height - margin * 2) + margin;
    butterfly.baseY = butterfly.y;
    butterfly.visible = true;
    butterfly.respawnTime = null;
}


// ============================================
// Start Butterfly Toggle (Appear/Disappear)
// ============================================

function startButterflyToggle() {
    // clear any previous schedule
    if (bflyToggleInterval) {
        clearTimeout(bflyToggleInterval);
        bflyToggleInterval = null;
    }
    if (respawnTimeout) {
        clearTimeout(respawnTimeout);
        respawnTimeout = null;
    }

    // recursive scheduler using setTimeout so intervals are randomized
    const scheduleNext = () => {
        // next change in 2s..6s (centered around BFLY_TOGGLE_INTERVAL)
        const delay = Math.max(800, BFLY_TOGGLE_INTERVAL / 2 + (Math.random() - 0.5) * BFLY_TOGGLE_INTERVAL);
        bflyToggleInterval = setTimeout(() => {
            if (butterfly.visible) {
                // hide butterfly for a random short duration
                butterfly.visible = false;
                butterfly.respawnTime = Date.now() + delay;
            } else {
                // respawn at a new safe random position (keep away from canvas edges)
                const margin = Math.max(butterfly.r * 2, 60);
                butterfly.x = Math.random() * (canvas.width - margin * 2) + margin;
                butterfly.y = Math.random() * (canvas.height - margin * 2) + margin;
                butterfly.baseY = butterfly.y;
                butterfly.visible = true;
                butterfly.respawnTime = null;
            }
            scheduleNext();
        }, delay);
    };

    // kick off scheduler
    scheduleNext();
}


// ============================================
// Spawn Bee
// ============================================

function spawnBall() {
    if (typeof spawnBall.lastZone === "undefined") spawnBall.lastZone = -1;

    let zone;
    let attempts = 0;
    do {
        zone = Math.floor(Math.random() * 4);
        attempts++;
    } while (zone === spawnBall.lastZone && attempts < 6);

    spawnBall.lastZone = zone;

    const off = 80;
    const margin = 40;

    if (zone === 0) {
        ball.x = -off - Math.random() * 40;
        ball.y = Math.random() * (canvas.height - margin * 2) + margin;
    } else if (zone === 1) {
        ball.x = canvas.width + off + Math.random() * 40;
        ball.y = Math.random() * (canvas.height - margin * 2) + margin;
    } else if (zone === 2) {
        ball.x = Math.random() * (canvas.width - margin * 2) + margin;
        ball.y = -off - Math.random() * 40;
    } else {
        ball.x = Math.random() * (canvas.width - margin * 2) + margin;
        ball.y = canvas.height + off + Math.random() * 40;
    }

    const targetX = canvas.width / 2 + (Math.random() - 0.5) * canvas.width * 0.3;
    const targetY = canvas.height / 2 + (Math.random() - 0.5) * canvas.height * 0.3;
    const angle = Math.atan2(targetY - ball.y, targetX - ball.x);
    const speed = Math.random() * 1.6 + 0.8;
    ball.vx = Math.cos(angle) * speed;
    ball.vy = Math.sin(angle) * speed;

    ballSpawnTime = Date.now();

    startPos = null;
    totalDeviation = 0;
    sampleCount = 0;

    lastX = null;
    lastY = null;
}


// ============================================
// Bee Movement
// ============================================

function updateBallMovement() {
    if (Math.random() < 0.04) {
        let angle = Math.atan2(ball.vy, ball.vx);
        angle += (Math.random() - 0.5) * Math.PI * 0.6;
        let speed = Math.hypot(ball.vx, ball.vy);
        speed += (Math.random() - 0.5) * 0.6;
        speed = Math.max(0.6, Math.min(3.2, speed));
        const targetVx = Math.cos(angle) * speed;
        const targetVy = Math.sin(angle) * speed;
        const blend = 0.25;
        ball.vx += (targetVx - ball.vx) * blend;
        ball.vy += (targetVy - ball.vy) * blend;
    }

    const margin = 50;
    const steerStrength = 0.45;
    if (ball.x < margin) ball.vx += steerStrength;
    if (ball.x > canvas.width - margin) ball.vx -= steerStrength;
    if (ball.y < margin) ball.vy += steerStrength;
    if (ball.y > canvas.height - margin) ball.vy -= steerStrength;

    const maxSpeed = 3;
    let sp = Math.hypot(ball.vx, ball.vy);
    if (sp > maxSpeed) {
        ball.vx = (ball.vx / sp) * maxSpeed;
        ball.vy = (ball.vy / sp) * maxSpeed;
    }

    ball.x += ball.vx;
    ball.y += ball.vy;

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
// Update Butterfly Wiggle
// ============================================

function updateButterflyWiggle() {
    butterfly.wiggle += 0.1;
    butterfly.y = butterfly.baseY + Math.sin(butterfly.wiggle) * 8;
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

    // Update bee movement
    updateBallMovement();

    // Update butterfly wiggle
    updateButterflyWiggle();

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

    // Draw butterfly with glow effect
    if (butterfly.visible) {
        drawButterflyWithGlow(butterfly.x, butterfly.y, butterfly.r);
    }

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
                if (dx > 250) {
                    currentHandType = previousHandType;
                }
            }

            if (currentHandType === "Right" && rhandImg) {
                drawHand(arrowX, arrowY, rhandImg);
            } else {
                drawHand(arrowX, arrowY, LhandImg);
            }

            previousArrowX = arrowX;
            previousHandType = currentHandType;

            if (!startPos) {
                const dx = arrowX - ball.x;
                const dy = arrowY - ball.y;
                const dist = Math.sqrt(dx * dx + dy * dy);

                if (dist > HAND_MOVE_THRESHOLD) {
                    startPos = { x: arrowX, y: arrowY };
                    lastX = arrowX;
                    lastY = arrowY;
                    deviationRatios = [];
                }
            }

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

            handleGameLogic(arrowX, arrowY);

            for (let i = HoneySplashes.length - 1; i >= 0; i--) {
                HoneySplashes[i].update();
                HoneySplashes[i].draw(ctx);
                if (HoneySplashes[i].isFinished()) {
                    HoneySplashes.splice(i, 1);
                }
            }
        }
    }
}


// ============================================
// Draw Butterfly with Glow Effect
// ============================================

function drawButterflyWithGlow(x, y, r) {
    if (!bflyImg || !bflyImg.complete || bflyImg.naturalWidth === 0) return;

    // Draw glow
    ctx.shadowColor = "rgba(229, 208, 146, 0.82)";
    ctx.shadowBlur = 20;

    const size = r * 3;
    ctx.drawImage(bflyImg, x - size / 2, y - size / 2, size, size);

    ctx.shadowColor = "transparent";
    ctx.shadowBlur = 0;
}


// ============================================
// Handle Game Logic
// ============================================

function handleGameLogic(handX, handY) {
    // Check collision with bee
    const dx = handX - ball.x;
    const dy = handY - ball.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < ball.r + 30) {
        score++;
        document.getElementById("score").innerText = "Score: " + score;
        
        if (touchSound) {
            touchSound.currentTime = 0;
            touchSound.play();
        }

        HoneySplashes.push(new HoneySplash(ball.x, ball.y));
        handBounceActive = true;

        const reactionTime = Date.now() - ballSpawnTime;
        reactionTimes.push(reactionTime);

        spawnBall();
    }

    // Check collision with butterfly
    const bflyDx = handX - butterfly.x;
    const bflyDy = handY - butterfly.y;
    const bflyDist = Math.sqrt(bflyDx * bflyDx + bflyDy * bflyDy);

    if (butterfly.visible && bflyDist < butterfly.r + 30) {
        bflyScore++;
        butterfly.visible = false;

        if (touchSound) {
            touchSound.currentTime = 0;
            touchSound.play();
        }

        for (let i = 0; i < 3; i++) {
            HoneySplashes.push(new ButterflySparkles(butterfly.x, butterfly.y));
        }
    }

    // End game when score reaches 20
    if (score >= 20 && gameRunning) {
        endGame();
    }
}

class ButterflySparkles {
    constructor(x, y) {
        this.particles = [];
        for (let i = 0; i < 12; i++) {
            this.particles.push({
                x: x,
                y: y,
                angle: Math.random() * Math.PI * 2,
                speed: Math.random() * 4 + 1,
                size: Math.random() * 4 + 2,
                alpha: 1.0,
            });
        }
    }

    update() {
        this.particles.forEach((p) => {
            p.x += Math.cos(p.angle) * p.speed;
            p.y += Math.sin(p.angle) * p.speed;
            p.alpha -= 0.05;
        });
        this.particles = this.particles.filter((p) => p.alpha > 0);
    }

    draw(ctx) {
        this.particles.forEach((p) => {
            ctx.fillStyle = `rgba(147, 51, 234, ${p.alpha})`;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            ctx.fill();
        });
    }

    isFinished() {
        return this.particles.length === 0;
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
        if (handScale >= 1.55) {
            handBounceActive = false;
        }
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
    if (bflyToggleInterval) clearInterval(bflyToggleInterval);
    bflyToggleInterval = null;

    let elapsed = Math.floor((Date.now() - startTime) / 1000);

    let avgReaction = 0;
    if (reactionTimes.length > 0) {
        avgReaction = (
            reactionTimes.reduce((a, b) => a + b, 0) / reactionTimes.length / 1000
        ).toFixed(2);
    }

    let normDistance = score > 0 ? totalDistance / score : totalDistance;

    console.log("Total Distance:", totalDistance, "Normalized:", normDistance);

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

async function saveGameResult(score, timeTaken, avgReaction, normDistance, movementStability, consistency, bflyTouch) {
    console.log("Saving result...", score, timeTaken, avgReaction, normDistance, movementStability, consistency, bflyTouch);

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
        console.error("No user logged in:", userError);
        return;
    }

    console.log("User found:", user);

    const { error: insertError } = await supabase
        .from("buzztap_results")
        .insert([{
            player_email: user.email,
            score: score,
            time_taken: timeTaken,
            avg_reaction_time: avgReaction,
            norm_totaldistance: normDistance,
            av_devpath: parseFloat(movementStability),
            consistency: consistency,
            bfly_touch: bflyTouch,
            level: "ADVANCED",
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
    ctx.font = "bold 65px poppins";
    ctx.textAlign = "center";
    ctx.fillText("🎉 Congratulations! 🎉", canvas.width / 2, canvas.height / 2 - 120);
    
    ctx.font = "40px poppins";
    ctx.fillText("You’ve finished your practice.", canvas.width / 2, canvas.height / 2 - 60);
    
    ctx.font = "35px poppins";
    ctx.fillText(`Your Score: ${score}`, canvas.width / 2, canvas.height / 2 );
    ctx.fillText(`Your Time: ${elapsed}s`, canvas.width / 2, canvas.height / 2 + 50);

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

        if (times.length < 5) {
            console.log("Not enough games for consistency");
            return 0;
        }

        let mean = times.reduce((a, b) => a + b, 0) / times.length;
        let variance = times.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / times.length;
        let std = Math.sqrt(variance);

        let consistency = 1 - (std / mean);
        return Math.max(0, Math.min(1, consistency)).toFixed(3);
    }

    calculateConsistency(elapsed).then(consistency => {
        saveGameResult(score, elapsed, avgReaction, normDistance, movementStability, consistency, bflyScore);
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

// --- End of gamebuzz_adv.js ---


