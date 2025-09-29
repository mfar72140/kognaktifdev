// gamechart.js

export function initGameChart(labels, times, norm_distance, stability) {
  const ctx = document.getElementById("mainChart").getContext("2d");

  let mainChart = new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [{
        label: "Time Taken (s)",
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
              size: 12,
              family: "Poppins"
            },
            color: "#444"
          }
        },
        y: {
          ticks: {
            font: {
              size: 12,
              family: "Poppins"
            },
            color: "#444"
          }
        }
      }
    }
  });

  // ✅ Tab switch logic
  document.querySelectorAll(".tab-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");

      if (btn.dataset.chart === "time") {
        mainChart.data.datasets[0].label = "Time Taken (s)";
        mainChart.data.datasets[0].data = times;
        mainChart.data.datasets[0].borderColor = "green";
      } else if (btn.dataset.chart === "distance") {
        mainChart.data.datasets[0].label = "Norm Distance";
        mainChart.data.datasets[0].data = norm_distance;
        mainChart.data.datasets[0].borderColor = "blue";
      } else if (btn.dataset.chart === "stability") {
        mainChart.data.datasets[0].label = "Movement Stability (%)";
        mainChart.data.datasets[0].data = stability;
        mainChart.data.datasets[0].borderColor = "orange";
      }

      mainChart.update();
    });
  });

  return mainChart;
}

// ========================
// Consistency Gauge
// ========================
export function initConsistencyGauge(value) {
  const ctx = document.getElementById("consistencyGauge").getContext("2d");

  // Decide color based on value
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


  new Chart(ctx, {
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
}
