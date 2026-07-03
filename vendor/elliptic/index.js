"use strict";

const { secp256k1 } = require("@noble/curves/secp256k1.js");

const CURVE_ORDER = BigInt("0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141");

function assertSecp256k1(curve) {
  if (curve !== "secp256k1") {
    throw new Error(`Unsupported curve: ${curve}`);
  }
}

function bytesToHex(bytes) {
  return Buffer.from(bytes).toString("hex");
}

function hexToBytes(hex) {
  return Uint8Array.from(Buffer.from(hex, "hex"));
}

function inputToBytes(input, encoding) {
  if (input instanceof PublicKey) return input.bytes;
  if (input instanceof Uint8Array || Buffer.isBuffer(input)) return Uint8Array.from(input);
  if (typeof input === "string") {
    if (encoding && encoding !== "hex") {
      throw new Error(`Unsupported encoding: ${encoding}`);
    }
    return hexToBytes(input);
  }
  throw new Error("Unsupported key input");
}

function bigintFromBytes(bytes) {
  const hex = bytesToHex(bytes);
  return BigInt(`0x${hex || "0"}`);
}

class BigNumberLike {
  constructor(value) {
    this.value = BigInt(value);
  }

  toString(radix) {
    return this.value.toString(radix);
  }
}

class PublicKey {
  constructor(bytes) {
    this.bytes = Uint8Array.from(bytes);
  }

  getPublic(compressed = true, encoding) {
    const point = secp256k1.Point.fromBytes(this.bytes);
    const bytes = point.toBytes(Boolean(compressed));
    return encoding === "hex" ? bytesToHex(bytes) : bytes;
  }
}

class KeyPair {
  constructor(privateKey) {
    this.privateKey = Uint8Array.from(privateKey);
  }

  getPublic(compressed = true, encoding) {
    const bytes = secp256k1.getPublicKey(this.privateKey, Boolean(compressed));
    return encoding === "hex" ? bytesToHex(bytes) : bytes;
  }

  derive(publicKey) {
    const shared = secp256k1.getSharedSecret(this.privateKey, inputToBytes(publicKey), true).slice(1);
    return new BigNumberLike(bigintFromBytes(shared));
  }

  sign(message, options = {}) {
    const signature = secp256k1.sign(inputToBytes(message), this.privateKey, {
      lowS: options.canonical !== false,
    });
    const compact = typeof signature.toCompactRawBytes === "function"
      ? signature.toCompactRawBytes()
      : signature;
    let s = bigintFromBytes(compact.slice(32));
    if (options.canonical !== false && s > CURVE_ORDER / 2n) {
      s = CURVE_ORDER - s;
    }
    return {
      r: new BigNumberLike(bigintFromBytes(compact.slice(0, 32))),
      s: new BigNumberLike(s),
    };
  }
}

class ec {
  constructor(curve) {
    assertSecp256k1(curve);
  }

  keyFromPrivate(input, encoding) {
    return new KeyPair(inputToBytes(input, encoding));
  }

  keyFromPublic(input, encoding) {
    return new PublicKey(inputToBytes(input, encoding));
  }
}

module.exports = { ec };
