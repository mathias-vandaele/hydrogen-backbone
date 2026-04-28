# The Missing Protocol Layer, [Try it here](https://hydrogen-backbone.mathias-vandaele.dev/)

### Why the energy transition is stuck, and what fixes it

---

The energy transition has a problem nobody wants to name. It is not a technology problem. Solar is cheap. Wind is cheap. Nuclear works. Batteries exist. Electrolyzers exist. Every component is ready, proven, and scaling. The transition is stuck anyway.

It is stuck because we are trying to run a 21st-century energy system on a 20th-century architecture. We are trying to push every joule through one carrier — electrons on copper — and it cannot work. Not at the scale required, not at the cost required, not at the reliability required. The grid was designed to move power from a few hundred large plants to millions of passive consumers along predictable schedules. We are now asking it to absorb millions of intermittent producers, balance supply and demand at millisecond resolution across a continent, and store weeks of energy for when the wind stops. It was not built for this. No amount of transformers, frequency regulation, capacity markets, or smart meters will make it something it is not.

There is a fix. It is not new. It is not speculative. It requires no breakthrough. It requires us to recognize something obvious that we have collectively refused to see:

**Electricity is the wrong carrier for bulk energy.**

Electrons are magnificent for precision work — motors, lighting, computation, communication. They are terrible for storage and long-distance transport at civilizational scale. You cannot store a terawatt-hour of electricity. You cannot ship it across an ocean. You cannot buffer two weeks of winter demand in any battery that will ever exist at any price that will ever make sense.

Molecules can do all of this. They always have. The entire fossil fuel economy is proof: coal, oil, and gas are molecular energy carriers with built-in storage, transportability, and energy density. The reason we burn them is not that we are stupid. It is that molecules solve problems electrons cannot.

The energy transition does not need to abandon molecules. It needs to *replace the molecule*. Swap fossil carbon for clean hydrogen. Keep the architecture. Keep the pipelines. Keep the logic of a molecular carrier that can be produced anywhere, stored cheaply, moved through pipes, and converted to work at the point of use.

This is not a hydrogen hype pitch. This is a structural argument about energy system architecture. Hydrogen is not "part of the solution." Hydrogen is the missing protocol layer without which the rest of the transition cannot complete.

---

## I. The price argument

Everything else in this document is secondary to one number.

Solar electricity in southern Europe costs 20 €/MWh today, at utility scale, unsubsidized. This is not a projection. It is a market price. It has fallen 90% in fifteen years and it is still falling.

An electrolyzer converts electricity to hydrogen at roughly 70% efficiency. So 20 €/MWh of solar becomes approximately 30 €/MWh of hydrogen molecules, accounting for conversion losses and compression.

If you need to turn those molecules back into electricity — for grid balancing, for peak demand, for backup — a fuel cell or turbine at 50–60% efficiency brings the round-trip cost to roughly 40–50 €/MWh of dispatchable, available-on-demand, clean power.

Now compare:

- Coal power, unsubsidized: 60–80 €/MWh.
- Gas peaker plants: 80–150 €/MWh.
- Grey hydrogen from steam methane reforming: ~50 €/MWh equivalent, plus a carbon price that is rising every year.
- Curtailed renewable energy: infinite €/MWh, because it produces exactly nothing.

**Clean, dispatchable, storable energy from solar + hydrogen is already cheaper than coal.** Not in 2035. Now. And every year, the input price falls further while the fossil alternative gets more expensive.

This is not a subsidy argument. It is not a policy argument. It is an arithmetic argument. The numbers work today and they improve on autopilot.

---

## II. The curtailment scandal

There is something perverse at the heart of the current energy transition, and it hides in plain sight.

When a solar farm produces power and there is no demand, the energy is curtailed — thrown away. In 2023, Germany curtailed approximately 5 TWh of renewable electricity. Spain regularly hits negative wholesale prices. California pays neighboring states to take its excess solar. Globally, curtailment is growing faster than renewable deployment.

