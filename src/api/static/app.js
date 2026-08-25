// =============================================================
// PulseStar Fleet Telematics & AI Analytics Platform - Main App
// =============================================================

// Global Application State
let fleetSummary = {};
let driversData = [];
let vehiclesData = [];
let currentTripsSamples = {};
let currentTripId = "T001";
let tripLeafletMap = null;
let accelChartInstance = null;
let gyroChartInstance = null;

// Driver & Vehicle Analytics Chart Instances
let scoreDistChartInstance = null;
let driverRadarChartInstance = null;
let brakeAccelScatterInstance = null;
let vehiclePieChartInstance = null;
let vehicleRulChartInstance = null;

// Cockpit Stream State
let cockpitSocket = null;
let isStreamPaused = false;
let liveCockpitMap = null;
let liveVehicleMarker = null;
let liveRoutePolyline = null;
let liveRoutePoints = [];
let liveAccChart = null;
let ggCanvas = null;
let ggCtx = null;
let ggHistory = [];
let liveStreamInterval = null;

// Initialize on DOM Ready
document.addEventListener("DOMContentLoaded", async () => {
  setupNavigation();
  setupViewToggles();
  setupFilters();
  setupMLSimulator();
  setupCockpitStream();
  await loadInitialData();
  lucide.createIcons();
});

// -------------------------------------------------------------
// 1. Navigation & Tab Switching
// -------------------------------------------------------------
function setupNavigation() {
  const navLinks = document.querySelectorAll(".side-nav-link");
  const tabPanes = document.querySelectorAll(".tab-pane");
  const breadcrumb = document.getElementById("current-breadcrumb");

  navLinks.forEach((link) => {
    link.addEventListener("click", () => {
      navLinks.forEach((l) => l.classList.remove("active"));
      tabPanes.forEach((p) => p.classList.remove("active"));

      link.classList.add("active");
      const targetId = link.getAttribute("data-tab");
      const targetPane = document.getElementById(targetId);
      if (targetPane) {
        targetPane.classList.add("active");
      }

      const linkText = link.querySelector("span") ? link.querySelector("span").textContent.trim() : "";
      if (breadcrumb) breadcrumb.textContent = linkText;

      if (targetId === "trip-explorer") {
        setTimeout(() => {
          if (tripLeafletMap) tripLeafletMap.invalidateSize();
          renderTripCharts(currentTripId);
        }, 150);
      } else if (targetId === "live-cockpit") {
        setTimeout(() => {
          if (liveCockpitMap) liveCockpitMap.invalidateSize();
        }, 150);
      }
      lucide.createIcons();
    });
  });

  // Modal Closers
  const closeDriver = document.getElementById("closeDriverModal");
  const dModal = document.getElementById("driverModal");
  if (closeDriver && dModal) {
    closeDriver.addEventListener("click", () => dModal.classList.remove("active"));
    dModal.addEventListener("click", (e) => {
      if (e.target === dModal) dModal.classList.remove("active");
    });
  }

  const closeVeh = document.getElementById("closeVehicleModal");
  const vModal = document.getElementById("vehicleModal");
  if (closeVeh && vModal) {
    closeVeh.addEventListener("click", () => vModal.classList.remove("active"));
    vModal.addEventListener("click", (e) => {
      if (e.target === vModal) vModal.classList.remove("active");
    });
  }
}

// -------------------------------------------------------------
// 2. View Toggles (Cards vs Table)
// -------------------------------------------------------------
function setupViewToggles() {
  // Driver Tab Toggle
  const btnDriverCards = document.getElementById("btn-driver-cards");
  const btnDriverTable = document.getElementById("btn-driver-table");
  const driverCardsWrap = document.getElementById("drivers-cards-container");
  const driverTableWrap = document.getElementById("drivers-table-container");

  if (btnDriverCards && btnDriverTable && driverCardsWrap && driverTableWrap) {
    btnDriverCards.addEventListener("click", () => {
      btnDriverCards.classList.add("active");
      btnDriverTable.classList.remove("active");
      driverCardsWrap.style.display = "grid";
      driverTableWrap.style.display = "none";
    });
    btnDriverTable.addEventListener("click", () => {
      btnDriverTable.classList.add("active");
      btnDriverCards.classList.remove("active");
      driverCardsWrap.style.display = "none";
      driverTableWrap.style.display = "block";
    });
  }

  // Vehicle Tab Toggle
  const btnVehCards = document.getElementById("btn-veh-cards");
  const btnVehTable = document.getElementById("btn-veh-table");
  const vehCardsWrap = document.getElementById("vehicles-cards-container");
  const vehTableWrap = document.getElementById("vehicles-table-container");

  if (btnVehCards && btnVehTable && vehCardsWrap && vehTableWrap) {
    btnVehCards.addEventListener("click", () => {
      btnVehCards.classList.add("active");
      btnVehTable.classList.remove("active");
      vehCardsWrap.style.display = "grid";
      vehTableWrap.style.display = "none";
    });
    btnVehTable.addEventListener("click", () => {
      btnVehTable.classList.add("active");
      btnVehCards.classList.remove("active");
      vehCardsWrap.style.display = "none";
      vehTableWrap.style.display = "block";
    });
  }
}

// -------------------------------------------------------------
// 3. Data Loading with Static Host / GitHub Pages Fallback
// -------------------------------------------------------------
async function fetchEndpointOrFallback(apiPath, fallbackPath) {
  try {
    const res = await fetch(apiPath);
    if (res.ok) {
      return await res.json();
    }
  } catch (e) {
    // API endpoint unreachable, fallback
  }
  try {
    const resFallback = await fetch(fallbackPath);
    if (resFallback.ok) {
      return await resFallback.json();
    }
  } catch (e) {
    console.warn(`Fallback fetch failed for ${fallbackPath}:`, e);
  }
  return null;
}

async function loadInitialData() {
  try {
    const [sumData, dData, vData, potData] = await Promise.all([
      fetchEndpointOrFallback("/api/fleet/summary", "./data/fleet_summary.json"),
      fetchEndpointOrFallback("/api/drivers", "./data/processed_drivers.json"),
      fetchEndpointOrFallback("/api/vehicles", "./data/processed_vehicles.json"),
      fetchEndpointOrFallback("/api/potholes/gis", "./data/pothole_gis_sample.json")
    ]);

    if (sumData) {
      fleetSummary = sumData;
      renderKPIs();
    }
    if (dData) {
      driversData = dData;
      renderDrivers(driversData);
      renderDriverAnalyticsCharts(driversData);
    }
    if (vData) {
      vehiclesData = vData;
      renderVehicles(vehiclesData);
      renderVehicleAnalyticsCharts(vehiclesData);
    }
    if (potData) {
      renderPotholes(potData);
    }

    // Load initial trip sample
    await loadTripTelemetry("T001");
  } catch (err) {
    console.error("Failed loading initial telematics data:", err);
  }
}

// -------------------------------------------------------------
// 4. Render Fleet KPIs
// -------------------------------------------------------------
function renderKPIs() {
  const setTxt = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  };

  const avgScore = fleetSummary.Avg_Driver_Safety_Score || fleetSummary.avg_driver_safety_score || 75.9;
  const safeCount = fleetSummary.Safe_Drivers_Count || fleetSummary.safe_drivers_count || 22;
  const modCount = fleetSummary.Moderate_Drivers_Count || fleetSummary.moderate_drivers_count || 3;
  const highCount = fleetSummary.High_Risk_Drivers_Count || fleetSummary.high_risk_drivers_count || 5;

  setTxt("kpi-avg-score", typeof avgScore === "number" ? avgScore.toFixed(1) : avgScore);
  setTxt("kpi-safe-count", safeCount);
  setTxt("kpi-mod-count", modCount);
  setTxt("kpi-high-count", highCount);

  const avgHealth = fleetSummary.Avg_Vehicle_Health_Index || fleetSummary.avg_vehicle_health_index || 84.3;
  const optCount = fleetSummary.Healthy_Vehicles_Count || fleetSummary.optimal_vehicles_count || 27;
  const urgCount = fleetSummary.Monitor_Vehicles_Count || fleetSummary.urgent_service_count || 0;
  const critCount = fleetSummary.Critical_Vehicles_Count || fleetSummary.critical_grounding_count || 3;

  setTxt("kpi-avg-health", typeof avgHealth === "number" ? avgHealth.toFixed(1) + "%" : avgHealth + "%");
  setTxt("kpi-optimal-count", optCount);
  setTxt("kpi-urgent-count", urgCount);
  setTxt("kpi-critical-count", critCount);
}

