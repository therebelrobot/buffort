// meshtastic-integration.ts
//
// Example showing how to integrate Buffort with the Meshtastic Node.js
// serial transport. Uses a custom portNum to distinguish Buffort packets
// from standard Meshtastic text messages.
//
// Not runnable standalone — requires hardware and the meshtastic packages.
// Install them alongside buffort:
//   npm install @meshtastic/core @meshtastic/transport-node-serial

import { MeshDevice, Types } from "@meshtastic/core";
import { TransportNodeSerial } from "@meshtastic/transport-node-serial";
import { Protobuf } from "@meshtastic/core";
import { buffort, decode, format } from "../codec.js";

// Private app portNum — pick something in the private range (256-511).
// This keeps Buffort packets separate from normal Meshtastic text/position/etc.
const BUFFORT_PORT = 256;

async function main() {
  const port = process.env.SERIAL_PORT ?? "/dev/cu.usbmodem101";
  const transport = await TransportNodeSerial.create(port);
  const device = new MeshDevice(transport);

  device.log.settings.minLevel = 5; // quiet

  // Wait for config
  const ready = new Promise<void>((resolve) => {
    const unsub = device.events.onDeviceStatus.subscribe((status) => {
      if (status >= Types.DeviceStatusEnum.DeviceConfigured) {
        unsub();
        resolve();
      }
    });
  });
  device.configure();
  await ready;

  console.log("Device configured, listening for Buffort packets...\n");

  // ─── Receive ─────────────────────────────────────────────
  // Listen on the raw mesh packet stream and filter for our portNum
  device.events.onMeshPacket.subscribe((meshPacket) => {
    const decoded = meshPacket.decoded;
    if (!decoded || decoded.portnum !== BUFFORT_PORT) return;

    try {
      const envelope = decode(decoded.payload);
      console.log(`[from !${meshPacket.from.toString(16)}] ${format(envelope)}`);
    } catch (e) {
      console.error("Failed to decode Buffort packet:", e);
    }
  });

  // ─── Send examples ──────────────────────────────────────
  // Text to partner
  await device.sendPacket(
    buffort.text("heading back, 20 min out"),
    BUFFORT_PORT,
    "broadcast"
  );

  // Sensor reading from this node
  await device.sendPacket(
    buffort.sensor("cabin", { tempF: 6800, batteryMv: 3650 }),
    BUFFORT_PORT,
    "broadcast"
  );

  // Fire an event into MQTT (a gateway node with wifi will pick this up)
  await device.sendPacket(
    buffort.mqtt("property/cabin/motion", JSON.stringify({ detected: true }), {
      retain: false,
    }),
    BUFFORT_PORT,
    "broadcast"
  );

  // Drop a location pin
  await device.sendPacket(
    buffort.location(44.5, -70.5, { note: "good mushroom spot" }),
    BUFFORT_PORT,
    "broadcast"
  );

  console.log("\nSent example packets. Listening for responses...");
  // Keep alive
  await new Promise(() => { });
}

main().catch(console.error);
