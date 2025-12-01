import { supabase } from './supabaseClient.js';
import { initGameChart, initConsistencyGauge } from './gamechart.js';

let currentMainChart = null;
let currentGauge = null;

// Cached results per level for tab switching
const buzzCache = {};   // { [level]: dataArray }
const shapeCache = {};  // { [level]: dataArray }

/* -----------------------------
       SHOW / HIDE SPECIFIC TABS
------------------------------*/
function showBuzzTapUI() {
    document.getElementById("tabDistance").style.display = "inline-block";
    document.getElementById("tabStability").style.display = "inline-block";
    document.getElementById("gaugeSection").style.display = "block";

    document.getElementById("tabPrecision").style.display = "none";
}

function showShapeSenseUI() {
    document.getElementById("tabDistance").style.display = "inline-block";
    document.getElementById("tabStability").style.display = "none";
    document.getElementById("gaugeSection").style.display = "block";

    document.getElementById("tabPrecision").style.display = "inline-block";
}

/* -----------------------------
          INITIALIZER
------------------------------*/
export async function loadAnalytics() {

    // Set default values BEFORE attaching event listeners
    document.getElementById("gameSelect").value = "buzz";
    document.getElementById("levelSelect").value = "BEGINNER";

    // Listen to both game and level changes
    document.getElementById("gameSelect").addEventListener("change", updateGameAnalytics);
    const levelEl = document.getElementById("levelSelect");
    if (levelEl) levelEl.addEventListener("change", updateGameAnalytics);

    // Tab click events
    document.querySelectorAll(".tab-btn").forEach(btn => {
       btn.addEventListener("click", () => {
           activateTab(btn);
           switchTab(btn.dataset.chart);
       });
    });

    // Run initial analytics load with default values
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
    const gameSelect = document.getElementById("gameSelect");
    const levelSelect = document.getElementById("levelSelect");

    // Reset default level when switching games
    if (gameSelect.dataset.lastGame !== gameSelect.value) {
       levelSelect.value = "BEGINNER";  // default level for any game
       gameSelect.dataset.lastGame = gameSelect.value; // store last selected game
    }

    const game = gameSelect.value;
    const level = getSelectedLevel();

    // Always destroy chart/gauge so new dataset/labels apply for different level
    if (currentMainChart) {
       currentMainChart.destroy();
       currentMainChart = null;
    }
    if (currentGauge) {
       currentGauge.destroy?.();
       currentGauge = null;
    }

    document.getElementById("gameTitle").textContent =
       game === "buzz" ? "Buzz Tap!" : "Shape Sense";

    // Clear no-data message and cards by default
    clearStatsCards();

    if (game === "buzz") {
       showBuzzTapUI();
       await loadBuzzTap(level);
    } else {
       showShapeSenseUI();
       await loadShapeSense(level);
    }
}


/* ==========================================================
                      BUZZ TAP ANALYTICS
==========================================================*/
async function loadBuzzTap(level) {
    const userEmail = (await supabase.auth.getUser()).data.user?.email;
    if (!userEmail) {
          showNoData();
          return;
    }

    // Use cache per level
    if (!buzzCache[level]) {
          const { data } = await supabase
                .from("buzztap_results")
                .select("norm_totaldistance, time_taken, av_devpath, created_at, score, consistency, level")
                .eq("player_email", userEmail)
                .eq("level", level) // assumes a "level" column exists
                .order("created_at", { ascending: true });

          buzzCache[level] = data ?? [];
    }

    const data = buzzCache[level];

    if (!data || data.length === 0) {
          // Leave UI empty as requested
          showNoData();
          return;
    }

    const last = data[data.length - 1];

    document.getElementById("lastScore").textContent = last.score ?? "";
    document.getElementById("lastDate").textContent =
          last.created_at ? new Date(last.created_at).toLocaleDateString("en-GB") : "";
    document.getElementById("totalGames").textContent = data.length;

    const best = Math.min(...data.map(r => r.time_taken ?? Infinity));
    document.getElementById("bestTime").textContent = isFinite(best) ? best.toFixed(2) + "s" : "";

    // Gauge
    const consistencyPercent = (last.consistency ?? 0) * 100;
    currentGauge = initConsistencyGauge(consistencyPercent);

    // Draw default main chart → time (also ensure the corresponding tab is activated)
    await drawBuzzChart("time", level);
}

