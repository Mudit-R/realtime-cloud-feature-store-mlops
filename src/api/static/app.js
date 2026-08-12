// PulseStar Fleet Telematics & AI Analytics Dashboard State
let fleetSummary = {};
let driversData = [];
let vehiclesData = [];
let currentTripsSamples = {};
let currentTripId = "T001";
let leafletMap = null;
let accelChart = null;
let gyroChart = null;

// Initialize on DOM Ready
document.addEventListener("DOMContentLoaded", async () => {
  setupNavigation();
  setupFilters();
  setupMLSimulator();
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

      const linkText = link.querySelector("span").textContent.trim();
      if (breadcrumb) breadcrumb.textContent = linkText;

      if (targetId === "trip-explorer") {
        setTimeout(() => {
          if (leafletMap) leafletMap.invalidateSize();
          renderTripCharts(currentTripId);
        }, 150);
      }
      lucide.createIcons();
    });
  });

  // Modal Close
  const closeBtn = document.getElementById("btn-close-modal");
  const backdrop = document.getElementById("neo-modal-backdrop");
  if (closeBtn) {
    closeBtn.addEventListener("click", () => {
      backdrop.classList.remove("active");
    });
  }
  if (backdrop) {
    backdrop.addEventListener("click", (e) => {
      if (e.target === backdrop) backdrop.classList.remove("active");
    });
  }
}

