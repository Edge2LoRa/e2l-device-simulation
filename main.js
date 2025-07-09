const { Experiment3 } = require("./e2l_device_emulator");
const fs = require("fs");

console.log("Running experiment 3");

const main = async () => {
  // Read the JSON file containing experiment information
  const experimentData = JSON.parse(
    fs.readFileSync("./experiment_files/experiment03.json")
  );
  // Read the JSON file containing experiment information
  //const experimentInfo = experimentData.experiment[0]; // Assuming there's only one experiment in the array
  const snapshotFolder = experimentData.snapshotFolder;
  const snapshots = experimentData.snapshots;
  const gatewayFolder =  experimentData.gateways;
  // Init and run experiment
  const experiment3 = new Experiment3(
    snapshotFolder,
    snapshots,
    gatewayFolder
  );
  await experiment3.run();
};

main();
