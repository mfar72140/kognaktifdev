import { supabase } from '/js/supabaseClient.js';
import { initGameChart, initConsistencyGauge } from '/dashboard/gamechart.js';

let currentMainChart = null;
let currentGauge = null;

// Cached results per level for tab switching
const buzzCache = {};   // { [level]: dataArray }
const shapeCache = {};  // { [level]: dataArray }
const orbCache = {};    // { [level]: dataArray }
const roadCache = {};   // { [level]: dataArray }
const fruitCache = {};  // { [level]: dataArray }

/* Improvement message mapping */
function getImprovementMessage(improvement) {
    if (improvement === null) return "";
    
    const imp = Math.abs(improvement);
    if (improvement >= 20) return "🌟 Amazing boost!";
    if (improvement >= 10) return "🚀 Great upgrade!";
    if (improvement >= 1) return "👍 Nice progress!";
    if (improvement >= -1 && improvement < 1) return "😎 Holding steady!";
    if (improvement >= -9) return "🤏 Just a small dip";
    if (improvement >= -19) return "⚠ Let's refocus";
    return "💡 Time for comeback!";
}

/* -----------------------------
    SHOW / HIDE SPECIFIC TABS
------------------------------*/
function showBuzzTapUI() {
    document.getElementById("tabDistance").style.display = "inline-block";
    document.getElementById("tabStability").style.display = "inline-block";
    document.getElementById("gaugeSection").style.display = "block";
    document.getElementById("tabGraspStability").style.display = "none";
    document.getElementById("tabPrecision").style.display = "none";
    document.getElementById("tabTraceStability").style.display = "none";
    document.getElementById("tabGraspPrecision").style.display = "none";
}

function showShapeSenseUI() {
    document.getElementById("tabDistance").style.display = "inline-block";
    document.getElementById("tabStability").style.display = "none";
    document.getElementById("gaugeSection").style.display = "block";
    document.getElementById("tabGraspStability").style.display = "none";
    document.getElementById("tabPrecision").style.display = "inline-block";
    document.getElementById("tabTraceStability").style.display = "none";
    document.getElementById("tabGraspPrecision").style.display = "none";
}

function showOrbCatcherUI() {
    document.getElementById("tabDistance").style.display = "inline-block";
    document.getElementById("tabStability").style.display = "none"; 
    document.getElementById("gaugeSection").style.display = "block";
    document.getElementById("tabPrecision").style.display = "none";
    document.getElementById("tabGraspStability").style.display = "inline-block";
    document.getElementById("tabTraceStability").style.display = "none";
    document.getElementById("tabGraspPrecision").style.display = "none";
}

function showRoadTracerUI() {
    document.getElementById("tabDistance").style.display = "inline-block";
    document.getElementById("tabStability").style.display = "none";
    document.getElementById("gaugeSection").style.display = "block";
    document.getElementById("tabPrecision").style.display = "none";
    document.getElementById("tabGraspStability").style.display = "none";
    document.getElementById("tabTraceStability").style.display = "inline-block";
    document.getElementById("tabGraspPrecision").style.display = "none";
}

