// ==========================================================
//  SCORECARD v3 — Supabase + Date Filter + Caching + Fast Load + TOTAL SCORE
// ==========================================================

import { supabase } from './supabaseClient.js';
const { jsPDF } = window.jspdf;

// ---------- DOM ELEMENTS ----------
const scoreCardBtn = document.getElementById("openScoreCard");
const scoreCardModal = document.getElementById("scoreModal");
const closeScoreCardBtn = document.getElementById("closeScoreModal");

// Inputs (user enters)
const inputStudent = document.getElementById("studentName");
const inputAge = document.getElementById("studentAge");
const inputHealth = document.getElementById("studentHealth");
const inputTeacher = document.getElementById("studentTeacher");
const inputDate = document.getElementById("sessionDate"); // yyyy-mm-dd

// Game selection
const gameSelect = document.getElementById("gameSelect");

// Output fields in modal
const scGameName = document.getElementById("scGameName");
const scBestTime = document.getElementById("scBestTime");
const scTotalPlayed = document.getElementById("scTotalGames");
const scTotalScore = document.getElementById("scTotalScore");
const scTimeList = document.getElementById("scTimeList");
const scDistanceList = document.getElementById("scDistanceList");

// Printable/PDF fields
const pdfStudentName = document.getElementById("pdfStudentName");
const pdfAge = document.getElementById("pdfAge");
const pdfHealth = document.getElementById("pdfHealth");
const pdfTeacher = document.getElementById("pdfTeacher");
const pdfSessionDate = document.getElementById("pdfsessiondate");

const pdfGameName = document.getElementById("pdfGameName");
const pdfBestTime = document.getElementById("pdfBestTime");
const pdfGamesPlayed = document.getElementById("pdfGamesPlayed");
const pdfTotalScore = document.getElementById("pdfTotalScore");
const pdfTimeList = document.getElementById("pdfTimeList");
const pdfDistanceList = document.getElementById("pdfDistanceList");

// Download button
const downloadBtn = document.getElementById("downloadScorePDF");

// ==========================================================
//  CACHE for fast repeated queries
// ==========================================================
const cache = {};


// ==========================================================
//  FUNCTION: Get Stats for Selected Date (fast + cached)
// ==========================================================
async function getGameStatsByDate() {

    const game = gameSelect?.value || "buzz";
    const selectedDate = inputDate.value;

    if (!selectedDate) {
        return {
            gameName: game === "buzz" ? "Buzz Tap!" : "Shape Sense",
            date: "-",
            bestTime: "-",
            totalPlayed: "-",
            totalScore: "-",
            timeList: "-",
            distanceList: "-"
        };
    }

    const cacheKey = `${game}-${selectedDate}`;
    if (cache[cacheKey]) return cache[cacheKey];

    // Get email
    const { data: user } = await supabase.auth.getUser();
    const userEmail = user.user?.email;

    let table = "";
    let gameTitle = "";
    if (game === "buzz") {
        table = "buzztap_results";
        gameTitle = "Buzz Tap!";
    } else {
        table = "shapesense_results";
        gameTitle = "Shape Sense";
    }

    // Date range for filtering
    const start = selectedDate + "T00:00:00";
    const end = selectedDate + "T23:59:59";

    // Get all results for the selected date
    const { data, count, error } = await supabase
        .from(table)
        .select("*", { count: "exact" })
        .eq("player_email", userEmail)
        .gte("created_at", start)
        .lte("created_at", end)
        .order("time_taken", { ascending: true });

    if (error) {
        console.error("Supabase Error:", error);
        return {
            gameName: gameTitle,
            date: selectedDate,
            bestTime: "-",
            totalPlayed: 0,
            totalScore: 0,
            timeList: "-",
            distanceList: "-"
        };
    }

    const bestRecord = data?.[0];

    let totalScore = "-";
    if (data && data.length > 0) {
        totalScore = data[data.length - 1].score || 0;
    }

    // TIME LIST
    const timeList = data?.map(r => r.time_taken?.toFixed(1) + "s") || [];

    // DISTANCE LIST (for Buzz Tap)
    let distanceList = "-";

    if (game === "buzz") {
        const dist = data?.map(r => 
            r.norm_totaldistance != null 
                ? r.norm_totaldistance.toFixed(1) + "px"
                : null
        ).filter(v => v !== null);

        distanceList = dist.length > 0 ? dist.join(", ") : "-";
    }

    const result = {
        gameName: gameTitle,
        date: selectedDate,
        bestTime: bestRecord?.time_taken ? bestRecord.time_taken.toFixed(1) + "s" : "-",
        totalPlayed: count || 0,
        totalScore: totalScore,
        timeList: timeList.length > 0 ? timeList.join(", ") : "-",
        distanceList
    };

    cache[cacheKey] = result;
    return result;
}


// ==========================================================
// 1. OPEN SCORE CARD MODAL
// ==========================================================
scoreCardBtn.addEventListener("click", async () => {
    scoreCardModal.style.display = "flex";

    const result = await getGameStatsByDate();

    scGameName.textContent = result.gameName;
    scBestTime.textContent = result.bestTime;
    scTotalPlayed.textContent = result.totalPlayed;
    scTotalScore.textContent = result.totalScore;
    scTimeList.textContent = result.timeList;
    scDistanceList.textContent = result.distanceList;
});


// ==========================================================
// 2. CLOSE MODAL
// ==========================================================
closeScoreCardBtn.addEventListener("click", () => {
    scoreCardModal.style.display = "none";
});


// ==========================================================
// 3. UPDATE SCORECARD WHEN DATE OR GAME CHANGES
// ==========================================================
async function updateScoreCard() {
    const result = await getGameStatsByDate();

    scGameName.textContent = result.gameName;
    scBestTime.textContent = result.bestTime;
    scTotalPlayed.textContent = result.totalPlayed;
    scTotalScore.textContent = result.totalScore;
    scTimeList.textContent = result.timeList;
    scDistanceList.textContent = result.distanceList;
}

// Debounce
let debounceTimer;
inputDate.addEventListener("change", () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(updateScoreCard, 300);
});
gameSelect.addEventListener("change", () => {
    updateScoreCard();
});


// ==========================================================
// 4. GENERATE PDF
// ==========================================================
downloadBtn.addEventListener("click", async () => {

    pdfStudentName.textContent = inputStudent.value;
    pdfAge.textContent = inputAge.value;
    pdfHealth.textContent = inputHealth.value;
    pdfTeacher.textContent = inputTeacher.value;
    pdfSessionDate.textContent = inputDate.value;

    pdfGameName.textContent = scGameName.textContent;
    pdfBestTime.textContent = scBestTime.textContent;
    pdfGamesPlayed.textContent = scTotalPlayed.textContent;
    pdfTotalScore.textContent = scTotalScore.textContent;
    pdfTimeList.textContent = scTimeList.textContent;
    pdfDistanceList.textContent = scDistanceList.textContent;

    const element = document.getElementById("scorecardPrint");
    const canvas = await html2canvas(element, { scale: 2 });
    const imgData = canvas.toDataURL("image/jpeg", 2.0);

    const pdf = new jsPDF("p", "pt", "a4");
    const pdfWidth = pdf.internal.pageSize.getWidth();
    const imgWidth = pdfWidth - 40;
    const imgHeight = canvas.height * (imgWidth / canvas.width);

    pdf.addImage(imgData, "JPEG", 20, 20, imgWidth, imgHeight);
    pdf.save(`ScoreCard_${inputStudent.value}.pdf`);
});
