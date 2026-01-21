const fs = require("fs");
const path = require("path");
const { createECDH } = require('crypto');
const crypto = require("crypto");
const lora_packet = require("lora-packet");
const { AesCmac } = require('aes-cmac');
const EventEmitter = require('events');
const PacketForwarder = require("../packet-forwarder");
const { hostname } = require("os");


class Device extends EventEmitter{
  constructor(id, edge = false) {
    super();
    this.id = id;
    this.edge = edge;
    this.FPort = this.edge == true ? 4 : 2;
    this.fcnt = 0;
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

  calculateKey(AppKey, AppNonce, NetID, DevNonce, type) {
      const block = Buffer.alloc(16, 0);
      block[0] = type;

      Buffer.from(AppNonce).reverse().copy(block, 1);
      Buffer.from(NetID).reverse().copy(block, 4);
      Buffer.from(DevNonce).reverse().copy(block, 7);

      const cipher = crypto.createCipheriv("aes-128-ecb", AppKey, null);
      cipher.setAutoPadding(false);

      return Buffer.concat([
        cipher.update(block),
        cipher.final()
      ]);
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
 createJoinRequest10 = async (DevEUI, AppEUI, AppKey) => {
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
   
    return [phyPayload,joinPacket.DevNonce];
  };

  createJoinRequest11 = async (DevEUI,JoinEUI,AppKey,NwkKey,devNonce) => {

    const joinPacket = lora_packet.fromFields({
      MType: "Join Request",
      AppEUI: Buffer.from(JoinEUI, "hex"),
      DevEUI: Buffer.from(DevEUI, "hex"),
      DevNonce: Buffer.from(devNonce).reverse()
    });

    // LoRaWAN 1.1 MIC MUST use NwkKey
    const mic = await this.calculateJoinMIC(joinPacket, NwkKey);

    const phyPayload = Buffer.concat([
      joinPacket.getPHYPayload().subarray(0, -4),
      mic
    ]);

    return [phyPayload, devNonce];
  };

  /***************************************************************************************
   * | "Unconfirmed Data Up" | DevAddr | FCtrl | FCnt | FPort | compressedPubKey  | AppSKey | NwkSKey |
  */
  createEdgeJoinRequest = (generateCompressedPublicKey, FCnt) => {
    const packet = lora_packet.fromFields(
      {
        MType: "Unconfirmed Data Up",
        DevAddr: Buffer.from(this.session.devAddr, "hex"),
        FCtrl: {
          ADR: false,
          ACK: false,
          ADRACKReq: false,
          FPending: false,
        },
        FCnt: FCnt,
        FPort: 3, // Application port for edge key exchange
        payload: generateCompressedPublicKey, // 33 bytes
      },
      Buffer.from(this.AppSKey, "hex"),
      Buffer.from(this.NwkSKey, "hex")
    );
    return packet.getPHYPayload().toString("base64");
  };
  /***************************************************************************************
   * | "Unconfirmed Data Up" | DevAddr | FCtrl | FCnt | FPort | payload | AppSKey | NwkSKey |
  */
  createLoRaPacket = (payload, FCnt, session) => {
    const constructedPacket = lora_packet.fromFields(
      {
        FPort: this.FPort, //FPort = 4 Device edge / FPort = 2 Device Legacy
        MType: "Unconfirmed Data Up",
        DevAddr: Buffer.from(session.devAddr, "hex"),
        FCtrl: {
          ADR: false,
          ACK: false,
          ADRACKReq: false,
          FPending: false,
        },
        FCnt: FCnt, 
        payload: payload, 
      },
      Buffer.from(session.nwkSKey, "hex"),
      Buffer.from(session.appSKey, "hex")
    );
    return constructedPacket.getPHYPayload().toString("base64");
  };

  sendLoRaPacket = (packetInfo, frameLoss, packetForwarder) => {
    return packetForwarder.send(
      (packetInfo = packetInfo),
      (frameLoss = frameLoss)
    );
  };
  
  tryJoinAccept = (phyPayload, devNonce) => {
      if (!this.AppKey) {
        console.error("Cannot decrypt Join-Accept: AppKey missing!");
        return false;
      }

      if (!devNonce) {
        console.error("DevNonce missing!");
        return false;
      }

      const packet = lora_packet.fromWire(phyPayload);
      // Decrypt Join-Accept with AppKey
      const decrypted = lora_packet.fromWire(
        lora_packet.decryptJoinAccept(packet, this.AppKey)
      );
      console.log("[✓] Join-Accept received for", this.id);
      //Receiving Downlink-step2
      this.handleJoinAccept(decrypted, devNonce);
      return true;
  };
  handleJoinAccept = (packet, devNonce) => {
    console.log("handleJoinAccept!!")
    const AppNonce = packet.AppNonce;
    const NetID = packet.NetID;
    const DevNonce = devNonce;
    const devNonceBuf = Buffer.isBuffer(DevNonce)
    ? DevNonce
    : Buffer.from(DevNonce, "hex");
    this.DevAddr = packet.DevAddr;

  //NwkSKey = aes128_encrypt(AppKey, 0x01 | AppNonce | NetID | DevNonce | pad16)
    this.NwkSKey = this.calculateKey(
      this.AppKey,
      AppNonce,
      NetID,
      devNonceBuf,
      0x01
    );
  //AppSKey = aes128_encrypt(AppKey, 0x02 | AppNonce | NetID | DevNonce | pad16)
    this.AppSKey = this.calculateKey(
      this.AppKey,
      AppNonce,
      NetID,
      devNonceBuf,
      0x02
    );
    
    this.session = {
      devAddr: this.DevAddr.toString("hex"),
      nwkSKey: this.NwkSKey.toString("hex"),
      appSKey: this.AppSKey.toString("hex")
    };
   
    
  };
};

module.exports = Device;
