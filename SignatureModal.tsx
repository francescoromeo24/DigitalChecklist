import { useEffect, useRef, useState } from 'react';
import type { Checklist, User } from '../types';

interface Props {
  checklist: Checklist;
  currentUser: User;
  onSign: (signature: NonNullable<Checklist['signature']>) => void;
  onClose: () => void;
}

export default function SignatureModal({ checklist, currentUser, onSign, onClose }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [name, setName] = useState(currentUser.name);
  const [hasInk, setHasInk] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    ctx.strokeStyle = '#2F3C48';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';

    let drawing = false;
    const pos = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };
    const down = (e: PointerEvent) => {
      drawing = true;
      canvas.setPointerCapture(e.pointerId);
      const { x, y } = pos(e);
      ctx.beginPath();
      ctx.moveTo(x, y);
    };
    const move = (e: PointerEvent) => {
      if (!drawing) return;
      const { x, y } = pos(e);
      ctx.lineTo(x, y);
      ctx.stroke();
      setHasInk(true);
    };
    const up = () => {
      drawing = false;
    };
    canvas.addEventListener('pointerdown', down);
    canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerup', up);
    return () => {
      canvas.removeEventListener('pointerdown', down);
      canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerup', up);
    };
  }, []);

  const clear = () => {
    const canvas = canvasRef.current!;
    canvas.getContext('2d')!.clearRect(0, 0, canvas.width, canvas.height);
    setHasInk(false);
  };

  const sign = () => {
    if (!name.trim()) return;
    onSign({
      name: name.trim(),
      image: hasInk ? canvasRef.current!.toDataURL('image/png') : undefined,
      signedAt: new Date().toISOString(),
      userId: currentUser.id
    });
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <header className="modal-header">
          <h2>Sign off "{checklist.title}"</h2>
          <button className="btn btn-ghost" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </header>
        <div className="modal-body">
          <p className="signoff-hint">
            Your name and the exact time will be recorded with this checklist for
            accountability and compliance.
          </p>
          <label>
            Full name
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} required />
          </label>
          <label>
            Signature (draw with mouse or finger — optional)
            <canvas ref={canvasRef} className="signature-pad" width={440} height={140} />
          </label>
          <div className="modal-actions">
            <button className="btn btn-ghost" onClick={clear}>
              Clear signature
            </button>
            <button className="btn btn-primary" onClick={sign} disabled={!name.trim()}>
              ✍ Sign off now
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
