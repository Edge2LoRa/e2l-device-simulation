const { createECDH } = require('crypto');
const crypto = require("crypto");
const lora_packet = require("lora-packet");
const { AesCmac } = require('aes-cmac');


const Device = class {
  constructor(id, edge = False) {
    this.id = id;
    this.edge = edge;
    this.FPort = this.edge == true ? 4 : 2;
  }

  isEdge() {
    return this.edge;
  }
  generateCompressedPublicKey() {
        const ecdh = createECDH("prime256v1");
        ecdh.generateKeys();
  
        return {
          publicKeyCompressed: ecdh.getPublicKey(null, "compressed"), // 33 bytes
          privateKey: ecdh.getPrivateKey(),
        };
  };

  calculateJoinMIC= async (payload, appKeyHex) => {
      const key = Buffer.from(appKeyHex, 'hex');
      // MIC is calculated over MHDR | MACPayload
      const cmacInput = payload.getPHYPayload().subarray(0, -4);
      const aesCmac = new AesCmac(key);
      const fullCmac = await aesCmac.calculate(cmacInput);
      return Buffer.from(fullCmac).subarray(0, 4);
  }

  abpActivation = (DevAddr, NwkSKey, AppSKey) => {
    this.DevAddr = DevAddr;
    this.NwkSKey = NwkSKey;
    this.AppSKey = AppSKey;
  };
/*Create Over The Air Activation(OTAA) LoRaWAN 1.0.x
+---------------------------------------------------------------+--+
|                          PHYPayload                              | 
+-----------+----------------+----------------+---------+-------+--+
|   MHDR    |   AppEUI       |    DevEUI      | DevNonce|  MIC     |
|  (1 byte) |   (8 bytes)    |   (8 bytes)    |(2 bytes)|(4 bytes) |
+-----------+----------------+----------------+---------+-------+--+
*/
  createJoinRequest = async (DevEUI, AppEUI, AppKey) => {
    const devNonce = crypto.randomBytes(2);

    // 1. Create packet without a key (will have EEEEEEEE)
    const joinPacket = lora_packet.fromFields({
        MType: "Join Request",
        AppEUI: Buffer.from(AppEUI, "hex"),
        DevEUI: Buffer.from(DevEUI, "hex"),
        DevNonce: devNonce.reverse(),
    });

    // 2. Sign with manual MIC logic to ensure it's not EEEEEEEE
    const mic = await this.calculateJoinMIC(joinPacket, AppKey);
    
    // 3. Assemble final Buffer
    const phyPayload = Buffer.concat([
        joinPacket.getPHYPayload().subarray(0, -4), 
        mic
    ]);
   
    return phyPayload;
  };

  /***************************************************************************************
   * | "Unconfirmed Data Up" | DevAddr | FCtrl | FCnt | FPort | compressedPubKey  | AppSKey | NwkSKey |
  */
  createEdgeJoinRequest = (compressedPubKey, FCnt) => {
    const packet = lora_packet.fromFields(
      {
        MType: "Unconfirmed Data Up",
        DevAddr: Buffer.from(this.DevAddr, "hex"),
        FCtrl: {
          ADR: false,
          ACK: false,
          ADRACKReq: false,
          FPending: false,
        },
        FCnt: FCnt,
        FPort: 4, // Application port for edge key exchange
        payload: compressedPubKey, // 33 bytes
      },
      Buffer.from(this.AppSKey, "hex"),
      Buffer.from(this.NwkSKey, "hex")
    );
    return packet.getPHYPayload().toString("base64");
  };
  /***************************************************************************************
   * | "Unconfirmed Data Up" | DevAddr | FCtrl | FCnt | FPort | payload | AppSKey | NwkSKey |
  */
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
    console.log(this.DevAddr);
    return constructedPacket.getPHYPayload().toString("base64");
  };

  sendLoRaPacket = (packetInfo, frameLoss, packetForwarder) => {
    return packetForwarder.send(
      (packetInfo = packetInfo),
      (frameLoss = frameLoss)
    );
  };
};

module.exports = Device;