function showFruitSyncUI() {
    document.getElementById("tabDistance").style.display = "inline-block";
    document.getElementById("tabStability").style.display = "none"; 
    document.getElementById("gaugeSection").style.display = "block";
    document.getElementById("tabPrecision").style.display = "none";
    document.getElementById("tabGraspStability").style.display = "none";
    document.getElementById("tabTraceStability").style.display = "none";
    document.getElementById("tabGraspPrecision").style.display = "inline-block";
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

/* Calculate unique days played from data */
function calculateUniqueDaysPlayed(data) {
    if (!data || data.length === 0) return 0;
    
    const uniqueDates = new Set();
    data.forEach(record => {
       if (record.created_at) {
          const date = new Date(record.created_at).toLocaleDateString("en-GB");
          uniqueDates.add(date);
       }
    });
    
    return uniqueDates.size;
}

/* Calculate average time taken */
function calculateAverageTimeTaken(data) {
    if (!data || data.length === 0) return 0;
    
    const validTimes = data.map(r => r.time_taken).filter(t => t !== null && t !== undefined);
    if (validTimes.length === 0) return 0;
    
    const sum = validTimes.reduce((acc, val) => acc + val, 0);
    return (sum / validTimes.length).toFixed(2);
}

/* Calculate average total distance */
function calculateAverageTotalDistance(data) {
    if (!data || data.length === 0) return 0;
    
    const validDistances = data.map(r => r.totaldistance).filter(d => d !== null && d !== undefined);
    if (validDistances.length === 0) return 0;
    
    const sum = validDistances.reduce((acc, val) => acc + val, 0);
    return (sum / validDistances.length).toFixed(2);
}

/* Calculate average movement stability */
function calculateAverageMovementStability(data) {
    if (!data || data.length === 0) return 0;
    
    const validStability = data.map(r => r.av_devpath).filter(s => s !== null && s !== undefined);
    if (validStability.length === 0) return 0;
    
    const sum = validStability.reduce((acc, val) => acc + val, 0);
    return (sum / validStability.length).toFixed(2);
}

/* Calculate average precision */
function calculateAveragePrecision(data) {
    if (!data || data.length === 0) return 0;
    
    const validPrecision = data.map(r => r.precision).filter(p => p !== null && p !== undefined);
    if (validPrecision.length === 0) return 0;
    
    const sum = validPrecision.reduce((acc, val) => acc + val, 0);
    return (sum / validPrecision.length).toFixed(2);
}

/* Calculate average grasp stability */
function calculateAverageGraspStability(data) {
    if (!data || data.length === 0) return 0;
    
    const validGrasp = data.map(r => r.graspstability).filter(g => g !== null && g !== undefined);
    if (validGrasp.length === 0) return 0;
    
    const sum = validGrasp.reduce((acc, val) => acc + val, 0);
    return (sum / validGrasp.length).toFixed(2);
}

/* Calculate average trace stability */
function calculateAverageTraceStability(data) {
    if (!data || data.length === 0) return 0;
    
    const validTrace = data.map(r => r.tracestability).filter(t => t !== null && t !== undefined);
    if (validTrace.length === 0) return 0;
    
    const sum = validTrace.reduce((acc, val) => acc + val, 0);
    return (sum / validTrace.length).toFixed(2);
}

/* Calculate average grasp precision */
function calculateAverageGraspPrecision(data) {
    if (!data || data.length === 0) return 0;
    
    const validGraspPrec = data.map(r => r.grasp_precision).filter(g => g !== null && g !== undefined);
    if (validGraspPrec.length === 0) return 0;
    
    const sum = validGraspPrec.reduce((acc, val) => acc + val, 0);
    return (sum / validGraspPrec.length).toFixed(2);
}

/* Filter data by latest date */
function filterDataByLatestDate(data) {
    if (!data || data.length === 0) return [];
    
    const latestRecord = data[data.length - 1];
    const latestDate = new Date(latestRecord.created_at).toLocaleDateString("en-GB");
    
    return data.filter(record => 
        new Date(record.created_at).toLocaleDateString("en-GB") === latestDate
    );
}

/* Filter data by previous date (before latest) */
function filterDataByPreviousDate(data) {
    if (!data || data.length === 0) return [];
    
    const latestRecord = data[data.length - 1];
    const latestDate = new Date(latestRecord.created_at).toLocaleDateString("en-GB");
    
    // Find all records before latest date
    const previousData = data.filter(record => 
        new Date(record.created_at).toLocaleDateString("en-GB") !== latestDate
    );
    
    if (previousData.length === 0) return [];
    
    // Get the latest previous date
    const previousRecord = previousData[previousData.length - 1];
    const previousDate = new Date(previousRecord.created_at).toLocaleDateString("en-GB");
    
    return data.filter(record => 
        new Date(record.created_at).toLocaleDateString("en-GB") === previousDate
    );
}

/* Calculate improvement percentage
   For decreasing metrics (timeTaken, distance): lower is better
   For increasing metrics (stability, precision, consistency): higher is better
*/
function calculateImprovement(currentValue, previousValue, isDecreasingBetter = false) {
    currentValue = parseFloat(currentValue);
    previousValue = parseFloat(previousValue);
    
    if (previousValue === 0 || isNaN(previousValue) || isNaN(currentValue)) return null;
    
    let improvement;
    if (isDecreasingBetter) {
        // For time and distance: lower is better
        improvement = ((previousValue - currentValue) / previousValue) * 100;
    } else {
        // For stability, precision, etc: higher is better
        improvement = ((currentValue - previousValue) / previousValue) * 100;
    }
    
    return improvement;
}

/* Get improvement arrow and color */
function getImprovementDisplay(improvement) {
    if (improvement === null) return { text: "", color: "", arrow: "" };
    
    const absImprovement = Math.abs(improvement).toFixed(1);
    if (improvement > 0) {
        return { 
            text: ` +${absImprovement}% ⇧ <br><span style="font-size: 0.85em; color: #999;"> (compare to last session)</span>`, 
            color: "#4CAF50",  // Green
            arrow: "⇧"
        };
    } else if (improvement < 0) {
        return { 
            text: ` ${absImprovement}% ⇩ <br><span style="font-size: 0.85em; color: #999;"> (compare to last session)</span>`, 
            color: "#f44336",  // Red
            arrow: "⇩"
        };
    } else {
        return { 
            text: ` 0% ⇨ <br><span style="font-size: 0.85em; color: #999;"> (compare to last session)</span>`, 
            color: "#999",    // Gray
            arrow: "⇨"
        };
    }
}

/* Update performance section with improvement indicators */
function updatePerformanceSectionWithImprovement(currentData, previousData) {
    const currentAvgTime = calculateAverageTimeTaken(currentData);
    const currentAvgDistance = calculateAverageTotalDistance(currentData);
    const previousAvgTime = calculateAverageTimeTaken(previousData);
    const previousAvgDistance = calculateAverageTotalDistance(previousData);
    
    // Time improvement (lower is better)
    const timeImprovement = calculateImprovement(currentAvgTime, previousAvgTime, true);
    const timeDisplay = getImprovementDisplay(timeImprovement);
    const timeMessage = getImprovementMessage(timeImprovement);
    
    // Distance improvement (lower is better)
    const distanceImprovement = calculateImprovement(currentAvgDistance, previousAvgDistance, true);
    const distanceDisplay = getImprovementDisplay(distanceImprovement);
    const distanceMessage = getImprovementMessage(distanceImprovement);
    
    // Update time element
    const timeEl = document.getElementById("avgssTimeTaken");
    if (timeEl) {
        timeEl.innerHTML = `${currentAvgTime}s <span style="color: ${timeDisplay.color}; font-size: 0.9em;">${timeDisplay.text}</span>`;
    }
    
    // Update time message
    const timeMsgEl = document.getElementById("msgtimeImprovement");
    if (timeMsgEl) {
        timeMsgEl.textContent = timeMessage;
    }
    
    // Update distance element
    const distanceEl = document.getElementById("avgssTotalDistance");
    if (distanceEl) {
        distanceEl.innerHTML = `${currentAvgDistance}px <span style="color: ${distanceDisplay.color}; font-size: 0.9em;">${distanceDisplay.text}</span>`;
    }
    
    // Update distance message
    const distanceMsgEl = document.getElementById("msgdistanceImprovement");
    if (distanceMsgEl) {
        distanceMsgEl.textContent = distanceMessage;
    }
    
    return { timeImprovement, distanceImprovement };
}

/* Update performance section with stability/precision improvement */
function updatePerformanceStabilityWithImprovement(currentData, previousData, metric = "stability") {
    let currentValue, previousValue;
    
    if (metric === "stability") {
        currentValue = calculateAverageMovementStability(currentData);
        previousValue = calculateAverageMovementStability(previousData);
    } else if (metric === "precision") {
        currentValue = calculateAveragePrecision(currentData);
        previousValue = calculateAveragePrecision(previousData);
    } else if (metric === "graspstability") {
        currentValue = calculateAverageGraspStability(currentData);
        previousValue = calculateAverageGraspStability(previousData);
    } else if (metric === "tracestability") {
        currentValue = calculateAverageTraceStability(currentData);
        previousValue = calculateAverageTraceStability(previousData);
    } else if (metric === "graspprecision") {
        currentValue = calculateAverageGraspPrecision(currentData);
        previousValue = calculateAverageGraspPrecision(previousData);
    }
    
    // Stability/precision improvement (higher is better)
    const improvement = calculateImprovement(currentValue, previousValue, false);
    const display_info = getImprovementDisplay(improvement);
    const stabilityMessage = getImprovementMessage(improvement);
    
    const el = document.getElementById("avgssMovementStability");
    if (el) {
        el.innerHTML = `${currentValue}% <span style="color: ${display_info.color}; font-size: 0.9em;">${display_info.text}</span>`;
    }
    
    // Update stability message
    const stabilityMsgEl = document.getElementById("msgstabilityImprovement");
    if (stabilityMsgEl) {
        stabilityMsgEl.textContent = stabilityMessage;
    }
    
    return improvement;
}

/* Update consistency with improvement */
function updateConsistencyWithImprovement(currentConsistency, previousConsistency) {
    const consistencyPercent = (currentConsistency ?? 0) * 100;
    const previousConsistencyPercent = (previousConsistency ?? 0) * 100;
    
    const improvement = calculateImprovement(consistencyPercent, previousConsistencyPercent, false);
    const display_info = getImprovementDisplay(improvement);
    const consistencyMessage = getImprovementMessage(improvement);
    
    const el = document.getElementById("avgssConsistency");
    if (el) {
        el.innerHTML = `${consistencyPercent.toFixed(2)}% <span style="color: ${display_info.color}; font-size: 0.9em;">${display_info.text}</span>`;
    }
    
    // Update consistency message
    const consistencyMsgEl = document.getElementById("msgconsistencyImprovement");
    if (consistencyMsgEl) {
        consistencyMsgEl.textContent = consistencyMessage;
    }
    
    return improvement;
}


/* Clear performance section */
function clearPerformanceSection() {
    document.getElementById("avgssTimeTaken").textContent = "loading..";
    document.getElementById("avgssTotalDistance").textContent = "loading..";
    document.getElementById("avgssMovementStability").textContent = "loading..";
    document.getElementById("avgssConsistency").textContent = "loading..";
    document.getElementById("msgtimeImprovement").textContent = "";
    document.getElementById("msgdistanceImprovement").textContent = "";
    document.getElementById("msgstabilityImprovement").textContent = "";
    document.getElementById("msgconsistencyImprovement").textContent = "";
}

/* ==========================================================
             MAIN HANDLER
==========================================================*/
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
    game === "buzz" ? "Buzz Tap!" : game === "orb" ? "Orb Catcher" : game === "road" ? "Road Tracer" : game === "fruit" ? "Fruit Sync" : "Shape Sense";

    // Clear no-data message and cards by default
    clearStatsCards();
    clearPerformanceSection();

    if (game === "buzz") {
    showBuzzTapUI();
    await loadBuzzTap(level);
    } else if (game === "orb") {
    showOrbCatcherUI();
    await loadOrbCatcher(level);
    } else if (game === "road") {
    showRoadTracerUI();
    await loadRoadTracer(level);
    } else if (game === "fruit") {
    showFruitSyncUI();
    await loadFruitSync(level);
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
          .select("totaldistance, time_taken, av_devpath, created_at, score, consistency, level")
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
    
    const totalSessions = calculateUniqueDaysPlayed(data);
    document.getElementById("totalSessions").textContent = totalSessions;

    const best = Math.min(...data.map(r => r.time_taken ?? Infinity));
    document.getElementById("bestTime").textContent = isFinite(best) ? best.toFixed(2) + "s" : "";

    const avgTime = calculateAverageTimeTaken(data);
    document.getElementById("avgTimeTaken").textContent = avgTime + "s";

    const avgDistance = calculateAverageTotalDistance(data);
    document.getElementById("avgTotalDistance").textContent = avgDistance + "px";

    const avgMovementStability = calculateAverageMovementStability(data);
    document.getElementById("avgMovementStability").textContent = avgMovementStability + "%";
    document.getElementById("txtAvgMovementStability").textContent = "Average Movement Stability";

    // Update performance section with latest date data and improvement indicators
    const latestDateData = filterDataByLatestDate(data);
    const previousDateData = filterDataByPreviousDate(data);
    
    const perfConsistency = last.consistency ?? 0;
    
    // Update time and distance with improvement
    updatePerformanceSectionWithImprovement(latestDateData, previousDateData);
    
    // Update stability with improvement
    updatePerformanceStabilityWithImprovement(latestDateData, previousDateData, "stability");
    
    // Update consistency with improvement
    updateConsistencyWithImprovement(perfConsistency, previousDateData.length > 0 ? previousDateData[previousDateData.length - 1].consistency ?? 0 : 0);

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
       return `P${i + 1} (${date})`;
    });

    const times = data.map(r => r.time_taken ?? null);
    const distances = data.map(r => r.totaldistance ?? null);
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
          currentMainChart.data.datasets[0].label = "Total Distance per Play (px)";
          currentMainChart.data.datasets[0].data = distances;
          currentMainChart.data.datasets[0].borderColor = "blue";
       } else if (type === "stability") {
          currentMainChart.data.datasets[0].label = "Movement Stability per Play (%)";
          currentMainChart.data.datasets[0].data = stability;
          currentMainChart.data.datasets[0].borderColor = "orange";
       } else {
          currentMainChart.data.datasets[0].label = "Time Taken per Play (s)";
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
                     .select("score, time_taken, precision, totaldistance, consistency, created_at, level")
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
     
     const totalSessions = calculateUniqueDaysPlayed(data);
     document.getElementById("totalSessions").textContent = totalSessions;

     const best = Math.min(...data.map(r => r.time_taken ?? Infinity));
     document.getElementById("bestTime").textContent = isFinite(best) ? best.toFixed(2) + "s" : "";

     const avgTime = calculateAverageTimeTaken(data);
     document.getElementById("avgTimeTaken").textContent = avgTime + "s";

     const avgDistance = calculateAverageTotalDistance(data);
     document.getElementById("avgTotalDistance").textContent = avgDistance + "px";

     const avgPrecision = calculateAveragePrecision(data);
     document.getElementById("avgMovementStability").textContent = avgPrecision + "%";
     document.getElementById("txtAvgMovementStability").textContent = "Average Pinch Accuracy";

     // Update performance section with latest date data and improvement indicators
     const latestDateData = filterDataByLatestDate(data);
     const previousDateData = filterDataByPreviousDate(data);
     
     const perfConsistency = last.consistency ?? 0;
     
     // Update time and distance with improvement
     updatePerformanceSectionWithImprovement(latestDateData, previousDateData);
     
     // Update precision with improvement
     updatePerformanceStabilityWithImprovement(latestDateData, previousDateData, "precision");
     
     // Update consistency with improvement
    updateConsistencyWithImprovement(perfConsistency / 100, previousDateData.length > 0 ? (previousDateData[previousDateData.length - 1].consistency ?? 0) / 100 : 0);
     document.getElementById("txtmovementStability").textContent = "Pinch Accuracy";

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
            return `P${i + 1} (${date})`;
     });

     const times = data.map(r => r.time_taken ?? null);
     const precision = data.map(r => r.precision ?? null);
     const distances = data.map(r => r.totaldistance ?? null);

     await waitForCanvas("#mainChart");

     // Ensure the UI's active tab matches the chart type being displayed
     const tabBtn = document.querySelector(`.tab-btn[data-chart="${type}"]`);
     if (tabBtn) activateTab(tabBtn);

     if (!currentMainChart) {
            // initGameChart for shape: we pass labels and primary data (times)
            currentMainChart = initGameChart(labels, times);

            // make sure initial dataset reflects the requested type
            if (type === "precision") {
                     currentMainChart.data.datasets[0].label = "Pinch Accuracy per Play (%)";
                     currentMainChart.data.datasets[0].data = precision;
                     currentMainChart.data.datasets[0].borderColor = "purple";
            } else if (type === "distance") {
                     currentMainChart.data.datasets[0].label = "Total Distance per Play (px)";
                     currentMainChart.data.datasets[0].data = distances;
                     currentMainChart.data.datasets[0].borderColor = "blue";
            } else {
                     currentMainChart.data.datasets[0].label = "Time Taken per Play (s)";
                     currentMainChart.data.datasets[0].data = times;
                     currentMainChart.data.datasets[0].borderColor = "green";
            }
            currentMainChart.update();
     } else {
            if (type === "precision") {
                     currentMainChart.data.datasets[0].label = "Pinch Accuracy per Play (%)";
                     currentMainChart.data.datasets[0].data = precision;
                     currentMainChart.data.datasets[0].borderColor = "purple";
            } else if (type === "distance") {
                     currentMainChart.data.datasets[0].label = "Total Distance per Play (px)";
                     currentMainChart.data.datasets[0].data = distances;
                     currentMainChart.data.datasets[0].borderColor = "blue";
            } else {
                     currentMainChart.data.datasets[0].label = "Time Taken per Play (s)";
                     currentMainChart.data.datasets[0].data = times;
                     currentMainChart.data.datasets[0].borderColor = "green";
            }
            currentMainChart.update();
     }
}


