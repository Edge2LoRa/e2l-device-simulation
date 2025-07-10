const { Experiment3 } = require("./e2l_device_emulator/experiments/experiment_3.js");
const fs = require("fs");
const path = require("path");

console.log("Running experiment 3");

const main = async () => {
  // Read the JSON file containing experiment information
  const experimentData = JSON.parse(
    fs.readFileSync("./experiment_files/experiment03.json", "utf8")
  );
  // Read the JSON file containing experiment information
  //const experimentInfo = experimentData.experiment[0]; // Assuming there's only one experiment in the array
  const snapshotFolder = experimentData.snapshotFolder;
  const snapshots = experimentData.snapshots;
  const gatewayFiles = experimentData.gatewayFiles;

  //Init and run experiment
  const experiment3 = new Experiment3(
    snapshotFolder,
    snapshots,
    gatewayFiles
  );
  await experiment3.run();
};

main();
