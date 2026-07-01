// Garden Planner — local-first PWA. All data lives in localStorage on this device.
(function () {
  "use strict";

  const STORAGE_KEY = "garden.plants.v1";
  const MS_PER_DAY = 86400000;

  // --- Rain-aware watering (opt-in) ---
  const RAIN_ENABLED_KEY = "garden.rain.enabled";
  const RAIN_LOC_KEY = "garden.location.v1";
  const RAIN_WX_KEY = "garden.weather.v1";
  const RAIN_THRESHOLD_IN = 0.25;   // rainfall (inches) that counts as a watering
  const RAIN_WINDOW_DAYS = 8;        // how far back rain can "reset" the schedule
  let rainEnabled = localStorage.getItem(RAIN_ENABLED_KEY) === "1";
  let rainLoc = loadJson(RAIN_LOC_KEY, null);      // { lat, lon, label }
  let weather = loadJson(RAIN_WX_KEY, null);        // { fetchedAt, byDate:{date:inches} }

  function loadJson(key, fallback) {
    try { const r = localStorage.getItem(key); return r ? JSON.parse(r) : fallback; }
    catch (e) { return fallback; }
  }

  /** Most recent past/today date (YYYY-MM-DD) with significant rain, else null. */
  function lastSignificantRain() {
    if (!rainEnabled || !weather || !weather.byDate) return null;
    const today = todayStr();
    const cutoff = localDateStr(new Date(Date.now() - RAIN_WINDOW_DAYS * MS_PER_DAY));
    let best = null;
    for (const [date, inches] of Object.entries(weather.byDate)) {
      if (date > today || date < cutoff) continue;
      if (inches >= RAIN_THRESHOLD_IN && (!best || date > best.date)) {
        best = { date, inches };
      }
    }
    return best;
  }


  /** @type {Array} */
  let plants = load();

  // --- Elements ---
  const listEl = document.getElementById("plantList");
  const emptyEl = document.getElementById("emptyState");
  const summaryEl = document.getElementById("summary");
  const filterEl = document.getElementById("filter");
  const dialog = document.getElementById("plantDialog");
  const form = document.getElementById("plantForm");
  const dialogTitle = document.getElementById("dialogTitle");

  const f = {
    id: document.getElementById("plantId"),
    name: document.getElementById("name"),
    location: document.getElementById("location"),
    planted: document.getElementById("planted"),
    interval: document.getElementById("interval"),
    sun: document.getElementById("sun"),
    notes: document.getElementById("notes"),
  };

  // --- Persistence ---
  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      console.error("Failed to load data", e);
      return [];
    }
  }
  function save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(plants));
  }

  // --- Helpers ---
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  function localDateStr(d = new Date()) {
    const t = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
    return t.toISOString().slice(0, 10);
  }
  const todayStr = () => localDateStr();
  function parseLocalDate(str) {
    const [y, m, d] = str.split("-").map(Number);
    return new Date(y, m - 1, d);
  }

  // Effective "last watered" anchor — rain more recent than the last manual
  // watering (or planting) resets the schedule.
  function effectiveWaterBase(p) {
    const baseStr = p.lastWatered || p.planted || todayStr();
    let date = baseStr, fromRain = false;
    const rain = lastSignificantRain();
    if (rain && rain.date > date) { date = rain.date; fromRain = true; }
    return { date, fromRain, rain };
  }

  function daysUntilWater(p) {
    if (!p.interval) return null;
    const base = effectiveWaterBase(p);
    const last = parseLocalDate(base.date);
    const due = new Date(last.getTime() + p.interval * MS_PER_DAY);
    const now = new Date();
    return Math.floor((due.setHours(0, 0, 0, 0) - now.setHours(0, 0, 0, 0)) / MS_PER_DAY);
  }

  function waterStatus(p) {
    const d = daysUntilWater(p);
    if (d === null) return { cls: "ok", badge: "ok", label: "No schedule" };
    if (d < 0) return { cls: "thirsty", badge: "thirsty", label: `Water now (${-d}d overdue)` };
    if (d === 0) return { cls: "thirsty", badge: "thirsty", label: "Water today" };
    if (d === 1) return { cls: "soon", badge: "soon", label: "Water tomorrow" };
    return { cls: "ok", badge: "ok", label: `Water in ${d} days` };
  }

  function fmtDate(str) {
    if (!str) return null;
    const d = parseLocalDate(str);
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => (
      { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
    ));
  }

  // --- Rendering ---
  function render() {
    renderWeatherPanel();
    const filter = filterEl.value;
    const sorted = [...plants].sort((a, b) => {
      const da = daysUntilWater(a), db = daysUntilWater(b);
      return (da === null ? 9999 : da) - (db === null ? 9999 : db);
    });
    const visible = sorted.filter((p) => filter !== "thirsty" || (daysUntilWater(p) !== null && daysUntilWater(p) <= 0));

    listEl.innerHTML = visible.map(cardHtml).join("");

    emptyEl.hidden = plants.length !== 0;
    if (plants.length && filter === "thirsty" && visible.length === 0) {
      emptyEl.hidden = false;
      emptyEl.innerHTML = "Nothing needs water right now. 💧✅";
    } else if (plants.length === 0) {
      emptyEl.innerHTML = 'No plants yet. Tap <strong>“Add plant”</strong> to get started. 🪴';
    }

    // Summary
    if (plants.length) {
      const thirsty = plants.filter((p) => { const d = daysUntilWater(p); return d !== null && d <= 0; }).length;
      summaryEl.hidden = false;
      summaryEl.innerHTML = thirsty
        ? `💧 <strong>${thirsty}</strong> plant${thirsty > 1 ? "s" : ""} need${thirsty > 1 ? "" : "s"} watering. 🌿 ${plants.length} total.`
        : `✅ All ${plants.length} plant${plants.length > 1 ? "s are" : " is"} watered. Nice work! 🌿`;
    } else {
      summaryEl.hidden = true;
    }
  }

  function cardHtml(p) {
    const st = waterStatus(p);
    const base = effectiveWaterBase(p);
    const meta = [];
    if (p.location) meta.push(`<span>📍 ${escapeHtml(p.location)}</span>`);
    if (p.sun) meta.push(`<span>☀️ ${escapeHtml(p.sun)}</span>`);
    if (p.planted) meta.push(`<span>🌱 Planted ${fmtDate(p.planted)}</span>`);
    if (p.lastWatered) meta.push(`<span>💧 Watered ${fmtDate(p.lastWatered)}</span>`);
    if (p.interval) meta.push(`<span>🔁 Every ${p.interval}d</span>`);

    const rainNote = (base.fromRain && p.interval)
      ? `<p class="rain-note">🌧️ Counting ${base.rain.inches.toFixed(2)}″ rain on ${fmtDate(base.rain.date)} as a watering.</p>`
      : "";

    return `
      <article class="card ${st.cls}" data-id="${p.id}">
        <div class="card-top">
          <h3>${escapeHtml(p.name)}</h3>
          <span class="badge ${st.badge}">${st.label}</span>
        </div>
        ${meta.length ? `<p class="meta">${meta.join("")}</p>` : ""}
        ${rainNote}
        ${p.notes ? `<p class="notes">${escapeHtml(p.notes)}</p>` : ""}
        <div class="card-actions">
          <button class="water-btn" data-act="water">💧 Water now</button>
          <button data-act="edit">Edit</button>
          <button data-act="delete">Delete</button>
        </div>
      </article>`;
  }

  // --- Dialog ---
  function openDialog(plant) {
    form.reset();
    if (plant) {
      dialogTitle.textContent = "Edit plant";
      f.id.value = plant.id;
      f.name.value = plant.name || "";
      f.location.value = plant.location || "";
      f.planted.value = plant.planted || "";
      f.interval.value = plant.interval || "";
      f.sun.value = plant.sun || "";
      f.notes.value = plant.notes || "";
    } else {
      dialogTitle.textContent = "Add plant";
      f.id.value = "";
      f.planted.value = todayStr();
      f.interval.value = 3;
    }
    dialog.showModal();
    f.name.focus();
  }

  form.addEventListener("submit", (e) => {
    if (!f.name.value.trim()) return; // required
    e.preventDefault();
    const existing = f.id.value ? plants.find((p) => p.id === f.id.value) : null;
    const data = {
      id: existing ? existing.id : uid(),
      name: f.name.value.trim(),
      location: f.location.value.trim(),
      planted: f.planted.value || "",
      interval: parseInt(f.interval.value, 10) || null,
      sun: f.sun.value,
      notes: f.notes.value.trim(),
      lastWatered: existing ? existing.lastWatered : "",
    };
    if (existing) Object.assign(existing, data);
    else plants.push(data);
    save();
    render();
    dialog.close();
  });

  document.getElementById("cancelBtn").addEventListener("click", () => dialog.close());

  // --- Event delegation for cards ---
  listEl.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-act]");
    if (!btn) return;
    const id = e.target.closest(".card").dataset.id;
    const plant = plants.find((p) => p.id === id);
    if (!plant) return;

    const act = btn.dataset.act;
    if (act === "water") {
      plant.lastWatered = todayStr();
      save();
      render();
    } else if (act === "edit") {
      openDialog(plant);
    } else if (act === "delete") {
      if (confirm(`Delete “${plant.name}”? This can't be undone.`)) {
        plants = plants.filter((p) => p.id !== id);
        beds.forEach((b) => { b.plantings = (b.plantings || []).filter((pl) => pl.id !== id); });
        saveBeds();
        save();
        render();
      }
    }
  });

  // --- Toolbar ---
  document.getElementById("addBtn").addEventListener("click", () => openDialog(null));
  filterEl.addEventListener("change", render);

  // --- Settings dialog ---
  const settingsDialog = document.getElementById("settingsDialog");
  document.getElementById("settingsBtn").addEventListener("click", () => {
    renderWeatherPanel();
    settingsDialog.showModal();
  });
  document.getElementById("settingsCloseBtn").addEventListener("click", () => settingsDialog.close());
  settingsDialog.addEventListener("click", (e) => {
    if (e.target === settingsDialog) settingsDialog.close();
  });

  // --- Backup: export / import ---
  document.getElementById("exportBtn").addEventListener("click", () => {
    const payload = { version: 2, plants, beds };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `garden-backup-${todayStr()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  });

  const importFile = document.getElementById("importFile");
  document.getElementById("importBtn").addEventListener("click", () => importFile.click());
  importFile.addEventListener("change", () => {
    const file = importFile.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        // v1 backups were a plain array of plants; v2 is { plants, beds }.
        const newPlants = Array.isArray(data) ? data : (data.plants || []);
        const newBeds = Array.isArray(data) ? [] : (data.beds || []);
        if (!Array.isArray(newPlants)) throw new Error("Not a valid backup file.");
        const bedNote = newBeds.length ? ` and ${newBeds.length} bed(s)` : "";
        if (confirm(`Import ${newPlants.length} plant(s)${bedNote}? This replaces your current data.`)) {
          plants = newPlants;
          beds = newBeds;
          save();
          saveBeds();
          render();
          if (!views.beds.hidden) renderBeds();
        }
      } catch (err) {
        alert("Couldn't import that file: " + err.message);
      }
      importFile.value = "";
    };
    reader.readAsText(file);
  });

  // --- Service worker (offline / installable) ---
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("sw.js").catch((e) => console.warn("SW failed", e));
    });
  }

  // ===================== Planting Guide =====================
  const DATA = window.GARDEN_DATA || { ZONE_FROST: {}, PLANTS: [] };
  const ZONE_KEY = "garden.zone.v1";
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  const views = {
    garden: document.getElementById("gardenView"),
    guide: document.getElementById("guideView"),
    beds: document.getElementById("bedsView"),
  };
  const tabs = document.querySelectorAll(".tab");
  const zoneSel = document.getElementById("zone");
  const zoneDisplay = document.getElementById("zoneDisplay");
  const zoneEdit = document.getElementById("zoneEdit");
  const zoneCurrent = document.getElementById("zoneCurrent");
  const zoneFrost = document.getElementById("zoneFrost");
  const changeZoneBtn = document.getElementById("changeZoneBtn");
  const guideSearch = document.getElementById("guideSearch");
  const guideFilter = document.getElementById("guideFilter");
  const guideListEl = document.getElementById("guideList");
  const guideEmptyEl = document.getElementById("guideEmpty");

  let currentZone = localStorage.getItem(ZONE_KEY) || "";
  if (currentZone) zoneSel.value = currentZone;

  function fmtMD(md) {
    return `${MONTHS[md[0] - 1]} ${md[1]}`;
  }
  function updateZoneUI() {
    const isSet = !!(currentZone && DATA.ZONE_FROST[currentZone]);
    zoneDisplay.hidden = !isSet;
    zoneEdit.hidden = isSet;
    if (isSet) {
      zoneCurrent.textContent = currentZone.toUpperCase();
      const fr = DATA.ZONE_FROST[currentZone];
      zoneFrost.textContent = fr.frostFree
        ? "❄️ Frost-free"
        : `❄️ Last frost ~${fmtMD(fr.lastFrost)} · First frost ~${fmtMD(fr.firstFall)}`;
    }
  }
  changeZoneBtn.addEventListener("click", () => {
    zoneDisplay.hidden = true;
    zoneEdit.hidden = false;
    zoneSel.focus();
  });
  updateZoneUI();

  tabs.forEach((t) => t.addEventListener("click", () => switchView(t.dataset.view)));
  function switchView(name) {
    tabs.forEach((t) => t.classList.toggle("active", t.dataset.view === name));
    views.garden.hidden = name !== "garden";
    views.guide.hidden = name !== "guide";
    views.beds.hidden = name !== "beds";
    if (name === "guide") renderGuide();
    if (name === "beds") renderBeds();
  }

  zoneSel.addEventListener("change", () => {
    currentZone = zoneSel.value;
    localStorage.setItem(ZONE_KEY, currentZone);
    updateZoneUI();
    renderGuide();
  });
  guideSearch.addEventListener("input", renderGuide);
  guideFilter.addEventListener("change", renderGuide);

  // Reference (non-leap) year so month math is stable.
  const REF_YEAR = 2025;
  function anchorDate(zone, anchor) {
    const z = DATA.ZONE_FROST[zone];
    if (!z || z.frostFree) return null;
    const md = anchor === "firstFall" ? z.firstFall : z.lastFrost;
    return new Date(REF_YEAR, md[0] - 1, md[1]);
  }

  // Returns array of month indices (0-11) covered by a method for a zone.
  function methodMonths(method, zone) {
    const base = anchorDate(zone, method.anchor);
    if (!base) return null; // frost-free
    const start = new Date(base.getTime() + method.startWk * 7 * 86400000);
    const end = new Date(base.getTime() + method.endWk * 7 * 86400000);
    const months = new Set();
    const cur = new Date(start.getFullYear(), start.getMonth(), 1);
    const last = new Date(end.getFullYear(), end.getMonth(), 1);
    while (cur <= last) {
      months.add(cur.getMonth());
      cur.setMonth(cur.getMonth() + 1);
    }
    return [...months];
  }

  function monthsLabel(monthIdxs) {
    if (!monthIdxs || monthIdxs.length === 0) return "—";
    const sorted = [...monthIdxs].sort((a, b) => a - b);
    if (sorted.length === 1) return MONTHS[sorted[0]];
    return `${MONTHS[sorted[0]]}–${MONTHS[sorted[sorted.length - 1]]}`;
  }

  function plantMonthSet(plant, zone) {
    const all = new Set();
    plant.methods.forEach((m) => {
      const mm = methodMonths(m, zone);
      if (mm) mm.forEach((x) => all.add(x));
    });
    return all;
  }

  function renderGuide() {
    const q = (guideSearch.value || "").trim().toLowerCase();
    const filter = guideFilter.value;
    const thisMonth = new Date().getMonth();
    const hasZone = currentZone && DATA.ZONE_FROST[currentZone];
    const frostFree = hasZone && DATA.ZONE_FROST[currentZone].frostFree;

    let items = DATA.PLANTS.filter((p) => {
      if (!q) return true;
      return (p.name + " " + p.crop + " " + p.latin).toLowerCase().includes(q);
    });

    if (filter === "now" && hasZone && !frostFree) {
      items = items.filter((p) => plantMonthSet(p, currentZone).has(thisMonth));
    }

    guideListEl.innerHTML = items.map((p) => guideCardHtml(p, hasZone, frostFree, thisMonth)).join("");

    if (items.length === 0) {
      guideEmptyEl.hidden = false;
      guideEmptyEl.textContent = q
        ? "No plants match your search."
        : (filter === "now" ? "Nothing to plant this month for your zone. 🌱" : "No plants yet.");
    } else {
      guideEmptyEl.hidden = true;
    }
  }

  function guideCardHtml(p, hasZone, frostFree, thisMonth) {
    const nowBadge = (hasZone && !frostFree && plantMonthSet(p, currentZone).has(thisMonth))
      ? `<span class="badge thirsty">Plant now</span>` : "";

    let timing;
    if (!hasZone) {
      timing = `<p class="muted">Select your zone above to see planting months.</p>`;
    } else if (frostFree) {
      timing = `<p class="meta"><span>🌡️ Frost-free zone — warm-season crops can be sown in most months; cool-season crops do best in the cooler months.</span></p>`;
    } else {
      timing = `<ul class="timing">` + p.methods.map((m) => {
        const mm = methodMonths(m, currentZone);
        const isNow = mm && mm.includes(thisMonth);
        return `<li${isNow ? ' class="now"' : ""}><strong>${escapeHtml(m.type)}:</strong> ${monthsLabel(mm)}${isNow ? " • now" : ""}</li>`;
      }).join("") + `</ul>`;
    }

    const facts = [];
    if (p.daysToMaturity) facts.push(`<span>⏱️ ${p.daysToMaturity} days to harvest</span>`);
    if (p.perennial) facts.push(`<span>♻️ Perennial</span>`);
    if (p.sun) facts.push(`<span>☀️ ${escapeHtml(p.sun)}</span>`);
    if (p.spacingIn) facts.push(`<span>↔️ ${p.spacingIn}&quot; apart</span>`);
    if (p.depthIn) facts.push(`<span>🕳️ ${p.depthIn}&quot; deep</span>`);
    if (p.germDays) facts.push(`<span>🌱 Germ ${p.germDays}d</span>`);

    const src = (p.sources || []).map((s) =>
      s.url ? `<a href="${s.url}" target="_blank" rel="noopener">${escapeHtml(s.name)}</a>` : escapeHtml(s.name)
    ).join(", ");

    return `
      <article class="card guide-card" data-id="${p.id}">
        <div class="card-top">
          <h3>${escapeHtml(p.name)}</h3>
          ${nowBadge}
        </div>
        <p class="latin">${escapeHtml(p.crop)} · <em>${escapeHtml(p.latin)}</em></p>
        ${timing}
        ${facts.length ? `<p class="meta">${facts.join("")}</p>` : ""}
        ${p.tips ? `<p class="notes">${escapeHtml(p.tips)}</p>` : ""}
        ${src ? `<p class="source">📖 Source: ${src}${p.sources[0].retrieved ? ` <span class="muted">(${p.sources[0].retrieved})</span>` : ""}</p>` : ""}
        <div class="card-actions">
          <button class="water-btn" data-act="add">+ Add to my garden</button>
        </div>
      </article>`;
  }

  guideListEl.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-act='add']");
    if (!btn) return;
    const id = e.target.closest(".card").dataset.id;
    const gp = DATA.PLANTS.find((p) => p.id === id);
    if (gp) openDialogFromGuide(gp);
  });

  function openDialogFromGuide(gp) {
    form.reset();
    dialogTitle.textContent = "Add plant";
    f.id.value = "";
    f.name.value = gp.name;
    f.location.value = "";
    f.planted.value = todayStr();
    f.interval.value = 3;
    f.sun.value = ["Full sun", "Partial sun", "Shade"].includes(gp.sun) ? gp.sun : "";
    const noteParts = [];
    noteParts.push(`${gp.crop} (${gp.latin}).`);
    if (gp.daysToMaturity) noteParts.push(`~${gp.daysToMaturity} days to harvest.`);
    if (gp.spacingIn) noteParts.push(`Space ${gp.spacingIn}" apart.`);
    if (gp.tips) noteParts.push(gp.tips);
    if (gp.sources && gp.sources[0]) noteParts.push(`Source: ${gp.sources[0].name}.`);
    f.notes.value = noteParts.join(" ");
    dialog.showModal();
    f.name.focus();
  }

  // ===================== Rain-aware watering (opt-in) =====================
  const weatherPanelEl = document.getElementById("weatherPanel");
  let wxBusy = false;
  let wxError = "";

  function persistRain() {
    localStorage.setItem(RAIN_ENABLED_KEY, rainEnabled ? "1" : "0");
    if (rainLoc) localStorage.setItem(RAIN_LOC_KEY, JSON.stringify(rainLoc));
    else localStorage.removeItem(RAIN_LOC_KEY);
    if (weather) localStorage.setItem(RAIN_WX_KEY, JSON.stringify(weather));
    else localStorage.removeItem(RAIN_WX_KEY);
  }

  function round2(n) { return Math.round(n * 100) / 100; }

  function recentRainTotal() {
    if (!weather || !weather.byDate) return 0;
    const today = todayStr();
    const cutoff = localDateStr(new Date(Date.now() - 7 * MS_PER_DAY));
    let sum = 0;
    for (const [date, inches] of Object.entries(weather.byDate)) {
      if (date <= today && date >= cutoff) sum += inches;
    }
    return sum;
  }

  function forecastTomorrow() {
    if (!weather || !weather.byDate) return null;
    const tmr = localDateStr(new Date(Date.now() + MS_PER_DAY));
    return tmr in weather.byDate ? weather.byDate[tmr] : null;
  }

  async function fetchWeather() {
    if (!rainLoc) return;
    wxBusy = true; wxError = ""; renderWeatherPanel();
    try {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${rainLoc.lat}` +
        `&longitude=${rainLoc.lon}&daily=precipitation_sum&past_days=7&forecast_days=2` +
        `&precipitation_unit=inch&timezone=auto`;
      const res = await fetch(url);
      if (!res.ok) throw new Error("Weather service error " + res.status);
      const data = await res.json();
      const byDate = {};
      const t = data.daily.time, v = data.daily.precipitation_sum;
      for (let i = 0; i < t.length; i++) byDate[t[i]] = v[i] == null ? 0 : v[i];
      weather = { fetchedAt: Date.now(), byDate };
      persistRain();
    } catch (e) {
      wxError = e.message || "Couldn't fetch weather.";
    } finally {
      wxBusy = false;
      render();
    }
  }

  function useGPS() {
    if (!navigator.geolocation) { wxError = "Location isn't available on this device."; renderWeatherPanel(); return; }
    wxBusy = true; wxError = ""; renderWeatherPanel();
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = round2(pos.coords.latitude), lon = round2(pos.coords.longitude);
        rainLoc = { lat, lon, label: `Your area (~${lat}, ${lon})` };
        persistRain();
        fetchWeather();
      },
      (err) => {
        wxBusy = false;
        wxError = err.code === 1
          ? "Location permission denied. You can enter a town/city instead."
          : "Couldn't get your location. Try entering a town/city.";
        renderWeatherPanel();
      },
      { enableHighAccuracy: false, timeout: 15000, maximumAge: 600000 }
    );
  }

  async function useCity() {
    const name = prompt("Enter a town or city (optionally add state/country):");
    if (!name || !name.trim()) return;
    wxBusy = true; wxError = ""; renderWeatherPanel();
    try {
      const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name.trim())}&count=1`);
      const data = await res.json();
      if (!data.results || !data.results.length) throw new Error("No place found for “" + name.trim() + "”.");
      const r = data.results[0];
      const parts = [r.name, r.admin1, r.country_code].filter(Boolean).join(", ");
      rainLoc = { lat: round2(r.latitude), lon: round2(r.longitude), label: parts };
      persistRain();
      fetchWeather();
    } catch (e) {
      wxBusy = false;
      wxError = e.message || "Couldn't find that place.";
      renderWeatherPanel();
    }
  }

  function enableRain() {
    rainEnabled = true; persistRain();
    if (!rainLoc) useGPS(); else { renderWeatherPanel(); if (!weather) fetchWeather(); }
  }
  function disableRain() {
    rainEnabled = false; rainLoc = null; weather = null; wxError = "";
    persistRain();
    render();
  }

  function fmtFetched(ts) {
    if (!ts) return "";
    return new Date(ts).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  }

  function renderWeatherPanel() {
    if (!weatherPanelEl) return;
    let html;

    if (!rainEnabled) {
      html = `
        <div class="wx-off">
          <div>
            <strong>🌧️ Rain-aware watering</strong>
            <p class="muted">Optional. Uses recent rainfall near you (via Open-Meteo) so plants aren't marked thirsty right after it rains. Sends only your approximate location — off by default.</p>
          </div>
          <button class="primary" data-wx="enable">Turn on</button>
        </div>`;
    } else if (wxBusy) {
      html = `<div class="wx-on"><span>⏳ Getting weather…</span> <button data-wx="off">Turn off</button></div>`;
    } else if (!rainLoc) {
      html = `
        <div class="wx-on">
          <div class="wx-line"><strong>🌧️ Rain-aware watering is on</strong>
          <p class="muted">Set your location to check rainfall:</p></div>
          <div class="wx-actions">
            <button class="primary" data-wx="gps">📍 Use my location</button>
            <button data-wx="city">Enter town/city</button>
            <button data-wx="off">Turn off</button>
          </div>
          ${wxError ? `<p class="wx-error">${escapeHtml(wxError)}</p>` : ""}
        </div>`;
    } else {
      const recent = recentRainTotal();
      const sig = lastSignificantRain();
      const tmr = forecastTomorrow();
      html = `
        <div class="wx-on">
          <div class="wx-line">
            <strong>🌧️ ${recent.toFixed(2)}″ rain in last 7 days</strong>
            <span class="muted">· ${escapeHtml(rainLoc.label)}</span>
          </div>
          <p class="muted wx-detail">
            ${sig ? `Last significant rain: ${fmtDate(sig.date)} (${sig.inches.toFixed(2)}″), counted as a watering.` : `No significant rain (≥${RAIN_THRESHOLD_IN}″) recently.`}
            ${tmr != null ? ` · Tomorrow: ${tmr.toFixed(2)}″ forecast.` : ""}
          </p>
          <div class="wx-actions">
            <button data-wx="refresh">↻ Refresh</button>
            <button data-wx="gps">📍 Update location</button>
            <button data-wx="city">Change town/city</button>
            <button data-wx="off">Turn off</button>
          </div>
          ${wxError ? `<p class="wx-error">${escapeHtml(wxError)}</p>` : ""}
          <p class="wx-attrib muted">Updated ${fmtFetched(weather && weather.fetchedAt)} · Weather by <a href="https://open-meteo.com/" target="_blank" rel="noopener">Open-Meteo</a></p>
        </div>`;
    }
    weatherPanelEl.innerHTML = html;
  }

  weatherPanelEl && weatherPanelEl.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-wx]");
    if (!btn) return;
    const act = btn.dataset.wx;
    if (act === "enable") enableRain();
    else if (act === "off") disableRain();
    else if (act === "gps") useGPS();
    else if (act === "city") useCity();
    else if (act === "refresh") fetchWeather();
  });

  // Refresh weather in the background on load if enabled and stale (>3h).
  if (rainEnabled && rainLoc) {
    const stale = !weather || (Date.now() - (weather.fetchedAt || 0)) > 3 * 3600 * 1000;
    if (stale && navigator.onLine) fetchWeather();
  }

  // ===================== Visual Bed Planner =====================
  const BEDS_KEY = "garden.beds.v1";
  const CELL_IN = 12; // one grid cell = 12" = one "square foot"
  let beds = loadJson(BEDS_KEY, []);
  let currentBedId = null;
  let armedTool = { kind: "select" };

  function saveBeds() { localStorage.setItem(BEDS_KEY, JSON.stringify(beds)); }
  function currentBed() { return beds.find((b) => b.id === currentBedId) || null; }

  // --- geometry ---
  function bedCols(b) {
    const ft = b.shape === "circle" ? b.diameterFt : b.widthFt;
    let n = Math.max(1, Math.round((ft || 1) * 12 / CELL_IN));
    if (b.border && b.shape !== "circle") n = Math.max(1, n - 1);
    return n;
  }
  function bedRows(b) {
    const ft = b.shape === "circle" ? b.diameterFt : b.lengthFt;
    let n = Math.max(1, Math.round((ft || 1) * 12 / CELL_IN));
    if (b.border && b.shape !== "circle") n = Math.max(1, n - 1);
    return n;
  }
  function inCircle(b, c, r) {
    if (b.shape !== "circle") return true;
    const n = bedCols(b), R = n / 2;
    const dx = (c + 0.5) - R, dy = (r + 0.5) - R;
    return dx * dx + dy * dy <= R * R + 1e-6;
  }
  function isBlocked(b, c, r) { return (b.blocked || []).includes(c + "," + r); }
  function inBounds(b, c, r) { return c >= 0 && r >= 0 && c < bedCols(b) && r < bedRows(b); }
  function cellUsable(b, c, r) { return inBounds(b, c, r) && inCircle(b, c, r); }
  function cellPlantable(b, c, r) { return cellUsable(b, c, r) && !isBlocked(b, c, r); }
  function plantingAt(b, c, r) {
    return (b.plantings || []).find((pl) =>
      c >= pl.col && c < pl.col + (pl.wCells || 1) &&
      r >= pl.row && r < pl.row + (pl.hCells || 1));
  }

  // --- spacing → per-square count / footprint ---
  function plantGeom(spacingIn) {
    const sp = spacingIn && spacingIn > 0 ? spacingIn : CELL_IN;
    if (sp > CELL_IN) {
      const span = Math.ceil(sp / CELL_IN);
      return { w: span, h: span, qty: 1 };
    }
    const perRow = Math.floor(CELL_IN / sp);
    return { w: 1, h: 1, qty: Math.min(16, Math.max(1, perRow * perRow)) };
  }
  function footprintClear(b, col, row, w, h) {
    for (let dc = 0; dc < w; dc++) for (let dr = 0; dr < h; dr++) {
      const c = col + dc, r = row + dr;
      if (!cellPlantable(b, c, r) || plantingAt(b, c, r)) return false;
    }
    return true;
  }
  // Like footprintClear but ignores one existing planting (used when resizing it).
  function footprintClearExcept(b, col, row, w, h, exceptId) {
    for (let dc = 0; dc < w; dc++) for (let dr = 0; dr < h; dr++) {
      const c = col + dc, r = row + dr;
      if (!cellPlantable(b, c, r)) return false;
      const hit = plantingAt(b, c, r);
      if (hit && hit.id !== exceptId) return false;
    }
    return true;
  }
  // Resize a planting's footprint (in squares). Returns true if applied.
  function resizePlanting(b, pl, w, h) {
    w = Math.max(1, Math.min(bedCols(b), w));
    h = Math.max(1, Math.min(bedRows(b), h));
    if (pl.col + w > bedCols(b) || pl.row + h > bedRows(b)) return false;
    if (!footprintClearExcept(b, pl.col, pl.row, w, h, pl.id)) return false;
    pl.wCells = w; pl.hCells = h;
    saveBeds();
    return true;
  }

  function plantEmoji(name) {
    const n = (name || "").toLowerCase();
    const map = [
      ["tomato", "🍅"], ["garlic", "🧄"], ["carrot", "🥕"], ["bean", "🫘"],
      ["pea", "🟢"], ["cucumber", "🥒"], ["zucchini", "🥒"], ["squash", "🎃"],
      ["watermelon", "🍉"], ["melon", "🍈"], ["asparagus", "🌿"], ["pepper", "🫑"],
      ["lettuce", "🥬"], ["onion", "🧅"], ["potato", "🥔"], ["corn", "🌽"],
      ["strawberr", "🍓"], ["basil", "🌿"], ["herb", "🌿"], ["broccoli", "🥦"],
      ["eggplant", "🍆"], ["pumpkin", "🎃"], ["kale", "🥬"], ["radish", "🌶️"],
    ];
    for (const [k, e] of map) if (n.includes(k)) return e;
    return "🌱";
  }
  function guideNote(gp) {
    const parts = [`${gp.crop} (${gp.latin}).`];
    if (gp.daysToMaturity) parts.push(`~${gp.daysToMaturity} days to harvest.`);
    if (gp.spacingIn) parts.push(`Space ${gp.spacingIn}" apart.`);
    if (gp.sources && gp.sources[0]) parts.push(`Source: ${gp.sources[0].name}.`);
    return parts.join(" ");
  }

  // --- placement / removal (integrated with My Garden tracker) ---
  function placePlant(b, col, row, meta) {
    const g = plantGeom(meta.spacingIn);
    if (!footprintClear(b, col, row, g.w, g.h)) return false;
    const plant = {
      id: uid(),
      name: meta.name,
      location: b.name,
      planted: todayStr(),
      interval: 3,
      sun: ["Full sun", "Partial sun", "Shade"].includes(meta.sun) ? meta.sun : "",
      notes: (meta.note ? meta.note + " " : "") + `In ${b.name}.`,
      lastWatered: "",
      bedId: b.id,
    };
    plants.push(plant);
    b.plantings = b.plantings || [];
    b.plantings.push({
      id: plant.id, col, row, wCells: g.w, hCells: g.h,
      name: meta.name, guideId: meta.guideId || null, qty: 1, emoji: plantEmoji(meta.name),
    });
    save(); saveBeds();
    return true;
  }
  function removePlanting(b, plantingId) {
    b.plantings = (b.plantings || []).filter((pl) => pl.id !== plantingId);
    plants = plants.filter((p) => p.id !== plantingId);
    save(); saveBeds();
  }

  function lostPlantings(b) {
    return (b.plantings || []).filter((pl) => {
      for (let dc = 0; dc < (pl.wCells || 1); dc++) for (let dr = 0; dr < (pl.hCells || 1); dr++) {
        if (!cellUsable(b, pl.col + dc, pl.row + dr)) return true;
      }
      return false;
    });
  }
  // Apply geometry changes (shape/dims); prune plantings that no longer fit.
  function applyBedChanges(b, changes) {
    const temp = Object.assign({}, b, changes);
    const lost = lostPlantings(temp);
    if (lost.length && !confirm(`This change removes ${lost.length} planting(s) that no longer fit. Continue?`)) return false;
    Object.assign(b, changes);
    const lostIds = new Set(lost.map((p) => p.id));
    b.plantings = (b.plantings || []).filter((pl) => !lostIds.has(pl.id));
    plants = plants.filter((p) => !lostIds.has(p.id));
    b.blocked = (b.blocked || []).filter((k) => {
      const [c, r] = k.split(",").map(Number);
      return cellUsable(b, c, r);
    });
    save(); saveBeds();
    return true;
  }

  // --- SVG grid ---
  function buildBedSvg(b, interactive) {
    const cols = bedCols(b), rows = bedRows(b);
    const blocked = new Set(b.blocked || []);
    const rect = b.shape === "rect";
    const rounded = rect && b.rounded;
    const off = rect && b.border ? 0.5 : 0; // 6" inset border = half a 12" cell
    const outerW = cols + 2 * off, outerH = rows + 2 * off;
    const rx = rounded ? Math.min(outerW, outerH) * 0.22 : 0;
    const clipId = "bedRound-" + b.id;
    const needClip = rounded && off === 0;
    const raised = b.kind !== "inground";
    const p = [];
    p.push(`<svg class="bed-svg" viewBox="-0.1 -0.1 ${outerW + 0.2} ${outerH + 0.2}" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg">`);
    let defs = `<pattern id="hatch" width="0.3" height="0.3" patternTransform="rotate(45)" patternUnits="userSpaceOnUse"><rect width="0.3" height="0.3" fill="#e4ddd2"/><line x1="0" y1="0" x2="0" y2="0.3" stroke="#b9ac97" stroke-width="0.14"/></pattern>`;
    if (needClip) defs += `<clipPath id="${clipId}"><rect x="0" y="0" width="${cols}" height="${rows}" rx="${rx}" ry="${rx}"/></clipPath>`;
    p.push(`<defs>${defs}</defs>`);
    // Bed backdrop: when there's a border margin, this fills the frame area around the grid.
    if (off > 0) {
      p.push(`<rect x="0" y="0" width="${outerW}" height="${outerH}" rx="${rx}" ry="${rx}" fill="${raised ? "#efe7d6" : "#e8ddc6"}" stroke="#8fb37d" stroke-width="0.08" vector-effect="non-scaling-stroke"></rect>`);
    }
    if (needClip) p.push(`<g clip-path="url(#${clipId})">`);
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      if (!inCircle(b, c, r)) continue;
      const isB = blocked.has(c + "," + r);
      const fill = isB ? "url(#hatch)" : (raised ? "#ffffff" : "#f4efe3");
      const stroke = raised ? "#c3d4b8" : "#d9cdb2";
      const attrs = interactive ? ` data-col="${c}" data-row="${r}"` : "";
      p.push(`<rect class="bed-cell" x="${off + c}" y="${off + r}" width="1" height="1" fill="${fill}" stroke="${stroke}" stroke-width="0.04" vector-effect="non-scaling-stroke"${attrs}></rect>`);
    }
    if (needClip) p.push(`</g>`);
    if (b.shape === "circle") {
      const R = cols / 2;
      p.push(`<circle cx="${R}" cy="${R}" r="${R}" fill="none" stroke="#8fb37d" stroke-width="0.08" vector-effect="non-scaling-stroke"></circle>`);
    }
    if (rounded && off === 0) {
      p.push(`<rect x="0" y="0" width="${cols}" height="${rows}" rx="${rx}" ry="${rx}" fill="none" stroke="#8fb37d" stroke-width="0.08" vector-effect="non-scaling-stroke"></rect>`);
    }
    (b.plantings || []).forEach((pl) => {
      const w = pl.wCells || 1, h = pl.hCells || 1;
      const x0 = off + pl.col, y0 = off + pl.row;
      const attrs = interactive ? ` data-planting="${pl.id}"` : "";
      p.push(`<g class="bed-planting"${attrs}>`);
      p.push(`<rect x="${x0 + 0.07}" y="${y0 + 0.07}" width="${w - 0.14}" height="${h - 0.14}" rx="0.12" fill="#e5f2df" stroke="#5a9247" stroke-width="0.05" vector-effect="non-scaling-stroke"></rect>`);
      p.push(`<text x="${x0 + w / 2}" y="${y0 + h / 2}" text-anchor="middle" dominant-baseline="central" font-size="${Math.min(w, h) * 0.52}">${pl.emoji || "🌱"}</text>`);
      if (pl.qty > 1) p.push(`<text x="${x0 + w - 0.12}" y="${y0 + h - 0.14}" text-anchor="end" dominant-baseline="central" font-size="0.24" fill="#3a5a2c">×${pl.qty}</text>`);
      p.push(`</g>`);
    });
    p.push(`</svg>`);
    return p.join("");
  }

  function bedDims(b) {
    return b.shape === "circle" ? `◯ ${b.diameterFt} ft` : `▭ ${b.widthFt}×${b.lengthFt} ft`;
  }
  function bedStats(b) {
    let usable = 0, used = 0;
    const cols = bedCols(b), rows = bedRows(b);
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      if (cellUsable(b, c, r) && !isBlocked(b, c, r)) usable++;
    }
    (b.plantings || []).forEach((pl) => { used += (pl.wCells || 1) * (pl.hCells || 1); });
    return { usable, used, blocked: (b.blocked || []).length, plantings: (b.plantings || []).length };
  }

  // --- rendering: list vs editor ---
  const bedsRoot = document.getElementById("bedsRoot");

  function renderBeds() {
    const b = currentBed();
    if (b) renderBedEditor(b); else { currentBedId = null; renderBedList(); }
  }

  function renderBedList() {
    if (!beds.length) {
      bedsRoot.innerHTML = `
        <section class="beds-intro">
          <h2>Garden beds</h2>
          <p class="muted">Lay out your raised beds and in-ground gardens on a square-foot grid, then tap to place plants. Everything stays on this device.</p>
          <button class="primary" data-bed-act="newbed">+ New bed</button>
        </section>`;
      return;
    }
    const cards = beds.map((bd) => {
      const s = bedStats(bd);
      return `
        <button class="bed-card" data-bed-open="${bd.id}">
          <div class="bed-card-preview">${buildBedSvg(bd, false)}</div>
          <div class="bed-card-info">
            <strong>${escapeHtml(bd.name)}</strong>
            <span class="muted">${bd.kind === "inground" ? "In-ground" : "Raised"} · ${bedDims(bd)}</span>
            <span class="muted">🌱 ${s.plantings} planting${s.plantings === 1 ? "" : "s"}${s.blocked ? ` · 🧱 ${s.blocked}` : ""}</span>
          </div>
        </button>`;
    }).join("");
    bedsRoot.innerHTML = `
      <section class="beds-list-head">
        <h2>Garden beds</h2>
        <button class="primary" data-bed-act="newbed">+ New bed</button>
      </section>
      <section class="beds-grid">${cards}</section>`;
  }

  function paletteHtml() {
    const chips = [];
    chips.push(`<button class="chip ${armedTool.kind === "select" ? "on" : ""}" data-tool="select">✋ Select</button>`);
    chips.push(`<button class="chip ${armedTool.kind === "block" ? "on" : ""}" data-tool="block">🧱 Path/Block</button>`);
    chips.push(`<button class="chip ${armedTool.kind === "plant" && armedTool.meta && !armedTool.meta.guideId ? "on" : ""}" data-tool="custom">✏️ Custom…</button>`);
    (DATA.PLANTS || []).forEach((gp, i) => {
      const on = armedTool.kind === "plant" && armedTool.meta && armedTool.meta.guideId === gp.id;
      chips.push(`<button class="chip ${on ? "on" : ""}" data-tool="plant:${i}">${plantEmoji(gp.name)} ${escapeHtml(gp.name)}</button>`);
    });
    return chips.join("");
  }

  function toolHint(b) {
    if (armedTool.kind === "block") return "🧱 Tap squares to mark paths/bricks (non-plantable). Tap a blocked square to clear it.";
    if (armedTool.kind === "plant") {
      const g = plantGeom(armedTool.meta.spacingIn);
      const cap = g.w > 1 || g.h > 1 ? `spans ${g.w}×${g.h} squares` : `fits up to ${g.qty} per square`;
      return `Placing ${escapeHtml(armedTool.meta.name)} (${cap}) — tap a square.`;
    }
    return "Tap a plant to edit it. Pick a plant below to place it, or use 🧱 to add paths.";
  }

  function renderBedEditor(b) {
    const s = bedStats(b);
    const resize = b.shape === "circle"
      ? `<div class="resize-group"><span>Diameter</span><button data-resize="d-">−</button><b>${b.diameterFt} ft</b><button data-resize="d+">+</button></div>`
      : `<div class="resize-group"><span>Width</span><button data-resize="w-">−</button><b>${b.widthFt} ft</b><button data-resize="w+">+</button></div>
         <div class="resize-group"><span>Length</span><button data-resize="l-">−</button><b>${b.lengthFt} ft</b><button data-resize="l+">+</button></div>`;
    bedsRoot.innerHTML = `
      <div class="bed-editor-head">
        <button class="link-btn" data-bed-act="back">‹ Beds</button>
        <div class="bed-editor-title">
          <strong>${escapeHtml(b.name)}</strong>
          <span class="muted">${b.kind === "inground" ? "In-ground" : "Raised"} · ${bedDims(b)}</span>
        </div>
        <div class="bed-editor-btns">
          <button data-bed-act="editbed">Edit</button>
          <button data-bed-act="deletebed">Delete</button>
        </div>
      </div>
      <div class="bed-resize">${resize}</div>
      <div class="bed-palette">${paletteHtml()}</div>
      <p class="bed-hint">${toolHint(b)}</p>
      <div class="bed-grid-wrap">${buildBedSvg(b, true)}</div>
      <p class="bed-summary muted">🟩 ${s.used}/${s.usable} squares used · 🌱 ${s.plantings} planting${s.plantings === 1 ? "" : "s"}${s.blocked ? ` · 🧱 ${s.blocked} path` : ""}</p>`;
  }

  // --- interactions (delegated on the static bedsView container) ---
  function armTool(spec) {
    const b = currentBed();
    if (spec === "select") armedTool = { kind: "select" };
    else if (spec === "block") armedTool = { kind: "block" };
    else if (spec === "custom") {
      const name = (prompt("Custom plant name:") || "").trim();
      if (!name) return;
      armedTool = { kind: "plant", meta: { name, spacingIn: null, sun: "", guideId: null, note: "Custom plant." } };
    } else if (spec.startsWith("plant:")) {
      const gp = (DATA.PLANTS || [])[parseInt(spec.slice(6), 10)];
      if (!gp) return;
      armedTool = { kind: "plant", meta: { name: gp.name, spacingIn: gp.spacingIn, sun: gp.sun, guideId: gp.id, note: guideNote(gp) } };
    }
    if (b) renderBedEditor(b);
  }

  function onCellTap(c, r) {
    const b = currentBed();
    if (!b) return;
    if (armedTool.kind === "block") {
      if (isBlocked(b, c, r)) {
        b.blocked = (b.blocked || []).filter((k) => k !== c + "," + r);
        saveBeds(); renderBedEditor(b); return;
      }
      if (!cellUsable(b, c, r) || plantingAt(b, c, r)) return;
      b.blocked = b.blocked || [];
      b.blocked.push(c + "," + r);
      saveBeds(); renderBedEditor(b); return;
    }
    if (armedTool.kind === "plant") {
      const hit = plantingAt(b, c, r);
      if (hit) { openPlantingDialog(b, hit); return; }
      if (!cellPlantable(b, c, r)) return;
      if (!placePlant(b, c, r, armedTool.meta)) {
        alert("Not enough room here — this plant needs more space (it's blocked or off the edge).");
      }
      renderBedEditor(b);
    }
  }

  function onPlantingTap(id) {
    const b = currentBed();
    if (!b) return;
    const pl = (b.plantings || []).find((x) => x.id === id);
    if (pl) openPlantingDialog(b, pl);
  }

  bedsRoot.addEventListener("click", (e) => {
    const open = e.target.closest("[data-bed-open]");
    if (open) { currentBedId = open.getAttribute("data-bed-open"); armedTool = { kind: "select" }; renderBeds(); return; }
    const act = e.target.closest("[data-bed-act]");
    if (act) { handleBedAct(act.getAttribute("data-bed-act")); return; }
    const rs = e.target.closest("[data-resize]");
    if (rs) { handleResize(rs.getAttribute("data-resize")); return; }
    const tool = e.target.closest("[data-tool]");
    if (tool) { armTool(tool.getAttribute("data-tool")); return; }
    const pl = e.target.closest("[data-planting]");
    if (pl) { onPlantingTap(pl.getAttribute("data-planting")); return; }
    const cell = e.target.closest("[data-col]");
    if (cell) { onCellTap(+cell.getAttribute("data-col"), +cell.getAttribute("data-row")); return; }
  });

  function handleBedAct(a) {
    const b = currentBed();
    if (a === "newbed") openBedDialog(null);
    else if (a === "back") { currentBedId = null; renderBeds(); }
    else if (a === "editbed" && b) openBedDialog(b);
    else if (a === "deletebed" && b) {
      const s = bedStats(b);
      const msg = s.plantings
        ? `Delete “${b.name}” and its ${s.plantings} placed plant(s) from My Garden?`
        : `Delete “${b.name}”?`;
      if (confirm(msg)) {
        const ids = new Set((b.plantings || []).map((pl) => pl.id));
        plants = plants.filter((p) => !ids.has(p.id));
        beds = beds.filter((x) => x.id !== b.id);
        currentBedId = null;
        save(); saveBeds(); render(); renderBeds();
      }
    }
  }

  function handleResize(op) {
    const b = currentBed();
    if (!b) return;
    const MIN = 1, MAX = 30;
    const clamp = (v) => Math.max(MIN, Math.min(MAX, v));
    let changes = null;
    if (op === "w+") changes = { widthFt: clamp((b.widthFt || 4) + 1) };
    else if (op === "w-") changes = { widthFt: clamp((b.widthFt || 4) - 1) };
    else if (op === "l+") changes = { lengthFt: clamp((b.lengthFt || 8) + 1) };
    else if (op === "l-") changes = { lengthFt: clamp((b.lengthFt || 8) - 1) };
    else if (op === "d+") changes = { diameterFt: clamp((b.diameterFt || 4) + 1) };
    else if (op === "d-") changes = { diameterFt: clamp((b.diameterFt || 4) - 1) };
    if (changes) { applyBedChanges(b, changes); renderBedEditor(b); }
  }

  // --- bed create/edit dialog ---
  const bedDialog = document.getElementById("bedDialog");
  const bedForm = document.getElementById("bedForm");
  const bedFields = {
    id: document.getElementById("bedId"),
    name: document.getElementById("bedName"),
    kind: document.getElementById("bedKind"),
    shape: document.getElementById("bedShape"),
    width: document.getElementById("bedWidth"),
    length: document.getElementById("bedLength"),
    diameter: document.getElementById("bedDiameter"),
    rounded: document.getElementById("bedRounded"),
    border: document.getElementById("bedBorder"),
  };
  const rectDims = document.getElementById("rectDims");
  const circleDims = document.getElementById("circleDims");
  const roundedRow = document.getElementById("roundedRow");
  const borderRow = document.getElementById("borderRow");
  function syncShapeFields() {
    const circ = bedFields.shape.value === "circle";
    rectDims.hidden = circ;
    circleDims.hidden = !circ;
    roundedRow.hidden = circ;
    borderRow.hidden = circ;
  }
  bedFields.shape.addEventListener("change", syncShapeFields);

  function openBedDialog(b) {
    bedForm.reset();
    if (b) {
      document.getElementById("bedDialogTitle").textContent = "Edit bed";
      bedFields.id.value = b.id;
      bedFields.name.value = b.name || "";
      bedFields.kind.value = b.kind || "raised";
      bedFields.shape.value = b.shape || "rect";
      bedFields.width.value = b.widthFt || 4;
      bedFields.length.value = b.lengthFt || 8;
      bedFields.diameter.value = b.diameterFt || 4;
      bedFields.rounded.checked = !!b.rounded;
      bedFields.border.checked = !!b.border;
    } else {
      document.getElementById("bedDialogTitle").textContent = "New bed";
      bedFields.id.value = "";
      bedFields.kind.value = "raised";
      bedFields.shape.value = "rect";
      bedFields.width.value = 4;
      bedFields.length.value = 8;
      bedFields.diameter.value = 4;
    }
    syncShapeFields();
    bedDialog.showModal();
    bedFields.name.focus();
  }

  bedForm.addEventListener("submit", (e) => {
    if (!bedFields.name.value.trim()) return;
    e.preventDefault();
    const name = bedFields.name.value.trim();
    const kind = bedFields.kind.value;
    const shape = bedFields.shape.value;
    const widthFt = Math.max(1, Math.min(30, parseInt(bedFields.width.value, 10) || 4));
    const lengthFt = Math.max(1, Math.min(30, parseInt(bedFields.length.value, 10) || 8));
    const diameterFt = Math.max(1, Math.min(30, parseInt(bedFields.diameter.value, 10) || 4));
    const rounded = shape === "rect" ? bedFields.rounded.checked : false;
    const border = shape === "rect" ? bedFields.border.checked : false;
    const existing = bedFields.id.value ? beds.find((x) => x.id === bedFields.id.value) : null;
    if (existing) {
      existing.name = name;
      existing.kind = kind;
      (existing.plantings || []).forEach((pl) => {
        const p = plants.find((x) => x.id === pl.id);
        if (p) p.location = name;
      });
      applyBedChanges(existing, { shape, widthFt, lengthFt, diameterFt, rounded, border });
      save(); saveBeds();
      currentBedId = existing.id;
    } else {
      const bed = {
        id: uid(), name, kind, shape,
        widthFt, lengthFt, diameterFt, rounded, border,
        cellIn: CELL_IN, blocked: [], plantings: [],
      };
      beds.push(bed);
      currentBedId = bed.id;
      saveBeds();
    }
    bedDialog.close();
    switchView("beds");
    renderBeds();
  });
  document.getElementById("bedCancelBtn").addEventListener("click", () => bedDialog.close());
  bedDialog.addEventListener("click", (e) => { if (e.target === bedDialog) bedDialog.close(); });

  // --- planting (occupied cell) dialog ---
  const plantingDialog = document.getElementById("plantingDialog");
  const pdQty = document.getElementById("pdQty");
  let pdContext = null; // { bedId, plantingId }
  function openPlantingDialog(b, pl) {
    pdContext = { bedId: b.id, plantingId: pl.id };
    document.getElementById("pdTitle").textContent = pl.name;
    const p = plants.find((x) => x.id === pl.id);
    const st = p ? waterStatus(p) : null;
    document.getElementById("pdInfo").textContent =
      `${pl.emoji || "🌱"} ${pl.name} · square-foot spot in ${b.name}.` + (st ? ` ${st.label}.` : "");
    document.getElementById("pdW").textContent = pl.wCells || 1;
    document.getElementById("pdH").textContent = pl.hCells || 1;
    pdQty.value = pl.qty || 1;
    plantingDialog.showModal();
  }
  function handlePdSize(op) {
    if (!pdContext) return;
    const b = beds.find((x) => x.id === pdContext.bedId);
    const pl = b && (b.plantings || []).find((x) => x.id === pdContext.plantingId);
    if (!pl) return;
    let w = pl.wCells || 1, h = pl.hCells || 1;
    if (op === "w+") w++; else if (op === "w-") w--;
    else if (op === "h+") h++; else if (op === "h-") h--;
    if (resizePlanting(b, pl, w, h)) {
      document.getElementById("pdW").textContent = pl.wCells;
      document.getElementById("pdH").textContent = pl.hCells;
      if (currentBedId === b.id) renderBedEditor(b);
    }
  }
  pdQty.addEventListener("change", () => {
    if (!pdContext) return;
    const b = beds.find((x) => x.id === pdContext.bedId);
    const pl = b && (b.plantings || []).find((x) => x.id === pdContext.plantingId);
    if (!pl) return;
    pl.qty = Math.max(1, Math.min(99, parseInt(pdQty.value, 10) || 1));
    saveBeds();
    if (currentBedId === b.id) renderBedEditor(b);
  });
  plantingDialog.addEventListener("click", (e) => {
    if (e.target === plantingDialog) { plantingDialog.close(); return; }
    const sizeBtn = e.target.closest("[data-pd-size]");
    if (sizeBtn) { handlePdSize(sizeBtn.getAttribute("data-pd-size")); return; }
    const btn = e.target.closest("[data-pd]");
    if (!btn) return;
    const act = btn.getAttribute("data-pd");
    const b = pdContext && beds.find((x) => x.id === pdContext.bedId);
    if (act === "close") { plantingDialog.close(); return; }
    if (!b || !pdContext) { plantingDialog.close(); return; }
    if (act === "water") {
      const p = plants.find((x) => x.id === pdContext.plantingId);
      if (p) { p.lastWatered = todayStr(); save(); }
      plantingDialog.close();
    } else if (act === "open") {
      plantingDialog.close();
      switchView("garden");
    } else if (act === "remove") {
      if (confirm("Remove this plant from the bed and My Garden?")) {
        removePlanting(b, pdContext.plantingId);
        plantingDialog.close();
        if (currentBedId === b.id) renderBedEditor(b);
        render();
      }
    }
  });

  render();
})();