/* =============================================
            ORB CATCHER ANALYTICS
================================================*/
async function loadOrbCatcher(level) {
    const userEmail = (await supabase.auth.getUser()).data.user?.email;
    if (!userEmail) {
        showNoData();
        return;
    }

    if (!orbCache[level]) {
        const { data } = await supabase
            .from("orbcatcher_results")
            .select("score, time_taken, graspstability, totaldistance, consistency, created_at, level")
            .eq("player_email", userEmail)
            .eq("level", level)
            .order("created_at", { ascending: true });

        orbCache[level] = data ?? [];
    }

    const data = orbCache[level];

    if (!data || data.length === 0) {
        showNoData();
        return;
    }

    const last = data[data.length - 1];

    document.getElementById("lastScore").textContent = last.score ?? "";
    document.getElementById("lastDate").textContent =
        last.created_at ? new Date(last.created_at).toLocaleDateString("en-GB") : "";
    document.getElementById("totalGames").textContent = data.length;
    
    const totalSessions = calculateUniqueDaysPlayed(data);
    document.getElementById("totalSessions").textContent = totalSessions;

    const best = Math.min(...data.map(r => r.time_taken ?? Infinity));
    document.getElementById("bestTime").textContent = isFinite(best) ? best.toFixed(2) + "s" : "";

    const avgTime = calculateAverageTimeTaken(data);
    document.getElementById("avgTimeTaken").textContent = avgTime + "s";

    const avgDistance = calculateAverageTotalDistance(data);
    document.getElementById("avgTotalDistance").textContent = avgDistance + "px";

    const avgGraspStability = calculateAverageGraspStability(data);
    document.getElementById("avgMovementStability").textContent = avgGraspStability + "%";
    document.getElementById("txtAvgMovementStability").textContent = "Average Grasp Stability";

    // Update performance section with latest date data and improvement indicators
    const latestDateData = filterDataByLatestDate(data);
    const previousDateData = filterDataByPreviousDate(data);
    
    const perfConsistency = last.consistency ?? 0;
    
    // Update time and distance with improvement
    updatePerformanceSectionWithImprovement(latestDateData, previousDateData);
    
    // Update grasp stability with improvement
    updatePerformanceStabilityWithImprovement(latestDateData, previousDateData, "graspstability");
    
    // Update consistency with improvement
    updateConsistencyWithImprovement(perfConsistency / 100, previousDateData.length > 0 ? (previousDateData[previousDateData.length - 1].consistency ?? 0) / 100 : 0);
    document.getElementById("txtmovementStability").textContent = "Grasp Stability";

    // Gauge for consistency
    const consistencyPercent = (last.consistency ?? 0);
    currentGauge = initConsistencyGauge(consistencyPercent);

    // Ensure the default tab for orb catcher is "time"
    const timeTabBtn = document.querySelector('.tab-btn[data-chart="time"]');
    if (timeTabBtn) activateTab(timeTabBtn);

    await drawOrbChart("time", level);
}

