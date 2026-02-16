// gamechart.js

// ============================
// Initialize Main Game Chart
// ============================
export function initGameChart(labels, times, norm_distance = [], stability = []) {
  const canvas = document.getElementById("mainChart");
  if (!canvas) {
    console.warn("⚠ mainChart canvas not found. Skipping chart init.");
    return null;
  }

  const ctx = canvas.getContext("2d");

  const mainChart = new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [{
        label: "Time Taken per Play (s)",
        data: times,
        borderColor: "green",
        fill: false
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          labels: {
            font: {
              size: 14,
              family: "Poppins",
              weight: "bold"
            },
            color: "#333"
          }
        },
        tooltip: {
          callbacks: {
            label: function(context) {
              if (context.dataset.label.includes("Stability")) {
                return context.dataset.label + ": " + context.raw.toFixed(2) + "%";
              }
              return context.dataset.label + ": " + context.raw.toFixed(2);
            }
          },
          bodyFont: {
            size: 13,
            family: "Poppins"
          },
          titleFont: {
            size: 14,
            weight: "bold"
          }
        }
      },
      scales: {
        x: {
          ticks: {
            font: {
              size: 11,
              family: "Poppins"
            },
            color: "#444"
          }
        },
        y: {
          ticks: {
            font: {
              size: 11,
              family: "Poppins"
            },
            color: "#444"
          }
        }
      }
    }
  });

  return mainChart;
}

// ============================
// Initialize Consistency Gauge
// ============================
export function initConsistencyGauge(value) {
  const canvas = document.getElementById("consistencyGauge");
  if (!canvas) {
    console.warn("⚠ consistencyGauge canvas not found. Skipping chart init.");
    return null;
  }

  const ctx = canvas.getContext("2d");

  // Destroy previous chart if exists
  if (window.consistencyGaugeChart) {
    window.consistencyGaugeChart.destroy();
  }

  // Decide gauge color
  let color;
  if (value >= 75) color = "#43a047";       // strong
  else if (value >= 50) color = "#fbc02d";  // developing
  else color = "#e53935";                   // needs support


  // Center text plugin
  const centerTextPlugin = {
    id: "centerText",
    afterDraw(chart) {
      const { ctx, chartArea } = chart;
      const centerX = chartArea.left + (chartArea.right - chartArea.left) / 2;
      const centerY = chartArea.top + (chartArea.bottom - chartArea.top) / 1.3;

      ctx.save();

      ctx.font = "bold 22px Poppins";
      ctx.fillStyle = "#333";
      ctx.textAlign = "center";
      ctx.fillText(value.toFixed(0) + "%", centerX, centerY);

      ctx.font = "12px Poppins";
      ctx.fillStyle = "#777";
      ctx.fillText("Consistency Score", centerX, centerY + 20);

      ctx.restore();
    }
  };


  window.consistencyGaugeChart = new Chart(ctx, {
    type: "doughnut",
    data: {
      labels: ["Consistency", "Remaining"],
      datasets: [{
        data: [
          value,                 // filled portion
          100 - value            // empty
        ],
        backgroundColor: [
          color,
          "#eeeeee"
        ],
        borderWidth: 0,
        borderRadius: 8
      }]

    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      rotation: -90,
      circumference: 180,
      cutout: "70%",
      plugins: {
        legend: { display: false },
        tooltip: { enabled: false }
      }
    },
    plugins: [centerTextPlugin]
  });

  return window.consistencyGaugeChart;
}
