// Buffort — Protobuf wire protocol for property mesh communication
// https://github.com/therebelrobot/buffort

export {
  // Builder namespace — the main API
  buffort,

  // Core functions
  encode,
  decode,
  sizeOf,
  format,
  nextSeq,

  // Enums
  AlertLevel,
  NodeState,
} from "./codec";

export type {
  // Message types
  Envelope,
  TextMessage,
  SensorReading,
  Command,
  CommandAck,
  StatusUpdate,
  MqttForward,
  LocationShare,
  Alert,
} from "./codec";

// Re-export generated schemas for advanced usage (custom messages, etc.)
export {
  EnvelopeSchema,
  TextMessageSchema,
  SensorReadingSchema,
  CommandSchema,
  CommandAckSchema,
  StatusUpdateSchema,
  MqttForwardSchema,
  LocationShareSchema,
  AlertSchema,
  AlertLevelSchema,
  NodeStateSchema,
} from "./gen/buffort_pb";

// Protocol constants
export const MAX_PACKET_BYTES = 237;
export const PROTOCOL_VERSION = "0.1.0";
