
const DEFAULT_AREAL_DENSITY = 0.0016; // weight per unit area when a shape omits `weight`
const DEFAULT_CAM_ELEV = 0.3;         // default camera elevation in radians (~17 deg above)
let camElev = DEFAULT_CAM_ELEV;       // live camera elevation controlled by right-hand slider
const SF_FAIL = 1.5;                  // ERROR below this safety factor on any strength check (WARN below the design factor)
const EDGE_EPS_MM = 0.1;              // a hole within this distance of the cut edge counts as ON the edge

/* ---------------- material catalogs & presets ---------------- */
const MATERIAL_PRESETS = {
  shapes: {
    balsa: {
      grades: {
        soft:   { densityKgM3: 100, E_L_MPa: 2100, E_T_MPa: 35, sigmaBendMPa: 11.0, tauShearMPa: 1.2 },
        medium: { densityKgM3: 160, E_L_MPa: 3400, E_T_MPa: 55, sigmaBendMPa: 18.0, tauShearMPa: 2.0 },
        hard:   { densityKgM3: 220, E_L_MPa: 4800, E_T_MPa: 80, sigmaBendMPa: 25.0, tauShearMPa: 2.8 }
      }
    },
    basswood: {
      grades: {
        medium: { densityKgM3: 415, E_L_MPa: 9500, E_T_MPa: 380, sigmaBendMPa: 55.0, tauShearMPa: 6.5 }
      }
    },
    birch_ply: {
      grades: {
        medium: { densityKgM3: 680, E_L_MPa: 11000, E_T_MPa: 9000, sigmaBendMPa: 75.0, tauShearMPa: 12.0 }
      }
    }
  },
  glues: {
    pva:   { name: 'PVA / Aliphatic Wood Glue', arealGPerM2: 35, creepFactor: 1.0, stiffnessBoost: 1.1 },
    ca:    { name: 'Cyanoacrylate (CA)',        arealGPerM2: 20, creepFactor: 0.9, stiffnessBoost: 1.05 },
    epoxy: { name: 'Laminating Epoxy',          arealGPerM2: 60, creepFactor: 0.7, stiffnessBoost: 1.25 }
  },
  rods: {
    pine: {
      name: 'Pine Round Rod',
      densityKgM3: 500,
      E_MPa: 9000,
      morMPa: 60
    },
    oak: {
      name: 'Oak Round Rod',
      densityKgM3: 750,
      E_MPa: 12500,
      morMPa: 95
    },
    // Lightest common wood dowels: best stiffness per gram of the woods.
    spruce: {
      name: 'Spruce Round Rod',
      densityKgM3: 400,
      E_MPa: 10800,
      morMPa: 70
    },
    basswood: {
      name: 'Basswood Round Rod',
      densityKgM3: 415,
      E_MPa: 9500,
      morMPa: 55
    },
    birch: {
      name: 'Birch / Beech Hardwood Round Rod',
      densityKgM3: 650,
      E_MPa: 13500,
      morMPa: 105
    },
    bamboo: {
      name: 'Bamboo Round Rod',
      densityKgM3: 700,
      E_MPa: 12000,
      morMPa: 100
    },
    // Non-wood rods. grooveable:false -> default grooveDepthMm is 0 (tie with a CA-glued bead or wrap).
    carbon_fiber: {
      name: 'Carbon-Fibre Round Rod (pultruded, solid)',
      densityKgM3: 1550,
      E_MPa: 125000,
      morMPa: 1200,
      grooveable: false
    },
    fiberglass: {
      name: 'Fibreglass Round Rod (pultruded, solid)',
      densityKgM3: 1900,
      E_MPa: 40000,
      morMPa: 800,
      grooveable: false
    },
    aluminum: {
      name: 'Aluminium 6061-T6 Round Rod',
      densityKgM3: 2700,
      E_MPa: 69000,
      morMPa: 275,       // yield strength (ductile), used where wood uses MOR
      grooveable: false
    }
  },
  threads: {
    cotton_glace: {
      name: 'Glacé Mercerized Cotton Thread',
      transparent: false,
      densityKgM3: 1520,
      tensileMPa: 420,
      E_MPa: 7500,
      knotEfficiency: 0.75,
      memoryStiffness: 0.15 // low coil memory
    },
    linen_waxed: {
      name: 'Waxed Linen Thread',
      transparent: false,
      densityKgM3: 1500,
      tensileMPa: 580,
      E_MPa: 14000,
      knotEfficiency: 0.80,
      memoryStiffness: 0.25
    },
    silk_buttonhole: {
      name: 'Twisted Silk Buttonhole Thread',
      transparent: false,
      densityKgM3: 1340,
      tensileMPa: 500,
      E_MPa: 8500,
      knotEfficiency: 0.72,
      memoryStiffness: 0.08 // extremely supple
    },
    polyester_bonded: {
      name: 'Bonded Polyester Thread',
      transparent: false,
      densityKgM3: 1380,
      tensileMPa: 620,
      E_MPa: 10500,
      knotEfficiency: 0.74,
      memoryStiffness: 0.20
    },
    braided_spectra: {
      name: 'Micro-Braided UHMWPE (Spectra/Dyneema)',
      transparent: false,
      densityKgM3: 970,
      tensileMPa: 2400,
      E_MPa: 75000,
      knotEfficiency: 0.55,
      memoryStiffness: 0.05
    },
    nylon_monofilament: {
      name: 'Clear Nylon Monofilament',
      transparent: true,
      densityKgM3: 1140,
      tensileMPa: 520,
      E_MPa: 2600,
      knotEfficiency: 0.65, // requires clinch/blood knot; slips easily
      memoryStiffness: 1.00 // high spool coil memory on light loads
    },
    fluorocarbon_mono: {
      name: 'Clear Fluorocarbon (PVDF) Monofilament',
      transparent: true,
      densityKgM3: 1780,
      tensileMPa: 480,
      E_MPa: 3200,
      knotEfficiency: 0.62,
      memoryStiffness: 1.15
    },
    copolymer_clear: {
      name: 'Clear Low-Memory Copolymer Monofilament',
      transparent: true,
      densityKgM3: 1160,
      tensileMPa: 560,
      E_MPa: 2900,
      knotEfficiency: 0.68,
      memoryStiffness: 0.65
    }
  }
};

