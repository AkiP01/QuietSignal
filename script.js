const presetName     = document.getElementById("presetName");
const thresholdSlider = document.getElementById("thresholdSlider");
const thresholdInput  = document.getElementById("thresholdInput");
const volumeSlider    = document.getElementById("volumeSlider");
const volumeInput     = document.getElementById("volumeInput");
const beepInterval    = document.getElementById("beepInterval");

const deleteBtn = document.getElementById("deletePresetBtn");
const updateBtn = document.getElementById("updatePresetBtn");
const newBtn    = document.getElementById("newPresetBtn");
const addBtn    = document.getElementById("addPresetBtn");
let deleteConfirmTimer = null;
let deleteArmedIndex = null;
let editingIndex = null;
let lastCameraState = null;
let lastDeletedPreset = null;
let undoTimer = null;
let noiseHistory = [];
let systemLogs = []; 

// each item: { timestamp: Date, message: string }

let esp32Connected = false;
let noiseMode = "simulated"; // "simulated" | "live"
let lastESP32Seen = 0;

// ================= CAMERA CONFIG =================
let MEDIA_MTX_IP = localStorage.getItem("cameraIP") || "192.168.1.6";
const IS_HTTPS = location.protocol === "https:";

function setCameraStatus(state) {
  const dot = document.getElementById("cameraStatusDot");
  const text = document.getElementById("cameraStatusText");
  const icon = document.getElementById("cameraIcon");

  dot.className = "status-dot";
  icon.className = "camera-icon";

  if (state === "online") {
    dot.classList.add("online");
    icon.classList.add("online");
    text.textContent = "Camera: Online";
  } 
  else if (state === "connecting") {
    dot.classList.add("connecting");
    icon.classList.add("connecting");
    text.textContent = "Camera: Connecting…";
  } 
  else {
    dot.classList.add("offline");
    icon.classList.add("offline");
    text.textContent = "Camera: Offline";
  }

  // logging (your existing logic)
  if (state !== lastCameraState) {
    logSystem(
      state === "online"
        ? "Camera connected"
        : "Camera disconnected",
      state === "online" ? "add" : "delete"
    );
    lastCameraState = state;
  }
}

function connectCamera() {
  const input = document.getElementById("camera-ip");
  const statusEl = document.getElementById("cameraConnectionStatus");

  const ip = input.value.trim();
  if (!ip) {
    showToast("Enter camera IP", "error");
    return;
  }

  MEDIA_MTX_IP = ip;
  localStorage.setItem("cameraIP", ip);

  statusEl.textContent = "Status: Connecting…";
  statusEl.className = "status-text";

  showToast("Connecting to camera…", "info");
  logSystem("Camera connection attempt", "update");

  startCamera();
}


async function startCamera() {
  setCameraStatus("connecting");
  try {
    const pc = new RTCPeerConnection();

    pc.ontrack = event => {
      console.log("Video track received");
      const video = document.getElementById("cameraFeed");
      video.srcObject = event.streams[0];
      setCameraStatus("online");
    };

    pc.onconnectionstatechange = () => {
      console.log("WebRTC state:", pc.connectionState);
      if (pc.connectionState === "failed" || pc.connectionState === "disconnected") {
        setCameraStatus("offline");
      }
    };

    // 🔴 REQUIRED
    pc.addTransceiver("video", { direction: "recvonly" });

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    const res = await fetch(`http://${MEDIA_MTX_IP}:8889/tapo_cam/whep`, {
      method: "POST",
      headers: { "Content-Type": "application/sdp" },
      body: offer.sdp
    });

    if (!res.ok) {
      throw new Error("WHEP request failed");
    }

    const answerSDP = await res.text();

    await pc.setRemoteDescription({
      type: "answer",
      sdp: answerSDP
    });

    console.log("WebRTC connected");
  } catch (err) {
    console.error("Camera error:", err);
    setCameraStatus("offline");
  }
}

startCamera();

let esp32IP = localStorage.getItem("esp32IP") || "";
let connected = false;

