// Garden Planner — local-first PWA. All data lives in localStorage on this device.
(function () {
  "use strict";

  const STORAGE_KEY = "garden.plants.v1";
  const MS_PER_DAY = 86400000;

  // --- Backup reminder ---
  const BACKUP_AT_KEY = "garden.backup.lastAt.v1";      // ms timestamp of last export
  const BACKUP_SNOOZE_KEY = "garden.backup.snoozeUntil.v1"; // ms timestamp
  const BACKUP_REMIND_DAYS = 14;   // remind once a backup is this old (or never made)
  const BACKUP_SNOOZE_DAYS = 3;    // "remind me later" hides the banner this long

  // --- Rain-aware watering (opt-in) ---
  const RAIN_ENABLED_KEY = "garden.rain.enabled";
  const RAIN_LOC_KEY = "garden.location.v1";
  const RAIN_WX_KEY = "garden.weather.v1";
  const RAIN_THRESHOLD_IN = 0.25;   // rainfall (inches) that counts as a watering
  const RAIN_WINDOW_DAYS = 8;        // how far back rain can "reset" the schedule
  // --- Heat / humidity warnings (uses the same location + fetch) ---
  const HEAT_WARN_F_DEFAULT = 90;   // fallback daytime-high threshold for plants w/o data
  const HUMID_WARN_PCT = 80;        // relative humidity considered "muggy"
  const HUMID_MIN_TEMP_F = 68;      // muggy only raises disease risk when it's also warm
  const CLIMATE_FORECAST_DAYS = 4;  // look this many days ahead for heat/humidity warnings
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
  const sortEl = document.getElementById("sort");
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
    placeBed: document.getElementById("placeBed"),
    mulched: document.getElementById("mulched"),
  };
  const placeBedRow = document.getElementById("placeBedRow");
  const locationRow = document.getElementById("locationRow");
  // Metadata for the plant currently in the dialog, used to place it in a bed.
  let dialogMeta = null;
  // Free-text location only matters when the plant isn't in a bed. It shows when
  // "Not in a bed" is explicitly chosen, or when there are no beds to pick from.
  // The neutral "— Select —" default keeps it hidden.
  function toggleLocationField() {
    if (!locationRow) return;
    const noBeds = beds.length === 0;
    const notInBed = f.placeBed && f.placeBed.value === "none";
    locationRow.hidden = !(noBeds || notInBed);
  }

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

  // Straw mulch (1–2") slows evaporation, so mulched plants can go longer
  // between waterings. Applied as a multiplier on the plant's set interval.
  const MULCH_FACTOR = 1.5;
  function effectiveInterval(p) {
    if (!p.interval) return null;
    return p.mulched ? Math.round(p.interval * MULCH_FACTOR) : p.interval;
  }

  function daysUntilWater(p) {
    const eff = effectiveInterval(p);
    if (!eff) return null;
    const base = effectiveWaterBase(p);
    const last = parseLocalDate(base.date);
    const due = new Date(last.getTime() + eff * MS_PER_DAY);
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

  // Format a plant name as "Crop, Variety" so varieties group under their crop
  // (e.g. name "Sugar Baby Watermelon" + crop "Watermelon" -> "Watermelon, Sugar Baby").
  function cropVarietyName(name, crop) {
    name = String(name || "").trim();
    crop = String(crop || "").trim();
    if (!crop || crop.toLowerCase() === name.toLowerCase()) return name || crop;
    const re = new RegExp("\\s*" + crop.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s*", "i");
    const variety = name.replace(re, " ").trim();
    return variety ? crop + ", " + variety : crop;
  }

  // Best-effort crop for a tracked (My Garden) plant: stored crop, else look up
  // the matching guide plant by name.
  function plantCrop(p) {
    if (p.crop) return p.crop;
    const gp = guidePlants().find((g) => g.name && p.name && g.name.toLowerCase() === p.name.toLowerCase());
    return gp ? gp.crop || "" : "";
  }

  function trackedDisplayName(p) {
    return cropVarietyName(p.name, plantCrop(p));
  }

  // The matching guide plant for a tracked plant (by exact name), if any.
  function guidePlantFor(p) {
    if (!p || !p.name) return null;
    return guidePlants().find((g) => g.name && g.name.toLowerCase() === p.name.toLowerCase()) || null;
  }

  // Estimated first-harvest window for a tracked plant, from its planted date +
  // the crop's days-to-maturity. Returns null when we can't estimate.
  function harvestEstimate(p) {
    if (!p || !p.planted) return null;
    const gp = guidePlantFor(p);
    const dtm = p.daysToMaturity != null ? p.daysToMaturity : (gp && gp.daysToMaturity);
    if (!dtm) return null;
    const planted = parseLocalDate(p.planted);
    if (!planted || isNaN(planted.getTime())) return null;
    const ready = new Date(planted.getTime() + dtm * MS_PER_DAY);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const daysLeft = Math.round((ready.getTime() - today.getTime()) / MS_PER_DAY);
    return { ready, daysLeft, dtm, cues: gp && gp.harvest ? gp.harvest.cues : "" };
  }

  // Season-based harvest for perennials/crops picked on a calendar window
  // (e.g. asparagus in spring) rather than a days-to-maturity countdown.
  function seasonWindow(hs, zone, year) {
    const z = DATA.ZONE_FROST[zone];
    if (!z || z.frostFree) return null;
    const md = hs.anchor === "firstFall" ? z.firstFall : z.lastFrost;
    const base = new Date(year, md[0] - 1, md[1]);
    return {
      start: new Date(base.getTime() + hs.startWk * 7 * MS_PER_DAY),
      end: new Date(base.getTime() + hs.endWk * 7 * MS_PER_DAY),
    };
  }
  // Pure core: given a harvestSeason, zone, planted date, and "today", classify.
  function seasonHarvestFor(hs, zone, planted, today) {
    if (!hs) return null;
    let year = today.getFullYear();
    let w = seasonWindow(hs, zone, year);
    if (!w) return null;
    const t0 = new Date(today); t0.setHours(0, 0, 0, 0);
    if (t0 > w.end) { year += 1; w = seasonWindow(hs, zone, year); }
    const start0 = new Date(w.start); start0.setHours(0, 0, 0, 0);
    const end0 = new Date(w.end); end0.setHours(0, 0, 0, 0);
    let firstHarvestYear = null;
    if (hs.establishYears && planted) {
      const pd = parseLocalDate(planted);
      if (pd && !isNaN(pd.getTime())) firstHarvestYear = pd.getFullYear() + hs.establishYears;
    }
    const base = { year, start: w.start, end: w.end, firstHarvestYear };
    if (firstHarvestYear && year < firstHarvestYear) return Object.assign(base, { state: "establishing" });
    if (t0 >= start0 && t0 <= end0) return Object.assign(base, { state: "ready" });
    const daysToStart = Math.round((start0.getTime() - t0.getTime()) / MS_PER_DAY);
    if (daysToStart > 0 && daysToStart <= 14) return Object.assign(base, { state: "soon", daysToStart });
    return Object.assign(base, { state: "upcoming", daysToStart });
  }
  // Wrapper for a tracked plant using the current zone and today.
  function seasonHarvest(p) {
    if (!p) return null;
    const gp = guidePlantFor(p);
    const hs = (p.harvestSeason) || (gp && gp.harvestSeason);
    if (!hs) return null;
    const z = DATA.ZONE_FROST[currentZone];
    if (!currentZone || !z || z.frostFree) return null;
    const res = seasonHarvestFor(hs, currentZone, p.planted, new Date());
    if (!res) return null;
    res.cues = (gp && gp.harvest && gp.harvest.cues) || (p.harvest && p.harvest.cues) || "";
    return res;
  }

  // --- Succession sowing planner (planning calendar) ------------------------
  // Given a crop's succession profile, zone frost dates, and days-to-maturity,
  // compute the full-season sowing schedule: first/last safe sow dates, how many
  // sowings fit at the chosen interval, and the next sowing due on/after today.
  function successionPlanFor(sc, zone, dtm, today) {
    if (!sc) return null;
    const z = DATA.ZONE_FROST[zone];
    if (!z || z.frostFree || !z.lastFrost || !z.firstFall) return null;
    const interval = Math.max(1, sc.intervalDays || 14);
    const year = today.getFullYear();
    const anchorMd = sc.sowAnchor === "firstFall" ? z.firstFall : z.lastFrost;
    const anchor = new Date(year, anchorMd[0] - 1, anchorMd[1]);
    const firstSow = new Date(anchor.getTime() + (sc.sowStartWk || 0) * 7 * MS_PER_DAY);
    firstSow.setHours(0, 0, 0, 0);
    const fall = new Date(year, z.firstFall[0] - 1, z.firstFall[1]);
    const maturity = dtm || sc.daysToMaturity || 60;
    const tol = sc.frostTolDays || 0;
    const lastSow = new Date(fall.getTime() - (maturity - tol) * MS_PER_DAY);
    lastSow.setHours(0, 0, 0, 0);
    if (lastSow < firstSow) return null;
    const span = Math.round((lastSow.getTime() - firstSow.getTime()) / MS_PER_DAY);
    const count = Math.floor(span / interval) + 1;
    const t0 = new Date(today); t0.setHours(0, 0, 0, 0);
    let next = null, remaining = 0;
    for (let i = 0; i < count; i++) {
      const d = new Date(firstSow.getTime() + i * interval * MS_PER_DAY);
      d.setHours(0, 0, 0, 0);
      if (d.getTime() >= t0.getTime()) { if (!next) next = d; remaining++; }
    }
    let state = "active";
    if (t0.getTime() < firstSow.getTime()) state = "upcoming";
    else if (t0.getTime() > lastSow.getTime()) state = "past";
    return { interval, firstSow, lastSow, count, next, remaining, state, year };
  }


  const HEAT_ADVICE = {
    cool: "Cool-season crop — heat brings on bolting, bitterness, and poor quality. Give afternoon shade, water deeply in the morning, and harvest promptly.",
    fruit: "Extreme heat can drop blossoms and pause fruit set. Keep soil evenly moist, mulch, and shade in the hottest afternoons — fruiting resumes as it cools.",
    tough: "Heat-tolerant but thirsty — water deeply early in the day, mulch to hold moisture, and watch for midday wilting.",
    generic: "Water deeply in the early morning, mulch to conserve moisture, and provide afternoon shade on the hottest days.",
  };
  const HUMID_ADVICE = "Muggy, still air invites fungal disease (mildew, blight, rust). Water at the base rather than the leaves, improve airflow and spacing, avoid handling plants while wet, and remove any affected foliage.";

  // Climate profile for a tracked plant, via its guide plant or sensible defaults.
  function climateOf(p) {
    const gp = guidePlantFor(p);
    const c = (p && p.climate) || (gp && gp.climate) || null;
    return {
      heatF: c && c.heatF != null ? c.heatF : HEAT_WARN_F_DEFAULT,
      cat: (c && c.cat) || "generic",
      humid: !!(c && c.humid),
      known: !!c,
    };
  }

  // Peak heat / muggiest day across today..+N from the stored forecast.
  function forecastPeak() {
    if (!weather || !weather.heatByDate) return null;
    const today = todayStr();
    const end = localDateStr(new Date(Date.now() + CLIMATE_FORECAST_DAYS * MS_PER_DAY));
    let peakF = -Infinity, peakFeels = -Infinity, hotDay = null;
    let humidDay = null, humidRh = -Infinity, humidTemp = null;
    for (const [date, h] of Object.entries(weather.heatByDate)) {
      if (!h || date < today || date > end) continue;
      if (h.tmax != null && h.tmax > peakF) { peakF = h.tmax; hotDay = date; }
      if (h.feels != null && h.feels > peakFeels) peakFeels = h.feels;
      // Muggy = high humidity while also warm.
      if (h.rh != null && h.tmax != null && h.tmax >= HUMID_MIN_TEMP_F && h.rh >= HUMID_WARN_PCT && h.rh > humidRh) {
        humidRh = h.rh; humidDay = date; humidTemp = h.tmax;
      }
    }
    if (peakF === -Infinity) return null;
    return { peakF, peakFeels, hotDay, humidDay, humidRh: humidRh === -Infinity ? null : humidRh, humidTemp };
  }

  // Whether a specific plant is at heat / humidity risk over the forecast window.
  function climateAlertFor(p) {
    const fp = forecastPeak();
    if (!fp) return null;
    const c = climateOf(p);
    const heat = fp.peakF >= c.heatF;
    const humid = c.humid && fp.humidDay != null;
    if (!heat && !humid) return null;
    return { heat, humid, peakF: fp.peakF, peakFeels: fp.peakFeels, hotDay: fp.hotDay,
             humidDay: fp.humidDay, humidRh: fp.humidRh, cat: c.cat, heatF: c.heatF };
  }

  function dayLabel(dateStr) {
    if (!dateStr) return "";
    const t = todayStr();
    const tmr = localDateStr(new Date(Date.now() + MS_PER_DAY));
    if (dateStr === t) return "today";
    if (dateStr === tmr) return "tomorrow";
    const d = parseLocalDate(dateStr);
    return d ? d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }) : dateStr;
  }

  // Top-of-page banner summarizing which plants face heat / humidity stress.
  function renderClimateAlert() {
    const el = document.getElementById("climateAlert");
    if (!el) return;
    const fp = (rainEnabled && weather) ? forecastPeak() : null;
    if (!fp || !plants.length) { el.hidden = true; el.innerHTML = ""; return; }

    const heatPlants = [], humidPlants = [];
    for (const p of plants) {
      const a = climateAlertFor(p);
      if (!a) continue;
      if (a.heat) heatPlants.push(p);
      if (a.humid) humidPlants.push(p);
    }
    if (!heatPlants.length && !humidPlants.length) { el.hidden = true; el.innerHTML = ""; return; }

    const names = (arr) => arr.map((p) => escapeHtml(trackedDisplayName(p))).join(", ");
    const blocks = [];
    if (heatPlants.length) {
      const feels = fp.peakFeels != null && fp.peakFeels >= fp.peakF + 3 ? ` (feels ${Math.round(fp.peakFeels)}°)` : "";
      blocks.push(`
        <div class="climate-block heat">
          <strong>🔥 Heat advisory — up to ${Math.round(fp.peakF)}°F${feels} ${escapeHtml(dayLabel(fp.hotDay))}</strong>
          <p>${heatPlants.length} plant${heatPlants.length > 1 ? "s" : ""} may be stressed: <span class="climate-names">${names(heatPlants)}</span></p>
          <p class="muted">Water deeply in the early morning, mulch to hold moisture, and shade the most sensitive crops through the hottest afternoons.</p>
        </div>`);
    }
    if (humidPlants.length) {
      blocks.push(`
        <div class="climate-block humid">
          <strong>🍄 Humid — disease watch (~${Math.round(fp.humidRh)}% humidity ${escapeHtml(dayLabel(fp.humidDay))})</strong>
          <p>${humidPlants.length} plant${humidPlants.length > 1 ? "s" : ""} prone to fungal disease: <span class="climate-names">${names(humidPlants)}</span></p>
          <p class="muted">Water at the base (not the leaves), improve airflow and spacing, and avoid handling plants while wet.</p>
        </div>`);
    }
    el.innerHTML = blocks.join("");
    el.hidden = false;
  }

  // --- Rendering ---
  function render() {
    renderWeatherPanel();
    renderClimateAlert();
    const filter = filterEl.value;
    const sortMode = sortEl ? sortEl.value : "thirsty";
    const sorted = [...plants].sort((a, b) => {
      if (sortMode === "az") {
        return trackedDisplayName(a).toLowerCase().localeCompare(trackedDisplayName(b).toLowerCase());
      }
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
      emptyEl.innerHTML = 'No plants yet. Add one from the <strong>📅 Planting Guide</strong> or place plants in a <strong>🗺️ Bed</strong> to start tracking. 🪴';
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
    if (typeof updateBackupBanner === "function") updateBackupBanner();
    if (typeof renderSeedTasks === "function") renderSeedTasks();
  }

  function seedlingCardHtml(p) {
    const status = seedlingStatus(p);
    const meta = [];
    if (p.location) meta.push(`<span>📍 ${escapeHtml(p.location)}</span>`);
    if (p.sun) meta.push(`<span>☀️ ${escapeHtml(p.sun)}</span>`);
    if (p.sownIndoors) meta.push(`<span>🌰 Sown indoors ${fmtDate(p.sownIndoors)}</span>`);

    const statusBadge = status ? `<span class="badge ${status.cls}">${status.label}</span>` : "";
    const note = status
      ? `<p class="seed-note ${status.cls}">${escapeHtml(status.detail)}</p>`
      : `<p class="seed-note"><span class="muted">Set your USDA zone in ⚙️ Settings to see harden-off &amp; transplant timing.</span></p>`;

    return `
      <article class="card seedling-card" data-id="${p.id}">
        <div class="card-top">
          <h3>${escapeHtml(trackedDisplayName(p))}</h3>
          <div class="badge-stack">
            <span class="badge seedling">🌱 Seedling (indoors)</span>
            ${statusBadge}
          </div>
        </div>
        ${meta.length ? `<p class="meta">${meta.join("")}</p>` : ""}
        ${note}
        ${p.notes ? `<p class="notes">${escapeHtml(p.notes)}</p>` : ""}
        <div class="card-actions">
          <button class="water-btn" data-act="move-garden">🌿 Move to garden</button>
          <button data-act="edit">Edit</button>
          <button data-act="delete">Delete</button>
        </div>
      </article>`;
  }

  function cardHtml(p) {
    if (p.stage === "seedling") return seedlingCardHtml(p);
    const st = waterStatus(p);
    const base = effectiveWaterBase(p);
    const meta = [];
    if (p.location) meta.push(`<span>📍 ${escapeHtml(p.location)}</span>`);
    if (p.sun) meta.push(`<span>☀️ ${escapeHtml(p.sun)}</span>`);
    if (p.planted) meta.push(`<span>🌱 Planted ${fmtDate(p.planted)}</span>`);
    if (p.sownIndoors) meta.push(`<span class="transplant-chip">🌿 Transplanted</span>`);
    if (p.lastWatered) meta.push(`<span>💧 Watered ${fmtDate(p.lastWatered)}</span>`);
    if (p.interval) meta.push(`<span>🔁 Every ${p.interval}d</span>`);
    if (p.mulched) meta.push(`<span class="mulch-chip">🌾 Mulched → ~${effectiveInterval(p)}d</span>`);

    const rainNote = (base.fromRain && p.interval)
      ? `<p class="rain-note">🌧️ Counting ${base.rain.inches.toFixed(2)}″ rain on ${fmtDate(base.rain.date)} as a watering.</p>`
      : "";

    const harv = harvestEstimate(p);
    const season = harv ? null : seasonHarvest(p);
    let harvestNote = "", harvestClass = "", harvestBadge = "";
    if (harv) {
      const readyStr = harv.ready.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
      if (harv.daysLeft > 0) {
        const soon = harv.daysLeft <= 14;
        harvestNote = `<p class="harvest-note${soon ? " soon" : ""}">🧺 Est. harvest in ~${harv.daysLeft} day${harv.daysLeft === 1 ? "" : "s"} <span class="muted">(around ${readyStr})</span>${soon && harv.cues ? `<br><span class="cue">${escapeHtml(harv.cues)}</span>` : ""}</p>`;
        if (soon) { harvestClass = " harvest-soon"; harvestBadge = `<span class="badge harvest-soon">🧺 Harvest soon</span>`; }
      } else {
        harvestNote = `<p class="harvest-note ready">🧺 Harvest window open <span class="muted">(est. matured ${readyStr})</span>${harv.cues ? `<br><span class="cue">${escapeHtml(harv.cues)}</span>` : ""}</p>`;
        harvestClass = " harvest-ready";
        harvestBadge = `<span class="badge harvest-ready">🧺 Ready to harvest</span>`;
      }
    } else if (season) {
      const startStr = season.start.toLocaleDateString(undefined, { month: "short", day: "numeric" });
      const endStr = season.end.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
      const cueHtml = season.cues ? `<br><span class="cue">${escapeHtml(season.cues)}</span>` : "";
      if (season.state === "establishing") {
        harvestNote = `<p class="harvest-note">🌱 Establishing — first harvest spring ${season.firstHarvestYear}. <span class="muted">Let the crowns build for now.</span></p>`;
      } else if (season.state === "ready") {
        harvestNote = `<p class="harvest-note ready">🧺 In harvest season <span class="muted">(through ${endStr})</span>${cueHtml}</p>`;
        harvestClass = " harvest-ready";
        harvestBadge = `<span class="badge harvest-ready">🧺 Ready to harvest</span>`;
      } else if (season.state === "soon") {
        harvestNote = `<p class="harvest-note soon">🧺 Harvest season starts in ~${season.daysToStart} day${season.daysToStart === 1 ? "" : "s"} <span class="muted">(around ${startStr})</span>${cueHtml}</p>`;
        harvestClass = " harvest-soon";
        harvestBadge = `<span class="badge harvest-soon">🧺 Harvest soon</span>`;
      } else {
        harvestNote = `<p class="harvest-note">🧺 Spring harvest season <span class="muted">(~${startStr} – ${endStr})</span></p>`;
      }
    }

    const clim = climateAlertFor(p);
    let climateBadge = "", climateNote = "";
    if (clim) {
      if (clim.heat) climateBadge += `<span class="badge heat-risk">🔥 Heat risk</span>`;
      if (clim.humid) climateBadge += `<span class="badge humid-risk">🍄 Disease risk</span>`;
      const parts = [];
      if (clim.heat) {
        const feels = clim.peakFeels != null && clim.peakFeels >= clim.peakF + 3
          ? ` (feels ${Math.round(clim.peakFeels)}°)` : "";
        parts.push(`🔥 Up to ${Math.round(clim.peakF)}°F${feels} ${dayLabel(clim.hotDay)}, above this crop's ~${clim.heatF}°F comfort. ${HEAT_ADVICE[clim.cat] || HEAT_ADVICE.generic}`);
      }
      if (clim.humid) {
        parts.push(`🍄 Muggy (~${Math.round(clim.humidRh)}% humidity ${dayLabel(clim.humidDay)}). ${HUMID_ADVICE}`);
      }
      climateNote = `<p class="climate-note">${parts.map(escapeHtml).join("<br>")}</p>`;
    }

    return `
      <article class="card ${st.cls}${harvestClass}" data-id="${p.id}">
        <div class="card-top">
          <h3>${escapeHtml(trackedDisplayName(p))}</h3>
          <div class="badge-stack">
            <span class="badge ${st.badge}">${st.label}</span>
            ${harvestBadge}
            ${climateBadge}
          </div>
        </div>
        ${meta.length ? `<p class="meta">${meta.join("")}</p>` : ""}
        ${rainNote}
        ${harvestNote}
        ${climateNote}
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
      if (f.mulched) f.mulched.checked = !!plant.mulched;
      if (f.startedIndoors) f.startedIndoors.checked = plant.stage === "seedling";
      if (f.sownIndoors) f.sownIndoors.value = plant.sownIndoors || "";
      dialogMeta = { guideId: plant.guideId || null, spacingIn: plant.spacingIn || null };
      const cur = plantingBed(plant);
      // In a bed -> its bed; has a free-text location -> "Not in a bed"; else neutral.
      fillBedPicker(cur ? cur.id : (plant.location ? "none" : ""));
    } else {
      dialogTitle.textContent = "Add plant";
      f.id.value = "";
      f.planted.value = todayStr();
      f.interval.value = 3;
      if (f.startedIndoors) f.startedIndoors.checked = false;
      if (f.sownIndoors) f.sownIndoors.value = "";
      dialogMeta = null;
      fillBedPicker("");
    }
    toggleSeedlingFields();
    dialog.showModal();
    f.name.focus();
  }

  // Show/hide the seed-starting fields based on the "started indoors" toggle.
  function toggleSeedlingFields() {
    const on = !!(f.startedIndoors && f.startedIndoors.checked);
    const sownRow = document.getElementById("sownIndoorsRow");
    const plantedHint = document.getElementById("plantedHint");
    if (sownRow) sownRow.hidden = !on;
    if (plantedHint) plantedHint.hidden = !on;
    if (on && f.sownIndoors && !f.sownIndoors.value) f.sownIndoors.value = todayStr();
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
      mulched: !!(f.mulched && f.mulched.checked),
      stage: (f.startedIndoors && f.startedIndoors.checked) ? "seedling" : "garden",
      sownIndoors: f.sownIndoors ? (f.sownIndoors.value || "") : "",
      lastWatered: existing ? existing.lastWatered : "",
      guideId: dialogMeta ? dialogMeta.guideId : (existing ? existing.guideId : null),
      spacingIn: dialogMeta ? dialogMeta.spacingIn : (existing ? existing.spacingIn : null),
    };
    let plant;
    if (existing) { Object.assign(existing, data); plant = existing; }
    else { plants.push(data); plant = data; }

    const val = f.placeBed ? f.placeBed.value : "";
    const chosenBedId = (val && val !== "none") ? val : "";
    const status = syncPlantPlacement(plant, chosenBedId);
    save(); saveBeds();
    render();
    if (typeof renderBeds === "function") renderBeds();
    dialog.close();
    if (status === "full") {
      const b = bedById(chosenBedId);
      alert(`No open square in "${b ? b.name : "that bed"}" — the plant is tracked in My Garden but not placed. Free up space or resize plants, then set the bed again.`);
    }
  });

  document.getElementById("cancelBtn").addEventListener("click", () => dialog.close());
  if (f.placeBed) f.placeBed.addEventListener("change", toggleLocationField);
  if (f.startedIndoors) f.startedIndoors.addEventListener("change", toggleSeedlingFields);

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
    } else if (act === "move-garden") {
      plant.stage = "garden";
      plant.planted = todayStr();
      plant.lastWatered = "";
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
  filterEl.addEventListener("change", render);
  if (sortEl) sortEl.addEventListener("change", render);

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
  function exportBackup() {
    const payload = { version: 2, plants, beds };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `garden-backup-${todayStr()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    markBackedUp();
  }
  document.getElementById("exportBtn").addEventListener("click", exportBackup);

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
          updateBackupBanner();
        }
      } catch (err) {
        alert("Couldn't import that file: " + err.message);
      }
      importFile.value = "";
    };
    reader.readAsText(file);
  });

  // --- Backup reminder banner ---
  const backupBanner = document.getElementById("backupBanner");
  const backupBannerText = document.getElementById("backupBannerText");
  const backupStatus = document.getElementById("backupStatus");

  function daysAgoLabel(ms) {
    const d = Math.floor((Date.now() - ms) / MS_PER_DAY);
    if (d <= 0) return "today";
    if (d === 1) return "yesterday";
    return `${d} days ago`;
  }

  function markBackedUp() {
    localStorage.setItem(BACKUP_AT_KEY, String(Date.now()));
    localStorage.removeItem(BACKUP_SNOOZE_KEY);
    updateBackupBanner();
  }

  function updateBackupBanner() {
    const lastAt = parseInt(localStorage.getItem(BACKUP_AT_KEY) || "", 10);
    const hasBackup = !isNaN(lastAt);

    // Backup-section status line always reflects the truth.
    if (backupStatus) {
      backupStatus.textContent = hasBackup
        ? `Last backup: ${daysAgoLabel(lastAt)}.`
        : "You haven't exported a backup yet.";
    }

    if (!backupBanner) return;
    let bedCount = 0;
    try { bedCount = beds.length; } catch (e) { /* beds not yet initialized */ }
    const hasData = plants.length > 0 || bedCount > 0;
    const snoozeUntil = parseInt(localStorage.getItem(BACKUP_SNOOZE_KEY) || "", 10);
    const snoozed = !isNaN(snoozeUntil) && Date.now() < snoozeUntil;
    const stale = !hasBackup || (Date.now() - lastAt) >= BACKUP_REMIND_DAYS * MS_PER_DAY;

    if (hasData && stale && !snoozed) {
      backupBannerText.textContent = hasBackup
        ? `Your last backup was ${daysAgoLabel(lastAt)}. Export a fresh copy so you don't lose your garden.`
        : "Your garden data lives only on this device. Export a backup so you don't lose it.";
      backupBanner.hidden = false;
    } else {
      backupBanner.hidden = true;
    }
  }

  document.getElementById("backupBannerExport").addEventListener("click", exportBackup);
  document.getElementById("backupBannerDismiss").addEventListener("click", () => {
    localStorage.setItem(BACKUP_SNOOZE_KEY, String(Date.now() + BACKUP_SNOOZE_DAYS * MS_PER_DAY));
    updateBackupBanner();
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
  const CUSTOM_PLANTS_KEY = "garden.customPlants.v1";
  let customPlants = loadJson(CUSTOM_PLANTS_KEY, []);
  function saveCustomPlants() { localStorage.setItem(CUSTOM_PLANTS_KEY, JSON.stringify(customPlants)); }
  // Built-in guide crops + any custom plants the user added, used everywhere a
  // guide plant is looked up (guide list, beds palette, spacing, companions).
  function guidePlants() { return DATA.PLANTS.concat(customPlants); }
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
    if (typeof renderSeedTasks === "function") renderSeedTasks();
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

  // Month/day range label for a season-harvest window (year-agnostic display).
  function seasonGuideLabel(hs, zone) {
    const w = seasonWindow(hs, zone, REF_YEAR);
    if (!w) return null;
    const f = (d) => d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
    return `${f(w.start)} – ${f(w.end)}`;
  }

  function plantMonthSet(plant, zone) {
    const all = new Set();
    (plant.methods || []).forEach((m) => {
      const mm = methodMonths(m, zone);
      if (mm) mm.forEach((x) => all.add(x));
    });
    return all;
  }

  // ---- Seed-starting timeline (crops that can be started indoors) ----
  function hasIndoorStart(plant) {
    return (plant.methods || []).some((m) => m.type === "Start indoors");
  }
  // Concrete dates for a given calendar year, using the zone's last-frost date.
  function seedTimeline(plant, zone, year) {
    const z = DATA.ZONE_FROST[zone];
    if (!z || z.frostFree) return null;
    const indoor = (plant.methods || []).find((m) => m.type === "Start indoors");
    if (!indoor) return null;
    const lf = new Date(year, z.lastFrost[0] - 1, z.lastFrost[1]);
    const addWk = (wk) => new Date(lf.getTime() + wk * 7 * MS_PER_DAY);
    const tp = (plant.methods || []).find((m) => /transplant/i.test(m.type));
    const transplant = tp ? addWk(tp.startWk) : addWk(0);
    const tpEnd = tp ? addWk(tp.endWk) : transplant;
    return {
      sowStart: addWk(indoor.startWk),
      sowEnd: addWk(indoor.endWk),
      hardenOff: new Date(transplant.getTime() - 7 * MS_PER_DAY),
      transplant,
      tpEnd,
    };
  }
  // Upcoming-season plan: rolls to next year once this year's window has passed.
  function seedPlan(plant, zone, today) {
    let year = today.getFullYear();
    let t = seedTimeline(plant, zone, year);
    if (!t) return null;
    if (today > t.tpEnd) { year += 1; t = seedTimeline(plant, zone, year); }
    return { t, year };
  }
  // Which seed-starting action (if any) is due for this crop right now / soon.
  function seedAction(plant, zone, today) {
    const t = seedTimeline(plant, zone, today.getFullYear());
    if (!t) return null;
    const soon = 10 * MS_PER_DAY;
    if (today >= t.sowStart && today <= t.sowEnd)
      return { key: "sow", label: "🌱 Start seeds indoors now", cls: "seed-sow", date: t.sowEnd };
    if (today >= new Date(t.sowStart.getTime() - soon) && today < t.sowStart)
      return { key: "sow-soon", label: "🌱 Start seeds soon", cls: "seed-soon", date: t.sowStart };
    if (today >= t.hardenOff && today < t.transplant)
      return { key: "harden", label: "🌤️ Harden off now", cls: "seed-harden", date: t.transplant };
    if (today >= t.transplant && today <= t.tpEnd)
      return { key: "transplant", label: "🌱 Safe to transplant now", cls: "seed-transplant", date: t.tpEnd };
    return null;
  }
  function fmtSeedDate(d, withYear) {
    return d.toLocaleDateString(undefined, withYear
      ? { month: "short", day: "numeric", year: "numeric" }
      : { month: "short", day: "numeric" });
  }

  // Harden-off / transplant timing for a tracked seedling, driven by the zone's
  // last-frost date (safe-to-transplant). Uses the crop's transplant window when
  // known, otherwise the last-frost date itself.
  function seedlingTiming(p) {
    const zone = currentZone;
    const z = zone && DATA.ZONE_FROST[zone];
    if (!z || z.frostFree || !z.lastFrost) return null;
    const gp = guidePlantFor(p);
    const year = new Date().getFullYear();
    const lf = new Date(year, z.lastFrost[0] - 1, z.lastFrost[1]);
    const addWk = (wk) => new Date(lf.getTime() + wk * 7 * MS_PER_DAY);
    const tp = ((gp && gp.methods) || []).find((m) => /transplant/i.test(m.type));
    const transplant = tp ? addWk(tp.startWk) : lf;
    const tpEnd = tp ? addWk(tp.endWk) : lf;
    const hardenOff = new Date(transplant.getTime() - 7 * MS_PER_DAY);
    return { hardenOff, transplant, tpEnd, year, hasGuide: !!gp };
  }

  // Current lifecycle status for a seedling: growing / harden-off / transplant.
  function seedlingStatus(p) {
    const t = seedlingTiming(p);
    if (!t) return null;
    const d0 = (x) => { const d = new Date(x); d.setHours(0, 0, 0, 0); return d; };
    const today = d0(new Date());
    const ho = d0(t.hardenOff), tp = d0(t.transplant);
    const daysBetween = (a, b) => Math.round((d0(a).getTime() - d0(b).getTime()) / MS_PER_DAY);
    if (today.getTime() < ho.getTime()) {
      const n = daysBetween(ho, today);
      return { key: "growing", cls: "seed-growing", label: "🌱 Growing indoors",
        detail: `Harden off around ${fmtSeedDate(t.hardenOff, false)}${n > 0 ? ` (~${n} day${n === 1 ? "" : "s"})` : ""}, then transplant around ${fmtSeedDate(t.transplant, false)}.` };
    }
    if (today.getTime() >= ho.getTime() && today.getTime() < tp.getTime()) {
      const n = daysBetween(tp, today);
      return { key: "harden", cls: "seed-harden", label: "🌤️ Harden off now",
        detail: `Set seedlings outside for a few hours a day, increasing over ~1 week. Safe to transplant around ${fmtSeedDate(t.transplant, false)}${n > 0 ? ` (~${n} day${n === 1 ? "" : "s"})` : ""}.` };
    }
    return { key: "transplant", cls: "seed-transplant", label: "🌱 Safe to transplant now",
      detail: `Frost risk has passed for your zone — harden off first if you haven't, then move it to the garden.` };
  }

  // My Garden seasonal reminders: crops whose seed-starting action is due now/soon.
  function renderSeedTasks() {
    const el = document.getElementById("seedTasks");
    if (!el) return;
    const zone = currentZone;
    if (!zone || !DATA.ZONE_FROST[zone] || DATA.ZONE_FROST[zone].frostFree) {
      el.hidden = true; el.innerHTML = ""; return;
    }
    const today = new Date();
    const items = [];
    guidePlants().forEach((p) => {
      if (!hasIndoorStart(p)) return;
      const act = seedAction(p, zone, today);
      if (act) items.push({ name: cropVarietyName(p.name, p.crop), act });
    });
    if (!items.length) { el.hidden = true; el.innerHTML = ""; return; }
    const order = { sow: 0, "sow-soon": 1, harden: 2, transplant: 3 };
    items.sort((a, b) => (order[a.act.key] - order[b.act.key]) || a.name.localeCompare(b.name));
    el.hidden = false;
    el.innerHTML =
      `<h3 class="seed-tasks-title">🌱 Seed-starting to-dos <span class="muted">(Zone ${escapeHtml(zone.toUpperCase())})</span></h3>` +
      `<ul class="seed-tasks-list">` +
      items.map((it) =>
        `<li class="${it.act.cls}"><span class="seed-task-act">${it.act.label}</span> <span class="seed-task-name">${escapeHtml(it.name)}</span> <span class="muted">by ${fmtSeedDate(it.act.date, false)}</span></li>`
      ).join("") +
      `</ul>`;
  }

  // Remembered variety selection per crop group (in-memory, resets on reload).
  const guideVarietySel = {};

  // Grouping key for the guide: crops with a real crop name group together;
  // plants without a crop (e.g. some custom plants) stay on their own.
  function groupKeyOf(p) {
    return p.crop ? "crop:" + p.crop.trim().toLowerCase() : "id:" + p.id;
  }

  // Short variety label = the plant name with the crop's base word removed
  // ("Carbon Tomato" + crop "Tomato (indeterminate)" -> "Carbon").
  function varietyLabel(p) {
    const crop = (p.crop || "").trim();
    const base = crop.split(/[\s(]/)[0];
    let v = String(p.name || "").trim();
    if (base) {
      const re = new RegExp("\\b" + base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b", "ig");
      v = v.replace(re, " ").replace(/\s+/g, " ").trim();
    }
    v = v.replace(/^[-,]\s*/, "").trim();
    return v || String(p.name || "");
  }

  function renderGuide() {
    const q = (guideSearch.value || "").trim().toLowerCase();
    const filter = guideFilter.value;
    const thisMonth = new Date().getMonth();
    const hasZone = currentZone && DATA.ZONE_FROST[currentZone];
    const frostFree = hasZone && DATA.ZONE_FROST[currentZone].frostFree;

    const items = guidePlants();

    // Group all varieties of the same crop, then filter groups by the query so a
    // search keeps the whole crop group visible with the matching variety active.
    const groups = new Map();
    for (const p of items) {
      const key = groupKeyOf(p);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(p);
    }

    const matchesQuery = (v) => (v.name + " " + (v.crop || "") + " " + (v.latin || "")).toLowerCase().includes(q);

    let entries = [];
    for (const [key, vars] of groups) {
      vars.sort((a, b) => varietyLabel(a).toLowerCase().localeCompare(varietyLabel(b).toLowerCase()));
      let matchVar = null;
      if (q) {
        matchVar = vars.find(matchesQuery);
        if (!matchVar) continue;
      }
      const active = matchVar
        || (guideVarietySel[key] && vars.find((v) => v.id === guideVarietySel[key]))
        || vars[0];
      entries.push({ key, active, group: vars });
    }

    // "Plant this month" filter: keep a crop if any variety qualifies, and make
    // sure the shown variety is one that qualifies.
    if (filter === "now" && hasZone && !frostFree) {
      entries = entries.filter((en) => en.group.some((v) => plantMonthSet(v, currentZone).has(thisMonth)));
      entries.forEach((en) => {
        if (!plantMonthSet(en.active, currentZone).has(thisMonth)) {
          const q2 = en.group.find((v) => plantMonthSet(v, currentZone).has(thisMonth));
          if (q2) en.active = q2;
        }
      });
    }

    const sortName = (en) => (en.group.length > 1 ? en.active.crop : cropVarietyName(en.active.name, en.active.crop));
    entries.sort((a, b) => sortName(a).toLowerCase().localeCompare(sortName(b).toLowerCase()));

    guideListEl.innerHTML = entries.map((en) => guideCardHtml(en.active, hasZone, frostFree, thisMonth, en.group)).join("");

    if (entries.length === 0) {
      guideEmptyEl.hidden = false;
      guideEmptyEl.textContent = q
        ? "No plants match your search."
        : (filter === "now" ? "Nothing to plant this month for your zone. 🌱" : "No plants yet.");
    } else {
      guideEmptyEl.hidden = true;
    }
  }

  // Re-render a single crop card when its variety dropdown changes.
  if (guideListEl) {
    guideListEl.addEventListener("change", (e) => {
      const sel = e.target.closest(".variety-select");
      if (!sel) return;
      const key = sel.getAttribute("data-crop");
      guideVarietySel[key] = sel.value;
      const article = sel.closest(".card");
      if (!article) return;
      const thisMonth = new Date().getMonth();
      const hasZone = currentZone && DATA.ZONE_FROST[currentZone];
      const frostFree = hasZone && DATA.ZONE_FROST[currentZone].frostFree;
      const group = guidePlants().filter((p) => groupKeyOf(p) === key);
      const active = group.find((p) => p.id === sel.value) || group[0];
      const tmp = document.createElement("div");
      tmp.innerHTML = guideCardHtml(active, hasZone, frostFree, thisMonth, group);
      if (tmp.firstElementChild) article.replaceWith(tmp.firstElementChild);
    });
  }

  function guideCardHtml(p, hasZone, frostFree, thisMonth, group) {
    const isGroup = group && group.length > 1;
    const nowBadge = (hasZone && !frostFree && plantMonthSet(p, currentZone).has(thisMonth))
      ? `<span class="badge thirsty">Plant now</span>` : "";

    const varietySelect = isGroup
      ? `<label class="variety-picker">Variety
          <select class="variety-select" data-crop="${escapeHtml(groupKeyOf(p))}">
            ${group.map((v) => `<option value="${escapeHtml(v.id)}"${v.id === p.id ? " selected" : ""}>${escapeHtml(varietyLabel(v))}</option>`).join("")}
          </select>
        </label>`
      : "";

    let timing;
    if (p.custom && (!p.methods || !p.methods.length)) {
      timing = `<p class="muted">✨ Custom plant — no planting-calendar info. Use notes for your own schedule.</p>`;
    } else if (!hasZone) {
      timing = `<p class="muted">Select your zone above to see planting months.</p>`;
    } else if (frostFree) {
      timing = `<p class="meta"><span>🌡️ Frost-free zone — warm-season crops can be sown in most months; cool-season crops do best in the cooler months.</span></p>`;
    } else {
      timing = `<ul class="timing">` + (p.methods || []).map((m) => {
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

    const latinLine = p.latin
      ? `<p class="latin">${escapeHtml(p.crop || "")} · <em>${escapeHtml(p.latin)}</em></p>`
      : (p.crop ? `<p class="latin">${escapeHtml(p.crop)}</p>` : "");

    const harvestBlock = p.harvest ? `
        <div class="harvest-guide">
          <h4>🧺 Harvesting</h4>
          ${p.harvestSeason && hasZone && !frostFree && seasonGuideLabel(p.harvestSeason, currentZone) ? `<p><strong>Season (Zone ${escapeHtml(currentZone.toUpperCase())}):</strong> ${seasonGuideLabel(p.harvestSeason, currentZone)}${p.harvestSeason.establishYears ? ` <span class="muted">— starts ${p.harvestSeason.establishYears} yr${p.harvestSeason.establishYears === 1 ? "" : "s"} after planting</span>` : ""}</p>` : ""}
          ${p.harvest.cues ? `<p><strong>When it's ready:</strong> ${escapeHtml(p.harvest.cues)}</p>` : ""}
          ${p.harvest.how ? `<p><strong>How to pick:</strong> ${escapeHtml(p.harvest.how)}</p>` : ""}
          ${p.harvest.storage ? `<p><strong>Storing:</strong> ${escapeHtml(p.harvest.storage)}</p>` : ""}
        </div>` : "";

    const fertilizeBlock = p.fertilize ? `
        <div class="fertilize-guide">
          <h4>🌿 Feeding${p.fertilize.feeder ? ` <span class="badge feeder-${p.fertilize.feeder.toLowerCase()}">${escapeHtml(p.fertilize.feeder)} feeder</span>` : ""}</h4>
          ${p.fertilize.tips ? `<p>${escapeHtml(p.fertilize.tips)}</p>` : ""}
        </div>` : "";

    let seedBlock = "";
    let seedBadge = "";
    if (hasZone && !frostFree && hasIndoorStart(p)) {
      const today = new Date();
      const plan = seedPlan(p, currentZone, today);
      if (plan) {
        const t = plan.t;
        const wy = plan.year !== today.getFullYear();
        const range = t.sowEnd > t.sowStart ? ` – ${fmtSeedDate(t.sowEnd, wy)}` : "";
        seedBlock = `
        <div class="seed-guide">
          <h4>🌱 Seed-starting plan <span class="muted">(Zone ${escapeHtml(currentZone.toUpperCase())})</span></h4>
          <p><strong>Start seeds indoors:</strong> ${fmtSeedDate(t.sowStart, wy)}${range}</p>
          <p><strong>Harden off:</strong> ~${fmtSeedDate(t.hardenOff, wy)}</p>
          <p><strong>Transplant out (earliest safe):</strong> ${fmtSeedDate(t.transplant, wy)}</p>
        </div>`;
      }
      const act = seedAction(p, currentZone, today);
      if (act) seedBadge = `<span class="badge ${act.cls}">${act.label}</span>`;
    }

    let successionBlock = "";
    if (hasZone && !frostFree && p.succession) {
      const sp = successionPlanFor(p.succession, currentZone, p.daysToMaturity, new Date());
      if (sp) {
        const thisYear = new Date().getFullYear();
        const wy = sp.year !== thisYear;
        const everyLabel = sp.interval % 7 === 0
          ? `${sp.interval / 7} week${sp.interval / 7 === 1 ? "" : "s"}`
          : `${sp.interval} days`;
        let nextLine;
        if (sp.state === "active" && sp.next) {
          nextLine = `<p><strong>Next sowing:</strong> around ${fmtSeedDate(sp.next, wy)} <span class="muted">(${sp.remaining} sowing${sp.remaining === 1 ? "" : "s"} left this season)</span></p>`;
        } else if (sp.state === "upcoming") {
          nextLine = `<p class="muted">First sowing starts around ${fmtSeedDate(sp.firstSow, wy)}.</p>`;
        } else {
          nextLine = `<p class="muted">The sowing window for this season has passed — resume next spring.</p>`;
        }
        successionBlock = `
        <div class="succession-guide">
          <h4>🔁 Succession sowing <span class="muted">(Zone ${escapeHtml(currentZone.toUpperCase())})</span></h4>
          <p><strong>Sow every ${everyLabel}</strong> from ${fmtSeedDate(sp.firstSow, false)} to ${fmtSeedDate(sp.lastSow, wy)} — about ${sp.count} sowing${sp.count === 1 ? "" : "s"} for a steady harvest instead of one big glut.</p>
          ${nextLine}
          ${p.succession.note ? `<p>${escapeHtml(p.succession.note)}</p>` : ""}
        </div>`;
      }
    }

    const actions = p.custom
      ? `<button class="water-btn" data-act="add">+ Add to my garden</button>
         <button data-act="edit-custom">Edit</button>
         <button data-act="delete-custom">Delete</button>`
      : `<button class="water-btn" data-act="add">+ Add to my garden</button>`;

    return `
      <article class="card guide-card${p.custom ? " custom-card" : ""}" data-id="${p.id}">
        <div class="card-top">
          <h3>${isGroup ? escapeHtml(p.crop) : escapeHtml(cropVarietyName(p.name, p.crop))}${p.custom ? ` <span class="badge custom-badge">Custom</span>` : ""}</h3>
          ${nowBadge}
          ${seedBadge}
        </div>
        ${varietySelect}
        ${latinLine}
        ${timing}
        ${seedBlock}
        ${successionBlock}
        ${facts.length ? `<p class="meta">${facts.join("")}</p>` : ""}
        ${p.tips ? `<p class="notes">${escapeHtml(p.tips)}</p>` : ""}
        ${harvestBlock}
        ${fertilizeBlock}
        ${src ? `<p class="source">📖 Source: ${src}${p.sources[0].retrieved ? ` <span class="muted">(${p.sources[0].retrieved})</span>` : ""}</p>` : ""}
        <div class="card-actions">
          ${actions}
        </div>
      </article>`;
  }

  guideListEl.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-act]");
    if (!btn) return;
    const id = e.target.closest(".card").dataset.id;
    const act = btn.getAttribute("data-act");
    const gp = guidePlants().find((p) => p.id === id);
    if (!gp) return;
    if (act === "add") openDialogFromGuide(gp);
    else if (act === "edit-custom") openGuidePlantDialog(gp);
    else if (act === "delete-custom") {
      if (confirm(`Delete custom plant “${gp.name}” from the guide? (Plants already added to My Garden stay.)`)) {
        customPlants = customPlants.filter((p) => p.id !== id);
        saveCustomPlants();
        renderGuide();
      }
    }
  });

  function openDialogFromGuide(gp) {
    form.reset();
    dialogTitle.textContent = "Add plant";
    f.id.value = "";
    f.name.value = gp.name;
    f.location.value = "";
    f.planted.value = todayStr();
    f.interval.value = gp.waterEveryDays || 3;
    f.sun.value = ["Full sun", "Partial sun", "Shade"].includes(gp.sun) ? gp.sun : "";
    const noteParts = [];
    noteParts.push(gp.latin ? `${gp.crop} (${gp.latin}).` : (gp.crop ? `${gp.crop}.` : ""));
    if (gp.daysToMaturity) noteParts.push(`~${gp.daysToMaturity} days to harvest.`);
    if (gp.spacingIn) noteParts.push(`Space ${gp.spacingIn}" apart.`);
    if (gp.tips) noteParts.push(gp.tips);
    if (gp.sources && gp.sources[0]) noteParts.push(`Source: ${gp.sources[0].name}.`);
    f.notes.value = noteParts.filter(Boolean).join(" ");
    dialogMeta = { guideId: gp.id, spacingIn: gp.spacingIn || null };
    fillBedPicker("");
    toggleSeedlingFields();
    dialog.showModal();
    f.name.focus();
  }

  // --- custom guide plants (user-defined crops) ---
  const guidePlantDialog = document.getElementById("guidePlantDialog");
  const guidePlantForm = document.getElementById("guidePlantForm");
  const gpf = guidePlantForm ? guidePlantForm.elements : null;
  const addGuidePlantBtn = document.getElementById("addGuidePlantBtn");

  function openGuidePlantDialog(plant) {
    if (!guidePlantDialog) return;
    guidePlantForm.reset();
    document.getElementById("guidePlantTitle").textContent = plant ? "Edit custom plant" : "Add custom plant";
    gpf.gpId.value = plant ? plant.id : "";
    gpf.gpName.value = plant ? plant.name || "" : "";
    gpf.gpCrop.value = plant ? plant.crop || "" : "";
    gpf.gpSun.value = plant && ["Full sun", "Partial sun", "Shade"].includes(plant.sun) ? plant.sun : "";
    gpf.gpSpacing.value = plant && plant.spacingIn ? plant.spacingIn : "";
    gpf.gpWater.value = plant && plant.waterEveryDays ? plant.waterEveryDays : 3;
    gpf.gpDays.value = plant && plant.daysToMaturity ? plant.daysToMaturity : "";
    gpf.gpPerennial.checked = !!(plant && plant.perennial);
    gpf.gpTips.value = plant ? plant.tips || "" : "";
    guidePlantDialog.showModal();
    gpf.gpName.focus();
  }

  if (addGuidePlantBtn) addGuidePlantBtn.addEventListener("click", () => openGuidePlantDialog(null));

  if (guidePlantForm) {
    guidePlantForm.addEventListener("submit", (e) => {
      if (!gpf.gpName.value.trim()) return; // required
      e.preventDefault();
      const existing = gpf.gpId.value ? customPlants.find((p) => p.id === gpf.gpId.value) : null;
      const name = gpf.gpName.value.trim();
      const num = (v) => { const n = parseFloat(v); return isFinite(n) && n > 0 ? n : null; };
      const data = {
        id: existing ? existing.id : "custom-" + uid(),
        custom: true,
        name,
        crop: gpf.gpCrop.value.trim() || name,
        latin: existing ? existing.latin || "" : "",
        sun: gpf.gpSun.value,
        spacingIn: num(gpf.gpSpacing.value),
        waterEveryDays: num(gpf.gpWater.value),
        daysToMaturity: num(gpf.gpDays.value),
        perennial: gpf.gpPerennial.checked,
        tips: gpf.gpTips.value.trim(),
        methods: [],
      };
      if (existing) Object.assign(existing, data);
      else customPlants.push(data);
      saveCustomPlants();
      renderGuide();
      guidePlantDialog.close();
    });
    guidePlantForm.querySelector("[value='cancel']").addEventListener("click", () => guidePlantDialog.close());
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
        `&longitude=${rainLoc.lon}&daily=precipitation_sum,temperature_2m_max,apparent_temperature_max,relative_humidity_2m_max` +
        `&past_days=7&forecast_days=${Math.max(2, CLIMATE_FORECAST_DAYS + 1)}` +
        `&precipitation_unit=inch&temperature_unit=fahrenheit&timezone=auto`;
      const res = await fetch(url);
      if (!res.ok) throw new Error("Weather service error " + res.status);
      const data = await res.json();
      const byDate = {}, heatByDate = {};
      const d = data.daily, t = d.time, v = d.precipitation_sum;
      for (let i = 0; i < t.length; i++) {
        byDate[t[i]] = v[i] == null ? 0 : v[i];
        heatByDate[t[i]] = {
          tmax: d.temperature_2m_max ? d.temperature_2m_max[i] : null,
          feels: d.apparent_temperature_max ? d.apparent_temperature_max[i] : null,
          rh: d.relative_humidity_2m_max ? d.relative_humidity_2m_max[i] : null,
        };
      }
      weather = { fetchedAt: Date.now(), byDate, heatByDate };
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
            <strong>🌦️ Weather-aware garden</strong>
            <p class="muted">Optional. Uses nearby weather (via Open-Meteo) so plants aren't marked thirsty right after rain, and warns you when heat or humidity may stress your crops. Sends only your approximate location — off by default.</p>
          </div>
          <button class="primary" data-wx="enable">Turn on</button>
        </div>`;
    } else if (wxBusy) {
      html = `<div class="wx-on"><span>⏳ Getting weather…</span> <button data-wx="off">Turn off</button></div>`;
    } else if (!rainLoc) {
      html = `
        <div class="wx-on">
          <div class="wx-line"><strong>🌦️ Weather-aware garden is on</strong>
          <p class="muted">Set your location to check rain, heat &amp; humidity:</p></div>
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
          ${(() => { const fp = forecastPeak(); return fp ? `<p class="muted wx-detail">🌡️ Next ${CLIMATE_FORECAST_DAYS} days peak ~${Math.round(fp.peakF)}°F${fp.humidDay ? `, up to ${Math.round(fp.humidRh)}% humidity` : ""}. Heat &amp; humidity warnings show on your plants.</p>` : ""; })()}
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

  // Refresh weather in the background on load if enabled and stale (>3h),
  // or if cached data predates the heat/humidity fields.
  if (rainEnabled && rainLoc) {
    const stale = !weather || !weather.heatByDate || (Date.now() - (weather.fetchedAt || 0)) > 3 * 3600 * 1000;
    if (stale && navigator.onLine) fetchWeather();
  }

  // ===================== Visual Bed Planner =====================
  const BEDS_KEY = "garden.beds.v1";
  const CELL_IN = 12; // one grid cell = 12" = one "square foot"
  let beds = loadJson(BEDS_KEY, []);
  let currentBedId = null;
  let armedTool = { kind: "select" };
  let bedResizeMode = false;

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

  // --- spacing-conflict detection ---
  function guideSpacing(guideId) {
    const gp = guidePlants().find((p) => p.id === guideId);
    return gp && gp.spacingIn ? gp.spacingIn : null;
  }
  function plantingSpacing(pl) {
    if (pl.spacingIn) return pl.spacingIn;
    if (pl.guideId) { const s = guideSpacing(pl.guideId); if (s) return s; }
    return CELL_IN; // custom / unknown → assume 1 sq ft
  }
  // Flag pairs of plantings placed closer (center-to-center) than their combined
  // spacing recommends. Small square-foot plants (need <= 12") are never flagged.
  function bedConflicts(b) {
    const pls = b.plantings || [];
    const out = [];
    for (let i = 0; i < pls.length; i++) for (let j = i + 1; j < pls.length; j++) {
      const A = pls[i], B = pls[j];
      const need = (plantingSpacing(A) + plantingSpacing(B)) / 2;
      if (need <= CELL_IN) continue;
      const ax = A.col + (A.wCells || 1) / 2, ay = A.row + (A.hCells || 1) / 2;
      const bx = B.col + (B.wCells || 1) / 2, by = B.row + (B.hCells || 1) / 2;
      const have = Math.hypot(ax - bx, ay - by) * CELL_IN;
      if (have + 1e-6 < need) out.push({ a: A, b: B, need, have });
    }
    return out;
  }

  // --- companion planting ---
  // Map a planting to a companion "group" via its guide crop or its name.
  function plantGroup(pl) {
    const groups = (DATA.COMPANIONS && DATA.COMPANIONS.groups) || {};
    let hay = (pl.name || "").toLowerCase();
    if (pl.guideId) {
      const gp = guidePlants().find((p) => p.id === pl.guideId);
      if (gp) hay += " " + (gp.crop || "").toLowerCase() + " " + (gp.name || "").toLowerCase();
    }
    for (const key in groups) {
      if (groups[key].some((kw) => hay.includes(kw))) return key;
    }
    return null;
  }
  function companionReason(g1, g2) {
    const r = (DATA.COMPANIONS && DATA.COMPANIONS.reasons) || {};
    return r[g1 + "|" + g2] || r[g2 + "|" + g1] || "";
  }
  function pairInList(list, g1, g2) {
    return (list || []).some((p) => (p[0] === g1 && p[1] === g2) || (p[0] === g2 && p[1] === g1));
  }
  // Two plantings are "neighbors" if their footprints touch or sit within one
  // cell of each other (companion effects are about close proximity).
  function areNeighbors(A, B) {
    const aw = A.wCells || 1, ah = A.hCells || 1, bw = B.wCells || 1, bh = B.hCells || 1;
    const gapX = Math.max(0, Math.max(A.col - (B.col + bw), B.col - (A.col + aw)));
    const gapY = Math.max(0, Math.max(A.row - (B.row + bh), B.row - (A.row + ah)));
    return gapX <= 1 && gapY <= 1;
  }
  // Classify adjacent planting pairs into good/bad companion relationships.
  function companionPairs(b) {
    const C = DATA.COMPANIONS;
    const out = { good: [], bad: [] };
    if (!C) return out;
    const pls = b.plantings || [];
    for (let i = 0; i < pls.length; i++) for (let j = i + 1; j < pls.length; j++) {
      const A = pls[i], B = pls[j];
      if (!areNeighbors(A, B)) continue;
      const g1 = plantGroup(A), g2 = plantGroup(B);
      if (!g1 || !g2 || g1 === g2) continue;
      const rec = { a: A, b: B, reason: companionReason(g1, g2) };
      if (pairInList(C.bad, g1, g2)) out.bad.push(rec);
      else if (pairInList(C.good, g1, g2)) out.good.push(rec);
    }
    return out;
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
    const parts = [gp.latin ? `${gp.crop} (${gp.latin}).` : (gp.crop ? `${gp.crop}.` : "")];
    if (gp.daysToMaturity) parts.push(`~${gp.daysToMaturity} days to harvest.`);
    if (gp.spacingIn) parts.push(`Space ${gp.spacingIn}" apart.`);
    if (gp.tips) parts.push(gp.tips);
    if (gp.sources && gp.sources[0]) parts.push(`Source: ${gp.sources[0].name}.`);
    return parts.filter(Boolean).join(" ");
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
      name: meta.name, guideId: meta.guideId || null, qty: 1,
      spacingIn: meta.spacingIn || null, emoji: plantEmoji(meta.name),
    });
    save(); saveBeds();
    return true;
  }
  function removePlanting(b, plantingId) {
    b.plantings = (b.plantings || []).filter((pl) => pl.id !== plantingId);
    plants = plants.filter((p) => p.id !== plantingId);
    save(); saveBeds();
  }

  // --- linking My Garden plants to beds (auto-placement from the plant dialog) ---
  function firstOpenCell(b, w, h) {
    const cols = bedCols(b), rows = bedRows(b);
    for (let r = 0; r + h <= rows; r++)
      for (let c = 0; c + w <= cols; c++)
        if (footprintClear(b, c, r, w, h)) return { col: c, row: r };
    return null;
  }
  function placementSpacing(plant) {
    if (plant.spacingIn) return plant.spacingIn;
    if (plant.guideId) { const s = guideSpacing(plant.guideId); if (s) return s; }
    const gp = guidePlants().find((g) => g.name && g.name.toLowerCase() === (plant.name || "").toLowerCase());
    return gp && gp.spacingIn ? gp.spacingIn : CELL_IN;
  }
  function bedById(id) { return beds.find((b) => b.id === id) || null; }
  function plantingBed(plant) {
    return beds.find((b) => (b.plantings || []).some((pl) => pl.id === plant.id)) || null;
  }
  function detachFromBed(plant) {
    const b = plantingBed(plant);
    if (b) b.plantings = b.plantings.filter((pl) => pl.id !== plant.id);
    plant.bedId = null;
  }
  // Reconcile a plant's bed link with the picker choice. Returns a status string.
  function syncPlantPlacement(plant, chosenBedId) {
    const current = plantingBed(plant);
    const currentId = current ? current.id : "";
    if ((chosenBedId || "") === currentId) {
      // unchanged — keep the grid cell, just refresh the planting's label/emoji
      if (current) {
        const pl = current.plantings.find((p) => p.id === plant.id);
        if (pl) { pl.name = plant.name; pl.emoji = plantEmoji(plant.name); }
      }
      return "same";
    }
    detachFromBed(plant);
    if (!chosenBedId) return "removed";
    const b = bedById(chosenBedId);
    if (!b) return "removed";
    const g = plantGeom(placementSpacing(plant));
    const cell = firstOpenCell(b, g.w, g.h);
    if (!cell) return "full";
    b.plantings = b.plantings || [];
    b.plantings.push({
      id: plant.id, col: cell.col, row: cell.row, wCells: g.w, hCells: g.h,
      name: plant.name, guideId: plant.guideId || null, qty: 1,
      spacingIn: plant.spacingIn || null, emoji: plantEmoji(plant.name),
    });
    plant.bedId = b.id;
    plant.location = b.name;
    return "placed";
  }
  function fillBedPicker(selectedId) {
    if (!f.placeBed) return;
    if (placeBedRow) placeBedRow.hidden = beds.length === 0;
    f.placeBed.innerHTML = '<option value="">— Select —</option><option value="none">Not in a bed</option>' +
      beds.map((b) => `<option value="${b.id}">${escapeHtml(b.name)}</option>`).join("");
    f.placeBed.value = selectedId || "";
    toggleLocationField();
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
  // Shorten a plant name to fit a planting square (varieties usually lead, so a
  // front-truncation keeps the distinguishing part, e.g. "Sugar Baby Waterme…").
  function truncLabel(name, maxChars) {
    const s = String(name || "").trim();
    if (s.length <= maxChars) return s;
    return s.slice(0, Math.max(1, maxChars - 1)).trim() + "…";
  }
  function buildBedSvg(b, interactive, conflictIds, showHandles) {
    const cols = bedCols(b), rows = bedRows(b);
    const blocked = new Set(b.blocked || []);
    const conflicts = conflictIds || new Set();
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
    (b.plantings || []).forEach((pl) => {
      const w = pl.wCells || 1, h = pl.hCells || 1;
      const x0 = off + pl.col, y0 = off + pl.row;
      const attrs = interactive ? ` data-planting="${pl.id}"` : "";
      p.push(`<g class="bed-planting"${attrs}>`);
      p.push(`<rect x="${x0 + 0.07}" y="${y0 + 0.07}" width="${w - 0.14}" height="${h - 0.14}" rx="0.12" fill="#e5f2df" stroke="#5a9247" stroke-width="0.05" vector-effect="non-scaling-stroke"></rect>`);
      const labelHere = interactive && pl.name;
      const emojiCY = labelHere ? y0 + h * 0.40 : y0 + h / 2;
      const emojiSize = Math.min(w, h) * (labelHere ? 0.46 : 0.52);
      p.push(`<text x="${x0 + w / 2}" y="${emojiCY}" text-anchor="middle" dy="0.35em" font-size="${emojiSize}" style="pointer-events:none">${pl.emoji || "🌱"}</text>`);
      if (labelHere) {
        const labelSize = Math.min(0.2, 0.14 + Math.min(w, h) * 0.02);
        const maxChars = Math.max(6, Math.floor((w - 0.16) / (labelSize * 0.6)));
        const label = escapeHtml(truncLabel(pl.name, maxChars));
        p.push(`<text class="pl-label" x="${x0 + w / 2}" y="${y0 + h - 0.12}" text-anchor="middle" font-size="${labelSize}" fill="#2f5a1f" style="pointer-events:none">${label}</text>`);
      }
      if (pl.qty > 1) p.push(`<text x="${x0 + w - 0.1}" y="${y0 + 0.1}" text-anchor="end" dominant-baseline="hanging" font-size="0.22" fill="#3a5a2c" style="pointer-events:none">×${pl.qty}</text>`);
      if (conflicts.has(pl.id)) p.push(`<rect x="${x0 + 0.02}" y="${y0 + 0.02}" width="${w - 0.04}" height="${h - 0.04}" rx="0.14" fill="none" stroke="#e6893a" stroke-width="0.08" stroke-dasharray="0.16 0.12" vector-effect="non-scaling-stroke" pointer-events="none"></rect>`);
      if (interactive && showHandles) p.push(`<rect class="pl-handle" data-resize-planting="${pl.id}" x="${x0 + w - 0.3}" y="${y0 + h - 0.3}" width="0.28" height="0.28" rx="0.06" fill="#5a9247" stroke="#ffffff" stroke-width="0.035" vector-effect="non-scaling-stroke"></rect>`);
      p.push(`</g>`);
    });
    if (needClip) p.push(`</g>`);
    if (b.shape === "circle") {
      const R = cols / 2;
      p.push(`<circle cx="${R}" cy="${R}" r="${R}" fill="none" stroke="#8fb37d" stroke-width="0.08" vector-effect="non-scaling-stroke"></circle>`);
    }
    if (rounded && off === 0) {
      p.push(`<rect x="0" y="0" width="${cols}" height="${rows}" rx="${rx}" ry="${rx}" fill="none" stroke="#8fb37d" stroke-width="0.08" vector-effect="non-scaling-stroke"></rect>`);
    }
    if (interactive) {
      p.push(`<rect id="dragPreview" x="0" y="0" width="0" height="0" rx="0.12" fill="none" stroke="#2f7d32" stroke-width="0.09" stroke-dasharray="0.18 0.12" vector-effect="non-scaling-stroke" visibility="hidden" pointer-events="none"></rect>`);
    }
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
    if (typeof updateBackupBanner === "function") updateBackupBanner();
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
    guidePlants().forEach((gp, i) => {
      const on = armedTool.kind === "plant" && armedTool.meta && armedTool.meta.guideId === gp.id;
      chips.push(`<button class="chip ${on ? "on" : ""}" data-tool="plant:${i}">${plantEmoji(gp.name)} ${escapeHtml(gp.name)}</button>`);
    });
    return chips.join("");
  }

  function toolHint(b) {
    if (bedResizeMode) return "📐 Resize mode on — drag the corner handle of a plant to change its footprint. Toggle off for a clean view.";
    if (armedTool.kind === "block") return "🧱 Tap squares to mark paths/bricks (non-plantable). Tap a blocked square to clear it.";
    if (armedTool.kind === "plant") {
      const g = plantGeom(armedTool.meta.spacingIn);
      const cap = g.w > 1 || g.h > 1 ? `spans ${g.w}×${g.h} squares` : `fits up to ${g.qty} per square`;
      return `Placing ${escapeHtml(armedTool.meta.name)} (${cap}) — tap a square.`;
    }
    return "Tap a plant to edit it, or drag it to move. Pick a plant below to place it, or use 🧱 to add paths.";
  }

  function renderBedEditor(b) {
    const s = bedStats(b);
    const conflicts = bedConflicts(b);
    const conflictIds = new Set();
    conflicts.forEach((c) => { conflictIds.add(c.a.id); conflictIds.add(c.b.id); });
    const warnHtml = conflicts.length
      ? `<div class="bed-warn">⚠️ ${conflicts.length} spacing conflict${conflicts.length > 1 ? "s" : ""}: ${conflicts.slice(0, 3).map((c) => `${escapeHtml(c.a.name)} &amp; ${escapeHtml(c.b.name)} (need ~${Math.round(c.need)}″, have ${Math.round(c.have)}″)`).join("; ")}${conflicts.length > 3 ? "…" : ""}</div>`
      : "";
    const comp = companionPairs(b);
    const dedupePairs = (arr) => {
      const seen = new Set(), res = [];
      arr.forEach((r) => { const k = [r.a.name, r.b.name].sort().join("|"); if (!seen.has(k)) { seen.add(k); res.push(r); } });
      return res;
    };
    const badP = dedupePairs(comp.bad), goodP = dedupePairs(comp.good);
    const compHtml = (badP.length || goodP.length)
      ? `<div class="bed-companions">
          ${badP.length ? `<div class="comp-line comp-bad">👎 <b>Poor neighbors:</b> ${badP.map((r) => `${escapeHtml(r.a.name)} &amp; ${escapeHtml(r.b.name)}${r.reason ? ` — ${escapeHtml(r.reason)}` : ""}`).join("; ")}</div>` : ""}
          ${goodP.length ? `<div class="comp-line comp-good">👍 <b>Good neighbors:</b> ${goodP.map((r) => `${escapeHtml(r.a.name)} &amp; ${escapeHtml(r.b.name)}`).join("; ")}</div>` : ""}
        </div>`
      : "";
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
      <div class="bed-actions"><button class="chip ${bedResizeMode ? "on" : ""}" data-bed-act="toggleresize">📐 Resize plants: ${bedResizeMode ? "On" : "Off"}</button></div>
      <p class="bed-hint">${toolHint(b)}</p>
      ${warnHtml}
      ${compHtml}
      <div class="bed-grid-wrap">${buildBedSvg(b, true, conflictIds, bedResizeMode)}</div>
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
      const gp = guidePlants()[parseInt(spec.slice(6), 10)];
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
    if (suppressClick) { suppressClick = false; return; }
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

  // --- drag to move a planting ---
  let drag = null;
  let suppressClick = false;
  function bedSvgEl() { return bedsRoot.querySelector(".bed-svg"); }
  function bedOffset(b) { return (b.shape === "rect" && b.border) ? 0.5 : 0; }
  function clientToCell(svg, b, clientX, clientY) {
    const m = svg.getScreenCTM && svg.getScreenCTM();
    if (!m) return null;
    const pt = svg.createSVGPoint(); pt.x = clientX; pt.y = clientY;
    const loc = pt.matrixTransform(m.inverse());
    const off = bedOffset(b);
    return { c: Math.floor(loc.x - off), r: Math.floor(loc.y - off) };
  }
  // Clamp a raw target to a valid in-bounds drop; report whether footprint is clear.
  function computeDrop(b, pl, rawC, rawR) {
    const w = pl.wCells || 1, h = pl.hCells || 1;
    const c = Math.max(0, Math.min(bedCols(b) - w, rawC));
    const r = Math.max(0, Math.min(bedRows(b) - h, rawR));
    return { c, r, valid: footprintClearExcept(b, c, r, w, h, pl.id) };
  }
  bedsRoot.addEventListener("pointerdown", (e) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const b = currentBed(); if (!b) return;
    const handle = e.target.closest("[data-resize-planting]");
    const g = e.target.closest("[data-planting]");
    if (!g) return;
    const id = g.getAttribute("data-planting");
    const pl = (b.plantings || []).find((x) => x.id === id);
    if (!pl) return;
    const svg = bedSvgEl(); if (!svg) return;
    const cell = clientToCell(svg, b, e.clientX, e.clientY);
    drag = {
      mode: handle ? "resize" : "move",
      id, el: g, b,
      grabC: cell ? cell.c - pl.col : 0,
      grabR: cell ? cell.r - pl.row : 0,
      origC: pl.col, origR: pl.row,
      origW: pl.wCells || 1, origH: pl.hCells || 1,
      lastC: pl.col, lastR: pl.row, lastW: pl.wCells || 1, lastH: pl.hCells || 1,
      moved: false, valid: true,
      startX: e.clientX, startY: e.clientY, pointerId: e.pointerId,
    };
    try { g.setPointerCapture(e.pointerId); } catch (err) {}
  });
  bedsRoot.addEventListener("pointermove", (e) => {
    if (!drag || e.pointerId !== drag.pointerId) return;
    const dx = e.clientX - drag.startX, dy = e.clientY - drag.startY;
    if (!drag.moved && Math.hypot(dx, dy) < 6) return;
    drag.moved = true;
    const b = drag.b;
    const svg = bedSvgEl(); if (!svg) return;
    const cell = clientToCell(svg, b, e.clientX, e.clientY);
    if (!cell) return;
    const pl = (b.plantings || []).find((x) => x.id === drag.id); if (!pl) return;
    const off = bedOffset(b);
    if (drag.mode === "resize") {
      let w = Math.max(1, Math.min(bedCols(b) - drag.origC, cell.c - drag.origC + 1));
      let h = Math.max(1, Math.min(bedRows(b) - drag.origR, cell.r - drag.origR + 1));
      drag.lastW = w; drag.lastH = h;
      drag.valid = footprintClearExcept(b, drag.origC, drag.origR, w, h, drag.id);
      const prev = svg.querySelector("#dragPreview");
      if (prev) {
        prev.setAttribute("x", off + drag.origC + 0.03);
        prev.setAttribute("y", off + drag.origR + 0.03);
        prev.setAttribute("width", w - 0.06);
        prev.setAttribute("height", h - 0.06);
        prev.setAttribute("stroke", drag.valid ? "#2f7d32" : "#c62828");
        prev.setAttribute("visibility", "visible");
      }
      drag.el.setAttribute("opacity", "0.6");
    } else {
      const drop = computeDrop(b, pl, cell.c - drag.grabC, cell.r - drag.grabR);
      drag.lastC = drop.c; drag.lastR = drop.r; drag.valid = drop.valid;
      drag.el.setAttribute("transform", `translate(${drop.c - drag.origC}, ${drop.r - drag.origR})`);
      drag.el.setAttribute("opacity", "0.8");
      const tile = drag.el.querySelector("rect");
      if (tile) tile.setAttribute("stroke", drop.valid ? "#2f7d32" : "#c62828");
    }
    e.preventDefault();
  });
  function endDrag(e) {
    if (!drag || (e.pointerId != null && e.pointerId !== drag.pointerId)) return;
    const d = drag; drag = null;
    try { d.el.releasePointerCapture(e.pointerId); } catch (err) {}
    if (!d.moved) return; // treated as a tap → let the click open the dialog
    suppressClick = true;
    const b = d.b;
    const pl = (b.plantings || []).find((x) => x.id === d.id);
    if (pl && d.valid) {
      if (d.mode === "resize" && (d.lastW !== d.origW || d.lastH !== d.origH)) {
        pl.wCells = d.lastW; pl.hCells = d.lastH; saveBeds();
      } else if (d.mode === "move" && (d.lastC !== d.origC || d.lastR !== d.origR)) {
        pl.col = d.lastC; pl.row = d.lastR; saveBeds();
      }
    }
    renderBedEditor(b);
  }
  bedsRoot.addEventListener("pointerup", endDrag);
  bedsRoot.addEventListener("pointercancel", endDrag);

  function handleBedAct(a) {
    const b = currentBed();
    if (a === "newbed") openBedDialog(null);
    else if (a === "back") { currentBedId = null; bedResizeMode = false; renderBeds(); }
    else if (a === "toggleresize" && b) { bedResizeMode = !bedResizeMode; renderBedEditor(b); }
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

  if (typeof window !== "undefined" && window.__GARDEN_TEST__) {
    window.__gardenTest = { seedTimeline, seedPlan, seedAction, hasIndoorStart, guidePlants, seasonWindow, seasonHarvestFor, seasonHarvest, effectiveInterval, daysUntilWater, climateOf, forecastPeak, climateAlertFor, successionPlanFor, seedlingTiming, seedlingStatus, groupKeyOf, varietyLabel, setWeather: (w) => { weather = w; } };
  }

  render();
  updateBackupBanner();
})();