// -------------------------------------------------------------
// 5. Render Driver Cards & Table
// -------------------------------------------------------------
function renderDrivers(list) {
  const container = document.getElementById("drivers-cards-container");
  const tbody = document.getElementById("driver-table-body");
  if (!container) return;

  container.innerHTML = "";
  if (tbody) tbody.innerHTML = "";

  list.forEach((d) => {
    const name = d.Driver_Name || d.Name || "Driver";
    const id = d.Driver_ID || "D00";
    const zone = d.Primary_Zone || "North";
    const shift = d.Shift_Preference || "Morning";
    const archetype = d.Archetype || "Standard";
    const score = typeof d.Safety_Score === "number" ? d.Safety_Score : 75.0;
    const tier = d.Tier || (score >= 82 ? "Safe & Exemplary" : score >= 65 ? "Moderate Risk" : "High Risk / Aggressive");

    const brakeRate = typeof d.Harsh_Brake_Rate_Per_100KM === "number" ? d.Harsh_Brake_Rate_Per_100KM : (d.Harsh_Brake_Rate_100km || 0);
    const accelRate = typeof d.Rapid_Accel_Rate_Per_100KM === "number" ? d.Rapid_Accel_Rate_Per_100KM : (d.Rapid_Accel_Rate_100km || 0);
    const speedScore = typeof d.Speed_Compliance_Score === "number" ? d.Speed_Compliance_Score : 95.0;
    const nightPct = typeof d.Night_Trip_Pct === "number" ? d.Night_Trip_Pct : 20.0;

    let riskBadgeCls = "low";
    let badgeColor = "badge-green";
    if (score < 65) {
      riskBadgeCls = "high";
      badgeColor = "badge-red";
    } else if (score < 82) {
      riskBadgeCls = "medium";
      badgeColor = "badge-orange";
    }

    const coaching = Array.isArray(d.Coaching_Feedback) ? d.Coaching_Feedback[0] : (d.Coaching_Feedback || "Optimal compliance profile maintained.");

    // Entity Card
    const card = document.createElement("div");
    card.className = "neo-entity-card";
    card.onclick = () => openDriverModal(d);
    card.innerHTML = `
      <div class="entity-top">
        <div class="entity-name">
          <h3>${name}</h3>
          <div class="entity-sub-text">${id} • ${archetype} • ${zone}</div>
        </div>
        <div class="neubrutal-badge ${riskBadgeCls}">
          <div class="badge-score-val">${score.toFixed(1)}</div>
          <div class="badge-score-lbl">${tier}</div>
        </div>
      </div>
      <div class="metrics-block">
        <div class="m-item">
          <span class="m-lbl">Harsh Brake /100km</span>
          <span class="m-val">${brakeRate.toFixed(2)}</span>
        </div>
        <div class="m-item">
          <span class="m-lbl">Rapid Accel /100km</span>
          <span class="m-val">${accelRate.toFixed(2)}</span>
        </div>
        <div class="m-item">
          <span class="m-lbl">Speed Compliance</span>
          <span class="m-val">${speedScore.toFixed(0)}%</span>
        </div>
        <div class="m-item">
          <span class="m-lbl">Night Shift Trips</span>
          <span class="m-val">${nightPct.toFixed(0)}%</span>
        </div>
      </div>
      <div class="card-action-box">
        <strong>Action:</strong> ${coaching}
      </div>
    `;
    container.appendChild(card);

    // Table Row
    if (tbody) {
      const tr = document.createElement("tr");
      tr.onclick = () => openDriverModal(d);
      tr.innerHTML = `
        <td><strong>${name}</strong> <span style="font-family:'JetBrains Mono';font-size:0.8rem;color:#4b5563;">(${id})</span></td>
        <td><span class="side-badge badge-yellow">${archetype}</span></td>
        <td>${zone} / ${shift}</td>
        <td><span class="side-badge ${badgeColor}">${score.toFixed(1)}</span></td>
        <td>${brakeRate.toFixed(2)}</td>
        <td>${accelRate.toFixed(2)}</td>
        <td>${speedScore.toFixed(0)}%</td>
        <td><button class="btn-neo" style="padding:0.25rem 0.65rem;font-size:0.75rem;">Inspect</button></td>
      `;
      tbody.appendChild(tr);
    }
  });

  lucide.createIcons();
}

// -------------------------------------------------------------
// 6. Render Vehicle Cards & Table
// -------------------------------------------------------------
function renderVehicles(list) {
  const container = document.getElementById("vehicles-cards-container");
  const tbody = document.getElementById("vehicle-table-body");
  if (!container) return;

  container.innerHTML = "";
  if (tbody) tbody.innerHTML = "";

  list.forEach((v) => {
    const id = v.Vehicle_ID || "V00";
    const model = v.Model || "Honda Activa";
    const type = v.Vehicle_Type || "ICE Scooter";
    const year = v.Manufacturing_Year || 2022;
    const health = typeof v.Health_Index === "number" ? v.Health_Index : 85.0;
    const rul = typeof v.Remaining_Useful_Life_Days === "number" ? v.Remaining_Useful_Life_Days : (v.RUL_Days || 120);
    const status = v.Status || (health >= 80 ? "Optimal / Healthy" : health >= 60 ? "Monitor / Moderate Wear" : "Critical / Service Due");

    const vib = typeof v.Vibration_RMS === "number" ? v.Vibration_RMS : 0.65;
    const jitter = typeof v.Gyro_Jitter === "number" ? v.Gyro_Jitter : 8.5;
    const daysService = v.Days_Since_Last_Service || v.Days_Since_Service || 60;
    const odo = v.Odometer_KM || 35000;
    const diag = v.Diagnostic_Summary || v.Primary_Fault_Diagnosis || "All telemetry and vibration parameters nominal.";

    let urgencyCls = "low";
    let badgeColor = "badge-green";
    if (health < 60) {
      urgencyCls = "Immediate";
      badgeColor = "badge-red";
    } else if (health < 80) {
      urgencyCls = "medium";
      badgeColor = "badge-orange";
    }

    // Entity Card
    const card = document.createElement("div");
    card.className = "neo-entity-card";
    card.onclick = () => openVehicleModal(v);
    card.innerHTML = `
      <div class="entity-top">
        <div class="entity-name">
          <h3>${model}</h3>
          <div class="entity-sub-text">${id} • ${type} • ${year}</div>
        </div>
        <div class="neubrutal-badge ${urgencyCls}">
          <div class="badge-score-val">${health.toFixed(1)}</div>
          <div class="badge-score-lbl">${status.split(" / ")[0]}</div>
        </div>
      </div>
      <div class="metrics-block">
        <div class="m-item">
          <span class="m-lbl">Chassis Vib RMS</span>
          <span class="m-val">${vib.toFixed(3)} g</span>
        </div>
        <div class="m-item">
          <span class="m-lbl">Gyro Yaw Jitter</span>
          <span class="m-val">${jitter.toFixed(1)}°/s</span>
        </div>
        <div class="m-item">
          <span class="m-lbl">Remaining Life (RUL)</span>
          <span class="m-val">${rul} Days</span>
        </div>
        <div class="m-item">
          <span class="m-lbl">Days Since Service</span>
          <span class="m-val">${daysService} D</span>
        </div>
      </div>
      <div class="card-action-box">
        <strong>Diagnosis:</strong> ${diag}
      </div>
    `;
    container.appendChild(card);

    // Table Row
    if (tbody) {
      const tr = document.createElement("tr");
      tr.onclick = () => openVehicleModal(v);
      tr.innerHTML = `
        <td><strong>${id}</strong> - ${model}</td>
        <td>${type} (${year})</td>
        <td><span class="side-badge ${badgeColor}">${health.toFixed(1)}%</span></td>
        <td>${status.split(" / ")[0]}</td>
        <td><strong style="font-family:'JetBrains Mono';">${rul}</strong> Days</td>
        <td>${vib.toFixed(3)} g</td>
        <td>${daysService} Days</td>
        <td><button class="btn-neo" style="padding:0.25rem 0.65rem;font-size:0.75rem;">Inspect</button></td>
      `;
      tbody.appendChild(tr);
    }
  });

  lucide.createIcons();
}

// -------------------------------------------------------------
// 7. Driver Analytics Charts (Score Dist, Radar, Scatter)
// -------------------------------------------------------------
function renderDriverAnalyticsCharts(drivers) {
  if (!drivers || drivers.length === 0) return;

  // 1. Safety Score Distribution Bar Chart
  const safe = drivers.filter((d) => d.Safety_Score >= 82).length;
  const moderate = drivers.filter((d) => d.Safety_Score >= 65 && d.Safety_Score < 82).length;
  const high = drivers.filter((d) => d.Safety_Score < 65).length;

  const distCanvas = document.getElementById("scoreDistChart");
  if (distCanvas) {
    if (scoreDistChartInstance) scoreDistChartInstance.destroy();
    scoreDistChartInstance = new Chart(distCanvas, {
      type: "bar",
      data: {
        labels: ["Safe (≥82)", "Moderate (65–81)", "High Risk (<65)"],
        datasets: [
          {
            label: "Drivers",
            data: [safe, moderate, high],
            backgroundColor: ["#a3e636", "#fde047", "#ff6b6b"],
            borderColor: ["#000", "#000", "#000"],
            borderWidth: 2,
            borderRadius: 4
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: (ctx) => ` ${ctx.raw} Riders` } }
        },
        scales: {
          x: { grid: { display: false }, ticks: { font: { family: "Plus Jakarta Sans", weight: "bold" } } },
          y: { grid: { color: "rgba(0,0,0,0.06)" }, ticks: { stepSize: 5 } }
        }
      }
    });
  }

  // 2. 5-Axis Risk Radar Chart
  const safeCohort = drivers.filter((d) => d.Safety_Score >= 82);
  const highCohort = drivers.filter((d) => d.Safety_Score < 65);
  const avg = (arr, key) => (arr.length ? arr.reduce((s, d) => s + (d[key] || 0), 0) / arr.length : 0);

  const radarCanvas = document.getElementById("driverRadarChart");
  if (radarCanvas) {
    if (driverRadarChartInstance) driverRadarChartInstance.destroy();
    driverRadarChartInstance = new Chart(radarCanvas, {
      type: "radar",
      data: {
        labels: ["Harsh Brakes", "Rapid Accel", "Harsh Turns", "Night Shifts %", "Overspeed %"],
        datasets: [
          {
            label: "Safe Cohort",
            data: [
              avg(safeCohort, "Harsh_Brake_Rate_Per_100KM"),
              avg(safeCohort, "Rapid_Accel_Rate_Per_100KM"),
              avg(safeCohort, "Harsh_Turn_Rate_Per_100KM"),
              avg(safeCohort, "Night_Trip_Pct"),
              avg(safeCohort, "Overspeed_50_Pct")
            ],
            backgroundColor: "rgba(163, 230, 54, 0.3)",
            borderColor: "#a3e636",
            borderWidth: 2.5,
            pointBackgroundColor: "#a3e636",
            pointRadius: 4
          },
          {
            label: "High-Risk Cohort",
            data: [
              avg(highCohort, "Harsh_Brake_Rate_Per_100KM"),
              avg(highCohort, "Rapid_Accel_Rate_Per_100KM"),
              avg(highCohort, "Harsh_Turn_Rate_Per_100KM"),
              avg(highCohort, "Night_Trip_Pct"),
              avg(highCohort, "Overspeed_50_Pct")
            ],
            backgroundColor: "rgba(255, 107, 107, 0.3)",
            borderColor: "#ff6b6b",
            borderWidth: 2.5,
            pointBackgroundColor: "#ff6b6b",
            pointRadius: 4
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: "bottom", labels: { font: { family: "Plus Jakarta Sans", weight: "700", size: 10 } } }
        },
        scales: {
          r: {
            grid: { color: "rgba(0,0,0,0.08)" },
            ticks: { backdropColor: "transparent", font: { size: 9 } },
            pointLabels: { font: { family: "Plus Jakarta Sans", weight: "700", size: 10 } }
          }
        }
      }
    });
  }

  // 3. Brake vs Accel Scatter Plot
  const scatterCanvas = document.getElementById("brakeAccelScatter");
  if (scatterCanvas) {
    if (brakeAccelScatterInstance) brakeAccelScatterInstance.destroy();
    const scatterData = drivers.map((d) => ({
      x: parseFloat(d.Harsh_Brake_Rate_Per_100KM) || 0,
      y: parseFloat(d.Rapid_Accel_Rate_Per_100KM) || 0,
      label: d.Driver_Name,
      score: d.Safety_Score
    }));

    brakeAccelScatterInstance = new Chart(scatterCanvas, {
      type: "scatter",
      data: {
        datasets: [
          {
            label: "Drivers",
            data: scatterData,
            backgroundColor: scatterData.map((d) =>
              d.score >= 82 ? "rgba(163,230,54,0.8)" : d.score >= 65 ? "rgba(253,224,71,0.8)" : "rgba(255,107,107,0.8)"
            ),
            borderColor: "#000",
            borderWidth: 1.5,
            pointRadius: 6,
            pointHoverRadius: 9
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) => {
                const pt = scatterData[ctx.dataIndex];
                return [`${pt.label}`, `Brake: ${pt.x.toFixed(2)} | Accel: ${pt.y.toFixed(2)}`];
              }
            }
          }
        },
        scales: {
          x: { title: { display: true, text: "Harsh Brake Rate /100km", font: { weight: "bold" } }, grid: { color: "rgba(0,0,0,0.06)" } },
          y: { title: { display: true, text: "Rapid Accel Rate /100km", font: { weight: "bold" } }, grid: { color: "rgba(0,0,0,0.06)" } }
        }
      }
    });
  }
}

