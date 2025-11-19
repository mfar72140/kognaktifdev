import { supabase } from './supabaseClient.js';
import { initGameChart, initConsistencyGauge } from './gamechart.js';

let currentMainChart = null;
let currentGauge = null;

// Cached results for tab switching
let buzzCache = null;
let shapeCache = null;

/* -----------------------------
     SHOW / HIDE SPECIFIC TABS
------------------------------*/
function showBuzzTapUI() {
    document.getElementById("tabDistance").style.display = "inline-block";
    document.getElementById("tabStability").style.display = "inline-block";
    document.getElementById("gaugeSection").style.display = "block";

    document.getElementById("tabAttempts").style.display = "none";
}

function showShapeSenseUI() {
    document.getElementById("tabDistance").style.display = "none";
    document.getElementById("tabStability").style.display = "none";
    document.getElementById("gaugeSection").style.display = "none";

    document.getElementById("tabAttempts").style.display = "inline-block";
}

/* -----------------------------
        INITIALIZER
------------------------------*/
export async function loadAnalytics() {
    document.getElementById("gameSelect").addEventListener("change", updateGameAnalytics);

    // Tab click events
    document.querySelectorAll(".tab-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            activateTab(btn);
            switchTab(btn.dataset.chart);
        });
    });

    updateGameAnalytics();
}

/* -----------------------------
       SET ACTIVE TAB STYLE
------------------------------*/
function activateTab(activeBtn) {
    document.querySelectorAll(".tab-btn").forEach(btn => btn.classList.remove("active"));
    activeBtn.classList.add("active");
}

/* -----------------------------
       MAIN HANDLER
------------------------------*/
async function updateGameAnalytics() {
    const game = document.getElementById("gameSelect").value;

    if (currentMainChart) {
        currentMainChart.destroy();
        currentMainChart = null;
    }

    document.getElementById("gameTitle").textContent =
        game === "buzz" ? "Buzz Tap!" : "Shape Sense";

    document.getElementById("noDataMessage").style.display = "none";

    if (game === "buzz") {
        showBuzzTapUI();
        await loadBuzzTap();
    } else {
        showShapeSenseUI();
        await loadShapeSense();
    }
}

/* ==========================================================
                BUZZ TAP ANALYTICS
==========================================================*/
async function loadBuzzTap() {
    const userEmail = (await supabase.auth.getUser()).data.user?.email;

    const { data } = await supabase
        .from("buzztap_results")
        .select("norm_totaldistance, time_taken, av_devpath, created_at, score, consistency")
        .eq("player_email", userEmail)
        .order("created_at", { ascending: true });

    if (!data || data.length === 0) {
        showNoData("No data yet.");
        return;
    }

    buzzCache = data;

    const last = data[data.length - 1];

    document.getElementById("lastScore").textContent = last.score;
    document.getElementById("lastDate").textContent =
        new Date(last.created_at).toLocaleDateString("en-GB");
    document.getElementById("totalGames").textContent = data.length;

    const best = Math.min(...data.map(r => r.time_taken));
    document.getElementById("bestTime").textContent = best.toFixed(2) + "s";

    // Gauge
    const consistencyPercent = (last.consistency ?? 0) * 100;
    if (currentGauge) currentGauge.destroy?.();
    currentGauge = initConsistencyGauge(consistencyPercent);

    // Draw default main chart → time
    await drawBuzzChart("time");
}

/* Draw chart depending on selected tab */
async function drawBuzzChart(type) {
    if (!buzzCache) return;

    const data = buzzCache;
    const labels = data.map((r, i) => {
    const date = new Date(r.created_at).toLocaleDateString("en-GB");
    return `G${i + 1} (${date})`;
    });

    const times = data.map(r => r.time_taken);
    const distances = data.map(r => r.norm_totaldistance);
    const stability = data.map(r => r.av_devpath);

    await waitForCanvas("#mainChart");

    if (!currentMainChart) {
        currentMainChart = initGameChart(labels, times, distances, stability);
    } else {
        // Update existing chart
        if (type === "distance") {
            currentMainChart.data.datasets[0].label = "Norm Distance";
            currentMainChart.data.datasets[0].data = distances;
            currentMainChart.data.datasets[0].borderColor = "blue";
        } else if (type === "stability") {
            currentMainChart.data.datasets[0].label = "Movement Stability (%)";
            currentMainChart.data.datasets[0].data = stability;
            currentMainChart.data.datasets[0].borderColor = "orange";
        } else {
            currentMainChart.data.datasets[0].label = "Time Taken (s)";
            currentMainChart.data.datasets[0].data = times;
            currentMainChart.data.datasets[0].borderColor = "green";
        }
        currentMainChart.update();
    }
}

/* ==========================================================
                SHAPE SENSE ANALYTICS
==========================================================*/
async function loadShapeSense() {
    const userEmail = (await supabase.auth.getUser()).data.user?.email;

    const { data } = await supabase
        .from("shapesense_results")
        .select("score, time_taken, attempts, created_at")
        .eq("player_email", userEmail)
        .order("created_at", { ascending: true });

    if (!data || data.length === 0) {
        showNoData("No data yet.");
        return;
    }

    shapeCache = data;

    const last = data[data.length - 1];

    document.getElementById("lastScore").textContent = last.score;
    document.getElementById("lastDate").textContent =
        new Date(last.created_at).toLocaleDateString("en-GB");
    document.getElementById("totalGames").textContent = data.length;

    const best = Math.min(...data.map(r => r.time_taken));
    document.getElementById("bestTime").textContent = best.toFixed(2) + "s";

    await drawShapeChart("time");
}

async function drawShapeChart(type) {
    if (!shapeCache) return;

    const data = shapeCache;
    const labels = data.map((r, i) => {
    const date = new Date(r.created_at).toLocaleDateString("en-GB");
    return `G${i + 1} (${date})`;
    });

    const times = data.map(r => r.time_taken);
    const attempts = data.map(r => r.attempts);

    await waitForCanvas("#mainChart");

    if (!currentMainChart) {
        currentMainChart = initGameChart(labels, times);
    } else {
        if (type === "attempts") {
            currentMainChart.data.datasets[0].label = "Attempts";
            currentMainChart.data.datasets[0].data = attempts;
            currentMainChart.data.datasets[0].borderColor = "purple";
        } else {
            currentMainChart.data.datasets[0].label = "Time Taken (s)";
            currentMainChart.data.datasets[0].data = times;
            currentMainChart.data.datasets[0].borderColor = "green";
        }
        currentMainChart.update();
    }
}

/* ==========================================================
        TAB SWITCHING HANDLER
==========================================================*/
function switchTab(type) {
    const game = document.getElementById("gameSelect").value;

    if (game === "buzz") {
        drawBuzzChart(type);
    } else {
        drawShapeChart(type);
    }
}

/* ==========================================================
        UTILITIES
==========================================================*/
function showNoData(msg) {
    const el = document.getElementById("noDataMessage");
    el.textContent = msg;
    el.style.display = "block";
}

function waitForCanvas(selector) {
    return new Promise(resolve => {
        let attempts = 0;
        function check() {
            const el = document.querySelector(selector);
            if (el && el.offsetWidth > 0 && el.offsetHeight > 0) {
                return resolve();
            }
            attempts++;
            if (attempts < 20) requestAnimationFrame(check);
            else resolve();
        }
        check();
    });
}
