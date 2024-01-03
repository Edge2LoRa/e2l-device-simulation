const { packetGenerator } = require('./packetGenerator');
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
                }else{
                    return resolve(socket)
                }});
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
  

let gatewayCounters = []; // Defined outside the function
let discardedPacketsCount = 0;
let successfullySentToAllGatewaysCount = 0; 

const sendPacketToAllGWs = (packet, frameLoss, socket_arrays) => {
    // Initialize the gatewayCounters array with zeros if it's the first call
    if (gatewayCounters.length === 0) {
        gatewayCounters = new Array(socket_arrays.length).fill(0);
    }

    let packetSentToAllGateways = true; // Flag to check if the packet is sent to all gateways

    for (let i = 0; i < socket_arrays.length; i++) {
        const socket = socket_arrays[i];
        if (socket) {
            const randomValue = Math.floor(Math.random() * 100);
            if (randomValue > frameLoss) {
                socket.send(packet, 0, packet.length);
                gatewayCounters[i]++;
            } else {
                discardedPacketsCount++;
                packetSentToAllGateways = false; // Packet not sent to this gateway
            }
        } else {
            console.error("Invalid socket in the array:", socket);
            packetSentToAllGateways = false; // Invalid socket treated as a failed send
        }
    }

    // Increment if the packet was sent to all gateways in this iteration
    if (packetSentToAllGateways) {
        successfullySentToAllGatewaysCount++;
    }

    // Logging
    gatewayCounters.forEach((count, index) => {
        console.log(`Gateway ${index + 1} sent packets count: ${count}`);
    });
    console.log(`Total discarded packets count: ${discardedPacketsCount}`);
    console.log(`Packets successfully sent to all gateways count: ${successfullySentToAllGatewaysCount}`);
};

  







function simulateDevice(DevAddr, AppSKey, NwkSKey, FPort, FCnt, sleepTimer, nPackets, socket_arrays) {
    return new Promise(async (resolve, reject) => {
        activeDevices++; // Increment activeDevices when simulating a device
        await sleep(Math.floor(Math.random() * 5 ) + 5)
        while( FCnt  < nPackets) {
            const packet = packetGenerator(DevAddr, AppSKey, NwkSKey, FPort, FCnt);
            const frameLoss = calculateLoss(); // Calculate frame loss using activeDevices
            console.log(frameLoss);    
            sendPacketToAllGWs(packet,frameLoss, socket_arrays);
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
        for(const index in deviceData) {
            if (index >= deviceNumber){
                break;
            }
            const device = deviceData[index];
            const DevAddr = device.session.dev_addr;
            const AppSKey = device.session.keys.app_s_key.key;
            const NwkSKey = device.session.keys.f_nwk_s_int_key.key;
            //ratio used is legacy/edge, it means 1 leagacy every n edge devices
            if (currentRatio === ratio) {
                FPort = 2 //legacy
                currentRatio = 0
            }else{
                FPort = 4 //edge 
                currentRatio ++
            }
            const nPackets = Math.floor(Math.random() * (maxPacket - minPacket)) + minPacket;
            await sleep(deviceTimer);
            promise_device_arrays.push(simulateDevice(DevAddr, AppSKey, NwkSKey, FPort, FCnt, sleepTimer, nPackets, socket_arrays))
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