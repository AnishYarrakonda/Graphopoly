import React, { useEffect, useRef } from 'react';

const COLORS = [
  '#ffffff', // Lead
  '#f5f5f5',
  '#ebebeb',
  '#e0e0e0',
  '#d6d6d6',
  '#cccccc',
  '#c2c2c2',
  '#b8b8b8',
  '#adadad',
  '#a3a3a3',
  '#999999',
  '#8f8f8f',
  '#858585',
  '#7a7a7a',
  '#707070',
  '#666666',
  '#5c5c5c',
  '#525252',
  '#474747',
  '#3d3d3d',
];

export const CursorTrail: React.FC = () => {
  const circlesRef = useRef<HTMLDivElement[]>([]);
  const coordsRef = useRef({ x: 0, y: 0 });
  const circlesDataRef = useRef<{ x: number; y: number }[]>([]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      coordsRef.current.x = e.clientX;
      coordsRef.current.y = e.clientY;
    };

    window.addEventListener('mousemove', handleMouseMove);

    // Initialize circular data
    circlesDataRef.current = Array(COLORS.length).fill(0).map(() => ({ x: 0, y: 0 }));

    let animationFrameId: number;

    const animateCircles = () => {
      let x = coordsRef.current.x;
      let y = coordsRef.current.y;

      circlesRef.current.forEach((circle, index) => {
        if (!circle) return;

        // Position current circle
        circle.style.left = `${x - 12}px`;
        circle.style.top = `${y - 12}px`;

        // Scale based on index
        const scale = (COLORS.length - index) / COLORS.length;
        circle.style.transform = `scale(${scale})`;

        // Store current position for trailing logic
        const data = circlesDataRef.current[index];
        data.x = x;
        data.y = y;

        // Calculate next position with easing
        const nextData = circlesDataRef.current[index + 1] || circlesDataRef.current[0];
        x += (nextData.x - x) * 0.35;
        y += (nextData.y - y) * 0.35;
      });

      animationFrameId = requestAnimationFrame(animateCircles);
    };

    animateCircles();

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  return (
    <>
      {COLORS.map((color, index) => (
        <div
          key={index}
          ref={(el) => {
            if (el) circlesRef.current[index] = el;
          }}
          className="cursor-trail-circle"
          style={{
            backgroundColor: color,
            position: 'fixed',
            top: 0,
            left: 0,
            height: '24px',
            width: '24px',
            borderRadius: '50%',
            pointerEvents: 'none',
            zIndex: 99999999,
            // Optimization: avoid layout thrashing by using transform for position if possible, 
            // but the original code used left/top. I'll stick to styles for now but consider transform.
          }}
        />
      ))}
    </>
  );
};
