// buffort.ts — Encode/decode helpers for the Buffort mesh protocol
//
// Usage:
//   import { buffort, encode, decode, format } from "./buffort";
//
//   const bytes = buffort.text("heading to the south clearing");
//   const envelope = decode(bytes);
//   console.log(format(envelope));

import { create, toBinary, fromBinary } from "@bufbuild/protobuf";
import {
  EnvelopeSchema,
  TextMessageSchema,
  SensorReadingSchema,
  CommandSchema,
  CommandAckSchema,
  StatusUpdateSchema,
  MqttForwardSchema,
  LocationShareSchema,
  AlertSchema,
  AlertLevel,
  NodeState,
} from "./gen/buffort_pb";
import type {
  Envelope,
  TextMessage,
  SensorReading,
  Command,
  CommandAck,
  StatusUpdate,
  MqttForward,
  LocationShare,
  Alert,
} from "./gen/buffort_pb";

export { AlertLevel, NodeState };
export type {
  Envelope,
  TextMessage,
  SensorReading,
  Command,
  CommandAck,
  StatusUpdate,
  MqttForward,
  LocationShare,
  Alert,
};

// ─── Sequence counter ────────────────────────────────────────
let _seq = 0;
export function nextSeq(): number {
  return ++_seq;
}

// ─── Core encode / decode ────────────────────────────────────
const MAX_PACKET = 237;

export function encode(envelope: Envelope): Uint8Array {
  const bytes = toBinary(EnvelopeSchema, envelope);
  if (bytes.length > MAX_PACKET) {
    throw new Error(
      `Packet too large: ${bytes.length} bytes (max ${MAX_PACKET}). Shorten your payload.`
    );
  }
  return bytes;
}

export function decode(bytes: Uint8Array): Envelope {
  return fromBinary(EnvelopeSchema, bytes);
}

export function sizeOf(envelope: Envelope): number {
  return toBinary(EnvelopeSchema, envelope).length;
}

// ─── Envelope factory ────────────────────────────────────────
function makeEnvelope(payload: Envelope["payload"]): Envelope {
  return create(EnvelopeSchema, {
    seq: nextSeq(),
    timestamp: Math.floor(Date.now() / 1000),
    payload,
  });
}

// ─── Builders ────────────────────────────────────────────────
export const buffort = {
  text(body: string, replyToSeq?: number): Uint8Array {
    return encode(
      makeEnvelope({
        case: "text",
        value: create(TextMessageSchema, {
          body,
          replyToSeq: replyToSeq ?? 0,
        }),
      })
    );
  },

  sensor(
    stationId: string,
    readings: Partial<Omit<SensorReading, "$typeName" | "stationId">>
  ): Uint8Array {
    return encode(
      makeEnvelope({
        case: "sensor",
        value: create(SensorReadingSchema, { stationId, ...readings }),
      })
    );
  },

  command(target: string, action: string, value?: string): Uint8Array {
    return encode(
      makeEnvelope({
        case: "command",
        value: create(CommandSchema, {
          target,
          action,
          value: value ?? "",
        }),
      })
    );
  },

  commandAck(cmdSeq: number, success: boolean, error?: string): Uint8Array {
    return encode(
      makeEnvelope({
        case: "commandAck",
        value: create(CommandAckSchema, {
          cmdSeq,
          success,
          error: error ?? "",
        }),
      })
    );
  },

  status(
    nodeId: string,
    state: NodeState,
    opts?: { uptimeS?: number; freeHeap?: number; version?: string }
  ): Uint8Array {
    return encode(
      makeEnvelope({
        case: "status",
        value: create(StatusUpdateSchema, {
          nodeId,
          state,
          uptimeS: opts?.uptimeS ?? 0,
          freeHeap: opts?.freeHeap ?? 0,
          version: opts?.version ?? "",
        }),
      })
    );
  },

  mqtt(
    topic: string,
    payload: Uint8Array | string,
    opts?: { retain?: boolean; qos?: number }
  ): Uint8Array {
    const payloadBytes =
      typeof payload === "string"
        ? new TextEncoder().encode(payload)
        : payload;
    return encode(
      makeEnvelope({
        case: "mqtt",
        value: create(MqttForwardSchema, {
          topic,
          payload: payloadBytes,
          retain: opts?.retain ?? false,
          qos: opts?.qos ?? 0,
        }),
      })
    );
  },

  location(
    lat: number,
    lon: number,
    opts?: { altitudeM?: number; accuracyM?: number; note?: string }
  ): Uint8Array {
    return encode(
      makeEnvelope({
        case: "location",
        value: create(LocationShareSchema, {
          latitudeI: Math.round(lat * 1e7),
          longitudeI: Math.round(lon * 1e7),
          altitudeM: opts?.altitudeM ?? 0,
          accuracyM: opts?.accuracyM ?? 0,
          note: opts?.note ?? "",
        }),
      })
    );
  },

  alert(level: AlertLevel, source: string, message: string): Uint8Array {
    return encode(
      makeEnvelope({
        case: "alert",
        value: create(AlertSchema, { level, source, message }),
      })
    );
  },
};

