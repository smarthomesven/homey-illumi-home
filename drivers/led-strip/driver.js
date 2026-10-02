'use strict';

const Homey = require('homey');
const { NAME_PATTERN } = require('../../lib/protocol');

const normalizeUuid = (uuid) => String(uuid).replace(/-/g, '').toLowerCase();

module.exports = class LedStripDriver extends Homey.Driver {

  async onPairListDevices() {
    const advertisements = await this.homey.ble.discover();
    const connectable = advertisements.filter((a) => a.connectable && a.localName);

    // log for diagnostics reports, MAC and name
    // In case the led controller isn't found,
    // this helps determine its real name
    for (const a of connectable) {
      this.log('BLE', a.localName, a.address, a.uuid, JSON.stringify(a.serviceUuids || []));
    }

    const matches = connectable.filter((a) => {
      const nameMatch = NAME_PATTERN ? NAME_PATTERN.test(a.localName) : false;
      return nameMatch;
    });

    const list = matches;

    return list.map((a) => ({
      name: a.localName,
      data: { id: a.uuid },
      store: { peripheralUuid: a.uuid, address: a.address },
    }));
  }

};
