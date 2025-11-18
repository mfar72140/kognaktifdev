import { supabase } from './supabaseClient.js';
import { initGameChart, initConsistencyGauge } from './gamechart.js';

let currentMainChart = null;
let currentGauge = null;

export async function loadAnalytics() {
    document.getElementById("gameSelect").addEventListener("change", updateGameAnalytics);
    updateGameAnalytics();
}

/* MAIN HANDLER */
async function updateGameAnalytics() {
    const game = document.getElementById("gameSelect").value;

    document.getElementById("gameTitle").textContent =
        game === "buzz" ? "Buzz Tap!" : "Shape Sense";

    clearCharts();

    if (game === "buzz") {
        loadBuzzTap();
    } else if (game === "shape") {
        loadShapeSense();
    }
}

/* -------------------------------------------------------
   BUZZ TAP ANALYTICS
------------------------------------------------------- */
async function loadBuzzTap() {
    const userEmail = (await supabase.auth.getUser()).data.user?.email;

    const { data, error } = await supabase
        .from("buzztap_results")
        .select("norm_totaldistance, time_taken, av_devpath, created_at, score, consistency")
        .eq("player_email", userEmail)
        .order("created_at", { ascending: true });

    // No data → show message
    if (!data || data.length === 0) {
        showNoData("No Buzz Tap! data yet.");
        return;
    }

    const lastRow = data[data.length - 1];

    // Update Stats
    document.getElementById("lastScore").textContent = lastRow.score;
    document.getElementById("lastDate").textContent = new Date(lastRow.created_at)
        .toLocaleDateString("en-GB");
    document.getElementById("totalGames").textContent = data.length;

    const best = Math.min(...data.map(r => r.time_taken));
    document.getElementById("bestTime").textContent = best.toFixed(2) + "s";

    // Consistency Gauge
    const consistencyPercent = (lastRow.consistency ?? 0) * 100;
    if (currentGauge) currentGauge.destroy?.();
    currentGauge = initConsistencyGauge(consistencyPercent);

    // Prepare Chart Data
    const labels = data.map((_, i) => "G " + (i + 1));
    const times = data.map(r => r.time_taken);
    const distances = data.map(r => r.norm_totaldistance);
    const stability = data.map(r => r.av_devpath !== undefined ? r.av_devpath : null);

    // WAIT for canvas to be ready before drawing chart
    await waitForCanvas("#mainChart");

    if (currentMainChart) currentMainChart.destroy?.();
    currentMainChart = initGameChart(labels, times, distances, stability);
}

/* -------------------------------------------------------
   SHAPE SENSE ANALYTICS
------------------------------------------------------- */
async function loadShapeSense() {
    const userEmail = (await supabase.auth.getUser()).data.user?.email;

    const { data } = await supabase
        .from("shapesense_results")
        .select("*")
        .eq("player_email", userEmail);

    if (!data || data.length === 0) {
        showNoData("No Shape Sense data yet.");
        return;
    }

    // Future Shape Sense Charts Here
}

/* -------------------------------------------------------
   UTILITIES
------------------------------------------------------- */

// Remove old charts, reset everything
function clearCharts() {
    document.getElementById("noDataMessage").style.display = "none";

    if (currentMainChart) {
        currentMainChart.destroy();
        currentMainChart = null;
    }

    if (currentGauge) {
        currentGauge.destroy?.();
        currentGauge = null;
    }

    // Clear Stats
    ["lastScore", "lastDate", "totalGames", "bestTime"].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.textContent = "-";
    });

    // Clear canvases
    ["mainChart", "consistencyGauge"].forEach(id => {
        const c = document.getElementById(id);
        if (c) {
            const ctx = c.getContext("2d");
            ctx.clearRect(0, 0, c.width, c.height);
        }
    });
}

// Show “no data” message
function showNoData(msg) {
    const el = document.getElementById("noDataMessage");
    el.textContent = msg;
    el.style.display = "block";
}

/* -------------------------------------------------------
   FIX: Wait for canvas to be fully rendered
------------------------------------------------------- */
function waitForCanvas(selector) {
    return new Promise(resolve => {
        let attempts = 0;

        function check() {
            const el = document.querySelector(selector);

            if (el && el.offsetWidth > 0 && el.offsetHeight > 0) {
                return resolve();
            }

            attempts++;
            if (attempts < 20) {
                requestAnimationFrame(check);
            } else {
                console.warn("Canvas never received proper size:", selector);
                resolve(); // fallback, prevents crash
            }
        }

        check();
    });
}
