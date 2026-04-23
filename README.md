# The Backbone — Game Mechanics Reference

*A Vite + TypeScript + Canvas 2D economic strategy game about building France's hydrogen backbone. This document describes **every in-game mechanic** — the numbers, formulas, and edge cases.*

**Thesis (from the manifesto):** a molecular hydrogen pipeline is the missing protocol layer for the energy transition. Electrons do precision work; molecules carry bulk energy cheaply over long distance and store it by line-packing the pipe.

**Core loop:** build Hydrogen Plants → connect them with pipelines → pressure builds → customers emerge on their own → revenue pays opex → Wright's Law cuts build cost → repeat until the price of H₂ crosses **oil parity** and the flywheel ignites.

---

## 1. Time and speed

| Symbol | Value | Meaning |
| --- | --- | --- |
| `TICKS_PER_SEC` | 10 | Sim ticks per wall-clock second at 1× |
| `TICKS_PER_DAY` | 10 | Sim ticks per in-game day |
| — | 1 s | 1 real second = 1 in-game day at 1× speed |
| — | 365 d | Full year |

- **Speed controls:** 1× / 10× / 100×. Hotkeys `1`, `2`, `3`. Space pauses.
- Time advances via `state.timeOfDay` (0..1 per day) and `state.dayOfYear` (1..365 per year).
- Sim work is a fixed 10 Hz; rendering is rAF-driven so visuals stay smooth regardless of sim speed. Long backgrounded tabs drop the accumulated tick backlog instead of running hundreds of catch-up ticks.

---

## 2. The map

- **13 regions** of metropolitan France, loaded from real INSEE/IGN GeoJSON simplified to ~3% point retention. Corsica is included in position.
- **Projection:** Lambert-93 (EPSG:2154), France's official conic conformal projection. Computed once from raw lon/lat; a fit transform places everything into the canvas rect on every window resize.
- **Real gas trunk corridors** (Dunkerque→Paris→Marseille, Le Havre→Lyon, Bordeaux→Toulouse, Paris→Strasbourg, Fos→Perpignan, Bordeaux→Bayonne) render as desaturated dashed lines beneath player pipes — the "reuse what exists" underlayer.
- **Region geometry** is hit-tested with `Path2D.isPointInPath` on every mousemove.

Each region carries:

| Field | Effect |
| --- | --- |
| `solarBase` 0–1 | Base solar yield multiplier (PACA 0.92, Brittany 0.50) |
| `windBase` 0–1 | Base wind yield multiplier (Brittany 0.90, IdF 0.50) |
| `nuclearBonus` 0–1.5 | Nuclear output multiplier; regions <0.5 can't host nuclear |
| `industryDemand` | Biases customer emergence toward industrial zones |
| `hasPort` / `portName` | Required for export terminals |
| `gasInfra` 0–1 | Discounts new pipeline costs up to −40% |
| `maxSlots` | Max concurrent buildings in the region |
| `industrialSlots` / `distributedSlots` / `portSlots` / `efuelSlots` | Customer capacity per kind (total ≈ 27 nationwide) |

---

## 3. Plants (production)

There are three bundled plant types. **Each plant contains its own 70% efficient electrolyzer.** Only hydrogen leaves the facility — electricity is never carried between regions, never tracked on the pipe network. The UI visibly teaches this with a pulsing electron traveling left→right inside the plant icon.

| Plant | Cap | Base cost | Base MW | Cap factor | Notes |
| --- | --- | --- | --- | --- | --- |
| Solar Hydrogen Plant | 100 | €90M | 600 | 0.22 | Weather-dependent; zero output at night |
| Wind Hydrogen Plant | 100 | €108M | 800 | 0.28 | Weather-dependent; runs day and night |
| Nuclear Hydrogen Plant | 1000 | €900M | 4200 | 0.90 | Constant; only in regions with `nuclearBonus ≥ 0.5` |

All costs above are *base* — final cost at placement is `base × wrightMult × BUILDING_COST_MULTIPLIER (1.5)`.

### Production formula (per tick)

For each plant:

```
internalMW = baseOutput × genFactor
internalMWh = internalMW × 24
h2_kg_per_day = (internalMWh × 1000 / 55) × 0.70
```