// -------------------------------------------------------------
// 8. Vehicle Analytics Charts (Donut & RUL Bar)
// -------------------------------------------------------------
function renderVehicleAnalyticsCharts(vehicles) {
  if (!vehicles || vehicles.length === 0) return;

  // 1. Vehicle Health Status Donut Chart
  const healthy = vehicles.filter((v) => v.Health_Index >= 80).length;
  const monitor = vehicles.filter((v) => v.Health_Index >= 60 && v.Health_Index < 80).length;
  const critical = vehicles.filter((v) => v.Health_Index < 60).length;

  const pieCanvas = document.getElementById("vehicleHealthPie");
  if (pieCanvas) {
    if (vehiclePieChartInstance) vehiclePieChartInstance.destroy();
    vehiclePieChartInstance = new Chart(pieCanvas, {
      type: "doughnut",
      data: {
        labels: ["Healthy (≥80)", "Monitor (60–79)", "Critical (<60)"],
        datasets: [
          {
            data: [healthy, monitor, critical],
            backgroundColor: ["#a3e636", "#fde047", "#ff6b6b"],
            borderColor: "#000",
            borderWidth: 2
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: "60%",
        plugins: {
          legend: { position: "bottom", labels: { font: { family: "Plus Jakarta Sans", weight: "700", size: 10 } } }
        }
      }
    });
  }

  // 2. RUL Days Priority Horizontal Bar Chart
  const rulCanvas = document.getElementById("vehicleRulChart");
  if (rulCanvas) {
    if (vehicleRulChartInstance) vehicleRulChartInstance.destroy();
    const sorted = [...vehicles].sort((a, b) => a.Remaining_Useful_Life_Days - b.Remaining_Useful_Life_Days).slice(0, 8);
    vehicleRulChartInstance = new Chart(rulCanvas, {
      type: "bar",
      data: {
        labels: sorted.map((v) => `${v.Vehicle_ID} (${v.Model.split(" ")[0]})`),
        datasets: [
          {
            label: "Remaining Useful Life (Days)",
            data: sorted.map((v) => v.Remaining_Useful_Life_Days),
            backgroundColor: sorted.map((v) =>
              v.Remaining_Useful_Life_Days < 30 ? "#ff6b6b" : v.Remaining_Useful_Life_Days < 90 ? "#fde047" : "#a3e636"
            ),
            borderColor: "#000",
            borderWidth: 2,
            borderRadius: 4
          }
        ]
      },
      options: {
        indexAxis: "y",
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: (ctx) => ` ${ctx.raw} days until maintenance` } }
        },
        scales: {
          x: { grid: { color: "rgba(0,0,0,0.06)" }, title: { display: true, text: "Days", font: { weight: "bold" } } },
          y: { grid: { display: false }, ticks: { font: { family: "JetBrains Mono", size: 10 } } }
        }
      }
    });
  }
}

// -------------------------------------------------------------
// 9. Filters & Search Handlers
// -------------------------------------------------------------
function setupFilters() {
  const dRiskFilter = document.getElementById("driver-risk-filter");
  const dZoneFilter = document.getElementById("driver-zone-filter");
  const dSortSelect = document.getElementById("driver-sort-by");

  const applyDriverFilters = () => {
    let filtered = [...driversData];
    const tier = dRiskFilter ? dRiskFilter.value : "ALL";
    const zone = dZoneFilter ? dZoneFilter.value : "ALL";
    const q = document.getElementById("global-search") ? document.getElementById("global-search").value.toLowerCase().trim() : "";

    if (tier !== "ALL") {
      filtered = filtered.filter((d) => (d.Tier && d.Tier.includes(tier)) || (d.Risk_Level && d.Risk_Level === tier));
    }
    if (zone !== "ALL") {
      filtered = filtered.filter((d) => d.Primary_Zone === zone);
    }
    if (q) {
      filtered = filtered.filter(
        (d) =>
          d.Driver_Name.toLowerCase().includes(q) ||
          d.Driver_ID.toLowerCase().includes(q) ||
          d.Archetype.toLowerCase().includes(q)
      );
    }

    const sortVal = dSortSelect ? dSortSelect.value : "score_desc";
    if (sortVal === "score_desc") filtered.sort((a, b) => b.Safety_Score - a.Safety_Score);
    else if (sortVal === "score_asc") filtered.sort((a, b) => a.Safety_Score - b.Safety_Score);
    else if (sortVal === "brakes_desc") filtered.sort((a, b) => b.Harsh_Brake_Rate_Per_100KM - a.Harsh_Brake_Rate_Per_100KM);
    else if (sortVal === "speeding_desc") filtered.sort((a, b) => b.Overspeed_50_Pct - a.Overspeed_50_Pct);

    renderDrivers(filtered);
  };

  if (dRiskFilter) dRiskFilter.addEventListener("change", applyDriverFilters);
  if (dZoneFilter) dZoneFilter.addEventListener("change", applyDriverFilters);
  if (dSortSelect) dSortSelect.addEventListener("change", applyDriverFilters);

  // Vehicle Filters
  const vStatusFilter = document.getElementById("vehicle-status-filter");
  const vTypeFilter = document.getElementById("vehicle-type-filter");
  const vSortSelect = document.getElementById("vehicle-sort-by");

  const applyVehicleFilters = () => {
    let filtered = [...vehiclesData];
    const status = vStatusFilter ? vStatusFilter.value : "ALL";
    const type = vTypeFilter ? vTypeFilter.value : "ALL";
    const q = document.getElementById("global-search") ? document.getElementById("global-search").value.toLowerCase().trim() : "";

    if (status !== "ALL") {
      filtered = filtered.filter((v) => v.Status && v.Status.includes(status));
    }
    if (type !== "ALL") {
      filtered = filtered.filter((v) => v.Vehicle_Type === type);
    }
    if (q) {
      filtered = filtered.filter(
        (v) =>
          v.Vehicle_ID.toLowerCase().includes(q) ||
          v.Model.toLowerCase().includes(q) ||
          v.Vehicle_Type.toLowerCase().includes(q)
      );
    }

    const sortVal = vSortSelect ? vSortSelect.value : "rul_asc";
    if (sortVal === "rul_asc") filtered.sort((a, b) => a.Remaining_Useful_Life_Days - b.Remaining_Useful_Life_Days);
    else if (sortVal === "rul_desc") filtered.sort((a, b) => b.Remaining_Useful_Life_Days - a.Remaining_Useful_Life_Days);
    else if (sortVal === "health_desc") filtered.sort((a, b) => b.Health_Index - a.Health_Index);
    else if (sortVal === "vib_desc") filtered.sort((a, b) => b.Vibration_RMS - a.Vibration_RMS);
    else if (sortVal === "odo_desc") filtered.sort((a, b) => b.Odometer_KM - a.Odometer_KM);

    renderVehicles(filtered);
  };

  if (vStatusFilter) vStatusFilter.addEventListener("change", applyVehicleFilters);
  if (vTypeFilter) vTypeFilter.addEventListener("change", applyVehicleFilters);
  if (vSortSelect) vSortSelect.addEventListener("change", applyVehicleFilters);

  // Global Search
  const searchInput = document.getElementById("global-search");
  if (searchInput) {
    searchInput.addEventListener("input", () => {
      applyDriverFilters();
      applyVehicleFilters();
    });
  }
}

// -------------------------------------------------------------
// 10. Live Cockpit WebSocket & Kinematics HUD
// -------------------------------------------------------------
// -------------------------------------------------------------
// 10. Live Cockpit, 2D G-G HUD & 20Hz Kinematic Streaming
// -------------------------------------------------------------

// Local physics simulator for GitHub Pages & WebSocket fallback
class ClientPhysicsSimulator {
  constructor() {
    this.waypoints = [
      { lat: 19.1136, lon: 72.8697, name: "Andheri East Logistics Hub" },
      { lat: 19.0990, lon: 72.8525, name: "Domestic Airport Junction" },
      { lat: 19.0880, lon: 72.8660, name: "Western Express Highway" },
      { lat: 19.0720, lon: 72.8750, name: "Kurla Flyover" },
      { lat: 19.0655, lon: 72.8685, name: "BKC Central Avenue" },
      { lat: 19.0680, lon: 72.8450, name: "Kalanagar Junction" },
      { lat: 19.0625, lon: 72.8360, name: "Linking Road" },
      { lat: 19.0596, lon: 72.8295, name: "Bandra West Terminal" }
    ];
    this.wpIndex = 0;
    this.progress = 0.0;
    this.speedKmh = 26.8;
    this.targetSpeed = 34.0;
    this.rpm = 3169;
    this.throttlePct = 0;
    this.brakeBar = 8.7;
    this.headingDeg = 216.7;
    this.vibHistory = [];
    this.activeAnomaly = null;
    this.anomalyTicks = 0;
    this.step = 0;
  }

  inject(type) {
    this.activeAnomaly = type;
    if (type === "crash") this.anomalyTicks = 20;
    else if (type === "harsh_brake") this.anomalyTicks = 25;
    else if (type === "pothole") this.anomalyTicks = 8;
    else if (type === "swerve") this.anomalyTicks = 22;
  }

