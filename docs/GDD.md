# Game design (canon)

Plague Inc. scale. Not Civ. You run one planetary intervention.

## Loop

Time auto-runs in years. Pause to buy a tech and deploy it on a region or globally. Watch temperature, pressure, and liquid water. Funding is the DNA-point analogue. Oversight is the cure bar.

## Meters

- Temperature (global + per region)
- Pressure (starts ~6 mbar; accessible CO2 is a hard cap of tens of mbar unless import/bake)
- Liquid water (only if T and P clear a threshold; otherwise melt sublimes)
- Funding
- Oversight
- Known ice remaining (default volume cap ~20–30 m GEL)

## Map

MapLibre paints hexes. Gameplay is ~25–40 named regions that own many hexes. Water look uses `web/public/grid/hex-grid.json`. Slider is a readout, not the player control.

## Tech branches

Warm · Water · Hold (paraterraform) · Life (late)

Aerosols need upkeep. Cap vaporization spends the CO2 budget.

## Scenarios (pick one per run)

- Hellas Sea — standing liquid in Hellas for N years
- First Tree — plant season in one low basin
- Paraterraform — X km² under lids/blankets
- Northern Ocean — Deuteronilus-class; requires comet/cheat volatiles; label it fantasy

## Lose

Oversight 100%, funding 0 while upkeep is live, or known ice drained below floor.

## Out of scope

Colonies, population, combat, trade, a full GCM, oxygen as a second game.