/* Draw chart depending on selected tab */
async function drawBuzzChart(type, level) {
    const data = buzzCache[level];
    if (!data || data.length === 0) return;

    const labels = data.map((r, i) => {
          const date = r.created_at ? new Date(r.created_at).toLocaleDateString("en-GB") : "";
          return `G${i + 1} (${date})`;
    });

    const times = data.map(r => r.time_taken ?? null);
    const distances = data.map(r => r.norm_totaldistance ?? null);
    const stability = data.map(r => r.av_devpath ?? null);

    await waitForCanvas("#mainChart");

    // Ensure the UI's active tab matches the chart type being displayed
    const tabBtn = document.querySelector(`.tab-btn[data-chart="${type}"]`);
    if (tabBtn) activateTab(tabBtn);

    if (!currentMainChart) {
          // initGameChart signature: (labels, times, distances, stability)
          currentMainChart = initGameChart(labels, times, distances, stability);
    } else {
          if (type === "distance") {
                currentMainChart.data.datasets[0].label = "Average Distance per Game (px)";
                currentMainChart.data.datasets[0].data = distances;
                currentMainChart.data.datasets[0].borderColor = "blue";
          } else if (type === "stability") {
                currentMainChart.data.datasets[0].label = "Movement Stability per Game (%)";
                currentMainChart.data.datasets[0].data = stability;
                currentMainChart.data.datasets[0].borderColor = "orange";
          } else {
                currentMainChart.data.datasets[0].label = "Time Taken per Game (s)";
                currentMainChart.data.datasets[0].data = times;
                currentMainChart.data.datasets[0].borderColor = "green";
          }
          currentMainChart.update();
    }
}

/* =============================================
             SHAPE SENSE ANALYTICS
================================================*/
async function loadShapeSense(level) {
        const userEmail = (await supabase.auth.getUser()).data.user?.email;
        if (!userEmail) {
                    showNoData();
                    return;
        }

        if (!shapeCache[level]) {
                    const { data } = await supabase
                                    .from("shapesense_results")
                                    .select("score, time_taken, precision, av_distance, consistency, created_at, level")
                                    .eq("player_email", userEmail)
                                    .eq("level", level)
                                    .order("created_at", { ascending: true });

                    shapeCache[level] = data ?? [];
        }

        const data = shapeCache[level];

        if (!data || data.length === 0) {
                    showNoData();
                    return;
        }

        const last = data[data.length - 1];

        document.getElementById("lastScore").textContent = last.score ?? "";
        document.getElementById("lastDate").textContent =
                    last.created_at ? new Date(last.created_at).toLocaleDateString("en-GB") : "";
        document.getElementById("totalGames").textContent = data.length;

        const best = Math.min(...data.map(r => r.time_taken ?? Infinity));
        document.getElementById("bestTime").textContent = isFinite(best) ? best.toFixed(2) + "s" : "";

        // Gauge for consistency
        const consistencyPercent = (last.consistency ?? 0);
        currentGauge = initConsistencyGauge(consistencyPercent);

        // Ensure the default tab for shape sense is "time" (reset active tab on level change)
        const timeTabBtn = document.querySelector('.tab-btn[data-chart="time"]');
        if (timeTabBtn) activateTab(timeTabBtn);

        // Ensure the default tab for shape sense is "time"
        await drawShapeChart("time", level);
}

