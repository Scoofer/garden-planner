// Garden guide data: crop planting knowledge + USDA zone frost model.
// Timing is expressed relative to frost dates and computed per selected zone.
// "sources" records provenance so data can be compared across vendors later.
window.GARDEN_DATA = (function () {
  "use strict";

  // Approx last spring frost / first fall frost per USDA zone (month is 1-12, day).
  // General references; adjust to your local microclimate.
  const ZONE_FROST = {
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
      crop: "Watermelon", latin: "Citrullus lanatus",
      sun: "Full sun", spacingIn: 6, rowIn: 48, depthIn: 0.75,
      daysToMaturity: 85, germDays: "5–10", perennial: false,
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
      crop: "Muskmelon", latin: "Cucumis melo",
      sun: "Full sun", spacingIn: 24, rowIn: 72, depthIn: 0.5,
      daysToMaturity: 80, germDays: "4–10", perennial: false,
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
      crop: "Watermelon", latin: "Citrullus lanatus",
      sun: "Full sun", spacingIn: 36, rowIn: 72, depthIn: 0.75,
      daysToMaturity: 90, germDays: "7–10", perennial: false,
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
      crop: "Summer squash", latin: "Cucurbita pepo",
      sun: "Full sun", spacingIn: 6, rowIn: 36, depthIn: 0.5,
      daysToMaturity: 58, germDays: "10–15", perennial: false,
      methods: [
        { type: "Direct sow", anchor: "lastFrost", startWk: 0, endWk: 4 },
      ],
      tips: "Hardy and productive; pick fruit young and often for the best texture and continued yield.",
      sources: [ANNIES],
    },
    {
      id: "china-jade-cucumber",
      name: "China Jade Cucumber",
      crop: "Cucumber", latin: "Cucumis sativus",
      sun: "Full sun", spacingIn: 12, rowIn: 36, depthIn: 0.5,
      daysToMaturity: 60, germDays: "7–14", perennial: false,
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
      crop: "Pea", latin: "Pisum sativum",
      sun: "Full sun", spacingIn: 2, rowIn: 24, depthIn: 1,
      daysToMaturity: 60, germDays: "4–8", perennial: false,
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
      crop: "Carrot", latin: "Daucus carota",
      sun: "Full sun", spacingIn: 2.5, rowIn: 12, depthIn: 0.25,
      daysToMaturity: 75, germDays: "14–28", perennial: false,
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
      crop: "Bush bean", latin: "Phaseolus vulgaris",
      sun: "Full sun", spacingIn: 4, rowIn: 30, depthIn: 1.25,
      daysToMaturity: 58, germDays: "7–10", perennial: false,
      methods: [
        { type: "Direct sow", anchor: "lastFrost", startWk: 0, endWk: 6 },
      ],
      tips: "Purple pods (turn green when cooked) are easy to spot for picking. Needs warm soil (75–85°F) to sprout, so wait until frost danger passes.",
      sources: [ANNIES],
    },
    {
      id: "asparagus-uc72",
      name: "Asparagus UC72",
      crop: "Asparagus", latin: "Asparagus officinalis",
      sun: "Full sun", spacingIn: 18, rowIn: 48, depthIn: 6,
      daysToMaturity: null, germDays: "14–21", perennial: true,
      methods: [
        { type: "Plant crowns / transplant", anchor: "lastFrost", startWk: -2, endWk: 4 },
      ],
      tips: "Perennial — plant once and harvest for years, but be patient: a real harvest comes 2–3 years after planting. Heat/drought tolerant and Fusarium-resistant.",
      sources: [ANNIES],
    },
    {
      id: "green-beans-bush",
      name: "Green Beans (bush)",
      crop: "Bush bean", latin: "Phaseolus vulgaris",
      sun: "Full sun", spacingIn: 4, rowIn: 24, depthIn: 1,
      daysToMaturity: 55, germDays: "7–10", perennial: false,
      methods: [
        { type: "Direct sow", anchor: "lastFrost", startWk: 0, endWk: 6 },
      ],
      tips: "Generic bush green bean guidance. Sow after frost in warm soil; succession-sow every 2–3 weeks for a continuous harvest.",
      sources: [GENERAL],
    },
    {
      id: "carbon-tomato",
      name: "Carbon Tomato",
      crop: "Tomato (indeterminate)", latin: "Solanum lycopersicum",
      sun: "Full sun", spacingIn: 24, rowIn: 36, depthIn: 0.25,
      daysToMaturity: 92, germDays: "7–14", perennial: false,
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
      crop: "Tomato (indeterminate)", latin: "Solanum lycopersicum",
      sun: "Full sun", spacingIn: 24, rowIn: 36, depthIn: 0.25,
      daysToMaturity: 80, germDays: "6–10", perennial: false,
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
      crop: "Tomato (indeterminate)", latin: "Solanum lycopersicum",
      sun: "Full sun", spacingIn: 24, rowIn: 36, depthIn: 0.25,
      daysToMaturity: 70, germDays: "6–14", perennial: false,
      methods: [
        { type: "Start indoors", anchor: "lastFrost", startWk: -6, endWk: -6 },
        { type: "Transplant out", anchor: "lastFrost", startWk: 1, endWk: 3 },
      ],
      tips: "Mix of colorful cherry tomatoes, ~70 days from transplant. Indeterminate — keep picking to encourage more fruit; support the vines.",
      sources: [ANNIES],
    },
  ];

  return { ZONE_FROST, PLANTS };
})();
