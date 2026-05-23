# Buffort

Protobuf-based wire protocol for property mesh communication over LoRa/Meshtastic.

Buffort (a portmanteau of **buf**fer + **fort**) is a compact binary protocol designed for the 237-byte packet ceiling of Meshtastic LoRa radios. It wraps text messages, sensor readings, commands, MQTT forwarding, location sharing, alerts, and status heartbeats in a single protobuf envelope with just 14 bytes of overhead.

## Why not JSON?

LoRa packets are tiny. JSON wastes most of that budget on syntax characters and repeated field names. Buffort uses Protocol Buffers to get 50–80% smaller payloads with zero ambiguity:

| Message type | Proto | JSON | Savings |
|---|---|---|---|
| Text (28 chars) | 41B | 78B | 47% |
| Sensor (5 fields) | 32B | 140B | 77% |
| Command | 28B | 80B | 65% |
| Command ack | 14B | 73B | 81% |
| Status heartbeat | 36B | 118B | 69% |
| MQTT forward | 47B | 114B | 59% |
| Location + note | 42B | 107B | 61% |
| Critical alert | 53B | 120B | 56% |

Unset fields cost zero bytes on the wire — a sensor node that only reports temperature and battery sends ~18 bytes total.

## Install

```bash
npm install buffort
```

Or clone and build from source:

```bash
git clone https://github.com/therebelrobot/buffort.git
cd buffort
npm install
npm run build
```

## Quick start

```typescript
import { buffort, decode, format } from "buffort";

// Encode a text message (returns Uint8Array ready for sendPacket)
const bytes = buffort.text("heading back, 20 min out");

// Decode on the other end
const envelope = decode(bytes);
console.log(format(envelope));
// [#1 2026-05-23T21:25:24.000Z] 💬 "heading back, 20 min out"

console.log(bytes.length);
// 36 bytes
```

## Message types

### Text

Person-to-person or broadcast messages. 223 characters fit in a single packet.

```typescript
buffort.text("at the south clearing");
buffort.text("got it", 42); // reply to seq #42
```

### Sensor readings

Station data with implicit decimal encoding (multiply by 100 for temp/humidity, by 10 for pressure/wind). Unset fields are free.

```typescript
buffort.sensor("barn", {
  tempF: 7250,       // 72.50°F
  humidity: 4520,     // 45.20%
  batteryMv: 3700,
  solarMv: 5100,
  soilMoisture: 450,  // 45.0%
  windSpeed: 123,     // 12.3 mph
  windDir: 270,       // degrees
});
```

### Commands & acks

Remote actions for gates, pumps, relays, etc.

```typescript
buffort.command("gate-north", "open");
buffort.command("thermostat", "set", "68");

buffort.commandAck(cmdSeq, true);
buffort.commandAck(cmdSeq, false, "motor jammed");
```

### Status heartbeats

Node health from Pis and microcontrollers on the property.

```typescript
import { NodeState } from "buffort";

buffort.status("shed-pi", NodeState.NODE_OK, {
  uptimeS: 86400,
  freeHeap: 134000,
  version: "1.2.0",
});
```

### MQTT forwarding

Send from off-grid nodes — a gateway node with wifi picks it up and publishes to the broker.

```typescript
buffort.mqtt("property/barn/temp", JSON.stringify({ temp: 72.5 }), {
  retain: true,
  qos: 1,
});

// Binary payloads work too
buffort.mqtt("property/raw", new Uint8Array([0x01, 0x02, 0x03]));
```

### Location sharing

Lightweight "where are you" with optional notes. Uses the same lat/lon encoding as Meshtastic internally.

```typescript
buffort.location(44.5, -70.5, {
  altitudeM: 250,
  accuracyM: 10,
  note: "good mushroom spot",
});
```

### Alerts

High-priority notifications.

```typescript
import { AlertLevel } from "buffort";

buffort.alert(AlertLevel.ALERT_CRITICAL, "smoke-barn", "Smoke detected in east bay");
buffort.alert(AlertLevel.ALERT_WARNING, "battery-gate", "Below 3.0V");
```

## Meshtastic integration

Buffort packets ride on a custom `portNum` (256) to stay separate from standard Meshtastic text and telemetry:

```typescript
import { MeshDevice } from "@meshtastic/core";
import { buffort, decode, format } from "buffort";

const BUFFORT_PORT = 256;

// Send
await device.sendPacket(
  buffort.text("heading back"),
  BUFFORT_PORT,
  "broadcast"
);

// Receive
device.events.onMeshPacket.subscribe((meshPacket) => {
  if (meshPacket.decoded?.portnum !== BUFFORT_PORT) return;
  const envelope = decode(meshPacket.decoded.payload);
  console.log(format(envelope));
});
```

See [`examples/meshtastic-integration.ts`](examples/meshtastic-integration.ts) for a full working example, and [`examples/mqtt-gateway.ts`](examples/mqtt-gateway.ts) for a gateway node that bridges mesh packets to an MQTT broker.

## Development

```bash
# Regenerate TypeScript from proto changes
npm run proto:generate

# Run tests
npm test

# Run the wire-size demo
npm run dev

# Type check
npm run typecheck

# Build for publishing
npm run build
```

### Modifying the protocol

Edit `proto/buffort.proto`, then run `npm run proto:generate` to regenerate `src/gen/buffort_pb.ts`. The generated file is checked into git so consumers don't need the buf toolchain.

Adding fields to existing messages is backward-compatible — old decoders ignore unknown fields, new decoders default missing fields to zero/empty.

## Project structure

```
buffort/
├── proto/
│   └── buffort.proto          # Protocol definition (source of truth)
├── src/
│   ├── gen/
│   │   └── buffort_pb.ts      # Generated protobuf code (committed)
│   ├── codec.ts               # Encode/decode helpers and builders
│   ├── index.ts               # Public API barrel export
│   └── index.test.ts          # Test suite
├── examples/
│   ├── demo.ts                # Wire size comparison
│   ├── meshtastic-integration.ts
│   └── mqtt-gateway.ts
├── buf.yaml                   # Buf module config
├── buf.gen.yaml               # Buf codegen config
├── tsconfig.json
├── vitest.config.ts
└── package.json
```

## License

MIT
