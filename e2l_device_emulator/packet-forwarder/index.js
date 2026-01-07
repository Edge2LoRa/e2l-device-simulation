const dgram = require("dgram");
const crypto = require("crypto");
const EventEmitter = require("events");

class PacketForwarder extends EventEmitter {
  constructor(id, host, port) {
    super();
    this.host = host;
    this.port = port;
    this.socket = dgram.createSocket("udp4");


    this.gwEui = Buffer.from(id, "hex");

    this.socket.on("message", (msg) => {
      const type = msg[3];

      if (type === 0x01) {
        console.log("[*] PUSH_ACK received");
      } else if (type === 0x04) {
        console.log("[*] PULL_ACK received");
      } else if (type === 0x03) {
        this.handleDownlink(msg);
      }
    });

    this.pullInterval = setInterval(() => {
      this.sendPullData();
    }, 10000);
  }

  sendPullData() {
    const token = crypto.randomBytes(2);
    const pullPacket = Buffer.concat([
      Buffer.from([0x02]), 
      token,
      Buffer.from([0x02]), 
      this.gwEui
    ]);

    this.socket.send(pullPacket, this.port, this.host);
    console.log("[→] Sent PULL_DATA (keep-alive)");
  }

  handleDownlink(msg) {
    try {
      const jsonStr = msg.subarray(4).toString();
      const data = JSON.parse(jsonStr);

      if (data.txpk && data.txpk.data) {
        const phyPayload = Buffer.from(data.txpk.data, "base64");
        console.log("[↓] JOIN ACCEPT RECEIVED");
        this.emit("downlink", phyPayload);
      }
    } catch (err) {
      console.error("[X] Downlink parse error:", err.message);
    }
  }

  encodeUplink(phyPayload,gwEui) {
    const rxpk = {
      rxpk: [{
        tmst: Math.floor(Math.random() * 0xffffffff), // fake concentrator counter
        chan: 0,
        rfch: 0,
        freq: 868.1,
        stat: 1,
        modu: "LORA",
        datr: "SF7BW125",
        codr: "4/5",
        lsnr: 7.5,
        rssi: -35,
        size: phyPayload.length,
        data: phyPayload.toString("base64")
      }]
    };

    const token = crypto.randomBytes(2);

    const header = Buffer.concat([
      Buffer.from([0x02]), 
      token,
      Buffer.from([0x00]), 
      this.gwEui
    ]);

    return Buffer.concat([header, Buffer.from(JSON.stringify(rxpk))]);
  }

  sendUplink(phyPayload) {
    const packet = this.encodeUplink(phyPayload);

    this.socket.send(packet, this.port, this.host, (err) => {
      if (err) {
        console.error("[!] UDP send error:", err);
      } else {
        console.log("[↑] Uplink sent");
      }
    });
  }
}

module.exports = PacketForwarder;
