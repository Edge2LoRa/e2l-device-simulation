const dgram = require("dgram");
const crypto = require("crypto");
const EventEmitter = require('events');


class PacketForwarder extends EventEmitter {
  constructor(id, host, port) {
    super();
    this.gwEui = Buffer.from(id, "hex");
    this.host = host;
    this.port = port;
    this.socket = dgram.createSocket("udp4");
    this.emitter = new EventEmitter();

    this.MESSAGE_TYPES = {
      PUSH_ACK: 0x01,
      PULL_ACK: 0x04,
      DOWNLINK: 0x03
    };

    this.pullInterval = null;
  }
  initListeners() {
    this.socket.on("message", (msg) => {
      const type = msg[3];

      switch (type) {
        case this.MESSAGE_TYPES.PUSH_ACK:
          this.emitter.emit("push_ack");
          break;
        case this.MESSAGE_TYPES.PULL_ACK:
          this.emitter.emit("pull_ack");
          break;
        case this.MESSAGE_TYPES.DOWNLINK:
          this.emitter.emit("downlink", msg);
          break;
      }
    });

    this.emitter.on("push_ack", () => console.log("[*] PUSH_ACK received"));
    this.emitter.on("pull_ack", () => console.log("[*] PULL_ACK received"));
    this.emitter.on("downlink", (msg) => this.handleDownlink(msg));

    this.startPulling(); 
  }

  startPulling() {
    if (this.pullInterval) return;

    this.pullInterval = setInterval(() => {
      this.sendPullData();
    }, 10000);
  }
  stopPulling() {
    if (!this.pullInterval) return;

    clearInterval(this.pullInterval);
    this.pullInterval = null;
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
      console.log(jsonStr);
      if (data.txpk && data.txpk.data) {
        const phyPayload = Buffer.from(data.txpk.data, "base64");
        console.log("[↓] JOIN ACCEPT RECEIVED");

        this.stopPulling();
        // Process payload
        this.handleJoinAccept(phyPayload);
      }
    } catch (err) {
      console.error("[X] Downlink parse error:", err.message);
    }
  }
  handleJoinAccept(payload) {
    console.log("Handling join accept", payload);
  }
  encodeUplink= async(phyPayload, gwId) => {
    const gwBuf = Buffer.from(gwId,'hex');
    const rxpk = {
      rxpk: [{
        tmst: Math.floor(Math.random() * 0xffffffff), 
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
    this.socket.send(phyPayload, this.port, this.host, (err) => {
      if (err) {
        console.error("[!] UDP send error:", err);
      } else {
        console.log("[↑] Uplink sent");
      }
    });
  }
}

module.exports = PacketForwarder;
