//const { Experiment3 } = require("./e2l_device_emulator");
const fs = require("fs");
const path = require("path");
const csv = require("csv-parser");
const device = require('../device');
const forwarder = require('../gateway');


const Experiment3 = class {
  constructor(snapshotFolder, snapshots, gatewayFiles) {
    this.snapshotFolder = snapshotFolder;
    this.snapshots = snapshots;
    this.gatewayFiles = gatewayFiles;
  }

  processCsvFile = async (snapshotPath) => {
    return new Promise((resolve, reject) => {
      const results = [];
      console.log(`Attempting to read: ${snapshotPath}`);
      fs.createReadStream(snapshotPath)
        .pipe(csv())
        .on("data", (data) => {
          console.log(`Processing row from ${snapshotPath}:`, data);
          results.push(data);
        })
        .on("end", () => {
          console.log(`Finished reading ${snapshotPath}. Total rows: ${results.length}`);
          resolve(results);
        })
        .on("error", (err) => {
          console.error(`Error reading ${snapshotPath}:`, err.message);
          reject(err);
        });
    });
  };

  processAllCsvFiles = async () => {
    const allResults = {};

    for (const snapshot of this.snapshots) {
      try {
        const fullPath = path.join(this.snapshotFolder, snapshot);
        console.log(`\n--- Starting to process: ${fullPath} ---`);
        const fileResults = await this.processCsvFile(fullPath);
        allResults[snapshot] = fileResults;
      } catch (error) {
        console.error(`Failed to process ${snapshot}. Skipping. Reason: ${error.message}`);
      }
    }

    console.log("============= All files processed! =============");
    console.log("Summary of all results:", JSON.stringify(allResults, null, 2));

    const frameCountersBySnapshot = {};

    for (const snapshotKey in allResults) {
      const dataArray = allResults[snapshotKey];

      if (!Array.isArray(dataArray)) {
        console.warn(`Data for ${snapshotKey} is not an array. Skipping.`);
        continue;
      }

      let recordCounter = 0;

      for (const item of dataArray) {
        recordCounter++;
        let receptions = item.receptions;

        if (typeof receptions === "string") {
          try {
            receptions = JSON.parse(receptions.replace(/'/g, '"'));
          } catch (e) {
            console.error("Failed to parse receptions:", receptions, e);
            continue; // was return, changed to continue to avoid exiting entire function
          }
        }

        if (!Array.isArray(receptions) || receptions.length === 0) {
          console.warn(`Invalid receptions in record ${recordCounter} of ${snapshotKey}. Skipping.`);
          continue;
        }

        if (
          item.framecounter === undefined &&
          item.dev_addr === undefined &&
          item.spreading_factor === undefined
        ) {
          console.warn(`Record ${recordCounter} in ${snapshotKey} missing required fields. Skipping.`);
          continue;
        }

        for (const [index, entry] of receptions.entries()) {
          const gatewayInfo = {
            type: entry[0],
            latitude: entry[1],
            longitude: entry[2],
            sf: entry[3],
            cr: entry[4],
            frequency: entry[5],
            rssi: entry[6],
            gateway_mac: entry[7],
          };

          const packet = device.createLoRaPacket(item);

          try {
            const forwarderInfo = await forwarder.GwData(gatewayInfo.gateway_mac, packet, this.gatewayFiles);
            if (forwarderInfo) {
              console.log("Host:", forwarderInfo.host);
              console.log("Port:", forwarderInfo.port);

              await device.sendLoRaPacket(packet, 0, gatewayInfo, forwarderInfo); // ✅ works now
            } else {
              console.warn("No forwarder info found for MAC:", gatewayInfo.gateway_mac);
            }
          } catch (err) {
            console.error("Error in GwData or sendLoRaPacket:", err.message);
          }

          await new Promise(res => setTimeout(res, 10)); // optional throttle
          console.log(`\nReception #${index + 1}`);
          console.log(`  Type        : ${entry[0]}`);
          console.log(`  Latitude    : ${entry[1]}`);
          console.log(`  Longitude   : ${entry[2]}`);
          console.log(`  SF          : ${entry[3]}`);
          console.log(`  CR          : ${entry[4]}`);
          console.log(`  Frequency   : ${entry[5]}`);
          console.log(`  RSSI        : ${entry[6]}`);
          console.log(`  Gateway MAC : ${entry[7]}`);
        }
      }
    }

    const allFrameCountersFlat = Object.values(frameCountersBySnapshot).flat();
    console.log("\n--- All Framecounters (flattened list) ---");
    console.log(allFrameCountersFlat);
  };


  run = async () => {
    await this.processAllCsvFiles();
    console.log("Experiment3 completed.");
  };
};

module.exports = { Experiment3 };