import { useRef, useEffect } from 'react';

export const useMagnetic = <T extends HTMLElement>() => {
  const ref = useRef<T>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const handleMouseMove = (e: MouseEvent) => {
      const { clientX, clientY } = e;
      const { left, top, width, height } = el.getBoundingClientRect();
      const centerX = left + width / 2;
      const centerY = top + height / 2;

      const distanceX = clientX - centerX;
      const distanceY = clientY - centerY;

      // Only apply if cursor is close enough (e.g., within 100px)
      const threshold = 100;
      const distance = Math.sqrt(distanceX ** 2 + distanceY ** 2);

      if (distance < threshold) {
        const moveX = distanceX * 0.3;
        const moveY = distanceY * 0.3;
        el.style.transform = `translate(${moveX}px, ${moveY}px)`;
      } else {
        el.style.transform = `translate(0px, 0px)`;
      }
    };

    const handleMouseLeave = () => {
      el.style.transform = `translate(0px, 0px)`;
    };

    window.addEventListener('mousemove', handleMouseMove);
    el.addEventListener('mouseleave', handleMouseLeave);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      el.removeEventListener('mouseleave', handleMouseLeave);
    };
  }, []);

  return ref;
};
