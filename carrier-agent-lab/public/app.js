const form = document.querySelector("#tracking-form");
const carrier = document.querySelector("#carrier");
const customUrlRow = document.querySelector("#custom-url-row");
const customUrl = document.querySelector("#custom-url");
const carrierName = document.querySelector("#carrier-name");
const state = document.querySelector("#state");
const events = document.querySelector("#events");
const result = document.querySelector("#result");
const submit = document.querySelector("#submit");
const cancel = document.querySelector("#cancel");
let activeRun = null;
let pollTimer = null;
const apiRoot = new URL("./api/", document.baseURI);

function apiUrl(path) {
  return new URL(path, apiRoot);
}

carrier.addEventListener("change", () => {
  const custom = carrier.value === "OTHER";
  customUrlRow.hidden = !custom;
  carrierName.required = custom;
  customUrl.required = custom;
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearTimeout(pollTimer);
  const payload = {
    carrier: carrier.value,
    referenceType: document.querySelector("#reference-type").value,
    reference: document.querySelector("#reference").value,
  };
  if (carrier.value === "OTHER") {
    payload.carrierName = carrierName.value;
    if (customUrl.value) payload.customUrl = customUrl.value;
  }
  setBusy(true);
  result.textContent = "等待 Agent 返回结构化数据…";
  try {
    const response = await fetch(apiUrl("runs"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || "无法创建任务");
    activeRun = body.id;
    renderRun(body);
    schedulePoll();
  } catch (error) {
    state.textContent = "FAILED";
    result.textContent = error.message;
    setBusy(false);
  }
});

cancel.addEventListener("click", async () => {
  if (!activeRun) return;
  await fetch(apiUrl(`runs/${encodeURIComponent(activeRun)}`), { method: "DELETE" });
  schedulePoll(0);
});

function schedulePoll(delay = 900) {
  clearTimeout(pollTimer);
  pollTimer = setTimeout(poll, delay);
}

async function poll() {
  if (!activeRun) return;
  try {
    const response = await fetch(apiUrl(`runs/${encodeURIComponent(activeRun)}`));
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || "任务不存在");
    renderRun(body);
    if (["QUEUED", "RUNNING"].includes(body.state)) schedulePoll();
    else setBusy(false);
  } catch (error) {
    result.textContent = error.message;
    setBusy(false);
  }
}

function renderRun(run) {
  state.textContent = run.state;
  events.replaceChildren(...run.events.map((entry) => {
    const item = document.createElement("li");
    item.textContent = `${new Date(entry.at).toLocaleTimeString()} · ${entry.message}`;
    return item;
  }));
  if (run.result) result.textContent = JSON.stringify(run.result, null, 2);
  else if (run.error) result.textContent = run.error;
}

function setBusy(busy) {
  submit.disabled = busy;
  cancel.disabled = !busy;
  if (!busy) activeRun = null;
}
