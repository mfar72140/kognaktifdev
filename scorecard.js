// Fake today's data (replace with real)
let todayData = {
    score: 85,
    timeTaken: "32 sec",
    stability: "78%"
};

// Open modal
function openScorecard() {
    document.getElementById("scorecardModal").style.display = "block";
}

// Close modal
function closeScorecard() {
    document.getElementById("scorecardModal").style.display = "none";
}

// Generate preview
function generatePreview() {
    const name = document.getElementById("studentName").value;
    const age = document.getElementById("studentAge").value;
    const teacher = document.getElementById("teacherName").value;

    if (!name || !age || !teacher) {
        alert("Please fill all fields.");
        return;
    }

    document.getElementById("pName").innerText = name;
    document.getElementById("pAge").innerText = age;
    document.getElementById("pTeacher").innerText = teacher;

    document.getElementById("pScore").innerText = todayData.score;
    document.getElementById("pTime").innerText = todayData.timeTaken;
    document.getElementById("pStability").innerText = todayData.stability;

    document.getElementById("scorePreview").classList.remove("hidden");
}

// Download PDF
function downloadPDF() {
    const card = document.getElementById("cardToDownload");

    const options = {
        margin: 10,
        filename: "ScoreCard.pdf",
        image: { type: "jpeg", quality: 1 },
        html2canvas: { scale: 3 },
        jsPDF: { unit: "mm", format: "a4", orientation: "portrait" }
    };

    html2pdf().set(options).from(card).save();
}

// Close modal when clicking outside
window.onclick = function(event) {
    let modal = document.getElementById("scorecardModal");
    if (event.target === modal) {
        closeScorecard();
    }
};
