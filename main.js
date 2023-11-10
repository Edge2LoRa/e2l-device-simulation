const { packetGenerator } = require('./packetGenerator');
const { promisify } = require('util');
const fs = require('fs');
const sleep = promisify(setTimeout);
const dgram = require('dgram');
const { getRandomValues } = require('crypto');
const FCnt = 1 //or incremental

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


const sendPacketToAllGWs = (packet, socket_arrays) => {
    for (const socket of socket_arrays) {
        if (socket) {
            socket.send(packet, 0, packet.length);
        } else {
            console.error("Invalid socket in the array:", socket);
        }
    }
};


function simulateDevice(DevAddr, AppSKey, NwkSKey, FPort, FCnt, sleepTimer, nPackets, frameLoss, socket_arrays) {
    return new Promise(async (resolve, reject) => {
        await sleep(Math.floor(Math.random() * 5 ) + 5)
        while( FCnt  < nPackets) {
            const packet = packetGenerator(DevAddr, AppSKey, NwkSKey, FPort, FCnt);
            // Generate a random number between 0 and 9
            const randomValue = Math.floor(Math.random() * 10);
            // Send the packet if randomValue is less than 8, discard otherwise
            if (randomValue < frameLoss) {
                sendPacketToAllGWs(packet, socket_arrays);
                console.log(`Packet sent with DevAddr: ${DevAddr}, FCnt: ${FCnt}`)
            }
            FCnt = FCnt + 1
            await sleep(sleepTimer); 
        }
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
    const deviceNumber = experiment.deviceNumber;
    const minPacket = experiment.minPacket;
    const maxPacket = experiment.maxPacket;
    const frameLoss = experiment.frameLoss;
    const deviceList = experiment.deviceList;
    // Read the JSON file containing device information
    const deviceData = JSON.parse(fs.readFileSync(deviceList));
    let promise_socket_arrays = [];
    for (const gateway of gatewayData.gateways) {
        promise_socket_arrays.push(socketCreator(gateway.host, gateway.port))
    }
    Promise.all(promise_socket_arrays).then((socket_arrays) => {
        let promise_device_arrays = []
        for(const index in deviceData) {
            if (index >= deviceNumber){
                break;
            }
            const device = deviceData[index];
            const DevAddr = device.session.dev_addr;
            const AppSKey = device.session.keys.app_s_key.key;
            const NwkSKey = device.session.keys.f_nwk_s_int_key.key;
            //ratio used is legacy/edge, it means 1 leagacy every n edge devices
            currentRatio = 0;
            if (currentRatio === ratio) {
                FPort = 2 //legacy
                currentRatio = 0
            }else{
                FPort = 4 //edge devo rimette 4 poi
                currentRatio ++
            }
            // Generate a random number between FCnt and FCnt + 10
            const nPackets = Math.floor(Math.random() * (maxPacket - minPacket)) + minPacket;
            promise_device_arrays.push(simulateDevice(DevAddr, AppSKey, NwkSKey, FPort, FCnt, sleepTimer, nPackets, frameLoss, socket_arrays))
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
