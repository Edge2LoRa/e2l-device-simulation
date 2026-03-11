const csv = require("@fast-csv/parse");
const fs = require("fs");
const path = require("path");
const Device = require("../device");
const PacketForwarder = require("../packet-forwarder");
const snr = require("./utils");
const EventEmitter = require('events');
const { assert } = require("console");


class Experiment3 extends EventEmitter {
  constructor(
    deviceList,
    deviceNumber,
    legacyEdgeRatio,
    gatewayList,
    packetDataFolder,
    devNonceList, 
    devNonceFile
  ) 
  {
    super();
    this.legacyEdgeRatio = legacyEdgeRatio;
    this.packetDataFolder = packetDataFolder;
    this.deviceList = deviceList;
    this.devNonceFile = devNonceFile;
    this.deviceNumber = deviceNumber;

    this.devices = {};
    this.pendingJoins = new Map();
    this.devNonceMap= devNonceList;


    // CREATE PACKET FORWARDERS
    this.packetForwarders = {};
    for (const gatewayData of gatewayList) {
      const pf = new PacketForwarder(
        gatewayData.id,
        gatewayData.host,
        gatewayData.port
      );
      pf.initListeners();
      this.packetForwarders[gatewayData.id] = pf;
    }

    // Choose third gateway explicitly
    const thirdGateway = gatewayList[2];
    this.gwId = thirdGateway.id;
    this.packetForwarder = this.packetForwarders[this.gwId];
    
  }
 //Start Handling DevNonce while you are using LoRaWAN1.1
  getNextDevNonce(devEui) {
    if (!(devEui in this.devNonceMap)) {
      this.devNonceMap[devEui] = 0;
    }

    const next = this.devNonceMap[devEui] + 1;

    if (next > 0xffff) {
      throw new Error(`DevNonce exhausted for ${devEui}`);
    }

    this.devNonceMap[devEui] = next;
    this.saveNonce();

    return next;
  }
  saveNonce() {
    fs.writeFileSync(this.devNonceFile,JSON.stringify(this.devNonceMap, null, 2));
  }
  //End Handling DevNonce
  waitForUplink= async(packetForwarder)=> {
    return new Promise((resolve) => {
      this.packetForwarder.once("Uplink sent", resolve);
    });
  }
  waitForJoinCompletion = async () => {
    return new Promise((resolve, reject) => {
      // Register the handler inside the Promise
      this.packetForwarder.registerJoinAcceptHandler((phyPayload) => {
        const mtype = (phyPayload[0] >> 5) & 0x07;
        if (mtype !== 0x01) return; // Ignore non-JoinAccept packets
        for (const [devNonceHex, device] of this.pendingJoins.entries()) {
          if (device.tryJoinAccept(phyPayload, devNonceHex)) {

            if (device.isEdge()) {

              const { publicKeyCompressed, privateKey } =
                device.generateCompressedPublicKey();

              device.tempPrivateKey = privateKey;

              const packet = device.createEdgeJoinRequest(
                publicKeyCompressed,
                device.fcnt
              );

              this.packetForwarder.registerDownlinkHandler((phyPayload) => {
                device.handleDataDownlink(phyPayload, privateKey);
              });

              device.once("EdgeJoinAccepted", () => {
                console.log(`[++++] Edge join completed for ${device.id}`);

                this.pendingJoins.delete(devNonceHex);
                resolve(device.id); 
              });

              device.fcnt += 1;

              this.packetForwarder.emit("edge_join_forward", packet, this.gwId);
            }
            else {
              this.pendingJoins.delete(devNonceHex);
              resolve(device.id);
            }
          }
        }
      });
    });
  };
  processDevices = async () => {
    
    const packetForwarder = this.packetForwarder;
    const pendingJoins = this.pendingJoins;


    let deviceNumberCounter = 0;
    for (const deviceData of this.deviceList) {
      if (
        typeof this.deviceNumber !== "undefined" &&
        this.deviceNumber > 0 &&
        deviceNumberCounter >= this.deviceNumber
      ) {
        break;
      }

      const device = new Device(deviceData.ids.device_id, deviceNumberCounter % (this.legacyEdgeRatio + 1) !== 0);
      device.AppKey = Buffer.from(
        deviceData.root_keys.app_key.key,
        "hex"
      );
    
      const device_id = deviceData.ids.device_id;

      if (deviceData.supports_join === false) {
        if(deviceData.session){
          const DevAddr = deviceData.session.dev_addr;
          const AppSKey = deviceData.session.keys.app_s_key.key;
          const NwkSKey = deviceData.session.keys.f_nwk_s_int_key.key;
          
          device.abpActivation(DevAddr, NwkSKey, AppSKey);
          this.devices[device_id] = device; 
          console.log(`[ABP] Device ${device_id} initialized.`);
        }else{
          console.log(`No sesssion for [ABP] Device ${device_id}.`);
        }
        
      }else{  
        if(!('session' in deviceData)){
          let signedBuffer = null;
            if (deviceData.lorawan_version.startsWith("MAC_V1_0")) {
              const [phyPayload, devNonce] =
                await device.createJoinRequest10(
                  deviceData.ids.dev_eui,
                  deviceData.ids.join_eui,
                  deviceData.root_keys.app_key.key
                );
              pendingJoins.set(devNonce.toString("hex"), device);
              signedBuffer = phyPayload;

            }else if (deviceData.lorawan_version.startsWith("MAC_V1_1")) {
              const nextNonceValue =this.getNextDevNonce(deviceData.ids.dev_eui);

              const devNonce = Buffer.alloc(2);
              devNonce.writeUInt16LE(nextNonceValue, 0);

              const appKey = deviceData.root_keys.app_key.key;
              const nwkKey = deviceData.root_keys.nwk_key
                ? deviceData.root_keys.nwk_key.key
                : appKey; // fallback


              const [phyPayload] = await device.createJoinRequest11(deviceData.ids.dev_eui, deviceData.ids.join_eui,
                  appKey,
                  nwkKey,
                  devNonce
                );

              pendingJoins.set(devNonce.toString("hex"), device);
              signedBuffer = phyPayload;
            }else{
              console.warn("Version of LoRaWAN has not defined");
            }
            
            const udpPacket = await packetForwarder.encodeUplink(signedBuffer,null,this.gwId);

            try {
              await packetForwarder.sendUplink(udpPacket);
              this.devices[device_id] = device;
              console.log(`[OTAA] Sent Join Request for ${device_id}`);
            } catch (err) {
              console.error(`[ERR] Failed to send Join for ${device_id}:`, err);
            } 
        }else{
           device.session = {
            devAddr: deviceData.session.dev_addr,
            nwkSKey: deviceData.session.keys.f_nwk_s_int_key.key,
            appSKey: deviceData.session.keys.app_s_key.key
          };
         
        }
      }
      this.devices[device.id] = device;
      deviceNumberCounter++;
    }
  };
  processNetworkTraffic = async () => {
    return new Promise(async (resolve, reject) => {
      try {
              const payload = Buffer.from("Ciao!", "utf8");
              const fCnt = 2;
              const nodeId = "121-13";
              const device = this.devices[nodeId];
              const gw_id = "0000000000000004";

              for (let i = 0; i < 5; i++) {
                console.log("To Send a packet",i);
                const packet = device.createLoRaPacket(payload , fCnt+i, device.session);
                const packetForwarder = this.packetForwarders[gw_id];
                const udpPacket = await packetForwarder.encodeUplink(packet, null, gw_id);
                await packetForwarder.sendUplink(udpPacket);

              }

              resolve("Processed Packets.");
            } catch (error) {
              console.error(error);
              reject(error);
            }
    });
  };