Where `genFactor` depends on type:

- **Solar:** `solarFactor = solarBase × seasonalSolar × solarCurve × cloudMult`
  - `solarCurve = max(0, sin(timeOfDay × π))` → **0 at midnight, 1 at noon**. Solar stops producing at night.
  - `seasonalSolar = 0.45 + 0.55 × max(0, sin((doy − 80) × 2π/365))` — peaks in summer, floors at 0.45 in winter.
  - `cloudMult = 1 − 0.7 × clouds` — heavy cloud drops solar to ~30%.

- **Wind:** `windFactor = windBase × seasonalWind × windPower`
  - Wind blows **day and night** — no time-of-day dependency.
  - `seasonalWind = 0.65 + 0.35 × max(0, sin((doy − 350) × 2π/365 + π))` — peaks in winter.
  - `windPower = w^2.5` for `w ≤ 1`, then saturates as `1 + (w − 1) × 0.3` — high wind can exceed nominal but never runs away.
  - **Wind magnitude and direction are simplex-noise 3D fields.** Neighboring regions are correlated; a weather system moves across the map over several game-days. Wind produces *real* variability.

- **Nuclear:** `genFactor = capacityFactor × regionNuclearBonus`
  - No weather, no time-of-day. Baseload.
  - Region-gated: cannot be placed where `nuclearBonus < 0.5`.

### Output → supply

Hydrogen produced in a region adds to that region's `supply` each tick. Pressure then redistributes it across the pipe network.

---

## 4. Pipelines

| Field | Value | Meaning |
| --- | --- | --- |
| `baseCostPerKm` | €180,000 | Before Wright + gas-infra discount |
| `maxFlow` | 80,000 kg/day | Per-pipe capacity |
| `linepackPerKm` | 50 kg/km | Line-pack buffer |
| `maxPressure` | 80 bar | Shared with regions |

### Pipe cost

```
cost = baseCostPerKm × distance_km × infraDiscount × pipelineWrightMult
infraDiscount = 1 − min(fromGasInfra, toGasInfra) × 0.4   // up to −40%
```

Pipelines are **not** multiplied by `BUILDING_COST_MULTIPLIER` — they are already at their base cost.

### Line-pack

Each pipe stores hydrogen proportional to its average endpoint pressure:

```
pipe.linepackStored = pipe.linepackCapacity × (pipe.pressure / 80)
```

This is the "pipe is the battery" mechanic. A 1000 km network can buffer roughly 50 tonnes H₂ before any other storage.

### Distance

Pipe distances are computed from Lambert-93 projected centroids, converted to km via the current fit scale — distances stay stable across window sizes.

---

## 5. The pressure network

All gas flow is pressure-driven. Implemented in [src/pressure.ts](src/pressure.ts) as a Gauss-Seidel-style relaxation.

Each tick:

1. **Self-regulation.** Each region's pressure shifts toward more (when supply > demand) or less (when demand > supply), only if the region is pipe-connected.
   ```
   pressureChange = (supply − demand) / TICKS_PER_DAY × 0.0005 × RELAXATION
   ```
2. **6 relaxation iterations.** For each pipe, pressure differential drives flow:
   ```
   flow = (P_from − P_to) × (maxFlow / 40) × RELAXATION        (clamped to ±maxFlow)
   pipe.flow ← 0.8 × previous + 0.2 × clampedFlow               (smoothing)
   transfer  = |flow| × 0.001                                   (moves gas both ways)
   ```
3. **Clamp.** Region pressure stays in `[5, 80]` bar.
4. **Aggregate.** Network pressure = average of all connected-region pressures.

### Audible pressure crossings

Each time the network's rolling-average pressure rises through **25 / 50 / 70 bar**, a short "whoosh" plays. Falling-edge crossings are silent.

---

## 6. Weather

Three **simplex-noise 3D fields** seeded once at boot and sampled per real region centroid every tick:

- **Cloud cover** (0..1)
- **Wind magnitude** (0..~1.5)
- **Wind direction** (radians)

The third axis is `weatherTime = dayOfYear × 0.04 + timeOfDay × 0.6`, so weather systems drift across France over multiple in-game days without exactly syncing to the day cycle.

