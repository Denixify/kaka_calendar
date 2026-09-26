import { useEffect, useRef, useState, useCallback } from "react";
import { doc, updateDoc, increment } from "firebase/firestore";
import { db } from "../../firebase";

const GRAVITY = 0.4;
const JUMP = -10;
const PLATFORM_W = 66;
const PLATFORM_H = 12;

const initPlatforms = () => {
  const arr = [];
  for (let i = 0; i < 7; i++) {
    arr.push({
      x: Math.random() * (320 - PLATFORM_W),
      y: 450 - i * 80,
    });
  }
  return arr;
};

interface DoodleTurdProps {
  userId: string;
  highScore: number;
  onClose: () => void;
  onRecordBreak?: (newScore: number) => void;
}

export function DoodleTurd({
  userId,
  highScore,
  onClose,
  onRecordBreak,
}: DoodleTurdProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [score, setScore] = useState(0);
  const [isGameOver, setIsGameOver] = useState(false);
  const [isStarted, setIsStarted] = useState(false);

  const gameState = useRef({
    x: 160,
    y: 250,
    vx: 0,
    vy: 0,
    platforms: [] as { x: number; y: number }[],
    score: 0,
    isMovingLeft: false,
    isMovingRight: false,
  });

  const isNewRecord = score > highScore;

  const handleGameOver = useCallback(() => {
    setIsGameOver(true);
    const finalScore = gameState.current.score;
    if (finalScore > highScore) {
      updateDoc(doc(db, "users", userId), {
        doodleHighScore: finalScore,
        balance: increment(2),
      }).catch(console.error);
      if (onRecordBreak) onRecordBreak(finalScore);
    }
  }, [highScore, onRecordBreak, userId]);

  useEffect(() => {
    if (!isStarted || isGameOver) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    let animationId: number;

    const loop = () => {
      const state = gameState.current;

      if (state.isMovingLeft) state.vx -= 1.5;
      if (state.isMovingRight) state.vx += 1.5;

      state.vx *= 0.82;
      state.x += state.vx;

      if (state.x < -30) state.x = 320;
      if (state.x > 320) state.x = -30;

      state.vy += GRAVITY;
      state.y += state.vy;

      if (state.vy > 0) {
        state.platforms.forEach((p) => {
          if (
            state.x + 25 > p.x &&
            state.x + 5 < p.x + PLATFORM_W &&
            state.y + 30 >= p.y &&
            state.y + 30 <= p.y + PLATFORM_H + 15
          ) {
            state.vy = JUMP;
          }
        });
      }

      if (state.y < 200) {
        const diff = 200 - state.y;
        state.y = 200;
        state.score += Math.floor(diff);
        setScore(state.score);

        state.platforms.forEach((p) => {
          p.y += diff;
        });

        state.platforms.forEach((p) => {
          if (p.y > 500) {
            const minY = Math.min(...state.platforms.map((plat) => plat.y));
            p.y = minY - (Math.random() * 30 + 65);
            p.x = Math.random() * (320 - PLATFORM_W);
          }
        });
      }

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      ctx.strokeStyle = "#e2e8f0";
      ctx.lineWidth = 2;

      const offset = state.score % 40;
      for (let i = 0; i < canvas.width; i += 40) {
        ctx.beginPath();
        ctx.moveTo(i, 0);
        ctx.lineTo(i, canvas.height);
        ctx.stroke();
      }
      for (let i = -offset; i < canvas.height; i += 40) {
        ctx.beginPath();
        ctx.moveTo(0, i);
        ctx.lineTo(canvas.width, i);
        ctx.stroke();
      }

      state.platforms.forEach((p) => {
        ctx.fillStyle = "rgba(0, 0, 0, 0.12)";
        ctx.beginPath();
        ctx.roundRect(p.x + 4, p.y + 6, PLATFORM_W, PLATFORM_H, 6);
        ctx.fill();

        const grad = ctx.createLinearGradient(p.x, p.y, p.x, p.y + PLATFORM_H);
        grad.addColorStop(0, "#f59e0b");
        grad.addColorStop(1, "#b45309");
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.roundRect(p.x, p.y, PLATFORM_W, PLATFORM_H, 6);
        ctx.fill();

        ctx.save();
        ctx.fillStyle = "#000000";
        ctx.shadowColor = "transparent";
        ctx.shadowBlur = 0;
        ctx.shadowOffsetY = 0;
        ctx.font = "26px Arial";
        ctx.fillText("🧻", p.x + PLATFORM_W / 2 - 13, p.y + 4);
        ctx.restore();
      });

      ctx.save();
      ctx.fillStyle = "#000000";
      ctx.shadowColor = "transparent";
      ctx.shadowBlur = 0;
      ctx.shadowOffsetY = 0;
      ctx.font = "34px Arial";
      ctx.fillText("💩", state.x, state.y + 30);
      ctx.restore();

      if (state.y > 500) {
        handleGameOver();
        return;
      }

      animationId = requestAnimationFrame(loop);
    };

    animationId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animationId);
  }, [isStarted, isGameOver, handleGameOver]);

  const updateDirection = (e: React.PointerEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const clickX = e.clientX - rect.left;
    if (clickX < rect.width / 2) {
      gameState.current.isMovingLeft = true;
      gameState.current.isMovingRight = false;
    } else {
      gameState.current.isMovingRight = true;
      gameState.current.isMovingLeft = false;
    }
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    if (!isStarted) {
      gameState.current.platforms = initPlatforms();
      gameState.current.vy = JUMP;
      gameState.current.vx = 0;
      setIsStarted(true);
      return;
    }
    updateDirection(e);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isStarted || isGameOver) return;
    if (gameState.current.isMovingLeft || gameState.current.isMovingRight) {
      updateDirection(e);
    }
  };

  const handlePointerUp = () => {
    gameState.current.isMovingLeft = false;
    gameState.current.isMovingRight = false;
  };

  const restart = () => {
    gameState.current = {
      x: 160,
      y: 250,
      vx: 0,
      vy: 0,
      platforms: initPlatforms(),
      score: 0,
      isMovingLeft: false,
      isMovingRight: false,
    };
    setScore(0);
    setIsGameOver(false);
    setIsStarted(true);
  };

  return (
    <div className="pt-modal pt-game-modal">
      <div className="pt-details-header pt-game-header">
        <button className="pt-back-btn pt-back-btn--game" onClick={onClose}>
          ← Назад
        </button>
        <div className="pt-game-title-group">
          <h3 className="pt-game-title">Doodle Turd</h3>
          <div className="pt-game-score pt-game-score--doodle">{score}</div>
        </div>
      </div>

      <div className="pt-game-canvas-wrap pt-game-canvas-wrap--doodle">
        <canvas
          ref={canvasRef}
          width={320}
          height={500}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerOut={handlePointerUp}
          className="pt-game-canvas pt-game-canvas--doodle"
        />

        {!isStarted && !isGameOver && (
          <div className="pt-game-overlay-start">
            <div className="pt-game-overlay-icon">💩</div>
            <p className="pt-game-overlay-text pt-game-overlay-text--doodle">
              Тапни слева или справа
              <br />
              (можно просто водить пальцем)
            </p>
          </div>
        )}

        {isGameOver && (
          <div className="pt-game-overlay-end">
            <div className="pt-game-end-box">
              <h3 className="pt-game-end-title">Упал на кафель! 💥</h3>
              {isNewRecord ? (
                <div className="pt-game-new-record pt-game-new-record--doodle">
                  🔥 НОВЫЙ РЕКОРД: {score} 🔥
                </div>
              ) : (
                <p className="pt-game-end-text">
                  Счет: <strong>{score}</strong>
                  <br />
                  <span className="pt-game-end-sub">Рекорд: {highScore}</span>
                </p>
              )}
              <button
                className="pt-btn pt-btn--action pt-btn--gradient"
                onClick={restart}
              >
                Сыграть еще
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