  next() {
    this.step++;
    const wpFrom = this.waypoints[this.wpIndex];
    const nextIdx = (this.wpIndex + 1) % this.waypoints.length;
    const wpTo = this.waypoints[nextIdx];

    const distStep = (this.speedKmh / 3600.0) * 0.05;
    this.progress += distStep / 0.8;
    if (this.progress >= 1.0) {
      this.progress = 0.0;
      this.wpIndex = nextIdx;
    }

    const dLat = wpTo.lat - wpFrom.lat;
    const dLon = wpTo.lon - wpFrom.lon;
    const targetHeading = (Math.atan2(dLon, dLat) * 180 / Math.PI + 360) % 360;
    this.headingDeg += (targetHeading - this.headingDeg) * 0.1;

    const curLat = wpFrom.lat + dLat * this.progress;
    const curLon = wpFrom.lon + dLon * this.progress;

    let accX = (Math.random() - 0.5) * 0.08;
    let accY = -0.06 + (Math.random() - 0.5) * 0.06;
    let accZ = 9.81 + (Math.random() - 0.5) * 0.25;
    let gyroZ = (Math.random() - 0.5) * 2.0;
    let alertType = null;

    if (this.activeAnomaly && this.anomalyTicks > 0) {
      this.anomalyTicks--;
      if (this.activeAnomaly === "pothole") {
        const shock = Math.sin(this.anomalyTicks * Math.PI / 4.0);
        accZ = 9.81 + shock * 27.5; // ~2.8g
        alertType = "POTHOLE_IMPACT";
      } else if (this.activeAnomaly === "harsh_brake") {
        this.speedKmh = Math.max(0, this.speedKmh - 1.8);
        this.brakeBar = 38.5;
        this.throttlePct = 0;
        accY = -4.6;
        alertType = "HARSH_BRAKING";
      } else if (this.activeAnomaly === "swerve") {
        accX = 3.2 * Math.sin(this.anomalyTicks * 0.35);
        gyroZ = 32.0 * Math.sin(this.anomalyTicks * 0.35);
        alertType = "HIGH_G_SWERVE";
      } else if (this.activeAnomaly === "crash") {
        this.speedKmh = 0;
        accY = -18.5;
        accZ = 24.2;
        accX = 8.5;
        alertType = "CRITICAL_COLLISION";
      }

      if (this.anomalyTicks <= 0) {
        this.activeAnomaly = null;
      }
    } else {
      if (Math.random() < 0.03) {
        this.targetSpeed = 22.0 + Math.random() * 26.0;
      }
      const err = this.targetSpeed - this.speedKmh;
      this.speedKmh += err * 0.03;
      if (err > 0) {
        this.throttlePct = Math.min(100, Math.round(err * 3.5));
        this.brakeBar = 0;
      } else {
        this.throttlePct = 0;
        this.brakeBar = Math.min(25, Math.round(Math.abs(err) * 1.5));
      }
      this.rpm = Math.round(1400 + (this.speedKmh / 60.0) * 3600 + (Math.random() - 0.5) * 80);
    }

    const radialG = Math.sqrt(accX * accX + accY * accY) / 9.81;
    const latG = accX / 9.81;
    const longG = accY / 9.81;

    const vertDev = accZ - 9.81;
    this.vibHistory.push(vertDev * vertDev);
    if (this.vibHistory.length > 50) this.vibHistory.shift();
    const vibRms = Math.sqrt(this.vibHistory.reduce((a, b) => a + b, 0) / this.vibHistory.length) / 9.81;

    const safetyScore = Math.max(20.0, Math.min(100.0, 95.0 - (Math.abs(accY) * 6.0) - (Math.abs(accX) * 5.0) - (vibRms * 15.0)));

    return {
      gps: {
        lat: curLat,
        lon: curLon,
        heading_deg: this.headingDeg,
        segment: `${wpFrom.name} → ${wpTo.name}`
      },
      kinematics: {
        speed_kmh: this.speedKmh,
        rpm: this.rpm,
        throttle_pct: this.throttlePct,
        brake_pressure_bar: this.brakeBar,
        instant_safety_score: safetyScore
      },
      imu: {
        acc_x: accX,
        acc_y: accY,
        acc_z: accZ,
        gyro_z: gyroZ,
        radial_g: radialG,
        lat_g: latG,
        long_g: longG,
        rolling_vibration_rms: vibRms
      },
      status: {
        anomaly_alert: alertType
      }
    };
  }
}

const localSimulator = new ClientPhysicsSimulator();

function setupCockpitStream() {
  ggCanvas = document.getElementById("ggCanvas");
  if (ggCanvas) {
    ggCtx = ggCanvas.getContext("2d");
    drawGGCanvas(0.02, -0.06, 0.06);
  }

  initLiveCockpitMap();
  initLiveAccChart();
  connectCockpitWebSocket();

  // Toggle Stream Button
  const toggleBtn = document.getElementById("btn-toggle-stream");
  if (toggleBtn) {
    toggleBtn.addEventListener("click", () => {
      isStreamPaused = !isStreamPaused;
      const textSpan = document.getElementById("btn-stream-text");
      const icon = document.getElementById("stream-btn-icon");
      const badge = document.getElementById("live-stream-badge");
      const fpsText = document.getElementById("stream-fps-display");

      if (isStreamPaused) {
        if (textSpan) textSpan.textContent = "Resume Stream";
        if (icon) icon.setAttribute("data-lucide", "play");
        toggleBtn.style.background = "#fef08a";
        if (fpsText) fpsText.textContent = "PAUSED • STREAM";
        if (badge) badge.style.background = "#fdba74";
      } else {
        if (textSpan) textSpan.textContent = "Pause Stream";
        if (icon) icon.setAttribute("data-lucide", "pause");
        toggleBtn.style.background = "#ffffff";
        if (fpsText) fpsText.textContent = "20 FPS • WEBSOCKET";
        if (badge) badge.style.background = "#5eead4";
      }
      lucide.createIcons();
    });
  }
}

function connectCockpitWebSocket() {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const wsUrl = `${protocol}//${window.location.host}/ws/telematics/live/V01`;

  try {
    cockpitSocket = new WebSocket(wsUrl);

    cockpitSocket.onopen = () => {
      appendIncidentLog("WebSocket connected to PulseStar 20Hz Telemetry Stream", "nominal");
    };

    cockpitSocket.onmessage = (event) => {
      if (isStreamPaused) return;
      try {
        const frame = JSON.parse(event.data);
        handleTelemetryFrame(frame);
      } catch (e) {
        console.error("Frame parse error:", e);
      }
    };

    cockpitSocket.onerror = () => {
      startSimulatorFallback();
    };

    cockpitSocket.onclose = () => {
      startSimulatorFallback();
      setTimeout(connectCockpitWebSocket, 6000);
    };
  } catch (e) {
    startSimulatorFallback();
  }
}

function startSimulatorFallback() {
  if (liveStreamInterval) return;
  liveStreamInterval = setInterval(() => {
    if (isStreamPaused) return;
    const frame = localSimulator.next();
    handleTelemetryFrame(frame);
  }, 50); // 20 FPS = 50ms
}

