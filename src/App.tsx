/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { 
  Dices, Trophy, Timer, Infinity as InfinityIcon, Play, RefreshCw, 
  Camera, Upload, Edit2, Check, User, Plus, Trash2, ArrowRight, Sparkles, AlertCircle, Clock, Crown, Volume2, VolumeX
} from 'lucide-react';

type GameMode = 'TOURNAMENT' | 'UNLIMITED' | 'TIMED';
type GameState = 'SETUP' | 'PLAYING' | 'SUMMARY';

interface Player {
  id: string;
  name: string;
  score: number;
  rollsCount: number;
  photoUrl: string; // Base64 or preset avatar
}

const DEFAULT_AVATARS = [
  'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=300&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=300&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=300&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=300&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=300&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=300&auto=format&fit=crop&q=80',
];

// Web Audio API Sound Manager
class SoundManager {
  private ctx: AudioContext | null = null;
  public enabled: boolean = true;

  private getContext(): AudioContext | null {
    if (!this.enabled) return null;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  playRollSound() {
    const ctx = this.getContext();
    if (!ctx) return;
    
    // Play rattling dice sound over 1 second (multiple quick clicks/noise bursts)
    const now = ctx.currentTime;
    for (let i = 0; i < 8; i++) {
      const startTime = now + i * 0.12 + (Math.random() * 0.03);
      
      const bufferSize = ctx.sampleRate * 0.04;
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let j = 0; j < bufferSize; j++) {
        data[j] = Math.random() * 2 - 1;
      }
      
      const noise = ctx.createBufferSource();
      noise.buffer = buffer;
      
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 800 + Math.random() * 600;
      
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.3, startTime);
      gain.gain.exponentialRampToValueAtTime(0.01, startTime + 0.04);
      
      noise.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);
      
      noise.start(startTime);
    }
  }

  playLandingSound() {
    const ctx = this.getContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(180, now);
    osc.frequency.exponentialRampToValueAtTime(40, now + 0.08);

    gain.gain.setValueAtTime(0.5, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.08);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.09);
  }

  playVictorySound() {
    const ctx = this.getContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    // Triumphant arpeggio: C4, E4, G4, C5
    const notes = [261.63, 329.63, 392.00, 523.25];
    notes.forEach((freq, idx) => {
      const startTime = now + idx * 0.15;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, startTime);

      gain.gain.setValueAtTime(0.3, startTime);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.4);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(startTime);
      osc.stop(startTime + 0.45);
    });
  }
}

export const soundManager = new SoundManager();

