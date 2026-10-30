import React, { useEffect, useRef, useState } from 'react';
import { generateDungeon, DungeonMaze, getDynamicLevelConfig, DynamicLevelConfig, GRID_WIDTH, GRID_HEIGHT } from './utils/mazeGenerator';
import { PlayerTopDown, EnemyTopDown } from './utils/entities';
import { App as CapacitorApp } from '@capacitor/app';

const TILE_SIZE = 56;
const EXIT_COLOR = "#10b981";
const KEY_COLOR = "#f59e0b";

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
}

const audio = new SoundSynthesizer();

const triggerVibration = (pattern: number | number[]) => {
  if (typeof window !== 'undefined' && navigator.vibrate) {
    try { navigator.vibrate(pattern); } catch {}
  }
};

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [gameState, setGameState] = useState<'MENU' | 'LEVEL_SELECT' | 'PLAYING' | 'PAUSED' | 'GAMEOVER' | 'VICTORY'>('MENU');
  const [lang, setLang] = useState<'AR' | 'EN'>('AR');
  const [currentLevelId, setCurrentLevelId] = useState(1);
  
  const [health, setHealth] = useState(100);
  const [stamina, setStamina] = useState(100);
  const [keys, setKeys] = useState('0/3');
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(0);

  const currentLevel: DynamicLevelConfig = getDynamicLevelConfig(currentLevelId);

  const gameRef = useRef<{
    dungeon: DungeonMaze;
    player: PlayerTopDown;
    enemy: EnemyTopDown;
    joystick: { x: number; y: number; active: boolean };
    particles: { x: number; y: number; vx: number; vy: number; color: string; life: number }[];
    dashCooldown: number;
    gameTime: number;
  }>({
    dungeon: generateDungeon(GRID_WIDTH, GRID_HEIGHT, 3),
    player: new PlayerTopDown(1.5, 1.5),
    enemy: new EnemyTopDown(18.5, 18.5),
    joystick: { x: 0, y: 0, active: false },
    particles: [],
    dashCooldown: 0,
    gameTime: 0,
  });

  const startLevel = (lvlId: number) => {
    audio.init();
    try {
      setCurrentLevelId(lvlId);
      const lvlConfig = getDynamicLevelConfig(lvlId);
      const dungeon = generateDungeon(lvlConfig.gridWidth, lvlConfig.gridHeight, lvlConfig.keysCount);

      gameRef.current.dungeon = dungeon;
      gameRef.current.player = new PlayerTopDown(...dungeon.player_spawn);
      gameRef.current.player.total_keys = dungeon.key_positions.length;
      
      const enemy = new EnemyTopDown(...dungeon.enemy_spawn, lvlConfig.enemySpeed);
      gameRef.current.enemy = enemy;

      gameRef.current.particles = [];
      gameRef.current.gameTime = 0;
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
      } else if (gameState === 'PAUSED' || gameState === 'LEVEL_SELECT' || gameState === 'GAMEOVER' || gameState === 'VICTORY') {
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
    const handleTouchStart = (e: TouchEvent) => {
      if (gameState !== 'PLAYING') return;
      for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches[i];
        if (t.clientX < window.innerWidth / 2 && touchIdentifier === null) {
          touchIdentifier = t.identifier;
          updateJoystick(t.clientX, t.clientY);
        }
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (touchIdentifier === null) return;
      for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches[i];
        if (t.identifier === touchIdentifier) {
          updateJoystick(t.clientX, t.clientY);
        }
      }
    };

    const handleTouchEnd = (e: TouchEvent) => {
      if (touchIdentifier === null) return;
      for (let i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i].identifier === touchIdentifier) {
          touchIdentifier = null;
          if (gameRef.current) gameRef.current.joystick = { x: 0, y: 0, active: false };
        }
      }
    };

    const updateJoystick = (clientX: number, clientY: number) => {
      const jx = 100;
      const jy = window.innerHeight - 100;
      const dx = clientX - jx;
      const dy = clientY - jy;
      const dist = Math.hypot(dx, dy);
      const maxDist = 50;
      const angle = Math.atan2(dy, dx);
      const power = Math.min(dist, maxDist) / maxDist;
      if (gameRef.current) {
        gameRef.current.joystick = {
          x: Math.cos(angle) * power,
          y: Math.sin(angle) * power,
          active: true,
        };
      }
    };

    window.addEventListener('touchstart', handleTouchStart);
    window.addEventListener('touchmove', handleTouchMove);
    window.addEventListener('touchend', handleTouchEnd);

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

          if (g.player.keys_collected >= g.player.total_keys) {
            const [ex, ey] = g.dungeon.exit_pos;
            if (Math.hypot(g.player.x - ex, g.player.y - ey) < 0.85) {
              g.player.score += 2000 + Math.max(0, Math.floor(300 - g.gameTime) * 10);
              if (g.player.score > highScore) {
                setHighScore(g.player.score);
                try { localStorage.setItem('dungeon_high_score', g.player.score.toString()); } catch {}
              }
              triggerVibration([100, 50, 100]);
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

          for (let r = 0; r < g.dungeon.height; r++) {
            for (let c = 0; c < g.dungeon.width; c++) {
              const val = g.dungeon.grid[r][c];
              const rx = c * TILE_SIZE;
              const ry = r * TILE_SIZE;
              if (val === 1) {
                ctx.fillStyle = theme.wallTop;
                ctx.fillRect(rx, ry, TILE_SIZE, TILE_SIZE);
                ctx.fillStyle = theme.wallFace;
                ctx.fillRect(rx, ry + TILE_SIZE - 12, TILE_SIZE, 12);
              } else {
                ctx.fillStyle = theme.floor;
                ctx.fillRect(rx, ry, TILE_SIZE, TILE_SIZE);
                ctx.strokeStyle = theme.gridLine;
                ctx.strokeRect(rx, ry, TILE_SIZE, TILE_SIZE);
              }
            }
          }

          const exitReady = g.player.keys_collected >= g.player.total_keys;
          ctx.fillStyle = exitReady ? EXIT_COLOR : "#475569";
          ctx.beginPath();
          ctx.arc(g.dungeon.exit_pos[0] * TILE_SIZE, g.dungeon.exit_pos[1] * TILE_SIZE, TILE_SIZE * 0.38, 0, Math.PI * 2);
          ctx.fill();

          g.dungeon.key_positions.forEach(kp => {
            ctx.fillStyle = KEY_COLOR;
            ctx.beginPath();
            ctx.arc(kp[0] * TILE_SIZE, kp[1] * TILE_SIZE, TILE_SIZE * 0.2, 0, Math.PI * 2);
            ctx.fill();
          });

          g.particles.forEach(p => {
            ctx.fillStyle = p.color;
            ctx.fillRect(p.x, p.y, 4, 4);
          });

          if (g.enemy) {
            ctx.fillStyle = "#ef4444";
            ctx.beginPath();
            ctx.arc(g.enemy.x * TILE_SIZE, g.enemy.y * TILE_SIZE, g.enemy.radius * TILE_SIZE, 0, Math.PI * 2);
            ctx.fill();
          }

          ctx.fillStyle = "#06b6d4";
          ctx.beginPath();
          ctx.arc(g.player.x * TILE_SIZE, g.player.y * TILE_SIZE, g.player.radius * TILE_SIZE, 0, Math.PI * 2);
          ctx.fill();

          ctx.restore();

          const maxDim = Math.max(canvas.width, canvas.height);
          const grad = ctx.createRadialGradient(canvas.width / 2, canvas.height / 2, 60, canvas.width / 2, canvas.height / 2, maxDim * 0.65);
          grad.addColorStop(0, "rgba(5, 7, 12, 0)");
          grad.addColorStop(1, "rgba(5, 7, 12, 0.94)");
          ctx.fillStyle = grad;
          ctx.fillRect(0, 0, canvas.width, canvas.height);

          if (g.joystick && g.joystick.active) {
            ctx.fillStyle = "rgba(255,255,255,0.1)";
            ctx.beginPath();
            ctx.arc(100, canvas.height - 100, 50, 0, Math.PI * 2);
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
      window.removeEventListener('resize', handleResize);
    };
  }, [gameState, highScore, currentLevelId]);

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[#080a0f] select-none dir-auto">
      <canvas ref={canvasRef} className="block w-full h-full cursor-crosshair" />

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
        <div className="absolute top-4 right-4 flex flex-col gap-2 bg-[#0a0c12]/90 border border-cyan-500/30 p-3 rounded-xl backdrop-blur text-white text-sm font-bold shadow-xl pointer-events-none">
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
          </div>

          <div className="text-yellow-400 font-bold text-sm mt-8">
            {lang === 'AR' ? 'أعلى رقم قياسي:' : 'High Score:'} {highScore}
          </div>
        </div>
      )}

      {/* 2. اختيار المرحلة */}
      {gameState === 'LEVEL_SELECT' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#080a0f]/95 text-white p-6 z-20">
          <h2 className="text-2xl font-bold text-cyan-400 mb-6">
            {lang === 'AR' ? 'المراحل المتجددة' : 'Procedural Levels'}
          </h2>

          <div className="grid grid-cols-2 gap-3 w-full max-w-md mb-6 max-h-60 overflow-y-auto p-2">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((lvlNum) => {
              const conf = getDynamicLevelConfig(lvlNum);
              return (
                <button
                  key={lvlNum}
                  onClick={() => startLevel(lvlNum)}
                  className="p-3 rounded-xl border border-cyan-500/30 bg-slate-900/80 hover:bg-cyan-900/30 text-left flex flex-col gap-1 transition active:scale-95"
                >
                  <span className="font-bold text-cyan-300 text-xs">{lang === 'AR' ? `مرحلة ${lvlNum}` : `Level ${lvlNum}`}</span>
                  <span className="text-[10px] text-gray-400">🔑 {conf.keysCount} {lang === 'AR' ? 'مفاتيح' : 'Keys'}</span>
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