function handleTelemetryFrame(frame) {
  const k = frame.kinematics || {};
  const imu = frame.imu || {};
  const gps = frame.gps || {};
  const status = frame.status || {};

  // 1. Ground Speed
  const speed = typeof k.speed_kmh === "number" ? k.speed_kmh : 26.8;
  const speedEl = document.getElementById("hud-speed");
  if (speedEl) speedEl.textContent = speed.toFixed(1);
  const speedBar = document.getElementById("hud-speed-bar");
  if (speedBar) speedBar.style.width = Math.min(100, (speed / 70.0) * 100) + "%";

  // 2. Engine RPM
  const rpm = typeof k.rpm === "number" ? k.rpm : 3169;
  const rpmEl = document.getElementById("hud-rpm");
  if (rpmEl) rpmEl.textContent = rpm.toLocaleString();
  const rpmBar = document.getElementById("hud-rpm-bar");
  if (rpmBar) rpmBar.style.width = Math.min(100, (rpm / 7000.0) * 100) + "%";

  // 3. Throttle
  const throttle = typeof k.throttle_pct === "number" ? k.throttle_pct : 0;
  const throttleEl = document.getElementById("hud-throttle");
  if (throttleEl) throttleEl.textContent = throttle.toFixed(0) + "%";
  const throttleBar = document.getElementById("hud-throttle-bar");
  if (throttleBar) throttleBar.style.width = throttle + "%";

  // 4. Brake Pressure
  const brake = typeof k.brake_pressure_bar === "number" ? k.brake_pressure_bar : 8.7;
  const brakeEl = document.getElementById("hud-brake");
  if (brakeEl) brakeEl.textContent = brake.toFixed(1) + " bar";
  const brakeBar = document.getElementById("hud-brake-bar");
  if (brakeBar) brakeBar.style.width = Math.min(100, (brake / 35.0) * 100) + "%";

  // 5. Heading / Bearing
  const heading = typeof gps.heading_deg === "number" ? gps.heading_deg : 216.7;
  const headingEl = document.getElementById("hud-heading");
  if (headingEl) headingEl.textContent = heading.toFixed(1) + "°";

  // 6. Suspension Vibration
  const vib = typeof imu.rolling_vibration_rms === "number" ? imu.rolling_vibration_rms : 0.231;
  const vibEl = document.getElementById("hud-vib-rms");
  if (vibEl) vibEl.textContent = vib.toFixed(3) + " g";

  // 7. Live Safety Score
  const score = typeof k.instant_safety_score === "number" ? k.instant_safety_score : 91.7;
  const scoreEl = document.getElementById("hud-instant-score");
  if (scoreEl) {
    scoreEl.textContent = score.toFixed(1);
    if (score >= 82) scoreEl.style.color = "#10b981";
    else if (score >= 65) scoreEl.style.color = "#f59e0b";
    else scoreEl.style.color = "#ef4444";
  }

  // 8. Route Segment Subtitle
  const segEl = document.getElementById("hud-route-segment");
  if (segEl && gps.segment) segEl.textContent = gps.segment;

  // 9. G-G Readouts
  const latG = typeof imu.lat_g === "number" ? imu.lat_g : (imu.acc_x || 0) / 9.81;
  const longG = typeof imu.long_g === "number" ? imu.long_g : (imu.acc_y || 0) / 9.81;
  const radialG = typeof imu.radial_g === "number" ? imu.radial_g : Math.sqrt(latG * latG + longG * longG);

  const radGEl = document.getElementById("hud-radial-g");
  if (radGEl) radGEl.textContent = radialG.toFixed(2) + " g";
  const latGEl = document.getElementById("hud-lat-g");
  if (latGEl) latGEl.textContent = (latG >= 0 ? "+" : "") + latG.toFixed(2) + " g";
  const longGEl = document.getElementById("hud-long-g");
  if (longGEl) longGEl.textContent = (longG >= 0 ? "+" : "") + longG.toFixed(2) + " g";

  // 10. Render 2D G-G Diagram
  drawGGCanvas(latG, longG, radialG);

  // 11. Update Map Vehicle Position
  if (liveCockpitMap && gps.lat && gps.lon) {
    const latLng = [gps.lat, gps.lon];
    if (liveVehicleMarker) {
      liveVehicleMarker.setLatLng(latLng);
    } else {
      const bikeIcon = L.divIcon({
        className: "custom-bike-marker",
        html: `<div style="background:#a3e636; border:2px solid #000; border-radius:50%; width:24px; height:24px; display:flex; align-items:center; justify-content:center; box-shadow:2px 2px 0px #000; font-size:12px;">🏍️</div>`,
        iconSize: [24, 24],
        iconAnchor: [12, 12]
      });
      liveVehicleMarker = L.marker(latLng, { icon: bikeIcon }).addTo(liveCockpitMap);
      liveCockpitMap.setView(latLng, 13);
    }

    liveRoutePoints.push(latLng);
    if (liveRoutePoints.length > 100) liveRoutePoints.shift();
    if (liveRoutePolyline) {
      liveRoutePolyline.setLatLngs(liveRoutePoints);
    } else {
      liveRoutePolyline = L.polyline(liveRoutePoints, { color: "#3b82f6", weight: 4, opacity: 0.85 }).addTo(liveCockpitMap);
    }
  }

  // 12. Update Oscilloscope Chart
  if (liveAccChart && typeof imu.acc_x === "number") {
    const nowSec = (Date.now() % 100000 / 1000).toFixed(1);
    liveAccChart.data.labels.push(nowSec);
    liveAccChart.data.datasets[0].data.push(imu.acc_x);
    liveAccChart.data.datasets[1].data.push(imu.acc_y);

    if (liveAccChart.data.labels.length > 30) {
      liveAccChart.data.labels.shift();
      liveAccChart.data.datasets[0].data.shift();
      liveAccChart.data.datasets[1].data.shift();
    }
    liveAccChart.update("none");
  }

  // 13. Handle Anomaly Alerts & Incident Ticker
  if (status.anomaly_alert) {
    const badge = document.getElementById("hud-status-badge");
    if (status.anomaly_alert === "POTHOLE_IMPACT") {
      appendIncidentLog(`💥 Severe Pothole Shock (2.8g) detected at [${(gps.lat || 19.08).toFixed(4)}, ${(gps.lon || 72.85).toFixed(4)}]`, "warning");
      if (badge) {
        badge.className = "status-pill status-warning";
        badge.textContent = "POTHOLE ALERT";
      }
    } else if (status.anomaly_alert === "HARSH_BRAKING") {
      appendIncidentLog(`🛑 Emergency Hard Braking Maneuver (-4.6 m/s²)`, "warning");
      if (badge) {
        badge.className = "status-pill status-warning";
        badge.textContent = "HARSH BRAKE";
      }
    } else if (status.anomaly_alert === "HIGH_G_SWERVE") {
      appendIncidentLog(`⚡ High-G Lateral Swerve (32°/s Yaw Rate)`, "warning");
      if (badge) {
        badge.className = "status-pill status-warning";
        badge.textContent = "SWERVE ALERT";
      }
    } else if (status.anomaly_alert === "CRITICAL_COLLISION") {
      appendIncidentLog(`🚨 CRITICAL COLLISION PULSE (24g) - Automated e-FNOL Dispatch!`, "critical");
      if (badge) {
        badge.className = "status-pill status-critical";
        badge.textContent = "CRITICAL CRASH";
      }
    }

    setTimeout(() => {
      const resetBadge = document.getElementById("hud-status-badge");
      if (resetBadge && !localSimulator.activeAnomaly) {
        resetBadge.className = "status-pill status-nominal";
        resetBadge.textContent = "NOMINAL";
      }
    }, 3000);
  }
}

function drawGGCanvas(latG, longG, radialG) {
  if (!ggCtx || !ggCanvas) return;
  const w = ggCanvas.width;
  const h = ggCanvas.height;
  const cx = w / 2;
  const cy = h / 2;
  const maxG = 1.0;
  const maxRadius = Math.min(cx, cy) - 20;

  ggCtx.clearRect(0, 0, w, h);

  // Concentric G-Force Circles
  const rings = [0.2, 0.4, 0.6, 0.8, 1.0];
  rings.forEach((g) => {
    const r = maxRadius * (g / maxG);
    ggCtx.beginPath();
    ggCtx.arc(cx, cy, r, 0, 2 * Math.PI);
    ggCtx.strokeStyle = g === 1.0 ? "rgba(255, 255, 255, 0.35)" : "rgba(255, 255, 255, 0.12)";
    ggCtx.lineWidth = g === 1.0 ? 1.5 : 1;
    ggCtx.setLineDash(g === 1.0 ? [] : [3, 3]);
    ggCtx.stroke();
    ggCtx.setLineDash([]);

    // Ring Text Labels
    ggCtx.fillStyle = "rgba(255, 255, 255, 0.45)";
    ggCtx.font = "8px 'JetBrains Mono', monospace";
    ggCtx.textAlign = "center";
    ggCtx.fillText(g === 1.0 ? "1g" : g + "g", cx, cy - r + 9);
  });

  // Crosshair Axes
  ggCtx.beginPath();
  ggCtx.moveTo(cx, 12);
  ggCtx.lineTo(cx, h - 12);
  ggCtx.moveTo(12, cy);
  ggCtx.lineTo(w - 12, cy);
  ggCtx.strokeStyle = "rgba(255, 255, 255, 0.18)";
  ggCtx.lineWidth = 1;
  ggCtx.stroke();

  // Motion Trail Calculation
  const px = cx + (latG / maxG) * maxRadius;
  const py = cy - (longG / maxG) * maxRadius; // Up is positive decel/forward

  ggHistory.push({ x: px, y: py, alpha: 1.0 });
  if (ggHistory.length > 20) ggHistory.shift();

  // Render Fading Trail
  ggHistory.forEach((pt, idx) => {
    pt.alpha *= 0.90;
    ggCtx.beginPath();
    ggCtx.arc(pt.x, pt.y, 3, 0, 2 * Math.PI);
    ggCtx.fillStyle = `rgba(163, 230, 54, ${pt.alpha * 0.35})`;
    ggCtx.fill();
  });

  // Current G-Force Dot Color
  let dotColor = "#a3e636"; // Cruise (<0.3g)
  if (radialG > 0.6) dotColor = "#ff6b6b"; // High-G (>0.6g)
  else if (radialG > 0.3) dotColor = "#fde047"; // Moderate (>0.3g)

  // Outer Glowing Ring
  ggCtx.beginPath();
  ggCtx.arc(px, py, 9, 0, 2 * Math.PI);
  ggCtx.fillStyle = dotColor;
  ggCtx.globalAlpha = 0.25;
  ggCtx.fill();
  ggCtx.globalAlpha = 1.0;

  // Solid Center Dot
  ggCtx.beginPath();
  ggCtx.arc(px, py, 5.5, 0, 2 * Math.PI);
  ggCtx.fillStyle = dotColor;
  ggCtx.fill();
  ggCtx.strokeStyle = "#ffffff";
  ggCtx.lineWidth = 2;
  ggCtx.stroke();
}

function initLiveCockpitMap() {
  const mapEl = document.getElementById("liveCockpitMap");
  if (!mapEl || liveCockpitMap) return;

  liveCockpitMap = L.map("liveCockpitMap").setView([19.085, 72.855], 13);
  L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", {
    attribution: '&copy; CARTO'
  }).addTo(liveCockpitMap);

  // Full Route Static Outline
  const fullRouteCoords = localSimulator.waypoints.map((w) => [w.lat, w.lon]);
  L.polyline(fullRouteCoords, {
    color: "#6b7280",
    weight: 3,
    dashArray: "6, 6",
    opacity: 0.6
  }).addTo(liveCockpitMap);

  // Origin & Dest Markers
  L.circleMarker(fullRouteCoords[0], { radius: 5, fillColor: "#10b981", color: "#000", weight: 2, fillOpacity: 1 }).addTo(liveCockpitMap).bindPopup("Andheri East Logistics Hub");
  L.circleMarker(fullRouteCoords[fullRouteCoords.length - 1], { radius: 5, fillColor: "#ef4444", color: "#000", weight: 2, fillOpacity: 1 }).addTo(liveCockpitMap).bindPopup("Bandra West Terminal");
}

