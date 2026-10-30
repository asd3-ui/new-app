export interface LevelConfig {
  id: number;
  nameAr: string;
  nameEn: string;
  theme: {
    bg: string;
    floor: string;
    wallTop: string;
    wallFace: string;
    gridLine: string;
  };
  enemySpeed: number;
  keysCount: number;
}

export const LEVELS: LevelConfig[] = [
  {
    id: 1,
    nameAr: "المرحلة 1: دنجن الظلام",
    nameEn: "Level 1: Dark Dungeon",
    theme: {
      bg: "#080a0f",
      floor: "#121520",
      wallTop: "#262e3d",
      wallFace: "#181d26",
      gridLine: "#1c2230"
    },
    enemySpeed: 1.8,
    keysCount: 3
  },
  {
    id: 2,
    nameAr: "المرحلة 2: التيارات البركانية",
    nameEn: "Level 2: Volcanic Cavern",
    theme: {
      bg: "#120505",
      floor: "#241010",
      wallTop: "#4a1c1c",
      wallFace: "#301010",
      gridLine: "#361818"
    },
    enemySpeed: 2.2,
    keysCount: 4
  },
  {
    id: 3,
    nameAr: "المرحلة 3: القلعة المجمدة",
    nameEn: "Level 3: Frozen Citadel",
    theme: {
      bg: "#050e14",
      floor: "#0f2330",
      wallTop: "#1e4860",
      wallFace: "#123042",
      gridLine: "#18384d"
    },
    enemySpeed: 2.6,
    keysCount: 5
  },
  {
    id: 4,
    nameAr: "المرحلة 4: الغابة السامة",
    nameEn: "Level 4: Toxic Ruins",
    theme: {
      bg: "#051208",
      floor: "#0d2613",
      wallTop: "#1c4a24",
      wallFace: "#123318",
      gridLine: "#163a1c"
    },
    enemySpeed: 3.0,
    keysCount: 5
  }
];
