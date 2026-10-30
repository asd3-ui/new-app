export interface DynamicLevelTheme {
  bg: string;
  floor: string;
  wallTop: string;
  wallFace: string;
  gridLine: string;
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
}

// مولد الألوان والبيئات العشوائية المتناسقة إجرائياً
function generateProceduralTheme(levelId: number): DynamicLevelTheme {
  const hue = (levelId * 137.5) % 360; // توزيع زوايا الألوان بشكل جمالي متناسق
  
  return {
    bg: `hsl(${hue}, 40%, 4%)`,
    floor: `hsl(${hue}, 30%, 10%)`,
    wallTop: `hsl(${hue}, 35%, 22%)`,
    wallFace: `hsl(${hue}, 40%, 14%)`,
    gridLine: `hsl(${hue}, 25%, 15%)`
  };
}

// دالة توليد خصائص المرحلة المتجددة تلقائياً عبر AI/Logic
export function getDynamicLevelConfig(levelId: number): DynamicLevelConfig {
  // تكبير المتاهة تدريجياً مع تقدم المراحل حتى حد أقصى مناسب للشاشات
  const baseSize = 19 + (Math.floor((levelId - 1) / 2) * 2);
  const size = Math.min(31, baseSize); // أبعاد فردية لضمان سلامة خوارزمية المتاهات

  const keysCount = Math.min(7, 3 + Math.floor((levelId - 1) / 2));
  const enemySpeed = Number((1.8 + Math.min(levelId * 0.25, 2.2)).toFixed(2));

  return {
    id: levelId,
    nameAr: `المرحلة ${levelId}: المتاهة المتجددة`,
    nameEn: `Level ${levelId}: Procedural Maze`,
    gridWidth: size,
    gridHeight: size,
    theme: generateProceduralTheme(levelId),
    enemySpeed: enemySpeed,
    keysCount: keysCount
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

  constructor(width: number = 21, height: number = 21, keysCount: number = 3) {
    this.width = width % 2 === 0 ? width + 1 : width;
    this.height = height % 2 === 0 ? height + 1 : height;
    this.grid = Array.from({ length: this.height }, () => Array(this.width).fill(1));
    this._carveMaze(keysCount);
  }

  private _carveMaze(keysCount: number): void {
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

    // خوارزمية النحت العشوائي الإجرائي
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

    // إضافة مسارات وحلقات فرعية عشوائية للهروب من الوحش
    for (let y = 2; y < this.height - 2; y++) {
      for (let x = 2; x < this.width - 2; x++) {
        if (this.grid[y][x] === 1) {
          if (this.grid[y][x - 1] === 0 && this.grid[y][x + 1] === 0 && Math.random() < 0.2) {
            this.grid[y][x] = 0;
          } else if (this.grid[y - 1][x] === 0 && this.grid[y + 1][x] === 0 && Math.random() < 0.2) {
            this.grid[y][x] = 0;
          }
        }
      }
    }

    // نحت غرفة مركزية بأبعاد متناسقة
    const midY = Math.floor(this.height / 2);
    const midX = Math.floor(this.width / 2);
    for (let cy = midY - 1; cy <= midY + 1; cy++) {
      for (let cx = midX - 1; cx <= midX + 1; cx++) {
        if (cy > 0 && cy < this.height - 1 && cx > 0 && cx < this.width - 1) {
          this.grid[cy][cx] = 0;
        }
      }
    }

    // تأكيد الحدود الصلبة
    for (let x = 0; x < this.width; x++) {
      this.grid[0][x] = 1;
      this.grid[this.height - 1][x] = 1;
    }
    for (let y = 0; y < this.height; y++) {
      this.grid[y][0] = 1;
      this.grid[this.width - 1] = 1;
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

    // اختيار مواقع عشوائية متباعدة للكائنات
    open_tiles.sort(() => Math.random() - 0.5);

    this.player_spawn = open_tiles[0] || [1.5, 1.5];
    this.enemy_spawn = open_tiles[open_tiles.length - 1] || [this.width - 1.5, this.height - 1.5];
    this.exit_pos = open_tiles[1] || [this.width - 1.5, 1.5];

    const candidates = open_tiles.slice(2, open_tiles.length - 1);
    this.key_positions = candidates.slice(0, keysCount);
  }
}

export function generateDungeon(width: number = 21, height: number = 21, keysCount: number = 3): DungeonMaze {
  return new DungeonMaze(width, height, keysCount);
}
