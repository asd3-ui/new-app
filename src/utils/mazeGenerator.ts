export const GRID_WIDTH = 20;
export const GRID_HEIGHT = 20;

export class DungeonMaze {
  width: number;
  height: number;
  grid: number[][];
  player_spawn: [number, number] = [1.5, 1.5];
  enemy_spawn: [number, number] = [18.5, 18.5];
  exit_pos: [number, number] = [18.5, 1.5];
  key_positions: [number, number][] = [];

  constructor(width: number = GRID_WIDTH, height: number = GRID_HEIGHT) {
    this.width = width;
    this.height = height;
    this.grid = Array.from({ length: height }, () => Array(width).fill(1));
    this._carveMaze();
  }

  private _carveMaze(): void {
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

    // إضافة حلقات وممرات إضافية لتسهيل الهروب من الوحش
    for (let y = 2; y < this.height - 2; y++) {
      for (let x = 2; x < this.width - 2; x++) {
        if (this.grid[y][x] === 1) {
          if (this.grid[y][x - 1] === 0 && this.grid[y][x + 1] === 0 && Math.random() < 0.15) {
            this.grid[y][x] = 0;
          } else if (this.grid[y - 1][x] === 0 && this.grid[y + 1][x] === 0 && Math.random() < 0.15) {
            this.grid[y][x] = 0;
          }
        }
      }
    }

    // نحت الغرفة المركزية
    for (let cy = 8; cy < 12; cy++) {
      for (let cx = 8; cx < 12; cx++) {
        this.grid[cy][cx] = 0;
      }
    }

    // الجدران الخارجية الصلبة
    for (let x = 0; x < this.width; x++) {
      this.grid[0][x] = 1;
      this.grid[this.height - 1][x] = 1;
    }
    for (let y = 0; y < this.height; y++) {
      this.grid[y][0] = 1;
      this.grid[y][this.width - 1] = 1;
    }

    this._assignEntities();
  }

  private _assignEntities(): void {
    const open_tiles: [number, number][] = [];
    for (let y = 1; y < this.height - 1; y++) {
      for (let x = 1; x < this.width - 1; x++) {
        if (this.grid[y][x] === 0) {
          open_tiles.push([x + 0.5, y + 0.5]);
        }
      }
    }

    const top_left = open_tiles.filter(t => t[0] < 7 && t[1] < 7);
    this.player_spawn = top_left.length > 0 ? top_left[0] : [1.5, 1.5];

    const bottom_right = open_tiles.filter(t => t[0] > 12 && t[1] > 12);
    this.enemy_spawn = bottom_right.length > 0 ? bottom_right[bottom_right.length - 1] : [18.5, 18.5];

    const top_right = open_tiles.filter(t => t[0] > 13 && t[1] < 7);
    this.exit_pos = top_right.length > 0 ? top_right[0] : open_tiles[Math.floor(open_tiles.length / 2)];

    const candidates = open_tiles.filter(t => t !== this.player_spawn && t !== this.enemy_spawn && t !== this.exit_pos);
    candidates.sort(() => Math.random() - 0.5);
    this.key_positions = candidates.slice(0, 3);
  }
}

export function generateDungeon(): DungeonMaze {
  return new DungeonMaze(GRID_WIDTH, GRID_HEIGHT);
}
