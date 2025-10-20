const canvas = document.getElementById("puzzleCanvas");
const ctx = canvas.getContext("2d");

const rows = 2;  // number of pieces vertically
const cols = 2;  // number of pieces horizontally
const pieceSize = 200; // base piece size
canvas.width = cols * pieceSize;
canvas.height = rows * pieceSize;

const img = new Image();
img.src = "images/watermelon.png"; // your uploaded image
img.onload = () => {
  drawPuzzle();
};

function drawPuzzle() {
  const tabSize = 25; // controls bump size

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const px = x * pieceSize;
      const py = y * pieceSize;

      ctx.save();
      ctx.beginPath();

      // Move to top-left
      ctx.moveTo(px, py);

      // 🔹 Top edge
      if (y === 0) ctx.lineTo(px + pieceSize, py);
      else makeEdge(px, py, "top", x, y, tabSize);

      // 🔹 Right edge
      if (x === cols - 1) ctx.lineTo(px + pieceSize, py + pieceSize);
      else makeEdge(px, py, "right", x, y, tabSize);

      // 🔹 Bottom edge
      if (y === rows - 1) ctx.lineTo(px, py + pieceSize);
      else makeEdge(px, py, "bottom", x, y, tabSize);

      // 🔹 Left edge
      if (x === 0) ctx.lineTo(px, py);
      else makeEdge(px, py, "left", x, y, tabSize);

      ctx.closePath();
      ctx.clip();
      ctx.drawImage(
        img,
        x * (img.width / cols),
        y * (img.height / rows),
        img.width / cols,
        img.height / rows,
        px,
        py,
        pieceSize,
        pieceSize
      );
      ctx.restore();
    }
  }
}

// 🔧 Create curved edges (tabs and blanks)
function makeEdge(px, py, side, x, y, size) {
  const curveDepth = size * 0.7;
  const mid = pieceSize / 2;
  const direction = Math.random() > 0.5 ? 1 : -1; // random tab or blank

  if (side === "top") {
    ctx.lineTo(px + mid - size, py);
    ctx.bezierCurveTo(px + mid - size / 2, py - direction * curveDepth,
                      px + mid + size / 2, py - direction * curveDepth,
                      px + mid + size, py);
    ctx.lineTo(px + pieceSize, py);
  }

  if (side === "right") {
    ctx.lineTo(px + pieceSize, py + mid - size);
    ctx.bezierCurveTo(px + pieceSize + direction * curveDepth, py + mid - size / 2,
                      px + pieceSize + direction * curveDepth, py + mid + size / 2,
                      px + pieceSize, py + mid + size);
    ctx.lineTo(px + pieceSize, py + pieceSize);
  }

  if (side === "bottom") {
    ctx.lineTo(px + mid + size, py + pieceSize);
    ctx.bezierCurveTo(px + mid + size / 2, py + pieceSize + direction * curveDepth,
                      px + mid - size / 2, py + pieceSize + direction * curveDepth,
                      px + mid - size, py + pieceSize);
    ctx.lineTo(px, py + pieceSize);
  }

  if (side === "left") {
    ctx.lineTo(px, py + mid + size);
    ctx.bezierCurveTo(px - direction * curveDepth, py + mid + size / 2,
                      px - direction * curveDepth, py + mid - size / 2,
                      px, py + mid - size);
    ctx.lineTo(px, py);
  }
}
