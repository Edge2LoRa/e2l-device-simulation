const Device = require("../device");

const Experiment1 = class {
  constructor(
    gatewayList,
    deviceNumber,
    legacyEdgeRatio,
    deviceList,
    deviceCreationTimer,
    packetData,
    minPacketNumber,
    maxPacketNumber,
    packetTimer
  ) {
    this.gatewayList = gatewayList;
    this.deviceNumber = deviceNumber;
    this.legacyEdgeRatio = legacyEdgeRatio;
    this.devices = [];

    // PACKET DATA
    let processedDeviceId = {};
    for (const packetInfo of packetData) {
      if (!processedDeviceId[packetInfo.deviceid])
        processedDeviceId[packetInfo.deviceid] = [];
      processedDeviceId[packetInfo.deviceid].push(packetInfo);
    }
    const formattedPacketData = Object.values(processedDeviceId);
    console.log(`Dataset Read.`);

    // CREATE GATEWAYS
    // TODO

    // CREATE DEVICES
    let deviceNumberCounter = 0;
    for (const deviceData of deviceList) {
      const device = new Device(
        (edge = deviceNumberCounter % (legacyEdgeRatio + 1) !== 0)
      );
      const DevAddr = deviceData.session.dev_addr;
      const AppSKey = deviceData.session.keys.app_s_key.key;
      const NwkSKey = deviceData.session.keys.f_nwk_s_int_key.key;
      device.abpActivation(DevAddr, NwkSKey, AppSKey);
      this.devices.push({
        device: device,
        packets: formattedPacketData[deviceNumberCounter % deviceList.length],
        nPackets:
          Math.floor(Math.random() * (maxPacketNumber - minPacketNumber)) +
          minPacketNumber,
      });
      console.log(
        `Device ${deviceNumberCounter}: ${device.isEdge() ? "EDGE" : "LEGACY"}`
      );
      deviceNumberCounter++;
    }

    // TIMERS
    this.deviceCreationTimer = deviceCreationTimer;
    this.packetTimer = packetTimer;
  }

  simulateDevice = (deviceInfo) => {
    return new Promise(async (resolve, reject) => {
      const device = deviceInfo.device;
      const packets = deviceInfo.packets;
      const nPackets = deviceInfo.nPackets;

      let FCnt = 0;
      for (const packet of packets) {
        if (FCnt >= nPackets) {
          break;
        }
        const payload = Buffer.from(
          JSON.stringify([
            parseFloat(packet.soil_temp),
            parseFloat(packet.soil_hum),
          ])
        );
        const base64Packet = device.createLoRaPacket(payload, FCnt);

        // TODO: Send packet using packet forwarder. Calculate frame loss

        // INCREMENT FCNT
        FCnt++;
        await new Promise((r) => setTimeout(r, this.packetTimer));
      }
    });
  };

  run = async () => {
    let deviceSimulationPromises = [];
    for (const deviceInfo of this.devices) {
      deviceSimulationPromises.push(this.simulateDevice(deviceInfo));
      await new Promise((r) => setTimeout(r, this.deviceCreationTimer));
    }

    Promise.all(deviceSimulationPromises)
      .then(() => {
        console.log("Experiment Completed");
      })
      .catch((err) => {
        console.error("Experiment Failed");
        console.error(err);
      });
  };
};

module.exports = Experiment1;
