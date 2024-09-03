class PacketForwarder {
  constructor() {}

  send = (packetInfo, frameLoss) => {
    const base64Packet = packetInfo.base64Packet;
    const size = base64Packet.length;
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
    jsonPacket = JSON.stringify(jsonUDP);
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
