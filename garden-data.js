// Garden guide data: crop planting knowledge + USDA zone frost model.
// Timing is expressed relative to frost dates and computed per selected zone.
// "sources" records provenance so data can be compared across vendors later.
window.GARDEN_DATA = (function () {
  "use strict";

  // Approx last spring frost / first fall frost per USDA zone (month 1-12, day).
  // Each full zone is split into 'a' (colder half) and 'b' (warmer half); a half-zone
  // is ~5°F, roughly a one-week shift in frost dates. General references — adjust to
  // your local microclimate.
  const ZONE_MIDPOINTS = {
    "1":  { lastFrost: [6, 15], firstFall: [8, 15] },
    "2":  { lastFrost: [5, 20], firstFall: [9, 10] },
    "3":  { lastFrost: [5, 15], firstFall: [9, 15] },
    "4":  { lastFrost: [5, 10], firstFall: [9, 25] },
    "5":  { lastFrost: [4, 30], firstFall: [10, 10] },
    "6":  { lastFrost: [4, 15], firstFall: [10, 25] },
    "7":  { lastFrost: [4, 1],  firstFall: [11, 5] },
    "8":  { lastFrost: [3, 15], firstFall: [11, 15] },
    "9":  { lastFrost: [2, 15], firstFall: [12, 1] },
    "10": { lastFrost: [1, 31], firstFall: [12, 15] },
    "11": { frostFree: true },
    "12": { frostFree: true },
    "13": { frostFree: true },
  };

  const HALF_SHIFT_DAYS = 7; // ~one week per half-zone
  function shiftMD(md, days) {
    const d = new Date(2025, md[0] - 1, md[1] + days);
    return [d.getMonth() + 1, d.getDate()];
  }
  // Build a/b (and plain-number, for backward compatibility) entries.
  const ZONE_FROST = {};
  Object.keys(ZONE_MIDPOINTS).forEach((z) => {
    const base = ZONE_MIDPOINTS[z];
    ZONE_FROST[z] = base;
    if (base.frostFree) {
      ZONE_FROST[z + "a"] = { frostFree: true };
      ZONE_FROST[z + "b"] = { frostFree: true };
    } else {
      // 'a' = colder: later spring frost, earlier fall frost (shorter season).
      ZONE_FROST[z + "a"] = {
        lastFrost: shiftMD(base.lastFrost, HALF_SHIFT_DAYS),
        firstFall: shiftMD(base.firstFall, -HALF_SHIFT_DAYS),
      };
      // 'b' = warmer: earlier spring frost, later fall frost (longer season).
      ZONE_FROST[z + "b"] = {
        lastFrost: shiftMD(base.lastFrost, -HALF_SHIFT_DAYS),
        firstFall: shiftMD(base.firstFall, HALF_SHIFT_DAYS),
      };
    }
  });

  const ANNIES = {
    name: "Annie's Heirloom Seeds",
    url: "https://anniesheirloomseeds.com/",
    retrieved: "2026-07-01",
  };
  const GENERAL = {
    name: "General horticultural reference",
    url: "",
    retrieved: "2026-07-01",
  };

  // methods: type label + anchor ('lastFrost' or 'firstFall') + week offsets (start/end).
  const PLANTS = [
    {
      id: "sugar-baby-watermelon",
      name: "Sugar Baby Watermelon",
      fertilize: { feeder: "Heavy", tips: "Work compost into the bed before planting. Feed a balanced fertilizer at planting, then switch to a lower-nitrogen, higher-potassium feed once vines flower — too much nitrogen means leafy vines and few melons. Ease off as fruit ripens." },
      harvest: {
        cues: "Ripe when the curly tendril nearest the fruit dries brown, the pale ground spot turns creamy yellow, and a thump sounds deep and hollow.",
        how: "Cut the stem with pruners about an inch from the fruit — watermelons don't ripen further once picked.",
        storage: "Keep whole at cool room temperature up to ~1 week; refrigerate once cut and use within a few days.",
      },
      crop: "Watermelon", latin: "Citrullus lanatus",
      sun: "Full sun", spacingIn: 6, rowIn: 48, depthIn: 0.75,
      daysToMaturity: 85, germDays: "5–10", perennial: false,
      climate: { heatF: 95, cat: "tough", humid: true },
      methods: [
        { type: "Start indoors", anchor: "lastFrost", startWk: -4, endWk: -3 },
        { type: "Direct sow / transplant", anchor: "lastFrost", startWk: 0, endWk: 3 },
      ],
      tips: "Icebox variety, great for smaller spaces and cooler climates. Seedlings dislike root disturbance, so direct sowing is preferred once soil is warm.",
      sources: [ANNIES],
    },
    {
      id: "honey-rock-melon",
      name: "Honey Rock Melon",
      fertilize: { feeder: "Heavy", tips: "Rich, compost-amended soil. Balanced feed at planting; shift to a low-nitrogen, higher-potassium feed at flowering and fruit set for sweeter melons. Avoid excess nitrogen." },
      harvest: {
        cues: "Ready at 'full slip' — the skin netting turns tan, the blossom end smells sweet, and a ripe fruit pulls from the stem with only light pressure.",
        how: "Cradle the melon and gently push where it meets the stem; if ripe it slips off cleanly. Harvest in the morning.",
        storage: "Ripen a day or two on the counter, then refrigerate up to ~5 days.",
      },
      crop: "Muskmelon", latin: "Cucumis melo",
      sun: "Full sun", spacingIn: 24, rowIn: 72, depthIn: 0.5,
      daysToMaturity: 80, germDays: "4–10", perennial: false,
      climate: { heatF: 95, cat: "tough", humid: true },
      methods: [
        { type: "Start indoors", anchor: "lastFrost", startWk: -4, endWk: -3 },
        { type: "Direct sow / transplant", anchor: "lastFrost", startWk: 0, endWk: 3 },
      ],
      tips: "Early, high-yield melon suited to cooler climates. Traditionally grown in hills of a few plants; keep soil warm and consistently moist.",
      sources: [ANNIES],
    },
    {
      id: "stone-mountain-watermelon",
      name: "Stone Mountain Watermelon",
      fertilize: { feeder: "Heavy", tips: "Compost-rich bed. Balanced feed at planting, then a lower-nitrogen, higher-potassium feed once vines run and flower. Too much nitrogen gives vines instead of fruit; ease off as melons ripen." },
      harvest: {
        cues: "Ripe when the tendril nearest the fruit dries, the ground spot turns buttery yellow, and it gives a deep, hollow thump.",
        how: "Cut from the vine with pruners, leaving a short stub; it won't sweeten further after picking.",
        storage: "Store whole at cool room temperature up to ~2 weeks; refrigerate once cut.",
      },
      crop: "Watermelon", latin: "Citrullus lanatus",
      sun: "Full sun", spacingIn: 36, rowIn: 72, depthIn: 0.75,
      daysToMaturity: 90, germDays: "7–10", perennial: false,
      climate: { heatF: 95, cat: "tough", humid: true },
      methods: [
        { type: "Start indoors", anchor: "lastFrost", startWk: -4, endWk: -3 },
        { type: "Direct sow / transplant", anchor: "lastFrost", startWk: 0, endWk: 3 },
      ],
      tips: "Large, sweet heirloom watermelon. Needs a long, warm season. (Not listed on Annie's at time of entry — verify timing against your seed source.)",
      sources: [GENERAL],
    },
    {
      id: "black-beauty-zucchini",
      name: "Black Beauty Zucchini",
      fertilize: { feeder: "Heavy", tips: "Dig in plenty of compost at planting. Feed a balanced fertilizer every 3–4 weeks through the season — pale leaves signal they want more. Steady feeding keeps fruit coming." },
      harvest: {
        cues: "Best picked young at 6–8\" long while the skin is glossy and a thumbnail dents it easily. Check plants daily in peak season — fruit grows fast.",
        how: "Cut the stem with a knife or pruners; frequent picking keeps the plant setting new fruit.",
        storage: "Refrigerate unwashed in the crisper for up to ~1 week.",
      },
      crop: "Summer squash", latin: "Cucurbita pepo",
      sun: "Full sun", spacingIn: 6, rowIn: 36, depthIn: 0.5,
      daysToMaturity: 58, germDays: "10–15", perennial: false,
      climate: { heatF: 95, cat: "tough", humid: true },
      methods: [
        { type: "Direct sow", anchor: "lastFrost", startWk: 0, endWk: 4 },
      ],
      tips: "Hardy and productive; pick fruit young and often for the best texture and continued yield.",
      sources: [ANNIES],
    },
    {
      id: "china-jade-cucumber",
      name: "China Jade Cucumber",
      fertilize: { feeder: "Heavy", tips: "Compost-rich soil. Balanced feed at planting, then liquid-feed or side-dress every 3–4 weeks. Cut back nitrogen once flowering so plants set fruit instead of running to vine." },
      harvest: {
        cues: "Pick when firm, uniformly green, and 8–10\" long — before they yellow or bulge. Harvest every 1–2 days to keep vines productive.",
        how: "Snip the stem with pruners rather than tugging, to avoid damaging the vine.",
        storage: "Refrigerate wrapped for up to ~1 week; keep away from ethylene-producing fruit like tomatoes.",
      },
      crop: "Cucumber", latin: "Cucumis sativus",
      sun: "Full sun", spacingIn: 12, rowIn: 36, depthIn: 0.5,
      daysToMaturity: 60, germDays: "7–14", perennial: false,
      climate: { heatF: 92, cat: "tough", humid: true },
      succession: { intervalDays: 28, sowAnchor: "lastFrost", sowStartWk: 0, frostTolDays: 0, note: "A fresh planting every few weeks steps in as older vines slow down or get hit by mildew, stretching your harvest into fall. In a small garden, even one follow-up sowing keeps cucumbers coming." },
      methods: [
        { type: "Start indoors", anchor: "lastFrost", startWk: -3, endWk: -2 },
        { type: "Direct sow / transplant", anchor: "lastFrost", startWk: 0, endWk: 4 },
      ],
      tips: "Long, tender-skinned Asian cucumber. Harvest frequently to keep plants producing. Trellising keeps the long fruit straight.",
      sources: [ANNIES],
    },
    {
      id: "early-frosty-pea",
      name: "Early Frosty Pea",
      fertilize: { feeder: "Light", tips: "Peas fix their own nitrogen, so skip high-nitrogen feeds (they give leaves, not pods). A little compost or a low-N, higher-P/K feed is plenty; a legume inoculant at sowing helps on new ground." },
      harvest: {
        cues: "Harvest when pods are plump, bright green, and rounded with peas but before they turn waxy or dull. Pick from the bottom of the plant upward.",
        how: "Hold the vine with one hand and pull the pod with the other to avoid tearing the plant. Pick often — sugars turn to starch quickly.",
        storage: "Refrigerate right away and eat within a few days; blanch and freeze for longer storage.",
      },
      crop: "Pea", latin: "Pisum sativum",
      sun: "Full sun", spacingIn: 2, rowIn: 24, depthIn: 1,
      daysToMaturity: 60, germDays: "4–8", perennial: false,
      climate: { heatF: 80, cat: "cool", humid: true },
      methods: [
        { type: "Direct sow (spring)", anchor: "lastFrost", startWk: -6, endWk: 0 },
        { type: "Direct sow (fall)", anchor: "firstFall", startWk: -9, endWk: -7 },
      ],
      tips: "Cold-hardy — one of the first things you can plant. Sow as soon as soil can be worked. Provide support for the 25–30\" vines.",
      sources: [ANNIES],
    },
    {
      id: "rainbow-carrot-mix",
      name: "Annie's Rainbow Carrot Mix",
      fertilize: { feeder: "Light", tips: "Avoid fresh manure and high nitrogen, which cause forked, hairy roots. Work a low-nitrogen fertilizer higher in phosphorus and potassium into the bed before sowing; usually no further feeding needed." },
      harvest: {
        cues: "Ready when the shoulders reach 3/4–1\" across and poke above the soil; flavor sweetens after a light fall frost. Pull as needed once big enough.",
        how: "Loosen the soil with a fork and lift by the crown; twist off the tops after harvest so they don't draw moisture from the roots.",
        storage: "Remove greens, then refrigerate in the crisper for several weeks; they also keep for months in damp sand in a cold cellar.",
      },
      crop: "Carrot", latin: "Daucus carota",
      sun: "Full sun", spacingIn: 2.5, rowIn: 12, depthIn: 0.25,
      daysToMaturity: 75, germDays: "14–28", perennial: false,
      climate: { heatF: 85, cat: "cool", humid: false },
      succession: { intervalDays: 21, sowAnchor: "lastFrost", sowStartWk: -4, frostTolDays: 21, note: "Carrots hold well in the ground, so sow a short row every few weeks for a steady supply rather than one big crop that matures all at once. The last sowings sweeten after fall frosts and store for months." },
      methods: [
        { type: "Direct sow (spring)", anchor: "lastFrost", startWk: -4, endWk: 2 },
        { type: "Direct sow (fall)", anchor: "firstFall", startWk: -11, endWk: -8 },
      ],
      tips: "Blend of five colors. Sow directly (carrots dislike transplanting), keep soil evenly moist during the long germination, and thin to prevent crowding.",
      sources: [ANNIES],
    },
    {
      id: "royal-burgundy-bush-bean",
      name: "Royal Burgundy Bush Bean",
      fertilize: { feeder: "Light", tips: "Beans fix their own nitrogen. Skip high-N feeds; compost or a balanced low-nitrogen fertilizer at planting is enough. Excess nitrogen means foliage over pods." },
      harvest: {
        cues: "Pick when pods are firm, pencil-thick, and snap crisply — before the seeds bulge visibly. The purple pods make them easy to spot.",
        how: "Hold the stem and pull the pod off with your other hand. Harvest every 2–3 days; bush beans set most of their crop over a few weeks.",
        storage: "Refrigerate unwashed for up to ~1 week; blanch and freeze to keep longer.",
      },
      crop: "Bush bean", latin: "Phaseolus vulgaris",
      sun: "Full sun", spacingIn: 4, rowIn: 30, depthIn: 1.25,
      daysToMaturity: 58, germDays: "7–10", perennial: false,
      climate: { heatF: 90, cat: "fruit", humid: true },
      succession: { intervalDays: 14, sowAnchor: "lastFrost", sowStartWk: 0, frostTolDays: 0, note: "Bush beans crop heavily for a couple of weeks and then fade — sow a new short row every 2 weeks to keep fresh, tender beans coming right up until the first fall frost." },
      methods: [
        { type: "Direct sow", anchor: "lastFrost", startWk: 0, endWk: 6 },
      ],
      tips: "Purple pods (turn green when cooked) are easy to spot for picking. Needs warm soil (75–85°F) to sprout, so wait until frost danger passes.",
      sources: [ANNIES],
    },
    {
      id: "asparagus-uc72",
      name: "Asparagus UC72",
      fertilize: { feeder: "Heavy", tips: "Feed this perennial bed twice a year — in early spring as spears emerge, and again after the harvest window when ferns are growing. Top-dress with compost annually and keep the bed weed-free." },
      harvest: {
        cues: "Don't harvest the first 2 seasons — let the ferns build the crown. From year 3, cut spears when 6–9\" tall with tips still tight, over a 4–8 week spring window.",
        how: "Snap spears at ground level or cut just below the soil. Stop once most new spears come up pencil-thin, and let the rest fern out to feed the crown.",
        storage: "Stand cut ends in a little water or wrap in a damp towel and refrigerate; use within a few days.",
      },
      crop: "Asparagus", latin: "Asparagus officinalis",
      sun: "Full sun", spacingIn: 18, rowIn: 48, depthIn: 6,
      daysToMaturity: null, germDays: "14–21", perennial: true,
      climate: { heatF: 95, cat: "tough", humid: false },
      harvestSeason: { anchor: "lastFrost", startWk: -1, endWk: 6, establishYears: 2 },
      methods: [
        { type: "Plant crowns / transplant", anchor: "lastFrost", startWk: -2, endWk: 4 },
      ],
      tips: "Perennial — plant once and harvest for years, but be patient: a real harvest comes 2–3 years after planting. Heat/drought tolerant and Fusarium-resistant.",
      sources: [ANNIES],
    },
    {
      id: "green-beans-pole",
      name: "Green Beans (pole)",
      fertilize: { feeder: "Light", tips: "A legume that fixes its own nitrogen, so go easy on N feeds (they delay flowering). Compost or a balanced low-nitrogen feed at planting; these long-season climbers appreciate a light mid-season feed." },
      harvest: {
        cues: "Pick when pods are firm and pencil-thick but before the seeds swell and the pod gets lumpy or tough.",
        how: "Pull pods off gently with two hands to avoid snapping the vine. Pole beans crop over a long season — pick every 2–3 days to keep them going.",
        storage: "Refrigerate unwashed for up to ~1 week; blanch and freeze for months.",
      },
      crop: "Pole bean", latin: "Phaseolus vulgaris",
      sun: "Full sun", spacingIn: 4, rowIn: 36, depthIn: 1,
      daysToMaturity: 65, germDays: "7–10", perennial: false,
      climate: { heatF: 90, cat: "fruit", humid: true },
      methods: [
        { type: "Direct sow", anchor: "lastFrost", startWk: 0, endWk: 4 },
      ],
      tips: "Vining/pole green bean — needs a trellis, teepee, or fence to climb (6–8' vines). Sow after frost in warm soil at the base of the support. Unlike bush beans, pole beans keep producing over a long season, so pick regularly to keep them going.",
      sources: [GENERAL],
    },
    {
      id: "carbon-tomato",
      name: "Carbon Tomato",
      fertilize: { feeder: "Heavy", tips: "Plant into compost-rich soil. Feed at transplant, then every 2–3 weeks once fruit sets, using a lower-nitrogen, higher-phosphorus/potassium tomato feed — too much nitrogen gives leafy plants and few tomatoes. Steady water + feeding helps prevent blossom-end rot." },
      harvest: {
        cues: "Ripe when the fruit colors up fully to its dusky purple-red and yields slightly to gentle pressure. Vine-ripening gives the best flavor.",
        how: "Gently twist or snip at the stem, keeping the green calyx attached. Pick every couple of days once ripening starts.",
        storage: "Keep at room temperature out of direct sun — never refrigerate, which ruins flavor and texture.",
      },
      crop: "Tomato (indeterminate)", latin: "Solanum lycopersicum",
      sun: "Full sun", spacingIn: 24, rowIn: 36, depthIn: 0.25,
      daysToMaturity: 92, germDays: "7–14", perennial: false,
      climate: { heatF: 92, cat: "fruit", humid: true },
      methods: [
        { type: "Start indoors", anchor: "lastFrost", startWk: -6, endWk: -6 },
        { type: "Transplant out", anchor: "lastFrost", startWk: 1, endWk: 3 },
      ],
      tips: "Black beefsteak heirloom, crack-resistant, 10–15 oz fruit. Vigorous 5–7' indeterminate vines — provide sturdy staging/cages. Warm soil (75–85°F) needed to germinate.",
      sources: [ANNIES],
    },
    {
      id: "virginia-sweets-tomato",
      name: "Virginia Sweets Tomato",
      fertilize: { feeder: "Heavy", tips: "Rich, compost-amended soil. Feed at transplant, then every 2–3 weeks after fruit sets with a lower-nitrogen, higher-potassium tomato feed. Consistent watering and feeding wards off blossom-end rot." },
      harvest: {
        cues: "Ripe when the golden fruit takes on its scarlet blush and yields slightly to a gentle squeeze.",
        how: "Twist or snip from the vine with the calyx attached; harvest regularly as fruit ripens.",
        storage: "Store on the counter stem-side down, out of the fridge; use ripe fruit within a few days.",
      },
      crop: "Tomato (indeterminate)", latin: "Solanum lycopersicum",
      sun: "Full sun", spacingIn: 24, rowIn: 36, depthIn: 0.25,
      daysToMaturity: 80, germDays: "6–10", perennial: false,
      climate: { heatF: 92, cat: "fruit", humid: true },
      methods: [
        { type: "Start indoors", anchor: "lastFrost", startWk: -6, endWk: -6 },
        { type: "Transplant out", anchor: "lastFrost", startWk: 1, endWk: 3 },
      ],
      tips: "Golden beefsteak with scarlet striping, up to a pound. Tall 6–8' indeterminate plants need strong support. Start indoors with bottom heat.",
      sources: [ANNIES],
    },
    {
      id: "cherry-tomato",
      name: "Cherry Tomato (Annie's Mix)",
      fertilize: { feeder: "Heavy", tips: "Compost-rich soil. Feed at transplant and every 2–3 weeks once fruiting, with a lower-nitrogen, higher-potassium tomato feed. Don't overdo nitrogen or you'll get lush vines and fewer tomatoes." },
      harvest: {
        cues: "Pick when fully colored and firm-but-giving; taste one — cherries are sweetest dead ripe. They can split if left too long or after heavy rain.",
        how: "Pinch or snip individual fruit, or harvest a whole truss when most are ripe. Pick every 1–2 days at peak.",
        storage: "Keep at room temperature; refrigerate only to slow down over-ripe fruit.",
      },
      crop: "Tomato (indeterminate)", latin: "Solanum lycopersicum",
      sun: "Full sun", spacingIn: 24, rowIn: 36, depthIn: 0.25,
      daysToMaturity: 70, germDays: "6–14", perennial: false,
      climate: { heatF: 92, cat: "fruit", humid: true },
      methods: [
        { type: "Start indoors", anchor: "lastFrost", startWk: -6, endWk: -6 },
        { type: "Transplant out", anchor: "lastFrost", startWk: 1, endWk: 3 },
      ],
      tips: "Mix of colorful cherry tomatoes, ~70 days from transplant. Indeterminate — keep picking to encourage more fruit; support the vines.",
      sources: [ANNIES],
    },
    {
      id: "garlic",
      name: "Garlic",
      fertilize: { feeder: "Moderate", tips: "Mix compost and a balanced fertilizer into the bed at fall planting. Side-dress with nitrogen in early spring as growth resumes, then again a few weeks later; stop feeding once bulbing begins (around when scapes appear) so energy goes to the bulb." },
      harvest: {
        cues: "Harvest mid-summer when the lower 3–4 leaves have browned but 5–6 upper leaves are still green (each green leaf is a wrapper layer around the bulb).",
        how: "Loosen the soil with a fork and lift gently — don't pull by the stalk. On hardnecks, snap off the curling flower scapes a few weeks earlier to boost bulb size.",
        storage: "Cure whole plants in a warm, dry, airy spot out of sun for 2–4 weeks, then trim; store cured bulbs cool and dry for months.",
      },
      crop: "Garlic", latin: "Allium sativum",
      sun: "Full sun", spacingIn: 5, rowIn: 12, depthIn: 2,
      daysToMaturity: 240, perennial: false,
      climate: { heatF: 90, cat: "tough", humid: false },
      methods: [
        { type: "Plant cloves (fall)", anchor: "firstFall", startWk: -2, endWk: 4 },
      ],
      tips: "Plant individual cloves in fall, pointy end up, ~2\" deep, and mulch heavily for winter. Roots establish before the ground freezes, then bulbs size up the following summer — harvest when the lower leaves brown (usually mid-summer). Hardneck types (e.g. 'Music', 'Chesnok Red') are the most cold-hardy and best for colder zones; softneck types (e.g. 'Inchelium Red') store longer. Snap off flower scapes on hardnecks to boost bulb size.",
      sources: [ANNIES],
    },
    {
      id: "waltham-29-broccoli",
      name: "Waltham 29 Broccoli",
      fertilize: { feeder: "Heavy", tips: "Broccoli is a heavy feeder — dig plenty of compost or aged manure into the bed before planting. Side-dress with a balanced or slightly nitrogen-rich feed about 3 weeks after transplanting, then again as heads begin to form. Steady moisture plus feeding gives large, tight heads." },
      harvest: {
        cues: "Cut the central head while the buds are still tight, firm, and deep blue-green — before any yellow flowers open. Heads mature fast in warm weather, so check daily as they size up (this variety makes tight 4–8\" heads).",
        how: "Cut the main head with 5–6\" of stalk at a slant so water sheds off. Leave the plant in — it keeps pushing out smaller side shoots for weeks of extra picking.",
        storage: "Refrigerate unwashed in a loose bag for up to ~1 week; blanch and freeze for longer storage.",
      },
      crop: "Broccoli", latin: "Brassica oleracea",
      sun: "Full sun", spacingIn: 18, rowIn: 24, depthIn: 0.5,
      daysToMaturity: 80, germDays: "5–10", perennial: false,
      climate: { heatF: 80, cat: "cool", humid: false },
      methods: [
        { type: "Start indoors", anchor: "lastFrost", startWk: -6, endWk: -5 },
        { type: "Transplant out", anchor: "lastFrost", startWk: -2, endWk: 1 },
        { type: "Start indoors (fall)", anchor: "firstFall", startWk: -16, endWk: -14 },
        { type: "Transplant out (fall)", anchor: "firstFall", startWk: -12, endWk: -10 },
      ],
      tips: "Cold-hardy 1950s heirloom from the Univ. of Massachusetts. Compact 20–24\" plants form tight blue-green heads, then generous side shoots. Especially good for fall — flavor sweetens after a light frost. Keep well-watered and mulched so plants don't bolt in heat.",
      sources: [ANNIES],
    },
    {
      id: "de-cicco-broccoli",
      name: "De Cicco Broccoli",
      fertilize: { feeder: "Heavy", tips: "A hungry brassica — work compost or aged manure into the bed, then side-dress with a balanced or nitrogen-rich feed ~3 weeks after transplanting and again as heads form. Consistent water and feeding keep the side shoots coming." },
      harvest: {
        cues: "Cut the central head while buds are tight and green — it's a smaller 3–4\" main head, so don't wait for it to get large. After that, keep cutting the many side shoots before they flower.",
        how: "Cut the main head with a few inches of stalk, then harvest side shoots every few days — this variety is prized for prolific cut-and-come-again picking over a long window.",
        storage: "Refrigerate unwashed in a loose bag for up to ~1 week; blanch and freeze to keep longer.",
      },
      crop: "Broccoli", latin: "Brassica oleracea",
      sun: "Full sun", spacingIn: 18, rowIn: 24, depthIn: 0.5,
      daysToMaturity: 60, germDays: "5–10", perennial: false,
      climate: { heatF: 80, cat: "cool", humid: false },
      methods: [
        { type: "Start indoors", anchor: "lastFrost", startWk: -6, endWk: -5 },
        { type: "Transplant out", anchor: "lastFrost", startWk: -2, endWk: 1 },
        { type: "Start indoors (fall)", anchor: "firstFall", startWk: -14, endWk: -12 },
        { type: "Transplant out (fall)", anchor: "firstFall", startWk: -10, endWk: -8 },
      ],
      tips: "Early, productive Italian heirloom (1890). Smaller main head but throws side shoots prolifically over a long period — its uneven, extended maturity makes it ideal for the home garden. Great for both spring and fall; mulch and water steadily to delay bolting.",
      sources: [ANNIES],
    },
  ];

  // Companion planting: relationships between crop "groups" (not individual
  // varieties). Each planting maps to a group via its crop; adjacent plantings
  // are checked against these lists. Based on widely-cited companion guides.
  const COMPANIONS = {
    // group key -> matching keywords found in a plant's crop/name (lowercased)
    groups: {
      tomato: ["tomato"],
      allium: ["garlic", "onion", "shallot", "leek", "chive"],
      carrot: ["carrot"],
      bean: ["bean"],
      pea: ["pea"],
      cucumber: ["cucumber"],
      squash: ["squash", "zucchini", "pumpkin", "gourd"],
      melon: ["melon", "watermelon", "muskmelon", "cantaloupe"],
      asparagus: ["asparagus"],
      brassica: ["broccoli", "cabbage", "cauliflower", "kale", "brussels", "collard", "brassica"],
    },
    good: [
      ["tomato", "allium"], ["tomato", "carrot"], ["tomato", "asparagus"],
      ["allium", "carrot"], ["allium", "asparagus"], ["allium", "tomato"],
      ["bean", "carrot"], ["bean", "cucumber"], ["bean", "squash"],
      ["bean", "melon"], ["bean", "pea"], ["pea", "carrot"], ["pea", "cucumber"],
      ["carrot", "cucumber"], ["squash", "melon"],
      ["brassica", "allium"], ["brassica", "bean"], ["brassica", "pea"], ["brassica", "carrot"],
    ],
    bad: [
      ["allium", "bean"], ["allium", "pea"],
      ["brassica", "tomato"],
    ],
    reasons: {
      "allium|bean": "Onions & garlic can stunt beans",
      "allium|pea": "Onions & garlic can stunt peas",
      "tomato|allium": "Alliums help repel tomato pests",
      "tomato|carrot": "Classic pairing — grow well together",
      "tomato|asparagus": "Each repels the other's pests",
      "allium|carrot": "Alliums deter carrot fly",
      "allium|asparagus": "Garlic repels asparagus beetle",
      "bean|carrot": "Beans fix nitrogen carrots use",
      "bean|cucumber": "Mutually beneficial",
      "bean|squash": "Three-sisters style pairing",
      "bean|melon": "Beans enrich soil for melons",
      "bean|pea": "Both legumes — grow well together",
      "pea|carrot": "Peas fix nitrogen carrots use",
      "pea|cucumber": "Mutually beneficial",
      "carrot|cucumber": "Grow well together",
      "squash|melon": "Similar needs — compatible",
      "brassica|allium": "Alliums deter cabbage worms & aphids",
      "brassica|bean": "Beans fix nitrogen for heavy-feeding brassicas",
      "brassica|pea": "Peas fix nitrogen brassicas use",
      "brassica|carrot": "Grow well together",
      "brassica|tomato": "Both heavy feeders — compete for nutrients",
    },
  };

  return { ZONE_FROST, PLANTS, COMPANIONS };
})();