function initLiveAccChart() {
  const ctx = document.getElementById("liveAccWaveformChart");
  if (!ctx || liveAccChart) return;

  liveAccChart = new Chart(ctx, {
    type: "line",
    data: {
      labels: [],
      datasets: [
        {
          label: "Ax (Lateral)",
          data: [],
          borderColor: "#ff6b6b",
          backgroundColor: "rgba(255, 107, 107, 0.08)",
          borderWidth: 2,
          pointRadius: 0,
          tension: 0.35,
          fill: true
        },
        {
          label: "Ay (Longitudinal)",
          data: [],
          borderColor: "#88aaee",
          backgroundColor: "rgba(136, 170, 238, 0.08)",
          borderWidth: 2,
          pointRadius: 0,
          tension: 0.35,
          fill: true
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      scales: {
        x: { display: false },
        y: {
          min: -6,
          max: 6,
          grid: { color: "rgba(0,0,0,0.06)" },
          ticks: {
            font: { family: "JetBrains Mono", size: 9 },
            callback: (v) => v + " m/s²"
          }
        }
      },
      plugins: {
        legend: { display: false }
      }
    }
  });
}

function appendIncidentLog(msg, severity = "nominal") {
  const container = document.getElementById("incident-ticker-list");
  if (!container) return;
  const now = new Date();
  const timeStr = now.toTimeString().split(" ")[0];

  const item = document.createElement("div");
  item.className = `incident-item ${severity}`;
  item.innerHTML = `<span class="time">[${timeStr}]</span> <span class="msg">${msg}</span>`;
  container.prepend(item);

  while (container.children.length > 25) {
    container.removeChild(container.lastChild);
  }
}

// Global Chaos & Anomaly Trigger
window.injectChaosEvent = function (eventType) {
  localSimulator.inject(eventType);
  if (cockpitSocket && cockpitSocket.readyState === WebSocket.OPEN) {
    cockpitSocket.send(JSON.stringify({ action: "inject_event", event_type: eventType }));
  } else {
    fetch("/api/telemetry/inject-event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ vehicle_id: "V01", event_type: eventType })
    }).catch(() => {});
  }
};

window.injectTelemetryEvent = window.injectChaosEvent;

// -------------------------------------------------------------
// 11. Trip Waveforms & GIS Replay
// -------------------------------------------------------------
const TRIP_METADATA = {
  "T001": { driver: "D01", vehicle: "V01", risk: "SAFE", riskClass: "badge-green", desc: "Safe Corridor - Bandra to BKC" },
  "T016": { driver: "D07", vehicle: "V03", risk: "MODERATE", riskClass: "badge-orange", desc: "Rough Surface & Pothole Jolt - Kurla" },
  "T046": { driver: "D04", vehicle: "V08", risk: "HIGH RISK", riskClass: "badge-red", desc: "High-Speed Highway Swerves - WEH" },
  "T089": { driver: "D14", vehicle: "V11", risk: "MODERATE", riskClass: "badge-orange", desc: "Night Route & Decel Spikes - Airport" },
  "T100": { driver: "D22", vehicle: "V15", risk: "SAFE", riskClass: "badge-green", desc: "Dense Urban Stop & Go - Linking Rd" },
  "T112": { driver: "D09", vehicle: "V19", risk: "MODERATE", riskClass: "badge-orange", desc: "Suburban Delivery - Ghatkopar" },
  "T200": { driver: "D02", vehicle: "V24", risk: "SAFE", riskClass: "badge-green", desc: "Express Logistics - Andheri Terminal" }
};

async function loadTripTelemetry(tripId) {
  currentTripId = tripId;
  try {
    const res = await fetch(`/api/trips/${tripId}/telemetry`);
    if (res.ok) {
      const data = await res.json();
      currentTripsSamples[tripId] = data;
    } else {
      throw new Error("API route unavailable");
    }
  } catch (err) {
    if (!currentTripsSamples[tripId]) {
      try {
        const fallbackRes = await fetch("./data/trips_telemetry_sample.json");
        if (fallbackRes.ok) {
          const allTrips = await fallbackRes.json();
          if (allTrips && allTrips[tripId]) {
            currentTripsSamples[tripId] = allTrips[tripId];
          } else if (allTrips && Object.keys(allTrips).length > 0) {
            currentTripsSamples[tripId] = Object.values(allTrips)[0];
          }
        }
      } catch (e) {
        console.warn("Fallback trip load error:", e);
      }
    }
  }

  // Update Trip Badges
  const meta = TRIP_METADATA[tripId] || { driver: "D01", vehicle: "V01", risk: "SAFE", riskClass: "badge-green" };
  const dBadge = document.getElementById("trip-driver-badge");
  const vBadge = document.getElementById("trip-vehicle-badge");
  const rBadge = document.getElementById("trip-risk-badge");
  if (dBadge) dBadge.textContent = meta.driver;
  if (vBadge) vBadge.textContent = meta.vehicle;
  if (rBadge) {
    rBadge.textContent = meta.risk;
    rBadge.className = `side-badge ${meta.riskClass}`;
  }

  renderTripDropdown();
  renderTripCharts(tripId);
}

function renderTripDropdown() {
  const select = document.getElementById("trip-select-dropdown");
  if (!select) return;
  select.innerHTML = `
    <option value="T001">Trip T001 (Safe Corridor - Bandra to BKC • 25.6 km/h avg)</option>
    <option value="T016">Trip T016 (Rough Surface & Pothole Jolt - Kurla • 24.1 km/h avg)</option>
    <option value="T046">Trip T046 (High-Speed Highway Swerves - WEH • 45.3 km/h avg)</option>
    <option value="T089">Trip T089 (Night Route & Decel Spikes - Airport • 31.2 km/h avg)</option>
    <option value="T100">Trip T100 (Dense Urban Stop & Go - Linking Rd • 21.9 km/h avg)</option>
    <option value="T112">Trip T112 (Suburban Delivery - Ghatkopar • 28.4 km/h avg)</option>
    <option value="T200">Trip T200 (Express Logistics - Andheri Terminal • 20.3 km/h avg)</option>
  `;
  select.value = currentTripId;
  select.onchange = (e) => {
    loadTripTelemetry(e.target.value);
  };
}

function renderTripCharts(tripId) {
  const data = currentTripsSamples[tripId] || [];
  if (!data.length) return;

  // Render Map
  const mapContainer = document.getElementById("tripMap");
  if (mapContainer) {
    const latLngs = data
      .map((d) => [d.Latitude || d.GPS_Latitude, d.Longitude || d.GPS_Longitude])
      .filter((pt) => pt[0] && pt[1]);

    if (latLngs.length > 0) {
      if (!tripLeafletMap) {
        tripLeafletMap = L.map("tripMap").setView(latLngs[0], 13);
        L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", {
          attribution: '&copy; CARTO'
        }).addTo(tripLeafletMap);
      } else {
        tripLeafletMap.eachLayer((layer) => {
          if (layer instanceof L.Polyline || layer instanceof L.Marker || layer instanceof L.CircleMarker) {
            tripLeafletMap.removeLayer(layer);
          }
        });
      }

      const isHighRisk = (TRIP_METADATA[tripId] && TRIP_METADATA[tripId].risk === "HIGH RISK");
      const polyline = L.polyline(latLngs, { color: isHighRisk ? "#ef4444" : "#3b82f6", weight: 4 }).addTo(tripLeafletMap);
      L.marker(latLngs[0]).addTo(tripLeafletMap).bindPopup(`<b>Trip ${tripId} Origin</b>`);
      L.marker(latLngs[latLngs.length - 1]).addTo(tripLeafletMap).bindPopup(`<b>Trip ${tripId} Destination</b>`);
      tripLeafletMap.fitBounds(polyline.getBounds(), { padding: [25, 25] });

      // Pothole / Shock Markers
      data.forEach((p) => {
        const az = p.Acceleration_Z || 9.81;
        if (Math.abs(az - 9.81) > 2.0 && (p.Latitude || p.GPS_Latitude)) {
          L.circleMarker([p.Latitude || p.GPS_Latitude, p.Longitude || p.GPS_Longitude], {
            radius: 7,
            fillColor: "#fde047",
            color: "#000",
            weight: 2,
            fillOpacity: 1
          })
            .addTo(tripLeafletMap)
            .bindPopup(`<b>Road Surface Shock</b><br>Vertical G: ${(Math.abs(az - 9.81) / 9.81).toFixed(2)}g<br>Speed: ${p.Speed_KMH} km/h`);
        }
      });
    }
  }

  // Render Accelerometer Chart
  const accelCtx = document.getElementById("accelChart");
  if (accelCtx) {
    if (accelChartInstance) accelChartInstance.destroy();
    accelChartInstance = new Chart(accelCtx, {
      type: "line",
      data: {
        labels: data.map((_, i) => `${i * 2}s`),
        datasets: [
          { label: "Ax (Lateral)", data: data.map((d) => d.Acceleration_X), borderColor: "#ff6b6b", backgroundColor: "rgba(255,107,107,0.06)", borderWidth: 2, pointRadius: 0, tension: 0.3 },
          { label: "Ay (Longitudinal)", data: data.map((d) => d.Acceleration_Y), borderColor: "#88aaee", backgroundColor: "rgba(136,170,238,0.06)", borderWidth: 2, pointRadius: 0, tension: 0.3 },
          { label: "Az (Vertical)", data: data.map((d) => d.Acceleration_Z), borderColor: "#a3e636", backgroundColor: "rgba(163,230,54,0.06)", borderWidth: 2, pointRadius: 0, tension: 0.3 }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: { grid: { color: "rgba(0,0,0,0.04)" } },
          y: { grid: { color: "rgba(0,0,0,0.06)" } }
        },
        plugins: { legend: { position: "top", labels: { font: { family: "Plus Jakarta Sans", weight: "bold" } } } }
      }
    });
  }

  // Render Gyroscope Chart
  const gyroCtx = document.getElementById("gyroChart");
  if (gyroCtx) {
    if (gyroChartInstance) gyroChartInstance.destroy();
    gyroChartInstance = new Chart(gyroCtx, {
      type: "line",
      data: {
        labels: data.map((_, i) => `${i * 2}s`),
        datasets: [
          { label: "Gx (Roll)", data: data.map((d) => d.Gyro_X), borderColor: "#fde047", borderWidth: 1.8, pointRadius: 0, tension: 0.3 },
          { label: "Gy (Pitch)", data: data.map((d) => d.Gyro_Y), borderColor: "#c4b5fd", borderWidth: 1.8, pointRadius: 0, tension: 0.3 },
          { label: "Gz (Yaw)", data: data.map((d) => d.Gyro_Z), borderColor: "#fdba74", borderWidth: 1.8, pointRadius: 0, tension: 0.3 }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: { grid: { color: "rgba(0,0,0,0.04)" } },
          y: { grid: { color: "rgba(0,0,0,0.06)" } }
        },
        plugins: { legend: { position: "top", labels: { font: { family: "Plus Jakarta Sans", weight: "bold" } } } }
      }
    });
  }
}