export default function App() {
  const [gameState, setGameState] = useState<GameState>('SETUP');
  const [gameMode, setGameMode] = useState<GameMode>('TOURNAMENT');
  const [players, setPlayers] = useState<Player[]>([
    { id: '1', name: 'Player 1', score: 0, rollsCount: 0, photoUrl: DEFAULT_AVATARS[0] },
    { id: '2', name: 'Player 2', score: 0, rollsCount: 0, photoUrl: DEFAULT_AVATARS[1] },
  ]);
  
  const [currentTurnIndex, setCurrentTurnIndex] = useState(0);
  const [isRolling, setIsRolling] = useState(false);
  const [currentRollResult, setCurrentRollResult] = useState<number | null>(null);
  const [diceRotation, setDiceRotation] = useState({ x: 0, y: 0 });
  const [timedDuration, setTimedDuration] = useState<number>(60); // Default 1 min (60s)
  const [timeLeft, setTimeLeft] = useState<number>(60); 
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);

  const timerRef = useRef<number | null>(null);

  // Sync sound manager enabled state
  useEffect(() => {
    soundManager.enabled = soundEnabled;
  }, [soundEnabled]);

  // Handle Timed mode countdown
  useEffect(() => {
    if (gameState === 'PLAYING' && gameMode === 'TIMED') {
      timerRef.current = window.setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) {
            if (timerRef.current) clearInterval(timerRef.current);
            endGame();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [gameState, gameMode]);

  const addPlayer = () => {
    if (players.length >= 6) return;
    const newId = String(players.length + 1);
    const avatar = DEFAULT_AVATARS[players.length % DEFAULT_AVATARS.length];
    setPlayers([...players, { id: newId, name: `Player ${newId}`, score: 0, rollsCount: 0, photoUrl: avatar }]);
  };

  const removePlayer = (id: string) => {
    if (players.length <= 2) return;
    setPlayers(players.filter(p => p.id !== id));
    if (currentTurnIndex >= players.length - 1) {
      setCurrentTurnIndex(0);
    }
  };

  const updatePlayerName = (id: string, name: string) => {
    setPlayers(players.map(p => p.id === id ? { ...p, name } : p));
  };

  const handlePhotoUpload = (id: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setPlayers(players.map(p => p.id === id ? { ...p, photoUrl: reader.result as string } : p));
      };
      reader.readAsDataURL(file);
    }
  };

  const startGame = () => {
    // Reset scores & turns
    setPlayers(players.map(p => ({ ...p, score: 0, rollsCount: 0 })));
    setCurrentTurnIndex(0);
    setCurrentRollResult(null);
    setTimeLeft(timedDuration);
    setGameState('PLAYING');
  };

  const rollDice = () => {
    if (isRolling) return;
    if (gameMode === 'TIMED' && timeLeft <= 0) return;

    setIsRolling(true);

    // Play dice rolling sound effect once per valid roll
    soundManager.playRollSound();

    // Capture rolling player index strictly at roll initiation
    const rollingPlayerIndex = currentTurnIndex;

    // CRITICAL: Generate authoritative roll result exactly once (1 to 6)
    const authoritativeRoll = Math.floor(Math.random() * 6) + 1;

    // Face rotations mapped precisely so visible top/front face matches authoritativeRoll (1 to 6)
    const baseRotations: Record<number, { x: number; y: number }> = {
      1: { x: 0, y: 0 },
      2: { x: 0, y: 180 },
      3: { x: 0, y: -90 },
      4: { x: 0, y: 90 },
      5: { x: -90, y: 0 },
      6: { x: 90, y: 0 },
    };

    const targetRot = baseRotations[authoritativeRoll];
    const extraSpinsX = 360 * (3 + Math.floor(Math.random() * 2));
    const extraSpinsY = 360 * (3 + Math.floor(Math.random() * 2));

    setDiceRotation({
      x: targetRot.x + extraSpinsX,
      y: targetRot.y + extraSpinsY,
    });

    // Complete roll after animation (1000ms)
    setTimeout(() => {
      // Play dice landing / click sound when animation finishes
      soundManager.playLandingSound();

      setCurrentRollResult(authoritativeRoll);
      setIsRolling(false);

      // Update player score and rolls count exactly once for the rolling player
      setPlayers(prevPlayers => {
        const updated = prevPlayers.map((p, idx) => {
          if (idx === rollingPlayerIndex) {
            return {
              ...p,
              score: p.score + authoritativeRoll,
              rollsCount: p.rollsCount + 1,
            };
          }
          return p;
        });

        // Check tournament limit (exactly 10 total rolls across the match)
        if (gameMode === 'TOURNAMENT') {
          const totalMatchRolls = updated.reduce((sum, p) => sum + p.rollsCount, 0);
          if (totalMatchRolls >= 10) {
            setTimeout(() => endGame(updated), 0);
          } else {
            setCurrentTurnIndex((rollingPlayerIndex + 1) % updated.length);
          }
        } else {
          // Advance turn to next player for Unlimited / Timed mode
          setCurrentTurnIndex((rollingPlayerIndex + 1) % updated.length);
        }

        return updated;
      });

    }, 1000);
  };

  const endGame = (customPlayers?: Player[]) => {
    if (timerRef.current) clearInterval(timerRef.current);
    // Play victory celebration sound once when match ends
    soundManager.playVictorySound();
    setGameState('SUMMARY');
  };

  // Helper to render dice faces
  const renderDiceFace = (faceNum: number) => {
    const dots: Record<number, number[]> = {
      1: [4],
      2: [0, 8],
      3: [0, 4, 8],
      4: [0, 2, 6, 8],
      5: [0, 2, 4, 6, 8],
      6: [0, 2, 3, 5, 6, 8],
    };

    return (
      <div className="w-full h-full bg-gradient-to-br from-slate-900 to-purple-950 rounded-xl border-2 border-purple-500/60 shadow-[inset_0_0_15px_rgba(168,85,247,0.3)] grid grid-cols-3 grid-rows-3 p-3 items-center justify-items-center">
        {Array.from({ length: 9 }).map((_, idx) => (
          <div key={idx} className="w-3.5 h-3.5 flex items-center justify-center">
            {dots[faceNum]?.includes(idx) && (
              <div className="w-3 h-3 rounded-full bg-gradient-to-r from-pink-400 to-purple-400 shadow-[0_0_8px_rgba(236,72,153,0.8)]" />
            )}
          </div>
        ))}
      </div>
    );
  };

  // Format mm:ss for timer
  const formatTime = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const remainSecs = secs % 60;
    return `${mins}:${remainSecs < 10 ? '0' : ''}${remainSecs}`;
  };

  const totalMatchRollsCount = players.reduce((sum, p) => sum + p.rollsCount, 0);

  // Calculate winners dynamically for the celebration screen
  let maxScore = -1;
  let winners: Player[] = [];
  players.forEach(p => {
    if (p.score > maxScore) {
      maxScore = p.score;
      winners = [p];
    } else if (p.score === maxScore) {
      winners.push(p);
    }
  });

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-between font-sans selection:bg-purple-500 selection:text-white overflow-x-hidden antialiased relative">
      {/* Background neon ambient lights */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-purple-900/15 rounded-full blur-[120px]" />
        <div className="absolute bottom-10 right-10 w-[350px] h-[350px] bg-pink-900/10 rounded-full blur-[100px]" />
      </div>

      {/* Top Bar */}
      <header className="w-full max-w-4xl px-4 py-4 flex items-center justify-between border-b border-purple-500/20 backdrop-blur-md bg-slate-950/80 sticky top-0 z-30">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-purple-600 to-pink-600 flex items-center justify-center shadow-lg shadow-purple-500/30">
            <Dices className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight bg-gradient-to-r from-white via-purple-200 to-pink-300 bg-clip-text text-transparent">
              Universal Match Dice Battle
            </h1>
            <p className="text-xs text-purple-300/70">
              {gameMode === 'TOURNAMENT' && `Tournament Mode (${totalMatchRollsCount}/10 Rolls)`}
              {gameMode === 'UNLIMITED' && 'Unlimited Mode'}
              {gameMode === 'TIMED' && `Timed Mode (${formatTime(timeLeft)} remaining)`}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {gameState === 'PLAYING' && (
            <button
              onClick={() => setGameState('SETUP')}
              className="px-3 py-1.5 rounded-lg border border-purple-500/30 text-xs font-medium text-purple-300 hover:bg-purple-950/50 transition-colors flex items-center gap-1.5"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Restart</span>
            </button>
          )}

          {/* Sound On / Off Toggle Button */}
          <button
            onClick={() => setSoundEnabled(!soundEnabled)}
            className="w-9 h-9 rounded-xl border border-purple-500/30 flex items-center justify-center text-purple-300 hover:bg-purple-950/50 transition-colors"
            title={soundEnabled ? 'Mute Sound' : 'Enable Sound'}
          >
            {soundEnabled ? <Volume2 className="w-4 h-4 text-pink-400" /> : <VolumeX className="w-4 h-4 text-slate-500" />}
          </button>
        </div>
      </header>

      {/* Main Content Container */}
      <main className="w-full max-w-4xl flex-1 px-4 py-6 flex flex-col justify-center items-center z-10">
        
        {/* --- SETUP SCREEN --- */}
        {gameState === 'SETUP' && (
          <div className="w-full max-w-xl bg-slate-900/60 backdrop-blur-xl border border-purple-500/30 rounded-3xl p-6 md:p-8 shadow-2xl space-y-6">
            <div className="text-center space-y-2">
              <h2 className="text-2xl font-bold bg-gradient-to-r from-white to-purple-200 bg-clip-text text-transparent">
                Configure Match
              </h2>
              <p className="text-sm text-slate-400">
                Choose your game mode and customize 2 to 6 players.
              </p>
            </div>

            {/* Game Mode Selector */}
            <div className="space-y-3">
              <label className="text-xs font-semibold uppercase tracking-wider text-purple-300">Game Mode</label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setGameMode('TOURNAMENT')}
                  className={`p-3 rounded-2xl border text-xs font-medium flex flex-col items-center gap-2 transition-all ${
                    gameMode === 'TOURNAMENT'
                      ? 'bg-purple-600/30 border-purple-500 text-white shadow-lg shadow-purple-500/20'
                      : 'bg-slate-950/40 border-purple-500/20 text-slate-400 hover:text-white'
                  }`}
                >
                  <Trophy className="w-5 h-5 text-purple-400" />
                  <span>Tournament</span>
                </button>
                <button
                  type="button"
                  onClick={() => setGameMode('UNLIMITED')}
                  className={`p-3 rounded-2xl border text-xs font-medium flex flex-col items-center gap-2 transition-all ${
                    gameMode === 'UNLIMITED'
                      ? 'bg-purple-600/30 border-purple-500 text-white shadow-lg shadow-purple-500/20'
                      : 'bg-slate-950/40 border-purple-500/20 text-slate-400 hover:text-white'
                  }`}
                >
                  <InfinityIcon className="w-5 h-5 text-pink-400" />
                  <span>Unlimited</span>
                </button>
                <button
                  type="button"
                  onClick={() => setGameMode('TIMED')}
                  className={`p-3 rounded-2xl border text-xs font-medium flex flex-col items-center gap-2 transition-all ${
                    gameMode === 'TIMED'
                      ? 'bg-purple-600/30 border-purple-500 text-white shadow-lg shadow-purple-500/20'
                      : 'bg-slate-950/40 border-purple-500/20 text-slate-400 hover:text-white'
                  }`}
                >
                  <Timer className="w-5 h-5 text-purple-300" />
                  <span>Timed Game</span>
                </button>
              </div>

              {/* Relevant mode-specific settings (Show only settings relevant to selected mode) */}
              {gameMode === 'TOURNAMENT' && (
                <div className="bg-purple-950/40 border border-purple-500/30 p-3 rounded-xl text-xs text-purple-200 flex items-center gap-2">
                  <Trophy className="w-4 h-4 text-purple-400 shrink-0" />
                  <span>Tournament Rules: Exactly 10 total rolls per match, then winner is determined.</span>
                </div>
              )}

              {gameMode === 'UNLIMITED' && (
                <div className="bg-purple-950/40 border border-purple-500/30 p-3 rounded-xl text-xs text-purple-200 flex items-center gap-2">
                  <InfinityIcon className="w-4 h-4 text-pink-400 shrink-0" />
                  <span>Unlimited Rules: Continue rolling freely until you manually end the game.</span>
                </div>
              )}

              {gameMode === 'TIMED' && (
                <div className="space-y-2 bg-purple-950/40 border border-purple-500/30 p-3 rounded-xl">
                  <div className="flex items-center gap-2 text-xs font-semibold text-purple-200 mb-1">
                    <Clock className="w-4 h-4 text-pink-400" />
                    <span>Select Timed Duration</span>
                  </div>
                  <div className="grid grid-cols-4 gap-2">
                    {[
                      { label: '1 Min', secs: 60 },
                      { label: '3 Min', secs: 180 },
                      { label: '5 Min', secs: 300 },
                      { label: '10 Min', secs: 600 },
                    ].map((opt) => (
                      <button
                        key={opt.secs}
                        type="button"
                        onClick={() => {
                          setTimedDuration(opt.secs);
                          setTimeLeft(opt.secs);
                        }}
                        className={`py-2 rounded-xl border text-xs font-medium transition-all ${
                          timedDuration === opt.secs
                            ? 'bg-pink-600/40 border-pink-500 text-white shadow'
                            : 'bg-slate-900/60 border-purple-500/20 text-slate-300 hover:text-white'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Players Setup */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold uppercase tracking-wider text-purple-300">
                  Players ({players.length}/6)
                </label>
                {players.length < 6 && (
                  <button
                    onClick={addPlayer}
                    className="text-xs font-medium text-pink-400 hover:text-pink-300 flex items-center gap-1 bg-pink-950/40 border border-pink-500/30 px-2.5 py-1 rounded-lg transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Player</span>
                  </button>
                )}
              </div>

              <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1">
                {players.map((player, idx) => (
                  <div key={player.id} className="flex items-center gap-3 bg-slate-950/60 p-3 rounded-2xl border border-purple-500/20">
                    {/* Photo Frame & Upload */}
                    <div className="relative w-14 h-14 rounded-xl overflow-hidden shrink-0 border border-purple-500/40 bg-purple-900/30 group">
                      <img
                        src={player.photoUrl}
                        alt={player.name}
                        className="w-full h-full object-cover scale-[0.78]"
                        referrerPolicy="no-referrer"
                      />
                      <label className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center cursor-pointer text-[10px] text-white">
                        <Camera className="w-4 h-4 mb-0.5 text-purple-300" />
                        <span>Edit</span>
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => handlePhotoUpload(player.id, e)}
                        />
                      </label>
                    </div>

                    {/* Name Input */}
                    <div className="flex-1">
                      <input
                        type="text"
                        value={player.name}
                        onChange={(e) => updatePlayerName(player.id, e.target.value)}
                        placeholder={`Player ${idx + 1}`}
                        className="w-full bg-slate-900 border border-purple-500/30 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-400"
                      />
                    </div>

                    {/* Remove button if > 2 */}
                    {players.length > 2 && (
                      <button
                        onClick={() => removePlayer(player.id)}
                        className="p-2 text-slate-500 hover:text-pink-400 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Start CTA */}
            <button
              onClick={startGame}
              className="w-full h-12 bg-gradient-to-r from-purple-600 via-fuchsia-600 to-pink-600 text-white font-semibold rounded-2xl shadow-lg shadow-purple-600/30 hover:opacity-95 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
            >
              <Play className="w-5 h-5 fill-current" />
              <span>Start Dice Battle</span>
            </button>
          </div>
        )}

        {/* --- PLAYING SCREEN --- */}
        {gameState === 'PLAYING' && (
          <div className="w-full max-w-3xl flex flex-col items-center space-y-6">
            
            {/* Timer for Timed mode */}
            {gameMode === 'TIMED' && (
              <div className="flex items-center gap-2 bg-purple-950/60 border border-purple-500/40 px-4 py-1.5 rounded-full text-xs font-semibold text-purple-200">
                <Timer className="w-4 h-4 text-pink-400 animate-pulse" />
                <span>Time Remaining: {formatTime(timeLeft)}</span>
              </div>
            )}

            {gameMode === 'TOURNAMENT' && (
              <div className="flex items-center gap-2 bg-purple-950/60 border border-purple-500/40 px-4 py-1.5 rounded-full text-xs font-semibold text-purple-200">
                <Trophy className="w-4 h-4 text-purple-400" />
                <span>Tournament Progress: {totalMatchRollsCount} / 10 Rolls</span>
              </div>
            )}

            {/* Player Cards (Responsive 2 to 6 players, 2-column or grid) */}
            <div className={`w-full grid gap-3 ${players.length === 2 ? 'grid-cols-2' : players.length <= 4 ? 'grid-cols-2 md:grid-cols-4' : 'grid-cols-2 md:grid-cols-3'}`}>
              {players.map((player, idx) => {
                const isCurrentTurn = idx === currentTurnIndex;
                return (
                  <div
                    key={player.id}
                    className={`relative bg-slate-900/80 backdrop-blur-md rounded-2xl p-3 border transition-all duration-300 flex flex-col items-center text-center ${
                      isCurrentTurn
                        ? 'border-pink-500 shadow-[0_0_20px_rgba(236,72,153,0.35)] ring-2 ring-pink-500/50 scale-[1.02]'
                        : 'border-purple-500/30'
                    }`}
                  >
                    {/* Turn Indicator Badge */}
                    {isCurrentTurn && (
                      <span className="absolute -top-2.5 bg-gradient-to-r from-purple-600 to-pink-600 text-white text-[10px] font-bold px-2.5 py-0.5 rounded-full shadow">
                        CURRENT TURN
                      </span>
                    )}

                    {/* Large Square Photo Frame (fills at least 75% with object-cover) */}
                    <div className="w-full aspect-square rounded-xl overflow-hidden relative border border-purple-500/30 bg-purple-950/40 mb-2">
                      <img
                        src={player.photoUrl}
                        alt={player.name}
                        className="w-full h-full object-cover scale-[0.78]"
                        referrerPolicy="no-referrer"
                      />
                    </div>

                    {/* Name & Score */}
                    <h3 className="font-bold text-sm text-white truncate w-full">{player.name}</h3>
                    <div className="mt-1 flex items-baseline justify-center gap-1">
                      <span className="text-2xl font-black bg-gradient-to-r from-white via-purple-200 to-pink-300 bg-clip-text text-transparent">
                        {player.score}
                      </span>
                      <span className="text-[10px] text-purple-300/70 uppercase">pts</span>
                    </div>

                    <span className="text-[10px] text-slate-400 mt-1">
                      Rolls: {player.rollsCount}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Central 3D Dice Game Area */}
            <div className="w-full bg-slate-900/40 backdrop-blur-xl border border-purple-500/20 rounded-3xl p-6 flex flex-col items-center justify-center relative min-h-[260px] shadow-xl">
              
              <div className="text-xs font-semibold uppercase tracking-wider text-purple-300 mb-4">
                {players[currentTurnIndex]?.name}'s Turn
              </div>

              {/* 3D Dice Container */}
              <div className="perspective-1000 w-24 h-24 my-2 flex items-center justify-center">
                <div
                  className="w-20 h-20 relative transition-transform duration-1000 ease-out"
                  style={{
                    transformStyle: 'preserve-3d',
                    transform: `rotateX(${diceRotation.x}deg) rotateY(${diceRotation.y}deg)`,
                  }}
                >
                  {/* Face 1 */}
                  <div className="absolute inset-0 flex items-center justify-center" style={{ transform: 'rotateX(0deg) rotateY(0deg) translateZ(40px)' }}>
                    {renderDiceFace(1)}
                  </div>
                  {/* Face 2 */}
                  <div className="absolute inset-0 flex items-center justify-center" style={{ transform: 'rotateX(0deg) rotateY(180deg) translateZ(40px)' }}>
                    {renderDiceFace(2)}
                  </div>
                  {/* Face 3 */}
                  <div className="absolute inset-0 flex items-center justify-center" style={{ transform: 'rotateX(0deg) rotateY(90deg) translateZ(40px)' }}>
                    {renderDiceFace(3)}
                  </div>
                  {/* Face 4 */}
                  <div className="absolute inset-0 flex items-center justify-center" style={{ transform: 'rotateX(0deg) rotateY(-90deg) translateZ(40px)' }}>
                    {renderDiceFace(4)}
                  </div>
                  {/* Face 5 */}
                  <div className="absolute inset-0 flex items-center justify-center" style={{ transform: 'rotateX(90deg) rotateY(0deg) translateZ(40px)' }}>
                    {renderDiceFace(5)}
                  </div>
                  {/* Face 6 */}
                  <div className="absolute inset-0 flex items-center justify-center" style={{ transform: 'rotateX(-90deg) rotateY(0deg) translateZ(40px)' }}>
                    {renderDiceFace(6)}
                  </div>
                </div>
              </div>

              {/* Latest Roll Result Display */}
              <div className="h-8 mt-2 flex items-center justify-center">
                {currentRollResult !== null && !isRolling && (
                  <div className="text-sm font-medium text-pink-300 animate-fade-in flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4 text-pink-400" />
                    <span>Rolled a <strong className="text-white text-base">{currentRollResult}</strong>! (+{currentRollResult} pts)</span>
                  </div>
                )}
                {isRolling && (
                  <div className="text-sm font-medium text-purple-300 animate-pulse">
                    Rolling dice...
                  </div>
                )}
              </div>

              {/* Small Circular Roll Button */}
              <div className="mt-4 flex items-center justify-center">
                <button
                  onClick={rollDice}
                  disabled={isRolling || (gameMode === 'TIMED' && timeLeft <= 0)}
                  className={`w-16 h-16 rounded-full bg-gradient-to-r from-purple-600 via-fuchsia-600 to-pink-600 text-white flex items-center justify-center shadow-xl shadow-purple-600/50 hover:scale-105 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
                    isRolling ? 'animate-spin' : ''
                  }`}
                  aria-label="Roll Dice"
                >
                  <Dices className="w-8 h-8 text-white" />
                </button>
              </div>

            </div>

            {/* Manual End Game Button for Unlimited */}
            {gameMode === 'UNLIMITED' && (
              <button
                onClick={() => endGame()}
                className="px-6 py-2.5 rounded-xl border border-purple-500/30 text-xs font-semibold text-purple-300 hover:bg-purple-950/50 transition-colors"
              >
                Finish Game & Determine Winner
              </button>
            )}

          </div>
        )}

        {/* --- UPGRADED PREMIUM WINNER CELEBRATION SCREEN --- */}
        {gameState === 'SUMMARY' && (
          <div className="w-full max-w-xl md:max-w-2xl relative">
            {/* Falling Confetti / Sparkles Animation Overlay */}
            <div className="absolute inset-0 pointer-events-none overflow-hidden z-20">
              {Array.from({ length: 30 }).map((_, i) => {
                const randomLeft = Math.floor(Math.random() * 100);
                const randomDelay = (Math.random() * 3).toFixed(2);
                const randomDuration = (2.5 + Math.random() * 2).toFixed(2);
                const colors = ['bg-amber-400', 'bg-purple-400', 'bg-pink-500', 'bg-fuchsia-400', 'bg-yellow-300'];
                const colorClass = colors[i % colors.length];
                return (
                  <div
                    key={i}
                    className={`absolute top-0 w-2.5 h-3.5 rounded-sm ${colorClass} animate-confetti opacity-80`}
                    style={{
                      left: `${randomLeft}%`,
                      animationDelay: `${randomDelay}s`,
                      animationDuration: `${randomDuration}s`,
                    }}
                  />
                );
              })}
            </div>

            {/* Cinematic Spotlight Glow */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-80 h-80 bg-gradient-to-r from-amber-500/25 via-purple-600/30 to-pink-500/25 rounded-full blur-3xl pointer-events-none" />

            {/* Celebration Card Container */}
            <div className="relative z-10 bg-slate-900/90 backdrop-blur-2xl border border-purple-500/50 rounded-3xl p-6 md:p-10 shadow-[0_0_50px_rgba(168,85,247,0.35)] text-center space-y-8">
              
              {/* Animated Header & Crown */}
              <div className="space-y-3">
                <div className="inline-flex items-center justify-center w-20 h-20 rounded-3xl bg-gradient-to-tr from-amber-500 via-yellow-400 to-amber-300 shadow-[0_0_30px_rgba(245,158,11,0.6)] animate-float">
                  <Crown className="w-10 h-10 text-slate-950 fill-amber-300" />
                </div>
                <h2 className="text-3xl md:text-4xl font-black tracking-wider uppercase bg-gradient-to-r from-amber-300 via-pink-300 to-purple-300 bg-clip-text text-transparent animate-pulse">
                  {winners.length > 1 ? "It's a Tie!" : "VICTORY!"}
                </h2>
                <p className="text-sm text-purple-200/80">
                  {winners.length > 1 
                    ? `Multiple champions share the glory!` 
                    : `The ultimate dice master has emerged!`}
                </p>
              </div>

              {/* Winner Featured Card(s) with Large Photo Frame & Crown */}
              <div className={`grid gap-6 ${winners.length === 1 ? 'grid-cols-1 max-w-sm mx-auto' : 'grid-cols-2'}`}>
                {winners.map((winner) => (
                  <div key={winner.id} className="relative bg-slate-950/80 border-2 border-amber-400/80 rounded-3xl p-6 shadow-[0_0_35px_rgba(245,158,11,0.3)] flex flex-col items-center group">
                    
                    {/* Floating mini crown on photo */}
                    <div className="absolute -top-4 w-10 h-10 rounded-full bg-amber-400 border-2 border-slate-950 flex items-center justify-center shadow-lg z-20">
                      <Crown className="w-6 h-6 text-slate-950 fill-slate-950" />
                    </div>

                    {/* Increased Winner Photo Frame (180px on mobile, 220px on desktop) filling 88% with object-cover */}
                    <div className="w-[180px] h-[180px] md:w-[220px] md:h-[220px] rounded-3xl overflow-hidden relative border-2 border-amber-400/70 bg-purple-950/50 mb-4 shadow-inner">
                      <img
                        src={winner.photoUrl}
                        alt={winner.name}
                        className="w-full h-full object-cover scale-[0.88]"
                        referrerPolicy="no-referrer"
                      />
                    </div>

                    {/* Winner Name & Score */}
                    <h3 className="text-xl font-bold text-white truncate w-full">{winner.name}</h3>
                    <div className="mt-1 flex items-baseline justify-center gap-1">
                      <span className="text-3xl md:text-4xl font-black bg-gradient-to-r from-amber-300 via-pink-300 to-purple-300 bg-clip-text text-transparent">
                        {winner.score}
                      </span>
                      <span className="text-xs text-purple-300 uppercase font-semibold">pts</span>
                    </div>
                    <span className="text-xs text-slate-400 mt-1">Total Rolls: {winner.rollsCount}</span>
                  </div>
                ))}
              </div>

              {/* Final Standings Leaderboard */}
              <div className="space-y-3 text-left">
                <label className="text-xs font-semibold uppercase tracking-wider text-purple-300 block text-center md:text-left">
                  Final Match Standings
                </label>
                <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
                  {[...players].sort((a, b) => b.score - a.score).map((p, idx) => {
                    const isWinner = winners.some(w => w.id === p.id);
                    return (
                      <div 
                        key={p.id} 
                        className={`flex items-center justify-between p-3.5 rounded-2xl border transition-all ${
                          isWinner 
                            ? 'bg-amber-950/30 border-amber-400/50 shadow-[0_0_15px_rgba(245,158,11,0.15)]' 
                            : 'bg-slate-950/60 border-purple-500/20'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <span className={`text-xs font-bold w-6 text-center py-1 rounded-lg ${
                            idx === 0 ? 'bg-amber-400 text-slate-950' : idx === 1 ? 'bg-slate-300 text-slate-950' : idx === 2 ? 'bg-amber-700 text-white' : 'bg-slate-800 text-slate-300'
                          }`}>
                            #{idx + 1}
                          </span>
                          <div className="w-10 h-10 rounded-xl overflow-hidden border border-purple-500/30 bg-purple-950/50 shrink-0">
                            <img src={p.photoUrl} alt={p.name} className="w-full h-full object-cover scale-[0.78]" referrerPolicy="no-referrer" />
                          </div>
                          <div>
                            <span className="text-sm font-semibold text-white block">{p.name}</span>
                            <span className="text-[10px] text-purple-300/70">Rolls: {p.rollsCount}</span>
                          </div>
                        </div>
                        <div className="text-right">
                          <span className="text-base font-black text-pink-300">{p.score}</span>
                          <span className="text-[10px] text-purple-300/70 ml-1 uppercase">pts</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Prominent Gradient Play Again CTA Button */}
              <button
                onClick={() => setGameState('SETUP')}
                className="w-full h-14 bg-gradient-to-r from-purple-600 via-fuchsia-600 to-pink-600 text-white font-bold text-base rounded-2xl shadow-xl shadow-purple-600/50 hover:opacity-95 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
              >
                <RefreshCw className="w-5 h-5" />
                <span>Play Again</span>
              </button>

            </div>
          </div>
        )}

      </main>

      {/* Footer */}
      <footer className="w-full max-w-4xl px-4 py-4 text-center text-xs text-purple-300/50">
        Universal Match Dice Battle · Neon Edition
      </footer>
    </div>
  );
}
