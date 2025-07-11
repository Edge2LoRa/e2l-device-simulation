const lora_packet = require("lora-packet");
const crypto = require('crypto');
const packet_forwarder = require('../gateway');



const Device = class {
  constructor(id, edge = false) {
    this.id = id;
    this.edge = edge;
    this.FPort = this.edge == true ? 4 : 2;
  }

  isEdge() {
    return this.edge;
  }

  abpActivation = (DevAddr, NwkSKey, AppSKey) => {
    this.DevAddr = DevAddr;
    this.NwkSKey = NwkSKey;
    this.AppSKey = AppSKey;
  };

  toPaddedHexString = (num, length) => {
    // Convert the number to its hexadecimal string representation
    let hexString = num.toString(16);

    // Pad with leading zeros if the string is shorter than the desired length
    return hexString.padStart(length, '0');
  }

  //construct LoRa packet 
  createLoRaPacket(item){

      const AppSKey = crypto.randomBytes(16).toString('hex');
      const NwkSKey = crypto.randomBytes(16).toString('hex');
      const fc = item.framecounter;
      let  packets = [];
      
      // To covert DevAddr as its acceptable--paddinga and base-16       
      const devAddrHex = this.toPaddedHexString(item.dev_addr, 8);
      const constructedPacket = lora_packet.fromFields(
        {
          
          FPort: this.FPort, //FPort = 4 Device edge / FPort = 2 Device Legacy
          MType: "Unconfirmed Data Up",
          DevAddr: Buffer.from(devAddrHex, "hex"),
          FCtrl: {
            ADR: false,
            ACK: false,
            ADRACKReq: false,
            FPending: false,
          },
          FCnt: this.fc, //counter
          payload: "test", // Replace with your payload
        },
        Buffer.from(AppSKey, "hex"),
        Buffer.from(NwkSKey, "hex")
      );
  
    const packetbase64= constructedPacket.getPHYPayload().toString("base64");
    return packetbase64;
  }
  
  sendLoRaPacket = (packetInfo, frameLoss, gatewayInfo, forwarder_info) => {
    const metadata = packet_forwarder.encodePacket(packetInfo, frameLoss, gatewayInfo);
    return packet_forwarder.sendPacket(metadata, 0, forwarder_info);
  };
};

module.exports = new Device();