This is treated as a minor operational inconvenience. It is not. It is the single biggest structural failure of the transition, and it is invisible because of an accounting trick.

When a power plant burns coal at 35% thermal efficiency, we correctly label 65% of the energy as "waste." We measure it, report it, penalize it. When a solar farm produces electricity and the grid throws it away, we label it "curtailment" — a scheduling problem, a grid management issue, someone else's department. We do not add it to any efficiency metric. We do not count it as waste.

But it is waste. It is 100% waste. It is worse than 35% coal efficiency because at least the coal plant delivered something. Curtailed solar delivers nothing. And it does something far more damaging than wasting energy: **it destroys the investment signal for the next solar farm.**

A developer considering a new renewable project runs the numbers. If 10% of production will be curtailed, the project's effective revenue drops by 10%. If 20% is curtailed, the project may not pencil out at all. The rational response is to not build. This is happening now, across Europe, at exactly the moment when we need to be building faster than ever.

The hydrogen backbone eliminates this problem entirely. Not by solving curtailment — by making it structurally impossible.

If every MWh of excess renewable generation can be converted to hydrogen and injected into a pipeline at a spot price, there is no such thing as excess. There is only price variation. The developer's revenue model changes from "sell electrons when the grid wants them, lose everything when it doesn't" to "sell electrons at high prices when demand is high, sell molecules at lower prices when it is not." The floor is no longer zero. The floor is the marginal cost of electrolysis — which is the electricity price itself.

This is not a subsidy. It is not a mandate. It is a market. And it is the only market structure that makes aggressive renewable overbuild rational.

---

## III. The protocol layer

In the 1970s, telecommunications worked like today's power grid. A centralized network operated by monopoly carriers. Smart core, dumb edges. Every new use case — a fax machine, a modem, a video call — required the network operator to provision capacity, manage routing, and approve the connection. Innovation required permission.

The internet replaced this with something simpler and more powerful: a dumb pipe. TCP/IP does not know or care what it carries. It moves packets. The intelligence moved to the edges — to the billions of devices that connect, produce, consume, and innovate without asking the network's permission. No one calls their ISP before launching a website.

This architectural inversion — dumb core, smart edges — is the most consequential infrastructure decision of the last fifty years. It did not succeed because it was more efficient than the telephone network. Packet switching wastes bandwidth. TCP retransmits lost data. The overhead is enormous compared to a dedicated circuit. It won because it was *simple*, *open*, and *permissionless*. Anyone could build anything on top of it.

The electrical grid is a telephone network. A centralized operator (the TSO) manages frequency at 50 Hz across an entire synchronous zone. Every generator must be dispatched in coordination. Every large load must be forecast. Adding a gigawatt of solar requires grid studies, transformer upgrades, and years of permitting. The network is brilliant, fragile, and fundamentally hostile to distributed, unpredictable, bidirectional energy flows — which is exactly what a renewable-heavy system produces.

**A hydrogen pipeline network is TCP/IP for energy.**

The pipe does not care who injects hydrogen or who withdraws it. It does not need to know. Pressure is the only signal, and pressure is self-regulating: inject more than you withdraw and pressure rises (energy is stored); withdraw more than you inject and pressure falls (energy is released). The pipeline is simultaneously a transport medium, a buffer, and a clearing mechanism. It is, in the precise engineering sense, a dumb pipe.

The consequences of this architecture are the same as the consequences of the internet:

**Permissionless production.** Anyone with an electrolyzer and a grid connection — or just solar panels and water — can produce hydrogen and inject it. No dispatch coordination. No frequency regulation. No TSO approval for each new producer. Connect, inject, meter, settle.

**Permissionless consumption.** A steel plant, a methanol synthesizer, an ammonia factory, a fuel cell power station, a trucking depot — each connects to the pipe and withdraws what it needs. The network does not need to know what the molecule is used for, just as the internet does not need to know what the packet contains.

