import React, { useMemo } from "react";
import { motion, useMotionValue, useTransform, useSpring } from "framer-motion";

export function ThreeHero() {
  // Mouse movement for parallax
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);
  const springConfig = { stiffness: 60, damping: 20 };
  const springX = useSpring(mouseX, springConfig);
  const springY = useSpring(mouseY, springConfig);

  const handleMouseMove = (e: React.MouseEvent) => {
    mouseX.set(e.clientX / window.innerWidth - 0.5);
    mouseY.set(e.clientY / window.innerHeight - 0.5);
  };

  const skyColors = ["#020617", "#0f172a", "#0284c7", "#0ea5e9", "#f97316", "#020617"];

  const stars = useMemo(() => [...Array(60)].map(() => ({
    x: Math.random() * 100,
    y: Math.random() * 100,
    s: Math.random() * 2 + 1,
    d: Math.random() * 3
  })), []);

  return (
    <motion.div
      onMouseMove={handleMouseMove}
      animate={{ backgroundColor: skyColors }}
      transition={{ duration: 60, repeat: Infinity, ease: "linear" }}
      style={{
        width: "100%",
        height: "100%",
        position: "absolute",
        overflow: "hidden",
        cursor: "default"
      }}
    >
      {/* Grain / Noise Texture Filter */}
      <svg style={{ position: "absolute", width: 0, height: 0 }}>
        <filter id="noise">
          <feTurbulence type="fractalNoise" baseFrequency="0.6" numOctaves="3" stitchTiles="stitch" />
          <feColorMatrix type="saturate" values="0" />
          <feComponentTransfer>
            <feFuncA type="linear" slope="0.05" />
          </feComponentTransfer>
        </filter>
      </svg>
      <div style={{ position: "absolute", inset: 0, filter: "url(#noise)", zIndex: 50, pointerEvents: "none", opacity: 0.6 }} />

      {/* Stars Layer */}
      <motion.div
        style={{
          position: "absolute", inset: "-10%",
          x: useTransform(springX, (v) => v * -15),
          y: useTransform(springY, (v) => v * -15),
          zIndex: 1
        }}
      >
        <motion.div
          animate={{ opacity: [0, 0, 1, 1, 0, 0] }}
          transition={{ duration: 60, repeat: Infinity, ease: "linear" }}
          style={{ width: "100%", height: "100%", position: "relative" }}
        >
          {stars.map((star, i) => (
            <motion.div
              key={i}
              animate={{ opacity: [0.4, 1, 0.4] }}
              transition={{ duration: 2 + star.d, repeat: Infinity }}
              style={{
                position: "absolute", left: `${star.x}%`, top: `${star.y}%`,
                width: star.s, height: star.s, backgroundColor: "#fff",
                borderRadius: "50%", boxShadow: "0 0 8px #fff"
              }}
            />
          ))}
        </motion.div>
      </motion.div>

      {/* Celestial Body (Sun/Moon) */}
      <motion.div
        animate={{ rotate: 360 }}
        transition={{ duration: 60, repeat: Infinity, ease: "linear" }}
        style={{
          position: "absolute", width: "160%", height: "160%",
          top: "-30%", left: "-30%", zIndex: 2
        }}
      >
        {/* Sun */}
        <div style={{
          position: "absolute", top: "15%", left: "50%",
          width: 100, height: 100, borderRadius: "50%",
          background: "radial-gradient(circle, #fff7ed 0%, #fbbf24 100%)",
          boxShadow: "0 0 100px rgba(251, 191, 36, 0.5)"
        }} />
        {/* Moon */}
        <div style={{
          position: "absolute", bottom: "15%", left: "50%",
          width: 80, height: 80, borderRadius: "50%",
          background: "radial-gradient(circle, #f8fafc 0%, #cbd5e1 100%)",
          boxShadow: "0 0 40px rgba(255, 255, 255, 0.2)"
        }} />
      </motion.div>

      {/* Background Mountains (Slow) */}
      <ParallaxLayer
        speedX={-30} speedY={-15} z={10}
        springX={springX} springY={springY}
        color={["#1e1b4b", "#312e81", "#6366f1", "#6366f1", "#4338ca", "#1e1b4b"]}
        path="M0,100 C150,20 350,80 500,30 C650,80 850,20 1000,100 L1000,1000 L0,1000 Z"
      />

      {/* Mid Mountains */}
      <ParallaxLayer
        speedX={-60} speedY={-25} z={20}
        springX={springX} springY={springY}
        color={["#0f172a", "#1e293b", "#0ea5e9", "#0ea5e9", "#1d4ed8", "#0f172a"]}
        path="M0,150 C200,80 400,180 600,100 C800,180 1000,80 1200,150 L1200,1000 L0,1000 Z"
      />

      {/* Foreground Hills (Fast) */}
      <ParallaxLayer
        speedX={-100} speedY={-40} z={30}
        springX={springX} springY={springY}
        color={["#020617", "#064e3b", "#10b981", "#10b981", "#047857", "#020617"]}
        path="M0,220 C300,150 600,280 900,200 C1200,280 1500,150 1800,220 L1800,1000 L0,1000 Z"
      />

      {/* Darkest Silhouette (Front) */}
      <ParallaxLayer
        speedX={-150} speedY={-60} z={40}
        springX={springX} springY={springY}
        color={["#000", "#022c22", "#064e3b", "#064e3b", "#022c22", "#000"]}
        path="M0,300 C400,250 800,350 1200,280 C1600,350 2000,250 2400,300 L2400,1000 L0,1000 Z"
      />

      {/* Bottom Mist Overlay */}
      <div style={{
        position: "absolute", bottom: 0, left: 0, right: 0, height: "40%",
        background: "linear-gradient(to top, rgba(2,6,23,0.8) 0%, transparent 100%)",
        zIndex: 45, pointerEvents: "none"
      }} />
    </motion.div>
  );
}

interface LayerProps {
  speedX: number;
  speedY: number;
  z: number;
  springX: any;
  springY: any;
  color: string[];
  path: string;
}

function ParallaxLayer({ speedX, speedY, z, springX, springY, color, path }: LayerProps) {
  const x = useTransform(springX, (v: number) => v * speedX);
  const y = useTransform(springY, (v: number) => v * speedY);

  return (
    <motion.div
      style={{
        position: "absolute",
        bottom: "-20%",
        left: "-20%",
        width: "140%",
        height: "100%",
        x, y,
        zIndex: z,
        willChange: "transform"
      }}
    >
      <svg
        viewBox="0 0 1000 1000"
        preserveAspectRatio="none"
        style={{ width: "100%", height: "100%" }}
      >
        <motion.path
          d={path}
          animate={{ fill: color }}
          transition={{ duration: 60, repeat: Infinity, ease: "linear" }}
        />
      </svg>
    </motion.div>
  );
}
