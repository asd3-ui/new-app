export const GRID_WIDTH = 21;
export const GRID_HEIGHT = 21;

export interface DynamicLevelTheme {
  nameAr: string;
  nameEn: string;
  bg: string;
  floor: string;
  floorAlt: string;
  wallTop: string;
  wallFace: string;
  wallEdge: string;
  gridLine: string;
  accent: string;
  glow: string;
  detail: string;
}

export interface DynamicLevelConfig {
  id: number;
  nameAr: string;
  nameEn: string;
  gridWidth: number;
  gridHeight: number;
  theme: DynamicLevelTheme;
  enemySpeed: number;
  keysCount: number;
  mazeOpenings: number;
}

function generateProceduralTheme(levelId: number): DynamicLevelTheme {
  const biomes: DynamicLevelTheme[] = [
    { nameAr: 'غابة الزمرد', nameEn: 'Emerald Wilds', bg: '#07110d', floor: '#172c20', floorAlt: '#1c3526', wallTop: '#385441', wallFace: '#1d3025', wallEdge: '#91a76a', gridLine: '#2c4532', accent: '#a3e635', glow: '#65a30d', detail: '#7c9a5a' },
    { nameAr: 'سرداب الرماد', nameEn: 'Ashen Catacombs', bg: '#160a08', floor: '#30201b', floorAlt: '#39231c', wallTop: '#644035', wallFace: '#37231e', wallEdge: '#bd7950', gridLine: '#4a3027', accent: '#fb7845', glow: '#bd351e', detail: '#b56a49' },
    { nameAr: 'الحصن الجليدي', nameEn: 'Frostbound Keep', bg: '#07111b', floor: '#142837', floorAlt: '#193242', wallTop: '#376078', wallFace: '#1d394a', wallEdge: '#8dcce0', gridLine: '#2a4859', accent: '#7dd3fc', glow: '#0284c7', detail: '#9bd9e9' },
    { nameAr: 'المعبد الغارق', nameEn: 'Sunken Temple', bg: '#071613', floor: '#17312c', floorAlt: '#1b3932', wallTop: '#3e7160', wallFace: '#21463c', wallEdge: '#d2b875', gridLine: '#31554a', accent: '#5eead4', glow: '#0f766e', detail: '#b2aa76' },
    { nameAr: 'مناجم البلور', nameEn: 'Crystal Mines', bg: '#12091b', floor: '#281a35', floorAlt: '#30203e', wallTop: '#5a4271', wallFace: '#332541', wallEdge: '#c4a4e8', gridLine: '#48345b', accent: '#d8b4fe', glow: '#9333ea', detail: '#a988c4' },
    { nameAr: 'مقبرة العظام', nameEn: 'Bone Crypt', bg: '#11120f', floor: '#292b24', floorAlt: '#303229', wallTop: '#5a5a47', wallFace: '#37372d', wallEdge: '#c9c29a', gridLine: '#44463a', accent: '#e7e0bd', glow: '#a3a078', detail: '#b8b49a' },
    { nameAr: 'متاهة الكثبان', nameEn: 'Dune Labyrinth', bg: '#1a1007', floor: '#3a2c1a', floorAlt: '#45331c', wallTop: '#80613a', wallFace: '#503a22', wallEdge: '#e5bd74', gridLine: '#5b452a', accent: '#fbbf24', glow: '#d97706', detail: '#d7ae69' },
    { nameAr: 'قلعة العدم', nameEn: 'Void Citadel', bg: '#080b1c', floor: '#1b203b', floorAlt: '#222747', wallTop: '#414d7e', wallFace: '#262d50', wallEdge: '#929ff0', gridLine: '#323a63', accent: '#a5b4fc', glow: '#4f46e5', detail: '#818cc8' },
  ];
  return biomes[(Math.max(1, levelId) - 1) % biomes.length];
}

export function getDynamicLevelConfig(levelId: number): DynamicLevelConfig {
  const safeLevel = Math.max(1, Math.floor(levelId));
  const size = Math.min(81, 21 + Math.floor((safeLevel - 1) / 3) * 4);
  const theme = generateProceduralTheme(safeLevel);
  const keysCount = Math.min(12, 3 + Math.floor((safeLevel - 1) / 3));
  const enemySpeed = Number((1.8 + Math.min(safeLevel * 0.12, 2.7)).toFixed(2));

  return {
    id: safeLevel,
    nameAr: `المرحلة ${safeLevel}: ${theme.nameAr}`,
    nameEn: `Level ${safeLevel}: ${theme.nameEn}`,
    gridWidth: size,
    gridHeight: size,
    theme,
    enemySpeed,
    keysCount,
    mazeOpenings: 0.08 + ((safeLevel - 1) % 5) * 0.035,
  };
}

