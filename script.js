const presetName     = document.getElementById("presetName");
const thresholdSlider = document.getElementById("thresholdSlider");
const thresholdInput  = document.getElementById("thresholdInput");
const volumeSlider    = document.getElementById("volumeSlider");
const volumeInput     = document.getElementById("volumeInput");
const beepInterval    = document.getElementById("beepInterval");

const deleteBtn = document.getElementById("deletePresetBtn");
const saveBtn   = document.getElementById("savePresetBtn");
const newBtn    = document.getElementById("newPresetBtn");
let deleteConfirmTimer = null;
let deleteArmedIndex = null;
let editingIndex = null;
let lastCameraState = null;

// ================= CAMERA CONFIG =================
const MEDIA_MTX_IP = "192.168.1.6";
const IS_HTTPS = location.protocol === "https:";

function setCameraStatus(state) {
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

async function startCamera() {
  try {
    if (IS_HTTPS) {
      console.warn("HTTPS page → local WebRTC. User permission required.");
    }

    const pc = new RTCPeerConnection();

    pc.ontrack = e => {
      document.getElementById("cameraFeed").srcObject = e.streams[0];
    };

    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === "failed") {
        setCameraStatus("offline");
      }
    };

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    // wait for ICE info
    await new Promise(resolve => {
      if (pc.localDescription.sdp.includes("ice-ufrag")) resolve();
      pc.onicegatheringstatechange = () => {
        if (pc.iceGatheringState === "complete") resolve();
      };
    });

    const res = await fetch(
      `http://${MEDIA_MTX_IP}:8889/tapo_cam/whep`,
      {
        method: "POST",
        headers: { "Content-Type": "application/sdp" },
        body: pc.localDescription.sdp
      }
    );

    if (!res.ok) throw new Error("WHEP request failed");

    const answerSDP = await res.text();

    await pc.setRemoteDescription({
      type: "answer",
      sdp: answerSDP
    });

    setCameraStatus("online");
    console.log("WebRTC connected");

  } catch (err) {
    console.error("Camera error:", err);
    setCameraStatus("offline");
  }
}

startCamera();


deleteBtn.onclick = () => {
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
  sideMenu.classList.toggle("active");
};

let activePreset = presets[0];

/* Noise Simulation */
let noiseHistory = [];
let systemLogs = []; 
// each item: { timestamp: Date, message: string }


function simulateNoise() {
  const value = Math.floor(Math.random() * 40) + 50;
  const timestamp = new Date();

  noiseHistory.push({ value, timestamp });
  updateStatus(value);
  checkThreshold(value, timestamp);
}

/* Status Update */
function updateStatus(value) {
  const noiseValue = document.getElementById("noiseValue");
  const noiseStatus = document.getElementById("noiseStatus");
  const activePresetText = document.getElementById("activePreset");

  noiseValue.textContent = value + " dB";
  activePresetText.textContent = "Preset: " + activePreset.name;

  noiseStatus.className = "noise-status";

  if (value < 60) {
    noiseStatus.textContent = "Quiet";
    noiseStatus.classList.add("quiet");
  } else if (value <= activePreset.threshold) {
    noiseStatus.textContent = "Acceptable";
    noiseStatus.classList.add("acceptable");
  } else {
    noiseStatus.textContent = "Too Noisy";
    noiseStatus.classList.add("noisy");
  }

    const progress = document.getElementById("noiseProgress");
    const percent = Math.min((value / activePreset.threshold) * 100, 100);
    progress.style.width = percent + "%";

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
  simulateNoise();
  renderHistoryTree();
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
            p.textContent = `${n.timestamp.toLocaleTimeString()} — ${n.value} dB`;
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

  if (id === "presetModal") {
    renderPresetList();
  }

  if (id === "historyModal") {
    renderHistoryTree();
  }

  if (id === "logModal") {
    renderLogTree();
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
  saveBtn.textContent = "Update Preset";
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
    editingIndex = null;
  } else {
    presets.push(data);
    logSystem(`Preset added: ${name}`, "add");
  }

  resetPresetForm();
  renderPresetList();
  renderPresetButtons();
  closeModal();
}


function deletePreset(index) {
  const preset = presets[index];
  if (!preset) return;

  if (preset === activePreset) {
    alert("You cannot delete the active preset.");
    return;
  }

  logSystem(`Preset deleted: ${preset.name}`, "delete");

  presets.splice(index, 1);

  editingIndex = null;
  resetPresetForm();

  renderPresetList();
  renderPresetButtons();
  closeModal();
}

function resetPresetForm() {
  presetName.value = "";
  thresholdSlider.value = 70;
  thresholdInput.value = 70;
  volumeSlider.value = 50;
  volumeInput.value = 50;
  beepInterval.value = 5;

  document.getElementById("newPresetBtn").style.display = "none";

  editingIndex = null;
  cancelDeleteConfirm();

  const deleteBtn = document.getElementById("deletePresetBtn");
  deleteBtn.style.display = "none";

  document.getElementById("savePresetBtn").textContent = "Add Preset";
}

function startNewPreset() {
  resetPresetForm();
  editingIndex = null;

  document.getElementById("newPresetBtn").style.display = "none";
  document.getElementById("deletePresetBtn").style.display = "none";
  document.getElementById("savePresetBtn").textContent = "Add Preset";
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