async function drawOrbChart(type, level) {
    const data = orbCache[level];
    if (!data || data.length === 0) return;

    const labels = data.map((r, i) => {
        const date = r.created_at ? new Date(r.created_at).toLocaleDateString("en-GB") : "";
        return `P${i + 1} (${date})`;
    });

    const times = data.map(r => r.time_taken ?? null);
    const graspstability = data.map(r => r.graspstability ?? null);
    const distances = data.map(r => r.totaldistance ?? null);

    await waitForCanvas("#mainChart");

    // Ensure the UI's active tab matches the chart type being displayed
    const tabBtn = document.querySelector(`.tab-btn[data-chart="${type}"]`);
    if (tabBtn) activateTab(tabBtn);

    if (!currentMainChart) {
        currentMainChart = initGameChart(labels, times);

        if (type === "graspstability") {
            currentMainChart.data.datasets[0].label = "Grasp Stability per Play (%)";
            currentMainChart.data.datasets[0].data = graspstability;
            currentMainChart.data.datasets[0].borderColor = "purple";
        } else if (type === "distance") {
            currentMainChart.data.datasets[0].label = "Total Distance per Play (px)";
            currentMainChart.data.datasets[0].data = distances;
            currentMainChart.data.datasets[0].borderColor = "blue";
        } else {
            currentMainChart.data.datasets[0].label = "Time Taken per Play (s)";
            currentMainChart.data.datasets[0].data = times;
            currentMainChart.data.datasets[0].borderColor = "green";
        }
        currentMainChart.update();
    } else {
        if (type === "graspstability") {
            currentMainChart.data.datasets[0].label = "Grasp Stability per Play (%)";
            currentMainChart.data.datasets[0].data = graspstability;
            currentMainChart.data.datasets[0].borderColor = "purple";
        } else if (type === "distance") {
            currentMainChart.data.datasets[0].label = "Total Distance per Play (px)";
            currentMainChart.data.datasets[0].data = distances;
            currentMainChart.data.datasets[0].borderColor = "blue";
        } else {
            currentMainChart.data.datasets[0].label = "Time Taken per Play (s)";
            currentMainChart.data.datasets[0].data = times;
            currentMainChart.data.datasets[0].borderColor = "green";
        }
        currentMainChart.update();
    }
}


