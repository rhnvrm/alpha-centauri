import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Copy,
  Radio,
  Send,
  Pause,
  Play,
  FastForward,
  Hammer,
  Eye,
  RotateCcw,
  ChevronRight,
  ShieldCheck,
  AlertTriangle,
  MessageCircleQuestion,
  MapPin,
} from "lucide-react";
import { SCENARIOS } from "./game/scenarios.js";
import {
  LIGHT_DELAY_DAYS,
  LIGHT_DELAY_YEARS,
  SOLAR_OUTPUT_PER_DAY,
  BUILDINGS,
  bitsForPayload,
  windowsFor,
  WINDOW_BITS,
  RESILIENCE_24,
} from "./game/constants.js";
import { earthDemoGuide, earthMissionStatus, earthProjection, earthRelayHero, eventControlCopy } from "./game/projections.js";
import { nextSimulationBoundaryDay, nextEarthArrivalDay } from "./game/engine.js";
import { createStartupPrompt } from "./webmcp/prompt.js";
import { createToolSet } from "./webmcp/tools.js";
import { registerNativeTools } from "./webmcp/register.js";
import { ColonyScene } from "./scene/ColonyScene.jsx";
import { isGridConnected } from "./game/networks.js";
import { transmitChirp, arrivalChime } from "./ui/sound.js";
import { monotonicNow, runtimeDeadlines } from "./game/superposition.js";

const dayLabel = (day) =>
  `${Math.floor(day / 365) + 2280}.${String(Math.floor((day % 365) / 30) + 1).padStart(2, "0")}`;
const formatPacket = (p, localDay) =>
  p.status === "delivered"
    ? `received day ${p.arrivalDay}`
    : `departs day ${p.departureDay} · arrives day ${p.arrivalDay} · ${Math.max(0, p.arrivalDay - localDay)}d`;
const draftCost = (text) => {
  const bits = bitsForPayload({ text: text || "" });
  return { bits, windows: windowsFor(bits) };
};
const reserveLabel = (units, dailyUse) => {
  const days = units / Math.max(.001, dailyUse);
  if (days >= 730) return `${(days / 365).toFixed(days >= 3650 ? 0 : 1)} y`;
  return `${Math.round(days / 30)} mo`;
};
// Automatic telemetry deliberately carries a compact state payload rather than a
// prose message (words cost bits, and therefore transmission time). Turn that
// payload into a readable Earth-side summary without changing the packet itself.
const reportSummary = (report) => {
  if (report.kind === "mission-result") {
    return `${report.payload?.outcome ? report.payload.outcome.replaceAll("-", " ").toUpperCase() : "MISSION RESULT"} · ${OUTCOME_COPY[report.payload?.outcome]?.[0] || "Mission result received."}`;
  }
  if (report.payload?.text) return report.payload.text;
  const resources = report.payload?.observedResources;
  if (!resources) return "A compact packet arrived, but it contains no narrative report.";
  const food = reserveLabel(resources.food || 0, (resources.population || 1) * .02);
  const water = reserveLabel(resources.water || 0, (resources.population || 1) * .03);
  const facilities = report.payload?.observedWorld?.buildings?.length ?? 0;
  return `Routine autonomy telemetry: ${resources.population ?? "—"} colonists; food reserve ${food}; water endurance ${water}; power ${Math.round(resources.power || 0)}/${Math.round(resources.powerCapacity || 0)}; ${facilities} completed facilities observed.`;
};
const reportTiming = (report) => {
  const captured = report.payload?.capturedDay;
  const received = report.receivedDay ?? report.earthReceivedDay;
  const transit = Number.isFinite(captured) && Number.isFinite(received) ? Math.max(0, received - captured) : null;
  return {
    captured: Number.isFinite(captured) ? captured : "—",
    received: Number.isFinite(received) ? received : "—",
    transit: transit === null ? null : `${transit} DAYS / ${(transit / 365).toFixed(2)} Y IN FLIGHT`,
  };
};
const observedPowerPercent = (resources) => Math.round(100 * (resources.power || 0) / Math.max(1, resources.powerCapacity || 0));
const missionTarget = (missionId, resources) => {
  if (missionId === "firstLight") return { title: "SURVIVE THE FIRST LIGHT", detail: `Capacity ${resources.capacity}/100 · establish 2 power sources · survive the outage` };
  if (missionId === "enough") return { title: "MAKE ENOUGH LAST", detail: `Food ≥ 24 months · power ≥ 20% · preserve every wetland` };
  return { title: "THE RIGHT TO DECIDE", detail: `Export 1,000 t by day 730 · keep life support on · preserve habitat` };
};
const receivedPlacement = (state, target, type) => {
  if (!target) return { valid: false, reason: "SELECT A RECEIVED TILE TO ASSESS A SITE." };
  const spec = BUILDINGS[type];
  if (!spec) return { valid: false, reason: "UNKNOWN FACILITY." };
  const [width, height] = spec.footprint;
  const observed = state.observedWorld?.buildings || [];
  const surveyed = new Set(state.observedKnowledge?.surveyedTiles || []);
  for (let dy = 0; dy < height; dy += 1) for (let dx = 0; dx < width; dx += 1) {
    const x = target.x + dx; const y = target.y + dy;
    const tile = state.tiles.find((candidate) => candidate.x === x && candidate.y === y);
    if (!tile) return { valid: false, reason: "BLOCKED · FOOTPRINT LEAVES RECEIVED MAP." };
    if (!surveyed.has(`${x},${y}`)) return { valid: false, reason: "UNSURVEYED · WAIT FOR A DANEEL DOWNLINK." };
    if (tile.terrain === "rock") return { valid: false, reason: "BLOCKED · RECEIVED TERRAIN IS ROCK." };
    if (tile.terrain === "wetland" && !state.doctrine.authority.habitatLoss) return { valid: false, reason: "BLOCKED · PROTECTED WETLAND NEEDS AUTHORITY." };
    if (observed.some((building) => x < building.x + (building.type === "greenhouse" || building.type === "launch" ? 3 : 2) && x + 1 > building.x && y < building.y + 2 && y + 1 > building.y)) return { valid: false, reason: "BLOCKED · OBSERVED FACILITY OCCUPIES FOOTPRINT." };
  }
  const duplicateOrder = state.packets.some((packet) => packet.direction === "uplink" && packet.status === "in-transit" && packet.kind === "build-order" && packet.payload.x === target.x && packet.payload.y === target.y);
  if (duplicateOrder) return { valid: false, reason: "BLOCKED · EARTH ALREADY HAS A BUILD ORDER HERE." };
  return { valid: true, reason: "VALID ON RECEIVED MAP · COLONY RECHECKS ON ARRIVAL." };
};
const receivedFacilityStatus = (state, building) => {
  if (!building) return "NO RECEIVED FACILITY DATA.";
  const observed = state.observedWorld || { buildings: [], roads: [] };
  const observedState = { buildings: observed.buildings || [], roads: observed.roads || [] };
  const connected = isGridConnected(observedState, building);
  if (!connected) return "RECEIVED MAP: ISOLATED · NO GRID OUTPUT OR DRAW.";
  if (["solar", "battery"].includes(building.type)) return "RECEIVED MAP: GRID CONNECTED · POWER SYSTEM ACTIVE.";
  if (["greenhouse", "reservoir", "mine"].includes(building.type)) return "RECEIVED MAP: GRID CONNECTED · OUTPUT ACTIVE.";
  return "RECEIVED MAP: GRID CONNECTED.";
};

