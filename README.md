# Simulator of End-devices!

This is an end-device simulator that emulates the behavior of IoT devices by forwarding packets according to a dataset that contains gateway information!

## A Non-technical Definition for the project 

## A Technical Definition for the project 

### How it works?

This project is experiment-oriented, it means that each time by defining new experiment there is a possibility to define several elements such as ratio, deviceNumber, deviceLis, snapshotFolder and gatewayList.

**How Ratio works?**
There three possible values for ration with responsability to define the proportion of E2LoRa devices to Legacy devices(LoRaWAN). 

| Value | Description |
|-------|-------------|
| `-1`  | All devices use **E2LoRa** (no legacy/LoRaWAN devices) |
| `0`   | All devices use **LoRaWAN** (no E2LoRa devices) |
| `1`   | Devices are evenly split: one **E2LoRa** device per **LoRaWAN** device |

**How device properties work?**
1. DeviceNumber, which specifies how many devices you choose from the file to conduct the experiment and it is zero then it will consider all the file, no matter how many devices are.
2. DeviceList, for addressing the directory that you read the devices file from.

**What is snapshotFolder for?**
Here you add the path of dataset which would be considered as a real network traffic.

**What is gatewayList for?**
By providing the path to the gatewayList, each gateway's MAC address is mapped to a specific IP address and port, which together serve as a unique identifier for each gateway.