/* =============================================
            ROAD TRACER ANALYTICS
================================================*/
async function loadRoadTracer(level) {
    const userEmail = (await supabase.auth.getUser()).data.user?.email;
    if (!userEmail) {
        showNoData();
        return;
    }

    if (!roadCache[level]) {
        const { data } = await supabase
            .from("roadtracer_results")
            .select("score, time_taken, tracestability, totaldistance, consistency, created_at, level")
            .eq("player_email", userEmail)
            .eq("level", level)
            .order("created_at", { ascending: true });

        roadCache[level] = data ?? [];
    }

    const data = roadCache[level];

    if (!data || data.length === 0) {
        showNoData();
        return;
    }

    const last = data[data.length - 1];

    document.getElementById("lastScore").textContent = last.score ?? "";
    document.getElementById("lastDate").textContent =
        last.created_at ? new Date(last.created_at).toLocaleDateString("en-GB") : "";
    document.getElementById("totalGames").textContent = data.length;
    
    const totalSessions = calculateUniqueDaysPlayed(data);
    document.getElementById("totalSessions").textContent = totalSessions;

    const best = Math.min(...data.map(r => r.time_taken ?? Infinity));
    document.getElementById("bestTime").textContent = isFinite(best) ? best.toFixed(2) + "s" : "";

    const avgTime = calculateAverageTimeTaken(data);
    document.getElementById("avgTimeTaken").textContent = avgTime + "s";

    const avgDistance = calculateAverageTotalDistance(data);
    document.getElementById("avgTotalDistance").textContent = avgDistance + "px";

    const avgTraceStability = calculateAverageTraceStability(data);
    document.getElementById("avgMovementStability").textContent = avgTraceStability + "%";
    document.getElementById("txtAvgMovementStability").textContent = "Average Trace Stability";

    // Update performance section with latest date data and improvement indicators
    const latestDateData = filterDataByLatestDate(data);
    const previousDateData = filterDataByPreviousDate(data);
    
    const perfConsistency = last.consistency ?? 0;
    
    // Update time and distance with improvement
    updatePerformanceSectionWithImprovement(latestDateData, previousDateData);
    
    // Update trace stability with improvement
    updatePerformanceStabilityWithImprovement(latestDateData, previousDateData, "tracestability");
    
    // Update consistency with improvement
    updateConsistencyWithImprovement(perfConsistency / 100, previousDateData.length > 0 ? (previousDateData[previousDateData.length - 1].consistency ?? 0) / 100 : 0);
    document.getElementById("txtmovementStability").textContent = "Trace Stability";

    // Gauge for consistency
    const consistencyPercent = (last.consistency ?? 0);
    currentGauge = initConsistencyGauge(consistencyPercent);

    // Ensure the default tab for road tracer is "time"
    const timeTabBtn = document.querySelector('.tab-btn[data-chart="time"]');
    if (timeTabBtn) activateTab(timeTabBtn);

    await drawRoadChart("time", level);
}

