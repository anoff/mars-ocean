import { formatHeight, formatKm3 } from "./ocean";

type OverlayProps = {
  totalM3: number;
  volumeM3: number;
  heightM: number;
  flooded: number;
  ready: boolean;
  error: string | null;
  onVolume: (volumeM3: number) => void;
};

const SLIDER_STEPS = 1000;

export default function Overlay({
  totalM3,
  volumeM3,
  heightM,
  flooded,
  ready,
  error,
  onVolume,
}: OverlayProps) {
  const step = totalM3 <= 0 ? 0 : Math.round((volumeM3 / totalM3) * SLIDER_STEPS);
  return (
    <div className="ocean-panel">
      <div className="ocean-title">Mars Ocean</div>
      {error ? <div className="ocean-error">{error}</div> : null}
      <input
        className="ocean-slider"
        type="range"
        min={0}
        max={SLIDER_STEPS}
        step={1}
        value={step}
        disabled={!ready || !!error}
        onChange={(event) => {
          const next = Number(event.target.value) / SLIDER_STEPS;
          onVolume(next * totalM3);
        }}
      />
      <div className="ocean-readout">
        <span>{formatKm3(volumeM3)}</span>
        <span>{formatHeight(heightM)} areoid</span>
        <span>{Math.round(flooded * 100)}% flooded</span>
      </div>
    </div>
  );
}