export class DungeonMaze {
  width: number;
  height: number;
  grid: number[][];
  player_spawn: [number, number] = [1.5, 1.5];
  enemy_spawn: [number, number] = [18.5, 18.5];
  exit_pos: [number, number] = [18.5, 1.5];
  key_positions: [number, number][] = [];

  constructor(width: number = GRID_WIDTH, height: number = GRID_HEIGHT, keysCount: number = 3, mazeOpenings = 0.16) {
    this.width = width % 2 === 0 ? width + 1 : width;
    this.height = height % 2 === 0 ? height + 1 : height;
    this.grid = Array.from({ length: this.height }, () => Array(this.width).fill(1));
    this._carveMaze(keysCount, mazeOpenings);
  }

  private _carveMaze(keysCount: number, mazeOpenings: number): void {
    const start_x = 1;
    const start_y = 1;
    this.grid[start_y][start_x] = 0;
    const stack: [number, number][] = [[start_x, start_y]];

    const directions = [
      [0, -2],
      [0, 2],
      [-2, 0],
      [2, 0],
    ];

    while (stack.length > 0) {
      const [cx, cy] = stack[stack.length - 1];
      const unvisited: [number, number, number, number][] = [];

      for (const [dx, dy] of directions) {
        const nx = cx + dx;
        const ny = cy + dy;
        if (nx > 0 && nx < this.width - 1 && ny > 0 && ny < this.height - 1) {
          if (this.grid[ny][nx] === 1) {
            unvisited.push([nx, ny, dx, dy]);
          }
        }
      }

      if (unvisited.length > 0) {
        const [nx, ny, dx, dy] = unvisited[Math.floor(Math.random() * unvisited.length)];
        this.grid[cy + dy / 2][cx + dx / 2] = 0;
        this.grid[ny][nx] = 0;
        stack.push([nx, ny]);
      } else {
        stack.pop();
      }
    }

    for (let y = 2; y < this.height - 2; y++) {
      for (let x = 2; x < this.width - 2; x++) {
        if (this.grid[y][x] === 1) {
          if (this.grid[y][x - 1] === 0 && this.grid[y][x + 1] === 0 && Math.random() < mazeOpenings) {
            this.grid[y][x] = 0;
          } else if (this.grid[y - 1][x] === 0 && this.grid[y + 1][x] === 0 && Math.random() < mazeOpenings) {
            this.grid[y][x] = 0;
          }
        }
      }
    }

    const midY = Math.floor(this.height / 2);
    const midX = Math.floor(this.width / 2);
    for (let cy = midY - 1; cy <= midY + 1; cy++) {
      for (let cx = midX - 1; cx <= midX + 1; cx++) {
        if (cy > 0 && cy < this.height - 1 && cx > 0 && cx < this.width - 1) {
          this.grid[cy][cx] = 0;
        }
      }
    }

    for (let x = 0; x < this.width; x++) {
      this.grid[0][x] = 1;
      this.grid[this.height - 1][x] = 1;
    }
    for (let y = 0; y < this.height; y++) {
      this.grid[y][0] = 1;
      this.grid[y][this.width - 1] = 1;
    }

    this._assignEntities(keysCount);
  }

  private _assignEntities(keysCount: number): void {
    const open_tiles: [number, number][] = [];
    for (let y = 1; y < this.height - 1; y++) {
      for (let x = 1; x < this.width - 1; x++) {
        if (this.grid[y][x] === 0) {
          open_tiles.push([x + 0.5, y + 0.5]);
        }
      }
    }

    open_tiles.sort(() => Math.random() - 0.5);

    this.player_spawn = open_tiles[0] || [1.5, 1.5];
    this.enemy_spawn = open_tiles[open_tiles.length - 1] || [this.width - 1.5, this.height - 1.5];
    this.exit_pos = open_tiles[1] || [this.width - 1.5, 1.5];

    const candidates = open_tiles.slice(2, open_tiles.length - 1);
    this.key_positions = candidates.slice(0, keysCount);
  }
}

export function generateDungeon(width: number = GRID_WIDTH, height: number = GRID_HEIGHT, keysCount: number = 3, mazeOpenings = 0.16): DungeonMaze {
  return new DungeonMaze(width, height, keysCount, mazeOpenings);
}