async function drawRoadChart(type, level) {
    const data = roadCache[level];
    if (!data || data.length === 0) return;

    const labels = data.map((r, i) => {
        const date = r.created_at ? new Date(r.created_at).toLocaleDateString("en-GB") : "";
        return `P${i + 1} (${date})`;
    });

    const times = data.map(r => r.time_taken ?? null);
    const tracestability = data.map(r => r.tracestability ?? null);
    const distances = data.map(r => r.totaldistance ?? null);

    await waitForCanvas("#mainChart");

    // Ensure the UI's active tab matches the chart type being displayed
    const tabBtn = document.querySelector(`.tab-btn[data-chart="${type}"]`);
    if (tabBtn) activateTab(tabBtn);

    if (!currentMainChart) {
        currentMainChart = initGameChart(labels, times);

        if (type === "tracestability") {
            currentMainChart.data.datasets[0].label = "Trace Stability per Play (%)";
            currentMainChart.data.datasets[0].data = tracestability;
            currentMainChart.data.datasets[0].borderColor = "purple";
        } else if (type === "distance") {
            currentMainChart.data.datasets[0].label = "Total Distance per Play (px)";
            currentMainChart.data.datasets[0].data = distances;
            currentMainChart.data.datasets[0].borderColor = "blue";
        } else {
            currentMainChart.data.datasets[0].label = "Time Taken per Play (s)";
            currentMainChart.data.datasets[0].data = times;
            currentMainChart.data.datasets[0].borderColor = "green";
        }
        currentMainChart.update();
    } else {
        if (type === "tracestability") {
            currentMainChart.data.datasets[0].label = "Trace Stability per Play (%)";
            currentMainChart.data.datasets[0].data = tracestability;
            currentMainChart.data.datasets[0].borderColor = "purple";
        } else if (type === "distance") {
            currentMainChart.data.datasets[0].label = "Total Distance per Play (px)";
            currentMainChart.data.datasets[0].data = distances;
            currentMainChart.data.datasets[0].borderColor = "blue";
        } else {
            currentMainChart.data.datasets[0].label = "Time Taken per Play (s)";
            currentMainChart.data.datasets[0].data = times;
            currentMainChart.data.datasets[0].borderColor = "green";
        }
        currentMainChart.update();
    }
}


