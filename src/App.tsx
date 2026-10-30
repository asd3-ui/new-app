import React, { useEffect, useRef, useState } from 'react';
import { generateDungeon, DungeonMaze, getDynamicLevelConfig, DynamicLevelConfig, GRID_WIDTH, GRID_HEIGHT } from './utils/mazeGenerator';
import { PlayerTopDown, EnemyTopDown } from './utils/entities';
import { App as CapacitorApp } from '@capacitor/app';

const TILE_SIZE = 56;
const EXIT_COLOR = "#10b981";
const KEY_COLOR = "#f59e0b";
const miniMapCache = new WeakMap<DungeonMaze, HTMLCanvasElement>();

class SoundSynthesizer {
  ctx: AudioContext | null = null;
  enabled: boolean = false;

  init() {
    if (!this.enabled && typeof window !== 'undefined') {
      try {
        const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (AudioCtx) {
          this.ctx = new AudioCtx();
          this.enabled = true;
        }
      } catch {}
    }
  }

  playBeep(freq: number, duration: number) {
    if (!this.enabled || !this.ctx) return;
    try {
      if (this.ctx.state === 'suspended') {
        this.ctx.resume();
      }
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.2, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(this.ctx.currentTime + duration);
    } catch {}
  }

  playVictory() {
    [523, 659, 784, 1047].forEach((freq, index) => {
      window.setTimeout(() => this.playBeep(freq, 0.22), index * 120);
    });
  }
}

const audio = new SoundSynthesizer();

const triggerVibration = (pattern: number | number[]) => {
  if (typeof window !== 'undefined' && navigator.vibrate) {
    try { navigator.vibrate(pattern); } catch {}
  }
};

function findGridPath(grid: number[][], start: [number, number], target: [number, number]): [number, number][] {
  const height = grid.length;
  const width = grid[0]?.length ?? 0;
  const startId = Math.floor(start[1]) * width + Math.floor(start[0]);
  const targetId = Math.floor(target[1]) * width + Math.floor(target[0]);
  const parent = new Int32Array(width * height).fill(-1);
  const queue = new Int32Array(width * height);
  let head = 0;
  let tail = 0;
  queue[tail++] = startId;
  parent[startId] = startId;
  const directions = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;

  while (head < tail && parent[targetId] === -1) {
    const current = queue[head++];
    const x = current % width;
    const y = Math.floor(current / width);
    for (const [dx, dy] of directions) {
      const nx = x + dx;
      const ny = y + dy;
      const next = ny * width + nx;
      if (nx >= 0 && nx < width && ny >= 0 && ny < height && grid[ny][nx] === 0 && parent[next] === -1) {
        parent[next] = current;
        queue[tail++] = next;
      }
    }
  }

  if (parent[targetId] === -1) return [];
  const route: [number, number][] = [];
  for (let current = targetId; current !== startId; current = parent[current]) {
    route.push([current % width, Math.floor(current / width)]);
  }
  route.push([startId % width, Math.floor(startId / width)]);
  return route.reverse();
}

