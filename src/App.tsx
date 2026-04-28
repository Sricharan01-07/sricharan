import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Play, RotateCcw, Trophy, Info } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 600;
const GRAVITY = 0.4;
const JUMP_STRENGTH = -8;
const PIPE_SPEED = 4;
const PIPE_WIDTH = 80;
const PIPE_SPACING = 300; // Horizontal spacing between pipes
const GAP_SIZE = 180; // Vertical gap

type GameState = 'START' | 'PLAYING' | 'GAMEOVER';

interface Pipe {
  x: number;
  topHeight: number;
  passed: boolean;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
}

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [gameState, setGameState] = useState<GameState>('START');
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(0);
  
  const stateRef = useRef({
    planeY: CANVAS_HEIGHT / 2,
    planeV: 0,
    pipes: [] as Pipe[],
    particles: [] as Particle[],
    score: 0,
    bgOffset: 0,
    fgOffset: 0,
    lastFrameTime: performance.now()
  });
  
  const requestRef = useRef<number>(0);

  const spawnPipe = (x: number) => {
    // Top height between 50 and CANVAS_HEIGHT - GAP_SIZE - 50
    const minHeight = 80;
    const maxHeight = CANVAS_HEIGHT - GAP_SIZE - 80;
    const topHeight = Math.random() * (maxHeight - minHeight) + minHeight;
    stateRef.current.pipes.push({ x, topHeight, passed: false });
  };

  const createExplosion = (x: number, y: number) => {
    for (let i = 0; i < 60; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * 8 + 2;
      stateRef.current.particles.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 1,
        maxLife: Math.random() * 40 + 20,
        size: Math.random() * 5 + 2,
        color: Math.random() > 0.5 ? '#ef4444' : Math.random() > 0.5 ? '#f97316' : '#52525b'
      });
    }
  };

  const initGame = () => {
    stateRef.current = {
      planeY: CANVAS_HEIGHT / 2,
      planeV: 0,
      pipes: [],
      particles: [],
      score: 0,
      bgOffset: stateRef.current.bgOffset, // Keep background moving smoothly
      fgOffset: 0,
      lastFrameTime: performance.now()
    };
    spawnPipe(CANVAS_WIDTH + 200);
    spawnPipe(CANVAS_WIDTH + 200 + PIPE_SPACING);
    spawnPipe(CANVAS_WIDTH + 200 + PIPE_SPACING * 2);
    setScore(0);
    setGameState('PLAYING');
  };

  const flap = () => {
    if (gameState === 'PLAYING') {
      stateRef.current.planeV = JUMP_STRENGTH;
    } else if (gameState === 'START' || gameState === 'GAMEOVER') {
      initGame();
    }
  };
  
  const drawPlane = (ctx: CanvasRenderingContext2D, x: number, y: number, angle: number) => {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    
    // Draw "realistic" looking plane
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 5;

    ctx.fillStyle = '#cbd5e1'; // Silver body
    ctx.beginPath();
    ctx.ellipse(0, 0, 32, 9, 0, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.shadowColor = 'transparent'; // Remove shadow for details

    // Cockpit
    ctx.fillStyle = '#38bdf8';
    ctx.beginPath();
    ctx.ellipse(15, -4, 8, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    
    // Wings
    ctx.fillStyle = '#94a3b8';
    ctx.beginPath();
    ctx.moveTo(-5, 0);
    ctx.lineTo(-15, 18);
    ctx.lineTo(8, 18);
    ctx.lineTo(12, 0);
    ctx.fill();
    
    ctx.fillStyle = '#64748b'; // Back wing
    ctx.beginPath();
    ctx.moveTo(-5, 0);
    ctx.lineTo(-20, -12);
    ctx.lineTo(2, -12);
    ctx.lineTo(12, 0);
    ctx.fill();

    // Tail
    ctx.fillStyle = '#64748b';
    ctx.beginPath();
    ctx.moveTo(-28, 0);
    ctx.lineTo(-34, -14);
    ctx.lineTo(-22, -14);
    ctx.lineTo(-18, 0);
    ctx.fill();

    // Engine exhaust
    ctx.fillStyle = '#f97316';
    ctx.beginPath();
    ctx.arc(-32, 0, 4 + Math.random(), 0, Math.PI * 2); // Flickering exhaust
    ctx.fill();
    
    ctx.restore();
  };

  const drawSkyscraper = (ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, isTop: boolean) => {
    // Main building
    const grad = ctx.createLinearGradient(x, 0, x + width, 0);
    grad.addColorStop(0, '#1e293b'); // slate-800
    grad.addColorStop(0.5, '#475569'); // slate-600
    grad.addColorStop(1, '#0f172a'); // slate-900
    ctx.fillStyle = grad;
    
    ctx.shadowColor = 'rgba(0,0,0,0.4)';
    ctx.shadowBlur = 10;
    ctx.shadowOffsetX = -5;
    ctx.fillRect(x, y, width, height);
    ctx.shadowColor = 'transparent';
    
    // Roof/Base details
    ctx.fillStyle = '#334155';
    if (isTop) {
      ctx.fillRect(x - 4, y + height - 10, width + 8, 10);
    } else {
      ctx.fillRect(x - 4, y, width + 8, 10);
    }

    // Draw windows
    const windowCols = 4;
    const windowRows = Math.floor(height / 20);
    const windowWidth = 8;
    const windowHeight = 12;
    const paddingX = (width - (windowCols * windowWidth)) / (windowCols + 1);

    for(let r=0; r<windowRows; r++) {
      for(let c=0; c<windowCols; c++) {
        // Randomly skip some windows
        if (Math.sin(x * 0.1 + r * 1.5 + c * 0.8) > 0) continue;
        
        const wx = x + paddingX + c * (windowWidth + paddingX);
        const wy = isTop ? y + height - 20 - r * 20 : y + 20 + r * 20;
        
        if (wy >= y && wy + windowHeight <= y + height) {
          ctx.fillStyle = Math.sin(x * 0.3 + r * 2.1) > 0 ? '#fef08a' : '#020617';
          ctx.fillRect(wx, wy, windowWidth, windowHeight);
        }
      }
    }
  };

  const drawBackground = (ctx: CanvasRenderingContext2D, width: number, height: number, offset: number) => {
    // Sky gradient
    const skyGrad = ctx.createLinearGradient(0, 0, 0, height);
    skyGrad.addColorStop(0, '#0ea5e9'); // sky-500
    skyGrad.addColorStop(1, '#f0f9ff'); // sky-50
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, width, height);

    // Clouds
    ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
    const cloudOffset = (offset * 0.15) % width;
    for (let i = 0; i < 4; i++) {
        const cx = ((i * width / 3) - cloudOffset + width) % width - 100;
        const cy = 80 + (i * 40 % 80);
        ctx.beginPath();
        ctx.arc(cx, cy, 50, 0, Math.PI * 2);
        ctx.arc(cx + 40, cy - 25, 60, 0, Math.PI * 2);
        ctx.arc(cx + 90, cy, 50, 0, Math.PI * 2);
        ctx.fill();
    }

    // Distant city silhouette parallax layer 1
    ctx.fillStyle = '#cbd5e1'; // slate-300
    const cityOffset1 = (offset * 0.2) % width;
    for (let x = -width; x < width * 2; x += 40) {
      const cx = x - cityOffset1;
      const h = 80 + Math.abs(Math.sin(x * 0.08)) * 100;
      ctx.fillRect(cx, height - h, 40, h);
    }

    // Distant city silhouette parallax layer 2
    ctx.fillStyle = '#64748b'; // slate-500
    const cityOffset2 = (offset * 0.4) % width;
    for (let x = -width; x < width * 2; x += 70) {
      const cx = x - cityOffset2;
      const h = 50 + Math.abs(Math.cos(x * 0.04)) * 180;
      ctx.fillRect(cx, height - h, 60, h);
    }
  };

  const update = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    const state = stateRef.current;
    
    ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    
    // Auto-scroll background even in START
    if (gameState !== 'GAMEOVER') {
      state.bgOffset += PIPE_SPEED * 0.5;
    }
    
    if (gameState === 'PLAYING') {
      state.planeV += GRAVITY;
      state.planeY += state.planeV;
      
      const planeX = 200;
      
      // Move pipes
      state.pipes.forEach(pipe => {
        pipe.x -= PIPE_SPEED;
        
        // Pass pipe (score point)
        if (!pipe.passed && pipe.x + PIPE_WIDTH < planeX) {
          pipe.passed = true;
          state.score += 1;
          setScore(state.score);
        }
      });
      
      // Remove off-screen pipes & add new ones
      if (state.pipes.length > 0 && state.pipes[0].x < -PIPE_WIDTH) {
        state.pipes.shift();
        const lastPipeX = state.pipes[state.pipes.length - 1].x;
        spawnPipe(lastPipeX + PIPE_SPACING);
      }
      
      // Collision detection Hitbox approx
      const pLeft = planeX - 25;
      const pRight = planeX + 25;
      const pTop = state.planeY - 5;
      const pBottom = state.planeY + 5;
      
      let collided = false;
      
      // Floor / Ceiling collision
      if (pBottom > CANVAS_HEIGHT - 20 || pTop < 0) {
        collided = true;
      }
      
      for (const pipe of state.pipes) {
        const topPipeRect = { left: pipe.x, right: pipe.x + PIPE_WIDTH, top: 0, bottom: pipe.topHeight };
        const bottomPipeRect = { left: pipe.x, right: pipe.x + PIPE_WIDTH, top: pipe.topHeight + GAP_SIZE, bottom: CANVAS_HEIGHT };
        
        if (
          (pRight > topPipeRect.left && pLeft < topPipeRect.right && pTop < topPipeRect.bottom && pBottom > topPipeRect.top) ||
          (pRight > bottomPipeRect.left && pLeft < bottomPipeRect.right && pTop < bottomPipeRect.bottom && pBottom > bottomPipeRect.top)
        ) {
          collided = true;
        }
      }
      
      if (collided) {
        createExplosion(planeX, state.planeY);
        setGameState('GAMEOVER');
        setHighScore(prev => Math.max(prev, state.score));
      }
    } else if (gameState === 'GAMEOVER') {
      // Update explosion particles
      state.particles.forEach(p => {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += GRAVITY * 0.3; // Particles fall slower
        p.life += 1;
        p.size *= 0.96; // Shrink
      });
      state.particles = state.particles.filter(p => p.life < p.maxLife);
    }
    
    // Draw Background
    drawBackground(ctx, CANVAS_WIDTH, CANVAS_HEIGHT, state.bgOffset);
    
    // Draw Pipes (Skyscrapers)
    state.pipes.forEach(pipe => {
      drawSkyscraper(ctx, pipe.x, 0, PIPE_WIDTH, pipe.topHeight, true); // Top (hanging down)
      drawSkyscraper(ctx, pipe.x, pipe.topHeight + GAP_SIZE, PIPE_WIDTH, CANVAS_HEIGHT - (pipe.topHeight + GAP_SIZE), false); // Bottom
    });
    
    // Draw particles
    state.particles.forEach(p => {
      ctx.fillStyle = p.color;
      ctx.globalAlpha = 1 - (p.life / p.maxLife);
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1.0;
    
    // Draw plane (unless game over)
    if (gameState !== 'GAMEOVER') {
      const planeRot = gameState === 'START' ? 0 : Math.min(Math.max(state.planeV * 0.05, -0.6), 0.6);
      drawPlane(ctx, 200, state.planeY, planeRot);
    }

    requestRef.current = requestAnimationFrame(update);
  }, [gameState]);

  useEffect(() => {
    requestRef.current = requestAnimationFrame(update);
    return () => cancelAnimationFrame(requestRef.current);
  }, [update]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        e.preventDefault();
        flap();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [gameState]);

  return (
    <div className="min-h-screen bg-slate-900 font-sans flex flex-col items-center justify-center p-4 selection:bg-transparent" onClick={flap}>
      <motion.div 
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-[800px] flex justify-between items-end mb-4 text-white pointer-events-none"
      >
        <div>
          <h1 className="text-4xl font-black tracking-tight text-white drop-shadow-md">
            Aero City Flights
          </h1>
          <p className="text-slate-300 font-medium drop-shadow-sm">Spacebar or click to fly. Dodge the skyscrapers.</p>
        </div>
        
        <div className="flex gap-6 pointer-events-auto">
          <div className="flex flex-col items-end">
            <span className="text-xs font-bold uppercase tracking-widest text-slate-400">Score</span>
            <span className="text-4xl font-black leading-none drop-shadow-md">{score}</span>
          </div>
          <div className="flex flex-col items-end">
            <span className="text-xs font-bold uppercase tracking-widest text-slate-400 flex items-center gap-1">
              <Trophy size={12} /> Best
            </span>
            <span className="text-4xl font-black leading-none text-sky-400 drop-shadow-md">{highScore}</span>
          </div>
        </div>
      </motion.div>

      <div className="relative shadow-2xl rounded-2xl overflow-hidden border-4 border-slate-700/50 bg-slate-950">
        <canvas 
          ref={canvasRef}
          width={CANVAS_WIDTH}
          height={CANVAS_HEIGHT}
          className="block cursor-pointer"
        />

        <AnimatePresence>
          {gameState === 'START' && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-[2px] flex flex-col items-center justify-center text-white pointer-events-none"
            >
              <h2 className="text-6xl font-black mb-10 text-white drop-shadow-[0_4px_4px_rgba(0,0,0,0.5)]">Ready for Takeoff</h2>
              <div className="flex items-center gap-3 bg-white/20 backdrop-blur-md px-8 py-4 rounded-full font-bold text-xl uppercase tracking-widest border border-white/30 shadow-xl">
                <Play fill="currentColor" size={24} /> Click or Space to Start
              </div>
            </motion.div>
          )}

          {gameState === 'GAMEOVER' && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-red-950/60 backdrop-blur-md flex flex-col items-center justify-center text-white pointer-events-none"
            >
              <motion.div 
                initial={{ scale: 0.8, y: 10 }}
                animate={{ scale: 1, y: 0 }}
                className="flex flex-col items-center"
              >
                <h2 className="text-[80px] font-black text-red-500 mb-0 drop-shadow-[0_0_25px_rgba(239,68,68,0.8)] uppercase tracking-tighter leading-none">YOU DIED</h2>
                <div className="text-3xl text-red-100 mt-4 font-medium drop-shadow-md">Passed <span className="font-black text-white">{score}</span> Skyscrapers</div>
                
                <div className="mt-12 flex items-center gap-3 bg-red-500 hover:bg-red-400 transition-colors pointer-events-auto cursor-pointer px-8 py-4 rounded-full font-bold text-xl uppercase tracking-widest shadow-[0_0_30px_rgba(239,68,68,0.5)] text-white" onClick={(e) => { e.stopPropagation(); initGame(); }}>
                  <RotateCcw size={24} /> Try Again
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
