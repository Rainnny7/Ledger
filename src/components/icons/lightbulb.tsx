"use client";

import type { Variants } from "motion/react";
import { motion, useAnimation } from "motion/react";
import type { HTMLAttributes } from "react";
import { forwardRef, useCallback, useImperativeHandle, useRef } from "react";

import { cn } from "@/lib/utils";

export interface LightbulbIconHandle {
  startAnimation: () => void;
  stopAnimation: () => void;
}

interface LightbulbIconProps extends HTMLAttributes<HTMLDivElement> {
  size?: number;
}

// The bulb gives a little swing while its rays flicker on.
const BULB_VARIANTS: Variants = {
  normal: { rotate: 0 },
  animate: {
    rotate: [0, -10, 8, -4, 0],
    transition: { duration: 0.7, ease: "easeInOut" },
  },
};

const RAY_VARIANTS: Variants = {
  normal: { opacity: 0, pathLength: 0 },
  animate: (i: number) => ({
    opacity: [0, 1, 0.6, 1],
    pathLength: [0, 1],
    transition: { duration: 0.5, delay: 0.15 + i * 0.08, ease: "easeOut" },
  }),
};

const LightbulbIcon = forwardRef<LightbulbIconHandle, LightbulbIconProps>(
  ({ onMouseEnter, onMouseLeave, className, size = 28, ...props }, ref) => {
    const controls = useAnimation();
    const isControlledRef = useRef(false);

    useImperativeHandle(ref, () => {
      isControlledRef.current = true;

      return {
        startAnimation: () => controls.start("animate"),
        stopAnimation: () => controls.start("normal"),
      };
    });

    const handleMouseEnter = useCallback(
      (e: React.MouseEvent<HTMLDivElement>) => {
        if (isControlledRef.current) {
          onMouseEnter?.(e);
        } else {
          controls.start("animate");
        }
      },
      [controls, onMouseEnter]
    );

    const handleMouseLeave = useCallback(
      (e: React.MouseEvent<HTMLDivElement>) => {
        if (isControlledRef.current) {
          onMouseLeave?.(e);
        } else {
          controls.start("normal");
        }
      },
      [controls, onMouseLeave]
    );

    return (
      <div
        className={cn(className)}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        {...props}
      >
        <svg
          fill="none"
          height={size}
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
          viewBox="0 0 24 24"
          width={size}
          xmlns="http://www.w3.org/2000/svg"
        >
          <motion.g
            animate={controls}
            initial="normal"
            style={{ originX: "50%", originY: "0%" }}
            variants={BULB_VARIANTS}
          >
            <path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5" />
            <path d="M9 18h6" />
            <path d="M10 22h4" />
          </motion.g>
          {["M12 1V0", "M3.5 3.5 2.8 2.8", "M20.5 3.5l.7-.7"].map((d, i) => (
            <motion.path
              animate={controls}
              custom={i}
              d={d}
              initial="normal"
              key={d}
              variants={RAY_VARIANTS}
            />
          ))}
        </svg>
      </div>
    );
  }
);

LightbulbIcon.displayName = "LightbulbIcon";

export { LightbulbIcon };