// -------------------------------------------------------------
// 12. ML Simulator & Crash Triage
// -------------------------------------------------------------
function setupMLSimulator() {
  // Crash Presets Sync
  const presetSelect = document.getElementById("crash-preset-select");
  if (presetSelect) {
    presetSelect.addEventListener("change", (e) => {
      const val = e.target.value;
      const accY = document.getElementById("crash-acc-y");
      const accZ = document.getElementById("crash-acc-z");
      const spd = document.getElementById("crash-speed");
      const mount = document.getElementById("crash-mount");

      if (val === "crash_severe") {
        if (accY) accY.value = "-18.5";
        if (accZ) accZ.value = "24.2";
        if (spd) spd.value = "48";
        if (mount) mount.value = "Handlebar_Mount";
      } else if (val === "tipover") {
        if (accY) accY.value = "-4.2";
        if (accZ) accZ.value = "11.2";
        if (spd) spd.value = "8";
        if (mount) mount.value = "Tank_Pouch";
      } else if (val === "pothole_shock") {
        if (accY) accY.value = "-1.5";
        if (accZ) accZ.value = "26.4";
        if (spd) spd.value = "32";
        if (mount) mount.value = "Handlebar_Mount";
      } else if (val === "harsh_brake") {
        if (accY) accY.value = "-6.8";
        if (accZ) accZ.value = "10.4";
        if (spd) spd.value = "42";
        if (mount) mount.value = "Pocket";
      }
    });
  }

  // Driver Risk Prediction
  const btnPredict = document.getElementById("btn-predict-driver");
  if (btnPredict) {
    btnPredict.addEventListener("click", async () => {
      const driverId = document.getElementById("ml-driver-id").value;
      const hbr = parseFloat(document.getElementById("ml-hbr").value) || 2.4;
      const rar = parseFloat(document.getElementById("ml-rar").value) || 1.8;
      const scs = parseFloat(document.getElementById("ml-scs").value) || 92.0;

      const out = document.getElementById("driver-inference-output");
      out.innerHTML = `<div style="text-align:center; padding:1.5rem;"><div class="live-dot" style="width:14px; height:14px; background:#a3e636;"></div> Executing sub-3ms Feast retrieval &amp; LightGBM inference...</div>`;

      try {
        const res = await fetch("/v1/predict/driver-risk", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            driver_id: driverId,
            harsh_brake_rate: hbr,
            rapid_accel_rate: rar,
            speed_compliance_score: scs
          })
        });
        
        let data;
        if (res.ok) {
          data = await res.json();
        } else {
          // Client calculation fallback
          const rawScore = Math.max(20, Math.min(100, scs - (hbr * 3.5) - (rar * 2.5)));
          const tier = rawScore >= 82 ? "Safe & Exemplary (Low Risk)" : rawScore >= 65 ? "Moderate Risk" : "High Risk / Aggressive";
          data = {
            predicted_safety_score: rawScore,
            risk_tier: tier,
            feature_store_latency_ms: 2.14,
            inference_latency_ms: 1.38,
            total_latency_ms: 3.52,
            coaching_recommendation: [
              "Maintain progressive braking pressure on high-speed corridors.",
              "Excellent compliance observed across North suburban arterial roads."
            ]
          };
        }

        const isSafe = data.predicted_safety_score >= 82;
        const isMod = data.predicted_safety_score >= 65 && !isSafe;
        const tierClass = isSafe ? "safe" : isMod ? "moderate" : "critical";

        out.innerHTML = `
          <div class="result-highlight">
            <div class="result-header-row">
              <div>
                <div class="res-score-badge">${data.predicted_safety_score.toFixed(1)} <span>/ 100</span></div>
                <span style="font-size:0.75rem; color:#4b5563; font-weight:800;">Composite Safety Index</span>
              </div>
              <span class="res-tier-pill ${tierClass}">${data.risk_tier}</span>
            </div>
            
            <div class="res-latencies-strip">
              <span>Feast Online: <strong>${data.feature_store_latency_ms} ms</strong></span> •
              <span>Inference: <strong>${data.inference_latency_ms} ms</strong></span> •
              <span>Total: <strong>${data.total_latency_ms} ms</strong></span>
            </div>

            <div>
              <span style="font-size:0.75rem; font-weight:900; color:#111827; text-transform:uppercase; letter-spacing:0.4px;">Contextual AI Coaching:</span>
              <ul class="res-coaching-list">
                ${data.coaching_recommendation.map((c) => `<li>${c}</li>`).join("")}
              </ul>
            </div>
          </div>
        `;
      } catch (err) {
        out.innerHTML = `<div class="res-error" style="color:#ef4444; font-weight:800; padding:1rem;">Inference Error: ${err.message}</div>`;
      }
      lucide.createIcons();
    });
  }

  // Crash Triage Button
  const btnCrash = document.getElementById("btn-triage-crash");
  if (btnCrash) {
    btnCrash.addEventListener("click", async () => {
      const accY = parseFloat(document.getElementById("crash-acc-y").value) || -18.5;
      const accZ = parseFloat(document.getElementById("crash-acc-z").value) || 24.2;
      const spd = parseFloat(document.getElementById("crash-speed").value) || 46;
      const mount = document.getElementById("crash-mount").value || "Handlebar_Mount";

      const out = document.getElementById("crash-inference-output");
      out.innerHTML = `<div style="text-align:center; padding:1.5rem;"><div class="live-dot" style="width:14px; height:14px; background:#ff6b6b;"></div> Classifying kinetic crash pulse...</div>`;

      try {
        const res = await fetch("/v1/triage/crash-event", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            acc_x: 0.8,
            acc_y: accY,
            acc_z: accZ,
            gyro_x: 12.0,
            gyro_y: 35.0,
            gyro_z: 60.0,
            speed_kmh: spd,
            phone_mount: mount
          })
        });

        let data;
        if (res.ok) {
          data = await res.json();
        } else {
          const isCritical = (Math.abs(accY) > 12.0 || accZ > 20.0) && spd > 25;
          data = {
            event_type: isCritical ? "CRITICAL_COLLISION" : "POTHOLE_SHOCK",
            severity: isCritical ? "CRITICAL" : "MODERATE",
            emergency_dispatch_required: isCritical,
            peak_g_force: Math.round(Math.sqrt(accY * accY + accZ * accZ) / 9.81 * 10) / 10,
            speed_at_impact_kmh: spd,
            reconstruction_narrative: isCritical
              ? "Severe frontal impact detected with rapid deceleration and violent kinetic rebound consistent with collision."
              : "Transient vertical road surface shock detected without sustained deceleration pulse."
          };
        }

        const isEmergency = data.emergency_dispatch_required;
        out.innerHTML = `
          <div class="result-highlight">
            <div class="res-emergency-banner ${isEmergency ? "critical" : "nominal"}">
              <i data-lucide="${isEmergency ? "alert-triangle" : "check-circle"}"></i>
              <span>${isEmergency ? "🚨 AUTOMATED 108 EMERGENCY SOS DISPATCHED" : "✅ ROUTINE TELEMATICS EVENT (NO SOS DISPATCH)"}</span>
            </div>

            <div class="result-header-row">
              <div>
                <div class="res-score-badge">${data.event_type}</div>
                <span style="font-size:0.75rem; color:#4b5563; font-weight:800;">Severity Level: ${data.severity}</span>
              </div>
              <div style="font-family:'JetBrains Mono', monospace; font-size:0.85rem; font-weight:900; background:#f3f4f6; padding:0.35rem 0.75rem; border-radius:4px; border:1px solid #e5e7eb;">
                Peak G: <strong>${data.peak_g_force}g</strong> • Impact Speed: <strong>${data.speed_at_impact_kmh} km/h</strong>
              </div>
            </div>

            <div class="res-narrative-text">
              <strong style="color:#000; display:block; margin-bottom:0.25rem;">Automated e-FNOL Telematics Reconstruction:</strong>
              ${data.reconstruction_narrative}
            </div>
          </div>
        `;
      } catch (err) {
        out.innerHTML = `<div class="res-error" style="color:#ef4444; font-weight:800; padding:1rem;">Crash Triage Error: ${err.message}</div>`;
      }
      lucide.createIcons();
    });
  }

  // UBI Calculator Button
  const btnUbi = document.getElementById("btn-calc-ubi");
  if (btnUbi) {
    btnUbi.addEventListener("click", async () => {
      const driverId = document.getElementById("ubi-driver-select").value;
      const basePrem = parseFloat(document.getElementById("ubi-base-premium").value) || 12000;
      const out = document.getElementById("ubi-result-output");

      try {
        const res = await fetch("/v1/ubi/calculate-premium", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ driver_id: driverId, base_annual_premium_inr: basePrem })
        });
        
        let data;
        if (res.ok) {
          data = await res.json();
        } else {
          const dObj = driversData.find(d => d.Driver_ID === driverId);
          const score = dObj ? (dObj.Safety_Score || 75.0) : (driverId === "D01" ? 87.6 : driverId === "D22" ? 96.0 : driverId === "D07" ? 78.5 : 15.0);
          let discountPct = 0;
          let tier = "Tier 3: Moderate Bronze (5% Savings)";
          if (score >= 88.0) { discountPct = 25.0; tier = "Tier 1: Preferred Gold (25% Savings • Exemplary Rider)"; }
          else if (score >= 78.0) { discountPct = 15.0; tier = "Tier 2: Standard Silver (15% Savings • Defensive Rider)"; }
          else if (score >= 65.0) { discountPct = 5.0; tier = "Tier 3: Moderate Bronze (5% Savings • Standard Risk)"; }
          else if (score >= 50.0) { discountPct = -10.0; tier = "Tier 4: Elevated Risk Surcharge (+10% Cost)"; }
          else { discountPct = -25.0; tier = "Tier 5: Critical Risk Surcharge (+25% Cost)"; }

          const adjusted = basePrem * (1.0 - discountPct / 100.0);
          data = {
            adjusted_premium_inr: Math.round(adjusted),
            actuarial_tier: tier,
            annual_savings_inr: Math.round(basePrem - adjusted),
            discount_or_surcharge_pct: discountPct
          };
        }

        const isDiscount = data.discount_or_surcharge_pct >= 0;
        const pillText = isDiscount ? `${data.discount_or_surcharge_pct}% Discount` : `${Math.abs(data.discount_or_surcharge_pct)}% Surcharge`;
        const pillClass = isDiscount ? "safe" : "critical";
        const savingsText = isDiscount ? `Projected Annual Telematics Savings:` : `Projected Telematics Risk Surcharge:`;
        const savingsAmount = isDiscount
          ? `₹${data.annual_savings_inr.toLocaleString()} (-${data.discount_or_surcharge_pct}%)`
          : `+₹${Math.abs(data.annual_savings_inr).toLocaleString()} (+${Math.abs(data.discount_or_surcharge_pct)}%)`;
        const savingsBoxStyle = isDiscount
          ? `background:#ecfdf5; border:1.5px solid #10b981; color:#065f46;`
          : `background:#fef2f2; border:1.5px solid #ef4444; color:#991b1b;`;

        out.innerHTML = `
          <div class="result-highlight">
            <div class="ubi-hero-card">
              <div>
                <div class="label">Risk-Adjusted Annual Policy Premium</div>
                <div class="amount" style="${isDiscount ? 'color:#a3e636;' : 'color:#ff6b6b;'}">₹${data.adjusted_premium_inr.toLocaleString()} <span>/ year</span></div>
              </div>
              <div style="text-align:right;">
                <span class="res-tier-pill ${pillClass}">${pillText}</span>
              </div>
            </div>

            <div style="display:flex; justify-content:space-between; align-items:center; background:#f9fafb; padding:0.65rem 0.85rem; border:1.5px solid #000; border-radius:6px; font-weight:800; font-size:0.85rem;">
              <span>Actuarial Classification:</span>
              <strong style="color:#000;">${data.actuarial_tier}</strong>
            </div>

            <div style="display:flex; justify-content:space-between; align-items:center; padding:0.65rem 0.85rem; border-radius:6px; font-weight:800; font-size:0.85rem; ${savingsBoxStyle}">
              <span>${savingsText}</span>
              <strong>${savingsAmount}</strong>
            </div>
          </div>
        `;
      } catch (err) {}
      lucide.createIcons();
    });
  }
}