### Day / night

A simplified sun-elevation model:

```
sunLon = 180 − 360 × timeOfDay          // °
elev   = cos(((regionLon − 3°) − sunLon) × π/180)
```

Eastern regions (Strasbourg, Nice) see dawn **earlier** than western ones (Brest). Per-region darkening is rendered on the map at night — you can visibly watch illumination sweep west.

### Seasonal tint

Four anchor colors interpolated by day-of-year, painted as a ~6% alpha overlay over the entire canvas:

- Winter (around day 15): cool blue
- Spring (around day 105): fresh green
- Summer (around day 196): warm amber
- Autumn (around day 288): rust

### Visual weather effects

- **Cloud shadows** — one blurred dark disc per cloudy region, drifting downwind. Rendered with `multiply` blend so clouds darken the land beneath them without tinting the black backdrop.
- **Wind streaks** — short aligned streaks on regions with wind ≥ 0.45, oriented along `windDirection`. Purely visual; no gameplay effect beyond the underlying `windFactor`.

### Seasons gameplay impact

- Solar output dips in winter, peaks in summer.
- Wind output peaks in winter (seasonally offset ~180° from solar).
- Hauts-de-France / Brittany get reliable wind year-round; Occitanie / PACA get reliable sun.

---

## 7. Economy

### Price formation (per tick)

1. **Sum national supply and demand** across all regions.
2. **Target spot price** from supply/demand ratio:
   ```
   ratio       = supply / demand           (∞ when no demand)
   targetPrice = BASE_PRICE / max(0.1, ratio)^0.4        // BASE_PRICE = €6
   ```
3. **Smooth into current** spot: `spotPrice += (target − spotPrice) × 0.03`. Hard-clamped to `[€0.50, €12.00]`.
4. **Regional prices** drift toward spot, modulated by local pressure:
   ```
   localPrice ← localPrice + (spotPrice / pressureFactor − localPrice) × 0.08
   pressureFactor = max(0.5, regionPressure / 40)
   ```
   Disconnected regions drift toward `1.5 × BASE_PRICE` (a "dear" reference).

### Price EMA

The economic arc uses a slow exponentially-weighted moving average of the spot price:

```
priceEMA_new = 0.97 × priceEMA_old + 0.03 × spotPrice       (updated once per day)
```

Single-day dips do not cross the EMA below a threshold — you need a **sustained** market, not a lucky tick. Every price-gated emergence and the Oil Parity trigger use this EMA, not the raw spot.

### Revenue (per tick, per customer)

```
supplyRatio    = min(1, regionSupply / regionDemand)
servedPerTick  = (customer.currentDemand × supplyRatio) / TICKS_PER_DAY
revenue        = servedPerTick × regionLocalPrice × CUSTOMER_REVENUE_MULTIPLIER (1.8)
```

Customers pay only for what they actually receive. A supply-starved customer's satisfaction drops accordingly. **There is no "customer-side OPEX"** — the 1.8× markup represents the margin the player captures above wholesale spot.

### Operating costs (OPEX)

Every placed building and pipeline burns a fraction of its CAPEX every day. **Idle plants still pay.** This is the mechanism that punishes building ahead of demand.

```
daily_opex = Σ (asset.cost × DAILY_OPEX_FRACTION)      // 0.0003/day = ~11%/year
applied per tick as daily_opex / TICKS_PER_DAY
```

Real-world renewable OPEX is 5–15% of CAPEX/year; the current setting sits near the middle.

### Budget and runway

- **Starting budget:** €200,000,000.
- **Runway** (shown prominently in the HUD): `money / max(burn, 1)` where `burn = dailyOpex − dailyRevenue`. When revenue exceeds opex (`burn ≤ 0`), runway is **∞** (labeled "profitable").

Runway color states:

| Runway | Color | Audio |
| --- | --- | --- |
| ≥ 120 days | dim cyan | silent |
| 60..120 days | amber | silent |
| 30..60 days | red, pulsing | 2 s heartbeat |
| 10..30 days | red, pulsing faster | 1 s heartbeat |
| < 10 days | red, fast pulse | 0.5 s heartbeat |
| ∞ | green | silent |

