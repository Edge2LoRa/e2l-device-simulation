# Simulator (LoRaWAN + E2LoRa)!

This is an end-device simulator that 
1. Emulates the behavior of IoT devices
2. Forward packets by using the network traffic provided as snapshot files!

## A Technical Definition for the project 
This project follows the same procedure of LoRaWAN for activation of end-devices

1. OTAA(Over The Air Activation)
2. ABP(Activation based on the personalisation)
3. E2L activation that is done over the Legacy Activation

**Note**: Number of Fport is **three**.

| Fport | Description                                                            |
|-------|------------------------------------------------------------------------|
| `2`   | Use by devices with**LoRaWAN(Legacy)** protocol                        |
| `4`   | Use for devices by **E2LoRa** protocol selection                       |
| `3`   | Use for **EdgeJoinRequest**                                            |
         
### What are the key elements?
 - Devices
 - Packet Forwarder
   
### How it works?

The architecture allows you to define an experiment which includes:

- Ratio as it explained in detail below:

There three possible values for ration with responsability to define the proportion of E2LoRa devices to Legacy devices(LoRaWAN). 

| Value | Description                                                            |
|-------|------------------------------------------------------------------------|
| `-1`  | All devices use **E2LoRa** (no legacy/LoRaWAN devices)                 |
| `0`   | All devices use **LoRaWAN** (no E2LoRa devices)                        |
| `1`   | Devices are evenly split: one **E2LoRa** device per **LoRaWAN** device |

- Number of devices that we select to conduct the experiment
- Path to the list of devNonce 
- Path to the list of devices 
- Path to the snapshot folder (by default experiment_files/test-simulation).
- Path to the list of Gateways (experiment_files/gateways-2.json)

**Note**: Devices are correlated to the dataset which indicates the relation among device, gateway and packets. Its important to know that the key between end-device and packet in the dataset is **NODE_ID**.
Then, Start to create an experiment based on the functionality that are expected. 

**How experiment_2 works?**
There are two main processes:

***Process_number1***
Firstly, iterating over the devices(**device_id**) based on the number which is selected before. After that, activated those devices if they didnt activate (Type of Activation listed in the device list,OTAA-ABP). During activation if the device is using E2LoRa protocol, it should be also activated by the Edge2LoRa, using ECC(**prime256v1**). 

***Process_number2***
Secondly, Iterating over snapshots that encompasses network traffic, therefore, use the gateway-metadatea in order to forward a packet to the Network Server.

**What is devNonce for?**
For LoRaWAN 1.1 OTAA activation, the DevNonce must be strictly increasing to prevent replay attacks. Therefore, the device persistently stores the last used DevNonce and increments it for each new join request. This value is saved in non-volatile storage (e.g., a file) so it is preserved across resets and power cycles, ensuring compliance with the LoRaWAN 1.1 specification.

**More about Snapshots**
Here you add the path of dataset which would be considered as a real network traffic.

**gatewayList**
By providing the path to the gatewayList, each gateway's MAC address is mapped to a specific IP address and port, which together serve as a unique identifier for each gateway.





