# Simulator of End-devices!

This is an end-device simulator that emulates the behavior of IoT devices by forwarding packets according to a dataset that contains gateway information!

## A Technical Definition for the project 
Assumption is that the end-device was joint to the network as any device does in LoRaWAN network, therefore, the concentration of this simulator is on encoding a packet and forwarding. Back to the simulation, there are three files:

1. Devices
2. Gateways
3. Packets 

Devices are correlated to the dataset which indicates the relation among device, gateway and packets. Its important to know that the key between end-device and packet in the dataset is NODE_ID.

### How it works?

As the simulator starts, we start to fulfil an experiment that is defined in the main, it provides us 

- Path to the list of devices 
- Number of devices that we select to conduct the experiment
- Ratio as it explained in detail below:

There three possible values for ration with responsability to define the proportion of E2LoRa devices to Legacy devices(LoRaWAN). 

| Value | Description |
|-------|-------------|
| `-1`  | All devices use **E2LoRa** (no legacy/LoRaWAN devices) |
| `0`   | All devices use **LoRaWAN** (no E2LoRa devices) |
| `1`   | Devices are evenly split: one **E2LoRa** device per **LoRaWAN** device |

- Path to the list of Gateways
- Path to the dataset folder

**How device properties work?**
1. DeviceNumber, which specifies how many devices you choose from the file to conduct the experiment and it is zero then it will consider all the file, no matter how many devices are.
2. DeviceList, for addressing the directory that you read the devices file from.

**What is snapshotFolder for?**
Here you add the path of dataset which would be considered as a real network traffic.

**What is gatewayList for?**
By providing the path to the gatewayList, each gateway's MAC address is mapped to a specific IP address and port, which together serve as a unique identifier for each gateway.

**How experiment_2 works?**
Firstly, iterate over dataset files and process each row of that to construct the payload based on the coordination of device and then assigning variables to the correlated values like spreading factor. Then, collecting reception field which is an array of gateways. Afterward, Creating a packet that encompasse the payload and fCnt. Attaching options that gateway calculated about the received packet like rssi, frequency and etc. Encoding the packet and finally forwarding to the ip address and port which is correlated to the MAC-address.



