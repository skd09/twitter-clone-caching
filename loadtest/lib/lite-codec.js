// Mirror of App\Services\ConverterService on the Lite server.
// Lite devices speak a bit-packed payload encoded with a non-standard
// Base64 alphabet (lowercase first), 6 bits per character.
const ALPHABET = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789+/';

// Left-pad a non-negative integer to a fixed-width binary string.
// IMSI needs 50 bits, so values arrive as strings and go through BigInt.
export function bits(value, length) {
    return BigInt(value).toString(2).padStart(length, '0');
}

// Pack a binary string into the Lite alphabet, zero-filling the last character.
export function encode(binary) {
    let out = '';
    for (let i = 0; i < binary.length; i += 6) {
        out += ALPHABET[parseInt(binary.slice(i, i + 6).padEnd(6, '0'), 2)];
    }
    return out;
}

// POST /api/7 sanityCheck: api_version (6b) + lite id (16b) + random (8b)
export function sanityPayload(apiVersion, liteId, random) {
    return encode(bits(apiVersion, 6) + bits(liteId, 16) + bits(random, 8));
}

// GET /api/9 device details, POST /api/0 getLiteId:
// api_version (6b) + imsi (50b) + boot result (4b)
export function imsiPayload(apiVersion, imsi, bootResult) {
    return encode(bits(apiVersion, 6) + bits(imsi, 50) + bits(bootResult, 4));
}

// POST /api/2 sendImOK, POST /api/6 smoke: api_version (6b) + lite id (16b)
export function liteIdPayload(apiVersion, liteId) {
    return encode(bits(apiVersion, 6) + bits(liteId, 16));
}
