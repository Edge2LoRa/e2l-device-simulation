const { packetGeneratorReal } = require('./packetGeneratorReal');
const { promisify } = require('util');
const fs = require('fs');
const sleep = promisify(setTimeout);
const dgram = require('dgram');
const { getRandomValues } = require('crypto');
const FCnt = 1 //Frame Counter Initialisation
let activeDevices = 0;

const socketCreator = (host, port) => {
    return new Promise((resolve, reject) => {
        if (port > 0 && port < 65536) {
            const socket = dgram.createSocket('udp4');
            socket.connect(Number(port), host, (err) => {
                if(err){
                    console.log(err)
                    return reject(err)
                } else {
                    return resolve(socket)
                }
            });
        } else {
            return reject(`Invalid port number: ${port}`);
        }
    })
}
function calculateLoss() {
    const P = 20; // Packet size in byte

    // every ED generates packets with a source rate of s pkt/s
    const s = 1 / 90; // [pkt/sec]
    // nodes number
    const N = activeDevices;

    const SF_array = [7, 8, 9, 10, 11, 12];
    // selected spreading factor
    const SF_index = 0;
    // bandwidth in hertz
    const BW = 125000;
    // coding rate CR = 4=(4 + RDD)
    // with the number of redundancy bits RDD = 1; · · · ; 4.
    const CR = 1;
    // time interval required for transmitting a packet
    const ToA = 0.0566; // toa_calc(SF_array[SF_index], BW, P, CR);

    let G = N * s * ToA; // normalized offered load % traffico offerto normalizzato

    // Number of query GW
    const M = 2;

    G = G / M;

    const eta = 2.9;
    const sir = 4; // 2.7; // 0.5; 2.7-->6dB CC in lorasim
    const alpha = Math.pow(10, sir / 10 / eta);

    const Sc = (1 / (2 * Math.pow(alpha, 2))) * (1 - Math.exp(-2 * G)) + G * (1 - 1 / Math.pow(alpha, 2)) * Math.exp(-2 * G);

    const DER_CC = M * (Sc / G / M); // data extraction rate
    const loss = (1 - DER_CC) * 100; // perdita in percentuale
    return loss;
  }
  

  const sendPacketToAllGWs = (packet, frameLoss, socket_arrays) => {
    for (const socket of socket_arrays) {
        if (socket) {
            const randomValue = Math.floor(Math.random() * 100);
            if (randomValue > frameLoss) {
                socket.send(packet, 0, packet.length);
            }
        } else {
            console.error("Invalid socket in the array:", socket);
        }
    }
};


function simulateDevice(DevAddr, AppSKey, NwkSKey, FPort, FCnt, sleepTimer, nPackets, socket_arrays, payload, deviceList) {
    return new Promise(async (resolve, reject) => {
        // Load and parse the JSON file
        const deviceData = JSON.parse(fs.readFileSync(deviceList));

        // Find the device in the JSON data that matches DevAddr
        const device = deviceData.find(d => d.deviceid === DevAddr);
        if (!device) {
            console.log(`No device found with deviceid ${DevAddr}. Simulation ends for this device.`);
            return resolve("Device not found");
        }

        activeDevices++; // Increment activeDevices when simulating a device
        await sleep(Math.floor(Math.random() * 5 ) + 5)
        while(FCnt < nPackets) {
            const packet = packetGeneratorReal(DevAddr, AppSKey, NwkSKey, FPort, FCnt, device.timestamp, device.frequency, device.data_rate, device.coding_rate,device.gtw_channel, device.gtw_rssi, device.gtw_snr,device.battery, payload);
            const frameLoss = calculateLoss(); // Calculate frame loss using activeDevices
            console.log(frameLoss);    
            sendPacketToAllGWs(packet, frameLoss, socket_arrays);
            console.log(`Packet sent with DevAddr: ${DevAddr}, FCnt: ${FCnt}, Devices: ${activeDevices}`)
            FCnt = FCnt + 1
            await sleep(sleepTimer); 
        }
        activeDevices--; // Decrement activeDevices when simulation is done
        return resolve("Everything Alright");
    });
}

function main(){
    // Read the JSON file containing gateway information
    const gatewayData = JSON.parse(fs.readFileSync('experiment_files/gateways.json'));
    // Read the JSON file containing experiment information
    const experimentData = JSON.parse(fs.readFileSync('experiment_files/experiment.json'));
    const experiment = experimentData.experiment[0]; // Assuming there's only one experiment in the array
    const ratio = experiment.ratio;
    const sleepTimer = experiment.sleepTimer;
    const deviceTimer = experiment.deviceTimer;
    const deviceNumber = experiment.deviceNumber;
    const minPacket = experiment.minPacket;
    const maxPacket = experiment.maxPacket;
    const deviceList = experiment.deviceList;
    // Read the JSON file containing device information
    const deviceData = JSON.parse(fs.readFileSync(deviceList));
    let promise_socket_arrays = [];
    for (const gateway of gatewayData.gateways) {
        promise_socket_arrays.push(socketCreator(gateway.host, gateway.port))
    }
    Promise.all(promise_socket_arrays).then(async (socket_arrays) => {
        let promise_device_arrays = []
        currentRatio = 0;
        const processedDevices = new Set();
        for (const index in deviceData) {
            
            const device = deviceData[index];
            if (processedDevices.has(device.deviceid)) {
                continue; // Skip if this deviceid has already been processed
            }
    
            const DevAddr = device.deviceid;
            const AppSKey = "18709C1192FEAA38F477BF6B0A6CB7E5";
            const NwkSKey = "3FCAD3200F0FA7AA500A67AE5A72B1B0";
            const payload = device.soil_hum;
    
            // Ratio used is legacy/edge, it means 1 legacy every n edge devices
            if (currentRatio === ratio) {
                FPort = 2; // Legacy
                currentRatio = 0;
            } else {
                FPort = 4; // Edge
                currentRatio++;
            }
            const nPackets = Math.floor(Math.random() * (maxPacket - minPacket)) + minPacket;
            //await sleep(deviceTimer);
            promise_device_arrays.push(simulateDevice(DevAddr, AppSKey, NwkSKey, FPort, FCnt, sleepTimer, nPackets, socket_arrays, payload, deviceList));
            processedDevices.add(device.deviceid);
        }
        Promise.all(promise_device_arrays).then(() => {
            console.log("Experiment Ended Successfully")
        }).catch((err) => {
            console.error(err)
        }).finally(() => {
            for(socket of socket_arrays){
                socket.disconnect()
            }
        })
    })
    
}
main();
