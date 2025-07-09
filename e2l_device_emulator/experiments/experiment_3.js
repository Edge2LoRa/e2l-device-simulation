//const { Experiment3 } = require("./e2l_device_emulator");
const fs = require("fs");
const csv = require("@fast-csv/parse");
const device = require('../device');
const forwarder = require('../gateway');

//Take the list of dataset files from /Edge2LoRa/e2l-device-simulation/experiment_files/experiment03.json

const Experiment3 = class {
  constructor(snapshotFolder, snapshots, gatewayFolder) {
    this.snapshot_folder = snapshotFolder;
    this.snapshots = snapshots; 
    this.gw_folder = gatewayFolder;
  }
    processCsvFile = async (snapshot) => {
      return new Promise((resolve, reject) => {
        const results = [];
        fs.createReadStream(snapshot)
          .pipe(csv())
          .on('data', (data) => {
            console.log(`Processing row from ${snapshot}:`, data);
            results.push(data);
          })
          .on('end', () => {
            console.log(`Finished reading ${snapshot}. Total rows: ${results.length}`);
            resolve(results); // Resolve the promise with the results from this file
          })
          .on('error', (err) => {
            console.error(`Error reading ${snapshot}:`, err.message);
            reject(err); // Reject the promise if an error occurs
          });
      });
    };

    processAllCsvFiles = async () => {
      const allResults = {}; // Results per file
      let forwarder_info;
      let counter = 0;
      for (const snapshot of this.snapshots) {
        console.log(`\n--- Starting to process: ${snapshot} ---`);
        try {
          const fileResults = await this.processCsvFile(snapshot);
          allResults[snapshot] = fileResults;
        } catch (error) {
          console.error(`Failed to process ${snapshot}. Skipping.`);
        }
      }
      console.log('============= All files processed! =============');
      console.log('Summary of all results:', JSON.stringify(allResults, null, 2));
      
      const frameCountersBySnapshot = {};
      for (const snapshotKey in allResults) {
        if (!Object.prototype.hasOwnProperty.call(allResults, snapshotKey)) continue;
    
        const dataArrayForThisSnapshot = allResults[snapshotKey];
    
        if (!Array.isArray(dataArrayForThisSnapshot)) {
          console.warn(`Data for snapshot '${snapshotKey}' is not an array. Skipping.`);
          continue;
        }
    
        console.log(`\n--- Passing data from snapshot: ${snapshotKey} to createPacket ---`);
        let recordCounter = 0;
    
        dataArrayForThisSnapshot.forEach(item => {
          recordCounter++;
          let receptions = item.receptions;
    
          // Try parsing if it's a string
          if (typeof receptions === 'string') {
            try {
              receptions = receptions.replace(/'/g, '"');
              receptions = JSON.parse(receptions);
            } catch (e) {
              console.error("Could not parse receptions string:", receptions, e);
              return; // Skip this record
            }
          }
    
          // Skip if receptions is invalid after parsing
          if (!Array.isArray(receptions) || receptions.length === 0) {
            console.warn(`Record ${recordCounter} in ${snapshotKey} has invalid receptions. Skipping.`);
            return;
          }
    
          // Skip if key properties are missing
          if (
            item.framecounter === undefined &&
            item.dev_addr === undefined &&
            item.spreading_factor === undefined
          ) {
            console.warn(`Record ${recordCounter} in ${snapshotKey} is missing required fields. Skipping.`);
            return;
          }
          
          // Process receptions
          receptions.forEach((entry, index) => {
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
            console.log(gw_fw);
            const gw_fw = this.gw_folder;
            forwarder.GwData(gatewayInfo.gateway_mac, packet, gw_fw)
              .then(forwarder_info => {
                if (forwarder_info) {
                    console.log('Host:', forwarder_info.host);
                    console.log('Port:', forwarder_info.port);
                    device.sendLoRaPacket(packet, 0, gatewayInfo, forwarder_info); 
                  } else {
                    console.warn('No forwarder info found for this MAC address.');
                  }
              })
              .catch(error => {
                console.error('Failed to get forwarder info:', error);
              });

            if (Array.isArray(entry)) {
              console.log(`\nReception #${index + 1}`);
              console.log(`  Type        : ${entry[0]}`);
              console.log(`  Latitude    : ${entry[1]}`);
              console.log(`  Longitude   : ${entry[2]}`);
              console.log(`  SF          : ${entry[3]}`);
              console.log(`  CR          : ${entry[4]}`);
              console.log(`  Frequency   : ${entry[5]}`);
              console.log(`  RSSI        : ${entry[6]}`);
              console.log(`  Gateway MAC : ${entry[7]}`);
            } else {
              console.warn(`Invalid reception format at index ${index}:`, entry);
            }
          });
        });
      }
    
      const allFrameCountersFlat = Object.values(frameCountersBySnapshot).flat();
      console.log('\n--- All Framecounters (flattened list) ---');
      console.log(allFrameCountersFlat);
    };
    run = async () => {
        // Call processAllCsvFiles function
        const processedData = await this.processAllCsvFiles(this.snapshots);
        console.log("Experiment3 completed.");
    };

};
module.exports = Experiment3;