import { useEffect, useRef } from 'react';
import * as Tone from 'tone';
import { PatchData } from '../types';

interface VisualizerProps {
  trigger: boolean;
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
