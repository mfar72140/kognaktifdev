// ============================================
// GLOBAL VARIABLES
// ============================================

let videoElement, hands, camera;
let ctx, canvas;
let beeImg, LhandImg, rhandImg, bgImg, redBeeImg;
let ball = { x: 0, y: 0, r: 30, vx: 0, vy: 0 };
let redBee = { x: -200, y: -200, r: 30, vx: 0, vy: 0, active: false };
let score = 0;
let bflyTouch = 0; // red bee touch counter
let gameRunning = false;
let countdownRunning = false;
let touchSound, endGameSound, countdownSound, touchRedSound;
let HoneySplashes = [];
let RedSplashes = [];
let bgMusic;
let isMuted = false;
let reactionTimes = [];
let ballSpawnTime = null;
let cameraReady = false;
let previousArrowX = null;
let previousHandType = "Left";

// Red bee timing
let redBeeTimer = 0;
let redBeeState = "hidden"; // hidden, visible
let redBeeVisibleStart = 0;
let redBeeHiddenStart = 0;

// Path Deviation using Distance
let startPos = null;
let deviationRatios = [];
let pathDeviations = [];
let handVelocities = [];

// Distance Tracking
let totalDistance = 0;
let lastX = null, lastY = null;

// Hand bounce
let handScale = 1;
let handBounceActive = false;
let handBounceTimer = 0;

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

// Delta time tracking
let lastFrameTime = performance.now();
let deltaTime = 0;


// ============================================
// WINDOW ONLOAD - INIT
// ============================================

