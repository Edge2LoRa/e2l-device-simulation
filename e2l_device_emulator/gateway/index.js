const dgram = require("dgram");
const fs = require('fs');
const csv = require('csv-parser');



class PacketForwarder {
  constructor(id, host, port) {
    this.id = id;
    this.gatewayList=[]
    this.host = 'localhost';
    this.port = 9000;
    this.socket = dgram.createSocket("udp4");
    this.socket.connect(this.port, this.host, (err) => {

    });
  }
  
  async readGwForwards(gw_folder) {
    return new Promise((resolve, reject) => {
      const gw_forwards = [];
      fs.createReadStream('./e2l_device_emulator/experiments/roma-2-gw/gw-conf/gw-roma-2_ns3.csv')
        .pipe(csv({ separator: ';' }))
        .on('data', (row) => {
          // Push the desired data instead of overwriting
          if (row.X && row.Y && row.Z) {
            gw_forwards.push([row.X, row.Y, row.Z]);
            console.log('JSON output:', JSON.stringify(gw_forwards, null, 2));
          }
        })
        .on('end', () => {
          console.log('Finished reading file');
          resolve(gw_forwards); // <- Resolve here
        })
        .on('error', (err) => {
          console.error('Error reading file:', err);
          reject(err); // <- Reject if there's an error
        });
    });
  }
  // CREATE PACKET FORWARDERS
  async GwData(mac_address,packet,gw_folder ){
    const gatewayList = await this.readGwForwards(gw_folder);

    this.packetForwarders = {};

    let found = false;

    for (const gatewayData of gatewayList) {
      const gateway_id = gatewayData[0]; 
      const host = gatewayData[1];
      const port = gatewayData[2];

        if (mac_address === gateway_id) {
          const packetForwarder = new PacketForwarder(gateway_id, host, port);
          this.packetForwarders[gateway_id] = packetForwarder;

          found = true;

          // You can return here or keep processing
          return { gateway_id, host, port };
        }
      }

      if (!found) {
        console.log('There is no gateway by this mac_address!');
        return null;
      }
  }


  sendPacket = (packet, frameLoss, forwarder_info) => {
      return new Promise((resolve, reject) => {
      const socket = dgram.createSocket("udp4");
      socket.connect(forwarder_info.port, forwarder_info.host, (err) => {
        if (err) {
          console.log(err);
          return reject(err);
        } else {
          socket.send(packet, 0, packet.length, (err) => {
            if (err) {
              console.log(err);
              return reject(err);
            } else {
              socket.close();
              return resolve();
            }
          });
        }
      });
      this.socket.send(packet, 0, packet.length, (err) => {
            if (err) {
              console.log(err);
              return reject(err);
            } else {
              return resolve();
            }
          });
    });
    }
  encodePacket = (base64Packet, frameLoss, gatewayInfo) => {
    const now = new Date();
    const size = base64Packet.length;

    // TODO: GET FROM DATASET
    const gtw_channel = gatewayInfo.frequency;
    const gtw_rssi = gatewayInfo.rssi;
    const gtw_snr = 9.2;
    const data_rate = "SF7BW125";
    const coding_rate = gatewayInfo.cr;

    let jsonUDP = {
      rxpk: [
        {
          time: now.toISOString(),
          tmst: parseInt(now.getTime() / 1000),
          chan: Number(gtw_channel),
          rfch: 0,
          freq: 868.1,
          stat: 1,
          modu: "LORA",
          datr: data_rate,
          codr: coding_rate,
          lsnr: Number(gtw_snr),
          rssi: Number(gtw_rssi),
          size: size,
          data: base64Packet,
        },
      ],
    };
    const jsonPacket = JSON.stringify(jsonUDP);
    //console.log(jsonPacket);
    /*headerPKTFWD[0] == PROTOCOL_VERSION == 2
    headerPKTFWD[1] == numero random
    headerPKTFWD[2] == numero random
    headerPKTFWD[3] == PKT_PUSH_DATA == 0
    headerPKTFWD[4] == net_mac_h = htonl((uint32_t)(0xFFFFFFFF & (lgwm>>32)));
    headerPKTFWD[8] == net_mac_l = htonl((uint32_t)(0xFFFFFFFF &  lgwm  ));
    lgwm == 0 Lora gateway MAC address
    */
    let headerPKTFWD = new Uint8Array([
      2, 45, 141, 0, 184, 39, 235, 255, 254, 230, 15, 44,
    ]);
    let enc = new TextEncoder();
    let json = enc.encode(jsonPacket);

    // Create a new array with the total length and merge all source arrays.
    let mergedArray = new Uint8Array(headerPKTFWD.length + json.length);
    mergedArray.set(headerPKTFWD, 0); // Copy headerPKTFWD to mergedArray at the beginning.
    mergedArray.set(json, headerPKTFWD.length); // Copy json to mergedArray after headerPKTFWD.
    return mergedArray;
  };
}

(async () => {
   try {
    const pf = new PacketForwarder();        
    const gwData = await pf.GwData(); 
  } catch (error) {
    console.error('Error while processing CSV:', error);
  }
})();

module.exports = new PacketForwarder;
