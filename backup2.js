import { supabase } from './supabaseClient.js';

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
    
    const userEmail = userData.user.email;
    
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
            gameName: game === "buzz" ? "Buzz Tap!" : game === "shape" ? "Shape Sense" : "Orb Catcher",
            gameLevel: levelSelect.value ? levelSelect.value.toUpperCase() : levelRaw,
            date: "-",
            bestTime: "-",
            totalPlayed: "-",
            totalScore: "-",
            timeList: "-",
            distanceList: "-"
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
    const table = game === "buzz" ? "buzztap_results" : game === "shape" ? "shapesense_results" : "orbcatcher_results";
    const gameTitle = game === "buzz" ? "Buzz Tap!" : game === "shape" ? "Shape Sense" : "Orb Catcher";

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
            distanceList: "-"
        };
    }

    const bestRecord = data?.[0];

    // Total score = last record score (if any)
    let totalScore = data && data.length > 0 ? (data[data.length - 1].score ?? 0) : "-";

    // Time list
    const timeList = data?.map(r => (typeof r.time_taken === "number" ? r.time_taken.toFixed(1) + "s" : null))
                       .filter(v => v !== null) || [];

    // Distance list (for Buzz Tap and Orb Catcher)
    let distanceList = "-";
    if (game === "buzz" || game === "orb") {
        const dist = data?.map(r => (r.totaldistance != null ? r.totaldistance.toFixed(1) + "px" : null))
                          .filter(v => v !== null) || [];
        distanceList = dist.length > 0 ? dist.join(", ") : "-";
    }

    const result = {
        gameName: gameTitle,
        gameLevel: levelSelect.value ? levelSelect.value.toUpperCase() : levelRaw,
        date: selectedDate,
        bestTime: bestRecord?.time_taken ? bestRecord.time_taken.toFixed(1) + "s" : "-",
        totalPlayed: count || 0,
        totalScore,
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