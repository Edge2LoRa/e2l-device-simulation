const csv = require("@fast-csv/parse");
const fs = require("fs");
const path = require("path");
const Device = require("../device");

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

    this.devices = {};

    // CREATE GATEWAYS
    this.gatewayList = gatewayList;
    // TODO

    // CREATE DEVICES
    let deviceNumberCounter = 0;
    for (const deviceData of deviceList) {
      if (deviceNumberCounter >= deviceNumber) break;
      const device = new Device(
        deviceNumberCounter % (legacyEdgeRatio + 1) !== 0
      );
      const DevAddr = deviceData.session.dev_addr;
      const AppSKey = deviceData.session.keys.app_s_key.key;
      const NwkSKey = deviceData.session.keys.f_nwk_s_int_key.key;
      device.abpActivation(DevAddr, NwkSKey, AppSKey);
      this.devices[DevAddr] = device;
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
          const spreadingFactor = parseInt(row.spreading_factor);
          const spreadingFactorStr = row.spreading_factor;
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
          const device = this.devices[devAddr];
          if (!device) {
            console.warn(`Device ${devAddr} not found.`);
            return;
          }
          const packet = device.createLoRaPacket(payload, fCnt);
          console.log(packet);

          // SEND PACKET
          for (const gwInfo of receptions) {
            // TODO
            console.log(gwInfo);
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
    }
    console.log("Experiment completed.");
  };
};

module.exports = Experiment2;
