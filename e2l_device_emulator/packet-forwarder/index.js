const dgram = require("dgram");
const crypto = require("crypto");
const EventEmitter = require('events');
const lora_packet = require('lora-packet');
const Device = require("../device");
const { Console } = require("console");


class PacketForwarder extends EventEmitter {
  constructor(id, host, port) {
    super();
    this.gwEui = Buffer.from(id, "hex");
    this.host = host;
    this.port = port;
    this.socket = dgram.createSocket("udp4");
    this._joinAcceptHandler = null;
    this.emitter = new EventEmitter();

    this.MESSAGE_TYPES = {
      PUSH_DATA: 0x00,//Join-request
      PUSH_ACK: 0x01,//Join-accept
      PULL_DATA:0x02,//Unconfirmed Data Up
      PULL_RESP: 0x03,//Unconfirmed Data Down
      PULL_ACK: 0x04,//Confirmed Data Up 
      TX_ACK: 0x05//Confirmed Data Down
    };

    this.pullInterval = null;
    
  }
  registerJoinAcceptHandler(handler) {
    this._joinAcceptHandler = handler;
  }
  initListeners() {
    this.socket.on("message", (msg) => {
      const type = msg[3];

      switch (type) {
        case this.MESSAGE_TYPES.PUSH_ACK:
          console.log("PUSH_ACK received!");
          break;

        case this.MESSAGE_TYPES.PULL_ACK:
          console.log("PULL_ACK received!");
          break;

        case this.MESSAGE_TYPES.PULL_RESP:
          this.handlePullResp(msg);
          break;
        case this.MESSAGE_TYPES.TX_ACK:
          console.log("Handle Edge Join Request!!");
          break;
      }
    });
    
    this.on("push_ack", () =>
      console.log("[*] PUSH_ACK received")
    );

    this.on("pull_ack", () =>
      console.log("[*] PULL_ACK received")
    );

    this.startPulling();

    this.on("downlink", ({ phyPayload, txpk }) => {
      this.emit("raw_downlink", { phyPayload, txpk });
    });
    this.on("edge_join_forward",async (packet, gw_id)=>{
      const udpPacket = await this.encodeUplink(packet, null, gw_id);
      this.sendUplink(udpPacket);
    });
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
    // console.log("[→] Sent PULL_DATA (keep-alive)");
  }
  encodeUplink= async(phyPayload, options=null, gwId) => {
    const gwBuf = Buffer.from(gwId,'hex');
    let rxpk;
    if(options){
      rxpk = {
        rxpk: [{
          tmst: Math.floor(Math.random() * 0xffffffff), 
          chan: 2,
          freq: options.freq || 868.1,
          stat: options.stat || 1,
          modu: "LORA",
          datr: options.spreadingFactor+"BW125",
          codr: "4/5",
          lsnr: options.lsnr || 7.5,
          rssi: options.rssi || -35,
          size: phyPayload.length,
          data: phyPayload.toString("base64")
        }]
      };
    }else{
       rxpk = {
        rxpk: [{
          tmst: Math.floor(Math.random() * 0xffffffff), 
          chan: 0,
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
    }
    
    const token = crypto.randomBytes(2);

    const header = Buffer.concat([
      Buffer.from([0x02]), 
      token,
      Buffer.from([0x00]), 
      gwBuf
    ]);
    return Buffer.concat([header, Buffer.from(JSON.stringify(rxpk))]);
  }

  sendUplink(phyPayload) {
    console.log(phyPayload);
    this.socket.send(phyPayload, this.port, this.host, (err) => {
      if (err) {
        console.error("[!] UDP send error:", err);
      } else {
        console.log("[↑] Uplink sent");
      }
    });
  }
  handlePullResp(msg) {
    try {
      const jsonStr = msg.subarray(4).toString();
      const payload = JSON.parse(jsonStr);

      if (!payload.txpk?.data) return;

      const phyPayload = Buffer.from(payload.txpk.data, "base64");

      // Emit generic downlink for anyone who wants it
      this.emit("downlink", { phyPayload, txpk: payload.txpk });

      // Call the optional JoinAccept handler if registered
      if (this._joinAcceptHandler) {
        this._joinAcceptHandler(phyPayload);
      }

      this.sendUdpTxAck(msg.subarray(0, 4)); 

      // B. Satisfy your Code (Logic)
      // Trigger the next step in your script
      this.emit("tx_ack");

    } catch (err) {
      console.error("Failed to parse PULL_RESP:", err);
    }
  }
  
  sendUdpTxAck(pullRespHeader) {
    const payloadObj = {
      txpk_ack: {
        error: "NONE", // signals success
      },
    };
    const payloadBuffer = Buffer.from(JSON.stringify(payloadObj));

    // 4 bytes (Header) + 8 bytes (Gateway MAC) + Payload Length
    const bufferSize = 4 + 8 + payloadBuffer.length;
    const buff = Buffer.alloc(bufferSize);

    // Construct the Header
    buff[0] = pullRespHeader[0]; // Protocol Version (Keep same as request)
    buff[1] = pullRespHeader[1]; // Token Byte 1 (Must match request)
    buff[2] = pullRespHeader[2]; // Token Byte 2 (Must match request)
    buff[3] = 0x05; // Packet Identifier: 0x05 = TX_ACK
    
    if (this.gwEui && this.gwEui.length === 8) {
      this.gwEui.copy(buff, 4);
    } else {
        console.warn("Gateway EUI missing or invalid length");
    }

    payloadBuffer.copy(buff, 12);
    
    // Note: Use the same port/host that you communicate with normally
    this.socket.send(buff, 0, buff.length, this.port, this.host, (err) => {
      if (err) {
        console.error("[-] Error sending TX_ACK:", err);
      } else {
        console.log("[*] TX_ACK sent to server (Token matches PULL_RESP).");
      }
    });


  }


}

module.exports = PacketForwarder;