/* =============================================
               FRUIT SYNC ANALYTICS
================================================*/
async function loadFruitSync(level) {
     const userEmail = (await supabase.auth.getUser()).data.user?.email;
     if (!userEmail) {
          showNoData();
          return;
     }

     if (!fruitCache[level]) {
          const { data } = await supabase
              .from("fruitsync_results")
              .select("score, time_taken, grasp_precision, totaldistance, consistency, created_at, level")
              .eq("player_email", userEmail)
              .eq("level", level)
              .order("created_at", { ascending: true });

          fruitCache[level] = data ?? [];
     }

     const data = fruitCache[level];

     if (!data || data.length === 0) {
          showNoData();
          return;
     }

     const last = data[data.length - 1];

     document.getElementById("lastScore").textContent = last.score ?? "";
     document.getElementById("lastDate").textContent =
          last.created_at ? new Date(last.created_at).toLocaleDateString("en-GB") : "";
     document.getElementById("totalGames").textContent = data.length;
     
     const totalSessions = calculateUniqueDaysPlayed(data);
     document.getElementById("totalSessions").textContent = totalSessions;

     const best = Math.min(...data.map(r => r.time_taken ?? Infinity));
     document.getElementById("bestTime").textContent = isFinite(best) ? best.toFixed(2) + "s" : "";

     const avgTime = calculateAverageTimeTaken(data);
     document.getElementById("avgTimeTaken").textContent = avgTime + "s";

     const avgDistance = calculateAverageTotalDistance(data);
     document.getElementById("avgTotalDistance").textContent = avgDistance + "px";

     const avgGraspPrecision = calculateAverageGraspPrecision(data);
     document.getElementById("avgMovementStability").textContent = avgGraspPrecision + "%";
     document.getElementById("txtAvgMovementStability").textContent = "Average Grasp Precision";

     // Update performance section with latest date data and improvement indicators
     const latestDateData = filterDataByLatestDate(data);
     const previousDateData = filterDataByPreviousDate(data);
     
     const perfConsistency = last.consistency ?? 0;
     
     // Update time and distance with improvement
     updatePerformanceSectionWithImprovement(latestDateData, previousDateData);
     
     // Update grasp precision with improvement
     updatePerformanceStabilityWithImprovement(latestDateData, previousDateData, "graspprecision");
     
     // Update consistency with improvement
    updateConsistencyWithImprovement(perfConsistency / 100, previousDateData.length > 0 ? (previousDateData[previousDateData.length - 1].consistency ?? 0) / 100 : 0);
     document.getElementById("txtmovementStability").textContent = "Grasp Precision";

     // Gauge for consistency
     const consistencyPercent = (last.consistency ?? 0);
     currentGauge = initConsistencyGauge(consistencyPercent);

     // Ensure the default tab for fruit sync is "time"
     const timeTabBtn = document.querySelector('.tab-btn[data-chart="time"]');
     if (timeTabBtn) activateTab(timeTabBtn);

     await drawFruitChart("time", level);
}

