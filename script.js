/* Loading Screen */
window.onload = () => {
  setTimeout(() => {
    document.getElementById("loadingScreen").style.display = "none";
  }, 1500);
};

/* Burger Menu */
const menuToggle = document.getElementById("menuToggle");
const sideMenu = document.getElementById("sideMenu");

menuToggle.onclick = () => {
  sideMenu.classList.toggle("active");
};

/* Presets */
const presets = [
  { name: "Library", threshold: 60 },
  { name: "Classroom", threshold: 75 },
  { name: "Outdoor", threshold: 90 }
];

let activePreset = presets[1];

/* Noise Simulation */
let noiseHistory = [];
let systemLogs = [];

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

/* Threshold Log (5-second clip simulation) */
function checkThreshold(value, time) {
  if (value > activePreset.threshold) {
    systemLogs.push({
      time: time.toLocaleTimeString(),
      clip: "5-second clip captured"
    });
    renderLogs();
    renderLogTree();
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

/* History Display */
function renderHistory() {
  const output = document.getElementById("historyOutput");
  const today = new Date().toDateString();

  const todayData = noiseHistory.filter(
    n => n.timestamp.toDateString() === today
  );

  const avg =
    todayData.reduce((a, b) => a + b.value, 0) / (todayData.length || 1);

  let html = `<strong>Daily Avg:</strong> ${avg.toFixed(1)} dB<br><br>`;

  ["Morning", "Afternoon", "Evening"].forEach(s => {
    const sessionData = todayData.filter(
      n => getSession(n.timestamp) === s
    );
    const sAvg =
      sessionData.reduce((a, b) => a + b.value, 0) /
      (sessionData.length || 1);
    html += `${s}: ${sAvg.toFixed(1)} dB<br>`;
  });

  output.innerHTML = html;
}
/* Logs UI */
function renderLogs() {
  const list = document.getElementById("logList");
  list.innerHTML = "";
  systemLogs.slice(-5).forEach(log => {
    const li = document.createElement("li");
    li.textContent = `${log.time} — ${log.clip}`;
    list.appendChild(li);
  });
}

/* Preset Buttons */
const presetContainer = document.getElementById("presetContainer");
presets.forEach(p => {
  const btn = document.createElement("button");
  btn.textContent = p.name;
  btn.onclick = () => (activePreset = p);
  presetContainer.appendChild(btn);
});

/* Simulation Loop */
setInterval(() => {
  simulateNoise();
  renderHistory();
  renderHistoryTree();
}, 3000);

function renderHistoryTree() {
  const tree = document.getElementById("historyTree");
  tree.innerHTML = "";

  const grouped = {};

  noiseHistory.forEach(n => {
    const date = n.timestamp.toDateString();
    const session = getSession(n.timestamp);

    grouped[date] ??= {};
    grouped[date][session] ??= [];
    grouped[date][session].push(n);
  });

  Object.keys(grouped).forEach(date => {
    const dateNode = document.createElement("details");
    dateNode.innerHTML = `<summary>${date}</summary>`;

    Object.keys(grouped[date]).forEach(session => {
      const sNode = document.createElement("details");
      sNode.innerHTML = `<summary>${session}</summary>`;

      grouped[date][session].forEach(n => {
        const p = document.createElement("p");
        p.textContent = `${n.timestamp.toLocaleTimeString()} — 5s clip`;
        sNode.appendChild(p);
      });

      dateNode.appendChild(sNode);
    });

    tree.appendChild(dateNode);
  });
}

function renderLogTree() {
  const tree = document.getElementById("logTree");
  tree.innerHTML = "";

  systemLogs.forEach(l => {
    const p = document.createElement("p");
    p.textContent = `${l.time} — Threshold exceeded`;
    tree.appendChild(p);
  });
}

function openModal(id) {
  document.getElementById(id).classList.add("active");
}

function closeModal() {
  document.querySelectorAll(".modal-overlay").forEach(m =>
    m.classList.remove("active")
  );
}

document.getElementById("openLogsBtn").onclick = () => {
  openModal("logsModal");
};

window.addEventListener("load", () => {
  document.querySelectorAll(".modal-overlay").forEach(modal => {
    modal.classList.remove("active");
  });
});