async function fetchESP32Status() {
  if (!esp32IP) return;

  const controller = new AbortController();
  setTimeout(() => controller.abort(), 2000);

  try {
    const res = await fetch(`http://${esp32IP}/status`, {
      signal: controller.signal
    });

    if (!res.ok) throw new Error("ESP32 offline");

    const data = await res.json();

    lastESP32Seen = Date.now();

    if (!esp32Connected) {
      esp32Connected = true;
      noiseMode = "live";
      showToast("ESP32 connected � Live noise mode", "success");
      logSystem("ESP32 connected", "activate");
      showToast("Noise simulation stopped", "info");
    }

    const noisePercent = data.noisePercent ?? Math.round((data.noise / 4095) * 100);
updateStatus(noisePercent, data.threshold);
    checkThreshold(data.noisePercent, new Date());

  } catch (err) {
    if (esp32Connected && Date.now() - lastESP32Seen > 5000) {
      esp32Connected = false;
      noiseMode = "simulated";

      showToast("ESP32 disconnected — Simulation resumed", "update");
      logSystem("ESP32 disconnected", "delete");
    }
  }
}

async function connectESP32() {
  const input = document.getElementById("esp32-ip");
  const statusEl = document.getElementById("esp32Status");

  const ip = input.value.trim();
  if (!ip) {
    showToast("Enter ESP32 IP", "error");
    return;
  }

  try {
    const res = await fetch(`http://${ip}/status`);
    if (!res.ok) throw new Error();

    esp32IP = ip;
    localStorage.setItem("esp32IP", ip);

    esp32Connected = true;
    noiseMode = "live";

    statusEl.textContent = "Connected";
    statusEl.className = "status-connected";

    showToast("ESP32 connected — Live mode active", "success");
    showToast("Noise simulation disabled", "info");

    logSystem("ESP32 manually connected", "activate");


  } catch {
    esp32Connected = false;
    noiseMode = "simulated";

    statusEl.textContent = "Disconnected";
    statusEl.className = "status-disconnected";

    showToast("ESP32 connection failed", "delete");
    showToast("Simulation mode active", "info");

    logSystem("ESP32 connection failed", "delete");

  }
}

window.addEventListener("load", () => {
  if (!esp32IP) return;

  fetchESP32Status();
});

function initESP32Modal() {
  const input = document.getElementById("esp32-ip");
  if (input && esp32IP) input.value = esp32IP;
}


deleteBtn.onclick = () => {
  e.stopPropagation(); // prevent modal click
  if (editingIndex === null) return;

  // Already armed → CONFIRM DELETE
  if (deleteArmedIndex === editingIndex) {
    deletePreset(editingIndex);
    cancelDeleteConfirm();
    return;
  }

  // First tap → ARM DELETE
  armDeleteConfirm(editingIndex);
};

function armDeleteConfirm(index) {
  deleteArmedIndex = index;

  deleteBtn.textContent = "Tap again to confirm";
  deleteBtn.classList.add("confirm");

  clearTimeout(deleteConfirmTimer);

  deleteConfirmTimer = setTimeout(() => {
    cancelDeleteConfirm();
  }, 3000);
}

function cancelDeleteConfirm() {
  deleteConfirmTimer = null;
  deleteArmedIndex = null;
  clearTimeout(deleteConfirmTimer);

  deleteBtn.textContent = "Delete Preset";
  deleteBtn.classList.remove("confirm");
}

setInterval(() => {
  if (esp32IP) {
    fetchESP32Status();
  }
}, 1000);



let presets = [
  { name: "Library", threshold: 40, volume: 30, interval: 5 },
  { name: "Classroom", threshold: 70, volume: 50, interval: 5 },
  { name: "Outdoor", threshold: 85, volume: 70, interval: 3 }
];

function renderPresetList() {
  const list = document.getElementById("presetList");
  list.innerHTML = "";

  presets.forEach((preset, index) => {
    const btn = document.createElement("button");
    btn.textContent = `Edit ${preset.name}`;

    btn.onclick = () => {
      console.log("Editing preset:", preset); // debug proof
      editPreset(index);
    };

    list.appendChild(btn);
  });
}




function renderPresetButtons() {
  const container = document.getElementById("presetContainer");
  container.innerHTML = "";

  presets.forEach(preset => {
    const btn = document.createElement("button");
    btn.textContent = preset.name;
    btn.classList.toggle("active", preset === activePreset);

    btn.onclick = () => {
    activePreset = preset;
    logSystem(`Preset activated: ${preset.name}`, "activate");
    showToast(`Preset activated: ${preset.name}`, "info");
    renderPresetButtons();
    };


    btn.classList.toggle("active", preset === activePreset);
    container.appendChild(btn);
  });
}


window.addEventListener("load", () => {
  setTimeout(() => {
    document.getElementById("loadingScreen").style.display = "none";
  }, 1500);

  document.querySelectorAll(".modal-overlay").forEach(m =>
    m.classList.remove("active")
  );

  renderPresetButtons();
});