**Automatic storage.** The pipeline itself stores energy through line-packing: varying pressure between safe operating limits. One thousand kilometers of one-meter-diameter pipeline, operated between 30 and 80 bar, stores approximately 110 GWh — enough to buffer daily demand fluctuations without any dedicated storage facility. The pipe is the battery.

**Pressure-driven conversion.** When injection exceeds withdrawal, pressure rises. Rising pressure is a price signal visible to every edge participant: hydrogen is abundant, hydrogen is cheap, now is the time to consume. E-fuel plants — methanol synthesizers, Fischer-Tropsch reactors, ammonia producers — ramp up automatically when pressure is high, converting hydrogen into liquid fuels and chemicals that store in ordinary tanks at atmospheric pressure. The network does not need salt caverns or cryogenic storage to buffer seasonal surplus. It converts surplus into oil-equivalent liquids that the world already knows how to store, ship, and use. Every oil tank, every chemical terminal, every fuel depot becomes part of the seasonal buffer — for free.

**Topological redundancy.** A meshed pipeline network routes around failures automatically, the same way the internet routes around a broken link. Pressure gradients do the work. No central controller needed.

**Decoupled timescales.** The electrical grid must balance supply and demand at sub-second resolution. The hydrogen network balances over hours to weeks. This is not a weakness — it is the entire point. The molecule absorbs the volatility that the electron cannot.

---

## IV. The flywheel

There is a virtuous cycle buried in the economics that, once started, becomes self-reinforcing.

Cheap solar → cheap hydrogen → guaranteed demand for renewable electricity → more solar built → cheaper solar → cheaper hydrogen.

This is Wright's Law: every doubling of cumulative production reduces unit cost by a fixed percentage. It drove solar panels from $76/W in 1977 to $0.20/W today. It drove lithium-ion batteries from $1,100/kWh in 2010 to $140/kWh in 2023. It is the most reliable empirical law in industrial economics.

The hydrogen backbone activates Wright's Law for two industries simultaneously: solar (and wind) manufacturing, and electrolyzer manufacturing. It does this by solving the only problem that Wright's Law cannot solve on its own — demand uncertainty. A manufacturer will not invest in a new gigafactory if there is no buyer. A developer will not build a solar farm if the energy will be curtailed. A bank will not finance an electrolyzer if there is no guaranteed offtake.

The backbone is the guaranteed offtake. It is the demand floor. It is the signal that says: produce as much hydrogen as you want, the network will absorb it, and someone downstream will buy it.

This is exactly what feed-in tariffs did for solar in Germany in the 2000s — they guaranteed demand, which triggered manufacturing scale, which collapsed costs, which made subsidies unnecessary. The hydrogen backbone does the same thing, but without subsidies, because the molecule has intrinsic value to industry from day one.

The implication is striking: **you do not need hydrogen to be cheap before you build the backbone. You build the backbone to make hydrogen cheap.**

---

## V. What plugs in

Once the pipe exists, the edges innovate. Each of these is a business that becomes viable the moment it can buy or sell molecules at a known price from a network connection.

**Steel.** Direct-reduced iron using hydrogen replaces coking coal. A single DRI plant consumes roughly 70,000 tonnes of H₂ per year. Connect it to the pipe. The plant does not need its own electrolyzer, its own solar farm, its own storage. It needs a valve and a contract.

**Ammonia and fertilizers.** The Haber-Bosch process consumes 1.8% of global energy, almost all from grey hydrogen. A pipe connection replaces the steam methane reformer. The chemistry does not change. The carbon disappears.

**E-fuels — the oil price ceiling.** This is the most consequential edge application and it deserves its own logic. Combine pipeline hydrogen with captured CO₂ and you produce e-methanol, e-kerosene, synthetic diesel — drop-in replacements for fossil fuels, using existing engines, existing tanks, existing supply chains. Aviation, shipping, and long-haul trucking decarbonize without electrification — which is good, because they cannot electrify.

