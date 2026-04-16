import { useEffect, useRef } from 'react';
import * as Tone from 'tone';
import { PatchData } from '../types';

interface VisualizerProps {
  trigger: number;
  patch: PatchData;
}

export function Visualizer({ trigger, patch }: VisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const analyzerRef = useRef<Tone.Analyser | null>(null);
  const animationRef = useRef<number | null>(null);

  useEffect(() => {
    const analyzer = new Tone.Analyser('waveform', 128);
    Tone.getDestination().connect(analyzer);
    analyzerRef.current = analyzer;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const draw = () => {
      const values = analyzer.getValue() as Float32Array;
      
      if (Math.random() < 0.01) {
        console.log("Visualizer: Context state", Tone.getContext().state);
      }

      // Debug: check if we have any signal
      const hasSignal = values.some(v => Math.abs(v) > 0.01);
      if (hasSignal && Math.random() < 0.01) {
        console.log("Visualizer: Signal detected!");
      }

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.beginPath();
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#6366f1';
      
      const sliceWidth = canvas.width / values.length;
      let x = 0;

      for (let i = 0; i < values.length; i++) {
        const v = values[i] * 0.5;
        const y = (v + 0.5) * canvas.height;

        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }

        x += sliceWidth;
      }

      ctx.stroke();
      animationRef.current = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      analyzer.dispose();
    };
  }, []);

  return (
    <canvas 
      ref={canvasRef} 
      width={128} 
      height={40} 
      className="w-full h-full opacity-80"
    />
  );
}
