// demo.ts — Wire size comparison and round-trip test
// Run: npx tsx src/demo.ts

import { buffort, decode, format, AlertLevel, NodeState } from "../src/codec";

console.log("╔══════════════════════════════════════════════════════╗");
console.log("║  Buffort — Wire Size Comparison (proto vs JSON)     ║");
console.log("║  Max Meshtastic packet: 237 bytes                   ║");
console.log("╚══════════════════════════════════════════════════════╝");
console.log();

function compare(label: string, protoBytes: Uint8Array, jsonEquivalent: object) {
  const jsonSize = new TextEncoder().encode(JSON.stringify(jsonEquivalent)).length;
  const savings = ((1 - protoBytes.length / jsonSize) * 100).toFixed(0);
  const bar =
    "█".repeat(Math.round(protoBytes.length / 5)) +
    "░".repeat(Math.round((jsonSize - protoBytes.length) / 5));

  console.log(`─── ${label} ───`);
  console.log(`  Proto: ${String(protoBytes.length).padStart(3)} bytes  ${bar}`);
  console.log(`  JSON:  ${String(jsonSize).padStart(3)} bytes  (${savings}% smaller with proto)`);
  console.log(`  ${format(decode(protoBytes))}`);
  console.log();
}

compare(
  "Text message",
  buffort.text("heading to the south clearing"),
  { type: "text", seq: 1, ts: 1716494400, body: "heading to the south clearing" }
);

compare(
  "Sensor (barn)",
  buffort.sensor("barn", { tempF: 7250, humidity: 4520, pressure: 10132, batteryMv: 3700, solarMv: 5100 }),
  { type: "sensor", seq: 2, ts: 1716494400, station: "barn", temp_f: 72.5, humidity: 45.2, pressure: 1013.2, battery_mv: 3700, solar_mv: 5100 }
);

compare(
  "Command",
  buffort.command("gate-north", "open"),
  { type: "command", seq: 3, ts: 1716494400, target: "gate-north", action: "open" }
);

compare(
  "Command ack",
  buffort.commandAck(3, true),
  { type: "command_ack", seq: 4, ts: 1716494400, cmd_seq: 3, success: true }
);

compare(
  "Status heartbeat",
  buffort.status("shed-pi", NodeState.NODE_OK, { uptimeS: 86400, freeHeap: 134000, version: "1.2.0" }),
  { type: "status", seq: 5, ts: 1716494400, node: "shed-pi", state: "ok", uptime: 86400, heap: 134000, version: "1.2.0" }
);

compare(
  "MQTT forward",
  buffort.mqtt("property/barn/temp", JSON.stringify({ temp: 72.5 }), { retain: true }),
  { type: "mqtt", seq: 6, ts: 1716494400, topic: "property/barn/temp", payload: { temp: 72.5 }, retain: true, qos: 0 }
);

compare(
  "Location",
  buffort.location(44.5, -70.5, { altitudeM: 250, accuracyM: 10, note: "by the creek" }),
  { type: "location", seq: 7, ts: 1716494400, lat: 44.5, lon: -70.5, alt: 250, acc: 10, note: "by the creek" }
);

compare(
  "Critical alert",
  buffort.alert(AlertLevel.ALERT_CRITICAL, "smoke-barn", "Smoke detected in east bay"),
  { type: "alert", seq: 8, ts: 1716494400, level: "critical", source: "smoke-barn", message: "Smoke detected in east bay" }
);

// Max text capacity
let maxLen = 200;
while (true) {
  try { buffort.text("x".repeat(maxLen)); maxLen++; } catch { maxLen--; break; }
}
console.log(`─── Max text capacity ───`);
console.log(`  ${maxLen} characters fit in a single 237-byte packet`);
console.log(`  ${237 - maxLen} bytes protocol overhead`);