function drawHero(ctx: CanvasRenderingContext2D, x: number, y: number, angle: number, phase: number, moving: number, skin: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.beginPath();
  ctx.ellipse(2, 6, 17, 21, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.rotate(angle + Math.PI / 2);

  ctx.fillStyle = '#18212a';
  ctx.beginPath();
  ctx.ellipse(0, 8, 13, 12, 0, 0, Math.PI * 2);
  ctx.fill();
  const stride = moving > 0.08 ? Math.sin(phase) * 5 : 0;
  ctx.fillStyle = '#5c4634';
  ctx.beginPath();
  ctx.ellipse(-8, 14 + stride, 4, 7, -0.2, 0, Math.PI * 2);
  ctx.ellipse(8, 14 - stride, 4, 7, 0.2, 0, Math.PI * 2);
  ctx.fill();

  const armor = ctx.createLinearGradient(-13, -8, 13, 8);
  const kits = [['#b7a17a', '#66745d', '#313d36'], ['#93c5fd', '#2563eb', '#172554'], ['#fda4af', '#be123c', '#4c0519']];
  armor.addColorStop(0, kits[skin][0]);
  armor.addColorStop(0.45, kits[skin][1]);
  armor.addColorStop(1, kits[skin][2]);
  ctx.fillStyle = armor;
  ctx.beginPath();
  ctx.ellipse(0, 1, 13, 15, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#384139';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(-10, -3); ctx.lineTo(-15, 5 + stride); ctx.moveTo(10, -3); ctx.lineTo(15, 5 - stride); ctx.stroke();
  ctx.strokeStyle = 'rgba(225,213,176,0.65)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(-8, -3); ctx.lineTo(8, -3); ctx.stroke();

  ctx.fillStyle = '#c58d68';
  ctx.beginPath();
  ctx.ellipse(0, -12, 7, 7.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#d5bd78';
  ctx.beginPath();
  ctx.ellipse(0, -15, 8, 6.5, 0, Math.PI, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(-8, -15, 16, 3);
  ctx.fillStyle = '#1f2937';
  ctx.fillRect(-7, -1, 14, 4);
  ctx.restore();
}

function drawMonster(ctx: CanvasRenderingContext2D, x: number, y: number, angle: number, pulse: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.beginPath();
  ctx.ellipse(1, 8, 22, 17, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.rotate(angle + Math.PI / 2);

  const hide = ctx.createRadialGradient(-5, -7, 2, 0, 0, 24);
  hide.addColorStop(0, '#a64f3e');
  hide.addColorStop(0.55, '#542b35');
  hide.addColorStop(1, '#17151e');
  ctx.fillStyle = hide;
  ctx.beginPath();
  ctx.ellipse(0, 2, 16, 21, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#29202a';
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(side * 12, -4, 5, 10, side * 0.25, 0, Math.PI * 2);
    ctx.ellipse(side * 10, 13, 4, 8, side * 0.2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = '#20151e';
  ctx.beginPath();
  ctx.ellipse(0, -14, 12, 12, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#fca5a5';
  ctx.beginPath();
  ctx.moveTo(-8, -20); ctx.lineTo(-11, -29); ctx.lineTo(-2, -23);
  ctx.moveTo(8, -20); ctx.lineTo(11, -29); ctx.lineTo(2, -23);
  ctx.fill();
  ctx.shadowColor = '#ff2f46';
  ctx.shadowBlur = 8 + pulse * 5;
  ctx.fillStyle = '#ff3b4f';
  ctx.beginPath();
  ctx.ellipse(-4, -16, 2.2, 1.8, 0, 0, Math.PI * 2);
  ctx.ellipse(4, -16, 2.2, 1.8, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawMiniMap(
  ctx: CanvasRenderingContext2D,
  dungeon: DungeonMaze,
  player: PlayerTopDown,
  enemy: EnemyTopDown,
  route: [number, number][],
  accent: string,
  lang: 'AR' | 'EN'
) {
  const x = 16;
  const y = 72;
  const size = 122;
  const inset = 8;
  const cell = (size - inset * 2) / Math.max(dungeon.width, dungeon.height);
  const mapX = x + (size - cell * dungeon.width) / 2;
  const mapY = y + 21 + (size - 25 - cell * dungeon.height) / 2;
  let mapArt = miniMapCache.get(dungeon);
  if (!mapArt) {
    const pixelsPerTile = 3;
    mapArt = document.createElement('canvas');
    mapArt.width = dungeon.width * pixelsPerTile;
    mapArt.height = dungeon.height * pixelsPerTile;
    const mapCtx = mapArt.getContext('2d');
    if (mapCtx) {
      for (let row = 0; row < dungeon.height; row++) {
        for (let col = 0; col < dungeon.width; col++) {
          mapCtx.fillStyle = dungeon.grid[row][col] === 1 ? '#34404a' : '#17222a';
          mapCtx.fillRect(col * pixelsPerTile, row * pixelsPerTile, pixelsPerTile, pixelsPerTile);
        }
      }
    }
    miniMapCache.set(dungeon, mapArt);
  }

  ctx.fillStyle = 'rgba(5,10,16,0.88)';
  ctx.strokeStyle = `${accent}99`;
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.rect(x, y, size, size); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#e2e8f0';
  ctx.font = 'bold 10px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(lang === 'AR' ? 'الخريطة والمسار' : 'MAP / ROUTE', x + 8, y + 14);

  ctx.drawImage(mapArt, mapX, mapY, cell * dungeon.width, cell * dungeon.height);
  if (route.length > 1) {
    ctx.strokeStyle = accent;
    ctx.globalAlpha = 0.9;
    ctx.lineWidth = Math.max(1.5, cell * 0.65);
    ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.beginPath();
    route.forEach(([rx, ry], index) => {
      const px = mapX + (rx + 0.5) * cell;
      const py = mapY + (ry + 0.5) * cell;
      if (index === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    });
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  const dot = (px: number, py: number, color: string, radius: number) => {
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.arc(mapX + px * cell, mapY + py * cell, radius, 0, Math.PI * 2); ctx.fill();
  };
  dot(dungeon.exit_pos[0], dungeon.exit_pos[1], '#fbbf24', Math.max(2.5, cell));
  dungeon.key_positions.forEach(([kx, ky]) => dot(kx, ky, '#fef08a', Math.max(1.5, cell * 0.7)));
  dot(enemy.x, enemy.y, '#fb4f5e', Math.max(2.5, cell));
  dot(player.x, player.y, '#f8fafc', Math.max(2.5, cell));
}

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const joystickHandleRef = useRef<HTMLDivElement | null>(null);
  const [gameState, setGameState] = useState<'MENU' | 'LEVEL_SELECT' | 'SHOP' | 'PLAYING' | 'PAUSED' | 'GAMEOVER' | 'VICTORY'>('MENU');
  const [lang, setLang] = useState<'AR' | 'EN'>('AR');
  const [currentLevelId, setCurrentLevelId] = useState(1);
  
  const [health, setHealth] = useState(100);
  const [stamina, setStamina] = useState(100);
  const [keys, setKeys] = useState('0/3');
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(0);
  const [coins, setCoins] = useState(() => Number(localStorage.getItem('dungeon_coins') || 0));
  const [unlockedLevel, setUnlockedLevel] = useState(() => Number(localStorage.getItem('dungeon_unlocked') || 1));
  const [ownedHeroes, setOwnedHeroes] = useState<number[]>(() => JSON.parse(localStorage.getItem('dungeon_heroes') || '[0]'));
  const [heroSkin, setHeroSkin] = useState(() => Number(localStorage.getItem('dungeon_hero_selected') || 0));

  const currentLevel: DynamicLevelConfig = getDynamicLevelConfig(currentLevelId);

  const gameRef = useRef<{
    dungeon: DungeonMaze;
    player: PlayerTopDown;
    enemy: EnemyTopDown;
    joystick: { x: number; y: number; active: boolean };
    particles: { x: number; y: number; vx: number; vy: number; color: string; life: number }[];
    dashCooldown: number;
    gameTime: number;
    route: [number, number][];
    routeTimer: number;
    moving: number;
  }>({
    dungeon: generateDungeon(GRID_WIDTH, GRID_HEIGHT, 3),
    player: new PlayerTopDown(1.5, 1.5),
    enemy: new EnemyTopDown(18.5, 18.5),
    joystick: { x: 0, y: 0, active: false },
    particles: [],
    dashCooldown: 0,
    gameTime: 0,
    route: [],
    routeTimer: 0,
    moving: 0,
  });

  const startLevel = (lvlId: number) => {
    audio.init();
    try {
      setCurrentLevelId(lvlId);
      const lvlConfig = getDynamicLevelConfig(lvlId);
      const dungeon = generateDungeon(lvlConfig.gridWidth, lvlConfig.gridHeight, lvlConfig.keysCount, lvlConfig.mazeOpenings);

      gameRef.current.dungeon = dungeon;
      gameRef.current.player = new PlayerTopDown(...dungeon.player_spawn);
      gameRef.current.player.total_keys = dungeon.key_positions.length;
      
      const enemy = new EnemyTopDown(...dungeon.enemy_spawn, lvlConfig.enemySpeed);
      gameRef.current.enemy = enemy;

      gameRef.current.particles = [];
      gameRef.current.gameTime = 0;
      gameRef.current.route = [];
      gameRef.current.routeTimer = 0;
      gameRef.current.moving = 0;
      setHealth(100);
      setStamina(100);
      setKeys(`0/${dungeon.key_positions.length}`);
      setGameState('PLAYING');
      triggerVibration(50);
    } catch (e) {
      console.error(e);
    }
  };

  const triggerDash = () => {
    const g = gameRef.current;
    if (g && g.dashCooldown <= 0 && g.player && g.player.stamina >= 30) {
      g.player.stamina -= 30;
      g.dashCooldown = 1.5;
      g.player.x += Math.cos(g.player.angle) * 2.5;
      g.player.y += Math.sin(g.player.angle) * 2.5;
      audio.playBeep(440, 0.15);
      triggerVibration(40);
      for (let i = 0; i < 10; i++) {
        g.particles.push({
          x: g.player.x * TILE_SIZE,
          y: g.player.y * TILE_SIZE,
          vx: (Math.random() - 0.5) * 60,
          vy: (Math.random() - 0.5) * 60,
          color: '#06b6d4',
          life: 0.5,
        });
      }
    }
  };

  useEffect(() => {
    let isMounted = true;
    let listenerHandle: any = null;

    CapacitorApp.addListener('backButton', () => {
      if (!isMounted) return;
      if (gameState === 'PLAYING') {
        setGameState('PAUSED');
        triggerVibration(30);
      } else if (gameState === 'PAUSED') {
        setGameState('PLAYING');
      } else if (gameState === 'SHOP' || gameState === 'LEVEL_SELECT' || gameState === 'GAMEOVER' || gameState === 'VICTORY') {
        setGameState('MENU');
        triggerVibration(30);
      } else if (gameState === 'MENU') {
        if (window.confirm(lang === 'AR' ? "هل تريد الخروج من اللعبة؟" : "Exit Game?")) {
          CapacitorApp.exitApp();
        }
      }
    }).then(handle => { listenerHandle = handle; }).catch(() => {});

    return () => {
      isMounted = false;
      if (listenerHandle && typeof listenerHandle.remove === 'function') {
        listenerHandle.remove();
      }
    };
  }, [gameState, lang]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem('dungeon_high_score');
      if (saved) setHighScore(parseInt(saved, 10));
    } catch {}

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    let lastTime = performance.now();
    let frameCount = 0;

    canvas.width = window.innerWidth || 800;
    canvas.height = window.innerHeight || 600;

    const keysDown: Record<string, boolean> = {};
    const handleKeyDown = (e: KeyboardEvent) => {
      keysDown[e.key] = true;
      if (e.key === ' ' && gameState === 'PLAYING') triggerDash();
    };
    const handleKeyUp = (e: KeyboardEvent) => { keysDown[e.key] = false; };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    let touchIdentifier: number | null = null;
    const joystickOrigin = { x: 96, y: window.innerHeight - 96 };
    const handleTouchStart = (e: TouchEvent) => {
      if (gameState !== 'PLAYING') return;
      for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches[i];
        const touchDistance = Math.hypot(t.clientX - joystickOrigin.x, t.clientY - joystickOrigin.y);
        if (touchDistance <= 72 && touchIdentifier === null) {
          e.preventDefault();
          touchIdentifier = t.identifier;
          updateJoystick(t.clientX, t.clientY);
        }
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (touchIdentifier === null) return;
      e.preventDefault();
      for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches[i];
        if (t.identifier === touchIdentifier) {
          updateJoystick(t.clientX, t.clientY);
        }
      }
    };

    const handleTouchEnd = (e: TouchEvent) => {
      if (touchIdentifier === null) return;
      e.preventDefault();
      for (let i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i].identifier === touchIdentifier) {
          touchIdentifier = null;
          if (gameRef.current) gameRef.current.joystick = { x: 0, y: 0, active: false };
          if (joystickHandleRef.current) joystickHandleRef.current.style.transform = 'translate(0px, 0px)';
        }
      }
    };

    const updateJoystick = (clientX: number, clientY: number) => {
      const jx = joystickOrigin.x;
      const jy = joystickOrigin.y;
      const dx = clientX - jx;
      const dy = clientY - jy;
      const dist = Math.hypot(dx, dy);
      const maxDist = 50;
      const angle = Math.atan2(dy, dx);
      const power = Math.min(dist, maxDist) / maxDist;
      if (joystickHandleRef.current) {
        const handleX = Math.cos(angle) * Math.min(dist, maxDist);
        const handleY = Math.sin(angle) * Math.min(dist, maxDist);
        joystickHandleRef.current.style.transform = `translate(${handleX}px, ${handleY}px)`;
      }
      if (gameRef.current) {
        gameRef.current.joystick = {
          x: Math.cos(angle) * power,
          y: Math.sin(angle) * power,
          active: true,
        };
      }
    };

    window.addEventListener('touchstart', handleTouchStart, { passive: false });
    window.addEventListener('touchmove', handleTouchMove, { passive: false });
    window.addEventListener('touchend', handleTouchEnd, { passive: false });
    window.addEventListener('touchcancel', handleTouchEnd, { passive: false });

    const loop = (now: number) => {
      try {
        const dt = Math.min((now - lastTime) / 1000, 0.05);
        lastTime = now;
        frameCount++;

        const g = gameRef.current;
        const theme = currentLevel.theme;

        if (gameState === 'PLAYING' && g && g.dungeon && g.player && g.enemy) {
          g.gameTime += dt;
          if (g.dashCooldown > 0) g.dashCooldown -= dt;

          let vx = g.joystick.x;
          let vy = g.joystick.y;
          if (keysDown['w'] || keysDown['ArrowUp']) vy = -1;
          if (keysDown['s'] || keysDown['ArrowDown']) vy = 1;
          if (keysDown['a'] || keysDown['ArrowLeft']) vx = -1;
          if (keysDown['d'] || keysDown['ArrowRight']) vx = 1;

          g.player.update_motion(vx, vy, dt, g.dungeon.grid);
          g.moving = Math.hypot(vx, vy);

          g.particles = g.particles.filter(p => {
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.life -= dt;
            return p.life > 0;
          });

          g.dungeon.key_positions.forEach((kpos, idx) => {
            if (Math.hypot(g.player.x - kpos[0], g.player.y - kpos[1]) < 0.7) {
              g.dungeon.key_positions.splice(idx, 1);
              g.player.keys_collected++;
              g.player.score += 500;
              setCoins(previous => {
                const total = previous + 10;
                localStorage.setItem('dungeon_coins', String(total));
                return total;
              });
              audio.playBeep(880, 0.18);
              triggerVibration(70);
              for (let i = 0; i < 15; i++) {
                g.particles.push({
                  x: kpos[0] * TILE_SIZE,
                  y: kpos[1] * TILE_SIZE,
                  vx: (Math.random() - 0.5) * 80,
                  vy: (Math.random() - 0.5) * 80,
                  color: KEY_COLOR,
                  life: 0.6,
                });
              }
            }
          });

          g.routeTimer -= dt;
          if (g.routeTimer <= 0) {
            const target = g.dungeon.key_positions.reduce<[number, number] | null>((nearest, key) => {
              if (!nearest || Math.hypot(g.player.x - key[0], g.player.y - key[1]) < Math.hypot(g.player.x - nearest[0], g.player.y - nearest[1])) return key;
              return nearest;
            }, null) || g.dungeon.exit_pos;
            g.route = findGridPath(g.dungeon.grid, [g.player.x, g.player.y], target);
            g.routeTimer = 0.45;
          }

          if (g.player.keys_collected >= g.player.total_keys) {
            const [ex, ey] = g.dungeon.exit_pos;
            if (Math.hypot(g.player.x - ex, g.player.y - ey) < 0.85) {
              g.player.score += 2000 + Math.max(0, Math.floor(300 - g.gameTime) * 10);
              if (g.player.score > highScore) {
                setHighScore(g.player.score);
                try { localStorage.setItem('dungeon_high_score', g.player.score.toString()); } catch {}
              }
              triggerVibration([100, 50, 100]);
              audio.playVictory();
              setCoins(previous => {
                const total = previous + 100 + g.player.keys_collected * 15;
                localStorage.setItem('dungeon_coins', String(total));
                return total;
              });
              setUnlockedLevel(previous => {
                const next = Math.max(previous, currentLevelId + 1);
                localStorage.setItem('dungeon_unlocked', String(next));
                return next;
              });
              setGameState('VICTORY');
            }
          }

          const caught = g.enemy.update(g.player.x, g.player.y, g.dungeon.grid, dt);
          if (caught) {
            g.player.health -= 60 * dt;
            triggerVibration(30);
            if (g.player.health <= 0) {
              audio.playBeep(180, 0.35);
              triggerVibration([200, 100, 200]);
              setGameState('GAMEOVER');
            }
          }

          if (frameCount % 10 === 0) {
            setHealth(Math.max(0, Math.floor(g.player.health)));
            setStamina(Math.floor(g.player.stamina));
            setKeys(`${g.player.keys_collected}/${g.player.total_keys}`);
            setScore(g.player.score);
          }
        }

        ctx.fillStyle = theme.bg;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        if ((gameState === 'PLAYING' || gameState === 'PAUSED') && g && g.dungeon && g.player) {
          ctx.save();
          const ox = canvas.width / 2 - g.player.x * TILE_SIZE;
          const oy = canvas.height / 2 - g.player.y * TILE_SIZE;
          ctx.translate(ox, oy);

          const firstRow = Math.max(0, Math.floor(g.player.y - canvas.height / (2 * TILE_SIZE)) - 1);
          const lastRow = Math.min(g.dungeon.height, Math.ceil(g.player.y + canvas.height / (2 * TILE_SIZE)) + 1);
          const firstCol = Math.max(0, Math.floor(g.player.x - canvas.width / (2 * TILE_SIZE)) - 1);
          const lastCol = Math.min(g.dungeon.width, Math.ceil(g.player.x + canvas.width / (2 * TILE_SIZE)) + 1);
          for (let r = firstRow; r < lastRow; r++) {
            for (let c = firstCol; c < lastCol; c++) {
              const val = g.dungeon.grid[r][c];
              const rx = c * TILE_SIZE;
              const ry = r * TILE_SIZE;
              if (val === 1) {
                ctx.fillStyle = theme.wallTop;
                ctx.fillRect(rx + 1, ry + 1, TILE_SIZE - 2, TILE_SIZE - 3);
                ctx.fillStyle = theme.wallFace;
                ctx.fillRect(rx, ry + TILE_SIZE - 12, TILE_SIZE, 12);
                ctx.fillStyle = theme.wallEdge;
                ctx.globalAlpha = 0.34;
                ctx.fillRect(rx + 3, ry + 3, TILE_SIZE - 6, 2);
                ctx.globalAlpha = 1;
              } else {
                const variation = (r * 37 + c * 19 + currentLevelId * 11) % 7 === 0;
                ctx.fillStyle = variation ? theme.floorAlt : theme.floor;
                ctx.fillRect(rx, ry, TILE_SIZE, TILE_SIZE);
                ctx.strokeStyle = theme.gridLine;
                ctx.strokeRect(rx, ry, TILE_SIZE, TILE_SIZE);
                const detail = (r * 13 + c * 29 + currentLevelId * 7) % 11;
                if (detail < 2) {
                  ctx.strokeStyle = theme.detail;
                  ctx.globalAlpha = 0.28;
                  ctx.lineWidth = 1.5;
                  ctx.beginPath();
                  ctx.moveTo(rx + 12 + detail * 5, ry + 15);
                  ctx.lineTo(rx + 23, ry + 22 + detail * 4);
                  ctx.lineTo(rx + 39, ry + 18 + detail * 3);
                  ctx.stroke();
                  ctx.globalAlpha = 1;
                } else if (detail === 4) {
                  ctx.fillStyle = theme.detail;
                  ctx.globalAlpha = 0.24;
                  ctx.beginPath(); ctx.ellipse(rx + 28, ry + 29, 14, 6, -0.4, 0, Math.PI * 2); ctx.fill();
                  ctx.globalAlpha = 1;
                }
              }
            }
          }

          const exitReady = g.player.keys_collected >= g.player.total_keys;
          const exitGlow = ctx.createRadialGradient(g.dungeon.exit_pos[0] * TILE_SIZE, g.dungeon.exit_pos[1] * TILE_SIZE, 2, g.dungeon.exit_pos[0] * TILE_SIZE, g.dungeon.exit_pos[1] * TILE_SIZE, TILE_SIZE * 0.8);
          exitGlow.addColorStop(0, exitReady ? theme.accent : '#64748b');
          exitGlow.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.fillStyle = exitGlow;
          ctx.beginPath();
          ctx.arc(g.dungeon.exit_pos[0] * TILE_SIZE, g.dungeon.exit_pos[1] * TILE_SIZE, TILE_SIZE * 0.78, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = exitReady ? theme.accent : '#64748b';
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(g.dungeon.exit_pos[0] * TILE_SIZE, g.dungeon.exit_pos[1] * TILE_SIZE, TILE_SIZE * (0.26 + Math.sin(g.gameTime * 2) * 0.025), 0, Math.PI * 2);
          ctx.stroke();

          g.dungeon.key_positions.forEach(kp => {
            ctx.fillStyle = '#fbbf24';
            ctx.shadowColor = '#f59e0b';
            ctx.shadowBlur = 12;
            ctx.beginPath();
            ctx.arc(kp[0] * TILE_SIZE, kp[1] * TILE_SIZE, TILE_SIZE * 0.15, 0, Math.PI * 2);
            ctx.fill();
            ctx.shadowBlur = 0;
          });

          g.particles.forEach(p => {
            ctx.fillStyle = p.color;
            ctx.fillRect(p.x, p.y, 4, 4);
          });

          if (g.enemy) {
            drawMonster(ctx, g.enemy.x * TILE_SIZE, g.enemy.y * TILE_SIZE, g.enemy.angle, (Math.sin(g.gameTime * 5) + 1) / 2);
          }

          drawHero(ctx, g.player.x * TILE_SIZE, g.player.y * TILE_SIZE, g.player.angle, g.gameTime * 13, g.moving, heroSkin);

          ctx.restore();

          const maxDim = Math.max(canvas.width, canvas.height);
          const grad = ctx.createRadialGradient(canvas.width / 2, canvas.height / 2, 60, canvas.width / 2, canvas.height / 2, maxDim * 0.65);
          grad.addColorStop(0, "rgba(5, 7, 12, 0)");
          grad.addColorStop(1, "rgba(5, 7, 12, 0.94)");
          ctx.fillStyle = grad;
          ctx.fillRect(0, 0, canvas.width, canvas.height);

          const light = ctx.createRadialGradient(canvas.width / 2, canvas.height / 2, 24, canvas.width / 2, canvas.height / 2, Math.max(canvas.width, canvas.height) * 0.46);
          light.addColorStop(0, 'rgba(255,225,170,0.16)');
          light.addColorStop(0.5, `${theme.accent}28`);
          light.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.fillStyle = light;
          ctx.fillRect(0, 0, canvas.width, canvas.height);

          drawMiniMap(ctx, g.dungeon, g.player, g.enemy, g.route, theme.accent, lang);

          if (g.joystick && g.joystick.active) {
            ctx.fillStyle = "rgba(255,255,255,0.1)";
            ctx.beginPath();
            ctx.arc(96, canvas.height - 96, 50, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = "rgba(6, 182, 212, 0.6)";
            ctx.lineWidth = 2;
            ctx.stroke();
          }
        }
      } catch (err) {}

      animId = requestAnimationFrame(loop);
    };

    animId = requestAnimationFrame(loop);

    const handleResize = () => {
      if (canvas) {
        canvas.width = window.innerWidth || 800;
        canvas.height = window.innerHeight || 600;
      }
    };
    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('touchstart', handleTouchStart);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleTouchEnd);
      window.removeEventListener('touchcancel', handleTouchEnd);
      window.removeEventListener('resize', handleResize);
    };
  }, [gameState, highScore, currentLevelId]);

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[#080a0f] select-none dir-auto">
      <canvas ref={canvasRef} className="block w-full h-full cursor-crosshair" />

      {gameState === 'PLAYING' && (
        <div aria-hidden="true" className="pointer-events-none absolute bottom-8 left-8 z-20 flex h-32 w-32 items-center justify-center rounded-full border-2 border-white/25 bg-white/10">
          <div ref={joystickHandleRef} className="h-14 w-14 rounded-full border border-white/30 bg-white/30 shadow-lg" />
        </div>
      )}

      {/* زر تحويل اللغة */}
      <div className="absolute top-4 left-4 z-30">
        <button
          onClick={() => setLang(lang === 'AR' ? 'EN' : 'AR')}
          className="px-3 py-1.5 bg-cyan-950/80 border border-cyan-500/50 rounded-lg text-cyan-300 font-bold text-xs backdrop-blur shadow-lg active:scale-95 transition"
        >
          {lang === 'AR' ? 'English 🌐' : 'العربية 🌐'}
        </button>
      </div>

      {/* HUD Header */}
      {gameState === 'PLAYING' && (
        <div className="absolute top-3 right-3 flex flex-col gap-1 bg-[#0a0c12]/90 border border-cyan-500/30 px-2 py-1.5 rounded-lg backdrop-blur text-white text-[11px] font-bold shadow-xl pointer-events-none">
          <div className="mb-1 border-b border-white/10 pb-1 text-cyan-200">{lang === 'AR' ? currentLevel.nameAr : currentLevel.nameEn}</div>
          <div className="text-[11px] text-slate-400">{lang === 'AR' ? 'متاهة' : 'Maze'} {currentLevel.gridWidth} × {currentLevel.gridHeight}</div>
          <div>❤️ {lang === 'AR' ? 'الصحة' : 'Health'}: <span className="text-red-400">{health}</span></div>
          <div>⚡ {lang === 'AR' ? 'الطاقة' : 'Stamina'}: <span className="text-amber-400">{stamina}</span></div>
          <div>🔑 {lang === 'AR' ? 'المفاتيح' : 'Keys'}: <span className="text-yellow-400">{keys}</span></div>
          <div className="border-t border-white/10 pt-1 text-cyan-400">🏆 {lang === 'AR' ? 'النقاط' : 'Score'}: {score}</div>
        </div>
      )}

      {/* Dash Button */}
      {gameState === 'PLAYING' && (
        <button
          onClick={triggerDash}
          className="absolute bottom-8 right-8 w-20 h-20 bg-red-500/30 border-2 border-red-500 rounded-full flex items-center justify-center text-white font-bold text-sm shadow-lg active:scale-95 transition z-30"
        >
          DASH
        </button>
      )}

      {gameState === 'PAUSED' && (
        <div className="absolute inset-0 z-40 flex flex-col items-center justify-center gap-3 bg-black/85 text-white">
          <h2 className="mb-5 text-3xl font-extrabold text-cyan-300">{lang === 'AR' ? 'اللعبة متوقفة' : 'Game Paused'}</h2>
          <button onClick={() => setGameState('PLAYING')} className="w-56 rounded-xl bg-cyan-500 px-8 py-3 font-bold text-slate-950 active:scale-95">
            {lang === 'AR' ? 'متابعة اللعب' : 'Resume'}
          </button>
          <button onClick={() => startLevel(currentLevelId)} className="w-56 rounded-xl bg-amber-500 px-8 py-3 font-bold text-slate-950 active:scale-95">{lang === 'AR' ? 'إعادة المرحلة' : 'Restart'}</button>
          <button onClick={() => setGameState('MENU')} className="w-56 rounded-xl bg-slate-700 px-8 py-3 font-bold active:scale-95">{lang === 'AR' ? 'القائمة الرئيسية' : 'Main Menu'}</button>
        </div>
      )}

      {/* 1. القائمة الرئيسية */}
      {gameState === 'MENU' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#080a0f]/95 text-white p-6 z-20">
          <h1 className="text-3xl md:text-5xl font-extrabold text-cyan-400 mb-2 text-center tracking-wider">
            {lang === 'AR' ? 'مطاردة الدنجن' : 'DUNGEON CHASE'}
          </h1>
          <p className="text-gray-400 mb-8 text-center max-w-md text-sm md:text-base">
            {lang === 'AR' 
              ? 'متاهات متجددة بالذكاء الاصطناعي، اجمع المفاتيح المخبأة ونجُ من الوحش!' 
              : 'Infinite AI procedurally generated mazes, collect keys and escape!'}
          </p>
          
          <div className="flex flex-col gap-4 w-64">
            <button
              onClick={() => startLevel(1)}
              className="w-full py-4 bg-gradient-to-r from-cyan-500 to-blue-600 text-white text-lg font-bold rounded-2xl shadow-lg transition active:scale-95"
            >
              {lang === 'AR' ? 'بدء اللعب' : 'Start Game'}
            </button>

            <button
              onClick={() => setGameState('LEVEL_SELECT')}
              className="w-full py-3 bg-slate-800 border border-slate-600 text-cyan-300 font-bold rounded-xl transition active:scale-95"
            >
              {lang === 'AR' ? 'اختيار المرحلة 🗺️' : 'Select Level 🗺️'}
            </button>
            <button onClick={() => setGameState('SHOP')} className="w-full rounded-xl border border-amber-400/40 bg-amber-950/60 py-3 font-bold text-amber-300">{lang === 'AR' ? `متجر الأبطال · 🪙 ${coins}` : `Hero shop · 🪙 ${coins}`}</button>
          </div>

          <div className="text-yellow-400 font-bold text-sm mt-8">
            {lang === 'AR' ? 'أعلى رقم قياسي:' : 'High Score:'} {highScore}
          </div>
        </div>
      )}

      {/* 2. اختيار المرحلة */}
      {gameState === 'SHOP' && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-[#080a0f]/96 p-5 text-white">
          <h2 className="mb-2 text-2xl font-black text-amber-300">{lang === 'AR' ? 'معرض المستكشفين' : 'Explorer Hall'}</h2>
          <p className="mb-5 text-sm text-slate-400">{lang === 'AR' ? `رصيدك: ${coins} قطعة · اجمع القطع من المفاتيح والفوز` : `Balance: ${coins} coins · Earn coins from keys and victories`}</p>
          <div className="grid w-full max-w-md grid-cols-1 gap-3">
            {[
              { id: 0, name: lang === 'AR' ? 'الحارس' : 'The Warden', cost: 0, color: 'bg-[#66745d]' },
              { id: 1, name: lang === 'AR' ? 'كشاف الجليد' : 'Frost Scout', cost: 250, color: 'bg-blue-600' },
              { id: 2, name: lang === 'AR' ? 'صياد الظلال' : 'Shadow Hunter', cost: 600, color: 'bg-rose-700' },
            ].map(hero => {
              const owned = ownedHeroes.includes(hero.id);
              return <button key={hero.id} onClick={() => {
                if (owned) { setHeroSkin(hero.id); localStorage.setItem('dungeon_hero_selected', String(hero.id)); }
                else if (coins >= hero.cost) {
                  const nextCoins = coins - hero.cost;
                  const nextOwned = [...ownedHeroes, hero.id];
                  setCoins(nextCoins); setOwnedHeroes(nextOwned); setHeroSkin(hero.id);
                  localStorage.setItem('dungeon_coins', String(nextCoins));
                  localStorage.setItem('dungeon_heroes', JSON.stringify(nextOwned));
                  localStorage.setItem('dungeon_hero_selected', String(hero.id));
                }
              }} className="flex items-center gap-4 rounded-xl border border-white/10 bg-slate-900 p-4 text-left active:scale-95">
                <span className={`h-12 w-12 rounded-full border-2 border-white/30 ${hero.color}`} />
                <span className="flex-1"><b className="block">{hero.name}</b><small className="text-slate-400">{owned ? (heroSkin === hero.id ? (lang === 'AR' ? 'مختار حالياً' : 'Selected') : (lang === 'AR' ? 'اضغط للاختيار' : 'Tap to select')) : `🪙 ${hero.cost}`}</small></span>
                <span>{owned ? '✓' : coins >= hero.cost ? '🔓' : '🔒'}</span>
              </button>;
            })}
          </div>
          <button onClick={() => setGameState('MENU')} className="mt-5 rounded-xl bg-slate-700 px-8 py-2.5 font-bold">{lang === 'AR' ? 'عودة' : 'Back'}</button>
        </div>
      )}

      {gameState === 'LEVEL_SELECT' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#080a0f]/95 text-white p-6 z-20">
            <h2 className="text-2xl font-bold text-cyan-400 mb-2">
            {lang === 'AR' ? 'عوالم المتاهة' : 'Maze Worlds'}
          </h2>
          <p className="mb-4 text-xs text-slate-400">{lang === 'AR' ? '٦٠ مرحلة • ٨ بيئات • خرائط متولدة إجرائياً' : '60 stages • 8 biomes • Procedurally generated maps'}</p>

          <div className="grid grid-cols-2 gap-3 w-full max-w-md mb-5 max-h-[55vh] overflow-y-auto p-2">
            {Array.from({ length: 60 }, (_, index) => index + 1).map((lvlNum) => {
              const conf = getDynamicLevelConfig(lvlNum);
              return (
                <button
                  key={lvlNum}
                  disabled={lvlNum > unlockedLevel}
                  onClick={() => startLevel(lvlNum)}
                  className={`p-3 rounded-xl border border-cyan-500/30 text-left flex flex-col gap-1 transition ${lvlNum > unlockedLevel ? 'bg-slate-950/80 opacity-45' : 'bg-slate-900/80 hover:bg-cyan-900/30 active:scale-95'}`}
                >
                  <span className="font-bold text-cyan-300 text-xs">{lang === 'AR' ? `مرحلة ${lvlNum}${lvlNum > unlockedLevel ? ' 🔒' : ' ✓'}` : `Level ${lvlNum}${lvlNum > unlockedLevel ? ' 🔒' : ' ✓'}`}</span>
                  <span className="text-[10px] text-gray-300">{lang === 'AR' ? conf.theme.nameAr : conf.theme.nameEn}</span>
                  <span className="text-[10px] text-gray-500">{conf.gridWidth}×{conf.gridHeight} · 🔑 {conf.keysCount}</span>
                </button>
              );
            })}
          </div>

          <button
            onClick={() => setGameState('MENU')}
            className="px-6 py-2.5 bg-gray-800 text-gray-300 rounded-xl text-sm font-bold active:scale-95 transition"
          >
            {lang === 'AR' ? 'رجوع' : 'Back'}
          </button>
        </div>
      )}

      {/* 3. شاشة الفوز */}
      {gameState === 'VICTORY' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/90 text-white p-6 z-20">
          <h2 className="text-3xl font-black mb-4 text-emerald-400">
            {lang === 'AR' ? 'مبروك! اجتزت المتاهة' : 'Maze Cleared!'}
          </h2>
          <p className="text-lg text-gray-300 mb-6">
            {lang === 'AR' ? 'النقاط:' : 'Score:'} {score}
          </p>

          <div className="flex gap-4">
            <button
              onClick={() => startLevel(currentLevelId + 1)}
              className="px-6 py-3 bg-emerald-500 hover:bg-emerald-400 text-black font-extrabold rounded-xl shadow-lg transition active:scale-95"
            >
              {lang === 'AR' ? 'المرحلة التالية ➔' : 'Next Level ➔'}
            </button>

            <button
              onClick={() => setGameState('MENU')}
              className="px-6 py-3 bg-gray-700 hover:bg-gray-600 text-white font-bold rounded-xl shadow-lg transition active:scale-95"
            >
              {lang === 'AR' ? 'القائمة الرئيسية' : 'Main Menu'}
            </button>
          </div>
        </div>
      )}

      {/* 4. شاشة الخسارة */}
      {gameState === 'GAMEOVER' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/90 text-white p-6 z-20">
          <h2 className="text-4xl font-black mb-4 text-red-500">
            {lang === 'AR' ? 'انتهت اللعبة!' : 'Game Over!'}
          </h2>
          <p className="text-lg text-gray-300 mb-6">
            {lang === 'AR' ? 'النقاط النهائية:' : 'Final Score:'} {score}
          </p>
          
          <div className="flex gap-4">
            <button
              onClick={() => startLevel(currentLevelId)}
              className="px-6 py-3 bg-amber-500 hover:bg-amber-400 text-black font-extrabold rounded-xl shadow-lg transition active:scale-95"
            >
              {lang === 'AR' ? 'إعادة المحاولة (متاهة جديدة)' : 'Retry (New Maze)'}
            </button>
            
            <button
              onClick={() => setGameState('MENU')}
              className="px-6 py-3 bg-gray-700 hover:bg-gray-600 text-white font-bold rounded-xl transition active:scale-95"
            >
              {lang === 'AR' ? 'القائمة الرئيسية' : 'Main Menu'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