But the deeper consequence is economic, not chemical. E-fuel producers are the backbone's natural pressure relief valve. When the network is flush with cheap hydrogen — summer, midday, windy weeks — pressure rises and the spot price of H₂ drops. E-fuel production becomes more profitable precisely when hydrogen is most abundant. Plants ramp up, consume the surplus, and output liquid hydrocarbons that store trivially in atmospheric tanks. No caverns needed. No cryogenics. The existing oil infrastructure — every tank farm, every port terminal, every fuel depot — becomes the seasonal buffer.

And here is what this means for oil: the moment e-fuel production cost falls below the market price of fossil crude, an arbitrageur will simply produce synthetic fuel instead of buying petroleum. This creates a hard ceiling on the price of oil — set not by OPEC, not by sanctions, not by policy, but by the cost of solar electricity and electrolysis. That ceiling ratchets down every year as solar gets cheaper. At some point — and it is not far — the ceiling drops below the extraction cost of most conventional oil fields. The fossil fuel industry does not get banned. It gets priced out. Quietly, permanently, and without anyone needing to win a political argument.

**Distributed power.** A municipality installs a fuel cell and a pipe connection. It now has a dispatchable local power plant with no emissions, no fuel supply chain, and no dependency on grid stability. The electrical grid becomes a local, last-mile delivery system — like WiFi. The backbone carries the bulk energy.

**Chemicals and plastics.** Methanol-to-olefins, Fischer-Tropsch synthesis, hydrogen peroxide production — the entire petrochemical value chain has hydrogen-fed alternatives. The pipe makes them economically accessible to any plant, anywhere on the network.

**Seasonal arbitrage.** Produce hydrogen in summer when solar is abundant. Convert to e-methanol or ammonia. Store in tanks. Sell in winter when heating and transport demand peaks. The spread pays for the conversion. No geological storage required — just chemistry and a calendar.

**Small producers.** A farmer with two hectares of solar panels and a containerized electrolyzer injects hydrogen into the local distribution network. The barrier to entry is a bank loan and a pipe connection. The energy system acquires millions of producers, exactly as the internet acquired millions of websites. Nobody needs permission.

---

## VI. Why France

This is not a universal argument applied generically. France is the specific geography where this works first and best.

**Nuclear baseload.** France operates 56 nuclear reactors generating roughly 65% of national electricity. Nuclear excels at constant output but suffers economically when demand drops — reactors cannot ramp fast, and selling at negative prices destroys revenue. Electrolysis absorbs off-peak nuclear power, raising reactor load factors and revenue. The backbone turns nuclear's weakness into hydrogen production capacity, available 24/7, rain or shine.

**Solar potential in the south.** Southern France receives 1,500–1,800 kWh/m²/year of solar irradiation. Utility-scale solar LCOE is already below 30 €/MWh domestically and falling. With a backbone, Provence and Occitanie become hydrogen production zones feeding industrial demand in the north.

**Existing gas infrastructure.** France operates over 37,000 km of gas transmission and distribution pipelines, with storage sites at Manosque, Étrez, Tersanne, and Hauterives. The rights-of-way, the compressor stations, and the operational expertise transfer directly. Where existing steel pipes cannot be repurposed, polymer pipes — cheaper, hydrogen-native, and already proven — replace them. The marginal cost of a hydrogen-ready network built along existing gas corridors is a fraction of greenfield construction.

**Salt geology as strategic reserve.** France has sufficient geological salt formations for dozens of caverns, each capable of storing roughly 280 GWh of hydrogen. These are not required for the backbone to function — e-fuel conversion handles seasonal balancing without underground storage — but they provide an additional layer of strategic energy reserves, analogous to France's existing petroleum reserves. Optional, but sovereign.

