// scripts/deploy-calculator.js
const { ethers } = require("hardhat");

async function main() {
  const PAILLIER_ADDRESS = "0x2171D6cdA8Db35FCdAD415a8685A174a3D168f5E";

  console.log("Starting EncryptedIQCalculator deployment...");
  console.log("Using Paillier address:", PAILLIER_ADDRESS);

  try {
    // Get the contract factory
    const EncryptedIQCalculator = await ethers.getContractFactory("EncryptedIQCalculator");

    // Deploy EncryptedIQCalculator with existing Paillier address
    console.log("\nDeploying EncryptedIQCalculator...");
    const calculator = await EncryptedIQCalculator.deploy(PAILLIER_ADDRESS);
    await calculator.waitForDeployment();
    const calculatorAddress = await calculator.getAddress();

    console.log("\nDeployment successful!");
    console.log("=".repeat(50));
    console.log("EncryptedIQCalculator deployed to:", calculatorAddress);
    console.log("=".repeat(50));

  } catch (error) {
    console.error("Deployment failed:", error);
    process.exit(1);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });