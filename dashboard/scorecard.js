import { supabase } from '/js/supabaseClient.js';

// ==========================================================
//  SCORECARD v3 — Supabase + Date Filter + Caching + Fast Load + TOTAL SCORE
// ==========================================================

const { jsPDF } = window.jspdf;

// ---------- DOM ELEMENTS ----------
const scoreCardBtn = document.getElementById("openScoreCard");
const scoreCardModal = document.getElementById("scoreModal");
const closeScoreCardBtn = document.getElementById("closeScoreModal");

// Display fields (auto-populated from profile)
const inputChild = document.getElementById("childName");
const inputAge = document.getElementById("childAge");
const inputHealth = document.getElementById("childHealth");
const inputParent = document.getElementById("childParent");
const inputDate = document.getElementById("sessionDate"); // yyyy-mm-dd

// Game selection
const gameSelect = document.getElementById("gameSelect");
const levelSelect = document.getElementById("levelSelect");

// Output fields in modal
const scGameName = document.getElementById("scGameName");
const scGameLevel = document.getElementById("scGameLevel");
const scBestTime = document.getElementById("scBestTime");
const scTotalPlayed = document.getElementById("scTotalGames");
const scTotalScore = document.getElementById("scTotalScore");
const scTimeList = document.getElementById("scTimeList");
const scDistanceList = document.getElementById("scDistanceList");
const scMovementStabilityList = document.getElementById("scMovementStabilityList");
const scPinchAccuracyList = document.getElementById("scPinchAccuracyList");
const scGraspStabilityList = document.getElementById("scGraspStabilityList");
const scGraspPrecisionList = document.getElementById("scGraspPrecisionList");
const scTraceStabilityList = document.getElementById("scTraceStabilityList");

// Printable/PDF fields
const pdfChildName = document.getElementById("pdfChildName");
const pdfAge = document.getElementById("pdfAge");
const pdfHealth = document.getElementById("pdfHealth");
const pdfParent = document.getElementById("pdfParent");
const pdfSessionDate = document.getElementById("pdfsessiondate");

const pdfGameName = document.getElementById("pdfGameName");
const pdfGameLevel = document.getElementById("pdfGameLevel");
const pdfBestTime = document.getElementById("pdfBestTime");
const pdfGamesPlayed = document.getElementById("pdfGamesPlayed");
const pdfTotalScore = document.getElementById("pdfTotalScore");
const pdfTimeList = document.getElementById("pdfTimeList");
const pdfDistanceList = document.getElementById("pdfDistanceList");
const pdfMovementStabilityList = document.getElementById("pdfMovementStabilityList");
const pdfPinchAccuracyList = document.getElementById("pdfPinchAccuracyList");
const pdfGraspStabilityList = document.getElementById("pdfGraspStabilityList");
const pdfGraspPrecisionList = document.getElementById("pdfGraspPrecisionList");
const pdfTraceStabilityList = document.getElementById("pdfTraceStabilityList");

// Download button
const downloadBtn = document.getElementById("downloadScorePDF");

// ==========================================================
//  CACHE for fast repeated queries
// ==========================================================
const cache = {};

// ==========================================================
// Notification System
// ==========================================================
function showNotify(message, type = "warning") {
    const box = document.getElementById("notifyBox");
    if (!box) return alert(message); // fallback if HTML missing

    box.textContent = message;
    box.className = `notify ${type}`; // apply style (warning/success/error)

    setTimeout(() => {
        box.className = "notify hidden";
    }, 3000);
}


// ==========================================================
//  FUNCTION: Load Profile Data from Supabase
// ==========================================================
async function loadProfileData() {
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) {
        console.error("User not logged in or error:", userError);
        showNotify("Please log in to view scorecard.", "error");
        return false;
    }
    
    const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("cfirstname, clastname, birthday, healthcategory, firstname, lastname")
        .eq("id", userData.user.id)
        .maybeSingle();
    
    if (profileError || !profile) {
        console.error("Profile fetch error:", profileError);
        showNotify("Please update your information in Account Settings first.", "error");
        return false;
    }
    
    // Check if required fields exist
    if (!profile.cfirstname || !profile.clastname || !profile.birthday || !profile.healthcategory || !profile.firstname || !profile.lastname) {
        showNotify("Please update your information in Account Settings first.", "error");
        return false;
    }
    
    // Populate child name
    const childName = `${profile.cfirstname} ${profile.clastname}`;
    inputChild.textContent = childName;
    
    // Calculate age from birthday
    const birthDate = new Date(profile.birthday);
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
        age--;
    }
    inputAge.textContent = age;
    
    // Populate health category
    inputHealth.textContent = profile.healthcategory;
    
    // Populate teacher's name
    const parentName = `${profile.firstname} ${profile.lastname}`;
    inputParent.textContent = parentName;
    
    return true;
}


// ==========================================================
//  FUNCTION: Get Stats for Selected Date (fixed UTC + caching)
// ==========================================================
async function getGameStatsByDate() {
    const game = gameSelect?.value || "buzz";
    const selectedDate = inputDate.value;
    // Support BEGINNER / INTERMEDIATE / ADVANCED and an "ALL" option
    const levelRaw = (levelSelect?.value || "ALL").toUpperCase();

    if (!selectedDate) {
        return {
            gameName: getGameTitle(game),
            gameLevel: levelSelect.value ? levelSelect.value.toUpperCase() : levelRaw,
            date: "-",
            bestTime: "-",
            totalPlayed: "-",
            totalScore: "-",
            timeList: "-",
            distanceList: "-",
            movementStabilityList: "-",
            pinchAccuracyList: "-",
            graspStabilityList: "-",
            graspPrecisionList: "-",
            traceStabilityList: "-"
        };
    }

    const cacheKey = `${game}-${levelRaw}-${selectedDate}`;
    if (cache[cacheKey]) return cache[cacheKey];

    // Get logged-in user's email
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) {
        console.error("User not logged in or error:", userError);
        return {};
    }
    const userEmail = userData.user.email;

    // Determine table and title
    let table, gameTitle;
    if (game === "buzz") {
        table = "buzztap_results";
        gameTitle = "Buzz Tap!";
    } else if (game === "shape") {
        table = "shapesense_results";
        gameTitle = "Shape Sense";
    } else if (game === "orb") {
        table = "orbcatcher_results";
        gameTitle = "Orb Catcher";
    } else if (game === "road") {
        table = "roadtracer_results";
        gameTitle = "Road Tracer";
    } else if (game === "fruit") {
        table = "fruitsync_results";
        gameTitle = "Fruit Sync";
    }

    // Local day range (timezone-safe)
    const localStart = new Date(selectedDate + "T00:00:00");
    const localEnd = new Date(selectedDate + "T23:59:59");
    const startUTC = localStart.toISOString();
    const endUTC = localEnd.toISOString();
    console.log("UTC Filter:", startUTC, endUTC);

    // Build query and apply level filter only when a specific level is selected
    let query = supabase
        .from(table)
        .select("*", { count: "exact" })
        .eq("player_email", userEmail)
        .gte("created_at", startUTC)
        .lte("created_at", endUTC)
        .order("time_taken", { ascending: true });

    if (levelRaw !== "ALL") {
        // include records with matching level or null
        query = query.or(`level.eq.${levelRaw},level.is.null`);
    }

    const { data, count, error } = await query;

    if (error) {
        console.error("Supabase Error:", error);
        return {
            gameName: gameTitle,
            date: selectedDate,
            bestTime: "-",
            totalPlayed: "-",
            totalScore: "-",
            timeList: "-",
            distanceList: "-",
            movementStabilityList: "-",
            pinchAccuracyList: "-",
            graspStabilityList: "-",
            graspPrecisionList: "-",
            traceStabilityList: "-"
        };
    }

    const bestRecord = data?.[0];

    // Total score = last record score (if any)
    let totalScore = data && data.length > 0 ? (data[data.length - 1].score ?? 0) : "-";

    // Time list
    const timeList = data?.map(r => (typeof r.time_taken === "number" ? r.time_taken.toFixed(1) + "s" : null))
                       .filter(v => v !== null) || [];

    // Distance list (for Buzz Tap, Shape Sense, Orb Catcher, Road Tracer, and Fruit Sync)
    let distanceList = "-";
    if (game === "buzz" || game === "shape" || game === "orb" || game === "road" || game === "fruit") {
        const dist = data?.map(r => (r.totaldistance != null ? r.totaldistance.toFixed(1) + "px" : null))
                          .filter(v => v !== null) || [];
        distanceList = dist.length > 0 ? dist.join(", ") : "-";
    }
    
    // Movement Stability (for Buzz Tap)
    const movementStabilityList = data?.map(r => (r.av_devpath != null ? r.av_devpath.toFixed(1) + "%" : null))
                                       .filter(v => v !== null) || [];

    // Pinch Accuracy (precision) - for Shape Sense
    const pinchAccuracyList = data?.map(r => (r.precision != null ? r.precision.toFixed(1) + "%" : null))
                                   .filter(v => v !== null) || [];

    // Grasp Stability (graspstability) - for Orb Catcher
    const graspStabilityList = data?.map(r => (r.graspstability != null ? r.graspstability.toFixed(1) + "%" : null))
                                    .filter(v => v !== null) || [];
 
    // Grasp Precision (graspprecision) - for Fruit Sync
    const graspPrecisionList = data?.map(r => (r.grasp_precision != null ? r.grasp_precision.toFixed(1) + "%" : null))
                                    .filter(v => v !== null) || [];

    // Trace Stability (tracestability) - for Road Tracer
    const traceStabilityList = data?.map(r => (r.tracestability != null ? r.tracestability.toFixed(1) + "%" : null))
                                    .filter(v => v !== null) || [];

    const result = {
        gameName: gameTitle,
        gameLevel: levelSelect.value ? levelSelect.value.toUpperCase() : levelRaw,
        date: selectedDate,
        bestTime: bestRecord?.time_taken ? bestRecord.time_taken.toFixed(1) + "s" : "-",
        totalPlayed: count || 0,
        totalScore,
        timeList: timeList.length > 0 ? timeList.join(", ") : "-",
        distanceList,
        movementStabilityList: movementStabilityList.length > 0 ? movementStabilityList.join(", ") : "-",
        pinchAccuracyList: pinchAccuracyList.length > 0 ? pinchAccuracyList.join(", ") : "-",
        graspStabilityList: graspStabilityList.length > 0 ? graspStabilityList.join(", ") : "-",
        graspPrecisionList: graspPrecisionList.length > 0 ? graspPrecisionList.join(", ") : "-",
        traceStabilityList: traceStabilityList.length > 0 ? traceStabilityList.join(", ") : "-"
    };

    cache[cacheKey] = result;
    return result;
}


