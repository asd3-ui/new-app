export class PlayerTopDown {
  x: number;
  y: number;
  angle: number = 0;
  radius: number = 0.32;
  max_health: number = 100;
  health: number = 100;
  max_stamina: number = 100;
  stamina: number = 100;
  is_sprinting: boolean = false;
  keys_collected: number = 0;
  total_keys: number = 3;
  score: number = 0;
  time_alive: number = 0;

  constructor(x: number, y: number) {
    this.x = x;
    this.y = y;
  }

  update_motion(vx: number, vy: number, dt: number, maze_grid: number[][]) {
    this.time_alive += dt;
    const mag = Math.hypot(vx, vy);
    if (mag > 1.0) {
      vx /= mag;
      vy /= mag;
    }
    if (mag > 0.08) {
      this.angle = Math.atan2(vy, vx);
    }

    const base_speed = 3.4;
    let speed = base_speed;
    if (this.is_sprinting && this.stamina > 5.0 && mag > 0.08) {
      speed = base_speed * 1.65;
      this.stamina = Math.max(0, this.stamina - 35 * dt);
    } else {
      this.is_sprinting = false;
      this.stamina = Math.min(this.max_stamina, this.stamina + 22 * dt);
    }

    const dx = vx * speed * dt;
    const dy = vy * speed * dt;

    if (!this._check_collision(this.x + dx, this.y, maze_grid)) {
      this.x += dx;
    }
    if (!this._check_collision(this.x, this.y + dy, maze_grid)) {
      this.y += dy;
    }
  }

  private _check_collision(px: number, py: number, grid: number[][]): boolean {
    const r = this.radius;
    const points = [
      [px - r, py - r], [px + r, py - r],
      [px - r, py + r], [px + r, py + r],
    ];
    const h = grid.length;
    const w = grid[0].length;
    for (const [cx, cy] of points) {
      const gx = Math.floor(cx);
      const gy = Math.floor(cy);
      if (gx < 0 || gx >= w || gy < 0 || gy >= h || grid[gy][gx] === 1) {
        return true;
      }
    }
    return false;
  }
}

export class EnemyTopDown {
  x: number;
  y: number;
  angle: number = 0;
  speed: number = 2.2;
  recalc_interval: number = 30;
  radius: number = 0.36;
  path: [number, number][] = [];
  recalc_timer: number = 0;
  distance_to_player: number = 999;

  constructor(x: number, y: number, speedVal: number = 2.2) {
    this.x = x;
    this.y = y;
    this.speed = speedVal;
  }

  update(player_x: number, player_y: number, maze_grid: number[][], dt: number): boolean {
    const dx = player_x - this.x;
    const dy = player_y - this.y;
    const dist = Math.hypot(dx, dy);
    this.distance_to_player = dist;

    if (dist < 0.65) return true;

    this.recalc_timer++;
    if (this.recalc_timer >= this.recalc_interval || this.path.length === 0) {
      this.recalc_timer = 0;
      this.path = this._astar([Math.floor(this.x), Math.floor(this.y)], [Math.floor(player_x), Math.floor(player_y)], maze_grid);
    }

    let tx = player_x;
    let ty = player_y;
    if (this.path.length > 1) {
      const next = this.path[1];
      tx = next[0] + 0.5;
      ty = next[1] + 0.5;
      if (Math.hypot(tx - this.x, ty - this.y) < 0.25) {
        this.path.shift();
      }
    }

    const tdx = tx - this.x;
    const tdy = ty - this.y;
    const tdist = Math.hypot(tdx, tdy);

    if (tdist > 0.001) {
      this.angle = Math.atan2(tdy, tdx);
      const step = Math.min(this.speed * dt, tdist);
      const nx = this.x + (tdx / tdist) * step;
      const ny = this.y + (tdy / tdist) * step;
      const gx = Math.floor(nx);
      const gy = Math.floor(ny);
      if (gx >= 0 && gx < maze_grid[0].length && gy >= 0 && gy < maze_grid.length && maze_grid[gy][gx] === 0) {
        this.x = nx;
        this.y = ny;
      }
    }
    return false;
  }

  private _astar(start: [number, number], goal: [number, number], grid: number[][]): [number, number][] {
    const height = grid.length;
    const width = grid[0].length;
    const startId = start[1] * width + start[0];
    const goalId = goal[1] * width + goal[0];
    const parent = new Int32Array(width * height).fill(-1);
    const queue = new Int32Array(width * height);
    let head = 0;
    let tail = 0;
    queue[tail++] = startId;
    parent[startId] = startId;

    while (head < tail && parent[goalId] === -1) {
      const current = queue[head++];
      const x = current % width;
      const y = Math.floor(current / width);
      const neighbors = [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]];
      for (const [nx, ny] of neighbors) {
        if (nx >= 0 && nx < width && ny >= 0 && ny < height && grid[ny][nx] === 0) {
          const next = ny * width + nx;
          if (parent[next] === -1) {
            parent[next] = current;
            queue[tail++] = next;
          }
        }
      }
    }

    if (parent[goalId] === -1) return [start];
    const path: [number, number][] = [];
    for (let current = goalId; current !== startId; current = parent[current]) {
      path.push([current % width, Math.floor(current / width)]);
    }
    path.push(start);
    return path.reverse();
  }
}

