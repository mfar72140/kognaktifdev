// =========================
// Fireworks Animation (Enhanced + Happy Sun Floating)
// =========================

class FireworkParticle {
  constructor(x, y, color) {
    this.x = x;
    this.y = y;
    this.color = color;
    this.size = Math.random() * 3 + 2;
    this.speedX = (Math.random() - 0.5) * (Math.random() * 10); // varied speed
    this.speedY = (Math.random() - 0.7) * (Math.random() * 10);
    this.alpha = 1;
    this.gravity = 0.1;
    this.trail = [{ x: this.x, y: this.y }];
  }

  update() {
    this.trail.push({ x: this.x, y: this.y });
    if (this.trail.length > 8) this.trail.shift();

    this.x += this.speedX;
    this.y += this.speedY;
    this.speedY += this.gravity;
    this.alpha -= 0.015;
  }

  draw(ctx) {
    ctx.save();

    // Draw trail
    for (let i = 1; i < this.trail.length; i++) {
      const p1 = this.trail[i - 1];
      const p2 = this.trail[i];
      ctx.strokeStyle = this.color;
      ctx.globalAlpha = (this.alpha * i) / this.trail.length;
      ctx.lineWidth = this.size / 2;
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
    }

    // Draw particle
    ctx.globalAlpha = this.alpha;
    ctx.fillStyle = this.color;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  isAlive() {
    return this.alpha > 0;
  }
}

// =========================
// Happy Sun (Independent Floating)
// =========================
class HappySun {
  constructor(img) {
    this.img = img;
    this.size = 150;
    this.x = canvas.width / 2;
    this.y = canvas.height / 2;
    this.angle = 0.1;
    this.rotation = 0;
    this.rotationSpeed = 0.02;
    this.floatSpeed = 0.01;
    this.time = 0;
    this.pathRadius = 250; // circular movement range
  }

  update() {
    this.time += this.floatSpeed;
    this.rotation += this.rotationSpeed;

    // Move in gentle circle or figure-eight motion
    this.x = canvas.width / 2 + Math.cos(this.time) * this.pathRadius;
    this.y = canvas.height / 2 + Math.sin(this.time * 1.5) * (this.pathRadius / 1.5);
  }

  draw(ctx) {
    if (!this.img.complete) return;
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.rotation);
    ctx.drawImage(this.img, -this.size / 2, -this.size / 2, this.size, this.size);
    ctx.restore();
  }
}

// =========================
// Firework Control Logic
// =========================
let fireworks = [];
let fireworksRunning = false;
let happySun = null;

const sunImg = new Image();
sunImg.src = "images/happy_sun.png"; // make sure this path is correct

function startFireworks() {
  fireworks = [];
  fireworksRunning = true;
  happySun = new HappySun(sunImg);

  const fireworkInterval = setInterval(() => {
    if (!fireworksRunning) {
      clearInterval(fireworkInterval);
      return;
    }

    const y = Math.random() * canvas.height * 0.5;
    createFireworkBurst(Math.random() * canvas.width, y, 50);
    if (Math.random() < 0.3)
      createFireworkBurst(Math.random() * canvas.width, y, 30);
  }, 400);
}

function createFireworkBurst(x, y, count = 50) {
  const colors = [
    "#ff3838",
    "#ffb302",
    "#38ff4c",
    "#38b6ff",
    "#d738ff",
    "#ff66cc",
    "#33ffff",
  ];
  for (let i = 0; i < count; i++) {
    const color = colors[Math.floor(Math.random() * colors.length)];
    fireworks.push(new FireworkParticle(x, y, color));
  }
}

function drawFireworks(ctx) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Draw fireworks
  for (let i = fireworks.length - 1; i >= 0; i--) {
    const p = fireworks[i];
    p.update();
    p.draw(ctx);
    if (!p.isAlive()) fireworks.splice(i, 1);
  }

  // Draw happy sun
  if (happySun) {
    happySun.update();
    happySun.draw(ctx);
  }
}

function stopFireworks() {
  fireworksRunning = false;
  happySun = null;
}