### Bankruptcy (lose condition)

If the budget falls below `BANKRUPTCY_THRESHOLD = −€50,000,000` for **90 consecutive days**, the game triggers a somber Game Over modal (distinct from the victory end screen). The sim pauses. "Start a new run" wipes state.

### Customer demand modifiers

- **Pressure-relief customers (e-fuel)** scale demand with local pressure: `effectiveDemand × max(0.3, min(2.0, pressure/40))`.
- **E-fuel surge:** when normalized network pressure ≥ 0.85, e-fuel demand is multiplied by an additional **1.5×**. This is the "pressure relief valve" in action — you can watch pressure spike, e-fuel demand jump, pressure fall.
- **Ramping:** newly-materialized customers start at 10% of target demand and linearly ramp to 100% over `rampDurationDays` (10–20 days).

---

## 8. Customer emergence

Customers are **not placed by the player.** They appear on their own when their emergence gate fires. Each customer type embodies a distinct manifesto argument.

### The six customer types

| Type | Icon | Demand (kg/day) | Gate | Lag | Ramp | Slot |
| --- | --- | --- | --- | --- | --- | --- |
| Steel DRI | 🏭 | 8,000–25,000 | Price ≤ €5.50 | 45 d | 20 d | industrial |
| Ammonia | 🧪 | 5,000–18,000 | Price ≤ €5.00 | 30 d | 15 d | industrial |
| E-Fuel | ⛽ | 3,000–35,000 | Pressure/80 ≥ 0.7 | 35 d | 15 d | efuel |
| Chemical | ⚗️ | 2,000–12,000 | Price ≤ €4.00 | 25 d | 12 d | industrial |
| Fuel Cell | 🔋 | 500–5,000 | Supply reliability ≥ 30 d | 15 d | 10 d | distributed |
| Export Terminal | 🚢 | 15,000–60,000 | National surplus ≥ 1.25× for 20 d | 60 d | 20 d | port |

### Emergence pipeline (daily)

