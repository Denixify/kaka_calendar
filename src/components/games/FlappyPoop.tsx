import { useEffect, useRef, useState, useCallback } from "react";
import { doc, updateDoc, increment } from "firebase/firestore";
import { db } from "../../firebase";

const GRAVITY = 0.5;
const JUMP = -8;
const PIPE_WIDTH = 56;
const PIPE_SPEED = 3;
const GAP = 145;

interface FlappyPoopProps {
  userId: string;
  highScore: number;
  onClose: () => void;
  onRecordBreak?: (newScore: number) => void;
}

export function FlappyPoop({
  userId,
  highScore,
  onClose,
  onRecordBreak,
}: FlappyPoopProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [score, setScore] = useState(0);
  const [isGameOver, setIsGameOver] = useState(false);
  const [isStarted, setIsStarted] = useState(false);

  const gameState = useRef({
    poopY: 250,
    velocity: 0,
    pipes: [] as {
      x: number;
      topHeight: number;
      bottomY: number;
      passed: boolean;
    }[],
    frames: 0,
    score: 0,
  });

  const isNewRecord = score > highScore;

  const handleGameOver = useCallback(() => {
    setIsGameOver(true);
    const finalScore = gameState.current.score;
    if (finalScore > highScore) {
      updateDoc(doc(db, "users", userId), {
        flappyHighScore: finalScore,
        balance: increment(2),
      }).catch(console.error);
      if (onRecordBreak) onRecordBreak(finalScore);
    }
  }, [highScore, onRecordBreak, userId]);

  useEffect(() => {
    if (!isStarted || isGameOver) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationId: number;

    const loop = () => {
      const state = gameState.current;
      state.velocity += GRAVITY;
      state.poopY += state.velocity;
      state.frames++;

      if (state.frames % 90 === 0) {
        const minPipe = 60;
        const maxPipe = canvas.height - GAP - minPipe;
        const topHeight = Math.floor(
          Math.random() * (maxPipe - minPipe + 1) + minPipe,
        );
        state.pipes.push({
          x: canvas.width,
          topHeight,
          bottomY: topHeight + GAP,
          passed: false,
        });
      }

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.strokeStyle = "#e2e8f0";
      ctx.lineWidth = 2;

      const offset = (state.frames * 1.5) % 40;
      for (let i = -offset; i < canvas.width; i += 40) {
        ctx.beginPath();
        ctx.moveTo(i, 0);
        ctx.lineTo(i, canvas.height);
        ctx.stroke();
      }
      for (let i = 0; i < canvas.height; i += 40) {
        ctx.beginPath();
        ctx.moveTo(0, i);
        ctx.lineTo(canvas.width, i);
        ctx.stroke();
      }

      for (let i = state.pipes.length - 1; i >= 0; i--) {
        const p = state.pipes[i];
        p.x -= PIPE_SPEED;

        const stickX = p.x + PIPE_WIDTH / 2 - 8;
        const stickGrad = ctx.createLinearGradient(stickX, 0, stickX + 16, 0);
        stickGrad.addColorStop(0, "#fcd34d");
        stickGrad.addColorStop(1, "#d97706");
        ctx.fillStyle = stickGrad;
        ctx.fillRect(stickX, 0, 16, p.topHeight - 20);

        const rubberGradTop = ctx.createLinearGradient(
          p.x,
          p.topHeight - 20,
          p.x,
          p.topHeight,
        );
        rubberGradTop.addColorStop(0, "#ef4444");
        rubberGradTop.addColorStop(1, "#b91c1c");
        ctx.fillStyle = rubberGradTop;
        ctx.beginPath();
        ctx.roundRect(p.x, p.topHeight - 24, PIPE_WIDTH, 24, [4, 4, 4, 4]);
        ctx.fill();

        const rubberGradBottom = ctx.createLinearGradient(
          p.x,
          p.bottomY,
          p.x,
          p.bottomY + 20,
        );
        rubberGradBottom.addColorStop(0, "#b91c1c");
        rubberGradBottom.addColorStop(1, "#ef4444");
        ctx.fillStyle = rubberGradBottom;
        ctx.beginPath();
        ctx.roundRect(p.x, p.bottomY, PIPE_WIDTH, 24, [4, 4, 4, 4]);
        ctx.fill();

        ctx.fillStyle = stickGrad;
        ctx.fillRect(stickX, p.bottomY + 24, 16, canvas.height - p.bottomY);

        const poopX = 50;
        const poopSize = 30;

        if (
          poopX + poopSize - 5 > p.x &&
          poopX + 5 < p.x + PIPE_WIDTH &&
          (state.poopY + 5 < p.topHeight ||
            state.poopY + poopSize - 5 > p.bottomY)
        ) {
          handleGameOver();
          return;
        }

        if (p.x + PIPE_WIDTH < poopX && !p.passed) {
          p.passed = true;
          state.score += 1;
          setScore(state.score);
        }

        if (p.x + PIPE_WIDTH < 0) {
          state.pipes.splice(i, 1);
        }
      }

      ctx.save();
      ctx.translate(50 + 15, state.poopY + 15);
      const rotation = Math.min(Math.max(state.velocity * 0.1, -0.5), 1.5);
      ctx.rotate(rotation);

      ctx.fillStyle = "#000000";
      ctx.shadowColor = "transparent";
      ctx.shadowBlur = 0;
      ctx.shadowOffsetY = 0;

      ctx.font = "34px Arial";
      ctx.fillText("💩", -18, 12);
      ctx.restore();

      if (state.poopY > canvas.height || state.poopY < -50) {
        handleGameOver();
        return;
      }

      animationId = requestAnimationFrame(loop);
    };

    animationId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animationId);
  }, [isStarted, isGameOver, handleGameOver]);

  const jump = (
    e: React.PointerEvent | React.TouchEvent | React.MouseEvent,
  ) => {
    e.preventDefault();
    if (!isStarted) setIsStarted(true);
    if (!isGameOver) {
      gameState.current.velocity = JUMP;
    }
  };

  const restart = () => {
    gameState.current = {
      poopY: 250,
      velocity: 0,
      pipes: [],
      frames: 0,
      score: 0,
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
          <h3 className="pt-game-title">Flappy Poop</h3>
          <div className="pt-game-score pt-game-score--flappy">{score}</div>
        </div>
      </div>

      <div
        className="pt-game-canvas-wrap pt-game-canvas-wrap--flappy"
        onPointerDown={jump}
      >
        <canvas
          ref={canvasRef}
          width={320}
          height={500}
          className="pt-game-canvas pt-game-canvas--flappy"
        />

        {!isStarted && !isGameOver && (
          <div className="pt-game-overlay-start">
            <div className="pt-game-overlay-icon">💩</div>
            <p className="pt-game-overlay-text pt-game-overlay-text--flappy">
              Тапни, чтобы лететь!
            </p>
          </div>
        )}

        {isGameOver && (
          <div className="pt-game-overlay-end">
            <div className="pt-game-end-box">
              <h3 className="pt-game-end-title">Не донёс... 💦</h3>
              {isNewRecord ? (
                <div className="pt-game-new-record pt-game-new-record--flappy">
                  🔥 НОВЫЙ РЕКОРД: {score} 🔥
                </div>
              ) : (
                <p className="pt-game-end-text">
                  Счет: <strong>{score}</strong>
                  <br />
                  <span className="pt-game-end-sub">Рекорд: {highScore}</span>
                </p>
              )}
              <button className="pt-btn pt-btn--action" onClick={restart}>
                Сыграть еще
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