async function drawFruitChart(type, level) {
     const data = fruitCache[level];
     if (!data || data.length === 0) return;

     const labels = data.map((r, i) => {
          const date = r.created_at ? new Date(r.created_at).toLocaleDateString("en-GB") : "";
          return `P${i + 1} (${date})`;
     });

     const times = data.map(r => r.time_taken ?? null);
     const graspprecision = data.map(r => r.grasp_precision ?? null);
     const distances = data.map(r => r.totaldistance ?? null);

     await waitForCanvas("#mainChart");

     // Ensure the UI's active tab matches the chart type being displayed
     const tabBtn = document.querySelector(`.tab-btn[data-chart="${type}"]`);
     if (tabBtn) activateTab(tabBtn);

     if (!currentMainChart) {
          currentMainChart = initGameChart(labels, times);

          if (type === "graspprecision") {
              currentMainChart.data.datasets[0].label = "Grasp Precision per Play (%)";
              currentMainChart.data.datasets[0].data = graspprecision;
              currentMainChart.data.datasets[0].borderColor = "purple";
          } else if (type === "distance") {
              currentMainChart.data.datasets[0].label = "Total Distance per Play (px)";
              currentMainChart.data.datasets[0].data = distances;
              currentMainChart.data.datasets[0].borderColor = "blue";
          } else {
              currentMainChart.data.datasets[0].label = "Time Taken per Play (s)";
              currentMainChart.data.datasets[0].data = times;
              currentMainChart.data.datasets[0].borderColor = "green";
          }
          currentMainChart.update();
     } else {
          if (type === "graspprecision") {
              currentMainChart.data.datasets[0].label = "Grasp Precision per Play (%)";
              currentMainChart.data.datasets[0].data = graspprecision;
              currentMainChart.data.datasets[0].borderColor = "purple";
          } else if (type === "distance") {
              currentMainChart.data.datasets[0].label = "Total Distance per Play (px)";
              currentMainChart.data.datasets[0].data = distances;
              currentMainChart.data.datasets[0].borderColor = "blue";
          } else {
              currentMainChart.data.datasets[0].label = "Time Taken per Play (s)";
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
    } else if (game === "orb") {
        drawOrbChart(type, level);
    } else if (game === "road") {
        drawRoadChart(type, level);
    } else if (game === "fruit") {
        drawFruitChart(type, level);
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
    document.getElementById("totalSessions").textContent = "";
    document.getElementById("bestTime").textContent = "";
    document.getElementById("avgTimeTaken").textContent = "";
    document.getElementById("avgTotalDistance").textContent = "";
    document.getElementById("avgMovementStability").textContent = "";
    // hide no-data message area if present
    const nd = document.getElementById("noDataMessage");
    if (nd) nd.style.display = "none";
}

function showNoData() {
    // Leave UI empty (no text in cards, no chart)
    clearStatsCards();
    clearPerformanceSection();
    
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