const { Experiment2 } = require("./e2l_device_emulator");
const fs = require("fs");

console.log("Running experiment 1");

const main = async () => {
  // Read the JSON file containing experiment information
  const experimentData = JSON.parse(
    fs.readFileSync("experiment_files/experiment.json")
  );
  // Read the JSON file containing experiment information
  const experimentInfo = experimentData.experiment[0]; // Assuming there's only one experiment in the array
  const ratio = experimentInfo.ratio;
  const deviceNumber = experimentInfo.deviceNumber;
  const deviceListFile = experimentInfo.deviceList;
  const gatewayListFile = experimentInfo.gatewayList;
  const snapshotFolder = experimentInfo.snapshotFolder;
  // Read the JSON file containing device information
  const deviceList = JSON.parse(fs.readFileSync(deviceListFile));
  // Read the JSON file containing gateway information
  const gatewayList = JSON.parse(fs.readFileSync(gatewayListFile));

  // Init and run experiment
  const experiment = new Experiment2(
    deviceList,
    deviceNumber,
    ratio,
    gatewayList,
    snapshotFolder
  );
  await new Promise((resolve) => setTimeout(resolve, 1000));
  await experiment.run();
};

main();
