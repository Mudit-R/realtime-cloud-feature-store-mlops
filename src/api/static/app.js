// PulseStar Fleet Telematics & AI Analytics Dashboard State
let fleetSummary = {};
let driversData = [];
let vehiclesData = [];
let currentTripsSamples = {};
let currentTripId = "T001";
let leafletMap = null;
let accelChart = null;
let gyroChart = null;

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
  setupFilters();
  setupMLSimulator();
  setupCockpitStream();
  await loadInitialData();
  lucide.createIcons();
});

// 1. Navigation Tab Switching
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

      const linkText = link.querySelector("span") ? link.querySelector("span").textContent.trim() : "Dashboard";
      if (breadcrumb) breadcrumb.textContent = linkText;

      if (targetId === "trip-explorer") {
        setTimeout(() => {
          if (leafletMap) leafletMap.invalidateSize();
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

// 2. Data Loading from FastAPI Backend
async function loadInitialData() {
  try {
    const [sumRes, dRes, vRes, potRes] = await Promise.all([
      fetch("/api/fleet/summary"),
      fetch("/api/drivers"),
      fetch("/api/vehicles"),
      fetch("/api/potholes/gis")
    ]);

    if (sumRes.ok) {
      fleetSummary = await sumRes.json();
      renderKPIs();
    }
    if (dRes.ok) {
      driversData = await dRes.json();
      renderDrivers(driversData);
    }
    if (vRes.ok) {
      vehiclesData = await vRes.json();
      renderVehicles(vehiclesData);
    }
    if (potRes.ok) {
      const potholeList = await potRes.json();
      renderPotholes(potholeList);
    }

    // Load initial trip sample
    await loadTripTelemetry("T001");
  } catch (err) {
    console.error("Failed loading initial telematics data:", err);
  }
}

// 3. Render Fleet KPIs
function renderKPIs() {
  const setTxt = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  };

  setTxt("kpi-avg-score", fleetSummary.avg_driver_safety_score ? Number(fleetSummary.avg_driver_safety_score).toFixed(1) : (fleetSummary.Avg_Safety_Score ? Number(fleetSummary.Avg_Safety_Score).toFixed(1) : "81.4"));
  setTxt("kpi-safe-count", fleetSummary.safe_drivers_count || fleetSummary.Safe_Drivers_Count || "16");
  setTxt("kpi-mod-count", fleetSummary.moderate_drivers_count || fleetSummary.Moderate_Drivers_Count || "9");
  setTxt("kpi-high-count", fleetSummary.high_risk_drivers_count || fleetSummary.High_Risk_Drivers_Count || "5");

  setTxt("kpi-avg-health", fleetSummary.avg_vehicle_health_index ? Number(fleetSummary.avg_vehicle_health_index).toFixed(1) + "%" : (fleetSummary.Avg_Health_Index ? Number(fleetSummary.Avg_Health_Index).toFixed(1) + "%" : "78.2%"));
  setTxt("kpi-optimal-count", fleetSummary.optimal_vehicles_count || fleetSummary.Optimal_Vehicles_Count || "14");
  setTxt("kpi-urgent-count", fleetSummary.urgent_service_count || fleetSummary.Urgent_Vehicles_Count || "7");
  setTxt("kpi-critical-count", fleetSummary.critical_grounding_count || fleetSummary.Critical_Vehicles_Count || "3");
}

// 4. Render Driver Cards
function renderDrivers(list) {
  const container = document.getElementById("drivers-cards-container");
  if (!container || !Array.isArray(list)) return;
  container.innerHTML = "";

  list.forEach((driver) => {
    const tier = driver.Tier || driver.Risk_Tier || driver.Risk_Level || "Safe & Exemplary";
    let tierBadge = "badge-green";
    if (tier.includes("Moderate")) tierBadge = "badge-orange";
    else if (tier.includes("High") || tier.includes("Critical") || tier.includes("Elevated")) tierBadge = "badge-red";

    const name = driver.Driver_Name || driver.Name || driver.Driver_ID || "Fleet Driver";
    const driverNum = parseInt((driver.Driver_ID || "1").replace(/\D/g, '') || "1");
    const assigned = driver.Vehicle_Assigned || ("V" + String(((driverNum - 1) % 30) + 1).padStart(2, '0'));
    const scoreNum = driver.Safety_Score != null ? Number(driver.Safety_Score) : 85.0;
    const score = scoreNum.toFixed(1);
    const accidentProb = driver.Accident_Probability_Pct != null ? driver.Accident_Probability_Pct : Math.max(2.0, (100 - scoreNum) * 0.8).toFixed(1);
    const hbr = (driver.Harsh_Brake_Rate_Per_100KM != null ? Number(driver.Harsh_Brake_Rate_Per_100KM) : (driver.Harsh_Brake_Rate_100km || 0.0)).toFixed(1);
    const rar = (driver.Rapid_Accel_Rate_Per_100KM != null ? Number(driver.Rapid_Accel_Rate_Per_100KM) : (driver.Rapid_Accel_Rate_100km || 0.0)).toFixed(1);
    const night = (driver.Night_Trip_Pct != null ? Number(driver.Night_Trip_Pct) : 0.0).toFixed(1);
    const speedScore = (driver.Speed_Compliance_Score != null ? Number(driver.Speed_Compliance_Score) : 100.0).toFixed(1);

    const card = document.createElement("div");
    card.className = "driver-card";
    card.innerHTML = `
      <div class="card-top">
        <div>
          <h4>${name}</h4>
          <span class="mono-sub">${driver.Driver_ID} • ${assigned}</span>
        </div>
        <span class="side-badge ${tierBadge}">${tier}</span>
      </div>

      <div class="score-row">
        <div>
          <span class="score-label">Safety Score</span>
          <div class="score-display">${score} <span class="score-max">/100</span></div>
        </div>
        <div class="score-sub-right">
          <span class="score-label">Accident Prob</span>
          <div class="prob-num">${accidentProb}%</div>
        </div>
      </div>

      <div class="metrics-grid">
        <div class="metric-item">
          <span class="m-label">Harsh Brakes</span>
          <span class="m-val">${hbr} <small>/100km</small></span>
        </div>
        <div class="metric-item">
          <span class="m-label">Rapid Accel</span>
          <span class="m-val">${rar} <small>/100km</small></span>
        </div>
        <div class="metric-item">
          <span class="m-label">Night Driving</span>
          <span class="m-val">${night}%</span>
        </div>
        <div class="metric-item">
          <span class="m-label">Speed Score</span>
          <span class="m-val">${speedScore}</span>
        </div>
      </div>

      <div class="card-footer-action">
        <span class="coaching-tag"><i data-lucide="sparkles"></i> AI Coaching Active</span>
        <button class="btn-neo btn-sm btn-neo-yellow" onclick="openDriverModal('${driver.Driver_ID}')">View Profile</button>
      </div>
    `;
    container.appendChild(card);
  });
  lucide.createIcons();
}

// 5. Render Vehicle Cards
function renderVehicles(list) {
  const container = document.getElementById("vehicles-cards-container");
  if (!container || !Array.isArray(list)) return;
  container.innerHTML = "";

  list.forEach((v) => {
    const status = v.Status || v.Urgency_Status || v.Urgency || "Optimal / Healthy";
    let statusClass = "status-optimal";
    let badgeClass = "badge-green";
    if (status.toUpperCase().includes("MODERATE")) {
      statusClass = "status-moderate";
      badgeClass = "badge-blue";
    } else if (status.toUpperCase().includes("URGENT")) {
      statusClass = "status-urgent";
      badgeClass = "badge-orange";
    } else if (status.toUpperCase().includes("CRITICAL")) {
      statusClass = "status-critical";
      badgeClass = "badge-red";
    }

    const model = v.Model || "Delivery Asset";
    const reg = v.Registration_Number || ("MH-02-" + v.Vehicle_ID + "88");
    const vehNum = parseInt((v.Vehicle_ID || "1").replace(/\D/g, '') || "1");
    const assigned = v.Assigned_Driver || ("D" + String(((vehNum - 1) % 30) + 1).padStart(2, '0'));
    const rul = v.Remaining_Useful_Life_Days != null ? v.Remaining_Useful_Life_Days : (v.RUL_Days || 120);
    const health = (v.Health_Index != null ? Number(v.Health_Index) : 85.0).toFixed(1);
    const vib = (v.Vibration_RMS != null ? Number(v.Vibration_RMS) : 0.65).toFixed(3);
    const gyro = (v.Gyro_Jitter != null ? Number(v.Gyro_Jitter) : 12.0).toFixed(1);
    const brake = (v.Brake_Judder != null ? Number(v.Brake_Judder) : 0.6).toFixed(2);
    const odo = ((v.Odometer_KM || 25000) / 1000).toFixed(1);
    const diagnosis = v.Diagnostic_Summary || v.Primary_Fault_Diagnosis || "Nominal operating bounds.";
    const daysSinceService = v.Days_Since_Last_Service != null ? v.Days_Since_Last_Service : (v.Days_Since_Service || 30);

    const card = document.createElement("div");
    card.className = `vehicle-card ${statusClass}`;
    card.innerHTML = `
      <div class="card-top">
        <div>
          <h4>${v.Vehicle_ID} - ${model}</h4>
          <span class="mono-sub">${reg} • Driver: ${assigned}</span>
        </div>
        <span class="side-badge ${badgeClass}">${status.split(" - ")[0]}</span>
      </div>

      <div class="rul-row">
        <div>
          <span class="score-label">Remaining Useful Life</span>
          <div class="rul-display">${rul} <span class="rul-unit">Days</span></div>
        </div>
        <div class="health-gauge">
          <span class="score-label">Health Index</span>
          <div class="health-num">${health}%</div>
        </div>
      </div>

      <div class="metrics-grid">
        <div class="metric-item">
          <span class="m-label">Vibration RMS</span>
          <span class="m-val">${vib}g</span>
        </div>
        <div class="metric-item">
          <span class="m-label">Gyro Jitter</span>
          <span class="m-val">${gyro}°/s</span>
        </div>
        <div class="metric-item">
          <span class="m-label">Brake Judder</span>
          <span class="m-val">${brake}</span>
        </div>
        <div class="metric-item">
          <span class="m-label">Odometer</span>
          <span class="m-val">${odo}k km</span>
        </div>
      </div>

      <div class="diagnosis-box">
        <span class="diag-lbl"><i data-lucide="wrench"></i> Sub-System Diagnosis:</span>
        <p class="diag-text">${diagnosis}</p>
      </div>

      <div class="card-footer-action">
        <span class="service-tag">Service: ${daysSinceService} days ago</span>
        <button class="btn-neo btn-sm btn-neo-orange" onclick="openVehicleModal('${v.Vehicle_ID}')">Diagnostics</button>
      </div>
    `;
    container.appendChild(card);
  });
  lucide.createIcons();
}

// 6. Setup Cockpit Live WebSocket Stream & Kinematic HUD
function setupCockpitStream() {
  ggCanvas = document.getElementById("ggCanvas");
  if (ggCanvas) {
    ggCtx = ggCanvas.getContext("2d");
    drawGGCanvas(0, 0);
  }

  initLiveCockpitMap();
  initLiveAccChart();
  connectCockpitWebSocket();

  const toggleBtn = document.getElementById("btn-toggle-stream");
  if (toggleBtn) {
    toggleBtn.addEventListener("click", () => {
      isStreamPaused = !isStreamPaused;
      const textSpan = document.getElementById("btn-stream-text");
      const badge = document.getElementById("live-stream-badge");
      if (isStreamPaused) {
        if (textSpan) textSpan.textContent = "Resume Stream";
        toggleBtn.classList.remove("btn-neo-green");
        toggleBtn.classList.add("btn-neo-yellow");
        if (badge) {
          badge.classList.remove("lime");
          badge.classList.add("orange");
        }
      } else {
        if (textSpan) textSpan.textContent = "Pause Stream";
        toggleBtn.classList.remove("btn-neo-yellow");
        toggleBtn.classList.add("btn-neo-green");
        if (badge) {
          badge.classList.remove("orange");
          badge.classList.add("lime");
        }
      }
    });
  }
}

function connectCockpitWebSocket() {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const wsUrl = `${protocol}//${window.location.host}/ws/telematics/live/V01`;

  try {
    cockpitSocket = new WebSocket(wsUrl);

    cockpitSocket.onopen = () => {
      appendIncidentLog("WebSocket connected to 20Hz live telemetry stream (asia-south1)", "nominal");
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
      startRestPollingFallback();
    };

    cockpitSocket.onclose = () => {
      setTimeout(connectCockpitWebSocket, 3000);
    };
  } catch (e) {
    startRestPollingFallback();
  }
}

function startRestPollingFallback() {
  if (liveStreamInterval) return;
  liveStreamInterval = setInterval(async () => {
    if (isStreamPaused) return;
    try {
      const res = await fetch("/api/telemetry/live-frame/V01");
      if (res.ok) {
        const frame = await res.json();
        handleTelemetryFrame(frame);
      }
    } catch (e) {}
  }, 100);
}

function handleTelemetryFrame(frame) {
  const k = frame.kinematics || {};
  const imu = frame.imu || {};
  const gps = frame.gps || {};
  const status = frame.status || {};

  // Update Instrument Cluster
  const speedEl = document.getElementById("hud-speed");
  if (speedEl && k.speed_kmh != null) speedEl.textContent = Number(k.speed_kmh).toFixed(1);
  const speedBar = document.getElementById("hud-speed-bar");
  if (speedBar && k.speed_kmh != null) speedBar.style.width = Math.min(100, (k.speed_kmh / 75.0) * 100) + "%";

  const rpmEl = document.getElementById("hud-rpm");
  if (rpmEl && k.rpm != null) rpmEl.textContent = Math.round(k.rpm).toLocaleString();
  const rpmBar = document.getElementById("hud-rpm-bar");
  if (rpmBar && k.rpm != null) rpmBar.style.width = Math.min(100, (k.rpm / 8000.0) * 100) + "%";

  const throttleEl = document.getElementById("hud-throttle");
  if (throttleEl && k.throttle_pct != null) throttleEl.textContent = Math.round(k.throttle_pct) + "%";
  const throttleBar = document.getElementById("hud-throttle-bar");
  if (throttleBar && k.throttle_pct != null) throttleBar.style.width = k.throttle_pct + "%";

  const brakeEl = document.getElementById("hud-brake");
  if (brakeEl && k.brake_pressure_bar != null) brakeEl.textContent = Number(k.brake_pressure_bar).toFixed(1) + " bar";
  const brakeBar = document.getElementById("hud-brake-bar");
  if (brakeBar && k.brake_pressure_bar != null) brakeBar.style.width = Math.min(100, (k.brake_pressure_bar / 40.0) * 100) + "%";

  const headingEl = document.getElementById("hud-heading");
  if (headingEl && gps.heading_deg != null) headingEl.textContent = Number(gps.heading_deg).toFixed(1) + "°";

  const vibEl = document.getElementById("hud-vib-rms");
  if (vibEl && imu.rolling_vibration_rms != null) vibEl.textContent = Number(imu.rolling_vibration_rms).toFixed(3) + " g";

  const scoreEl = document.getElementById("hud-instant-score");
  if (scoreEl && k.instant_safety_score != null) scoreEl.textContent = Number(k.instant_safety_score).toFixed(1);

  const routeSeg = document.getElementById("hud-route-segment");
  if (routeSeg && gps.segment) routeSeg.textContent = gps.segment;

  // G-G Friction Readouts
  const radGEl = document.getElementById("hud-radial-g");
  if (radGEl && imu.friction_radial_g != null) radGEl.textContent = Number(imu.friction_radial_g).toFixed(2) + " g";
  const latGEl = document.getElementById("hud-lat-g");
  if (latGEl && imu.acc_x != null) latGEl.textContent = (imu.acc_x >= 0 ? "+" : "") + (imu.acc_x / 9.81).toFixed(2) + " g";
  const longGEl = document.getElementById("hud-long-g");
  if (longGEl && imu.acc_y != null) longGEl.textContent = (imu.acc_y >= 0 ? "+" : "") + (imu.acc_y / 9.81).toFixed(2) + " g";

  // Draw G-G Circle HUD
  if (imu.acc_x != null && imu.acc_y != null) {
    drawGGCanvas(imu.acc_x / 9.81, imu.acc_y / 9.81);
  }

  // Update Moving Vehicle on Map
  if (liveCockpitMap && gps.lat && gps.lon) {
    const latLng = [gps.lat, gps.lon];
    if (liveVehicleMarker) {
      liveVehicleMarker.setLatLng(latLng);
    } else {
      const bikeIcon = L.divIcon({
        className: "custom-bike-marker",
        html: `<div style="background:#a3e636; border:2px solid #000; border-radius:50%; width:24px; height:24px; display:flex; align-items:center; justify-content:center; box-shadow:2px 2px 0px #000;"><span style="font-size:12px;">🏍️</span></div>`,
        iconSize: [24, 24],
        iconAnchor: [12, 12]
      });
      liveVehicleMarker = L.marker(latLng, { icon: bikeIcon }).addTo(liveCockpitMap);
      liveCockpitMap.setView(latLng, 14);
    }

    liveRoutePoints.push(latLng);
    if (liveRoutePoints.length > 80) liveRoutePoints.shift();
    if (liveRoutePolyline) {
      liveRoutePolyline.setLatLngs(liveRoutePoints);
    } else {
      liveRoutePolyline = L.polyline(liveRoutePoints, { color: "#88aaee", weight: 4, opacity: 0.8 }).addTo(liveCockpitMap);
    }
  }

  // Update Strip Chart
  if (liveAccChart && imu.acc_x != null) {
    const nowLabel = new Date().toLocaleTimeString().split(" ")[0];
    liveAccChart.data.labels.push(nowLabel);
    liveAccChart.data.datasets[0].data.push(imu.acc_x);
    liveAccChart.data.datasets[1].data.push(imu.acc_y);
    liveAccChart.data.datasets[2].data.push(imu.acc_z);

    if (liveAccChart.data.labels.length > 30) {
      liveAccChart.data.labels.shift();
      liveAccChart.data.datasets[0].data.shift();
      liveAccChart.data.datasets[1].data.shift();
      liveAccChart.data.datasets[2].data.shift();
    }
    liveAccChart.update("none");
  }

  // Handle Anomaly Ticker Alerts
  if (status.anomaly_alert) {
    if (status.anomaly_alert === "POTHOLE_IMPACT") {
      appendIncidentLog(`💥 Severe Pothole Vertical Shock (${(imu.acc_z / 9.81).toFixed(2)}g) at [${gps.lat.toFixed(4)}, ${gps.lon.toFixed(4)}]`, "warning");
    } else if (status.anomaly_alert === "HARSH_BRAKING") {
      appendIncidentLog(`🛑 Emergency Braking Maneuver (${imu.acc_y.toFixed(1)} m/s²)`, "warning");
    } else if (status.anomaly_alert === "HIGH_G_SWERVE") {
      appendIncidentLog(`⚡ High-G Lateral Swerve (${imu.gyro_z.toFixed(0)}°/s Yaw)`, "warning");
    } else if (status.anomaly_alert === "CRITICAL_COLLISION") {
      appendIncidentLog(`🚨 CRITICAL COLLISION DETECTED (${(imu.g_force_magnitude).toFixed(1)}g) - Emergency SOS Triggered!`, "critical");
    }
  }
}

function drawGGCanvas(axG, ayG) {
  if (!ggCtx || !ggCanvas) return;
  const w = ggCanvas.width;
  const h = ggCanvas.height;
  const cx = w / 2;
  const cy = h / 2;
  const maxG = 1.0; // Scale 1.0g to radius
  const r = (w / 2) - 15;

  ggCtx.clearRect(0, 0, w, h);

  // Draw Rings (0.2g, 0.4g, 0.6g, 0.8g, 1.0g)
  const rings = [0.2, 0.4, 0.6, 0.8, 1.0];
  rings.forEach((g) => {
    const ringR = r * (g / maxG);
    ggCtx.beginPath();
    ggCtx.arc(cx, cy, ringR, 0, 2 * Math.PI);
    ggCtx.strokeStyle = g === 1.0 ? "#484f58" : "#21262d";
    ggCtx.lineWidth = g === 1.0 ? 1.5 : 1;
    ggCtx.stroke();

    // Labels
    ggCtx.fillStyle = "#8b949e";
    ggCtx.font = "8px 'JetBrains Mono'";
    ggCtx.fillText(g + "g", cx + 2, cy - ringR + 8);
  });

  // Crosshairs
  ggCtx.beginPath();
  ggCtx.moveTo(cx, 10);
  ggCtx.lineTo(cx, h - 10);
  ggCtx.moveTo(10, cy);
  ggCtx.lineTo(w - 10, cy);
  ggCtx.strokeStyle = "#30363d";
  ggCtx.lineWidth = 1;
  ggCtx.stroke();

  // Trail
  const posX = cx + (axG / maxG) * r;
  const posY = cy - (ayG / maxG) * r; // Negative ay is decel (bottom)

  ggHistory.push({ x: posX, y: posY, alpha: 1.0 });
  if (ggHistory.length > 25) ggHistory.shift();

  ggHistory.forEach((pt) => {
    pt.alpha *= 0.92;
    ggCtx.beginPath();
    ggCtx.arc(pt.x, pt.y, 3, 0, 2 * Math.PI);
    ggCtx.fillStyle = `rgba(136, 170, 238, ${pt.alpha * 0.4})`;
    ggCtx.fill();
  });

  // Active Dot
  const radialG = Math.sqrt(axG * axG + ayG * ayG);
  let dotColor = "#a3e636"; // Green
  if (radialG > 0.6) dotColor = "#ff6b6b"; // Red
  else if (radialG > 0.3) dotColor = "#fde047"; // Yellow

  ggCtx.beginPath();
  ggCtx.arc(posX, posY, 7, 0, 2 * Math.PI);
  ggCtx.fillStyle = dotColor;
  ggCtx.shadowColor = dotColor;
  ggCtx.shadowBlur = 10;
  ggCtx.fill();
  ggCtx.strokeStyle = "#ffffff";
  ggCtx.lineWidth = 2;
  ggCtx.stroke();
  ggCtx.shadowBlur = 0;
}

function initLiveCockpitMap() {
  const mapEl = document.getElementById("liveCockpitMap");
  if (!mapEl || liveCockpitMap) return;

  liveCockpitMap = L.map("liveCockpitMap").setView([19.0596, 72.8295], 13);
  L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", {
    attribution: '&copy; <a href="https://carto.com/">CARTO</a>'
  }).addTo(liveCockpitMap);
}