**Industrial ports.** Marseille, Dunkirk, Le Havre — France's port infrastructure is positioned for e-fuel export to global shipping and aviation markets. A hydrogen backbone connecting southern production zones to northern industrial ports creates a clean-fuel export corridor.

**Statist infrastructure tradition.** France built its nuclear fleet, its rail network, and its gas system through centralized state-led investment. The hydrogen backbone requires exactly this model: sovereign construction, open-access regulation, private edge innovation. France already knows how to do this. Few other nations do.

---

## VII. The honest objections

A manifesto that does not address its weaknesses is propaganda. Here is what critics will say, and why they are wrong or right.

**"Hydrogen is inefficient."** This is the most common objection and the most confused. Round-trip efficiency of electricity → hydrogen → electricity is 35–42% today. This is real. But the objection assumes that the relevant comparison is against batteries at 90%. It is not. Batteries cannot store a terawatt-hour. They cannot provide two weeks of backup. They cannot produce steel or ammonia. The relevant comparisons are: curtailment (0% efficiency), seasonal pumped hydro (geographically impossible in most locations), and fossil fuels (which are not clean at any efficiency). Against these, 35% round-trip is excellent. And most hydrogen never round-trips — it goes into industry as a molecule, at 70% one-way efficiency, competing against grey hydrogen that has its own energy cost and a growing carbon price.

**"Hydrogen leaks and is an indirect greenhouse gas."** True. Atmospheric H₂ has a GWP-100 of approximately 11, primarily through extending methane's atmospheric lifetime. But H₂'s atmospheric residence time is roughly two years versus CO₂'s centuries. A hydrogen system with 2% leakage rate displaces a fossil system with 100% combustion emissions. The net climate benefit is overwhelming. Leakage is an engineering problem to minimize, not a structural objection.

**"Green hydrogen is too expensive."** Today, yes — 4 to 7 €/kg in Europe. But this objection assumes current prices are permanent. Solar was €500/MWh in 2000. The backbone is precisely the mechanism that drives the cost down, by guaranteeing demand and activating manufacturing scale. You do not wait for cheap hydrogen to build the network. You build the network to make hydrogen cheap.

**"Embrittlement — you cannot put hydrogen in pipes."** You can. Polymer pipes — HDPE, PE100, fiber-reinforced composites — carry hydrogen without embrittlement, at lower cost per meter than steel, and are already deployed in gas distribution networks across Europe. For high-pressure transmission, modern microalloyed steel and composite-lined pipes are proven and in service. This objection is fifteen years out of date. It refers to a problem that materials science solved while the policy debate was not paying attention.

**"Who pays for the backbone?"** The hardest question and the right one to ask. The answer is the same as for every other network infrastructure in history: sovereign investment with regulated open access. France built 56 nuclear reactors with public capital. The hydrogen backbone is smaller in scale and more certain in return. Regulated transport tariffs, funded by volume, repay the investment. The edges — the electrolyzers, the steel plants, the e-fuel refineries — are private capital, attracted by the existence of the network, exactly as websites were attracted by the existence of the internet.

---

## VIII. The choice

The energy transition is currently framed as a problem of building enough of the right things — enough solar, enough wind, enough batteries, enough grid, enough political will. This framing is wrong. We have enough of everything except architecture.

We are trying to force a new energy system into the shape of the old one. We are trying to make electrons do what molecules do, and it is failing: failing in grid congestion, failing in curtailment, failing in industrial decarbonization, failing in storage, failing in investment signals. Not because the components are bad, but because the architecture is wrong.

The fix is not more of the same. The fix is a new layer. A molecular protocol layer — dumb, open, permissionless — that absorbs what the grid cannot carry, stores what batteries cannot hold, and enables what electrons cannot power.

Hydrogen is not the future of energy. Hydrogen is the future of energy *architecture*. The backbone is not a project. It is a paradigm.

Build the pipe. The rest follows.
