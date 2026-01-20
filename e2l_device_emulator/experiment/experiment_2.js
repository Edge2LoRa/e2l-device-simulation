const csv = require("@fast-csv/parse");
const fs = require("fs");
const path = require("path");
const Device = require("../device");
const PacketForwarder = require("../packet-forwarder");
const snr = require("./utils");
const { rejects } = require("assert");
const { type } = require('os');
const { Console } = require("console");


const Experiment2 = class {
  constructor(
    deviceList,
    deviceNumber,
    legacyEdgeRatio,
    gatewayList,
    packetDataFolder
  ) 
  {
    this.legacyEdgeRatio = legacyEdgeRatio;
    this.packetDataFolder = packetDataFolder;
    this.deviceList = deviceList;
    this.deviceNumber = deviceNumber;

    this.devices = {};
    this.pendingJoins = new Map();

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
  waitForJoinCompletion = async () => {
    return new Promise((resolve, reject) => {
      // Register the handler inside the Promise
      this.packetForwarder.registerJoinAcceptHandler((phyPayload) => {
        const mtype = (phyPayload[0] >> 5) & 0x07;
        if (mtype !== 0x01) return; // Ignore non-JoinAccept packets

        for (const [devNonceHex, device] of this.pendingJoins.entries()) {
          
          // CHECK: If this device successfully joins
          if (device.tryJoinAccept(phyPayload, devNonceHex)) {
            console.log(`[✓] JoinAccept matched for ${device.id}`);
            
            const { devAddr, nwkSKey, appSKey } = device.session;
            
            this.savejoindSession(
              device.id,
              devAddr,
              nwkSKey,
              appSKey
            );
            device.fCnt = 0;
            if(device.isEdge()){
              device.emit("edge_join_req");
            }
            this.pendingJoins.delete(devNonceHex);

            // UNBLOCK the process: This tells the await to proceed
            resolve(device.id); 
          }
        }
      });
    });
  };
  savejoindSession(device_id, devAddr, nwkSKey, appSKey) {
    console.log("Saving join session for", device_id);

    const absPath = path.resolve(
      './experiment_files/devices_preactivation/devices_no_session.json'
    );

    const raw = fs.readFileSync(absPath, "utf8");
    const devices = JSON.parse(raw);

    const device = devices.find(
      d => d.ids?.device_id === device_id || d.id === device_id
    );

    if (!device) {
      throw new Error(`Device ${device_id} not found in JSON file`);
    }

    device.session = {
      dev_addr: devAddr.toUpperCase(),
      keys: {
        f_nwk_s_int_key: { key: nwkSKey.toUpperCase() },
        app_s_key: { key: appSKey.toUpperCase() }
      }
    };

    fs.writeFileSync(absPath, JSON.stringify(devices, null, 2));
  }
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
          const version = deviceData.lorawan_version;
          //Sending Packet-step1
          const signedBuffer = await device.createJoinRequest(
            deviceData.ids.dev_eui,
            deviceData.ids.join_eui,
            deviceData.root_keys.app_key.key
          );
          if (version.includes("1_0")) { 
              // LoRaWAN 1.0.x uses AppKey for the Join Request MIC
              // const signedBuffer = await device.createJoinRequest(dev_eui, app_eui, AppKey);
              const devNonceHex = signedBuffer[1].toString("hex");
              pendingJoins.set(devNonceHex, device);
              //Sending Packet-step2
              const udpPacket = await packetForwarder.encodeUplink(signedBuffer[0], null, this.gwId);
              try {
                  //Sending Packet-step3
                  await packetForwarder.sendUplink(udpPacket);
                  // Store the device so we can process the Join Accept later
                  this.devices[device_id] = device; 
                  console.log(`[OTAA] Sent Join Request for ${device_id} (v1.0.x)`);
              } catch (err) {
                  console.error(`[ERR] Failed to send Join for ${device_id}:`, err);
              }
              
          }else if (version.includes("1_1")) {
              // LoRaWAN 1.1 requires NwkKey for Join MIC
              const NwkKey = deviceData.root_keys.nwk_key ? deviceData.root_keys.nwk_key.key : AppKey;
              console.log(`[OTAA] Preparing 1.1 Join for ${device_id} using NwkKey.`);
              
              // const signedBuffer = await device.createJoinRequest(dev_eui, app_eui, NwkKey);
              const udpPacket = await packetForwarder.encodeUplink(signedBuffer[0], this.gwId);
              
              await packetForwarder.sendUplink(udpPacket);
              this.devices[device_id] = device;
          }
        }else{
          console.log("handle devNonce!!");
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
            await packetForwarder
              .sendUplink(udpPacket);
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
    
    const snapshotFiles = fs.readdirSync(this.packetDataFolder);

    for (const snapshotFile of snapshotFiles) {
      console.log(`Processing ${snapshotFile}...`);
      
      // We use a nested try/catch here so one bad file doesn't stop the whole script
      try {
        const result = await this.processSnapshotFile(snapshotFile, this.deviceList);
        console.log(result);
      } catch (fileErr) {
        console.error(`Failed to process file ${snapshotFile}:`, fileErr);
      }

      // Add delay between files
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    console.log("Experiment completed.");

  } catch (err) {
    // This catches critical errors from processDevices OR waitForJoinCompletion
    console.error("Critical error during experiment execution:", err);
  }
};

};

module.exports = Experiment2;