// ==========================================================
// FUNCTION: Get Game Title
// ==========================================================
function getGameTitle(game) {
    const titles = {
        buzz: "Buzz Tap!",
        shape: "Shape Sense",
        orb: "Orb Catcher",
        road: "Road Tracer",
        fruit: "Fruit Sync"
    };
    return titles[game] || "Unknown Game";
}


// ==========================================================
// FUNCTION: Show/Hide fields based on game
// ==========================================================
function updateFieldVisibility(game) {
    // Modal elements
    const scMovementStabilityRow = scMovementStabilityList?.closest('p');
    const scPinchAccuracyRow = scPinchAccuracyList?.closest('p');
    const scGraspStabilityRow = scGraspStabilityList?.closest('p');
    const scGraspPrecisionRow = scGraspPrecisionList?.closest('p');
    const scTraceStabilityRow = scTraceStabilityList?.closest('p');

    // PDF elements
    const pdfMovementStabilityRow = pdfMovementStabilityList?.closest('p');
    const pdfPinchAccuracyRow = pdfPinchAccuracyList?.closest('p');
    const pdfGraspStabilityRow = pdfGraspStabilityList?.closest('p');
    const pdfGraspPrecisionRow = pdfGraspPrecisionList?.closest('p');
    const pdfTraceStabilityRow = pdfTraceStabilityList?.closest('p');

    // Hide all first
    if (scMovementStabilityRow) scMovementStabilityRow.style.display = 'none';
    if (scPinchAccuracyRow) scPinchAccuracyRow.style.display = 'none';
    if (scGraspStabilityRow) scGraspStabilityRow.style.display = 'none';
    if (scGraspPrecisionRow) scGraspPrecisionRow.style.display = 'none';
    if (scTraceStabilityRow) scTraceStabilityRow.style.display = 'none';
    if (pdfMovementStabilityRow) pdfMovementStabilityRow.style.display = 'none';
    if (pdfPinchAccuracyRow) pdfPinchAccuracyRow.style.display = 'none';
    if (pdfGraspStabilityRow) pdfGraspStabilityRow.style.display = 'none';
    if (pdfGraspPrecisionRow) pdfGraspPrecisionRow.style.display = 'none';
    if (pdfTraceStabilityRow) pdfTraceStabilityRow.style.display = 'none';

    // Show relevant field based on game
    if (game === "buzz") {
        if (scMovementStabilityRow) scMovementStabilityRow.style.display = 'block';
        if (pdfMovementStabilityRow) pdfMovementStabilityRow.style.display = 'block';
    } else if (game === "shape") {
        if (scPinchAccuracyRow) scPinchAccuracyRow.style.display = 'block';
        if (pdfPinchAccuracyRow) pdfPinchAccuracyRow.style.display = 'block';
    } else if (game === "orb") {
        if (scGraspStabilityRow) scGraspStabilityRow.style.display = 'block';
        if (pdfGraspStabilityRow) pdfGraspStabilityRow.style.display = 'block';
    } else if (game === "road") {
        if (scTraceStabilityRow) scTraceStabilityRow.style.display = 'block';
        if (pdfTraceStabilityRow) pdfTraceStabilityRow.style.display = 'block';
    } else if (game === "fruit") {
        if (scGraspPrecisionRow) scGraspPrecisionRow.style.display = 'block';
        if (pdfGraspPrecisionRow) pdfGraspPrecisionRow.style.display = 'block';
    }
}


