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
      harvest: {
        cues: "Pick when firm, uniformly green, and 8–10\" long — before they yellow or bulge. Harvest every 1–2 days to keep vines productive.",
        how: "Snip the stem with pruners rather than tugging, to avoid damaging the vine.",
        storage: "Refrigerate wrapped for up to ~1 week; keep away from ethylene-producing fruit like tomatoes.",
      },
      crop: "Cucumber", latin: "Cucumis sativus",
      sun: "Full sun", spacingIn: 12, rowIn: 36, depthIn: 0.5,
      daysToMaturity: 60, germDays: "7–14", perennial: false,
      climate: { heatF: 92, cat: "tough", humid: true },
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
      harvest: {
        cues: "Ready when the shoulders reach 3/4–1\" across and poke above the soil; flavor sweetens after a light fall frost. Pull as needed once big enough.",
        how: "Loosen the soil with a fork and lift by the crown; twist off the tops after harvest so they don't draw moisture from the roots.",
        storage: "Remove greens, then refrigerate in the crisper for several weeks; they also keep for months in damp sand in a cold cellar.",
      },
      crop: "Carrot", latin: "Daucus carota",
      sun: "Full sun", spacingIn: 2.5, rowIn: 12, depthIn: 0.25,
      daysToMaturity: 75, germDays: "14–28", perennial: false,
      climate: { heatF: 85, cat: "cool", humid: false },
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
      harvest: {
        cues: "Pick when pods are firm, pencil-thick, and snap crisply — before the seeds bulge visibly. The purple pods make them easy to spot.",
        how: "Hold the stem and pull the pod off with your other hand. Harvest every 2–3 days; bush beans set most of their crop over a few weeks.",
        storage: "Refrigerate unwashed for up to ~1 week; blanch and freeze to keep longer.",
      },
      crop: "Bush bean", latin: "Phaseolus vulgaris",
      sun: "Full sun", spacingIn: 4, rowIn: 30, depthIn: 1.25,
      daysToMaturity: 58, germDays: "7–10", perennial: false,
      climate: { heatF: 90, cat: "fruit", humid: true },
      methods: [
        { type: "Direct sow", anchor: "lastFrost", startWk: 0, endWk: 6 },
      ],
      tips: "Purple pods (turn green when cooked) are easy to spot for picking. Needs warm soil (75–85°F) to sprout, so wait until frost danger passes.",
      sources: [ANNIES],
    },
    {
      id: "asparagus-uc72",
      name: "Asparagus UC72",
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
    },
    good: [
      ["tomato", "allium"], ["tomato", "carrot"], ["tomato", "asparagus"],
      ["allium", "carrot"], ["allium", "asparagus"], ["allium", "tomato"],
      ["bean", "carrot"], ["bean", "cucumber"], ["bean", "squash"],
      ["bean", "melon"], ["bean", "pea"], ["pea", "carrot"], ["pea", "cucumber"],
      ["carrot", "cucumber"], ["squash", "melon"],
    ],
    bad: [
      ["allium", "bean"], ["allium", "pea"],
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
    },
  };

  return { ZONE_FROST, PLANTS, COMPANIONS };
})();