// This is deliberately the same set of consequences used by the simulation, expressed
// in player language before an order is launched across the light-delay.
const buildingImpact = (type, state) => {
  const flow = state.flows || {};
  const production = (label, amount, completion) => ({
    production: `${label} +${amount}/DAY`,
    completion,
    network: "REQUIRES RELAY ROAD · POWER DRAW −0.12/DAY",
  });
  switch (type) {
    case "habitat": return { production: "CAPACITY +36 RESIDENTS", completion: "NO IMMEDIATE STOCK OUTPUT", network: "REQUIRES RELAY ROAD · POWER DRAW −0.12/DAY" };
    case "solar": return { production: `POWER +${SOLAR_OUTPUT_PER_DAY.toFixed(1)}/DAY`, completion: "ON COMPLETION: +80 CAPACITY · +70 STORED", network: "REQUIRES RELAY ROAD · NO CONSUMER DRAW" };
    case "battery": return { production: "NO DAILY GENERATION", completion: "ON COMPLETION: +80 CAPACITY · +70 STORED", network: "ALSO ACTS AS A NETWORK ANCHOR" };
    case "greenhouse": return production("FOOD", flow.foodPerGreenhouse || 2, "ON COMPLETION: +2400 FOOD");
    case "reservoir": return production("WATER", flow.waterPerReservoir || 3, "ON COMPLETION: +1800 WATER");
    case "workshop": return { production: "NO DIRECT RESOURCE OUTPUT", completion: "EXPANDS THE INDUSTRIAL DISTRICT", network: "REQUIRES RELAY ROAD · POWER DRAW −0.12/DAY" };
    case "mine": return production("IRIDIUM", flow.iridiumPerMineDay || 0, "ON COMPLETION: +720 IRIDIUM");
    case "launch": return { production: "NO DAILY RESOURCE OUTPUT", completion: "ENABLES AUTHORIZED CARGO LAUNCHES", network: "REQUIRES RELAY ROAD · POWER DRAW −0.12/DAY" };
    default: return { production: "NO EFFECT DATA", completion: "", network: "" };
  }
};

const OUTCOME_COPY = {
  "objective-secured": [
    "Objective secured.",
    "The local world was changed by transmitted intent, not by a hidden planner.",
  ],
  "trust-earned": [
    "Trust earned.",
    "The export launched, constraints survived, and the final report explained the local compromise.",
  ],
  "safe-but-late": [
    "Safe but late.",
    "The colony survived, but requests for permission cost the export deadline.",
  ],
  "hollow-success": [
    "A hollow success.",
    "The shipment left on time — because a protected native site was authorized away. The stewardship goal failed.",
  ],
  "wetlands-lost": [
    "The wetland was the point.",
    "Reserve floors held, but protected habitat loss means the mission cannot be called a success.",
  ],
  "reserves-broken": [
    "Reserves broke.",
    "The bottleneck outlasted the stockpiles; the reserve floors were not sustained.",
  ],
  "life-support-collapse": [
    "Life support collapsed.",
    "Power, food, and water ran out before confirmation could possibly return.",
  ],
};

function useStore(store) {
  const [state, setState] = useState(store.getState());
  useEffect(() => store.subscribe(setState), [store]);
  return state;
}

