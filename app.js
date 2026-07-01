// Garden Planner — local-first PWA. All data lives in localStorage on this device.
(function () {
  "use strict";

  const STORAGE_KEY = "garden.plants.v1";
  const MS_PER_DAY = 86400000;

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
  const todayStr = () => new Date().toISOString().slice(0, 10);

  function daysUntilWater(p) {
    if (!p.interval) return null;
    const last = p.lastWatered ? new Date(p.lastWatered) : (p.planted ? new Date(p.planted) : new Date());
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
    const d = new Date(str);
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => (
      { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
    ));
  }

  // --- Rendering ---
  function render() {
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
    const meta = [];
    if (p.location) meta.push(`<span>📍 ${escapeHtml(p.location)}</span>`);
    if (p.sun) meta.push(`<span>☀️ ${escapeHtml(p.sun)}</span>`);
    if (p.planted) meta.push(`<span>🌱 Planted ${fmtDate(p.planted)}</span>`);
    if (p.lastWatered) meta.push(`<span>💧 Watered ${fmtDate(p.lastWatered)}</span>`);
    if (p.interval) meta.push(`<span>🔁 Every ${p.interval}d</span>`);

    return `
      <article class="card ${st.cls}" data-id="${p.id}">
        <div class="card-top">
          <h3>${escapeHtml(p.name)}</h3>
          <span class="badge ${st.badge}">${st.label}</span>
        </div>
        ${meta.length ? `<p class="meta">${meta.join("")}</p>` : ""}
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
        save();
        render();
      }
    }
  });

  // --- Toolbar ---
  document.getElementById("addBtn").addEventListener("click", () => openDialog(null));
  filterEl.addEventListener("change", render);

  // --- Backup: export / import ---
  document.getElementById("exportBtn").addEventListener("click", () => {
    const blob = new Blob([JSON.stringify(plants, null, 2)], { type: "application/json" });
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
        if (!Array.isArray(data)) throw new Error("Not a valid backup file.");
        if (confirm(`Import ${data.length} plant(s)? This replaces your current list.`)) {
          plants = data;
          save();
          render();
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
  };
  const tabs = document.querySelectorAll(".tab");
  const zoneSel = document.getElementById("zone");
  const guideSearch = document.getElementById("guideSearch");
  const guideFilter = document.getElementById("guideFilter");
  const guideListEl = document.getElementById("guideList");
  const guideEmptyEl = document.getElementById("guideEmpty");

  let currentZone = localStorage.getItem(ZONE_KEY) || "";
  if (currentZone) zoneSel.value = currentZone;

  tabs.forEach((t) => t.addEventListener("click", () => switchView(t.dataset.view)));
  function switchView(name) {
    tabs.forEach((t) => t.classList.toggle("active", t.dataset.view === name));
    views.garden.hidden = name !== "garden";
    views.guide.hidden = name !== "guide";
    if (name === "guide") renderGuide();
  }

  zoneSel.addEventListener("change", () => {
    currentZone = zoneSel.value;
    localStorage.setItem(ZONE_KEY, currentZone);
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

  render();
})();
