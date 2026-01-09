const csv = require("@fast-csv/parse");
const fs = require("fs");
const path = require("path");
const Device = require("../device");
const PacketForwarder = require("../packet-forwarder");
const snr = require("./utils");
const { rejects } = require("assert");
const { type } = require('os');

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
      const packetForwarder = new PacketForwarder(
        gateway_id,
        gatewayData.host,
        gatewayData.port
      );
      this.packetForwarders[gateway_id] = packetForwarder;
    }
    this.devices = {};
    let deviceNumberCounter = 0;

    const thirdGateway = gatewayList[2]; // arrays are 0-indexed
    const gwId = thirdGateway.id;
    const host = thirdGateway.host;
    const port = thirdGateway.port;
    const packetForwarder = new PacketForwarder(gwId, host, port);
    packetForwarder.initListeners();
    // packetForwarder.startPulling();

    async function processDevices() {
        for (const deviceData of deviceList) {
            // 1. Check constraints
            if (typeof deviceNumber !== 'undefined' && deviceNumber > 0 && deviceNumberCounter >= deviceNumber) break;

            const device_id = deviceData.ids.device_id;
            const dev_eui = deviceData.ids.dev_eui;
            const app_eui = deviceData.ids.join_eui || "0000000000000000";
            
            const isLegacy = deviceNumberCounter % (legacyEdgeRatio + 1) !== 0;
            const device = new Device(device_id, isLegacy);

          
            if (deviceData.session) {
                const DevAddr = deviceData.session.dev_addr;
                const AppSKey = deviceData.session.keys.app_s_key.key;
                const NwkSKey = deviceData.session.keys.f_nwk_s_int_key.key;
                
                device.abpActivation(DevAddr, NwkSKey, AppSKey);
                this.devices[device_id] = device; 
                console.log(`[ABP] Device ${device_id} initialized.`);
            }else {
                const AppKey = deviceData.root_keys.app_key.key;
                const version = deviceData.lorawan_version;
                if (version.includes("1_0")) { 
                    // LoRaWAN 1.0.x uses AppKey for the Join Request MIC
                    const signedBuffer = await device.createJoinRequest(dev_eui, app_eui, AppKey);
                    const udpPacket = await packetForwarder.encodeUplink(signedBuffer, gwId);
                    try {
                        packetForwarder.sendUplink(udpPacket);
                        // Store the device so we can process the Join Accept later
                        this.devices[device_id] = device; 
                        console.log(`[OTAA] Sent Join Request for ${device_id} (v1.0.x)`);
                    } catch (err) {
                        console.error(`[ERR] Failed to send Join for ${device_id}:`, err);
                    }
                } 
                else if (version.includes("1_1")) {
                    // LoRaWAN 1.1 requires NwkKey for Join MIC
                    const NwkKey = deviceData.root_keys.nwk_key ? deviceData.root_keys.nwk_key.key : AppKey;
                    console.log(`[OTAA] Preparing 1.1 Join for ${device_id} using NwkKey.`);
                    
                    const signedBuffer = await device.createJoinRequest(dev_eui, app_eui, NwkKey);
                    const udpPacket = await packetForwarder.encodeUplink(signedBuffer, gwId);
                    
                    await packetForwarder.sendUplink(udpPacket);
                    this.devices[device_id] = device;
                }
            }

            deviceNumberCounter++;
        }
    }

    processDevices.bind(this)(); // Ensure 'this' context is preserved if inside a class
  }
  processSnapshotFile = async (snapshotFile) => {
    // READ CSV FILE
    return new Promise((resolve, reject) => {
      fs.createReadStream(path.join(this.packetDataFolder, snapshotFile))
        .pipe(csv.parse({ headers: true }))
        .on("data", (row) => {
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
            return reject(row.receptions);
          }
          if (receptions.length < 1) {
            return;
          }
          // Create LoRa packet
          const device = this.devices[nodeId];
          if (!device) {
            console.warn(`Device ${nodeId} not found.`);
            return;
          }
          //Start to set a value for the packet
          // if (this.legacyEdgeRatio === -1) {
          //   const { publicKeyCompressed } = device.generateCompressedPublicKey();
          //   return device.createEdgeJoinRequest(publicKeyCompressed, fCnt);
          // }
          
          return device.createLoRaPacket(payload, fCnt);
          //End setting 
          //SEND PACKET
          for (const gwInfo of receptions) {
            // TODO
            const gw_id = gwInfo[7];
            const options = {
              rssi: parseInt(gwInfo[6]),
              spreadingFactor: spreadingFactor,
              frequency: parseFloat(gwInfo[5]),
              stat: parseInt(gwInfo[4]),
              snr: snr.estimateLoraSnr({
                rssi: parseInt(gwInfo[6]),
                spreadingFactor: spreadingFactor,
                bandwidth: 125000,
              })["estimatedSnr"],
            };
            const packetForwarder = this.packetForwarders[gw_id];
            const encodedPacket = packetForwarder.encodePacket(packet, options);
            packetForwarder
              .sendPacket(encodedPacket)
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
      } catch (err) {
        console.error("Caught error: ", err);
      }
      // SLEEP FOR 1 SECOND
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    console.log("Experiment completed.");
  };
};

module.exports = Experiment2;
