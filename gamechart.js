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
  if (value >= 70) color = "#4CAF50";      // green
  else if (value >= 40) color = "#FFEB3B"; // yellow
  else color = "#F44336";                  // red

  // Center text plugin
  const centerTextPlugin = {
    id: "centerText",
    afterDraw(chart) {
      const { ctx, chartArea: { width, height } } = chart;
      ctx.save();
      ctx.font = "bold 16px Poppins";
      ctx.fillStyle = "#333";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(value.toFixed(1) + "%", width / 2, height * 0.75);
      ctx.restore();
    }
  };

  window.consistencyGaugeChart = new Chart(ctx, {
    type: "doughnut",
    data: {
      labels: ["Consistency", "Remaining"],
      datasets: [{
        data: [value, 100 - value],
        backgroundColor: [color, "#e0e0e0"],
        borderWidth: 0
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