  processSnapshotFile = async (snapshotFile) => {
    // READ CSV FILE
    return new Promise((resolve, reject) => {
      fs.createReadStream(path.join(this.packetDataFolder, snapshotFile))
        .pipe(csv.parse({ headers: true }))
        .on("data", async (row) => {
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

          const packet = device.createLoRaPacket(payload, fCnt, device.session);
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
            const udpPacket = await packetForwarder.encodeUplink(packet, options, gw_id);
            await packetForwarder.sendUplink(udpPacket);
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
  try {
      // --- PART 1: Device Processing ---
      await this.processDevices();
      console.log("Devices processed.");

      // If there IS a pending join, we wait. 
      // If NOT, we simply skip this block and continue immediately.
      const MAX_RETRIES = 10;
      let attempts = 0;

      while (this.pendingJoins.size > 0 && attempts < MAX_RETRIES) {
          const joinedDeviceId = await this.waitForJoinCompletion();
          this.pendingJoins.delete(joinedDeviceId); 
          attempts++;
      }
      // --- PART 2: Snapshot Processing ---
      // We only reach here if Part 1 didn't throw an error.
      console.log("Now reading snapshot files...");
      
      // const snapshotFiles = fs.readdirSync(this.packetDataFolder);

      // for (const snapshotFile of snapshotFiles) {
      //   console.log(`Processing ${snapshotFile}...`);
        
      //   // We use a nested try/catch here so one bad file doesn't stop the whole script
      //   try {
      //     const result = await this.processSnapshotFile(snapshotFile, this.deviceList);
      //     console.log(result);
      //   } catch (fileErr) {
      //     console.error(`Failed to process file ${snapshotFile}:`, fileErr);
      //   }

      //   // Add delay between files
      //   await new Promise((resolve) => setTimeout(resolve, 1000));
      // }
      //Test//
      try {
        const result = await this.processNetworkTraffic();
        console.log(result);
      } catch (fileErr) {
        console.error(`Failed to process`, fileErr);
      }
      // device.on("EdgeJoinAccepted",() =>
      //             console.log(`[++++] Now You can send network traffic for ${device.id}!!!`),
      //             this.emit("Traffic")
                    
      //           );
           
      // await new Promise((resolve) => setTimeout(resolve, 1000));


      this.packetForwarder.stopPulling();
      console.log("Experiment completed.");

    } catch (err) {
      console.error("Critical error during experiment execution:", err);
    }
  };

};

module.exports = Experiment3;