async function drawShapeChart(type, level) {
        const data = shapeCache[level];
        if (!data || data.length === 0) return;

        const labels = data.map((r, i) => {
                    const date = r.created_at ? new Date(r.created_at).toLocaleDateString("en-GB") : "";
                    return `G${i + 1} (${date})`;
        });

        const times = data.map(r => r.time_taken ?? null);
        const precision = data.map(r => r.precision ?? null);
        const distances = data.map(r => r.av_distance ?? null);

        await waitForCanvas("#mainChart");

        // Ensure the UI's active tab matches the chart type being displayed
        const tabBtn = document.querySelector(`.tab-btn[data-chart="${type}"]`);
        if (tabBtn) activateTab(tabBtn);

        if (!currentMainChart) {
                    // initGameChart for shape: we pass labels and primary data (times)
                    currentMainChart = initGameChart(labels, times);

                    // make sure initial dataset reflects the requested type
                    if (type === "precision") {
                                    currentMainChart.data.datasets[0].label = "Pinch Accuracy per Game (%)";
                                    currentMainChart.data.datasets[0].data = precision;
                                    currentMainChart.data.datasets[0].borderColor = "purple";
                    } else if (type === "distance") {
                                    currentMainChart.data.datasets[0].label = "Average Distance per Game (px)";
                                    currentMainChart.data.datasets[0].data = distances;
                                    currentMainChart.data.datasets[0].borderColor = "blue";
                    } else {
                                    currentMainChart.data.datasets[0].label = "Time Taken per Game (s)";
                                    currentMainChart.data.datasets[0].data = times;
                                    currentMainChart.data.datasets[0].borderColor = "green";
                    }
                    currentMainChart.update();
        } else {
                    if (type === "precision") {
                                    currentMainChart.data.datasets[0].label = "Pinch Accuracy per Game (%)";
                                    currentMainChart.data.datasets[0].data = precision;
                                    currentMainChart.data.datasets[0].borderColor = "purple";
                    } else if (type === "distance") {
                                    currentMainChart.data.datasets[0].label = "Average Distance per Game (px)";
                                    currentMainChart.data.datasets[0].data = distances;
                                    currentMainChart.data.datasets[0].borderColor = "blue";
                    } else {
                                    currentMainChart.data.datasets[0].label = "Time Taken per Game (s)";
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
    const level = getSelectedLevel();

    if (game === "buzz") {
          drawBuzzChart(type, level);
    } else {
          drawShapeChart(type, level);
    }
}

/* ==========================================================
               UTILITIES
==========================================================*/

function getSelectedLevel() {
       const el = document.getElementById("levelSelect");
       if (!el) return "BEGINNER";
       return (el.value || "").toUpperCase();
}

function clearStatsCards() {
       document.getElementById("lastScore").textContent = "";
       document.getElementById("lastDate").textContent = "";
       document.getElementById("totalGames").textContent = "";
       document.getElementById("bestTime").textContent = "";
       // hide no-data message area if present
       const nd = document.getElementById("noDataMessage");
       if (nd) nd.style.display = "none";
       // keep tabs visible as appropriate will be set by showBuzzTapUI/showShapeSenseUI
       // destroy existing chart/gauge handled by caller
}

function showNoData() {
      // Leave UI empty (no text in cards, no chart)
      clearStatsCards();
      
      // Show no data message
      const nd = document.getElementById("noDataMessage");
      if (nd) {
         nd.textContent = "No data available yet. Please play first!";
         nd.style.display = "block";
      }
      
      if (currentMainChart) {
             currentMainChart.destroy();
             currentMainChart = null;
      }
      
      // Show empty gauge (0%) for both games when no data
      const game = document.getElementById("gameSelect").value;
      const gaugeSection = document.getElementById("gaugeSection");
      
      if (gaugeSection) gaugeSection.style.display = "block";
      
      if (currentGauge) {
             currentGauge.destroy?.();
      }
      
      currentGauge = initConsistencyGauge(0);
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