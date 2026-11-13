import { useEffect, useState } from 'react';
import { TURN_MS } from '../game/rules';

export function useRemaining(turnStartedAt: number): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(t);
  }, []);
  return Math.max(0, TURN_MS - (now - turnStartedAt));
}

export function TurnTimer({ remaining }: { remaining: number }) {
  const ratio = remaining / TURN_MS;
  const urgent = remaining <= 5000;
  return (
    <div className={`timer${urgent ? ' timer--urgent' : ''}`}>
      <div className="timer__bar" style={{ width: `${ratio * 100}%` }} />
      <span className="timer__text">{Math.ceil(remaining / 1000)}초</span>
    </div>
  );
}