// 2. Data Loading from FastAPI Backend
async function loadInitialData() {
  try {
    const [sumRes, dRes, vRes] = await Promise.all([
      fetch("/api/fleet/summary"),
      fetch("/api/drivers"),
      fetch("/api/vehicles")
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

  setTxt("kpi-avg-score", fleetSummary.Avg_Driver_Safety_Score || "82.4");
  setTxt("kpi-safe-count", fleetSummary.Safe_Drivers_Count || "19");
  setTxt("kpi-mod-count", fleetSummary.Moderate_Drivers_Count || "6");
  setTxt("kpi-high-count", fleetSummary.High_Risk_Drivers_Count || "5");

  setTxt("kpi-avg-health", fleetSummary.Avg_Vehicle_Health_Index || "78.6");
  setTxt("kpi-healthy-count", fleetSummary.Healthy_Vehicles_Count || "18");
  setTxt("kpi-monitor-count", fleetSummary.Monitor_Vehicles_Count || "7");
  setTxt("kpi-critical-count", fleetSummary.Critical_Vehicles_Count || "5");
}

// 4. Render Driver Cards & Table
function renderDrivers(drivers) {
  const container = document.getElementById("driver-cards-container");
  const tbody = document.getElementById("driver-table-body");
  if (!container) return;

  container.innerHTML = "";
  if (tbody) tbody.innerHTML = "";

  drivers.forEach((d) => {
    const riskCls = d.Safety_Score >= 82 ? "low" : d.Safety_Score >= 65 ? "medium" : "high";

    // Card
    const card = document.createElement("div");
    card.className = "neo-entity-card";
    card.onclick = () => openDriverModal(d);
    card.innerHTML = `
      <div class="entity-top">
        <div class="entity-name">
          <h3>${d.Driver_Name}</h3>
          <div class="entity-sub-text">${d.Driver_ID} • ${d.Archetype} • ${d.Primary_Zone}</div>
        </div>
        <div class="neubrutal-badge ${riskCls}">
          <div class="badge-score-val">${d.Safety_Score}</div>
          <div class="badge-score-lbl">${d.Tier}</div>
        </div>
      </div>
      <div class="metrics-block">
        <div class="m-item">
          <span class="m-lbl">Harsh Brake /100km</span>
          <span class="m-val">${d.Harsh_Brake_Rate_Per_100KM}</span>
        </div>
        <div class="m-item">
          <span class="m-lbl">Rapid Accel /100km</span>
          <span class="m-val">${d.Rapid_Accel_Rate_Per_100KM}</span>
        </div>
        <div class="m-item">
          <span class="m-lbl">Speed Compliance</span>
          <span class="m-val">${d.Speed_Compliance_Score || 92}%</span>
        </div>
        <div class="m-item">
          <span class="m-lbl">Night Shift Trips</span>
          <span class="m-val">${d.Night_Trip_Pct}%</span>
        </div>
      </div>
      <div class="card-action-box">
        <strong>Coaching Insight:</strong> ${d.Coaching_Feedback ? d.Coaching_Feedback[0] : "Optimal compliance"}
      </div>
    `;
    container.appendChild(card);

    // Table row
    if (tbody) {
      const tr = document.createElement("tr");
      tr.onclick = () => openDriverModal(d);
      tr.innerHTML = `
        <td><strong>${d.Driver_Name}</strong> (${d.Driver_ID})</td>
        <td><span class="side-badge badge-yellow">${d.Archetype}</span></td>
        <td>${d.Primary_Zone} / ${d.Shift_Preference}</td>
        <td><span class="side-badge ${riskCls === 'low' ? 'badge-green' : riskCls === 'medium' ? 'badge-orange' : 'badge-red'}">${d.Safety_Score}</span></td>
        <td>${d.Harsh_Brake_Rate_Per_100KM}</td>
        <td>${d.Rapid_Accel_Rate_Per_100KM}</td>
        <td>${d.Harsh_Turn_Rate_Per_100KM}</td>
        <td>${d.Speed_Compliance_Score || 90}%</td>
        <td><button class="btn-neo" style="padding: 0.25rem 0.6rem; font-size: 0.75rem;">Inspect</button></td>
      `;
      tbody.appendChild(tr);
    }
  });
}

// 5. Render Vehicle Cards
function renderVehicles(vehicles) {
  const container = document.getElementById("vehicle-cards-container");
  if (!container) return;
  container.innerHTML = "";

  vehicles.forEach((v) => {
    const urgencyCls = v.Health_Index >= 80 ? "low" : v.Health_Index >= 60 ? "medium" : "Immediate";

    const card = document.createElement("div");
    card.className = "neo-entity-card";
    card.onclick = () => openVehicleModal(v);
    card.innerHTML = `
      <div class="entity-top">
        <div class="entity-name">
          <h3>${v.Model}</h3>
          <div class="entity-sub-text">${v.Vehicle_ID} • ${v.Vehicle_Type} • ${v.Manufacturing_Year}</div>
        </div>
        <div class="neubrutal-badge ${urgencyCls}">
          <div class="badge-score-val">${v.Health_Index}</div>
          <div class="badge-score-lbl">${v.Status}</div>
        </div>
      </div>
      <div class="metrics-block">
        <div class="m-item">
          <span class="m-lbl">Chassis Vib RMS</span>
          <span class="m-val">${v.Vibration_RMS} g</span>
        </div>
        <div class="m-item">
          <span class="m-lbl">Gyro Yaw Jitter</span>
          <span class="m-val">${v.Gyro_Jitter}&deg;/s</span>
        </div>
        <div class="m-item">
          <span class="m-lbl">Remaining Life (RUL)</span>
          <span class="m-val">${v.Remaining_Useful_Life_Days} Days</span>
        </div>
        <div class="m-item">
          <span class="m-lbl">Days Since Service</span>
          <span class="m-val">${v.Days_Since_Last_Service} D</span>
        </div>
      </div>
      <div class="card-action-box">
        <strong>Diagnosis:</strong> ${v.Diagnostic_Summary}
      </div>
    `;
    container.appendChild(card);
  });
}

// 6. Modals
function openDriverModal(d) {
  const backdrop = document.getElementById("neo-modal-backdrop");
  const title = document.getElementById("modal-title");
  const body = document.getElementById("modal-body-content");

  title.textContent = `Driver Profile: ${d.Driver_Name} (${d.Driver_ID})`;
  body.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.25rem;">
      <div>
        <h4 style="font-size: 1.1rem; font-weight: 900;">${d.Driver_Name}</h4>
        <p style="font-size: 0.85rem; color: #4b5563; font-weight: 700;">Age ${d.Age} • ${d.Experience_Years} Yrs Exp • ${d.Primary_Zone} Zone</p>
      </div>
      <div class="neubrutal-badge ${d.Safety_Score >= 82 ? 'low' : d.Safety_Score >= 65 ? 'medium' : 'high'}">
        <div class="badge-score-val">${d.Safety_Score}</div>
        <div class="badge-score-lbl">${d.Tier}</div>
      </div>
    </div>

    <div class="metrics-block" style="margin-bottom: 1.25rem;">
      <div class="m-item"><span class="m-lbl">Harsh Braking Rate</span><span class="m-val">${d.Harsh_Brake_Rate_Per_100KM} /100km</span></div>
      <div class="m-item"><span class="m-lbl">Rapid Throttle Accel</span><span class="m-val">${d.Rapid_Accel_Rate_Per_100KM} /100km</span></div>
      <div class="m-item"><span class="m-lbl">Cornering & Swerves</span><span class="m-val">${d.Harsh_Turn_Rate_Per_100KM} /100km</span></div>
      <div class="m-item"><span class="m-lbl">Overspeeding (>50 km/h)</span><span class="m-val">${d.Overspeed_50_Pct}%</span></div>
      <div class="m-item"><span class="m-lbl">Speed Compliance</span><span class="m-val">${d.Speed_Compliance_Score || 90}%</span></div>
      <div class="m-item"><span class="m-lbl">Total Distance Covered</span><span class="m-val">${d.Total_Distance_KM} KM</span></div>
    </div>

    <div style="background: #ffffff; border: 2px solid #000; border-radius: 8px; padding: 1rem;">
      <h5 style="font-size: 0.88rem; font-weight: 900; margin-bottom: 0.5rem;"><i data-lucide="award"></i> Targeted AI Coaching Guidelines:</h5>
      <ul style="padding-left: 1.25rem; font-size: 0.85rem; font-weight: 700; color: #374151;">
        ${(d.Coaching_Feedback || []).map(f => `<li style="margin-bottom: 0.35rem;">${f}</li>`).join('')}
      </ul>
    </div>
  `;
  backdrop.classList.add("active");
  lucide.createIcons();
}

function openVehicleModal(v) {
  const backdrop = document.getElementById("neo-modal-backdrop");
  const title = document.getElementById("modal-title");
  const body = document.getElementById("modal-body-content");

  title.textContent = `Asset Diagnostics: ${v.Model} (${v.Vehicle_ID})`;
  body.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.25rem;">
      <div>
        <h4 style="font-size: 1.1rem; font-weight: 900;">${v.Model}</h4>
        <p style="font-size: 0.85rem; color: #4b5563; font-weight: 700;">${v.Vehicle_Type} • Odometer: ${v.Odometer_KM.toLocaleString()} KM</p>
      </div>
      <div class="neubrutal-badge ${v.Health_Index >= 80 ? 'low' : v.Health_Index >= 60 ? 'medium' : 'Immediate'}">
        <div class="badge-score-val">${v.Health_Index}</div>
        <div class="badge-score-lbl">${v.Status}</div>
      </div>
    </div>

    <div class="metrics-block" style="margin-bottom: 1.25rem;">
      <div class="m-item"><span class="m-lbl">Vertical Vibration RMS</span><span class="m-val">${v.Vibration_RMS} g</span></div>
      <div class="m-item"><span class="m-lbl">Peak Vibration (P95)</span><span class="m-val">${v.Vibration_P95} g</span></div>
      <div class="m-item"><span class="m-lbl">Steering Gyro Jitter</span><span class="m-val">${v.Gyro_Jitter}&deg;/s</span></div>
      <div class="m-item"><span class="m-lbl">Braking Judder Flutter</span><span class="m-val">${v.Brake_Judder} g</span></div>
      <div class="m-item"><span class="m-lbl">Remaining Useful Life</span><span class="m-val">${v.Remaining_Useful_Life_Days} Days</span></div>
      <div class="m-item"><span class="m-lbl">Days Since Last Service</span><span class="m-val">${v.Days_Since_Last_Service} Days</span></div>
    </div>

    <div style="background: #ffffff; border: 2px solid #000; border-radius: 8px; padding: 1rem;">
      <h5 style="font-size: 0.88rem; font-weight: 900; margin-bottom: 0.5rem;"><i data-lucide="wrench"></i> Sub-System Diagnostic Report:</h5>
      <p style="font-size: 0.85rem; font-weight: 700; color: #374151; line-height: 1.5;">${v.Diagnostic_Summary}</p>
    </div>
  `;
  backdrop.classList.add("active");
  lucide.createIcons();
}

// 7. Trip Telemetry, Waveforms & Leaflet Map
async function loadTripTelemetry(tripId) {
  try {
    const res = await fetch(`/api/trips/${tripId}/telemetry`);
    if (!res.ok) return;
    const points = await res.json();
    currentTripsSamples[tripId] = points;
    currentTripId = tripId;

    const info = document.getElementById("telemetry-rows-info");
    if (info) info.textContent = `${points.length} streaming telemetry sensor packets loaded`;

    renderLeafletMap(points);
    renderTripCharts(points);
  } catch (e) {
    console.error(`Failed loading trip ${tripId}:`, e);
  }
}

function renderLeafletMap(points) {
  const mapContainer = document.getElementById("leaflet-map");
  if (!mapContainer || !points || points.length === 0) return;

  const latlngs = points.map(p => [p.Latitude, p.Longitude]);

  if (!leafletMap) {
    leafletMap = L.map("leaflet-map").setView(latlngs[0], 13);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(leafletMap);
  } else {
    leafletMap.eachLayer(layer => {
      if (layer instanceof L.Polyline || layer instanceof L.Marker || layer instanceof L.CircleMarker) {
        leafletMap.removeLayer(layer);
      }
    });
  }

  // Draw Route Polyline
  const polyline = L.polyline(latlngs, { color: "#000", weight: 5, opacity: 0.85 }).addTo(leafletMap);
  leafletMap.fitBounds(polyline.getBounds(), { padding: [30, 30] });

  // Start & End markers
  L.circleMarker(latlngs[0], { radius: 8, fillColor: "#a3e636", color: "#000", weight: 2, fillOpacity: 1 }).addTo(leafletMap).bindPopup("Trip Origin");
  L.circleMarker(latlngs[latlngs.length - 1], { radius: 8, fillColor: "#ff6b6b", color: "#000", weight: 2, fillOpacity: 1 }).addTo(leafletMap).bindPopup("Trip Destination");

  // Plot Potholes
  points.forEach(p => {
    if (Math.abs(p.Acceleration_Z - 9.81) > 2.2) {
      L.circleMarker([p.Latitude, p.Longitude], {
        radius: 6,
        fillColor: "#fde047",
        color: "#000",
        weight: 2,
        fillOpacity: 1
      }).addTo(leafletMap).bindPopup(`<b>Road Surface Shock</b><br>Vert G: ${(Math.abs(p.Acceleration_Z - 9.81)/9.81).toFixed(2)}g<br>Speed: ${p.Speed_KMH} km/h`);
    }
  });
}

function renderTripCharts(points) {
  if (!points || !Array.isArray(points) || points.length === 0) return;

  const labels = points.map(p => `${p.Minute_Offset}m`);
  const ax = points.map(p => p.Acceleration_X);
  const ay = points.map(p => p.Acceleration_Y);
  const az = points.map(p => p.Acceleration_Z);

  const gx = points.map(p => p.Gyro_X);
  const gy = points.map(p => p.Gyro_Y);
  const gz = points.map(p => p.Gyro_Z);

  // Accelerometer Chart
  const ctxAcc = document.getElementById("accel-chart");
  if (ctxAcc) {
    if (accelChart) accelChart.destroy();
    accelChart = new Chart(ctxAcc, {
      type: "line",
      data: {
        labels,
        datasets: [
          { label: "Longitudinal (Ay)", data: ay, borderColor: "#ff6b6b", borderWidth: 2, tension: 0.2, pointRadius: 2 },
          { label: "Vertical (Az)", data: az, borderColor: "#88aaee", borderWidth: 2, tension: 0.2, pointRadius: 2 },
          { label: "Lateral (Ax)", data: ax, borderColor: "#a3e636", borderWidth: 2, tension: 0.2, pointRadius: 2 }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: "top" } },
        scales: { y: { grid: { color: "rgba(0,0,0,0.06)" } } }
      }
    });
  }

  // Gyroscope Chart
  const ctxGyro = document.getElementById("gyro-chart");
  if (ctxGyro) {
    if (gyroChart) gyroChart.destroy();
    gyroChart = new Chart(ctxGyro, {
      type: "line",
      data: {
        labels,
        datasets: [
          { label: "Yaw Rate (Gz)", data: gz, borderColor: "#c4b5fd", borderWidth: 2, tension: 0.2, pointRadius: 2 },
          { label: "Roll (Gy)", data: gy, borderColor: "#fdba74", borderWidth: 2, tension: 0.2, pointRadius: 2 },
          { label: "Pitch (Gx)", data: gx, borderColor: "#5eead4", borderWidth: 2, tension: 0.2, pointRadius: 2 }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: "top" } },
        scales: { y: { grid: { color: "rgba(0,0,0,0.06)" } } }
      }
    });
  }
}

// 8. Filters & Search
function setupFilters() {
  const riskFilter = document.getElementById("driver-risk-filter");
  const sortSelect = document.getElementById("driver-sort-select");
  const searchInput = document.getElementById("global-search");

  const applyDriverFilters = () => {
    let filtered = [...driversData];
    const tier = riskFilter ? riskFilter.value : "ALL";
    const q = searchInput ? searchInput.value.toLowerCase().trim() : "";

    if (tier !== "ALL") {
      filtered = filtered.filter(d => d.Tier.includes(tier) || d.Risk_Level === tier);
    }
    if (q) {
      filtered = filtered.filter(d => 
        d.Driver_Name.toLowerCase().includes(q) || 
        d.Driver_ID.toLowerCase().includes(q) || 
        d.Archetype.toLowerCase().includes(q)
      );
    }

    const sortVal = sortSelect ? sortSelect.value : "score_desc";
    if (sortVal === "score_desc") filtered.sort((a, b) => b.Safety_Score - a.Safety_Score);
    else if (sortVal === "score_asc") filtered.sort((a, b) => a.Safety_Score - b.Safety_Score);
    else if (sortVal === "braking_desc") filtered.sort((a, b) => b.Harsh_Brake_Rate_Per_100KM - a.Harsh_Brake_Rate_Per_100KM);
    else if (sortVal === "speeding_desc") filtered.sort((a, b) => b.Overspeed_50_Pct - a.Overspeed_50_Pct);

    renderDrivers(filtered);
  };

  if (riskFilter) riskFilter.addEventListener("change", applyDriverFilters);
  if (sortSelect) sortSelect.addEventListener("change", applyDriverFilters);
  if (searchInput) searchInput.addEventListener("input", applyDriverFilters);

  // View toggle
  const btnCards = document.getElementById("btn-view-cards");
  const btnTable = document.getElementById("btn-view-table");
  const cardsCont = document.getElementById("driver-cards-container");
  const tableCont = document.getElementById("driver-table-container");

  if (btnCards && btnTable) {
    btnCards.addEventListener("click", () => {
      btnCards.classList.add("active");
      btnTable.classList.remove("active");
      cardsCont.style.display = "grid";
      tableCont.style.display = "none";
    });
    btnTable.addEventListener("click", () => {
      btnTable.classList.add("active");
      btnCards.classList.remove("active");
      cardsCont.style.display = "none";
      tableCont.style.display = "block";
    });
  }

  // Trip select dropdown
  const tripSelect = document.getElementById("trip-select");
  if (tripSelect) {
    tripSelect.addEventListener("change", async (e) => {
      await loadTripTelemetry(e.target.value);
    });
  }
}

// 9. Live ML Inference & Crash Triage Simulator
function setupMLSimulator() {
  const sHb = document.getElementById("slider-hb");
  const sSpd = document.getElementById("slider-spd");
  const vHb = document.getElementById("val-hb");
  const vSpd = document.getElementById("val-spd");

  if (sHb && vHb) {
    sHb.addEventListener("input", (e) => vHb.textContent = e.target.value);
  }
  if (sSpd && vSpd) {
    sSpd.addEventListener("input", (e) => vSpd.textContent = `${e.target.value}%`);
  }

  const btnDriverML = document.getElementById("btn-run-driver-ml");
  if (btnDriverML) {
    btnDriverML.addEventListener("click", async () => {
      const dId = document.getElementById("ml-driver-id-select").value;
      const hb = parseFloat(sHb.value);
      const spd = parseFloat(sSpd.value);

      const resBox = document.getElementById("driver-ml-result");
      resBox.style.display = "block";
      resBox.innerHTML = `<em>Calling Feast Feature Store & LightGBM on GCP Cloud Run...</em>`;

      try {
        const resp = await fetch("/v1/predict/driver-risk", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            driver_id: dId,
            harsh_brake_rate: hb,
            overspeed_50_pct: spd
          })
        });
        const data = await resp.json();
        resBox.innerHTML = `
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
            <strong style="font-size: 1rem;">Safety Score: ${data.predicted_safety_score}/100</strong>
            <span class="side-badge ${data.predicted_safety_score >= 82 ? 'badge-green' : data.predicted_safety_score >= 65 ? 'badge-orange' : 'badge-red'}">${data.risk_tier}</span>
          </div>
          <p style="font-size: 0.82rem; margin-bottom: 0.3rem;"><strong>Accident Probability:</strong> ${data.accident_probability_pct}%</p>
          <p style="font-size: 0.82rem; margin-bottom: 0.3rem;"><strong>UBI Policy Impact:</strong> ${data.ubi_premium_discount_pct >= 0 ? `${data.ubi_premium_discount_pct}% Discount` : `${Math.abs(data.ubi_premium_discount_pct)}% Surcharge`}</p>
          <p style="font-size: 0.75rem; color: #4b5563;"><strong>Feast Latency:</strong> ${data.feature_store_latency_ms}ms • <strong>Inference:</strong> ${data.inference_latency_ms}ms • <strong>Total:</strong> ${data.total_latency_ms}ms</p>
        `;
      } catch (err) {
        resBox.innerHTML = `<span style="color: red;">Error calling inference API: ${err.message}</span>`;
      }
    });
  }

  // Crash Triage Simulator
  const btnCrash = document.getElementById("btn-run-crash-triage");
  if (btnCrash) {
    btnCrash.addEventListener("click", async () => {
      const preset = document.getElementById("crash-preset-select").value;
      let payload = { acc_x: 0.0, acc_y: 0.0, acc_z: 9.81, gyro_x: 0.0, gyro_y: 0.0, gyro_z: 0.0, speed_kmh: 30.0 };

      if (preset === "pothole") {
        payload = { acc_x: 0.4, acc_y: -1.0, acc_z: 14.5, gyro_x: 3.0, gyro_y: 5.0, gyro_z: 8.0, speed_kmh: 38.0 };
      } else if (preset === "tipover") {
        payload = { acc_x: 1.5, acc_y: -2.0, acc_z: 12.5, gyro_x: 10.0, gyro_y: 52.0, gyro_z: 22.0, speed_kmh: 12.0 };
      } else if (preset === "collision") {
        payload = { acc_x: 3.5, acc_y: -6.8, acc_z: 18.2, gyro_x: 25.0, gyro_y: 45.0, gyro_z: 75.0, speed_kmh: 44.0 };
      }

      const resBox = document.getElementById("crash-triage-result");
      resBox.style.display = "block";
      resBox.innerHTML = `<em>Evaluating sensor shock profile...</em>`;

      try {
        const resp = await fetch("/v1/triage/crash-event", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
        const data = await resp.json();
        const isCrit = data.severity === "CRITICAL";
        resBox.innerHTML = `
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
            <strong style="font-size: 0.95rem;">Event: ${data.event_type}</strong>
            <span class="side-badge ${isCrit ? 'badge-red' : data.severity === 'MEDIUM' ? 'badge-orange' : 'badge-green'}">${data.severity}</span>
          </div>
          <p style="font-size: 0.82rem; margin-bottom: 0.3rem;"><strong>Peak G-Force:</strong> ${data.peak_g_force}g • <strong>Speed:</strong> ${data.speed_at_impact_kmh} km/h</p>
          <p style="font-size: 0.82rem; margin-bottom: 0.3rem;"><strong>Emergency SOS Dispatch:</strong> ${data.emergency_dispatch_required ? '🚨 YES - AUTOMATED DISPATCH TRIGGERED' : 'No Emergency Dispatch Needed'}</p>
          <p style="font-size: 0.8rem; color: #374151;">${data.reconstruction_narrative}</p>
        `;
      } catch (e) {
        resBox.innerHTML = `<span style="color: red;">Crash triage failed: ${e.message}</span>`;
      }
    });
  }
}
