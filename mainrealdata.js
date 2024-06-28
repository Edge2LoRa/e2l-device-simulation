const { packetGeneratorReal } = require("./packetGeneratorReal");
const { promisify } = require("util");
const fs = require("fs");
const sleep = promisify(setTimeout);
const dgram = require("dgram");
const { getRandomValues } = require("crypto");
const FCnt = 1; //Frame Counter Initialisation
let activeDevices = 0;

const socketCreator = (host, port) => {
  return new Promise((resolve, reject) => {
    if (port > 0 && port < 65536) {
      const socket = dgram.createSocket("udp4");
      socket.connect(Number(port), host, (err) => {
        if (err) {
          console.log(err);
          return reject(err);
        } else {
          return resolve(socket);
        }
      });
    } else {
      return reject(`Invalid port number: ${port}`);
    }
  });
};
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

  const Sc =
    (1 / (2 * Math.pow(alpha, 2))) * (1 - Math.exp(-2 * G)) +
    G * (1 - 1 / Math.pow(alpha, 2)) * Math.exp(-2 * G);

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

function simulateDevice(
  DevAddr,
  AppSKey,
  NwkSKey,
  FPort,
  FCnt,
  sleepTimer,
  nPackets,
  frameLoss_value,
  socket_arrays,
  packetsToSend
) {
  return new Promise(async (resolve, reject) => {
    activeDevices++; // Increment activeDevices when simulating a device

    for (const packetData of packetsToSend) {
      if (FCnt >= nPackets) {
        break;
      }
      //encode the payload
      const array = [
        parseFloat(packetData.soil_temp),
        parseFloat(packetData.soil_hum),
      ];
      const payload = Buffer.from(JSON.stringify(array));
      const packet = packetGeneratorReal(
        DevAddr,
        AppSKey,
        NwkSKey,
        FPort,
        FCnt,
        packetData.data_rate,
        packetData.coding_rate,
        packetData.gtw_channel,
        packetData.gtw_rssi,
        packetData.gtw_snr,
        payload
      );

      const frameLoss =
        frameLoss_value >= 0 ? frameLoss_value : calculateLoss();

      sendPacketToAllGWs(packet, frameLoss, socket_arrays);
      console.log(
        `Packet sent with DevAddr: ${DevAddr}, FCnt: ${FCnt}, Devices: ${activeDevices}`
      );

      FCnt++; // Increment FCnt for the next packet
      await sleep(sleepTimer);
    }

    activeDevices--; // Decrement activeDevices when simulation is done
    return resolve("Everything Alright");
  });
}

function main() {
  // Read the JSON file containing gateway information
  const gatewayData = JSON.parse(
    fs.readFileSync("experiment_files/gateways.json")
  );
  // Read the JSON file containing experiment information
  const experimentData = JSON.parse(
    fs.readFileSync("experiment_files/experiment.json")
  );
  const experiment = experimentData.experiment[0]; // Assuming there's only one experiment in the array
  const ratio = experiment.ratio;
  const deviceNumber = experiment.deviceNumber;
  const sleepTimer = experiment.sleepTimer;
  const deviceTimer = experiment.deviceTimer;
  const minPacket = experiment.minPacket;
  const maxPacket = experiment.maxPacket;
  const packetDataFilepath = experiment.packetData;
  const frameLoss = experiment.frameLoss;
  // Read the JSON file containing device information
  const packetData = JSON.parse(fs.readFileSync(packetDataFilepath));
  const deviceListpath = experiment.deviceList;
  const deviceList = JSON.parse(fs.readFileSync(deviceListpath));

  let formattedPacketData = [];
  let processedDeviceId = [];
  for (const packetInfo of packetData) {
    if (!processedDeviceId.includes(packetInfo.deviceid)) {
      devicePackets = [];
      for (const packetInfo2 of packetData) {
        if (packetInfo2.deviceid === packetInfo.deviceid) {
          devicePackets.push(packetInfo2);
        }
      }
      formattedPacketData.push(devicePackets);
      processedDeviceId.push(packetInfo.deviceid);
    }
  }

  let promise_socket_arrays = [];
  for (const gateway of gatewayData.gateways) {
    promise_socket_arrays.push(socketCreator(gateway.host, gateway.port));
  }
  Promise.all(promise_socket_arrays).then(async (socket_arrays) => {
    let promise_device_arrays = [];
    currentRatio = 0;
    for (const index in deviceList) {
      if (index > deviceNumber) {
        break;
      }
      const deviceInfo = deviceList[index];

      const DevAddr = deviceInfo.session.dev_addr;
      const AppSKey = deviceInfo.session.keys.app_s_key.key;
      const NwkSKey = deviceInfo.session.keys.f_nwk_s_int_key.key;
      //const payload = device.soil_temp;
      const packetsToSend =
        formattedPacketData[index % formattedPacketData.length];

      // Ratio used is legacy/edge, it means 1 legacy every n edge devices
      if (currentRatio === ratio) {
        FPort = 2; // Legacy
        currentRatio = 0;
        console.log("CREATING LEGACY DEVICE");
      } else {
        FPort = 4; // Edge
        currentRatio++;
        console.log("CREATING EDGE DEVICE");
      }
      const nPackets =
        Math.floor(Math.random() * (maxPacket - minPacket)) + minPacket;

      promise_device_arrays.push(
        simulateDevice(
          DevAddr,
          AppSKey,
          NwkSKey,
          FPort,
          FCnt,
          sleepTimer,
          nPackets,
          frameLoss,
          socket_arrays,
          packetsToSend
        )
      );
      await sleep(deviceTimer);
    }
    Promise.all(promise_device_arrays)
      .then(() => {
        console.log("Experiment Ended Successfully");
      })
      .catch((err) => {
        console.error(err);
      })
      .finally(() => {
        for (socket of socket_arrays) {
          socket.disconnect();
        }
      });
  });
}

// START MAIN
main();
