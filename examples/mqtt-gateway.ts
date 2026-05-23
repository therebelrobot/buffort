// mqtt-gateway.ts
//
// Example of a gateway node: a Pi with wifi that listens for
// MqttForward packets on the mesh and publishes them to a broker.
//
// Not runnable standalone — requires hardware and additional packages:
//   npm install @meshtastic/core @meshtastic/transport-node-serial mqtt

import { MeshDevice, Types } from "@meshtastic/core";
import { TransportNodeSerial } from "@meshtastic/transport-node-serial";
import mqtt from "mqtt";
import { decode, format } from "../codec.js";

const BUFFORT_PORT = 256;
const MQTT_BROKER = process.env.MQTT_BROKER ?? "mqtt://localhost:1883";
const SERIAL_PORT = process.env.SERIAL_PORT ?? "/dev/cu.usbmodem101";

async function main() {
  // Connect to MQTT broker
  const mqttClient = mqtt.connect(MQTT_BROKER);
  await new Promise<void>((resolve, reject) => {
    mqttClient.on("connect", resolve);
    mqttClient.on("error", reject);
  });
  console.log(`Connected to MQTT broker at ${MQTT_BROKER}`);

  // Connect to Meshtastic node
  const transport = await TransportNodeSerial.create(SERIAL_PORT);
  const device = new MeshDevice(transport);
  device.log.settings.minLevel = 5;

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

  console.log(`Meshtastic node configured on ${SERIAL_PORT}`);
  console.log("Listening for Buffort MqttForward packets...\n");

  // Listen for Buffort packets
  device.events.onMeshPacket.subscribe((meshPacket) => {
    const decoded = meshPacket.decoded;
    if (!decoded || decoded.portnum !== BUFFORT_PORT) return;

    try {
      const envelope = decode(decoded.payload);
      console.log(`[from !${meshPacket.from.toString(16)}] ${format(envelope)}`);

      // Forward MQTT packets to broker
      if (envelope.payload.case === "mqtt") {
        const { topic, payload, retain, qos } = envelope.payload.value;
        mqttClient.publish(topic, Buffer.from(payload), {
          retain,
          qos: qos as 0 | 1 | 2,
        });
        console.log(`  → Published to MQTT: ${topic}`);
      }
    } catch (e) {
      console.error("Failed to decode Buffort packet:", e);
    }
  });

  // Keep alive
  await new Promise(() => { });
}

main().catch(console.error);
