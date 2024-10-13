const CUSTOM_EPOCH = BigInt(1609459200000); // January 1, 2021

// Bit lengths
const TIMESTAMP_BITS = BigInt(41);
const FLAG_BITS = BigInt(1);
const MACHINE_ID_BITS = BigInt(10);
const SEQUENCE_BITS = BigInt(12);
const RANDOMNESS_BITS = MACHINE_ID_BITS + SEQUENCE_BITS; // 22 bits for frontend

// Shifts
// const SEQUENCE_SHIFT = BigInt(0);
const MACHINE_ID_SHIFT = SEQUENCE_BITS; // 12
const FLAG_SHIFT = MACHINE_ID_BITS + SEQUENCE_BITS; // 22
const TIMESTAMP_SHIFT = FLAG_SHIFT + FLAG_BITS; // 23

// Masks
const MAX_TIMESTAMP = (BigInt(1) << TIMESTAMP_BITS) - BigInt(1); // 41 bits
const MAX_MACHINE_ID = (BigInt(1) << MACHINE_ID_BITS) - BigInt(1); // 10 bits
const MAX_SEQUENCE = (BigInt(1) << SEQUENCE_BITS) - BigInt(1); // 12 bits
const MAX_RANDOMNESS = (BigInt(1) << RANDOMNESS_BITS) - BigInt(1); // 22 bits

export class SnowflakeGenerator {
  private lastTimestamp = BigInt(0);
  private sequence = BigInt(0);

  constructor(public readonly machineId: bigint) {
    if (machineId < BigInt(0) || machineId > MAX_MACHINE_ID) {
      throw new Error(`Machine ID must be between 0 and ${MAX_MACHINE_ID}`);
    }
  }

  public generate(): bigint {
    let timestamp = BigInt(Date.now());

    if (timestamp < this.lastTimestamp) {
      throw new Error("Clock moved backwards. Refusing to generate id.");
    }

    if (timestamp === this.lastTimestamp) {
      this.sequence = (this.sequence + BigInt(1)) & MAX_SEQUENCE;
      if (this.sequence === BigInt(0)) {
        timestamp = this.waitNextMillis(timestamp);
      }
    } else {
      this.sequence = BigInt(0);
    }

    this.lastTimestamp = timestamp;

    const adjustedTimestamp = timestamp - CUSTOM_EPOCH;

    if (adjustedTimestamp > MAX_TIMESTAMP) {
      throw new Error("Timestamp exceeds maximum allowed value.");
    }

    // Flag set to 1 for backend
    const flag = BigInt(1);

    const id =
      (adjustedTimestamp << TIMESTAMP_SHIFT) |
      (flag << FLAG_SHIFT) |
      (this.machineId << MACHINE_ID_SHIFT) |
      this.sequence;

    return id;
  }

  private waitNextMillis(currentTimestamp: bigint): bigint {
    let timestamp = BigInt(Date.now());
    while (timestamp <= currentTimestamp) {
      timestamp = BigInt(Date.now());
    }
    return timestamp;
  }
}

export function generateFrontendSnowflakeId(): bigint {
  const timestamp = BigInt(Date.now());
  const adjustedTimestamp = timestamp - CUSTOM_EPOCH;

  if (adjustedTimestamp > MAX_TIMESTAMP) {
    throw new Error("Timestamp exceeds maximum allowed value.");
  }

  // Flag set to 0 for frontend
  const flag = BigInt(0);

  // Generate 22 bits of randomness using crypto.getRandomValues
  const randomBytes = new Uint8Array(4);
  crypto.getRandomValues(randomBytes);

  // Use DataView to read the bytes as a 32-bit unsigned integer
  const dataView = new DataView(randomBytes.buffer);
  const randomValue = dataView.getUint32(0, false); // Big-endian
  const randomness = BigInt(randomValue) & MAX_RANDOMNESS;

  const id =
    (adjustedTimestamp << TIMESTAMP_SHIFT) | (flag << FLAG_SHIFT) | randomness;

  return id;
}

export function extractIdComponents(id: bigint) {
  const adjustedTimestamp = (id >> TIMESTAMP_SHIFT) & MAX_TIMESTAMP;
  const timestamp = adjustedTimestamp + CUSTOM_EPOCH;

  const flag = (id >> FLAG_SHIFT) & BigInt(1);

  if (flag === BigInt(0)) {
    // Frontend ID
    const randomness = id & MAX_RANDOMNESS;
    return {
      timestamp: new Date(Number(timestamp)),
      source: "frontend",
      randomness,
    };
  } else {
    // Backend ID
    const machineId = (id >> MACHINE_ID_SHIFT) & MAX_MACHINE_ID;
    const sequence = id & MAX_SEQUENCE;
    return {
      timestamp: new Date(Number(timestamp)),
      source: "backend",
      machineId,
      sequence,
    };
  }
}

export function isValidSnowflakeId(id: bigint): boolean {
  try {
    const adjustedTimestamp = (id >> TIMESTAMP_SHIFT) & MAX_TIMESTAMP;
    const timestamp = adjustedTimestamp + CUSTOM_EPOCH;

    const flag = (id >> FLAG_SHIFT) & BigInt(1);

    // Validate flag
    if (flag !== BigInt(0) && flag !== BigInt(1)) {
      return false;
    }

    // Validate timestamp (should not be in the future)
    const now = BigInt(Date.now());
    if (timestamp > now) {
      return false;
    }

    if (flag === BigInt(0)) {
      // Frontend ID
      const randomness = id & MAX_RANDOMNESS;
      // Validate randomness
      if (randomness < BigInt(0) || randomness > MAX_RANDOMNESS) {
        return false;
      }
    } else {
      // Backend ID
      const machineId = (id >> MACHINE_ID_SHIFT) & MAX_MACHINE_ID;
      const sequence = id & MAX_SEQUENCE;
      // Validate machineId and sequence
      if (
        machineId < BigInt(0) ||
        machineId > MAX_MACHINE_ID ||
        sequence < BigInt(0) ||
        sequence > MAX_SEQUENCE
      ) {
        return false;
      }
    }

    // If all validations pass
    return true;
  } catch {
    // If any error occurs during extraction, the ID is invalid
    return false;
  }
}
