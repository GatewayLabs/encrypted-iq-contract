require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: "0.8.24",
  networks: {
    hardhat: {}, // for local testing
    // caldera_testnet: {
    //   url: "https://gateway-shield-testnet.rpc.caldera.xyz/http",
    //   chainId: 678746,
    //   accounts: [process.env.PRIVATE_KEY]
    // }
  }
};