// ─── Pretty printer ──────────────────────────────────────────
export function format(env: Envelope): string {
  const ts = new Date(env.timestamp * 1000).toISOString();
  const p = env.payload;

  switch (p.case) {
    case "text":
      return `[#${env.seq} ${ts}] 💬 "${p.value.body}"${p.value.replyToSeq ? ` (reply to #${p.value.replyToSeq})` : ""}`;

    case "sensor": {
      const s = p.value;
      const parts: string[] = [`station=${s.stationId}`];
      if (s.tempF) parts.push(`temp=${(s.tempF / 100).toFixed(1)}°F`);
      if (s.humidity) parts.push(`humidity=${(s.humidity / 100).toFixed(1)}%`);
      if (s.pressure) parts.push(`pressure=${(s.pressure / 10).toFixed(1)}hPa`);
      if (s.batteryMv) parts.push(`battery=${s.batteryMv}mV`);
      if (s.solarMv) parts.push(`solar=${s.solarMv}mV`);
      if (s.soilMoisture)
        parts.push(`soil=${(s.soilMoisture / 10).toFixed(1)}%`);
      if (s.waterLevel) parts.push(`water=${s.waterLevel}mm`);
      if (s.windSpeed)
        parts.push(`wind=${(s.windSpeed / 10).toFixed(1)}mph@${s.windDir}°`);
      return `[#${env.seq} ${ts}] 📊 ${parts.join(" ")}`;
    }

    case "command":
      return `[#${env.seq} ${ts}] 🎛️ ${p.value.target}.${p.value.action}${p.value.value ? `(${p.value.value})` : ""}`;

    case "commandAck":
      return `[#${env.seq} ${ts}] ${p.value.success ? "✅" : "❌"} ack for #${p.value.cmdSeq}${p.value.error ? `: ${p.value.error}` : ""}`;

    case "status":
      return `[#${env.seq} ${ts}] 🖥️ ${p.value.nodeId}: ${NodeState[p.value.state]} uptime=${p.value.uptimeS}s${p.value.version ? ` v${p.value.version}` : ""}`;

    case "mqtt":
      return `[#${env.seq} ${ts}] 📡 MQTT → ${p.value.topic} (${p.value.payload.length}B qos=${p.value.qos}${p.value.retain ? " retain" : ""})`;

    case "location": {
      const l = p.value;
      return `[#${env.seq} ${ts}] 📍 ${(l.latitudeI / 1e7).toFixed(6)}, ${(l.longitudeI / 1e7).toFixed(6)}${l.altitudeM ? ` ${l.altitudeM}m` : ""}${l.note ? ` "${l.note}"` : ""}`;
    }

    case "alert":
      return `[#${env.seq} ${ts}] ${["ℹ️", "⚠️", "🚨"][p.value.level]} [${p.value.source}] ${p.value.message}`;

    default:
      return `[#${env.seq} ${ts}] unknown payload`;
  }
}