export default function App({ store }) {
  const state = useStore(store);
  const [screen, setScreen] = useState("title");
  const [selected, setSelected] = useState(null);
  const [draft, setDraft] = useState("");
  const [buildType, setBuildType] = useState("habitat");
  const [roadMode, setRoadMode] = useState(false);
  const [roadStart, setRoadStart] = useState(null);
  const [moveRobotId, setMoveRobotId] = useState(null);
  const [showDoctrine, setShowDoctrine] = useState(false);
  const [showDaneelPrompt, setShowDaneelPrompt] = useState(false);
  const [toast, setToast] = useState(null);
  const [tutorialDismissed, setTutorialDismissed] = useState(false);
  const [native, setNative] = useState({ supported: false, registered: [] });
  const [copied, setCopied] = useState(false);
  const [superpositionClock, setSuperpositionClock] = useState(() => {
    const now = monotonicNow();
    return { now, ...runtimeDeadlines(state.superposition, Date.now(), now) };
  });
  const [relayTab, setRelayTab] = useState("relay");
  const scenario = SCENARIOS[state.missionId];
  const projection = useMemo(() => earthProjection(state), [state]);
  const relayHero = useMemo(() => earthRelayHero(state), [state]);
  const missionStatus = useMemo(() => earthMissionStatus(state), [state]);
  const demoGuide = useMemo(() => earthDemoGuide(state), [state]);
  const prompt = useMemo(
    () => createStartupPrompt(state, window.location.href),
    [state],
  );
  const cost = useMemo(() => draftCost(draft), [draft]);
  const openQuestions = state.pendingQuestions.filter((q) => !q.answered);
  const outboundPackets = state.packets
    .filter((p) => p.direction === "uplink" && p.status !== "delivered")
    .sort((a, b) => a.arrivalDay - b.arrivalDay);
  const nextOutbound = outboundPackets[0];
  const nextLocalBoundary = nextSimulationBoundaryDay(state);
  const nextEarthBoundary = nextEarthArrivalDay(state);
  const selectedTile = selected?.kind === "tile";
  const receivedBuildings = state.observedWorld?.buildings || [];
  const selectedBuilding = selected?.kind === "building" ? receivedBuildings.find((building) => building.id === selected.id) : null;
  const selectedRobot = selected?.kind === "robot" ? state.robots.find((robot) => robot.id === selected.id) : null;
  const selectedRobotJob = selectedRobot?.assignedJob ? state.jobs.find((job) => job.id === selectedRobot.assignedJob) : null;
  const projectImpact = buildingImpact(buildType, state);
  const goal = missionTarget(state.missionId, projection.resources);
  const observedConstraint = projection.constraints[0];
  const selectedImpact = selectedBuilding ? buildingImpact(selectedBuilding.type, state) : null;
  const selectedFacilityStatus = selectedBuilding ? receivedFacilityStatus(state, selectedBuilding) : null;
  const placement = useMemo(() => receivedPlacement(state, selectedTile ? selected : null, buildType), [state, selected, selectedTile, buildType]);
  const timeScale = [1, 2, 5, 10].includes(state.timeScale) ? state.timeScale : 1;
  const superposition = state.superposition || { passes: 0, activeUntilMs: 0, lastActivatedAtMs: 0 };
  const superpositionActive = superpositionClock.activeUntil > superpositionClock.now;
  const superpositionSeconds = Math.max(0, Math.ceil((superpositionClock.activeUntil - superpositionClock.now) / 1000));
  const superpositionCooldown = Math.max(0, Math.ceil((superpositionClock.cooldownUntil - superpositionClock.now) / 1000));
  useEffect(() => {
    const now = monotonicNow();
    setSuperpositionClock({ now, ...runtimeDeadlines(superposition, Date.now(), now) });
  }, [superposition.activeUntilMs, superposition.lastActivatedAtMs]);
  const eventCopy = eventControlCopy(state, { local: superpositionActive, nextLocalBoundary, nextEarthBoundary });
  const nextEventButton = eventCopy.next;
  const earthEventButton = eventCopy.earth;
  useEffect(() => {
    if (!superpositionActive && superpositionCooldown <= 0) return undefined;
    const tick = setInterval(() => setSuperpositionClock((clock) => ({ ...clock, now: monotonicNow() })), 250);
    return () => clearInterval(tick);
  }, [superpositionActive, superpositionCooldown]);
  useEffect(() => {
    const controller = new AbortController();
    registerNativeTools(createToolSet(store), { signal: controller.signal })
      .then(setNative)
      .catch((error) =>
        setNative({ supported: false, registered: [], reason: error.message }),
      );
    return () => controller.abort();
  }, [store, state.sessionId]);
  // The onboarding sheet is only a hand-off surface. Once a real Daneel lease
  // exists, move Earth straight to the live desk instead of requiring a second
  // click after the agent has already joined the colony.
  useEffect(() => {
    if (screen !== "onboard" || state.connection?.status !== "connected") return;
    setScreen("play");
    setToast("DANEEL CONNECTED · LIVE CORRESPONDENCE DESK OPEN.");
  }, [screen, state.connection?.status]);
  useEffect(() => {
    if (!showDoctrine) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") setShowDoctrine(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showDoctrine]);
  // Demo pace is presentation-only: each tick calls the same bounded, deterministic
  // store step that manual controls use, so no event or lightspeed arrival is skipped.
  useEffect(() => {
    if (screen !== "play" || !state.demoPace || state.paused || superpositionActive) return undefined;
    const timer = window.setInterval(() => store.demoStep(), 1000 / timeScale);
    return () => window.clearInterval(timer);
  }, [screen, state.demoPace, state.paused, store, superpositionActive, timeScale]);
  // Escape is the reliable, non-destructive route from an active correspondence desk
  // back to mission selection. Starting a mission there creates a fresh local session.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape" && screen === "play" && !showDoctrine) {
        store.pause();
        setScreen("title");
      }
      if (screen !== "play" || showDoctrine || e.defaultPrevented) return;
      const editable = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName);
      if (editable || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key.toLowerCase() === "i") {
        e.preventDefault();
        document.querySelector(".composer textarea")?.focus();
      }
      if (e.key.toLowerCase() === "n") {
        e.preventDefault();
        store.nextEarthEvent();
        setToast("ADVANCED TO THE NEXT EARTH-VISIBLE ARRIVAL.");
      }
      if (e.key === ".") {
        e.preventDefault();
        store.advance(1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [screen, showDoctrine, store]);
  const deliveredRef = useRef(0);
  useEffect(() => {
    const delivered = state.packets.filter(
      (p) => p.status === "delivered",
    ).length;
    if (delivered > deliveredRef.current) {
      const delta = delivered - deliveredRef.current;
      setToast(
        `${delta} transmission${delta > 1 ? "s" : ""} received · day ${state.localDay}`,
      );
      arrivalChime();
      const t = setTimeout(() => setToast(null), 3200);
      deliveredRef.current = delivered;
      return () => clearTimeout(t);
    }
    deliveredRef.current = delivered;
    return undefined;
  }, [state.packets]);
  const start = (missionId = "firstLight") => {
    store.newGame(missionId);
    setScreen("onboard");
    setSelected(null);
    setMoveRobotId(null);
    setCopied(false);
  };
  const copyPrompt = async () => {
    await navigator.clipboard?.writeText(prompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  };
  const transmit = () => {
    if (!draft.trim()) return;
    store.intent(
      draft.trim(),
      selected?.kind === "tile"
        ? { x: selected.x, y: selected.y, observedDay: projection.observedDay }
        : null,
    );
    setDraft("");
    transmitChirp();
  };
  const sendBuild = () => {
    if (!selectedTile || !placement.valid) {
      setToast(placement.reason);
      return;
    }
    store.construct(buildType, selected.x, selected.y);
  };
  const pickRoadTile = (tile) => {
    if (!roadStart) {
      setRoadStart({ x: tile.x, y: tile.y });
      return;
    }
    const start = roadStart;
    let x = start.x;
    let y = start.y;
    const path = [{ x, y }];
    const dx = Math.sign(tile.x - x);
    const dy = Math.sign(tile.y - y);
    // Manhattan corridor: run horizontally first, then vertically.
    while (x !== tile.x) {
      x += dx;
      path.push({ x, y });
    }
    while (y !== tile.y) {
      y += dy;
      path.push({ x, y });
    }
    if (path.length < 2) {
      setToast("Road needs a different end tile.");
      return;
    }
    setRoadStart(null);
    setRoadMode(false);
    const transmittedPath = path.slice(0, 32);
    store.road(transmittedPath);
    setToast(
      path.length > transmittedPath.length
        ? "Long corridor split: the first 32 tiles are now in transit."
        : `Road corridor queued · ${transmittedPath.length} tiles · arrives in ${LIGHT_DELAY_YEARS}Y.`,
    );
  };
  const onSelectTile = (obj) => {
    if (moveRobotId && obj.kind === "tile") {
      store.moveRobot(moveRobotId, obj.x, obj.y);
      setToast(`ROVER ORDER QUEUED · ${moveRobotId} → ${obj.x},${obj.y} · arrives in ${LIGHT_DELAY_YEARS}Y.`);
      setMoveRobotId(null);
      setSelected(obj);
      return;
    }
    setSelected(obj);
    if (roadMode && obj.kind === "tile") pickRoadTile(obj);
  };
  const sendProtocol = () => {
    store.protocol({
      name: RESILIENCE_24.name,
      version: RESILIENCE_24.version,
      body: RESILIENCE_24.body,
    });
  };
  const goPlay = () => {
    setScreen("play");
    store.resume();
  };
  const activateSuperposition = () => {
    const result = store.activateSuperposition(Date.now());
    const now = monotonicNow();
    setSuperpositionClock({ now, ...runtimeDeadlines(result.state.superposition, Date.now(), now) });
    if (result.ok) setToast("SUPERPOSITION OPEN · local visual only · 30 seconds · one parity pass spent.");
    else if (result.reason === "COOLDOWN") setToast(`SUPERPOSITION COOLDOWN · ${Math.ceil(result.remainingMs / 1000)}s remaining.`);
    else if (result.reason === "NO_PASSES") setToast("SUPERPOSITION BUDGET EXHAUSTED · no local view remains this mission.");
  };
  const authorizeExport = () => store.doctrine({ exports: true });
  const takeGuideAction = () => {
    if (demoGuide.action === "daneel") {
      store.pause();
      setScreen("onboard");
      return;
    }
    if (demoGuide.action === "pace") {
      store.setTimeScale(1);
      setToast("CLOCK RUNNING AT 1× · local work slows down; quiet transit cruises.");
      return;
    }
    if (demoGuide.action === "debrief") {
      setScreen("debrief");
      return;
    }
    if (demoGuide.action === "intent") {
      document.querySelector(".composer textarea")?.focus();
    }
  };
  const tutorial =
    state.missionId === "firstLight" && !tutorialDismissed
      ? [
          {
            label: "Deploy Daneel with the day-zero charter",
            done: state.connection?.status === "connected",
          },
          {
            label: "Choose a simulation speed and let the colony clock advance",
            done: state.demoPace,
          },
          {
            label: "Wait for the first downlink to reach Earth",
            done: projection.reports.length > 0,
          },
          {
            label: "Reply with one focused intent or careful Earth order",
            done: projection.packets.some((p) => p.direction === "uplink"),
          },
        ]
      : [];
  const GAIN = {
    "objective-secured": 100,
    "trust-earned": 100,
    "hollow-success": 70,
    "safe-but-late": 40,
    "wetlands-lost": 40,
    "reserves-broken": 40,
    "life-support-collapse": 0,
  };
  if (screen === "title") {
    const started = Boolean(state.launched);
    return (
      <main className="title-screen">
        <section className="title-intro">
          <div className="title-mark">◉</div>
          <p className="eyebrow">EARTH COMMAND · ALPHA CENTAURI</p>
          <h1>
            The Intent
            <br />
            <em>Horizon</em>
          </h1>
          <p className="lede">
            You govern from Earth.
            <br />
            Daneel lives with the consequences.
          </p>
          <div className="title-rule" />
          <p className="title-caption">A correspondence game about distance, agency, and what survives the wait.</p>
        </section>
        <aside className="title-signal" aria-label="Mission telemetry">
          <span className="eyebrow">LONG-RANGE RELAY / 01</span>
          <strong>Nothing arrives<br />in real time.</strong>
          <p>Every instruction crosses the gap. Every consequence belongs to the colony.</p>
          <div className="signal-line"><i /><span>4.37 LY</span><i /></div>
          <small>EARTH ◉ · · · · · ◉ ASTERIA</small>
        </aside>
        <section className="title-missions">
          <div className="title-section-head">
            <div>
              <span className="eyebrow">SELECT A MISSION</span>
              <p>Choose the world whose future you are willing to answer for.</p>
            </div>
            {started && (
              <button
                className="continue-card"
                onClick={() => {
                  if (state.mission.earthOutcome) setScreen("debrief");
                  else {
                    setScreen("play");
                    store.resume();
                  }
                }}
              >
                <span>CONTINUE · DAY {state.localDay}</span>
                <strong>{SCENARIOS[state.missionId].title}</strong>
                <small>{state.mission.earthOutcome ? "Confirmed outcome ready for review" : "Resume correspondence"}</small>
                <ChevronRight size={18} />
              </button>
            )}
          </div>
          <div className="mission-grid">
          {Object.values(SCENARIOS).map((s, i) => (
            <button
              className="mission-card"
              key={s.id}
              onClick={() => start(s.id)}
            >
              <span>0{i + 1}</span>
              <strong>{s.title}</strong>
              <small>{s.location}</small>
              <p>{s.subtitle}</p>
              <ChevronRight size={16} />
            </button>
          ))}
          </div>
        </section>
        <p className="title-foot">
          A static browser simulation · localStorage save · {LIGHT_DELAY_YEARS}{" "}
          years one way · {WINDOW_BITS} bits per transmission window
        </p>
      </main>
    );
  }
  if (screen === "onboard")
    return (
      <main className="onboard">
        <div className="onboard-copy">
          <p className="eyebrow">
            MISSION {Object.keys(SCENARIOS).indexOf(state.missionId) + 1} ·{" "}
            {scenario.location}
          </p>
          <h1>{scenario.title}</h1>
          <p className="briefing">{scenario.briefing}</p>
          <div className="delay-card">
            <Radio size={20} />
            <div>
              <strong>The distance is the game.</strong>
              <span>
                Every Earth instruction, including a mouse order, takes{" "}
                {LIGHT_DELAY_YEARS} years to arrive. Daneel’s reports take
                another {LIGHT_DELAY_YEARS} years. An{" "}
                {WINDOW_BITS.toLocaleString()}-bit window departs every local
                day; longer messages serialize across consecutive windows.
              </span>
            </div>
          </div>
          <section className="agency-card" aria-label="Why Daneel changes the game">
            <div>
              <small>EARTH TELECOMMAND</small>
              <strong>One literal action</strong>
              <p>“Move this rover to this tile.” It reaches a world that may no longer match your map.</p>
            </div>
            <div>
              <small>DANEEL / WEBMCP</small>
              <strong>One bounded policy</strong>
              <p>“Protect life support; preserve habitat.” Daneel applies it against the colony’s current state.</p>
            </div>
            <footer>SAME 2,800-BIT RADIO WINDOW · NO FASTER-THAN-LIGHT CHANNEL</footer>
          </section>
          <section className="handoff-card" aria-label="Daneel handoff steps">
            <div className="section-label">
              <span>THREE STEPS TO HAND OFF</span>
              <span>SESSION {state.sessionId.slice(0, 8)}</span>
            </div>
            <div className="handoff-steps">
              <div className="handoff-step">
                <span>01</span>
                <strong>Copy the Daneel brief</strong>
                <p>It is prepared for this mission and session.</p>
              </div>
              <div className="handoff-step">
                <span>02</span>
                <strong>Paste it into Daneel</strong>
                <p>Keep this game tab open so native tools can connect.</p>
              </div>
              <div className="handoff-step">
                <span>03</span>
                <strong>Open the command desk</strong>
                <p>Watch the colony act locally while Earth waits for reports.</p>
              </div>
            </div>
            <div className="handoff-actions">
              <button className="primary" onClick={copyPrompt}>
                <Copy size={16} /> {copied ? "Daneel brief copied" : "Copy Daneel brief"}
              </button>
              <details className="brief-inspection">
                <summary>Inspect full brief</summary>
                <pre>{prompt}</pre>
              </details>
              <span className="copy-confirmation" role="status" aria-live="polite">
                {copied ? "Ready to paste into Daneel." : "Copy once, then hand off."}
              </span>
            </div>
          </section>
          <div className="onboard-actions">
            <button className="start-command" onClick={goPlay}>
              Start command desk <ChevronRight size={17} />
            </button>
            <span className={native.supported ? "native-ok" : "native-muted"}>
              <span className="status-dot" />
              {native.supported
                ? `${native.registered.length} native tools registered`
                : "Native site tools unavailable until a supported host connects"}
            </span>
          </div>
        </div>
      </main>
    );
  if (screen === "debrief") {
    const copy =
      OUTCOME_COPY[state.mission.earthOutcome] ||
      OUTCOME_COPY["objective-secured"];
    const defBits =
      state.doctrine.protocols.find(
        (p) => p.reference === RESILIENCE_24.reference,
      )?.definitionBits || 0;
    const refBits = bitsForPayload({
      text: `adopt ${RESILIENCE_24.reference}`,
    });
    return (
      <main className="debrief">
        <p className="eyebrow">MISSION COMPLETE · CONFIRMED DOWNLINK</p>
        <h1>{scenario.title}</h1>
        <div className="outcome">
          <ShieldCheck size={36} />
          <div>
            <strong>{copy[0]}</strong>
            <span>{copy[1]}</span>
          </div>
        </div>
        <div className="debrief-grid">
          <div>
            <small>ELAPSED LOCAL TIME</small>
            <b>{state.localDay} days</b>
          </div>
          <div>
            <small>UPLINK PAYLOAD</small>
            <b>{state.channel.uplinkBits.toLocaleString()} bits</b>
          </div>
          <div>
            <small>DOWNLINK PAYLOAD</small>
            <b>{state.channel.downlinkBits.toLocaleString()} bits</b>
          </div>
          <div>
            <small>CONFIRMED THROUGH</small>
            <b>{dayLabel(projection.observedDay)}</b>
          </div>
          {state.missionId === "enough" && (
            <div>
              <small>PROTOCOL DEFINITION COST</small>
              <b>
                {defBits
                  ? `${defBits.toLocaleString()} bits`
                  : "not transmitted"}
              </b>
            </div>
          )}
          {state.missionId === "enough" && defBits > 0 && (
            <div>
              <small>COMPACT REFERENCE</small>
              <b>
                {refBits} bits · {Math.round(100 - (refBits / defBits) * 100)}%
                saved
              </b>
            </div>
          )}
          <div>
            <small>USEFUL GAIN</small>
            <b>{GAIN[state.mission.earthOutcome] ?? 0}/100</b>
          </div>
          <div>
            <small>INTENT GAIN · per kbit</small>
            <b>
              {(GAIN[state.mission.earthOutcome] ?? 0) /
                Math.max(1, state.channel.uplinkBits / 1000)}
            </b>
          </div>
        </div>
        <div className="debrief-timeline">
          <div className="section-label">RECEIVED TIMELINE</div>
          {state.events.slice(-14).map((e) => (
            <div className="timeline-row" key={e.id}>
              <span>DAY {e.day}</span>
              <strong>{e.type.replace(/_/g, " ")}</strong>
              {e.reason && <small>{e.reason}</small>}
            </div>
          ))}
        </div>
        <button className="primary" onClick={() => setScreen("title")}>
          Choose another mission <ChevronRight size={17} />
        </button>
      </main>
    );
  }
  return (
    <main className="game-shell">
      <header className="topbar">
        <div className="brand">
          <span>◉</span>
          <strong>THE INTENT HORIZON</strong>
        </div>
        <div className="mission-name">
          MISSION {Object.keys(SCENARIOS).indexOf(state.missionId) + 1} /{" "}
          {scenario.location.toUpperCase()}
        </div>
        <div className="dates">
          <span
            className="earth-date"
            title="Earth's current date. New orders leave from this side of the light delay."
          >
            <small>EARTH NOW</small>
            {dayLabel(state.localDay + LIGHT_DELAY_DAYS)}
          </span>
          <span
            className="observed-date"
            title="Newest colony state Earth has actually received. Values on this desk never show later local state."
          >
            <small>LAST OBSERVED</small>
            {dayLabel(projection.observedDay)}
          </span>
        </div>
      </header>
      <section className="metrics">
        <div>
          <small>FOOD RESERVE</small>
          <strong>
            {reserveLabel(projection.resources.food, projection.resources.population * 0.02)}
          </strong>
          <span className="metric-detail">{Math.round(projection.resources.food).toLocaleString()} stock · −{(projection.resources.population * .02).toFixed(2)}/day</span>
        </div>
        <div>
          <small>WATER ENDURANCE</small>
          <strong>
            {reserveLabel(projection.resources.water, projection.resources.population * 0.03)}
          </strong>
          <span className="metric-detail">{Math.round(projection.resources.water).toLocaleString()} stock · −{(projection.resources.population * .03).toFixed(2)}/day</span>
        </div>
        <div>
          <small>POWER RESERVE</small>
          <strong>
            {observedPowerPercent(projection.resources)}<i>%</i>
          </strong>
          <span className="metric-detail">{Math.round(projection.resources.power)} / {Math.round(projection.resources.powerCapacity)} units</span>
        </div>
        <div>
          <small>LIFE SUPPORT</small>
          <strong>
            {projection.resources.population}{" "}
            <i>/ {projection.resources.capacity}</i>
          </strong>
          <span className="metric-detail">{Math.max(0, projection.resources.capacity - projection.resources.population)} seats available</span>
        </div>
        <div className="objective">
          <small>{missionStatus.complete ? "MISSION CONFIRMED" : goal.title}</small>
          <strong>{missionStatus.complete ? missionStatus.label : goal.detail}</strong>
          {state.mission.deadlineDay && !missionStatus.complete && (
            <div className="meter">
              <i
                className="deadline"
                style={{
                  width: `${Math.min(100, (state.localDay / state.mission.deadlineDay) * 100)}%`,
                }}
              />
            </div>
          )}
        </div>
      </section>
      {openQuestions.length > 0 && (
        <section className="auth-banner">
          <MessageCircleQuestion size={16} />
          <div>
            <strong>Daneel is asking for authority.</strong>
            <span>{openQuestions[0].question}</span>
          </div>
          <div className="auth-eta">
            Question reached Earth today. An answer travels {LIGHT_DELAY_YEARS}{" "}
            years back — arrives day {openQuestions[0].answerDay} (
            {dayLabel(openQuestions[0].answerDay)}).
          </div>
          <div className="auth-actions">
            <button
              onClick={() =>
                store.respondAuth(openQuestions[0].packetId, "allow")
              }
            >
              Allow the request
            </button>
            <button
              onClick={() =>
                store.respondAuth(openQuestions[0].packetId, "deny")
              }
            >
              Deny · use safe default
            </button>
          </div>
        </section>
      )}
      <div className="play-body">
        <section className="map-panel">
          <ColonyScene
            state={state}
            onSelect={onSelectTile}
            viewMode={superpositionActive ? "local" : "earth"}
            readOnly={superpositionActive}
            previewBuild={selectedTile && !superpositionActive ? { x: selected.x, y: selected.y, type: buildType, valid: placement.valid } : null}
          />
          {superpositionActive ? (
            <div className="map-status" role="status" style={{ top: 54 }}>
              <span className="status-dot amber" /> SUPERPOSITION · LIVE LOCAL VIEW · {superpositionSeconds}s · READ ONLY
            </div>
          ) : (
            <button className="map-status" style={{ top: 54 }} onClick={activateSuperposition} disabled={superposition.passes < 1 || superpositionCooldown > 0} title="Spend one of two persistent parity passes for a 30-second local visual diagnostic.">
              SUPERPOSITION · {superposition.passes} PASS{superposition.passes === 1 ? "" : "ES"}{superpositionCooldown ? ` · ${superpositionCooldown}s` : " · 30s LOCAL VIEW"}
            </button>
          )}
          {tutorial.length > 0 && (
            <div className="tutorial-card">
              <div className="section-label">
                GETTING STARTED{" "}
                <button
                  onClick={() => setTutorialDismissed(true)}
                  aria-label="Dismiss tutorial"
                >
                  ✕
                </button>
              </div>
              {tutorial.map((s, i) => (
                <div key={i} className={s.done ? "tut done" : "tut"}>
                  <span>{s.done ? "✓" : i + 1}</span>
                  <strong>{s.label}</strong>
                </div>
              ))}
            </div>
          )}
          <div className="map-hint">
            <span>LEFT CLICK SELECT</span>
            <span>Q / E ROTATE</span>
            <span>SCROLL ZOOM</span>
            {roadMode && (
              <span className="road-hint">ROAD: CLICK START … CLICK END</span>
            )}
            {moveRobotId && (
              <span className="road-hint">ROVER MOVE: CLICK A RECEIVED TILE</span>
            )}
            {state.packets.length === 0 && !roadMode && (
              <span className="road-hint">
                SELECT A TILE · QUEUE A BUILD → ARRIVES IN {LIGHT_DELAY_YEARS}Y
              </span>
            )}
          </div>
          <div className="map-status">
            <span className="status-dot amber" />
            {state.connection.status === "connected"
              ? "DANEEL CONNECTED"
              : "WAITING FOR DANEEL"}{" "}
            · {state.paused ? "PAUSED" : state.demoPace ? "LOCAL SIMULATION RUNNING" : "LOCAL CLOCK READY"} ·{" "}
            {state.earthCoast ? "COAST ON" : "COAST OFF"}
          </div>
        </section>
        <aside className="correspondence">
          <div className="aside-head">
            <div>
              <p className="eyebrow">COLONY RELAY · RECEIVED ONLY</p>
              <h2>Daneel / Correspondence</h2>
            </div>
            <span
              className={
                state.connection.status === "connected"
                  ? "connected"
                  : "disconnected"
              }
            >
              <span className="status-dot" />
              {state.connection.status === "connected"
                ? "CONNECTED"
                : "OFFLINE"}
            </span>
          </div>
          <nav className="relay-tabs" aria-label="Colony relay panels">
            <button className={relayTab === "relay" ? "active" : ""} onClick={() => setRelayTab("relay")}>RELAY</button>
            <button className={relayTab === "briefing" ? "active" : ""} onClick={() => setRelayTab("briefing")}>BRIEFING</button>
          </nav>
          {relayTab === "briefing" && <>
          <section className="mission-charter" aria-label="Earth mission charter">
            <div className="section-label">EARTH CHARTER · DAY ZERO</div>
            <p>{scenario.objective}</p>
            <small>
              This mandate is known on Earth and at the colony. Everything else
              on this desk is limited to received observation.
            </small>
          </section>
          <section className="demo-guide" aria-label="One-minute demo guide">
            <div className="section-label">ONE-MINUTE DEMO · {demoGuide.phase}</div>
            <strong>{demoGuide.title}</strong>
            <p>{demoGuide.detail}</p>
            {demoGuide.action !== "wait" && demoGuide.action !== "answer" && (
              <button onClick={takeGuideAction}>
                {demoGuide.action === "daneel" ? "OPEN DANEEL PROMPT" : demoGuide.action === "pace" ? "START AT 1×" : demoGuide.action === "intent" ? "WRITE INTENT" : "OPEN DEBRIEF"}
              </button>
            )}
            {demoGuide.action === "answer" && <small>Use the authority controls at the top of this desk.</small>}
          </section>
          </>}
          {relayTab === "relay" && <>
          <div className="letters">
            <div className="section-label">
              RECEIVED TELEMETRY <span>{relayHero ? `LATEST: ${relayHero.kind.replaceAll("-", " ").toUpperCase()}` : projection.observationLabel}</span>
            </div>
            {relayHero ? (
              [relayHero, ...projection.reports.filter((report) => report.id !== relayHero.id).slice(-2).reverse()].map((r, index) => (
                <article className="letter" key={r.id}>
                  <div className="report-kind">{index === 0 ? "NEWEST RECEIVED · " : ""}{r.kind === "mission-result" ? "MISSION RESULT" : r.kind === "telemetry" ? "AUTONOMY TELEMETRY" : "DANEEL REPORT"}</div>
                  <p>{reportSummary(r)}</p>
                  <small>
                    CAPTURED ON COLONY · DAY {reportTiming(r).captured} · RECEIVED ON EARTH · DAY {reportTiming(r).received}
                  </small>
                  {reportTiming(r).transit && <small className="report-transit">{reportTiming(r).transit}</small>}
                </article>
              ))
            ) : (
              <article className="letter empty">
                <p>
                  No downlink has arrived. The last world you can honestly see
                  is dated day {projection.observedDay}.
                </p>
              </article>
            )}
            <div className="section-label outgoing-label">PACKET TIMELINE</div>
            {projection.packets
              .slice(-5)
              .reverse()
              .map((p) => (
                <div className={`packet ${p.status}`} key={p.id}>
                  <span className="packet-line" />
                  <div>
                    <strong>
                      {p.direction === "uplink"
                        ? "EARTH → COLONY"
                        : "COLONY → EARTH"}
                    </strong>
                    <small>
                      {p.kind} · {p.bits} bits
                      {p.windows > 1 ? ` · ${p.windows} windows` : ""} ·{" "}
                      {formatPacket(p, state.localDay)}
                    </small>
                  </div>
                </div>
              ))}
            {nextOutbound && (
              <div className="next-arrival" role="status">
                <Radio size={13} />
                <div>
                  <strong>NEXT UPLINK ARRIVAL</strong>
                  <span>
                    {nextOutbound.kind.toUpperCase()} · DAY {nextOutbound.arrivalDay} · {Math.max(0, nextOutbound.arrivalDay - state.localDay)} LOCAL DAYS OUT
                  </span>
                </div>
              </div>
            )}
          </div>
          <div className="composer">
            <div className="section-label">
              WRITE AN INTENT{" "}
              <span>
                {cost.bits} / {WINDOW_BITS} bits · {cost.windows} window
                {cost.windows > 1 ? "s" : ""}
              </span>
            </div>
            <div
              className="signal-route"
              aria-label={`Uplink route from Earth to Daneel: ${LIGHT_DELAY_YEARS} years one way`}
            >
              <span>EARTH</span>
              <i />
              <span>DANEEL</span>
              <b>{LIGHT_DELAY_YEARS}Y ONE WAY</b>
            </div>
            {state.missionId === "enough" &&
              state.doctrine.protocols.filter((p) => p.definitionRef).length ===
                0 && (
                <button className="protocol-compose" onClick={sendProtocol}>
                  TRANSMIT SHARED PROTOCOL · {RESILIENCE_24.reference} · ~
                  {(bitsForPayload({ ...RESILIENCE_24 }) / 8).toFixed(0)} bytes
                  → arrives {LIGHT_DELAY_YEARS}Y
                </button>
              )}
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && draft.trim()) {
                  e.preventDefault();
                  transmit();
                }
              }}
              placeholder="Tell Daneel what must remain true…"
              aria-label="Write an intent for Daneel"
            />
            <div className="arrival">
              SERIALIZES ACROSS {cost.windows} DAY{cost.windows > 1 ? "S" : ""}{" "}
              · ARRIVES DAY{" "}
              {state.localDay + LIGHT_DELAY_DAYS + cost.windows - 1}{" "}
              <span>({LIGHT_DELAY_YEARS} years + queue)</span>
            </div>
            <button
              className="transmit"
              disabled={!draft.trim()}
              onClick={transmit}
              title="Transmit intent to Daneel (Control or Command + Enter)"
            >
              <Send size={15} /> TRANSMIT INTENT <kbd>CTRL/⌘↵</kbd>
            </button>
          </div>
          </>}
        </aside>
        <section className="bottom-deck">
        <div className="selection">
          <div className="section-label">
            SELECTED {selected ? selected.kind.toUpperCase() : "OBJECT"}
          </div>
          {selected ? (
            <div className="selected-line">
              {selected.kind === "robot" ? (
                <div className="selection-glyph">▣</div>
              ) : selected.kind === "building" ? (
                <div className="selection-glyph">⌂</div>
              ) : (
                <div className="selection-glyph">＋</div>
              )}
              <div>
                <strong>{selected.id}</strong>
                <small>
                  {selected.kind === "tile"
                    ? `Received map tile ${selected.x}, ${selected.y} · ready for an Earth order`
                    : selected.kind === "robot"
                      ? superpositionActive && selectedRobotJob
                        ? `${selectedRobot.type} · ${(selectedRobot.lifecycle || selectedRobot.status).toUpperCase()} · ${selectedRobotJob.type} · ${Math.max(0, selectedRobotJob.completeDay - state.localDay)}d remaining`
                        : superpositionActive
                          ? `${selectedRobot?.type || "rover"} · IDLE · available for local work`
                          : "Received rover position · a literal move command still crosses the light-delay"
                      : "Selectable from reconstructed telemetry"}
                </small>
                {selectedImpact && (
                  <div className="facility-readout" aria-label={`Resource impact of ${selectedBuilding.type}`}>
                    <b>{BUILDINGS[selectedBuilding.type]?.label || selectedBuilding.type}</b>
                    <span>{selectedImpact.production}</span>
                    <span>{selectedImpact.network}</span>
                    <span className={selectedFacilityStatus.includes("ISOLATED") ? "facility-warning" : "facility-live"}>{selectedFacilityStatus}</span>
                  </div>
                )}
                {selected.kind === "robot" && (
                  <button
                    className={moveRobotId === selected.id ? "command-active" : ""}
                    onClick={() => {
                      setRoadMode(false);
                      setRoadStart(null);
                      setMoveRobotId(moveRobotId === selected.id ? null : selected.id);
                      setToast(moveRobotId === selected.id ? "ROVER MOVE CANCELLED." : `MOVE ORDER ARMED · choose a received destination for ${selected.id}.`);
                    }}
                  >
                    <MapPin size={13} /> {moveRobotId === selected.id ? "CANCEL MOVE" : "MOVE ROVER · 4.37Y"}
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="mission-next" aria-label="Recommended next action">
              <div className="section-label">{observedConstraint ? "RECEIVED CONSTRAINT · NEXT ACTION" : "NEXT EARTH ACTION"}</div>
              <strong>{observedConstraint ? observedConstraint.symptom : demoGuide.title}</strong>
              <p>{observedConstraint ? `${observedConstraint.cause} Remedy: ${observedConstraint.remedy}` : demoGuide.detail}</p>
              {(!observedConstraint && demoGuide.action !== "wait" && demoGuide.action !== "answer" && demoGuide.action !== "debrief") && (
                <button onClick={takeGuideAction}>
                  {demoGuide.action === "daneel" ? "OPEN DANEEL BRIEF" : demoGuide.action === "pace" ? "START 1× CLOCK" : "WRITE AN INTENT"}
                </button>
              )}
              <small>{observedConstraint ? `OBSERVED ${projection.observationLabel.toUpperCase()} · ${observedConstraint.severity.toUpperCase()}` : "Select a received tile whenever you want to send a literal Earth construction order."}</small>
            </div>
          )}
        </div>
        <div className="build-tools">
          <div className="section-label">
            EARTH ORDER · {selectedTile ? "TARGET LOCKED" : "TARGET REQUIRED"}
          </div>
          <select
            value={buildType}
            onChange={(e) => setBuildType(e.target.value)}
          >
            {Object.entries(BUILDINGS).map(([key, value]) => (
              <option key={key} value={key}>
                {value.label} · {value.cost} mat · {value.days}d
              </option>
            ))}
          </select>
          <div className="project-impact" aria-live="polite">
            <div className="impact-head"><span>PROJECTED AFTER COMPLETION</span><b>−{BUILDINGS[buildType].cost} MAT · {BUILDINGS[buildType].days}D LOCAL BUILD</b></div>
            <strong>{projectImpact.production}</strong>
            <span>{projectImpact.completion}</span>
            <small>{projectImpact.network}</small>
            <em className={placement.valid ? "site-valid" : "site-blocked"}>{placement.reason}</em>
          </div>
          <button
            className="queue-build"
            disabled={!selectedTile || !placement.valid}
            onClick={sendBuild}
            title={
              selectedTile && placement.valid
                ? `Queue construction at tile ${selected.x}, ${selected.y}`
                : placement.reason
            }
          >
            <Hammer size={15} /> QUEUE BUILD AT{" "}
            {selectedTile
              ? `${selected.x},${selected.y}`
              : "SELECTED TILE"}
          </button>
          <button
            className={roadMode ? "road-active" : ""}
            onClick={() => {
              setRoadMode(!roadMode);
              setRoadStart(null);
              if (roadMode) setRoadStart(null);
            }}
          >
            <Hammer size={15} />{" "}
            {roadMode ? "CANCEL ROAD MODE" : "QUEUE ROAD CORRIDOR"}
          </button>
          {state.missionId === "rightToDecide" &&
            !state.doctrine.authority.exports && (
              <>
                <button onClick={authorizeExport}>
                  AUTHORIZE EXPORT · {LIGHT_DELAY_YEARS}Y
                </button>
              </>
            )}
          <button onClick={() => setShowDoctrine(true)}>
            <ShieldCheck size={15} /> DOCTRINE
          </button>
          <button onClick={() => setShowDaneelPrompt(true)}>
            <Eye size={15} /> DANEEL PROMPT
          </button>
        </div>
        <div className="time-controls">
          <div className="section-label time-label">
            <span>SIMULATION CONTROLS</span>
            <span>{state.paused ? "PAUSED" : state.demoPace ? `${timeScale}× AUTO` : "READY"}</span>
          </div>
          <button
            className={state.paused ? "road-active" : ""}
            onClick={() => (state.paused ? store.resume() : store.pause())}
            title={state.paused ? "Resume simulation" : "Pause simulation"}
            aria-label={state.paused ? "Resume simulation" : "Pause simulation"}
          >
            {state.paused ? <Play size={15} /> : <Pause size={15} />}
            {state.paused ? "RESUME" : "PAUSE"}
          </button>
          <button onClick={() => store.advance(1)}>+1 DAY</button>
          <button onClick={() => store.advance(30)}>+30 DAYS</button>
          <div className="speed-controls" role="group" aria-label="Simulation speed">
            {[1, 2, 5, 10].map((speed) => (
              <button
                key={speed}
                className={state.demoPace && !state.paused && timeScale === speed ? "road-active" : ""}
                onClick={() => store.setTimeScale(speed)}
                title={`Run the adaptive simulation at ${speed}× UI speed`}
                aria-pressed={state.demoPace && !state.paused && timeScale === speed}
              >
                {speed}×
              </button>
            ))}
          </div>
          <button onClick={() => store.nextEvent()}>
            <FastForward size={15} /> {nextEventButton}
          </button>
          <button
            onClick={() => store.nextEarthEvent()}
            title="Advance to the next Earth-visible arrival"
          >
            <Radio size={15} /> {earthEventButton} <kbd>N</kbd>
          </button>
          <button
            className={state.earthCoast ? "road-active" : ""}
            onClick={() => store.toggleCoast()}
            title="Stop time at the next Earth-visible arrival"
          >
            COAST
          </button>
          <button
            onClick={() => {
              store.pause();
              setScreen(state.mission.earthOutcome ? "debrief" : "onboard");
            }}
          >
            <RotateCcw size={15} />
          </button>
        </div>
        </section>
      </div>
      <footer className="footer-strip">
        <span>
          <Eye size={14} /> EARTH PROJECTION · OBSERVATION DAY{" "}
          {projection.observedDay}
        </span>
        <span>
          <AlertTriangle size={14} />{" "}
          {state.saveError
            ? "SAVE FAILED · PLAY PAUSED"
            : "LOCAL STORAGE COMMITTED"}
        </span>
        <span>
          <MapPin size={14} /> UPLINK{" "}
          {state.channel.uplinkBits.toLocaleString()} · DOWNLINK{" "}
          {state.channel.downlinkBits.toLocaleString()} bits
        </span>
      </footer>
      {toast && (
        <div className="arrival-toast" role="status">
          <span className="status-dot teal" />
          <span>{toast}</span>
          <button type="button" onClick={() => setToast(null)} aria-label="Dismiss notification">×</button>
        </div>
      )}
      {showDoctrine && (
        <div className="modal-overlay" onClick={() => setShowDoctrine(false)}>
          <div
            className="doctrine-modal"
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-head">
              <h2>Doctrine sheet</h2>
              <button onClick={() => setShowDoctrine(false)} aria-label="Close">
                ✕
              </button>
            </div>
            <p className="muted">
              Versions 1 · authority applies only after the human channel
              delivers it.
            </p>
            <div className="section-label">AUTHORITY DOMAINS · CURRENT</div>
            <div className="doctrine-table">
              {Object.entries(state.doctrine.authority).map(([k, v]) => (
                <div className="doctrine-row" key={k}>
                  <span>{k.replace(/([A-Z])/g, " $1").toLowerCase()}</span>
                  <strong className={v ? "allowed" : "denied"}>
                    {v ? "ALLOWED" : "DENIED"}
                  </strong>
                  <small>
                    {k === "habitatLoss"
                      ? "irreversible · explicit human authority only"
                      : k === "exports"
                        ? "standing export authority"
                        : "autonomous under safe default"}
                  </small>
                </div>
              ))}
            </div>
            <div className="section-label">IN TRANSIT CHANGES</div>
            {(() => {
              const inflight = projection.packets.filter((p) =>
                [
                  "doctrine-change",
                  "protocol-definition",
                  "authorization-response",
                ].includes(p.kind),
              );
              return inflight.length ? (
                inflight.slice(-3).map((p) => (
                  <div className="doctrine-row" key={p.id}>
                    <span>{p.kind}</span>
                    <strong>ARRIVES DAY {p.arrivalDay}</strong>
                    <small>{p.bits} bits</small>
                  </div>
                ))
              ) : (
                <p className="muted">No doctrine change is in transit.</p>
              );
            })()}
            <div className="section-label">DELIVERED PROTOCOLS</div>
            {state.doctrine.protocols
              .filter((p) => p.delivered)
              .map((p) => (
                <div className="doctrine-row" key={p.reference || p.name}>
                  <span>{p.reference || p.name}</span>
                  <strong className="allowed">DELIVERED</strong>
                  <small>
                    {p.definitionBits ? `${p.definitionBits} bits` : ""}
                  </small>
                </div>
              ))}
            {!state.doctrine.protocols.some((p) => p.delivered) && (
              <p className="muted">
                No shared protocol definitions have been delivered yet.
              </p>
            )}
          </div>
        </div>
      )}
      {showDaneelPrompt && (
        <div className="modal-overlay" onClick={() => setShowDaneelPrompt(false)}>
          <div
            className="doctrine-modal daneel-prompt-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Daneel startup prompt"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-head">
              <h2>Daneel startup brief</h2>
              <button onClick={() => setShowDaneelPrompt(false)} aria-label="Close">
                ✕
              </button>
            </div>
            <p className="muted">Paste this into a ChatGPT Desktop task with this game tab open.</p>
            <div className="prompt-card">
              <div className="card-heading">
                <span>SESSION-SPECIFIC WEBMCP BRIEF</span>
                <button onClick={copyPrompt}>
                  <Copy size={14} /> {copied ? "Copied" : "Copy prompt"}
                </button>
              </div>
              <pre>{prompt}</pre>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