// ==========================================================
// 1. OPEN SCORE CARD MODAL
// ==========================================================
scoreCardBtn.addEventListener("click", async () => {
    // Load profile data first
    const profileLoaded = await loadProfileData();
    if (!profileLoaded) {
        return; // Don't open modal if profile data is incomplete
    }
    
    scoreCardModal.style.display = "flex";

    const result = await getGameStatsByDate();

    scGameName.textContent = result.gameName;
    scGameLevel.textContent = result.gameLevel;
    scBestTime.textContent = result.bestTime;
    scTotalPlayed.textContent = result.totalPlayed;
    scTotalScore.textContent = result.totalScore;
    scTimeList.textContent = result.timeList;
    scDistanceList.textContent = result.distanceList;
    scMovementStabilityList.textContent = result.movementStabilityList;
    scPinchAccuracyList.textContent = result.pinchAccuracyList;
    scGraspStabilityList.textContent = result.graspStabilityList;
    scGraspPrecisionList.textContent = result.graspPrecisionList;
    scTraceStabilityList.textContent = result.traceStabilityList;

    // Update visibility based on game
    const game = gameSelect?.value || "buzz";
    updateFieldVisibility(game);
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
    scGameLevel.textContent = result.gameLevel;  
    scBestTime.textContent = result.bestTime;
    scTotalPlayed.textContent = result.totalPlayed;
    scTotalScore.textContent = result.totalScore;
    scTimeList.textContent = result.timeList;
    scDistanceList.textContent = result.distanceList;
    scMovementStabilityList.textContent = result.movementStabilityList;
    scPinchAccuracyList.textContent = result.pinchAccuracyList;
    scGraspStabilityList.textContent = result.graspStabilityList;
    scGraspPrecisionList.textContent = result.graspPrecisionList;
    scTraceStabilityList.textContent = result.traceStabilityList;

    // Update visibility based on game
    const game = gameSelect?.value || "buzz";
    updateFieldVisibility(game);
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

    pdfChildName.textContent = inputChild.textContent;
    pdfAge.textContent = inputAge.textContent;
    pdfHealth.textContent = inputHealth.textContent;
    pdfParent.textContent = inputParent.textContent;
    pdfSessionDate.textContent = inputDate.value;

    pdfGameName.textContent = scGameName.textContent;
    pdfGameLevel.textContent = scGameLevel.textContent;
    pdfBestTime.textContent = scBestTime.textContent;
    pdfGamesPlayed.textContent = scTotalPlayed.textContent;
    pdfTotalScore.textContent = scTotalScore.textContent;
    pdfTimeList.textContent = scTimeList.textContent;
    pdfDistanceList.textContent = scDistanceList.textContent;
    pdfMovementStabilityList.textContent = scMovementStabilityList.textContent;
    pdfPinchAccuracyList.textContent = scPinchAccuracyList.textContent;
    pdfGraspStabilityList.textContent = scGraspStabilityList.textContent;
    pdfGraspPrecisionList.textContent = scGraspPrecisionList.textContent;
    pdfTraceStabilityList.textContent = scTraceStabilityList.textContent;

    const element = document.getElementById("scorecardPrint");
    const canvas = await html2canvas(element, { scale: 2 });
    const imgData = canvas.toDataURL("image/jpeg", 2.0);

    const pdf = new jsPDF("p", "pt", "a4");
    const pdfWidth = pdf.internal.pageSize.getWidth();
    const imgWidth = pdfWidth - 40;
    const imgHeight = canvas.height * (imgWidth / canvas.width);

    pdf.addImage(imgData, "JPEG", 20, 20, imgWidth, imgHeight);
    pdf.save(`ScoreCard_${inputChild.textContent}.pdf`);
});