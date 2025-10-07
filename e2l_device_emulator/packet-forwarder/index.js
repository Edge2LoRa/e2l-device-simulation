const dgram = require("dgram");
class PacketForwarder {
  constructor(id, host, port) {
    this.id = id;
    this.host = host;
    this.port = port;
  }

  sendPacket = (packet, frameLoss) => {
    return new Promise((resolve, reject) => {
      console.log("Sending packet to ", this.host, this.port);
      const socket = dgram.createSocket("udp4");
      socket.connect(this.port, this.host, (err) => {
        if (err) {
          console.log(err);
          return reject(err);
        } else {
          socket.send(packet, (err) => {
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
    });
  };

  encodePacket = (base64Packet, options = {}) => {
    const now = new Date();
    const size = base64Packet.length;

    const dataRate = options.spreadingFactor
      ? `SF${options.spreadingFactor}BW125`
      : "SF7BW125";

    let jsonUDP = {
      rxpk: [
        {
          time: now.toISOString(),
          tmst: parseInt(now.getTime() / 1000),
          chan: Number(options.channel || 7),
          rfch: 0,
          freq: options.frequency || 868.1,
          stat: options.stat || 1,
          modu: "LORA",
          datr: dataRate,
          codr: options.codingRate || "4/5",
          lsnr: Number(options.snr || 9.2),
          rssi: Number(options.rssi || -33),
          size: size,
          data: base64Packet,
        },
      ],
    };
    const jsonPacket = JSON.stringify(jsonUDP);
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

module.exports = PacketForwarder;
