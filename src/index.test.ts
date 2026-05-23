import { describe, it, expect } from "vitest";
import {
  buffort,
  encode,
  decode,
  sizeOf,
  format,
  AlertLevel,
  NodeState,
  MAX_PACKET_BYTES,
  EnvelopeSchema,
} from "./index.js";
import { create, toBinary } from "@bufbuild/protobuf";

describe("buffort", () => {
  describe("text messages", () => {
    it("round-trips a text message", () => {
      const bytes = buffort.text("hello from the clearing");
      const env = decode(bytes);

      expect(env.payload.case).toBe("text");
      if (env.payload.case === "text") {
        expect(env.payload.value.body).toBe("hello from the clearing");
      }
    });

    it("round-trips a reply", () => {
      const bytes = buffort.text("got it", 42);
      const env = decode(bytes);

      if (env.payload.case === "text") {
        expect(env.payload.value.replyToSeq).toBe(42);
      }
    });

    it("fits max-length text in a single packet", () => {
      // 220 chars should fit comfortably
      const bytes = buffort.text("a".repeat(220));
      expect(bytes.length).toBeLessThanOrEqual(MAX_PACKET_BYTES);
    });

    it("throws on oversized text", () => {
      expect(() => buffort.text("x".repeat(250))).toThrow("Packet too large");
    });
  });

  describe("sensor readings", () => {
    it("round-trips a full sensor reading", () => {
      const bytes = buffort.sensor("barn", {
        tempF: 7250,
        humidity: 4520,
        pressure: 10132,
        batteryMv: 3700,
        solarMv: 5100,
        soilMoisture: 450,
        waterLevel: -200,
        windSpeed: 123,
        windDir: 270,
      });
      const env = decode(bytes);

      expect(env.payload.case).toBe("sensor");
      if (env.payload.case === "sensor") {
        const s = env.payload.value;
        expect(s.stationId).toBe("barn");
        expect(s.tempF).toBe(7250);
        expect(s.humidity).toBe(4520);
        expect(s.pressure).toBe(10132);
        expect(s.batteryMv).toBe(3700);
        expect(s.solarMv).toBe(5100);
        expect(s.soilMoisture).toBe(450);
        expect(s.waterLevel).toBe(-200);
        expect(s.windSpeed).toBe(123);
        expect(s.windDir).toBe(270);
      }
    });

    it("omits unset fields with zero cost", () => {
      const sparse = buffort.sensor("well", { batteryMv: 3300 });
      const full = buffort.sensor("well", {
        tempF: 7250,
        humidity: 4520,
        pressure: 10132,
        batteryMv: 3300,
        solarMv: 5100,
      });
      expect(sparse.length).toBeLessThan(full.length);
    });
  });

  describe("commands", () => {
    it("round-trips a command", () => {
      const bytes = buffort.command("gate-north", "open");
      const env = decode(bytes);

      expect(env.payload.case).toBe("command");
      if (env.payload.case === "command") {
        expect(env.payload.value.target).toBe("gate-north");
        expect(env.payload.value.action).toBe("open");
      }
    });

    it("round-trips a command with value", () => {
      const bytes = buffort.command("thermostat", "set", "68");
      const env = decode(bytes);

      if (env.payload.case === "command") {
        expect(env.payload.value.value).toBe("68");
      }
    });
  });

  describe("command ack", () => {
    it("round-trips a success ack", () => {
      const bytes = buffort.commandAck(7, true);
      const env = decode(bytes);

      expect(env.payload.case).toBe("commandAck");
      if (env.payload.case === "commandAck") {
        expect(env.payload.value.cmdSeq).toBe(7);
        expect(env.payload.value.success).toBe(true);
        expect(env.payload.value.error).toBe("");
      }
    });

    it("round-trips a failure ack", () => {
      const bytes = buffort.commandAck(7, false, "motor jammed");
      const env = decode(bytes);

      if (env.payload.case === "commandAck") {
        expect(env.payload.value.success).toBe(false);
        expect(env.payload.value.error).toBe("motor jammed");
      }
    });
  });

  describe("status updates", () => {
    it("round-trips a status heartbeat", () => {
      const bytes = buffort.status("shed-pi", NodeState.NODE_OK, {
        uptimeS: 86400,
        freeHeap: 134000,
        version: "1.2.0",
      });
      const env = decode(bytes);

      expect(env.payload.case).toBe("status");
      if (env.payload.case === "status") {
        expect(env.payload.value.nodeId).toBe("shed-pi");
        expect(env.payload.value.state).toBe(NodeState.NODE_OK);
        expect(env.payload.value.uptimeS).toBe(86400);
        expect(env.payload.value.version).toBe("1.2.0");
      }
    });
  });

  describe("mqtt forward", () => {
    it("round-trips a string payload", () => {
      const bytes = buffort.mqtt(
        "property/barn/temp",
        JSON.stringify({ temp: 72.5 }),
        { retain: true, qos: 1 }
      );
      const env = decode(bytes);

      expect(env.payload.case).toBe("mqtt");
      if (env.payload.case === "mqtt") {
        expect(env.payload.value.topic).toBe("property/barn/temp");
        expect(env.payload.value.retain).toBe(true);
        expect(env.payload.value.qos).toBe(1);
        const decoded = new TextDecoder().decode(env.payload.value.payload);
        expect(JSON.parse(decoded)).toEqual({ temp: 72.5 });
      }
    });

    it("round-trips a binary payload", () => {
      const raw = new Uint8Array([0x01, 0x02, 0x03]);
      const bytes = buffort.mqtt("property/raw", raw);
      const env = decode(bytes);

      if (env.payload.case === "mqtt") {
        expect(env.payload.value.payload).toEqual(raw);
      }
    });
  });

  describe("location share", () => {
    it("round-trips coordinates", () => {
      const bytes = buffort.location(44.123456, -70.654321, {
        altitudeM: 250,
        accuracyM: 10,
        note: "by the creek",
      });
      const env = decode(bytes);

      expect(env.payload.case).toBe("location");
      if (env.payload.case === "location") {
        const lat = env.payload.value.latitudeI / 1e7;
        const lon = env.payload.value.longitudeI / 1e7;
        expect(lat).toBeCloseTo(44.123456, 5);
        expect(lon).toBeCloseTo(-70.654321, 5);
        expect(env.payload.value.altitudeM).toBe(250);
        expect(env.payload.value.note).toBe("by the creek");
      }
    });
  });

  describe("alerts", () => {
    it("round-trips a critical alert", () => {
      const bytes = buffort.alert(
        AlertLevel.ALERT_CRITICAL,
        "smoke-barn",
        "Smoke detected"
      );
      const env = decode(bytes);

      expect(env.payload.case).toBe("alert");
      if (env.payload.case === "alert") {
        expect(env.payload.value.level).toBe(AlertLevel.ALERT_CRITICAL);
        expect(env.payload.value.source).toBe("smoke-barn");
        expect(env.payload.value.message).toBe("Smoke detected");
      }
    });
  });

  describe("envelope metadata", () => {
    it("assigns sequential seq numbers", () => {
      const a = decode(buffort.text("one"));
      const b = decode(buffort.text("two"));
      expect(b.seq).toBe(a.seq + 1);
    });

    it("sets a valid timestamp", () => {
      const env = decode(buffort.text("now"));
      const now = Math.floor(Date.now() / 1000);
      expect(env.timestamp).toBeGreaterThan(now - 5);
      expect(env.timestamp).toBeLessThanOrEqual(now + 1);
    });
  });

  describe("wire efficiency", () => {
    it("all message types fit under 237 bytes", () => {
      const messages = [
        buffort.text("a reasonable length message for the mesh"),
        buffort.sensor("barn", { tempF: 7250, humidity: 4520, batteryMv: 3700 }),
        buffort.command("gate-north", "open"),
        buffort.commandAck(1, true),
        buffort.status("shed-pi", NodeState.NODE_OK, { uptimeS: 86400 }),
        buffort.mqtt("property/test", "hello"),
        buffort.location(44.5, -70.5, { note: "clearing" }),
        buffort.alert(AlertLevel.ALERT_CRITICAL, "smoke-barn", "Smoke detected in east bay"),
      ];

      for (const msg of messages) {
        expect(msg.length).toBeLessThanOrEqual(MAX_PACKET_BYTES);
      }
    });

    it("sensor reading is significantly smaller than JSON", () => {
      const proto = buffort.sensor("barn", {
        tempF: 7250,
        humidity: 4520,
        pressure: 10132,
        batteryMv: 3700,
      });
      const json = new TextEncoder().encode(
        JSON.stringify({
          type: "sensor",
          station: "barn",
          temp_f: 72.5,
          humidity: 45.2,
          pressure: 1013.2,
          battery_mv: 3700,
        })
      );
      expect(proto.length).toBeLessThan(json.length * 0.5);
    });
  });

  describe("format", () => {
    it("formats all message types without throwing", () => {
      const messages = [
        buffort.text("hello"),
        buffort.sensor("barn", { tempF: 7250 }),
        buffort.command("gate", "open"),
        buffort.commandAck(1, true),
        buffort.commandAck(2, false, "timeout"),
        buffort.status("pi", NodeState.NODE_DEGRADED),
        buffort.mqtt("topic", "data", { retain: true, qos: 2 }),
        buffort.location(44.5, -70.5, { altitudeM: 100, note: "here" }),
        buffort.alert(AlertLevel.ALERT_INFO, "cam", "motion"),
        buffort.alert(AlertLevel.ALERT_WARNING, "batt", "low"),
        buffort.alert(AlertLevel.ALERT_CRITICAL, "smoke", "fire"),
      ];

      for (const msg of messages) {
        const str = format(decode(msg));
        expect(str).toBeTruthy();
        expect(str.length).toBeGreaterThan(10);
      }
    });
  });
});