/* Burger Menu */
const menuToggle = document.getElementById("menuToggle");
const sideMenu = document.getElementById("sideMenu");

menuToggle.onclick = () => {
  const nowActive = sideMenu.classList.toggle("active");
  // toggle visual states on the button so CSS can animate
  menuToggle.classList.toggle("active", nowActive);
  // fade the floating toggle while sidebar's internal logo expands
  menuToggle.classList.toggle("hidden", nowActive);
};

/* Close sidebar when logo inside sidebar is clicked */
const sidebarLogo = document.querySelector("#sideMenu .logo-wrapper .logo");
if (sidebarLogo) {
  sidebarLogo.onclick = () => {
    sideMenu.classList.remove("active");
    menuToggle.classList.remove("active", "hidden");
  };
}

let activePreset = presets[0];

function simulateNoise() {
  const value = Math.floor(Math.random() * 40) + 50;
  const timestamp = new Date();

  noiseHistory.push({ value, timestamp });
  const noisePercent = data.noisePercent ?? Math.round((data.noise / 4095) * 100);
updateStatus(noisePercent, data.threshold);
  checkThreshold(value, timestamp);
}

/* Status Update */
function updateStatus(valuePercent, thresholdPercent) {
  const noiseValue = document.getElementById("noiseValue");
  const noiseStatus = document.getElementById("noiseStatus");
  const activePresetText = document.getElementById("activePreset");

  noiseValue.textContent = valuePercent + "%"; // ✅ FIXED
  activePresetText.textContent = "Preset: " + activePreset.name;

  noiseStatus.className = "noise-status";

  if (valuePercent < 30) {
    noiseStatus.textContent = "Quiet";
    noiseStatus.classList.add("quiet");
  } else if (valuePercent <= thresholdPercent) {
    noiseStatus.textContent = "Acceptable";
    noiseStatus.classList.add("acceptable");
  } else {
    noiseStatus.textContent = "Too Noisy";
    noiseStatus.classList.add("noisy");
  }

  const progress = document.getElementById("noiseProgress");
  progress.style.width = valuePercent + "%"; // ✅ FIXED

  const bar = document.querySelector(".noise-bar");
  bar.classList.toggle("too-noisy", valuePercent > thresholdPercent);
}

function checkThreshold(value, time) {
  if (value > activePreset.threshold) {
    // future hook only — no-op for now
  }
}


/* Session Logic */
function getSession(date) {
  const h = date.getHours() + date.getMinutes() / 60;
  if (h >= 7.5 && h < 12) return "Morning";
  if (h >= 13 && h < 16) return "Afternoon";
  if (h >= 17 && h < 21) return "Evening";
  return "Outside Session";
}
/* Logs UI */
function renderLogs() {
  const list = document.getElementById("logTree");
  list.innerHTML = "";

  systemLogs.slice(-5).forEach(log => {
    const p = document.createElement("p");
    p.textContent = `${log.time} — ${log.clip}`;
    list.appendChild(p);
  });
}

function logSystem(message, type = "info") {
  systemLogs.unshift({
    time: new Date(),
    message,
    type
  });
  renderLogTree();
}



/* Simulation Loop */
setInterval(() => {
  if (noiseMode === "simulated") {
    simulateNoise();
  }
}, 3000);

function renderHistoryTree() {
  const tree = document.getElementById("historyTree");
  tree.innerHTML = "";

  const grouped = {};

  noiseHistory.forEach(n => {
    const dateObj = n.timestamp;
    const month = dateObj.toLocaleString("default", { month: "long", year: "numeric" });
    const week = "Week " + Math.ceil(dateObj.getDate() / 7);
    const date = dateObj.toDateString();
    const session = getSession(dateObj);

    grouped[month] ??= {};
    grouped[month][week] ??= {};
    grouped[month][week][date] ??= {};
    grouped[month][week][date][session] ??= [];

    grouped[month][week][date][session].push(n);
  });

  Object.entries(grouped).forEach(([month, weeks]) => {
    const monthNode = document.createElement("details");
    monthNode.innerHTML = `<summary><strong>${month}</strong></summary>`;

    Object.entries(weeks).forEach(([week, dates]) => {
      const weekNode = document.createElement("details");
      weekNode.innerHTML = `<summary>${week}</summary>`;

      Object.entries(dates).forEach(([date, sessions]) => {
        const dateNode = document.createElement("details");
        dateNode.innerHTML = `<summary>${date}</summary>`;

        Object.entries(sessions).forEach(([session, entries]) => {
          const sessionNode = document.createElement("details");
          sessionNode.innerHTML = `<summary>${session}</summary>`;

          entries.forEach(n => {
            const p = document.createElement("p");
            p.textContent = `${n.timestamp.toLocaleTimeString()} — ${n.value} ADC`;
            sessionNode.appendChild(p);
          });

          dateNode.appendChild(sessionNode);
        });

        weekNode.appendChild(dateNode);
      });

      monthNode.appendChild(weekNode);
    });

    tree.appendChild(monthNode);
  });
}


