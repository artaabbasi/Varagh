import { useEffect, useRef } from "react";
import styles from "./CountdownRing.module.css";

interface CountdownRingProps {
  totalSeconds: number;
  remainingSeconds: number;
  size?: number;
  strokeWidth?: number;
}

export function CountdownRing({
  totalSeconds,
  remainingSeconds,
  size = 56,
  strokeWidth = 3,
}: CountdownRingProps) {
  const circleRef = useRef<SVGCircleElement>(null);
  const r = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * r;
  const progress = Math.max(0, Math.min(1, remainingSeconds / totalSeconds));
  const dashOffset = circumference * (1 - progress);
  const isUrgent = remainingSeconds <= 5 && remainingSeconds > 0;

  useEffect(() => {
    const circle = circleRef.current;
    if (!circle) return;
    circle.style.strokeDashoffset = String(dashOffset);
  }, [dashOffset]);

  return (
    <svg
      className={[styles.ring, isUrgent ? styles.urgent : null].filter(Boolean).join(" ")}
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      aria-hidden="true"
    >
      <circle
        className={styles.track}
        cx={size / 2}
        cy={size / 2}
        r={r}
        strokeWidth={strokeWidth}
      />
      <circle
        ref={circleRef}
        className={styles.progress}
        cx={size / 2}
        cy={size / 2}
        r={r}
        strokeWidth={strokeWidth}
        strokeDasharray={circumference}
        strokeDashoffset={dashOffset}
        strokeLinecap="round"
      />
      <text
        className={styles.label}
        x={size / 2}
        y={size / 2}
        textAnchor="middle"
        dominantBaseline="central"
      >
        {Math.ceil(remainingSeconds)}
      </text>
    </svg>
  );
}
