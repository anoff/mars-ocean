# Areoid

A Mars climate-intervention game.
Subtitle on the title screen: *A Mars climate intervention*.

You are the operator of a single program that tries to change Mars’s temperature, air, and ice until liquid water can stand in a chosen place — or until Earth shuts the program down.

---

## What this is

- One planet. One map. One run lasts tens of minutes.
- Time advances in years while you pause to buy a technology and point it at a region or at the whole globe.
- The board is Mars: basemap plus a water and temperature overlay. Named regions (Hellas, Utopia, the caps, the glacier belt, Tharsis, …) are what you click. Hexes are paint, not pieces.
- Three physical meters decide what the overlay is allowed to show: **temperature**, **pressure**, **liquid water**. Melt that lacks pressure becomes vapor and frost, not a sea.
- **Funding** is the spendable resource. Results and milestones mint more of it. Systems that must be kept running (aerosols, mirrors, factories) drain it every year.
- **Oversight** rises when the program looks reckless, visible, or politically expensive. At 100% the run ends.
- Ice is a budget. The default cap is **known near-surface ice** (~20–30 m global equivalent layer). Hidden or locked reservoirs open only through Water techs. A northern ocean the size of the old Deuteronilus shoreline is not in the default budget.
- A run is a **scenario**: one win condition, same map, same meters.

First shipped scenario: **Known Ice** — succeed using only mapped polar and ground ice, no comet import.

---

## What this is not

- Not a civilization. No cities, citizens, food, culture, diplomacy, or factions to manage.
- Not a war game. No combat, no territory capture as a goal.
- Not a colony builder. Habitats exist only as lids and blankets that hold air and heat over a patch of ground.
- Not an Earth-like end state as the default victory. Shirtsleeves and a breathable open sky are out of scope for the main scenarios.
- Not a live global climate model. One tick function, coarse regions, honest labels when a path is speculative.
- Not a sandbox slider you drag to flood the planet. Volume on the map is a **consequence** of ice released and of whether that water may be liquid.
- Not a second game about oxygen and forests. Life is a short late column, not the campaign.

---

## Player action

1. Watch the year tick.
2. Spend Funding on a node in one of four columns: **Warm**, **Water**, **Hold**, **Life**.
3. Deploy it globally or on a region.
4. Read the meters and the overlay.
5. Deal with events (dust year, budget cut, ice confirmed, lawsuit).
6. Hit the scenario win, or lose.

---

## Meters

| Meter | Start | Role |
|---|---|---|
| Temperature | present-day Mars cold | Regional + global. ~+30 K makes melt interesting; ~+60 K is the fantasy stable-sea regime and is not required for Known Ice. |
| Pressure | ~6 mbar | Accessible native CO₂ is a hard cap of tens of mbar unless a tech imports or bakes more. |
| Liquid water | none | Allowed only where T and P (or a Hold lid) clear the scenario threshold. |
| Known ice left | ~20–30 m GEL | Volume you can legally melt in Known Ice. |
| Funding | modest opening grant | Buy techs and pay upkeep. |
| Oversight | low | Lose at 100%. |

Optional late readout, not a main meter: biosphere / O₂ crawl.

---

## Map

- Rendering: MapLibre, OpenPlanetaryMap tiles, hex fill from `web/public/grid/hex-grid.json`.
- Interaction: ~25–40 regions that own those hexes. Click region to inspect ice, elevation, T, and to deploy.
- Overlay modes: temperature, liquid fraction, ice certainty (fog until Survey).
- Heights are metres above the **areoid**. The title is that line.

---

## Technology columns

**Warm** — dust the caps, PFC factory, engineered aerosols (upkeep), aerogel blankets (regional), orbital mirrors (regional, expensive).

**Water** — ice-table survey, glacier mining, polar melt, bake hydrated minerals, Medusae Fossae drill, comet capture (not legal in Known Ice; used only in a labeled scenario).

**Hold** — pressurized greenhouse, canyon lid, crater liner. Water and heat stay in a basin even when the open planet is still thin and cold.

**Life** — perchlorate-tolerant microbes, oxygenic algae, vascular plants. Does nothing without liquid water or a Hold volume.

Synergy that must stay in the rules: Warm without Pressure or Hold produces frost and loss, not standing water.

---

## Scenarios

| Id | Win | Ice rule |
|---|---|---|
| **Known Ice** | Standing liquid in a specified low basin (default Hellas) for N years, using only mapped ice | Default ship scenario |
| **Hellas Sea** | Same basin, longer hold, may use MFF after drill | |
| **First Tree** | A plant-habitable season in one low basin | Life column required |
| **Lid** | X km² under blankets or crater liners | Honest small win |
| **Northern Ocean** | Deuteronilus-class fill | Requires comet or other extra volatiles; UI must mark it off-budget |

## Lose

- Oversight reaches 100%.
- Funding hits 0 while required upkeep is still running (aerosol collapse, temperature crash).
- Known ice (or the scenario’s legal ice) falls below the floor before the win.

---

## Tone

Clinical program, not a pioneer epic. Numbers on screen: mbar, K, m GEL, km³, year. Events read like memos, not quests.
