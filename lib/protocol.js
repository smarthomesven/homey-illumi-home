'use strict';

/**
 * illumi Home BLE protocol (reverse engineered from Android app com.lxillumi.illumihome).
 *
 * cmd table:
 *   on          5A 01 02 01
 *   off         5A 01 02 00
 *   color mode  5A 02 01 02
 *   color       5A 07 01  RR GG BB
 *   brightness  5A 03 01  <uint16 little-endian>
 */

const SERVICE_UUID = '6e400001b5a3f393e0a9e50e24dcca9e';
const WRITE_UUID = '6e400002b5a3f393e0a9e50e24dcca9e';
const NOTIFY_UUID = '6e400003b5a3f393e0a9e50e24dcca9e';

const NAME_PATTERN = /^(?:DMRRBA-00[1-9A]|DMCRBA-001|BR-(?:0[1-356]|01B)|L7260)$/;
const BRIGHTNESS_MAX = 4095;
const WRITE_GAP_MS = 25;

const hex = (h) => Buffer.from(h, 'hex');
const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

const POWER_ON = hex('5A010201');
const POWER_OFF = hex('5A010200');
const COLOR_MODE = hex('5A020102');

function le16(value) {
  const buf = Buffer.alloc(2);
  buf.writeUInt16LE(clamp(Math.round(value), 0, 0xffff));
  return buf;
}

function brightness(dim) {
  const value = Math.max(1, Math.round(clamp(dim, 0, 1) * BRIGHTNESS_MAX));
  return Buffer.concat([hex('5A0301'), le16(value)]);
}

function color(r, g, b) {
  return Buffer.concat([hex('5A0701'), Buffer.from([r, g, b].map((c) => clamp(Math.round(c), 0, 255)))]);
}

/** h, s, v all 0..1 -> [r, g, b] 0..255 */
function hsvToRgb(h, s, v) {
  const i = Math.floor(h * 6) % 6;
  const f = h * 6 - Math.floor(h * 6);
  const p = v * (1 - s);
  const q = v * (1 - f * s);
  const t = v * (1 - (1 - f) * s);
  const [r, g, b] = [
    [v, t, p],
    [q, v, p],
    [p, v, t],
    [p, q, v],
    [t, p, v],
    [v, p, q],
  ][i];
  return [r * 255, g * 255, b * 255];
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

module.exports = {
  SERVICE_UUID,
  WRITE_UUID,
  NOTIFY_UUID,
  NAME_PATTERN,
  BRIGHTNESS_MAX,
  WRITE_GAP_MS,
  POWER_ON,
  POWER_OFF,
  COLOR_MODE,
  brightness,
  color,
  hsvToRgb,
  sleep,
};