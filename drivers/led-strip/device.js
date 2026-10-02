'use strict';

const Homey = require('homey');
const P = require('../../lib/protocol');

const IDLE_DISCONNECT_MS = 20000;
const MAX_ATTEMPTS = 6;
const RETRY_GAP_MS = 100;

module.exports = class LedStripDevice extends Homey.Device {

  async onInit() {
    this._peripheral = null;
    this._idleTimer = null;
    this._queue = Promise.resolve();

    if (this.getCapabilityValue('onoff') === null) await this.setCapabilityValue('onoff', false);
    if (this.getCapabilityValue('dim') === null) await this.setCapabilityValue('dim', 1);
    if (this.getCapabilityValue('light_hue') === null) await this.setCapabilityValue('light_hue', 0);
    if (this.getCapabilityValue('light_saturation') === null) await this.setCapabilityValue('light_saturation', 1);

    this.registerCapabilityListener('onoff', async (value) => {
      await this._send([value ? P.POWER_ON : P.POWER_OFF]);
    });

    this.registerCapabilityListener('dim', async (value) => {
      const packets = [];
      if (!this.getCapabilityValue('onoff')) {
        packets.push(P.POWER_ON);
        await this.setCapabilityValue('onoff', true);
      }
      packets.push(P.brightness(value));
      await this._send(packets);
    });

    this.registerMultipleCapabilityListener(['light_hue', 'light_saturation'], async (values) => {
      const hue = values.light_hue ?? this.getCapabilityValue('light_hue');
      const saturation = values.light_saturation ?? this.getCapabilityValue('light_saturation');
      const [r, g, b] = P.hsvToRgb(hue, saturation, 1);

      const packets = [];
      if (!this.getCapabilityValue('onoff')) {
        packets.push(P.POWER_ON);
        await this.setCapabilityValue('onoff', true);
      }
      packets.push(P.COLOR_MODE, P.color(r, g, b));
      await this._send(packets);
    }, 300);
  }

  async onDeleted() {
    this._clearIdleTimer();
    await this._disconnect();
  }

  _send(packets) {
    const run = this._queue.then(() => this._sendNow(packets));
    this._queue = run.catch(() => {});
    return run;
  }

  async _sendNow(packets) {
    let lastError;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      let peripheral = null;
      try {
        peripheral = await this._connect();
        await this._writeAll(peripheral, packets);
        this._armIdleTimer();
        return;
      } catch (err) {
        lastError = err;
        this.log(`BLE attempt ${attempt}/${MAX_ATTEMPTS} failed: ${err.message}`);
        await this._disconnect(peripheral);
        if (attempt < MAX_ATTEMPTS) await P.sleep(RETRY_GAP_MS);
      }
    }
    throw new Error(`Could not reach the LED strip: ${lastError.message}`);
  }

  _writeAll(peripheral, packets) {
    return new Promise((resolve, reject) => {
      const onDisconnect = () => reject(new Error('strip disconnected before the command was sent'));
      peripheral.once('disconnect', onDisconnect);

      (async () => {
        for (const packet of packets) {
          await peripheral.write(P.SERVICE_UUID, P.WRITE_UUID, packet);
          await P.sleep(P.WRITE_GAP_MS);
        }
      })()
        .then(resolve, reject)
        .finally(() => peripheral.removeListener('disconnect', onDisconnect));
    });
  }

  async _connect() {
    if (this._peripheral) return this._peripheral;

    const advertisement = await this.homey.ble.find(this.getStoreValue('peripheralUuid'));
    const peripheral = await advertisement.connect();
    peripheral.once('disconnect', () => {
      if (this._peripheral === peripheral) this._peripheral = null;
    });
    this._peripheral = peripheral;
    return peripheral;
  }

  async _disconnect(peripheral = this._peripheral) {
    if (!peripheral || this._peripheral === peripheral) this._peripheral = null;
    if (!peripheral) return;
    try {
      await peripheral.disconnect();
    } catch (err) {
      this.error('BLE disconnect failed:', err.message);
    }
  }

  _armIdleTimer() {
    this._clearIdleTimer();
    this._idleTimer = this.homey.setTimeout(() => {
      this._idleTimer = null;
      this._disconnect().catch(this.error);
    }, IDLE_DISCONNECT_MS);
  }

  _clearIdleTimer() {
    if (this._idleTimer) {
      this.homey.clearTimeout(this._idleTimer);
      this._idleTimer = null;
    }
  }

};