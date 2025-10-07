const csv = require("@fast-csv/parse");
const fs = require("fs");
const path = require("path");
const Device = require("../device");
const PacketForwarder = require("../packet-forwarder");
const { estimateLoraSnr } = require("./utils");

const Experiment2 = class {
  constructor(
    deviceList,
    deviceNumber,
    legacyEdgeRatio,
    gatewayList,
    packetDataFolder
  ) {
    deviceNumber;
    this.legacyEdgeRatio = legacyEdgeRatio;
    this.packetDataFolder = packetDataFolder;

    // CREATE PACKET FORWARDERS
    this.packetForwarders = {};
    for (const gatewayData of gatewayList) {
      const gateway_id = gatewayData.id;
      console.log(gateway_id);
      const packetForwarder = new PacketForwarder(
        gateway_id,
        gatewayData.host,
        gatewayData.port
      );
      this.packetForwarders[gateway_id] = packetForwarder;
    }

    // CREATE DEVICES
    this.devices = {};
    let deviceNumberCounter = 0;
    for (const deviceData of deviceList) {
      if (deviceNumber > 0 && deviceNumberCounter >= deviceNumber) break;
      const device_id = deviceData.ids.device_id;
      const device = new Device(
        device_id,
        deviceNumberCounter % (legacyEdgeRatio + 1) !== 0
      );
      const DevAddr = deviceData.session.dev_addr;
      const AppSKey = deviceData.session.keys.app_s_key.key;
      const NwkSKey = deviceData.session.keys.f_nwk_s_int_key.key;
      device.abpActivation(DevAddr, NwkSKey, AppSKey);
      this.devices[device_id] = device;
      // console.debug(
      //   `Device ${DevAddr}: ${device.isEdge() ? "EDGE" : "LEGACY"}`
      // );
      deviceNumberCounter++;
    }
  }

  processSnapshotFile = async (snapshotFile) => {
    // READ CSV FILE
    return new Promise((resolve, reject) => {
      fs.createReadStream(path.join(this.packetDataFolder, snapshotFile))
        .pipe(csv.parse({ headers: true }))
        .on("data", (row) => {
          // console.log(Object.keys(row));
          const label = row.label;
          // GET DEVICE INFO
          const nodeId = row.NODE_ID;
          const devAddr = row.dev_addr;
          // GET PACKET INFO
          const fCnt = parseInt(row.framecounter);
          const timestamp = parseFloat(row.timestamp);
          const position = {
            x: parseFloat(row.x),
            y: parseFloat(row.y),
            z: parseFloat(row.z),
          };
          // PARSE POSITION INTO FLOATARRAY
          const positionArray = new Float32Array(3);
          positionArray[0] = position.x;
          positionArray[1] = position.y;
          positionArray[2] = position.z;
          // ENCODE BASE64
          const payload = Buffer.from(positionArray.buffer).toString("base64");
          const spreadingFactorStr = row.spreading_factor;
          const spreadingFactor = parseInt(spreadingFactorStr);
          // GET GATEWAYS
          let receptions = [];
          try {
            receptions = JSON.parse(row.receptions.replace(/'/g, '"'));
          } catch (error) {
            console.error(error);
            console.error(row.receptions);
            return reject(row.receptions);
          }
          if (receptions.length < 1) {
            return;
          }
          // console.log(receptions);

          // Create LoRa packet
          const device = this.devices[nodeId];
          if (!device) {
            console.warn(`Device ${nodeId} not found.`);
            return;
          }
          const packet = device.createLoRaPacket(payload, fCnt);

          // SEND PACKET
          for (const gwInfo of receptions) {
            // TODO
            const gw_id = gwInfo[7];
            const options = {
              rssi: parseFloat(gwInfo[6]),
              spreadingFactor: spreadingFactor,
              frequency: parseFloat(gwInfo[5]),
              stat: parseInt(gwInfo[4]),
              snr: estimateLoraSnr({
                rssi: parseFloat(gwInfo[6]),
                spreadingFactor: spreadingFactor,
                bandwidth: 125000,
              }).estimatedSnr,
            };
            const packetForwarder = this.packetForwarders[gw_id];
            const encodedPacket = packetForwarder.encodePacket(packet, options);
            const frameLoss = 0;
            packetForwarder
              .sendPacket(encodedPacket, frameLoss)
              .then(() => {
                console.log(`Packet sent to ${gw_id}.`);
              })
              .catch((error) => {
                console.error(error);
              });
          }
        })
        .on("error", (error) => {
          console.error(error);
          return reject(error);
        })
        .on("end", () => {
          return resolve(`Processed ${snapshotFile}.`);
        });
    });
  };

  run = async () => {
    // GET SNAPSHOT FILE LIST
    const snapshotFiles = fs.readdirSync(this.packetDataFolder);

    // PROCESS SNAPSHOT FILES
    for (const snapshotFile of snapshotFiles) {
      console.log(`Processing ${snapshotFile}...`);
      // READ CSV FILE
      try {
        const result = await this.processSnapshotFile(snapshotFile);
        console.log(result);
      } catch (error) {
        console.error(error);
      }
      // SLEEP FOR 1 SECOND
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    console.log("Experiment completed.");
  };
};

module.exports = Experiment2;