function renderLogTree() {
  const tree = document.getElementById("logTree");
  tree.innerHTML = "";

  const grouped = {};

  systemLogs.forEach(log => {
    const dateObj = log.time;
    const month = dateObj.toLocaleString("default", { month: "long", year: "numeric" });
    const week = "Week " + Math.ceil(dateObj.getDate() / 7);
    const date = dateObj.toDateString();
    const session = getSession(dateObj);

    grouped[month] ??= {};
    grouped[month][week] ??= {};
    grouped[month][week][date] ??= {};
    grouped[month][week][date][session] ??= [];

    grouped[month][week][date][session].push(log);
  });

  Object.entries(grouped).forEach(([month, weeks]) => {
    const monthNode = document.createElement("details");
    monthNode.innerHTML = `<summary><strong>${month}</strong></summary>`;

    Object.entries(weeks).forEach(([week, dates]) => {
      const weekNode = document.createElement("details");
      weekNode.innerHTML = `<summary>${week}</summary>`;

      Object.entries(dates).forEach(([date, sessions]) => {
        const dateNode = document.createElement("details");
        dateNode.innerHTML = `<summary>${date}</summary>`;

        Object.entries(sessions).forEach(([session, logs]) => {
          const sessionNode = document.createElement("details");
          sessionNode.innerHTML = `<summary>${session}</summary>`;

          logs.forEach(log => {
            const p = document.createElement("p");
            p.className = `log ${log.type}`;

            const icon = {
              add: "🟢",
              update: "🟡",
              activate: "🔵",
              delete: "🔴"
            }[log.type] || "ℹ️";

            p.innerHTML = `
              <strong>${log.time.toLocaleTimeString()}</strong>
              ${icon} ${log.message}
            `;
            sessionNode.appendChild(p);
          });

          dateNode.appendChild(sessionNode);
        });

        weekNode.appendChild(dateNode);
      });

      monthNode.appendChild(weekNode);
    });

    tree.appendChild(monthNode);
  });
}



function syncInputs(sliderId, inputId) {
  const slider = document.getElementById(sliderId);
  const input = document.getElementById(inputId);

  slider.addEventListener("input", () => input.value = slider.value);
  input.addEventListener("input", () => slider.value = input.value);
}

syncInputs("thresholdSlider", "thresholdInput");
syncInputs("volumeSlider", "volumeInput");

function openModal(id) {
  const modal = document.getElementById(id);
  if (!modal) return;

  modal.classList.add("active");

  sideMenu.classList.remove("active"); // ← UX fix (explained below)
  menuToggle.classList.remove("active", "hidden");

  if (id === "presetModal") {
    renderPresetList();
  }

  if (id === "historyModal") {
    renderHistoryTree();
  }

  if (id === "logModal") {
    renderLogTree();
  }
  if (id === "esp32Modal") initESP32Modal();

  if (id === "cameraModal") {
  const input = document.getElementById("camera-ip");
  if (input) input.value = MEDIA_MTX_IP;
}
}

function closeModal() {
  document.querySelectorAll(".modal-overlay").forEach(m =>
    m.classList.remove("active")
  );
  cancelDeleteConfirm();
}

// Close modal when clicking outside the modal box
document.querySelectorAll(".modal-overlay").forEach(overlay => {
  overlay.addEventListener("click", () => {
    overlay.classList.remove("active");
  });
});

// Prevent closing when clicking inside modal
document.querySelectorAll(".modal").forEach(modal => {
  modal.addEventListener("click", e => {
    e.stopPropagation();
  });
});