window.onload = () => {
    canvas = document.getElementById("output_canvas");
    ctx = canvas.getContext("2d");

    // Load images
    beeImg = new Image();
    beeImg.src = "images/bee2.png";

    redBeeImg = new Image();
    redBeeImg.src = "images/bee3.png";

    LhandImg = new Image();
    LhandImg.src = "images/Lhand.png";

    rhandImg = new Image();
    rhandImg.src = "images/rhand.png";

    bgImg = new Image();
    bgImg.src = "images/backgr1.jpg";

    // Load sound
    touchSound = new Audio("sounds/touch.wav");
    touchRedSound = new Audio("sounds/touch2.mp3");
    endGameSound = new Audio("sounds/endapplause.wav");
    countdownSound = new Audio("sounds/countdown.wav");

    // Background Music
    bgMusic = new Audio("sounds/01Backmusic20s.mp3");
    bgMusic.loop = true;
    bgMusic.volume = 0.6;

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
    bflyTouch = 0;
    countdownValue = 3;
    countdownRunning = false;
    gameRunning = false;
    HoneySplashes = [];
    RedSplashes = [];
    redBeeState = "hidden";
    redBeeTimer = 0;
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
    redBeeState = "hidden";
    redBeeTimer = 0;
    redBeeHiddenStart = Date.now();
    lastFrameTime = performance.now();

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
// Spawn Yellow Bee
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
    const speed = Math.random() * 80 + 40; // pixels per second
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
// Spawn Red Bee (Distraction)
// ============================================
function spawnRedBee() {
    const margin = 60;
    redBee.x = Math.random() * (canvas.width - margin * 2) + margin;
    redBee.y = Math.random() * (canvas.height - margin * 2) + margin;
    
    // Slower random movement (pixels per second)
    const angle = Math.random() * Math.PI * 2;
    const speed = Math.random() * 20 + 25; // slower speed in px/s
    redBee.vx = Math.cos(angle) * speed;
    redBee.vy = Math.sin(angle) * speed;
    
    redBee.active = true;
}


// ============================================
// Update Red Bee Movement (Delta Time Based)
// ============================================
function updateRedBeeMovement(dt) {
    if (!redBee.active) return;

    // Slow wandering
    if (Math.random() < 0.03) {
        let angle = Math.atan2(redBee.vy, redBee.vx);
        angle += (Math.random() - 0.5) * Math.PI * 0.4;
        let speed = Math.hypot(redBee.vx, redBee.vy);
        speed += (Math.random() - 0.5) * 15;
        speed = Math.max(10, Math.min(40, speed)); // slower max speed (px/s)
        const targetVx = Math.cos(angle) * speed;
        const targetVy = Math.sin(angle) * speed;
        const blend = 0.2;
        redBee.vx += (targetVx - redBee.vx) * blend;
        redBee.vy += (targetVy - redBee.vy) * blend;
    }

    // Edge avoidance
    const margin = 50;
    const steerStrength = 15; // acceleration in px/s²
    if (redBee.x < margin) redBee.vx += steerStrength * dt * 60;
    if (redBee.x > canvas.width - margin) redBee.vx -= steerStrength * dt * 60;
    if (redBee.y < margin) redBee.vy += steerStrength * dt * 60;
    if (redBee.y > canvas.height - margin) redBee.vy -= steerStrength * dt * 60;

    const maxSpeed = 40; // px/s
    let sp = Math.hypot(redBee.vx, redBee.vy);
    if (sp > maxSpeed) {
        redBee.vx = (redBee.vx / sp) * maxSpeed;
        redBee.vy = (redBee.vy / sp) * maxSpeed;
    }

    redBee.x += redBee.vx * dt;
    redBee.y += redBee.vy * dt;

    // Boundary bounce
    if (redBee.x < redBee.r) {
        redBee.x = redBee.r;
        redBee.vx = Math.abs(redBee.vx) * 0.7;
    }
    if (redBee.x > canvas.width - redBee.r) {
        redBee.x = canvas.width - redBee.r;
        redBee.vx = -Math.abs(redBee.vx) * 0.7;
    }
    if (redBee.y < redBee.r) {
        redBee.y = redBee.r;
        redBee.vy = Math.abs(redBee.vy) * 0.7;
    }
    if (redBee.y > canvas.height - redBee.r) {
        redBee.y = canvas.height - redBee.r;
        redBee.vy = -Math.abs(redBee.vy) * 0.7;
    }
}


// ============================================
// Red Bee State Manager (3s cycle)
// ============================================
function updateRedBeeState() {
    if (!gameRunning) return;

    const now = Date.now();

    if (redBeeState === "hidden") {
        if (now - redBeeHiddenStart >= 3000) {
            redBeeState = "visible";
            redBeeVisibleStart = now;
            spawnRedBee();
        }
    } else if (redBeeState === "visible") {
        if (now - redBeeVisibleStart >= 4000) {
            redBeeState = "hidden";
            redBeeHiddenStart = now;
            redBee.active = false;
            redBee.x = -200;
            redBee.y = -200;
        }
    }
}


// ============================================
// Yellow Bee Movement (Delta Time Based)
// ============================================
function updateBallMovement(dt) {
    if (Math.random() < 0.04) {
        let angle = Math.atan2(ball.vy, ball.vx);
        angle += (Math.random() - 0.5) * Math.PI * 0.6;
        let speed = Math.hypot(ball.vx, ball.vy);
        speed += (Math.random() - 0.5) * 30;
        speed = Math.max(30, Math.min(160, speed)); // pixels per second
        const targetVx = Math.cos(angle) * speed;
        const targetVy = Math.sin(angle) * speed;
        const blend = 0.25;
        ball.vx += (targetVx - ball.vx) * blend;
        ball.vy += (targetVy - ball.vy) * blend;
    }

    const margin = 50;
    const steerStrength = 22.5; // acceleration in px/s²
    if (ball.x < margin) ball.vx += steerStrength * dt * 60;
    if (ball.x > canvas.width - margin) ball.vx -= steerStrength * dt * 60;
    if (ball.y < margin) ball.vy += steerStrength * dt * 60;
    if (ball.y > canvas.height - margin) ball.vy -= steerStrength * dt * 60;

    const maxSpeed = 150; // px/s
    let sp = Math.hypot(ball.vx, ball.vy);
    if (sp > maxSpeed) {
        ball.vx = (ball.vx / sp) * maxSpeed;
        ball.vy = (ball.vy / sp) * maxSpeed;
    }

    ball.x += ball.vx * dt;
    ball.y += ball.vy * dt;

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

function gameLoop(currentTime) {
    // Calculate delta time in seconds
    deltaTime = (currentTime - lastFrameTime) / 1000;
    lastFrameTime = currentTime;

    // Cap delta time to prevent huge jumps
    if (deltaTime > 0.1) {
        deltaTime = 0.1;
    }

    if (countdownRunning) {
        drawCountdown(countdownValue);
    } 
    else if (gameRunning && latestResults) {
        updateRedBeeState();
        drawScene(latestResults, deltaTime);
    }
    requestAnimationFrame(gameLoop);
}


// ============================================
// Draw Hand (Delta Time Based)
// ============================================

function drawHand(x, y, img, dt) {
    if (!img || !img.complete || img.naturalWidth === 0) return;

    const baseSize = 90;
    const size = baseSize * handScale;

    ctx.drawImage(img, x - size / 2, y - size / 2, size, size);

    if (handBounceActive) {
        handBounceTimer += dt;
        const bounceSpeed = 15; // scale units per second
        handScale += (1.6 - handScale) * bounceSpeed * dt;
        
        if (handScale >= 1.55 || handBounceTimer >= 0.15) {
            handBounceActive = false;
            handBounceTimer = 0;
        }
    } else {
        const returnSpeed = 5; // scale units per second
        handScale += (1 - handScale) * returnSpeed * dt;
    }
}


// ============================================
// Handle Game Logic
// ============================================

function handleGameLogic(arrowX, arrowY) {
    // Yellow bee collision
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
        handBounceTimer = 0;

        if (touchSound) {
            touchSound.currentTime = 0;
            touchSound.play();
        }

        HoneySplashes.push(new HoneySplash(ball.x, ball.y));

        startPos = null;
        deviationRatios = [];
        lastX = null;
        lastY = null;

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

    // Red bee collision
    if (redBee.active) {
        const rdx = arrowX - redBee.x;
        const rdy = arrowY - redBee.y;
        if (Math.sqrt(rdx * rdx + rdy * rdy) < redBee.r + 10) {
            bflyTouch++;
            console.log("Red bee touched! Count:", bflyTouch);

            // Deduct 1 score
            score = Math.max(0, score - 1);
            document.getElementById("score").innerText = "Score: " + score;

            handBounceActive = true;
            handBounceTimer = 0;

            if (touchRedSound) {
                touchRedSound.currentTime = 0;
                touchRedSound.play();
            }

            RedSplashes.push(new RedSplash(redBee.x, redBee.y));

            // Hide red bee and restart cycle
            redBee.active = false;
            redBee.x = -200;
            redBee.y = -200;
            redBeeState = "hidden";
            redBeeHiddenStart = Date.now();
        }
    }
}


// ============================================
// Draw Scene
// ============================================

function drawScene(results, dt) {
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bgImg, 0, 0, canvas.width, canvas.height);

    updateBallMovement(dt);
    updateRedBeeMovement(dt);

    flap += flapDirection * 0.8;
    if (flap > 10 || flap < -10) flapDirection *= -1;

    // Draw yellow bee
    ctx.drawImage(
        beeImg,
        ball.x - ball.r,
        ball.y - ball.r + flap,
        ball.r * 2,
        ball.r * 2
    );

    // Draw red bee if active
    if (redBee.active) {
        ctx.drawImage(
            redBeeImg,
            redBee.x - redBee.r,
            redBee.y - redBee.r + flap,
            redBee.r * 2,
            redBee.r * 2
        );
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
                if (dx > 250) currentHandType = previousHandType;
            }

            if (currentHandType === "Right" && rhandImg) {
                drawHand(arrowX, arrowY, rhandImg, dt);
            } else {
                drawHand(arrowX, arrowY, LhandImg, dt);
            }

            previousArrowX = arrowX;
            previousHandType = currentHandType;

            if (!startPos) {
                const dx = arrowX - ball.x;
                const dy = arrowY - ball.y;
                const dist = Math.sqrt(dx*dx + dy*dy);
                if (dist > HAND_MOVE_THRESHOLD) {
                    startPos = { x: arrowX, y: arrowY };
                    lastX = arrowX;
                    lastY = arrowY;
                    deviationRatios = [];
                }
            }

            if (lastX !== null && lastY !== null) {
                const dx = arrowX - lastX;
                const dy = arrowY - lastY;
                const moveDist = Math.sqrt(dx*dx + dy*dy);

                handVelocities.push(moveDist);

                if (moveDist > HAND_MOVE_THRESHOLD) {
                    totalDistance += moveDist;
                }
            }
            lastX = arrowX;
            lastY = arrowY;

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

            // Honey splashes (yellow) - delta time based
            for (let i = HoneySplashes.length - 1; i >= 0; i--) {
                HoneySplashes[i].update(dt);
                HoneySplashes[i].draw(ctx);
                if (HoneySplashes[i].isFinished()) HoneySplashes.splice(i, 1);
            }

            // Red splashes - delta time based
            for (let i = RedSplashes.length - 1; i >= 0; i--) {
                RedSplashes[i].update(dt);
                RedSplashes[i].draw(ctx);
                if (RedSplashes[i].isFinished()) RedSplashes.splice(i, 1);
            }
        }
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
        avgReaction = (reactionTimes.reduce((a,b)=>a+b,0)/reactionTimes.length/1000).toFixed(2);
    }

    let normDistance = score > 0 ? totalDistance / score : totalDistance;

    console.log("Total Distance:", totalDistance, "Normalized:", normDistance);

    let pathStability = 0;
    if (pathDeviations.length > 0) {
        const avgDev = pathDeviations.reduce((a,b)=>a+b,0)/pathDeviations.length;
        pathStability = Math.max(0, 100 - avgDev);
    }

    let velStability = 0;
    if (handVelocities.length > 5) {
        const diffs = [];
        for (let i=1;i<handVelocities.length;i++) {
            diffs.push(Math.abs(handVelocities[i]-handVelocities[i-1]));
        }
        const avgJitter = diffs.reduce((a,b)=>a+b,0)/diffs.length;
        velStability = Math.max(0, 100 - avgJitter);
    }

    const movementStability = ((pathStability*0.7 + velStability*0.3)).toFixed(2);
    console.log("Movement Stability (%):", movementStability);
    console.log("Red Bee Touches (bfly_touch):", bflyTouch);

    if (bgMusic) { bgMusic.pause(); bgMusic.currentTime = 0; }
    if (endGameSound) { endGameSound.currentTime = 0; endGameSound.play(); }

    startFireworks();
    const fireworksDuration = 2500;
    const startTimeFireworks = Date.now();

    function fireworksAnimation() {
        if (!fireworksRunning) return;
        ctx.clearRect(0,0,canvas.width,canvas.height);
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

async function saveGameResult(score, timeTaken, avgReaction, normDistance, movementStability, consistency, totalDistance, bflyTouch) {
    console.log("Saving result...", score, timeTaken, avgReaction, normDistance, movementStability, consistency, totalDistance, bflyTouch);

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
            level: "ADVANCED",
            totaldistance: parseFloat(totalDistance),
            bfly_touch: bflyTouch
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
    ctx.fillText("You've finished your practice.", canvas.width / 2, canvas.height / 2 - 60);
    
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
            .eq("level", "ADVANCED")
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
        saveGameResult(score, elapsed, avgReaction, normDistance, movementStability, consistency, totalDistance, bflyTouch);
    
        reactionTimes = [];
        totalDistance = 0;
        lastX = null;
        lastY = null;
    });

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
// HONEY SPLASH EFFECT (Yellow) - Delta Time Based
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
                speed: Math.random() * 150 + 100, // pixels per second
                size: Math.random() * 8 + 6,
                alpha: 1.0,
            });
        }
    }

    update(dt) {
        const fadeSpeed = 2.5; // alpha units per second
        this.particles.forEach((p) => {
            p.x += Math.cos(p.angle) * p.speed * dt;
            p.y += Math.sin(p.angle) * p.speed * dt;
            p.alpha -= fadeSpeed * dt;
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


// ============================================
// RED SPLASH EFFECT (Red Bee) - Delta Time Based
// ============================================

class RedSplash {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.particles = [];
        for (let i = 0; i < 8; i++) {
            this.particles.push({
                x: x,
                y: y,
                angle: Math.random() * Math.PI * 2,
                speed: Math.random() * 150 + 100, // pixels per second
                size: Math.random() * 8 + 6,
                alpha: 1.0,
            });
        }
    }

    update(dt) {
        const fadeSpeed = 2.5; // alpha units per second
        this.particles.forEach((p) => {
            p.x += Math.cos(p.angle) * p.speed * dt;
            p.y += Math.sin(p.angle) * p.speed * dt;
            p.alpha -= fadeSpeed * dt;
        });
        this.particles = this.particles.filter((p) => p.alpha > 0);
    }

    draw(ctx) {
        this.particles.forEach((p) => {
            ctx.fillStyle = `rgba(255, 50, 50, ${p.alpha})`; // Red color
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