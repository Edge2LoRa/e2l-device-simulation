const lora_packet = require("lora-packet");

const Device = class {
  constructor(edge = False) {
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

  createLoRaPacket = (payload, FCnt) => {
    const constructedPacket = lora_packet.fromFields(
      {
        FPort: this.FPort, //FPort = 4 Device edge / FPort = 2 Device Legacy
        MType: "Unconfirmed Data Up",
        DevAddr: Buffer.from(this.DevAddr, "hex"),
        FCtrl: {
          ADR: false,
          ACK: false,
          ADRACKReq: false,
          FPending: false,
        },
        FCnt: FCnt, //counter
        payload: payload, // Replace with your payload
      },
      Buffer.from(this.AppSKey, "hex"),
      Buffer.from(this.NwkSKey, "hex")
    );
    return constructedPacket.getPHYPayload().toString("base64");
  };

  sendLoRaPacket = (packetInfo, frameLoss, packetForwarder) => {
    return packetForwarder.send(
      (packetInfo = packetInfo),
      (frameLoss = frameLoss)
    );
  };
};

export default Device;