function initLiveAccChart() {
  const ctx = document.getElementById("liveAccWaveformChart");
  if (!ctx || liveAccChart) return;

  liveAccChart = new Chart(ctx, {
    type: "line",
    data: {
      labels: [],
      datasets: [
        { label: "Ax (Lateral)", data: [], borderColor: "#ff6b6b", borderWidth: 2, pointRadius: 0, tension: 0.3 },
        { label: "Ay (Longitudinal)", data: [], borderColor: "#88aaee", borderWidth: 2, pointRadius: 0, tension: 0.3 },
        { label: "Az (Vertical)", data: [], borderColor: "#a3e636", borderWidth: 2, pointRadius: 0, tension: 0.3 }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      scales: {
        x: { display: false },
        y: {
          min: -15,
          max: 25,
          grid: { color: "rgba(0,0,0,0.06)" }
        }
      },
      plugins: {
        legend: { position: "top", labels: { font: { family: "Plus Jakarta Sans", weight: "bold", size: 10 } } }
      }
    }
  });
}

function appendIncidentLog(msg, severity = "nominal") {
  const container = document.getElementById("incident-ticker-list");
  if (!container) return;
  const timeStr = new Date().toLocaleTimeString();

  const item = document.createElement("div");
  item.className = `incident-item ${severity}`;
  item.innerHTML = `<span class="time">[${timeStr}]</span> <span class="msg">${msg}</span>`;
  container.prepend(item);

  // Keep max 20 entries
  while (container.children.length > 20) {
    container.removeChild(container.lastChild);
  }
}

// Global Anomaly Injection
window.injectTelemetryEvent = function(eventType) {
  if (cockpitSocket && cockpitSocket.readyState === WebSocket.OPEN) {
    cockpitSocket.send(JSON.stringify({ action: "inject_event", event_type: eventType }));
  } else {
    fetch("/api/telemetry/inject-event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ vehicle_id: "V01", event_type: eventType })
    });
  }
};