function editPreset(index) {
  const preset = presets[index];
  editingIndex = index;

  console.log("Loaded preset:", preset); // confirm values exist

  cancelDeleteConfirm();

  // Load values into form
  presetName.value = preset.name;
  thresholdSlider.value = preset.threshold;
  thresholdInput.value  = preset.threshold;
  volumeSlider.value = preset.volume;
  volumeInput.value  = preset.volume;
  beepInterval.value = preset.interval;

  // Switch UI state
  newBtn.style.display = "block";

  // Show delete button
  deleteBtn.style.display = "block";
  deleteBtn.disabled = false;
  deleteBtn.textContent = "Delete Preset";
  deleteBtn.classList.remove("confirm");

  // Prevent deleting active preset
  if (preset === activePreset) {
    deleteBtn.disabled = true;
    deleteBtn.textContent = "Active Preset (Cannot Delete)";
    deleteBtn.style.opacity = "0.6";
  } else {
    deleteBtn.style.opacity = "1";
  }

  editingIndex = index;

  document.getElementById("addPresetBtn").style.display = "none";
  document.getElementById("updatePresetBtn").style.display = "block";
  document.getElementById("deletePresetBtn").style.display = "block";

}





function addPreset() {
  const name = presetName.value.trim();
  if (!name) return alert("Preset name required");

  if (editingIndex === null && presets.length >= 5) {
    return alert("Maximum of 5 presets allowed");
  }

  if (editingIndex !== null) return;

  const data = {
    name,
    threshold: +thresholdSlider.value,
    volume: +volumeSlider.value,
    interval: +beepInterval.value
  };

  if (editingIndex !== null) {
    presets[editingIndex] = data;
    logSystem(`Preset updated: ${name}`, "update");
    showToast(`Preset updated: ${name}`, "update");
    editingIndex = null;
  } else {
    presets.push(data);
    logSystem(`Preset added: ${name}`, "add");
    showToast(`Preset added: ${name}`, "success");
  }

  resetPresetForm();
  renderPresetList();
  renderPresetButtons();
  closeModal();
}


function deletePreset(index) {
  const preset = presets[index];
  if (!preset || preset === activePreset) return;

  lastDeletedPreset = { preset, index };

  presets.splice(index, 1);
  renderPresetList();
  renderPresetButtons();

  const toast = showToast(
    `Preset deleted: ${preset.name} — Undo?`,
    "delete",
    { duration: 5000 }
  );

  toast.style.cursor = "pointer";
  toast.onclick = undoDelete;

  undoTimer = setTimeout(() => {
    lastDeletedPreset = null;
  }, 5000);

    resetPresetForm();

  renderPresetList();
  renderPresetButtons();
  closeModal();

}

function undoDelete() {
  if (!lastDeletedPreset) return;

  presets.splice(
    lastDeletedPreset.index,
    0,
    lastDeletedPreset.preset
  );

  renderPresetList();
  renderPresetButtons();

  showToast(
    `Restored: ${lastDeletedPreset.preset.name}`,
    "success"
  );

  clearTimeout(undoTimer);
  lastDeletedPreset = null;
}

function resetPresetForm() {
  presetName.value = "";
  thresholdSlider.value = 70;
  thresholdInput.value = 70;
  volumeSlider.value = 50;
  volumeInput.value = 50;
  beepInterval.value = 5;

  document.getElementById("newPresetBtn").style.display = "none";
  document.getElementById("updatePresetBtn").style.display = "none";
  document.getElementById("addPresetBtn").style.display = "block";

  editingIndex = null;
  cancelDeleteConfirm();

  const deleteBtn = document.getElementById("deletePresetBtn");
  deleteBtn.style.display = "none";

  document.getElementById("addPresetBtn").textContent = "Add Preset";
}

function startNewPreset() {
  resetPresetForm();
  editingIndex = null;

  document.getElementById("newPresetBtn").style.display = "none";
  document.getElementById("deletePresetBtn").style.display = "none";
  document.getElementById("addPresetBtn").textContent = "Add Preset";
}

function updatePreset() {
  if (editingIndex === null) return;

  presets[editingIndex] = {
    name: presetName.value.trim(),
    threshold: +thresholdSlider.value,
    volume: +volumeSlider.value,
    interval: +beepInterval.value
  };

  editingIndex = null;
  resetPresetForm();
  renderPresetButtons();
  renderPresetList();
}

function showToast(message, type = "info", options = {}) {
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.textContent = message;

  const container = document.getElementById("toastContainer");
  container.appendChild(toast);

  setTimeout(() => {
    toast.remove();
  }, options.duration || 4000);

  return toast;
}



