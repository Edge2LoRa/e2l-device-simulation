/**
 * Estimates the Signal-to-Noise Ratio (SNR) for a LoRa communication and analyzes link quality.
 * * This calculation is an estimation based on theoretical thermal noise and a typical
 * receiver noise figure. Real-world environmental noise can affect the actual noise floor.
 *
 * @param {object} params - The input parameters for the estimation.
 * @param {number} params.rssi - The Received Signal Strength Indicator in dBm (e.g., -95).
 * @param {number} params.spreadingFactor - The Spreading Factor used (e.g., 7, 12).
 * @param {number} [params.bandwidth=125000] - The channel bandwidth in Hz. Defaults to 125 kHz, the most common LoRaWAN standard.
 * @returns {object} An object containing the estimated SNR, noise floor, and a viability analysis.
 */
function estimateLoraSnr({ rssi, spreadingFactor, bandwidth = 125000 }) {
  // --- Constants ---
  // Thermal noise power spectral density at room temperature in dBm/Hz.
  const THERMAL_NOISE_DENSITY = -174;
  // A typical noise figure for a LoRa receiver front-end in dB.
  const RECEIVER_NOISE_FIGURE = 6;
  // Minimum SNR (in dB) required for demodulation for each Spreading Factor.
  const MIN_SNR_PER_SF = {
    7: -7.5,
    8: -10,
    9: -12.5,
    10: -15,
    11: -17.5,
    12: -20,
  };

  // --- Input Validation ---
  if (typeof rssi !== "number" || rssi > 0) {
    return {
      error: "Invalid RSSI. It must be a negative number representing dBm.",
    };
  }
  if (!MIN_SNR_PER_SF.hasOwnProperty(spreadingFactor)) {
    return {
      error: `Invalid Spreading Factor. Supported values are ${Object.keys(
        MIN_SNR_PER_SF
      ).join(", ")}.`,
    };
  }

  // --- Calculation ---
  // 1. Estimate the receiver's noise floor based on bandwidth and noise figure.
  const noiseFloor =
    THERMAL_NOISE_DENSITY + 10 * Math.log10(bandwidth) + RECEIVER_NOISE_FIGURE;

  // 2. Estimate the SNR by subtracting the noise floor from the RSSI.
  const estimatedSnr = rssi - noiseFloor;

  // 3. Analyze if the estimated SNR is sufficient for the given Spreading Factor.
  const requiredSnr = MIN_SNR_PER_SF[spreadingFactor];
  const isViable = estimatedSnr >= requiredSnr;
  const margin = estimatedSnr - requiredSnr;

  let analysisMessage = `The signal is ${margin.toFixed(2)} dB ${
    isViable ? "above" : "below"
  } the demodulation limit of ${requiredSnr} dB for SF${spreadingFactor}.`;
  if (isViable) {
    analysisMessage += " Link quality appears solid. 👍";
  } else {
    analysisMessage += " Packet loss is likely. 👎";
  }

  return {
    estimatedSnr: parseFloat(estimatedSnr.toFixed(2)),
    noiseFloor: parseFloat(noiseFloor.toFixed(2)),
    requiredSnr: requiredSnr,
    margin: parseFloat(margin.toFixed(2)),
    isViable: isViable,
    analysis: analysisMessage,
  };
}

export { estimateLoraSnr };
