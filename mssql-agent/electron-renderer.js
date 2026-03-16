const stateEl = document.getElementById("state");
const heartbeatEl = document.getElementById("heartbeat");
const requestEl = document.getElementById("request");
const errorEl = document.getElementById("error");
const logsEl = document.getElementById("logs");
const hideBtn = document.getElementById("hideBtn");
const quitBtn = document.getElementById("quitBtn");

function setStatus(status) {
  stateEl.textContent = status?.state || "-";
  heartbeatEl.textContent = status?.lastHeartbeatAt || "-";
  requestEl.textContent = status?.lastRequestType
    ? `${status.lastRequestType} [${status.lastRequestStatus || "-"}]`
    : "-";
  errorEl.textContent = status?.lastError || "-";
  errorEl.style.color = status?.lastError ? "#fca5a5" : "#e5e7eb";
}

function appendLog(entry) {
  const item = document.createElement("div");
  item.className = `log-item ${entry.level || "info"}`;
  item.textContent = `[${entry.at}] ${entry.message}${entry.extra ? ` | ${JSON.stringify(entry.extra)}` : ""}`;
  logsEl.prepend(item);
  while (logsEl.children.length > 80) logsEl.removeChild(logsEl.lastChild);
}

window.agentApi.getStatus().then(setStatus);
window.agentApi.getLogs().then((entries) => entries.forEach(appendLog));
window.agentApi.onStatus(setStatus);
window.agentApi.onLog(appendLog);

hideBtn.addEventListener("click", () => window.agentApi.hide());
quitBtn.addEventListener("click", () => window.agentApi.quit());