// -------------------------------------------------------------
// 13. Potholes Registry Render
// -------------------------------------------------------------
function renderPotholes(list) {
  const container = document.getElementById("pothole-list-container");
  if (!container) return;
  container.innerHTML = "";

  const potholes = (list && list.length > 0) ? list : [
    { Pothole_ID: "POT_001", Severity: "Critical Impact", Shock_Peak_Az_g: 2.85, GPS_Latitude: 19.0682, GPS_Longitude: 72.8451, Speed_At_Impact_KMH: 34, Vehicle_ID: "V01", Road_Roughness_Classification: "IRI Class III (Severe)" },
    { Pothole_ID: "POT_002", Severity: "Severe Shock", Shock_Peak_Az_g: 2.62, GPS_Latitude: 19.0721, GPS_Longitude: 72.8752, Speed_At_Impact_KMH: 28, Vehicle_ID: "V04", Road_Roughness_Classification: "IRI Class III (Severe)" },
    { Pothole_ID: "POT_003", Severity: "Moderate Bump", Shock_Peak_Az_g: 2.15, GPS_Latitude: 19.0884, GPS_Longitude: 72.8663, Speed_At_Impact_KMH: 42, Vehicle_ID: "V07", Road_Roughness_Classification: "IRI Class II (Moderate)" },
    { Pothole_ID: "POT_004", Severity: "Severe Shock", Shock_Peak_Az_g: 2.48, GPS_Latitude: 19.0993, GPS_Longitude: 72.8528, Speed_At_Impact_KMH: 38, Vehicle_ID: "V11", Road_Roughness_Classification: "IRI Class III (Severe)" },
    { Pothole_ID: "POT_005", Severity: "Critical Impact", Shock_Peak_Az_g: 2.92, GPS_Latitude: 19.1139, GPS_Longitude: 72.8699, Speed_At_Impact_KMH: 26, Vehicle_ID: "V02", Road_Roughness_Classification: "IRI Class III (Severe)" }
  ];

  potholes.slice(0, 6).forEach((p) => {
    const lat = p.Latitude || p.GPS_Latitude || 19.068;
    const lon = p.Longitude || p.GPS_Longitude || 72.845;
    const g = p.Shock_Peak_Az_g || p.Vertical_Impact_G || 2.4;
    const spd = p.Speed_At_Impact_KMH || p.Speed_KMH || 30;
    const sev = p.Severity || "Severe Shock";
    const roughness = p.Road_Roughness_Classification || "IRI Class III";
    const veh = p.Vehicle_ID || "V01";

    const item = document.createElement("div");
    item.className = "pothole-item";
    item.innerHTML = `
      <div class="pot-icon">⚠️</div>
      <div class="pot-info">
        <h5>${p.Pothole_ID} • ${sev} (${g}g Peak Shock)</h5>
        <span>GPS: ${lat.toFixed(4)}, ${lon.toFixed(4)} • Speed: ${spd} km/h • Asset: ${veh}</span>
      </div>
      <span class="side-badge badge-orange">${roughness}</span>
    `;
    container.appendChild(item);
  });
}

// -------------------------------------------------------------
// 14. Modals (Driver & Vehicle Profile)
// -------------------------------------------------------------
window.openDriverModal = function (driverOrId) {
  const d = typeof driverOrId === "object" ? driverOrId : driversData.find((item) => item.Driver_ID === driverOrId);
  if (!d) return;

  const name = d.Driver_Name || d.Name || "Driver";
  const id = d.Driver_ID || "D00";
  const score = typeof d.Safety_Score === "number" ? d.Safety_Score : 75.0;
  const tier = d.Tier || (score >= 82 ? "Safe & Exemplary" : score >= 65 ? "Moderate Risk" : "High Risk / Aggressive");

  document.getElementById("modalDriverName").textContent = `${name} (${id})`;
  const body = document.getElementById("modalDriverBody");
  const coaching = Array.isArray(d.Coaching_Feedback) ? d.Coaching_Feedback.join(" ") : (d.Coaching_Feedback || "Optimal compliance profile.");

  body.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1.25rem;">
      <div>
        <h4 style="font-size:1.1rem; font-weight:900;">${name}</h4>
        <p style="font-size:0.85rem; color:#4b5563; font-weight:700;">Age ${d.Age || 25} • ${d.Experience_Years || 2} Yrs Exp • ${d.Primary_Zone || "North"} Zone</p>
      </div>
      <div class="neubrutal-badge ${score >= 82 ? "low" : score >= 65 ? "medium" : "high"}">
        <div class="badge-score-val">${score.toFixed(1)}</div>
        <div class="badge-score-lbl">${tier}</div>
      </div>
    </div>

    <div class="metrics-block" style="margin-bottom:1.25rem;">
      <div class="m-item"><span class="m-lbl">Harsh Braking Rate</span><span class="m-val">${(d.Harsh_Brake_Rate_Per_100KM || 0).toFixed(2)} /100km</span></div>
      <div class="m-item"><span class="m-lbl">Rapid Throttle Accel</span><span class="m-val">${(d.Rapid_Accel_Rate_Per_100KM || 0).toFixed(2)} /100km</span></div>
      <div class="m-item"><span class="m-lbl">Cornering & Swerves</span><span class="m-val">${(d.Harsh_Turn_Rate_Per_100KM || 0).toFixed(2)} /100km</span></div>
      <div class="m-item"><span class="m-lbl">Overspeeding (>50 km/h)</span><span class="m-val">${d.Overspeed_50_Pct || 0}%</span></div>
      <div class="m-item"><span class="m-lbl">Speed Compliance</span><span class="m-val">${d.Speed_Compliance_Score || 90}%</span></div>
      <div class="m-item"><span class="m-lbl">Total Distance Covered</span><span class="m-val">${d.Total_Distance_KM || 150} KM</span></div>
    </div>

    <div class="card-action-box" style="font-size:0.85rem; background:#f9fafb; padding:0.85rem; border:2px solid #000; border-radius:6px;">
      <strong style="color:#000;">Contextual AI Driver Coaching:</strong>
      <p style="margin-top:0.35rem; color:#374151;">${coaching}</p>
    </div>
  `;
  document.getElementById("driverModal").classList.add("active");
  lucide.createIcons();
};

window.openVehicleModal = function (vehicleOrId) {
  const v = typeof vehicleOrId === "object" ? vehicleOrId : vehiclesData.find((item) => item.Vehicle_ID === vehicleOrId);
  if (!v) return;

  const id = v.Vehicle_ID || "V00";
  const model = v.Model || "Honda Activa";
  const health = typeof v.Health_Index === "number" ? v.Health_Index : 85.0;
  const rul = typeof v.Remaining_Useful_Life_Days === "number" ? v.Remaining_Useful_Life_Days : (v.RUL_Days || 120);
  const status = v.Status || (health >= 80 ? "Optimal / Healthy" : health >= 60 ? "Monitor / Moderate Wear" : "Critical / Service Due");

  document.getElementById("modalVehicleId").textContent = `${id} - ${model}`;
  const body = document.getElementById("modalVehicleBody");
  const diag = v.Diagnostic_Summary || v.Primary_Fault_Diagnosis || "All telemetry parameters nominal.";

  body.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1.25rem;">
      <div>
        <h4 style="font-size:1.1rem; font-weight:900;">${model}</h4>
        <p style="font-size:0.85rem; color:#4b5563; font-weight:700;">${v.Vehicle_Type || "ICE"} • Year ${v.Manufacturing_Year || 2022} • ${v.Odometer_KM || 30000} KM</p>
      </div>
      <div class="neubrutal-badge ${health >= 80 ? "low" : health >= 60 ? "medium" : "high"}">
        <div class="badge-score-val">${health.toFixed(1)}</div>
        <div class="badge-score-lbl">${status.split(" / ")[0]}</div>
      </div>
    </div>

    <div class="metrics-block" style="margin-bottom:1.25rem;">
      <div class="m-item"><span class="m-lbl">Remaining Useful Life</span><span class="m-val">${rul} Days</span></div>
      <div class="m-item"><span class="m-lbl">Chassis Vibration RMS</span><span class="m-val">${(v.Vibration_RMS || 0.65).toFixed(3)} g</span></div>
      <div class="m-item"><span class="m-lbl">Steering Gyro Jitter</span><span class="m-val">${(v.Gyro_Jitter || 8.5).toFixed(1)}°/s</span></div>
      <div class="m-item"><span class="m-lbl">Brake Disc Judder</span><span class="m-val">${(v.Brake_Judder || 0.5).toFixed(2)}</span></div>
      <div class="m-item"><span class="m-lbl">Days Since Service</span><span class="m-val">${v.Days_Since_Last_Service || 60} Days</span></div>
      <div class="m-item"><span class="m-lbl">Total Tracked KM</span><span class="m-val">${v.Total_KM_Tracked || 150} KM</span></div>
    </div>

    <div class="card-action-box" style="font-size:0.85rem; background:#f9fafb; padding:0.85rem; border:2px solid #000; border-radius:6px;">
      <strong style="color:#000;">Sub-System Diagnostic Summary:</strong>
      <p style="margin-top:0.35rem; color:#374151;">${diag}</p>
    </div>
  `;
  document.getElementById("vehicleModal").classList.add("active");
  lucide.createIcons();
};
