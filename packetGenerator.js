const lora_packet = require("lora-packet");

 function packetGenerator(DevAddr, AppSKey, NwkSKey, FPort, FCnt) {
    // Construct the LoRa packet
    const constructedPacket = lora_packet.fromFields(
      {
        FPort: FPort, //FPort = 4 Device edge / FPort = 2 Device Legacy
        MType: "Unconfirmed Data Up",
        DevAddr: Buffer.from(DevAddr, "hex"),
        FCtrl: {
          ADR: false,
          ACK: false,
          ADRACKReq: false,
          FPending: false,
        },
        FCnt: FCnt, //counter
        payload: "test", // Replace with your payload
      },
      Buffer.from(AppSKey, "hex"),
      Buffer.from(NwkSKey, "hex")
    );
    const payloadBase64 = constructedPacket.getPHYPayload().toString("base64");
    const size = payloadBase64.length;
    const date = Math.floor(Date.now()/1000);
    let jsonUDP = {
      rxpk: [
        {
          tmst: date,
          chan: 7,
          rfch: 0,
          freq: 868.1,
          stat: 1,
          modu: 'LORA',
          datr: 'SF7BW125',
          codr: '4/5',
          lsnr: 9.2,
          rssi: -33,
          size: size,
          data: payloadBase64,
        }
      ]
    };
    jsonPacket = JSON.stringify(jsonUDP);
    /*headerPKTFWD[0] == PROTOCOL_VERSION == 2
    headerPKTFWD[1] == numero random
    headerPKTFWD[2] == numero random
    headerPKTFWD[3] == PKT_PUSH_DATA == 0
    headerPKTFWD[4] == net_mac_h = htonl((uint32_t)(0xFFFFFFFF & (lgwm>>32)));
    headerPKTFWD[8] == net_mac_l = htonl((uint32_t)(0xFFFFFFFF &  lgwm  ));
    lgwm == 0 Lora gateway MAC address
    */
    let headerPKTFWD = new Uint8Array([2, 45, 141, 0, 184, 39, 235, 255, 254, 230, 15, 44]);
    let enc = new TextEncoder();
    let json = enc.encode(jsonPacket);

    // Create a new array with the total length and merge all source arrays.
    let mergedArray = new Uint8Array(headerPKTFWD.length + json.length);
    mergedArray.set(headerPKTFWD, 0); // Copy headerPKTFWD to mergedArray at the beginning.
    mergedArray.set(json, headerPKTFWD.length); // Copy json to mergedArray after headerPKTFWD.   
    return mergedArray;
}
module.exports = { packetGenerator };