// 7. Trip Waveforms & GIS Replay
async function loadTripTelemetry(tripId) {
  currentTripId = tripId;
  try {
    const res = await fetch(`/api/trips/${tripId}/telemetry`);
    if (res.ok) {
      const data = await res.json();
      currentTripsSamples[tripId] = data;
      renderTripDropdown();
      renderTripCharts(tripId);
    }
  } catch (err) {
    console.error("Failed loading trip:", err);
  }
}

function renderTripDropdown() {
  const select = document.getElementById("trip-select-dropdown");
  if (!select) return;
  select.innerHTML = `
    <option value="T001">Trip T001 (Safe Corridor - Bandra to BKC)</option>
    <option value="T046">Trip T046 (Aggressive Swerves - Airport Highway)</option>
    <option value="T089">Trip T089 (Night Route - Pothole Shocks)</option>
    <option value="T112">Trip T112 (Suburban Delivery - Moderate)</option>
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
    if (!leafletMap) {
      leafletMap = L.map("tripMap").setView([19.0760, 72.8777], 13);
      L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", {
        attribution: '&copy; CARTO'
      }).addTo(leafletMap);
    }

    const latLngs = data.map((d) => [d.Latitude || d.GPS_Latitude || 19.076, d.Longitude || d.GPS_Longitude || 72.877]);
    if (latLngs.length > 0) {
      leafletMap.eachLayer((layer) => {
        if (layer instanceof L.Polyline || layer instanceof L.Marker) {
          leafletMap.removeLayer(layer);
        }
      });
      L.polyline(latLngs, { color: "#ff6b6b", weight: 4 }).addTo(leafletMap);
      L.marker(latLngs[0]).addTo(leafletMap).bindPopup("Trip Origin");
      L.marker(latLngs[latLngs.length - 1]).addTo(leafletMap).bindPopup("Trip Destination");
      leafletMap.fitBounds(L.polyline(latLngs).getBounds());
    }
  }

  // Render ChartJS Accel
  const accelCtx = document.getElementById("accelChart");
  if (accelCtx) {
    if (accelChart) accelChart.destroy();
    accelChart = new Chart(accelCtx, {
      type: "line",
      data: {
        labels: data.map((_, i) => `${i}s`),
        datasets: [
          { label: "Ax (Lateral)", data: data.map((d) => d.Acceleration_X != null ? d.Acceleration_X : 0.0), borderColor: "#ff6b6b", borderWidth: 1.5, pointRadius: 0 },
          { label: "Ay (Longitudinal)", data: data.map((d) => d.Acceleration_Y != null ? d.Acceleration_Y : 0.0), borderColor: "#88aaee", borderWidth: 1.5, pointRadius: 0 },
          { label: "Az (Vertical)", data: data.map((d) => d.Acceleration_Z != null ? d.Acceleration_Z : 9.81), borderColor: "#a3e636", borderWidth: 1.5, pointRadius: 0 }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: "top" } }
      }
    });
  }

  // Render ChartJS Gyro
  const gyroCtx = document.getElementById("gyroChart");
  if (gyroCtx) {
    if (gyroChart) gyroChart.destroy();
    gyroChart = new Chart(gyroCtx, {
      type: "line",
      data: {
        labels: data.map((_, i) => `${i}s`),
        datasets: [
          { label: "Gx (Roll)", data: data.map((d) => d.Gyro_X != null ? d.Gyro_X : 0.0), borderColor: "#fde047", borderWidth: 1.5, pointRadius: 0 },
          { label: "Gy (Pitch)", data: data.map((d) => d.Gyro_Y != null ? d.Gyro_Y : 0.0), borderColor: "#c4b5fd", borderWidth: 1.5, pointRadius: 0 },
          { label: "Gz (Yaw)", data: data.map((d) => d.Gyro_Z != null ? d.Gyro_Z : 0.0), borderColor: "#fdba74", borderWidth: 1.5, pointRadius: 0 }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: "top" } }
      }
    });
  }
}

// 8. Setup ML Simulator & UBI
function setupMLSimulator() {
  const btnPredict = document.getElementById("btn-predict-driver");
  if (btnPredict) {
    btnPredict.addEventListener("click", async () => {
      const driverId = document.getElementById("ml-driver-id").value;
      const hbr = parseFloat(document.getElementById("ml-hbr").value);
      const rar = parseFloat(document.getElementById("ml-rar").value);
      const scs = parseFloat(document.getElementById("ml-scs").value);

      const out = document.getElementById("driver-inference-output");
      out.innerHTML = `<div class="spinner-inline"></div> Executing Feast Online Feature Store retrieval & LightGBM inference...`;

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
        const data = await res.json();
        out.innerHTML = `
          <div class="result-highlight">
            <div class="res-score">Predicted Score: <strong>${data.predicted_safety_score.toFixed(1)} / 100</strong></div>
            <div class="res-tier">Risk Tier: <strong>${data.risk_tier}</strong></div>
            <div class="res-latencies">
              <span>Feast Online Latency: <strong>${data.feature_store_latency_ms} ms</strong></span> •
              <span>Inference: <strong>${data.inference_latency_ms} ms</strong></span> •
              <span>Total: <strong>${data.total_latency_ms} ms</strong></span>
            </div>
            <div class="res-coaching mt-2">
              <strong>Automated AI Coaching:</strong>
              <ul>${data.coaching_recommendation.map((c) => `<li>${c}</li>`).join("")}</ul>
            </div>
          </div>
        `;
      } catch (err) {
        out.innerHTML = `<div class="res-error">Inference Error: ${err.message}</div>`;
      }
    });
  }

  // Crash Triage Button
  const btnCrash = document.getElementById("btn-triage-crash");
  if (btnCrash) {
    btnCrash.addEventListener("click", async () => {
      const accY = parseFloat(document.getElementById("crash-acc-y").value);
      const accZ = parseFloat(document.getElementById("crash-acc-z").value);
      const spd = parseFloat(document.getElementById("crash-speed").value);
      const mount = document.getElementById("crash-mount").value;

      const out = document.getElementById("crash-inference-output");
      out.innerHTML = `<div class="spinner-inline"></div> Classifying kinetic crash pulse...`;

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
        const data = await res.json();
        const alertClass = data.emergency_dispatch_required ? "res-critical" : "res-nominal";
        out.innerHTML = `
          <div class="result-highlight ${alertClass}">
            <div class="res-score">Event Classification: <strong>${data.event_type}</strong> (${data.severity})</div>
            <div class="res-tier">Emergency Dispatch: <strong>${data.emergency_dispatch_required ? "🚨 TRIGGERED (HIGH SEVERITY)" : "✅ Not Required"}</strong></div>
            <div class="res-tier">Peak G-Force: <strong>${data.peak_g_force}g</strong> • Impact Speed: <strong>${data.speed_at_impact_kmh} km/h</strong></div>
            <p class="res-narrative mt-2">${data.reconstruction_narrative}</p>
          </div>
        `;
      } catch (err) {
        out.innerHTML = `<div class="res-error">Crash Triage Error: ${err.message}</div>`;
      }
    });
  }

  // UBI Calc Button
  const btnUbi = document.getElementById("btn-calc-ubi");
  if (btnUbi) {
    btnUbi.addEventListener("click", async () => {
      const driverId = document.getElementById("ubi-driver-select").value;
      const basePrem = parseFloat(document.getElementById("ubi-base-premium").value);
      const out = document.getElementById("ubi-result-output");

      try {
        const res = await fetch("/v1/ubi/calculate-premium", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ driver_id: driverId, base_annual_premium_inr: basePrem })
        });
        const data = await res.json();
        out.innerHTML = `
          <div class="result-highlight">
            <div class="res-score">Adjusted Premium: <strong>₹${data.adjusted_premium_inr.toLocaleString()} / year</strong></div>
            <div class="res-tier">Actuarial Tier: <strong>${data.actuarial_tier}</strong></div>
            <div class="res-tier">Annual Savings: <strong>₹${data.annual_savings_inr.toLocaleString()} (${data.discount_or_surcharge_pct > 0 ? "+" : ""}${data.discount_or_surcharge_pct}%)</strong></div>
          </div>
        `;
      } catch (err) {}
    });
  }
}

// 9. Render Potholes List
function renderPotholes(list) {
  const container = document.getElementById("pothole-list-container");
  if (!container || !Array.isArray(list)) return;
  container.innerHTML = "";

  list.slice(0, 6).forEach((p) => {
    const lat = p.GPS_Latitude != null ? p.GPS_Latitude.toFixed(4) : (p.Latitude != null ? p.Latitude.toFixed(4) : "19.0760");
    const lon = p.GPS_Longitude != null ? p.GPS_Longitude.toFixed(4) : (p.Longitude != null ? p.Longitude.toFixed(4) : "72.8777");
    const shock = p.Shock_Peak_Az_g != null ? p.Shock_Peak_Az_g : (p.Peak_Az_g != null ? p.Peak_Az_g : 2.5);
    const speed = p.Speed_At_Impact_KMH != null ? p.Speed_At_Impact_KMH : 35;
    const classification = p.Road_Roughness_Classification || p.Classification || "Severe Pothole";

    const item = document.createElement("div");
    item.className = "pothole-item";
    item.innerHTML = `
      <div class="pot-icon">⚠️</div>
      <div class="pot-info">
        <h5>${p.Pothole_ID} • ${p.Severity || 'High'} Severity (${shock}g Peak)</h5>
        <span>GPS: ${lat}, ${lon} • Speed: ${speed} km/h • Vehicle: ${p.Vehicle_ID}</span>
      </div>
      <span class="side-badge badge-orange">${classification}</span>
    `;
    container.appendChild(item);
  });
}

// 10. Filters & Search
function setupFilters() {
  const dFilter = document.getElementById("driver-risk-filter");
  if (dFilter) {
    dFilter.addEventListener("change", (e) => {
      const val = e.target.value;
      if (val === "ALL") renderDrivers(driversData);
      else renderDrivers(driversData.filter((d) => {
        const tier = d.Tier || d.Risk_Tier || d.Risk_Level || "";
        return tier.includes(val);
      }));
    });
  }

  const vFilter = document.getElementById("vehicle-status-filter");
  if (vFilter) {
    vFilter.addEventListener("change", (e) => {
      const val = e.target.value;
      if (val === "ALL") renderVehicles(vehiclesData);
      else renderVehicles(vehiclesData.filter((v) => {
        const st = v.Status || v.Urgency_Status || v.Urgency || "";
        return st.includes(val);
      }));
    });
  }

  const search = document.getElementById("global-search");
  if (search) {
    search.addEventListener("input", (e) => {
      const q = e.target.value.toLowerCase();
      renderDrivers(driversData.filter((d) => {
        const name = (d.Driver_Name || d.Name || "").toLowerCase();
        const id = (d.Driver_ID || "").toLowerCase();
        return name.includes(q) || id.includes(q);
      }));
      renderVehicles(vehiclesData.filter((v) => {
        const id = (v.Vehicle_ID || "").toLowerCase();
        const model = (v.Model || "").toLowerCase();
        return id.includes(q) || model.includes(q);
      }));
    });
  }
}

// 11. Modal Openers
window.openDriverModal = function(driverId) {
  const d = driversData.find((item) => item.Driver_ID === driverId);
  if (!d) return;

  const name = d.Driver_Name || d.Name || d.Driver_ID;
  const score = d.Safety_Score != null ? Number(d.Safety_Score).toFixed(1) : "85.0";
  const tier = d.Tier || d.Risk_Tier || d.Risk_Level || "Safe";
  const hbr = (d.Harsh_Brake_Rate_Per_100KM != null ? Number(d.Harsh_Brake_Rate_Per_100KM) : (d.Harsh_Brake_Rate_100km || 0.0)).toFixed(1);
  const speed = (d.Speed_Compliance_Score != null ? Number(d.Speed_Compliance_Score) : 100.0).toFixed(1);
  const coaching = Array.isArray(d.Coaching_Feedback) ? d.Coaching_Feedback.join(" ") : (d.Coaching_Feedback || "Exemplary driving profile: Maintain smooth throttle and braking modulation.");

  document.getElementById("modalDriverName").textContent = `${name} (${d.Driver_ID})`;
  const body = document.getElementById("modalDriverBody");
  body.innerHTML = `
    <div class="modal-metrics-grid">
      <div class="m-card">
        <span class="m-card-lbl">Safety Score</span>
        <div class="m-card-val">${score} / 100</div>
      </div>
      <div class="m-card">
        <span class="m-card-lbl">Risk Tier</span>
        <div class="m-card-val">${tier}</div>
      </div>
      <div class="m-card">
        <span class="m-card-lbl">Harsh Brakes</span>
        <div class="m-card-val">${hbr} /100km</div>
      </div>
      <div class="m-card">
        <span class="m-card-lbl">Speed Compliance</span>
        <div class="m-card-val">${speed}%</div>
      </div>
    </div>

    <div class="modal-coaching-box mt-3">
      <h4><i data-lucide="sparkles"></i> Contextual AI Driver Coaching:</h4>
      <p class="coaching-text">${coaching}</p>
    </div>
  `;
  document.getElementById("driverModal").classList.add("active");
  lucide.createIcons();
};

window.openVehicleModal = function(vehicleId) {
  const v = vehiclesData.find((item) => item.Vehicle_ID === vehicleId);
  if (!v) return;

  const model = v.Model || "Delivery Asset";
  const rul = v.Remaining_Useful_Life_Days != null ? v.Remaining_Useful_Life_Days : (v.RUL_Days || 120);
  const health = (v.Health_Index != null ? Number(v.Health_Index) : 85.0).toFixed(1);
  const vib = (v.Vibration_RMS != null ? Number(v.Vibration_RMS) : 0.65).toFixed(3);
  const gyro = (v.Gyro_Jitter != null ? Number(v.Gyro_Jitter) : 12.0).toFixed(1);
  const diagnosis = v.Diagnostic_Summary || v.Primary_Fault_Diagnosis || "Nominal operating bounds.";

  document.getElementById("modalVehicleId").textContent = `${v.Vehicle_ID} - ${model}`;
  const body = document.getElementById("modalVehicleBody");
  body.innerHTML = `
    <div class="modal-metrics-grid">
      <div class="m-card">
        <span class="m-card-lbl">RUL Days</span>
        <div class="m-card-val">${rul} Days</div>
      </div>
      <div class="m-card">
        <span class="m-card-lbl">Health Index</span>
        <div class="m-card-val">${health}%</div>
      </div>
      <div class="m-card">
        <span class="m-card-lbl">Vibration RMS</span>
        <div class="m-card-val">${vib}g</div>
      </div>
      <div class="m-card">
        <span class="m-card-lbl">Gyro Jitter</span>
        <div class="m-card-val">${gyro}°/s</div>
      </div>
    </div>

    <div class="modal-coaching-box mt-3">
      <h4><i data-lucide="wrench"></i> Sub-System Diagnostic Analysis:</h4>
      <p class="coaching-text">${diagnosis}</p>
    </div>
  `;
  document.getElementById("vehicleModal").classList.add("active");
  lucide.createIcons();
};