1. **Update reliability counters.** Each region increments `reliabilityDays` if it currently has ≥ 1 pipe and positive supply; resets otherwise.
2. **Update surplus streak.** National `surplusStreakDays` increments if total supply ÷ total demand ≥ the export gate's `minSurplusRatio`; resets otherwise.
3. **First-customer grace roll** — see below.
4. **Evaluate gates.** Types are visited in randomized order. For each type whose gate fires:
   - Record the first-ever downward crossing (drives the chart's flash effect).
   - Find the best eligible region (has a free slot of the right kind, meets pipe-connection requirement, port if required). Weighted by `industryDemand`, `reliabilityDays`, port proximity, pressure, etc.
   - Enqueue a **Pending Customer** with `commitsOnDay = today + investmentLagDays`.
   - Stop after one successful enqueue — global cooldown applies.
5. **Global cooldown.** At most **one** new pending customer is created per `GLOBAL_EMERGENCE_COOLDOWN_DAYS = 5` days across the entire map. This is the rate limit that prevents a descending price from firing multiple types simultaneously.
6. **Advance pending.** For each pending entry:
   - If its gate is `priceThreshold` and `priceEMA > 1.10 × threshold`, **cancel** it (investment withdraws when the price signal reverses).
   - If `today ≥ commitsOnDay`, **materialize** the customer: slot takes effect, region flashes, two celebratory sounds play (arpeggio + cha-ching), toast is shown.
7. **Churn.** Each live customer older than 60 days has a `CHURN_DAILY_PROBABILITY = 0.0002` daily probability of shutting down (≈ 0.6% per month). A shut-down customer frees its slot.

### First-customer grace window

If the player has built at least one pipeline and **zero customers have yet emerged or committed**, a daily roll kicks in once `daysSinceFirstPipe ≥ 45`, ramping linearly to a 50% daily spawn probability at day 75. The grace customer uses a **shortened investment lag** (up to 20 days instead of the type's normal 25–60). This exists only to prevent the scarcity model from bankrupting a player who has built competently but hasn't hit the normal gates yet.

Once the first customer arrives (whether via grace or normal path), the full lagged-commitment rules resume for everyone else.

### What customers *do not* do

- **They do not leave when the price rises.** Once materialized, a customer stays and consumes at its ramped demand. This is "stickiness" — investment is durable.
- **Low satisfaction does not kick customers out.** The v3 satisfaction-churn was replaced by the low-probability random churn.
- **They do not compete over supply explicitly.** Everyone buys a share proportional to local supply vs local demand.

---

## 9. Wright's Law

Each of the four placeable asset classes has its own Wright's Law curve. Every doubling of cumulative capacity reduces the per-unit cost multiplier by the learning rate:

| Asset | Learning rate | Cumulative "unit" |
| --- | --- | --- |
| Solar plant | 20% | 1 plant |
| Wind plant | 15% | 1 plant |
| Nuclear plant | 5% | 1 plant |
| Pipeline | 10% | 200 km |

Formally:

```
mult_new = max(1 − WRIGHT_SAVINGS_CAP, units^log2(1 − learningRate))
```

- `WRIGHT_SAVINGS_CAP = 0.45` — savings are capped at 45% (multiplier floor 0.55). Without this, the flywheel would project absurd negative prices and kill the oil-parity moment's drama.
- Wright savings directly discount both the displayed cost and the amount deducted from the budget at placement.
- Wright savings also cap the OPEX of future builds (since OPEX is a fraction of CAPEX).

---

## 10. The narrative arc

Three acts, all enforced at the `endgame.ts` level.

### Act 1 — Setup (days 1 .. 179)

No climactic triggers can fire. This is the tutorial / establishment phase. Nothing prevents the player from building, exploring, hitting their first customer — but the cinematic-level events are gated out entirely. This is what fixes the v3 "climax on Day 2" bug.

### Act 2 — Approaching parity (from day 180)

**Oil Parity** triggers when ALL three conditions hold for **30 consecutive days**:

1. `priceEMA ≤ €1.30/kg` — realistic e-fuel parity with fossil crude.
2. Total daily H₂ production ≥ **5,000 kg**.
3. At least **3 active customers**.

Any single day that fails any condition zeroes the streak. This guarantees the climax reflects a **real market**, not a puddle.

### Act 3 — Flywheel (from day 360, Oil Parity already fired)

**Escape Velocity** triggers when all of the following hold for **20 consecutive days**:

- `supplyRatio = totalSupply / totalDemand ≥ 1.2`
- Wright savings ≥ **30%**
- At least **8 of 13 regions** have ≥ 1 pipe connection
- At least **12 live customers**
- Oil Parity has already fired.

The player can also fire it manually via a **"Witness the flywheel"** button (shown only when all five conditions hold), so the finale isn't missed if the conditions land between looks.

### Cinematic overlays

- **Oil Parity:** full-screen green wash + expanding ring + "OIL PARITY" text overlay for ~10 s. Chart's e-fuel line switches from amber to green permanently.
- **Escape Velocity:** dimming overlay + sequential cadence flash across every customer + final manifesto quote. After ~10 s the DOM end-screen fades in with full session stats.

Both cinematics run *on top of a still-simulating game* — sim does not pause.

### End screen

After Escape Velocity: stats (days, customers, peak pressure, curtailment avoided, Wright savings, oil ceiling, connected regions, final price, final budget) plus three actions: **Continue building** (sandbox), **New game**, **Share** (copies a summary to clipboard).

### Game Over screen

Separate, somber-styled modal fired by bankruptcy. One action: **Start a new run**.

---

## 11. Manifesto insights (pop-ups)

Four pre-scripted insights fire at most once per session, gated by minimum-day floors and volume floors so none can trigger prematurely:

| Milestone | Gate |
| --- | --- |
| **First customer** | ≥ 1 active customer AND day ≥ 30 |
| **Curtailment scandal** | `totalCurtailed > 500` MWh AND day ≥ 90 |
| **Oil price ceiling closing** | `priceEMA < €3.00` AND ≥ 30 daily price samples AND production ≥ 5,000 kg/day AND day ≥ 90 |
| **Backbone is emerging** | ≥ 10 pipelines AND day ≥ 90 |

At most one pop-up fires per day.

---

## 12. Controls

| Input | Action |
| --- | --- |
| Left-click | Select region / place building / pick pipeline endpoint |
| Right-click | Cancel current build mode |
| Escape | Cancel current build mode |
| Space | Pause / unpause |
| `1` | 1× speed |
| `2` | 10× speed |
| `3` | 100× speed |
| Hover region | Rich DOM tooltip: bonuses, weather, buildings, supply/demand |
| Hover build button | Flow-diagram tooltip + manifesto quote |

### Pipeline placement

Two-click picker: click source region → click destination region. A dashed preview snaps to the hovered region's centroid when valid, and shows computed length + cost at the midpoint. Escape or right-click cancels mid-pick.

### Placement ghost

While in a build mode, the cursor carries a translucent plant icon. It's **green-ringed and snapped to the region centroid** when placement is valid, **red-ringed at the mouse** when invalid (insufficient budget, no free slot, wrong region for nuclear, etc).

---

## 13. HUD and UI

### Top bar

Budget · **Runway** · H₂ Price · H₂ Produced · Customers · Date · Season · Save/Sound toggles · Speed controls.

### Build menu (left)

Three Hydrogen Plants + Pipeline. Each button shows its current effective cost (with Wright's Law applied). Buttons dim when unaffordable.

### Info panel (right, on region click)

Bonuses, buildings placed here, customers here, local pressure + price, and a region-specific manifesto quote.

### Dashboard (bottom-right canvas)

- **Pressure gauge** — 270° speedometer arc, 120px, colored from red-orange → cyan with pressure. Shows current and scale.
- **Price trajectory chart** — 90-day window of spot price, all customer-type threshold lines drawn horizontally with right-edge labels, an amber "Oil parity" line (highlighted) and cyan "Global export" line, a dashed 120-day **forward projection** extrapolated from recent slope biased by Wright's Law expected decay, and small customer-type icons placed at the (time, price) points where each customer actually materialized.
- **Budget history chart** (above the price chart) — 180-day window of `state.money`. Bright red horizontal line at the bankruptcy threshold (−€50M). Line color changes dynamically: **green** when trending up, **red** when trending down, **amber** when flat.

### Status bar (bottom)

Three explicit groups:

- **Production:** Supply · Demand · Curtailed (kg/day; red when nonzero)
- **Economy:** Revenue (+€X/day) · Opex (−€Y/day) · **Net** (±€Z/day, green/red)
- **Network:** Wright savings % · Oil Ceiling (€/bbl) · Customers

### Path-to-Parity bar

Centered above the status bar. Pre-parity shows "Path to Oil Parity" fill from €6 → €1.30. Post-parity morphs into "Path to Escape Velocity" fill based on the average of the four Stage-2 numeric gates. Once all conditions hold, a pulsing green **"Witness the flywheel"** button appears.

---

## 14. Visual feedback catalog

Every animation on the map maps back to a sim state — nothing is cosmetic noise.

| What you see | What it means |
| --- | --- |
| Region darkens at night | Sun is below that region's horizon (westward sweep from east) |
| Seasonal tint shifts | Day-of-year progressing; winter-blue → spring-green → summer-amber → autumn-rust |
| Dark blob drifting over a region | Cloud cover sampled at that centroid is > 25% |
| Small streaks over a region | Wind magnitude > 0.45; streaks align with wind direction |
| Region fills with warm glow | Customer slots filling; saturated regions visibly light up |
| Region flashes cyan briefly | A new customer just materialized here |
| Pipe is dim red | Pressure is low (<30% of max) |
| Pipe is amber | Pressure is moderate |
| Pipe is cyan / white-cyan | Pressure is high (>65%) |
| Pipe gets wider | Pressure rising |
| Pipe has flow arrow | Mass flow rate is significant |
| Particles travel along pipe | Molecules flowing at flow-proportional speed, brightness matches local pressure |
| Bright pulse travels outward from a region | Pressure pulse: either an electrolyzer just injected a chunk of H₂ (cyan-green) or a customer just withdrew (amber) |
| Pulsing disc at a region | Junction with ≥ 3 pipe connections; pressure-colored |
| Plant has an internal electron | Plant is currently producing; pulse travels generator → electrolyzer |

---

## 15. Audio

Deferred until first click (browser autoplay policy). All sounds are synthesized with Web Audio oscillators — no samples.

| Sound | Trigger |
| --- | --- |
| Ambient 55 Hz hum | Starts on first click, fades with mute toggle |
| Build sfx | Any non-pipeline placement (two-note rising triangle→sine) |
| Whoosh | Network pressure crosses 25 / 50 / 70 bar upward |
| Customer arpeggio | Customer materialization (rising C–E–G) |
| Cha-ching | Customer materialization, in addition to arpeggio |
| Heartbeat (slow) | Runway 30–60 days, 2 s beat interval |
| Heartbeat (medium) | Runway 10–30 days, 1 s beat |
| Heartbeat (fast) | Runway < 10 days, 0.5 s beat, louder |

Mute via the top-bar 🔊/🔇 toggle.

---

## 16. Save system

- **localStorage**, single slot, key `hydrogen_backbone_save`.
- **Autosave** every 3000 sim ticks (≈ 5 minutes at 1× / 3 s at 100×).
- **Manual save** via the 💾 menu. "Saved ✓" toast + last-saved timestamp ("Last saved: 5m ago") in the save menu footer.
- **Load** restores the whole state including customers, pending customers, pressure, Wright curves, priceEMA, and the narrative-arc state machine.
- **Migration:** older (v2/v3) saves are forward-migrated. Pre-v3 `solar/wind/nuclear` generators with a co-regional `electrolyzer` are collapsed into a single bundled Hydrogen Plant; orphan electrolyzers are dropped; missing `cost` fields are backfilled from `BUILDINGS[type].baseCost × BUILDING_COST_MULTIPLIER`; new v4 state fields (budget history, bankruptcy counters, endgame machine, threshold crossings, etc.) are filled with defaults. The migration never throws.
- **Reset** via the "New Game" button wipes localStorage and re-plays the tutorial.

---

## 17. Important constants (quick reference)

| Constant | Value | Where |
| --- | --- | --- |
| `STARTING_BUDGET` | €200,000,000 | `config.ECONOMY` |
| `BUILDING_COST_MULTIPLIER` | 1.5 | `config.ECONOMY` |
| `DAILY_OPEX_FRACTION` | 0.0003 (~11%/yr) | `config.ECONOMY` |
| `BANKRUPTCY_THRESHOLD` | −€50,000,000 | `config.ECONOMY` |
| `BANKRUPTCY_GRACE_DAYS` | 90 | `config.ECONOMY` |
| `CUSTOMER_REVENUE_MULTIPLIER` | 1.8 | `config.ECONOMY` |
| `ACT_2_MIN_DAY` | 180 | `config.NARRATIVE` |
| `ACT_3_MIN_DAY` | 360 | `config.NARRATIVE` |
| `OIL_PARITY_PRICE_THRESHOLD` | €1.30/kg | `config.NARRATIVE` |
| `OIL_PARITY_MIN_PRODUCTION_KG` | 5,000 kg/day | `config.NARRATIVE` |
| `OIL_PARITY_MIN_CUSTOMERS` | 3 | `config.NARRATIVE` |
| `OIL_PARITY_SUSTAIN_DAYS` | 30 | `config.NARRATIVE` |
| `ESCAPE_VELOCITY_REQUIRED_DAYS` | 20 | `config.ts` |
| `WRIGHT_SAVINGS_CAP` | 0.45 (45% max) | `config.ts` |
| `GLOBAL_EMERGENCE_COOLDOWN_DAYS` | 5 | `config.ts` |
| `PRICE_EMA_DECAY` | 0.97 (per day) | `config.ts` |
| `EFUEL_SURGE_PRESSURE` | 0.85 (normalized) | `config.ts` |
| `EFUEL_SURGE_MULTIPLIER` | 1.5× | `config.ts` |
| `CHURN_DAILY_PROBABILITY` | 0.0002 | `config.ts` |
| `MAX_PRESSURE` / `MIN_PRESSURE` | 80 / 5 bar | `config.ts` |
| `FIRST_CUSTOMER_GRACE_MIN_DAYS` | 45 | `config.ts` |
| `FIRST_CUSTOMER_GRACE_MAX_DAYS` | 75 | `config.ts` |

---

## 18. Quick answers to common questions

- **Does solar stop producing at night?** Yes. `solarCurve = max(0, sin(timeOfDay × π))` goes to zero at midnight. The solar plant icon visibly dims.
- **Does wind produce variability?** Yes. Wind magnitude is a simplex-noise 3D field; it varies across regions and across time. Wind also peaks seasonally in winter.
- **Does wind stop at night?** No. Wind blows 24/7; only solar has a day/night curve.
- **Do I need to place an electrolyzer?** No. Every Hydrogen Plant contains its own integrated 70%-efficient electrolyzer. Electricity never leaves the plant.
- **Can I place a nuclear plant anywhere?** No. Nuclear-friendly regions only (`nuclearBonus ≥ 0.5`). Hover regions to see their bonus.
- **Does electricity flow through pipes?** No. Pipes carry molecules. The whole game is built around this distinction.
- **Why is my price crashing below €1/kg?** You have supply but no customers. `targetPrice = €6 / (supply/demand)^0.4`; when demand is ~0, target goes to the €0.50 floor. Price recovers once customers emerge.
- **Why is my customer count stuck at zero?** First-customer grace needs a pipeline, and the window opens at day 45 after the first pipe is built. Also check slots — every customer type requires a free slot of the right kind in *some* region (industrial / distributed / port / efuel).
- **What is curtailment in this game?** Electricity generated but not converted to hydrogen (bundled plants: always zero). Left over from the v1/v2 model; currently reads as "how much production was lost" which in v3+ is effectively 0 unless the simulation rejects overproduction.
- **Why did my customer cancel?** If you were in the Pending phase and the `priceEMA` climbed back above 110% of the gate threshold, the investment withdrew. Common if price spikes during a long investment lag.
- **Why is my runway "∞"?** You're net-profitable. Daily revenue exceeds daily opex. Enjoy it.
- **What triggers the Game Over?** Budget below −€50M for 90 consecutive days. Reset the counter by getting back above the threshold.
- **Can I save during a cinematic?** Yes. Cinematics are visual-only — sim keeps running, autosave keeps running.

---

## 19. Architecture at a glance

```
src/
├── main.ts          # Boot sequence
├── loop.ts          # rAF loop: fixed 10 Hz sim + variable-rate render
├── sim.ts           # One tick: weather → production → pressure → econ → opex → customers → endgame → autosave
│
├── weather.ts       # Simplex-noise fields + day/night + seasonal tint
├── buildings.ts     # Plants, pipelines, opex, Wright's Law
├── pressure.ts      # Gauss-Seidel pressure relaxation
├── econ.ts          # Price formation, revenue, EMA, e-fuel surge
├── customers.ts     # Emergence gates, pending queue, ramp, churn, grace
├── insights.ts      # Manifesto pop-ups
├── endgame.ts       # Three-act arc, cinematics, bankruptcy
│
├── map.ts           # GeoJSON loader, Lambert-93 projection, hit-test
├── projection.ts    # Pure Lambert-93 math
├── renderer.ts      # All canvas drawing (regions, plants, pipes, dashboard, cinematics)
├── particles.ts     # Pool-allocated molecule particles + pressure pulses
├── chart.ts         # Price chart + budget chart + threshold lines + projection
├── gauge.ts         # Pressure gauge widget
│
├── state.ts         # Game state + replaceState
├── save.ts          # localStorage + migration
├── input.ts         # Mouse/keyboard
├── ui.ts            # All DOM-side UI (HUD, tooltips, modals, progress bar)
├── dom.ts           # Typed query helpers
├── audio.ts         # Web Audio: sfx, ambient, financial heartbeat
├── tutorial.ts      # 3-step first-load hints
├── types.ts         # All shared types
├── config.ts        # All tuning knobs
└── styles.css       # CSS
```

All simulation state lives in `state.ts`. All tuning constants live in `config.ts`. Swap any of them and everything downstream reads the new value next tick.

---

**Build the pipe. The rest follows.**
